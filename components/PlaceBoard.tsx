'use client';

import { memo, type ReactNode } from 'react';
import type { BoardPerson, BoardView, Fixture, FixtureKind, Layout } from '../engine/src';
import { useMapTip } from './MapTip';

/** Board units per tile. */
const T = 40;

/** How each kind of fixture is drawn: a look (a CSS class) and a shape. */
const LOOK: Partial<Record<FixtureKind, [string, 'box' | 'round' | 'rungs']>> = {
  bar: ['warm', 'box'], counter: ['warm', 'box'], shelf: ['warm', 'box'], stall: ['warm', 'box'],
  booth: ['seat', 'box'], sofa: ['seat', 'box'], bed: ['seat', 'box'], bunk: ['seat', 'box'], bench: ['seat', 'box'],
  table: ['civ', 'round'], pillar: ['solid', 'round'], column: ['solid', 'round'], statue: ['solid', 'round'],
  tree: ['green', 'round'], fountain: ['tech', 'round'], lamp: ['warm', 'round'],
  dj_booth: ['tech', 'box'], console: ['tech', 'box'], screen: ['tech', 'box'], server: ['green', 'box'], machine: ['green', 'box'],
  rack: ['heavy', 'box'], locker: ['heavy', 'box'], safe: ['heavy', 'box'], crate: ['heavy', 'box'], container: ['heavy', 'box'], vehicle: ['heavy', 'box'],
  speaker: ['solid', 'box'], tower: ['solid', 'box'],
  stairs: ['way', 'rungs'], ladder: ['way', 'rungs'], ramp: ['way', 'rungs'], duct: ['way', 'rungs'],
  fence: ['line', 'box'], barricade: ['line', 'box'], barrier: ['line', 'box'], pipe: ['line', 'box'], ring: ['ring', 'box'],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function bbox(tiles: { x: number; y: number }[]) {
  const xs = tiles.map((t) => t.x), ys = tiles.map((t) => t.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1 };
}

/**
 * The place she is in, from above: walls, fixtures, doors and cameras, everyone where they stand at the end of the beat, and
 * her. People keep their element from beat to beat, so they glide to where they are now. Hover anything for what it is.
 */
export default function PlaceBoard({ view, highlight, onHover }: { view: BoardView; highlight: string | null; onHover: (id: string | null) => void }) {
  const tip = useMapTip();
  const L = view.layout;
  if (!L) return <p className="noplan muted">No floor plan for {view.name}.</p>;

  // Crop to what is there: a street's board is a hex-shaped patch with nothing round it.
  let x0 = L.grid.w, y0 = L.grid.h, x1 = 0, y1 = 0;
  L.grid.cells.forEach((c, i) => {
    if (c === 'void') return;
    const x = i % L.grid.w, y = Math.floor(i / L.grid.w);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  });

  // People sharing a tile are nudged apart so nobody hides under anybody else.
  const taken: Record<string, number> = {};
  const spot = (x: number, y: number): [number, number] => {
    const k = `${x},${y}`;
    const n = (taken[k] = (taken[k] ?? 0) + 1) - 1;
    return n ? [x + [0, 0.28, -0.28, 0][n % 4]!, y + [0, -0.22, 0.22, 0.3][n % 4]!] : [x, y];
  };
  if (view.hero) spot(view.hero.x, view.hero.y);

  return (
    <>
      <svg key={view.loc} className="pb" viewBox={`${x0 * T - 36} ${y0 * T - 28} ${(x1 - x0) * T + 72} ${(y1 - y0) * T + 34}`} role="img" aria-label={`Floor plan of ${view.name}`}>
        <defs>
          <filter id="pb-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="pb-soft" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        <Ground layout={L} />
        <g>{L.fixtures.map((f) => <FixtureShape key={f.id} f={f} bind={tip.on(<><b>{cap(f.label)}</b>{f.large && <><br /><span className="k">Big enough to hide behind.</span></>}</>)} />)}</g>
        <Doors layout={L} bind={tip.on} />
        <g>
          {L.cams.map((c) => {
            const cx = (c.x + 0.5) * T, cy = (c.y + 0.5) * T, a = ((c.facing * 45 - 90) * Math.PI) / 180;
            return (
              <g key={c.id} {...tip.on(<><b>Security camera</b><br /><span className="k">Sees everything she does here unless it&apos;s down.</span></>)}>
                <circle className="pb-cam" cx={cx} cy={cy} r={6} filter="url(#pb-glow)" />
                <path className="pb-cam cone" d={`M${cx},${cy} L${cx + Math.cos(a - 0.35) * 18},${cy + Math.sin(a - 0.35) * 18} L${cx + Math.cos(a + 0.35) * 18},${cy + Math.sin(a + 0.35) * 18} Z`} />
                <circle cx={cx} cy={cy} r={14} fill="transparent" />
              </g>
            );
          })}
        </g>
        <g>
          {view.bodies.map((b) => (
            <g key={`body-${b.id}`} className="pb-body" transform={`translate(${(b.x + 0.5) * T} ${(b.y + 0.5) * T})`} {...tip.on(<><b>{b.name}</b><br /><span className="k">{b.dead ? 'Dead.' : 'Out cold.'}</span></>)}>
              <path d={`M${-T * 0.2},${-T * 0.2} L${T * 0.2},${T * 0.2} M${T * 0.2},${-T * 0.2} L${-T * 0.2},${T * 0.2}`} />
            </g>
          ))}
          {view.people.map((p) => {
            const [x, y] = spot(p.x, p.y);
            return (
              <Person key={p.id} p={p} x={x} y={y} lit={highlight === p.id}
                bind={tip.on(<PersonCard p={p} />)} onHover={onHover} />
            );
          })}
          {view.hero && <Hero x={view.hero.x} y={view.hero.y} bind={tip.on(<><b>Blackbird</b><br /><span className="k">That&apos;s her.</span></>)} />}
        </g>
      </svg>
      {tip.node}
    </>
  );
}

const Ground = memo(function Ground({ layout: L }: { layout: Layout }) {
  const { w, h, cells } = L.grid;
  const at = (x: number, y: number) => cells[y * w + x];
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && at(x, y) !== 'wall' && at(x, y) !== 'void';
  const floor: ReactNode[] = [], walls: ReactNode[] = [], rims: ReactNode[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(x, y);
    if (c === 'void') continue;
    if (c === 'wall') {
      walls.push(<rect key={`w${x},${y}`} x={x * T} y={y * T} width={T} height={T} />);
      if (open(x, y - 1)) rims.push(<line key={`n${x},${y}`} x1={x * T} y1={y * T} x2={(x + 1) * T} y2={y * T} />);
      if (open(x, y + 1)) rims.push(<line key={`s${x},${y}`} x1={x * T} y1={(y + 1) * T} x2={(x + 1) * T} y2={(y + 1) * T} />);
      if (open(x - 1, y)) rims.push(<line key={`e${x},${y}`} x1={x * T} y1={y * T} x2={x * T} y2={(y + 1) * T} />);
      if (open(x + 1, y)) rims.push(<line key={`f${x},${y}`} x1={(x + 1) * T} y1={y * T} x2={(x + 1) * T} y2={(y + 1) * T} />);
      continue;
    }
    const lit = L.light[y * w + x] ?? 1;
    const raised = (L.grid.level?.[y * w + x] ?? 0) > 0;
    floor.push(<rect key={`f${x},${y}`} className={`pb-floor l${lit}${raised ? ' up' : ''}`} x={x * T + 0.5} y={y * T + 0.5} width={T - 1} height={T - 1} rx={2} />);
  }
  return (
    <g>
      <g>{floor}</g>
      <g className="pb-wall">{walls}</g>
      <g className="pb-rim" filter="url(#pb-glow)">{rims}</g>
      {/* rooms have no walls of their own on the board: give them an outline */}
      {!cells.includes('wall') && <rect className="pb-room" x={0} y={0} width={w * T} height={h * T} rx={4} filter="url(#pb-glow)" />}
    </g>
  );
});

type Bind = ReturnType<ReturnType<typeof useMapTip>['on']>;

function FixtureShape({ f, bind }: { f: Fixture; bind: Bind }) {
  const b = bbox(f.tiles);
  const hit = <rect x={b.x0 * T} y={b.y0 * T} width={(b.x1 - b.x0) * T} height={(b.y1 - b.y0) * T} fill="transparent" />;
  if (f.kind === 'dancefloor') {
    return (
      <g {...bind}>
        {f.tiles.map((t) => (
          <rect key={`${t.x},${t.y}`} className={`pb-dance ${(t.x + t.y) % 2 ? 'a' : 'b'}`} x={t.x * T + 2} y={t.y * T + 2} width={T - 4} height={T - 4} rx={3}
            style={{ animationDelay: `${((t.x * 7 + t.y * 3) % 10) * 0.24}s` }} />
        ))}
        {hit}
      </g>
    );
  }
  const [look, shape] = LOOK[f.kind] ?? ['plain', 'box'];
  let body: ReactNode;
  if (shape === 'round') {
    body = <circle cx={((b.x0 + b.x1) / 2) * T} cy={((b.y0 + b.y1) / 2) * T} r={Math.min(b.x1 - b.x0, b.y1 - b.y0) * T * 0.34} />;
  } else if (shape === 'rungs') {
    body = f.tiles.flatMap((t) => [1, 2, 3].map((k) => <line key={`${t.x},${t.y},${k}`} x1={t.x * T + 8} x2={(t.x + 1) * T - 8} y1={t.y * T + (k * T) / 4} y2={t.y * T + (k * T) / 4} />));
  } else {
    body = <rect x={b.x0 * T + 3} y={b.y0 * T + 3} width={(b.x1 - b.x0) * T - 6} height={(b.y1 - b.y0) * T - 6} rx={look === 'seat' ? 10 : 3} />;
  }
  return <g className={`pb-fix ${look}`} {...bind}>{body}{hit}</g>;
}

function Doors({ layout: L, bind }: { layout: Layout; bind: (c: ReactNode) => Bind }) {
  const byTile = new Map<string, Layout['doors']>();
  for (const d of L.doors) {
    const k = `${d.at.x},${d.at.y}`;
    byTile.set(k, [...(byTile.get(k) ?? []), d]);
  }
  const { w, h } = L.grid;
  return (
    <g>
      {[...byTile].map(([k, ds]) => {
        const [x, y] = k.split(',').map(Number) as [number, number];
        const front = ds.some((d) => d.front);
        const ex = x === 0 ? 0 : x === w - 1 ? 1 : null, ey = y === 0 ? 0 : y === h - 1 ? 1 : null;
        return (
          <g key={k} className={`pb-door${front ? ' front' : ''}`} {...bind(<><b>Way out</b><ul>{ds.map((d) => <li key={d.exit + d.label}>{cap(d.label)}</li>)}</ul></>)}>
            <rect className="pad" x={x * T + 4} y={y * T + 4} width={T - 8} height={T - 8} rx={3} />
            {ey !== null ? <line className="bar" x1={x * T + 5} x2={(x + 1) * T - 5} y1={(y + ey) * T} y2={(y + ey) * T} filter="url(#pb-glow)" />
              : ex !== null ? <line className="bar" y1={y * T + 5} y2={(y + 1) * T - 5} x1={(x + ex) * T} x2={(x + ex) * T} filter="url(#pb-glow)" />
              : <circle className="dot" cx={(x + 0.5) * T} cy={(y + 0.5) * T} r={5} filter="url(#pb-glow)" />}
          </g>
        );
      })}
    </g>
  );
}

function PersonCard({ p }: { p: BoardPerson }) {
  return (
    <>
      <b>{p.name}</b><br />
      {cap(p.role)}<br />
      <span className="k">With</span> {p.with} <i className={`sw ${p.side}`} /><br />
      <span className="k">Level</span> {p.level}
      {p.hostile && <><br /><span className="bad">Hostile</span></>}
      {p.tags.length > 0 && <><br /><span className="k">{p.tags.join(' · ')}</span></>}
    </>
  );
}

function Person({ p, x, y, lit, bind, onHover }: { p: BoardPerson; x: number; y: number; lit: boolean; bind: Bind; onHover: (id: string | null) => void }) {
  return (
    <g className={`pb-ent ${p.side}${lit ? ' hl' : ''}`} style={{ transform: `translate(${(x + 0.5) * T}px, ${(y + 0.5) * T}px)` }}
      {...bind}
      onPointerEnter={(e) => { bind.onPointerEnter(e); onHover(p.id); }}
      onPointerLeave={() => { bind.onPointerLeave(); onHover(null); }}>
      <circle className="halo" r={T * 0.5} filter="url(#pb-soft)" />
      <line className="face" x1={0} y1={0} x2={0} y2={-T * 0.46} transform={`rotate(${p.facing * 45})`} />
      {p.robot
        ? <rect className="body robot" x={-T * 0.22} y={-T * 0.22} width={T * 0.44} height={T * 0.44} rx={2} transform="rotate(45)" />
        : <circle className="body" r={T * 0.25} />}
      {p.security && <circle className="sec" r={T * 0.33} />}
      {p.hostile && <circle className="hostile" r={T * 0.38} />}
    </g>
  );
}

function Hero({ x, y, bind }: { x: number; y: number; bind: Bind }) {
  return (
    <g className="pb-ent pb-hero" style={{ transform: `translate(${(x + 0.5) * T}px, ${(y + 0.5) * T}px)` }} {...bind}>
      <circle className="ring" r={T * 0.3} />
      <rect className="body" x={-T * 0.24} y={-T * 0.24} width={T * 0.48} height={T * 0.48} rx={2} transform="rotate(45)" filter="url(#pb-glow)" />
      <text y={-T * 0.52} textAnchor="middle" filter="url(#pb-glow)">BLACKBIRD</text>
    </g>
  );
}
