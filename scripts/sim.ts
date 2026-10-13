/** Headless balance harness: npm run sim -- [runs] [competence] */
import { runToEnd, type World } from '../engine/src/index.js';

const runs = Number(process.argv[2] ?? 500);
const competence = Number(process.argv[3] ?? 0.1);

const endings: Record<string, number> = {};
const where: Record<string, number> = {};
const seen = new Map<string, number>();
let levels = 0, beats = 0, kills = 0;
for (let i = 0; i < runs; i++) {
  const { world, events } = runToEnd({ seed: `sim-${i}`, competence });
  const w: World = world;
  endings[w.ending ?? '?'] = (endings[w.ending ?? '?'] ?? 0) + 1;
  levels += w.stats.maxLevel;
  beats += w.beat;
  kills += w.stats.kills;
  const d = events.find((e) => e.type === 'death');
  if (d) where[String(d.data.place)] = (where[String(d.data.place)] ?? 0) + 1;
  for (const e of events) {
    const k = `${e.type}${e.data.variant ? ':' + e.data.variant : ''}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
}
console.log(`competence ${competence}, ${runs} runs`);
console.log('endings', endings);
console.log(`avg level ${(levels / runs).toFixed(1)}, avg beats ${(beats / runs).toFixed(0)}, avg kills ${(kills / runs).toFixed(1)}`);
console.log('deaths by place', Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 8));
const rare = [...seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, 12).map(([k, n]) => `${k}(${n})`);
console.log('rarest events:', rare.join(', '));
console.log(`distinct event kinds seen: ${seen.size}`);
