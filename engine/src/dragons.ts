import type { Ctx, Npc, World } from './types';
import { fight, heroPower } from './combat';
import { clamp, spawnGroup, type Candidate } from './candidate';
import { scoutSaves, sneakBonus } from './extras';
import { train } from './skills';

const alive = (n: Npc | undefined): n is Npc => !!n && n.alive;

const flightFoes = (w: World): Npc[] => (w.flight?.ids ?? []).map((id) => w.npcs[id]).filter(alive);

/** Dragons that aren't Apollo don't stay put. They fly over, and she gets a few beats to decide who she is. */
export function ambientDragons(c: Ctx): void {
  const { w, rng } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const f = w.flight;

  if (f) {
    if (h.locationId !== f.locationId || w.beat > f.until) {
      for (const id of f.ids) if (w.npcs[id]) w.npcs[id]!.alive = false;
      c.emit('dragon_pass', 'mixed', { variant: f.kind, hidden: f.hidden, left: h.locationId !== f.locationId, count: f.ids.length });
      w.flight = null;
      return;
    }
    const p = (f.kind === 'hera' ? 0.2 : 0.12) - sneakBonus(w) * 0.5;
    if (!f.hidden && !f.noticed && rng.chance(Math.max(0.03, p))) spotted(c);
    return;
  }

  if (!loc.outdoors || loc.id === 'overpass' || w.beat < 12) return;
  if (!w.flags.hera_seen && rng.chance(0.004)) {
    w.flags.hera_seen = true;
    spawnFlight(c, 'hera', 1);
  } else if (rng.chance(0.022)) {
    spawnFlight(c, 'artemis', rng.weighted([1, 2, 3], (n) => (n === 3 ? 0.2 : 0.4)));
  }
}

function spawnFlight(c: Ctx, kind: 'artemis' | 'hera', count: number): void {
  const { w } = c;
  const h = w.hero;
  const loc = w.locations[h.locationId]!;
  const dragons = spawnGroup(c, kind, count);
  w.flight = { kind, ids: dragons.map((d) => d.id), locationId: loc.id, until: w.beat + (kind === 'hera' ? 9 : 7), hidden: false, noticed: false };
  const warned = scoutSaves(c);
  if (warned) w.flight.hidden = true;
  c.emit('dragon_flight', 'mixed', { variant: kind, count, warned, place: loc.name, first: !w.flags[`${kind}_seen_before`] });
  w.flags[`${kind}_seen_before`] = true;
  w.flags.dragon_known = true;
}

function spotted(c: Ctx): void {
  const { w } = c;
  const f = w.flight!;
  f.noticed = true;
  c.emit('dragon_notice', 'bad', { variant: f.kind, count: f.ids.length });
  engage(c);
}

function engage(c: Ctx): void {
  const foes = flightFoes(c.w);
  if (!foes.length) return;
  c.w.flight!.noticed = true;
  fight(c, foes, { cause: c.w.flight!.kind === 'hera' ? 'a Hera Mk. V' : 'an Artemis patrol', joiners: false });
  c.w.flight = null;
}

/** What she can do while dragons are overhead. A clueless Blackbird engages; a competent one reads the odds. */
export function dragonCandidates(w: World): Candidate[] {
  const f = w.flight;
  const h = w.hero;
  if (!f || f.locationId !== h.locationId || f.hidden || f.noticed) return [];
  const foes = flightFoes(w);
  if (!foes.length) return [];
  const hera = f.kind === 'hera';
  const total = foes.reduce((a, n) => a + n.power, 0);
  // A hurt hero is a weaker hero. Competent ones notice.
  const ratio = total / (heroPower(w) * clamp(h.hp / h.maxHp, 0.3, 1));
  const risk = Math.min(4, clamp(ratio - 0.6, 0, 9) * 1.5);
  const out: Candidate[] = [];

  out.push({
    key: 'engage_flight', drives: { bravery: 1.0, pride: 0.8, quest: 0.9 }, bonus: 0.2, risk,
    run: (c) => {
      c.emit('dragon_engage', 'mixed', { variant: f.kind, count: foes.length });
      engage(c);
    },
  });
  out.push({
    key: 'hide_flight', drives: {}, smart: hera ? 2.4 : 1.0, bonus: ratio > 1 ? 0.7 : 0,
    run: (c) => {
      const { w: ww, rng } = c;
      if (rng.chance(clamp(0.55 + sneakBonus(ww) + ww.hero.reflex * 0.03 - (hera ? 0.05 : 0), 0.2, 0.92))) {
        ww.flight!.hidden = true;
        train(c, 'sneak', 2);
        c.emit('dragon_hide', 'good', { variant: 'ok', kind: f.kind });
      } else {
        c.emit('dragon_hide', 'bad', { variant: 'fail', kind: f.kind });
        spotted(c);
      }
    },
  });
  out.push({
    key: 'gawk_flight', drives: { curiosity: 0.8, pride: 0.1 }, risk: hera ? 1.2 : 0.3,
    run: (c) => {
      c.w.flags.dragon_known = true;
      c.emit('dragon_gawk', 'mixed', { variant: f.kind });
      if (c.rng.chance(hera ? 0.35 : 0.15)) spotted(c);
    },
  });
  out.push({
    key: 'film_flight', drives: { pride: 0.9, curiosity: 0.5, greed: 0.3 }, risk: hera ? 1.5 : 0.5,
    run: (c) => {
      c.w.hero.fame += hera ? 8 : 4;
      c.emit('dragon_film', 'good', { variant: f.kind, fame: Math.floor(c.w.hero.fame) });
      if (c.rng.chance(hera ? 0.5 : 0.25)) spotted(c);
    },
  });
  return out;
}
