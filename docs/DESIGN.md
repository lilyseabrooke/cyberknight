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
- **Per-save personality:** the hero is **Blackbird**, with a randomly generated, astonishingly uncool government name per save. Baseline is "cocky, self-assured hero who knows she's the hero." Each save rolls a **personality vector**: ~24 independent 0..1 traits (fame, justice, impress, romantic, drink, gamble, temper, courage, reckless, and more; full list in `engine/src/personality.ts`). Traits feed the decision AI two ways: they derive the seven drive weights, and `engine/src/traits.ts` adds per-action loadings (e.g. `romantic` pulls her toward her one flame and away from everyone else; `justice` only likes fights with bad guys). Personality is persistent for the save and also drives voice in the prose layer. See `docs/TONE.md`.
- **Assists (spend Cipher mid-run):** cash, healing, ammo, sober-up, temporary competence boost, etc. Costs scale so assists are a strong rescue, never the primary strategy.
- **No runtime LLM.** Determinism, cost and latency. Writing is hand-authored templates (§9). An optional LLM flavor layer is a possible later experiment, not a dependency.

### Goals and reasoning

Utility AI alone makes her drift: every beat is a fresh pick, so nothing she wants ever carries over. On top of it sits a **mind** (`engine/src/goals.ts`, data in `mind.ts`, world knowledge in `plans.ts`): a bounded set of goals she sets for herself, remembers, works on, delays, reworks and drops. It plugs into the same softmax; it never takes the wheel.

**Goals.** `buy` (a specific thing she saw in a shop or on the doc's tray), `cash` (raise N neodollars), `weapon` (find something better to swing), `kill` (flatline someone; settles for a beating), `romance` (impress someone) and `heist` (rob a place she has seen: approach, loot, escape). They come from what she notices: a ware that catches her eye, a slight in a crowd (`slight` events; whether it becomes a grudge depends on `grudge`, `temper`, `kindness`), a girl across the room (`impress`, `romantic`), being broke (`greed`), a dragon she can't hurt, a safe that is just sitting there (`thrill`, `greed`, `honesty`).

**Nesting.** A goal can need another goal first, down to five deep: *flatline Skeeter* needs *a better weapon* (she notices he hits harder than she does; a sharper hero asks before swinging, anyone asks after the first beating), which means *buy the thermal katana*, which is *1,164 neodollars short*, which she decides to get by *robbing the Helix vault*. Only the innermost open goals steer her; the ones above wait on them. When the money's there, the purchase goal is a leaf again and pulls her back to the shop.

**How goals steer.** Each beat `mindTick` reviews every goal (done? moot? hurt, so delay? bored? frustrated? still makes sense?), forms new ones, and ranks the leaves. `goalBias` adds to every candidate's score (the strongest leaf gets the most weight, the next most, the rest only when the opportunity is standing in front of her) and `hops` pull her one step along the route (`routeTo`, which respects gates) towards where a goal wants her. `focusFactor` scales all of it: competence helps, impulsiveness hurts, so a clueless hero still wanders off task. A girl she's trying to impress gets flirted at when she's in the room; across town, she's only a mild pull.

**Weighing money.** With a cash goal active, every candidate is scored by what she *believes* it earns (`PRIOR` in `plans.ts`, then an EMA of what it actually paid, so a till she keeps getting caught at loses its shine) and spending (drinks, gadgets) is penalised. Loot she's carrying pulls her to the fixer. Corp sites aren't casual earning spots; those are heists.

**Letting go.** Desire decays every beat (slower for the type of goal her traits favour: grudge and temper for kills, romantic/impress for crushes, greed for money), frustration builds while she makes no progress (progress = her metric for the goal improving: nearer, richer, healthier target), and either one ends it. Before quitting she tries to **rework** it: a pricey item becomes a cheaper one, a sold-out item becomes the next best, *flatline* becomes *teach a lesson*, a wish for the best weapon becomes the best one actually on offer. She **delays** rather than drops when she's hurt (until she's patched up) or has just been beaten. She only juggles `capacity` ambitions (3 to 5 by competence; the impulsive overcommit) and replaces her weakest goal for a clearly stronger one, otherwise she lets the new idea wave.

**Heists.** Quiet is the point: approach and loot penalise loud candidates, and anything that raises heat other than the take itself blows the plan. A sharp hero bails at once; a clueless one presses on. Success reports a clean or messy haul. She only plans a robbery of a place she has seen and can find a way into.

**Observability.** Events `goal_new`, `goal_done`, `goal_drop`, `goal_revise`, `goal_delay`, `goal_wake`, `goal_note`, `goal_resume`, `goal_pass`, `slight`, `impressed`. The status panel shows her goals as a tree (`goalViews`); `npm run play` prints what's still on her mind. All state is `world.mind`, plain JSON, replayed deterministically.

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
- Each beat she scores everything available against her **personality-weighted drives and trait loadings** and picks by softmax. **Competence** lowers the temperature, raises the weight of "smart" options (patch up, medkit) and makes her respect **risk**. A clueless hero barely sees risk at all.
- Choice is **family-normalised**: she picks a *kind* of action, then a target, so a bar with 14 patrons doesn't make "start a fight" 14x likelier than flirting.
- Baseline survival instinct (hurt heroes pick fewer fights) is not tied to competence; competence only makes it reliable.
- **Consequences chain** through shared world state: heat per faction (NPD, Atlas, the bar, the club), injuries (a broken leg means no fleeing and a power penalty), per-NPC `affinity` and `memories`, hidden exits revealed by rumors/dumpsters/fleeing, misrouted ductwork, gates (bouncers, locks, guards, jumps), joiners in crowded brawls, and ambient events (ambushes, raids, muggings, drone sweeps, gang-war spillover).
- **Everything is plain JSON** and the RNG position is stored in the world, so a run can be saved, resumed on another device, or fast-forwarded for offline catch-up with identical results (tested).

## 7b. Vertical slice content (shipping in `engine/`)

**Setting:** one stretch of Neo. 16 locations: the Rusty Halo (bar floor, restroom with a street doc, kitchen, laser-tag basement, backroom with the fixer and a wall safe, roof), the alley behind it (dumpster, surveillance drone, a hidden maintenance hatch), Strand Street, the Neon Pharaoh nightclub (bouncers, security, dancers, a corporate heir), the maintenance crawlspace, the Helix Biotech loading dock, lobby and research wing (prototype vault with an experimental device), and the Kowloon Overpass where the cyberdragon CINDERJAW patrols.

**People:** ~40 NPCs with rolled names and rolled loadouts, including two romanceable women (the bartender and a hacker with a jealous streak), a robot puppy that can be pet or stolen, a six-armed cook, a twitchy dealer, a street prophet, an off-duty cop, a "monitored" corpo with half a million in tracking implants, and a barkeep with a bat named Judgment.

**Per-run situational variables:** which two gangs are at war, and what the police are cracking down on this week.

**Things Blackbird can do** (~50 kinds, each with several outcomes): chat/rumors, flirt, kiss (witnessed kisses trigger jealous fights), pickpocket, threaten, challenge anyone, arm-wrestle, hack implants, ask for work, fence loot, get patched by a bathroom doc (sometimes "upgraded"), buy stims, order drinks, buy a round, karaoke, hustle pool, pep talk in the mirror, raid the fridge, laser tag, rob the till, crack the safe, pick locks, dumpster-dive, kick vending machines, dance, mess with fuse panels, break into Helix, steal the experimental device, jump rooftops, and take on the dragon.

### Deepened sandbox (second pass)

New systems layered on the same affordance engine:

- **Companions (max 3).** Each has HP, loyalty (fades if neglected; at zero they leave), abilities and combat assists. Sources: steal the **robot puppy**; **jack a surveillance drone** (or scrapper-bot) instead of blowing it up; **beatbox with the street kids** behind the club until they adopt her; **recruit the hacker** after a kiss and enough affinity; **rescue a damsel** (random street scene with a time limit; ignoring it means she rescues herself); feed noodles to a **judgmental pigeon**. Allies assist in fights (bites, zaps, bricks, tanking, disabling weapons), scout ambushes and hidden doors, sniff out loot, lift cash, and can be petted or repaired.
- **Skills that grow by use:** music (karaoke, DJ booth, beatboxing), drinking, tinkering, sneaking. Music makes a DJ set land, wins over the street kids and (rarely) beatboxes her way out of a beating by security. It does not help against the dragon (she tries anyway: `serenade`).
- **Fame:** earned from DJ sets, karaoke, dancing, billboard hacks, rescues, big brawls, killing the dragon. Bouncers wave her in, bartenders pour for free, fans give her tips.
- **Bar tab:** she drinks on credit, and Tiny eventually collects.
- **Chrome with a catch:** ten black-market implants from the bathroom doc (third thumb, chrome larynx, mantis blades, hydraulic calves, emergency defibrillator = one extra life), each with a stated pitch and an honest catch.
- **Per-run weather** (acid rain, neon fog, heatwave), **Atlas propaganda ads**, **hangovers**, **laser-tag championship**, **gossip**: NPCs reference what she did to them (and what she did to their friends).
- **Dragon intel:** buy it from the fixer, hack it from a Helix terminal, or pry it from a talkative scientist, and CINDERJAW's targeting stutters. A competent, prepared hero now knows when it's time and commits; the clueless one still stumbles into it.

### Layered skills (third pass)

About 26 skills across music (music, singing, guitar, DJing, beatboxing), aim and combat (pool, throwing, shooting, melee, athletics), stealth and tech (sneaking, sleight of hand, lockpicking, tinkering), social (romance, dancing, intimidation, streetwise, haggling, cards, animal rapport) and crafts (drinking, mixology, cooking, first aid, graffiti).

- **Combination rule.** An action lists the skills and stats that feed it. They combine as a **weighted geometric mean on a 0-10 scale** (`synergy()` in `engine/src/skills.ts`), and the result adds to a baseline luck chance (`ODDS` in `engine/src/hobbies.ts`). Any zero factor zeroes the skill part (music 10 + guitar 0 = baseline luck only), while a related skill improves a new one (guitar 3 + music 8 = about 4.9, better than guitar 3 alone). Stats count as factors (`stat:charm`).
- **Spillover.** Training a skill gives a share of XP to related skills (guitar nudges music; pool nudges throwing), so learning something new carries her old knowledge with it.
- **Additive bonuses** are used where the user's rule is "mostly regular stats": a thrown pool cue uses muscle, level and throwing, plus a pool bonus; guns and melee weapons add shooting or melee skill to power.
- **Things to do with skills:** a band's green room with a vintage guitar to jam on, steal (and busk with), and gig on; pool as a hustle (bet size grows with skill) and as seduction (pool x romance); darts; cooking dishes that heal or woo; tending bar and crafting Molotov Mules to throw; graffiti (fame, gang drama); rooftop parkour; asking around for tips and marks; teaching allies tricks; and thrown items in fights.
- Only milestone levels (3, 5, 8) are announced in the log, with a flavor title ("reads the room through the subwoofers"); the status panel tracks the rest.

### Graffiti (fourth pass)

- **Supplies:** tagging needs a spray can (5 charges). Buy one at **Spray & Pray Paint Supply** (stock is finite; shipments arrive on their own), fish a nearly-empty can out of a dumpster, or get it from the clerk by **seducing her** (romance x charm), **threatening her** (intimidation x muscle), **shoplifting** (sleight of hand), or **taking her down and robbing the shop**. If the clerk is knocked out, Blackbird helps herself.
- **Saturation, not timers:** every location tracks how many pieces she has put up. Each one pays `0.6^existing` of the fame (total fame from one wall is capped), and the wall text escalates from "a bare wall" to "no room left, she paints over her own work".
- **Consequences:** police may fine her or chase her ("itinerant vandal"), drones file a review, and tagging indoors angers owners (the Halo's staff, club security, Helix guards). Tagging **gang turf** (a per-run variable: two districts belong to the warring gangs) raises that gang's heat, so crews come hunting her; their enemies like her more; and gangs can paint over her work.
- **Design rule: no artificial cooldowns.** If something is limited, the limit comes from the world: finite stock, saturation, diminishing returns, heat, grudges that fade on their own over time. The only explicit timer left is teaching allies tricks, which genuinely needs rest. Removed this pass: graffiti, cue-grabbing, billboard-hacking and DJ-block timers.

### Resources and consequences (fifth pass)

Things for the hero AI to plan around. All state is JSON on `World`; all of it is smart-object driven, with no timers.

- **Healing costs something.** No bandage, passive regen, level-up refill or healing food. HP comes back only from a **med pack** (`Chem-Mart`, 55nd, or looted from cops/gangers/dumpsters; she starts with 3) or the **street doc**. Med kits come in three tiers that each restore a fixed amount: **patch kit** (30 HP, 25nd), **med pack** (60 HP, cures 1 injury, 55nd) and **trauma kit** (110 HP, cures 2, 100nd); she starts with two patch kits and a med pack. Only the doc restores full HP (20-32nd, cures up to two injuries, occasionally botches into a stat swap).
- **Shooting costs ammo.** Guns burn typed rounds (`slugs`, `shells`, `rails`, `gauss`, `cells`; see `content/ammo.ts`), each gun at its own rate per round of shooting. A dry gun falls back to the best working weapon in her pockets, then fists (`arms.ts: wielded`). Ammo is bought at **Bullets & Bagels**, carried by armed NPCs, and found in dumpsters.
- **Attacks have witnesses.** Fights she starts (`FightOpts.assault`) are seen by people, drones and cameras (`Location.cameras`, dead in a blackout). Anything that sees it adds police heat (Atlas heat on Atlas premises); gunfire, crowds, calls and a cop in the room add more; bodies add more again. Bystanders react (`witness.ts`): cops and security join in, kin join in, civilians call the police, flee, film it, or (less often) cheer. Everyone who saw remembers. Nobody saw means no heat.
- **Gear and stimulants.** The gun shop sells weapons and armor (a starter box of ammo comes with each gun); the chem-mart sells five stims that each boost something different (power, muscle, reflex, hack, charm), with a crash afterwards and a real chance of overdose when stacked. The dealer sells them cheaper, cut with something.
- **Discretion (`discretion.ts`).** Blackbird doesn't start fights where people can see. Challenging, threatening and (a little) pickpocketing are scored down by the chance somebody or something sees it (cameras and drones are certain; people each notice ~80% of the time), scaled by `caution` (competence and a cool head raise it; recklessness, impulsiveness and temper lower it; never zero). If she still wants someone (a `kill` goal, a known bounty, bad blood) she has three outs: **sweep** (`sweep:<id>`, offered only when there are no cameras/drones/cops/security, 2-5 people, she's above 70% HP and the odds of dropping the whole room first are at least 30%; it pulls every would-be witness into the fight, so nobody is left to see it), **lure** (talk the target out to a quieter exit; works on anyone but staff, by charm/streetwise/affinity) and **tail** (wait, then follow when they drift somewhere quiet; mobile NPCs only, so not staff or fixers).
- **Bounties (`bounty.ts`).** Some NPCs (gangers, dealers, hackers, scrappers, a few regulars; each night has at least one posted and one hidden) carry NPD paper (`Npc.bounty`). Hitting someone with a bounty adds **no police heat** (`Witnessing.warranted`: also skips the bodies heat), but witnesses still react, a drone still tells Atlas, the victim's crew still hears, and Atlas's own premises don't care about NPD paper. Winning against a bountied target pays it out. She only acts on what she knows (`Mind.bounties`): posted bounties are read by her optics on sight (nothing if she has `fried_optics`); hidden ones need the **bounty-grade scanner** implant (`bounty_scan`) or a tip from someone who talks (prophets, dealers, fixers). A known bounty makes a target more attractive and a crowd far less of a worry (a fifth of the usual caution), never none.
- **Balance.** Police heat is deliberately steep: going around flatlining randos is not a viable strategy. With scarce healing and real heat, the current (pre-strategy) Blackbird dies in roughly 15-80 beats depending on competence, and nobody reaches the dragon. That is the gap the strategy layer is for. Tune with `npm run sim`.

### Romance and appetite (sixth pass)

Kissing used to be a runaway loop (the desire to kiss grew without limit as affinity grew, and some nights were hundreds of kisses). It is now the first step of a short arc with a natural limit.

- **Kiss fatigue.** The desire to kiss someone *again* is capped by affection and drops with every kiss she's already had with them. Kisses lead to **making a move**.
- **Making a move** (`engine/src/romance.ts`). Available after a kiss (or when she is drunk and keen). It can be declined (sometimes with a slap). If accepted, the venue is decided by **wildness** (thrill, mischief, impulsive, reckless, plus drink): wild and drunk heroes do it **in public** (the bar's owner tosses them out, the police hear about it outdoors, a hero who likes an audience gets famous for it); otherwise it's **somewhere private**, a spot chosen from where she is (a stall, the fridge, the backroom couch, the green room, a VIP booth, the alley). Private spots are **tolerated** (low risk) or **forbidden** (the kitchen, backroom, green room, crawlspace: high risk), with cameras and outdoors adding risk. If she's **caught**, whoever owns the place reacts (staff, the band, club security, an NPD officer, a maintenance bot, or a drone) and the evening is cut short. Sometimes the other person takes her **back to their place** (a corporate penthouse, a capsule hab, a walk-up): it **moves her there**, and the walk can get her **jumped** on the way. After the evening: a warm morning, a phone number, a wallet that's lighter, or an interruption.
- **Satiety** (`Hero.satiety`, 0..1). A move that lands leaves her sated; it suppresses flirting, kissing and moves (and crush goals) and **decays slowly** (about 220 beats at neutral), faster for showboats, thrill-seekers and drinkers, slower for hopeless romantics. **Amorous company speeds the decay**: flirting, kissing, chatting up girls, pool dates, serving dinner and dancing all burn through it.
- **Healing is a steep urge** (`engine/src/urges.ts`). How badly she wants healing rises sharply as HP falls (about 0.6 at 70% HP, 1.8 at 50%, 5 at 20%) and is **flattened by drink**: a wasted Blackbird thinks she's fine. It drives buying med packs, the doc, using packs and heading to the chem-mart, so money goals no longer outcompete a hurt hero at the pharmacy counter. A route hop from a goal also no longer drags her out of a shop in the middle of a pressing errand.

### The dragon family

Cyberdragons are Atlas "protection" platforms, in three models that behave differently:

| Model | Behavior | Role in the sandbox |
|---|---|---|
| **Apollo Mk. II** (CINDERJAW) | Stationary boss on the Kowloon Overpass | The current win condition. Brutal; beatable with allies, gear, a good build and dragon intel. |
| **Artemis Mk. I** | Roaming patrol flights of 1-3 over the outdoor districts | A competent Blackbird (power ~35+, healthy) beats a lone Artemis essentially every time. Packs of 2-3 are the real threat: they make her run or die. Kills drop wing plating/scales and give fame. |
| **Hera Mk. V** | Rare once-per-night fly-through (~10-20% of nights) | Effectively unkillable: it kills any plausible Blackbird in a round or two, and even a level-45 hero dies 90%+ of the time. The point is how she reacts. |

A flight gives her a few beats to react: **engage**, **hide**, **gawk**, or **film it for fame**. Clueless heroes engage, gawk and film (and sometimes get noticed and flattened); competent ones weigh the power ratio against their current HP and hide. Scouts and the sonic-ear implant can warn her in time.

**Known balance notes (for M5):** a clueless Blackbird beats the dragon ~5% of nights by luck, a mid-competence one ~15%, a highly competent and prepared one ~17%. Meta-progression (Firmware, starting gear) should push the smart end much higher. Events: ~250 distinct kinds per sampling, every one with templates (tested).

## 8. Roadmap

| | Milestone | Notes |
|---|---|---|
| M0 | Scaffold | Repo, TypeScript setup, tests, seeded RNG, engine skeleton, CLI sim harness |
| M1 | Vertical slice | **Engine + content done** (see §7a/7b): dense bar-and-beyond sandbox, text layer in two voices, tests, CLI. The log UI and the lab loop (death → rebuild → upgrade trees → out again) are in, see "The lab loop" below. Remaining: Cipher entry. **Must be funny before moving on.** |
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

## Heat and lying low (seventh pass)

Police response now scales with NPD heat instead of jumping straight to riot gear (`engine/src/laylow.ts`).

- **Heat 1-3:** only drones. `npd_drone` is a weak, non-lethal patrol unit (stun nets: losing means being tossed, not killed). One drone at heat 1-2, two from 3.
- **Heat 4+:** officers (two, three from 6, plus a drone sometimes); a sergeant joins at 8. Officers are still lethal, so a hot night is still rough.
- Only outdoors. Inside a hideout nothing finds her.

Heat sets a **heat urge** (`heatUrge`): about 0.6 at heat 1, 2.4 at 3, 5 at 5, 10 at 8. Recklessness, thrill-seeking and drunkenness shrink it, because she thinks she's fine.

- **Lay low** (`lay_low:here`): offered in a hideout (restroom, basement arcade, maintenance crawlspace, any home). Each beat there has a good chance to shave a point off NPD and Atlas heat. This is the safe default.
- **Head for cover** (`heatBias`): `go:` candidates are pulled towards the nearest hideout and away from leaving one, and crime and noisy families are pushed down while hot.
- **Bribe a cop** (`bribe_cop:street`): street only, heat 2+. Cost rises with heat and with every bribe she has already made (cops learn her rate); she balks at spending most of her cash. A wrong cop makes it worse, and sometimes a fight.
- **Fix the record** (`fix_record:madame`): Madame Zero, expensive, reliable, knocks 3-5 off.
- **Frame someone** (`frame:<id>`): pins it on a bystander, who is pulled off the board for 70 beats. Prefers bad guys and avoids friends. Gets harder with every frame-up and botches into a fight.

No cooldowns: price inflation, finite cash and a finite supply of fall guys do the limiting.

## Pursuits: decide what to do, then find the chance (eighth pass)

Goals used to steer her by place: "this room looks valuable", then work out something to do there. Now a leaf goal that needs an opportunity runs a **pursuit** (`engine/src/pursuit.ts`), stored on the goal as `g.pursuit`:

1. **Pick a specific thing.**
   - Kill: the target.
   - Cash: she weighs every option she knows about (a known bounty, a staff member who could use a hand) by expected value over time, with personality in the sum (courage, justice and thrill favour paper; honesty and kindness favour honest work). Sharper heads pick more greedily; hasty ones more randomly. With no options she asks a tipster, and with none of those the goal's generic pull applies.
2. **Search.** `search` (don't know where), `approach` (on the way; the route is a committed target and not a sum of every place that looks valuable), `assess` (he is in the room), `act`. A trail gone cold is dropped from memory and she looks somewhere new.
3. **Size him up** (`assessFoe`). Odds come from the real fight maths (rounds to put him down against what he and his friends do to her meanwhile; calibrated against actual outcomes), her memory of who has beaten her, and her competence (noisier reads when low). The verdict:
   - `take`: go ahead.
   - `lure`: too many eyes; try to get him somewhere quiet (`lure` and `tail` now also serve bounty hunts).
   - `wait`: she's hurt.
   - `prep`: too much for her. Kill goals go and get a better weapon; a bounty is written off for ~90 beats and she picks another.
4. **Bias.** The verdict decides which actions on the target are boosted. While a particular score is in mind, the generic scramble-for-money pull is cut to about a third.

Related changes: goals count the room she's already in (so she doesn't leave one that holds what she wants for one that holds a bit more); goal pulls fade while she's hot; an idle, broke hero decides to do something about it sooner; NPD drones can't kill her on the street.

**Why goals were not getting finished (found after the first pursuit pass).** In "assess / take" she had decided she could beat him and he was in the room, yet she struck on only 1% of those beats: the discretion system's reluctance to fight in view of people (about 8 points on average) cancelled the goal's 4.5 push, so she stood about chatting. A decision to act is now final: with a `take` verdict the pursuit gives back her reluctance. If the room is too watched to do it quietly she waits for it to thin out or for a quieter spot (the `lure` verdict, up to ~18 beats) and then goes loud. Kill goals completed per night went from about 1.7 to 2.8 and gave-up goals from 1.6 to 1.0.

## Procedural weapons (ninth pass)

Weapons are rolled, not listed (`engine/src/weapons.ts`). A weapon is a **class** (knife, blade, club, whip, gauntlet, pistol, SMG, shotgun, rifle, energy), a **tier** (how good it is for its price), and up to three **traits** bought out of its base damage:

| trait | what it does |
|---|---|
| crit chance / multiplier | bigger hits now and then |
| armor-piercing | takes points off the target's plating (foes' armor items now soak damage: half their armor value per hit) |
| noise | 0 is silent, 1 is a gunshot. Noisy weapons make witnesses notice and add police heat; quiet ones don't |
| armor | extra armor while it is in her hand |
| vs-type | damage multiplier against robots, cops, gangers, corps, augmented people, bosses or dragons |
| stun | chance per hit that the target loses its next attack |
| burn | chance per hit that the target keeps taking damage for a few rounds |
| skill bonus | +1 to +3 on a skill (melee, marksmanship, sneak...) while it is wielded |

Weight is recorded for when encumbrance exists. The named classics (`ITEMS`) still exist; they get plain defaults. About a quarter of what people carry is still the classic, the rest are rolled variants of the same kind and tier, so loot is procedural too.

`rating(item, foe?)` puts a weapon on one scale (base damage plus what its traits are worth; against a particular foe the relevant traits count in full). Everything that used to compare `weapon.power` now compares ratings: equipping, shopping, the "better weapon" goal, prep for a fight, win odds.

**The shelf.** The gunsmith has a generated shelf per night (`world.arsenal`), turning over every 90 beats (some stock "sold to somebody else", which she notices if she had her eye on it). Each restock includes a step up on whatever she is holding, a sidegrade at about the same tier with a trait she lacks (aimed at her current quarry's kind, when she has one) and some random stock. So there is always something better in some regard, and upgrades are incremental.

**In a fight** she picks, from what she is carrying and has ammo for, the weapon that suits the enemy in front of her (her usual one gets the benefit of the doubt), and the log says so when she swaps or when a crit, stun or burn lands.

## Idle goals: fame, money, dragons

She is meant to be about three things: **getting famous, getting rich, killing cyberdragons.** When she has no goal at all (including at the start of the night) she picks one of the three, weighted by personality (fame, vanity, artistry; greed and being broke; courage, justice, thrill). Beats with no goal at all fell from about 31% to about 1%.

- **Fame** (`fame` goal): the pursuit picks an act (karaoke, DJ set, gig, billboard, graffiti, busk, parkour) by what she expects it to earn her fame, learned from experience, and her taste for it; goes to its venue and does it. If she gets there and can't go on she writes it off for a while and tries something else. Saturation does the limiting: repeated acts earn less, and what she has learned they are worth falls with them.
- **Money** is the `cash` goal with the bounty and odd-job pursuits already described.
- **Dragons** (`dragon` goal): flights can't be found, only waited for, so she **scans the skies** outdoors (each scan makes a flight likelier; a beat spent looking). When one arrives she sizes it up with the fight maths and either engages, hides, or goes to get something that works on dragons (a weapon goal aimed at the Apollo, so vs-dragon and vs-boss traits count). A scout's warning is a head start when she is ready, not a reason to hide. When she thinks she can take the Apollo she switches to that and goes to the Overpass.

## Crowds, callings, and more to do with a voice (tenth pass)

**Crowd fatigue** (`engine/src/stage.ts`). Every performing act wears out the crowd *for that skill* at that place (a bit less for her other skills there), and it recovers slowly with time (about 250 beats from fully worn out). Fame from an act is scaled by the stage (clubs 1.5, bars 1, the street 0.8) and by how fresh the crowd is; tips shrink too; and a worn-out crowd puts her off doing it again right there (a sharper head notices sooner). The way out is a different venue, a different act, or a bigger stage. No cooldowns: it's the audience that is finite. Billboard hijacks and graffiti keep their own saturation.

**Callings.** A real showing (a big win from someone with at least some skill in it, or a level in the skill) can light her up. Her chance depends on artistry, fame, impulsiveness and how good she already is. While it lasts (`mind.passion`: a skill and a level, cooling with time, fed by good showings and starved by flops):

- every act built on that skill appeals to her (+2.2 x level);
- her fame goal becomes a calling ("become a superstar vocalist", "become a guitar legend", ...), or one is formed;
- the fame pursuit weights acts of that skill threefold, and everything else down, so the run has a shape; the venue freshness and stage terms pull her to somewhere new when a crowd is spent;
- practice breeds appetite: act choice also scales with her level in the skill.

**New acts** (all with their own odds, skills and consequences; none usable on someone she's already close to: world-state limits, not timers):

| act | skill | where / who |
|---|---|---|
| sing on the street (`sing_busk`) | singing | anywhere outdoors, no instrument needed |
| crash a gig (`crash_gig`) | singing | the DJ at the Neon Pharaoh or the band in the green room; can end with her thrown out |
| serenade someone (`serenade_girl`) | singing, romance | a romanceable girl in the room; builds affinity, stirs her appetite |
| guitar duel (`guitar_duel`) | guitar | band members, with a guitar to hand |
| set for the kids (`backlot_set`) | DJing | the lot behind the club, street kids present |
| beat battle (`beat_battle`) | beatboxing | rowdy regulars |

Known thin spots: guitar and DJ branches are gated (she has to find a guitar, kids have to be around), and art/other skills have one or two acts each. The framework (`ACT_SKILL`, `FAME_ACTS`, `CALLING`) takes new acts without other changes.

## Hustles without cooldowns (eleventh pass)

The ten hustles used to be throttled by timers (18 to 140 beats since she last did it to that person). Each is now limited by something that is true about the world (`engine/src/hustles.ts`, `tickHustles` once a beat):

| hustle | what limits it |
|---|---|
| odd jobs | staff have a stock of chores (2 or 3). Doing one uses it up. A place makes more work the busier it is, so the Halo on a crowded night has plenty and a quiet shop almost none |
| security shift | open shifts on the club door (1, max 2); a shift fills one, and new ones open while the club is crowded |
| courier run | a fixer or dealer has parcels waiting; shipments bring more slowly; nobody hands her a package while the NPD is on her (heat 4+) |
| bodyguard gig | only for someone who actually needs an escort: patrons and girls come to need one at random as the night goes on, and the need goes when she does it |
| burglary | she has to know where the mark lives first: from going home with them, or from an address scanner implant. Then the dwelling is put on the map if it isn't already (growing the city out to a street a few blocks away; capsule hab, flat or penthouse by what the mark can afford), she walks there by the streets (muggers or the local gang might jump her on the way), and the job happens inside it. Caught means the fight is in the home with nobody else joining; either way she ends up on the street outside. The house has to have something in it (cash 60+), the victim is poorer, and she only robs a place once |
| protection | the shopkeeper's till empties as she takes from it and fills from takings (faster in a busy shop) |
| scam / fake goods | a mark falls for it once. The room also hears about it (`location.wary`), which makes the next one harder and, after a few, not worth trying; that fades |
| fortune-telling | the same person pays half as much the second time and won't pay a third time; the room tires of it |
| odd requests | only people who actually have a favour to ask, which they come to have at random |

Because nothing is on a clock, she can do two chores for the same boss back to back if there are two to do. Competent heroes do fewer odd jobs per night than before (about 24 versus 32) and hustle income fell a third; goals and deaths over 300 nights are the same.

## Tactical fights (twelfth pass)

Every fight is now played out on a small grid. The player never sees the board: they get the usual start and end lines plus up to five moments worth telling (`tactics.ts` `highlights`). Callers of `fight()` and its `FightResult` (`win | flee | tossed | arrested | dead`) did not change. `fight()` in `combat.ts` sets the stage (who is here, who turns up late, who saw it) and settles up afterwards (loot, XP, heat, injuries, where she wakes up); the middle is three modules:

- **`grid.ts`: the board.** 4x4 to 8x8, generated per fight from the kind of place (a home is 4x4; the Overpass is 8x8 with hazards; a tunnel is a long thin 8x4). Tiles: `floor`, `wall` (blocks movement and sight), `cover` (blocks movement; shots pass over, but the person behind it is harder to hit), `hazard` (passable, costs double to cross, hurts whoever ends a turn on it), `exit` (a door on the edge). Eight-way movement; distance is Chebyshev. The generator guarantees every walkable tile can reach every exit. Crowded rooms get an extra piece of cover.
- **`techniques.ts`: what a unit can do with its action.** A technique is data plus two functions: where it reaches, what it is worth from where you stand (`value`, in the same units for everything, so a shove can be weighed against a shot) and what it does (`run`). Adding a way to fight is adding an entry to `techniquesFor`. Today Blackbird has: **attack** (reach comes from the weapon: knives and fists 1, whips 2, pistols 5, shotguns 3, rifles 8, with accuracy falling off over distance and a quarter off against someone in cover); **throw** (the old pre-fight lob, now a range-2-to-4 action); **ambush** (a melee strike at someone who hasn't noticed her: 1.8x plus sneaking, ignores armour, never misses); **shove** (into a wall or a person for damage and a stun, onto a hazard for more, out a door to be rid of them); **hack** (robots and augmented people lose their next action and 3 power for the fight; hack stat and tinkering decide whether it takes); **intimidate** (a scared person runs for the door; intimidation, level difference, fame, and how the fight is going decide); **overwatch** (a free shot at the first enemy to walk into her sights); **mantis-blade flurry** (implant); **leap** (hydraulic calves, across the room ignoring terrain). Everyone also can **dash** (twice the movement, no action) and **leave** (step off an exit tile). Foes have the basic attack at the reach of whatever they carry (dragons and drones fly and shoot); allies have their own: the drone zaps from range, the hacker jams things, the scrapper-bot and pigeon stand near her and soak part of each hit.
- **`tactics.ts`: the sim.** Each round everyone acts in initiative order (reflex, level, speed, noise; if she jumped them she goes first). A unit's turn: look at every tile it can reach (and a sprint's worth, and a leap's worth), every technique it could use from each tile on each target in reach, and score each pair as `value of the action + value of the tile - move cost`, where the tile is scored by danger (every enemy who could hit it next turn, weighted by their chance, cover, and how much of this unit's health it would take, scaled by caution which rises as it gets hurt), how well it closes or keeps a gap, and hazards. Pick the best with a little jitter. There is no player input, so Blackbird, her allies, and the other side all use this one routine; the only differences are their stats and techniques.

**Fluid fights.**
- **Retreat is physical.** When she is hurt enough she commits to running (same threshold and roll as before) and walks to the nearest free exit tile; stepping off is the `flee` result. Someone standing on the exit blocks it, and enemies can cut her off; if she can't reach any exit she keeps fighting. A broken leg slows her by one tile instead of forbidding it.
- **Enemies flee too.** A foe who can (not robots, dragons, bosses, cops or security) below about a quarter health, more likely the more of their friends have fallen, or one that was intimidated, runs for an exit. They are counted as having got away: no loot, half the XP, they stay off the board for 15 to 30 beats and remember (`fled from Blackbird`). A shove can also throw them out the door. Fight reports say how many got away.
- **People turn up late.** Bystanders who join in and anyone who intervenes against a fight she started (police, security, the victim's kin) are no longer added at the start: they come through an exit on round 2 to 5 (the report says so). Same-faction friends of the other side who are in the room may also wade in from round 3 on, once their side is losing (at most two). If the fight is over before they arrive, they never got involved.
- **Allies are people on the board.** Their own HP, their own targeting. Foes are after Blackbird first (a hit on an ally is judged against her health, not theirs, and counts half), and a downed ally comes round at 1 HP except in a deadly fight, where it's a 40% chance they're lost for good. This replaced the old flat assists and the post-fight random injuries; their power is no longer folded into hers (`heroPower(w, weapon, false)`).

**Balance.** Power numbers, armour, weapon traits, accuracy-by-skill and the escape thresholds are reused, so win rates against the same opposition land close to before (street thugs still lose; three Artemis dragons still send a level-6 Blackbird running about 70% of the time). Ambushes only happen when she started it and reaches them before they notice (they notice by the end of round 2); fights she is jumped into start with the other side close. A fight costs about 4 to 15 ms on a busy board.

**Reporting.** The sim records a log; the five heaviest entries (reinforcements, thrown-out foes, ambushes and slams, a hack, a retreat, an ally going down, a throw, a crit/stun/burn proc, an ally assist, a weapon swap...) are emitted in order between `fight_start` and `fight_end`. New event types: `tactic` (variants `ambush flurry slam hazard_shove hazard hack intimidate overwatch leap retreat`), `foe_flees` (`ran scared thrown_out`), `reinforce` (`law backup`), `ally_down`.

Possible next steps: foes with techniques of their own (a dragon's sweep, a bouncer's grapple), per-weapon techniques (a shotgun's cone, a whip's pull), terrain you can interact with (shut a door, kill the lights), teaching allies tricks, and pursuit across rooms (a fleeing enemy followed out the exit by the next fight).

## A world that fills itself in (thirteenth pass)

The end goal: the map is generated as Blackbird explores, the world and its people persist across runs, and almost nobody is hand-written. This pass lays the foundation for the people. Nothing about the current night changes; the hand-built Rusty Halo district is the seed everything else grows from.

### Decisions
- **People persist across runs, and so does the map.** A run resets Blackbird (hero, heat, goals); the population, factions and generated places stay. Dead stays dead, and the dead stay referenceable (a kill in run 3 can matter in run 7).
- **NPCs remember previous runs.** In fiction she is a personality backup rebuilt in a new body, which is weird even for Neo. Whoever knows she died is confused she's back; whoever doesn't thinks nothing happened. So "does this NPC know she died?" is state on the NPC, not a global.
- **Time is an in-game clock** (`clock.ts`, world minutes), advanced a little each beat and by more when something takes time (fights, odd jobs, sleeping). It is not locked to the wall clock. When the player is away, `catchUp` converts real time into world time at a slower rate with a ceiling (about 5 world days for a night away, 7 at most). Nothing is simulated for the gap.
- **Nobody off-screen is simulated.** An NPC with haunts has a position that is a pure function of (world seed, who they are, the clock) (`movement.ts`), so a ten-minute absence and a ten-day one cost the same and two observers agree. People are settled when Blackbird arrives somewhere and pinned where she left them when she goes.
- **The narrative only reveals what's relevant.** History and wants exist as data but surface in text only once she learns them (the `Mind.bounties` pattern, generalised) or when they change a scene. Generation is lazy (deepen on relevance); reveal is gated by what she knows. These are separate.

### What exists now
- **Population store (`population.ts`).** The only code that moves an NPC or adds one. Indexes by location and by haunt, built lazily and never saved, so a world loaded from JSON rebuilds on first use. `Npc.locationId` is `readonly`, so the compiler stops anything else writing it. `npcsAt` no longer scans everyone.
- **Places describe the people they need (`roster.ts`).** `ROSTERS` maps a place kind to slots (role, count range, chance, minimum security, faction source, bystander or resident). `populate(w, loc)` fills a place the first time it matters. Each slot-member has a stable id (`bartender@roadhouse.0.0`) and its own random stream, so the same place always gets the same people whatever order the world is explored in, asking twice makes no twins, and the dead aren't rerolled. A vacancy can be filled by someone already in the world and currently off the map (`AWAY`) before anyone new is made. `relocate` populates on arrival.
- **Factions are records (`factions.ts`).** Standing between factions, place influence (which factions lean on a place, inherited from neighbours when a place is generated), and a default opinion of one NPC for another that comes from faction standing, so nobody stores an opinion of everybody.
- **Clock (`clock.ts`)** and the new `Npc` fields (`home`, `haunts`, `routine`, `settledAt`, `ephemeral`, `authored`).

### The persistent world store (`universe.ts`, `store.ts`)
The engine still plays a night on one in-memory `World`. That `World` is now defined as two halves glued together, and the split happens only at the edges.

- **Universe** (persists): `worldSeed`, `clock`, `npcs`, `factions`, `locations`, `features`, and `legacy` (run count, the ledger of deaths, and who she is: personality and real name, because the backup restores the same person into each body). **Run** (resets): hero, mind, heat, arsenal, situation, flags, counters, beat and the rest. Both types are derived from `World`, so a new `World` field can't be added without choosing a side.
- **`newUniverse(seed)`** builds the hand-made district. **`beginRun(universe, opts)`** starts the next night in it: the clock jumps to the next evening (at least six hours on), everyone alive is healed and un-hostiled, locations and features lose their per-night state, bounty guarantees are topped up, and the room she wakes in is settled and populated. **`endRun(world)`** records a death, forgets throwaway fighters nobody remembers, and sends companions and strays home (or off the map, if they have no home, so they can be cast elsewhere). `beginRun` takes the universe over rather than copying it.
- **Everything derived from the world uses the world's seed, not the run's.** People, rosters and where wanderers are at a given time are the same in every run; only luck (the night's random stream) varies.
- **Death.** `recordDeath` writes a `DeathRecord`. Everyone present saw it. The crews of whoever she was fighting hear about it half the time (decided by a seeded roll, so it's reproducible). In a later run the first time such a person shares a room with her they react once (`revenant`), others who knew quietly update, and everyone else thinks nothing happened. Wider gossip waits for ties.
- **Saving (`store.ts`).** A `Save` is the universe plus the night in progress (if any) plus the real time it was written. It's plain JSON with a version number; unreadable saves are an error, not a guess. `resume` applies the time spent away to the clock (`offlineMinutes`) and settles the room she's in. `SaveStore` is the interface a Supabase backend will implement; `MemoryStore` is the test one. A saved-then-loaded night plays out identically to one that never stopped (tested).
- **Decisions that are easy to revisit:** graffiti resets each run (a TODO until its effects are per-piece); heat resets to zero (a day has passed); hidden exits she discovered stay discovered; the hero's knowledge (`Mind`) resets with her body.

### Romance is for everyone (`people.ts`, `bonds.ts`)
There is no `romanceable` tag any more. Blackbird is relentless: every woman in the game is fair game to her (`isFairGame`, the one place that decides it), whatever her age or situation. Whether it works out is the other matter, and it usually shouldn't.

- **Everyone is someone.** Every person has an `age` and a `gender`, rolled when they're made from a stream of their own (so adding traits never shuffles anyone else's dice). **Everyone is an adult: 18 is a hard floor** (`MIN_AGE`). Machines are `gender: 'none'` and out of it. The named cast has fixed genders; the rest roll by archetype.
- **"Street kid" is a young punk, not a child.** It's an archetype name; they're adults (18 to 26) like everybody else and in the running like everybody else.
- **How someone is wired (`Heart`).** Rolled the first time it matters, and stable: `loyal`, `content`, `spark` (does Blackbird do it for them), `clingy` (how fast a good night becomes "we're together"), and maybe a **partner** (about 18% of people under 25, 38% under 40, 45% beyond; a name, a kind such as husband or girlfriend, and years). Authored people can be flagged `single`.
- **Odds, not walls (`romanceMod`).** A partner drags the odds in proportion to `loyal` times how content they are; a big age gap drags a little; spark and an existing bond nudge up. Nothing makes it impossible. She doesn't need to know someone's taken to try, and when she does it only weighs on her by how much conscience her personality has (`scruples`).
- **Two ledgers (`Feelings`).** `Npc.bond` is how *they* feel about *her*; `Mind.bonds` is how *she* feels about *them*: a stage (`interest`, `fling`, `seeing`, `together`, `ex`), an ardor, nights together, when it started and when they last met, and how it ended. They advance by different rules: they by `clingy`, she by `romantic`, so she can call it a fling while they say "girlfriend" or the reverse. The first time they disagree, they say so out loud (`dtr`), once. A woman with a partner is capped at an affair until she leaves them.
- **What she can do about it.** `poach:<id>` (talk a taken woman into leaving; odds from `leaveOdds`; a partner in the room may fight), `reconcile:<id>` (get back with an ex who still matters, or whom she does), `break_up:<id>` (when it has gone cold). Flirting, kissing, dates and nights all feed the ledgers (`bondEvent`).
- **Things happen on their own.** Absence cools both sides (applied when they next meet, using the world clock). A cold stretch ends it (`drifted`). She ends it if her own ardor dies. Being seen kissing someone else can end it (`caught`). After a night with someone's partner there's a chance word gets back and **the partner turns up**: a fight, she goes home with them, or she dumps them on the spot (`partner_arrives`). The partner is made into a real person when they arrive.
- **Across runs.** `Npc.bond` persists with the person; `Mind.bonds` resets with her body. So a lover from a past run greets her warmly and she has no idea who they are (`recall`, once), and an ex remembers every detail she's lost.
- **Not yet:** exes who pursue her, partners who are in the world before they arrive, anyone but the hero being in love with anyone, same-night rivals beyond the existing jealousy rule, and a way for her to *learn* the state of a relationship other than the events.

### Pronouns for the people in the text (`pronouns.ts`)
The text says "he", "she" or "it" for the person it's about, and "they" only for groups, for non-binary people, or when it genuinely doesn't know. Templates write tokens in the line, not words: `{they}`, `{them}`, `{their}`, `{theirs}`, `{themself}` (capitalise for a sentence start: `{They}`), and for agreement `{s}`, `{es}`, `{is}`, `{has}`, `{was}`, `{does}`, `{doesnt}` (so `{They} think{s}`, `{They} {is} calm`). They refer to the event's `npc` by default; `{their:victim}` or `{they:foe}` name someone else. The engine tags each event with the gender of the person named in `npc`, `npc2`, `victim`, `foe`, `target` and `owner` (as `npc_g` and so on) when it's emitted, looking the name up in the population index. If it can't tell (a group, a name that isn't a person, a bare event in a test) the tokens fall back to the plural "they". A test fails if any rendered line has a token showing, or if a template uses a token that doesn't exist.

### People have depth (`character.ts`, `ties.ts`, `facts.ts`, `deepen.ts`, `knowledge.ts`)
Most people are somebody she saw. When one starts to matter they're **deepened** (`ensureDeep`): they get a character, some facts and a few ties. Triggers: she talks to them, flirts, fights them, asks about them, hires or is hired by them, or someone she knows is their friend. Throwaway fighters (`tmp_`), machines and animals never are. Everything is rolled from who the person is, so it comes out the same whenever it happens.

- **Character.** Ten of the hero's own traits (temper, courage, kindness, greed, honesty, loyalty, grudge, sociable, curiosity, mischief), 0 to 1 with 0.5 unremarkable, shaped by the job but still varying (a bouncer is braver than a dealer on average; individuals differ), plus a quirk written with pronoun tokens. It's worked out on demand and stored only on deepening. It already shapes how bystanders react to a fight (the brave step in, the timid run, the kind don't cheer) and how freely someone talks.
- **Ties.** A sparse, directed graph: kin, friend, rival, crew, boss, partner, each way with its own regard. No tie means the factions' default opinion. Ties can point at **stubs**, people who exist only as a name, age, job and faction in someone's life (a sister, an old partner, someone they're looking for); `materialize` turns a stub into a person and every tie and fact follows. A partner is a stub too, and is the person who turns up when word gets round. The named Halo cast has hand-written ties.
- **Word gets around** (`spreadDeed`). When she kills, hurts or helps someone, people who care about them feel it in proportion to the tie: friends turn on her, their rivals warm to her, family hears second-hand and fainter. It's remembered and comes up as a **recognition** line. Whoever loved the victim most can become an **avenger** and come looking. The news of her own death travels the same way, along who loves whom.
- **Facts.** Typed, not prose. History: ex-member, owes, veteran, lost someone, arrested once, was somebody. Wants: money, revenge, out, to find someone, peace. Each has a **visibility**: *visible* (she can notice it), *overheard*, *asked* (told if she chats or asks), *secret* (only the fond tell it, or a price). The named cast has hand-written facts.
- **She only knows what she's learned** (`Mind.known`, reset with her body). The text says nothing of a fact until she finds it out, and then says it once, with how: saw it, was told, overheard, bought it, or got it as gossip from someone who knew them. Facts, ties and stubs are the world's and persist across runs.
- **Facts as hooks.** `buy_info` (pay a dealer, fixer or prophet for something unknown about them or their circle). **Contracts**: someone who *wants revenge* will pay her to settle it, once she knows. She takes the job as a kill goal, and the client pays when she beats the target; if the client's gone, the money isn't. The other wants are narrative and feed gossip for now.
- **Not yet:** wants that act on their own (a person who wants out actually trying), debts that come due, stubs being cast into newly generated places on purpose, ties shifting with time, and NPC-to-NPC events.

### Not built yet
1. **NPC wants that act.** Wants beyond revenge contracts don't yet make anyone do anything on their own.
2. **Stubs cast into new places.** `populate` doesn't yet prefer to materialize a stub that fits a vacancy.
3. **Active movers.** Targets, pursuers and companions move beat by beat; everyone else is settled lazily. People currently don't walk in or out while she stays put.
4. **Long-absence life events** (changed faction, moved district, died) for gaps of days, and archiving of far-away ephemeral people (hot/warm/cold tiers).
5. **Gossip about her past runs** along ties, instead of only witnesses and the killers' crews.
6. ~~**Map generation** feeding `populate`.~~ Done; see "The city grows as she walks" below. Still open there: features (the till, the dumpster) for generated places.
7. **Idle catch-up of the night itself.** Away time moves the clock, but a night in progress doesn't play itself forward (the hero AI fast-forward is a separate piece).
8. **Scale of the store.** A universe is one JSON blob today; at thousands of people it needs region-by-region loading.
9. **Hot scans.** Several systems still scan every NPC each beat (`tickHustles`, goals, pursuit tip-offs). Fine at 45 people, not at thousands; they need to ask the index.

## The lab loop (fourteenth pass)

The roguelite half of the game. Blackbird dies; she is rebuilt in the lab; you spend what she managed to put aside on upgrades; she goes out again. The first night starts straight in Neo; every night after starts from the lab screen.

### Money that survives
- **Pockets die with her; the account doesn't.** `hero.cash` is lost when she dies, except for a share she'd insured (the `keep` perk). A night she survives (`dawn`, `victory`) she carries everything home. `settleAccount` (called by `endRun`, once per night) does the books and writes a `RunReport` to `legacy.report` for the lab to show.
- **Drop points** (`content/drops.ts`, `bank.ts`). Eight hand-placed features across the district (a hollow brick in the alley, an Ironvault ATM, the club's coat-check, a milk crate, a pigeon coop...). Standing at one with a pile, `deposit` is offered as an ordinary candidate and she also gets a pull toward adjacent rooms that have one (`bankPull`, like the shops). It deposits everything above a **float of 20nd** and takes a **cut**: 25% base, plus/minus the place (the ATM is friendly, the club is greedy), minus the Treasury's fee upgrades. She doesn't count her starting purse toward the pile, so the starting-cash upgrades aren't taxed. How keen she is scales with the pile, her competence and the `bank` perk; a clueless hero banks too (about 60% of nights bank something at competence 0.1).
- **Interest** is a perk, capped at 500nd per rebuild so a fat account is not a printing press.

### The trees (`content/tree.ts`, `lab.ts`)
258 nodes / ~650 purchasable ranks in 10 branches, all data. Each branch holds **lines** (a row of nodes you walk along) and a node needs the one before it in its line plus, sometimes, nodes in other lines (`id` or `id:rank`), so the thing is a web and not a ladder. Prices rise per rank; a cost-sort of lines: universal things are dear, niche things cheap.

| Branch | What it is |
|---|---|
| Chassis | HP, reflex/muscle/hack/charm, plating, a shelf of black-market chrome (incl. the defib), the Cyberknight capstone |
| Firmware | competence, XP and skill growth, flaw management (turn a trait down, never to zero), "lean into it" (turn one up), the Hero Protocol capstone |
| Treasury | starting purse, drop-point fees, banking habit, estate (death insurance), interest |
| The Lab | start levels, bench discounts, spare med kits and stims, the Perfect Rebuild capstone |
| Arsenal | a ladder of starting melee weapons and one of guns (with ammo), ammo locker, weapon drills |
| Stagecraft / Brawl / Ghost / Charm / Hustle | one four-node line per skill (Quick Study, Head Start, Prodigy, Master), plus group-wide lines and crossovers that need two skills' worth of work |

Some are good every night (reflexes), some are for a very specific Blackbird (beatboxing grows faster, and costs well under half what a melee line does).

**Effects** are `Fx` values. Most are applied once, when the body is printed (`applyUpgrades`, from `beginRun`): stats, HP, levels, cash, competence, skill levels, kit, a better starting weapon/armor, implants (up to four), and personality nudges (applied to the hero's copy; the backup in `legacy.personality` is untouched). A few are looked up during the night with `perk(legacy, id)` and `growthPct(legacy, skill)`: skill growth (`train`), XP (`gainXp`), healing (`useMedPack`), the drop-point cut, and the bank habit.

### Persistence
`legacy` gained `account`, `upgrades` (node id -> ranks) and `spent`; `World.stats` gained `deposited` and `fees`. `UNIVERSE_VERSION` is 2; `deserialize` brings version 1 saves forward (`upgradeUniverse`: adds the account and the drop-point features). The UI saves the universe to `localStorage` whenever she is in the lab; `?seed=` / `?world=` still start a replayable night in a fresh world.

### The screen (`components/Lab.tsx`)
Balance, last night's books, ten branch tabs, each line as a row of cards with ranks, effects, price and what it still needs; a search across all nodes and an "only what I can buy now" filter; and a live preview of the body she'll wake up in and the money perks. Buying is immediate. There is no refund.

### Balance notes
At a typical competence, a night is worth a few hundred neodollars banked (a good one over a thousand), against a full tree that costs about 390k, so the early game is a slow trickle of cheap nodes and the late game is long. Greedy-buying the universal lines for 25 nights took a competence-0.1 Blackbird from 90 to 158 HP and 0.10 to 0.19 competence; she still mostly dies. That is the point of the long tree, but the Firmware and Chassis prices are the first knobs to turn.

## The city grows as she walks (`mapgen.ts`)

Neo is no longer a fixed map. The hand-built Rusty Halo district is the **seed**: a start-of-game home block with its story in it (the dragon, Madame Zero, Helix). Its edges open onto the rest of the city, and everything past them is made up as Blackbird gets there, then saved with the universe, so the map is the same in every run and after every death. The same save always grows the same city.

- **Sketch, then expand.** A place is *sketched* when the place next to it is expanded: it gets a name, kind, security, cameras, crowd, a blurb, an influence mix, a faction if it has an owner, and one exit back to where it came from. A place is *expanded* the first time she arrives (`relocate` calls `expand`): it grows its own neighbours. So the map is exactly one step wider than anywhere she has been, every exit she sees leads somewhere with a name, and nothing past that costs anything. `Location.gen` records where a generated place came from and whether it's been expanded; hand-built places have none.
- **Ids say where a place is.** A child's id is its parent's plus the slot it was born in (`street_main~0`, `street_main~0.2`). Every attribute of a place comes from a stream seeded with the *world seed and that id*, never the run or the order of exploration. So people cast into a place by `populate` (`bartender@street_main~0.2.0.0`) are the same people however the city was found. Tested: two explorers who find a place in different orders see the same place.
- **What grows from what.** *Streets* are the spine and never end: each has two to four lots and one or two ways further on. Lots depend on the **district** (market, nightlife, tenement, industrial, corporate, slum); districts persist along a road and sometimes turn into a neighbour. *Buildings*: shops and flats are a single room; bars may have a back room (guarded, sometimes hidden until a scout or a stumble finds it) and a cellar; clubs a guarded VIP lounge; corporate buildings a lobby and one to three floors, each more secure and guarded. *Tunnels* run on for a stretch and come up in a street somewhere else. Back rooms, floors and VIP lounges inherit the parent's owner and raise its security; being thrown out puts her on the nearest street.
- **Owners are factions.** Shops belong to the shopkeepers, corporate buildings to Atlas, and each generated bar or club gets a faction of its own (`v:<id>`, kind `venue`) so its staff are on one side. Streets lean towards gangs through the existing influence inheritance (thinned from the neighbour, with the odd stranger's tag), and a street that's mostly one gang's becomes its turf.
- **First sight.** The first arrival at a generated place adds its blurb to the log (`go` event `blurb`), so each new street gets a line of its own.
- **Saves.** `UNIVERSE_VERSION` is 3. Older saves are upgraded on load: `seedFrontier` opens the hand-built district onto the city (it's idempotent, it only adds what's missing).
- **Not yet:** features for generated places (`Feature`s are keyed by kind and there is one of each, so a generated dumpster or till isn't possible yet); stubs preferred when filling generated vacancies; region-by-region loading when a universe gets big.
- **Loops.** The generated graph is a tree plus shortcuts. When a street is expanded and has two roads leading on, they're joined by a cut-through 70% of the time; neighbouring shops, bars and clubs along it share a side door 25% of the time, and 40% of those are concealed (hidden both ways until she finds one, like any hidden exit). Links are made at the moment the parent expands, between places that already exist and from the parent's own stream, so they're the same whichever end she finds first. They're two-way and never doubled. Tested in `maploops.test.ts`, which grows streets directly with `expand` and runs in about a tenth of a second.
