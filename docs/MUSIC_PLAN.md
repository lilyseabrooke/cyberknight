# Procedural music: implementation plan

Status: **plan**. Nothing is built yet. Feel over balance applies here too: every number below is a first guess, to be tuned by ear.

Neo gets a score that is generated as it plays, not hand-authored tracks. It is built from native Web Audio synthesizers plus a small kit of
one-shot samples. It reads the night as it unfolds and moves along four axes: **intensity**, **danger**, **heat** and **place**. It is
written like a song, not a loop. Material is invented, repeated, varied, dropped and brought back across an arc, so a stretch where nothing
changes in the game still develops musically.

## 1. The sound

Cyberpunk **dark, heavy synthwave techno**: darksynth weight with a techno engine underneath.

- **Clean sub-bass for weight.** A near-pure sine, mono, below ~90 Hz, following the root. It is never distorted.
- **An expressive electronic bassline on top of it** (the "character bass"). It morphs continuously from **locked** (root notes on or
  just off the kick, filtered, clean) to **aggressive** (16th-note syncopation, octave jumps, slides, a screaming resonant filter,
  saturation and bitcrush).
- **Four-on-the-floor kick** for most of it, dropping to half-time or broken patterns for dread, and doubling up when the heat is on.
- **Dark minor harmony.** Aeolian at rest, Phrygian and harmonic minor as danger rises, pedal tones when it's really bad. A Picardy third
  is reserved for the rare actual win.
- **A full ensemble above the groove:** pads, darksynth chord stabs, plucked ostinatos, arps, a motif-driven lead and a counter-melody
  that answers it, a siren lead for pursuit, FM bells, a formant choir, drones, and weather and street texture (§7).

The register matches `docs/TONE.md`: played with a straight face and fully committed. The music takes Blackbird as seriously as she takes
herself, and the comedy lives in the gap with the log. Six bucks still gets a triumphant bar.

## 2. Decisions (from the author)

| Question | Answer |
|---|---|
| Relation to the sim clock | **Free-run plus stingers.** The music keeps its own tempo grid. Game state moves the axes smoothly, and notable events queue quantized cues on the next 16th, beat, bar or phrase. Playback speed (1×/2×/5×) never warps the tempo. |
| Axes | **Intensity**, **danger**, **heat/pursuit** and **place/district**. Hero condition (low HP, drunk) and mood/outcome are *not* axes. Low HP feeds danger (§5), and outcomes only drive cues. |
| Samples | **The author supplies the sample files** (§15). Every sample role has a synthesized stand-in, so the system plays fully with zero files. |
| Scope beyond the rhythm section | Every melodic and harmonic layer is designed to the same depth as the bass, on one shared instrument model (§6–§9). |
| Form | **Songs, not loops.** The music follows the arc of a song. Even with constant axes it never repeats the same bar indefinitely, and it adds and drops elements deliberately, by plan, never at random (§10). |

## 3. Hard constraints

- **Zero dependencies.** Raw Web Audio API (`AudioContext`, oscillators, `PeriodicWave`, `BiquadFilterNode`, `WaveShaperNode`,
  `ConvolverNode`, `DynamicsCompressorNode`, `ConstantSourceNode`, `AudioBufferSourceNode`). No Tone.js. An `AudioWorklet` is allowed
  later only if a voice can't be done with native nodes.
- **The sim never knows the music exists.** The music reads `World` and `GameEvent`s and never mutates them. It **never touches
  `w.rng`**, because the sim is deterministic and seeded (offline catch-up depends on that, see DESIGN.md §3). The music has its own
  `Rng` (`engine/src/rng.ts`, the class not the instance), seeded from the save seed plus `'music'`.
- **Split pure from browser.** Everything that decides *what* to play (axes, harmony, melody, patterns, form, the arc planner, cues, the
  bridge, patch definitions) is plain TypeScript with no Web Audio types, so it runs under vitest in node. Only `music/synth/` touches
  `AudioContext`.
- **Autoplay policy.** The `AudioContext` is created or resumed on a user gesture. Music is **off by default** until the player turns it
  on once. That choice and the volume persist in `localStorage`.
- **Idle game manners.** Fade out and `suspend()` the context when the tab is hidden, and fade back in on return. Offline catch-up never
  generates cues (§11.3).

## 4. Architecture

```
music/
  score/                   pure: no AudioContext, node-testable
    types.ts               NoteEvent, Bar, AxisState, Palette, Cue, Patch, Material, Section
    axes.ts                axis targets -> smoothed values, derived macros (§5)
    theory.ts              scales, modes, chords, note<->Hz
    harmony.ts             progressions, harmonic rhythm, cadences, pedals, modulation (§8)
    voicing.ts             voice leading, register windows, low-interval limit (§8.3)
    melody.ts              motifs, transformations, phrase forms, pitch rules (§9)
    theme.ts               per-save identity (§14)
    patches/               instrument definitions as data, one file per role (§6, §7)
    roles/                 one generator per role: sub, bass, drums, pad, stabs, pluck, arp, lead, counter, siren, bells, choir, drone, texture
    material.ts            the material pool: invent, vary, recall (§10.2)
    phrase.ts              bar roles inside a phrase: statement, repeat, variation, turnaround (§10.3)
    sections.ts            section types and their purpose (§10.4)
    arc.ts                 the arc planner: energy curve, fatigue, move scoring (§10.5)
    orchestra.ts           orchestration rules: slots, spotlight, density, lifetimes (§10.6)
    cues.ts                cue table, quantization, priority, cooldowns (§11)
    palettes.ts            district and location-kind palettes (§12)
    conductor.ts           runs it all: generates bar N+1 while bar N plays -> NoteEvent[]
  synth/                   browser only
    engine.ts              AudioContext lifecycle, start/stop, visibility
    scheduler.ts           lookahead scheduler (§4.1)
    voice.ts               builds a playable voice from a Patch (§6)
    pool.ts                voice allocation: mono, poly, stealing
    buses.ts, master.ts    buses, sidechain ducking, master chain (§16)
    samples.ts             manifest loader, decode, round-robin, synth fallbacks (§15)
    impulse.ts             generated reverb impulse responses
  bridge.ts                World + GameEvent[] -> AxisTargets + Cue[] (§5, §11), pure
  index.ts
components/
  MusicDock.tsx            on/off, volume, mounted in NightViewer
  MusicLab.tsx             debug (`?music=lab`): axis sliders, palette picker, cue buttons, a patch auditioner and the arc timeline (§10.8)
```

Add `"music"` to `tsconfig.json` `include`. Vitest has no config file, so `music/**/*.test.ts` is picked up by `npm test` already.

### 4.1 Clocking

This uses the standard two-clock pattern.

- **Conductor (bar-ahead).** At each bar boundary the conductor asks the arranger what the next bar is (section, phrase position, bar
  role, active roles and their material), reads the smoothed axes and the palette, and has each role render the next bar into
  `NoteEvent { t, role, note | sample, vel, dur, params }`. Every musical decision happens here.
- **Scheduler (lookahead).** A `setInterval` of about 25 ms (or a worker timer, so hidden-tab throttling doesn't stutter it) schedules
  every `NoteEvent` whose time falls within the next ~120 ms against `ctx.currentTime`. Parameter automation uses `setValueAtTime`,
  `linearRampToValueAtTime` and `setTargetAtTime`, never per-frame JS.
- **Quantized cues** go into a queue keyed by grid (`16th | beat | bar | phrase`) and are spliced in at the next boundary of that grid.
- **Tempo** changes only at phrase boundaries, apart from the deliberate tape-stop and push cues.

## 5. The axes

Every axis is a value from 0 to 1 with a **target** (set by the bridge) and a **current** value (slewed). The slew is asymmetric: it
rises fast and falls slow, so a fight snaps the music up and the comedown takes a phrase or two. **Hysteresis** applies wherever an axis
crosses a threshold that enables something.

| Axis | What it means | Derived from (in `bridge.ts`) | Rise / fall |
|---|---|---|---|
| **intensity** | How much is *happening* to her right now | An event-energy accumulator with decay. Each event type has a weight: `fight_round` .5, `ambush` .8, `chase_round` .6, `dungeon_wave` .6, `gang_brawl` .7, `dragon_engage` .9, `crash_gig`/`dance`/`dj_set` .4 (a club can be intense and fun). Quiet ones (`eat_noodles`, `sleep`, `chat`) push it *down*. | ~1 beat / ~8 bars |
| **danger** | How likely this is to kill her | `dangerOf(location)` normalized through `tierOfDanger`, plus: a dragon flight here (`w.flight`, more once `noticed`, most during an Ares `scream` or `raid`), a damsel's foes present, HP ratio below 40%, `dying`/`security_closes_in`/`monitored_death`. | ~2 beats / ~4 bars |
| **heat** | How hunted she is | `heatLevel(w)` (`laylow.ts`) normalized, plus a pursuit boost while a chase is live (`give_chase`, `pursuit`, `chase_round`, `getaway`, `tail`, `dragon_chase`) that ends on `chase_end`/`chase_cut`. `lay_low` pulls the target down. | ~1 beat / ~16 bars |
| **place** | Where she is | Categorical: `Location.district` and `Location.kind` select a **palette** (§12). Not a number. | phrase crossfade |

Weather (`w.situation.weather`) is not an axis. It picks the texture bed (§7.14).

### 5.1 Macros

Voices and the planner never read the raw axes. They read **macros**, so a single change to the mapping re-voices everything consistently:

```
aggression  = clamp(0.55*intensity + 0.35*danger + 0.25*heat)       // clean -> distorted, in every patch that has a drive or filter route
syncopation = clamp(0.6*intensity + 0.5*heat - 0.2*danger*(1-intensity))  // dread is sparse, a chase is busy
density     = clamp(0.8*intensity + 0.3*heat)                       // notes per bar, inside whatever layers are on
darkness    = clamp(0.8*danger + 0.2*(1-intensity))                 // mode, filter brightness, reverb size, which bed (pad or choir)
drive       = clamp(heat*0.7 + intensity*0.4)                       // tempo push, hat drive, siren lead, gated pads
energyBand  = [floor, ceiling] from intensity, danger and heat      // how loud and full the arrangement may get (§10.5)
volatility  = clamp(0.3 + 0.7*intensity)                            // how far the arc may swing inside the band
```

These weights are placeholders, to be tuned in MusicLab by ear.

Three corners of the axis space show the shape:

- **High danger, low intensity** ("something is up there"): half-time kick, tonic pedal, Phrygian ♭2 rubs in the choir, a drone, sub
  swells, a sparse and dark locked bass, a big dark reverb. A narrow, low energy band, so the arc moves in small, uneasy steps.
- **High intensity, low danger** (a bar brawl over a pool cue): a full four-floor groove, stabs on the bass accents and a busy but
  mid-aggression bass. A wide band, so big builds and drops.
- **High heat** (a chase): tempo pushed up, driving 16th hats, gated pads, the siren lead as the foreground voice, syncopated bass.

## 6. Instruments: one patch model for everything

No role gets a hand-wired chain. Every pitched instrument, the bass included, is a **patch**: plain data in `score/patches/` that
`synth/voice.ts` turns into nodes. Adding an instrument means writing data and a role generator, not new audio plumbing.

### 6.1 The patch

```ts
interface Patch {
  id: string;
  poly: number;                 // 1 = mono (glide and legato allowed); n = voice pool size
  osc: OscLayer[];              // summed
  filter?: { type: 'lowpass' | 'bandpass' | 'highpass'; cutoff: number; q: number; keytrack: number; env: number };
  formant?: { vowels: Vowel[] }; // parallel bandpass bank instead of `filter`, for the choir (§7.12)
  env: { amp: Adsr; filter?: Adsr; pitch?: { amount: number; decay: number } };
  lfo?: Lfo[];                  // rate in Hz or a tempo division; shape; destination; depth
  drive?: { amount: number; crush?: number };   // tanh WaveShaper (oversampled), optional stepped-curve crusher
  post?: { hp?: number; lp?: number };          // band-split, e.g. the bass's post-drive highpass
  glide?: number;
  gate?: { division: '1/16' | '1/8'; depth: number }; // trance gate on the amp, synced
  bus: BusId;
  sends: { reverb: number; delay: number };
  mods: ModRoute[];             // how the music bends this patch (§6.3)
}

interface OscLayer {
  wave: 'sine' | 'tri' | 'saw' | 'square' | 'pulse' | 'noise' | 'fm' | 'wavetable' | 'sample';
  octave: number; detune: number; level: number;
  unison?: { voices: number; spread: number };   // supersaw and friends
  pulse?: { width: number };                      // PWM: saw -> threshold WaveShaper, width from a ConstantSourceNode (modulatable)
  fm?: { ratio: number; index: number };          // a modulator oscillator into this one's frequency
  wavetable?: string;                             // a PeriodicWave from a harmonic table (glassy, vocal-ish, hollow)
  sample?: string;                                // a manifest role, pitched by playbackRate
}
```

### 6.2 Voices and allocation

- **Mono, persistent:** sub, bass, lead, counter and siren. One voice is built once and never torn down. Notes move frequency and gate
  the envelopes, and glide and legato are natural.
- **Poly pool:** pad, stabs, pluck, arp, bells and choir. A pool of `poly` prebuilt voices with oldest-note stealing (released voices
  first). No node churn per note.
- **One-shots:** drums and sample FX are throwaway `AudioBufferSourceNode`s.

### 6.3 Modulation routes

A patch declares how it responds, as data:

```ts
interface ModRoute { src: ModSource; dst: string; range: [number, number]; curve?: 'lin' | 'exp' | 'scurve' }
type ModSource =
  | 'aggression' | 'syncopation' | 'density' | 'darkness' | 'drive'   // macros
  | 'velocity' | 'accent'                                             // per note
  | 'phrasePos' | 'sectionPos'                                        // 0..1 through the current phrase or section
  | 'sectionEnergy' | 'entry' | 'exit';                               // from the arranger (entry/exit gestures, §10.6)
```

Examples:

- bass `aggression -> drive.amount [1, 20] exp`
- pad `darkness -> filter.cutoff [3500, 600] exp`
- every patch `entry -> filter.cutoff` for a filter-in over one bar when the arranger brings it in
- stabs `sectionPos -> filter.env [0.2, 0.9]` so a build brightens them bar by bar

This is how the axes and the song's arc both reach the sound without any role knowing about the other. **Test:** every route names a real
parameter of its patch.

## 7. The ensemble

Every role has a **register slot**, a **plane** (what part of the attention it holds) and rules for when it is eligible. The arc planner
(§10) decides when an eligible role actually plays.

| Role | Slot | Plane | Rhythm | Pitch source | Eligible when |
|---|---|---|---|---|---|
| sub | sub (30–90 Hz) | floor | kick-locked or held | root | always except ambient sections |
| bass | low (110 Hz–1 kHz) | groove | groove templates (§7.2) | root + vocabulary | groove or above |
| drums | — | groove | kit patterns | — | groove or above (kick); hats and perc also in builds and breakdowns |
| pad | mid (C3–C5) | bed | sustained, swelling | voiced chord | most sections |
| choir | mid (C3–C5) | bed (alternative to pad) | sustained, vowel morph | voiced chord | darkness ≥ .5, dragons |
| drone | sub + low | bed | held | tonic/fifth pedal | dread, breakdowns, home |
| stabs | mid (C3–G4) | groove accent | syncopated hits | power chord / triad | density ≥ .45 |
| pluck | high-mid (C4–C6) | groove | 1–2 bar ostinato | chord tones + passing | groove, build |
| arp | high-mid (C4–C6) | groove | gated 16ths | chord tones | build, peak, density ≥ .5 |
| lead | high-mid (C4–C6) | **foreground** | phrased melody | the motif (§9) | peaks, some grooves |
| counter | mid–high (A3–A5) | answer | in the lead's rests | motif fragments | while lead plays, or as the melody in breakdowns |
| siren | high-mid | **foreground** | slow glides | root / ♭2 / ♭3 | heat ≥ .6 |
| bells | air (C5–C7) | color | sparse | chord tones, motif fragments | low darkness, corporate, victory |
| texture | full | atmosphere | — | — | always (by weather and place) |

### 7.1 Sub-bass

- Patch: one sine plus ~3% of a sine an octave up for small speakers, lowpass ~90 Hz, sub bus, mono, no drive or reverb sends.
- Follows the bar's root and changes on chord changes. At low density it holds whole notes. At higher density it re-triggers with the
  kick so the floor pulses.
- The kick ducks it for ~60 ms (§16).
- Clamped to E1–E2 (41–82 Hz), folding the octave. **Test:** no sub note leaves that range.

### 7.2 Character bass

**Patch:** 2× saw (detune 0..18 cents) plus a square at −1 octave (mix 0..0.4) → lowpass (cutoff, Q, envelope) → tanh drive (4×
oversample) → stepped-curve crusher (aggression above .75 only) → **post highpass ~110 Hz** → bass bus (sidechained). The post-drive
highpass is the band split that lets the bass go feral while the sub stays clean. Keep it.

**Aggression routes:**

| Param | Locked (a=0) | Aggressive (a=1) |
|---|---|---|
| Notes per bar | 4–8, on or just off the kick | 10–16, with rests carved by syncopation |
| Pitch vocabulary | root only | root, octave, fifth, ♭7, ♭2 (with danger), chromatic approach notes |
| Gate length | 50% | 15–90% mixed, with accented longs |
| Glide probability | 0 | 0.35 |
| Filter cutoff / env amount | 300 Hz / low | 900 Hz / high, fast decay (acid "yow") |
| Resonance (Q) | 1 | 12 |
| Drive | 1× (clean) | 20× tanh, crush at the very top |
| Accent depth | none | ±40% velocity, plus cutoff on accents |

**Rhythm:** a 16-step probability per step, blended from **groove templates**:

- `locked`: kick steps or the offbeat 8ths, the classic techno offbeat bass
- `rolling`: three 16ths per beat, skipping the kick step
- `stab`: syncopated 3-3-2
- `acid`: dense with holes
- `broken`: off-grid, for half-time dread

The blend is weighted by syncopation and aggression. The result is a **riff**: a piece of material (§10.2) that is generated once, kept
and varied, never re-rolled per bar.

**Pitch:** from the vocabulary weighted by aggression, with motif bias from the theme. It may **anticipate** the next chord by an 8th at
syncopation above .5 (the synthwave push).

**Invariant (test):** at `aggression = 0` every note is the root on a `locked` step. At `aggression = 1` the average share of off-kick
notes in a bar is above 60%.

### 7.3 Kick and drums

- **Kick:** a sample pitched with `playbackRate` so its fundamental sits near the root, plus a short synth click. The synth fallback is a
  sine with a pitch envelope from 150 Hz down to 45 Hz over 80 ms, plus a noise click.
  - Pattern families: `half`, `four`, `four+` (16th ghost kicks at high drive), `broken`.
- **Clap/snare** on 2 and 4 from moderate density.
- **Hats:** closed 8ths, then offbeat opens, then 16ths as `drive` rises. Velocity humanized ±10%, palette swing.
- **Perc/metal** at density above .6. **Ride** at peaks only.
- The **drum pattern is material** too: the kit, the hat figure and the perc figure are kept and varied. Fills are graded by energy
  (hat flam → snare roll → full break) and placed by bar role (§10.3).

### 7.4 Pad

- Patch: 4–6 voices of detuned saw or PWM, slow attack (≈ 1/2 bar), long release, lowpass from `darkness`, heavy reverb, sidechained so
  it pumps. Alternate patches per palette: lush supersaw, warm filtered, glassy wavetable, grimy saw.
- Plays the voiced chord (§8.3). Rhythm options are material too:
  - held whole notes
  - a swell on each chord
  - re-articulated on the "and" of 4
  - trance-gated at high drive
- At high darkness it thins to an open fifth plus the ♭2 rub, or hands over to the choir.

### 7.5 Chord stabs (darksynth brass)

- Patch: 2 saws with unison detune, fast filter envelope, short decay, a little drive, plate-ish reverb. This is the big 80s-brass-gone-
  wrong sound.
- Voicing: a full minor triad at low aggression. At high aggression a **power chord** (root, fifth, octave), because thirds turn to mud
  under distortion.
- Rhythm: syncopated hits that **lock to the bass's accents** (rhythmic unison with the riff) or **answer** them in its gaps. The
  generator chooses by syncopation, and the choice is part of its material.
- Builds open the filter by `sectionPos`. Peaks put them on the downbeat of every chord change.

### 7.6 Pluck ostinato

- Patch: saw or square plus a fast filter envelope and short decay, ping-pong delay at a dotted 8th.
- A 1–2 bar repeating figure from chord tones plus passing tones, adjusting each bar to the chord by smallest movement (§8.3). It is the
  hypnotic sequence that keeps a groove section moving.
- Occupies the same slot as the arp, so **never both at once** (§10.6). They are siblings that the planner swaps for contrast.

### 7.7 Arp

- Patch: square or PWM, short gate, filter routed to `phrasePos` (opens across a phrase), delay.
- Chord tones at 16ths over 1–3 octaves. Patterns (up, up-down, played order, converge) are material. Octave span rises with density.
- At high syncopation it skips steps in a Euclidean pattern so it interlocks with the hats instead of doubling them.

### 7.8 Lead

- Patch: mono, 2 saws plus a sub square, glide, vibrato LFO with delayed onset, mild drive by aggression, delay and reverb.
  Alternates: a hollow wavetable for calm, a screaming detuned saw for peaks.
- Plays **phrases** built from the motif (§9). Expressive gestures come from macros: aggression adds pitch-envelope scoops, slides and
  16th ornaments, and darkness lengthens notes and favours the ♭2 neighbour.
- It is the **foreground** voice. When it plays, nothing else may be foreground (§10.6).

### 7.9 Counter-melody

- Patch: softer and lower than the lead (triangle or filtered square, less vibrato).
- **Answers** the lead in its rests, using a fragment, inversion or sequence of the motif (§9.2). It never starts a note in a beat where
  the lead has an onset.
- In breakdowns, where the lead is resting, it can carry a quiet version of the melody alone.

### 7.10 Siren lead

- Patch: square plus a little detune, slow pitch LFO between root and ♭2/♭3 (or a glide figure), with a bandpass sweep.
- Foreground during heat. It **displaces** the lead (the lead yields, then returns afterwards with its motif).

### 7.11 Bells

- Patch: FM (ratio 3.5 or 1.4, decaying index) for glassy and slightly inharmonic bells. Long release, wide reverb.
- Sparse chord tones and motif fragments on off-beats. They are corporate's signature, sparkle in calm sections and play the motif on
  `level_up`.

### 7.12 Choir

- Patch: saws plus noise through a **formant bank** (3 parallel bandpasses at vowel formant frequencies) that morphs `oo → ah → ee`
  with `sectionPos` or darkness.
- The danger bed: dragons overhead, boss rooms, the dread corner. It replaces the pad when darkness is high.

### 7.13 Drone

- Patch: a sine and saw pair on the tonic and fifth, with slow beating detune and a lowpass LFO over many bars.
- Holds through breakdowns, dread and home. It is the pedal tone made audible.

### 7.14 Texture and FX

- Weather beds:
  - **Acid rain:** filtered pink noise with droplet ticks.
  - **Neon fog:** a chorused high shimmer.
  - **Heatwave:** a slow pitch wobble on the beds plus a faint crushed hiss.
- Place beds (§12).
- FX gestures:
  - **Risers:** filtered noise sized to the time until the next bar or phrase.
  - **Impacts:** a sample, or a synth sub-drop plus a noise burst.
  - **Reverse cymbals.**
  - **Glitch stutters:** gated repeats of the current voices.

  These are mostly used by the arranger for entries, exits and transitions (§10.6), and by cues (§11).

## 8. Harmony and voice leading

### 8.1 The shared harmonic context

Every role reads the same `HarmonySlice` for each beat: the current chord (root degree, quality, extensions, bass note), the scale, the
tension notes the current darkness allows, and the notes to avoid. Melody, arp, pluck, stabs and pad can never disagree about the chord.

### 8.2 Progressions, harmonic rhythm and cadences

- **Progressions are material** (§10.2), picked from the theme's banks (§14) by section:
  - rest: `i–VI–III–VII`, `i–iv–VI–v`
  - tense: `i–♭II` pedal, `i–♭VI–♭II–i`
  - peak: `i–VI–VII–i`, `i–VII–VI–V(harmonic)`
- **Harmonic rhythm:** one chord per bar by default, two per bar in turnarounds, one per two bars in breakdowns and dread.
- **Cadences sit at phrase ends:**
  - The last bar of a phrase gets a turnaround (`♭VII → i`, `v → i`, or `♭II → i` under danger).
  - Section ends use a stronger cadence, or a **deceptive** one (to ♭VI) when the planner wants to keep pushing.
  - Builds sit on a **dominant pedal** (V or ♭VII over a held bass) so the drop resolves the tension.
- **Pedals:** danger can pin the bass, sub and drone to the tonic while the chords move above.
- **Extensions by palette and darkness:** add9 and sus2 colour calm sections. ♭2 and ♭5 tensions colour danger.
- **Modulation:** rare, at section boundaries only.
  - A **lift** up a whole step or a semitone for a late peak in a long arc. Pure synthwave cheese, played straight.
  - A **modal shift** with the same root (Aeolian → Phrygian) as danger rises.
  - A **return** to the home key on recap.

### 8.3 Voicing

`voicing.ts` turns a chord into notes for each role:

- Each role has a **register window** (the slot in §7).
- **Smallest movement:** among candidate inversions and octave placements in the window, choose the one with the least total semitone
  movement from the previous voicing, keeping common tones where possible.
- **Low-interval limit:** no interval smaller than a fifth below ~E3, so there are no muddy low thirds.
- Under distortion (stabs at high aggression), drop thirds and use fifths and octaves.
- No doubled leading tones. The third is doubled only in thin, high voicings.
- **Test:** the average per-voice movement between consecutive pad voicings is ≤ 3 semitones, and the low-interval limit holds.

## 9. Melody: motifs and phrases

### 9.1 Motifs

A **motif** is a rhythm cell (1 bar or less), a contour and a set of intervals in scale degrees relative to the chord. The theme (§14)
gives each save a main motif. The material pool (§10.2) can invent secondary motifs for bridges, and each district keeps its own.

### 9.2 Transformations

These are deterministic operators. A melody is the motif plus a chain of them:

- **Fit:** diatonic transposition onto the current chord.
- **Sequence:** repeat the motif a step higher or lower.
- **Invert** the contour.
- **Retrograde** (sparingly).
- **Augment** (half-time sections, dread) or **diminish** (peaks, chases).
- **Fragment** (the head or the tail only).
- **Embellish** with passing and neighbour tones (more with aggression).
- **Truncate and extend** (an answer that goes further than the question).
- **Displace** by an octave for the climax.

### 9.3 Phrase forms

A lead phrase follows one of two classical forms:

- **Sentence** (8 bars): idea, idea varied, fragment, fragment, then run into a cadence.
- **Period** (4 + 4 bars): the antecedent ends open (on a non-tonic, half cadence) and the consequent starts the same way but ends on the
  tonic.

### 9.4 Pitch rules

- Strong beats land on chord tones. Non-chord tones arrive and leave by step.
- A leap larger than a fourth is followed by a step back in the opposite direction (gap-fill).
- Exactly **one climax** (the highest note) per phrase, placed 60–75% of the way through.
- Phrases end on a longer note.
- **Breathing:** the lead rests for at least ~25% of a phrase and never plays more than 2 bars without a rest.
- **Call and response:** the counter, the pluck or the bells answer in those rests (§7.9).

All of these are testable on generated phrases (§19).

## 10. Form: phrasing and the arc of a song

The goal is a song that develops, not a loop and not a random walk. Three ideas carry it:

- **Material is kept, not re-rolled.**
- **Bars have roles inside phrases.**
- **An arc planner chooses deliberate moves at phrase and section boundaries,** scored against an energy plan and listener fatigue.

### 10.1 The time hierarchy

| Level | Length | What is decided there |
|---|---|---|
| step | a 16th | nothing (rendering only) |
| bar | 16 steps | rendering, micro-variation (§10.3) |
| phrase | 4 or 8 bars | bar roles, fills, one or two arrangement moves (§10.5) |
| section | 2–4 phrases | section type, which material is bound to which role, harmony changes, phrase form |
| arc | many sections | the energy plan. An arc ends when the palette changes or a hard cue resets it (death, dawn). |

### 10.2 Material

Everything a role plays comes from **material**:

```ts
interface Material {
  id: string; role: RoleId;
  kind: 'riff' | 'drums' | 'progression' | 'motif' | 'ostinato' | 'arp' | 'rhythm' | 'voicingStyle';
  seed: number;          // generation is deterministic from this
  born: number;          // bar
  variant: number;       // which variation of it is current; variations are derived, not re-rolled
  uses: number; lastUsed: number;
  exposure: number;      // fatigue, §10.5
}
```

- A material is **invented once** and played for as long as the planner wants it. Inside a phrase it repeats, which gives the music an
  identity. Across phrases it advances through **variants**: related versions produced by the role's variation operators (for example a
  bass riff with one note changed, an octave flip, a displaced accent, a thinned version or a busier one). Variants are deterministic from
  `(seed, variant)`.
- New material is invented only when the planner chooses a "new material" move. Old material can be **recalled** later (a recap), so
  the song has callbacks.
- **The pool persists per palette for the whole night.** When she comes back to the slum, the slum's riff and motif come back with her,
  in the same way the world remembers her in the text (TONE.md, "Callbacks").
- Material carries no axis values. The same riff becomes clean or vicious through the patch's mod routes, so a fight that breaks out in a
  bar plays a **fight version of the bar's music**, not unrelated music.

### 10.3 Inside a phrase: bar roles

Each bar in a phrase has a role:

- **4-bar phrase:** `statement, repeat, variation, turnaround`.
- **8-bar phrase:** `statement, repeat, variation, statement' | statement, repeat, variation', turnaround`, or the sentence shape when the
  lead is playing.

What each role means for the layers:

- **Statement and repeat:** play the bound material as it is. Repetition is deliberate here.
- **Variation:** each eligible layer may apply **one** small operator (a drum ghost note or open-hat accent, a bass note change or
  octave flip, a pad inversion or rhythm change). The variation budget scales with `volatility`.
- **Turnaround:** a fill graded by energy, a bass pickup into the next downbeat, a pad swell or cut, a cadence (§8.2) and, when the next
  phrase brings a big change, a **pre-drop gap** (kick and bass out for the last beat or two).
- **Micro-variation, every bar:** velocity humanizing and an occasional ghost note keep identical bars from sounding machine-printed. It
  never changes the material's identity.

### 10.4 Sections

| Section | Purpose | Shape |
|---|---|---|
| **intro** | Establish the palette | Bed and texture first, then one layer enters each phrase |
| **groove** (A) | The main material | Steady, with variation bars and the occasional layer swap |
| **build** | Create pull | Add or brighten each phrase (`sectionPos` routes), snare roll density up, a riser, a dominant pedal, then a pre-drop gap |
| **peak** (B) | Pay off | Full band and lead foreground. Stabs on chord changes. |
| **breakdown** | Breathe, so the next peak can land | **Subtract first**: strip to bed, drone and counter or a lead fragment, half-time allowed, new harmony allowed |
| **bridge** (C) | Contrast after A has been heard a lot | New material for one or two roles (new progression, a sibling swap such as pluck→arp or pad→choir, a secondary motif) |
| **recap** (A') | Return | Recall the earlier material in a varied, fuller form, possibly lifted a key (§8.2) |
| **outro** | Wind down | Remove layers one per phrase, with tails into the reverb |

Section transitions follow a weighted grammar, which the planner then scores (§10.5):

```
intro -> groove
groove -> build | bridge | breakdown
build -> peak
peak -> breakdown | bridge | peak (at most once)
breakdown -> build | recap
bridge -> build | groove
recap -> build | peak | outro
outro -> (arc ends)
```

### 10.5 The arc planner

This is where the intelligence lives. It uses the same utility-AI pattern as the hero (DESIGN.md §4): score the options, then pick with a
low-temperature softmax from the music Rng. It is deterministic, deliberate, and only rarely surprising.

**Energy.** The arrangement's energy is computed from what is playing:

```
energy = Σ layerWeight(role) × noteDensity(role) × brightness(role)
```

**Energy plan.** From `energyBand` and `volatility`, the planner draws an **intended energy curve** over the next few sections:

- a rise into a peak near the band's ceiling, then a breakdown near its floor, then back up.
- A wide band (a fight) gives big dynamics. A narrow band (a quiet shop) gives subtle motion: pad inversions, an arp coming and going,
  bells.
- **Constant axes still give a moving curve.** The band stays put while the arc keeps cycling inside it.

**Fatigue.** Every active layer, every bound material and the current section type accumulate **exposure** while they play unchanged.
Exposure decays while they rest. Total fatigue raises the value of change. **Familiarity** is valued too: recalling something heard a
while ago scores better than inventing something new, up to a point.

**Moves.** At each phrase boundary (and with a larger allowance at section boundaries) the planner considers:

| Move | Examples |
|---|---|
| add layer | the arp enters with a filter-in over a bar |
| drop layer | the stabs leave with a filter-close and a reverb tail |
| swap sibling | pluck ↔ arp, pad ↔ choir, stabs ↔ gated pad, lead ↔ counter-as-melody |
| vary material | advance the bass riff to its next variant |
| new material | invent a secondary motif or a new progression for a bridge |
| recall material | bring back the intro riff for a recap |
| change section | groove → build |
| re-voice / register shift | pad up an octave, bass drops an octave |
| feel change | half-time or double-time drums for a phrase |
| mute for effect | kick out for 2 bars before a peak |
| key change | late-arc lift, section boundary only, rare |

**Scoring:**

```
score(move) =  wE · (how close the result's energy is to the intended curve)
            +  wN · (fatigue relieved)
            +  wC · (coherence: fits the section's purpose, reuses or recalls known material, keeps the motif present)
            −  wD · (disruption: number of simultaneous changes; touching the foreground voice mid-phrase)
            −  orchestration penalties (§10.6, hard rules are vetoes)
```

**Limits:** at most 1–2 small moves or 1 big move per phrase boundary, and more at section boundaries.

**Planning, not just greedy choices.** At a section boundary the planner picks the next section from the grammar, scored by the energy
plan and fatigue. Inside the section, phrase moves serve its purpose:

- A **build** adds or brightens every phrase.
- A **breakdown** subtracts first, then reintroduces one element per phrase.
- A **peak** spotlights the lead.

The result is staggered entries, grouped exits and "subtract before you add" before a payoff, which is how an arranger works.

**Every decision is logged with its reasons** for MusicLab (§10.8), for example
`phrase 14: drop arp (exposure .82, build next, density budget)`.

### 10.6 Orchestration rules

Hard rules (vetoes):

- **One spotlight.** At most one foreground voice at a time (lead, siren, or the counter when it carries the melody). The counter only
  answers in rests.
- **Slots:** one voice in the low slot (the bass), one in the air slot, at most two in high-mid, and pluck and arp never together.
- **Floors:** a groove section needs kick or bass. The sub plays whenever the bass plays.
- **Minimum lifetimes:** a layer that enters stays at least one phrase, and a material stays at least two phrases, so nothing flickers.
- **Boundaries:** layers enter and leave only at phrase boundaries (or section boundaries for big moves). The only exceptions are cues
  (§11).

Soft rules (penalties):

- **Rhythmic complementarity:** two busy voices (≥ 8 onsets per bar) shouldn't share a slot or the same rhythm. The arp thins when the
  hats are at 16ths, and stabs either lock to the bass or answer it.
- **Density budget:** total onsets per bar stay under a cap set by the energy band.
- **Gestures:** an entry gets an entry gesture (the patch's `entry` mod route: filter-in, swell, or a reverse cymbal on big ones). An
  exit gets an exit gesture (`exit`: filter-close, a tail into the reverb). Hard cuts are reserved for drops, pre-drop gaps and cues.

### 10.7 How the axes and the arc share control

- **The axes decide what is allowed and how it sounds:** the palette, which roles are eligible (the siren needs heat, the choir needs
  darkness), the energy band and volatility, and every patch's mod routes (aggression, darkness and drive).
- **The arc decides when and how, inside that.** Slow axis drift moves the band, and the planner absorbs it into its curve.
- **Sharp changes override the plan.** A drop or dread cue (§11) makes the planner abandon its current section and jump to a matching
  one (a peak or a breakdown) on the next bar, restarting the phrase count from there. It **keeps the bound material**, so the music
  changes state without changing identity.

### 10.8 MusicLab timeline

The lab view needed to tune all of this:

- a scrolling timeline of sections and phrases
- active layers as lanes, with entries and exits marked
- the intended and actual energy curves, with the band
- per-layer fatigue
- the planner's log line for each boundary

Sliders let you hold the axes still and listen for whether it still develops.

## 11. Cues and the viewer

### 11.1 Cues

The bridge turns notable events into cues. Each cue has a **grid**, a **priority** (only the highest pending cue per grid slot wins) and
a **cooldown**. Big cues act through the arc planner (§10.7), not around it.

| Event(s) | Cue | Grid |
|---|---|---|
| first `fight_round` / `ambush` / `join_brawl` / `gang_brawl` of a group | **Drop**: a riser over the remainder, then the planner jumps to a peak with an impact | bar |
| `dragon_notices`, `dragon_near`, Ares `scream` | **Dread hit**: a sub-drop boom, the kick cuts, the planner jumps to a breakdown with choir and drone, plus a siren swell | beat |
| `give_chase`, `pursuit`, `chase_mount` | **Push**: a fill now, +4 BPM at the next phrase, the siren becomes eligible, double-time hats | 16th → bar |
| `chase_end` (good) | **Release**: a filter sweep down, and the planner heads to a breakdown or groove | bar |
| a hit taken (`fight_round` bad, `injury`, `car_hit`) | **Flinch**: a one-beat master lowpass dip, or a glitch stutter at high aggression | 16th |
| a foe or dragon down, `victory` | An impact plus a crash. A real `victory` gets the Picardy major chord with the motif on bells. | beat / bar |
| `level_up`, `skill_up` | The motif as a quick bell arp | beat |
| `death`, `dying_dies` | **Tape-stop**: `playbackRate` and frequencies ramp down over ~1.2 s, then silence. The arc ends, and the lab ambient follows (the motif, slowed down, on the drone). | 16th |
| `dawn` | The planner moves to an outro | phrase |

Outcomes (`good`/`bad`/`mixed`) only choose between cue variants. They don't move an axis.

### 11.2 Feeding events from the viewer

The viewer **steps the world ahead of what the player reads**: `stepWorld` queues chunks, and `release` reveals one every tick (2.4 s
at 1×). The music follows what is on screen:

- Attach each chunk's `GameEvent[]`, plus a small music snapshot, to the chunk. **Call the bridge on `release`**, not on `step`.
- The music snapshot holds `district`, `kind`, `danger`, `heat`, `hpRatio`, flight `{kind, phase, noticed}` and a `chasing` flag. It is
  computed at step time from the world, which stays read-only.

### 11.3 Speed, skip and catch-up

- **At 2× and 5×** the axes follow as normal. Cooldowns scale with speed, and low-priority cues are dropped above 2×.
- **Skip, offline catch-up and a jump to the digest** feed no events. They set the axes to the final state and let the planner move
  there through one transition.

## 12. Palettes (place)

A palette is data. Moving between districts crossfades continuous parameters over a phrase and swaps discrete ones on the phrase
boundary. It also **switches the material pool** (§10.2), so each district has its own recognizable music, and the planner starts a new
arc with an intro, or a recap if the district has been visited before.

| District | BPM | Mode bias | Kit / color | Bed | Signature roles | Swing | Texture |
|---|---|---|---|---|---|---|---|
| `market` | 108 | Aeolian, Dorian at rest | tight, clicky | bright PWM pad | pluck, bells | 4% | crowd murmur |
| `nightlife` | 124 | Aeolian | full club kit, big claps | lush supersaw | arp, stabs, lead | 0 | none (club wins) |
| `tenement` | 112 | Aeolian | dusty, lo-fi hats | warm filtered pad | counter, pluck | 8% | hum, distant TV hiss |
| `industrial` | 128 | Phrygian | metal perc, hard kick | cold narrow pad, drone | stabs, acid bass | 0 | machine drone |
| `corporate` | 118 | harmonic minor | clean, glassy | glassy wavetable pad | bells, arp | 0 | air-handling whine |
| `slum` | 116 | Phrygian, Locrian tint | distorted, crunchy | grimy saw, choir | siren, broken drums | 10% | dripping, rumble |

The signature roles get a coherence bonus in that palette's planner scoring. They are a tendency, not a lock.

**Location-kind overrides** on top of the district:

- `club`: four-floor and a high energy floor, with aggression capped unless danger is set. She's dancing.
- `bar`: the mix goes through a lowpass about 2 kHz plus a room reverb ("the song from the next room"). It lifts when a fight starts.
- `home` and the lab: ambient, using only the drone, the pad, the counter and the motif.
- `tunnel` and `lair`: long dark reverb, with half-time weighted up.
- `boss`: a danger floor of 0.7.

## 13. Vehicles

Driving overlays the palette: an engine-drone texture, the band's floor raised one step, and the pluck or arp favoured. This is optional
and comes in phase 7.

## 14. Per-save identity

Each save rolls a **theme** from the music Rng (save seed plus `'music'`):

- a root key, biased toward E, F, F♯, G, A for low-end weight
- one progression from each bank (rest, tense, peak)
- an arp pattern
- a **main motif** of 5–7 notes

Each district's pool is seeded from the theme too, so districts differ from each other while the main motif ties the whole night
together. It shows up in:

- the lead at peaks
- the counter in breakdowns
- bells on level-up
- the lab ambient, slowed down

## 15. Samples (author-supplied)

- **Location:** `public/audio/` plus `public/audio/manifest.json`, loaded with `fetch` and `decodeAudioData` once the context starts.
  Loading never blocks playback: synth fallbacks play until the buffers arrive.
- **Format:** mono WAV, 44.1 or 48 kHz, 16-bit, trimmed (no leading silence), peak-normalized to −1 dBFS, ideally under 60 KB each.
  `.m4a` (AAC) works everywhere if WAV gets too big.
- **Naming:** `role_palette_n.wav`, with `any` for shared samples.
- **Manifest:**
  ```json
  { "kick_industrial_1": { "file": "kick_industrial_1.wav", "role": "kick", "palette": "industrial", "rootHz": 52, "gain": 0.9 } }
  ```
- **Roles wanted:**

  | Role | Notes |
  |---|---|
  | `kick` ×3 | punchy transient and short body. The sub supplies the low end, so a long 808 tail fights it. Give its pitch as `rootHz`. |
  | `clap`, `snare` ×2 | dry; the reverb is added in-engine |
  | `hat_closed` ×3, `hat_open` ×2, `ride` | |
  | `perc` ×4 | metal clanks, rims, shakers |
  | `impact`, `boom` | for drops and dread hits |
  | `riser`, `reverse_cymbal` | optional |
  | `glitch` ×2, `vox` ×2 | optional chopped one-shots. A `vox` sample can also be an oscillator source (`wave: 'sample'`) for a pitched vocal-chop lead. |
- **Playback variation:** round-robin, ±2% rate drift (not on the kick), and velocity to gain and to a lowpass.
- **Every role has a synth fallback renderer**, so the sample kit is never required.

## 16. Mix and master

- **Buses:** `sub`, `bass`, `drums`, `beds` (pad, choir, drone), `music` (stabs, pluck, arp, bells), `lead` (lead, counter, siren) and
  `fx`. Sends go to one `reverb` (a `ConvolverNode` with a generated noise-decay IR, length from palette and darkness) and one `delay`
  (feedback through a bandpass, tempo-synced).
- **Sidechain:** faked by automating a gain dip on `bass`, `beds` and `music` at every kick (up to about −8 dB, release about 1/8 note),
  with a shallower dip on `sub`. The `lead` bus is barely ducked, so the melody stays on top.
- **Spotlight mixing:** while a foreground voice plays, `music` drops ~2 dB and loses a little high end (a gentle shelf), so the lead
  sits in front without a volume war.
- **Master:** highpass 25 Hz → glue compressor → tanh soft clip → limiter-style compressor → user volume. Mono below ~120 Hz.
- **Levels:** the music sits *under* reading. The default volume is modest, with an optional dip while the viewer waits on her question.

## 17. Performance

- Persistent mono voices and prebuilt poly pools (§6.2). Only one-shot hits create nodes.
- Aim for about 80 active nodes at peak with the full ensemble. A `lowPower` flag, set when the scheduler sees late callbacks, shrinks
  poly pools, drops unison voices and disables the formant bank (the choir falls back to the pad).
- The conductor's work happens once per bar and is cheap: the planner scores a dozen moves at most once per phrase.

## 18. Phases

Each phase ends playable in MusicLab, with `npm test` and `npm run typecheck` green, and has a listening bar to clear.

1. **Engine, patch model, sub and bass.** `synth/engine.ts`, the scheduler, `voice.ts` and `pool.ts`, the patch types, the axes and
   macros, the synth kick, the sub, and the **character bass built as a patch** with the full aggression morph. *Done when sweeping
   aggression from 0 to 1 goes from clean and locked to distorted and syncopated with no clicks, and the sub stays clean.*
2. **Harmony and the beds.** `theory`, `harmony`, `voicing`, synth drums, pad, stabs and drone, the sidechain and the master chain. A
   fixed 8-bar loop for now. *Done when a progression moves smoothly with no voice jumping, and the stabs sit with the bass both locked
   and answering.*
3. **Form.** The material pool and variants, bar roles, sections, the arc planner (energy plan, fatigue, moves, scoring), orchestration
   rules and the MusicLab timeline. *Done when five minutes with the sliders held still doesn't feel like a loop, and the timeline
   explains every change.*
4. **Melody.** Motifs, transformations, phrase forms, the lead, counter, pluck and arp, and the spotlight. *Done when the lead sounds
   like phrases that ask and answer, and the motif is recognizable in different sections.*
5. **Samples.** Manifest loader, round-robin, kick tuning and the author's kit as it arrives.
6. **Bridge.** `bridge.ts`, the music snapshot on chunks, feeding on `release`, the cue table and planner jumps, speed scaling and
   `MusicDock` in NightViewer. *The first time it plays along with a real night.*
7. **Heat and place.** The heat axis end to end (tempo push, siren), district palettes with their own pools, location-kind overrides,
   choir, bells, weather beds, key changes and the vehicle overlay.
8. **Polish.** Victory, death and dawn cues, the lab ambient, glitch gestures, and an `AudioWorklet` only if a voice needs it.

## 19. Tests (all in `npm test`, all node-side, no balance tests)

**Determinism and safety**
- The same theme seed and axis trajectory produce identical bars and identical planner decisions.
- The music never reads or advances `w.rng`: a run with the bridge attached has the same `rngPosition` as one without.
- Every patch's mod routes name real parameters.

**Voices**
- Bass invariants (§7.2) at aggression 0 and 1.
- Sub range (§7.1).
- Every pitched note is in the current scale, apart from tagged chromatic approach and tension notes.

**Harmony**
- Voice-leading movement and the low-interval limit (§8.3).
- Builds end on a dominant pedal, and phrase ends carry a cadence.

**Melody**
- Strong-beat chord tones and stepwise resolution.
- Gap-fill after leaps.
- Exactly one climax per phrase.
- At least 25% rest per phrase.
- The counter never starts a note on a lead onset.

**Form**
- **With the axes held constant for 128 bars:**
  - no two consecutive phrases render identically
  - something changes at least every 2 phrases
  - at least one material is recalled in a non-adjacent section
  - energy covers at least half of the band
- Layers enter and leave only at phrase boundaries (cues excepted), and minimum lifetimes hold.
- Never more than one foreground voice. Slot caps and the pluck/arp exclusion hold.
- A drop cue jumps to a peak on the next bar and keeps the bound material.

**Axes and bridge**
- Asymmetric slew and hysteresis.
- Representative event streams produce the expected targets and cues, and cooldowns hold across a long fight.
- Every cue has a renderer.

Listening is the real test. These catch regressions.

## 20. Open questions (for later, not blockers)

- Lab screen music: the theme in ambient form (as planned), or a fixed "home" piece?
- Companions and romance moments: is a softer cue family wanted, even though mood was dropped as an axis?
- Should a long arc ever end on its own (an outro, then a short silence, then a new intro) even when nothing changes? It's good for very
  long idle stretches, and it could tie to the in-game hour.
