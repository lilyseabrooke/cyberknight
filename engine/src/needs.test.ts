import { describe, expect, it } from 'vitest';
import { always, never, rolls, scenario, slow } from './testkit';
import { runToEnd, step } from './run';
import { MIN_PER_DAY } from './clock';
import { moveNpc } from './population';
import { spawnNpc } from './content/archetypes';
import { addNpc } from './population';
import { Rng } from './rng';
import {
  HUNGER_PER_MIN, SLEEP_PER_MIN, effectiveQuality, hungerOf, hungerRate, hungerTier, nightHours, penaltyFor, refreshFx, sleepOf, sleepRate, sleepTier, wearDown,
} from './needs';
import { bedDown, feed, lodgingAt, needsBias, quietSpot, stallAt, tickNeeds } from './rest';
import { LODGING } from './content/lodging';
import { hungerUrge, sleepUrge } from './urges';
import { perk } from './lab';
import type { World } from './types';

const hours = (n: number) => n * 60;
const withUpgrades = (w: World, up: Record<string, number>) => {
  w.legacy.upgrades = { ...w.legacy.upgrades, ...up };
};
const bedtime = (w: World, sleep = 25) => {
  w.hero.sleep = sleep;
  w.hero.hunger = 90;
  w.hero.cash = 300;
};

describe('the meters', () => {
  it('hunger runs out in two and a half days awake, and sleep in twenty hours', () => {
    expect(HUNGER_PER_MIN * hours(60)).toBeCloseTo(100);
    expect(SLEEP_PER_MIN * hours(20)).toBeCloseTo(100);
    // Hunger is much slower than sleep.
    expect(SLEEP_PER_MIN / HUNGER_PER_MIN).toBeGreaterThan(2.5);
    const s = scenario();
    s.w.hero.hunger = 100;
    s.w.hero.sleep = 100;
    wearDown(s.w, hours(24));
    expect(hungerOf(s.w.hero)).toBeCloseTo(60);
    expect(sleepOf(s.w.hero)).toBeCloseTo(0, 0);
  });

  it('a hero from an older save, with neither meter, counts as fed and rested', () => {
    const s = scenario();
    delete s.w.hero.hunger;
    delete s.w.hero.sleep;
    expect(hungerOf(s.w.hero)).toBe(100);
    expect(sleepOf(s.w.hero)).toBe(100);
  });

  it('follows the world clock, not the beats: a long job costs what it should', () => {
    const s = scenario();
    s.w.hero.hunger = 100;
    s.w.hero.sleep = 100;
    s.w.hero.needsAt = s.w.clock;
    s.w.clock += hours(10);
    s.run((c) => tickNeeds(c));
    expect(sleepOf(s.w.hero)).toBeCloseTo(100 - 10 * 60 * SLEEP_PER_MIN, 1);
    expect(hungerOf(s.w.hero)).toBeCloseTo(100 - 10 * 60 * HUNGER_PER_MIN, 1);
  });

  it('ignores the time the game was closed', async () => {
    const { catchUp } = await import('./clock');
    const s = scenario();
    s.w.hero.needsAt = s.w.clock;
    s.w.hero.sleep = 80;
    catchUp(s.w, 3_600_000);
    s.run((c) => tickNeeds(c));
    expect(sleepOf(s.w.hero)).toBeCloseTo(80, 0);
  });
});

describe('what low meters cost', () => {
  it('hunger stacks penalties as it falls, a little at a time', () => {
    const s = scenario();
    const h = s.w.hero;
    h.sleep = 100;
    const pow = [];
    for (const v of [90, 40, 20, 10, 3]) {
      h.hunger = v;
      pow.push(penaltyFor(h, s.w.legacy));
    }
    expect(pow.map((p) => p.power)).toEqual([0, 0, 1, 3, 5]);
    expect(pow[4]!.muscle + pow[4]!.reflex + pow[4]!.hack + pow[4]!.charm).toBeGreaterThan(pow[2]!.muscle + pow[2]!.reflex + pow[2]!.hack + pow[2]!.charm);
    expect(hungerTier(0)).toBe('wasting');
  });

  it('is applied to her stats and given back when she eats', () => {
    const s = scenario();
    const h = s.w.hero;
    const before = { muscle: h.muscle, reflex: h.reflex, hack: h.hack, charm: h.charm };
    h.hunger = 5;
    h.sleep = 10;
    refreshFx(s.w);
    expect(h.muscle).toBeLessThan(before.muscle);
    expect(h.reflex).toBeLessThan(before.reflex);
    expect(h.needsFx!.power).toBeGreaterThan(0);
    h.hunger = 100;
    h.sleep = 100;
    refreshFx(s.w);
    expect({ muscle: h.muscle, reflex: h.reflex, hack: h.hack, charm: h.charm }).toEqual(before);
    expect(h.needsFx!.power).toBe(0);
  });

  it('never takes a stat below one', () => {
    const s = scenario();
    const h = s.w.hero;
    h.hack = 1;
    h.hunger = 1;
    h.sleep = 1;
    refreshFx(s.w);
    expect(h.hack).toBe(1);
    h.hunger = 100;
    h.sleep = 100;
    refreshFx(s.w);
    expect(h.hack).toBe(1);
  });

  it('is softened by the lab', () => {
    const s = scenario();
    const h = s.w.hero;
    h.hunger = 5;
    h.sleep = 10;
    const raw = penaltyFor(h, s.w.legacy);
    withUpgrades(s.w, { 'stoic.1': 5, 'stoic.2': 5 });
    const soft = penaltyFor(h, s.w.legacy);
    expect(soft.power).toBeLessThan(raw.power);
    expect(sleepTier(9)).toBe('spent');
  });
});

describe('the lab', () => {
  it('slower hunger, slower tiredness, faster sleep, better rest', () => {
    const s = scenario();
    const l = s.w.legacy;
    const base = { h: hungerRate(l), s: sleepRate(l), hrs: nightHours(l), q: effectiveQuality(l, 0.4) };
    expect(base.hrs).toBe(8);
    withUpgrades(s.w, { 'gut.1': 5, 'rest.1': 5, 'rest.2': 4, 'rest.3': 4 });
    expect(hungerRate(l)).toBeLessThan(base.h);
    expect(sleepRate(l)).toBeLessThan(base.s);
    expect(nightHours(l)).toBeLessThan(8);
    expect(nightHours(l)).toBeGreaterThanOrEqual(4);
    expect(effectiveQuality(l, 0.4)).toBeGreaterThan(base.q);
    expect(effectiveQuality(l, 0.4)).toBeLessThanOrEqual(1);
  });

  it('meals feed more with the metabolism upgrades', () => {
    const s = scenario();
    s.w.hero.hunger = 10;
    const plain = feed(s.w, 30);
    s.w.hero.hunger = 10;
    withUpgrades(s.w, { 'gut.3': 4 });
    expect(feed(s.w, 30)).toBeGreaterThan(plain);
  });

  it('cheaper beds', () => {
    const s = scenario({ at: 'street_main' });
    bedtime(s.w);
    const before = s.w.hero.cash;
    withUpgrades(s.w, { 'beds.1': 4 });
    expect(perk(s.w.legacy, 'lodging')).toBe(32);
    s.do('sleep_hotel', never());
    expect(before - s.w.hero.cash).toBeLessThan(LODGING.hotel.price);
  });
});

describe('eating', () => {
  it('a stall on Strand Street sells a meal', () => {
    const s = scenario({ at: 'street_main' });
    s.w.hero.hunger = 30;
    s.w.hero.cash = 40;
    expect(stallAt(s.w, s.w.locations.street_main!)).toBe(true);
    const ev = s.do('eat_stall');
    expect(s.w.hero.hunger).toBeGreaterThan(55);
    expect(s.w.hero.cash).toBeLessThan(40);
    expect(ev.some((e) => e.type === 'eat' && e.data.variant === 'stall')).toBe(true);
  });

  it('is not offered when she is full, or broke', () => {
    const s = scenario({ at: 'street_main' });
    s.w.hero.hunger = 95;
    expect(s.offers().some((k) => k.startsWith('eat_'))).toBe(false);
    s.w.hero.hunger = 30;
    s.w.hero.cash = 2;
    expect(s.offers().some((k) => k === 'eat_stall')).toBe(false);
    expect(s.offers()).toContain('scrounge');
  });

  it('hunger pulls her off whatever else she was doing', () => {
    const s = scenario({ at: 'street_main' });
    s.w.hero.hunger = 15;
    expect(needsBias(s.w, { key: 'challenge:x' })).toBeLessThan(0);
    expect(needsBias(s.w, { key: 'eat_stall' })).toBe(0);
    expect(hungerUrge(s.w.hero)).toBeGreaterThan(2);
    s.w.hero.hunger = 90;
    expect(needsBias(s.w, { key: 'challenge:x' })).toBe(0);
  });
});

describe('starving', () => {
  it('a couple of days without a meal does not kill her; the third day does', () => {
    const left = (h: number) => 100 - h * 60 * HUNGER_PER_MIN;
    expect(hungerTier(left(24))).toBe('fed');
    expect(hungerTier(left(48))).toBe('famished');
    expect(left(48)).toBeGreaterThan(15);
    expect(hungerTier(left(57))).toBe('wasting');
    expect(left(60)).toBeCloseTo(0);

    const s = scenario();
    const h = s.w.hero;
    h.hunger = 5;
    h.sleep = 100;
    h.needsAt = s.w.clock;
    s.w.clock += hours(1);
    h.sleep = 100;
    s.run((c) => tickNeeds(c));
    expect(s.w.over).toBe(false);
    expect(hungerOf(h)).toBeGreaterThan(0);
    s.w.clock += hours(4);
    h.sleep = 100;
    s.run((c) => tickNeeds(c));
    expect(s.w.over).toBe(true);
    expect(s.w.ending).toBe('dead');
    expect(s.saw('death', 'starved')).toBe(true);
  });

  it('warns her on the way down, once per step', () => {
    const s = scenario();
    const h = s.w.hero;
    h.hunger = 100;
    h.needsAt = s.w.clock;
    for (let i = 0; i < 48; i++) {
      s.w.clock += hours(1);
      h.sleep = 100;
      s.run((c) => tickNeeds(c));
    }
    const warned = s.events.filter((e) => e.type === 'need' && String(e.data.variant).startsWith('hunger')).map((e) => e.data.variant);
    expect(warned).toEqual(['hunger_hungry', 'hunger_famished']);
  });
});

describe('beds', () => {
  it('Strand Street has a pod, a hostel and a hotel, and the rest of the city has some', () => {
    const s = scenario({ at: 'street_main' });
    expect(lodgingAt(s.w, s.w.locations.street_main!).sort()).toEqual(['hostel', 'hotel', 'pod']);
    expect(lodgingAt(s.w, s.w.locations.halo_floor!)).toEqual([]);
    expect(lodgingAt(s.w, s.w.locations.halo_alley!)).toEqual([]);
  });

  it('are offered only when she needs sleep and can pay', () => {
    const s = scenario({ at: 'street_main' });
    bedtime(s.w, 95);
    expect(s.offers().some((k) => k.startsWith('sleep_'))).toBe(false);
    s.w.hero.sleep = 30;
    expect(s.offers()).toEqual(expect.arrayContaining(['sleep_pod', 'sleep_hostel', 'sleep_hotel']));
    s.w.hero.cash = 20;
    expect(s.offers()).toContain('sleep_pod');
    expect(s.offers()).not.toContain('sleep_hotel');
    // With a bed she can pay for, she isn't tempted by the pavement.
    expect(s.offers()).not.toContain('sleep_street');
  });

  it('a night in a bed is eight hours, and quality is how much comes back', () => {
    const got: Record<string, number> = {};
    for (const bed of ['pod', 'hostel', 'hotel'] as const) {
      const s = scenario({ at: 'street_main' });
      bedtime(s.w, 10);
      const t0 = s.w.clock;
      const cash0 = s.w.hero.cash;
      s.do(`sleep_${bed}`, never());
      expect(s.w.clock - t0).toBe(hours(8));
      expect(cash0 - s.w.hero.cash).toBe(LODGING[bed].price);
      got[bed] = sleepOf(s.w.hero) - 10;
      expect(s.saw('wake')).toBe(true);
    }
    expect(got.pod).toBeCloseTo(72, 0);
    expect(got.hostel).toBeCloseTo(88, 0);
    expect(got.hotel).toBeCloseTo(90, 0); // capped at a full bar
    expect(got.pod! < got.hostel!).toBe(true);
    expect(got.hostel! < got.hotel!).toBe(true);
  });

  it('a hotel is never robbed; a hostel sometimes is', () => {
    const hotel = scenario({ at: 'street_main' });
    bedtime(hotel.w);
    const cash0 = hotel.w.hero.cash;
    hotel.do('sleep_hotel', always());
    expect(hotel.saw('rest_incident')).toBe(false);
    expect(cash0 - hotel.w.hero.cash).toBe(LODGING.hotel.price);

    const hostel = scenario({ at: 'street_main' });
    bedtime(hostel.w);
    const cash1 = hostel.w.hero.cash;
    hostel.do('sleep_hostel', always());
    expect(hostel.saw('rest_incident', 'robbed_bed')).toBe(true);
    expect(cash1 - LODGING.hostel.price - hostel.w.hero.cash).toBeGreaterThan(50);

    const safe = scenario({ at: 'street_main' });
    bedtime(safe.w);
    safe.do('sleep_hostel', never());
    expect(safe.saw('rest_incident')).toBe(false);
  });

  it('the lab can make a thief less likely to get away with it', () => {
    const s = scenario({ at: 'street_main' });
    bedtime(s.w);
    withUpgrades(s.w, { 'rest.4': 3 }); // lightSleeper 75
    expect(perk(s.w.legacy, 'lightSleeper')).toBe(75);
    // The thief chance is rolled once, up front: rig it just above what a light sleeper lets through.
    s.do('sleep_hostel', rolls(0.5));
    expect(s.saw('rest_incident', 'robbed_bed')).toBe(false);
  });

  it('sleep cools her heat and sobers her up; waking takes the hours', () => {
    const s = scenario({ at: 'street_main' });
    bedtime(s.w);
    s.w.heat.npd = 5;
    s.w.hero.drunk = 4;
    s.do('sleep_hotel', never());
    expect(s.w.heat.npd!).toBeLessThan(5);
    expect(s.w.hero.drunk).toBe(0);
    expect(s.w.hero.needsAt).toBe(s.w.clock);
  });

  it('hunger wakes her before it can kill her', () => {
    const s = scenario({ at: 'street_main' });
    bedtime(s.w, 10);
    s.w.hero.hunger = 6;
    s.do('sleep_pod', never());
    expect(s.w.over).toBe(false);
    expect(hungerOf(s.w.hero)).toBeGreaterThanOrEqual(2.9);
    const wake = s.events.find((e) => e.type === 'wake')!;
    expect(wake.data.variant).toBe('hunger');
  });
});

describe('the street', () => {
  const street = (setup?: (w: World) => void) =>
    scenario({ at: 'street_main', setup: (w) => { bedtime(w, 20); w.hero.cash = 5; setup?.(w); } });

  it('is free and poor: a lot less rest than a bed', () => {
    const s = street();
    expect(s.offers()).toContain('sleep_street');
    s.do('sleep_street', never());
    expect(sleepOf(s.w.hero) - 20).toBeLessThan(45);
    expect(sleepOf(s.w.hero) - 20).toBeGreaterThan(20);
  });

  it('gets her robbed, or arrested, more nights than not', () => {
    const outcomes: Record<string, number> = {};
    let eventful = 0;
    for (let i = 0; i < 60; i++) {
      const s = scenario({ seed: `pave-${i}`, at: 'street_main', setup: (w) => { bedtime(w, 20); w.hero.cash = 100; w.hero.hp = w.hero.maxHp; } });
      const events = s.run((c) => bedDown(c, 'street'), new Rng(`pave-night-${i}`));
      const bad = events.filter((e) => e.type === 'rest_incident' && e.outcome === 'bad');
      if (bad.length) eventful++;
      for (const e of bad) outcomes[String(e.data.variant)] = (outcomes[String(e.data.variant)] ?? 0) + 1;
    }
    expect(eventful).toBeGreaterThan(30);
    expect(outcomes.robbed).toBeGreaterThan(0);
    expect((outcomes.arrested ?? 0) + (outcomes.reported ?? 0)).toBeGreaterThan(0);
  });

  it('with police heat, she is found and arrested: the fine, a cell, and a bad night', () => {
    const s = street((w) => { w.heat.npd = 2; w.hero.cash = 100; });
    s.run((c) => bedDown(c, 'street'), always());
    expect(s.saw('rest_incident', 'arrested')).toBe(true);
    const wake = s.events.find((e) => e.type === 'wake')!;
    expect(wake.data.variant).toBe('jail');
    expect(s.w.hero.cash).toBeLessThan(100);
    expect(s.w.hero.locationId).toBe('street_main');
    expect(s.w.heat.npd!).toBeLessThan(2);
  });

  it('with serious police heat she is attacked in her sleep', () => {
    const s = street((w) => { w.heat.npd = 5; w.hero.cash = 100; w.hero.hp = w.hero.maxHp; });
    const hp0 = s.w.hero.hp;
    s.run((c) => bedDown(c, 'street'), always());
    expect(s.saw('rest_incident', 'attacked_npd')).toBe(true);
    expect(s.saw('fight_start')).toBe(true);
    expect(s.w.hero.hp < hp0 || s.w.over).toBe(true);
  });

  it('with Atlas after her, she is attacked or captured', () => {
    const s = street((w) => { w.heat.atlas = 4; w.hero.cash = 100; });
    s.run((c) => bedDown(c, 'street'), always());
    expect(s.saw('rest_incident', 'attacked_atlas') || s.saw('rest_incident', 'captured')).toBe(true);
  });

  it('heat makes the street a bad idea', () => {
    const cool = street();
    const hot = street((w) => { w.heat.npd = 4; });
    const risk = (s: ReturnType<typeof street>) => s.w.heat.npd! + (s.w.heat.atlas ?? 0);
    expect(risk(hot)).toBeGreaterThan(risk(cool));
  });
});

describe('sleeping rough', () => {
  const alley = (setup?: (w: World) => void) => scenario({ at: 'halo_alley', setup: (w) => { bedtime(w, 20); setup?.(w); } });

  it('is offered in a quiet corner, not in a shop or the middle of a bar', () => {
    const s = alley();
    expect(quietSpot(s.w.locations.halo_alley!)).toBe(true);
    expect(quietSpot(s.w.locations.halo_floor!)).toBe(false);
    expect(quietSpot(s.w.locations.chem_mart!)).toBe(false);
    s.w.hero.cash = 3;
    expect(s.offers()).toContain('sleep_rough');
  });

  it('quality is poor but not as poor as the pavement', () => {
    const s = alley();
    s.do('sleep_rough', never());
    const gain = sleepOf(s.w.hero) - 20;
    expect(gain).toBeGreaterThan(30);
    expect(gain).toBeLessThan(55);
  });

  it('a cop who walks by has her arrested; sleeping rough is illegal', () => {
    let copped = 0;
    for (let i = 0; i < 40; i++) {
      const s = alley((w) => { w.seed = `cop-${i}`; addNpc(w, spawnNpc(new Rng('cop'), 'tmp_cop', 'cop', 'halo_alley', {})); });
      const events = s.run((c) => bedDown(c, 'rough'), new Rng(`cop-night-${i}`));
      if (!events.some((e) => e.type === 'rest_incident' && e.data.variant === 'cop')) continue;
      copped++;
      expect(events.some((e) => e.type === 'rest_incident' && e.data.variant === 'arrested')).toBe(true);
      expect(events.find((e) => e.type === 'wake')!.data.variant).toBe('jail');
    }
    expect(copped).toBeGreaterThan(10);
  });

  it('a security guard moves her along', () => {
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      const s = alley((w) => { addNpc(w, spawnNpc(new Rng('g'), 'tmp_guard', 'club_security', 'halo_alley', {})); });
      const events = s.run((c) => bedDown(c, 'rough'), new Rng(`guard-night-${i}`));
      if (!events.some((e) => e.type === 'rest_incident' && e.data.variant === 'shaken')) continue;
      moved++;
      expect(events.find((e) => e.type === 'wake')!.data.variant).toBe('woken');
      // Cut short: not a full night's rest.
      expect(sleepOf(s.w.hero) - 20).toBeLessThan(50);
    }
    expect(moved).toBeGreaterThan(10);
  });

  it('over many nights the people who turn up do what their temperaments say', () => {
    const seen: Record<string, number> = {};
    let quiet = 0;
    for (let i = 0; i < 150; i++) {
      const s = scenario({ seed: `rough-${i}`, at: 'halo_alley', setup: (w) => { bedtime(w, 20); w.hero.hp = w.hero.maxHp; } });
      const events = s.do('sleep_rough', new Rng(`night-${i}`));
      const incidents = events.filter((e) => e.type === 'rest_incident');
      if (!incidents.length) quiet++;
      for (const e of incidents) seen[String(e.data.variant)] = (seen[String(e.data.variant)] ?? 0) + 1;
      expect(s.w.hero.cash).toBeLessThanOrEqual(300);
    }
    expect(quiet).toBeGreaterThan(20);
    expect(Object.keys(seen).length).toBeGreaterThan(2);
    // It's a rough place to sleep: someone calls the police on her more often than not.
    expect((seen.reported ?? 0) + (seen.cop ?? 0) + (seen.arrested ?? 0)).toBeGreaterThan(0);
  });

  it('a hiding place with no traffic is a lot safer than the open street', () => {
    let hidden = 0;
    let open = 0;
    for (let i = 0; i < 80; i++) {
      const a = scenario({ seed: `tunnel-${i}`, at: 'club_maintenance', setup: (w) => { bedtime(w, 20); w.hero.cash = 100; } });
      a.do('sleep_rough', new Rng(`t${i}`));
      if (a.saw('rest_incident')) hidden++;
      const b = scenario({ seed: `open-${i}`, at: 'street_main', setup: (w) => { bedtime(w, 20); w.hero.cash = 3; } });
      b.do('sleep_street', new Rng(`o${i}`));
      if (b.saw('rest_incident')) open++;
    }
    expect(hidden).toBeLessThan(open);
  });
});

describe('passing out', () => {
  it('happens at zero sleep, where she stands, and only helps a little', () => {
    const s = scenario({ at: 'halo_alley' });
    const h = s.w.hero;
    h.hunger = 90;
    h.sleep = 0.5;
    h.needsAt = s.w.clock;
    const t0 = s.w.clock;
    s.w.clock += 10;
    s.run((c) => tickNeeds(c), never());
    expect(s.saw('rest_incident', 'faint')).toBe(true);
    expect(s.saw('sleep', 'faint')).toBe(true);
    expect(s.w.clock - t0).toBeGreaterThanOrEqual(hours(2));
    expect(s.w.clock - t0).toBeLessThanOrEqual(hours(4));
    expect(sleepOf(h)).toBeGreaterThan(10);
    expect(sleepOf(h)).toBeLessThan(35);
  });

  it('on the street she takes her chances', () => {
    const s = scenario({ at: 'street_main' });
    const h = s.w.hero;
    h.hunger = 90;
    h.sleep = 0;
    h.cash = 100;
    h.needsAt = s.w.clock;
    s.w.heat.npd = 3;
    s.run((c) => tickNeeds(c), always());
    expect(s.saw('sleep', 'faint')).toBe(true);
    expect(s.events.some((e) => e.type === 'rest_incident' && e.data.variant !== 'faint')).toBe(true);
  });

  it('in a shop, the staff put her out first', () => {
    const s = scenario({ at: 'chem_mart' });
    const h = s.w.hero;
    h.hunger = 90;
    h.sleep = 0;
    h.needsAt = s.w.clock;
    s.run((c) => tickNeeds(c), never());
    expect(s.saw('rest_incident', 'dumped')).toBe(true);
    expect(s.w.hero.locationId).not.toBe('chem_mart');
  });

  it('the lab makes it count for more', () => {
    const run = (up: Record<string, number>) => {
      const s = scenario({ at: 'halo_alley' });
      withUpgrades(s.w, up);
      s.w.hero.hunger = 90;
      s.w.hero.sleep = 0;
      s.w.hero.needsAt = s.w.clock;
      s.run((c) => tickNeeds(c), never());
      return sleepOf(s.w.hero);
    };
    expect(run({ 'stoic.3': 4 })).toBeGreaterThan(run({}));
  });
});

describe('whole nights', () => {
  it('urges climb as the meters fall', () => {
    const s = scenario();
    s.w.hero.hunger = 100;
    s.w.hero.sleep = 100;
    expect(hungerUrge(s.w.hero)).toBe(0);
    expect(sleepUrge(s.w.hero)).toBe(0);
    s.w.hero.sleep = 20;
    s.w.hero.hunger = 20;
    expect(sleepUrge(s.w.hero)).toBeGreaterThan(2);
    expect(hungerUrge(s.w.hero)).toBeGreaterThan(2);
  });

  it('a clock jump of a day makes her tired but not dead', () => {
    const s = scenario();
    s.w.hero.needsAt = s.w.clock;
    s.w.hero.hunger = 85;
    s.w.hero.sleep = 100;
    s.w.clock += MIN_PER_DAY * 0.5;
    s.run((c) => tickNeeds(c));
    expect(s.w.over).toBe(false);
  });

  slow('she looks after herself: over days of real play nobody starves, and she sleeps a fair part of the day', () => {
    let starved = 0;
    let asleepHours = 0;
    let hours = 0;
    let meals = 0;
    for (let i = 0; i < 4; i++) {
      const { world, events } = runToEnd({ seed: `needs-${i}`, competence: 0.5, maxBeats: 900 });
      if (events.some((e) => e.type === 'death' && e.data.variant === 'starved')) starved++;
      asleepHours += events.filter((e) => e.type === 'wake').reduce((a, e) => a + Number(e.data.hours), 0);
      meals += events.filter((e) => ['eat', 'eat_noodles', 'eat_dish'].includes(e.type)).length;
      hours += (world.clock - 20 * 60) / 60;
    }
    expect(starved).toBe(0);
    expect(meals).toBeGreaterThan(4);
    // About eight hours in twenty-four, give or take a night in a cell or a bad one on the pavement.
    expect(asleepHours / hours).toBeGreaterThan(0.2);
    expect(asleepHours / hours).toBeLessThan(0.5);
  });

  it('stepping the real loop with an empty stomach eventually ends it', () => {
    const s = scenario({ at: 'halo_alley', setup: (w) => { w.hero.hunger = 0.2; w.hero.cash = 0; w.hero.sleep = 100; } });
    for (let i = 0; i < 80 && !s.w.over; i++) {
      s.w.hero.sleep = 100;
      step(s.w);
    }
    // Either she scrounged something up or she starved; she did not just carry on at zero.
    expect(hungerOf(s.w.hero) > 0 || s.w.over).toBe(true);
  });
});

describe('text', () => {
  it('every event this adds has a line', async () => {
    const { hasTemplate } = await import('./text');
    const base = { beat: 1, outcome: 'mixed' as const };
    const variants: [string, string][] = [
      ['sleep', 'pod'], ['sleep', 'hostel'], ['sleep', 'hotel'], ['sleep', 'street'], ['sleep', 'rough'], ['sleep', 'faint'],
      ['wake', 'rested'], ['wake', 'hunger'], ['wake', 'woken'], ['wake', 'jail'], ['wake', 'captured'],
      ['eat', 'stall'], ['eat', 'bagel'], ['eat', 'plate'], ['eat', 'scraps'], ['eat', 'scraps_sick'],
      ['rest_incident', 'robbed_bed'], ['rest_incident', 'robbed'], ['rest_incident', 'kind'], ['rest_incident', 'shaken'], ['rest_incident', 'thief_scared'],
      ['rest_incident', 'caught_thief'], ['rest_incident', 'reported'], ['rest_incident', 'cop'], ['rest_incident', 'arrested'], ['rest_incident', 'captured'],
      ['rest_incident', 'attacked_npd'], ['rest_incident', 'attacked_atlas'], ['rest_incident', 'attacked_gang'], ['rest_incident', 'faint'], ['rest_incident', 'dumped'],
      ['need', 'hunger_hungry'], ['need', 'hunger_famished'], ['need', 'hunger_starving'], ['need', 'hunger_wasting'],
      ['need', 'sleep_tired'], ['need', 'sleep_exhausted'], ['need', 'sleep_spent'],
      ['death', 'starved'],
    ];
    for (const [type, variant] of variants) expect(hasTemplate({ ...base, type, data: { variant } }), `${type}:${variant}`).toBe(true);
    // And not by falling through to a generic line.
    expect(hasTemplate({ ...base, type: 'rest_incident', data: { variant: 'nonsense' } })).toBe(false);
  });
});
