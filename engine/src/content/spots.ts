import { tierOfDanger } from '../grade';
import type { Rng } from '../rng';
import type { CacheKind, District } from '../types';
import type { GarrisonSlot, RoomDef } from './dungeons';

/**
 * Spots: small encounter places on the street, for the days she wants a bit of money and a fight without
 * spending the night on a whole dungeon. A gang's dead drop, an Atlas repair bay, a dealer's den.
 *
 * A spot is a one-room dungeon: it uses all the machinery in dungeons.ts (noticed or not, ambush, loot, cleared out,
 * filled up again), but with the rooms boiled down to one, a garrison of one to four, and one thing worth taking.
 * Each has a few **setups**: the same place on a different night (the drop is unguarded, or one runner is minding
 * it, or one is just arriving with a second bag). Which one it is gets rolled each time the place is garrisoned.
 *
 * **Paper.** Whoever is posted in a spot has a bounty on them, unless the place is Atlas's or the police's, whose
 * people don't have NPD paper (or the slot says `clean`, for the hired and the protected). The flip side: anyone
 * human with no bounty on them is the sort of person who is not supposed to be touched, so what they guard is
 * kept richer (see `richness` in dungeons.ts). Robots never have paper and never make a place richer.
 */

/** Whose it is: decides who the people are, and whether they have paper. */
export type Crew = 'gang' | 'atlas' | 'npd' | 'free';

/** (`clean` on a slot: no bounty on this one even in a place where everyone else has paper. The hired, the licensed, the protected.) */
export type SpotSlot = GarrisonSlot;

export interface Setup {
  weight: number;
  /** What is going on, as a sentence. Goes into what she sees. */
  scene: string;
  garrison: SpotSlot[];
  cache?: { kinds: CacheKind[]; chance: number };
}

export interface SpotDef {
  key: string;
  crew: Crew;
  /** What it is called. `{gang}` is "the Chrome Vipers'" and `{code}` is a number for Atlas and the police to use. */
  names: string[];
  /** What she sees the first time she walks up (`{name}` is the place). */
  blurbs: string[];
  /** Where it turns up, by district (absent means never). */
  districts: Partial<Record<District, number>>;
  /** The hardest and softest it ever gets. Default 1..4. */
  tiers?: [number, number];
  /** How much the place keeps against intruders (dogs, traps; see `rollRoomHazards`). Default 0.5: small places are not wired. */
  hazard?: number;
  /** Item ids that may also be in with the take, by the nature of the place. */
  extra?: string[];
  setups: Setup[];
}

const none: SpotSlot[] = [];

export const SPOTS: Record<string, SpotDef> = {
  // ================================================================ gangs
  dead_drop: {
    key: 'dead_drop', crew: 'gang',
    names: ['{gang} dead drop', '{gang} bag man\'s culvert', '{gang} drop under the flyover'],
    blurbs: [
      '{name}: a culvert mouth under a flyover, a loose brick at knee height and an awful lot of cigarette ends for a place nobody lives.',
      '{name}: a stairwell turn behind a shuttered noodle stand, a tag in somebody\'s colors and a drain cover that has been lifted far too often.',
    ],
    districts: { slum: 2, industrial: 2, tenement: 1.5, nightlife: 0.8, market: 0.5 },
    hazard: 0.3,
    setups: [
      { weight: 4, scene: 'Nobody is here. The bag is.', garrison: none, cache: { kinds: ['cash'], chance: 1 } },
      { weight: 3, scene: 'A runner is minding the bag, bored, with one boot on it.', garrison: [{ arch: 'gang_runner', count: [1, 1], perTier: 0.4 }], cache: { kinds: ['cash'], chance: 1 } },
      {
        weight: 2, scene: 'A runner is arriving with a second bag and has not looked up yet.',
        garrison: [{ arch: 'gang_runner', count: [1, 2], perTier: 0.5 }, { arch: 'gang_enforcer', count: [1, 1], minTier: 3 }],
        cache: { kinds: ['cash', 'stash'], chance: 1 },
      },
    ],
  },
  collection_day: {
    key: 'collection_day', crew: 'gang',
    names: ['{gang} collection stop', '{gang} protection round', '{gang} weekly pickup'],
    blurbs: ['{name}: a shop doorway with the shutters half down, a man counting notes into a stranger\'s hand and two others very interested in the street.'],
    districts: { market: 2, nightlife: 1.5, tenement: 1.5, slum: 1 },
    hazard: 0.2,
    setups: [
      { weight: 3, scene: 'Runners are collecting from a shopkeeper who is already counting out the second envelope.', garrison: [{ arch: 'gang_runner', count: [2, 2], perTier: 0.5 }], cache: { kinds: ['cash'], chance: 1 } },
      {
        weight: 2, scene: 'An enforcer is doing the collecting himself, with runners on the door.',
        garrison: [{ arch: 'gang_enforcer', count: [1, 1], minTier: 2 }, { arch: 'gang_runner', count: [1, 2], perTier: 0.4 }],
        cache: { kinds: ['cash'], chance: 1 },
      },
    ],
  },
  racket_booth: {
    key: 'racket_booth', crew: 'gang',
    names: ['{gang} "payments" booth', '{gang} permit kiosk', '{gang} toll window'],
    blurbs: ['{name}: a kiosk with a sign that says PAYMENTS in a friendly font, bulletproof glass and a cash drawer you can hear from the street.'],
    districts: { market: 1.5, nightlife: 2, tenement: 1 },
    hazard: 1,
    setups: [
      {
        weight: 1, scene: 'One runner sits behind the glass with the till at his boots.',
        garrison: [{ arch: 'gang_runner', count: [1, 1], perTier: 0.3 }, { arch: 'sentry_turret', count: [1, 1], minTier: 2, chance: 0.5 }],
        cache: { kinds: ['cash'], chance: 1 },
      },
    ],
  },
  turf_marker: {
    key: 'turf_marker', crew: 'gang',
    names: ['{gang} turf wall', '{gang} fresh tag', '{gang} border mural'],
    blurbs: ['{name}: a wall tagged so fresh it is still wet, a camera nobody pointed anywhere and a pair of people admiring their work.'],
    districts: { slum: 2, tenement: 1.5, industrial: 1 },
    hazard: 0.4,
    setups: [
      {
        weight: 1, scene: 'Two gangers are guarding their new paint, and a turret is guarding them.',
        garrison: [{ arch: 'gang_runner', count: [2, 2], perTier: 0.6 }, { arch: 'sentry_turret', count: [1, 1], minTier: 2, chance: 0.7 }],
        cache: { kinds: ['cash', 'supplies'], chance: 0.8 },
      },
    ],
  },
  chop_pop: {
    key: 'chop_pop', crew: 'gang',
    names: ['{gang} pop-up chop shop', '{gang} car-stripping yard', '{gang} parts lot'],
    blurbs: ['{name}: a stolen car on blocks, two sets of legs sticking out from under it and a cutting torch somebody has left running.'],
    districts: { industrial: 2, slum: 1.5, tenement: 0.5 },
    hazard: 0.6,
    extra: ['scrap_metal', 'scrap_metal', 'drone_core'],
    setups: [
      { weight: 3, scene: 'Two runners are stripping a stolen car. One is wearing the owner\'s jacket.', garrison: [{ arch: 'gang_runner', count: [2, 2], perTier: 0.5 }], cache: { kinds: ['arms', 'armor', 'supplies'], chance: 0.85 } },
      {
        weight: 2, scene: 'The crew\'s mechanic is minding the job with a salvage bot on the lift.',
        garrison: [{ arch: 'gang_runner', count: [1, 2], perTier: 0.4 }, { arch: 'gang_enforcer', count: [1, 1], minTier: 3 }, { arch: 'scrapper', count: [1, 1], minTier: 2 }],
        cache: { kinds: ['arms', 'armor'], chance: 0.9 },
      },
    ],
  },
  swap_meet: {
    key: 'swap_meet', crew: 'gang',
    names: ['{gang} van swap', '{gang} parking-garage swap', '{gang} back-of-a-truck trade'],
    blurbs: ['{name}: the top deck of a car park, two vans nose to nose with their back doors open and a handshake that has gone on too long.'],
    districts: { industrial: 2, nightlife: 1, market: 1 },
    tiers: [2, 4],
    hazard: 0.4,
    setups: [
      { weight: 3, scene: 'Two crews\' runners are trading bags out of the backs of vans. Neither is relaxed.', garrison: [{ arch: 'gang_runner', count: [3, 3], perTier: 0.7 }], cache: { kinds: ['stash'], chance: 1 } },
      {
        weight: 2, scene: 'A broker in a long coat is overseeing the trade from a folding chair, and does not get paid in bounties.',
        garrison: [{ arch: 'gang_runner', count: [2, 2], perTier: 0.5 }, { arch: 'fixer', count: [1, 1], clean: true, minTier: 3 }],
        cache: { kinds: ['stash'], chance: 1 },
      },
    ],
  },
  stash_flat: {
    key: 'stash_flat', crew: 'gang',
    names: ['{gang} stash flat', '{gang} safe house', '{gang} card-game flat'],
    blurbs: ['{name}: an apartment door with three more locks than the rest of the corridor and the sound of a card game on the other side.'],
    districts: { tenement: 2, slum: 1.5, nightlife: 0.5 },
    hazard: 1.2,
    setups: [
      {
        weight: 1, scene: 'Two runners are playing cards in front of a door that has too many locks.',
        garrison: [{ arch: 'gang_runner', count: [2, 2], perTier: 0.5 }, { arch: 'gang_enforcer', count: [1, 1], minTier: 2, chance: 0.5 }],
        cache: { kinds: ['stash', 'stash', 'supplies'], chance: 1 },
      },
    ],
  },
  dumpster_cache: {
    key: 'dumpster_cache', crew: 'gang',
    names: ['{gang} bin stash', '{gang} emergency fund', '{gang} dumpster lockbox'],
    blurbs: ['{name}: a dumpster with its lid taped shut in a pattern that means something to somebody, and a stairwell opposite with a good view of it.'],
    districts: { slum: 2, industrial: 1.5, tenement: 1.5, nightlife: 1, market: 0.5 },
    hazard: 0.2,
    setups: [
      { weight: 5, scene: 'Nobody is around. A bag is taped under the lid, as though hiding it from the dumpster.', garrison: none, cache: { kinds: ['cash', 'stash'], chance: 1 } },
      { weight: 3, scene: 'A lookout kid in the stairwell opposite is watching the bin and trying to look as though he isn\'t.', garrison: [{ arch: 'gang_runner', count: [1, 1], perTier: 0.3 }], cache: { kinds: ['cash', 'stash'], chance: 1 } },
    ],
  },
  fight_club: {
    key: 'fight_club', crew: 'gang',
    names: ['{gang} basement ring', '{gang} fight night', '{gang} cage match cellar'],
    blurbs: ['{name}: a basement stair, a smell of liniment and old beer and a floor drain that is working harder than it was designed to.'],
    districts: { nightlife: 1.5, industrial: 2, slum: 1.5 },
    hazard: 0.5,
    setups: [
      {
        weight: 1, scene: 'The ring is empty between bouts. A fighter is wrapping his hands, the bookie is counting the gate and the door is held by a runner.',
        garrison: [{ arch: 'gang_enforcer', count: [1, 1], minTier: 2 }, { arch: 'gang_runner', count: [1, 2], perTier: 0.4 }, { arch: 'bookie', count: [1, 1], chance: 0.7 }],
        cache: { kinds: ['cash'], chance: 1 },
      },
    ],
  },
  armored_van: {
    key: 'armored_van', crew: 'gang',
    names: ['{gang} cash-van job', '{gang} armored car hit', '{gang} van heist'],
    blurbs: ['{name}: a cash-in-transit van on its side across two lanes, its back doors cut open, its crew nowhere and its robbers still hauling.'],
    districts: { industrial: 2, corporate: 1.5, market: 1, nightlife: 1 },
    tiers: [2, 4],
    hazard: 0.3,
    setups: [
      {
        weight: 1, scene: 'The crew is still hauling bags out of the wreck. They are on a clock and they know it.',
        garrison: [{ arch: 'gang_runner', count: [2, 3], perTier: 0.5 }, { arch: 'gang_enforcer', count: [1, 1] }],
        cache: { kinds: ['cash', 'cash', 'stash'], chance: 1 },
      },
    ],
  },

  // ================================================================ vice
  dealer_den: {
    key: 'dealer_den', crew: 'gang',
    names: ['{gang} dealer\'s den', '{gang} trap flat', '{gang} corner house'],
    blurbs: ['{name}: a flat with its windows foiled over, a doorbell that has been taken out and a very faint chemical sweetness on the landing.'],
    districts: { slum: 2, tenement: 2, nightlife: 1.5 },
    hazard: 0.6,
    extra: ['stim', 'stim_twitch', 'stim_iron', 'neural_gum'],
    setups: [
      {
        weight: 1, scene: 'A dealer is weighing product on the kitchen counter, and a couple of hooligans on the couch are pretending not to be armed.',
        garrison: [{ arch: 'dealer', count: [1, 1] }, { arch: 'gang_runner', count: [1, 2], perTier: 0.5 }, { arch: 'gang_enforcer', count: [1, 1], minTier: 3, chance: 0.5 }],
        cache: { kinds: ['stash'], chance: 0.9 },
      },
    ],
  },
  pill_mill: {
    key: 'pill_mill', crew: 'gang',
    names: ['{gang} pill mill', '{gang} "pharmacy"', '{gang} grey-market clinic'],
    blurbs: ['{name}: an old laundromat with a green cross painted on the shutter by someone who had only heard of one, and a queue of people not looking at each other.'],
    districts: { market: 1.5, nightlife: 1, slum: 1.5, tenement: 1 },
    hazard: 0.4,
    extra: ['med_pack', 'patch_kit', 'trauma_kit', 'stim_cortex'],
    setups: [
      {
        weight: 1, scene: 'A chemist is counting grey bottles behind the counter. A runner has the door.',
        garrison: [
          { arch: 'street_chemist', count: [1, 1] }, { arch: 'gang_runner', count: [1, 1], perTier: 0.4 },
          { arch: 'doc', count: [1, 1], clean: true, minTier: 2, chance: 0.6 },
        ],
        cache: { kinds: ['supplies', 'stash'], chance: 1 },
      },
    ],
  },
  stim_lab: {
    key: 'stim_lab', crew: 'gang',
    names: ['{gang} rooftop still', '{gang} stim kitchen', '{gang} cook house'],
    blurbs: ['{name}: a rooftop with a gas rig, a tarp rigged as a roof and a smell that makes her implants itch.'],
    districts: { industrial: 2, slum: 1.5 },
    hazard: 1.5,
    extra: ['stim', 'stim_twitch', 'stim_iron', 'stim_silver'],
    setups: [
      {
        weight: 1, scene: 'The cook is the only one not wearing a mask, and the runner minding him is the one who ought to be.',
        garrison: [{ arch: 'street_chemist', count: [1, 2], perTier: 0.4 }, { arch: 'gang_runner', count: [1, 1], perTier: 0.4 }],
        cache: { kinds: ['stash'], chance: 1 },
      },
    ],
  },
  gambling_den: {
    key: 'gambling_den', crew: 'gang',
    names: ['{gang} card room', '{gang} backroom table', '{gang} dice game'],
    blurbs: ['{name}: a bike shop with its lights off and a back room with its lights very much on. Somebody is losing, loudly, to somebody who isn\'t.'],
    districts: { nightlife: 2, market: 1.5, tenement: 1 },
    hazard: 0.5,
    setups: [
      {
        weight: 1, scene: 'The house is dealing a hand. The bookie is keeping score, two runners keep the door and a cop on the take keeps the peace.',
        garrison: [
          { arch: 'bookie', count: [1, 1] }, { arch: 'gang_runner', count: [2, 2], perTier: 0.5 },
          { arch: 'cop', count: [1, 1], clean: true, minTier: 2, chance: 0.5 },
        ],
        cache: { kinds: ['cash'], chance: 1 },
      },
    ],
  },
  rave_dock: {
    key: 'rave_dock', crew: 'gang',
    names: ['{gang} loading-dock party', '{gang} warehouse rave', '{gang} dock disco'],
    blurbs: ['{name}: a loading dock with a rig, a strobe and a bass line you can feel through your boots, and not a single guest.'],
    districts: { industrial: 2, nightlife: 2 },
    hazard: 0.4,
    extra: ['stim', 'stim_twitch', 'neural_gum', 'walkman'],
    setups: [
      {
        weight: 1, scene: 'The party has not started. The dealer is setting up, the runners are setting up the dealer and the DJ rig is worth stealing.',
        garrison: [{ arch: 'dealer', count: [1, 1] }, { arch: 'gang_runner', count: [2, 2], perTier: 0.5 }, { arch: 'gang_enforcer', count: [1, 1], minTier: 3 }],
        cache: { kinds: ['stash', 'arms'], chance: 0.9 },
      },
    ],
  },
  counterfeit_mill: {
    key: 'counterfeit_mill', crew: 'gang',
    names: ['{gang} print room', '{gang} funny-money mill', '{gang} plate shop'],
    blurbs: ['{name}: a back room with a printer going like a sewing machine and a smell of warm ink and cheap solder.'],
    districts: { industrial: 1.5, tenement: 1, market: 1 },
    hazard: 0.6,
    extra: ['fake_id', 'credchip', 'memory_shard'],
    setups: [
      {
        weight: 1, scene: 'A hacker feeds plates to the press while a runner has been told not to touch anything.',
        garrison: [{ arch: 'hacker', count: [1, 1], chance: 0.7 }, { arch: 'gang_runner', count: [1, 2], perTier: 0.4 }],
        cache: { kinds: ['cash', 'data'], chance: 1 },
      },
    ],
  },

  // ================================================================ Atlas
  drone_repair: {
    key: 'drone_repair', crew: 'atlas',
    names: ['Atlas drone repair bay {code}', 'Atlas rooftop service rack {code}', 'Atlas sentry maintenance cradle {code}'],
    blurbs: ['{name}: a rooftop pad with a charging rack, drones hanging in their cradles with their covers off and a parts crate stencilled with the wing-and-halo.'],
    districts: { industrial: 2, corporate: 2, market: 0.5 },
    hazard: 0.4,
    extra: ['drone_core', 'drone_core', 'memory_shard'],
    setups: [
      { weight: 3, scene: 'Drones in a row, half-serviced, ticking quietly in their cradles.', garrison: [{ arch: 'atlas_drone', count: [2, 2], perTier: 0.5 }], cache: { kinds: ['data', 'supplies', 'arms'], chance: 0.9 } },
      {
        weight: 2, scene: 'A contractor is halfway through a service, with a tablet in one hand and a drone\'s lens in the other.',
        garrison: [{ arch: 'atlas_drone', count: [1, 2], perTier: 0.4 }, { arch: 'contractor', count: [1, 1] }],
        cache: { kinds: ['data', 'supplies', 'arms'], chance: 1 },
      },
    ],
  },
  relay_box: {
    key: 'relay_box', crew: 'atlas',
    names: ['Atlas signal relay {code}', 'Atlas street relay cabinet {code}', 'Atlas uplink box {code}'],
    blurbs: ['{name}: a grey steel cabinet on a pole, a light that blinks like it is listening and a walker standing under it like it is paid to.'],
    districts: { industrial: 1.5, corporate: 2, nightlife: 0.5 },
    hazard: 0.6,
    setups: [
      {
        weight: 1, scene: 'The relay hums. A drone circles it, and where there is a walker it stands under it, as if to say no.',
        garrison: [{ arch: 'atlas_walker', count: [1, 1], minTier: 2 }, { arch: 'atlas_drone', count: [1, 1], perTier: 0.5 }],
        cache: { kinds: ['data'], chance: 1 },
      },
    ],
  },
  ad_kiosk: {
    key: 'ad_kiosk', crew: 'atlas',
    names: ['Atlas "Customer Delight" kiosk {code}', 'Atlas public-information booth {code}', 'Atlas outreach pillar {code}'],
    blurbs: ['{name}: a glowing booth playing a smiling family on a loop, a drone in a holding pattern and a technician who would very much like to be elsewhere.'],
    districts: { market: 2, nightlife: 2, corporate: 1.5 },
    hazard: 0.3,
    setups: [
      {
        weight: 1, scene: 'The ad plays to nobody. A drone watches the street and a technician watches the clock.',
        garrison: [{ arch: 'atlas_drone', count: [1, 2], perTier: 0.4 }, { arch: 'contractor', count: [1, 1], chance: 0.6 }],
        cache: { kinds: ['data', 'cash'], chance: 0.85 },
      },
    ],
  },
  checkpoint_squeeze: {
    key: 'checkpoint_squeeze', crew: 'atlas',
    names: ['Atlas pop-up checkpoint {code}', 'Atlas "permit review" stop {code}', 'Atlas roadside compliance check {code}'],
    blurbs: ['{name}: two traffic cones, a handheld scanner and a trooper who has found a vendor with an out-of-date permit.'],
    districts: { corporate: 2, industrial: 1.5, market: 1, tenement: 0.7 },
    hazard: 0.2,
    setups: [
      {
        weight: 1, scene: 'A trooper is leaning on a street vendor for a permit fee, with a drone to witness it.',
        garrison: [{ arch: 'atlas_trooper', count: [1, 2], perTier: 0.5 }, { arch: 'atlas_drone', count: [1, 1], chance: 0.6 }],
        cache: { kinds: ['cash'], chance: 1 },
      },
    ],
  },
  recall_depot: {
    key: 'recall_depot', crew: 'atlas',
    names: ['Atlas product recall yard {code}', 'Atlas returns depot {code}', 'Atlas quality-assurance dump {code}'],
    blurbs: ['{name}: a fenced pallet yard of drones with RECALLED stamped across their foreheads, most of them dead and at least one of them not.'],
    districts: { industrial: 2, corporate: 1 },
    hazard: 0.6,
    extra: ['drone_core', 'scrap_metal', 'memory_shard'],
    setups: [
      {
        weight: 1, scene: 'Dead drones to the horizon. The ones that are not dead are, as ever, the ones guarding it.',
        garrison: [{ arch: 'atlas_drone', count: [2, 3], perTier: 0.6 }, { arch: 'atlas_walker', count: [1, 1], minTier: 3, chance: 0.6 }],
        cache: { kinds: ['supplies', 'arms', 'data'], chance: 0.9 },
      },
    ],
  },
  dragon_hatch: {
    key: 'dragon_hatch', crew: 'atlas',
    names: ['Atlas dragon service hatch {code}', 'Atlas Artemis maintenance shaft {code}', 'Atlas flight-line access cover {code}'],
    blurbs: ['{name}: a hatch in the road, as wide as a wardrobe, with a walker standing on it and a smell coming up round the edges of hot metal and bad news.'],
    districts: { corporate: 1.5, industrial: 1.5 },
    tiers: [3, 5],
    hazard: 0.8,
    extra: ['dragon_scale', 'dragon_scale', 'drone_core', 'helix_sample'],
    setups: [
      {
        weight: 1, scene: 'A walker stands on the hatch. Below it is the part of the dragon that Atlas does not put in the adverts.',
        garrison: [{ arch: 'atlas_walker', count: [1, 2], perTier: 0.3 }, { arch: 'atlas_drone', count: [1, 1] }, { arch: 'contractor', count: [1, 1] }],
        cache: { kinds: ['data', 'vault'], chance: 1 },
      },
    ],
  },

  // ================================================================ police and the corporate fringe
  evidence_van: {
    key: 'evidence_van', crew: 'npd',
    names: ['NPD evidence van {code}', 'NPD seized-goods transport {code}', 'NPD property-room truck {code}'],
    blurbs: ['{name}: a blue-and-white van with its tailgate down, a trolley of sealed bags and officers who are not expecting to have to look up.'],
    districts: { corporate: 1.5, market: 1, nightlife: 1, tenement: 0.5 },
    tiers: [2, 4],
    hazard: 0.2,
    extra: ['credchip', 'gold_tooth', 'stim_iron', 'fake_id'],
    setups: [
      {
        weight: 1, scene: 'Two officers are unloading seized goods into a station door. They are very careful about what they are not careful about.',
        garrison: [{ arch: 'npd_officer', count: [1, 2], perTier: 0.4 }],
        cache: { kinds: ['arms', 'stash', 'supplies'], chance: 1 },
      },
    ],
  },
  corrupt_cop: {
    key: 'corrupt_cop', crew: 'npd',
    names: ['NPD beat-cop pocket {code}', 'NPD "community liaison" stop {code}', 'NPD quiet envelope {code}'],
    blurbs: ['{name}: a vendor\'s stall, an officer with no badge on show and an envelope that is going in one direction.'],
    districts: { market: 1.5, nightlife: 2, tenement: 1, slum: 1 },
    hazard: 0.2,
    setups: [
      {
        weight: 1, scene: 'An off-duty officer is collecting a monthly envelope. A patrol drone is paying attention to something else.',
        garrison: [{ arch: 'cop', count: [1, 1], perTier: 0.3 }, { arch: 'npd_drone', count: [1, 1], minTier: 2, chance: 0.5 }],
        cache: { kinds: ['cash'], chance: 1 },
      },
    ],
  },
  courier_ambush: {
    key: 'courier_ambush', crew: 'atlas',
    names: ['Atlas executive courier car {code}', 'Atlas black-glass sedan {code}', 'Atlas data-courier convoy {code}'],
    blurbs: ['{name}: a black sedan idling at a curb with its hazards on, a corpo in the back seat and two bodyguards trying to look like part of the scenery.'],
    districts: { corporate: 2, nightlife: 1.5 },
    tiers: [2, 4],
    hazard: 0.2,
    extra: ['corp_creds', 'memory_shard'],
    setups: [
      {
        weight: 1, scene: 'The car is parked for a handover. The briefcase is on the seat, the bodyguards are on their phones and the corpo is on edge.',
        garrison: [{ arch: 'suit', count: [1, 2], perTier: 0.4 }, { arch: 'corpo', count: [1, 1] }],
        cache: { kinds: ['data', 'cash'], chance: 1 },
      },
    ],
  },

  // ================================================================ wild
  feral_nest: {
    key: 'feral_nest', crew: 'free',
    names: ['feral bot nest', 'scrapyard of the broken-minded', 'work-bot warren'],
    blurbs: ['{name}: a yard of dead loaders and a few that are not, all of them turning very slowly to face her.'],
    districts: { industrial: 2.5, slum: 1.5 },
    hazard: 0.6,
    extra: ['scrap_metal', 'drone_core', 'scrap_metal'],
    setups: [
      { weight: 1, scene: 'Work-bots that stopped taking orders and started taking an interest.', garrison: [{ arch: 'feral_bot', count: [2, 3], perTier: 0.6 }], cache: { kinds: ['arms', 'supplies', 'data'], chance: 0.8 } },
    ],
  },
  scrapper_camp: {
    key: 'scrapper_camp', crew: 'free',
    names: ['scrappers\' camp', 'salvager hollow', 'barrel-fire camp'],
    blurbs: ['{name}: a fire in a barrel, three tents made of other people\'s tents and a heap of things that were once something else.'],
    districts: { industrial: 2, slum: 2, tenement: 0.8 },
    hazard: 0.4,
    extra: ['scrap_metal', 'gold_tooth', 'credchip'],
    setups: [
      { weight: 1, scene: 'Salvagers around a fire, dividing the haul by loudness.', garrison: [{ arch: 'salvager', count: [2, 3], perTier: 0.5 }, { arch: 'scrapper', count: [1, 1], minTier: 2, chance: 0.4 }], cache: { kinds: ['stash', 'arms', 'armor'], chance: 0.9 } },
    ],
  },
  drone_graveyard: {
    key: 'drone_graveyard', crew: 'free',
    names: ['drone graveyard', 'crash field', 'Atlas boneyard'],
    blurbs: ['{name}: a field of crashed Atlas drones, picked half-clean, with the pickers still at it.'],
    districts: { industrial: 2, corporate: 0.5 },
    hazard: 0.5,
    extra: ['drone_core', 'memory_shard', 'scrap_metal'],
    setups: [
      { weight: 1, scene: 'Salvagers working the wrecks. One of the drones is not as dead as it looks.', garrison: [{ arch: 'salvager', count: [1, 2], perTier: 0.4 }, { arch: 'atlas_drone', count: [1, 1], perTier: 0.3 }], cache: { kinds: ['data', 'supplies'], chance: 0.9 } },
    ],
  },
  collapsed_site: {
    key: 'collapsed_site', crew: 'gang',
    names: ['{gang} half-fallen block', '{gang} collapsed tower stash', '{gang} ruin den'],
    blurbs: ['{name}: a half-fallen block with the floors at angles, a squat in the part that stayed up and a view down through three storeys of daylight.'],
    districts: { tenement: 1.5, slum: 2, industrial: 1 },
    hazard: 2,
    setups: [
      {
        weight: 1, scene: 'A crew has moved into the part of the building that is still holding, and does not wish to discuss the rest.',
        garrison: [{ arch: 'gang_runner', count: [2, 2], perTier: 0.6 }, { arch: 'gang_enforcer', count: [1, 1], minTier: 2, chance: 0.5 }],
        cache: { kinds: ['stash', 'supplies'], chance: 0.9 },
      },
    ],
  },
  bounty_hunters: {
    key: 'bounty_hunters', crew: 'free',
    names: ['bounty hunters\' stakeout', 'licensed hunters\' camp', 'prisoner handover'],
    blurbs: ['{name}: a couple of long coats around a van, a prisoner in zip-ties and a lot of talk about whose collar this is.'],
    districts: { industrial: 1, nightlife: 1.5, slum: 1 },
    tiers: [2, 4],
    hazard: 0.2,
    setups: [
      {
        weight: 1, scene: 'Two licensed hunters are arguing over the collar. Their prisoner is not part of the discussion.',
        garrison: [{ arch: 'hunter', count: [1, 2], perTier: 0.3, clean: true }, { arch: 'gang_runner', count: [1, 1] }],
        cache: { kinds: ['cash'], chance: 1 },
      },
    ],
  },
  cult_shrine: {
    key: 'cult_shrine', crew: 'free',
    names: ['Rust Choir shrine', 'Choir roadside altar', 'rusted hymn corner'],
    blurbs: ['{name}: a chained-off alley corner with a heap of offerings, a rusted speaker playing a single sustained note and a cluster of robed people gently humming along.'],
    districts: { slum: 2, industrial: 1.5, tenement: 1 },
    hazard: 0.5,
    extra: ['mom_photo', 'eyeballs', 'gold_tooth', 'vipers_patch'],
    setups: [
      { weight: 1, scene: 'The faithful are mid-hymn. The offerings are in a heap behind them, and the heap is their business.', garrison: [{ arch: 'acolyte', count: [2, 3], perTier: 0.5 }], cache: { kinds: ['stash'], chance: 1 } },
    ],
  },
  black_ice_shed: {
    key: 'black_ice_shed', crew: 'free',
    names: ['black-ice server shed', 'unlicensed data shed', 'hacker\'s shack'],
    blurbs: ['{name}: a corrugated shed with an air-conditioner too big for it, a fat cable run to a streetlight and a padlock with a wire on it.'],
    districts: { industrial: 1.5, corporate: 1, nightlife: 0.5 },
    tiers: [2, 4],
    hazard: 1.4,
    extra: ['memory_shard', 'corp_creds'],
    setups: [
      { weight: 1, scene: 'The shed hums. Its owner is a hacker who knows exactly who would pay for what is inside, and has made sure that anyone else pays more.', garrison: [{ arch: 'hacker', count: [1, 1] }, { arch: 'sentry_turret', count: [1, 1], minTier: 3, chance: 0.6 }], cache: { kinds: ['data'], chance: 1 } },
    ],
  },
  fixer_locker: {
    key: 'fixer_locker', crew: 'free',
    names: ['fixer\'s locker bank', 'transit locker drop', 'station locker run'],
    blurbs: ['{name}: a wall of lockers in a transit concourse, one of them has fresh tape on it and a runner is keeping an eye on it.'],
    districts: { market: 1, corporate: 1, nightlife: 1.5 },
    hazard: 0.3,
    setups: [
      {
        weight: 1, scene: 'A fixer\'s runner is minding the locker until the pickup. The pickup is later than it should be.',
        garrison: [{ arch: 'gang_runner', count: [1, 2], perTier: 0.4 }, { arch: 'fixer', count: [1, 1], clean: true, minTier: 3, chance: 0.4 }],
        cache: { kinds: ['cash', 'data'], chance: 1 },
      },
    ],
  },
};

export const SPOT_KEYS = Object.keys(SPOTS);

/** How likely a street is to have a spot on it, by district. (Rolled on a stream of its own, like clinics.) */
export const SPOT_CHANCE: Record<District, number> = { market: 0.22, nightlife: 0.26, tenement: 0.3, industrial: 0.36, corporate: 0.2, slum: 0.36 };
/** And, given one, how likely it is there's a second. */
export const SPOT_AGAIN = 0.2;

/** Which spot a street gets. */
export function pickSpot(rng: Rng, district: District): SpotDef {
  const keys = SPOT_KEYS.filter((k) => (SPOTS[k]!.districts[district] ?? 0) > 0);
  return SPOTS[rng.weighted(keys, (k) => SPOTS[k]!.districts[district] ?? 0)]!;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** How hard it is. Gentler than a building of the same depth, since it's one room. */
export function rollSpotTier(rng: Rng, def: SpotDef, danger: number): number {
  const [lo, hi] = def.tiers ?? [1, 4];
  return clamp(tierOfDanger(danger - 3 + (rng.next() - 0.5) * 8), lo, hi);
}

/** The room a spot is, for this garrisoning: one of its setups, picked by weight. */
export function spotRoom(def: SpotDef, rng: Rng): { room: RoomDef; scene: string } {
  const s = rng.weighted(def.setups, (x) => x.weight);
  return {
    scene: s.scene,
    room: { key: 'spot', label: 'spot', parent: null, minTier: 1, hazard: def.hazard ?? 0.5, garrison: s.garrison, ...(s.cache ? { cache: s.cache } : {}) },
  };
}

/** Does the place's own say-so give its people paper? (Atlas and the police do not; everyone else's people are on a list.) */
export const hasPaper = (crew: Crew): boolean => crew === 'gang' || crew === 'free';

// ===================================================================== parts to scavenge

export interface SpotParts {
  /** Which parts lie about, by weight. */
  weights: Record<string, number>;
  /** How much of it: 0 is nothing worth picking up, 1 is usual. */
  rich: number;
}

const BY_CREW: Record<Crew, SpotParts> = {
  gang: { weights: { scrap: 3, wiring: 1.5, servos: 1, chem: 1, plating: 0.5 }, rich: 1 },
  atlas: { weights: { circuits: 3, wiring: 2, cells: 2, servos: 1, plating: 1 }, rich: 1.1 },
  npd: { weights: { plating: 2, scrap: 1, cells: 1, wiring: 0.5 }, rich: 0.5 },
  free: { weights: { scrap: 3, wiring: 1, circuits: 1, servos: 1, plating: 1 }, rich: 1.4 },
};

/** Places with a lot more (or less) lying about than their crew would suggest. */
const OVERRIDE: Record<string, Partial<SpotParts>> = {
  chop_pop: { weights: { scrap: 3, servos: 2, plating: 2, wiring: 1 }, rich: 1.8 },
  drone_repair: { weights: { circuits: 3, cells: 3, servos: 2, wiring: 1 }, rich: 1.6 },
  drone_graveyard: { weights: { circuits: 3, cells: 2, servos: 2, wiring: 2 }, rich: 2 },
  feral_nest: { weights: { servos: 3, scrap: 3, cells: 1 }, rich: 1.8 },
  scrapper_camp: { weights: { scrap: 3, wiring: 2, plating: 1, chem: 1 }, rich: 1.8 },
  collapsed_site: { weights: { scrap: 3, plating: 1, wiring: 1 }, rich: 1.5 },
  dumpster_cache: { weights: { scrap: 3, wiring: 1 }, rich: 1.2 },
  stim_lab: { weights: { chem: 4, cells: 1 }, rich: 1.3 },
  pill_mill: { weights: { chem: 4 }, rich: 1 },
  relay_box: { weights: { wiring: 3, circuits: 2, cells: 1 }, rich: 1.4 },
  black_ice_shed: { weights: { circuits: 3, wiring: 2, cells: 1 }, rich: 1.4 },
  ad_kiosk: { weights: { circuits: 2, wiring: 2 }, rich: 1.2 },
  armored_van: { weights: { plating: 4, scrap: 2 }, rich: 1.3 },
  counterfeit_mill: { weights: { circuits: 2, chem: 2, wiring: 1 }, rich: 1 },
  // Nothing to strip.
  turf_marker: { rich: 0 }, racket_booth: { rich: 0 }, collection_day: { rich: 0 }, corrupt_cop: { rich: 0 }, cult_shrine: { rich: 0 },
  bounty_hunters: { rich: 0 }, courier_ambush: { rich: 0 }, checkpoint_squeeze: { rich: 0.3 }, fixer_locker: { rich: 0.6 },
};

export function spotParts(key: string): SpotParts {
  const crew = SPOTS[key]?.crew ?? 'free';
  const base = BY_CREW[crew];
  const o = OVERRIDE[key];
  return { weights: o?.weights ?? base.weights, rich: o?.rich ?? base.rich };
}
