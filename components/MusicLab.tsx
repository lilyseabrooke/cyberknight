'use client';

import { useEffect, useRef, useState } from 'react';
import { AXIS_REGISTRY } from '../music/score/axes/registry';
import { MACROS } from '../music/score/axes/macros';
import { BANKS, type BankId } from '../music/score/harmony';
import type { StabFeel } from '../music/score/roles/stabs';
import { NOTE_NAMES, noteName } from '../music/score/theory';
import type { Bar, RoleId } from '../music/score/types';
import { MusicEngine } from '../music/synth/engine';

/** Mute buttons: each switches one or more roles. */
const GROUPS: { label: string; roles: RoleId[] }[] = [
  { label: 'Kick', roles: ['kick'] },
  { label: 'Drums', roles: ['hat', 'openhat', 'clap', 'snare', 'perc'] },
  { label: 'Sub', roles: ['sub'] },
  { label: 'Bass', roles: ['bass'] },
  { label: 'Pad', roles: ['pad'] },
  { label: 'Stabs', roles: ['stabs'] },
  { label: 'Drone', roles: ['drone'] },
];

const PROGRESSIONS = (Object.keys(BANKS) as BankId[]).flatMap((bank) => BANKS[bank].map((p, index) => ({ bank, index, name: p.name, id: `${bank}:${index}` })));

const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);

interface Readout {
  bar: Bar;
  kick: string;
  stabs: string;
  drone: boolean;
  axes: Record<string, number>;
}

/**
 * The music workbench (docs/MUSIC_PLAN.md §10.8). Phase 2: the rhythm section and the beds over a progression played as an 8-bar
 * loop, with every registered axis as a slider.
 */
export default function MusicLab() {
  const engine = useRef<MusicEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [targets, setTargets] = useState<Record<string, number>>(() => Object.fromEntries(AXIS_REGISTRY.defs.map((d) => [d.id, d.initial])));
  const [slew, setSlew] = useState(true);
  const [pin, setPin] = useState<number | null>(null);
  const [bpm, setBpm] = useState(120);
  const [key, setKey] = useState(4);
  const [progression, setProgression] = useState('rest:0');
  const [stabFeel, setStabFeel] = useState<StabFeel | 'auto'>('auto');
  const [muted, setMuted] = useState<RoleId[]>([]);
  const [volume, setVolume] = useState(0.8);
  const [readout, setReadout] = useState<Readout | null>(null);
  // Seed 7 to start: the same material as the rendered clips (scripts/music-render.ts), and stable across server and client renders.
  const [seed, setSeed] = useState(7);

  const get = (): MusicEngine => {
    if (!engine.current) {
      const e = new MusicEngine({ seed, bpm, key });
      e.onBar = (b) => setReadout({ bar: b, kick: e.conductor.last.kick, stabs: e.conductor.last.stabs, drone: e.conductor.last.drone, axes: { ...e.conductor.axes.values() } });
      engine.current = e;
    }
    return engine.current;
  };

  useEffect(() => () => void engine.current?.dispose(), []);

  /** Push the controls into the conductor. It reads them at each bar, so changes land on the next bar line. */
  const sync = (e: MusicEngine | null): void => {
    const c = e?.conductor;
    if (!c) return;
    for (const [id, v] of Object.entries(targets)) c.axes.setTarget(id, v);
    if (!slew) c.axes.snap();
    if (pin === null) delete c.overrides.aggression;
    else c.overrides.aggression = pin;
    c.bpm = bpm;
    c.key = key;
    const p = PROGRESSIONS.find((x) => x.id === progression)!;
    c.setProgression(p.bank, p.index);
    c.stabs.forced = stabFeel === 'auto' ? null : stabFeel;
    if (c.seed !== seed) c.reseed(seed);
    c.muted.clear();
    for (const r of muted) c.muted.add(r);
  };

  useEffect(() => sync(engine.current));

  useEffect(() => engine.current?.setVolume(volume), [volume]);

  const toggle = async (): Promise<void> => {
    const e = get();
    if (e.playing) {
      e.stop();
      setPlaying(false);
    } else {
      sync(e);
      await e.start();
      setPlaying(true);
    }
  };

  const bar = readout?.bar;
  const macros = bar?.macros ?? {};
  const at = (role: RoleId, i: number) => bar?.notes.filter((n) => n.role === role && Math.floor(n.t) === i) ?? [];
  const cells = Array.from({ length: 16 }, (_, i) => ({
    kick: at('kick', i).length > 0,
    snare: at('clap', i).length + at('snare', i).length > 0,
    hat: at('hat', i).length + at('openhat', i).length > 0,
    stab: at('stabs', i).length > 0,
    bass: bar?.notes.find((n) => n.role === 'bass' && n.t === i),
  }));
  const pad = bar?.notes.filter((n) => n.role === 'pad' && n.t === 0).map((n) => noteName(n.note!)) ?? [];
  const toggleGroup = (g: (typeof GROUPS)[number]): void => {
    const off = g.roles.every((r) => muted.includes(r));
    setMuted(off ? muted.filter((r) => !g.roles.includes(r)) : [...new Set([...muted, ...g.roles])]);
  };

  return (
    <main className="shell music">
      <header className="top">
        <div>
          <h1 className="logo">
            MUSIC <span>LAB</span>
          </h1>
          <p className="tag">Phase 2: harmony and the beds. The rhythm section, a pad, stabs and a drone over an 8-bar loop.</p>
        </div>
        <div className="controls">
          <button className="btn primary" onClick={() => void toggle()}>
            {playing ? '■ Stop' : '▶ Play'}
          </button>
          <label className="inline">
            Volume <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </label>
        </div>
      </header>

      <div className="musicgrid">
        <section className="panel" aria-label="Axes">
          <h3>Axes</h3>
          {AXIS_REGISTRY.defs.map((d) => (
            <label key={d.id} className="axis">
              <span>
                {d.label}
                <span className="muted">
                  {' '}
                  {targets[d.id]!.toFixed(2)}
                  {readout && slew ? ` → now ${(readout.axes[d.id] ?? 0).toFixed(2)}` : ''}
                </span>
              </span>
              <input type="range" min={0} max={1} step={0.01} value={targets[d.id]} onChange={(e) => setTargets({ ...targets, [d.id]: Number(e.target.value) })} />
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={slew} onChange={(e) => setSlew(e.target.checked)} /> Slew like the game would (rise fast, fall slow)
          </label>
          <h3>Aggression</h3>
          <label className="check">
            <input type="checkbox" checked={pin !== null} onChange={(e) => setPin(e.target.checked ? (macros.aggression ?? 0) : null)} /> Pin it by hand, ignoring the axes
          </label>
          {pin !== null && (
            <label className="axis">
              <span>
                Aggression <span className="muted">{pin.toFixed(2)}</span>
              </span>
              <input type="range" min={0} max={1} step={0.01} value={pin} onChange={(e) => setPin(Number(e.target.value))} />
            </label>
          )}
        </section>

        <section className="panel" aria-label="What is playing">
          <h3>Macros</h3>
          {MACROS.map((m) => (
            <div key={m.id} className="bar">
              <div className="fill macro" style={{ width: `${(macros[m.id] ?? 0) * 100}%` }} />
              <span className="barlabel">{m.id}</span>
              <span className="barval">{(macros[m.id] ?? 0).toFixed(2)}</span>
            </div>
          ))}
          <h3>
            Bar {bar ? (bar.index % 8) + 1 : '-'}/8{' '}
            <span className="muted">
              · {bar ? bar.harmony.segments.map((s) => s.chord.label).join(' → ') : '-'} · {bar?.harmony.mode ?? ''}
              {bar?.harmony.pedal ? ' · pedal' : ''}
            </span>
          </h3>
          <div className="steps" aria-label="The last bar, step by step">
            {cells.map((c, i) => (
              <div key={i} className={`step ${i % 4 === 0 ? 'beat' : ''}`}>
                <div className={`k ${c.hat ? 'on hat' : ''}`} />
                <div className={`k ${c.snare ? 'on snare' : ''}`} />
                <div className={`k ${c.kick ? 'on' : ''}`} />
                <div className={`k ${c.stab ? 'on stab' : ''}`} />
                <div className={`b ${c.bass ? 'on' : ''} ${c.bass?.accent ? 'accent' : ''} ${c.bass?.slide ? 'slide' : ''}`}>{c.bass ? noteName(c.bass.note ?? 0) : ''}</div>
              </div>
            ))}
          </div>
          <p className="muted small">
            Rows: hats, clap/snare, kick, stabs, bass (bright = accent, underline = slide). Kick {readout?.kick ?? '-'} · stabs {readout?.stabs ?? '-'} ·
            drone {readout?.drone ? 'on' : 'off'} · pad {pad.join(' ') || '-'}
          </p>
        </section>

        <section className="panel" aria-label="Setup">
          <h3>Setup</h3>
          <label className="inline">
            Progression{' '}
            <select value={progression} onChange={(e) => setProgression(e.target.value)}>
              {PROGRESSIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.bank}: {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            Key{' '}
            <select value={key} onChange={(e) => setKey(Number(e.target.value))}>
              {NOTE_NAMES.map((n, i) => (
                <option key={n} value={i}>
                  {n} minor
                </option>
              ))}
            </select>
          </label>
          <label className="axis">
            <span>
              Tempo <span className="muted">{bpm} BPM</span>
            </span>
            <input type="range" min={90} max={140} step={1} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
          <label className="inline">
            Stabs{' '}
            <select value={stabFeel} onChange={(e) => setStabFeel(e.target.value as StabFeel | 'auto')}>
              <option value="auto">follow syncopation</option>
              <option value="lock">lock to the bass</option>
              <option value="answer">answer the bass</option>
            </select>
          </label>
          <div className="controls">
            {GROUPS.map((g) => (
              <button key={g.label} className={`btn small ${g.roles.every((r) => muted.includes(r)) ? '' : 'on'}`} onClick={() => toggleGroup(g)}>
                {g.label}
              </button>
            ))}
            <button className="btn small" onClick={() => setSeed(randomSeed())}>
              New material
            </button>
          </div>
          <p className="muted small">Seed {seed}: the riff, the drum kit and the pad&apos;s articulation. Changes land on the next bar line.</p>
        </section>
      </div>
    </main>
  );
}
