import type { Candidate } from './candidate';
import type { Trait } from './personality';
import type { Npc, World } from './types';

/**
 * How much each kind of action appeals to each trait, keyed by candidate family (the part of
 * the key before the colon). A loading of 1 means a hero 0.5 above unremarkable on that trait
 * gains 0.5 desire; the drive weights (derived from the same traits) do the broad strokes,
 * this table does the specifics.
 */
const LOADINGS: Record<string, Partial<Record<Trait, number>>> = {
  // girls
  flirt: { impress: 1.6, romantic: 0.5, sociable: 0.4 },
  kiss: { impress: 0.8, romantic: 1.2 },
  pool_date: { impress: 0.7, romantic: 0.8 },
  make_move: { impress: 1.2, romantic: 0.8, thrill: 0.6, mischief: 0.4, drink: 0.3 },
  serve_dish: { impress: 0.6, romantic: 0.8, appetite: 0.4 },
  dance: { impress: 1.0, sociable: 0.4, vanity: 0.3 },
  sing_busk: { fame: 0.8, artistry: 0.8, sociable: 0.4 },
  crash_gig: { fame: 1.0, artistry: 0.6, thrill: 0.8, mischief: 0.6 },
  serenade_girl: { impress: 1.2, romantic: 0.8, artistry: 0.6 },
  guitar_duel: { fame: 0.6, artistry: 0.8, temper: 0.4, vanity: 0.4 },
  backlot_set: { artistry: 0.8, sociable: 0.5, techy: 0.3 },
  beat_battle: { fame: 0.6, artistry: 0.8, sociable: 0.4, temper: 0.3 },
  seduce_clerk: { impress: 1.0, mischief: 0.5, romantic: -0.8 },
  buy_round: { impress: 0.8, fame: 0.5, drink: 0.5, sociable: 0.5 },
  rescue: { impress: 0.6, justice: 1.0, kindness: 1.0 },
  // heat
  lay_low: { thrill: -0.8, reckless: -0.6, curiosity: -0.2 },
  bribe_cop: { honesty: -0.8, mischief: 0.3, greed: -0.4 },
  fix_record: { honesty: -0.6 },
  frame: { honesty: -1.0, kindness: -0.9, mischief: 0.6, justice: -0.5 },
  // fights
  challenge: { temper: 1.6, courage: 0.4, grudge: 0.6 },
  sweep: { temper: 1.0, courage: 0.6, thrill: 0.6 },
  threaten: { temper: 0.8, mischief: 0.4, kindness: -0.8 },
  join_brawl: { temper: 1.0, thrill: 0.8, mischief: 0.5 },
  challenge_dragon: { fame: 0.8, justice: 0.8, thrill: 0.6 },
  engage_flight: { fame: 0.6, justice: 0.6, thrill: 0.6 },
  film_flight: { fame: 1.0, vanity: 0.5 },
  armwrestle: { vanity: 0.6, temper: 0.4 },
  // vice
  order_drink: { drink: 2.2 },
  karaoke: { drink: 0.6, fame: 1.0, vanity: 0.4, sociable: 0.4 },
  poker: { gamble: 2.4 },
  pool: { gamble: 1.4, vanity: 0.3 },
  darts: { gamble: 0.8, vanity: 0.3 },
  tend_bar: { drink: 0.6, sociable: 0.8 },
  // stealing
  pickpocket: { honesty: -1.4, mischief: 0.8 },
  rob_till: { honesty: -1.4, thrill: 0.6, gamble: 0.3 },
  safe: { honesty: -1.2, gamble: 0.5, thrill: 0.5 },
  vault: { honesty: -1.2, gamble: 0.5, thrill: 0.5 },
  crates: { honesty: -1.2 },
  steal_guitar: { honesty: -1.4 },
  shoplift_paint: { honesty: -1.4, mischief: 0.5 },
  rob_paint_shop: { honesty: -1.4, thrill: 0.5 },
  help_herself: { honesty: -1.0 },
  threaten_clerk: { honesty: -0.8, kindness: -0.8 },
  fence: { honesty: -0.5 },
  // glory
  dj_set: { fame: 1.4, artistry: 0.8 },
  gig: { fame: 1.6, artistry: 0.8 },
  busk: { fame: 1.0, artistry: 0.6, sociable: 0.4 },
  jam: { fame: 0.6, artistry: 1.2 },
  serenade: { fame: 0.8, impress: 1.0, romantic: 0.6, artistry: 0.6 },
  beatbox: { fame: 0.8, artistry: 0.8 },
  billboard: { fame: 1.4, techy: 1.0, mischief: 0.5 },
  graffiti: { fame: 1.2, artistry: 1.2, mischief: 0.6 },
  mirror: { vanity: 2.0 },
  recruit_kids: { fame: 0.6, kindness: 0.5 },
  // tinkering
  hack: { techy: 1.4 },
  jack: { techy: 1.4, mischief: 0.4 },
  terminal: { techy: 1.2 },
  implant: { techy: 1.0, vanity: 0.3 },
  fusePanel: { mischief: 0.6, curiosity: 0.4 },
  fuse_panel: { mischief: 0.6, curiosity: 0.4 },
  // creatures and crew
  pet: { animal: 1.8, kindness: 0.4 },
  feed_pigeon: { animal: 1.8, kindness: 0.4 },
  steal_puppy: { animal: 0.8, honesty: -0.8, mischief: 0.5 },
  pet_ally: { animal: 1.0, loyalty: 1.2 },
  repair_ally: { loyalty: 1.4, techy: 0.4, kindness: 0.4 },
  teach_trick: { animal: 0.6, loyalty: 0.6, kindness: 0.4 },
  recruit_juno: { loyalty: 0.4, techy: 0.6 },
  // thrills
  parkour: { thrill: 1.4 },
  laser_tag: { thrill: 0.8, sociable: 0.4 },
  mix_molotov: { mischief: 1.0, thrill: 0.6, grudge: 0.4 },
  skyline: { thrill: 0.6, curiosity: 0.4 },
  // everyday
  chat: { sociable: 1.4, kindness: 0.3 },
  ask_around: { sociable: 1.0, curiosity: 0.4 },
  cook: { appetite: 1.4, artistry: 0.4 },
  buy_noodles: { appetite: 1.6 },
  eat_noodles: { appetite: 0.8 },
  eat_dish: { appetite: 0.8 },
  buy_gear: { vanity: 0.6 },
};

/** Fights that are only a good idea when the other side has it coming. */
const BAD_GUY_ARCHETYPES = new Set(['ganger', 'dealer', 'helix_guard', 'corpo', 'cop', 'club_security']);

/** Baddies: anyone hostile, or in a line of work that tends to have it coming. */
export const isBadGuy = (n: Npc): boolean => n.hostile || BAD_GUY_ARCHETYPES.has(n.archetype);

/** The one girl she's committed to, if she has one: whoever she's kissed and likes best. */
export function flameOf(w: World): Npc | null {
  let best: Npc | null = null;
  for (const [k, v] of Object.entries(w.flags)) {
    if (!v || !k.startsWith('kissed:')) continue;
    const n = w.npcs[k.slice(7)];
    if (n && n.alive && n.affinity > 0 && (!best || n.affinity > best.affinity)) best = n;
  }
  return best;
}

const ROMANCE = new Set(['flirt', 'kiss', 'make_move', 'pool_date', 'serve_dish', 'serenade_girl']);
const FIGHTS = new Set(['challenge', 'sweep', 'threaten', 'join_brawl']);

/** What her personality adds to (or takes from) how much she wants this. Neutral at 0.5 across the board. */
export function traitBias(w: World, cand: Candidate): number {
  const t = w.hero.personality.traits;
  const [family, id] = cand.key.split(':') as [string, string | undefined];
  let s = 0;
  for (const [k, load] of Object.entries(LOADINGS[family] ?? {})) s += load * (t[k as Trait] - 0.5);

  const target = id ? w.npcs[id] : undefined;
  if (target && FIGHTS.has(family)) {
    // Justice wants bad guys; kindness doesn't want to hurt anyone who hasn't earned it.
    if (isBadGuy(target)) s += 1.8 * (t.justice - 0.5);
    else s -= (0.6 * (t.kindness - 0.5) + 0.8 * (t.justice - 0.5)) * 2;
    // A short fuse and a long memory.
    if (target.affinity < -10) s += 1.0 * (t.grudge - 0.5) + 0.6 * (t.temper - 0.5);
  }
  if (target && ROMANCE.has(family)) {
    // The One: devotion pulls her towards her flame and away from everyone else.
    const flame = flameOf(w);
    if (flame) s += (flame.id === target.id ? 1.4 : -2.4) * (t.romantic - 0.5);
    // Girls she's already charmed are less of a conquest.
    else if (target.affinity >= 20 && family === 'flirt') s -= 0.5 * (t.impress - 0.5);
  }
  if (family === 'order_drink' || family === 'buy_round') {
    // Another one? She can tell whether she's had enough. Lushes can't.
    s += w.hero.drunk * 0.12 * (t.drink - 0.5);
  }
  return s;
}

/** Recklessness blunts the sting of risk; caution amplifies it. */
export const riskScale = (w: World): number => 1 - 0.9 * (w.hero.personality.traits.reckless - 0.5);

/** Impulsive heroes pick more erratically; deliberate ones pick the best option more reliably. */
export const temperatureScale = (w: World): number => 1 + 0.7 * (w.hero.personality.traits.impulsive - 0.5);
