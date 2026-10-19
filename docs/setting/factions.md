# Factions

Mechanics (standing, `relations`, `SAME_FACTION`) live in `engine/src/factions.ts`. This is who they *are*.

## Atlas
See [`world.md`](world.md) and [`board.md`](board.md). Atlas is at odds with every gang (`-20`) and allied with the NPD (`+25`).

**Locations are fluid.** Places are generated and can be destroyed by what Blackbird does (she can shut down the
Rusty Halo by killing its owner). So faction lore describes *people, styles and vices*, never fixed addresses. Where a
faction "has a place," say what *kind* of place it favors, not which one.

## NPD — Neo Protective Division ("the King")

All of them are Atlas puppets in the end. **The tone escalates with rank**, and so should content that is
unlocked by progression:

| Tier | Who | Tone |
|---|---|---|
| **Street** | Beat cops, patrol officers | **Incompetent, bumbling.** Dumb street jocks with badges and guns, bored, overconfident, easily distracted. Comic. |
| **Middle** | Sergeants, detectives, precinct captains | Cynical, on the take, petty. Bureaucratic farce with a hint of teeth. |
| **Top** | Commissioner's office, internal affairs, the brass | **Menacing.** Serious corruption and cronyism; polite, patient, dangerous. Still deadpan, never gory. |

PROPOSED: the NPD's top brass answer to **Sloth** (Public Services & Police Liaison), so police paperwork is literally
Atlas paperwork. NPD people don't have bounty paper (`content/spots.ts`).

Writing cops:
- Street cops fine you, chase you badly, argue about jurisdiction, and call for backup that's also late.
- Escalation should be *felt* by region and progression, not by individual line: later cops stop being funny
  and start being quietly efficient.

## Gangs

All gangs oppose the NPD (`-40`) and Atlas (`-20`) and each other (`-20`). The roster in `factions.ts` is:
`ganger` (generic "street gangs"), `vipers`, `sixers`, `marrow`, `choir`. **The five distinct identities below are
PROPOSED**, derived from the names in code; the author vetoes.

| Gang | Look / sound | Business | Attitude | Voice |
|---|---|---|---|---|
| **Chrome Vipers** | Slick, green-chrome augments, snake motifs, expensive jackets | Courier runs, speed, data smuggling | Vain; fast; hate being called amateurs | Smooth, sneering, hissing S's sparingly |
| **Saint Sixers** | Faux-religious: patron-saint nicknames, haloes drawn on jackets, "blessings" | Protection racket (*the ironic mirror of Atlas*: "we protect you too, and cheaper") and numbers | Smug about being the *honest* racketeers | Sermonizing, bookkeeping as liturgy |
| **Neon Marrow** | Glow-bone implants, rave aesthetic, UV tattoos | Club dealing, stims | Party-first; casually dangerous | Breezy, high, lyrical, unpredictable |
| **Rust Choir** | Scrapyard crews, welded instruments, chanting and clanging | Salvage, chop shops, noise | Territorial, loyal, loud | Rhythmic; speak in call-and-response |
| **Street gangs** (generic) | Whatever the generator rolls | Muscle | Disorganized, over-armed | Plain street talk |

Gang writing rules:
- Gangs are **not noble** and **not victims of the joke**. They're comedic and dangerous in equal measure: the
  joke is their ego and logistics, never their poverty.
- Every gang has a **vice** (what they sell) and a **style** (how they look and sound). New gangs need both.
- Hideouts are generated (`content/dungeons.ts`). Don't tie a gang to a specific location; tie it to a *kind* of
  place if at all, and always allow any gang to turn up anywhere the generator puts them.
- Gang names: **Adjective/Noun + Noun** (Chrome Vipers, Neon Marrow, Rust Choir, Saint Sixers). See [`naming.md`](naming.md).

## Muse

**Neo's entertainment conglomerate,** and the city's other megacorp. It runs every TV channel, makes all the music, and
decides what music is allowed to be played (only Muse's). Muse is **not Atlas** and not one of Atlas's: Blackbird can
fight it, dodge it, or sign with it, and none of that breaks the Atlas rule.

- **Non-Muse music is technically illegal** in several overlapping ways (licensing, broadcast rights, "unlicensed
  public emotion"). Nobody enforces it on a busker. It only matters once a musician gets big enough to be noticed, and
  then Muse **signs them, has them arrested, or sends an Inspiration team**.
- **Inspiration teams** are Muse's strike squads: military-grade weapons, pastel tactical armour, heart decals, a jingle
  before they breach. They are lethal and they are adorable about it.
- **The register is the joke.** Muse talks like the warmest influencer in the city ("We light up your world with music
  🥰"), emoji and all, in the same breath as an Inspiration team opening fire on a guitarist, followed by a heartfelt
  tribute post and a link to stream the tribute single. Nobody at Muse notices the contradiction. Played straight, like
  Atlas's safety-speak. Lethal, deadpan, never gory (hard rule 2), and the joke is always Muse, never the musician.
- Muse's idol is a synthetic pop star on every screen. PROPOSED: **LUMINA**, released in version numbers ("LUMINA 6.2:
  now with more feelings").
- PROPOSED: **Muse Clearance** (the licensing office: glittery letters, officers who confiscate guitars "for
  safekeeping"), **Muse Broadcast** (the channels) and **Muse A&R** (scouts with pre-uncapped pens).
- PROPOSED: **Muse and Atlas** are partners who don't trust each other. Atlas's announcements, dragon broadcasts and hold
  music are licensed from Muse; Muse's channels carry Atlas's safety ads; Gluttony (M&A) has been circling Muse for
  years.
- Musical progression, Muse's attention ladder and what Blackbird can do about Muse are in
  [`../GUITAR_PLAN.md`](../GUITAR_PLAN.md).

## Venues and shops

Venues and shops (bars, clubs, gyms, pawn shops) are factions too (`kind: 'venue'|'shop'`), but **they are not permanent**: the owner can be killed,
the place closed, the stock robbed. Write them as *types with a personality*, not as institutions the world depends on.
- The starting district has the Rusty Halo (scruffy home bar), the Neon Pharaoh (glossy nightclub) and Strand Street
  shops (Chem-Mart, Bullets & Bagels, Spray & Pray). Their current lore is in `engine/src/world.ts`; don't repeat it here.
- Shops are cheerful commercial pun-brands and friendly to the NPD (`+20`) because they want to stay open.
- New content must survive a venue being gone. Reference a place through its role ("the bartender") or via game state
  (callbacks, memory), never assume it still stands.
