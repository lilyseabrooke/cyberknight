# PROTOCOL: new location

How to add a new kind of location to Neo, end to end, without an interview. The worked example is the gym
([`gym.md`](gym.md) is its spec; the code is listed in its "What was built" section). Read that first if you have not.

## How it is invoked

```
PROTOCOL: new location                         go straight through: concept, spec, code, tests, push
PROTOCOL: new location, review                 stop once, at the concept pitch, for approval; then go straight through
PROTOCOL: new location: a pawn shop            same, with the author's idea as the concept
PROTOCOL: new location, review: a pawn shop    both
```

- **No `review`:** never stop for approval. Pick the concept (or take the author's), write the spec, build it, verify it,
  commit and push, report. Only stop if genuinely blocked (something the repo cannot answer and sensible defaults cannot
  settle).
- **`review`:** do steps 0-1, post the concept pitch (format below) as the *whole* reply, and stop. On approval (or after
  the changes the author asks for) continue from step 2 and do not stop again.
- The author's words after the colon are the concept. If they only name a place ("a pawn shop"), the rest is yours.
- Commit to the branch the session was given. Do **not** open a PR unless asked.

## The three principles (they decide every judgement call)

1. **Maximalism.** More options, more permutations, more features. No instance has everything; the *space* is huge.
   Roll a place from independent axes (kind, building, size, condition, tier, traits, features, rooms, situation, a wild
   card), never from a handful of labels. Contradictory combinations are welcome.
2. **Unbalanced.** Do not tune for fairness. Outliers and wild cards are features. The only limits are the ones the world
   supplies (money, finite stock, heat, grudges, bodies) and the ones that keep saves stable (determinism, own random
   streams). No artificial cooldowns.
3. **Multidimensional.** Every kind of capability has something to do here. Capabilities are an **open set** (skills,
   stats, drives, items, implants, tags, goals) that other protocols keep extending: never write "fighter" or "rogue" in
   code. Write affordance rows with soft requirements and let skills move the odds.

## Steps

### 0. Orient (always)
- Read: `docs/setting/README.md` (hard rules), `docs/TONE.md`, `docs/setting/naming.md`, `docs/setting/world.md`,
  `docs/setting/content-guides.md` section 14, and `docs/locations/gym.md`.
- Baseline: `npm run typecheck && npm test` must be green before you start. If not, say so and stop.
- Look at what exists: `npm run coverage`, `grep` the `GenRole` / `Location['kind']` unions, and the `ROSTERS` keys.

### 1. Concept
- **Pick it** (if the author did not): something the city lacks that adds a *new way to interact*, not a reskin. Look for
  capabilities with thin coverage (`npm run coverage`), districts with little to do, and everyday Neo places that are
  missing (arcade, capsule hotel, pawn shop, laundromat, noodle kitchen, tattoo parlour, karaoke den, pet shop, temple,
  tram stop, night market, data cafe, courier depot, rooftop garden...). Grep for the name: do not duplicate.
- **Decide the shape:**
  - *Lot*: a full place on a street, with rooms, people, many things to do (the gym). Own `GenRole` + `Location.kind`, rolled
    on its own random stream **after everything else on the street**, so no existing map changes. Default for this protocol.
  - *Spot*: a one-room encounter with a garrison (`content/spots.ts`). Different, smaller process; follow content-guides 6.
  - *District archetype*: a point in `districtgen.ts`'s space. Not this protocol.
- **The pitch** (this is what `review` mode shows, and nothing else yet). One screen:
  1. Name and one-paragraph concept, in the game's voice, with the Atlas angle (wallpaper, or the operator).
  2. Shape (lot/spot), where it grows (districts, rough frequency) and what it is rolled from (the axes, with 3-5 values each).
  3. Three example instances that show the range, including one incoherent one.
  4. "What each capability sees": 6-10 one-line lenses across fighters, thieves, crafters, performers, hackers, flirts,
     hustlers, animal-people, curious ones. These are examples; the real list is every skill, stat and drive.
  5. What existing systems it touches (fights, bounties, shutdown, fame, hustles...), any new hero state, and any risks.
  6. Two alternatives you considered and why this one.

  In `review` mode: post this and stop. Otherwise carry on.

### 2. Spec
- Copy [`TEMPLATE.md`](TEMPLATE.md) to `docs/locations/<id>.md` and fill every section. Mark anything the author did not
  decide as PROPOSED. Commit it (`Add spec for the <name> location type`).
- Hard-rule check (setting README) and texture checklist (world.md: a fee, a brand, an Atlas presence, a number).
- Names: invented only, pun/chirpy per naming.md, and `grep -ri` each one. Street kids are adults (TONE.md). Punch up.

### 3. Build (in this order; the compiler leads)
1. `types.ts`: `GenRole`, `Location['kind']`, an info interface on `Location`, any new hero state (optional, loads as 0).
   Then `npm run typecheck`: every exhaustive record that breaks (`grid.ts` SPECS, `roster.ts` ROSTERS, `mapgen.ts` BLURB/KIND/nameFor)
   is a decision to make.
2. `content/<id>s.ts`: the tables, all appendable and tolerant of unknown ids; `roll<Id>(rng, district, depth)` pure, in a fixed
   order, from its own stream; a day-price / situation helper. Situations are a **pure function of the clock**, not state.
3. `mapgen.ts`: `<ID>_CHANCE` by district, a stream keyed `<id>chance:<worldSeed>:<streetId>` and the `add(...)` placed after
   spots; `sketch` (roll, name, security, faction `v:<id>` if it has an owner, blurb, `loc.<id>`); an `expand` case for its rooms.
   Exclude the new roles from `Lot` so `LOTS` is untouched.
4. `content/archetypes.ts` (+ `PEOPLE` ages if odd) and `content/items.ts` for new people and things; rosters in the content
   file (a function of the place and room), wired in `roster.ts`.
5. The registry rows: `content/<id>afford*.ts`, each via `register('<id>', rows)`, following the row schema in
   `affordances.ts`. Aim for 60+ rows across: the body, craft, the crowd, gossip/hustle, crime/stealth, situations, wild
   cards, and things only some variants offer. **Between them the rows should draw on a wide variety of skills, stats and drives**; none is required at every place. Prose lives with the row,
   one report line per outcome and a thought for the wins; names via `{npc}`, pronouns via `{they}`/`{their}`.
6. The runtime kit: reuse `gymkit.ts`'s pattern (view of the place, `runCheck`, `say`, the stateful actions). *When the second
   location is built, lift the generic parts (`fmt`, `say`, `Result`, `Check`, `applyResult`, `runCheck`, `find`) into a shared
   `placekit.ts` and make `gymkit.ts` use it; the next location then only writes its own view and stateful actions.*
7. `<id>.ts`: candidates (`fits`, `matchingFeatures`, key prefix by pace) and `describe<Id>`; wire into `interactions.ts` and a
   per-beat tick into `run.ts` if it has one.
8. Hooks: `combat.ts` (`isLethal` kinds; `marked`), `shutdown.ts` (owner down/dead), `bounty.ts` (who has paper), `stage.ts`
   (`prestige`), `clock.ts` (`ACTION_MINUTES` for its key prefixes), `run.ts` (`AGGRESSIVE`), `text.ts` (one generic event
   entry + `intent:` entries), the status panel for any new state.
9. Scripts: `npm run <id>s` (roll and describe a batch) in `scripts/`, and add the place's features to `scripts/coverage.ts`.

### 4. Verify (all of it, in this order)
1. `npm run typecheck` and `npm test`.
2. `<id>.test.ts`, following `gym.test.ts`: determinism; tables only name things that exist; a wide space (every variant,
   shell, room and trait turns up; instances rarely match; the wild-card rate); district shaping; **existing maps unchanged**
   (the new slot is after all the others); people are cast; every row's `where` names real things; **a wide variety of skills,
   stats and drives drawn on**; situations are pure functions of the clock; **a forced run of every row** (situation and wild card
   switched on, three kinds of luck, text rendered and checked for stray tokens, and each row must tell something); the
   place-specific rules.
3. `npm run coverage`: nothing uncovered at the new place. Note thin spots (a capability with one row).
4. `npm run <id>s -- demo 8`: read them. A distribution check over ~600 rolls: no variant/shell/trait starves, rooms average 2+,
   distinct actions per instance high.
5. A **real-run probe**: 40+ autonomous runs (`runToEnd`); report how many found one, how many used one, what they did.
   Frequency should match the spec. If nobody uses it, the rows' appeal is wrong.
6. **Read the prose**: render ~15 lines from real runs. Check TONE.md (short sentences, understatement, specific numbers),
   pronoun tokens, report voice leads with "Blackbird", no sentence starts in lowercase.
7. `npm run test:full` in the background (it takes a long while). Do not block on it, but do not call the work verified
   until it has passed; report it when it lands.

### 5. Document and ship
- Add "What was built" to the spec (files, deviations from the draft, what is still open, numbers to watch).
- `content-guides.md`: a line or an entry for the new place; `README.md` script list; `world.md` / `factions.md` /
  `naming.md` if you added a kind of thing (not just an instance).
- Commit in sensible chunks, push to the designated branch. No PR unless asked.
- If something belongs outside this task (a bug noticed in passing), spawn it as a separate suggestion; do not fold it in.

### 6. Report
Short, plain, honest: what exists (axes and counts), how it was verified (and what is still running), real-run numbers, where
it differs from the spec, coverage thin spots, and the open items. Offer the next candidates.

## Coupled protocols (not written yet; keep these assumptions)

- **New capability** (skill, stat, drive, implant, archetype): run `npm run coverage`, add rows to every existing place that
  it reads naturally at, and list the places that still have nothing for it (optional).
- **New variant / shell / trait / room for an existing place:** add a row to the table, a test already covers the rest.
- Rows are the unit of growth. A table row or an affordance row is almost always the right size of change.

## Lessons from the gym build

- Let the compiler list the integration points; adding to a union is the cheapest survey.
- A forced run of every row finds bugs that a play-through hits only by luck (it found an unresolved token).
- Real runs are the reality check for frequency and appeal; unit tests cannot tell you whether anyone does the thing.
- Reuse what exists (venue fatigue, odds/synergy, bounties, shutdown, `isLethal`) before inventing a mechanism.
- Tone rules bite: street kids are adults; no real-world organisations' names; punch up.
- Keep the prose with the data. One generic event entry beats a hundred templates.
