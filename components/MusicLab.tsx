'use client';

import { useEffect, useRef, useState } from 'react';
import { AXIS_REGISTRY } from '../music/score/axes/registry';
import { MACROS } from '../music/score/axes/macros';
import { TEST_PROGRESSION } from '../music/score/conductor';
import { newRiff } from '../music/score/roles/bass';
import { NOTE_NAMES, noteName } from '../music/score/theory';
import type { Bar, RoleId } from '../music/score/types';
import { MusicEngine } from '../music/synth/engine';

const ROLES: { id: RoleId; label: string }[] = [
  { id: 'kick', label: 'Kick' },
  { id: 'sub', label: 'Sub' },
  { id: 'bass', label: 'Bass' },
];

const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);

/**
 * The music workbench (docs/MUSIC_PLAN.md §10.8). Phase 1: the floor (kick, sub and the character bass) with every registered axis
 * as a slider, so the bass's morph from locked to aggressive can be heard and tuned by ear.
 */
export default function MusicLab() {
  const engine = useRef<MusicEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [targets, setTargets] = useState<Record<string, number>>(() => Object.fromEntries(AXIS_REGISTRY.defs.map((d) => [d.id, d.initial])));
  const [slew, setSlew] = useState(true);
  const [pin, setPin] = useState<number | null>(null);
  const [bpm, setBpm] = useState(120);
  const [key, setKey] = useState(4);
  const [loop, setLoop] = useState(true);
  const [muted, setMuted] = useState<RoleId[]>([]);
  const [volume, setVolume] = useState(0.8);
  const [bar, setBar] = useState<{ bar: Bar; kick: string; axes: Record<string, number> } | null>(null);
  // Seed 7 to start: the same riff as the rendered clips (scripts/music-render.ts), and stable across server and client renders.
  const [riff, setRiff] = useState(7);

  const get = (): MusicEngine => {
    if (!engine.current) {
      const e = new MusicEngine({ seed: riff, bpm, key, roots: loop ? TEST_PROGRESSION : [0] });
      e.onBar = (b) => setBar({ bar: b, kick: e.conductor.last.kick, axes: { ...e.conductor.axes.values() } });
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
    c.roots = loop ? TEST_PROGRESSION : [0];
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

  const reroll = (): void => {
    const seed = randomSeed();
    setRiff(seed);
    if (engine.current) engine.current.conductor.riff = newRiff(seed);
  };

  const macros = bar?.bar.macros ?? {};
  const cells = Array.from({ length: 16 }, (_, i) => ({
    kick: bar?.bar.notes.some((n) => n.role === 'kick' && Math.floor(n.t) === i),
    bass: bar?.bar.notes.find((n) => n.role === 'bass' && n.t === i),
  }));

  return (
    <main className="shell music">
      <header className="top">
        <div>
          <h1 className="logo">
            MUSIC <span>LAB</span>
          </h1>
          <p className="tag">Phase 1: the floor. Kick, a clean sub, and a bassline that goes from locked to feral.</p>
        </div>
        <div className="controls">
          <button className={`btn primary`} onClick={() => void toggle()}>
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
                <span className="muted"> {targets[d.id]!.toFixed(2)}{bar && slew ? ` → now ${(bar.axes[d.id] ?? 0).toFixed(2)}` : ''}</span>
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
            Bar {bar ? bar.bar.index + 1 : '-'} <span className="muted">· kick {bar?.kick ?? '-'}</span>
          </h3>
          <div className="steps" aria-label="The last bar, step by step">
            {cells.map((c, i) => (
              <div key={i} className={`step ${i % 4 === 0 ? 'beat' : ''}`}>
                <div className={`k ${c.kick ? 'on' : ''}`} />
                <div className={`b ${c.bass ? 'on' : ''} ${c.bass?.accent ? 'accent' : ''} ${c.bass?.slide ? 'slide' : ''}`}>{c.bass ? noteName(c.bass.note ?? 0) : ''}</div>
              </div>
            ))}
          </div>
          <p className="muted small">Top row kick, bottom row bass. Bright = accent, underline = slide.</p>
        </section>

        <section className="panel" aria-label="Setup">
          <h3>Setup</h3>
          <label className="axis">
            <span>
              Tempo <span className="muted">{bpm} BPM</span>
            </span>
            <input type="range" min={90} max={140} step={1} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
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
          <label className="check">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Root loop i–VI–III–VII (otherwise hold the root)
          </label>
          <div className="controls">
            {ROLES.map((r) => (
              <button key={r.id} className={`btn small ${muted.includes(r.id) ? '' : 'on'}`} onClick={() => setMuted(muted.includes(r.id) ? muted.filter((x) => x !== r.id) : [...muted, r.id])}>
                {r.label}
              </button>
            ))}
            <button className="btn small" onClick={reroll}>
              New riff
            </button>
          </div>
          <p className="muted small">Riff seed {riff}. Changes land on the next bar line.</p>
        </section>
      </div>
    </main>
  );
}
