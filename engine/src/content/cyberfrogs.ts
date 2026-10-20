/**
 * Cyberfrogs. Cheap plastic collectibles, a nightmare marketing gimmick: 121 characters in 11 lines, each with a gear
 * loadout, a backstory and a personality, every one of them sold in blind boxes in a half-dozen editions. They do absolutely
 * nothing. Blackbird knows every one of them by heart (see cyberfrogs.ts).
 *
 * Bios are written in the voice of the box: pronouns and all, with a backstory that links the frogs to each other and to "the War"
 * (never named, never explained, and everybody was in it). Croaky and Ribbit's family is the thread that runs through it.
 */

import type { Gender } from '../types';

export interface FrogLine {
  key: string;
  /** The line's name, as it is on the box. */
  name: string;
  /** The slogan, as it is on the box. */
  slogan: string;
}

export interface FrogDef {
  /** How the box refers to them in the back-of-box copy (he, she, they or it); the bio is written to match. */
  gender: Gender;
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

type Row = [name: string, gear: string, gender: Gender, bio: string];

// "The War" is never named, and never will be. Everybody who was in it was in it; nobody says which side.
const ROWS: Row[] = [
  // ---- The Original Eleven
  ['Donald', 'with a sword', 'man', 'The leader. A corporate drain took his family\'s pond, and he swore to take it back, one lily pad at a time. He still won\'t say whose name was on the drain order, but he looks at Oswald when he doesn\'t say it.'],
  ['Jasmine', 'with twin chrome pistols', 'woman', 'Hacker and pond-hopper. She never says where she is from, and her catchphrase is "ribbit.exe has stopped responding." Her old squad fought in the War, and she deleted the roster herself.'],
  ['Marcus', 'with a rocket launcher', 'man', 'Demolitions expert with a short fuse. He is allergic to ponds, which explains a great deal. He learned his trade in the War, from a sergeant he calls "Auntie Croak."'],
  ['Priya', 'with a data tablet', 'woman', 'The brains. She has mapped the whole sewer network and rates every tunnel out of five stars. She has never rated the one under the Founder\'s tower, and it is the only tunnel she won\'t discuss.'],
  ['Walter', 'with a cane', 'man', 'Veteran of the Great Fly Shortage and, before that, of the War. He tells the same story every episode and it is different every time, except the part where Sergeant Croaky carried him out.'],
  ['Esperanza', 'with a katana', 'woman', 'Swordmaster raised by a family of mechanical herons after the War left her nothing else. Her honor rating is extreme. She has never lost a duel and is still looking for the one who taught the herons.'],
  ['Tobias', 'with a jetpack', 'man', 'Daredevil courier. He has never completed a delivery, but he arrives with style. The package he carried across the War is still in his locker, unopened.'],
  ['Mei', 'with a mini drone', 'woman', 'The youngest. Her best friend is a drone called Gerald, and nobody has the heart to tell her what Gerald used to be. He flew in the War, and she thinks he is just shy.'],
  ['Rufus', 'with a boombox', 'man', 'The heart of the team. Every battle has a soundtrack and he owns the whole catalogue, including the one tape he found in the ruins and refuses to play.'],
  ['Beatrice', 'with a grappling hook', 'woman', 'Infiltrator. She is famous for "I was never here," said while very clearly there. Rumor has it she was the one who got Croaky out of the Founder\'s vault, and that she was never there.'],
  ['Oswald', 'in a lab coat', 'man', 'Mad scientist who created every other Cyberfrog by accident. He regrets nothing and apologizes constantly. His first notebook is dated the last week of the War.'],
  // ---- Street Division
  ['Dante', 'with a skateboard', 'man', 'Grinds rails for the neighbourhood. He believes the city is just one long rail with commitment issues. His brother Dax didn\'t come back from the War, and the board is Dax\'s.'],
  ['Lucille', 'with a spray can', 'woman', 'Muralist. Her tags appear on buildings before the buildings are built. One wall in the Dark Pond just says "CROAKY LIVES" in her handwriting, and she denies it.'],
  ['Fitzgerald', 'with a mystery briefcase', 'man', 'Courier of the unmarked. He has never opened the case, and neither will you. He was handed it by a wounded Cyberfrog on the last night of the War, and he made a promise.'],
  ['Nadia', 'on a hoverbike', 'woman', 'Racer. She has been disqualified from every race for finishing before the starting gun. The bike was built from a wrecked War-era gunship, and it still hums the anthem.'],
  ['Corey', 'with a basketball', 'man', 'Streetball legend. He dunks from the wrong side of the hoop on principle. He and Tobias are cousins, and neither will admit it.'],
  ['Imani', 'with a megaphone', 'woman', 'Block organizer. She shouts the news, the weather and the occasional poem from the same rooftop. She was a War correspondent, and she is the reason anyone remembers there was one.'],
  ['Hector', 'with nunchucks', 'man', 'Dojo dropout. He only knows one kata, but performs it with tremendous feeling. The dojo was Esperanza\'s, and he is not allowed back.'],
  ['Penelope', 'with a noodle cart', 'woman', 'Sells the best noodles in the district. The secret ingredient is also the secret to the plot. Her recipe came from a field kitchen in the War, run by a cook called Granny Croak.'],
  ['Jun', 'with neon sunglasses', 'man', 'Too cool for the pond. He has never been seen without the shades, including in the shower. They were issued in the War, and they are the only thing he kept.'],
  ['Grace', 'with a riot shield', 'woman', 'Ex-security. She left the force when asked to guard a puddle, and she takes puddles very seriously now. The shield is dented where the Founder\'s men hit it.'],
  ['Bartholomew', 'with a trash can lid', 'man', 'Dumpster diver and philosopher. He believes everything is salvageable, including regret. He found Gerald in a skip behind the Founder\'s tower, and he has said nothing.'],
  // ---- Legends of the Lily Pad
  ['Aldric', 'with a longbow', 'man', 'Ranger of the Reed Forest. He never misses and has started to take it personally. He trained under the Marsh Tower\'s first archmage, who is not allowed to be named.'],
  ['Seraphina', 'with a glowing staff', 'woman', 'Archmage of the Marsh Tower. Her spells work perfectly, but the wording is always slightly off. She holds the one spell that ended the War, and it is wrong in exactly the way she planned.'],
  ['Gareth', 'with a warhammer', 'man', 'Dwarf-raised, frog-born. He insists the hammer is a "mallet of negotiation." It was forged from War-era cannon, and it is still warm.'],
  ['Isolde', 'with a lute of questionable magic', 'woman', 'Bard. Her songs are enchanted, and the enchantment is mostly about getting stuck in your head. She wrote the one about Croaky, and every bard since has copied it badly.'],
  ['Merlin', 'with a pointy hat', 'man', 'Wizard. He keeps forgetting the spell, and then the hat does it instead. The hat has a name, and it was Seraphina\'s teacher.'],
  ['Brunhilde', 'with a winged helmet', 'woman', 'Shieldfrog of the Northern Bog. Opera is mandatory at every funeral, and she plans them often. She stood beside Croaky on the day the line held, and she sings that day every year.'],
  ['Cedric', 'with a shield and a tiny castle', 'man', 'Knight errant. The castle is on his back, and it has never been defeated, only dented. He is the last of the Order that guarded the War\'s final bridge.'],
  ['Morgana', 'with a bubbling cauldron', 'woman', 'Potion-maker. Every potion is a soup, and every soup is a threat. The base recipe is a War ration, and she swears the old rations were better.'],
  ['Percival', 'with a lance', 'man', 'Knight of the Round Pond, who is very sensitive about how many times it is a pond. He carries the lance Cedric dropped on the bridge, and he has not told Cedric.'],
  ['Thistle', 'with a firefly lantern', 'nonbinary', 'Woodland sprite-frog. They guide lost travellers to places they did not want to go but needed to. They were born in the burned wood where the War ended, and they have never left it.'],
  ['Ragnar', 'with a battleaxe', 'man', 'Berserker. He calms down exactly once per episode and uses it to apologize to the furniture. The furniture is Gareth\'s, and Gareth is still waiting for the rest of the apology.'],
  // ---- Pond Professionals
  ['Dr. Patel', 'with a stethoscope', 'woman', 'Surgeon. She operates on anything with a pulse or a warranty, and her bedside manner is "good news, mostly." She was a War medic, and she can still tell a Croaky stitch from across the room.'],
  ['Chef Lorenzo', 'with a flaming wok', 'man', 'Michelin-starred and Michelin-banned. The restaurant has seven stars and one fire exit. He trained in Granny Croak\'s kitchen and has never told Penelope.'],
  ['Officer Daniels', 'with a baton and a donut', 'man', 'Beat cop. He has solved exactly one case, on the same day the donut shop opened. The case file is about the Founder, and it is the only one that has ever gone missing.'],
  ['Judge Harriet', 'with a gavel', 'woman', 'Presides over the Court of Small Claims. The court is a puddle, and the verdicts are final. She has a sealed case about the War, and she has never once opened it.'],
  ['Captain Mbeki', 'in a tiny submarine', 'woman', 'Deep-sea explorer of the ornamental fish tank. She has found things down there that should not be. Her first mate was Pip\'s balloon, which is the real reason Pip\'s balloon is a villain.'],
  ['Professor Quill', 'with a chalkboard', 'man', 'Lecturer. He teaches the history of ponds to a class of one, who left years ago. The chapter on the War is the only one he has never been able to finish.'],
  ['Pilot Amara', 'with aviator goggles', 'woman', 'Flies the Cyberfrog cargo plane. She has landed every time, technically, in a field belonging to someone else. She flew supply runs in the War, and Croaky\'s medal came in her hold.'],
  ['Mechanic Stan', 'with a wrench', 'man', 'Fixes anything with a handle, a hinge or a grudge. He has never read a manual and never will. He rebuilt Nadia\'s hoverbike from a gunship he claims he does not recognize.'],
  ['Barista Dolores', 'with a giant latte', 'woman', 'Writes your name on the cup wrong on purpose. The coffee is legendary and so is the silence. She served the coffee at the War\'s surrender, and nobody else has ever asked what was said.'],
  ['Accountant Kevin', 'with a calculator', 'man', 'Audited the entire pond economy and found it to be a pond. He is dangerous when the numbers add up. The Founder\'s books never added up, and Kevin has known for years.'],
  ['Lifeguard Trixie', 'with a rescue buoy', 'woman', 'On duty at a pond that is four centimetres deep. She has saved six lives and counts every one. The first was a veteran of the War, and she never learned his name, only that he said "Croaky" in his sleep.'],
  // ---- Cyberfrog Cosmos
  ['Neil', 'in a spacesuit', 'man', 'First frog on the moon. He took one small hop, and the hop is still going. He left the War to do it, and he is not sure it was the right call.'],
  ['Valentina', 'with a ray gun', 'woman', 'Space pirate. She plunders only things that were already stolen, which she thinks makes it fair. Her ship was a War-surplus freighter, and she has never explained the cargo.'],
  ['Zorp', 'with three eyes', 'nonbinary', 'Visitor from the Andromeda Marsh. They understand nothing about Earth and have opinions about all of it. They arrived during the War and watched it from orbit, and they find the subject upsetting.'],
  ['Commander Okonkwo', 'with a star map', 'woman', 'Captain of the starship Lily Pad. The map is upside down and nobody dares to say so. She commanded a War fleet of one ship, and that ship is this one.'],
  ['Luna', 'with a moon rock', 'woman', 'Moonbase caretaker. She waters the lunar garden daily, though nothing has grown. The seeds came from Croaky\'s garden, and hope springs eternal.'],
  ['Orion', 'with a comet on a leash', 'man', 'Astronomer-adventurer. The comet is called Biscuit and returns every seventy-six years to be fed. He last saw the War from its tail.'],
  ['Pixel', 'with a holo-visor', 'nonbinary', 'Lives inside the starship computer and insists on being treated as a person and, in fairness, a frog. They were the War\'s last targeting system, and they have never fired again.'],
  ['Quasar', 'with a plasma blade', 'man', 'Cosmic duelist. He has fought a black hole to a draw and demands a rematch. His blade was Esperanza\'s, and she lent it to him in a very small war of their own.'],
  ['Nebula Nan', 'with knitting needles', 'woman', 'The grandmother of the galaxy. She knits scarves for planets, and every planet has been very warm since. She knitted the scarf Croaky wore at the end of the War.'],
  ['Cosmo', 'with a rocket backpack', 'man', 'Test pilot. The backpack has two settings: off and "regret." He was Tobias\'s flight instructor, and they have both agreed not to talk about it.'],
  ['Astra', 'with a telescope', 'woman', 'Stargazer. She has discovered four new planets and misplaced two of them. She also found the place in the sky where the War\'s last signal came from, and she keeps looking.'],
  // ---- Dark Pond
  ['Raven', 'with a chain', 'woman', 'Goth frog. She lives in a crypt that is also a pond and has never been seen to blink. The crypt is the War\'s memorial, and she is its only visitor.'],
  ['Damien', 'with a scythe', 'man', 'Reaper of the reed beds. He only harvests overdue library books, but nobody will say that to the scythe. The scythe came from the field of the last battle of the War.'],
  ['Vesper', 'with a crossbow', 'woman', 'Vampire hunter. She is allergic to garlic, which is the cruellest twist in the franchise. Her mentor was Aldric, who has stopped taking calls.'],
  ['Nyx', 'in a long trench coat', 'nonbinary', 'Detective of the night shift. They narrate every thought in a gravelly voice nobody asked for. They are working a cold case about a Cyberfrog who vanished on the last day of the War.'],
  ['Cain', 'with a flaming skull', 'man', 'Ghost rider of the swamp. The skull is a real skull, the flame is a lighter and the mood is real. The skull is a War comrade\'s, and he is not ready to say whose.'],
  ['Lilith', 'with a vial of something green', 'woman', 'Alchemist. Whatever is in the vial is both the cure and the problem. She was Morgana\'s apprentice until the potion that ended their partnership, which is still being argued.'],
  ['Mortimer', 'with a tiny coffin', 'man', 'Undertaker. He is always on time, always in black, always sorry for your loss, whoever you are. He buried more Cyberfrogs in the War than anyone, and he kept one casket empty.'],
  ['Sable', 'with throwing knives', 'woman', 'Assassin with a conscience, which leaves only a very short career. She took one contract in the War, and she has been trying to cancel it ever since.'],
  ['Hex', 'with a cursed mirror', 'man', 'He looks into the mirror every day and sees a different frog. They are all handsome. One morning the mirror showed him Croaky, and he has not looked since.'],
  ['Draven', 'with a leather cape', 'man', 'Brooding antihero. He has been brooding since issue one and refuses to move on. Issue one was the War, and he has never forgiven the writers.'],
  ['Wraith', 'hooded, no weapons', 'nonbinary', 'The scariest one on the shelf. They have no weapons, no gear and no backstory, which is their backstory. Fans say Wraith is the War itself, and the box says "no comment."'],
  // ---- Holiday Specials
  ['Nick', 'in a Santa hat with a sack', 'man', 'Delivers presents to every pond at once by never leaving the sack. The sack is bigger inside. During the War the sack carried supplies, and he says it has never been that heavy since.'],
  ['Valentine', 'with a heart-shaped box', 'woman', 'Hopeless romantic. The box holds a dozen chocolates and one live grenade, by accident. She wrote letters to a soldier in the War, and the box is the only reply she kept.'],
  ['Spooky Steve', 'in a pumpkin costume', 'man', 'Haunts the autumn aisle of every supermarket. He gets scared of his own reflection every time. The costume is Mortimer\'s idea of a joke, and Steve has never been told.'],
  ['Harvest Hannah', 'with a pumpkin pie', 'woman', 'Bakes pies so good that wars stop for a slice. Wars have been paused since 1999, but not that one. She served a pie at the War\'s end, and it is why it ended.'],
  ['Easter Edgar', 'with a basket of explosive eggs', 'man', 'Hides eggs. The eggs are fine, and it is the basket that is the issue. The basket was Marcus\'s, from his War days, and neither of them wants it back.'],
  ['Frostine', 'with ice skates', 'woman', 'Figure skater. She has not touched the ground since the pilot episode. She skated across the frozen front in the War, and the ice still remembers.'],
  ['Cinco Carlos', 'with maracas', 'man', 'The life of every party. He shakes his maracas to the rhythm of whatever is about to go wrong. He led the band at Croaky\'s homecoming, and he is still playing it.'],
  ['New Year Nina', 'with party poppers', 'woman', 'Counts down to midnight every night and is wrong every time. The party goes on anyway. The first midnight she ever missed was the one that ended the War.'],
  ['Independence Ike', 'with a box of fireworks', 'man', 'Patriot. Fireworks are personal, neighbours are an afterthought and the pond is lovely in summer. He was told which side he was on in the War, and he has been apologizing since.'],
  ['Thankful Theo', 'with a turkey drumstick', 'man', 'Grateful for everything, especially the drumstick. He has a very complicated relationship with turkeys. He was fed by Granny Croak\'s kitchen when no one else would feed him.'],
  ['Diwali Devi', 'with sparklers', 'woman', 'Lights the pond in all colours. Her glow lasts exactly as long as the best moment of the night. She lit the way home for the War\'s survivors, and she has not stopped.'],
  // ---- Retro Wave
  ['Chad', 'with a mullet and a keytar', 'man', 'Rock star of the rec room. The solo is eleven minutes long and the encore is a hostage situation. His first band was a War-time morale unit, and the drummer was Rufus\'s father.'],
  ['Tiffani', 'with enormous hair', 'woman', 'Mall rat. The hair has its own zip code, a fan club and a restraining order. She hid in the mall through the War, and it was the safest place in the pond.'],
  ['Maxwell', 'with a floppy disk', 'man', 'Computer whiz. The disk holds the entire plot of the series in 1.44 megabytes, and no one has dared to read it. He has: it begins "In the War," and it ends mid-sentence.'],
  ['Brenda', 'with a rotary phone', 'woman', 'Switchboard operator of the pond. She knows every secret and charges only for the long-distance ones. She took the last call of the War, and she has never repeated it.'],
  ['Rex', 'with a VHS tape', 'man', 'Video-store clerk. Be kind, rewind, and keep the cursed tape in a drawer labelled "do not." The tape is War footage, he knows whose handwriting the label is, and he has never asked Jasmine.'],
  ['Sherry', 'with a mixtape', 'woman', 'Made a mixtape for someone in 1987 and has never recovered from the lack of reply. The someone was Cedric, and he never got the tape because of the bridge. She still rewinds it.'],
  ['Duke', 'with a personal cassette player', 'man', 'Skateboard punk. He only listens to one song, and it is a long song about a pond. The song is Isolde\'s ballad, played at the wrong speed, and he likes it better.'],
  ['Mallory', 'with a pager', 'woman', 'Intern at a firm that does not exist. She gets a message once a year, and it is always "call me." The firm was the Founder\'s, and she has been calling back since the War.'],
  ['Kurt', 'with a dial-up modem', 'man', 'Early internet adventurer. The connection takes three minutes and the adventure takes four. He was the first to post the War\'s casualty list online, and the page is still up.'],
  ['Heather', 'with a virtual pet', 'woman', 'She has kept the same pet alive for thirty years. The pet is not alive. Heather does not accept this, and neither does the pet, which is Gerald\'s cousin.'],
  ['Biff', 'on a hoverboard', 'man', 'Time-travelling jock. He keeps arriving at the right place at the wrong moment, and vice versa. His favourite destination is the last day of the War, and he has never once arrived in time.'],
  // ---- Tadpole Pals
  ['Bubbles', 'with a bubble wand', 'woman', 'Tiny optimist. Every bubble holds a wish, and every wish is for more bubbles. She was born in the shelters of the War, and the bubbles were the only toy.'],
  ['Squish', 'in a tiny hat', 'nonbinary', 'Cannot stop hugging. The hat has never once fallen off, no matter what. It was Croaky\'s hat, and Squish says they are the only one allowed to wear it.'],
  ['Noodle', 'with an enormous noodle', 'man', 'Believes the noodle is a sword. Everyone lets Noodle believe. Penelope gave him the noodle, and Esperanza taught him the stance.'],
  ['Pip', 'with a red balloon', 'woman', 'Floats away every episode and is returned by the very end. The balloon is always the villain. The balloon belonged to Captain Mbeki\'s first mate, and her grudge is mutual.'],
  ['Mochi', 'with a rice ball', 'woman', 'Shy, round and soft. She hides in bigger frogs\' pockets and gets mistaken for a snack. She was found in a War-time ration crate, and Croaky named her.'],
  ['Waffles', 'with a syrup bottle', 'man', 'Breakfast enthusiast. He has been waiting for the pancake army since the first season. The pancake army was a War-time rumor, and he is the last who believes it.'],
  ['Sprout', 'with a seedling', 'nonbinary', 'Gardener. They grow tiny things and tell them off when they do not grow. The seedling is a cutting from Croaky\'s garden, the same as Luna\'s seeds.'],
  ['Button', 'with a teddy bear', 'man', 'The teddy is the real hero, and Button is just the carrier. He has accepted this. The teddy was a War-time toy, and it has a medal of its own.'],
  ['Peanut', 'on roller skates', 'woman', 'Fastest tadpole in the pond. She has never successfully stopped. Her mother ran messages through the War on the same skates, and never stopped either.'],
  ['Gizmo', 'with a screwdriver', 'man', 'Tiny inventor. Every invention is a toaster, and every toaster is, somehow, haunted. His first toaster is a War-time field radio, and it still receives.'],
  ['Dot', 'with a polka-dot bow', 'woman', 'Fashion icon of the shallow end. The bow changes the world around it, but only on picture day. It was cut from the flag of nobody in particular, and she likes that.'],
  // ---- The Toxic Swamp Syndicate
  ['Big Tony', 'with a tommy gun', 'man', 'Crime boss of the swamp. He runs a respectable fly-protection racket and a less respectable puddle one. He made his money in the War, selling to both sides, and Croaky never forgave him.'],
  ['Madame Croak', 'with a feathered fan', 'woman', 'Hosts the underground casino. The house always wins, and the house is a lily pad. She is Croaky\'s estranged sister, and the family has never been in the same room since.'],
  ['Baron Von Bog', 'in an elaborate cravat', 'man', 'Aristocratic villain. He owns a mansion, a title and, for tax reasons, a pond. His title was granted for services in the War, and the records of those services are sealed.'],
  ['The Slime', 'with nothing but attitude', 'none', 'Mysterious. It has no backstory and a very strong smell. Fans insist the smell is the backstory, and that the smell is from the War.'],
  ['Viktor', 'with a briefcase of leeches', 'man', 'Debt collector. He is polite, patient and followed by a lot of leeches. His biggest debtor was the Founder, and the debt is the only thing in the Golden Pond Club he has not been able to collect.'],
  ['Dr. Murk', 'with a death ray', 'man', 'Evil scientist. The ray has never worked and is used mostly to heat the lab. He was Oswald\'s lab partner until the accident, and they each blame the other for the War.'],
  ['Slick Eddie', 'with a pinky ring', 'man', 'Smooth-talking con frog. He has sold the Cyberfrog Tower three times, and it was never for sale. He once sold Big Tony a War medal that turned out to be real.'],
  ['Gloria Gloom', 'with a poison ring', 'woman', 'Heiress. She disinherited everyone, including herself, in her own will. The fortune was the Founder\'s, and she gave the first share to the War\'s widows.'],
  ['Mister Mold', 'with a cloud of spores', 'man', 'Slow, patient, inevitable. He wins every argument by being left in a corner. He grows on War memorials, and he has opinions about every name on them.'],
  ['Lady Lurk', 'with a long, long shadow', 'woman', 'She stalks the corners of other frogs\' episodes. She is credited, always, as "and Lady Lurk." She was a War spy, and nobody is certain whose.'],
  ['Sludge', 'with a barrel of toxic waste', 'man', 'Not evil, just very sticky. He wants a hug and has had to learn to settle for a handshake. The barrel came from the Founder\'s drain, the same one that took Donald\'s pond.'],
  // ---- The Golden Pond Club
  ['Archibald', 'with a golden crown', 'man', 'The first frog king. He reigned for a single, glorious Tuesday. The crown was melted down for the War, and the one he wears is a very good copy.'],
  ['The Founder', 'with a binding contract', 'none', 'Founded the company that makes Cyberfrogs. The contract lists every frog as a legal heir. Nobody has seen the Founder in person since the War, and its signatures never change.'],
  ['Hopkins', 'with a champagne glass', 'man', 'Butler to the Golden Pond. He knows everything, serves everyone and would never, ever say. He served the Founder through the War, and he has never once been asked.'],
  ['Empress Azalea', 'with a jeweled sceptre', 'woman', 'Ruler of the Hidden Pond. Her coronation was a very long, very expensive nap. She was crowned the day the War ended, and some say she ended it by being asleep.'],
  ['Phineas', 'with a top hat', 'man', 'Showfrog. Every performance is the last one, and there have been four hundred last performances. The first was a War benefit, and he has never accepted the thanks.'],
  ['Sir Reginald', 'with a monocle and a knighthood', 'man', 'Knighted for services to ponds. The service has never been specified, and the monocle is a vow. He was knighted by Archibald, in the War, in secret.'],
  ['Gold Gwen', 'dipped in gold', 'woman', 'Cursed by a touch. Everything Gwen holds turns to plastic, which in this world is a kind of gold. She was the Founder\'s first test, and she is the reason for the contract.'],
  ['Prime', 'with a cape and a cosmic hop', 'none', 'The ultimate Cyberfrog. Prime exists in every line, every edition and, supposedly, every pocket. Prime fought in the War, and it has no idea which side won.'],
  ['Echo', 'with a mirror of nothing', 'nonbinary', 'The reflection of the Golden Pond Club. If you find Echo, Echo has found you first. Echo remembers the War from every side at once, and they say it is not a comfort.'],
  ['Croaky', 'with a service medal', 'woman', 'Sergeant Croaky, who fought in the War. Which war it was is not specified, but a war it was. She carried Walter out, held the line beside Brunhilde and wore the scarf Nebula Nan knitted. She is the grandmother of Ribbit, and she has never once talked about it.'],
  ['Ribbit', 'with no gear at all', 'nonbinary', 'The brand mascot, packed one in ten thousand boxes. Ribbit is Croaky\'s grandchild, and Ribbit has never been told what the War was. Collectors say they are real. The company says "who?"'],
];

export const FROGS: readonly FrogDef[] = ROWS.map(([name, gear, gender, bio], i) => ({ name, gear, gender, bio, line: Math.floor(i / LINE_SIZE) }));

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
