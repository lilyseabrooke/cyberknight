'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AMMO,
  describePersonality,
  clockLabel,
  dayOf,
  Rng,
  STIMS,
  medPacks,
  medStock,
  wielded,
  openingEvents,
  beginRun,
  endRun,
  newUniverse,
  makeSave,
  serialize,
  deserialize,
  type Universe,
  gangName,
  goalViews,
  type GoalView,
  IMPLANTS,
  SKILL_LABELS,
  skillLevel,
  render,
  depths,
  step,
  advise,
  ASK_BEATS,
  type GameEvent,
  type World,
  describeWeapon,
} from '../engine/src';
import Lab from './Lab';

interface LogLine {
  id: number;
  beat: number;
  voice: 'report' | 'thought';
  text: string;
  outcome: GameEvent['outcome'];
  type: string;
  /** 0 at the top level; each group she's inside adds one. */
  depth: number;
  /** This line opens a group (what she set out to do, or a fight starting). */
  head: boolean;
}

/**
 * What the log shows in one go. A beat's top-level events appear together; the lines inside a group appear one at a time,
 * so a fight can be watched as it unfolds. The status panel waits for the last chunk of a beat, so it doesn't spoil the ending.
 */
interface Chunk {
  lines: LogLine[];
  nested: boolean;
  /** Set on the beat's last chunk: the status once everything above it has been shown. */
  snap?: Snapshot;
}

interface Snapshot {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpNeed: number;
  cash: number;
  drunk: number;
  weapon: string;
  /** What she is actually swinging right now (different if the gun is dry). */
  wielding: string;
  weaponInfo: string;
  ammo: [string, number][];
  medPacks: string;
  medStock: number;
  armor: string;
  injuries: string[];
  inventory: string[];
  companions: { name: string; kind: string; hp: number; maxHp: number; loyalty: number }[];
  location: string;
  beat: number;
  time: string;
  day: number;
  kills: number;
  heat: [string, number][];
  buffs: string[];
  ending: World['ending'];
  fame: number;
  art: number;
  paint: number;
  tab: number;
  skills: [string, number][];
  implants: string[];
  goals: GoalView[];
  satiety: number;
  /** 0..1, from training; see gym.ts. */
  sore: number;
  /** Neodollars in her account, which outlives her. */
  account: number;
  /** What she has put in at drop points tonight, after their cut. */
  banked: number;
  /** She has stopped to ask the lab something. */
  ask: { id: number; question: string; options: { id: string; label: string; hint?: string }[]; left: number } | null;
}

interface Night {
  world: World;
  textRng: Rng;
  nextId: number;
}

const SPEEDS = [
  { label: '1×', ms: 2400 },
  { label: '2×', ms: 1200 },
  { label: '5×', ms: 480 },
  { label: '20×', ms: 120 },
];

const HEAT_NAMES: Record<string, string> = { npd: 'Police', atlas: 'Atlas', halo: 'The Halo', club: 'Neon Pharaoh' };
const heatName = (k: string) => HEAT_NAMES[k] ?? gangName(k);
const DRAMA = new Set(['advice_ask', 'heat_up', 'out_of_ammo', 'fight_end', 'death', 'victory', 'level_up', 'equip', 'ambush', 'raid', 'jealous', 'steal_puppy', 'vault', 'safe', 'blackout']);
const MAX_LINES = 600;

function snap(w: World): Snapshot {
  const h = w.hero;
  return {
    hp: Math.max(0, h.hp),
    maxHp: h.maxHp,
    level: h.level,
    xp: h.xp,
    xpNeed: 24 * h.level,
    cash: h.cash,
    drunk: h.drunk,
    weapon: h.weapon.name,
    wielding: wielded(h).name,
    weaponInfo: describeWeapon(wielded(h)),
    ammo: Object.entries(h.ammo).filter(([, n]) => n > 0).map(([t, n]) => [AMMO[t]?.label ?? t, n] as [string, number]),
    medPacks: Object.entries(medPacks(h).reduce<Record<string, number>>((m, i) => ((m[i.name] = (m[i.name] ?? 0) + 1), m), {})).map(([n, k]) => `${k} ${n}`).join(' · '),
    medStock: medStock(h),
    armor: h.armor?.name ?? 'nothing but attitude',
    injuries: [...h.injuries],
    inventory: Object.entries(h.inventory.filter((i) => !i.tags.includes('med')).reduce<Record<string, number>>((m, i) => ((m[i.name] = (m[i.name] ?? 0) + 1), m), {})).map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)),
    companions: h.companions.map((a) => ({ name: a.name, kind: a.kind, hp: a.hp, maxHp: a.maxHp, loyalty: a.loyalty })),
    location: w.locations[h.locationId]?.name ?? '?',
    beat: w.beat,
    time: clockLabel(w.clock),
    day: dayOf(w.clock),
    kills: w.stats.kills,
    heat: Object.entries(w.heat).filter(([, v]) => v > 0),
    buffs: h.buffs.filter((b) => b.until > w.beat).map((b) => STIMS[b.id.replace('stim:', '')]?.name ?? b.id),
    ending: w.ending,
    fame: Math.floor(h.fame),
    art: w.locations[h.locationId]?.graffiti ?? 0,
    paint: h.inventory.filter((i) => i.id === 'spray_can').reduce((a, i) => a + i.power, 0),
    tab: h.tab,
    skills: (Object.keys(SKILL_LABELS) as (keyof typeof SKILL_LABELS)[]).map((k) => [SKILL_LABELS[k], skillLevel(h, k)] as [string, number]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]),
    implants: h.implants.map((i) => IMPLANTS[i]?.name ?? i),
    goals: goalViews(w),
    satiety: h.satiety ?? 0,
    sore: h.sore ?? 0,
    account: w.legacy.account,
    banked: w.stats.deposited,
    ask: w.mind.ask ? { id: w.mind.ask.id, question: w.mind.ask.question, options: w.mind.ask.options.map(({ id, label, hint }) => ({ id, label, hint })), left: Math.max(0, w.mind.ask.until - w.beat) } : null,
  };
}

function newNight(universe: Universe, seed: string, competence: number): { night: Night; lines: LogLine[] } {
  const world = beginRun(universe, { seed, competence });
  const events = openingEvents(world);
  const night: Night = { world, textRng: new Rng(`text:${seed}`), nextId: 0 };
  return { night, lines: toLines(night, events) };
}

function toLines(night: Night, events: GameEvent[]): LogLine[] {
  return toChunks(night, events).flatMap((c) => c.lines);
}

/** The events of one beat as things to show: runs of top-level lines together, every line inside a group on its own. */
function toChunks(night: Night, events: GameEvent[]): Chunk[] {
  const out: Chunk[] = [];
  const h = night.world.hero;
  const depth = depths(events);
  events.forEach((ev, i) => {
    const lines: LogLine[] = render(ev, { rng: night.textRng, personality: h.personality, realName: h.realName }).map((l) => ({
      id: night.nextId++, beat: ev.beat, voice: l.voice, text: l.text, outcome: ev.outcome, type: ev.type, depth: depth[i]!, head: ev.id !== undefined,
    }));
    if (!lines.length) return;
    const nested = depth[i]! > 0;
    const last = out[out.length - 1];
    if (!nested && last && !last.nested) last.lines.push(...lines);
    else out.push({ lines, nested });
  });
  return out;
}

const randomSeed = () => Math.random().toString(36).slice(2, 8);

/** The universe lives in the browser between visits. It's saved whenever she's in the lab, which is the only time it holds still. */
const SAVE_KEY = 'cyberknight.save';
function loadUniverse(): Universe | null {
  try {
    const text = window.localStorage.getItem(SAVE_KEY);
    return text ? deserialize(text).universe : null;
  } catch {
    return null;
  }
}
function saveUniverse(u: Universe): void {
  try {
    window.localStorage.setItem(SAVE_KEY, serialize(makeSave(u, null, Date.now())));
  } catch {
    // Private mode or a full disk: the game still plays, it just won't remember.
  }
}
function forgetUniverse(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // nothing to forget
  }
}

export default function NightViewer() {
  const [seed, setSeed] = useState('');
  const [competence, setCompetence] = useState(0.15);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<Snapshot | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const [tick, setTick] = useState(0);
  const [screen, setScreen] = useState<'night' | 'lab'>('night');
  const nightRef = useRef<Night | null>(null);
  /** What has happened but not been shown yet. */
  const queueRef = useRef<Chunk[]>([]);
  const universeRef = useRef<Universe | null>(null);
  const started = useRef(false);
  /** The speed to go back to once her question is over (set when we slowed down for it). */
  const speedBeforeAsk = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  /** Send her out into Neo, in whatever universe we have (a fresh one on the first night). */
  const begin = useCallback((s: string, c: number) => {
    universeRef.current ??= newUniverse(randomSeed());
    const { night, lines: first } = newNight(universeRef.current, s, c);
    nightRef.current = night;
    queueRef.current = [];
    setSeed(s);
    setLines(first);
    setStatus(snap(night.world));
    setScreen('night');
    setPlaying(true);
  }, []);

  /** She's done for the night. Settle the books and rebuild her in the lab. */
  const toLab = useCallback(() => {
    const night = nightRef.current;
    if (!night) return;
    const u = endRun(night.world);
    universeRef.current = u;
    saveUniverse(u);
    setPlaying(false);
    setScreen('lab');
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // ?seed=abc&c=0.3 replays a specific night in a new world; ?world=xyz picks the world. Otherwise pick up where the browser left off.
    const q = new URLSearchParams(window.location.search);
    const c = Number(q.get('c') ?? 0.15);
    const comp = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.15;
    setCompetence(comp);
    const replay = q.get('seed') || q.get('world');
    const saved = replay ? null : loadUniverse();
    if (saved) {
      universeRef.current = saved;
      setScreen('lab');
      return;
    }
    universeRef.current = newUniverse(q.get('world') || randomSeed());
    begin(q.get('seed') || randomSeed(), comp);
  }, [begin]);

  /** Show the next chunk of what has happened, if anything is waiting. */
  const release = useCallback((): boolean => {
    const chunk = queueRef.current.shift();
    if (!chunk) return false;
    setLines((prev) => [...prev, ...chunk.lines].slice(-MAX_LINES));
    if (chunk.snap) {
      setStatus(chunk.snap);
      if (chunk.snap.ending) setPlaying(false);
    }
    return true;
  }, []);

  /** Play one beat: the world takes a step, and what came of it goes into the queue. */
  const stepWorld = useCallback((): GameEvent[] => {
    const night = nightRef.current!;
    const events = step(night.world);
    const chunks = toChunks(night, events);
    const snapshot = snap(night.world);
    if (chunks.length) chunks[chunks.length - 1]!.snap = snapshot;
    else chunks.push({ lines: [], nested: false, snap: snapshot });
    queueRef.current.push(...chunks);
    return events;
  }, []);

  /** One tick of the clock: finish telling the last beat, or take the next. */
  const advance = useCallback(() => {
    const night = nightRef.current;
    if (!night) return;
    if (!queueRef.current.length) {
      if (night.world.over) return;
      stepWorld();
    }
    release();
    setTick((t) => t + 1);
  }, [release, stepWorld]);

  /** The lab tech answers what she asked. What comes of it goes into the log straight away. */
  const answer = useCallback((optionId: string) => {
    const night = nightRef.current;
    if (!night) return;
    const events = advise(night.world, optionId);
    if (!events.length) return;
    const chunks = toChunks(night, events);
    const snapshot = snap(night.world);
    if (chunks.length) chunks[chunks.length - 1]!.snap = snapshot;
    else chunks.push({ lines: [], nested: false, snap: snapshot });
    queueRef.current.push(...chunks);
    while (release());
    setTick((t) => t + 1);
  }, [release]);

  /** Skip ahead to the next fight, level-up or disaster, showing everything on the way. */
  const skipToDrama = useCallback(() => {
    const night = nightRef.current;
    if (!night) return;
    let guard = 0;
    while (release());
    do {
      const events = stepWorld();
      if (events.some((e) => DRAMA.has(e.type))) break;
    } while (!night.world.over && guard++ < 400);
    while (release());
    setTick((t) => t + 1);
  }, [release, stepWorld]);

  useEffect(() => {
    if (!playing) return;
    // Inside a group the lines come quicker than the beats do, so a fight reads as a fight.
    const quick = queueRef.current[0]?.nested;
    const id = setTimeout(advance, quick ? Math.round(SPEEDS[speed]!.ms * 0.4) : SPEEDS[speed]!.ms);
    return () => clearTimeout(id);
  }, [playing, speed, tick, advance]);

  // A question slows the clock to 1× so there's time to answer, and the old speed comes back when it's answered or she decides.
  const askId = status?.ask?.id ?? null;
  useEffect(() => {
    if (askId !== null) {
      setSpeed((cur) => {
        if (cur !== 0 && speedBeforeAsk.current === null) speedBeforeAsk.current = cur;
        return 0;
      });
    } else if (speedBeforeAsk.current !== null) {
      setSpeed(speedBeforeAsk.current);
      speedBeforeAsk.current = null;
    }
  }, [askId]);

  useEffect(() => {
    if (follow && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines, follow]);

  const world = nightRef.current?.world;
  const hero = world?.hero;
  const archetype = useMemo(
    () => (hero ? describePersonality(hero.personality) : ''),
    [hero?.personality],
  );
  const over = !!status?.ending;

  if (screen === 'lab' && universeRef.current) {
    return <Lab universe={universeRef.current} onChange={() => saveUniverse(universeRef.current!)} onSendOut={() => begin(randomSeed(), competence)} />;
  }

  return (
    <main className="shell">
      <header className="top">
        <div>
          <h1 className="logo">CYBER<span>KNIGHT</span></h1>
          <p className="tag">You are the lab assistant. Just watch. Try not to wince.</p>
        </div>
        <div className="controls">
          {!over && (
            <button className="btn primary" onClick={() => setPlaying((p) => !p)}>
              {playing ? '❚❚ Pause' : '▶ Play'}
            </button>
          )}
          {!over && (
            <button className="btn" onClick={skipToDrama} title="Skip ahead to the next fight, level-up or disaster">
              ⏭ Next drama
            </button>
          )}
          <div className="speeds" role="group" aria-label="Speed">
            {SPEEDS.map((s, i) => (
              <button key={s.label} className={`btn small ${i === speed ? 'on' : ''}`} onClick={() => { speedBeforeAsk.current = null; setSpeed(i); }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {hero && world && status && (
        <section className="brief">
          <b>{hero.name}</b> <span className="muted">(born {hero.realName}, and she hates it)</span> · {archetype} · night <code>{seed}</code>
          <div className="muted">
            Tonight: {gangName(world.situation.warringGangs[0])} vs {gangName(world.situation.warringGangs[1])} gang war; police crackdown on{' '}
            {world.situation.crackdown}. Weather: {world.situation.weather.replace('_', ' ')}.
          </div>
        </section>
      )}

      <div className="grid">
        <section className={`logwrap${status?.ask ? ' asking' : ''}`} aria-label="Field report">
          <div className="log" ref={logRef} onScroll={(e) => {
            const el = e.currentTarget;
            setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
          }}>
            {lines.map((l) =>
              l.voice === 'thought' ? (
                <p key={l.id} className="line thought" style={l.depth ? { marginLeft: 52 + l.depth * 20 } : undefined}>“{l.text}”</p>
              ) : (
                <p key={l.id} className={`line report ${l.outcome}${l.head ? ' head' : ''}${l.depth ? ' nested' : ''}`} style={l.depth ? { marginLeft: l.depth * 20 } : undefined}>
                  <span className="beat">{l.depth ? '↳' : String(l.beat).padStart(3, '0')}</span>
                  <span>{l.text}</span>
                </p>
              ),
            )}
            {over && status && (
              <div className={`ending ${status.ending}`}>
                <h2>{status.ending === 'victory' ? 'DRAGON SLAIN' : status.ending === 'dead' ? 'BLACKBIRD HAS FLATLINED' : 'DAWN OVER NEO'}</h2>
                <p>
                  Level {status.level} · {status.kills} kills · {status.beat} beats · {status.day + 1} night{status.day ? 's' : ''}, ending at {status.time}.
                </p>
                <p className="muted">
                  {status.banked > 0 ? `${status.banked} neodollars made it into the account. ` : 'Nothing made it into the account. '}
                  {status.ending === 'dead'
                    ? status.cash > 0
                      ? `The ${status.cash} in her pockets went with her (less whatever she'd insured).`
                      : 'Her pockets were empty, so she lost nothing she was carrying.'
                    : `She carries the ${status.cash} in her pockets home.`}
                </p>
                <button className="btn primary" onClick={toLab}>
                  {status.ending === 'dead' ? 'Take her to the lab' : 'Back to the lab'}
                </button>
              </div>
            )}
          </div>
          {!follow && (
            <button className="btn jump" onClick={() => setFollow(true)}>↓ Latest</button>
          )}
          {status?.ask && (
            <div className="ask" role="group" aria-label="Blackbird is asking the lab">
              <p className="q"><b>Blackbird, on the earpiece:</b> “{status.ask.question}”</p>
              <div className="opts">
                {status.ask.options.map((o) => (
                  <button key={o.id} className="btn" onClick={() => answer(o.id)}>
                    {o.label}
                    {o.hint && <small className="muted"> {o.hint}</small>}
                  </button>
                ))}
              </div>
              <div className="clock" role="progressbar" aria-label="Time before she decides" aria-valuenow={status.ask.left} aria-valuemax={ASK_BEATS}>
                <div className="fill" style={{ width: `${(status.ask.left / ASK_BEATS) * 100}%` }} />
              </div>
              <p className="muted small">{playing ? `She decides for herself in ${status.ask.left} beat${status.ask.left === 1 ? '' : 's'}.` : 'Paused. She is still waiting.'}</p>
            </div>
          )}
        </section>

        {status && (
          <aside className="panel" aria-label="Blackbird status">
            <Bar label="HP" value={status.hp} max={status.maxHp} kind="hp" />
            <Bar label={`LVL ${status.level}`} value={status.xp} max={status.xpNeed} kind="xp" />
            {status.goals.length > 0 && (
              <div className="goals">
                <h3>On her mind</h3>
                <ul>
                  {status.goals.map((g) => (
                    <li key={g.id} className={`goal ${g.status}`} style={{ marginLeft: g.depth * 14 }}>
                      <span className="mark" aria-hidden>{g.status === 'focus' ? '▶' : g.status === 'held' ? '⏸' : g.depth > 0 ? '↳' : '•'}</span>{' '}
                      {g.label}
                      <span className="muted"> · {g.why}{g.note ? ` (${g.note.replace('_', ' ')})` : ''}{g.status === 'held' ? ' · on hold' : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <dl>
              <dt>Time</dt><dd>{status.time} · night {status.day + 1}</dd>
              <dt>Location</dt><dd>{status.location}</dd>
              <dt>Neodollars</dt><dd>{status.cash}</dd>
              <dt>Account</dt><dd>{status.account}{status.banked > 0 && <span className="muted"> ({status.banked} banked tonight)</span>}</dd>
              <dt>Weapon</dt><dd>{status.weapon}{status.wielding !== status.weapon && <span className="bad"> (dry: using {status.wielding})</span>}<br /><small>{status.weaponInfo}</small></dd>
              <dt>Medical</dt><dd className={status.medStock === 0 ? 'bad' : undefined}>{status.medPacks ? `${status.medPacks} (${status.medStock} HP)` : 'none (she cannot heal)'}</dd>
              <dt>Ammo</dt><dd>{status.ammo.length ? status.ammo.map(([t, n]) => `${n} ${t}`).join(' · ') : 'none'}</dd>
              <dt>Armor</dt><dd>{status.armor}</dd>
              {status.satiety > 0.08 && (<><dt>Afterglow</dt><dd>{'♥'.repeat(Math.max(1, Math.round(status.satiety * 5)))} <span className="muted">sated</span></dd></>)}
              {status.sore > 0.08 && (<><dt>Sore</dt><dd>{'▮'.repeat(Math.max(1, Math.round(status.sore * 5)))} <span className="muted">{status.sore > 0.6 ? 'wrecked' : status.sore > 0.3 ? 'aching' : 'tender'}</span></dd></>)}
              <dt>Drunk</dt><dd>{'🍸'.repeat(Math.min(status.drunk, 6)) || 'sober (suspicious)'}</dd>
              {status.companions.length > 0 && (
                <>
                  <dt>Allies</dt>
                  <dd>
                    {status.companions.map((a) => (
                      <div key={a.name} className="ally">
                        {a.name} <span className="muted">({a.kind}) {Math.max(0, a.hp)}/{a.maxHp} HP · loyalty {Math.max(0, Math.round(a.loyalty))}</span>
                      </div>
                    ))}
                  </dd>
                </>
              )}
              {status.fame > 0 && (<><dt>Fame</dt><dd>{'★'.repeat(Math.min(status.fame, 12))} <span className="muted">{status.fame}</span></dd></>)}
              {status.art > 0 && (<><dt>Wall art</dt><dd>{status.art} piece{status.art === 1 ? '' : 's'} of hers here</dd></>)}
              {status.paint > 0 && (<><dt>Paint</dt><dd>{status.paint} spray{status.paint === 1 ? '' : 's'} left</dd></>)}
              {status.tab > 0 && (<><dt>Bar tab</dt><dd className="bad">{status.tab} neodollars (the Halo remembers)</dd></>)}
              {status.skills.length > 0 && (
                <>
                  <dt>Skills</dt>
                  <dd>
                    {status.skills.slice(0, 9).map(([k, v]) => `${k} ${v}`).join(' · ')}
                    {status.skills.length > 9 && <span className="muted"> (+{status.skills.length - 9} more)</span>}
                  </dd>
                </>
              )}
              {status.implants.length > 0 && (<><dt>Chrome</dt><dd>{status.implants.join(', ')}</dd></>)}
              {status.injuries.length > 0 && (<><dt>Injuries</dt><dd className="bad">{status.injuries.map((i) => i.replace('_', ' ')).join(', ')}</dd></>)}
              {status.buffs.length > 0 && (<><dt>Buffs</dt><dd>{status.buffs.join(', ')}</dd></>)}
              <dt>Pockets</dt><dd>{status.inventory.length ? status.inventory.join('; ') : 'lint'}</dd>
            </dl>
            {status.heat.length > 0 && (
              <div className="heat">
                <h3>Heat</h3>
                {status.heat.map(([k, v]) => (
                  <Bar key={k} label={heatName(k)} value={v} max={10} kind="heat" />
                ))}
              </div>
            )}
            <details className="dev">
              <summary>Dev controls</summary>
              <label>
                Competence {competence.toFixed(2)}
                <input type="range" min={0} max={1} step={0.05} value={competence} onChange={(e) => setCompetence(Number(e.target.value))} />
              </label>
              <button className="btn small" onClick={() => begin(randomSeed(), competence)}>New night (skip the lab)</button>
              <button className="btn small" onClick={() => { forgetUniverse(); universeRef.current = newUniverse(randomSeed()); begin(randomSeed(), competence); }}>Wipe the save, new world</button>
            </details>
          </aside>
        )}
      </div>
    </main>
  );
}

function Bar({ label, value, max, kind }: { label: string; value: number; max: number; kind: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemax={max}>
      <div className={`fill ${kind}`} style={{ width: `${pct}%` }} />
      <span className="barlabel">{label}</span>
      <span className="barval">{kind === 'heat' ? `${value}/${max}` : `${Math.round(value)} / ${max}`}</span>
    </div>
  );
}
