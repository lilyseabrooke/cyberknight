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
  - **Clock time vs beat time.** There are two ways to measure time. **Clock time** is the in-game time (`clock.ts`, world minutes). **Beat time** counts actions (beats). They are not proportional: some beats last a few seconds and some last hours (a fight, a night's sleep, an odd job). **Default to clock time** for anything that takes place over time (cooldown-like decay, stock turnover, how long a heat, grudge, effect or absence lasts, a deadline). A "N beats" duration has a wildly uneven real length, so use beats only for a good reason: it is genuinely about the number of actions (a count of tries, rounds, steps or things done), or the rule should feel the same however long each action took. Older "N beats" figures in these docs are mostly that default not yet applied.
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
- **Events nest.** An event can open a group (`id`), and whatever is emitted inside it carries `in: <id>` (`Ctx.nest` / `nested()`). Two things use it: a candidate with an `intent` opens an `intent` line ("Blackbird challenges Tiny to arm wrestle") with its outcome told underneath, and every fight is one group opened by `fight_start` (who saw, then the standout moments and a `fight_round` line for each round, then `fight_end`). The sim resolves a whole fight inside one beat; the log viewer plays a group back one line at a time (and holds the status panel until the beat's last line) so a fight can be watched unfolding. `depths()` gives each event's depth for any other reader.
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

About 27 skills across music (music, singing, guitar, DJing, beatboxing), aim and combat (pool, throwing, shooting, melee, athletics), stealth and tech (sneaking, perception, sleight of hand, lockpicking, tinkering), social (romance, dancing, intimidation, streetwise, haggling, cards, animal rapport) and crafts (drinking, mixology, cooking, first aid, graffiti).

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

Cyberdragons are Atlas "protection" platforms, in several models that behave differently:

| Model | Behavior | Role in the sandbox |
|---|---|---|
| **Apollo Mk. II** (CINDERJAW) | Stationary boss on the Kowloon Overpass | The gate off the starting district: its lockdown cordon stays up until it dies, and then stays down for good (`legacy.gate`). Brutal; beatable with allies, gear, a good build and dragon intel. See [`PROGRESSION.md`](PROGRESSION.md). |
| **Artemis Mk. I** | Roaming patrol flights of 1-3 over the outdoor districts | A competent Blackbird (power ~35+, healthy) beats a lone Artemis essentially every time. Packs of 2-3 are the real threat: they make her run or die. Kills drop wing plating/scales and give fame. |
| **Hera Mk. V** | Rare once-per-night fly-through (~10-20% of nights) | Effectively unkillable: it kills any plausible Blackbird in a round or two, and even a level-45 hero dies 90%+ of the time. The point is how she reacts. |
| **Hermes Mk. I** | Courier flyby of 1-2 (grade 8) | Weak, skittish. If it spots her first it fines her for not being home. |
| **Hermes Mk. III** | Express courier (grade 30), always carrying something valuable | Speed 12, so she can chase it and never catch it; effectively unkillable until she is faster or has a vehicle. Never notices her. |
| **Demeter Mk. I-IV** | Roams outdoors demanding a tithe (grades 14-50) | The "bounty" dragon. It is always winter: it announces the summer distribution and then collects. She can pay, haggle or refuse; refusing, or saying nothing for three beats, is a threat to public security and it shoots. Killing one pays out its purse. |
| **Artemis Mk. II** | Hunts high Atlas heat (grade 22) | Notices her much more easily, hides less well, and follows her from place to place at its own speed. |
| **Ares Mk. II** | Gang buster (grade 28) | Raids places with gang activity and accuses everyone present of being a ganger, whichever gang. It can turn on her too. A raid leaves the turf less gang. |
| **Ares Mk. IV** | Gang buster (grade 48), after repeat raids on a place | Faster than she can run from. It screams 2-3 beats before it lands: the sign to get indoors and stay there, unless she means to take it. |

**Speed is a stat** (`engine/src/dragonmodels.ts`), on the fight board's scale (tiles per round; Blackbird is 3-7, `heroSpeed`). It decides everything about keeping up: a tracking dragon makes up ground on her by its speed against hers over the time that passes; she can only run down a `swift` dragon if she is faster than it; and she can't flee a `relentless` one that is faster than she is. When vehicles and real hero speed land, `heroSpeed` is the only thing that has to change. See [`DRAGONS_PLAN.md`](DRAGONS_PLAN.md).

**Dragons roam a district** (`engine/src/dragons.ts`). A dragon (except Hera, who hangs over wherever she is) is a world-level `Flight` in `w.flights`, not an event on top of Blackbird. It **flies in** at the edge of the open streets round her (a `dragon_flight` event), goes through **the pattern of its kind** at its own speed, **takes off** (`dragon_depart`), and is **forgotten** once it is far enough from her. While it's about she hears it from the next street over (`dragon_near`), it turns into her street (`dragon_close`) and she can deal with it as below, and it moves on. The patterns:

| Family | In the district |
|---|---|
| Demeter | A slow, methodical prowl that goes where the people and the unvisited streets are, takes a share from anyone it finds, and stays a couple of hours of world time. |
| Ares | Crashes about at random hitting whoever is there, whether or not she's watching; gets bored and leaves if 40 minutes pass without anybody to hit. A Mk. IV screams from the edge of the district first. |
| Hermes | Picks 3-5 streets in the district at random, delivers to each, and leaves at once. |
| Artemis | One quick sweep of every street; Mk. II goes for her instead, wherever she is. |

A district usually has one or no dragons in it, and a long visit (Demeter, Ares) and a quick one (Hermes, Artemis) overlapping is not unusual. She can **duck inside** when one is close, and her pathing treats a street with a dragon on it (or beside it) as risky. **Personality.** Each dragon has a temper, five dials from 0 to 1 rolled from its family's leanings (`FAMILY_TEMPER` in `dragonmodels.ts`; deterministic from the world seed and the dragon's id, and kept with a persistent one): **curiosity** (more stops, goes to streets it hasn't been to), **aggression** (hits people at random more readily; an Ares that is hot-tempered nearly always hits what it lands among, a calm one sometimes lets them be; a Demeter takes more), **territoriality** (past 0.6 it picks a spot where people are, stays there and goes for anyone who comes near, hero included, without waiting to demand anything), **patience** (stays longer, and an Ares waits longer before it gets bored), **alertness** (notices her sooner).

**A fast dragon can flash through** (Hermes Mk. III, `swift`): if it crosses her street between one beat and the next she never gets a chance at it, but she learns it was there and which way it went (`dragon_close` with `passing`, and `Roam.seen`). A slower one always stops where she is.

**Dying** (`engine/src/dying.ts`). People an Ares hurts past saving are not killed on the spot. They go down and die when the world clock reaches their time: sooner the worse the hurt (`timeToDie(severity)`, 10 to 120 world minutes). Nothing can be done about it yet, but `stabilize()` is the hook a medical skill will use to take someone off the clock. Anyone still dying when the night ends doesn't see the morning.

**Callsigns and the book.** Every dragon has a callsign like CINDERJAW's: its model, a number, and a name from its family's pool (`engine/src/content/callsigns.ts`): `ARES-237 "QUIET HOURS"`, `DEMETER-412 "FINAL NOTICE"`, `HERMES-806 "SIGN HERE"`. When she first sees one on a visit she's told its callsign, and it goes in `legacy.dragonLog` (its callsign, model, temper, how many times she has seen it, when, where, and how often she has fought it); the book carries from night to night and keeps the last 60. After that, a new dragon of the same model is now and then (40% of spawns, when there is such a dragon about) one of those again, with the same callsign and temper, and she is told she knows it (`dragon_recognized`: when she last saw it and whether they have history). A dragon she kills is marked and never comes back. Nothing about how they behave depends on this; it's only so they feel like they exist between nights. (`engine/src/dragonlog.ts`)

A flight can be made **persistent** (`Flight.persist`): it is never forgotten, goes away after taking off and comes back later, and is kept from night to night in `legacy.dragons`. Otherwise everything resets each night. `w.flags.quiet_skies` keeps all of them home, for a test that follows a night to see something else.

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
- Claude drafts the content; the author is happy to be surprised. Voice, humor level and samples live in `docs/TONE.md`; the setting itself (Neo, Atlas, the board, factions, naming, per-type content checklists) lives in `docs/setting/`. Reports interleave a neutral field-report voice with Blackbird's own cocky first-person thoughts.
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

## Idle goals: money, loot, dragons (and, rarely, fame)

She is meant to be about **exploring, fighting, collecting loot, earning money and levelling up**, not impressing people. When she has no goal at all (including at the start of the night) she picks money, a raid, or cyberdragons, weighted by personality (greed and being broke; courage, justice, thrill), with fame a rare fourth (it is mostly reached through a passion, not picked at random). Crush (romance) goals are rare too. Beats with no goal at all fell from about 31% to about 1%.

- **Fame** (`fame` goal): the pursuit picks an act (karaoke, DJ set, gig, billboard, graffiti, busk, parkour) by what she expects it to earn her fame, learned from experience, and her taste for it; goes to its venue and does it. If she gets there and can't go on she writes it off for a while and tries something else. Saturation does the limiting: repeated acts earn less, and what she has learned they are worth falls with them.
- **Exploring** (`explore` goal, aimed at a place she has never visited; ends when she gets there): rare on its own, with a per-beat chance that grows with how worn out her current room is (`interest` in `mind.ts`, the same novelty measure `restlessness` uses) and with curiosity. Mostly a **subgoal**: money (strongest), dragons and, a little, fame adopt one when what they know about is thin (few heist sites and dungeons, no dragon leads, few fame venues), because new streets reveal dungeon doors and new rooms reveal work and audiences.
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
| burglary | she has to know where the mark lives first: from going home with them, or from an address scanner implant. Deciding to do it puts the dwelling on the map if it isn't already (growing the city out to a street a few blocks away; capsule hab, flat or penthouse by what the mark can afford) and gives her a `burgle` goal. The trip is ordinary travel: the goal pulls her along the route and the engine reacts to the streets as it would for any trip. The job itself is offered at the door. Caught means the fight is in the home with nobody else joining; either way she ends up on the street outside. The house has to have something in it (cash 60+), the victim is poorer, and she only robs a place once |
| burgling a door | in an apartment block she's standing in, she can try the doors (3 per block, each a made-to-order home: capsule hab in poor districts, flats elsewhere, penthouses downtown). She listens first and may or may not learn whether anyone is in. If someone is and she heard, she moves on; if she couldn't tell and someone is in, they catch her and the fight is in the flat; an empty flat can still wake the neighbours (heat). The take is whatever's lying around, so it's riskier and smaller than a mark's place she knows is empty |
| home hazards | what a home keeps scales with its security, rolled once per home and then fixed. Guard dogs: BARK-100 (a toy, easily beaten), 210, 320, 430 (a hard fight she mostly loses) and 530 (no real chance for her as she starts); packs of up to two at the low end, singles at the top. Traps: a grenade on a string (security 0-1), a wired shock mat (2), a knockout gas vent (3), a sentry turret at 4-5 (a fight against something bolted to the ceiling). She may slip past sleeping dogs, back out of ones she can't take, or fight; she may spot and disarm a trap (hacking for turrets, lockpicking otherwise) or set it off |
| protection | the shopkeeper's till empties as she takes from it and fills from takings (faster in a busy shop) |
| scam / fake goods | a mark falls for it once. The room also hears about it (`location.wary`), which makes the next one harder and, after a few, not worth trying; that fades |
| fortune-telling | the same person pays half as much the second time and won't pay a third time; the room tires of it |
| odd requests | only people who actually have a favour to ask, which they come to have at random |

Because nothing is on a clock, she can do two chores for the same boss back to back if there are two to do. Competent heroes do fewer odd jobs per night than before (about 24 versus 32) and hustle income fell a third; goals and deaths over 300 nights are the same.

## Tactical fights (twelfth pass)

Every fight is now played out on a small grid. The player never sees the board: they get the usual start and end lines plus up to five moments worth telling (`tactics.ts` `highlights`). Callers of `fight()` and its `FightResult` (`win | flee | tossed | arrested | dead`) did not change. `fight()` in `combat.ts` sets the stage (who is here, who turns up late, who saw it) and settles up afterwards (loot, XP, heat, injuries, where she wakes up); the middle is three modules:

- **`grid.ts`: the board.** 4x4 to 8x8, generated per fight from the kind of place (a home is 4x4; the Overpass is 8x8 with hazards; a tunnel is a long thin 8x4). Tiles: `floor`, `wall` (blocks movement and sight), `cover` (blocks movement; shots pass over, but the person behind it is harder to hit), `hazard` (passable, costs double to cross, hurts whoever ends a turn on it), `exit` (a door on the edge). Eight-way movement; distance is Chebyshev. The generator guarantees every walkable tile can reach every exit. Crowded rooms get an extra piece of cover.
- **Learnable Hacks and Overrides (`techniques.ts`, `override.ts`).** Eleven more that Blackbird doesn't start with, gated on `hero.techniques` (`learnTechnique`; nothing grants them yet, a future location will). Hacks: *Gun Jam* (disarms), *Limb Lock* (locks an arm or leg of anything augmented or robotic, and slows it), *Pain Spike* (damage from her Intelligence, 1.4x on robots, and a stagger), *Rewrite* (a robot fights for her for 3+ rounds: `Unit.turned` flips its `side()`), *Hot-Wire* (a foe's getaway car won't start), *Overclock* (drone, hacker, puppy or scrapper allies hit 1.5x and move one further). Overrides, which are mostly non-combat: *Door Lock* (no one flees or arrives for a few rounds), *Lights Out* (guns and throws lose 0.2 to hit, for everyone), *Turret Takeover* (a turret fights for her for the whole fight), and two outside fights: *Power Cut* (a grid-wide blackout for 12 beats, so every camera is down) and *Alarm Spoof* (takes 2 off NPD and Atlas heat). Foes that have been turned count as stood down when the fight is won.
- **NPC stats and Analyze (`npcstats.ts`).** Everyone has muscle, reflex, intelligence and charm, rolled once from level (`8 + 1.6 * level` points), tags and archetype, with a random spread so some people are lopsided (a hulk) and some even. They're rolled lazily, so older saves and authored people get them. Skills aren't stored: `skillOf` settles near the person's level and wobbles deterministically. Blackbird can't see them. Analyze (a skill under Intelligence) gives a noisy read of the shares into `mind.reads`; the more lopsided the target, the clearer the read, and repeat reads sharpen it. Her choices use the read (`perceived`): she's warier of arm wrestling a hulk and of hacking a high-Intelligence target, while the dice use the truth. A target's Intelligence is its defense against Hacks (0.05 per point off the chance).
- **What NPC stats do.** `ratio(npc, stat)` is a stat against the average for their level (1 is typical). In a fight: muscle scales a foe's damage (+20% per point of ratio, 0.75x to 1.5x) and resists intimidation; reflex raises their hit chance, makes them harder to hit (a ranged or melee strike on them loses up to 0.15) and gives a very quick person an extra step of speed; intelligence makes them more cautious, resists intimidation a little and defends against Hacks. Outside a fight: threatening is resisted by their muscle and intelligence, pickpocketing by reflex and intelligence, flirting by charm, arm wrestling by muscle and athletics. Place checks with a named opponent (`who`) are pushed by how their stats and skills (`opposed`) compare with hers. Her appetite for a risky act (challenge, threaten, pickpocket, arm wrestle, hack) uses what she has read, not the truth.
- **`techniques.ts`: what a unit can do with its action.** A technique is data plus two functions: where it reaches, what it is worth from where you stand (`value`, in the same units for everything, so a shove can be weighed against a shot) and what it does (`run`). Adding a way to fight is adding an entry to `techniquesFor`. Today Blackbird has: **attack** (reach comes from the weapon: knives and fists 1, whips 2, pistols 5, shotguns 3, rifles 8, with accuracy falling off over distance and a quarter off against someone in cover); **throw** (the old pre-fight lob, now a range-2-to-4 action); **ambush** (a melee strike at someone who hasn't noticed her: 1.8x plus sneaking, ignores armour, never misses); **shove** (into a wall or a person for damage and a stun, onto a hazard for more, out a door to be rid of them); **hack** (robots and augmented people lose their next action and 3 power for the fight; hack stat and tinkering decide whether it takes); **intimidate** (a scared person runs for the door; intimidation, level difference, fame, and how the fight is going decide); **overwatch** (a free shot at the first enemy to walk into her sights); **mantis-blade flurry** (implant); **leap** (hydraulic calves, across the room ignoring terrain). Everyone also can **dash** (twice the movement, no action) and **leave** (step off an exit tile). Foes have the basic attack at the reach of whatever they carry (dragons and drones fly and shoot); allies have their own: the drone zaps from range, the hacker jams things, the scrapper-bot and pigeon stand near her and soak part of each hit. **Hacks and Overrides:** a Hack goes after quick, mobile systems (robots, drones, cars, the chrome in people) and works on anyone not tagged `no_chrome`: the jam, and Optic Reset (blinds the target a few rounds; blind attackers lose 0.5 to hit). An Override goes after big, fixed systems (buildings, infrastructure, the billboard, cameras) and is mostly non-combat (`override.ts`): Blackout shuts a camera at her location for 20 beats (`workingCameras` in `witness.ts` respects it), a candidate she picks like any other so a crime afterwards goes unwitnessed. Blackbird starts with both.
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

### Influence: putting a goal in somebody's head (`influence.ts`)
Blackbird can give an NPC a goal of her own choosing. She does it with one of four skills under Charm: **persuasion** (it's a good idea), **intimidation** (do it or else), **flirting** (the `romance` skill; do it for me) or **grifting** (a story in which they want to). Her wishes come out of what she is already after, so it is never random:

| Goal | She wants it when | What they do |
|---|---|---|
| `give_cash` | a cash goal, or an empty pocket | hand over the money when next with her |
| `cover` | a heist, burgle, quest or raid is on | their awareness of her stays at zero, and as a witness they don't call the law or step in |
| `back_me_up` | a kill, dragon or raid goal | add to her power and join her next fights (and get hurt doing it) |
| `go_after` | a kill goal on someone else | walk out, find the target and scrap with them (stats decide), offscreen if need be; a win counts as her kill goal being struck |
| `spill` | they have something she doesn't know | tell her a fact, secrets included |

**Errands (`errands.ts`).** Some goals are things to go and do, and for those the carrier simulates it: each beat they find where it is done and walk there (at their own pace, offscreen if need be), then look at the ways they could go about it, score each (their own odds from their stats and skills, how much it suits their character, how bad failure would be for someone of their nerve), pick softmax like she does, and roll. A failed way costs them and they try again, maybe differently; three failures, or getting hurt, and they give up; someone who dislikes the whole idea may simply refuse. In the room every attempt is told; away, only the outcome.

| Errand | Where | Ways | Effect |
|---|---|---|---|
| `go_after` | the target | brawl, ambush | scuffle decided by power; a win strikes her kill goal |
| `kiss` | the target | smooth, steal a kiss (may get slapped), ask | tie with the kissed warms; the turned down remember it |
| `steal_car` | a street with a car nearby | hotwire, smash, lurk | the car is taken and left for her (at her feet if she's on a street); a loud attempt in front of her is her heat |
| `take_deck` | the DJ booth | ask, elbow, swap the drive | a set that wins or sours the room; the displaced DJ is sore |
| `buy_round` | a bar or club | pay, put it on a tab | the room warms to her name; their pocket pays |
| `tag_wall` | where she asked | quick tag, a proper piece | graffiti on the place |
| `karaoke` | the karaoke stage | sing, belt it | the crowd warms or boos |

Besides what she needs, she has **whims**: with mischief in her, any NPC in front of her may get an idea (a kiss for someone in the room, a car, the decks, a round, a wall, the mic) that lasts a stretch of the night and is chosen by her traits. They are cheap and often pointless, which is the point.

Whether it takes is `influenceOdds`: **magnitude** of the ask (a share of their purse, how secret the fact, how hard the target is), how far it **conflicts with their character** (each goal has a trait profile: `go_after` wants kindness low, `give_cash` wants greed low), how much they **like her**, and her skill against their stat. Method colours the rest: the brave don't fold, the greedy are easy marks, flirting runs through `romanceMod`. How she got there is remembered: the frightened hold a grudge and the conned may work it out later (`influence_end:wise`). Errands last a night (`Npc.goals`, cleared in `wakeTheWorld`); `World.influenced` lists carriers so the beat doesn't scan everyone.

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
351 nodes / ~1070 purchasable ranks in 16 branches, all data. Each branch holds **lines** (a row of nodes you walk along) and a node needs the one before it in its line plus, sometimes, nodes in other lines (`id` or `id:rank`), so the thing is a web and not a ladder. Prices rise per rank; a cost-sort of lines: universal things are dear, niche things cheap.

| Branch | What it is |
|---|---|
| Chassis | HP, reflex/muscle/intelligence/charm, plating, a shelf of black-market chrome (incl. the defib), the Cyberknight capstone |
| Firmware | competence, XP and skill growth, flaw management (turn a trait down, never to zero), "lean into it" (turn one up), the Hero Protocol capstone |
| Treasury | starting purse, drop-point fees, banking habit, estate (death insurance), interest |
| The Lab | start levels, bench discounts, spare med kits and stims, the Perfect Rebuild capstone |
| Arsenal | a ladder of starting melee weapons and one of guns (with ammo), ammo locker, weapon drills |
| Doctrine (six branches) | Combat routines: see below |
| Stagecraft / Brawl / Ghost / Charm / Hustle | one four-node line per skill (Quick Study, Head Start, Prodigy, Master), plus group-wide lines and crossovers that need two skills' worth of work |

Some are good every night (reflexes), some are for a very specific Blackbird (beatboxing grows faster, and costs well under half what a melee line does).

**Effects** are `Fx` values. Most are applied once, when the body is printed (`applyUpgrades`, from `beginRun`): stats, HP, levels, cash, competence, skill levels, kit, a better starting weapon/armor, implants (up to four), and personality nudges (applied to the hero's copy; the backup in `legacy.personality` is untouched). A few are looked up during the night with `perk(legacy, id)` and `growthPct(legacy, skill)`: skill growth (`train`), XP (`gainXp`), healing (`useMedPack`), the drop-point cut, and the bank habit.

### Doctrine: combat routines (`content/doctrine.ts`, `doctrine.ts`)

Six branches of combat skills flashed into the body before she wakes up: **Blades** (knife, blade, whip), **Blunt** (club, gauntlet), **Small Arms** (pistol, energy sidearm), **Heavy** (shotgun, SMG), **Precision** (rifle, beam rifle) and **Combat** (general, any weapon). About 95 nodes, 57-63k to buy out a weapon branch and 85k for Combat. The shop half is data (`content/doctrine.ts`: one `ArtSpec` per node, `per` = what one rank adds); the fight half is `engine/src/doctrine.ts`.

- **Every node is bought in ranks** and does more with each. Nothing is once-per-fight or once-per-night: strong things are chances, passives or cooldowns (a cooldown technique's cooldown shortens with ranks).
- **Weapon match.** A weapon branch's routines only work while she is holding a weapon of that branch (`branchOf(item)`, from the weapon class; named weapons have no generated class, so `NAMED` in `doctrine.ts` says which they would have rolled). `art(sim, id)` is zero for the wrong weapon, so no caller checks. Combat works with anything.
- **The base node is the gate.** Each branch opens on a ten-rank base (+4% damage with that weapon family; for Combat, Thick Skin: -3% damage taken per rank). Every other node needs 3 ranks of it. No node asks for skill levels, because she is built before she has any. Capstones need a couple of nodes from their own branch. Battle Sense (Combat's capstone) adds hit chance and crit chance for every round a fight has gone on.
- **Passives** are looked up through `Sim.arts` (a per-fight snapshot of her ranks, `lab.artsOf`): damage (`dmgMult`, used for what she does *and* what the AI expects), crit, accuracy, armor soak, hits taken (Thick Skin, Brace, Roll with It, **Last Gasp**: +10% a rank to 50%, a fatal blow leaves her on 1 HP and can happen again on the next), dodges, riposte and deflect, leech, regeneration (a percentage of max HP per round, plus a small capped trickle between fights in `run.ts`), nerve (`foeMorale`, Intimidating Presence), free actions (Berserker, Blade Dance, Follow-Through).
- **On-hit effects** (`afterStrike`) put statuses on foes: **bleed** (stacking damage over time, not robots), **slow**, **pinned**, **marked**, **suppressed**, **broken limbs** (a leg: slow and can't flee; an arm: they hit softer; ribs: they aim worse), **stripped armor**, **disarmed**, plus stuns, knockback, ricochets and area blasts. Foes' statuses tick in `Sim.turn`.
- **Actives** are techniques like the existing ones (`doctrineTechniques`): Lunge, Whirl, Haymaker, Bulldoze, Pile Driver, Aftershock, Fan the Hammer, Pistol Whip, Buckshot Wall, Suppressive Fire, Spray and Pray, Barrage, Mark Target, Pin Down. They are valued in the same units as everything else, so Blackbird chooses them on her own.
- **Not here yet:** thrown items and grenades; friendly fire from area attacks; any change to how she picks fights (only what happens in them).

`npx tsx scripts/doctrine-audit.ts [seeds]` runs every routine against the same fights with and without it and flags the ones that change nothing. Fully maxed (one weapon branch plus Combat), a level-6 Blackbird beats three Artemis dragons every time (plain: she runs or dies); with only the bases she still runs about 90% of the time and dies 5-17% rather than 33%. Hera still beats every build at least half the time.

### Persistence
`legacy` gained `account`, `upgrades` (node id -> ranks) and `spent`; `World.stats` gained `deposited` and `fees`. `UNIVERSE_VERSION` is 2; `deserialize` brings version 1 saves forward (`upgradeUniverse`: adds the account and the drop-point features). The UI saves the universe to `localStorage` whenever she is in the lab; `?seed=` / `?world=` still start a replayable night in a fresh world.

### The screen (`components/Lab.tsx`)
Balance, last night's books, sixteen branch tabs (the six Doctrine branches grouped at the end), each line as a row of cards with ranks, effects, price and what it still needs; a search across all nodes and an "only what I can buy now" filter; and a live preview of the body she'll wake up in and the money perks. Buying is immediate. There is no refund.

### Balance notes
At a typical competence, a night is worth a few hundred neodollars banked (a good one over a thousand), against a full tree that costs about 390k, so the early game is a slow trickle of cheap nodes and the late game is long. Greedy-buying the universal lines for 25 nights took a competence-0.1 Blackbird from 90 to 158 HP and 0.10 to 0.19 competence; she still mostly dies. That is the point of the long tree, but the Firmware and Chassis prices are the first knobs to turn.

## The city grows as she walks (`mapgen.ts`)

Neo is no longer a fixed map. The hand-built Rusty Halo district is the **seed**: a start-of-game home block with its story in it (the dragon, Madame Zero, Helix). Its edges open onto the rest of the city, and everything past them is made up as Blackbird gets there, then saved with the universe, so the map is the same in every run and after every death. The same save always grows the same city.

- **Sketch, then expand.** A place is *sketched* when the place next to it is expanded: it gets a name, kind, security, cameras, crowd, a blurb, an influence mix, a faction if it has an owner, and one exit back to where it came from. A place is *expanded* the first time she arrives (`relocate` calls `expand`): it grows its own neighbours. So the map is exactly one step wider than anywhere she has been, every exit she sees leads somewhere with a name, and nothing past that costs anything. `Location.gen` records where a generated place came from and whether it's been expanded; hand-built places have none.
- **Ids say where a place is.** A child's id is its parent's plus the slot it was born in (`street_main~0`, `street_main~0.2`). Every attribute of a place comes from a stream seeded with the *world seed and that id*, never the run or the order of exploration. So people cast into a place by `populate` (`bartender@street_main~0.2.0.0`) are the same people however the city was found. Tested: two explorers who find a place in different orders see the same place.
- **What grows from what.** *Streets* are the spine and never end: each has two to four lots and one or two ways further on. Lots depend on the **district** (market, nightlife, tenement, industrial, corporate, slum); districts persist along a road and sometimes turn into a neighbour. *Buildings*: shops and flats are a single room; bars may have a back room (guarded, sometimes hidden until a scout or a stumble finds it) and a cellar; clubs a guarded VIP lounge; corporate buildings a lobby and one to three floors, each more secure and guarded. *Tunnels* run on for a stretch and come up in a street somewhere else. Back rooms, floors and VIP lounges inherit the parent's owner and raise its security; being thrown out puts her on the nearest street.
- **Owners are factions.** Shops belong to the shopkeepers, corporate buildings to Atlas, and each generated bar or club gets a faction of its own (`v:<id>`, kind `venue`) so its staff are on one side. Streets lean towards gangs through the existing influence inheritance (thinned from the neighbour, with the odd stranger's tag), and a street that's mostly one gang's becomes its turf.
- **First sight.** The first arrival at a generated place adds its blurb to the log (`go` event `blurb`), so each new street gets a line of its own.
- **Saves.** `UNIVERSE_VERSION` is 4. Older saves are upgraded on load: `seedFrontier` opens the hand-built district onto the city (it's idempotent, it only adds what's missing), and `dungeons` starts out empty (see below).
- **Not yet:** features for generated places (`Feature`s are keyed by kind and there is one of each, so a generated dumpster or till isn't possible yet); stubs preferred when filling generated vacancies; region-by-region loading when a universe gets big.
- **Loops.** The generated graph is a tree plus shortcuts. When a street is expanded and has two roads leading on, they're joined by a cut-through 70% of the time; neighbouring shops, bars and clubs along it share a side door 25% of the time, and 40% of those are concealed (hidden both ways until she finds one, like any hidden exit). Links are made at the moment the parent expands, between places that already exist and from the parent's own stream, so they're the same whichever end she finds first. They're two-way and never doubled. Tested in `maploops.test.ts`, which grows streets directly with `expand` and runs in about a tenth of a second.

## Dungeons: Atlas outposts and ganger hideouts (`dungeons.ts`, `content/dungeons.ts`)

Two kinds of place with rooms of their own, a garrison, traps and spoils: a building on a street that is worth going into and has more behind the door than a shop does. Both are ordinary generated lots (`outpost` and `hideout` in `mapgen.ts`) and everything about them follows from one number.

- **The tier.** 1 (a few thugs) to 5 (a fortress), rolled when the entrance is sketched, from how far out it is and the district, and never changed after. It decides the number and toughness of the garrison, how many rooms there are, which dogs and traps are rigged, and how rich the spoils are. It's on the entrance's `gen` so she can size a place up from the street before anyone has been inside.
- **Atlas outposts**: depots, relay stations, checkpoints. Gatehouse, checkpoint corridor, barracks; from tier 2 a motor pool and an armory; from 3 a data core; a command post at the back. Mostly robots (sentry drones, enforcer walkers, a sentry turret in the data core) with a handful of troopers and an officer to give the orders. Fewer bodies, harder ones. Spoils: gear racks, supplies, data (memory shards, drone cores, Helix samples, executive credentials at the top) and a safe in the command post.
- **Ganger hideouts**: scrapyards, old chapels, drained pool halls. Front door, common room, bunk room; from 2 a chop shop and a stash room; from 3 a fight pit; the captain's den at the back. Rooms of weak runners (a tier-1 hideout already has eight or ten people in it, a tier-5 one nearer thirty), a couple of enforcers once the tier allows, a captain. Spoils: cash boxes, stashes, weapons, and a safe with the crew's colors on it.
- **Made on arrival, kept for good.** `relocate` builds the inside (`ensureDungeon`) the first time anyone reaches the door, from the tier and ids alone, so the same save builds the same place however it was found. `World.dungeons` (keyed by the entrance's id) is on the persistent side of the universe (`UNIVERSE_VERSION` 4). The dead stay dead; whoever's left heals overnight.
- **Held, cleared, held again.** When the last of the garrison is dead or has run for it, the place is cleared (`dungeon_cleared`: fame, XP, and word gets round: Atlas heat for an outpost, the crew's own members think less of her for a hideout). It stays empty for two or three runs and is then garrisoned afresh (`regarrison`): new people, new spoils, traps and dogs rerolled, same tier. The dead who never mattered to anybody come off the books.
- **The encounter is walking in** (`enterRoom`, from `arrive`). What the room keeps against intruders goes first (dogs and traps, through `hazards.ts`, tier-scaled). Then the garrison gets a chance to notice her (sensors and numbers on one side, sneaking and the dark on the other; each beat she lingers makes it likelier). If they do, it's a fight against the room, in waves of up to six, and the noise draws people from the rooms next door. If they don't, she's in a room full of people who haven't seen her: she can **ambush** them (she moves first, nobody outside is watching so there's no police heat), **open what's lying around** (a lock or a rack, with a chance it jams, and a worse one if people are looking), or walk on. Posted people who haven't noticed her aren't "here" for anything else in the game (`npcsAt`), so she can't chat up or pickpocket a gang in their own den.
- **Blackbird's `raid` goal.** Walking into a dungeon, however she came to be there, makes it a goal. She can also form it from a door she has seen (idle, "because it is there", or as the quick way to money for a cash goal). Her plan (`raidPlan`) is the rooms that still have somebody in them, something in the corners, or haven't been looked in, nearest first. Fights are judged by `pressure` (their menace over her might, in her state right now; about 1 is a coin toss, calibrated against real fights, see the table in `dungeons.test.ts`): a room that looks like too much is a wall she doesn't go in or through, and the bar for "too much" is `tolerance` (competence lowers it, courage and recklessness raise it; a clueless hero also underestimates rooms she hasn't been in). When everything left is behind a wall, or she is worn down with nothing to patch herself with, she heads out: `goal_drop:outmatched`, or `goal_done:spoils` if the trip paid. When the garrison is dead and the corners are empty it's `goal_done:cleared`, and a cleared place has nothing left to draw her back (`knownDungeons`), until somebody moves in again, and then a bit less (0.65 per clearing).
- **Tests.** `dungeons.test.ts`: generation, the tier dial, who's in them, the encounter, spoils, persistence and refilling, her behavior, and the words; one slow test plays nights in a persistent universe.
- **Not yet:** her remembering a dungeon across nights (the map persists; her knowledge of it resets with her body, like everything else she has seen); rumors and fixer jobs pointing at one; boss-specific fights; companions in raids having a say; dungeons in the lab/UI as anything but their log lines.

## Spots: small encounters on the street (`content/spots.ts`)

For the nights she wants a bit of money and a fight without a whole dungeon. A spot is a **one-room dungeon**: a lot on a street (`spot` in `mapgen.ts`, `DungeonKind` `'spot'`) that runs on all of `dungeons.ts` (noticed or not, ambush, loot, cleared, garrisoned afresh) with the building boiled down to a door, one to four people and one thing worth taking. About a third of streets have one, a few have two (their own random stream and the last slot, like clinics, so nothing else on the map moved). A spot appears as a lead, a `raid` goal and a door that tugs like any other, only cheaper and quicker, so she can grind them.

- **33 of them, four crews.** *Gangs* (Vipers, Sixers, Marrow, Choir): dead drop, collection day, racket booth, turf wall, pop-up chop shop, van swap meet, stash flat, dumpster cache, fight club, cash-van job; the vice trade: dealer's den, pill mill, stim kitchen, card room, loading-dock rave, print room; a half-fallen block. *Atlas*: drone repair bay, signal relay, "Customer Delight" kiosk, pop-up checkpoint, recall yard, dragon service hatch, an executive courier car. *The police*: an evidence van, a cop taking an envelope. *Free*: feral work-bot nest, scrappers' camp, drone graveyard, licensed bounty hunters, a Choir shrine, a black-ice server shed, a fixer's locker.
- **Setups.** Each spot has one or more (`Setup`): the same place on a different night. A dead drop is unguarded, or has a runner on it, or has one arriving with a second bag. Dealt per garrisoning (`setup:` stream), so a refilled spot may be a different night; `Dungeon.scene` says which, and the log uses it. A spot with nobody posted (`Dungeon.posted === 0`) is just a stash: `dungeon_quiet` on arrival, and it isn't "cleared" until the stash is gone, and then quietly (no XP, no fame, no heat).
- **Paper by default.** Everyone minding a gang or free spot has an NPD bounty on them (amount from level; about one in five is the hidden kind, the rest are posted and read on sight). The exceptions are the people at **Atlas and police spots** (their people don't have NPD paper), **robots** (never, anywhere), and any slot marked `clean` (the hired and the licensed: a broker, a cop on the take, a street doc, bounty hunters).
- **Delicate = richer.** Every human in a spot with no bounty on them is the sort of person who isn't supposed to be touched, so what the spot keeps is worth more: each adds `RICH_PER_BARE` (0.3) to a multiplier on the cache, up to `MAX_RICH` (1.9); a cache with a multiplier also has a chance of a little something extra, and a better weapon in a weapons rack; and the bare carry 1.4x the cash. So an Atlas checkpoint of two troopers (no bounties, two people) is worth about 1.6x a cash box, a drone bay with a contractor 1.3x, a bay of drones alone nothing extra, and a dealer's den where everyone has paper pays out in bounties instead.
- **Heat and fame.** Atlas spots draw Atlas heat when the alarm goes (+1) and when cleared (+2), police spots the same on NPD (+1, then +3). Gang spots draw none, but their crew thinks less of her (`-4` affinity, `-12` for a hideout). A cleared spot is worth 5xp per tier and 1 fame at tier 4. They fill up again after one or two runs (a dungeon takes two or three) and she gets bored of one less quickly (0.85 per clearing against 0.65).
- **Balance.** Tier is 1..4 (a few are 2..4, the dragon hatch 3..5), gentler than a building at the same depth. Measured over 120 nights (competence 0.2, 0.5 and 0.9): about 2.4 spot raids a night, 227 spots cleared, bounties paid four and a half times as often, and no more deaths than before (68 either way, none in a spot). Tune with `scripts/sim.ts`.
- **Tests.** `spots.test.ts`: the table is sound at every tier, streets grow them without moving anything else, the paper rule (every crew, every tier), the richness rule, unguarded and guarded, refilling, heat, saves, words for every crew, and nights.


## Jobs: go there, do the one thing, come back (`quests.ts`)

People with a want can have a job for her. A job is **go to a place made for it, do one thing there, then tell whoever asked**. The one thing is one of three objectives:

- **flatline** a named target who is posted in the objective room (tougher than the tier says, and not the sort to run: `routed` leaves `quest_target` people alone);
- **retrieve** a thing from the objective room (`quest_take`; the thing is an inventory item tagged `quest`, which the fence will not buy and `wealth` does not count);
- **hack** a terminal in the objective room (`quest_hack`; each failure is a risk of noise, three in a night and the system purges itself).

**Where they come from.** Wants are facts (`facts.ts`). Money, getting out, finding someone and wanting peace can each turn into a job (revenge is a score, not a job: `contracts.ts`). Seven in ten people with such a want have the nerve to ask (`questWant`, rolled from who they are). Once she knows them well enough to be told (the same visibility rule as chatting: nothing `secret` under 40 affinity), `ask_quest:<id>` is on offer in the room.

**The place.** Describing a job builds it (`ensureQuest`, `addQuestSite` in `mapgen.ts`): a trail of two to four new streets off the street the giver is on, and at the end a spot or a dungeon (an outpost or a hideout, tier from her level when it is described) with the giver's id written on its `gen.quest`. Both come from the giver and the world's seed, so the same job is in the same place in every run of the save; the streets are ordinary streets that grow lots and spots of their own when she gets there, and the site is built like any other when she gets to its door, with the one extra fixture stocked into the room the job names (`stockQuest`). She knows the way because the giver told her: the trail is simply on the map. Everything else about the place is a normal spot or dungeon, with its own garrison and spoils, so she is free to clear it out or creep through it.

**Whether she takes it** (`appraise`): how she feels about whoever is asking (affinity, kindness), how much the money is worth to her (reward against what she has, greed) and how much work she reckons it is (the way there, how the place looks against her `tolerance`, how she feels about killing, hacking or fetching). That is one score; a sigmoid turns it into the chance she says yes. If she does, she then decides whether to make it a goal right now (more likely the more she wants it and the more room she has) or keep it in mind (`Mind.quests`). Jobs she has kept in mind are recalled now and then when she has room for another goal (`recallJobs`); one she has already done (so the money is owed) is picked up first, room or not (`quest_collect`). They are also a candidate when she has nothing on her mind (`formIdle`, and so one of the lab's *idle* options). A job that gets dropped (bored, overloaded, "too much from the street") goes back to the notes; one whose giver has died, or that has gone wrong for the night, does not.

**The goal** (`quest` in `goals.ts`) has modes: `approach` (the trip is ordinary travel; from two streets off she has a last look at the place), then inside `sneak` or `clear` (picked from her nerve and what she thinks of the place; a loud place she can't take she sneaks; a sneak that has set off the alarm twice turns into a clear), `retreat` if she is worn out with no meds (she leaves, heals, and comes back), and `return` once the job is done. Sneaking heads straight for the objective room and won't start fights on the way (but will for the target); clearing visits the rooms she can handle, loots them and does the same. Done, she wants to find whoever asked, **wherever they have gone** (`giverPlace` reads their routine at the current clock, not where she last saw them); `turn_in_quest:<id>` is on offer whenever the job is ready and they are in the room, even if she has forgotten ever taking it, since the world remembers.

**What persists.** The job is on the giver (`Npc.quest`) and the site is in the map, so both outlast her body; what she decided is in her mind and does not. At nightfall (`nightfall`) a thing she carried off is gone with her and the terminal is back up; a target she put down stays down, and the job stays ready to report.

**Pay.** Cash from `70 + 60*tier + 0..70` times 1.25 (flatline) / 1.0 (retrieve) / 1.1 (hack); the giver's affinity goes up fifteen, the want is satisfied (the fact goes), a little XP, and a little fame at tier 3 and up.

**Tests.** `quests.test.ts`: the site is built and reachable and the same every time, each objective is stocked, her answer follows the things it should follow (liking, money, work), keeping a job in mind and picking it up again, each objective resolved, reporting to someone who has moved, the night boundary, and words for every job event. `scripts/analyze.ts` counts `quest` among the goal kinds.

## Asking the lab (`advice.ts`)

The first thing the player can do mid-night besides watch. At a fork in the road Blackbird stops, taps her earpiece and asks the lab tech what to do. The question stays open for `ASK_BEATS` (10) beats; if nobody answers, she decides for herself.

**What she asks.** Four kinds, each hooked into a place where the mind already makes the choice (`goals.ts`):
- `want`: something she can't afford yet. *Should I save up for the shotgun?* (save up / forget it)
- `earn`: she's short on a cash goal and about to go for a big score. *Raid the hideout, rob the vault, or work the street?* (the raid and heist she knows of, or odd jobs and bounties)
- `door`: a hideout or outpost she's seen the door of, in front of her or on her mind. *Should I clear it out?* (clear it out / leave it)
- `idle`: nothing on her mind. *What should I do with myself?* (the same ideas she'd pick from: fame, money, a dragon, a raid)

**What the answer does.** Options are plain data (`AskOption`): a goal to take on (`spec`, the same thing `adopt` takes) and/or things to put off (`cool`, cooldown keys). Taking advice makes the goal a little stronger (+0.1 desire). *Leave it* cools the door for 120 beats, so she stops being drawn to it. *Odd jobs* sets the `bigscore` cooldown (150 beats): no raids or heists, and no lure from doors, while it lasts. A question about a goal that has gone away by the time it's answered is answered and forgotten.

**If nobody answers**, she goes with `lean`: what she'd have done had she not asked (`want` always leans to saving up: she asks, but has usually decided). So the headless sim, offline catch-up and a player who isn't looking all play the same game as before, just a few beats later.

**When she asks.** `maybeAsk` gates every question: not in the first 8 beats of a night, not while one is open, not within 45 beats of the last, and with a probability from her personality (`askiness`: sociable and loyal ask more; vain and impulsive tell the lab what she's doing). When she doesn't ask, the caller carries on as it always did. About one or two questions a night in the sim.

**State and replay.** The open question is `world.mind.ask` (plain JSON, saved with the night). The player's answer is `advise(world, optionId)` in `run.ts`: it takes no beat of its own, emits `advice_taken` and whatever the answer causes (`goal_new`…), and uses the world's dice, so a night with the answers logged by beat replays identically. Events: `advice_ask`, `advice_taken`, `advice_lapsed`.

**UI.** `NightViewer` shows the question and its options in a card under the log, with a countdown. It counts beats, not seconds, so opening a question drops the speed to 1× and puts it back when the question is answered or times out (picking a speed meanwhile cancels the revert). *Next drama* stops at a question.

## Hunger and Sleep (`needs.ts`, `rest.ts`, `content/lodging.ts`)

Two meters on the hero, 0..100, that run down with the **world clock** (not beats, so a ninety-minute job or a night in a bed costs what it should):

| | falls | when it's bad | at zero |
|---|---|---|---|
| **Hunger** | 100 → 0 in 60 hours awake (half speed asleep) | every tenth of the bar below 90% costs a little and the cost grows (`hungerSteps`/`hungerPenalty`: about 1 power at 70%, 3 at 40%, 7 near empty, plus muscle, reflex, hack and charm further down), so she is better off eating regularly and staying above 90; remarks at 70 / 45 / 20 / 8 (*hungry, famished, starving, wasting*). Nothing kills her but days of putting it off. | she starves: the night ends (`death:starved`) |
| **Sleep** | 100 → 0 in 20 hours awake | steps at 40 / 22 / 10: *tired* (a remark: it's most of an ordinary day), then *exhausted, spent*. Tiredness hits reflex and intelligence first. | she passes out where she stands |

A hero from an older save has neither field, which counts as full. Time the game spends closed (`catchUp`) doesn't count against her.

**Eating** is cheap and everywhere: a stall on most streets (`eat_stall`, 8nd, +34), a plate at a bar with a barkeep (`eat_plate`, 16nd, +50), a bagel at Bullets & Bagels, the noodles and dishes she already carries, a snack from the vending machine or the fridge, and bins when she's broke (`scrounge`, free, a small chance of being ill). The lab's metabolism line makes a meal go further.

**Sleeping** is a decision, and there are four kinds of bed. A night is eight hours unless something interrupts it (the lab's Twilight Sleep Module can cut it to as few as four), and *quality* no longer changes how much of the Sleep bar it refills (a full night fills it) but how much *sleep debt* it leaves or clears (below):

| bed | cost | quality | risk |
|---|---|---|---|
| sleep pod | 16nd | 72% | none |
| hostel bunk | 38nd | 88% | ~10% a night of being robbed in her sleep (40–70% of her cash) |
| hotel room | 95nd | 100% | none |
| a quiet corner (`sleep_rough`) | free | 50% | the comings and goings of the night, below |
| the open street (`sleep_street`) | free | 40% | the same, much busier, plus thieves and patrols |

Beds are along streets (hash of the world seed and the street, by district; Strand Street has all three). Passing out is a three-hour version of sleeping where she stands, refilling only about 22 of the bar, at 60% quality (staff in a shop or bar put her out on the street first; in a corp building or a dungeon she is found at once).

**Sleeping out is simulated hour by hour.** Each hour the people who are there by their own schedules (`movement.ts` `placeAt`, so a long sleep sees the same crowd she would have) and a Poisson number of strangers (busier on a street than in a tunnel, busier by day) may notice her; the chance depends on the spot and her sneaking. What a person does is rolled from their temperament (`character.ts`): the kind cover her up, the honest and short-tempered call the NPD (*sleeping rough is illegal, and a cell is a bed*), the greedy and dishonest empty her pockets, cops arrest and security moves her along. Police and Atlas heat make it much worse: patrols find her, and with serious NPD heat or any real Atlas heat she is attacked in her sleep (a fight she starts at a disadvantage) or captured (cash stripped). Under a roof and out of sight they have to get lucky. An arrest costs a share of her cash and the rest of the night in a cell at 45% quality; a lodging night also cools heat and sobers her.

**The AI** gets hungry and tired the way it gets hurt: `hungerUrge` and `sleepUrge` (`urges.ts`) climb steeply as the bars fall; they add to the candidates that fix them, pull her toward the nearest stall or bed with `needsUrge` (the same trick as the street doc), and make everything else a little less interesting (`needsBias`). The expensive, safe bed beats the pavement unless she's broke or the urge is overwhelming; she'd rather lie down in a hideout than on a thoroughfare, and more so the hotter she is.

**The lab** adds three lines (Chassis: *Metabolism* and *Rest*; Firmware: *Discomfort management*; Treasury: *Lodging*): slower hunger, slower tiredness, faster sleep (fewer hours), more of a poor night's sleep made up, softer hunger and tiredness penalties, richer meals, cheaper beds, a light sleeper who catches thieves, and a better time when she passes out. All of them are `perk`s (see `content/tree.ts`); the lab screen shows the totals under *Body upkeep*.

Tuning notes: with competence 0.4, simulated heroes sleep about a third of the time (8–9 hours a day), eat about one to two times a day, and don't starve; deaths are still overwhelmingly combat. To rebalance, the knobs are the constants at the top of `needs.ts` (rates and tier thresholds), `content/lodging.ts` (prices, quality, robbery odds, food), and the hazard rates in `rest.ts` (`traffic`, `authorities`).

**Sleep debt.** Poor beds refill the bar like any other but leave lingering tiredness (`hero.sleepDebt`, stacks 0–10) that doesn't wear off with time. After each sleep, realised quality below 0.8 (a pod, the street, a corner, passing out) adds `(0.8 − q) × 8` stacks, scaled by how much of a night she got; above 0.8 (an average hostel and up) takes off `(q − 0.8) × 12`. Each stack costs a little power, reflex, hack and charm (`debtPenalty`), softened by the lab's tiredness upgrades, and *Orthopedic Spine* makes every bed count as better. It shows as *Sleep debt* in the status panel and in `sleep_debt` log lines.

**Expensive tastes.** Beyond what she needs, she likes a nicer bed because she's human: `wantsBetter` adds a pull toward higher-quality beds, scaled by `luxuryTaste` (from vanity and wanting to impress people, -1..1). Vain, show-off girls feel it strongly and mind the price less; a very unfussy one feels none and just takes whatever she needs (the pod unless sleep debt says otherwise).

## Stealth (`stealth.ts`)

Stealth is one system: while she sneaks, everyone who could notice her has an awareness that climbs and falls through four buckets (Unaware, Suspicious, Alert, Aware), calling for help is an ordinary action anyone can weigh, and Hush (a Hack) takes it away. Pickpocketing, dungeon sneaking, witnessing and ambushes all read the same state. Sneaking into a dungeon room plays it as a small board (`prowl.ts`): facings and cones, light, noise, patrols, silent takedowns, bodies, and Override-able props to draw people away. See [`STEALTH.md`](STEALTH.md) for the rules and what isn't built yet.

## Places as boards (`layout.ts`, `placeboard.ts`)

Every place is meant to be a grid whatever she is doing there, so a fight starts where she is standing and a sneak can use the room. Clubs are the proof of concept: a stable layout with a bar, booths, decks, speakers, a strobed floor and a door per exit; a coarse board of where everyone is; fights and pickpocketing that use it. See [`BOARDS.md`](BOARDS.md).
