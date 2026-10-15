/** Watch one night in Neo. npm run play -- [seed] [competence] */
import { Rng, createRun, step, render, describePersonality, goalViews, depths } from '../engine/src/index';

const seed = process.argv[2] ?? 'neo-1';
const competence = Number(process.argv[3] ?? 0.1);
const { world, events: first } = createRun({ seed, competence });
const trng = new Rng(`text:${seed}`);
const h = world.hero;

const IT = '\x1b[3;36m';
const DIM = '\x1b[2m';
const RST = '\x1b[0m';

console.log(`${DIM}BLACKBIRD (${h.realName}) — ${describePersonality(h.personality)}, competence ${competence}${RST}`);
console.log(`${DIM}Tonight in Neo: ${world.situation.warringGangs.join(' vs ')} gang war; police crackdown on ${world.situation.crackdown}.${RST}\n`);

const print = (events: typeof first) => {
  const depth = depths(events);
  events.forEach((ev, i) => {
    const pad = '  '.repeat(depth[i]!);
    for (const l of render(ev, { rng: trng, personality: h.personality, realName: h.realName })) {
      console.log(l.voice === 'thought' ? `    ${pad}${IT}“${l.text}”${RST}` : `[${String(ev.beat).padStart(3)}] ${pad}${depth[i] ? '↳ ' : ''}${l.text}`);
    }
  });
};
print(first);
let guard = 0;
while (!world.over && guard++ < 1000) print(step(world));
const open = goalViews(world);
if (open.length) console.log(`\n${DIM}Still on her mind: ${open.map((g) => `${'  '.repeat(g.depth)}${g.label}`).join(' / ')}${RST}`);
const t = world.mind.tally;
console.log(`${DIM}Goals: ${t.done} done, ${t.dropped} dropped, ${t.revised} reworked, ${t.delayed} put off.${RST}`);
console.log(`\n${DIM}— ${world.ending?.toUpperCase()} — level ${h.level}, ${world.stats.kills} kills, ${world.beat} beats, ${h.cash} neodollars —${RST}`);
