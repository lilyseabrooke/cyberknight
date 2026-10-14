'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AMMO,
  describePersonality,
  Rng,
  STIMS,
  medPacks,
  medStock,
  wielded,
  createRun,
  gangName,
  goalViews,
  type GoalView,
  IMPLANTS,
  SKILL_LABELS,
  skillLevel,
  render,
  step,
  type GameEvent,
  type World,
} from '../engine/src';

interface LogLine {
  id: number;
  beat: number;
  voice: 'report' | 'thought';
  text: string;
  outcome: GameEvent['outcome'];
  type: string;
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
  ammo: [string, number][];
  medPacks: string;
  medStock: number;
  armor: string;
  injuries: string[];
  inventory: string[];
  companions: { name: string; kind: string; hp: number; maxHp: number; loyalty: number }[];
  location: string;
  beat: number;
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
const DRAMA = new Set(['heat_up', 'out_of_ammo', 'fight_end', 'death', 'victory', 'level_up', 'equip', 'ambush', 'raid', 'jealous', 'steal_puppy', 'vault', 'safe', 'blackout']);
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
    ammo: Object.entries(h.ammo).filter(([, n]) => n > 0).map(([t, n]) => [AMMO[t]?.label ?? t, n] as [string, number]),
    medPacks: Object.entries(medPacks(h).reduce<Record<string, number>>((m, i) => ((m[i.name] = (m[i.name] ?? 0) + 1), m), {})).map(([n, k]) => `${k} ${n}`).join(' · '),
    medStock: medStock(h),
    armor: h.armor?.name ?? 'nothing but attitude',
    injuries: [...h.injuries],
    inventory: Object.entries(h.inventory.filter((i) => !i.tags.includes('med')).reduce<Record<string, number>>((m, i) => ((m[i.name] = (m[i.name] ?? 0) + 1), m), {})).map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)),
    companions: h.companions.map((a) => ({ name: a.name, kind: a.kind, hp: a.hp, maxHp: a.maxHp, loyalty: a.loyalty })),
    location: w.locations[h.locationId]?.name ?? '?',
    beat: w.beat,
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
  };
}

function newNight(seed: string, competence: number): { night: Night; lines: LogLine[] } {
  const { world, events } = createRun({ seed, competence });
  const night: Night = { world, textRng: new Rng(`text:${seed}`), nextId: 0 };
  return { night, lines: toLines(night, events) };
}

function toLines(night: Night, events: GameEvent[]): LogLine[] {
  const out: LogLine[] = [];
  const h = night.world.hero;
  for (const ev of events) {
    for (const l of render(ev, { rng: night.textRng, personality: h.personality, realName: h.realName })) {
      out.push({ id: night.nextId++, beat: ev.beat, voice: l.voice, text: l.text, outcome: ev.outcome, type: ev.type });
    }
  }
  return out;
}

const randomSeed = () => Math.random().toString(36).slice(2, 8);

export default function NightViewer() {
  const [seed, setSeed] = useState('');
  const [competence, setCompetence] = useState(0.15);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<Snapshot | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const nightRef = useRef<Night | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const begin = useCallback((s: string, c: number) => {
    const { night, lines: first } = newNight(s, c);
    nightRef.current = night;
    setSeed(s);
    setLines(first);
    setStatus(snap(night.world));
    setPlaying(true);
  }, []);

  useEffect(() => {
    // ?seed=abc&c=0.3 replays a specific night.
    const q = new URLSearchParams(window.location.search);
    const c = Number(q.get('c') ?? 0.15);
    const comp = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.15;
    setCompetence(comp);
    begin(q.get('seed') || randomSeed(), comp);
  }, [begin]);

  const advance = useCallback((untilDrama = false) => {
    const night = nightRef.current;
    if (!night || night.world.over) return;
    const added: LogLine[] = [];
    let guard = 0;
    do {
      const events = step(night.world);
      added.push(...toLines(night, events));
      if (untilDrama && events.some((e) => DRAMA.has(e.type))) break;
    } while (untilDrama && !night.world.over && guard++ < 400);
    setLines((prev) => [...prev, ...added].slice(-MAX_LINES));
    setStatus(snap(night.world));
    if (night.world.over) setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => advance(false), SPEEDS[speed]!.ms);
    return () => clearInterval(id);
  }, [playing, speed, advance]);

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
            <button className="btn" onClick={() => advance(true)} title="Skip ahead to the next fight, level-up or disaster">
              ⏭ Next drama
            </button>
          )}
          <div className="speeds" role="group" aria-label="Speed">
            {SPEEDS.map((s, i) => (
              <button key={s.label} className={`btn small ${i === speed ? 'on' : ''}`} onClick={() => setSpeed(i)}>
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
        <section className="logwrap" aria-label="Field report">
          <div className="log" ref={logRef} onScroll={(e) => {
            const el = e.currentTarget;
            setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
          }}>
            {lines.map((l) =>
              l.voice === 'thought' ? (
                <p key={l.id} className="line thought">“{l.text}”</p>
              ) : (
                <p key={l.id} className={`line report ${l.outcome}`}>
                  <span className="beat">{String(l.beat).padStart(3, '0')}</span>
                  <span>{l.text}</span>
                </p>
              ),
            )}
            {over && status && (
              <div className={`ending ${status.ending}`}>
                <h2>{status.ending === 'victory' ? 'DRAGON SLAIN' : status.ending === 'dead' ? 'BLACKBIRD HAS FLATLINED' : 'DAWN OVER NEO'}</h2>
                <p>
                  Level {status.level} · {status.kills} kills · {status.beat} beats · {status.cash} neodollars on hand.
                </p>
                <button className="btn primary" onClick={() => begin(randomSeed(), competence)}>
                  Rebuild her and go again
                </button>
              </div>
            )}
          </div>
          {!follow && (
            <button className="btn jump" onClick={() => setFollow(true)}>↓ Latest</button>
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
              <dt>Location</dt><dd>{status.location}</dd>
              <dt>Neodollars</dt><dd>{status.cash}</dd>
              <dt>Weapon</dt><dd>{status.weapon}{status.wielding !== status.weapon && <span className="bad"> (dry: using {status.wielding})</span>}</dd>
              <dt>Medical</dt><dd className={status.medStock === 0 ? 'bad' : undefined}>{status.medPacks ? `${status.medPacks} (${status.medStock} HP)` : 'none (she cannot heal)'}</dd>
              <dt>Ammo</dt><dd>{status.ammo.length ? status.ammo.map(([t, n]) => `${n} ${t}`).join(' · ') : 'none'}</dd>
              <dt>Armor</dt><dd>{status.armor}</dd>
              {status.satiety > 0.08 && (<><dt>Afterglow</dt><dd>{'♥'.repeat(Math.max(1, Math.round(status.satiety * 5)))} <span className="muted">sated</span></dd></>)}
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
              <button className="btn small" onClick={() => begin(randomSeed(), competence)}>New night</button>
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
