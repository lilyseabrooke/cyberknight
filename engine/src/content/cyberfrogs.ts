/**
 * Cyberfrogs. Cheap plastic collectibles, a nightmare marketing gimmick: 121 characters in 11 lines, each with a gear
 * loadout, a backstory and a personality, every one of them sold in blind boxes in a half-dozen editions. They do absolutely
 * nothing. Blackbird knows every one of them by heart (see cyberfrogs.ts).
 *
 * Bios are written without pronouns on purpose: a frog is its name.
 */

export interface FrogLine {
  key: string;
  /** The line's name, as it is on the box. */
  name: string;
  /** The slogan, as it is on the box. */
  slogan: string;
}

export interface FrogDef {
  /** What the box calls them (after "Cyberfrog"). */
  name: string;
  /** What they come with, as it follows the name: "with a sword". */
  gear: string;
  /** Which line they belong to (index into LINES). */
  line: number;
  /** Their backstory and personality, as the back of the box tells it. */
  bio: string;
}

export const LINES: readonly FrogLine[] = [
  { key: 'original', name: 'The Original Eleven', slogan: 'Hop into tomorrow!' },
  { key: 'street', name: 'Street Division', slogan: 'Ribbit loud, ribbit proud!' },
  { key: 'legends', name: 'Legends of the Lily Pad', slogan: 'Slay dragons. Eat flies.' },
  { key: 'pros', name: 'Pond Professionals', slogan: 'Every job is a leap of faith!' },
  { key: 'cosmos', name: 'Cyberfrog Cosmos', slogan: 'In space, nobody can hear you croak.' },
  { key: 'dark', name: 'Dark Pond', slogan: 'For collectors aged 14 and up. Mostly up.' },
  { key: 'seasons', name: 'Holiday Specials', slogan: 'Limited editions, unlimited feelings.' },
  { key: 'retro', name: 'Retro Wave', slogan: 'Totally radical, forever.' },
  { key: 'tadpoles', name: 'Tadpole Pals', slogan: 'Small frogs, big hearts, bigger margins!' },
  { key: 'syndicate', name: 'The Toxic Swamp Syndicate', slogan: 'Every hero needs a nemesis. Collect both.' },
  { key: 'gold', name: 'The Golden Pond Club', slogan: 'You will never find them all.' },
];

// 121 = 11 lines of 11. Order matters: `line` is derived from position (see LINE_SIZE), and a frog's number is its index + 1.
export const LINE_SIZE = 11;

type Row = [name: string, gear: string, bio: string];

const ROWS: Row[] = [
  // ---- The Original Eleven
  ['Donald', 'with a sword', 'The leader. Lost the family pond to a corporate drain and swore to take it back, one lily pad at a time.'],
  ['Jasmine', 'with twin chrome pistols', 'Hacker and pond-hopper. Never says where they are from. Catchphrase: "ribbit.exe has stopped responding."'],
  ['Marcus', 'with a rocket launcher', 'Demolitions expert with a short fuse. Allergic to ponds, which explains a great deal.'],
  ['Priya', 'with a data tablet', 'The brains. Has mapped the whole sewer network and rates every tunnel out of five stars.'],
  ['Walter', 'with a cane', 'Veteran of the Great Fly Shortage. Tells the same war story every episode, and it is different every time.'],
  ['Esperanza', 'with a katana', 'Swordmaster raised by a family of mechanical herons. Honor rating: extreme.'],
  ['Tobias', 'with a jetpack', 'Daredevil courier. Has never completed a delivery, but always arrives with style.'],
  ['Mei', 'with a mini drone', 'The youngest. Best friend is a drone called Gerald, and nobody has the heart to tell Mei about Gerald.'],
  ['Rufus', 'with a boombox', 'The heart of the team. Every battle has a soundtrack, and Rufus owns the whole catalogue.'],
  ['Beatrice', 'with a grappling hook', 'Infiltrator. Famous for "I was never here," said while very clearly there.'],
  ['Oswald', 'in a lab coat', 'Mad scientist who created every other Cyberfrog by accident. Regrets nothing, apologizes constantly.'],
  // ---- Street Division
  ['Dante', 'with a skateboard', 'Grinds rails for the neighbourhood. Believes the city is just one long rail with commitment issues.'],
  ['Lucille', 'with a spray can', 'Muralist. The tags appear on buildings before the buildings are built.'],
  ['Fitzgerald', 'with a mystery briefcase', 'Courier of the unmarked. Never opened the case, never will, and that is the whole character.'],
  ['Nadia', 'on a hoverbike', 'Racer. Has been disqualified from every race for finishing before the starting gun.'],
  ['Corey', 'with a basketball', 'Streetball legend. Dunks from the wrong side of the hoop out of principle.'],
  ['Imani', 'with a megaphone', 'Block organizer. Shouts the news, the weather and the occasional poem from the same rooftop.'],
  ['Hector', 'with nunchucks', 'Dojo dropout. Only knows one kata but performs it with tremendous feeling.'],
  ['Penelope', 'with a noodle cart', 'Sells the best noodles in the district. The secret ingredient is also the secret to the plot.'],
  ['Jun', 'with neon sunglasses', 'Too cool for the pond. Has never been seen without the shades, including in the shower.'],
  ['Grace', 'with a riot shield', 'Ex-security. Left the force when asked to guard a puddle and takes puddles very seriously now.'],
  ['Bartholomew', 'with a trash can lid', 'Dumpster diver and philosopher. Believes everything is salvageable, including regret.'],
  // ---- Legends of the Lily Pad
  ['Aldric', 'with a longbow', 'Ranger of the Reed Forest. Never misses, and has started to take that personally.'],
  ['Seraphina', 'with a glowing staff', 'Archmage of the Marsh Tower. The spells work perfectly, but the wording is always slightly off.'],
  ['Gareth', 'with a warhammer', 'Dwarf-raised, frog-born. Insists the hammer is a "mallet of negotiation."'],
  ['Isolde', 'with a lute of questionable magic', 'Bard. The songs are enchanted, and the enchantment is mostly about getting stuck in your head.'],
  ['Merlin', 'with a pointy hat', 'Wizard. Keeps forgetting the spell, and then the hat does it instead. The hat has a name.'],
  ['Brunhilde', 'with a winged helmet', 'Shieldfrog of the Northern Bog. Opera is mandatory at every funeral, and Brunhilde plans them often.'],
  ['Cedric', 'with a shield and a tiny castle', 'Knight errant. The castle is on the back, and has never been defeated, only dented.'],
  ['Morgana', 'with a bubbling cauldron', 'Potion-maker. Every potion is a soup, and every soup is a threat.'],
  ['Percival', 'with a lance', 'Knight of the Round Pond, who is very sensitive about how many times it is a pond.'],
  ['Thistle', 'with a firefly lantern', 'Woodland sprite-frog. Guides lost travellers to places they did not want to go but needed to.'],
  ['Ragnar', 'with a battleaxe', 'Berserker. Calms down exactly once per episode and uses it to apologize to the furniture.'],
  // ---- Pond Professionals
  ['Dr. Patel', 'with a stethoscope', 'Surgeon. Operates on anything with a pulse or a warranty. Bedside manner: "good news, mostly."'],
  ['Chef Lorenzo', 'with a flaming wok', 'Michelin-starred and Michelin-banned. The restaurant has seven stars and one fire exit.'],
  ['Officer Daniels', 'with a baton and a donut', 'Beat cop. Has solved exactly one case, on the same day the donut shop opened.'],
  ['Judge Harriet', 'with a gavel', 'Presides over the Court of Small Claims. The court is a puddle. The verdicts are final.'],
  ['Captain Mbeki', 'in a tiny submarine', 'Deep-sea explorer of the ornamental fish tank. Has found things that should not be down there.'],
  ['Professor Quill', 'with a chalkboard', 'Lecturer. Teaches the history of ponds to a class of one, who left years ago.'],
  ['Pilot Amara', 'with aviator goggles', 'Flies the Cyberfrog cargo plane. Has landed every time, technically, in a field of someone else.'],
  ['Mechanic Stan', 'with a wrench', 'Fixes anything with a handle, a hinge or a grudge. Has never read a manual and never will.'],
  ['Barista Dolores', 'with a giant latte', 'Writes your name on the cup wrong on purpose. The coffee is legendary and so is the silence.'],
  ['Accountant Kevin', 'with a calculator', 'Audited the entire pond economy and found it to be a pond. Dangerous when the numbers add up.'],
  ['Lifeguard Trixie', 'with a rescue buoy', 'On duty at a pond that is four centimetres deep. Has saved six lives and counts every one.'],
  // ---- Cyberfrog Cosmos
  ['Neil', 'in a spacesuit', 'First frog on the moon. Took one small hop, and the hop is still going.'],
  ['Valentina', 'with a ray gun', 'Space pirate. Plunders only things that were already stolen, which Valentina thinks makes it fair.'],
  ['Zorp', 'with three eyes', 'Visitor from the Andromeda Marsh. Understands nothing about Earth and has opinions about all of it.'],
  ['Commander Okonkwo', 'with a star map', 'Captain of the starship Lily Pad. The map is upside down and nobody dares to say it.'],
  ['Luna', 'with a moon rock', 'Moonbase caretaker. Waters the lunar garden daily, though nothing has grown, hope springs eternal.'],
  ['Orion', 'with a comet on a leash', 'Astronomer-adventurer. The comet is called Biscuit and returns every seventy-six years to be fed.'],
  ['Pixel', 'with a holo-visor', 'Lives inside the starship computer. Insists on being treated as a person and, in fairness, a frog.'],
  ['Quasar', 'with a plasma blade', 'Cosmic duelist. Has fought a black hole to a draw and demands a rematch.'],
  ['Nebula Nan', 'with knitting needles', 'The grandmother of the galaxy. Knits scarves for planets. Every planet has been very warm since.'],
  ['Cosmo', 'with a rocket backpack', 'Test pilot. The backpack has two settings: off and "regret."'],
  ['Astra', 'with a telescope', 'Stargazer. Has discovered four new planets and misplaced two of them.'],
  // ---- Dark Pond
  ['Raven', 'with a chain', 'Goth frog. Lives in a crypt that is also a pond, and has never been seen to blink.'],
  ['Damien', 'with a scythe', 'Reaper of the reed beds. Only harvests overdue library books, but nobody will say that to the scythe.'],
  ['Vesper', 'with a crossbow', 'Vampire hunter. Allergic to garlic, which is the cruellest twist in the franchise.'],
  ['Nyx', 'in a long trench coat', 'Detective of the night shift. Narrates every thought in a gravelly voice nobody asked for.'],
  ['Cain', 'with a flaming skull', 'Ghost rider of the swamp. The skull is a real skull. The flame is a lighter. The mood is real.'],
  ['Lilith', 'with a vial of something green', 'Alchemist. Whatever is in the vial is both the cure and the problem.'],
  ['Mortimer', 'with a tiny coffin', 'Undertaker. Always on time, always in black, always sorry for your loss, whoever you are.'],
  ['Sable', 'with throwing knives', 'Assassin with a conscience, which leaves only a very short career.'],
  ['Hex', 'with a cursed mirror', 'Looks into the mirror every day and sees a different frog. They are all handsome.'],
  ['Draven', 'with a leather cape', 'Brooding antihero. Has been brooding since issue one and refuses to move on.'],
  ['Wraith', 'hooded, no weapons', 'The scariest one on the shelf. Has no weapons, no gear and no backstory, which is its backstory.'],
  // ---- Holiday Specials
  ['Nick', 'in a Santa hat with a sack', 'Delivers presents to every pond at once by never leaving the sack. The sack is bigger inside.'],
  ['Valentine', 'with a heart-shaped box', 'Hopeless romantic. The box contains a dozen chocolates and one live grenade, by accident.'],
  ['Spooky Steve', 'in a pumpkin costume', 'Haunts the autumn aisle of every supermarket. Gets scared of the reflection every time.'],
  ['Harvest Hannah', 'with a pumpkin pie', 'Bakes pies so good that wars stop for a slice. Wars have been paused since 1999.'],
  ['Easter Edgar', 'with a basket of explosive eggs', 'Hides eggs. The eggs are fine. It is the basket that is the issue.'],
  ['Frostine', 'with ice skates', 'Figure skater. Has not touched the ground since the pilot episode.'],
  ['Cinco Carlos', 'with maracas', 'The life of every party. Shakes the maracas to the rhythm of whatever is about to go wrong.'],
  ['New Year Nina', 'with party poppers', 'Counts down to midnight every night and is wrong every time. The party goes on anyway.'],
  ['Independence Ike', 'with a box of fireworks', 'Patriot. Fireworks are personal, neighbours are an afterthought, and the pond is lovely in summer.'],
  ['Thankful Theo', 'with a turkey drumstick', 'Grateful for everything, especially the drumstick. Has a very complicated relationship with turkeys.'],
  ['Diwali Devi', 'with sparklers', 'Lights the pond in all colours. The glow lasts exactly as long as the best moment of the night.'],
  // ---- Retro Wave
  ['Chad', 'with a mullet and a keytar', 'Rock star of the rec room. The solo is eleven minutes long and the encore is a hostage situation.'],
  ['Tiffani', 'with enormous hair', 'Mall rat. The hair has its own zip code, and a fan club, and a restraining order.'],
  ['Maxwell', 'with a floppy disk', 'Computer whiz. The disk holds the entire plot of the series in 1.44 megabytes and no one has dared to read it.'],
  ['Brenda', 'with a rotary phone', 'Switchboard operator of the pond. Knows every secret and charges only for the long-distance ones.'],
  ['Rex', 'with a VHS tape', 'Video-store clerk. Must be kind, must rewind, and keeps the cursed tape in a drawer labelled "do not."'],
  ['Sherry', 'with a mixtape', 'Made a mixtape for someone in 1987 and has never recovered from the lack of reply.'],
  ['Duke', 'with a personal cassette player', 'Skateboard punk. Only listens to one song. It is a long song. It is about a pond.'],
  ['Mallory', 'with a pager', 'Intern at a firm that does not exist. Gets a message once a year and it is always "call me."'],
  ['Kurt', 'with a dial-up modem', 'Early internet adventurer. The connection takes three minutes and the adventure takes four.'],
  ['Heather', 'with a virtual pet', 'Has kept the same pet alive for thirty years. The pet is not alive. Heather does not accept this.'],
  ['Biff', 'on a hoverboard', 'Time-travelling jock. Keeps arriving at the right place at the wrong moment, and vice versa.'],
  // ---- Tadpole Pals
  ['Bubbles', 'with a bubble wand', 'Tiny optimist. Every bubble contains a wish, and every wish is for more bubbles.'],
  ['Squish', 'in a tiny hat', 'Cannot stop hugging. The hat has never once fallen off, no matter what.'],
  ['Noodle', 'with an enormous noodle', 'Believes the noodle is a sword. Everyone lets Noodle believe.'],
  ['Pip', 'with a red balloon', 'Floats away every episode and is returned by the very end. The balloon is always the villain.'],
  ['Mochi', 'with a rice ball', 'Shy, round and soft. Hides in bigger frogs\' pockets and gets mistaken for a snack.'],
  ['Waffles', 'with a syrup bottle', 'Breakfast enthusiast. Has been waiting for the pancake army since the first season.'],
  ['Sprout', 'with a seedling', 'Gardener. Grows tiny things and tells them off when they do not grow.'],
  ['Button', 'with a teddy bear', 'The teddy is the real hero. Button is just the carrier, and has accepted this.'],
  ['Peanut', 'on roller skates', 'Fastest tadpole in the pond. Has never successfully stopped.'],
  ['Gizmo', 'with a screwdriver', 'Tiny inventor. Every invention is a toaster, and every toaster is, somehow, haunted.'],
  ['Dot', 'with a polka-dot bow', 'Fashion icon of the shallow end. The bow changes the world around it, but only on picture day.'],
  // ---- The Toxic Swamp Syndicate
  ['Big Tony', 'with a tommy gun', 'Crime boss of the swamp. Runs a respectable fly-protection racket and a less respectable puddle one.'],
  ['Madame Croak', 'with a feathered fan', 'Hosts the underground casino. House always wins, and the house is a lily pad.'],
  ['Baron Von Bog', 'in an elaborate cravat', 'Aristocratic villain. Owns a mansion, a title and, for tax reasons, a pond.'],
  ['The Slime', 'with nothing but attitude', 'Mysterious. Has no backstory and a very strong smell. Fans insist the smell is the backstory.'],
  ['Viktor', 'with a briefcase of leeches', 'Debt collector. Polite, patient and followed by a lot of leeches.'],
  ['Dr. Murk', 'with a death ray', 'Evil scientist. The ray has never worked and is used mostly to heat the lab.'],
  ['Slick Eddie', 'with a pinky ring', 'Smooth-talking con frog. Has sold the Cyberfrog Tower three times, and it was never for sale.'],
  ['Gloria Gloom', 'with a poison ring', 'Heiress. Disinherited everyone, including Gloria, in the will.'],
  ['Mister Mold', 'with a cloud of spores', 'Slow, patient, inevitable. Wins every argument by being left in a corner.'],
  ['Lady Lurk', 'with a long, long shadow', 'Stalks the corners of other frogs\' episodes. Credited, always, as "and Lady Lurk."'],
  ['Sludge', 'with a barrel of toxic waste', 'Not evil, just very sticky. Wants a hug and has had to learn to settle for a handshake.'],
  // ---- The Golden Pond Club
  ['Archibald', 'with a golden crown', 'The first frog king. Reigned for a single, glorious Tuesday.'],
  ['The Founder', 'with a binding contract', 'Founded the company that makes Cyberfrogs. The contract lists every frog as a legal heir.'],
  ['Hopkins', 'with a champagne glass', 'Butler to the Golden Pond. Knows everything, serves everyone, and would never, ever say.'],
  ['Empress Azalea', 'with a jeweled sceptre', 'Ruler of the Hidden Pond. The coronation was a very long, very expensive nap.'],
  ['Phineas', 'with a top hat', 'Showfrog. Every performance is the last one. There have been four hundred last performances.'],
  ['Sir Reginald', 'with a monocle and a knighthood', 'Knighted for services to ponds. The service has never been specified, and the monocle is a vow.'],
  ['Gold Gwen', 'dipped in gold', 'Cursed by a touch. Everything Gwen holds turns to plastic, which in this world is a kind of gold.'],
  ['Prime', 'with a cape and a cosmic hop', 'The ultimate Cyberfrog. Exists in every line, every edition and, supposedly, every pocket.'],
  ['Echo', 'with a mirror of nothing', 'The reflection of the Golden Pond Club. If you find Echo, Echo has found you first.'],
  ['Legacy', 'with a cracked trophy', 'Retired champion. The cracks in the trophy are the only record of how it was won.'],
  ['Ribbit', 'with no gear at all', 'The brand mascot, packed one in ten thousand boxes. Collectors say they are real. The company says "who?"'],
];

export const FROGS: readonly FrogDef[] = ROWS.map(([name, gear, bio], i) => ({ name, gear, bio, line: Math.floor(i / LINE_SIZE) }));

/** How many different Cyberfrogs there are. */
export const FROG_COUNT = FROGS.length;

// ===================================================================== editions

export interface Edition {
  key: string;
  /** What the box says, as it follows the title: "from the limited initial run". Empty for the ordinary edition. */
  label: string;
  /** How common it is, as a weight. */
  weight: number;
  /** How excited she gets, 1 for an ordinary one. */
  thrill: number;
}

export const EDITIONS: readonly Edition[] = [
  { key: 'standard', label: '', weight: 52, thrill: 1 },
  { key: 'initial', label: 'from the limited initial run', weight: 9, thrill: 1.7 },
  { key: 'glow', label: 'in the glow-in-the-dark variant', weight: 9, thrill: 1.4 },
  { key: 'chrome', label: 'in the chrome chase variant', weight: 4, thrill: 2 },
  { key: 'misprint', label: 'with the misprinted eyes', weight: 4, thrill: 1.8 },
  { key: 'convention', label: 'from the convention exclusive set', weight: 5, thrill: 1.6 },
  { key: 'sealed', label: 'still sealed in the blister pack', weight: 5, thrill: 1.8 },
  { key: 'scuffed', label: 'well loved, somebody\'s favourite', weight: 8, thrill: 1.1 },
  { key: 'recall', label: 'from the recalled batch (the paint was not food safe)', weight: 3, thrill: 1.9 },
  { key: 'prototype', label: 'in the prototype run, with the wrong legs', weight: 1, thrill: 2.5 },
];

export const EDITION_BY_KEY: Record<string, Edition> = Object.fromEntries(EDITIONS.map((e) => [e.key, e]));

/** What the box would say: "Cyberfrog Donald with a sword". */
export const frogName = (char: number): string => {
  const f = FROGS[char]!;
  return `Cyberfrog ${f.name} ${f.gear}`;
};

/** The short form she uses when she is only pointing: "Cyberfrog Donald". */
export const frogShort = (char: number): string => `Cyberfrog ${FROGS[char]!.name}`;

/** The full title with the edition: "Cyberfrog Donald with a sword from the limited initial run". */
export function frogTitle(char: number, edition: string): string {
  const e = EDITION_BY_KEY[edition];
  return e?.label ? `${frogName(char)} ${e.label}` : frogName(char);
}

// ===================================================================== what she says

/** She senses one nearby and guesses who. `{guess}` is the short name. */
export const SENSE_LINES: readonly string[] = [
  'Blackbird stops mid-step and tilts her head. "Wait. I sense Cyberfrog. Is that {guess}?"',
  'Something prickles at the back of Blackbird\'s neck, a tiny frog-shaped itch. "Cyberfrog. I sense Cyberfrog. Is that {guess}?"',
  'Blackbird\'s eyes go very wide. "Hold on. There is a Cyberfrog close. Could that be {guess}?"',
  'Blackbird freezes, nose up like a hound. "I can feel one. A Cyberfrog. Please be {guess}. Please be {guess}."',
  '"Do you feel that?" Blackbird says, to nobody. "Cyberfrog. Nearby. Is it {guess}?"',
];
export const SENSE_THOUGHTS: readonly string[] = [
  'There is a Cyberfrog out there, and it is not going to collect itself.',
  'Everything else can wait. This cannot.',
  'My whole body knows. It is a very specific feeling.',
  'Somebody is going to be guarding it. Somebody is going to regret that.',
];

/** She gets there and sees which one it really is. */
export const SEE_LINES: readonly string[] = [
  'And there it is: {full}. Blackbird presses a hand to her chest.',
  '{full}. Blackbird has to put a hand on the wall.',
  'It is {full}. Blackbird says it out loud, reverently, to make sure the street hears.',
];
export const SEE_WRONG: readonly string[] = [
  'Not {guess} at all. It is {full}. Blackbird recovers quickly and is, if anything, more excited.',
  'It is {full}, and not {guess}, which she had been so sure of. She forgives it instantly.',
];

/** She gets it. `{full}` is the title with the edition, `{bio}` the backstory. */
export const COLLECT_LINES: readonly string[] = [
  'Ooh, {full}! Blackbird cradles it in both hands like a baby bird.',
  '"{full}!" Blackbird holds it up to the light, turning it slowly. "{bio}"',
  'Blackbird has {full}. She says its name twice, quietly, as if it might leave.',
  '{full}. Blackbird checks the paint, the joints and the little tag under the foot, and nods like a jeweller.',
  '"{bio}" Blackbird tells the {short} in her palm, who has heard it before.',
];
export const COLLECT_THOUGHTS: readonly string[] = [
  'Mine. Safe. Nobody is touching this one.',
  'Some people have a church. I have a shelf.',
  'It does nothing. It does absolutely nothing. It is perfect.',
  'You are going somewhere very safe, little guy.',
];

/** She sends it home. */
export const LAB_LINES: readonly string[] = [
  'Blackbird wraps {short} in her scarf, and a courier drone takes it off to the lab. The lab assistant is to put it on the shelf. Gently.',
  '{short} goes back to the lab for safekeeping: bubble wrap, tissue paper, a drone with strict instructions. The shelf is, by now, a lot.',
  'She tucks {short} into the lab drop and watches it go. It is the only thing in Neo she would take a bullet for, and she is going to say so again, loudly.',
  'Blackbird sends {short} home to the lab. It will be there, safe and dusted and in a case, long after she is gone.',
];
export const LAB_DUPES: readonly string[] = [
  'The lab already has {short}, but Blackbird says one can never have too many, and it is a different edition anyway. Probably.',
  'That makes {count} of {short} in the lab. Blackbird refuses to hear the word "duplicate."',
];
export const LAB_FIRSTS: readonly string[] = [
  'It is a new one for the collection! The lab shelf gets a little emptier, in a good way.',
  'A first for the collection. Blackbird pins a gold star to the case herself.',
];
