# Content Guides

A checklist for each kind of content. Each one says **where it goes**, **what shape it has**, **what the setting
requires** and **what to test**. The engine files carry the authoritative data shapes in their header comments; read
the header of the file you're editing first.

## Every piece of content (the common checklist)

- [ ] **Hard rules** in [`README.md`](README.md): Blackbird opposes Atlas, nothing grim, punch up, invented brands, agency.
- [ ] **Texture** ([`world.md`](world.md)): a fee/brand/Atlas-presence/specific number.
- [ ] **Name** follows [`naming.md`](naming.md) and is not already used (grep).
- [ ] **Voice** follows [`../TONE.md`](../TONE.md): short sentences, understatement, specific numbers.
- [ ] **Pronouns** via tokens, never hard-coded for generic NPCs.
- [ ] **No artificial cooldowns.** Limits come from the world: finite stock, saturation, heat, grudges
      (design rule in `../DESIGN.md`).
- [ ] **Plain JSON state, deterministic.** Use the passed `rng`; never `Math.random()` or `Date.now()`.
- [ ] **Tests pass:** `npm run typecheck && npm test`; slow whole-game claims go under `npm run test:full`.
- [ ] **Docs updated** if you added a *kind* of thing (not just an instance).

---

## 1. Items (weapons, armor, loot, consumables)

- **File:** `engine/src/content/items.ts`. Helpers `w()` weapon, `a()` armor, `l()` loot, `c()` consumable.
- **Shape:** `id: helper(name, power, value, tags?)`. Value is in `nd`.
- **Setting:** low tier = improvised and funny, with quotes and a joke ("Excalibur" (a tire iron)); high tier = crisp
  tech names. Power climbs with value; slot new items into the existing curve (compare neighbours).
- **Also touch:** `content/shops.ts` (`SHOP_WEAPONS`/`SHOP_ARMOR`) if sold; `content/drops.ts`/archetype `loot` if looted;
  `content/ammo.ts` (`WEAPON_AMMO`) if a gun needs ammo.
- **Test:** `weapons.test.ts` patterns; make sure it isn't strictly dominated or dominating.

## 2. Ammo, meds, stims

- **Files:** `content/ammo.ts`, `content/meds.ts`, `content/stims.ts`.
- **Meds** are plain-named (patch kit / med pack / trauma kit): clarity matters. Healing is deliberately scarce.
- **Stims** have a stat or power boost, a duration, a crash, and an overdose risk when stacked. Names can be
  brandy-sounding and ironic. Dealers sell them cheaper and cut.
- **Test:** check price/heal values against neighbours; add to the shop/pharmacy list and confirm they render text.

## 3. Implants

- **File:** `content/implants.ts` (`ImplantDef`).
- **Shape:** `name`, `pitch` (what the street doc says), `catch` (what actually happens), `stats`/`skills`/`power`,
  `flag` (for special cases keyed in code), `cost`.
- **Setting:** every implant gets an **honest catch** that's funny and not cruel. The pitch is salesman-y.
  Atlas-branded implants are suspiciously soothing.
- **Test:** if you add a `flag`, wire and test it.

## 4. Archetypes (new kinds of NPC, robot or monster)

- **File:** `content/archetypes.ts` (`ArchetypeDef`: `role`, `level`, `tags`, `faction`, `names`, `weapons`, `armors`,
  `loot`, `lootChance`, `cash`, `desc`, plus optional `hp`/`power`/`startAffinity`).
- **Setting:**
  - Pick a `faction` that exists in `factions.ts`; people are loyal to their group.
  - `desc` is a short vivid intro: "a barrel-chested ex-merc with a prosthetic jaw and a bat under the counter".
  - Gang members should match the gang's style in [`factions.md`](factions.md).
  - Cops follow the NPD tiers: street cops are bumbling; higher ranks menace.
  - Atlas humans are cheerful middle managers; Atlas robots are the threat.
  - Robots/animals use `names: 'robot'`; keep their names model-ish (see [`naming.md`](naming.md)).
- **Test:** `population.test.ts` / `deepen.test.ts` patterns.

## 5. Factions and gangs

- **File:** `engine/src/factions.ts` (`newFactions`, `GANGS`), plus gang name tables in `content/archetypes.ts` (`GANGS`).
- **Shape:** `{ id, name, kind, relations }`. New gangs inherit the gang-vs-NPD/Atlas/gang relations in the loop.
- **Setting:** give the faction a **vice, a style and a voice** ([`factions.md`](factions.md)). Update that file.
- **Test:** `groups.test.ts`; confirm relations are symmetric and lookups agree.

## 6. Spots (small encounters on the street)

- **File:** `content/spots.ts` (header comment explains the model; read it).
- **Shape:** `SpotDef { key, crew, names, blurbs, districts, hazard, setups[] }`. Each setup has a `weight`, a `scene`
  sentence, a `garrison`, and optionally a `cache`.
- **Setting:**
  - Names and blurbs use `{gang}`, `{code}`, `{name}` placeholders.
  - Blurbs are single vivid sentences with a deadpan observation at the end.
  - Make `districts` weights reflect *what the district is like*.
  - Several **setups** per spot so the same place can play differently (empty / one minder / a second bag).
  - Atlas/NPD spots have no bounties; gang/free crews do (header explains "paper").
- **Test:** `spots.test.ts`.

## 7. Dungeons (outposts and hideouts)

- **File:** `content/dungeons.ts` (header explains tiers 1-5, garrisons, rooms, traps, spoils).
- **Setting:** Atlas outposts are bureaucratic and numbered (`Atlas Depot K-7`), with a wing-and-halo stencil,
  cameras, drones and robot garrisons. Hideouts are the crew's den in a place that fits the gang. New *kinds* of
  dungeon (not just names) need engine support in `dungeons.ts`.
- **Add a name/blurb:** extend the existing tables (`OUTPOST_TYPE`, `OUTPOST_CODE`, `HIDEOUT_PLACE`, `ENTRANCE_BLURB`).
- **Test:** `dungeons.test.ts`.

## 8. Shops, drop points, services

- **Files:** `content/shops.ts`, `content/drops.ts`, features in `features.ts`, hand-built places in `world.ts`.
- **Setting:** cheerful, punny brand ([`naming.md`](naming.md)). A drop point has a name and a `cut`; friendly
  places have a lower cut. Shops have finite stock and restock on their own (no timers).
- **Test:** `engine.economy.test.ts`.

## 9. Hazards (guard dogs, traps, home security)

- **File:** `content/hazards.ts`. Model numbers climb: higher is worse (`BARK-100` ... `BARK-530`).
- **Setting:** the joke is the model name and the owner's unwarranted confidence.

## 10. Skills and titles

- **File:** `content/skills.ts` (`SkillDef { label, group, spill?, titles }`).
- **Shape:** four **titles** for levels 1/3/5/8, funny and escalating ("steps lightly, sometimes" → "a rumor in a
  dark coat"). `spill` shares XP with related skills.
- **Test:** `engine.skills.test.ts`.

## 11. Lab upgrades (skill tree)

- **File:** `content/tree.ts` (branches → lines → nodes with ranks and requirements; `PerkId` lookups).
- **Setting:** nodes are described in the lab assistant's voice; the cost should be honest about who benefits
  (every night vs a specific Blackbird).
- **Test:** `lab.test.ts`.

## 12. Doctrine / techniques

- **File:** `content/doctrine.ts`, `techniques.ts`, `doctrine.ts`. Check `scripts/doctrine-audit.ts` after changing.

## 13. Text lines (the prose layer)

- **File:** `engine/src/text.ts`. Every event kind needs a template entry `e(report[], thought?[])`.
- **Rules:**
  - Interleave the two voices: neutral **report** and cocky **thought** (see TONE.md).
  - Provide several variants; prefer variety and callbacks.
  - Use pronoun tokens for generic NPCs.
  - Atlas announcements are cheerful and contradict the events; nobody comments.
  - Disaster reads calmer than triumph.
- **Test:** "every event has text" tests (`engine.sandbox.test.ts`, `groups.test.ts`, `tactics.test.ts`); no unresolved templates.

## 14. Locations that offer things (gyms, pawn shops, and whatever follows)

A whole kind of place, rolled from many independent axes and offering something to every kind of capability. The spec
and worked example is [`../locations/gym.md`](../locations/gym.md); the code is `content/gyms.ts` (what a gym is),
`content/gym*.ts` (affordance rows), `gymkit.ts` (machinery) and `gym.ts` (candidates). The second, with a shelf as its
only state, is [`../locations/pawn.md`](../locations/pawn.md) (`content/pawns.ts`, `content/pawn*.ts`, `pawnkit.ts`,
`pawn.ts`). Both are built on `placekit.ts`: write a `Kit` (who works there, what its events are called) and the rest
of the machinery (`runCheck`, results, lines) is shared. A place's core business can use `pace: 'deal'`, which gives it a
key family of its own so a long menu of rows cannot crowd it out of the AI's choice.

- **Where it goes:** a new `GenRole` and `Location.kind`, rolled on **its own random stream after everything else on the
  street** (so no existing map changes), with rooms as child places.
- **Shape:** data tables (variants, shells, traits, situations, features, rooms), plus **affordance rows** in the shared
  registry (`affordances.ts`). A row says where it applies, which capabilities it draws on (`needs`), what that
  capability *sees* here, what it does, and what it costs. Requirements are soft; anyone can try anything.
- **Setting:** maximal (more of everything, not all at once), unbalanced on purpose (outliers are features; limits come
  from the world), and multidimensional (every skill, stat and drive has something to do here). Atlas is wallpaper.
- **Always:** run `npm run coverage` and give any capability with nothing here at least one row; add the new place's
  rows to the registry rather than to a hand-written `switch`.
- **Test:** `gym.test.ts` is the pattern: determinism, tables only name things that exist, every row runs and renders,
  every capability is covered, and the rules specific to the place.

## 15. New events and mechanics

- Emit structured events (`c.emit(...)`); the text layer renders them. Add the template (guide 13) in the same change.
- Use `testkit.ts` `scenario()` to build the situation directly; see README "Writing tests". Only whole-game claims
  should run whole nights, and those are `slow`.
