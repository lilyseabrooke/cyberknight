# Procedural music: implementation plan

Status: **plan**. Nothing is built yet. Feel over balance applies here too: every number below is a first guess, to be tuned by ear.

Neo gets a score that is generated as it plays, not hand-authored tracks. It is built from native Web Audio synthesizers plus a small kit of
one-shot samples. It reads the night as it unfolds and moves along four axes: **intensity**, **danger**, **heat** and **place**.

## 1. The sound

Cyberpunk **dark, heavy synthwave techno**: darksynth weight with a techno engine underneath.

- **Clean sub-bass for weight.** A near-pure sine, mono, below ~90 Hz, following the root. It is never distorted. Whatever the rest of the
  mix is doing, the floor stays clean and solid.
- **An expressive electronic bassline on top of it** (the "character bass"). This is the voice that carries the situation. It morphs
  continuously:
  - **Locked:** root notes on or just off the kick, filtered saw, short and round, no drive. Quiet street, browsing a shop.
  - **Aggressive:** 16th-note syncopation, octave and fifth jumps, accents, slides, a screaming resonant filter envelope, saturation and
    bitcrush. A fight, a chase, an Ares Mk. IV screaming in.
- **Four-on-the-floor kick** for most of it, dropping to half-time or broken patterns for dread, and doubling up when the heat is on.
- **Dark minor harmony.** Aeolian at rest, Phrygian and harmonic minor as danger rises, pedal tones when it's really bad. A Picardy third
  is reserved for the rare actual win.
- **Pads, arps, leads and texture** layered in by intensity: detuned saw or PWM pads, gated arps, a siren-like lead for pursuit, rain and
  hum beds for the street.

The register matches `docs/TONE.md`: played with a straight face and fully committed. The music takes Blackbird as seriously as she takes
herself, and the comedy lives in the gap with the log. Six bucks still gets a triumphant bar.

## 2. Decisions (from the author)

| Question | Answer |
|---|---|
| Relation to the sim clock | **Free-run plus stingers.** The music keeps its own tempo grid. Game state moves the axes smoothly, and notable events queue quantized cues (fills, drops, stingers, tape-stops) on the next 16th, beat, bar or phrase. Playback speed (1×/2×/5×) never warps the tempo. |
| Axes | **Intensity**, **danger**, **heat/pursuit** and **place/district**. Hero condition (low HP, drunk) and mood/outcome are *not* axes. Low HP feeds danger (§5), and outcomes only drive cues. |
| Samples | **The author supplies the sample files** (§9). Every sample role has a synthesized stand-in, so the system plays fully with zero files and the kit drops in later. |
| This session | Plan only. |

## 3. Hard constraints

- **Zero dependencies.** Raw Web Audio API (`AudioContext`, oscillators, `BiquadFilterNode`, `WaveShaperNode`, `ConvolverNode`,
  `DynamicsCompressorNode`, `AudioBufferSourceNode`). No Tone.js. An `AudioWorklet` is allowed later only if a voice can't be done
  with native nodes (§12).
- **The sim never knows the music exists.** The music reads `World` and `GameEvent`s and never mutates them. It **never touches
  `w.rng`**, because the sim is deterministic and seeded (offline catch-up depends on that, see DESIGN.md §3). The music has its own
  `Rng` (`engine/src/rng.ts`, the class not the instance), seeded from the save seed plus `'music'`.
- **Split pure from browser.** Everything that decides *what* to play (axes, harmony, patterns, arrangement, cues, the bridge) is plain
  TypeScript with no Web Audio types, so it runs under vitest in node. Only `music/synth/` touches `AudioContext`.
- **Autoplay policy.** The `AudioContext` is created or resumed on a user gesture (the play button or a music toggle). Music is
  **off by default** until the player turns it on once. That choice and the volume persist in `localStorage`.
- **Idle game manners.** Fade out and `suspend()` the context when the tab is hidden, and fade back in on return. Offline catch-up
  never generates cues (§7).

## 4. Architecture

```
music/
  score/                 pure: no AudioContext, node-testable
    types.ts             NoteEvent, Bar, AxisState, Palette, Cue
    axes.ts              axis targets -> smoothed values, derived macros (§5)
    theory.ts            scales, modes, chord building, voicing, note<->Hz
    harmony.ts           progression banks, chord for each bar, mode drift by danger
    theme.ts             per-save identity: root, motif, progression picks (§8)
    patterns/
      kick.ts            four-floor / half-time / broken / double
      drums.ts           hats, clap/snare, perc, rides, fills
      sub.ts             root follower
      bass.ts            the character bassline generator (§6.2)
      pads.ts            chord voicings, rhythm (sustained / gated / stabs)
      arp.ts, lead.ts    arps from chord tones; motif-based lead
    arranger.ts          sections, phrase clock, which layers are on (§7)
    cues.ts              cue table, quantization, priority, cooldowns
    palettes.ts          district and location-kind palettes (§6.5)
    conductor.ts         generates bar N+1 while bar N plays -> NoteEvent[]
  synth/                 browser only
    engine.ts            AudioContext lifecycle, start/stop, visibility
    scheduler.ts         lookahead scheduler (§4.1)
    buses.ts, master.ts  bus routing, sidechain ducking, master chain (§10)
    voices/              sub.ts bass.ts kick.ts drums.ts pad.ts arp.ts lead.ts fx.ts
    samples.ts           manifest loader, decode, round-robin, synth fallbacks (§9)
    impulse.ts           generated reverb impulse responses
  bridge.ts              World + GameEvent[] -> AxisTargets + Cue[] (§5, §7), pure
  index.ts
components/
  MusicDock.tsx          on/off, volume, mounted in NightViewer
  MusicLab.tsx           debug: axis sliders, palette picker, cue buttons, live readouts (`?music=lab`)
```

Add `"music"` to `tsconfig.json` `include`. Vitest has no config file, so `music/**/*.test.ts` is picked up by `npm test` already.

### 4.1 Clocking

This uses the standard two-clock pattern.

- **Conductor (bar-ahead).** At each bar boundary the conductor reads the current smoothed axes and palette and generates the *next*
  bar as a list of `NoteEvent { t: step (0..15 or finer), voice, note | sample, vel, dur, params }`. Every musical decision happens here, so
  changes always land on bar lines unless a cue says otherwise.
- **Scheduler (lookahead).** A `setInterval` of about 25 ms (or a worker timer, so hidden-tab throttling doesn't stutter it) schedules
  every `NoteEvent` whose time falls within the next ~120 ms against `ctx.currentTime`. Parameter automation uses `setValueAtTime`,
  `linearRampToValueAtTime` and `setTargetAtTime`, never per-frame JS.
- **Quantized cues** go into a queue keyed by grid (`16th | beat | bar | phrase`). The conductor or scheduler splices them into the
  upcoming events at the next boundary of that grid.
- **Tempo** changes only at phrase boundaries (4 or 8 bars), apart from the deliberate tape-stop and push cues.

## 5. The axes

Every axis is a value from 0 to 1 with a **target** (set by the bridge) and a **current** value (slewed). The slew is asymmetric: it
rises fast and falls slow, so a fight snaps the music up and the comedown takes a phrase or two. **Hysteresis** applies wherever an axis
gates a layer on or off, so a value hovering at a threshold doesn't flicker the layer.

| Axis | What it means | Derived from (in `bridge.ts`) | Rise / fall |
|---|---|---|---|
| **intensity** | How much is *happening* to her right now | An event-energy accumulator with decay. Each event type has a weight: `fight_round` .5, `ambush` .8, `chase_round` .6, `dungeon_wave` .6, `gang_brawl` .7, `dragon_engage` .9, `crash_gig`/`dance`/`dj_set` .4 (a club can be intense and fun), quiet ones (`eat_noodles`, `sleep`, `chat`) push it *down*. Clamped and normalized. | ~1 beat / ~8 bars |
| **danger** | How likely this is to kill her | `dangerOf(location)` normalized through `tierOfDanger`, plus: a dragon flight here (`w.flight`, more once `noticed`, most during an Ares `scream` or `raid`), a damsel's foes present, HP ratio below 40% (this is where hero condition lives), `dying`/`security_closes_in`/`monitored_death`. | ~2 beats / ~4 bars |
| **heat** | How hunted she is | `heatLevel(w)` (`laylow.ts`) normalized, plus a pursuit boost while a chase is live (`give_chase`, `pursuit`, `chase_round`, `getaway`, `tail`, `dragon_chase`) that ends on `chase_end`/`chase_cut`. `lay_low` pulls the target down. | ~1 beat / ~16 bars |
| **place** | Where she is | Categorical: `Location.district` and `Location.kind` select a **palette** (§6.5). Moving crossfades palettes over a phrase. It is not a number. | phrase crossfade |

Weather (`w.situation.weather`) is not an axis. It picks the texture bed (§6.6).

### 5.1 Macros

Voices never read the raw axes. They read a handful of **macros**, so a single change to the mapping re-voices everything consistently:

```
aggression  = clamp(0.55*intensity + 0.35*danger + 0.25*heat)       // the bassline's clean->distorted dial
syncopation = clamp(0.6*intensity + 0.5*heat - 0.2*danger*(1-intensity))  // dread is sparse, a chase is busy
density     = clamp(0.8*intensity + 0.3*heat)                       // how many layers and how many notes
darkness    = clamp(0.8*danger + 0.2*(1-intensity))                 // mode, filter brightness, reverb size
drive       = clamp(heat*0.7 + intensity*0.4)                       // tempo push, hat drive, siren lead
```

These weights are placeholders, to be tuned in MusicLab by ear.

Three corners of the axis space show the shape:

- **High danger, low intensity** ("something is up there"): half-time kick, tonic pedal, Phrygian ♭2 rubbing, sub swells, a sparse and
  dark locked bass, a big dark reverb. Dread.
- **High intensity, low danger** (a bar brawl over a pool cue): full four-floor groove and a busy but mid-aggression bass. The music is
  having fun.
- **High heat** (a chase): tempo pushed up, driving 16th hats, the siren lead, a syncopated bass and quick fills.

## 6. The voices

### 6.1 Sub-bass

- One persistent oscillator (sine, plus about 3% of a sine an octave up for audibility on small speakers) into a lowpass at about 90 Hz,
  then into the sub bus. It is mono and never routed through drive or reverb.
- It follows the bar's root and changes on chord changes. At low density it holds whole notes. At higher density it re-triggers with the
  kick so the floor pulses with the groove.
- The kick ducks it for about 60 ms with a gain envelope (§10), so kick and sub don't stack into mud.
- It is clamped to E1–E2 (41–82 Hz) and folds the octave so the root always lands in range. **Test:** no sub note leaves that range.

### 6.2 Character bassline

This voice is the heart of the system and the main focus of phase 1.

**Signal chain (persistent mono voice):**

```
2x saw (detune 0..18 cents) + square at -1 oct (mix 0..0.4)
  -> lowpass (cutoff, resonance, envelope amount)
  -> pre-gain -> WaveShaper (tanh drive, 4x oversample) -> stepped-curve WaveShaper (bitcrush, aggression > .75 only)
  -> highpass ~110 Hz            <- band split: everything below belongs to the sub, so drive never muddies the floor
  -> bass bus (sidechained)
```

The highpass after the drive is what lets the bass go fully feral while the sub stays clean. Keep it.

**Parameters from `aggression` (a = 0 → 1):**

| Param | Locked (a=0) | Aggressive (a=1) |
|---|---|---|
| Notes per bar | 4–8, on or just off the kick | 10–16 with rests carved by syncopation |
| Pitch vocabulary | root only | root, octave, fifth, ♭7, ♭2 (with danger), chromatic approach notes |
| Gate length | 50% | 15–90% mixed, with accented longs |
| Glide/slide probability | 0 | 0.35 (`setTargetAtTime` on frequency) |
| Filter cutoff / env amount | 300 Hz / low | 900 Hz / high, fast decay (acid "yow") |
| Resonance (Q) | 1 | 12 |
| Drive | 1× (clean) | 20× tanh, bitcrush at the very top |
| Accent depth | none | ±40% velocity, plus cutoff on accents |

**Rhythm generator.** Each 16-step bar is built from a probability per step:

1. Start from **groove templates**, hand-picked 16-step weight arrays:
   - `locked`: kick steps 0/4/8/12 or the offbeat 8ths 2/6/10/14, the classic trance/techno offbeat bass
   - `rolling`: three 16ths per beat, skipping the kick step
   - `stab`: syncopated, 3-3-2 style
   - `acid`: dense with holes
   - `broken`: off-grid, for half-time dread
2. Blend the templates by `syncopation` and `aggression`, then sample. Use the **music Rng seeded per bar from (theme seed, bar index,
   phrase)** so a phrase repeats when the axes don't move, and the bassline reads as a *riff* rather than noise. Re-roll only on phrase
   change or a big axis jump. This repetition is essential to the feel.
3. Pick pitch per note from the vocabulary weighted by aggression, with motif bias from the per-save theme (§8).
4. **Invariant (test):** at `aggression = 0` every bass note is the root and falls on a `locked` step. At `aggression = 1` the
   average share of off-kick notes in a bar is above 60%.

### 6.3 Kick and drums

- **Kick:** a sample (§9), pitched with `playbackRate` so its fundamental sits near the key's root, layered with a short synth click. The
  synth fallback is a sine with a pitch envelope from 150 Hz down to 45 Hz over 80 ms, plus noise for the click.
  - The pattern comes from the macros: `half` (danger high and intensity low), `four` (the default), `four+` (four-floor with 16th ghost
    kicks before beat 1 at high drive), `broken` (fills only).
- **Clap/snare** on 2 and 4 from moderate density. A snare roll fill on the bar before a section change or on fill cues.
- **Hats:** closed 8ths, then offbeat open hats, then 16ths as `drive` rises. Velocity humanized ±10%, with a slight swing from the
  palette.
- **Perc/metal:** clanks and rims at density above 0.6. Industrial and slum palettes lean on these hard.
- **Ride** at peak sections only.

### 6.4 Pads, arp, lead

- **Pad:** 4–6 detuned saws or PWM voices, a slow-attack chord voiced from the harmony, lowpassed by `1 - darkness`, sent heavily to
  reverb and sidechained so it pumps. At high danger it gets thinner: an open fifth with the ♭2 rub instead of a full chord.
- **Arp:** chord tones at 16ths, with a filter and a ping-pong delay. It comes in at density above 0.5, and the pattern (up, up-down,
  random) comes from the theme.
- **Lead:** the per-save motif (§8), played at peaks only. At heat above 0.6 a **siren lead** takes over: a square with a slow pitch
  LFO between root and ♭2/♭3, an obvious nod to sirens.

### 6.5 Palettes (place)

A palette is data. Moving between districts crossfades the continuous parameters over a phrase and swaps discrete ones (kit, mode bias)
on the phrase boundary.

| District | BPM | Mode bias | Kit / color | Pad timbre | Swing | Texture |
|---|---|---|---|---|---|---|
| `market` | 108 | Aeolian, Dorian at rest | tight, clicky | bright PWM | 4% | crowd murmur noise |
| `nightlife` | 124 | Aeolian | full club kit, big claps | lush supersaw | 0 | none (club wins) |
| `tenement` | 112 | Aeolian | dusty, lo-fi hats | warm, filtered | 8% | hum, distant TV hiss |
| `industrial` | 128 | Phrygian | metal perc, hard kick | cold, narrow | 0 | machine drone |
| `corporate` | 118 | harmonic minor | clean, sterile, glassy | glassy FM bell + pad | 0 | air-handling whine |
| `slum` | 116 | Phrygian / Locrian tint | distorted, crunchy | grimy saw | 10% | dripping, rumble |

**Location-kind overrides** (on top of the district):

- `club`: force four-floor and full density, but cap aggression unless danger is set. She's dancing.
- `bar`: the whole mix goes through a lowpass about 2 kHz plus a little room reverb ("the song from the next room"). It lifts when a
  fight starts.
- `home` and the lab screen: ambient, with no drums and only sub and pad.
- `tunnel` and `lair`: long dark reverb and the half-time option weighted up.
- `boss`: danger floor of 0.7.

### 6.6 Texture and FX

- Weather beds: **acid rain** is filtered pink noise with random droplet ticks. **Neon fog** is a chorused high pad shimmer.
  **Heatwave** is a slow pitch wobble on the pad plus a faint bitcrushed hiss.
- Risers (filtered noise sweeps sized to the time until the next bar or phrase), impacts (a sample, or a synth sub-drop plus a noise
  burst), reverse cymbals and glitch stutters (re-trigger the last 1/32 of the master into itself via a short buffer capture, or fake
  it with gated repeats of the current voices).

## 7. Arrangement and cues

### 7.1 Sections

`arranger.ts` runs a small state machine on 8-bar phrases:

```
ambient -> groove -> build -> peak -> breakdown -> groove ...
```

- Density with hysteresis picks the *target* section. The arranger only moves at phrase ends, and it may hold a peak for at most about 4
  phrases before a forced breakdown. Even sustained chaos needs to breathe.
- Each section is a layer mask (which voices play) plus macro offsets. For example, `build` ramps the bass filter and adds a riser on its
  last bar.

### 7.2 Cues (stingers)

The bridge turns notable events into cues. Each cue has a **grid** (when it lands), a **priority** (only the highest pending cue per
grid slot wins) and a **cooldown** (so a 12-round fight doesn't fire 12 drops).

| Event(s) | Cue | Grid |
|---|---|---|
| first `fight_round` / `ambush` / `join_brawl` / `gang_brawl` of a group | **Drop**: riser over the remainder, then the next bar comes in at full section with an impact | bar |
| `dragon_notices`, `dragon_near`, Ares `scream` | **Dread hit**: sub-drop boom, the kick cuts for a bar, a siren swell | beat |
| `give_chase`, `pursuit`, `chase_mount` | **Push**: fill now, +4 BPM at the next phrase, double-time hats | 16th → bar |
| `chase_end` (good) | **Release**: filter sweep down, then back to groove | bar |
| a hit taken (`fight_round` bad, `injury`, `car_hit`) | **Flinch**: a 1-beat master lowpass dip, or a glitch stutter at high aggression | 16th |
| `kill`-shaped outcomes, `dragon` defeated, `victory` | **Impact** plus a crash. A real `victory` gets the Picardy major chord over a held pad. | beat / bar |
| `level_up`, `skill_up` | Short rising arp of the motif | beat |
| `death`, `dying_dies` | **Tape-stop**: `playbackRate` and oscillator frequency ramp down over about 1.2 s, then silence, then the lab ambient after 2 bars | 16th |
| `dawn` | Pads open up and the drums fade out over a phrase | phrase |

Outcomes (`good`/`bad`/`mixed`) only choose between cue variants. They don't move an axis.

### 7.3 Feeding events from the viewer

The viewer **steps the world ahead of what the player reads**: `stepWorld` queues chunks, and `release` reveals them every tick (2.4 s at
1×). The music should follow what is on screen, not the sim's future:

- Attach each chunk's `GameEvent[]` (and a small music snapshot) to the chunk. **Call the bridge on `release`**, not on `step`.
- Extend `Snapshot` (or a parallel `MusicSnap`) with `district`, `kind`, `danger`, `heat`, `hpRatio`, flight `{kind, phase, noticed}` and
  a `chasing` flag. All of these are computed at step time from the world, which stays read-only.
- **At 2× and 5×** the axes follow as normal. Cues are rate-limited (cooldowns scale with speed), and low-priority cues are dropped above
  2×.
- **Skip, offline catch-up and a jump to the digest** feed no events. Set the axes to the final state, then do one phrase crossfade.

## 8. Per-save identity

Each save rolls a **theme** from the music Rng (save seed plus `'music'`): a root key (biased toward E, F, F♯, G, A for low-end
weight), a 4-bar progression from each bank (rest, tense, peak), an arp pattern, and a **5–7 note motif**.

- The motif shows up in the lead at peaks, in the level-up arp, slowed down on the death cue and, softened, in the lab. Each Blackbird
  ends up with her own theme without anyone writing one.
- Progression banks (in scale degrees):
  - rest: `i–VI–III–VII`, `i–iv–VI–v`
  - tense: `i–♭II` pedal, `i–♭VI–♭II–i`
  - peak: `i–VI–VII–i`, `i–VII–VI–V(harmonic)`
  - danger can pin the bass to a **tonic pedal** while the chords move above it.

## 9. Samples (author-supplied)

- **Location:** `public/audio/` plus `public/audio/manifest.json`, loaded with `fetch` and `decodeAudioData` once the context starts.
  Loading never blocks playback: synth fallbacks play until the buffers arrive.
- **Format:** mono WAV, 44.1 or 48 kHz, 16-bit, trimmed (no leading silence), peak-normalized to −1 dBFS, ideally under 60 KB each. If
  WAV grows too big, `.m4a` (AAC) decodes everywhere including Safari.
- **Naming:** `role_palette_n.wav`, with `any` for shared samples, e.g. `kick_industrial_1.wav`, `hat_closed_any_2.wav`.
- **Manifest** (one entry per file, plus optional tuning):
  ```json
  { "kick_industrial_1": { "file": "kick_industrial_1.wav", "role": "kick", "palette": "industrial", "rootHz": 52, "gain": 0.9 } }
  ```
- **Roles wanted** (2–3 variants each where noted; a palette falls back to `any`):

  | Role | Notes |
  |---|---|
  | `kick` ×3 | punchy transient and short body. The sub supplies the low end, so a long 808 tail fights it. Give its pitch as `rootHz`. |
  | `clap`, `snare` ×2 | dry; the reverb is added in-engine |
  | `hat_closed` ×3, `hat_open` ×2, `ride` | |
  | `perc` ×4 | metal clanks, rims, shakers. This is where industrial and slum get their character. |
  | `impact`, `boom` | for drops and dread hits |
  | `riser`, `reverse_cymbal` | optional: synth versions are good, and they can be stretched to fit |
  | `glitch` ×2, `vox` ×2 | optional chopped one-shots for peak sections and stingers |
- **Playback variation:** round-robin across variants, ±2% `playbackRate` drift (not on the kick, which is key-tuned) and velocity to gain
  and to a lowpass so soft hits are also darker.
- **Every role has a synth fallback renderer** (`samples.ts`) that writes an `AudioBuffer` at startup. Phase 1 ships with only these.

## 10. Mix and master

- **Buses:** `sub`, `bass`, `drums`, `music` (pads, arp, lead) and `fx`. Sends go to one `reverb` (a `ConvolverNode` with a generated
  noise-decay IR whose length comes from the palette and darkness) and one `delay` (feedback through a bandpass, synced to tempo).
- **Sidechain:** Web Audio has no native sidechain, so it's faked. At every kick time the scheduler automates a gain dip on the `bass`
  and `music` buses (depth up to about −8 dB, release about 1/8 note), and a shallower dip on `sub`. The pump depth rises with density.
- **Master:** highpass 25 Hz → glue `DynamicsCompressor` (gentle) → tanh soft clip → limiter-style compressor (fast, high ratio) →
  user volume. Below about 120 Hz everything stays mono.
- **Levels:** the music sits *under* reading. The default volume is modest, and there's an optional `dialogue duck` that dips the master
  slightly whenever the viewer is waiting on her question (ASK beats).

## 11. Performance

- **Persistent voices** for sub, bass, pad and lead: oscillators run constantly and are gated with gain and frequency automation.
  **Throwaway nodes** only for one-shot sample hits.
- About 60 active nodes at peak; it needs to stay smooth on a mid-range phone. The pad voice count drops to 3 under a `lowPower` flag
  (set when the scheduler sees late callbacks).
- The music snapshot is built from data `step` already has, so the bridge does no heavy world queries.

## 12. Phases

Each phase ends playable in MusicLab (`?music=lab`), with `npm test` and `npm run typecheck` green.

1. **Engine and the bass.** `synth/engine.ts`, the scheduler, the conductor skeleton, `axes.ts` with the macros, the kick (synth
   fallback), the **sub**, the **character bass** with the full locked-to-aggressive morph, and the band-split chain. MusicLab has sliders
   for intensity and danger plus readouts of the macros. *Done when sweeping the aggression slider from 0 to 1 goes from clean and locked
   to distorted and syncopated with no clicks, and the sub stays clean throughout.*
2. **Groove and harmony.** Drums (synth fallbacks), `theory`/`harmony`/`theme`, pads, the arranger sections, the sidechain pump and the
   master chain.
3. **Samples.** Manifest loader, round-robin, kick tuning and the author's kit as it arrives.
4. **Bridge.** `bridge.ts`, the music snapshot on chunks, feeding on `release`, the cue table, quantization, cooldowns, speed scaling and
   the `MusicDock` toggle in NightViewer. *The first time it plays along with a real night.*
5. **Heat and place.** The heat axis end to end (tempo push, siren lead, hat drive), the district palettes with crossfade, the
   location-kind overrides and the weather beds.
6. **Polish.** Arps and the motif lead, death, victory and dawn cues, the lab ambient, glitch and stutter, and an `AudioWorklet` only if
   a voice needs it (e.g. a nicer bitcrusher or oversampled drive).

## 13. Tests (all in `npm test`, all node-side, no balance tests)

- **Determinism:** the same theme seed and axis trajectory produce identical bars, and the music never reads or advances `w.rng`. The
  test runs `step` with the bridge attached and asserts `rngPosition` matches a run without it.
- **Bass invariants** (§6.2) at aggression 0 and 1. **Sub range** (§6.1). Every pitched note is in the current scale, apart from
  deliberate chromatic approach notes, which are tagged.
- **Axes:** asymmetric slew and hysteresis (no layer flip-flop while a target hovers at a threshold).
- **Bridge:** representative event streams map to the expected targets and cues (a fight raises intensity, a chase raises heat, an Ares
  scream raises danger and emits a dread cue). Cooldowns hold across a long fight.
- **Cue coverage:** every cue in the table has a renderer (as the text layer's "every event kind has templates" test does).

Listening is the real test. The rest catches regressions.

## 14. Open questions (for later, not blockers)

- Should vehicles get their own palette overlay (engine-drone texture, a faster grid while driving)? `hero.vehicle` is right there.
- Lab screen music: the same theme in ambient form, or a fixed "home" piece? The plan above assumes the ambient form.
- Do companions or romance moments deserve a softer cue family? That probably belongs to the dropped mood axis, so leave it out unless
  it's missed.
