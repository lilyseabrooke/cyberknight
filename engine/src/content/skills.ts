/**
 * The skill graph. Every skill has XP that levels by use; training one skill spills a share of XP into
 * related skills (practicing guitar nudges music; darts nudge pool aim). Actions combine several skills
 * and stats as a weighted geometric mean (see skills.ts `synergy`): zero in any factor and the whole thing is zero.
 */
export interface SkillDef {
  label: string;
  group: 'music' | 'aim' | 'stealth' | 'social' | 'craft' | 'body';
  /** Related skills that also gain XP when this one is trained: skill -> fraction of the XP. */
  spill?: Record<string, number>;
  /** What she can be described as at levels 1, 3, 5 and 8. */
  titles: [string, string, string, string];
}

export const SKILLS = {
  // ---- music family
  music: { label: 'music', group: 'music', titles: ['can hum on key', 'has opinions about bass', 'hears the chord changes coming', 'a walking tuning fork'] },
  vocals: { label: 'singing', group: 'music', spill: { music: 0.3 }, titles: ['sings in the shower, loudly', 'can hold a note against a siren', 'makes bartenders tear up', 'sings like a choir with a grudge'] },
  guitar: { label: 'guitar', group: 'music', spill: { music: 0.4 }, titles: ['knows three chords', 'can play a whole song, in order', 'plays like she means it', 'melts faces, professionally'] },
  djing: { label: 'DJing', group: 'music', spill: { music: 0.4, tinkering: 0.1 }, titles: ['can find the play button', 'matches beats on a good night', 'reads the room through the subwoofers', 'rewires crowds with a crossfader'] },
  beatbox: { label: 'beatboxing', group: 'music', spill: { music: 0.3, vocals: 0.2 }, titles: ['makes a noise like a dying printer', 'has a decent kick and snare', 'can do hi-hats AND talk', 'a one-woman rhythm section'] },
  // ---- aim and fighting
  pool: { label: 'pool', group: 'aim', spill: { throwing: 0.2 }, titles: ['knows which end of the cue to hold', 'sinks a ball on purpose, sometimes', 'banks shots like geometry owes her money', 'a table-clearing menace'] },
  throwing: { label: 'throwing', group: 'aim', spill: { marksmanship: 0.2 }, titles: ['can hit a wall, reliably', 'hits what she aims at, ish', 'makes furniture dangerous', 'could hit a dragon in the eye, at range'] },
  marksmanship: { label: 'shooting', group: 'aim', spill: { throwing: 0.1 }, titles: ['hits the right wall', 'groups shots nicely', 'quick on the draw', 'shoots like she is reading the future'] },
  melee: { label: 'melee', group: 'aim', spill: { athletics: 0.1 }, titles: ['swings with purpose', 'knows a parry from a pat', 'turns a tire iron into a philosophy', 'a storm with a handle'] },
  driving: { label: 'driving', group: 'body', spill: { athletics: 0.05 }, titles: ['signals sometimes', 'takes corners on the right side of the road', 'parallel parks under duress', 'the road is a suggestion she makes'] },
  athletics: { label: 'athletics', group: 'body', spill: { dancing: 0.1 }, titles: ['can run and talk, barely', 'clears low fences', 'leaps gaps without writing a will', 'treats rooftops like sidewalks'] },
  // ---- stealth and tech
  sneak: { label: 'sneaking', group: 'stealth', titles: ['steps lightly, sometimes', 'can hide behind a plant', 'ghosts past bored guards', 'a rumor in a dark coat'] },
  sleight: { label: 'sleight of hand', group: 'stealth', spill: { cards: 0.15 }, titles: ['can palm a coin', 'lifts a chip off a table', 'fingers faster than eyes', 'makes wallets quietly emigrate'] },
  lockpicking: { label: 'lockpicking', group: 'stealth', spill: { tinkering: 0.15 }, titles: ['can open a unlocked door', 'knows what a tension wrench is', 'hears tumblers whisper', 'bored by safes'] },
  calculate: { label: 'calculating', group: 'craft', spill: { tinkering: 0.1, streetwise: 0.05 }, titles: ['can add up a bar tab', 'knows which way a runner will turn', 'reads a city as a graph', 'always already at the end of the road'] },
  tinkering: { label: 'tinkering', group: 'craft', spill: { lockpicking: 0.1 }, titles: ['can use a screwdriver safely', 'fixes a jukebox with a boot', 'rewires fuse boxes for fun', 'has a lab assistant, probably'] },
  hijack: { label: 'hijacking', group: 'stealth', spill: { driving: 0.3, lockpicking: 0.15, tinkering: 0.1 }, titles: ['has locked her keys in a car, from the outside', 'knows which wire is the red one', 'cars start for her, eventually', 'a parking lot is a buffet'] },
  // ---- social
  romance: { label: 'romance', group: 'social', spill: { streetwise: 0.1 }, titles: ['has a decent opening line', 'knows the three-second look', 'a legend in three bars', 'could talk a dragon into dinner'] },
  dancing: { label: 'dancing', group: 'social', spill: { romance: 0.2, athletics: 0.1 }, titles: ['sways, with intent', 'finds the downbeat', 'owns a small corner of the floor', 'a neon blur with great hair'] },
  intimidation: { label: 'intimidation', group: 'social', spill: { streetwise: 0.1 }, titles: ['has a Look', 'cracks knuckles meaningfully', 'makes bouncers check the exit', 'the room gets quieter when she squints'] },
  streetwise: { label: 'streetwise', group: 'social', titles: ['knows which alleys to skip', 'knows who owes whom', 'has a guy for everything', 'Neo talks to her first'] },
  haggling: { label: 'haggling', group: 'social', spill: { streetwise: 0.1 }, titles: ['asks for a discount', 'walks away convincingly', 'makes fixers sweat', 'could sell a dragon its own wings'] },
  cards: { label: 'cards', group: 'social', spill: { streetwise: 0.1 }, titles: ['knows the poker hands, mostly', 'has a tell, and knows it', 'bluffs with her whole face', 'reads tables like open books'] },
  rapport: { label: 'animal rapport', group: 'social', spill: { medicine: 0.1 }, titles: ['pigeons do not flee', 'dogs, robot and otherwise, like her', 'drones coo when she walks by', 'speaks fluent beast'] },
  grifting: { label: 'grifting', group: 'social', spill: { streetwise: 0.15, cards: 0.1 }, titles: ['can keep a straight face for one whole sentence', 'has a sob story for every occasion', 'could sell ice to a fridge', "Neo's most convincing liar, professionally"] },
  // ---- crafts and care
  tolerance: { label: 'drinking', group: 'craft', titles: ['has a favorite drink, and a second', 'holds it better than most', 'is hydrated by whiskey', 'a liver with its own union'] },
  mixology: { label: 'mixology', group: 'craft', spill: { tolerance: 0.2 }, titles: ['pours straight', 'knows what bitters are for', 'invents drinks with unfortunate names', 'a bar-top alchemist'] },
  cooking: { label: 'cooking', group: 'craft', spill: { mixology: 0.1 }, titles: ['can boil water, mostly', 'makes noodles that taste like noodles', 'plates food like it matters', 'a chef who fights'] },
  medicine: { label: 'first aid', group: 'craft', spill: { tinkering: 0.05 }, titles: ['knows where the bandage goes', 'stitches at an angle', 'talks people through their own surgery', 'fixes people like cars'] },
  art: { label: 'graffiti', group: 'craft', spill: { streetwise: 0.1 }, titles: ['draws a mean doodle', 'tags in two colors', 'fills walls with intent', 'her murals have critics'] },
  scavenging: { label: 'scavenging', group: 'craft', spill: { tinkering: 0.15 }, titles: ['can tell trash from treasure, usually', 'has a system for dumpsters and scrap heaps', 'finds the good stuff before the rats do', 'could furnish an apartment from one back alley'] },
  hustling: { label: 'hustling', group: 'craft', spill: { streetwise: 0.1, athletics: 0.1 }, titles: ['shows up, mostly on time', 'has done every odd job in the Halo at least once', 'a professional at being professional', 'the gig economy, personified'] },
} as const satisfies Record<string, SkillDef>;

export type SkillId = keyof typeof SKILLS;
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
/** Levels that make the log. The first four have a title per skill; the rest share one list. */
export const LEVEL_MILESTONES = [1, 3, 5, 8, 12, 18, 25, 35, 50, 65, 80, 100] as const;
export const GENERIC_TITLES = [
  'known for it across the district',
  'the person other people mention',
  'quietly the best in the building',
  'a name that comes with a reputation',
  'a living standard to be measured against',
  'the kind of good that gets studied',
  'so good it has stopped being a skill',
  'a legend, and mostly unbothered by it',
] as const;

/** Stats usable as factors alongside skills. */
export type StatId = 'muscle' | 'reflex' | 'hack' | 'charm';
