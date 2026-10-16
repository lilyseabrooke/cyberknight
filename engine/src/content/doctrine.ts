/**
 * Doctrine: the lab's combat routines. Six branches, one for each way Blackbird fights, flashed into
 * the body before she wakes up. Pure data; `tree.ts` turns it into nodes and `doctrine.ts` (the engine
 * half) turns the ranks into things that happen in a fight.
 *
 * Rules of the house:
 * - Every node is bought in ranks and does something a little bigger with each. `per` is the number one
 *   rank adds (percentage points unless the text says otherwise).
 * - A weapon branch's skills only work while she is holding a weapon of that branch. General works with anything.
 * - Each branch opens with a **base** node (ten ranks of plain damage, or damage reduction for General). It is the
 *   gate: everything else in the branch needs a few ranks of it. Nothing here asks for skill levels, because she
 *   is built before she has any.
 * - Nothing is once-per-fight or once-per-night. Strong things are chances, passives or cooldowns.
 */

export type ArtBranch = 'blades' | 'blunt' | 'small' | 'heavy' | 'precision' | 'general';
export type ArtKind = 'passive' | 'active' | 'capstone';

export interface ArtSpec {
  /** The id the engine looks up (`Fx.art`). */
  id: string;
  name: string;
  /** The joke. What it does is generated from `text`. */
  blurb: string;
  /** One rank, in plain words. `{n}` is `per`. */
  text: string;
  per: number;
  cost: number;
  max: number;
  /** Price multiplier per rank. */
  step?: number;
  kind?: ArtKind;
  /** Other arts in the same branch this one needs (any rank), on top of the node before it in its line. */
  needs?: string[];
}

export interface ArtLine {
  id: string;
  label: string;
  arts: ArtSpec[];
}

export interface ArtBranchDef {
  id: ArtBranch;
  label: string;
  blurb: string;
  /** What this branch's skills need her to be holding. */
  holds: string;
  base: ArtSpec;
  lines: ArtLine[];
}

/** Ranks of the base node every other node in the branch wants first. */
export const BASE_GATE = 3;

const p = (id: string, name: string, blurb: string, text: string, per: number, max: number, cost: number, o: Partial<ArtSpec> = {}): ArtSpec => ({
  id, name, blurb, text, per, max, cost, step: 1.45, kind: 'passive', ...o,
});
const act = (id: string, name: string, blurb: string, text: string, per: number, max: number, cost: number, o: Partial<ArtSpec> = {}): ArtSpec =>
  p(id, name, blurb, text, per, max, cost, { kind: 'active', step: 1.5, ...o });
const cap = (id: string, name: string, blurb: string, text: string, per: number, max: number, cost: number, o: Partial<ArtSpec> = {}): ArtSpec =>
  p(id, name, blurb, text, per, max, cost, { kind: 'capstone', step: 1.55, ...o });

// ====================================================================== blades

const blades: ArtBranchDef = {
  id: 'blades',
  label: 'Blades',
  holds: 'a knife, blade or whip',
  blurb: 'Edges, wounds and a very good sense of when to be somewhere else. Needs a blade in her hand.',
  base: p('edge_mastery', 'Edge Mastery', 'Cuts a little deeper every time she practices. She practices on furniture.', '+{n}% damage with knives, blades and whips', 4, 10, 60, { step: 1.28 }),
  lines: [
    {
      id: 'bld_blood', label: 'Bloodletting',
      arts: [
        p('open_veins', 'Open Veins', 'The cut keeps going after the sword has left.', '{n}% chance a hit makes the foe bleed (stacks to three; ignores armor; robots do not bleed)', 8, 5, 200),
        p('fear_blood', 'Fear the Blood', 'Most people stop being brave when they are leaving a trail.', 'bleeding foes run sooner (+{n}% to their nerve breaking) and aim worse', 5, 4, 380),
        cap('executioner', 'Executioner', 'Finishes what the cutting started, with ceremony.', '+{n}% damage against foes under a quarter health', 12, 3, 4200, { needs: ['open_veins', 'keen_edge'] }),
      ],
    },
    {
      id: 'bld_duel', label: 'Duelist',
      arts: [
        p('keen_edge', 'Keen Edge', 'Honed until it has opinions.', '+{n}% crit chance with blades', 3, 5, 180),
        p('cutting_edge', 'Cutting Edge', 'Finds the gap in the armor, every time. It is a short gap.', 'crits slip past {n}% of armor', 12, 4, 320),
        act('lunge', 'Lunge', 'The distance between her and the problem is a suggestion.', 'dash-and-strike from {n} tile further away (starts at 3), hits harder, cooldown shortens', 1, 4, 560),
        p('riposte', 'Riposte', 'You missed. She did not.', '{n}% chance to cut back when a melee foe misses her', 6, 5, 300),
        p('deflect', 'Deflect', 'Bullets are only very fast arguments.', '{n}% chance to bat a ranged hit away (and nick the shooter)', 6, 5, 420),
        p('blade_dance', 'Blade Dance', 'One down, and she is already moving.', '{n}% chance a kill gives her a free move and strike', 8, 4, 480),
      ],
    },
    {
      id: 'bld_whirl', label: 'Footwork & fear',
      arts: [
        act('whirl', 'Whirl', 'A cut in every direction, for everybody.', 'strikes every adjacent foe: +{n}% strength (starts at 50%), cooldown shortens', 10, 4, 600),
        p('hamstring', 'Hamstring', 'They are going to need to sit down.', '{n}% chance a hit slows the foe', 6, 4, 280),
        p('disarm', 'Disarm', 'The weapon goes one way. The wrist goes the other.', '{n}% chance a hit takes the foe\'s weapon, cutting their damage', 5, 4, 340),
        p('backstab', 'Backstab', 'Politeness is for the front.', '+{n}% damage against foes who have not noticed her, or are flanked', 8, 4, 260),
        p('clean_kill', 'Clean Kill', 'Nobody heard a thing. That is the idea.', '{n}% chance a quiet kill keeps the room unaware a round longer', 15, 3, 300),
      ],
    },
  ],
};

// ====================================================================== blunt

const blunt: ArtBranchDef = {
  id: 'blunt',
  label: 'Blunt',
  holds: 'a club or gauntlet',
  blurb: 'Stuns, knockback, broken bones and splash damage. Needs a club or a gauntlet in her hand.',
  base: p('heavy_hitter', 'Heavy Hitter', 'It is not about finesse. It is about mass, delivered.', '+{n}% damage with clubs and gauntlets', 4, 10, 60, { step: 1.28 }),
  lines: [
    {
      id: 'blt_conc', label: 'Concussion',
      arts: [
        p('ringing_bell', 'Ringing Bell', 'Her swing rings like a church. The foe hears it from the inside.', '{n}% chance a hit stuns', 5, 5, 200),
        p('skullcracker', 'Skullcracker', 'A stunned head is a polite invitation.', '{n}% chance a hit on a stunned foe knocks them out cold', 6, 4, 420),
        p('stagger', 'Stagger', 'They get up, but not in order.', 'stunned and knocked-back foes act {n} places later next round', 3, 4, 300),
        cap('wrecking_ball', 'Wrecking Ball', 'She is not holding the weapon any more. The weapon is holding her.', 'hits on stunned or crippled foes ignore armor and deal +{n}% damage', 12, 3, 4200, { needs: ['ringing_bell', 'crippler'] }),
      ],
    },
    {
      id: 'blt_mom', label: 'Momentum',
      arts: [
        act('haymaker', 'Haymaker', 'A telegraphed punch that gets there anyway.', 'knocks a foe back (farther at ranks 1, 3), harder into walls and people; cooldown shortens', 1, 4, 520),
        act('bulldoze', 'Bulldoze', 'She does not go around.', 'charge from {n} tile further away (starts at 3), shoving the foe aside; cooldown shortens', 1, 3, 600, { needs: ['haymaker'] }),
        act('pile_driver', 'Pile Driver', 'One big swing, straight down.', 'a heavy slam that always stuns: +{n}% damage (starts at 150%), cooldown shortens', 15, 4, 700, { needs: ['haymaker'] }),
        p('follow_through', 'Follow-Through', 'The swing keeps going. So does she.', '{n}% chance a kill gives her a free swing', 8, 4, 440),
      ],
    },
    {
      id: 'blt_break', label: 'Breaker',
      arts: [
        p('crippler', 'Crippler', 'Bones are only structure. Structure can be argued with.', '{n}% chance a hit breaks a limb (a leg slows and pins them, an arm cuts their damage, ribs cut their aim)', 6, 5, 260),
        p('guard_break', 'Guard Break', 'Armor is just a thing she has not hit hard enough yet.', 'each hit strips {n}% of the foe\'s armor for the fight', 8, 4, 320),
        p('brutal_presence', 'Brutal Presence', 'The look in her eye after the first hit.', 'hurt foes lose their nerve {n}% sooner', 5, 4, 300),
        act('aftershock', 'Aftershock', 'It hits the target, then the room.', 'the swing also hits foes next to the target: +{n}% strength (starts at 40%), cooldown shortens', 10, 4, 560),
      ],
    },
    {
      id: 'blt_gaunt', label: 'Gauntlet work',
      arts: [
        p('shock_knuckles', 'Shock Knuckles', 'Gauntlets only. The buzz goes the extra mile.', '{n}% chance a stun jumps to a foe next to the target', 8, 4, 280),
        p('static_punch', 'Static Punch', 'Gauntlets only. Robots hate this one trick.', '+{n}% damage against robots, and a chance to lock them up', 10, 3, 340),
      ],
    },
  ],
};

// ====================================================================== small arms

const small: ArtBranchDef = {
  id: 'small',
  label: 'Small Arms',
  holds: 'a pistol or energy sidearm',
  blurb: 'Fast hands, trick shots and a very good relationship with ammunition. Needs a pistol or sidearm in her hand.',
  base: p('sidearm_mastery', 'Sidearm Mastery', 'Point, press, repeat. She has refined the pointing.', '+{n}% damage with pistols and energy sidearms', 4, 10, 60, { step: 1.28 }),
  lines: [
    {
      id: 'sml_draw', label: 'Gunslinger',
      arts: [
        p('quick_draw', 'Quick Draw', 'The holster opens before the thought finishes.', '+{n} initiative with sidearms', 1, 5, 180),
        act('fan_hammer', 'Fan the Hammer', 'Two shots for the price of one trigger finger.', 'a two-shot burst: +{n}% accuracy, cooldown shortens', 3, 4, 540),
        p('double_tap', 'Double Tap', 'If it worked once, it will work twice.', '{n}% chance a hit fires a bonus shot', 7, 5, 300),
        p('trick_shot', 'Trick Shot', 'The wall was not an obstacle. It was a tool.', '{n}% chance a shot ricochets into a second foe', 6, 4, 440),
        cap('gunslingers_luck', 'Gunslinger\'s Luck', 'Every shot has a little extra on it, and she has no idea where it came from.', '{n}% chance any shot is an automatic crit', 5, 3, 4200, { needs: ['double_tap', 'trick_shot'] }),
      ],
    },
    {
      id: 'sml_move', label: 'Mobility',
      arts: [
        p('shoot_scoot', 'Shoot and Scoot', 'Never be where the return fire is.', '{n}% chance of a free step away after firing', 7, 4, 280),
        p('hip_fire', 'Hip Fire', 'Aiming is for people with time.', '+{n}% accuracy against targets within two tiles', 3, 5, 240),
        act('pistol_whip', 'Pistol Whip', 'The other end of the gun is also a weapon. It is a rude end.', 'a melee strike with the gun that stuns: +{n}% damage (starts at 70%), cooldown shortens', 10, 4, 500),
      ],
    },
    {
      id: 'sml_dirty', label: 'Dirty tricks',
      arts: [
        p('disarming_shot', 'Disarming Shot', 'Aim for the thing they are pointing back.', '{n}% chance a shot takes the foe\'s weapon', 5, 4, 340),
        p('kneecapper', 'Kneecapper', 'They will not be doing much running.', '{n}% chance a shot slows the foe', 6, 4, 300),
        p('hot_cells', 'Hot Cells', 'Energy sidearms only. The cell runs hot, and so does the target.', '{n}% chance a shot sets the foe burning', 7, 4, 320),
      ],
    },
    {
      id: 'sml_eff', label: 'Efficiency',
      arts: [
        p('reload_drills', 'Reload Drills', 'She counts the rounds. She counts them wrong, but in her favor.', '{n}% chance a shot costs no ammo', 6, 5, 220),
        p('scavenger', 'Scavenger', 'A downed foe has a pocket. The pocket has bullets.', '{n}% chance a kill drops a few rounds she can use', 15, 4, 260),
      ],
    },
  ],
};

// ====================================================================== heavy

const heavy: ArtBranchDef = {
  id: 'heavy',
  label: 'Heavy',
  holds: 'a shotgun or SMG',
  blurb: 'Cones, pressure and a lot of noise. Needs a shotgun or SMG in her hand.',
  base: p('heavy_ordnance', 'Heavy Ordnance', 'If it is loud, it is working.', '+{n}% damage with shotguns and SMGs', 4, 10, 60, { step: 1.28 }),
  lines: [
    {
      id: 'hvy_shot', label: 'Close and loud',
      arts: [
        p('point_blank', 'Point Blank', 'The best accuracy is proximity.', '+{n}% damage within two tiles', 4, 5, 200),
        p('breach', 'Breach', 'Doors, walls and people all have the same answer.', '{n}% chance a shot knocks the foe back', 6, 4, 360),
        act('buckshot_wall', 'Buckshot Wall', 'The room is full of shot. So are the people in it.', 'a blast on the target and the foes near them: +{n}% splash strength (starts at 50%), wider at rank 3, cooldown shortens', 5, 4, 580),
        p('stopping_power', 'Stopping Power', 'Big shots tend to make the other party sit down.', '{n}% chance a hit stuns', 4, 4, 340),
      ],
    },
    {
      id: 'hvy_supp', label: 'Suppression',
      arts: [
        act('suppressive_fire', 'Suppressive Fire', 'Not hitting them is a plan. Keeping their heads down is a plan.', 'a foe in her sights loses accuracy for two rounds and may be pinned (+{n}% pin chance); cooldown shortens', 4, 4, 520),
        act('spray_and_pray', 'Spray and Pray', 'It is a lot of bullets. Some of them find somebody.', 'a burst on up to three foes: +{n}% strength each (starts at 35%), cooldown shortens', 8, 4, 600),
        p('walking_fire', 'Walking Fire', 'The gun does not mind that she is moving.', '+{n}% accuracy on rounds she moved', 3, 5, 240),
        p('hair_trigger', 'Hair Trigger', 'Overwatch, but jumpy.', 'overwatch shots hit {n}% harder', 10, 4, 340),
        cap('barrage', 'Barrage', 'Everything she has, at once, in one direction.', 'an all-in blast on the target and everyone near them: +{n}% damage (starts at 140%); long cooldown', 15, 3, 4200, { kind: 'capstone', needs: ['spray_and_pray', 'buckshot_wall'] }),
      ],
    },
    {
      id: 'hvy_brute', label: 'Brute force',
      arts: [
        p('overpenetration', 'Overpenetration', 'The first guy slowed it down. The second guy still found out.', '{n}% chance a shot passes through to a foe near the target', 6, 4, 360),
        p('explosive_rounds', 'Explosive Rounds', 'Crits go off. In a good way.', 'crits burst for area damage ({n}% of the shot)', 10, 4, 420),
        p('cover_shredder', 'Cover Shredder', 'Cover is only a suggestion with enough lead behind it.', 'shots ignore {n}% of a foe\'s cover bonus', 20, 4, 300),
        p('brace', 'Brace', 'She plants her feet. The world can try.', '-{n}% damage taken on rounds she did not move', 4, 5, 260),
      ],
    },
  ],
};

// ====================================================================== precision

const precision: ArtBranchDef = {
  id: 'precision',
  label: 'Precision',
  holds: 'a rifle or beam rifle',
  blurb: 'Patience, distance and one very well-placed shot. Needs a rifle in her hand.',
  base: p('sharpshooter', 'Sharpshooter', 'Hits what she aims at. Aims at what she hits.', '+{n}% damage with rifles and beam rifles', 4, 10, 60, { step: 1.28 }),
  lines: [
    {
      id: 'prc_snipe', label: 'Sniper',
      arts: [
        p('steady_aim', 'Steady Aim', 'Breathe in, breathe out, shoot between.', '+{n}% accuracy if she did not move this round', 3, 5, 200),
        p('headshot', 'Headshot', 'Far away is the best place to be right.', '+{n}% crit chance at range (three tiles or more)', 4, 5, 360),
        p('eagle_eye', 'Eagle Eye', 'She can see the sign on the building across the city. It says "no".', 'distance costs {n}% less accuracy', 15, 4, 280),
        p('lead_shot', 'Lead Shot', 'They are moving. They are always moving. She leads.', '+{n}% accuracy against foes that moved this round', 4, 4, 300),
        cap('one_shot', 'One Shot, One Kill', 'Hold it. Hold it. Now.', '{n}% chance to kill a badly wounded foe outright, from range', 6, 3, 4200, { needs: ['headshot', 'mark_target'] }),
      ],
    },
    {
      id: 'prc_hunt', label: 'Hunter',
      arts: [
        act('mark_target', 'Mark Target', 'A dot on the forehead. The dot is optimistic.', 'a marked foe takes +{n}% damage from her for three rounds; cooldown shortens', 6, 4, 480),
        p('cripple_shot', 'Cripple Shot', 'Not a kill. A statement.', '{n}% chance a shot slows or pins the foe', 5, 4, 340),
        act('pin_down', 'Pin Down', 'A shot to the ground in front of them. They stop.', 'an aimed shot pins a foe in place (longer at rank 3); cooldown shortens', 1, 3, 540),
        p('overwatch_master', 'Overwatch Master', 'Waiting is a skill. Hitting after is another.', '+{n}% crit chance on overwatch shots', 8, 4, 320),
        p('patient_hunter', 'Patient Hunter', 'It is a long fight. She has all the time in the world.', '+{n}% damage for each round the fight has gone on (up to five)', 2, 5, 360),
      ],
    },
    {
      id: 'prc_ghost', label: 'Ghost & gear',
      arts: [
        p('suppressed_shot', 'Suppressed Shot', 'Pfft. That was a shot. Nobody noticed.', '{n}% chance a shot leaves the room unaware a round longer', 15, 3, 280),
        p('dead_still', 'Dead Still', 'If she does not move, the eye does not find her.', 'foes hit her {n}% less on rounds she stayed put', 3, 5, 260),
        p('tungsten_tip', 'Tungsten Tip', 'Armor is a nice idea.', 'shots pierce {n} more armor', 1, 5, 340),
        p('thermal_optics', 'Thermal Optics', 'Walls are less of a barrier when everyone is a candle.', 'cover protects foes {n}% less', 20, 4, 380),
      ],
    },
  ],
};

// ====================================================================== general

const general: ArtBranchDef = {
  id: 'general',
  label: 'Combat',
  holds: 'anything',
  blurb: 'Hardiness, dodging, nerve and tactics. Works with any weapon, or none.',
  base: p('thick_skin', 'Thick Skin', 'Her skin has been told not to take this personally.', '-{n}% damage taken in fights', 3, 10, 80, { step: 1.28 }),
  lines: [
    {
      id: 'gen_vit', label: 'Vitality',
      arts: [
        p('regen', 'Steady Regeneration', 'The body keeps itself together, mostly out of spite.', 'heals {n}% of max HP each round in a fight, and a trickle between fights', 1, 4, 420, { step: 1.55 }),
        p('leech', 'Leech', 'Whatever she takes out of them, a little of it comes home.', 'heals {n}% of the damage she deals', 2, 5, 340),
        p('pain_tolerance', 'Pain Tolerance', 'The pain exists. She has simply stopped answering.', '{n}% chance to shrug off an injury from a blow', 8, 5, 240),
        p('last_gasp', 'Last Gasp', 'The blow that should have ended her leaves one hit point and a sense of humor.', '+{n}% chance a fatal blow leaves her on 1 HP instead', 10, 5, 700, { step: 1.6 }),
      ],
    },
    {
      id: 'gen_evade', label: 'Evasion',
      arts: [
        p('slip', 'Slip', 'The blow arrives. She has already left.', 'foes hit her {n}% less often (more on rounds she moved)', 2, 6, 260),
        p('roll_with_it', 'Roll with It', 'Going with the hit is a form of not taking it.', '{n}% chance to halve a hit', 4, 5, 300),
        p('mirage', 'Mirage', 'A dodge is only half a move. The other half is the counter.', '{n}% chance that after a foe misses her, her next strike cannot miss', 8, 4, 380),
        p('footwork', 'Footwork', 'Always on the balls of the feet.', '+1 movement every second rank', 1, 4, 340),
        p('counter_sense', 'Counter-Sense', 'She feels the ambush a moment before it arrives.', 'when she is jumped, foes hit her {n}% less in the first round', 6, 4, 320),
      ],
    },
    {
      id: 'gen_aggr', label: 'Aggression',
      arts: [
        p('adrenaline', 'Adrenaline', 'The worse it gets, the better she hits.', '+{n}% damage while below half health', 4, 5, 300),
        p('momentum', 'Momentum', 'One down. The rest of them can see it coming.', '+{n}% damage for each foe she has put down this fight (up to four)', 3, 4, 380),
        p('intimidating_presence', 'Intimidating Presence', 'She walks in. Some of them remember appointments.', 'each round, foes have a {n}% chance to lose their nerve', 2, 5, 360),
        p('berserker', 'Berserker', 'Below a quarter health, she stops arguing with the plan.', '{n}% chance of a free action each round below a quarter health', 10, 4, 520),
        p('last_one_standing', 'Last One Standing', 'Outnumbered is a posture.', '+{n}% damage for each foe beyond her side (up to four)', 3, 4, 300),
      ],
    },
    {
      id: 'gen_tact', label: 'Tactics',
      arts: [
        p('flanking_instinct', 'Flanking Instinct', 'Behind them is the best side.', '+{n}% extra damage when flanking', 5, 4, 280),
        p('cover_savvy', 'Cover Savvy', 'A knee-high wall is a castle if you commit.', 'foes shooting at her in cover hit {n}% less often', 4, 4, 300),
        p('escape_artist', 'Escape Artist', 'There is always a door.', 'when she has had enough, she gets away {n}% more often', 6, 4, 260),
        cap('battle_sense', 'Battle Sense', 'The longer it goes, the more she sees.', 'each round after the first adds {n}% hit chance and {n}% crit chance (up to eight rounds)', 1, 3, 4200, { needs: ['flanking_instinct', 'cover_savvy', 'escape_artist', 'last_one_standing'] }),
      ],
    },
  ],
};

export const DOCTRINE: readonly ArtBranchDef[] = [general, blades, blunt, small, heavy, precision];

/** Every art by id. */
export const ARTS: Readonly<Record<string, ArtSpec & { branch: ArtBranch }>> = Object.fromEntries(
  DOCTRINE.flatMap((b) => [b.base, ...b.lines.flatMap((l) => l.arts)].map((a) => [a.id, { ...a, branch: b.id }])),
);

/** Which branch's weapon a weapon class belongs to. Fists (and anything else) belong to none. */
export const CLASS_BRANCH: Readonly<Record<string, ArtBranch>> = {
  knife: 'blades', blade: 'blades', whip: 'blades',
  club: 'blunt', gauntlet: 'blunt',
  pistol: 'small', energy: 'small',
  shotgun: 'heavy', smg: 'heavy',
  rifle: 'precision',
};

export const describeArt = (id: string, n: number): string => (ARTS[id]?.text ?? id).replace(/\{n\}/g, String(n));
