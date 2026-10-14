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
