# CYBERKNIGHT — Design Document

*A self-playing cyberpunk sword-and-sorcery roguelite. You are the lab assistant. Your writing is the tinkering.*

## 1. Premise

In the megacity of **Neo**, the **Atlas Corporation** sells "protection": **cyberdragons**, robotic weapons platforms that patrol the streets and terrorize the populace into submission. Our hero is a **cyberknight** from a neglected neighborhood deep in the city's guts. She sets out to slay dragons, rescue damsels (hackers, blue-haired bartenders, other cyberpunk mainstays), dethrone the "king" (the corrupt Neo police), and finally confront the "wicked gods" who installed him: the **eight cyborg board members of Atlas**.

Fantasy-to-cyberpunk mapping is intentional and should be played straight and lighthearted:

| Sword & sorcery | Neo |
|---|---|
| Village | Neglected neighborhood / the hero's lab |
| Dragons | Patrol platforms, weapons drones |
| Damsels | Hackers, bartenders, fixers, street medics |
| Tavern | Bars, noodle stalls, laser-tag arcades |
| The King | The corrupt police hierarchy |
| The Gods | The 8 Atlas board members |
| Quest items / relics | Salvage, firmware, prototype tech |

**Tone:** lighthearted. The hero is brave, well-meaning and a disaster. The humor comes from her AI making bad decisions, and the world remembering them.

## 2. Core loop

1. Hero leaves the lab and goes out into Neo.
2. She acts on her own (see §4). The player watches reports and may spend Cipher to assist.
3. She fights, earns, drinks, flirts, gets jumped in an alley, dies (or occasionally wins).
4. She is rebuilt in the lab. Surviving materials and unspent neodollars fund permanent upgrades.
5. She goes out again, stronger and a little smarter.
6. Eventually she defeats all eight Atlas board members. **Game won.**

**The player's real job is writing.** The player enters a word count; **1 word = 1 Cipher**. Costs are tuned around that rate.

## 3. Pacing: an idle game

- **Early runs:** a few minutes.
- **Mid/late game:** runs last hours. The player checks in, reads the chronicle, spends Cipher, and leaves.
- Consequences for the architecture:
  - The sim runs on a **beat clock** (each beat is a discrete decision/action). The UI plays beats at a configurable speed. Pause, 1x and fast-forward controls exist; an "skip to next interesting thing" control is also wanted.
  - **Offline catch-up:** a run that is in progress while the page is closed continues "in absentia". On return the client fast-forwards the deterministic sim from the last saved state to the current wall-clock time, then shows a digest of what happened (full log still browsable). Because the sim is deterministic and seeded, this needs no server compute.
  - Beat pace per run is tuned so the real-time length of a run scales with progression (early = short routes, late = long expeditions).
  - Mid-run Cipher assists are timestamped player inputs in the run's input log, so catch-up replays them correctly.

## 4. The hero AI

A **utility AI** with needs, traits and a competence knob.

- **Drives:** thirst, lust, greed, bravery, curiosity, pride, plus the real objective.
- **Decision:** each beat, score the available actions and choose via softmax. A **temperature** (inverse competence) controls how often she makes a dumb choice. Early: high temperature, low quest weight.
- **Flaws are traits**, specific and funny and learnable: *can't resist a blue-haired bartender*, *starts bar fights*, *says yes to every dare*. Upgrades can raise quest weight, add considerations (risk checks, retreat thresholds, route planning) and lower noise. Some flaws can be tamed; some should probably never go away.
- **Per-save personality:** the hero is **Blackbird**, with a randomly generated, astonishingly uncool government name per save. Baseline is "cocky, self-assured hero who knows she's the hero." Each save rolls a **perturbation** from that baseline: a set of drive-weight modifiers and quirk tags (airheaded ditz → dangerously curious; hothead → picks fights far above her level; hopeless romantic; lush; gambler; etc.). Personality is persistent for the save and also drives voice in the prose layer. See `docs/TONE.md`.
- **Assists (spend Cipher mid-run):** cash, healing, ammo, sober-up, temporary competence boost, etc. Costs scale so assists are a strong rescue, never the primary strategy.
- **No runtime LLM.** Determinism, cost and latency. Writing is hand-authored templates (§9). An optional LLM flavor layer is a possible later experiment, not a dependency.

## 5. World model

Two layers:

**Persistent macro-Neo** (per save)
- Districts, factions (gangs, corp divisions, unions, fixers, the police hierarchy), named NPCs, the Atlas board and its structure.
- Relationship graph and the world flags that gate the campaign.

**Per-run micro layer** (regenerated from the run seed on top of the macro state)
- Street layout and points of interest.
- Situational variables: which gangs are at war this run, which establishment types the police are cracking down on, dragon patrol routes, events and weather.

**Lazy generation, abstract simulation.** Chunks are generated as the hero reaches them. Off-screen factions tick at a macro level (strength, territory, mood) rather than simulating every tile. Dwarf-Fortress-style depth without tile-level cost.

### Relationships and memory

- Every NPC and faction has an **opinion vector** (affection, respect, fear, trust) toward the hero.
- Each holds a **bounded list of memories** (events with salience that decays). Rumors propagate along connections: insult a bartender, get a cold shoulder from her cousin's gang two runs later.
- The AI's choices, good or bad, are recorded and shape the world.

### Campaign spine

Gated by world-state flags:
1. Village and lab
2. Dragons
3. Rescues (recruit allies, unlock services)
4. The police "king"
5. The eight board members, each with its own unlock chain

## 6. Meta-progression

**Currencies**
- **Neodollars:** the hero's money. She wastes much of it on booze, girls and laser tag. Whatever survives funds upgrades.
- **Materials:** salvage from kills and runs.
- **Cipher:** from word count. Uses: part of upgrade purchases, mid-run assists, AI/firmware unlocks.

**Upgrade tracks (draft)**
- **Chassis:** stats.
- **Firmware:** AI competence, quest weighting, flaw management.
- **Arsenal:** weapons and abilities.
- **Lab:** the assistant's perks, rebuild quality, starting resources.
- **Contacts:** relationship-gated unlocks.

**Writing log:** every word-count entry is logged with a timestamp. Honor system; no anti-cheat. (Open: optional daily conversion cap. Currently none.)

## 7. Technical architecture

- **Next.js (App Router) + TypeScript**, deployed on **Vercel**.
- **Engine package** (`/engine`): pure TypeScript, no DOM, seeded RNG, deterministic, fully unit-tested. Used by the client and by a headless **CLI sim harness** that runs thousands of seeded runs for balance.
- **Event-sourced narrative:** engine emits structured events; a separate text layer renders prose. The chronicle, relationships and lab recap all read the same event stream.
- **Supabase (Postgres)**, accessed **server-side only** through Vercel API routes with the service key. RLS enabled with no anon access; the browser never talks to the database.
- **Auth:** a single unique password is the key across devices. The game generates a high-entropy 5–6 word passphrase at save creation (users don't choose weak ones). The server stores only a hash. Login verifies it and sets a signed httpOnly session cookie. Rate-limit the login route.
- **Sync:** the client runs the sim and autosaves snapshots plus the run's input log. A `rev` counter provides optimistic concurrency so two devices can't silently overwrite each other.
- **Draft tables:** `saves(id, key_hash, created_at)`, `save_state(save_id, rev, state jsonb)`, `runs`, `chronicle_events` (bounded/compacted), `writing_log`.

## 7a. The smart-object system ("the Sims, but cyberpunk action RPG")

The gameplay *is* the unpredictability of what Blackbird chooses, so the core engine feature is an **affordance system**:

- Every NPC, object, exit and her own state **advertises candidate actions** (`Candidate`: key, drive weights, risk, state-driven bonus, a `run` that mutates the world and emits events).
- Each beat she scores everything available against her **personality-weighted drives** and picks by softmax. **Competence** lowers the temperature, raises the weight of "smart" options (patch up, medkit) and makes her respect **risk**. A clueless hero barely sees risk at all.
- Choice is **family-normalised**: she picks a *kind* of action, then a target, so a bar with 14 patrons doesn't make "start a fight" 14x likelier than flirting.
- Baseline survival instinct (hurt heroes pick fewer fights) is not tied to competence; competence only makes it reliable.
- **Consequences chain** through shared world state: heat per faction (NPD, Atlas, the bar, the club), injuries (a broken leg means no fleeing and a power penalty), per-NPC `affinity` and `memories`, hidden exits revealed by rumors/dumpsters/fleeing, misrouted ductwork, gates (bouncers, locks, guards, jumps), joiners in crowded brawls, and ambient events (ambushes, raids, muggings, drone sweeps, gang-war spillover).
- **Everything is plain JSON** and the RNG position is stored in the world, so a run can be saved, resumed on another device, or fast-forwarded for offline catch-up with identical results (tested).

## 7b. Vertical slice content (shipping in `engine/`)

**Setting:** one stretch of Neo. 16 locations: the Rusty Halo (bar floor, restroom with a street doc, kitchen, laser-tag basement, backroom with the fixer and a wall safe, roof), the alley behind it (dumpster, surveillance drone, a hidden maintenance hatch), Strand Street, the Neon Pharaoh nightclub (bouncers, security, dancers, a corporate heir), the maintenance crawlspace, the Helix Biotech loading dock, lobby and research wing (prototype vault with an experimental device), and the Kowloon Overpass where the cyberdragon CINDERJAW patrols.

**People:** ~40 NPCs with rolled names and rolled loadouts, including two romanceable women (the bartender and a hacker with a jealous streak), a robot puppy that can be pet or stolen, a six-armed cook, a twitchy dealer, a street prophet, an off-duty cop, a "monitored" corpo with half a million in tracking implants, and a barkeep with a bat named Judgment.

**Per-run situational variables:** which two gangs are at war, and what the police are cracking down on this week.

**Things Blackbird can do** (~50 kinds, each with several outcomes): chat/rumors, flirt, kiss (witnessed kisses trigger jealous fights), pickpocket, threaten, challenge anyone, arm-wrestle, hack implants, ask for work, fence loot, get patched by a bathroom doc (sometimes "upgraded"), buy stims, order drinks, buy a round, karaoke, hustle pool, pep talk in the mirror, raid the fridge, laser tag, rob the till, crack the safe, pick locks, dumpster-dive, kick vending machines, dance, mess with fuse panels, break into Helix, steal the experimental device, jump rooftops, and take on the dragon.

**Known balance notes (for M5):** a clueless Blackbird wins ~3% of nights by luck and usually dies in the first hundred beats; a highly competent one currently *avoids* the dragon rather than preparing for it. Meta-progression (Firmware, starting gear) should make "smart" mean "prepared and strong enough", not just "cautious".

## 8. Roadmap

| | Milestone | Notes |
|---|---|---|
| M0 | Scaffold | Repo, TypeScript setup, tests, seeded RNG, engine skeleton, CLI sim harness |
| M1 | Vertical slice | **Engine + content done** (see §7a/7b): dense bar-and-beyond sandbox, text layer in two voices, tests, CLI. Remaining: log UI, the lab (death → rebuild), ~8 upgrades, Cipher entry. **Must be funny before moving on.** |
| M2 | Persistence | Supabase, passphrase login, cross-device sync, offline catch-up, Vercel deploy |
| M3 | Living world | Macro/micro world generation, relationships, memory, rumors, situational variables |
| M4 | Content breadth | More districts, dragon types, rescues, the police arc |
| M5 | Endgame | Eight board members, balance passes via the CLI harness, win state |
| Later | ASCII/emoji **map pane** | Lower priority; shows where the hero is. Engine should expose position data from the start so this can be added without rework |

## 9. Writing and content

- Prose is generated from structured events via a template/grammar layer (Tracery-like): tagged lines, variation, callbacks to remembered events, and voice that shifts as the hero grows more competent.
- Claude drafts the content; the author is happy to be surprised. Voice, humor level and samples live in `docs/TONE.md`. Reports interleave a neutral field-report voice with Blackbird's own cocky first-person thoughts.
- Content must be tagged (location type, mood, relationship state) so the right line appears at the right moment.

## 10. Open items

- Tone references and sample lines from the author (needed before M1 writing).
- Exact beat pacing curve and real-time run length per stage.
- Cipher cost tuning (1 word = 1 Cipher is fixed).
- Whether to cap daily Cipher conversion (currently: no).
