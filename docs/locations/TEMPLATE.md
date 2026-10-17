# Location spec: <Name>

**Status:** DRAFT | IMPLEMENTED. Everything is **PROPOSED** unless it is in "Decided". Numbers are starting points; they are
not tuned (principle 2).

## 0. Decided
What the author said (concept, shape, anything they ruled in or out). Blank in `PROTOCOL: new location` runs except the concept.

## 1. How the three principles shape this spec
| Principle | In practice |
|---|---|
| Maximalism | the axes, and how many values each has |
| Unbalanced | the wild cards, and what is deliberately left untuned |
| Multidimensional | the rows, a wide variety of skills, stats and drives |

## 2. Concept
One paragraph in the game's voice. Say what the place *is for* to different kinds of person. Say how Atlas shows up.

## 3. Placement
- Role / kind; own random stream (named); chance a street has one, by district; variant weights by district.
- Security, crowd, faction (a venue faction `v:<id>` if it has an owner).

## 4. A place is a point in a space
Every axis is rolled independently, from the place's own stream. List each with its values:
- **Variant** (what it mostly is): names (10+ each), blurbs (3+), what it trains/sells/offers, price, vibe, Atlas wallpaper.
- **Shell** (the building it is in): 10+.
- **Size, condition, tier** (independent of one another).
- **Traits** (0-3, from 30+): ownership, tone, access, scene, kit, quirks. They may contradict.
- **Situation** (what is happening today; a pure function of the clock): 15+.
- **Wild cards** (about 1 in 12): 6+, each a rule-breaker.

## 5. Rooms and features
- Rooms: a table (chance by variant/size/shell, gate, hidden, security, blurbs, signature features).
- Features: the objects rows hang off (30+), each in a room.

## 6. People
Archetypes cast by room and variant; the owner (does killing them shut the place?), staff, regulars, visitors the
situations bring. Names come from the person generator. Pronoun tokens.

## 7. Affordances: what each capability sees
The row schema (id, where, needs, sees, does/stakes, consequence, drives). Then the table: capability (open set) / what it
sees / what it does. Then the wild cards. **Include a wide variety of skills, stats and drives** (none is required). Last row: "(your next
capability goes here)".

## 8. Systems
Anything with real state behind it: a new hero state, a ladder, a price that follows a counter, a lasting consequence.
Say what limits it (the world, not a timer).

## 9. Setting texture and hard rules
Texture checklist (fee, brand, Atlas presence, specific number). The six hard rules, one line each.

## 10. Engine touchpoints
A table of files and what changes (use the list in `PROTOCOL.md` step 3).

## 11. Tests
The list from `PROTOCOL.md` step 4.2, plus the place-specific rules.

## 12. Coverage
Run `npm run coverage`; list thin spots.

## 13. Open items
What the author should decide, with a proposed default for each.
