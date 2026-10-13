/** Headless balance harness: npm run sim -- [runs] [competence] */
import { Rng, rollPersonality, runToEnd, ARCHETYPES } from '../engine/src/index.js';

const runs = Number(process.argv[2] ?? 1000);
const competence = Number(process.argv[3] ?? 0.1);

for (const a of ARCHETYPES) {
  let wins = 0;
  let beats = 0;
  for (let i = 0; i < runs; i++) {
    const rng = new Rng(`${a.id}:${i}`);
    let p = rollPersonality(rng);
    while (p.archetypeId !== a.id) p = rollPersonality(rng);
    const { state } = runToEnd({ seed: `${a.id}:${i}`, personality: p, competence });
    if (state.won) wins++;
    beats += state.beat;
  }
  console.log(`${a.label.padEnd(18)} win ${(100 * wins / runs).toFixed(1).padStart(5)}%  avg beats ${(beats / runs).toFixed(0)}`);
}
