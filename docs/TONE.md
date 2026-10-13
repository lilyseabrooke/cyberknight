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

**Per-save personality:** every save's Blackbird is a *perturbation* from that baseline. The perturbation is expressed as drive weights in the decision AI (see DESIGN.md §4) and as voice quirks in the prose layer. Examples:
- *Airheaded ditz* — dangerously curious; pokes everything.
- *Hothead* — picks fights with enemies far above her level.
- *Hopeless romantic* — flirts at the worst times; every bartender is The One.
- *Lush* — thirst drive dominates; "just one" is a lie.
- *Gambler*, *glutton for attention*, *tech-fetishist*, and so on (list grows with content).

A personality is a set of trait weights plus quirk tags the writing system can key on, so the same event reads differently for a ditz vs. a hothead.

## Content tagging (for the template system)

Lines are tagged by: voice (`report` | `thought`), event type, location type, mood, outcome (`good` | `bad` | `mixed`), relationship state, personality quirks, competence band. The engine picks the best match; variety and callbacks are preferred over repeating a line.
