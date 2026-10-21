'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CityPlace, CityView } from '../engine/src';
import { useMapTip } from './MapTip';

/** Hex radius in map units. */
const S = 10;
/** Axial directions, in the order of engine/src/hex.ts `DIRS`. Edge d of a pointy-top hex faces -60·d degrees. */
const DIR: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const px = (q: number, r: number): [number, number] => [S * Math.sqrt(3) * (q + r / 2), S * 1.5 * r];
const corner = (cx: number, cy: number, deg: number): [number, number] => [cx + S * Math.cos((deg * Math.PI) / 180), cy + S * Math.sin((deg * Math.PI) / 180)];
const hexPoints = (cx: number, cy: number) => [0, 1, 2, 3, 4, 5].map((i) => corner(cx, cy, 30 + 60 * i).join(',')).join(' ');
const districtName = (d: string) => (d === 'halo' ? 'the Halo' : d);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Box = [number, number, number, number];

/**
 * Neo as far as she has seen it, on its hex grid. Places she has been are filled in, places she has only seen the way into are
 * dashed, a white seam runs where two districts meet, and where she is now pulses. Two zooms: near (the default, a few streets
 * round her with big hexes, following her) and the whole city she knows.
 */
export default function Minimap({ city }: { city: CityView }) {
  const tip = useMapTip();
  const [zoom, setZoom] = useState<'near' | 'city'>('near');
  const owner = useMemo(() => {
    const m = new Map<string, CityPlace>();
    for (const p of city.places) for (const [q, r] of p.cells) m.set(`${q},${r}`, p);
    return m;
  }, [city]);

  const cityBox = useMemo<Box>(() => {
    const pts = city.places.flatMap((p) => p.cells.map(([q, r]) => px(q, r)));
    if (!pts.length) return [-50, -50, 100, 100];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs) - S * 2, maxX = Math.max(...xs) + S * 2, minY = Math.min(...ys) - S * 2, maxY = Math.max(...ys) + S * 2;
    // never narrower than tall, so the near view (which keeps this shape) stays a sensible window
    const w = Math.max(maxX - minX, (maxY - minY) * 1.05), h = maxY - minY;
    return [(minX + maxX) / 2 - w / 2, minY, w, h];
  }, [city]);

  const bindPlace = useCallback((p: CityPlace) => tip.on(() => <PlaceCard p={p} />), [tip.on]);
  const here = city.places.find((p) => p.id === city.here);
  const hereAt = useMemo<[number, number]>(() => {
    if (!here) return [cityBox[0] + cityBox[2] / 2, cityBox[1] + cityBox[3] / 2];
    const pts = here.cells.map(([q, r]) => px(q, r));
    return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  }, [here, cityBox]);

  const target = useMemo<Box>(() => {
    if (zoom === 'city') return cityBox;
    const w = S * Math.sqrt(3) * 8.5, h = (w * cityBox[3]) / cityBox[2];
    return [hereAt[0] - w / 2, hereAt[1] - h / 2, w, h];
  }, [zoom, cityBox, hereAt]);

  // Glide between views rather than jump.
  const [box, setBox] = useState<Box>(target);
  const shown = useRef(box);
  useEffect(() => {
    const from = shown.current, to = target;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now(), dur = reduce ? 0 : 450;
    let raf = 0;
    const step = (now: number) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const next = from.map((v, i) => v + (to[i]! - v) * e) as Box;
      shown.current = next;
      setBox(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <div className="mini">
      <div className="mini-top">
        <span>{here ? districtName(here.district) : 'Neo'}</span>
        <span className="zoom" role="group" aria-label="Minimap zoom">
          {(['near', 'city'] as const).map((z) => (
            <button key={z} type="button" className={zoom === z ? 'on' : ''} aria-pressed={zoom === z} onClick={() => setZoom(z)}>{cap(z)}</button>
          ))}
        </span>
      </div>
      <svg className={`minimap ${zoom}`} viewBox={box.join(' ')} role="img" aria-label="Map of the city she has seen">
        <defs><filter id="mm-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        <Tiles city={city} owner={owner} hereId={city.here} bind={bindPlace} />
        {here && (
          <g className="mm-here" pointerEvents="none">
            {here.cells.map(([q, r]) => <polygon key={`${q},${r}`} points={hexPoints(...px(q, r))} />)}
            <rect x={hereAt[0] - 2.6} y={hereAt[1] - 2.6} width={5.2} height={5.2} transform={`rotate(45 ${hereAt[0]} ${hereAt[1]})`} />
          </g>
        )}
      </svg>
      {tip.node}
    </div>
  );
}

type Bind = ReturnType<ReturnType<typeof useMapTip>['on']>;

/** Everything but where she is: it changes only when she sees something new, so it isn't redrawn every beat. */
const Tiles = memo(function Tiles({ city, owner, hereId, bind }: { city: CityView; owner: Map<string, CityPlace>; hereId: string | null; bind: (p: CityPlace) => Bind }) {
  const seams: ReactNode[] = [];
  const labels = new Map<string, [number, number][]>();
  const tiles = city.places.map((p) => {
    const fills: ReactNode[] = [], rims: ReactNode[] = [];
    for (const [q, r] of p.cells) {
      const [cx, cy] = px(q, r);
      labels.set(p.district, [...(labels.get(p.district) ?? []), [cx, cy]]);
      fills.push(<polygon key={`${q},${r}`} points={hexPoints(cx, cy)} />);
      DIR.forEach(([dq, dr], d) => {
        const other = owner.get(`${q + dq},${r + dr}`);
        const a = corner(cx, cy, -60 * d - 30), b = corner(cx, cy, -60 * d + 30);
        // outline only edges facing another place, so a street several cells long reads as one shape
        if (other !== p) rims.push(<line key={`${q},${r},${d}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />);
        // a seam where districts meet, drawn once from the cell with the smaller key
        if (other && other.district !== p.district && `${q},${r}` < `${q + dq},${r + dr}`) {
          seams.push(<line key={`${q},${r},${d}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />);
        }
      });
    }
    return (
      <g key={p.id} className={`mm-place d-${p.district}${p.been ? ' been' : ''}${p.id === hereId ? ' here' : ''}`} {...bind(p)}>
        <g className="fill">{fills}</g>
        <g className="rim">{rims}</g>
      </g>
    );
  });
  return (
    <>
      <g>{tiles}</g>
      <g className="mm-seams" pointerEvents="none">{seams}</g>
      <g pointerEvents="none">
        {[...labels].map(([d, pts]) => (
          <text key={d} className={`mm-label d-${d}`} x={pts.reduce((a, p) => a + p[0], 0) / pts.length} y={pts.reduce((a, p) => a + p[1], 0) / pts.length} textAnchor="middle">
            {districtName(d)}
          </text>
        ))}
      </g>
    </>
  );
});

function PlaceCard({ p }: { p: CityPlace }) {
  return (
    <>
      <b>{p.name}</b><br />
      <span className="k">{cap(p.kind)} · {districtName(p.district)}</span><br />
      {p.been ? 'She has been here.' : 'She has only seen the way in.'}
      {p.along.length > 0 && <><br /><span className="k">Along it:</span><ul>{p.along.map((n) => <li key={n}>{n}</li>)}</ul></>}
      {p.off.length > 0 && <><br /><span className="k">Off</span> {p.off.join(', ')}</>}
    </>
  );
}
