import { SKILLS, SKILL_IDS, type SkillId, type StatId } from './skills';
import type { Trait } from '../personality';
import { AMMO } from './ammo';

/**
 * The lab's upgrade trees. Everything here is data: what a node costs, what it needs, what it does.
 * `lab.ts` reads it to sell nodes and to build the body she wakes up in; nothing else in the engine
 * knows what an upgrade is except through a handful of `perk` lookups.
 *
 * Shape: **branches** (Chassis, Firmware...) hold **lines** (a row of nodes you walk along left to
 * right) and each node can be bought several times (`max` ranks). A node needs the one before it in
 * its line, and sometimes things from other lines, so the whole thing is a web, not a ladder.
 *
 * Some of it is worth having every night (reflexes, hit points, a better head). Some of it is
 * for a very specific Blackbird (beatboxing grows faster). The prices are honest about which is which.
 */

export type SkillGroup = (typeof SKILLS)[SkillId]['group'];

/** Things the engine looks up while a night is running, rather than baking into the body at the start. */
export type PerkId =
  /** Percentage points off the drop-point cut. */
  | 'fee'
  /** Percent of the cash she's carrying that survives her dying. */
  | 'keep'
  /** Percent of the balance that grows back each rebuild. */
  | 'interest'
  /** Percent off lab prices. */
  | 'discount'
  /** Percent more XP from everything. */
  | 'xp'
  /** Percent more healing out of med kits. */
  | 'heal'
  /** How much she thinks of the bank: raises the pull of a drop point and lowers what she'll bother depositing. */
  | 'bank';

export type Fx =
  | { stat: StatId; n: number }
  | { hp: number }
  | { cash: number }
  /** Competence, 0..1. */
  | { comp: number }
  /** Levels she starts the night with. */
  | { level: number }
  /** Skill growth, as a percentage, for one skill, a whole group, or everything. */
  | { grow: SkillId | SkillGroup | 'all'; pct: number }
  /** Levels she already has in a skill when she wakes up. */
  | { skill: SkillId; lvl: number }
  | { item: string; n?: number }
  | { ammo: string; n: number }
  | { implant: string }
  | { weapon: string }
  | { armor: string }
  /** Pushes a personality trait around (and back; she can be talked out of things, a little). */
  | { trait: Trait; n: number }
  | { fame: number }
  | { perk: PerkId; n: number };

/** A requirement: a node id (any rank) or `id:rank`. */
export type Need = string;

export interface UpgradeDef {
  id: string;
  branch: string;
  line: string;
  /** Where in the line it sits, from 0. */
  at: number;
  name: string;
  /** The joke. What it actually does is generated from `fx`. */
  blurb: string;
  /** Neodollars for the first rank. */
  cost: number;
  /** Each further rank costs this much more (x). */
  step: number;
  max: number;
  needs: Need[];
  fx: Fx[];
}

export interface LineDef {
  id: string;
  branch: string;
  label: string;
  nodes: string[];
}

export interface BranchDef {
  id: string;
  label: string;
  blurb: string;
  lines: LineDef[];
}

// ====================================================================== building it

interface Spec {
  name: string;
  blurb: string;
  cost: number;
  fx: Fx[];
  max?: number;
  /** Cost multiplier per rank (default 1.55). */
  step?: number;
  needs?: Need[];
}

const UPGRADES: Record<string, UpgradeDef> = {};
const BRANCHES: BranchDef[] = [];

function branch(id: string, label: string, blurb: string): BranchDef {
  const b: BranchDef = { id, label, blurb, lines: [] };
  BRANCHES.push(b);
  return b;
}

/**
 * Add a line to a branch. `gate` is what the first node needs (so deeper lines sit behind shallower
 * ones). A `chain` line makes each node need the one before it; an unchained one is a shelf of
 * alternatives that all just need the gate.
 */
function line(b: BranchDef, id: string, label: string, gate: Need[], chain: boolean, specs: Spec[]): LineDef {
  const ids: string[] = [];
  specs.forEach((s, at) => {
    const nid = `${id}.${at + 1}`;
    const needs = [...(chain && at > 0 ? [`${id}.${at}`] : gate), ...(s.needs ?? [])];
    UPGRADES[nid] = { id: nid, branch: b.id, line: id, at, name: s.name, blurb: s.blurb, cost: s.cost, step: s.step ?? 1.55, max: s.max ?? 1, needs, fx: s.fx };
    ids.push(nid);
  });
  const l: LineDef = { id, branch: b.id, label, nodes: ids };
  b.lines.push(l);
  return l;
}

const chain = (b: BranchDef, id: string, label: string, gate: Need[], specs: Spec[]) => line(b, id, label, gate, true, specs);
const shelf = (b: BranchDef, id: string, label: string, gate: Need[], specs: Spec[]) => line(b, id, label, gate, false, specs);

// ====================================================================== chassis

const chassis = branch('chassis', 'Chassis', 'Hardware. Hit points, reflexes, plating. The things every night wants and no night regrets.');

chain(chassis, 'frame', 'Frame', [], [
  { name: 'Reinforced Ribs', blurb: 'Her ribs, but with opinions about being hit.', cost: 40, max: 5, fx: [{ hp: 10 }] },
  { name: 'Redundant Organs', blurb: 'Two of everything she can fit. Three of a couple of things.', cost: 180, max: 3, fx: [{ hp: 16 }] },
  { name: 'Carbon Skeleton', blurb: 'Lighter than bone. Harder than the people hitting it.', cost: 520, max: 3, fx: [{ hp: 24 }, { stat: 'muscle', n: 1 }] },
  { name: 'Second Heart', blurb: 'For the second half of the argument.', cost: 1500, max: 2, fx: [{ hp: 40 }] },
]);

chain(chassis, 'reflex', 'Reflexes', [], [
  { name: 'Twitch Wiring', blurb: 'The signal gets there before the idea does.', cost: 90, max: 3, fx: [{ stat: 'reflex', n: 1 }] },
  { name: 'Overclocked Nerves', blurb: 'Warranty void. Doctor delighted.', cost: 320, max: 3, fx: [{ stat: 'reflex', n: 1 }] },
  { name: 'Spinal Accelerator', blurb: 'A second spine, for speed.', cost: 850, max: 2, fx: [{ stat: 'reflex', n: 2 }] },
  { name: 'Time Dilation Gland', blurb: 'The dragon is fast. The dragon is also, from where she is standing, slow.', cost: 2600, fx: [{ stat: 'reflex', n: 2 }, { comp: 0.03 }] },
]);

chain(chassis, 'muscle', 'Muscle', [], [
  { name: 'Synthetic Fibers', blurb: 'Artificial muscle for natural bad ideas.', cost: 90, max: 3, fx: [{ stat: 'muscle', n: 1 }] },
  { name: 'Hydraulic Tendons', blurb: 'Pressurized. Don\'t shake hands.', cost: 320, max: 3, fx: [{ stat: 'muscle', n: 1 }] },
  { name: 'Piston Arms', blurb: 'Door-opening, in the sense of removing the door.', cost: 850, max: 2, fx: [{ stat: 'muscle', n: 2 }] },
  { name: 'Titan Frame', blurb: 'Now it\'s a load-bearing Blackbird.', cost: 2600, fx: [{ stat: 'muscle', n: 2 }, { hp: 20 }] },
]);

chain(chassis, 'neural', 'Neural', [], [
  { name: 'Neural Lace', blurb: 'A mesh of threads where the daydreams used to be.', cost: 90, max: 3, fx: [{ stat: 'hack', n: 1 }] },
  { name: 'Packet Sniffer', blurb: 'She hears wifi. She hears it judging her.', cost: 320, max: 3, fx: [{ stat: 'hack', n: 1 }] },
  { name: 'Ghost Protocol', blurb: 'The security system thinks she\'s a very persistent rumor.', cost: 850, max: 2, fx: [{ stat: 'hack', n: 2 }] },
  { name: 'Black ICE Bracer', blurb: 'Hack back. Hack so back.', cost: 2400, fx: [{ stat: 'hack', n: 2 }, { comp: 0.03 }] },
]);

chain(chassis, 'style', 'Style', [], [
  { name: 'Better Hair', blurb: 'It\'s not vanity if it works.', cost: 70, max: 3, fx: [{ stat: 'charm', n: 1 }] },
  { name: 'Chrome Smile', blurb: 'Eleven teeth. They all glint.', cost: 250, max: 3, fx: [{ stat: 'charm', n: 1 }] },
  { name: 'Subdermal Glow', blurb: 'Lights under the skin, in a mood color.', cost: 700, max: 2, fx: [{ stat: 'charm', n: 2 }] },
  { name: 'Walking Billboard', blurb: 'Neo has seen her. Neo cannot unsee her.', cost: 2000, fx: [{ stat: 'charm', n: 2 }, { fame: 6 }] },
]);

chain(chassis, 'plating', 'Plating', [], [
  { name: 'Pleather Lining', blurb: 'Technically a jacket. Technically armor.', cost: 80, fx: [{ armor: 'leather_jacket' }] },
  { name: 'Kevlar Weave', blurb: 'The duster, sewn in.', cost: 340, fx: [{ armor: 'kevlar_duster' }] },
  { name: 'Riot Plate', blurb: 'Surplus from a riot that went the other way.', cost: 760, fx: [{ armor: 'riot_vest' }] },
  { name: 'Artemis Scale Graft', blurb: 'Dragon-grade. Sourced from a dragon that did not consent.', cost: 1800, fx: [{ armor: 'artemis_plate' }] },
  { name: 'Helix Subdermal Plating', blurb: 'Corp tech under her skin. The warranty is an unmarked van.', cost: 3200, fx: [{ armor: 'corp_plate' }] },
]);

shelf(chassis, 'grafts', 'Black-market chrome', ['frame.1'], [
  { name: 'Third Thumb', blurb: 'Better grip, better hacking. Handshakes are awkward.', cost: 150, fx: [{ implant: 'third_thumb' }] },
  { name: 'Neon Liver', blurb: 'Filters anything. Glows through her shirt.', cost: 200, fx: [{ implant: 'neon_liver' }] },
  { name: 'Sonic Ear', blurb: 'Hears trouble coming, and everyone\'s business.', cost: 220, fx: [{ implant: 'sonic_ear' }] },
  { name: 'Hydraulic Calves', blurb: 'Leap tall buildings. Landing not included.', cost: 260, fx: [{ implant: 'hydraulic_calves' }] },
  { name: 'Dragon-spec Optics', blurb: 'See the future. Blink at the wrong times.', cost: 280, fx: [{ implant: 'dragon_eye' }] },
  { name: 'Chrome Larynx', blurb: 'Perfect pitch. A voice that isn\'t hers when startled.', cost: 260, fx: [{ implant: 'chrome_larynx' }] },
  { name: 'Subdermal Disco Ball', blurb: 'The party is inside her.', cost: 240, fx: [{ implant: 'subdermal_disco' }] },
  { name: 'Mantis Blades', blurb: 'Retractable. Retract is more of a suggestion.', cost: 380, fx: [{ implant: 'mantis_blades' }] },
  { name: 'Bounty-grade Scanner', blurb: 'Sees the paper on anybody.', cost: 300, fx: [{ implant: 'bounty_scanner' }] },
  { name: 'Atlas Ad-blocker', blurb: 'Mutes the propaganda. Mutes some irony.', cost: 130, fx: [{ implant: 'ad_blocker' }] },
  { name: 'Emergency Defibrillator', blurb: 'Cheat death. Once a night. Please do not test it.', cost: 1100, needs: ['frame.2'], fx: [{ implant: 'emergency_defib' }] },
]);

shelf(chassis, 'knight', 'The Knight', ['frame.4', 'reflex.4', 'muscle.4'], [
  { name: 'Cyberknight Frame', blurb: 'All of the above, and she knows it.', cost: 9000, fx: [{ stat: 'muscle', n: 2 }, { stat: 'reflex', n: 2 }, { stat: 'hack', n: 1 }, { stat: 'charm', n: 1 }, { hp: 50 }] },
]);

// ====================================================================== firmware

const firmware = branch('firmware', 'Firmware', 'Software. Smarter choices, tamer flaws, faster learning. Some flaws are very much part of the package.');

chain(firmware, 'mind', 'Cognition', [], [
  { name: 'A Clearer Head', blurb: 'The fog lifts. A new, different fog moves in.', cost: 60, max: 5, fx: [{ comp: 0.03 }] },
  { name: 'Threat Assessment', blurb: 'A little voice says "that one\'s big." It was right.', cost: 260, max: 5, fx: [{ comp: 0.03 }] },
  { name: 'Tactical Overlay', blurb: 'Arrows, numbers, and a suggestion to run.', cost: 800, max: 4, fx: [{ comp: 0.04 }] },
  { name: 'Precog Subroutine', blurb: 'Seems to know what will happen next. Doesn\'t say, rude.', cost: 2500, max: 3, fx: [{ comp: 0.05 }] },
]);

chain(firmware, 'learning', 'Learning', [], [
  { name: 'Lab-grade Memory', blurb: 'She retains things. Mostly the right things.', cost: 100, max: 5, fx: [{ perk: 'xp', n: 8 }] },
  { name: 'Montage Routine', blurb: 'Training sequence, set to a song, compressed into a Tuesday.', cost: 420, max: 5, fx: [{ grow: 'all', pct: 8 }] },
  { name: 'Study Hall', blurb: 'She takes notes. Nobody knows who taught her to.', cost: 650, max: 4, fx: [{ perk: 'xp', n: 10 }] },
  { name: 'Prodigy Protocol', blurb: 'Everything she touches, she gets good at faster.', cost: 1800, max: 3, fx: [{ grow: 'all', pct: 12 }] },
]);

shelf(firmware, 'temper', 'Flaw management', ['mind.1'], [
  { name: 'Count to Ten', blurb: 'She counts. She gets to four.', cost: 90, max: 4, fx: [{ trait: 'temper', n: -0.05 }] },
  { name: 'Think First', blurb: 'There is a gap between the idea and the action. Sometimes she finds it.', cost: 90, max: 4, fx: [{ trait: 'impulsive', n: -0.05 }] },
  { name: 'Look Before Leaping', blurb: 'The roof is high. The roof is also in the way.', cost: 110, max: 4, fx: [{ trait: 'reckless', n: -0.05 }] },
  { name: 'Water Between Rounds', blurb: 'A hydration reminder, installed at the base of the skull.', cost: 80, max: 4, fx: [{ trait: 'drink', n: -0.05 }] },
  { name: 'Wallet Discipline', blurb: 'The odds are bad. The odds have always been bad.', cost: 80, max: 4, fx: [{ trait: 'gamble', n: -0.05 }] },
  { name: 'Healthy Fear', blurb: 'She is a little more scared of big, angry things. A helpful little more.', cost: 120, max: 4, fx: [{ trait: 'courage', n: -0.04 }] },
  { name: 'Let It Go', blurb: 'A therapy app. It listens. It judges. It has a lovely voice.', cost: 70, max: 4, fx: [{ trait: 'grudge', n: -0.05 }] },
  { name: 'Eyes Up Front', blurb: 'She notices girls somewhat less per minute.', cost: 70, max: 4, fx: [{ trait: 'impress', n: -0.05 }] },
  { name: 'Thick Skin About Mirrors', blurb: 'The reflection has been told to stop.', cost: 70, max: 4, fx: [{ trait: 'vanity', n: -0.05 }] },
]);

shelf(firmware, 'lean', 'Lean into it', ['mind.1'], [
  { name: 'Crusader\'s Creed', blurb: 'Bad guys, meet wall.', cost: 80, max: 4, fx: [{ trait: 'justice', n: 0.05 }] },
  { name: 'Fame Hound', blurb: 'Everybody needs to know. Everybody.', cost: 80, max: 4, fx: [{ trait: 'fame', n: 0.05 }] },
  { name: 'Nosy Parker', blurb: 'If it has a latch, it has a story.', cost: 70, max: 4, fx: [{ trait: 'curiosity', n: 0.05 }] },
  { name: 'Tech Fetish', blurb: 'She knows what every cable is for. She does not know why it\'s warm.', cost: 70, max: 4, fx: [{ trait: 'techy', n: 0.05 }] },
  { name: 'Hand Over Heart', blurb: 'A soft spot for the helpless. Also for the not-so-helpless.', cost: 70, max: 4, fx: [{ trait: 'kindness', n: 0.05 }] },
  { name: 'Ride or Die', blurb: 'Loyalty, wired in. Hers to give, hers to keep.', cost: 70, max: 4, fx: [{ trait: 'loyalty', n: 0.05 }] },
  { name: 'Social Butterfly', blurb: 'She will talk to anyone. Anyone.', cost: 70, max: 4, fx: [{ trait: 'sociable', n: 0.05 }] },
  { name: 'Animal Magnetism', blurb: 'Pigeons, dogs, drones. All of them want a word.', cost: 60, max: 4, fx: [{ trait: 'animal', n: 0.05 }] },
  { name: 'Artist\'s Itch', blurb: 'Every blank wall is a lie by omission.', cost: 70, max: 4, fx: [{ trait: 'artistry', n: 0.05 }] },
  { name: 'Agent of Chaos', blurb: 'Knows exactly which button not to press.', cost: 60, max: 4, fx: [{ trait: 'mischief', n: 0.05 }] },
]);

shelf(firmware, 'hero', 'Hero complex', ['mind.4', 'learning.2'], [
  { name: 'Hero Protocol', blurb: 'She is the hero. She has decided. It is going rather well.', cost: 7500, fx: [{ comp: 0.1 }, { perk: 'xp', n: 25 }, { grow: 'all', pct: 25 }] },
]);

// ====================================================================== treasury

const treasury = branch('treasury', 'Treasury', 'Money. What she wakes up with, what the drop points take, and what survives when she doesn\'t.');

chain(treasury, 'purse', 'Starting purse', [], [
  { name: 'Lucky Penny', blurb: 'Found in the lab. Possibly dropped by the lab assistant.', cost: 30, max: 5, step: 1.5, fx: [{ cash: 20 }] },
  { name: 'Stashed Roll', blurb: 'A rubber-banded wad in a boot.', cost: 150, max: 5, step: 1.5, fx: [{ cash: 50 }] },
  { name: 'Trust Fund', blurb: 'Nobody will explain where it came from.', cost: 600, max: 4, step: 1.6, fx: [{ cash: 150 }] },
  { name: 'Offshore Float', blurb: 'A rounding error from a corporate account. Hers now.', cost: 2000, max: 3, step: 1.7, fx: [{ cash: 400 }] },
]);

chain(treasury, 'fees', 'Drop-point fees', [], [
  { name: 'Handshake Deal', blurb: 'The man at the drop point has seen her face. His mom likes her.', cost: 60, max: 3, step: 1.7, fx: [{ perk: 'fee', n: 3 }] },
  { name: 'Preferred Customer', blurb: 'A punch card. Eight deposits, a free pickle.', cost: 250, max: 4, step: 1.6, fx: [{ perk: 'fee', n: 2 }] },
  { name: 'Insider Rate', blurb: 'Someone at the drop network owes her a favor, or fears her.', cost: 900, max: 3, step: 1.7, fx: [{ perk: 'fee', n: 2 }] },
  { name: 'Zero-fee Zone', blurb: 'The drop points no longer take their cut. They look relieved.', cost: 3000, fx: [{ perk: 'fee', n: 3 }] },
]);

chain(treasury, 'habit', 'Saving habit', [], [
  { name: 'Piggy Instinct', blurb: 'She spots a drop point and feels a faint, alien urge.', cost: 70, max: 4, fx: [{ perk: 'bank', n: 1 }] },
  { name: 'Paranoid Accountant', blurb: 'It\'s not safe in her pocket. It was never safe in her pocket.', cost: 280, max: 4, fx: [{ perk: 'bank', n: 1 }] },
  { name: 'Tithe Reflex', blurb: 'The moment she has a decent pile, her feet start toward a drop point.', cost: 800, max: 3, fx: [{ perk: 'bank', n: 2 }] },
]);

chain(treasury, 'estate', 'Estate', ['fees.1'], [
  { name: 'Life Insurance', blurb: 'She pays a little now. Then she dies, and she gets a little back.', cost: 300, max: 3, step: 1.7, fx: [{ perk: 'keep', n: 10 }] },
  { name: 'Next of Kin', blurb: 'The kin are the lab. The lab is also her.', cost: 1300, max: 3, step: 1.8, fx: [{ perk: 'keep', n: 8 }] },
  { name: 'Golden Parachute', blurb: 'Parachute strapped on before the plunge, and it opens.', cost: 5000, fx: [{ perk: 'keep', n: 16 }] },
]);

chain(treasury, 'interest', 'Compound interest', ['habit.1'], [
  { name: 'Savings Account', blurb: 'Interest. A word that used to scare her.', cost: 200, max: 5, step: 1.5, fx: [{ perk: 'interest', n: 2 }] },
  { name: 'Hedge Fund', blurb: 'Someone is making money with her money. It might be her.', cost: 1500, max: 3, step: 1.7, fx: [{ perk: 'interest', n: 3 }] },
  { name: 'Shell Company', blurb: 'The shell company has a shell company. The shell company is a shell.', cost: 4500, max: 2, step: 1.8, fx: [{ perk: 'interest', n: 4 }] },
]);

// ====================================================================== lab

const lab = branch('lab', 'The Lab', 'The workbench and the assistant. How good the body is when it comes off the printer.');

chain(lab, 'rebuild', 'Rebuild quality', [], [
  { name: 'Pre-seasoned Body', blurb: 'Printed with a few nights already on it.', cost: 160, max: 4, step: 2.2, fx: [{ level: 1 }] },
  { name: 'Warm Boot', blurb: 'She wakes up knowing where she is, mostly.', cost: 500, max: 2, step: 2, fx: [{ comp: 0.03 }, { hp: 10 }] },
  { name: 'Clean Print', blurb: 'No artifacts. No tattoos she doesn\'t remember choosing.', cost: 1400, max: 2, step: 2, fx: [{ hp: 20 }, { stat: 'reflex', n: 1 }] },
]);

chain(lab, 'bench', 'The bench', [], [
  { name: 'Bulk Parts Discount', blurb: 'The assistant haggles. Faintly.', cost: 150, max: 5, step: 1.5, fx: [{ perk: 'discount', n: 3 }] },
  { name: 'Salvage Contacts', blurb: 'A guy knows a guy who has a drawer of reconditioned everything.', cost: 650, max: 5, step: 1.5, fx: [{ perk: 'discount', n: 3 }] },
  { name: 'Wholesale Account', blurb: 'The lab is now a business. The lab assistant is now the business.', cost: 2200, max: 3, step: 1.8, fx: [{ perk: 'discount', n: 4 }] },
]);

shelf(lab, 'pack', 'Spare parts bin', [], [
  { name: 'Patch Kit in the Boot', blurb: 'Taped inside the boot. Taped in, mostly.', cost: 50, max: 3, step: 1.4, fx: [{ item: 'patch_kit' }] },
  { name: 'Med Pack in the Jacket', blurb: 'Sewn into the lining by someone who cares.', cost: 130, max: 3, step: 1.5, fx: [{ item: 'med_pack' }] },
  { name: 'Trauma Kit under the Bed', blurb: 'The lab assistant is a worrier.', cost: 360, max: 2, step: 1.7, fx: [{ item: 'trauma_kit' }] },
  { name: 'Field Surgeon', blurb: 'Every med kit works a little harder.', cost: 400, max: 5, step: 1.5, fx: [{ perk: 'heal', n: 10 }] },
]);

shelf(lab, 'goodies', 'Care package', [], [
  { name: 'Combat Stim', blurb: 'A morning-after kind of stim.', cost: 90, max: 3, step: 1.5, fx: [{ item: 'stim' }] },
  { name: 'Ironclad Vial', blurb: 'For lifting things that shouldn\'t be lifted.', cost: 110, max: 2, step: 1.5, fx: [{ item: 'stim_iron' }] },
  { name: 'Twitch Vial', blurb: 'Fast hands, fast feet, and then the crash.', cost: 100, max: 2, step: 1.5, fx: [{ item: 'stim_twitch' }] },
  { name: 'Cortex Clear Vial', blurb: 'The terminal flickers, and so does she.', cost: 100, max: 2, step: 1.5, fx: [{ item: 'stim_cortex' }] },
  { name: 'Silver Tongue Vial', blurb: 'Liquid charm in a glass vial.', cost: 90, max: 2, step: 1.5, fx: [{ item: 'stim_silver' }] },
  { name: 'Can of Spray Paint', blurb: 'The lab assistant doesn\'t ask what it\'s for.', cost: 40, max: 3, step: 1.4, fx: [{ item: 'spray_can' }] },
  { name: 'Molotov Mule', blurb: 'A cocktail with a use for glass.', cost: 90, max: 3, step: 1.4, fx: [{ item: 'cocktail_molotov' }] },
]);

shelf(lab, 'perfect', 'The perfect print', ['rebuild.1', 'bench.2'], [
  { name: 'Perfect Rebuild', blurb: 'The assistant stays up all night. The assistant has never been prouder.', cost: 8000, fx: [{ level: 2 }, { hp: 40 }, { comp: 0.05 }, { perk: 'discount', n: 5 }] },
]);

// ====================================================================== arsenal

const arsenal = branch('arsenal', 'Arsenal', 'What she starts the night holding, and what it\'s loaded with.');

chain(arsenal, 'blade', 'Close quarters', [], [
  { name: 'Kitchen Cleaver', blurb: 'Liberated from the Halo. Dutch will never know.', cost: 100, fx: [{ weapon: 'cleaver' }] },
  { name: '"Judgment"', blurb: 'The bat. A little ashamed to be borrowed.', cost: 380, fx: [{ weapon: 'judgment' }] },
  { name: 'Arc Gauntlet', blurb: 'Handshakes that end the conversation.', cost: 950, fx: [{ weapon: 'arc_gauntlet' }] },
  { name: 'Monofilament Whip', blurb: 'The sound it makes is the sound of a bad time.', cost: 2600, fx: [{ weapon: 'monowhip' }] },
  { name: 'Thermal Katana', blurb: 'A knight\'s sword, as seen from the future.', cost: 6500, fx: [{ weapon: 'thermal_katana' }] },
]);

chain(arsenal, 'guns', 'Sidearms', [], [
  { name: 'Zip Pistol', blurb: 'It\'s a pipe. It\'s a pipe that works.', cost: 160, fx: [{ weapon: 'zip_pistol' }, { ammo: 'slugs', n: 24 }] },
  { name: 'NPD Service Pistol', blurb: 'Surplus, with the serial number filed off.', cost: 420, fx: [{ weapon: 'service_pistol' }, { ammo: 'slugs', n: 24 }] },
  { name: 'Stunner Mk. III', blurb: 'Non-lethal. Mostly.', cost: 1000, fx: [{ weapon: 'stunner_mk3' }, { ammo: 'cells', n: 12 }] },
  { name: 'Riot Shotgun', blurb: 'Not a negotiating tool. A conclusion.', cost: 2200, fx: [{ weapon: 'riot_shotgun' }, { ammo: 'shells', n: 8 }] },
  { name: 'Rail Revolver', blurb: 'Six darts at the speed of sound.', cost: 4000, fx: [{ weapon: 'rail_revolver' }, { ammo: 'rails', n: 6 }] },
  { name: 'Gauss SMG', blurb: 'A magnet, a trigger and a bad day for somebody.', cost: 5500, fx: [{ weapon: 'gauss_smg' }, { ammo: 'gauss', n: 40 }] },
  { name: 'Helix Pulse Rifle', blurb: 'Corporate. Efficient. Billed monthly.', cost: 8500, fx: [{ weapon: 'pulse_rifle' }, { ammo: 'cells', n: 12 }] },
]);

shelf(arsenal, 'ammo', 'Ammo locker', ['guns.1'], [
  { name: 'Slug Box', blurb: 'A box of slugs. No questions.', cost: 40, max: 4, step: 1.3, fx: [{ ammo: 'slugs', n: 24 }] },
  { name: 'Shell Case', blurb: 'A case of shells. Heavy.', cost: 60, max: 4, step: 1.3, fx: [{ ammo: 'shells', n: 8 }] },
  { name: 'Rail Darts', blurb: 'A case of rail darts. Cold to the touch.', cost: 90, max: 4, step: 1.3, fx: [{ ammo: 'rails', n: 6 }] },
  { name: 'Gauss Cartridges', blurb: 'A drum of pellets. Do not shake.', cost: 130, max: 4, step: 1.3, fx: [{ ammo: 'gauss', n: 40 }] },
  { name: 'Energy Cell Pack', blurb: 'A pack of cells. Humming.', cost: 100, max: 4, step: 1.3, fx: [{ ammo: 'cells', n: 12 }] },
]);

shelf(arsenal, 'edge', 'Know-how', ['blade.1'], [
  { name: 'Grip Training', blurb: 'Hold the sharp end away from yourself.', cost: 200, max: 3, fx: [{ skill: 'melee', lvl: 1 }] },
  { name: 'Sights Training', blurb: 'Aim down the thing. Fire the thing.', cost: 200, max: 3, fx: [{ skill: 'marksmanship', lvl: 1 }] },
  { name: 'Quickdraw Drills', blurb: 'The holster is in the other direction.', cost: 400, max: 2, needs: ['guns.2'], fx: [{ skill: 'marksmanship', lvl: 1 }, { stat: 'reflex', n: 1 }] },
  { name: 'Dojo in a Box', blurb: 'A holographic sensei with a very thick accent.', cost: 400, max: 2, needs: ['blade.2'], fx: [{ skill: 'melee', lvl: 1 }, { stat: 'muscle', n: 1 }] },
]);

// ====================================================================== the skill branches

/** Skill trees are made, not written, so every skill in the game has one. The price of a line follows how often the skill matters. */
const WORTH: Partial<Record<SkillId, number>> = {
  melee: 1.6, marksmanship: 1.6, athletics: 1.5, medicine: 1.5,
  sneak: 1.3, streetwise: 1.3, throwing: 1.3, intimidation: 1.3, tinkering: 1.3, haggling: 1.3, scavenging: 1.3, hustling: 1.3,
  beatbox: 0.6, pool: 0.6, mixology: 0.6, cooking: 0.6, rapport: 0.6,
};

const skillBranch = (id: string, label: string, blurb: string, groups: SkillGroup[], extra: SkillId[] = [], skip: SkillId[] = []): BranchDef => {
  const b = branch(id, label, blurb);
  const members = SKILL_IDS.filter((s) => (groups.includes(SKILLS[s].group) || extra.includes(s)) && !skip.includes(s));
  for (const s of members) skillLine(b, s);
  return b;
};

const stage = skillBranch('stagecraft', 'Stagecraft', 'Music, performance, and the fine art of being heard through a wall. Mostly a luxury.', ['music']);
const brawl = skillBranch('brawl', 'Brawl', 'Aim and body: the things that decide the fights.', ['aim', 'body']);
const ghost = skillBranch('ghost', 'Ghost', 'Stealth and tech. Nobody saw anything.', ['stealth'], ['tinkering']);
const charm = skillBranch('charm', 'Charm', 'Everything that works on people.', ['social']);
const hustle = skillBranch('hustle', 'Hustle', 'Craft, care and the gig economy.', ['craft'], [], ['tinkering']);

function skillLine(b: BranchDef, s: SkillId): void {
  const d = SKILLS[s];
  const w = WORTH[s] ?? 1;
  const c = (n: number) => Math.round((n * w) / 5) * 5 || 5;
  chain(b, s, d.label, [], [
    { name: `${cap(d.label)}: Quick Study`, blurb: `Learns ${d.label} faster than she has any right to.`, cost: c(30), max: 3, step: 1.6, fx: [{ grow: s, pct: 25 }] },
    { name: `${cap(d.label)}: Head Start`, blurb: `Already knows a little ${d.label} when she wakes up: "${d.titles[0]}."`, cost: c(70), max: 3, step: 1.7, fx: [{ skill: s, lvl: 1 }] },
    { name: `${cap(d.label)}: Prodigy`, blurb: 'Teachers stop trying to explain it and start taking notes.', cost: c(260), max: 2, step: 1.9, needs: [`${s}.1:2`], fx: [{ grow: s, pct: 40 }] },
    { name: `${cap(d.label)}: Master`, blurb: `Becomes: "${d.titles[3]}".`, cost: c(900), needs: [`${s}.2:3`], fx: [{ skill: s, lvl: 2 }, { grow: s, pct: 50 }] },
  ]);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// The roots of each branch: lines that grow a whole group at once, which is the first thing most people buy.
const groupLine = (b: BranchDef, id: string, label: string, specs: Spec[]) => shelf(b, id, label, [], specs);

groupLine(stage, 'ear', 'Ear training', [
  { name: 'Ear Training', blurb: 'The music is in everything. Especially the sirens.', cost: 40, max: 4, step: 1.5, fx: [{ grow: 'music', pct: 15 }] },
  { name: 'Gig Bag', blurb: 'A bag with a pick, a cable and a number for a promoter.', cost: 120, max: 3, step: 1.5, fx: [{ fame: 2 }] },
  { name: 'Vintage Guitar', blurb: 'Previous owner: a band. They did not discuss terms.', cost: 650, fx: [{ item: 'vintage_guitar' }] },
  { name: 'Stage Presence', blurb: 'The crowd turns before the first chord.', cost: 700, max: 3, step: 1.7, fx: [{ fame: 5 }, { stat: 'charm', n: 1 }] },
]);

groupLine(brawl, 'drill', 'Combat drills', [
  { name: 'Sparring Partner', blurb: 'A hologram that hits back. Barely.', cost: 120, max: 4, step: 1.6, fx: [{ grow: 'aim', pct: 15 }] },
  { name: 'Body Conditioning', blurb: 'Pushups, a number of them.', cost: 130, max: 4, step: 1.6, fx: [{ grow: 'body', pct: 15 }] },
  { name: 'Fight Choreography', blurb: 'Every fight, a little more of a dance.', cost: 900, max: 3, step: 1.9, fx: [{ grow: 'aim', pct: 20 }, { grow: 'body', pct: 20 }] },
]);

groupLine(ghost, 'shadow', 'Shadow work', [
  { name: 'Soft Soles', blurb: 'Her boots stop making a statement.', cost: 90, max: 4, step: 1.6, fx: [{ grow: 'stealth', pct: 15 }] },
  { name: 'Burner Hands', blurb: 'Fingerless gloves with a small camera in the palm.', cost: 250, max: 3, step: 1.7, fx: [{ grow: 'stealth', pct: 20 }, { grow: 'tinkering', pct: 20 }] },
  { name: 'Ghost in the Wires', blurb: 'The cameras file her under "weather."', cost: 1100, max: 2, step: 2, fx: [{ stat: 'hack', n: 1 }, { skill: 'sneak', lvl: 1 }] },
]);

groupLine(charm, 'rep', 'Reputation', [
  { name: 'Social Training', blurb: 'She practiced in the mirror, which helped.', cost: 90, max: 4, step: 1.6, fx: [{ grow: 'social', pct: 15 }] },
  { name: 'Back-pocket Introductions', blurb: 'She knows a girl who knows a guy.', cost: 300, max: 3, step: 1.7, fx: [{ fame: 3 }, { skill: 'streetwise', lvl: 1 }] },
  { name: 'Silver Tongue', blurb: 'The truth, remixed.', cost: 1200, max: 2, step: 2, fx: [{ grow: 'social', pct: 30 }, { stat: 'charm', n: 1 }] },
]);

groupLine(hustle, 'trade', 'Trade skills', [
  { name: 'Odd-job Network', blurb: 'The same six people hire her.', cost: 80, max: 4, step: 1.6, fx: [{ grow: 'craft', pct: 15 }] },
  { name: 'Toolbelt', blurb: 'A screwdriver, a bit of wire, and a good attitude.', cost: 220, max: 3, step: 1.7, fx: [{ skill: 'tinkering', lvl: 1 }, { skill: 'scavenging', lvl: 1 }] },
  { name: 'Union Card', blurb: 'She is, technically, a professional.', cost: 1000, max: 2, step: 2, fx: [{ grow: 'craft', pct: 30 }, { skill: 'hustling', lvl: 1 }] },
]);

// A few crossovers that need two lines' worth of effort.
shelf(stage, 'mix_stage', 'Crossover', ['beatbox.1', 'djing.1'], [
  { name: 'Mixtape', blurb: 'Beats from a person and from a machine, and a handful of her friends.', cost: 420, max: 3, step: 1.7, needs: ['beatbox.2', 'djing.2'], fx: [{ grow: 'music', pct: 30 }, { fame: 2 }] },
]);
shelf(brawl, 'mix_brawl', 'Crossover', ['melee.1', 'athletics.1'], [
  { name: 'Parkour Strike', blurb: 'She hits from a wall.', cost: 900, max: 2, step: 1.9, needs: ['melee.2', 'athletics.2'], fx: [{ stat: 'reflex', n: 1 }, { stat: 'muscle', n: 1 }] },
]);
shelf(ghost, 'mix_ghost', 'Crossover', ['lockpicking.1', 'sneak.1'], [
  { name: 'Burglar\'s Kit', blurb: 'A hat, a bag, and a quiet little cough.', cost: 700, max: 2, step: 1.8, needs: ['lockpicking.2', 'sneak.2'], fx: [{ skill: 'sleight', lvl: 1 }, { grow: 'stealth', pct: 25 }] },
]);
shelf(charm, 'mix_charm', 'Crossover', ['romance.1', 'dancing.1'], [
  { name: 'Smooth Operator', blurb: 'A dip. A spin. Her number, written on a napkin.', cost: 750, max: 2, step: 1.8, needs: ['romance.2', 'dancing.2'], fx: [{ stat: 'charm', n: 1 }, { grow: 'romance', pct: 30 }] },
]);
shelf(hustle, 'mix_hustle', 'Crossover', ['cooking.1', 'mixology.1'], [
  { name: 'Kitchen Chemistry', blurb: 'If it is edible, it is food. If it isn\'t, it\'s a drink.', cost: 600, max: 2, step: 1.8, needs: ['cooking.2', 'mixology.2'], fx: [{ skill: 'medicine', lvl: 1 }, { grow: 'craft', pct: 25 }] },
]);

// ====================================================================== reading it

export const TREE: readonly BranchDef[] = BRANCHES;
export const NODES: Readonly<Record<string, UpgradeDef>> = UPGRADES;
export const NODE_IDS: readonly string[] = Object.keys(UPGRADES);

/** Where a need names a rank, split it out. */
export function parseNeed(n: Need): { id: string; rank: number } {
  const [id, r] = n.split(':');
  return { id: id!, rank: r ? Number(r) : 1 };
}

const GROUP_LABELS: Record<string, string> = { music: 'music', aim: 'aim', body: 'body', stealth: 'stealth', social: 'social', craft: 'craft', all: 'every skill' };

/** One line per effect, in plain language, for the lab's price tag. */
export function describeFx(fx: Fx, itemName: (id: string) => string, implantName: (id: string) => string): string {
  if ('stat' in fx) return `${fx.n > 0 ? '+' : ''}${fx.n} ${fx.stat}`;
  if ('hp' in fx) return `+${fx.hp} max HP`;
  if ('cash' in fx) return `+${fx.cash}nd to start`;
  if ('comp' in fx) return `+${Math.round(fx.comp * 100)} competence`;
  if ('level' in fx) return `starts ${fx.level} level${fx.level === 1 ? '' : 's'} up`;
  if ('grow' in fx) return `${fx.grow in SKILLS ? SKILLS[fx.grow as SkillId].label : GROUP_LABELS[fx.grow]} grows ${fx.pct}% faster`;
  if ('skill' in fx) return `starts with ${SKILLS[fx.skill].label} +${fx.lvl}`;
  if ('item' in fx) return `starts with ${(fx.n ?? 1) > 1 ? `${fx.n} × ` : 'a '}${itemName(fx.item)}`;
  if ('ammo' in fx) return `+${fx.n} ${AMMO[fx.ammo]?.label ?? fx.ammo}`;
  if ('implant' in fx) return `fitted with ${implantName(fx.implant)}`;
  if ('weapon' in fx) return `starts with ${itemName(fx.weapon)}`;
  if ('armor' in fx) return `starts in ${itemName(fx.armor)}`;
  if ('trait' in fx) return `${fx.trait} ${fx.n > 0 ? 'up' : 'down'} ${Math.round(Math.abs(fx.n) * 100)}`;
  if ('fame' in fx) return `starts with ${fx.fame} fame`;
  switch (fx.perk) {
    case 'fee': return `drop points take ${fx.n} points less`;
    case 'keep': return `${fx.n}% of carried cash survives her death`;
    case 'interest': return `+${fx.n}% interest on the balance each rebuild`;
    case 'discount': return `${fx.n}% off lab prices`;
    case 'xp': return `+${fx.n}% XP`;
    case 'heal': return `med kits heal ${fx.n}% more`;
    case 'bank': return fx.n > 1 ? `much keener on drop points` : 'keener on drop points';
  }
}
