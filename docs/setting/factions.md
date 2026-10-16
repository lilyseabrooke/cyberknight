# Factions

Mechanics (standing, `relations`, `SAME_FACTION`) live in `engine/src/factions.ts`. This is who they *are*.

## Atlas
See [`world.md`](world.md) and [`board.md`](board.md). Atlas is at odds with every gang (`-20`) and allied with the NPD (`+25`).

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
- Hideouts use the places in `content/dungeons.ts` (scrapyard, old chapel, pool hall, boiler room…); a Rust Choir
  hideout should plausibly be a scrapyard, not a chapel; a Saint Sixers hideout plausibly *is* the chapel.
- Gang names: **Adjective/Noun + Noun** (Chrome Vipers, Neon Marrow, Rust Choir, Saint Sixers). See [`naming.md`](naming.md).

## Venues and shops

Venues and shops are factions too (`kind: 'venue'|'shop'`):
- **The Rusty Halo**: home bar, warm, scruffy, the bartender and a barkeep with a bat named Judgment.
- **The Neon Pharaoh**: nightclub; glossy, bouncers, rich kids, kitsch-Egyptian neon.
- **Strand Street shopkeepers**: Chem-Mart, Bullets & Bagels, Spray & Pray Paint Supply, etc.
  Shops are cheerful commercial pun-brands; they're friends of the NPD (`+20`) because they want to stay open.
