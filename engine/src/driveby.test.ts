import { describe, expect, it } from 'vitest';
import { Rng, createWorld, hasTemplate, type GameEvent, type World } from './index';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { driveByChance, drivable, standsAndFights, vehicleAttack } from './driveby';
import type { Ctx, Location } from './types';

const ctxOf = (w: World, rng: Rng): { c: Ctx; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { c: { w, rng, emit: (type, outcome, data = {}) => events.push({ beat: w.beat, type, outcome, data }) }, events };
};

function onStreet(seed: string, name = 'Neon Street', o: { level?: number } = {}) {
  const w = createWorld({ seed, competence: 0.6 });
  const base = w.locations.street_main!;
  const loc: Location = { ...base, id: 'DB_0', name, exits: [{ to: base.id, label: 'back', hidden: false, gate: null }], crowded: false, cameras: 0, populated: true };
  w.locations[loc.id] = loc;
  w.hero.locationId = loc.id;
  w.hero.level = o.level ?? 6;
  w.hero.maxHp = w.hero.hp = 90 + 13 * ((o.level ?? 6) - 1);
  return { w, loc };
}

const crewOf = (w: World, n: number, kind = 'ganger') =>
  Array.from({ length: n }, (_, i) => {
    const g = spawnNpc(new Rng(`db${i}`), `db_${i}`, kind, w.hero.locationId);
    addNpc(w, g);
    return g;
  });

describe('a vehicle attack', () => {
  it('cannot come down an alley, a highway or into a building', () => {
    const { w, loc } = onStreet('db-chance');
    expect(drivable(loc)).toBe(true);
    expect(drivable({ ...loc, name: 'Back Alley', street: 'alley' as const })).toBe(false);
    expect(driveByChance(w, { ...loc, name: 'Back Alley', street: 'alley' as const })).toBe(0);
    expect(driveByChance(w, { ...loc, road: 'highway' })).toBe(0);
    expect(driveByChance(w, { ...loc, outdoors: false })).toBe(0);
  });

  it('is likelier the more a gang has against her on its own turf', () => {
    const { w, loc } = onStreet('db-turf');
    const gang = Object.keys(w.factions).find((f) => w.factions[f]!.kind === 'gang');
    if (!gang) return;
    const turf = { ...loc, territory: gang };
    w.heat[gang] = 0;
    const calm = driveByChance(w, turf);
    w.heat[gang] = 5;
    expect(driveByChance(w, turf)).toBeGreaterThan(calm);
  });

  it('is fought when she is strong and fled when she is hurt and outnumbered', () => {
    const { w } = onStreet('db-choice');
    const crew = crewOf(w, 3);
    w.hero.hp = w.hero.maxHp;
    const strong = Array.from({ length: 200 }, (_, i) => standsAndFights(ctxOf(w, new Rng(`s${i}`)).c, crew.slice(0, 1))).filter(Boolean).length;
    w.hero.hp = Math.round(w.hero.maxHp * 0.2);
    const hurt = Array.from({ length: 200 }, (_, i) => standsAndFights(ctxOf(w, new Rng(`s${i}`)).c, crew)).filter(Boolean).length;
    expect(strong).toBeGreaterThan(hurt);
  });

  it('runs end to end with every event templated, for both attackers', () => {
    let ran = 0;
    let chased = 0;
    for (const who of ['gang', 'npd'] as const) {
      for (let i = 0; i < 12; i++) {
        const { w } = onStreet(`db-run-${who}-${i}`);
        w.heat.npd = 4;
        const crew = crewOf(w, 2, who === 'npd' ? 'npd_officer' : 'ganger');
        const { c, events } = ctxOf(w, new Rng(`db-${who}-${i}`));
        vehicleAttack(c, who, crew);
        ran++;
        expect(events.some((e) => e.type === 'vehicle_attack')).toBe(true);
        expect(events.some((e) => e.type === 'attack_choice')).toBe(true);
        if (events.some((e) => e.type === 'chase_start' || e.type === 'chase_round' || e.type === 'chase_end')) chased++;
        for (const e of events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
      }
    }
    expect(ran).toBe(24);
    expect(chased).toBeGreaterThan(0);
  });
});
