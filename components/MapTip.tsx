'use client';

import { useCallback, useState, type PointerEvent, type ReactNode } from 'react';

interface Tip {
  content: ReactNode;
  x: number;
  y: number;
}

/** A hover card that follows the pointer, for the board and the minimap. `on(content)` gives the handlers to spread on a thing. */
export function useMapTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const on = useCallback(
    (content: ReactNode | (() => ReactNode)) => ({
      onPointerEnter: (e: PointerEvent) => setTip({ content: typeof content === 'function' ? (content as () => ReactNode)() : content, x: e.clientX, y: e.clientY }),
      onPointerMove: (e: PointerEvent) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t)),
      onPointerLeave: () => setTip(null),
    }),
    [],
  );
  const node = tip ? <MapTipCard {...tip} /> : null;
  return { on, node, hide: () => setTip(null) };
}

function MapTipCard({ content, x, y }: Tip) {
  // Keep it on screen: flip to the other side of the pointer near the right and bottom edges.
  const w = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const h = typeof window === 'undefined' ? 800 : window.innerHeight;
  const left = x + 280 > w ? Math.max(8, x - 274) : x + 14;
  const top = y + 160 > h ? Math.max(8, y - 150) : y + 14;
  return (
    <div className="maptip" style={{ left, top }} role="tooltip">
      {content}
    </div>
  );
}
