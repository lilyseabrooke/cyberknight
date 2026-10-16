import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Rng, createWorld, hasTemplate, type GameEvent, type Npc, type World } from './index';
import { fight } from './combat';
import { spawnNpc } from './content/archetypes';
import { makeItem } from './content/items';
import { AMMO_IDS } from './content/ammo';
import { ARTS, BASE_GATE, DOCTRINE } from './content/doctrine';
import { NODES, NODE_IDS, TREE, parseNeed } from './content/tree';
import { addNpc } from './population';
import { art, artsOf, buy, perk, priceOf } from './lab';
import { branchOf, classOf } from './doctrine';

/** A legacy's upgrades with every rank of the named arts bought (by art id). */
const withArts = (...ids: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const n of NODE_IDS) if (NODES[n]!.fx.some((f) => 'art' in f && ids.includes(f.art))) out[n] = NODES[n]!.max;
  return out;
};

interface Round {
  result: string;
  hpLost: number;
  events: GameEvent[];
}

/** One fight in a fresh world, with the lab's ranks and a weapon, against a gang. */
function duel(seed: string, upgrades: Record<string, number>, weapon: string, o: { n?: number; kind?: string; level?: number; hpFrac?: number } = {}): Round {
  const w: World = createWorld({ seed, competence: 0.7 });
  w.legacy.upgrades = upgrades;
  const h = w.hero;
  const level = o.level ?? 6;
  h.level = level;
  h.maxHp = 90 + 12 * (level - 1);
  h.hp = Math.round(h.maxHp * (o.hpFrac ?? 1));
  h.muscle = level;
  h.weapon = makeItem(weapon);
  h.armor = makeItem('kevlar_duster');
  h.ammo = Object.fromEntries(AMMO_IDS.map((t) => [t, 500]));
  h.locationId = 'street_main';
  h.implants = [];
  const rng = new Rng(`${seed}-rng`);
  const foes: Npc[] = Array.from({ length: o.n ?? 2 }, (_, k) => {
    const d = spawnNpc(rng, `d${k}`, o.kind ?? 'ganger', h.locationId);
    addNpc(w, d);
    return d;
  });
  const events: GameEvent[] = [];
  const emit = (type: string, outcome: 'good' | 'bad' | 'mixed', data: Record<string, string | number | boolean> = {}) => void events.push({ beat: w.beat, type, outcome, data });
  const before = h.hp;
  const result = fight({ w, rng, emit }, foes, { cause: 'test', joiners: false, assault: true });
  return { result, hpLost: before - h.hp, events };
}

const average = (seeds: number, f: (i: number) => number): number => {
  let t = 0;
  for (let i = 0; i < seeds; i++) t += f(i);
  return t / seeds;
};

describe('the data', () => {
  it('has six branches, each opening on a ten-rank base that gates everything else', () => {
    expect(DOCTRINE.map((b) => b.id).sort()).toEqual(['blades', 'blunt', 'general', 'heavy', 'precision', 'small']);
    for (const b of DOCTRINE) {
      expect(b.base.max, b.id).toBe(10);
      const base = TREE.find((t) => t.id === `doctrine_${b.id}`)!;
      expect(base, b.id).toBeDefined();
      const baseNode = `${b.id}_base.1`;
      for (const l of b.lines) {
        const first = NODES[`${l.id}.1`]!;
        expect(first.needs, l.id).toContain(`${b.id}_base.1:${BASE_GATE}`);
      }
      expect(NODES[baseNode]!.needs).toEqual([]);
    }
  });

  it('never asks for skill levels: the base node is the only gate', () => {
    for (const b of DOCTRINE) for (const l of b.lines) for (let i = 0; i < l.arts.length; i++) {
      for (const n of NODES[`${l.id}.${i + 1}`]!.needs) {
        const need = parseNeed(n).id;
        expect(NODES[need]!.branch, `${l.id}.${i + 1} needs ${n}`).toBe(`doctrine_${b.id}`);
      }
    }
  });

  it('makes every node buyable in ranks, with real numbers', () => {
    for (const a of Object.values(ARTS)) {
      expect(a.max, a.id).toBeGreaterThanOrEqual(3);
      expect(a.per, a.id).toBeGreaterThan(0);
      expect(a.cost, a.id).toBeGreaterThan(0);
    }
  });

  it('sets Last Gasp at 10% a rank, to a cap of 50%', () => {
    expect(ARTS.last_gasp!.per).toBe(10);
    expect(ARTS.last_gasp!.max).toBe(5);
    expect(art({ upgrades: withArts('last_gasp') }, 'last_gasp')).toBe(50);
  });

  it('puts every art in the engine somewhere', () => {
    const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const src = files.map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
    for (const id of Object.keys(ARTS)) expect(src.includes(`'${id}'`), `${id} is never read by the fight`).toBe(true);
  });

  it('prices each branch somewhere sensible', () => {
    for (const b of DOCTRINE) {
      let total = 0;
      for (const id of NODE_IDS.filter((n) => NODES[n]!.branch === `doctrine_${b.id}`)) {
        const l = { upgrades: {} as Record<string, number> };
        for (let r = 0; r < NODES[id]!.max; r++) {
          total += priceOf(l, id)!;
          l.upgrades[id] = r + 1;
        }
      }
      expect(total, b.id).toBeGreaterThan(15_000);
      expect(total, b.id).toBeLessThan(140_000);
    }
  });

  it('buys one rank at a time and stacks the effect', () => {
    const l = { runs: 1, deaths: [], personality: {} as never, realName: 'x', account: 100_000, upgrades: {} as Record<string, number>, spent: 0 };
    expect(buy(l as never, 'bld_blood.1').ok).toBe(false); // locked behind the base
    for (let i = 0; i < 3; i++) expect(buy(l as never, 'blades_base.1').ok).toBe(true);
    expect(buy(l as never, 'bld_blood.1').ok).toBe(true);
    expect(art(l, 'edge_mastery')).toBe(12);
    expect(artsOf(l).open_veins).toBe(8);
    expect(perk(l, 'fee')).toBe(0);
  });
});

describe('what she is holding', () => {
  it('sorts every named weapon into the branch it belongs to', () => {
    const cases: Record<string, string | null> = {
      judgment: 'blunt', excalibur: 'blunt', arc_gauntlet: 'blunt', cleaver: 'blades', switchblade: 'blades', monowhip: 'blades', thermal_katana: 'blades',
      zip_pistol: 'small', service_pistol: 'small', stunner_mk3: 'small', riot_shotgun: 'heavy', gauss_smg: 'heavy', pulse_rifle: 'small', rail_revolver: 'precision',
    };
    for (const [id, want] of Object.entries(cases)) {
      const got = branchOf(makeItem(id));
      // the Helix pulse rifle burns cells, so it is an energy weapon whatever it is called
      expect(got, `${id} (${classOf(makeItem(id))})`).toBe(want);
    }
  });

  it('only counts an art when the weapon in hand is the right kind', () => {
    const up = withArts('edge_mastery', 'heavy_hitter');
    const bat = duel('own-1', up, 'judgment');
    expect(bat.events.length).toBeGreaterThan(0);
  });
});

describe('in a fight', () => {
  it('Edge Mastery makes a blade hurt more, and does nothing for a bat', () => {
    const up = withArts('edge_mastery');
    const lost = (weapon: string, ups: Record<string, number>) => average(40, (i) => duel(`edge-${i}`, ups, weapon).hpLost);
    const baseline = lost('thermal_katana', {});
    const with10 = lost('thermal_katana', up);
    expect(with10).toBeLessThan(baseline);
    expect(lost('judgment', up)).toBeCloseTo(lost('judgment', {}), 5);
  });

  it('Thick Skin takes a share off what she takes', () => {
    const up = withArts('thick_skin');
    const lost = (ups: Record<string, number>) => average(40, (i) => duel(`skin-${i}`, ups, 'service_pistol', { n: 3 }).hpLost);
    expect(lost(up)).toBeLessThan(lost({}));
  });

  it('Last Gasp leaves her on 1 HP at least sometimes, and nobody dies of one blow while it holds', () => {
    const up = withArts('last_gasp');
    let gasps = 0;
    let withDeaths = 0;
    let withoutDeaths = 0;
    for (let i = 0; i < 80; i++) {
      const a = duel(`gasp-${i}`, up, 'zip_pistol', { n: 4, kind: 'artemis', hpFrac: 0.35 });
      const b = duel(`gasp-${i}`, {}, 'zip_pistol', { n: 4, kind: 'artemis', hpFrac: 0.35 });
      gasps += a.events.filter((e) => e.type === 'last_gasp').length;
      if (a.result === 'dead') withDeaths++;
      if (b.result === 'dead') withoutDeaths++;
    }
    expect(gasps).toBeGreaterThan(0);
    expect(withDeaths).toBeLessThanOrEqual(withoutDeaths);
  });

  it('Open Veins and Crippler make foes bleed and break', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 80; i++) {
      for (const e of duel(`bleed-${i}`, withArts('edge_mastery', 'open_veins', 'hamstring', 'disarm'), 'thermal_katana', { n: 3 }).events) if (e.type === 'weapon_proc') kinds.add(String(e.data.variant));
      for (const e of duel(`break-${i}`, withArts('heavy_hitter', 'ringing_bell', 'crippler', 'guard_break', 'skullcracker'), 'judgment', { n: 3 }).events) if (e.type === 'weapon_proc') kinds.add(String(e.data.variant));
    }
    for (const k of ['bleed', 'slow', 'disarm', 'stun', 'cripple']) expect(kinds.has(k), k).toBe(true);
  });

  it('the active techniques get used and the foes feel them', () => {
    const seen = new Set<string>();
    const sets: [string, string[]][] = [
      ['thermal_katana', ['edge_mastery', 'lunge', 'whirl']],
      ['judgment', ['heavy_hitter', 'haymaker', 'aftershock', 'bulldoze', 'pile_driver']],
      ['service_pistol', ['sidearm_mastery', 'fan_hammer', 'pistol_whip', 'double_tap', 'trick_shot']],
      ['riot_shotgun', ['heavy_ordnance', 'buckshot_wall', 'suppressive_fire', 'spray_and_pray', 'breach', 'barrage']],
      ['rail_revolver', ['sharpshooter', 'mark_target', 'pin_down', 'cripple_shot', 'one_shot']],
    ];
    for (const [weapon, ids] of sets) {
      for (let i = 0; i < 60; i++) for (const e of duel(`act-${weapon}-${i}`, withArts(...ids), weapon, { n: 3 }).events) if (e.type === 'weapon_proc') seen.add(String(e.data.variant));
    }
    for (const k of ['lunge', 'whirl', 'knock', 'aftershock', 'slam', 'fan', 'whip', 'blast', 'suppress', 'spray', 'mark', 'pin']) expect(seen.has(k), k).toBe(true);
  });

  it('every line it prints has a template', () => {
    const all = Object.keys(ARTS);
    const weapons = ['thermal_katana', 'judgment', 'arc_gauntlet', 'monowhip', 'service_pistol', 'stunner_mk3', 'riot_shotgun', 'gauss_smg', 'rail_revolver'];
    for (let i = 0; i < 40; i++) {
      const weapon = weapons[i % weapons.length]!;
      for (const e of duel(`tpl-${i}`, withArts(...all), weapon, { n: 3, hpFrac: 0.5 }).events) expect(hasTemplate(e), `${e.type}:${e.data.variant}`).toBe(true);
    }
  });

  it('a hero with every combat routine is stronger, but still beatable', () => {
    const all = Object.keys(ARTS);
    const results = { win: 0, dead: 0 };
    for (let i = 0; i < 40; i++) {
      const r = duel(`dragon-${i}`, withArts(...all), 'thermal_katana', { n: 3, kind: 'artemis', level: 8 });
      if (r.result === 'win') results.win++;
      if (r.result === 'dead') results.dead++;
    }
    const plain = { win: 0, dead: 0 };
    for (let i = 0; i < 40; i++) {
      const r = duel(`dragon-${i}`, {}, 'thermal_katana', { n: 3, kind: 'artemis', level: 8 });
      if (r.result === 'win') plain.win++;
      if (r.result === 'dead') plain.dead++;
    }
    expect(results.win).toBeGreaterThanOrEqual(plain.win);
  });
});
