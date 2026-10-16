import type { Item } from './types';
import { ARTS, CLASS_BRANCH, type ArtBranch } from './content/doctrine';
import { addAmmo } from './arms';
import { foeArmor, fxOf } from './weapons';
import { dist, hasLos, inCover, neighbors, same, type Pos } from './grid';
import type { Sim, Unit } from './tactics';
import { strikeValue, type Technique } from './techniques';

/**
 * The engine half of the Doctrine branches (`content/doctrine.ts` is the shop half). Everything here reads the
 * ranks Blackbird was built with, `s.arts`, and turns them into things that happen in a fight. The fight itself
 * stays in `tactics.ts`; it just calls in here at the moments that matter: before a strike (how hard, how likely),
 * after one (what it did besides hurt), when she is hit, and when she picks what to do with her action.
 *
 * `art(s, id)` is zero unless the art belongs to the branch of the weapon in her hand (or to General), so no
 * caller has to remember to check what she is holding.
 */

// ---------------------------------------------------------------- what she is holding

/** The named weapons have no generated traits, so the class they would have rolled is written down here. */
const NAMED: Record<string, string> = {
  excalibur: 'club', pool_cue: 'club', judgment: 'club', broken_bottle: 'knife', switchblade: 'knife', cleaver: 'blade',
  thermal_katana: 'blade', arc_gauntlet: 'gauntlet', monowhip: 'whip',
};

export const classOf = (it: Item): string => it.fx?.cls ?? NAMED[it.id] ?? fxOf(it).cls;
export const branchOf = (it: Item): ArtBranch | null => CLASS_BRANCH[classOf(it)] ?? null;

const BASE: Record<ArtBranch, string> = {
  blades: 'edge_mastery', blunt: 'heavy_hitter', small: 'sidearm_mastery', heavy: 'heavy_ordnance', precision: 'sharpshooter', general: 'thick_skin',
};

// ---------------------------------------------------------------- reading ranks

/** What an art adds right now: its per-rank number times ranks, or nothing if the weapon in hand is the wrong kind. */
export function art(s: Sim, id: string): number {
  const n = s.arts[id];
  if (!n) return 0;
  const b = ARTS[id]!.branch;
  return b === 'general' || b === s.branch ? n : 0;
}

/** How many ranks of an art are working right now. */
export const rank = (s: Sim, id: string): number => Math.round(art(s, id) / ARTS[id]!.per);

const roll = (s: Sim, id: string, scale = 1): boolean => {
  const n = art(s, id);
  return n > 0 && s.c.rng.chance(Math.min(0.95, (n / 100) * scale));
};

const personOnly = (t: Unit): boolean => !!t.npc && !t.npc.tags.some((x) => ['robot', 'dragon', 'boss'].includes(x));
const bleeds = (t: Unit): boolean => !!t.npc && !t.npc.tags.includes('robot');
const crippled = (t: Unit): boolean => t.leg || t.arm || t.ribs;

// ---------------------------------------------------------------- how hard, how likely

/** Everything that scales how much a strike hurts. Also used for what the AI expects, so she values what she is good at. */
export function dmgMult(s: Sim, t: Unit, from: Pos): number {
  let m = s.branch ? 1 + art(s, BASE[s.branch]) / 100 : 1;
  const h = s.w.hero;
  const d = dist(from, t);
  const flank = s.flanked(s.hero, t, from);
  if (h.hp / h.maxHp < 0.5) m += art(s, 'adrenaline') / 100;
  m += Math.min(4, s.kills) * (art(s, 'momentum') / 100);
  const mates = s.units.filter((u) => u.team === 'hero' && u.state === 'active' && u !== s.hero).length;
  m += Math.min(4, Math.max(0, s.standingFoes().length - 1 - mates)) * (art(s, 'last_one_standing') / 100);
  if (flank) m += art(s, 'flanking_instinct') / 100;
  if (!t.alert || flank) m += art(s, 'backstab') / 100;
  if (t.ref.hp < t.ref.maxHp * 0.25) m += art(s, 'executioner') / 100;
  m += Math.min(5, Math.max(0, s.round - 1)) * (art(s, 'patient_hunter') / 100);
  if (d <= 2) m += art(s, 'point_blank') / 100;
  if (t.npc?.tags.includes('robot')) m += art(s, 'static_punch') / 100;
  if (t.stunned || crippled(t)) m += art(s, 'wrecking_ball') / 100;
  if (t.marked > 0) m += art(s, 'mark_target') / 100;
  return m;
}

/** Crit chance on top of the weapon's own. */
export function critBonus(s: Sim, t: Unit): number {
  let c = art(s, 'keen_edge') / 100 + art(s, 'gunslingers_luck') / 100;
  if (dist(s.hero, t) >= 3) c += art(s, 'headshot') / 100;
  if (s.overwatching) c += art(s, 'overwatch_master') / 100;
  c += Math.min(8, Math.max(0, s.round - 1)) * (art(s, 'battle_sense') / 100);
  return c;
}

/** Accuracy on top of the usual (can be negative-free: Blackbird's own penalties live in `heroHitChance`). */
export function hitBonus(s: Sim, t: Unit, from: Pos, weapon: Item): number {
  const d = dist(from, t);
  let p = s.hitExtra;
  if (s.moved) p += art(s, 'walking_fire') / 100;
  else p += art(s, 'steady_aim') / 100;
  if (d <= 2) p += art(s, 'hip_fire') / 100;
  if (t.moved) p += art(s, 'lead_shot') / 100;
  p += Math.min(8, Math.max(0, s.round - 1)) * (art(s, 'battle_sense') / 100);
  if (weapon.tags.includes('gun') && d > 1) {
    const far = Math.ceil(s.hero.reach[1] * 0.6);
    if (d > far) p += 0.07 * (d - far) * (art(s, 'eagle_eye') / 100);
    if (inCover(s.grid, from, t)) p += 0.25 * Math.min(1, (art(s, 'cover_shredder') + art(s, 'thermal_optics')) / 100);
  }
  return p;
}

/** How much armor soaks off a hit. Replaces the plain `armor * 0.5 - pierce`. */
export function soak(s: Sim, t: Unit, pierce: number, crit: boolean): number {
  if (!t.npc) return 0;
  if ((t.stunned || crippled(t)) && art(s, 'wrecking_ball') > 0) return 0;
  let a = foeArmor(t.npc) * 0.5 * (1 - t.shred);
  if (crit) a *= 1 - Math.min(1, art(s, 'cutting_edge') / 100);
  return Math.max(0, a - pierce - art(s, 'tungsten_tip'));
}

/** Her speed to the draw, and the foes she has rattled slowing down. */
export const initiativeBonus = (s: Sim, u: Unit): number => (u.kind === 'hero' ? art(s, 'quick_draw') : u.stagger > 0 ? -art(s, 'stagger') : 0);

// ---------------------------------------------------------------- what a foe does to her, and with what

/** Changes to a hit's chance (added to it): her dodging in, a foe's wounds out. */
export function foeHit(s: Sim, att: Unit, tgt: Unit, from: Pos): number {
  let p = 0;
  if (tgt.kind === 'hero') {
    p -= (art(s, 'slip') / 100) * (s.moved ? 1.5 : 1);
    if (!s.moved) p -= art(s, 'dead_still') / 100;
    if (s.round === 1 && !s.o.assault) p -= art(s, 'counter_sense') / 100;
    if (att.reach[1] > 1 && inCover(s.grid, from, tgt)) p -= art(s, 'cover_savvy') / 100;
  }
  if (att.supp > 0) p -= 0.08 + art(s, 'suppressive_fire') / 100;
  if (att.ribs) p -= 0.1;
  if (att.bleedT > 0) p -= art(s, 'fear_blood') / 100;
  return p;
}

export const foePower = (att: Unit): number => (att.disarmed ? 0.65 : 1) * (att.arm ? 0.75 : 1);

/** A blow lands on her. Thick Skin, bracing, rolling with it, and the one that was going to kill her. */
export function taken(s: Sim, n: number): number {
  if (n <= 0) return n;
  let m = 1 - art(s, 'thick_skin') / 100;
  if (!s.moved) m -= art(s, 'brace') / 100;
  n = Math.max(1, Math.round(n * Math.max(0.2, m)));
  if (n > 1 && roll(s, 'roll_with_it')) n = Math.ceil(n / 2);
  const hp = s.w.hero.hp;
  if (hp - n <= 0 && roll(s, 'last_gasp')) {
    n = Math.max(0, hp - 1);
    s.note('last_gasp', 'good', {}, 5, `gasp:${s.round}`);
  }
  return n;
}

export function leech(s: Sim, dealt: number): void {
  const pct = art(s, 'leech');
  const h = s.w.hero;
  if (pct > 0 && dealt > 0 && h.hp > 0) h.hp = Math.min(h.maxHp, h.hp + Math.max(1, Math.round((dealt * pct) / 100)));
}

/** A foe swings at her and misses. */
export function onFoeMiss(s: Sim, att: Unit): void {
  if (att.reach[1] <= 1 && dist(att, s.hero) <= 1 && att.state === 'active' && roll(s, 'riposte')) {
    s.proc('riposte', att);
    s.heroStrike(att, { mult: 0.7, bonus: true });
  }
  if (roll(s, 'mirage')) s.mirage = true;
}

/** A foe's shot is about to land. True if she bats it away. */
export function deflected(s: Sim, att: Unit): boolean {
  if (att.reach[1] <= 1 || !roll(s, 'deflect')) return false;
  s.proc('deflect', att);
  s.damage(s.hero, att, 1 + Math.round(art(s, 'deflect') / 10));
  return true;
}

/** An injury from a blow can be shrugged off. */
export const shrugsOff = (s: Sim): boolean => roll(s, 'pain_tolerance');

// ---------------------------------------------------------------- what her blows do besides hurt

/** A foe stops what they are doing; they will also take a moment to get back in the fight. */
export function stun(s: Sim, t: Unit, chain = true): void {
  if (t.state !== 'active') return;
  t.stunned = true;
  t.stagger = 2;
  s.proc('stun', t);
  if (!chain || classOf(s.wield) !== 'gauntlet') return;
  const next = s.standingFoes().find((f) => f !== t && dist(f, t) <= 1);
  if (next && roll(s, 'shock_knuckles')) stun(s, next, false);
}

interface Strike {
  dealt: number;
  crit: boolean;
  wasStunned: boolean;
  wasUnaware: boolean;
  bonus: boolean;
}

/** After one of her strikes: bleeding, breaks, knockback, ricochets, and everything else that rides on a hit. */
export function afterStrike(s: Sim, t: Unit, k: Strike): void {
  const rng = s.c.rng;
  if (t.state !== 'active') {
    if (k.wasUnaware && roll(s, 'clean_kill')) s.hush = s.round + 1;
    return;
  }
  if (k.dealt <= 0) return;
  const persons = personOnly(t);
  const weapon = s.wield;
  const gauntlet = classOf(weapon) === 'gauntlet';
  if (bleeds(t) && roll(s, 'open_veins')) {
    t.bleedT = 4;
    t.bleedN = Math.min(3, t.bleedN + 1);
    s.proc('bleed', t);
  }
  const slows = [roll(s, 'hamstring'), roll(s, 'kneecapper')].some(Boolean);
  if (persons && slows && t.slow <= 0) {
    t.slow = 3;
    s.proc('slow', t);
  }
  if (persons && !t.disarmed && (roll(s, 'disarm') || roll(s, 'disarming_shot'))) {
    t.disarmed = true;
    s.proc('disarm', t);
  }
  if (t.npc && t.shred < 0.6 && art(s, 'guard_break') > 0) t.shred = Math.min(0.6, t.shred + art(s, 'guard_break') / 100);
  if (persons && k.wasStunned && roll(s, 'skullcracker')) {
    s.proc('ko', t);
    s.damage(s.hero, t, t.ref.hp);
    return;
  }
  if (!t.stunned && (roll(s, 'ringing_bell') || roll(s, 'stopping_power'))) stun(s, t);
  if (gauntlet && t.npc?.tags.includes('robot') && !t.disabled && roll(s, 'static_punch', 0.8)) {
    t.stunned = true;
    t.disabled = true;
    s.proc('stun', t);
  }
  if (persons && roll(s, 'crippler')) {
    const open = (['leg', 'arm', 'ribs'] as const).filter((l) => !t[l]);
    const limb = open.length ? open[Math.floor(rng.next() * open.length)]! : null;
    if (limb) {
      t[limb] = true;
      s.proc('cripple', t, { limb });
    }
  }
  if (classOf(weapon) === 'energy' && !t.burning && roll(s, 'hot_cells')) {
    t.burning = 3;
    s.proc('burn', t);
  }
  if (persons && roll(s, 'cripple_shot')) {
    if (rng.chance(0.35)) {
      t.pinned = 2;
      s.proc('pin', t);
    } else if (t.slow <= 0) {
      t.slow = 3;
      s.proc('slow', t);
    }
  }
  if (roll(s, 'breach') && t.state === 'active') {
    s.proc('knock', t);
    s.knockback(s.hero, t, 1, 0.6);
  }
  if (roll(s, 'suppressed_shot')) s.hush = s.round + 1;
  if (dist(s.hero, t) >= 3 && t.state === 'active' && t.ref.hp < t.ref.maxHp * 0.3 && !t.npc?.tags.includes('boss') && roll(s, 'one_shot')) {
    s.proc('execute', t);
    s.damage(s.hero, t, t.ref.hp);
    return;
  }
  if (k.crit && art(s, 'explosive_rounds') > 0) {
    let hit = false;
    for (const f of s.standingFoes()) {
      if (f === t || dist(f, t) > 1) continue;
      hit = true;
      s.damage(s.hero, f, Math.max(1, Math.round((k.dealt * art(s, 'explosive_rounds')) / 100)));
    }
    if (hit) s.proc('blast', t);
  }
  if (k.bonus) return;
  if (roll(s, 'double_tap') && t.state === 'active') {
    s.proc('double', t);
    s.heroStrike(t, { mult: 0.6, bonus: true, noAmmo: true });
  }
  if (roll(s, 'trick_shot')) {
    const other = s.standingFoes().find((f) => f !== t && dist(f, t) <= 3 && hasLos(s.grid, t, f));
    if (other) {
      s.proc('ricochet', other);
      s.heroStrike(other, { mult: 0.55, bonus: true, noAmmo: true });
    }
  }
  if (roll(s, 'overpenetration')) {
    const behind = s.standingFoes().find((f) => f !== t && dist(f, t) <= 1 && dist(s.hero, f) >= dist(s.hero, t));
    if (behind) {
      s.proc('through', behind);
      s.heroStrike(behind, { mult: 0.6, bonus: true, noAmmo: true });
    }
  }
  if (weapon.tags.includes('gun') && roll(s, 'shoot_scoot')) scoot(s);
}

/** A free step away from the nearest foe. */
function scoot(s: Sim): void {
  const me = s.hero;
  const foes = s.standingFoes();
  if (!foes.length) return;
  const gap = (p: Pos) => Math.min(...foes.map((f) => dist(f, p)));
  const best = neighbors(s.grid, me, false)
    .filter((p) => !s.occupant(p))
    .sort((a, b) => gap(b) - gap(a))[0];
  if (best && gap(best) > gap(me)) {
    me.x = best.x;
    me.y = best.y;
  }
}

/** She puts somebody down. */
export function onKill(s: Sim, t: Unit): void {
  s.kills++;
  if (roll(s, 'blade_dance') || roll(s, 'follow_through')) s.bonus++;
  const ammo = s.wield.ammoType;
  if (ammo && t.npc && roll(s, 'scavenger')) addAmmo(s.w.hero, ammo, 2 + Math.floor(s.c.rng.next() * 3));
}

/** Rounds that did not actually leave the gun. */
export function refund(s: Sim, spent: number): number {
  if (spent > 0 && s.wield.ammoType && roll(s, 'reload_drills')) {
    addAmmo(s.w.hero, s.wield.ammoType, spent);
    return spent;
  }
  return 0;
}

// ---------------------------------------------------------------- the round

/** Statuses tick at the start of a unit's turn. False if the unit went down doing it. */
export function tickStatus(s: Sim, u: Unit): boolean {
  if (u.bleedT > 0) {
    u.bleedT--;
    s.damage(null, u, Math.max(2, Math.round(s.power(s.wield) * 0.12 * u.bleedN)));
    if (u.state !== 'active') return false;
  }
  if (u.slow > 0) u.slow--;
  if (u.pinned > 0) u.pinned--;
  if (u.marked > 0) u.marked--;
  if (u.supp > 0) u.supp--;
  if (u.stagger > 0 && !u.stunned) u.stagger--;
  return true;
}

/** Start of a round: she heals a little. */
export function regen(s: Sim): void {
  const pct = art(s, 'regen');
  const h = s.w.hero;
  if (pct > 0 && h.hp > 0 && h.hp < h.maxHp && s.hero.state === 'active') h.hp = Math.min(h.maxHp, h.hp + Math.max(1, Math.round((h.maxHp * pct) / 100)));
}

/** Her turn: foes might lose their nerve just from her being there. */
export function presence(s: Sim): void {
  const pct = art(s, 'intimidating_presence');
  if (pct <= 0) return;
  for (const f of s.standingFoes()) {
    if (!f.canFlee || f.fleeing || !s.c.rng.chance(pct / 100)) continue;
    if (s.panicIfCan(f)) {
      f.scared = true;
      s.proc('cow', f);
    }
  }
}

/** How much extra nerve a foe is short of. Wounds make foes run sooner. */
export const nervePenalty = (s: Sim, u: Unit): number => (u.bleedT > 0 ? art(s, 'fear_blood') / 100 : 0) + art(s, 'brutal_presence') / 100;

/** A free action after hers: from Blade Dance and Follow-Through, and from Berserker when she is low. */
export function bonusActions(s: Sim): number {
  const h = s.w.hero;
  let n = s.bonus;
  s.bonus = 0;
  if (h.hp < h.maxHp * 0.25 && roll(s, 'berserker')) n++;
  return Math.min(2, n);
}

// ---------------------------------------------------------------- things she can choose to do

const cool = (s: Sim, id: string, base = 6): number => Math.max(1, base - rank(s, id));
const ready = (s: Sim, id: string): boolean => rank(s, id) > 0 && !s.hero.cd[id];

/** A free tile beside the target, as near to her as it gets. */
function dashTo(s: Sim, t: Unit): boolean {
  const spot = neighbors(s.grid, t, false)
    .filter((p) => !s.occupant(p))
    .sort((a, b) => dist(a, s.hero) - dist(b, s.hero))[0];
  if (!spot) return false;
  s.hero.x = spot.x;
  s.hero.y = spot.y;
  return true;
}

const around = (s: Sim, t: Unit, r: number): Unit[] => s.standingFoes().filter((f) => f !== t && dist(f, t) <= r);

export function doctrineTechniques(s: Sim): Technique[] {
  if (!s.branch && !s.arts.thick_skin) return [];
  const w = s.wield;
  const out: Technique[] = [];
  const shot = (s2: Sim, from: Pos, t: Unit, mult: number, bonus = 0): number =>
    strikeValue(s2.heroHitChance(t, from, w), s2.heroExpected(t, w, mult), t.ref.hp) + bonus;
  const reachMax = s.hero.reach[1];

  if (ready(s, 'lunge')) {
    const r = rank(s, 'lunge');
    out.push({
      id: 'lunge', targets: 'enemy', range: [2, 2 + r], los: false,
      value: (s2, me, from, t) => shot(s2, from, t!, 1 + 0.1 * r, 2.5 + (t!.reach[1] > 1 ? 1.5 : 0)),
      run(s2, me, t) {
        me.cd.lunge = cool(s2, 'lunge');
        if (!dashTo(s2, t!)) return;
        s2.proc('lunge', t!);
        s2.heroStrike(t!, { mult: 1 + 0.1 * r });
      },
    });
  }

  if (ready(s, 'whirl')) {
    const r = rank(s, 'whirl');
    const mult = 0.5 + art(s, 'whirl') / 100;
    out.push({
      id: 'whirl', targets: 'enemy', range: [1, 1], los: false,
      value: (s2, me, from) => s2.standingFoes().filter((f) => dist(f, from) <= 1).reduce((a, f) => a + shot(s2, from, f, mult), 0),
      run(s2, me) {
        me.cd.whirl = cool(s2, 'whirl');
        s2.proc('whirl', s2.standingFoes().find((f) => dist(f, me) <= 1) ?? me);
        for (const f of s2.standingFoes().filter((x) => dist(x, me) <= 1)) s2.heroStrike(f, { mult, noAmmo: true });
      },
    });
    void r;
  }

  if (ready(s, 'haymaker')) {
    const r = rank(s, 'haymaker');
    out.push({
      id: 'haymaker', targets: 'enemy', range: [1, 1], los: false,
      value: (s2, me, from, t) => shot(s2, from, t!, 0.9, 2),
      run(s2, me, t) {
        me.cd.haymaker = cool(s2, 'haymaker');
        s2.heroStrike(t!, { mult: 0.9 });
        if (t!.state !== 'active') return;
        s2.proc('knock', t!);
        s2.knockback(me, t!, 1 + Math.ceil(r / 2), 1 + 0.15 * r);
      },
    });
  }

  if (ready(s, 'bulldoze')) {
    const r = rank(s, 'bulldoze');
    out.push({
      id: 'bulldoze', targets: 'enemy', range: [2, 2 + r], los: false,
      value: (s2, me, from, t) => shot(s2, from, t!, 0.8, 2.5),
      run(s2, me, t) {
        me.cd.bulldoze = cool(s2, 'bulldoze');
        if (!dashTo(s2, t!)) return;
        s2.proc('bulldoze', t!);
        s2.heroStrike(t!, { mult: 0.8 });
        if (t!.state === 'active') s2.knockback(me, t!, 1, 0.8);
      },
    });
  }

  if (ready(s, 'pile_driver')) {
    const mult = 1.5 + art(s, 'pile_driver') / 100;
    out.push({
      id: 'pile_driver', targets: 'enemy', range: [1, 1], los: false,
      value: (s2, me, from, t) => shot(s2, from, t!, mult, 1.5),
      run(s2, me, t) {
        me.cd.pile_driver = cool(s2, 'pile_driver');
        const dealt = s2.heroStrike(t!, { mult });
        if (dealt > 0) {
          s2.proc('slam', t!);
          stun(s2, t!);
        }
      },
    });
  }

  if (ready(s, 'aftershock')) {
    const mult = 0.4 + art(s, 'aftershock') / 100;
    out.push({
      id: 'aftershock', targets: 'enemy', range: [1, 1], los: false,
      value: (s2, me, from, t) => shot(s2, from, t!, 1) + around(s2, t!, 1).reduce((a, f) => a + shot(s2, from, f, mult), 0),
      run(s2, me, t) {
        me.cd.aftershock = cool(s2, 'aftershock');
        s2.heroStrike(t!, { mult: 1 });
        const splash = around(s2, t!, 1);
        if (splash.length) s2.proc('aftershock', t!);
        for (const f of splash) s2.heroStrike(f, { mult, noAmmo: true });
      },
    });
  }

  if (ready(s, 'fan_hammer')) {
    const acc = art(s, 'fan_hammer') / 100;
    out.push({
      id: 'fan_hammer', targets: 'enemy', range: [1, reachMax], los: true,
      value: (s2, me, from, t) => 2 * shot(s2, from, t!, 0.6),
      run(s2, me, t) {
        me.cd.fan_hammer = cool(s2, 'fan_hammer');
        s2.proc('fan', t!);
        s2.hitExtra = acc;
        s2.heroStrike(t!, { mult: 0.6 });
        if (t!.state === 'active') s2.heroStrike(t!, { mult: 0.6 });
        s2.hitExtra = 0;
      },
    });
  }

  if (ready(s, 'pistol_whip') && w.tags.includes('gun')) {
    const mult = 0.7 + art(s, 'pistol_whip') / 100;
    out.push({
      id: 'pistol_whip', targets: 'enemy', range: [1, 1], los: false,
      value: (s2, me, from, t) => shot(s2, from, t!, mult, 1.5),
      run(s2, me, t) {
        me.cd.pistol_whip = cool(s2, 'pistol_whip');
        const dealt = s2.heroStrike(t!, { mult, noAmmo: true });
        if (dealt > 0) {
          s2.proc('whip', t!);
          stun(s2, t!);
        }
      },
    });
  }

  if (ready(s, 'buckshot_wall')) {
    const r = rank(s, 'buckshot_wall');
    const mult = 0.5 + art(s, 'buckshot_wall') / 100;
    out.push({
      id: 'buckshot_wall', targets: 'enemy', range: [1, reachMax], los: true,
      value: (s2, me, from, t) => shot(s2, from, t!, 1) + around(s2, t!, r >= 3 ? 2 : 1).reduce((a, f) => a + shot(s2, from, f, mult), 0),
      run(s2, me, t) {
        me.cd.buckshot_wall = cool(s2, 'buckshot_wall');
        s2.heroStrike(t!, { mult: 1 });
        const splash = around(s2, t!, r >= 3 ? 2 : 1);
        if (splash.length) s2.proc('blast', t!);
        for (const f of splash) s2.heroStrike(f, { mult, noAmmo: true });
      },
    });
  }

  if (ready(s, 'suppressive_fire')) {
    const pin = 0.15 + art(s, 'suppressive_fire') / 100;
    out.push({
      id: 'suppressive_fire', targets: 'enemy', range: [2, reachMax], los: true,
      value: (s2, me, from, t) => (t!.supp > 0 ? null : shot(s2, from, t!, 0.4, 4 + 14 * Math.min(1, s2.avgDamage(t!, me) / Math.max(1, me.ref.hp)))),
      run(s2, me, t) {
        me.cd.suppressive_fire = cool(s2, 'suppressive_fire');
        s2.heroStrike(t!, { mult: 0.4 });
        if (t!.state !== 'active') return;
        t!.supp = 3;
        s2.proc('suppress', t!);
        if (personOnly(t!) && s2.c.rng.chance(pin)) t!.pinned = 2;
      },
    });
  }

  if (ready(s, 'spray_and_pray')) {
    const mult = 0.35 + art(s, 'spray_and_pray') / 100;
    out.push({
      id: 'spray_and_pray', targets: 'enemy', range: [1, reachMax], los: true,
      value: (s2, me, from, t) => {
        const hit = s2.standingFoes().filter((f) => dist(from, f) <= reachMax && hasLos(s2.grid, from, f)).slice(0, 3);
        return hit.length < 2 ? null : hit.reduce((a, f) => a + shot(s2, from, f, mult), 0);
      },
      run(s2, me, t) {
        me.cd.spray_and_pray = cool(s2, 'spray_and_pray');
        const foes = s2.standingFoes().filter((f) => dist(me, f) <= reachMax && hasLos(s2.grid, me, f)).sort((a, b) => (a === t ? -1 : b === t ? 1 : dist(me, a) - dist(me, b))).slice(0, 3);
        s2.proc('spray', t!);
        foes.forEach((f, i) => s2.heroStrike(f, { mult, noAmmo: i > 0 }));
      },
    });
  }

  if (ready(s, 'barrage')) {
    const mult = 1.4 + art(s, 'barrage') / 100;
    out.push({
      id: 'barrage', targets: 'enemy', range: [1, reachMax], los: true,
      value: (s2, me, from, t) => shot(s2, from, t!, mult, 1) + around(s2, t!, 1).reduce((a, f) => a + shot(s2, from, f, mult * 0.6), 0),
      run(s2, me, t) {
        me.cd.barrage = cool(s2, 'barrage', 10);
        s2.proc('barrage', t!);
        s2.heroStrike(t!, { mult });
        for (const f of around(s2, t!, 1)) s2.heroStrike(f, { mult: mult * 0.6, noAmmo: true });
      },
    });
  }

  if (ready(s, 'mark_target')) {
    out.push({
      id: 'mark_target', targets: 'enemy', range: [2, reachMax], los: true,
      value: (s2, me, from, t) => (t!.marked > 0 ? null : shot(s2, from, t!, 0.6, 1.5 + Math.min(3, t!.ref.hp / Math.max(1, s2.heroExpected(t!, w, 1)) * 0.5))),
      run(s2, me, t) {
        me.cd.mark_target = cool(s2, 'mark_target');
        s2.heroStrike(t!, { mult: 0.6 });
        if (t!.state === 'active') {
          t!.marked = 4;
          s2.proc('mark', t!);
        }
      },
    });
  }

  if (ready(s, 'pin_down')) {
    const r = rank(s, 'pin_down');
    out.push({
      id: 'pin_down', targets: 'enemy', range: [3, reachMax], los: true,
      value: (s2, me, from, t) => (t!.pinned > 0 || !personOnly(t!) ? null : shot(s2, from, t!, 0.5, 2.5)),
      run(s2, me, t) {
        me.cd.pin_down = cool(s2, 'pin_down');
        const dealt = s2.heroStrike(t!, { mult: 0.5 });
        if (dealt > 0 && t!.state === 'active') {
          t!.pinned = r >= 3 ? 3 : 2;
          s2.proc('pin', t!);
        }
      },
    });
  }

  void same;
  return out;
}
