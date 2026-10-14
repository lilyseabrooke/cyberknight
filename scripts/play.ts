/** Watch one night in Neo. npm run play -- [seed] [competence] */
import { Rng, createRun, step, render } from '../engine/src/index';

const seed = process.argv[2] ?? 'neo-1';
const competence = Number(process.argv[3] ?? 0.1);
const { world, events: first } = createRun({ seed, competence });
const trng = new Rng(`text:${seed}`);
const h = world.hero;

const IT = '\x1b[3;36m';
const DIM = '\x1b[2m';
const RST = '\x1b[0m';

console.log(`${DIM}BLACKBIRD (${h.realName}) — ${h.personality.archetypeId}, competence ${competence}${RST}`);
console.log(`${DIM}Tonight in Neo: ${world.situation.warringGangs.join(' vs ')} gang war; police crackdown on ${world.situation.crackdown}.${RST}\n`);

const print = (events: typeof first) => {
  for (const ev of events) {
    for (const l of render(ev, { rng: trng, archetype: h.personality.archetypeId, realName: h.realName })) {
      console.log(l.voice === 'thought' ? `    ${IT}“${l.text}”${RST}` : `[${String(ev.beat).padStart(3)}] ${l.text}`);
    }
  }
};
print(first);
let guard = 0;
while (!world.over && guard++ < 1000) print(step(world));
console.log(`\n${DIM}— ${world.ending?.toUpperCase()} — level ${h.level}, ${world.stats.kills} kills, ${world.beat} beats, ${h.cash} neodollars —${RST}`);
