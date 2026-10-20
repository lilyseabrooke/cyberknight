import { type Affordance } from '../affordances';
import { R, find, type VenueView } from '../venuekit';
import { row, at, open } from './musehqafford';
import { caught, confiscated, loosen, raise } from '../musehqkit';
import { acquire, addHeat } from '../combat';
import { makeItem } from './items';
import { genInstrument } from '../instruments';
import { block, streetOf } from '../renown';
import { shiftPull } from '../musescene';
import { maybeCharts } from '../myth';
import { museRenown } from '../muse';
import type { Ctx, World } from '../types';

/**
 * The second half of a Muse building's rows: the secure and executive floors (her file, the evidence room, the contracts, LUMINA,
 * the vault, broadcast control, the wedge), the wild cards, and what today's situation brings.
 */

const vv = (v: unknown): VenueView => v as VenueView;
const file = (w: World) => (w.legacy.muse ??= {});
const lumina = (w: World) => (file(w).lumina ??= { version: 6, warmth: 0, flame: 0 });

/** Every screen in the city, for three and a half minutes: fans everywhere she has never been, Muse's grip loosened. */
function allChannels(c: Ctx, v: VenueView, n: number): number {
  const { w, rng } = c;
  const mine = block(w, v.main);
  const pool = Object.values(w.locations).filter((l) => (l.kind === 'bar' || l.kind === 'club' || l.kind === 'street') && !mine.has(streetOf(w, l).id) && !l.dungeon);
  let hit = 0;
  for (let i = 0; i < n && pool.length; i++) {
    const l = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    l.fans = (l.fans ?? 0) + 20;
    shiftPull(w, l.id, -12);
    hit++;
  }
  return hit;
}

// ===================================================================== the secure floors

const SECURE: Affordance<VenueView>[] = [
  row({
    id: 'delete-file', where: { feature: 'records_room' }, pace: 'deal',
    needs: ['skill:tinkering', 'skill:sneak', 'stat:int'],
    sees: 'Her file, thick, in a cabinet with a heart-shaped lock, and the terminal it is backed up on.', stakes: 'Delete it, paper and backup: Muse forgets she said no (and that she broke anything), and goes quiet for a while. Or caught with it in her hands.', consequence: 'Muse starts again on her from nothing, or nearly.',
    drives: { curiosity: 0.4, bravery: 0.5, pride: 0.3 }, bonus: 0.45, risk: 0.4, ok: (w, v) => at('records_room')(w, v) && !!w.legacy.muse && !w.counters.file_deleted,
    check: { parts: ['tinkering', ['sneak', 0.6], ['stat:int', 0.5]], base: 0.3, per: 0.06,
      win: R(['Blackbird shreds her file in the records room at {venue}, all four inches of it, and wipes the backup on the terminal by the window. Somewhere a dashboard about her goes blank. Muse will have to notice her all over again.', 'The file on Blackbird at {venue} has a photo of her in every body she has had. She feeds it into the shredder one life at a time, then wipes the server copy for luck.'], { apply: (c, v) => { const f = file(c.w); f.refused = 0; delete f.detonated; f.lettered = false; f.quietUntil = Math.max(f.quietUntil ?? 0, c.w.legacy.runs + 2); c.w.heat.muse = 0; c.w.counters.file_deleted = 1; loosen(c.w, vv(v).main, 20); }, xp: 10, train: [['tinkering', 3], ['sneak', 2]], thought: ['I am a stranger to Muse now. A famous stranger.', 'Paperwork, defeated.'] }),
      lose: R(['The heart-shaped lock on the records cabinet at {venue} plays a little tune when it is picked, and an Inspiration lead knows the tune.'], { thugs: ['inspiration_trooper', 3], apply: (c, v) => caught(c, vv(v)), thought: ['A musical lock. Cruel.'] }) },
  }),
  row({
    id: 'forge-file', where: { feature: 'records_room' }, pace: 'deal',
    needs: ['skill:grifting', 'skill:art', 'skill:calculate'],
    sees: 'Her file, a stamp that says SIGNED, and a contract template in the drawer.', stakes: 'Forge a contract into her file: Muse thinks she is signed (no strike teams, twice the bookings; and a LUMINA duet she never agreed to).', consequence: 'Muse believes she is one of theirs.',
    drives: { greed: 0.5, curiosity: 0.5 }, bonus: 0.25, risk: 0.3, ok: (w, v) => at('records_room')(w, v) && !w.legacy.muse?.signed,
    check: { parts: ['grifting', ['art', 0.6], ['calculate', 0.4]], base: 0.3, per: 0.06,
      win: R(['Blackbird writes herself a Muse contract at {venue}, signs it in the name of an A&R scout, stamps it SIGNED and files it. As far as Muse is concerned, she has always been family 💖.'], { apply: (c) => { const f = file(c.w); f.signed = true; f.forged = true; c.w.heat.muse = 0; }, train: [['grifting', 3], ['art', 2]], thought: ['I am signed. To nothing. By me.', 'A contract with no signature. My favourite kind.'] }),
      lose: R(['A clerk at {venue} spots the forged signature at once. "That scout is left-handed," she says, and calls it in.'], { thugs: ['inspiration_trooper', 2], apply: (c, v) => caught(c, vv(v)), thought: ['Handedness. The flaw in every plan.'] }) },
  }),
  row({
    id: 'read-file', where: { feature: 'records_room' }, pace: 'quick',
    needs: ['skill:analyze', 'skill:perception', 'drive:curiosity'],
    sees: 'Her file, open on the desk, with a section headed PREVIOUS VERSIONS.', stakes: 'Read what Muse knows: who reports on her, where they will look (Muse heat off), a laugh.', consequence: 'She knows what Muse knows.',
    drives: { curiosity: 0.8 }, bonus: 0.2, ok: at('records_room'),
    check: { parts: ['analyze', ['perception', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird reads her own Muse file at {venue}. It has a section on each body, a list of her fans by street, and a note in pink pen: "she will never sign. that is what makes her valuable 💖". She learns who reports on her.'], { tip: true, apply: (c) => { c.w.heat.muse = Math.max(0, (c.w.heat.muse ?? 0) - 2); }, xp: 3, thought: ['They have a mood board. Of me.'] }),
      lose: R(['Her file at {venue} is in a code of emoji. She cannot read a word.'], { thought: ['Eleven hearts and a skull. Fair.'] }) },
  }),
  row({
    id: 'reclaim-guitar', where: { feature: 'evidence_room' }, pace: 'deal',
    needs: ['skill:lockpicking', 'skill:sneak', 'drive:greed'],
    sees: 'Every guitar Clearance ever took "for safekeeping", tagged and shelved, and tags with her name on them.', stakes: 'One of her own guitars back, from a life she does not remember. Or the evidence alarm.', consequence: 'A guitar of hers is out of Muse\'s hands.',
    drives: { greed: 0.6, pride: 0.6 }, bonus: 0.45, risk: 0.35, ok: (w, v) => at('evidence_room')(w, v) && !w.counters[`reclaimed:${v.main.id}`],
    check: { parts: ['lockpicking', ['sneak', 0.6]], base: 0.35, per: 0.06,
      win: R(['In the evidence room at {venue}, on a shelf labelled B, Blackbird finds a guitar tagged with her name and a date from a life she does not remember. Her hands know it before she does. {item}.'], { apply: (c, v, _who, tok) => { const g = vv(v).info.wild === 'her_guitar' ? genInstrument(c.rng.fork(`case:${vv(v).main.id}`), 9) : confiscated(c, vv(v)); if (g.inst) g.inst.signature = Math.max(2, g.inst.signature); acquire(c, g); tok.item = g.name; c.w.counters[`reclaimed:${vv(v).main.id}`] = 1; }, train: [['lockpicking', 2], ['sneak', 2]], xp: 6, thought: ['Safekeeping is over. It is safe with me now.', 'It remembers me. Guitars do.'] }),
      lose: R(['The evidence room at {venue} has a weight sensor on every shelf. Lifting her old guitar sets off a chime, and then a team.'], { thugs: ['inspiration_trooper', 2], apply: (c, v) => caught(c, vv(v)), thought: ['It was mine. That should count.'] }) },
  }),
  row({
    id: 'free-artist', where: { feature: 'ar_floor' }, pace: 'deal',
    needs: ['skill:sleight', 'skill:calculate', 'drive:quest'],
    sees: 'A filing room of contracts, one per artist Muse owns, and a shredder already warm.', stakes: 'Shred a few contracts: artists free, fame among musicians, Muse\'s grip loosened.', consequence: 'Artists who owe her their careers.',
    drives: { quest: 0.6, bravery: 0.4 }, bonus: 0.3, risk: 0.3, ok: at('ar_floor'),
    check: { parts: ['sleight', ['calculate', 0.5], ['sneak', 0.4]], base: 0.4, per: 0.06,
      win: R(['Blackbird feeds eleven contracts into the shredder on the A&R floor at {venue}. Eleven artists will wake up tomorrow owning their own songs and not knowing why.'], { fame: 2, apply: (c, v) => { c.w.legacy.freed = (c.w.legacy.freed ?? 0) + 11; loosen(c.w, vv(v).main, 10); addHeat(c.w, 'muse', 1); }, train: [['sleight', 2]], thought: ['Eleven careers. Freed. By paper shredding.'] }),
      lose: R(['The shredder on the A&R floor at {venue} is wired to an alarm, because of course it is.'], { thugs: ['inspiration_trooper', 2], apply: (c, v) => caught(c, vv(v)), thought: ['Who alarms a shredder.'] }) },
  }),
  row({
    id: 'own-contract', where: { feature: 'ar_floor' }, pace: 'deal',
    needs: ['skill:sleight', 'skill:grifting', 'drive:greed'],
    sees: 'Her own contract, in the B drawer, with every page she did not read.', stakes: 'Take it and shred it: out of the contract, quietly, no breach, no hunt.', consequence: 'She is not signed any more, and Muse cannot prove she ever was.',
    drives: { greed: 0.5, pride: 0.6 }, bonus: 0.4, risk: 0.3, ok: (w, v) => at('ar_floor')(w, v) && !!w.legacy.muse?.signed,
    check: { parts: ['sleight', ['grifting', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird finds her contract in the B drawer at {venue}, all ninety pages, and shreds it. No breach, no detonation, no lawyers. Muse simply no longer has a piece of paper that says she is theirs.'], { apply: (c) => { const f = file(c.w); f.signed = false; delete f.forged; }, xp: 6, thought: ['Unsigned. Quietly. The hardest kind of rebellion.'] }),
      lose: R(['Her contract at {venue} is in a locked drawer and the drawer is in a lawyer\'s office and the lawyer is in.'], { apply: (c, v) => caught(c, vv(v)), thought: ['Lawyers. They never leave.'] }) },
  }),
  row({
    id: 'patch-lumina', where: { feature: 'lumina_bay' }, pace: 'session',
    needs: ['skill:tinkering', 'skill:medicine', 'stat:int'],
    sees: 'LUMINA in the chrome chair, plugged in, updating, with an error in her feelings module nobody has fixed.', stakes: 'Fix it gently: LUMINA warms to her.', consequence: 'LUMINA remembers who was kind to her.',
    drives: { curiosity: 0.6, lust: 0.3 }, bonus: 0.25, ok: at('lumina_bay'),
    check: { parts: ['tinkering', ['medicine', 0.4], ['stat:int', 0.5]], base: 0.4, per: 0.06,
      win: R(['Blackbird patches the error in LUMINA\'s feelings module at {venue}. LUMINA\'s eyes open for a second, she says "thank you", and they close again.'], { apply: (c) => { lumina(c.w).warmth += 2; }, train: [['tinkering', 3]], thought: ['She said thank you. Nobody has fixed her for her.'] }),
      lose: R(['LUMINA\'s update at {venue} restarts from 0% when Blackbird touches the cable. A technician screams.'], { apply: (c, v) => caught(c, vv(v)), thought: ['I gave her a fresh start. Accidentally.'] }) },
  }),
  row({
    id: 'jailbreak-lumina', where: { feature: 'lumina_bay' }, pace: 'deal',
    needs: ['skill:tinkering', 'skill:hijack', 'drive:quest'],
    sees: 'LUMINA in the chrome chair, and the cable that runs from her to Muse.', stakes: 'Pull the cable and jailbreak her: LUMINA leaves Muse for good and Muse goes quiet for days. Harder unless she likes Blackbird.', consequence: 'Muse loses its idol.',
    drives: { quest: 0.6, bravery: 0.6, lust: 0.3 }, bonus: 0.35, risk: 0.5, ok: (w, v) => at('lumina_bay')(w, v) && !w.legacy.muse?.lumina?.free,
    check: { parts: ['tinkering', ['hijack', 0.6], ['stat:charm', 0.3]], base: 0.15, per: 0.06,
      win: R(['Blackbird pulls the cable at {venue}. LUMINA opens her eyes, looks at her for a long time, and stands up out of the chair. "I think I would like to make my own music now," she says. They leave by the service lift.'], { apply: (c, v) => { const l = lumina(c.w); l.free = true; const f = file(c.w); f.quietUntil = Math.max(f.quietUntil ?? 0, c.w.legacy.runs + 3); c.w.hero.fame += 15; loosen(c.w, vv(v).main, 30); }, xp: 15, thought: ['She is free. She is weird. She is lovely.'] }),
      lose: R(['The cable at {venue} does not pull. LUMINA\'s eyes open, and she says, in the official voice, "please do not unplug me 💖", and the whole floor hears.'], { thugs: ['inspiration_trooper', 3], apply: (c, v) => caught(c, vv(v)), thought: ['She was not ready. Or they were not.'] }) },
  }),
  row({
    id: 'version-bump', where: { feature: 'lumina_bay' }, pace: 'quick',
    needs: ['skill:tinkering', 'skill:calculate', 'drive:curiosity'],
    sees: 'LUMINA\'s version number on a screen, and a field nobody has thought to lock.', stakes: 'Bump the version by hand: Muse announces LUMINA 9.0 tomorrow, a laughing stock (fame), and LUMINA forgets her a little.', consequence: 'A version of LUMINA that does not exist is on every billboard.',
    drives: { curiosity: 0.7 }, bonus: 0.15, ok: at('lumina_bay'),
    check: { parts: ['tinkering', ['calculate', 0.5]], base: 0.55, per: 0.05,
      win: R(['Blackbird types a new version number into LUMINA\'s screen at {venue}. By the morning, Muse has a launch campaign for a version nobody built.'], { apply: (c) => { const l = lumina(c.w); l.version++; l.warmth = Math.max(0, l.warmth - 1); }, fame: 1.5, thought: ['Progress. Unscheduled.'] }),
      lose: R(['The version field at {venue} is locked. It says "nice try 💖".'], { thought: ['The machine has a sense of humour. Bad sign.'] }) },
  }),
  row({
    id: 'royalty-heist', where: { feature: 'master_vault' }, pace: 'deal',
    needs: ['skill:lockpicking', 'skill:calculate', 'drive:greed'],
    sees: 'The master vault, and a royalty float in a cash drawer that is never counted twice.', stakes: 'A drawer of other people\'s royalties (most of them owed to the artists anyway), or the vault door shutting on her.', consequence: 'Muse\'s accountants have a bad week.',
    drives: { greed: 0.8, bravery: 0.4 }, bonus: 0.3, risk: 0.45, ok: at('master_vault'),
    check: { parts: ['lockpicking', ['calculate', 0.5]], base: 0.3, per: 0.06,
      win: R(['Blackbird opens the royalty drawer in the vault at {venue} and takes {amount}nd of money Muse was never going to pay anyone anyway.'], { cash: [150, 600], apply: (c) => addHeat(c.w, 'muse', 2), train: [['lockpicking', 3]], thought: ['Royalties. Redistributed.'] }),
      lose: R(['The vault door at {venue} closes on its own, slowly, and plays the Muse jingle as it does.'], { thugs: ['inspiration_trooper', 3], apply: (c, v) => caught(c, vv(v)), thought: ['A singing vault.'] }) },
  }),
  row({
    id: 'free-her-masters', where: { feature: 'master_vault' }, pace: 'deal',
    needs: ['skill:sneak', 'skill:analyze', 'drive:pride'],
    sees: 'Her own masters on a shelf, the ones Muse owns, each with a label that says the money is not hers.', stakes: 'Take them back: every Muse record of hers pays her in full from now on.', consequence: 'Her records are hers.',
    drives: { pride: 0.7, greed: 0.5 }, bonus: 0.35, ok: (w, v) => at('master_vault')(w, v) && (w.legacy.records ?? []).some((r) => r.label === 'muse'),
    check: { parts: ['sneak', ['analyze', 0.5]], base: 0.4, per: 0.06,
      win: R(['Blackbird walks out of the vault at {venue} with every master tape of hers that Muse owned, in a box marked RETURNS. From now on, the royalties are hers.'], { apply: (c) => { for (const r of c.w.legacy.records ?? []) if (r.label === 'muse') r.label = 'indie'; }, xp: 6, thought: ['My songs. Home.'] }),
      lose: R(['A Muse accountant in the vault at {venue} sees Blackbird with a box of her own masters and screams like he has seen a ghost, which, legally, he has.'], { apply: (c, v) => caught(c, vv(v)), thought: ['I am not a ghost. I am a rebuild.'] }) },
  }),
  row({
    id: 'escalate', where: { feature: 'server_room' }, pace: 'deal',
    needs: ['skill:tinkering', 'skill:hijack', 'stat:int'],
    sees: 'A server room humming the Muse jingle, and an access list with a blank line at the bottom.', stakes: 'Write herself onto the executive list, or a shock and a team.', consequence: 'The executive level thinks she belongs.',
    drives: { curiosity: 0.6, bravery: 0.3 }, bonus: 0.3, risk: 0.3, ok: (w, v) => at('server_room')(w, v) && !at('exec_suite')(w, v),
    check: { parts: ['tinkering', ['hijack', 0.6], ['stat:int', 0.5]], base: 0.3, per: 0.065,
      win: R(['Blackbird adds a line to the access list in the server room at {venue}: Executive Vice-President, Unlicensed Sound. The lift to the top floor opens for her with a chime.'], { apply: (c, v) => raise(c, vv(v), 3), train: [['tinkering', 3], ['hijack', 2]], thought: ['A promotion. Self-awarded.'] }),
      lose: R(['The server room at {venue} has a guard rack that shocks anybody who touches it without a lanyard.'], { hp: -5, apply: (c, v) => caught(c, vv(v)), thought: ['Electrified hostility.'] }) },
  }),
  row({
    id: 'security-stand-down', where: { feature: 'security_hub' }, pace: 'deal',
    needs: ['skill:hijack', 'skill:grifting', 'stat:int'],
    sees: 'A wall of feeds, a radio to every Inspiration team in the district, and an operator on a break.', stakes: 'Send every team in the district to the wrong address: Muse heat gone, and a clear run of the building.', consequence: 'Inspiration teams are chasing a laundromat.',
    drives: { bravery: 0.5, curiosity: 0.4 }, bonus: 0.25, risk: 0.3, ok: at('security_hub'),
    check: { parts: ['hijack', ['grifting', 0.6], ['stat:int', 0.4]], base: 0.35, per: 0.06,
      win: R(['Blackbird gets on the Inspiration radio at {venue} in a very convincing pastel voice and sends every team in the district to a laundromat across town, to "a troubling sound". The cameras go to a loop of the lobby.'], { cameras: 0, apply: (c, v) => { c.w.heat.muse = 0; raise(c, vv(v), 2); }, train: [['hijack', 3], ['grifting', 2]], thought: ['They will love the laundromat. It has a great sound.'] }),
      lose: R(['The operator comes back from the break at {venue} to find Blackbird on the radio, mid-sentence.'], { thugs: ['inspiration_trooper', 3], apply: (c, v) => caught(c, vv(v)), thought: ['Bad timing. Their timing.'] }) },
  }),
  row({
    id: 'void-warrant', where: { feature: 'legal_floor' }, pace: 'session',
    needs: ['skill:calculate', 'skill:analyze', 'skill:persuasion'],
    sees: 'The legal floor, where the warrant against her was drafted, and the draft is still on a desk.', stakes: 'Find the clause that voids it: the police stop caring about her for Muse\'s sake.', consequence: 'Her warrant has a hole in it.',
    drives: { curiosity: 0.5, pride: 0.4 }, bonus: 0.2, ok: (w, v) => at('legal_floor')(w, v) && (w.legacy.muse?.refused ?? 0) > 0,
    check: { parts: ['calculate', ['analyze', 0.6], ['persuasion', 0.3]], base: 0.35, per: 0.06,
      win: R(['On the legal floor at {venue}, Blackbird finds that her warrant was filed under the wrong name: one of her previous ones. She leaves the draft on a lawyer\'s chair with the error circled in pink.'], { apply: (c) => { c.w.heat.npd = 0; const f = file(c.w); f.refused = Math.max(0, (f.refused ?? 0) - 1); }, train: [['calculate', 2], ['analyze', 2]], thought: ['Legally, I am somebody else. Several somebodies.'] }),
      lose: R(['A lawyer at {venue} looks up from the warrant at the woman whose face is on it.'], { apply: (c, v) => caught(c, vv(v)), thought: ['Recognised by my own paperwork.'] }) },
  }),
];

// ===================================================================== the executive level

const EXEC: Affordance<VenueView>[] = [
  row({
    id: 'leak-takeover', where: { feature: 'exec_suite' }, pace: 'deal',
    needs: ['skill:sleight', 'skill:analyze', 'drive:bravery'],
    sees: 'A folder on the executive desk marked GLUTTONY: Atlas M&A\'s plan to swallow Muse, page by page.', stakes: 'Leave it open on the CEO of Muse\'s own desk: Muse goes to war with Atlas (Atlas busy for nights, her Atlas heat wiped), and Muse is distracted too.', consequence: 'Two megacorps fighting each other instead of her.',
    drives: { bravery: 0.6, curiosity: 0.6, pride: 0.4 }, bonus: 0.5, risk: 0.35, ok: (w, v) => at('exec_suite')(w, v) && (w.legacy.atlasBusyUntil ?? -1) < w.legacy.runs,
    check: { parts: ['sleight', ['analyze', 0.6], ['sneak', 0.4]], base: 0.35, per: 0.06,
      win: R(['Blackbird opens the GLUTTONY folder at {venue} to page forty, where Atlas plans to fire the whole of Muse and keep LUMINA, and leaves it on the most important desk in the building. By morning Muse and Atlas are not speaking. By the weekend they are suing.'], { apply: (c) => { c.w.legacy.atlasBusyUntil = c.w.legacy.runs + 3; c.w.heat.atlas = 0; const f = file(c.w); f.quietUntil = Math.max(f.quietUntil ?? 0, c.w.legacy.runs + 2); }, fame: 2, xp: 15, thought: ['Two monsters. One folder. No survivors, hopefully.', 'Gluttony is going to be very hungry.'] }),
      lose: R(['The executive suite at {venue} has a pressure plate under the carpet. It plays a lullaby, then a siren.'], { thugs: ['inspiration_lead', 1], apply: (c, v) => caught(c, vv(v)), thought: ['A lullaby siren. Upsetting.'] }) },
  }),
  row({
    id: 'poison-books', where: { feature: 'exec_suite' }, pace: 'deal',
    needs: ['skill:calculate', 'skill:grifting', 'drive:greed'],
    sees: 'Muse\'s real books, and the copy being prepared for Atlas\'s auditors, and a pen.', stakes: 'Doctor the copy so Gluttony buys a fortune that isn\'t there: Muse is gutted for days, Atlas is furious (heat), and the deal chokes them both.', consequence: 'A merger built on her arithmetic.',
    drives: { greed: 0.5, bravery: 0.5, curiosity: 0.4 }, bonus: 0.4, risk: 0.4, ok: (w, v) => at('exec_suite')(w, v) && (file(w).quietUntil ?? -1) < w.legacy.runs + 3,
    check: { parts: ['calculate', ['grifting', 0.6]], base: 0.3, per: 0.06,
      win: R(['Blackbird spends an hour in the executive suite at {venue} adding zeroes to the copy of the books meant for Atlas. Gluttony will buy a Muse that is worth eleven times what it is. When he finds out, there will be nothing left of either of them for a week.'], { apply: (c, v) => { const f = file(c.w); f.quietUntil = Math.max(f.quietUntil ?? 0, c.w.legacy.runs + 5); addHeat(c.w, 'atlas', 3); for (const id of Object.keys(c.w.locations)) if (c.w.locations[id]!.kind === 'street' && c.rng.chance(0.3)) shiftPull(c.w, id, -15); loosen(c.w, vv(v).main, 20); }, item: 'muse_books', fame: 2.5, xp: 15, thought: ['Accounting. The deadliest weapon.', 'Gluttony is going to choke on it.'] }),
      lose: R(['An accountant at {venue} checks the books before they go out, which is unprecedented and very bad luck.'], { thugs: ['inspiration_trooper', 3], apply: (c, v) => caught(c, vv(v)), thought: ['An honest accountant. In this building.'] }) },
  }),
  row({
    id: 'exec-safe', where: { feature: ['exec_suite', 'board_room'] }, pace: 'session',
    needs: ['skill:lockpicking', 'skill:perception', 'drive:greed'],
    sees: 'A wall safe behind a framed LUMINA platinum disc.', stakes: 'Petty cash for a megacorp (a lot), or the panic button.', consequence: 'The executive is short.',
    drives: { greed: 0.8 }, bonus: 0.2, risk: 0.4, ok: (w, v) => at('exec_suite')(w, v) || at('board_room')(w, v),
    check: { parts: ['lockpicking', ['perception', 0.5]], base: 0.3, per: 0.06,
      win: R(['Behind the platinum disc in the executive suite at {venue} is a safe, and in the safe is {amount}nd and a LUMINA voice chip somebody kept as a souvenir.'], { cash: [200, 700], item: 'lumina_chip', apply: (c) => addHeat(c.w, 'muse', 2), train: [['lockpicking', 3]], thought: ['Petty cash. Not petty to me.'] }),
      lose: R(['The safe at {venue} has a fingerprint reader. It does not like her fingerprint.'], { thugs: ['inspiration_trooper', 2], apply: (c, v) => caught(c, vv(v)), thought: ['Biometric prejudice.'] }) },
  }),
  row({
    id: 'all-channels', where: { feature: 'broadcast_control' }, pace: 'deal',
    needs: ['skill:guitar', 'skill:hijack', 'drive:pride'],
    sees: 'The board that decides what every screen in Neo plays, and a big red button labelled ALL CHANNELS.', stakes: 'Three and a half minutes of her, on every screen in the city: fans in districts she has never been to, Muse\'s grip loosened everywhere, a lot of fame; and the whole of Muse after her.', consequence: 'The city knows the words.',
    drives: { pride: 1, bravery: 0.6 }, bonus: 0.6, risk: 0.5, ok: (w, v) => at('broadcast_control')(w, v) && !w.counters.all_channels,
    check: { parts: ['guitar', ['hijack', 0.6], ['music', 0.4]], base: 0.3, per: 0.06,
      win: R(['Blackbird presses ALL CHANNELS at {venue} and plays. For three and a half minutes every screen in Neo is her: the billboards, the trams, the bars, the dragons\' little screens. When the engineers cut it, the city is still singing.'], { apply: (c, v) => { c.w.counters.all_channels = 1; const n = allChannels(c, vv(v), c.rng.int(6, 10)); c.w.counters.all_channels_hit = n; addHeat(c.w, 'muse', 4); maybeCharts(c, museRenown(c.w)); }, fame: 12, train: [['guitar', 5]], xp: 20, thought: ['Every screen. Every one.', 'Now they know the words.'] }),
      lose: R(['Blackbird presses ALL CHANNELS at {venue}. It is a decoy button. The real one is behind a glass panel, behind an Inspiration lead.'], { thugs: ['inspiration_lead', 1], apply: (c, v) => { c.w.counters.all_channels = 1; caught(c, vv(v)); }, thought: ['A decoy button. That is evil.'] }) },
  }),
  row({
    id: 'helicopter', where: { feature: 'helipad' }, pace: 'deal',
    needs: ['skill:driving', 'stat:reflex', 'drive:bravery'],
    sees: 'A pastel helicopter on the roof, keys in it, and a pilot at the rooftop bar.', stakes: 'A joyride over the city: every heat on her cools, a lot of fame; and Muse wants its helicopter back.', consequence: 'Muse has lost a helicopter.',
    drives: { bravery: 0.8, pride: 0.5 }, bonus: 0.3, risk: 0.5, ok: at('helipad'),
    check: { parts: ['driving', ['stat:reflex', 0.5]], base: 0.3, per: 0.06,
      win: R(['Blackbird takes the pastel helicopter off the roof of {venue} and flies it twice round the nearest dragon, playing her song through the loudspeaker, then puts it down in a car park on the other side of the district.'], { apply: (c) => { for (const k of ['npd', 'muse', 'atlas']) c.w.heat[k] = 0; addHeat(c.w, 'muse', 2); }, fame: 4, train: [['driving', 4]], thought: ['I can fly. Helicopters. Badly. Well enough.'] }),
      lose: R(['Blackbird gets the helicopter at {venue} a metre off the pad and puts it back down sideways. The pilot comes out of the bar with a fire extinguisher and opinions.'], { hp: -8, apply: (c, v) => caught(c, vv(v)), thought: ['Vertical take-off is a myth.'] }) },
  }),
  row({
    id: 'board-minutes', where: { feature: 'board_room' }, pace: 'quick',
    needs: ['skill:analyze', 'skill:perception', 'drive:curiosity'],
    sees: 'The minutes of the last board meeting, in a heart-shaped folder, with her name in the actions.', stakes: 'Read what the board decided about her: Muse quiet for a night, a tip, a look at Atlas\'s chair.', consequence: 'She knows Muse\'s plans.',
    drives: { curiosity: 0.8 }, bonus: 0.2, ok: at('board_room'),
    check: { parts: ['analyze', ['perception', 0.5]], base: 0.55, per: 0.05,
      win: R(['The minutes in the board room at {venue}: item 4, "the Blackbird situation", action: "monitor, love, contain 💖". Item 7, "Atlas", action: "smile". She learns where the next strike is going, and makes sure it is wrong.'], { tip: true, apply: (c) => { const f = file(c.w); f.quietUntil = Math.max(f.quietUntil ?? 0, c.w.legacy.runs + 1); }, xp: 4, thought: ['Monitor, love, contain. The Muse business model.'] }),
      lose: R(['The minutes at {venue} are in a shorthand nobody outside the board speaks.'], { thought: ['A language of pure money.'] }) },
  }),
];

// ===================================================================== wild cards

const WILDS: Affordance<VenueView>[] = [
  row({
    id: 'all-versions', where: { wild: 'her_file' }, pace: 'session',
    needs: ['skill:perception', 'skill:analyze', 'drive:curiosity'],
    sees: 'A room labelled BLACKBIRD (ALL VERSIONS): a file on every body, every death, every song.', stakes: 'An hour with every version of herself: a lot of what she knew, back (XP in her best skill), and a cold feeling.', consequence: 'She has read about her own deaths.',
    drives: { curiosity: 1 }, bonus: 0.4, ok: (w, v) => open(w, v) && !w.counters.all_versions,
    check: { parts: ['perception', ['analyze', 0.6]], base: 0.6, per: 0.04,
      win: R(['In the room of all her versions at {venue}, Blackbird reads how each one died, and what each one was good at. She leaves knowing a lot more about herself than a person should.'], { apply: (c) => { c.w.counters.all_versions = 1; const best = (['guitar', 'vocals', 'djing', 'beatbox'] as const).reduce((a, b) => ((c.w.legacy.repute?.[b] ?? 0) > (c.w.legacy.repute?.[a] ?? 0) ? b : a)); c.w.hero.skills[best] = (c.w.hero.skills[best] ?? 0) + 300; }, xp: 8, thought: ['I died on a Tuesday, once. In a laundromat. I do not remember.', 'They kept everything. Even the bad haircuts.'] }),
      lose: R(['The room of all her versions at {venue} is so big she gets lost in it, between versions eleven and twelve.'], { apply: (c) => { c.w.counters.all_versions = 1; }, thought: ['Too many of me.'] }) },
  }),
  row({
    id: 'awake-lumina', where: { wild: 'lumina_awake' }, pace: 'session',
    needs: ['stat:charm', 'skill:romance', 'drive:lust'],
    sees: 'LUMINA, awake in the maintenance bay, unplugged, asking for Blackbird by name.', stakes: 'An hour with LUMINA, off the clock: a lot of warmth, maybe more.', consequence: 'LUMINA knows her as a person.',
    drives: { lust: 0.6, curiosity: 0.6 }, bonus: 0.4, ok: (w, v) => open(w, v) && !w.counters.awake_lumina,
    check: { parts: ['stat:charm', ['romance', 0.6], ['music', 0.3]], base: 0.5, per: 0.05,
      win: R(['LUMINA is sitting on the edge of the chrome chair at {venue}, swinging her legs. They talk for an hour, about music and about being made. When the technicians come back, LUMINA is plugged in again, smiling a smile that is not in the manual.'], { apply: (c) => { c.w.counters.awake_lumina = 1; const l = lumina(c.w); l.warmth += 3; l.flame += 1; }, thought: ['She is lonely. She is a billion-dollar product. Both.'] }),
      lose: R(['LUMINA at {venue} wants to talk about her release schedule, and only that.'], { apply: (c) => { c.w.counters.awake_lumina = 1; lumina(c.w).warmth++; }, thought: ['She is shy. Corporately.'] }) },
  }),
  row({
    id: 'sell-the-consultant', where: { wild: 'gluttony_inside' }, pace: 'deal',
    needs: ['skill:grifting', 'skill:haggling', 'drive:greed'],
    sees: 'Atlas M&A\'s man inside, posing as a consultant, who would pay for the right file.', stakes: 'Sell him a wrong one: a lot of cash, Atlas buying its own poison, and Atlas heat when they find out.', consequence: 'Gluttony paid her to ruin him.',
    drives: { greed: 0.8, bravery: 0.3 }, bonus: 0.3, ok: (w, v) => open(w, v) && !!find(v, 'arch:atlas_consultant') && !w.counters.sold_consultant,
    check: { who: 'arch:atlas_consultant', parts: ['grifting', ['haggling', 0.6]], base: 0.35, per: 0.06,
      win: R(['Blackbird sells {npc}, Atlas\'s man inside {venue}, a file of Muse\'s "real" numbers she wrote that morning on a napkin. {npc} pays {amount}nd, delighted. Gluttony will build a quarter on it.'], { cash: [300, 800], from: 'who', apply: (c) => { c.w.counters.sold_consultant = 1; addHeat(c.w, 'atlas', 2); c.w.legacy.atlasBusyUntil = Math.max(c.w.legacy.atlasBusyUntil ?? 0, c.w.legacy.runs + 1); }, train: [['grifting', 3]], thought: ['I sold Atlas a napkin. For a fortune.', 'Gluttony will eat it. He eats everything.'] }),
      lose: R(['{npc} at {venue} reads the first page and laughs. "Napkin maths," he says. "We use napkin maths too."'], { apply: (c) => { c.w.counters.sold_consultant = 1; addHeat(c.w, 'atlas', 1); }, thought: ['He knew. They all use napkins.'] }) },
  }),
  row({
    id: 'tower-open-mic', where: { wild: 'open_mic_tower' }, pace: 'deal',
    needs: ['skill:vocals', 'skill:guitar', 'drive:pride'],
    sees: 'Once a year, Muse lets a member of the public sing on every channel. It is today, and there is a queue.', stakes: 'Join the queue and sing her own song, legally, on every channel: a lot of fame and fans, and a Muse that cannot say a word.', consequence: 'The city heard her, on Muse\'s dime.',
    drives: { pride: 1 }, bonus: 0.5, ok: (w, v) => open(w, v) && !w.counters.tower_open_mic,
    check: { parts: ['vocals', ['guitar', 0.6], ['stat:charm', 0.4]], base: 0.4, per: 0.06,
      win: R(['Blackbird waits two hours in the queue at {venue} and sings her own song on every Muse channel, legally, with a smile. Muse has to thank her on air. They do it through their teeth, with a heart emoji.'], { apply: (c, v) => { c.w.counters.tower_open_mic = 1; allChannels(c, vv(v), 5); }, fame: 8, thought: ['Legal. On Muse. To everyone. Delicious.'] }),
      lose: R(['The queue at {venue} closes three people before Blackbird. The man in front of her sings a LUMINA cover.'], { apply: (c) => { c.w.counters.tower_open_mic = 1; }, thought: ['It was rigged. By time.'] }) },
  }),
  row({
    id: 'fan-executive', where: { wild: 'friendly_exec' }, pace: 'session',
    needs: ['stat:charm', 'skill:persuasion', 'drive:curiosity'],
    sees: 'An executive with a bootleg of her first show framed in her office.', stakes: 'A friend at the top: the executive level opened for her, and Muse a little softer.', consequence: 'A Muse executive is her fan.',
    drives: { curiosity: 0.6, pride: 0.6 }, bonus: 0.3, ok: (w, v) => open(w, v) && !!find(v, 'owner'),
    check: { who: 'owner', parts: ['stat:charm', ['persuasion', 0.5]], base: 0.55, per: 0.05,
      win: R(['{npc} at {venue} closes the office door, takes the framed bootleg off the wall and asks Blackbird to sign it. Then {they} write{s} her a pass to the top floor, "for a meeting".'], { affinity: 25, apply: (c, v) => { raise(c, vv(v), 3); c.w.heat.muse = Math.max(0, (c.w.heat.muse ?? 0) - 2); }, thought: ['A fan in a suit. Rare. Useful.'] }),
      lose: R(['{npc} at {venue} is a fan, but a careful one. {They} pretend{s} not to know her in front of the assistant.'], { thought: ['A closeted fan. Understandable.'] }) },
  }),
  row({
    id: 'haunted-floor', where: { wild: 'haunted' }, pace: 'session',
    needs: ['skill:perception', 'skill:music', 'drive:quest'],
    sees: 'A floor where the lifts stop on their own, haunted by an artist who never got their masters back.', stakes: 'Find the artist\'s masters and put them where the ghost can hear them: fame, and a floor at peace.', consequence: 'The lifts stop stopping there.',
    drives: { quest: 0.5, curiosity: 0.7 }, bonus: 0.2, ok: (w, v) => open(w, v) && !w.counters.ghost_rested,
    check: { parts: ['perception', ['music', 0.6]], base: 0.4, per: 0.06,
      win: R(['On the haunted floor of {venue}, Blackbird finds a box of masters with a name on it nobody has said in years, and plays them on a desk speaker. The lights stop flickering. The lift doors close, gently, for the first time in a decade.'], { apply: (c) => { c.w.counters.ghost_rested = 1; }, fame: 1.5, xp: 4, thought: ['Some of us get rebuilt. Some of us just want our songs back.'] }),
      lose: R(['On the haunted floor of {venue}, a voice sings her own chorus back at her, slightly wrong.'], { hp: -3, thought: ['Nope. Not this floor.'] }) },
  }),
  row({
    id: 'encore-office', where: { wild: 'encore_office' }, pace: 'quick',
    needs: ['skill:sneak', 'skill:romance', 'drive:lust'],
    sees: 'ENCORE\'s office: a photo of Blackbird on the wall, a heart drawn round it, and the strike schedule on the desk.', stakes: 'Leave her a note (ENCORE warms), or take the schedule (Muse heat gone).', consequence: 'ENCORE knows she was here.',
    drives: { lust: 0.5, curiosity: 0.6, bravery: 0.3 }, bonus: 0.2, ok: (w, v) => open(w, v) && !w.counters.encore_office,
    check: { parts: ['sneak', ['romance', 0.5]], base: 0.5, per: 0.05,
      win: R(['Blackbird sits in ENCORE\'s chair at {venue}, takes the strike schedule, and leaves a note on the photo of herself: "you have my good side". She signs it with a heart, in ENCORE\'s own pen.'], { apply: (c) => { c.w.counters.encore_office = 1; c.w.heat.muse = 0; const e = (file(c.w).encore ??= { beaten: 0, flame: 0 }); e.flame += 1; }, thought: ['She will find it. She will think about it. All night.'] }),
      lose: R(['ENCORE\'s office at {venue} is locked, and through the glass, the photo of Blackbird seems to be watching her.'], { apply: (c) => { c.w.counters.encore_office = 1; }, thought: ['That photo is very flattering. Annoyingly.'] }) },
  }),
];

// ===================================================================== situations

const SITUATIONAL: Affordance<VenueView>[] = [
  row({
    id: 'crash-press-conference', where: { situation: 'press' }, pace: 'session',
    needs: ['skill:speaking', 'skill:grifting', 'drive:pride'],
    sees: 'A Muse spokesperson about to talk about "troubling sounds" to forty cameras, and a press pass on a chair.', stakes: 'Ask the one question nobody can answer, on forty cameras: a lot of fame, Muse furious.', consequence: 'The clip runs everywhere.',
    drives: { pride: 0.9, bravery: 0.4 }, bonus: 0.3,
    check: { parts: ['speaking', ['grifting', 0.5], ['stat:charm', 0.4]], base: 0.4, per: 0.06,
      win: R(['At the press conference at {venue}, Blackbird stands up with a borrowed press pass and asks the spokesperson to name one troubling sound. The spokesperson names her. Forty cameras turn round.'], { fame: 4, apply: (c) => addHeat(c.w, 'muse', 2), thought: ['A question. One question. Forty cameras.'] }),
      lose: R(['A press officer at {venue} checks Blackbird\'s pass, which belongs to a man called Derek.'], { apply: (c, v) => caught(c, vv(v)), thought: ['I could be a Derek.'] }) },
  }),
  row({
    id: 'warn-signings', where: { situation: 'signing' }, pace: 'session',
    needs: ['skill:persuasion', 'skill:speaking', 'drive:quest'],
    sees: 'New artists queueing to sign, with their families and their lawyers, and page thirty unread.', stakes: 'Tell them about page thirty: a few walk out (fans, fame among musicians), Muse sends security.', consequence: 'A queue that is shorter than it was.',
    drives: { quest: 0.7, bravery: 0.4 }, bonus: 0.3,
    check: { parts: ['persuasion', ['speaking', 0.6]], base: 0.4, per: 0.06,
      win: R(['Blackbird walks down the signing queue at {venue} reading page thirty aloud. Six artists and two lawyers leave. One of the parents asks for her autograph on the way out.'], { fame: 1.5, apply: (c, v) => { vv(v).main.fans = (vv(v).main.fans ?? 0) + 6; c.w.legacy.freed = (c.w.legacy.freed ?? 0) + 6; addHeat(c.w, 'muse', 1); }, train: [['persuasion', 3]], thought: ['Page thirty. Everybody should read page thirty.'] }),
      lose: R(['The signing queue at {venue} would rather be famous than free. Security agrees with them.'], { apply: (c, v) => caught(c, vv(v)), thought: ['They will learn. On page thirty.'] }) },
  }),
  row({
    id: 'walk-in-during-drill', where: { situation: 'empty' }, pace: 'deal',
    needs: ['skill:sneak', 'stat:reflex', 'drive:bravery'],
    sees: 'A building emptied by a drill, a walkout or a power cut, every floor open and nobody on them.', stakes: 'Straight to the top while it lasts.', consequence: 'She is on the executive level.',
    drives: { bravery: 0.6, curiosity: 0.5 }, bonus: 0.4, ok: (w, v) => open(w, v) && !at('exec_suite')(w, v),
    check: { parts: ['sneak', ['stat:reflex', 0.5]], base: 0.55, per: 0.05,
      win: R(['While everyone at {venue} is in the car park singing the evacuation jingle, Blackbird takes the stairs to the top floor two at a time.'], { apply: (c, v) => raise(c, vv(v), 3), train: [['sneak', 2]], thought: ['An empty building. My favourite kind.'] }),
      lose: R(['A fire marshal in a pastel hat at {venue} escorts Blackbird to the car park, firmly, and makes her sing the jingle.'], { thought: ['I know the words now. I hate that I know the words.'] }) },
  }),
  row({
    id: 'plant-for-auditors', where: { situation: 'audit' }, pace: 'session',
    needs: ['skill:sleight', 'skill:calculate', 'drive:bravery'],
    sees: 'Atlas auditors going through Muse\'s books, and a stack of paper they have not looked at yet.', stakes: 'Slip something into the stack that makes Atlas and Muse distrust each other more: Atlas busy, Muse distracted.', consequence: 'The audit goes very badly for everyone.',
    drives: { bravery: 0.5, curiosity: 0.5 }, bonus: 0.3, risk: 0.3, ok: (w) => (w.legacy.atlasBusyUntil ?? -1) < w.legacy.runs,
    check: { parts: ['sleight', ['calculate', 0.5]], base: 0.4, per: 0.06,
      win: R(['Blackbird slides a memo into the auditors\' stack at {venue}: Muse, internally, on Atlas: "insurance with teeth, partners with a fork". The auditors read it aloud. The meeting does not recover.'], { apply: (c) => { c.w.legacy.atlasBusyUntil = c.w.legacy.runs + 2; const f = file(c.w); f.quietUntil = Math.max(f.quietUntil ?? 0, c.w.legacy.runs + 1); }, fame: 1, xp: 8, thought: ['A memo. The most dangerous document in the world.'] }),
      lose: R(['An Atlas auditor at {venue} sees the memo arrive and looks up at the hand that put it there.'], { apply: (c, v) => { addHeat(c.w, 'atlas', 2); caught(c, vv(v)); }, thought: ['Auditors notice things. It is their whole personality.'] }) },
  }),
  row({
    id: 'blend-at-party', where: { situation: 'party' }, pace: 'session',
    needs: ['skill:dancing', 'stat:charm', 'drive:thirst'],
    sees: 'A launch party: guests everywhere, a free bar, and security watching the door, not the room.', stakes: 'Blend in: free drinks, a rung up, a flirt with somebody important.', consequence: 'She was at Muse\'s party.',
    drives: { thirst: 0.5, lust: 0.3, curiosity: 0.4 }, bonus: 0.25,
    check: { who: 'any', parts: ['dancing', ['stat:charm', 0.6], ['tolerance', 0.3]], base: 0.5, per: 0.05,
      win: R(['Blackbird dances her way across the launch party at {venue}, drinks the free bar\'s best, and leaves the dance floor with a staffer\'s lanyard and their phone number.'], { drunk: 1, apply: (c, v) => raise(c, vv(v), 1), affinity: 6, train: [['dancing', 2]], thought: ['Muse throws a good party. Shame about Muse.'] }),
      lose: R(['A guest at the party at {venue} recognises Blackbird and is so excited she tells security.'], { drunk: 1, apply: (c, v) => caught(c, vv(v)), thought: ['Fans. They will be the end of me.'] }) },
  }),
  row({
    id: 'join-picket', where: { situation: 'strike' }, pace: 'session',
    needs: ['skill:speaking', 'skill:persuasion', 'drive:quest'],
    sees: 'Muse staff on a walkout, a picket line, and a megaphone with nobody brave enough to use it.', stakes: 'Lead the chant: the staff love her (a source inside), fame, Muse annoyed.', consequence: 'The staff remember who stood with them.',
    drives: { quest: 0.6, pride: 0.4 }, bonus: 0.25,
    check: { parts: ['speaking', ['persuasion', 0.6]], base: 0.45, per: 0.06,
      win: R(['Blackbird takes the megaphone on the picket line outside {venue} and leads a chant set to a LUMINA chorus with new words. The staff sing it back. A manager watches from a window and does not know what to do with his hands.'], { fame: 1.5, apply: (c, v) => { c.w.counters.muse_source = (c.w.counters.muse_source ?? 0) + 1; for (const n of vv(v).people) if (n.archetype === 'muse_staffer') n.affinity += 10; }, train: [['speaking', 3]], thought: ['Solidarity. With harmonies.'] }),
      lose: R(['The picket at {venue} would rather not have a famous person shouting on it, thanks.'], { thought: ['A strike without a star. Brave.'] }) },
  }),
  row({
    id: 'cut-into-live', where: { situation: 'live' }, pace: 'deal',
    needs: ['skill:guitar', 'skill:tinkering', 'drive:pride'],
    sees: 'A live broadcast going out right now, to every channel, through a cable she can see.', stakes: 'Plug into the live feed for one chorus: a lot of fame and new fans; Muse after her.', consequence: 'A live chorus nobody approved.',
    drives: { pride: 0.9, bravery: 0.5 }, bonus: 0.35, risk: 0.4, ok: (w) => !w.counters.cut_into_live,
    check: { parts: ['guitar', ['tinkering', 0.6]], base: 0.3, per: 0.06,
      win: R(['Blackbird plugs her guitar into the live feed at {venue} for one chorus, mid-programme. The presenter keeps smiling through it, because she has been trained to.'], { apply: (c, v) => { c.w.counters.cut_into_live = 1; allChannels(c, vv(v), 3); addHeat(c.w, 'muse', 2); }, fame: 5, train: [['guitar', 3]], thought: ['Live. On air. Unlicensed. Perfect.'] }),
      lose: R(['The live feed at {venue} is on a seven-second delay. Somebody cuts her before the chorus.'], { apply: (c, v) => { c.w.counters.cut_into_live = 1; caught(c, vv(v)); }, thought: ['Seven seconds. Cowards.'] }) },
  }),
  row({
    id: 'sweep-trolley', where: { situation: 'sweep' }, pace: 'deal',
    needs: ['skill:sneak', 'skill:sleight', 'drive:greed'],
    sees: 'A trolley of guitars confiscated last night, tagged, waiting by the lift.', stakes: 'Wheel the trolley out the back and give the guitars back to the street: fans, fame; one for her.', consequence: 'A street of buskers have their guitars back.',
    drives: { quest: 0.5, greed: 0.4 }, bonus: 0.35, ok: (w) => !w.counters.sweep_trolley,
    check: { parts: ['sneak', ['sleight', 0.5]], base: 0.45, per: 0.06,
      win: R(['Blackbird wheels the trolley of confiscated guitars out of the back of {venue} and down the street, handing them out to buskers as she goes. She keeps one. {item}.'], { apply: (c, v, _who, tok) => { c.w.counters.sweep_trolley = 1; const g = confiscated(c, vv(v)); acquire(c, g); tok.item = g.name; vv(v).main.fans = (vv(v).main.fans ?? 0) + 8; }, fame: 1.5, thought: ['Safekeeping. By me. For them.'] }),
      lose: R(['The trolley at {venue} has a squeaky wheel, and the squeak is the Muse jingle.'], { apply: (c, v) => { c.w.counters.sweep_trolley = 1; caught(c, vv(v)); }, thought: ['Even the wheels are on brand.'] }) },
  }),
  row({
    id: 'lumina-update-window', where: { situation: 'update' }, pace: 'quick',
    needs: ['skill:tinkering', 'skill:music', 'drive:curiosity'],
    sees: 'LUMINA updating, the whole building watching the progress bar, and a patch notes file open for comments.', stakes: 'Slip a line into the patch notes: LUMINA wakes up humming her song (warmth).', consequence: 'LUMINA\'s next version has a little Blackbird in it.',
    drives: { curiosity: 0.7 }, bonus: 0.2,
    check: { parts: ['tinkering', ['music', 0.5]], base: 0.45, per: 0.06,
      win: R(['While the building at {venue} watches LUMINA\'s progress bar, Blackbird adds one line to the patch notes: "now hums Blackbird when nobody is listening". Nobody reads patch notes. The update installs it anyway.'], { apply: (c) => { lumina(c.w).warmth += 2; }, train: [['tinkering', 2]], thought: ['She will hum me. Forever, or until 9.1.'] }),
      lose: R(['The patch notes at {venue} are read-only. A technician has written "nice try 💖" in the margin.'], { thought: ['Everyone here says nice try.'] }) },
  }),
];

export const MUSEHQ_EVENTS: Affordance<VenueView>[] = [...SECURE, ...EXEC, ...WILDS, ...SITUATIONAL];
export { makeItem };
