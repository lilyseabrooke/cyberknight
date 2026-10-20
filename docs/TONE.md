# CYBERKNIGHT — Tone & Voice Guide

Source of truth for how the game sounds. Update it as the author gives feedback.

## The register

**Over-the-top, rule-of-cool cyberpunk, played with a straight face.** Lean hard into the clichés: chrome, jacking in, corpo scum, neon rain, black-market implants, synthetic noodles, ICE, fixers, street docs, mirrorshades. The joke is rarely that a trope exists. It's the hero's cheerful, total commitment to it, and the gap between how things go in her head and how they go in reality.

**Raunch level:** adult, not Disney. Flirting, drinking, hookups and bad decisions are fair game; the camera fades to black rather than going explicit. Innuendo is welcome. Nothing blow-by-blow.

## Two voices, interleaved

Every report mixes two voices for contrast.

1. **Field report** — neutral, clipped, noir-ish third person. States what happened, in short sentences, with deadpan understatement.
   - *"Blackbird took the corpo down in one hit."*
2. **Blackbird's own thoughts** — first person, cocky, self-assured, certain she's the hero. Often wrong, often upbeat about it. Rendered distinctly (italic / different color in the UI).
   - *"Jacked in, no problem."*

The comedy often lives in the gap: the field report records a catastrophe while Blackbird's thought is unbothered, or the field report is dry while she narrates a minor win as a legendary feat.

## Reference samples (from the author)

**Good outcome:**
> Jacked in, no problem. Bit of firewall went down easy, cleaned the bastards out for all they're worth. Six bucks. Jackpot.

Notes: triumphant tone, tiny payoff. Confidence outruns the reward.

**Disastrous outcome:**
> Blackbird took the corpo down in one hit. Didn't realize he had about half a mil of monitoring implants in his chrome. Six separate groups, all scrambling to her index. She's only sweating a little.

Notes: success that is secretly the mistake; escalating numbers ("half a mil", "six separate groups"); the closing understatement ("only sweating a little") is the punchline.

## Craft rules

- **Short, punchy sentences.** Fragments are fine. A two-word sentence can be the joke.
- **Understatement beats exclamation.** Disaster reads calmer than triumph.
- **Specific numbers and brand-ish nouns** are funnier than vague ones. ("Six separate groups.")
- **Blackbird never doubts herself in-voice**, even when the field report is clearly documenting a bad decision. Self-awareness, when it arrives, is rare and earned (late game, high competence).
- **Callbacks.** The world remembers. Lines should reference prior events and relationships when the memory system provides them ("the bartender from the Rusty Halo looks up, sees her, and quietly locks the till").
- **Voice evolves.** As Firmware upgrades raise competence, her thoughts get slightly sharper and her field reports less catastrophic. The swagger stays.

## The hero

**Blackbird** is the cyberknight's callsign. Her *government name* is randomly generated per save and is **astonishingly uncool** (think: Brenda Pilchard, Gary-Ann Fosdyke). It's used sparingly: in the lab, on official documents, by the Atlas bureaucracy and by anyone who wants to deflate her. She hates it.

**Baseline:** cocky, self-assured, knows she's the hero.

**She never admits she dies.** The lab rebuilds her from a cached copy, and she keeps that to herself: if Atlas learned
about the resurrection tech it would come for the lab. Out loud, every death is spun: she narrowly survived, it was a
rumour (Atlas puts them about), it was a lookalike, it was a flesh wound. Her private thoughts can know better
("I would rather not get into it"); her mouth, her songs and anything said in public never do.

**Per-save personality:** every save's Blackbird is a *vector* of independent 0..1 traits (0.5 = unremarkable), not a type. The vector is rolled once per save (`engine/src/personality.ts`) and drives both the decision AI (see DESIGN.md §4) and the voice quirks in the prose layer. Traits:
- *Wants:* `fame` (the whole city knows her name), `justice` (put bad guys through walls), `impress` (impress girls, all of them), `romantic` (The One, singular, and faithful to her), `drink`, `gamble`, `temper`.
- *Nerve and judgement:* `courage`, `reckless`, `impulsive`, `thrill`.
- *Appetites:* `curiosity`, `greed`, `appetite`, `techy`, `artistry`.
- *Character:* `vanity`, `kindness`, `honesty`, `loyalty`, `grudge`, `mischief`, `sociable`, `animal`.

Characters emerge from combinations: a high-`impress`, low-`romantic` girl works the room; high `romantic` with low `impress` falls for the first bartender and then is loyal to her; high `justice` with high `temper` picks fights, but only with people who have it coming; high `fame` and low `honesty` is trouble with a hashtag. Traits at 0.7+ colour her thoughts, so the same event reads differently for a lush than for a showboat.

## Content tagging (for the template system)

Lines are tagged by: voice (`report` | `thought`), event type, location type, mood, outcome (`good` | `bad` | `mixed`), relationship state, personality traits (quirks surface at >= 0.7), competence band. The engine picks the best match; variety and callbacks are preferred over repeating a line.

## People and pronouns

- **Use the person's own pronouns.** He, she, it and they all appear, because the people do. Reserve "they" for groups, non-binary people, and genuine not-knowing; a neutral line where the engine knew the person's gender is a bug in the line.
- **Write the tokens, not the words** (`{They} shake{s} {their} head`), so the same line works for anyone. See `engine/src/pronouns.ts`. Don't write "he" or "she" for a generic NPC; do for Blackbird, and for the named cast where it never varies.
- **"Street kid" is a young punk,** an adult. Keep the slang, not the childishness: no ten-year-olds, no "children", no ducklings.

