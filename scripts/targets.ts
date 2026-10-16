/**
 * Who Blackbird's kill goals are aimed at, and whether a few people keep driving the numbers.
 *   npm run targets -- [nights per competence] [competence ...]
 */
import { createRun, step } from '../engine/src/index';

const nights = Number(process.argv[2] ?? 100);
const levels = process.argv.slice(3).map(Number);
if (!levels.length) levels.push(0.2, 0.6, 1);

interface Row { id: string; name: string; role: string; archetype: string; nights: Set<string>; formed: number; beats: number; done: number; dropped: number; variants: Record<string, number>; gap: number; }
const bump = (m: Record<string, number>, k: string, by = 1) => void (m[k] = (m[k] ?? 0) + by);
const pct = (x: number, of: number) => (of ? `${((100 * x) / of).toFixed(1)}%` : '-');

for (const competence of levels) {
  const rows = new Map<string, Row>();
  let totalBeats = 0, killBeats = 0, formed = 0;
  for (let i = 0; i < nights; i++) {
    const seed = `tg-${competence}-${i}`;
    const { world: w, events: first } = createRun({ seed, competence });
    const byName = (name: string) => Object.values(w.npcs).find((n) => n.name === name);
    const rowOf = (id: string): Row => {
      const n = w.npcs[id]!;
      // Named cast are the same people every night; the generated crowd is only comparable by role.
      const key = n.ephemeral || id.startsWith('tmp_') || /\d/.test(id) ? `~${n.role || n.archetype}` : id;
      let r = rows.get(key);
      if (!r) rows.set(key, (r = { id: key, name: key.startsWith('~') ? `(any ${n.role || n.archetype})` : n.name, role: n.role, archetype: n.archetype, nights: new Set(), formed: 0, beats: 0, done: 0, dropped: 0, variants: {}, gap: 0 }));
      return r;
    };
    const seen = new Set<number>();
    const eat = (evs: { type: string; data: Record<string, unknown> }[]) => {
      for (const e of evs) {
        if (e.data.kind !== 'kill') continue;
        if (e.type === 'goal_new') {
          const g = [...w.mind.goals].reverse().find((x) => x.kind === 'kill' && !seen.has(x.id));
          if (!g?.npc || !w.npcs[g.npc]) continue;
          seen.add(g.id);
          const r = rowOf(g.npc);
          r.formed++; formed++;
          r.nights.add(seed);
          r.gap += w.npcs[g.npc]!.level - w.hero.level;
          bump(r.variants, String(e.data.variant));
        } else if (e.type === 'goal_done' || e.type === 'goal_drop') {
          const n = byName(String(e.data.npc));
          if (n) rowOf(n.id)[e.type === 'goal_done' ? 'done' : 'dropped']++;
        }
      }
    };
    eat(first);
    while (!w.over && w.beat < 600) {
      eat(step(w));
      totalBeats++;
      const held = new Set<string>();
      for (const g of w.mind.goals) if (g.kind === 'kill' && g.parent === null && g.npc && w.npcs[g.npc]) held.add(rowOf(g.npc).id);
      if (held.size) killBeats++;
      for (const id of held) rows.get(id)!.beats++;
    }
  }
  const all = [...rows.values()];
  const sum = (f: (r: Row) => number) => all.reduce((a, r) => a + f(r), 0);
  console.log(`\n── competence ${competence}: ${nights} nights, ${totalBeats} beats, ${formed} kill goals formed, ${all.length} distinct targets, a kill goal held in ${pct(killBeats, totalBeats)} of beats ──`);
  console.log('  target                         formed  share  nights  beats-held  done  dropped  lvl-gap  origin');
  for (const r of all.sort((a, b) => b.beats - a.beats).slice(0, 15)) {
    const origin = Object.entries(r.variants).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`  ${r.name.slice(0, 28).padEnd(28)}  ${String(r.formed).padStart(6)}  ${pct(r.formed, formed).padStart(5)}  ${String(r.nights.size).padStart(6)}  ${pct(r.beats, sum((x) => x.beats)).padStart(10)}  ${String(r.done).padStart(4)}  ${String(r.dropped).padStart(7)}  ${(r.gap / (r.formed || 1)).toFixed(1).padStart(7)}  ${origin}`);
  }
  const top3 = all.sort((a, b) => b.beats - a.beats).slice(0, 3).reduce((a, r) => a + r.beats, 0);
  console.log(`  top 3 targets account for ${pct(top3, sum((x) => x.beats))} of kill-goal beats`);
}
