import { capabilityPull } from './affordances';
import type { Candidate } from './candidate';
import { fight } from './combat';
import { dayOf } from './clock';
import { DOORS } from './content/chops';
import { AMMO_RECIPES } from './content/parts';
import { ammoNeeds } from './supply';
import { gunsOwned, shotsLeft } from './arms';
import { npcsAt } from './population';
import { sayAs, runCheckAs, type Check, type Kit, type PlaceView } from './placekit';
import { ammoToMake, craft, craftable, junk, makeAmmo, pawnBench, salvage, salvageAppeal, salvageable, upgrade, upgradable, type Bench } from './bench';
import type { ChopInfo, Ctx, Id, Location, Npc, World } from './types';
import { skillLevel } from './skills';
import type { SkillId } from './skills';

/**
 * The chop shop, as seen from the decision loop. A small place with one thing in it: a workbench (bench.ts). The bench is
 * behind a door, and the door is the fun part. There is a flat day rate, and every other way a person might think of:
 * talk the rate down, bluff past, slip by, pick the back shutter, hack the reader, wave through on a friendship, or
 * put the door down for good. Whichever way she gets in, she has the bench for the day; and with the door down, for as
 * long as nobody takes its place.
 *
 * The pass is a counter on the world (`chopin:<shop>` = the day it is good for), so it needs no field of its own.
 *
 * Keys by pace for the clock and the AI: `chopin` (getting in: a few minutes, and a family of its own so the ways in do
 * not crowd the bench) and `bench` (a job at the bench: most of an evening).
 */

export interface ChopView extends PlaceView {
  info: ChopInfo;
}

const passKey = (main: Location): string => `chopin:${main.id}`;

export function viewAt(w: World, at: Id = w.hero.locationId): ChopView | undefined {
  const loc = w.locations[at];
  const info = loc?.chop;
  if (!loc || !info) return undefined;
  return { loc, main: loc, room: 'floor', features: [], people: npcsAt(w, loc.id), info };
}

/** Whoever keeps the door, if they are up and about. */
export const doorman = (v: ChopView): Npc | undefined => v.people.find((n) => n.tags.includes('guard'));
const owner = (v: ChopView): Npc | undefined => v.people.find((n) => n.tags.includes('owner'));
const isBot = (n: Npc | undefined): boolean => !!n?.tags.includes('robot');

export const hasPass = (w: World, main: Location): boolean => w.counters[passKey(main)] === dayOf(w.clock);
export function grantPass(w: World, main: Location): void {
  w.counters[passKey(main)] = dayOf(w.clock);
}

/** Is there anyone to get past? A door with nobody on it is just a door. */
export const guarded = (w: World, v: ChopView): boolean => !!doorman(v) && !hasPass(w, v.main);

/** The bench she can work at here, if she is in and the door lets her. */
export function chopBench(w: World, loc: Location): Bench | undefined {
  const v = viewAt(w, loc.id);
  if (!v || guarded(w, v)) return undefined;
  return { name: 'the bench', tier: v.info.tier, where: v.main.name };
}

export const benchHere = (w: World): Bench | undefined => {
  const loc = w.locations[w.hero.locationId];
  return loc ? chopBench(w, loc) ?? pawnBench(w, loc) : undefined;
};

// ===================================================================== getting in

const KIT: Kit<ChopView> = {
  event: 'chop',
  name: 'shop',
  fame: 'chop',
  cause: 'a scene at the chop shop',
  messed: 'was messed about by Blackbird at the shop',
  find: (v, who) => (who === 'owner' ? owner(v) : doorman(v)),
  owner,
};

const say = (c: Ctx, id: string, outcome: 'good' | 'bad' | 'mixed', lines: readonly string[], thoughts: readonly string[] | undefined, tok: Record<string, string | number>): void =>
  sayAs('chop', c, id, outcome, lines, thoughts, tok, { place: String(tok.shop), npc: String(tok.npc) });

const tokens = (v: ChopView, g: Npc | undefined): Record<string, string | number> => ({ shop: v.main.name, npc: g?.name ?? 'the door', fee: v.info.fee, what: DOORS[v.info.door]?.label ?? 'the door' });

const letIn = (c: Ctx, v: ChopView): void => grantPass(c.w, v.main);

interface Roll {
  parts: Check['parts'];
  base: number;
  per: number;
  dark?: number;
  train: [SkillId, number][];
  win: string[];
  winThought: string[];
  lose: string[];
  loseThought: string[];
  /** The same lines where a machine is on the door, if the people-version would read wrong. */
  bot?: { win?: string[]; lose?: string[] };
  /** What it costs her when it goes wrong. */
  lost: Partial<Check['lose']>;
  /** What winning does besides getting her in (the haggle pays half the rate). */
  also?: (c: Ctx, v: ChopView) => void;
}

/** A way in that is a roll against her skills, described as data (see placekit.ts). The pass is the win. */
function roll(c: Ctx, v: ChopView, id: string, r0: Roll): void {
  const machine = v.info.door === 'bot';
  // The check's own tokens do not include the day rate, so it is written in before the line is chosen.
  const bake = (xs: string[]): string[] => xs.map((x) => x.replace(/\{fee\}/g, String(v.info.fee)).replace(/\{what\}/g, DOORS[v.info.door]?.label ?? 'the door'));
  const r: Roll = { ...r0, win: bake((machine && r0.bot?.win) || r0.win), lose: bake((machine && r0.bot?.lose) || r0.lose) };
  const check: Check = {
    who: 'guard', parts: r.parts, base: r.base, per: r.per, ...(r.dark ? { dark: r.dark } : {}),
    win: { text: r.win, thought: r.winThought, train: r.train, xp: 2, affinity: 1, apply: (cc, vv) => { r.also?.(cc, vv as ChopView); letIn(cc, vv as ChopView); } },
    lose: { text: r.lose, thought: r.loseThought, xp: 1, train: r.train.map(([k]) => [k, 1] as [string, number]), ...r.lost },
  };
  runCheckAs(KIT, c, v, id, check);
}

interface Way {
  id: string;
  /** The line a skilled eye reads off the door (for tools and the coverage table). */
  sees: string;
  drives: Candidate['drives'];
  needs: Parameters<typeof capabilityPull>[1];
  bonus: number;
  risk?: number;
  /** Only for a person on the door, or only for a machine. */
  door?: 'guard' | 'bot';
  ok?(w: World, v: ChopView, g: Npc): boolean;
  run(c: Ctx, v: ChopView, g: Npc): void;
}

const WAYS: Way[] = [
  {
    id: 'pay', sees: 'A flat day rate on the door and a bench behind it.', drives: {}, needs: ['stat:int', 'skill:tinkering'], bonus: 0.15,
    run: (c, v, g) => {
      const h = c.w.hero;
      if (h.cash < v.info.fee) return;
      h.cash -= v.info.fee;
      letIn(c, v);
      say(c, 'pay', 'good', isBot(g)
        ? ['The {what} scans {fee}nd off Blackbird\'s chip, whirs and rolls its arm out of the way. DAY RATE ACCEPTED, it says, in four tones.']
        : ['{npc} takes {fee}nd, writes nothing down, and tips {their} head at the bench. Blackbird is in.', '{fee}nd goes into a tin that has seen worse. {npc} is already looking at the next customer.', '{npc} holds out a hand. {fee}nd later, the bench is hers for the day.'],
      ['The price of progress is {fee}nd. Fair. Cheap, even.', 'I am a customer. I am basically a regular already.'], tokens(v, g));
    },
  },
  {
    id: 'haggle', door: 'guard', sees: 'A price on a door is the start of a conversation.', drives: { greed: 0.25, curiosity: 0.1 }, needs: ['skill:haggling', 'stat:charm', 'drive:greed'], bonus: 0.15,
    ok: (w, v) => w.hero.cash >= Math.ceil(v.info.fee / 2),
    run: (c, v) => {
      const half = Math.ceil(v.info.fee / 2);
      roll(c, v, 'haggle', {
        parts: ['haggling', ['stat:charm', 0.6]], base: 0.3, per: 0.075, train: [['haggling', 2]],
        win: [`{npc} looks at ${half}nd, then at Blackbird, then at a calendar with nothing on it. "Half. Today." Blackbird is in for ${half}nd.`, `Blackbird tells {npc} a long story that includes the word "regular". {npc} takes ${half}nd to make it stop.`],
        winThought: ['I should be in sales. I would be in sales if I did not have to see people.', 'Half price. That is a victory. A small one. In a tin.'],
        lose: ['{npc} listens to the whole pitch, holds out the tin and says, "Full rate." Blackbird keeps her money.', '"The rate is the rate," says {npc}, in the voice of someone who has said it all week.'],
        loseThought: ['Strong negotiation. We will pretend that went well.'],
        lost: { affinity: -3 },
        also: (cc) => { cc.w.hero.cash -= half; },
      });
    },
  },
  {
    id: 'sneak', sees: 'A guard who is not looking at the side of the building.', drives: { curiosity: 0.2, bravery: 0.2 }, needs: ['skill:sneak', 'stat:reflex', 'drive:bravery'], bonus: 0.2, risk: 0.2,
    run: (c, v) => roll(c, v, 'sneak', {
      parts: ['sneak', ['stat:reflex', 0.5]], base: v.info.traits.includes('cctv') ? 0.15 : 0.27, per: 0.075, dark: 0.1, train: [['sneak', 3]],
      win: ['Blackbird goes in behind a trolley of exhaust pipes while {npc} watches the street. Nobody charges her a thing.', 'She waits until {npc} turns to argue with someone about a receipt, then walks in like she has been coming for years. Nobody stops her.'],
      winThought: ['Free. Smooth. I am the shadow of a shadow.', 'Day rate? In this economy?'],
      bot: {
        win: ['Blackbird goes in behind a trolley of exhaust pipes, in the one arc the {what}\'s sensor does not sweep. Nobody charges her a thing.', '{npc} is busy counting the same four customers. Blackbird is the fifth, and the {what} has not been told about fifths.'],
        lose: ['{npc} swivels, locks on and says "UNREGISTERED" very loudly, twice. A hydraulic arm sets Blackbird back outside the line, firmly. The rate is still {fee}nd.', 'A tray of washers goes over. The {what} turns on its one leg and puts a clamp on her sleeve.'],
      },
      lose: ['{npc} takes Blackbird by the collar, walks her back to the door and puts her down gently, which is somehow worse. The rate is still {fee}nd.', 'A tray of washers goes over. {npc} is on her before they stop rolling.'],
      loseThought: ['That was the plan. For the first part.'],
      lost: { hp: -4, affinity: -8, heat: ['place', 1] },
    }),
  },
  {
    id: 'picklock', sees: 'A back shutter with a padlock and a view of the bench.', drives: { curiosity: 0.2, bravery: 0.1 }, needs: ['skill:lockpicking', 'skill:tinkering', 'stat:int'], bonus: 0.15, risk: 0.2,
    run: (c, v) => roll(c, v, 'picklock', {
      parts: ['lockpicking', ['tinkering', 0.3]], base: 0.25, per: 0.075, train: [['lockpicking', 3]],
      win: ['The padlock on the back shutter lasts nine seconds. Blackbird lifts it a metre and is on the shop floor before {npc} has finished the sentence {they} {is} in.', 'A bent pin, a breath, a click. The back shutter lifts. The bench is on the other side, and so is she.'],
      winThought: ['Locks are just doors that want to be asked.', 'Every door has a back door. This was the back door.'],
      bot: {
        win: ['The padlock on the back shutter lasts nine seconds. The {what} faces the front and has no idea there is a back. Blackbird lifts it a metre and is in.', 'A bent pin, a breath, a click. The back shutter lifts. Nobody told the {what} about shutters.'],
        lose: ['The padlock fights back. The shutter bangs. The {what} rolls round the corner announcing a SECURITY EVENT, and Blackbird has to be somewhere else for a minute.', 'The pick snaps. The noise is huge. A siren starts up inside {npc}.'],
      },
      lose: ['The padlock fights back. The shutter bangs. {npc} comes round the corner with a tire iron and an expression, and Blackbird has to be somewhere else for a minute.', 'The pick snaps. The noise is huge. {npc} is there before the echo.'],
      loseThought: ['That one was a mid-range lock. They never tell you.'],
      lost: { affinity: -6, heat: ['place', 1] },
    }),
  },
  {
    id: 'hack', sees: 'A card reader on the door with a cable running out of the back of it.', drives: { curiosity: 0.35 }, needs: ['skill:tinkering', 'stat:int', 'drive:curiosity'], bonus: 0.2, risk: 0.1,
    run: (c, v, g) => roll(c, v, 'hack', {
      parts: ['tinkering', ['stat:int', 0.6]], base: 0.3, per: 0.07, train: [['tinkering', 3]],
      win: isBot(g)
        ? ['Blackbird opens the {what}\'s side panel and persuades its day-rate counter that today is Tuesday. It rolls its arm out of the way, delighted.', 'Two wires, a thumbnail and a sentence in the dialect of cheap firmware. The {what} approves her without being asked.']
        : ['The card reader takes a thumbnail and a short bad word. The light goes green, {npc} looks up in surprise, and Blackbird walks past holding the idea of a receipt.', 'She swaps two wires behind the reader, and it decides she paid. {npc} checks the tin. The tin agrees.'],
      winThought: ['The door and I came to an understanding.', 'Technically I paid. In spirit. In the reader\'s spirit.'],
      bot: { lose: ['The {what} reads a long string of numbers out loud and does not open. Something in it goes pop. Blackbird\'s fingers go numb. The rate is still {fee}nd.', 'The panel gives her a small, sharp shock. DAY RATE, says the {what}, in a sterner tone.'] },
      lose: ['The reader gives her a small, sharp shock and a long beep. {npc} puts a hand on {their} hip. "Day rate," says {npc}.', 'Something in the reader goes pop. Blackbird\'s fingers go numb. The rate is still {fee}nd.'],
      loseThought: ['That was not an official shock. Probably.'],
      lost: { hp: -4, affinity: -3 },
    }),
  },
  {
    id: 'bluff', door: 'guard', sees: 'A guard who has been told a great many names and believes some of them.', drives: { pride: 0.2, curiosity: 0.15 }, needs: ['skill:grifting', 'stat:charm', 'skill:streetwise'], bonus: 0.15,
    run: (c, v) => roll(c, v, 'bluff', {
      parts: ['grifting', ['stat:charm', 0.6]], base: 0.28, per: 0.075, train: [['grifting', 3]],
      win: ['"Atlas Asset Wellness," says Blackbird, holding up the first card she finds. {npc} steps aside so fast the tin rattles.', 'She tells {npc} she is the new inspector, the old owner, or the old inspector\'s owner. Whichever one works. {npc} lets her in.'],
      winThought: ['The word "audit" works on everyone. Even people with no money.', 'The lie was beautiful. The card was a loyalty card for noodles.'],
      lose: ['{npc} looks at the card, then at her, then holds up the tin. "Nice try. Rate."', '"That is a punch card for noodles," {npc} says. "You have one punch left."'],
      loseThought: ['It was a very good card. In the right context.'],
      lost: { affinity: -4 },
    }),
  },
  {
    id: 'vouch', door: 'guard', sees: 'A guard who has seen her face before and has not minded.', drives: {}, needs: ['stat:charm', 'drive:pride'], bonus: 0.5,
    ok: (_w, _v, g) => g.affinity >= 12,
    run: (c, v, g) => {
      letIn(c, v);
      g.affinity += 1;
      say(c, 'vouch', 'good', ['{npc} sees Blackbird coming, shifts the tin with one boot and steps aside. "Go on in. You\'re all right."', '{npc} nods her through without a word. Nobody gets this. Nobody has asked what it cost.'], ['Respect. In the street, that is a currency.', 'I am regular enough that nobody charges me. That is a promotion.'], tokens(v, g));
    },
  },
  {
    id: 'flatline', sees: 'A guard with a tire iron, a tin and no back-up. The bench is behind them.', drives: { bravery: 0.35, pride: 0.15 }, needs: ['skill:melee', 'stat:muscle', 'drive:bravery', 'skill:marksmanship'], bonus: 0, risk: 0.9,
    run: (c, v, g) => {
      say(c, 'flatline', 'mixed', ['Blackbird looks at the day rate, looks at {npc}, and walks up to the door anyway.'], ['Fee waived. By me.'], tokens(v, g));
      fight(c, [g], { cause: KIT.cause, assault: true });
    },
  },
];

// ===================================================================== what she wants a bench for

/** How much she would like to be at a bench of this tier right now: a number from what she is carrying. */
export function benchWork(w: World, bench: Bench): number {
  const h = w.hero;
  let n = 0;
  const spare = junk(h);
  if (spare.length) n += 0.35 + Math.min(0.35, 0.09 * spare.length);
  const need = ammoNeeds(h)[0];
  if (need && AMMO_RECIPES[need.type]) n += (need.urgency > 0 ? 0.3 : 0) + 0.5 * need.urgency;
  if (craftable(h, bench).length) n += 0.55;
  if (upgradable(h, bench).length) n += 0.45;
  return n;
}

/**
 * A pull toward a chop shop when she has work for a bench and the means to get in (a pass, or the fee, or a way past
 * the door that costs her nothing she will miss). Added to the pull of `go` like the shops and the doc (supply.ts).
 */
export function benchUrge(w: World, to: Id): { bonus: number; smart: number } {
  const v = viewAt(w, to);
  if (!v || w.hero.locationId === to) return { bonus: 0, smart: 0 };
  const work = benchWork(w, { name: 'the bench', tier: v.info.tier, where: v.main.name });
  if (work <= 0) return { bonus: 0, smart: 0 };
  const means = hasPass(w, v.main) || w.hero.cash >= v.info.fee || w.hero.cash >= v.info.fee / 2;
  return means ? { bonus: Math.min(0.9, work * 0.6), smart: Math.min(0.6, work * 0.4) } : { bonus: 0, smart: 0 };
}

export function chopCandidates(w: World): Candidate[] {
  const out: Candidate[] = [];
  const h = w.hero;
  const v = viewAt(w);
  const bench = benchHere(w);

  // ---- the ways in
  if (v && !bench && guarded(w, v)) {
    const g = doorman(v)!;
    // Is there anything she would do in there? If not she walks past the door like anyone else.
    const peek: Bench = { name: 'the bench', tier: v.info.tier, where: v.main.name };
    const work = benchWork(w, peek);
    for (const way of WAYS) {
      if (way.door && way.door !== v.info.door) continue;
      if (way.ok && !way.ok(w, v, g)) continue;
      if (way.id === 'pay' && h.cash < v.info.fee) continue;
      // The free ways are no use to a hero with nothing to do at the bench; the dangerous ones need a reason as well.
      if (work <= 0 && way.id !== 'flatline') continue;
      const bonus = way.id === 'flatline' ? -0.4 + work * 0.15 : way.bonus + work * (way.id === 'pay' ? 1 - Math.min(0.5, v.info.fee / 150) : 0.8);
      out.push({
        key: `chopin:${way.id}`, drives: way.drives, bonus: bonus + capabilityPull(h, way.needs),
        ...(way.risk !== undefined ? { risk: way.risk } : {}),
        run: (c) => {
          const now = viewAt(c.w) ?? v;
          const gg = doorman(now);
          if (!gg) return;
          way.run(c, now, gg);
        },
      });
    }
  }

  // ---- the bench
  if (bench) {
    const pull = capabilityPull(h, ['skill:tinkering', 'stat:int']);
    const lvl = skillLevel(h, 'tinkering');
    const seen = new Set<string>();
    const picks = salvageable(h).filter((it) => !seen.has(it.id) && seen.add(it.id)).sort((a, b) => salvageAppeal(b) - salvageAppeal(a)).slice(0, 4);
    for (const it of picks) {
      out.push({
        key: `bench:salvage:${it.id}`, drives: { curiosity: 0.25, greed: 0.15 }, smart: 0.3, bonus: 0.6 + pull + salvageAppeal(it) - 0.3,
        run: (c) => {
          const b = benchHere(c.w);
          if (b && c.w.hero.inventory.includes(it)) salvage(c, b, it);
        },
      });
    }
    for (const type of ammoToMake(h)) {
      const g = gunsOwned(h).filter((x) => x.ammoType === type);
      const left = Math.min(...g.map((x) => shotsLeft(h, x)));
      const need = ammoNeeds(h).find((n) => n.type === type)?.urgency ?? 0;
      const stock = left < 24 ? 0.3 : -0.3;
      out.push({
        key: `bench:ammo:${type}`, drives: { greed: 0.05 }, smart: 1.4 * need, bonus: 0.2 + need * 1.2 + stock + pull * 0.5,
        run: (c) => {
          const b = benchHere(c.w);
          if (b) makeAmmo(c, b, type);
        },
      });
    }
    for (const r of craftable(h, bench).slice(0, 3)) {
      out.push({
        key: `bench:craft:${r.item}`, drives: { pride: 0.5, bravery: 0.2, curiosity: 0.2 }, smart: 0.5, bonus: 0.7 + pull + (r.skill >= lvl ? 0.2 : 0),
        run: (c) => {
          const b = benchHere(c.w);
          if (b) craft(c, b, r);
        },
      });
    }
    for (const u of upgradable(h, bench)) {
      out.push({
        key: `bench:upgrade:${u.slot}`, drives: { pride: 0.6, bravery: 0.2 }, smart: 0.6, bonus: 0.7 + pull,
        run: (c) => {
          const b = benchHere(c.w);
          if (b) upgrade(c, b, u.slot);
        },
      });
    }
  }
  return out;
}

/** For tools: what a shop of this makeup offers at the door, in order. */
export const describeChop = (info: ChopInfo): string[] => WAYS.filter((x) => !x.door || x.door === info.door).map((x) => x.id);

