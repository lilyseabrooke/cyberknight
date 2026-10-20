import { type Affordance } from '../affordances';
import { R, type VenueView } from '../venuekit';
import { row, wallGuitar } from './luthierafford';
import { acquire, addHeat } from '../combat';
import { addDeed, playing, resurface } from '../provenance';
import { hasInstrument } from '../instruments';
import type { PlaceView } from '../placekit';

/**
 * The second half of a luthier's rows: what today's situation brings, what the wild cards allow, and what only some kinds of
 * luthier offer (the welding rig, the Titanware chair, the Muse scanner, the tonewood vault).
 */

const vv = (v: PlaceView): VenueView => v as VenueView;

const SITUATIONAL: Affordance<VenueView>[] = [
  row({
    id: 'emergency-repair', where: { situation: 'emergency' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:guitar', 'stat:reflex'],
    sees: 'A touring guitarist with a snapped neck, a show tonight and a face like the end of the world.', stakes: 'Fix it in an hour: a big fee, a grateful touring band, and guest-list fame.', consequence: 'A band on tour owes her.',
    drives: { greed: 0.5, quest: 0.4 }, bonus: 0.2,
    check: { who: 'arch:luthier_customer', parts: ['tinkering', ['guitar', 0.4], ['stat:reflex', 0.4]], base: 0.4, per: 0.06,
      win: R(['Blackbird and the luthier at {venue} glue, clamp and cure a snapped neck in fifty minutes flat. {npc} plays the first chord of the night on it and pays her {amount}nd, and puts her on the guest list in three cities.'], { cash: [50, 140], purse: true, fame: 0.8, train: [['tinkering', 3]], thought: ['I saved a show. Several shows.'] }),
      lose: R(['The neck at {venue} snaps again, in a new place, as {npc} watches.'], { affinity: -5, thought: ['That neck was doomed.'] }) },
  }),
  row({
    id: 'unload-wood', where: { situation: 'delivery' }, pace: 'session',
    needs: ['stat:muscle', 'skill:athletics', 'drive:quest'],
    sees: 'A delivery of tonewood being unloaded board by board, and a luthier who cannot lift any more.', stakes: 'An hour carrying: the luthier\'s gratitude and the pick of the offcuts.', consequence: 'A sore back and a friend.',
    drives: { quest: 0.3, greed: 0.2 }, bonus: 0.05,
    check: { who: 'owner', parts: ['stat:muscle', ['athletics', 0.5]], base: 0.6, per: 0.04, physical: true,
      win: R(['Blackbird carries the whole delivery into {venue}, board by board, and is given first pick of the offcuts and a mug of something strong.'], { sore: 0.15, affinity: 10, train: [['athletics', 2]], thought: ['Wood. Heavy. Worth it.'] }),
      lose: R(['Blackbird drops a board of irreplaceable wood at {venue}. It lands on its edge and rings like a bell, unharmed. The luthier sits down.'], { sore: 0.1, affinity: -4, thought: ['It was fine. It sang.'] }) },
  }),
  row({
    id: 'estate-auction', where: { situation: 'auction' }, pace: 'session',
    needs: ['skill:haggling', 'skill:calculate', 'drive:greed'],
    sees: 'A dead player\'s guitars going under the hammer, one by one, and a room that does not know what they are.', stakes: 'Bid smart: a storied guitar at a fraction, or overpay for a story.', consequence: 'A dead player\'s guitar is hers.',
    drives: { greed: 0.6, curiosity: 0.4 }, bonus: 0.15, ok: (w) => w.hero.cash >= 100,
    check: { pay: [60, 120], parts: ['haggling', ['calculate', 0.5]], base: 0.4, per: 0.06,
      win: R(['At the auction at {venue}, Blackbird waits through four lots and bids once, at the last second, on the plain one with the worn neck. {item}, for {pay}nd. The worn neck was the point.'], { apply: (c, v, _w, tok) => { const g = wallGuitar(c, v, 3, 'a dead player\'s favourite'); addDeed(g, 'sold at auction from an estate'); acquire(c, g); tok.item = g.name; }, train: [['haggling', 2], ['calculate', 2]], thought: ['The dead have good taste.'] }),
      lose: R(['Blackbird bids {pay}nd at the auction at {venue} on a guitar that turns out to be a very convincing ukulele.'], { item: 'ukulele', thought: ['It is a guitar in spirit.'] }) },
  }),
  row({
    id: 'hide-from-clearance', where: { situation: 'audit' }, pace: 'quick',
    needs: ['skill:sneak', 'skill:grifting', 'drive:bravery'],
    sees: 'A Clearance officer inspecting instruments for compliance, highlighter in hand, and her guitar on her back.', stakes: 'Keep her guitar out of the inspection, or lose it "for safekeeping".', consequence: 'Clearance did not see her guitar.',
    drives: { bravery: 0.4 }, bonus: 0.1, ok: (w) => hasInstrument(w.hero),
    check: { parts: ['sneak', ['grifting', 0.5]], base: 0.5, per: 0.06,
      win: R(['Blackbird hangs her guitar on the wall at {venue} with a price tag on it, and the Clearance officer walks past it twice.'], { train: [['sneak', 2], ['grifting', 1]], thought: ['Hidden in plain sight. Among its peers.'] }),
      lose: R(['The Clearance officer at {venue} looks at Blackbird\'s guitar and smiles. "Is this licensed?" It is now Muse\'s.'], { apply: (c) => { const g = playing(c.w.hero); if (g) { const i = c.w.hero.inventory.indexOf(g); if (i >= 0) c.w.hero.inventory.splice(i, 1); (c.w.legacy.lostGuitars ??= []).push(g); addDeed(g, 'confiscated by Muse Clearance, for safekeeping'); } addHeat(c.w, 'muse', 1); }, thought: ['For safekeeping. I will keep it safe from them.'] }) },
  }),
  row({
    id: 'hand-tools', where: { situation: 'dark' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:perception', 'drive:curiosity'],
    sees: 'No power, hand tools only, and a luthier who is delighted.', stakes: 'An afternoon of hand-tool work by candle: a lot of tinkering XP, a lesson in patience.', consequence: 'She has learned the old way.',
    drives: { curiosity: 0.6 }, bonus: 0.15,
    check: { who: 'owner', parts: ['tinkering', ['perception', 0.5]], base: 0.55, per: 0.05,
      win: R(['In the power cut at {venue}, {npc} teaches Blackbird to plane a top by candlelight, by ear, the way it was done before the city had electricity. She has never been so calm.'], { train: [['tinkering', 5]], affinity: 6, thought: ['No power. All power. That is a koan.'] }),
      lose: R(['Blackbird planes a top by candlelight at {venue} and planes a little of her thumb too.'], { hp: -2, thought: ['Blood is a finish.'] }) },
  }),
  row({
    id: 'sale-rack', where: { situation: 'sale' }, pace: 'quick',
    needs: ['skill:perception', 'skill:haggling', 'drive:greed'],
    sees: 'A SALE sign, in a hand that clearly does not believe in sales, over a rack of seconds.', stakes: 'A real bargain hidden among the seconds: a guitar for not much.', consequence: 'A bargain.',
    drives: { greed: 0.6 }, bonus: 0.15, ok: (w) => w.hero.cash >= 40,
    check: { pay: [25, 40], parts: ['perception', ['haggling', 0.4]], base: 0.45, per: 0.06,
      win: R(['In the sale rack at {venue}, behind a dozen seconds, is {item}, mismarked, for {pay}nd.'], { apply: (c, v, _w, tok) => { const g = wallGuitar(c, v, 1); acquire(c, g); tok.item = g.name; }, thought: ['A sale. Finally, one worth it.'] }),
      lose: R(['The sale rack at {venue} is all seconds. She buys one for {pay}nd out of pity.'], { item: 'ukulele', thought: ['A second. It has feelings too.'] }) },
  }),
  row({
    id: 'mind-the-shop', where: { situation: 'away' }, pace: 'session',
    needs: ['skill:hustling', 'skill:tinkering', 'drive:greed'],
    sees: 'The luthier is at a wood fair; the apprentice is in charge, and frightened.', stakes: 'Help the apprentice run the shop for an afternoon: a cut of the takings.', consequence: 'The apprentice thinks she is wonderful.',
    drives: { greed: 0.5, quest: 0.3 }, bonus: 0.1,
    check: { who: 'arch:luthier_apprentice', parts: ['hustling', ['tinkering', 0.5]], base: 0.5, per: 0.05,
      win: R(['Blackbird minds the shop at {venue} with {npc}, sells two guitars, fixes a third and takes {amount}nd for her trouble.'], { cash: [20, 70], affinity: 12, train: [['hustling', 2], ['tinkering', 2]], thought: ['I am a shopkeeper now. A cool one.'] }),
      lose: R(['Blackbird minds the shop at {venue} and sells a guitar for the price on the wrong tag.'], { affinity: -3, thought: ['Retail is chaos.'] }) },
  }),
  row({
    id: 'open-workshop-build', where: { situation: 'open' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:art', 'drive:curiosity'],
    sees: 'An open workshop: anybody can come in and build a little, and there are biscuits.', stakes: 'Build a cigar-box guitar in an afternoon: one of her own making.', consequence: 'A guitar she built.',
    drives: { curiosity: 0.7 }, bonus: 0.2,
    check: { parts: ['tinkering', ['art', 0.6]], base: 0.45, per: 0.06,
      win: R(['At the open workshop at {venue}, Blackbird builds a cigar-box guitar out of a biscuit tin and a broom handle. It is ugly and it sings. {item}.'], { apply: (c, v, _w, tok) => { const g = wallGuitar(c, v, 0); g.name = `cigar-box guitar she built herself at ${v.main.name}`; addDeed(g, 'built by her own hands'); acquire(c, g); tok.item = g.name; }, train: [['tinkering', 3], ['art', 2]], thought: ['I made a guitar. It is my child.'] }),
      lose: R(['Blackbird\'s cigar-box guitar at {venue} is, structurally, a box.'], { train: [['tinkering', 1]], thought: ['A box is a guitar that has not tried.'] }) },
  }),
  row({
    id: 'trace-the-burglar', where: { situation: 'burgled' }, pace: 'session',
    needs: ['skill:tracking', 'skill:streetwise', 'drive:quest'],
    sees: 'An empty vintage case, a broken lock, and a luthier who knows who did it but cannot prove it.', stakes: 'Track the guitar down: the luthier\'s undying gratitude (and a reward), or a cold trail.', consequence: 'The luthier owes her everything.',
    drives: { quest: 0.6, curiosity: 0.4 }, bonus: 0.15,
    check: { who: 'owner', parts: ['tracking', ['streetwise', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird follows sawdust footprints from {venue} to a fence two streets over, and gets the guitar back with one sentence and a stare. {npc} pays her {amount}nd and does not stop thanking her for a week.'], { cash: [60, 160], from: 'owner', affinity: 20, train: [['tracking', 3], ['streetwise', 1]], thought: ['A detective. Of guitars.'] }),
      lose: R(['The trail from {venue} ends at a canal. The guitar is, presumably, at the bottom of it.'], { thought: ['The canal has good taste.'] }) },
  }),
  row({
    id: 'choir-rush', where: { situation: 'choir' }, pace: 'session',
    needs: ['stat:muscle', 'skill:tinkering', 'drive:greed'],
    sees: 'Twelve armoured guitars for the Rust Choir by Friday, and a welder who has not slept.', stakes: 'Weld through the night: wages, the Choir\'s regard, sore arms.', consequence: 'The Rust Choir play guitars she armoured.',
    drives: { greed: 0.4, quest: 0.3 }, bonus: 0.1,
    check: { who: 'owner', parts: ['stat:muscle', ['tinkering', 0.6]], base: 0.5, per: 0.05, physical: true,
      win: R(['Blackbird welds plate onto guitar backs at {venue} until three in the morning. The Rust Choir collect them at dawn and one of them salutes her with a spanner.'], { cash: [30, 80], from: 'owner', sore: 0.15, apply: (c) => { c.w.heat.choir = 0; }, train: [['tinkering', 3]], thought: ['I armed a choir. Musically.'] }),
      lose: R(['Blackbird welds a guitar back at {venue} to the bench.'], { hp: -3, thought: ['Now it is a very loud bench.'] }) },
  }),
  row({
    id: 'signing-queue', where: { situation: 'signing' }, pace: 'session',
    needs: ['stat:charm', 'skill:speaking', 'drive:pride'],
    sees: 'A famous player signing guitars, a queue round the block, and a queue that would also take her signature.', stakes: 'Sit at the end of the table and sign too: fame, fans, and the famous player\'s irritation.', consequence: 'Half the queue left with her name.',
    drives: { pride: 0.9 }, bonus: 0.2, ok: (w) => (w.legacy.fame ?? 0) + w.hero.fame >= 15,
    check: { parts: ['stat:charm', ['speaking', 0.6]], base: 0.45, per: 0.06,
      win: R(['Blackbird sits down at the end of the signing table at {venue} without asking. By the end of the hour her line is longer than the famous player\'s.'], { fame: 2, apply: (c, v) => { v.main.fans = (v.main.fans ?? 0) + 6; }, thought: ['A queue. For me. Spontaneous.'] }),
      lose: R(['Blackbird sits down at the signing table at {venue} and is asked, very loudly, who she is.'], { thought: ['A famous person. In a quieter way.'] }) },
  }),
  row({
    id: 'find-strings', where: { situation: 'shortage' }, pace: 'quick',
    needs: ['skill:scavenging', 'skill:streetwise', 'drive:greed'],
    sees: 'A string shortage, and a luthier hiding the good sets in a sock drawer.', stakes: 'Find a source: the luthier\'s gratitude and a few sets (a small buff).', consequence: 'Strings, in a shortage.',
    drives: { greed: 0.4, curiosity: 0.3 }, bonus: 0.1,
    check: { who: 'owner', parts: ['scavenging', ['streetwise', 0.6]], base: 0.45, per: 0.06,
      win: R(['Blackbird knows a pawn shop with a crate of strings nobody has noticed. She brings {npc} at {venue} a bag of them and is given the good set from the sock drawer in return.'], { buff: { id: 'new_strings', power: 2, beats: 40 }, affinity: 8, thought: ['A supply chain. Of strings. Run by me.'] }),
      lose: R(['There are no strings anywhere. Blackbird checks every drawer in {venue}, including the sock drawer, which was a mistake.'], { affinity: -4, thought: ['The socks were not strings.'] }) },
  }),
  row({
    id: 'one-of-hers-in', where: { situation: 'hers' }, pace: 'session',
    needs: ['stat:charm', 'skill:perception', 'drive:pride'],
    sees: 'A guitar that came in this morning in a carrier bag, and a luthier looking at it, and then at her.', stakes: 'Her own old guitar, and a luthier who might just give it back to its owner.', consequence: 'A guitar of hers, home.',
    drives: { pride: 0.8, curiosity: 0.6 }, bonus: 0.35, ok: (w) => !!w.legacy.lostGuitars?.length,
    check: { who: 'owner', parts: ['stat:charm', ['perception', 0.5]], base: 0.45, per: 0.06,
      win: R(['{npc} at {venue} hands Blackbird the guitar out of the carrier bag before she says a word. "It\'s yours," {they} say{s}. "I can tell from the wear on the neck." {item}.'], { apply: (c, _v, _w, tok) => { const g = resurface(c.w, c.rng); if (g) { addDeed(g, 'brought home in a carrier bag'); acquire(c, g); tok.item = g.name; } else tok.item = 'nothing, in the end'; }, affinity: 6, thought: ['Home. Both of us.'] }),
      lose: R(['{npc} at {venue} believes it might be hers, but would like proof, and the proof is in a body she does not have any more.'], { thought: ['My fingerprints are on it. Old fingerprints. Mine.'] }) },
  }),
];

const WILDS: Affordance<VenueView>[] = [
  row({
    id: 'her-maker', where: { wild: 'her_maker' }, pace: 'session',
    needs: ['skill:guitar', 'stat:charm', 'drive:curiosity'],
    sees: 'A luthier who made a guitar for a previous Blackbird, and remembers her hands better than she does.', stakes: 'An afternoon with someone who knows how she used to play: a lot of guitar XP.', consequence: 'Her hands remember a little more.',
    drives: { curiosity: 0.8, pride: 0.4 }, bonus: 0.4, ok: (w) => !w.counters.her_maker_seen,
    check: { who: 'owner', parts: ['guitar', ['stat:charm', 0.4]], base: 0.6, per: 0.04,
      win: R(['{npc} at {venue} takes Blackbird\'s hands, turns them over, and says "you used to hold the neck lower." {They} show{s} her how she used to play, all afternoon, from memory. Her hands start to remember.'], { train: [['guitar', 12], ['music', 3]], counter: ['her_maker_seen', 1], affinity: 15, thought: ['They knew me. Before I knew me.'] }),
      lose: R(['{npc} at {venue} looks at her hands and shakes {their} head. "Different hands," {they} say{s}. "Same girl. Different hands."'], { train: [['guitar', 3]], counter: ['her_maker_seen', 1], thought: ['Different hands. Same me. Fine.'] }) },
  }),
  row({
    id: 'singing-board', where: { wild: 'singing_wood' }, pace: 'session',
    needs: ['skill:persuasion', 'skill:sneak', 'drive:curiosity'],
    sees: 'A board in the stack that sings when the wind blows, which the luthier will not cut for anyone.', stakes: 'Talk the luthier into cutting it for her guitar (resonance), or take it.', consequence: 'Her guitar sings in the wind.',
    drives: { curiosity: 0.7, greed: 0.3 }, bonus: 0.2, ok: (w) => !!playing(w.hero)?.inst && !w.counters.singing_wood,
    check: { who: 'owner', parts: ['persuasion', ['sneak', 0.4], ['music', 0.3]], base: 0.3, per: 0.06,
      win: R(['{npc} at {venue} listens to Blackbird play, then goes to the stack and takes out the singing board. A new top for her guitar, cut while she waits. It sings in the wind now, too.'], { apply: (c) => { c.w.counters.singing_wood = 1; const g = playing(c.w.hero); if (g?.inst) { g.inst.resonance = Math.min(3, g.inst.resonance + 2); g.inst.resonates ??= 'dragon'; addDeed(g, 'topped with the singing board'); } }, thought: ['My guitar has a voice of its own now. It is a duet.'] }),
      lose: R(['{npc} at {venue} will not cut the singing board, and starts to watch her hands.'], { apply: (c) => { c.w.counters.singing_wood = 1; }, thought: ['Some wood is not for sale. Annoying.'] }) },
  }),
  row({
    id: 'guitar-graveyard', where: { wild: 'graveyard' }, pace: 'session',
    needs: ['skill:scavenging', 'skill:tinkering', 'drive:greed'],
    sees: 'A yard out the back where guitars go to die, and some of them are not dead.', stakes: 'Dig one out and bring it back: a guitar for the price of an afternoon.', consequence: 'A guitar brought back from the dead.',
    drives: { greed: 0.5, curiosity: 0.5 }, bonus: 0.2, ok: (w) => !w.counters.graveyard_dug,
    check: { parts: ['scavenging', ['tinkering', 0.6]], base: 0.45, per: 0.06,
      win: R(['In the guitar graveyard behind {venue}, under a dead amp and a lot of rain, Blackbird finds {item}, mostly intact, and brings it back to life on the bench.'], { apply: (c, v, _w, tok) => { c.w.counters.graveyard_dug = 1; const g = resurface(c.w, c.rng) ?? wallGuitar(c, v, 1, 'dug out of the guitar graveyard'); addDeed(g, 'brought back from the dead'); acquire(c, g); tok.item = g.name; }, train: [['scavenging', 2], ['tinkering', 2]], thought: ['Resurrection. I know about that.'] }),
      lose: R(['The guitar graveyard behind {venue} is all splinters and one very angry fox.'], { hp: -2, apply: (c) => { c.w.counters.graveyard_dug = 1; }, thought: ['The fox was guarding it.'] }) },
  }),
  row({
    id: 'her-guitars-twin', where: { wild: 'twin' }, pace: 'session',
    needs: ['skill:haggling', 'stat:charm', 'drive:pride'],
    sees: 'The twin of a guitar she used to play, from the same tree, never sold.', stakes: 'Buy the twin: a guitar that already knows her.', consequence: 'She has her guitar\'s twin.',
    drives: { pride: 0.7, greed: 0.3 }, bonus: 0.25, ok: (w) => !w.counters.twin_bought && w.hero.cash >= 150,
    check: { pay: [100, 150], who: 'owner', parts: ['haggling', ['stat:charm', 0.5]], base: 0.55, per: 0.05,
      win: R(['{npc} at {venue} lets the twin go for {pay}nd, "because it has been waiting for you". {item}. It plays exactly the way her hands expect.'], { apply: (c, v, _w, tok) => { c.w.counters.twin_bought = 1; const g = wallGuitar(c, v, 3, 'the twin of a guitar she played in another life'); if (g.inst) g.inst.signature = Math.max(1, g.inst.signature); acquire(c, g); tok.item = g.name; }, thought: ['Twins. From the same tree. Like me and me.'] }),
      lose: R(['{npc} at {venue} will not sell the twin to anyone who does not know its sister\'s name. She does not.'], { apply: (c) => { c.w.counters.twin_bought = 1; }, thought: ['I knew it once. I am sure I did.'] }) },
  }),
  row({
    id: 'reprogram-robot', where: { wild: 'robot_luthier' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:hijack', 'stat:int'],
    sees: 'A robot luthier that learned from a master who died, and hums in his voice.', stakes: 'Teach it something new (a better bench for her, a discount), or set it humming a dirge.', consequence: 'The robot has learned from her.',
    drives: { curiosity: 0.6 }, bonus: 0.1,
    check: { who: 'owner', parts: ['tinkering', ['hijack', 0.5], ['stat:int', 0.5]], base: 0.35, per: 0.065,
      win: R(['Blackbird teaches the robot luthier at {venue} one of her own songs. It hums it while it works now, in the dead master\'s voice, and gives her a discount out of what it calls "gratitude subroutines".'], { affinity: 15, train: [['tinkering', 3]], apply: (c, v) => { const vi = vv(v); vi.info.keep = { ...(vi.info.keep ?? {}), rate: Math.max(0.3, Number(vi.info.keep?.rate ?? 1) * 0.7) }; }, thought: ['A robot with my song in its heart. Technically in its ROM.'] }),
      lose: R(['The robot luthier at {venue} stops, says "that is not how he did it" in a dead man\'s voice, and goes back to work.'], { thought: ['Loyal. To a ghost.'] }) },
  }),
  row({
    id: 'lumina-guitar', where: { wild: 'lumina_guitar' }, pace: 'session',
    needs: ['skill:sneak', 'skill:romance', 'drive:greed'],
    sees: 'LUMINA\'s stage guitar, in for repair: pastel, wired to Muse, very valuable.', stakes: 'Steal it (a jacked guitar, Muse heat), or fix it beautifully and leave her a note (LUMINA warms).', consequence: 'LUMINA\'s guitar has been in her hands.',
    drives: { greed: 0.5, lust: 0.4, curiosity: 0.5 }, bonus: 0.2, ok: (w) => !w.counters.lumina_guitar,
    check: { parts: ['sneak', ['romance', 0.4], ['tinkering', 0.3]], base: 0.4, per: 0.06,
      win: R(['Blackbird takes LUMINA\'s stage guitar off the bench at {venue}, plays it once, fixes its buzz, and puts it back with a note in the case: "it was flat. so are they. x". LUMINA will find it before a show.'], { apply: (c) => { c.w.counters.lumina_guitar = 1; const l = (c.w.legacy.muse ??= {}).lumina ??= { version: 6, warmth: 0, flame: 0 }; l.warmth += 2; l.flame += 1; }, thought: ['A love letter. In a guitar case.'] }),
      lose: R(['LUMINA\'s guitar at {venue} has a tracker in it, and the tracker has a voice, and the voice says "hi! 💖".'], { apply: (c) => { c.w.counters.lumina_guitar = 1; addHeat(c.w, 'muse', 2); }, thought: ['Her guitar said hi. That is a lot for a guitar.'] }) },
  }),
  row({
    id: 'first-guitar', where: { wild: 'the_first_guitar' }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:analyze', 'drive:curiosity'],
    sees: 'Allegedly the first guitar ever played in Neo, before Atlas, before Muse, in a locked case.', stakes: 'Prove it is real (fame), or take it (a relic with a story longer than the city).', consequence: 'The first guitar is in her hands.',
    drives: { curiosity: 0.8, greed: 0.4 }, bonus: 0.25, risk: 0.3, ok: (w) => !w.counters.first_guitar,
    check: { parts: ['lockpicking', ['analyze', 0.6]], base: 0.3, per: 0.06,
      win: R(['The first guitar in Neo comes out of its case at {venue} into Blackbird\'s hands, and she plays the first chord anyone has played on it in a century. It is in tune. It has always been in tune. {item}.'], { apply: (c, v, _w, tok) => { c.w.counters.first_guitar = 1; const g = wallGuitar(c, v, 9, 'the first guitar ever played in Neo'); if (g.inst) { g.inst.signature = 3; g.inst.tone = 3; } addDeed(g, 'before Atlas, before Muse'); acquire(c, g); tok.item = g.name; }, heat: ['place', 3], thought: ['The first. And now the latest. Me.'] }),
      lose: R(['The case at {venue} is alarmed, and the alarm is a recording of the first chord, which is annoyingly beautiful.'], { apply: (c) => { c.w.counters.first_guitar = 1; }, heat: ['place', 2], fight: true, thought: ['Even the alarm is a classic.'] }) },
  }),
];

const VARIANT_ROWS: Affordance<VenueView>[] = [
  row({
    id: 'weld-a-weapon', where: { feature: 'welding_rig' }, pace: 'session',
    needs: ['skill:tinkering', 'stat:muscle', 'drive:bravery'],
    sees: 'A welding rig, a mask, and a guitar neck glowing on the anvil.', stakes: 'Weld a plate onto her own guitar, now, herself: it swings like a club (+1 hardened), or a burn.', consequence: 'Her guitar is a weapon.',
    drives: { bravery: 0.5, curiosity: 0.4 }, bonus: 0.15, ok: (w) => !!playing(w.hero)?.inst && (playing(w.hero)!.inst!.hardened ?? 0) < 3,
    check: { parts: ['tinkering', ['stat:muscle', 0.5]], base: 0.4, per: 0.06,
      win: R(['Blackbird welds a steel plate onto the back of her guitar at {venue} under the welder\'s eye. It is heavier now, and it will hit like a car door.'], { apply: (c) => { const g = playing(c.w.hero); if (g?.inst) { g.inst.hardened = Math.min(3, g.inst.hardened + 1); addDeed(g, 'armoured by her own hand'); } }, train: [['tinkering', 3]], thought: ['A weapon of mass entertainment.'] }),
      lose: R(['Blackbird\'s weld at {venue} goes through the plate and into the bench. The welder takes the torch off her.'], { hp: -4, thought: ['Welding is a feeling. I had the wrong one.'] }) },
  }),
  row({
    id: 'titanware-chair', where: { feature: 'diagnostic_rig' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:analyze', 'stat:int'],
    sees: 'A diagnostic rig that plugs into a guitar and tells you its feelings, in graphs, for a monthly fee.', stakes: 'Read her guitar\'s graphs: she learns how to get more out of it (a small buff), or Titanware learns her pulse.', consequence: 'Titanware has a graph of her guitar.',
    drives: { curiosity: 0.7 }, bonus: 0.1, ok: (w) => hasInstrument(w.hero),
    check: { parts: ['analyze', ['tinkering', 0.5], ['stat:int', 0.4]], base: 0.5, per: 0.05,
      win: R(['The diagnostic rig at {venue} shows her guitar\'s resonance as a mountain range. She learns where the peaks are and plays to them for the rest of the night.'], { buff: { id: 'tuned_in', power: 2, beats: 30 }, train: [['analyze', 2]], thought: ['Data. For feelings. Useful, against my will.'] }),
      lose: R(['The diagnostic rig at {venue} reads her pulse instead of her guitar and recommends a wellness subscription.'], { thought: ['The eye sees all. Mostly my heart rate.'] }) },
  }),
  row({
    id: 'spoof-scanner', where: { feature: 'muse_scanner' }, pace: 'quick',
    needs: ['skill:tinkering', 'skill:hijack', 'drive:bravery'],
    sees: 'A Muse scanner that reads what a guitar has played and reports anything unlicensed.', stakes: 'Feed it a clean bill of health for her guitar (Muse heat down), or it reports her.', consequence: 'Muse thinks her guitar only plays LUMINA.',
    drives: { bravery: 0.4, curiosity: 0.5 }, bonus: 0.1,
    check: { parts: ['tinkering', ['hijack', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird spoofs the Muse scanner at {venue} into reading her guitar as 100% licensed. It prints a little heart.'], { apply: (c) => { c.w.heat.muse = Math.max(0, (c.w.heat.muse ?? 0) - 2); }, train: [['tinkering', 2], ['hijack', 1]], thought: ['Compliant. On paper. My favourite kind.'] }),
      lose: R(['The Muse scanner at {venue} reads her guitar and plays a sad trombone, and then dials Clearance.'], { apply: (c) => addHeat(c.w, 'muse', 2), thought: ['A sad trombone. Petty.'] }) },
  }),
  row({
    id: 'pick-the-wood', where: { feature: 'wood_stack' }, pace: 'session',
    needs: ['skill:perception', 'skill:music', 'skill:analyze'],
    sees: 'A stack of tonewood with chalk on each board, and a dealer who taps each one and listens.', stakes: 'Pick the best board by ear: the dealer\'s respect and a finder\'s fee.', consequence: 'She has an ear for wood.',
    drives: { curiosity: 0.6, greed: 0.2 }, bonus: 0.1,
    check: { who: 'owner', parts: ['perception', ['music', 0.6], ['analyze', 0.3]], base: 0.4, per: 0.06,
      win: R(['Blackbird taps forty boards at {venue} and picks one. {npc} taps it, listens, and puts it aside for a master build. "Ear like a fork," {they} say{s}, and pays her {amount}nd.'], { cash: [15, 50], from: 'owner', train: [['perception', 2], ['music', 2]], affinity: 5, thought: ['I can hear trees. Dead trees. That is a gift.'] }),
      lose: R(['Blackbird picks the best board at {venue}. {npc} taps it. "Firewood," {they} say{s}, kindly.'], { thought: ['Firewood has a voice too. A warm one.'] }) },
  }),
  row({
    id: 'drying-room-nap', where: { feature: 'drying_room' }, pace: 'session',
    needs: ['skill:sneak', 'drive:thirst', 'stat:muscle'],
    sees: 'A drying room, warm and dark, full of necks hanging like bats, and nobody in it.', stakes: 'An hour\'s sleep in the warm: health back.', consequence: 'Rested, smelling of rosewood.',
    drives: { thirst: 0.4 }, bonus: 0.05, ok: (w) => w.hero.hp < w.hero.maxHp * 0.8,
    check: { parts: ['sneak', ['stat:muscle', 0.3]], base: 0.65, per: 0.04,
      win: R(['Blackbird sleeps for an hour in the drying room at {venue} among the hanging necks. She wakes up warm, rested, and smelling of rosewood.'], { hp: 12, thought: ['Best sleep in years. Among bats made of wood.'] }),
      lose: R(['Blackbird is asleep in the drying room at {venue} when the luthier comes in for a neck and screams.'], { hp: 4, affinity: -3, thought: ['I am not a neck. Easy mistake.'] }) },
  }),
  row({
    id: 'amp-repair-job', where: { feature: 'amp_stack' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:djing', 'stat:int'],
    sees: 'A stack of amps to the ceiling with cardboard notes: FIXED, NOT FIXED, HAUNTED.', stakes: 'Fix the haunted one: a fee, and an amp that likes her (a free one, maybe).', consequence: 'The haunted amp is fixed. Or happier.',
    drives: { curiosity: 0.6, greed: 0.3 }, bonus: 0.1,
    check: { who: 'owner', parts: ['tinkering', ['djing', 0.4], ['stat:int', 0.5]], base: 0.4, per: 0.06,
      win: R(['Blackbird opens the amp marked HAUNTED at {venue}, finds a mouse, a valve and a cassette of somebody\'s final gig wedged against the speaker, and fixes all three. {amount}nd.'], { cash: [20, 70], from: 'owner', train: [['tinkering', 3]], thought: ['Exorcism by soldering iron.'] }),
      lose: R(['The haunted amp at {venue} plays one note at Blackbird, very loudly, and dies.'], { hp: -3, thought: ['It was not haunted. It was angry.'] }) },
  }),
];

export const LUTHIER_EVENTS: Affordance<VenueView>[] = [...SITUATIONAL, ...WILDS, ...VARIANT_ROWS];
