# Naming

## The golden rules

1. **Specific beats generic.** "Chem-Mart" > "pharmacy". "BARK-100" > "guard dog". Numbers, models and brand names are
   funnier and more Neo.
2. **Invented brands only.** Never real companies, products, celebrities or parties.
3. **Punch up.** Names mock corporations and ego, never the poor, minorities or the vulnerable.
4. **Check it's not already used.** Grep before you commit (`grep -ri "<name>" engine/src docs`).

## People

- **Generated people** use the person generator (`engine/src/people.ts`): rolled names, pronouns, loadouts.
  Don't hand-name generic NPCs; define an archetype and let it roll.
- **Hand-named cast** gets a *memorable human name plus a role or nickname*: Dutch Okonkwo, Prophet Ray, Doc Hexamer,
  Chef Bao, Madame Zero. Pattern: **title/nickname + short name**, or a plain name with a flavor surname.
- **Diverse by default.** Names should span many cultures, as in a real megacity. Don't tie culture to criminality or
  incompetence.
- **Blackbird** is the callsign. Her **government name** is rolled per save and is *astonishingly uncool* (Brenda
  Pilchard, Gary-Ann Fosdyke). Used sparingly, usually to deflate her.
- **Board members** have grand, double-barreled names that sound like law firms (Aurelio Grimsby-Vault). See
  [`board.md`](board.md).
- **Pronouns:** use tokens (`{They} shake{s} {their} head`), never hard-code he/she for generic NPCs. See TONE.md.

## Places

- **Generated** places take names from tables in `content/dungeons.ts` / `content/spots.ts` / `mapgen.ts`. Add to the
  table, don't special-case.
- **Atlas sites:** `Atlas <Type> <Code>`: Depot, Relay Station, Checkpoint, Freight Annex, Patrol Post,
  Pacification Annex… + a short code (K-7, 4-B, Sigma). Bureaucratic, faintly ominous, numbered.
- **Gang sites:** `<gang's> <place>` (the Chrome Vipers' chop shop).
- **Venues** are a noun phrase with an attitude: The Rusty Halo, The Neon Pharaoh. Keep to two or three words.
- **Districts:** generated ones (`engine/src/districtgen.ts`) get a cheerful two-word name (Lantern Bazaar, Kiln Yards) plus a
  brief description ("Over-policed bazaar"). The last word says what kind of place it is. Reserve names that aren't
  built from those tables for canon places.

## Brands and shops

- **Pun / portmanteau / chirpy** pattern: Chem-Mart, Bullets & Bagels, Spray & Pray Paint Supply. Cheerful commercial
  tone, ideally with a second, darker meaning.
- **Titanware brands** are *attentive and clinical*: Panopt, Lidless, Vigil Mk. 3, VitalSigns+, "Titanware Sees You", "Think the Right Way".
  They sound like a hospital and a panopticon had a baby. Branch numbers are three digits (Branch 214). Never edgy, never loud; the menace is that it
  is so interested in you. (Atlas brands are soothing and safe; Titanware brands are watchful and warm.)
- **Atlas brands** are *soothing and safe*: Safe-T, Halcyon, Bastion, Aegis, "Atlas Care+". Never edgy; edgy is for
  gangs. The irony is the whole point.

## Tech, models and machines

- **Model numbers carry the joke.** BARK-100 (a pound-shop toy) to BARK-530 (not a fight she can win). Higher is
  worse. Follow the pattern `NAME-###` or `Name Mk. N`.
- **Dragons:** Greek gods + Mark numbers (Apollo Mk. II, Artemis Mk. I and II, Hera Mk. V, Hermes Mk. I and III, Demeter Mk. I-IV,
  Ares Mk. II and IV); marks need not be contiguous. Individuals get CAPS callsigns (CINDERJAW, `HERMES-III "NEXT-DAY"`,
  `DEMETER-### "TITHEMOTHER"`, `ARES-### "QUIET HOURS"`). See [`world.md`](world.md).
- **Drones and robots:** a role-noun and a number or an unfortunate cheerfulness ("Sentinel-7", "Buddy").
- **Weapons:** physical oddities for low tier ("Excalibur" (a tire iron), baseball bat named "Judgment"); crisp
  tech names for high tier (thermal katana, rail revolver, Helix pulse rifle). Named melee gets quotes and a joke.
- **Implants:** pitch/catch pairs (`content/implants.ts`): the street doc's sales pitch and the honest catch.
- **Stims and meds:** brandy-sounding or clinical-sounding; meds are plain (patch kit, med pack, trauma kit) because
  clarity matters when it's a lifeline.

## Gangs and groups

`Adjective/Noun + Noun`, two words: Chrome Vipers, Saint Sixers, Neon Marrow, Rust Choir. A material, a
neon/vibe word, a religious/musical/animal word. Pick a **vice** and a **style** to go with the name.

## Money and numbers

- Currency is **neodollars (`nd`)**. Prices are specific: 55nd, 25nd. Avoid round, generic numbers in flavor text.
- Escalating specific numbers are comedy: "half a mil of monitoring implants", "six separate groups".
