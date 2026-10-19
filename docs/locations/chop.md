# Location spec: Chop Shop (and the workbench)

**Status:** IMPLEMENTED (see "What was built"). Numbers are starting points; they are not tuned (see CLAUDE.md, "feel over balance").

## 0. Decided

- **Request:** workbenches that use the Tinkering skill, so she can break items into components, build and upgrade things and make ammo from
  components; and a small, simple location for them, the **Chop Shop**: pay a flat fee to go in and use the bench, or sneak in, or flatline the door
  guard, "or whatever else her heart desires".
- **Shape:** a **lot**, deliberately small: no rooms, no shelf, no situations, no wild cards. The interesting part is the door.
- **Not the full location protocol.** The protocol's 60-row registry, room graph and 600-roll distribution checks are for big places. This one is a
  door and a bench.

## 1. Concept

Every district has somewhere that takes a car apart faster than the owner can report it missing. The Chop Shop is the legitimate-looking end of that:
a bench, a rack of tools hung by outline, a radio, and someone on the door with a tin and a price list. Day rate, no questions, no receipts. Blackbird
comes with a bag of broken things and leaves with a better gun, or with the guard's tin. Atlas is wallpaper: a former Atlas depot with the logo still
on the wall, half the stock stamped with it, some of it theirs once.

## 2. The workbench (`bench.ts`, `content/parts.ts`)

A **bench** is a place, not an item. Where one is and who may use it is that place's business; the bench itself is four jobs, all on **components**
(`hero.parts`, a count per part id, like ammo): **scrap metal, wiring, circuit boards, servos, armor plating, power cells, volatile chem**.

| Job | What it does | Roll |
|---|---|---|
| **Salvage** | Takes an item out of her pockets and turns it into components (`salvageBill`: by kind, tags and a few named items). Keepsakes, keys, relics and the cursed stay whole. | tinkering x INT, +bench tier. A bad pull keeps half. |
| **Make ammo** | One box of rounds for a gun she carries (`AMMO_RECIPES`). A little over a shop box at high skill. | Mostly reliable; a bad one is half a box. |
| **Craft** | Builds an item from a recipe (`RECIPES`): needs the bench tier and her tinkering level; offered only when it beats what she has. Marked `homemade`. | A miss costs half the parts. |
| **Upgrade** | A mod on the weapon or armor she is using: +1 power, name carries the count (`riot shotgun +2`), dearer each time. Cap: 1 + tinkering/2 (+1 at a tier-4 bench), at most 6. | A miss costs half the parts; a miss on unstable tech bites (8 HP). |

Benches exist at the **Chop Shop** and in a **pawn shop's workshop room** (tier = the shop's tier less one; no fee, the room has its own door).
Components mostly come from **spots** (`scavenge.ts`, `spotParts` in `content/spots.ts`): once nobody is holding a spot she can pick through it for free, 30 minutes, and it is picked over for 3 days. Each spot has its own mix (a drone boneyard is circuits and cells, a pop-up chop shop is scrap, servos and plating, a stim lab is chem); about three in four have something. Salvaging items is the other source.

## 3. The Chop Shop (`content/chops.ts`, `chop.ts`)

- **Role / kind:** `GenRole 'chop'`, `Location.kind 'chop'`, `Location.chop` (`ChopInfo`: shell, tier, fee, door, traits). Venue faction `v:<id>`, so killing the
  mechanic shuts it (`shutdown.ts`).
- **Own streams:** `chopchance:${worldSeed}:${streetId}` and `chop:${worldSeed}:${id}`, slot added after the pawn shop's, so no existing map changes.
- **Chance a street has one:** industrial 0.14, slum 0.11, tenement 0.09, market 0.05, nightlife 0.03, corporate 0.01 (about 1 in 12).
- **Axes:** shell (9: a gutted tram carriage, a car park, a container, a car wash, a bus garage, a scrapyard, a drive-in hut, an underpass bay, a former
  Atlas depot) · bench tier 1-5 (a vice and optimism .. a machine shop with a named lathe) · door (a guard, or a door bot) · 0-2 traits of 12
  (NO QUESTIONS, half price before noon, a dog called Torque, a stream, CCTV, an apprentice...). The fee is `10 + 8 x tier + 0-7`, times the traits.
- **People:** a mechanic (the owner, 90%), the door, 0-2 customers, sometimes a ganger (more where the cars are hot).
- **Hours:** 08:00 to 02:00.

## 4. Getting in

The bench is open once she has a **day pass** (`counters['chopin:<shop>']` = the day) or once **nobody is minding the door** (the guard is dead or
knocked out). Every way in is a candidate of its own, and each is only on offer if she has something to do at the bench (junk to break, ammo to make,
something she could build, a mod she could afford), so she does not pay to stand in a workshop. Which she picks is down to her drives and skills.

| Way | Needs | Win | Lose |
|---|---|---|---|
| **pay** | the flat fee | in for the day | (cannot lose) |
| **haggle** (a person) | haggling, charm | in for half | nothing paid; the guard cools |
| **sneak** | sneaking, reflex | in free | thrown back, a few HP, a little heat on the shop |
| **picklock** | lockpicking, tinkering | in by the back shutter | the guard comes, heat |
| **hack** | tinkering, INT | the reader (or the bot) is persuaded | a shock |
| **bluff** (a person) | grifting, charm | the card is accepted | the guard keeps the tin out |
| **vouch** (a person) | the guard already likes her (affinity 12+) | waved through, free | n/a |
| **flatline** | a fight | the guard is down: the door stays open | whatever a lost fight costs |

A door bot cannot be haggled with, bluffed or befriended, and does not take a bribe; it can be hacked.

## 5. What each capability sees

- *tinkerers:* the whole point. A better bench raises every roll and unlocks the harder recipes.
- *fighters:* a guard with a tin and no back-up; a bench that makes the rail revolver they cannot afford.
- *thieves:* a back shutter and a camera that points at the door. *Hackers:* a card reader.
- *hustlers and flirts:* a price on a door is the start of a conversation. *Grifters:* nobody checks an Atlas card.
- *scavengers:* a pocket of junk becomes a pocketful of parts.

## 6. Touches existing systems

Fights (a real, lethal fight with the guard; heat on the place faction), shutdown (owner down or dead), `isLethal` (not a soft kind), stage prestige,
hours, the status panel (a Parts line), clock (`chopin` 8 min, `bench` 45 min). No new hero state beyond `Hero.parts` and `Item.mods` (both optional;
absent loads as none).

## 7. Alternatives considered

- A bench in her flat: makes the location unnecessary and removes the door.
- A fee per job instead of per day: more bookkeeping, and the AI would then weigh every job against a price.

## What was built

- `types.ts`: `Hero.parts`, `Item.mods`, `Location.kind 'chop'`, `GenRole 'chop'`, `ChopInfo`.
- `content/parts.ts` (parts, salvage rules, recipes, ammo recipes, mod costs), `content/chops.ts` (the place), `bench.ts` (the four jobs and the pawn-shop bench),
  `chop.ts` (the door, the candidates), `chop.test.ts`.
- Wired in `mapgen.ts`, `roster.ts`, `hours.ts`, `hexmap.ts`, `grid.ts`, `layouts.ts`, `stage.ts`, `clock.ts`, `shutdown.ts`, `interactions.ts`, `text.ts`,
  `supply.ts` (exports `ammoNeeds`), the status panel; `npm run chops`.

## Open

- Parts could also drop from robots and drones, and a shop could sell them.
- No affordance-registry rows: the ways in are a typed list in `chop.ts`, so `npm run coverage` does not see them.
- Gang-owned chop shops (the hideout rooms and `pop-up chop shop` spots) could have benches too.
