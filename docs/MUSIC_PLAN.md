# Procedural music: implementation plan

Status: **phases 1-2 built** (see "As built" at the end for where they differ from the plan); phases 3-9 are plan. Feel over balance
applies here too: every number below is a first guess, to be tuned by ear.

Neo gets a score that is generated as it plays, not hand-authored tracks. It is built from native Web Audio synthesizers plus a small kit of
one-shot samples. It reads the night as it unfolds through a set of **axes** (intensity, danger, heat and place to start with, and more
can be added later), and it makes **songs**, not background loops:

- Each song has its own character: its own tempo, key, sound palette, hook and shape.
- Within a song, ideas are invented, repeated, varied, dropped and brought back across an arc.
- When a song has run its course it ends and hands over to a new song with a different character, even if nothing in the game has
  changed.

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
| Axes | **Intensity**, **danger**, **heat/pursuit** and **place/district** to start with. Hero condition feeds danger (low HP). Mood/outcome only drives cues. |
| Future axes | **The axis set must stay open.** Axes are registered as data, so a new one can be added later without touching the rest of the system (§5.3). |
| Samples | **The author supplies the sample files** (§16). Every sample role has a synthesized stand-in, so the system plays fully with zero files. |
| Scope beyond the rhythm section | Every melodic and harmonic layer is designed to the same depth as the bass, on one shared instrument model (§6–§9). |
| Form | **Songs, not loops.** Within a song the music follows an arc, and it adds and drops elements deliberately, by plan, never at random (§10). |
| Songs | **Each song has its own character, and songs end.** Even in a samey stretch of play, a song plays out and transitions smoothly into a new song with a new character (§11). |
| Lab screen | **Deferred.** The lab will get its own composed piece later. Until then the music fades out on the lab screen. |
| Companions, romance | Left out. |
| Persistence | **The last few songs survive a page reload**, not the whole history (§11.7). |
| Titles | **Song titles can reference what happened in the night** (§11.6). |
| Songs in the log | **No.** Songs never appear in the chronicle, and the sim never learns about the music. |

## 3. Hard constraints

- **Zero dependencies.** Raw Web Audio API (`AudioContext`, oscillators, `PeriodicWave`, `BiquadFilterNode`, `WaveShaperNode`,
  `ConvolverNode`, `DynamicsCompressorNode`, `ConstantSourceNode`, `AudioBufferSourceNode`). No Tone.js. An `AudioWorklet` is allowed
  later only if a voice can't be done with native nodes.
- **The sim never knows the music exists.** The music reads `World` and `GameEvent`s and never mutates them. It **never touches
  `w.rng`**, because the sim is deterministic and seeded (offline catch-up depends on that, see DESIGN.md §3). The music has its own
  `Rng` (`engine/src/rng.ts`, the class not the instance), seeded from the universe's `worldSeed` plus `'music'`.
- **Split pure from browser.** Everything that decides *what* to play (axes, songs, harmony, melody, patterns, form, the planners, cues,
  the bridge, patch definitions) is plain TypeScript with no Web Audio types, so it runs under vitest in node. Only `music/synth/` touches
  `AudioContext`.
- **Autoplay policy.** The `AudioContext` is created or resumed on a user gesture. Music is **off by default** until the player turns it
  on once. That choice and the volume persist in `localStorage`.
- **Idle game manners.** Fade out and `suspend()` the context when the tab is hidden, and fade back in on return. Offline catch-up never
  generates cues (§12.3).
- **Data over code at the edges.** Axes, macros, patches, palettes, role eligibility, cues and song traits are all tables. Growth (a new
  axis, a new instrument, a new district) should mostly be new rows.

## 4. Architecture

```
music/
  score/                   pure: no AudioContext, node-testable
    types.ts               NoteEvent, Bar, Patch, Material, Section, Song, Cue
    axes/
      registry.ts          AxisDef table: the axes that exist (§5)
      defs/                one file per axis: intensity.ts, danger.ts, heat.ts, place.ts
      macros.ts            macro table: weights from axes to macros (§5.2)
      state.ts             targets -> smoothed values, hysteresis
    theory.ts              scales, modes, chords, note<->Hz
    harmony.ts             progressions, harmonic rhythm, cadences, pedals, modulation (§8)
    voicing.ts             voice leading, register windows, low-interval limit (§8.3)
    melody.ts              motifs, transformations, phrase forms, pitch rules (§9)
    theme.ts               per-save identity (§15)
    patches/               instrument definitions as data, one file per role, with alternates (§6, §7)
    roles/                 one generator per role: sub, bass, drums, pad, stabs, pluck, arp, lead, counter, siren, bells, choir, drone, texture
    material.ts            the material pool: invent, vary, recall (§10.2)
    phrase.ts              bar roles inside a phrase (§10.3)
    sections.ts            section types and their purpose (§10.4)
    planner.ts             the song planner: energy plan, fatigue, move scoring (§10.5)
    orchestra.ts           orchestration rules: slots, spotlight, density, lifetimes (§10.6)
    song.ts                song character, generation, lifecycle and ending (§11.1–§11.3)
    setlist.ts             the night's songs so far, choosing the next one, reprises (§11.4)
    transition.ts          handing one song over to the next (§11.5)
    facts.ts               title facts pulled from events: names, places, numbers (§11.6)
    titles.ts              title templates and the word table (§11.6)
    memory.ts              the persisted song memory: to/from JSON, validation (§11.7)
    cues.ts                cue table, quantization, priority, cooldowns (§12)
    palettes.ts            district and location-kind palettes (§13)
    conductor.ts           runs it all: generates bar N+1 while bar N plays -> NoteEvent[]
  synth/                   browser only
    engine.ts              AudioContext lifecycle, start/stop, visibility
    scheduler.ts           lookahead scheduler (§4.1)
    voice.ts               builds a playable voice from a Patch (§6)
    pool.ts                voice allocation: mono, poly, stealing
    buses.ts, master.ts    buses, sidechain ducking, master chain (§17)
    samples.ts             manifest loader, decode, round-robin, synth fallbacks (§16)
    impulse.ts             generated reverb impulse responses
  bridge.ts                World + GameEvent[] -> axis targets + cues, driven by the axis registry (§5, §12), pure
  index.ts
components/
  MusicDock.tsx            on/off, volume, now playing (the song's title), mounted in NightViewer
  MusicLab.tsx             debug, at `/music`: sliders for every registered axis, palette picker, cue buttons,
                           a patch auditioner, "next song" and the timeline (§10.8)
```

Add `"music"` to `tsconfig.json` `include`. Vitest has no config file, so `music/**/*.test.ts` is picked up by `npm test` already.

### 4.1 Clocking

This uses the standard two-clock pattern.

- **Conductor (bar-ahead).** At each bar boundary the conductor asks the setlist and the song planner what the next bar is: which song
  (or which two, during a transition), the section, the phrase position and bar role, the active roles and their material. It then reads
  the smoothed axes, the macros and the palette, and has each role render the next bar into
  `NoteEvent { t, role, note | sample, vel, dur, params }`. Every musical decision happens here.
- **Scheduler (lookahead).** A `setInterval` of about 25 ms (or a worker timer, so hidden-tab throttling doesn't stutter it) schedules
  every `NoteEvent` whose time falls within the next ~120 ms against `ctx.currentTime`. Parameter automation uses `setValueAtTime`,
  `linearRampToValueAtTime` and `setTargetAtTime`, never per-frame JS.
- **Quantized cues** go into a queue keyed by grid (`16th | beat | bar | phrase`) and are spliced in at the next boundary of that grid.
- **Tempo** changes only at phrase boundaries, apart from the deliberate tape-stop and push cues, and the tempo ramps inside song
  transitions (§11.5).

## 5. The axes

### 5.1 The axis registry

An axis is a row in `axes/registry.ts`, not a hard-coded field:

```ts
interface AxisDef<R = unknown> {
  id: string;                                   // 'intensity', 'danger', 'heat', 'place', ... (open-ended)
  label: string;                                // for MusicLab
  kind: 'continuous' | 'categorical';
  /** Runs at step time against the read-only world; whatever it returns rides on the chunk to `release`. */
  read(w: Readonly<World>): R;
  /** Runs when the chunk is shown: the axis's new target, from what was read and the chunk's events. */
  target(read: R, events: readonly GameEvent[], prev: number | string): number | string;
  rise: number; fall: number;                   // slew, in bars (continuous only)
  hysteresis: number;                           // dead zone around any threshold that reads this axis
  initial: number | string;
}
```

- The bridge (§12.2) has no knowledge of any particular axis. It loops over the registry: it calls `read` at step time, stores the results
  on the chunk, and calls `target` on release.
- `state.ts` keeps a target and a current value for every registered axis, with an asymmetric slew (rises fast, falls slow) and
  hysteresis.
- MusicLab builds its sliders from the registry.

**The starting axes:**

| Axis | Kind | What it means | `read` / `target` | Rise / fall |
|---|---|---|---|---|
| **intensity** | continuous | How much is *happening* to her right now | An event-energy accumulator with decay, using a per-event weight table: `fight_round` .5, `ambush` .8, `chase_round` .6, `dungeon_wave` .6, `gang_brawl` .7, `dragon_engage` .9, `crash_gig`/`dance`/`dj_set` .4. Quiet ones (`eat_noodles`, `sleep`, `chat`) push it *down*. | ~1 beat / ~8 bars |
| **danger** | continuous | How likely this is to kill her | `dangerOf(location)` normalized through `tierOfDanger`, plus: a dragon flight here (`w.flight`, more once `noticed`, most during an Ares `scream` or `raid`), a damsel's foes present, HP ratio below 40%, `dying`/`security_closes_in`/`monitored_death`. | ~2 beats / ~4 bars |
| **heat** | continuous | How hunted she is | `heatLevel(w)` (`laylow.ts`) normalized, plus a pursuit boost while a chase is live (`give_chase`, `pursuit`, `chase_round`, `getaway`, `tail`, `dragon_chase`) that ends on `chase_end`/`chase_cut`. `lay_low` pulls the target down. | ~1 beat / ~16 bars |
| **place** | categorical | Where she is | `Location.district` and `Location.kind`. Selects the palette (§13). | see §13 |

Weather (`w.situation.weather`) is not an axis. It picks the texture bed (§7.14).

### 5.2 Macros

Voices and planners never read raw axes directly. They read **macros**, defined in `macros.ts` as a table of weights over axis ids plus
an optional shaping function:

```ts
interface MacroDef {
  id: string;
  weights: Record<AxisId, number>;     // an axis not listed contributes 0
  bias?: number;
  shape?: (linear: number, axes: AxisValues) => number;   // for the few non-linear ones
}
```

The starting macros:

```
aggression  = 0.55*intensity + 0.35*danger + 0.25*heat             // clean -> distorted, in every patch with a drive or filter route
syncopation = 0.6*intensity + 0.5*heat, minus 0.2*danger*(1-intensity) // dread is sparse, a chase is busy
density     = 0.8*intensity + 0.3*heat                              // notes per bar, inside whatever layers are on
darkness    = 0.8*danger + 0.2*(1-intensity)                        // mode, filter brightness, reverb size, which bed (pad or choir)
drive       = 0.7*heat + 0.4*intensity                              // tempo push, hat drive, siren lead, gated pads
energyBand  = [floor, ceiling] from intensity, danger and heat      // how loud and full the arrangement may get (§10.5)
volatility  = 0.3 + 0.7*intensity                                   // how far the song's energy may swing inside the band
```

All of these are clamped to 0..1, and the weights are placeholders, to be tuned in MusicLab by ear. The current song's character adds a
small offset to some macros (§11.1).

Three corners of the axis space show the shape:

- **High danger, low intensity** ("something is up there"): half-time kick, tonic pedal, Phrygian ♭2 rubs in the choir, a drone, sub
  swells, a sparse and dark locked bass, a big dark reverb. A narrow, low energy band.
- **High intensity, low danger** (a bar brawl over a pool cue): a full four-floor groove, stabs on the bass accents and a busy but
  mid-aggression bass. A wide band, so big builds and drops.
- **High heat** (a chase): tempo pushed up, driving 16th hats, gated pads, the siren lead as the foreground voice, syncopated bass.

### 5.3 Adding an axis later

Every place an axis can have an effect references it **by id, through data**:

| Where | How a new axis plugs in |
|---|---|
| Registry | A new `AxisDef` file (`read` and `target`) |
| Macros | Add its weight to existing macros, or define a new macro |
| Patches | A mod route can read a macro or a raw axis: `src: 'axis:<id>'` (§6.3) |
| Role eligibility | `eligible: [{ axis: '<id>', above: 0.6 }]` in the role table (§7) |
| Energy band | An optional contribution in the `energyBand` macro |
| Cues | Rows in the cue table can be keyed on an axis crossing a threshold, not just on events (§12.1) |
| Songs | Song-choice fit scoring reads macros (§11.4), so a new axis that feeds a macro already affects which songs fit |
| MusicLab | Sliders appear automatically |

A new axis with no weights anywhere is **registered but silent**, which is safe to ship and then wire up. **Test:** a fixture axis
registered only in a test file can drive a patch parameter through `axis:<id>` and a role's eligibility, with no change to any other
file. Unknown axis ids in any table fail validation.

## 6. Instruments: one patch model for everything

No role gets a hand-wired chain. Every pitched instrument, the bass included, is a **patch**: plain data in `score/patches/` that
`synth/voice.ts` turns into nodes. Each role has several alternate patches, and the song's character picks among them (§11.1).

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
- **Transitions need two of some voices at once** (the outgoing and incoming songs' pads, for example). Persistent voices are built per
  song from its patch picks and released once that song's tails have died, so there are at most two sets alive (§11.5, §18).

### 6.3 Modulation routes

A patch declares how it responds, as data:

```ts
interface ModRoute { src: ModSource; dst: string; range: [number, number]; curve?: 'lin' | 'exp' | 'scurve' }
type ModSource =
  | `macro:${string}`                                 // aggression, darkness, drive, ... or any macro added later
  | `axis:${string}`                                  // a raw axis, for a new axis that needs a direct line (§5.3)
  | `trait:${string}`                                 // the current song's character traits (§11.1)
  | 'velocity' | 'accent'                            // per note
  | 'phrasePos' | 'sectionPos' | 'songPos'            // 0..1 through the current phrase, section or song
  | 'sectionEnergy' | 'entry' | 'exit';               // from the planner (entry and exit gestures, §10.6)
```

Examples:

- bass `macro:aggression -> drive.amount [1, 20] exp`
- pad `macro:darkness -> filter.cutoff [3500, 600] exp`
- pad `trait:space -> sends.reverb [0.2, 0.7]`
- every patch `entry -> filter.cutoff` for a filter-in over one bar when the planner brings it in
- stabs `sectionPos -> filter.env [0.2, 0.9]` so a build brightens them bar by bar

The axes, the song's character and the song's arc all reach the sound this way, without any role knowing about the others. **Test:**
every route names a real parameter of its patch and a known source.

## 7. The ensemble

Every role has a **register slot**, a **plane** (what part of the attention it holds) and **eligibility rules** written as data
(conditions on macros, axes, palette or song traits). The song planner (§10) decides when an eligible role actually plays.

| Role | Slot | Plane | Rhythm | Pitch source | Eligible when |
|---|---|---|---|---|---|
| sub | sub (30–90 Hz) | floor | kick-locked or held | root | always except intros and beatless sections |
| bass | low (110 Hz–1 kHz) | groove | groove templates (§7.2) | root + vocabulary | groove or above |
| drums | — | groove | kit patterns | — | groove or above (kick); hats and perc also in builds and breakdowns |
| pad | mid (C3–C5) | bed | sustained, swelling | voiced chord | most sections |
| choir | mid (C3–C5) | bed (alternative to pad) | sustained, vowel morph | voiced chord | darkness ≥ .5, dragons |
| drone | sub + low | bed | held | tonic/fifth pedal | dread, breakdowns, transitions |
| stabs | mid (C3–G4) | groove accent | syncopated hits | power chord / triad | density ≥ .45 |
| pluck | high-mid (C4–C6) | groove | 1–2 bar ostinato | chord tones + passing | groove, build |
| arp | high-mid (C4–C6) | groove | gated 16ths | chord tones | build, peak, density ≥ .5 |
| lead | high-mid (C4–C6) | **foreground** | phrased melody | the song's motif (§9) | peaks, some grooves |
| counter | mid–high (A3–A5) | answer | in the lead's rests | motif fragments | while lead plays, or as the melody in breakdowns |
| siren | high-mid | **foreground** | slow glides | root / ♭2 / ♭3 | heat ≥ .6 |
| bells | air (C5–C7) | color | sparse | chord tones, motif fragments | low darkness, corporate, victory |
| texture | full | atmosphere | — | — | always (by weather and place) |

### 7.1 Sub-bass

- Patch: one sine plus ~3% of a sine an octave up for small speakers, lowpass ~90 Hz, sub bus, mono, no drive or reverb sends.
- Follows the bar's root and changes on chord changes. At low density it holds whole notes. At higher density it re-triggers with the
  kick so the floor pulses.
- The kick ducks it for ~60 ms (§17).
- Clamped to E1–E2 (41–82 Hz), folding the octave. **Test:** no sub note leaves that range.

### 7.2 Character bass

**Patch:** 2× saw (detune 0..18 cents) plus a square at −1 octave (mix 0..0.4) → lowpass (cutoff, Q, envelope) → tanh drive (4×
oversample) → stepped-curve crusher (aggression above .75 only) → **post highpass ~110 Hz** → bass bus (sidechained). The post-drive
highpass is the band split that lets the bass go feral while the sub stays clean. Keep it. Alternate patches (a rounder square bass,
a reese-style detuned bass, an acid single-saw) are picked by song character.

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

The blend is weighted by syncopation, aggression and the song's character. The result is a **riff**: a piece of material (§10.2) that
is generated once, kept and varied, never re-rolled per bar.

**Pitch:** from the vocabulary weighted by aggression, with motif bias from the song. It may **anticipate** the next chord by an 8th at
syncopation above .5 (the synthwave push).

**Invariant (test):** at `aggression = 0` every note is the root on a `locked` step. At `aggression = 1` the average share of off-kick
notes in a bar is above 60%.

### 7.3 Kick and drums

- **Kick:** a sample pitched with `playbackRate` so its fundamental sits near the root, plus a short synth click. The synth fallback is a
  sine with a pitch envelope from 150 Hz down to 45 Hz over 80 ms, plus a noise click.
  - Pattern families: `half`, `four`, `four+` (16th ghost kicks at high drive), `broken`.
- **Clap/snare** on 2 and 4 from moderate density.
- **Hats:** closed 8ths, then offbeat opens, then 16ths as `drive` rises. Velocity humanized ±10%, with swing from the palette and the
  song.
- **Perc/metal** at density above .6. **Ride** at peaks only.
- The **drum pattern is material** too: the kit, the hat figure and the perc figure are kept and varied. Fills are graded by energy
  (hat flam → snare roll → full break) and placed by bar role (§10.3). Each song picks its own kit variant.

### 7.4 Pad

- Patch: 4–6 voices of detuned saw or PWM, slow attack (≈ 1/2 bar), long release, lowpass from `darkness`, heavy reverb, sidechained so
  it pumps. Alternates: lush supersaw, warm filtered, glassy wavetable, grimy saw.
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
  Alternates: a hollow wavetable, a screaming detuned saw, and a pitched `vox` sample (§16) for a vocal-chop lead.
- Plays **phrases** built from the song's motif (§9). Expressive gestures come from macros: aggression adds pitch-envelope scoops,
  slides and 16th ornaments, and darkness lengthens notes and favours the ♭2 neighbour.
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
- Holds through breakdowns, dread, home and beatless transitions. It is the pedal tone made audible, and the usual glue between two
  songs (§11.5).

### 7.14 Texture and FX

- Weather beds:
  - **Acid rain:** filtered pink noise with droplet ticks.
  - **Neon fog:** a chorused high shimmer.
  - **Heatwave:** a slow pitch wobble on the beds plus a faint crushed hiss.
- Place beds (§13). Texture belongs to the place, not to a song, so it **carries straight through song transitions** and helps them feel
  continuous.
- FX gestures:
  - **Risers:** filtered noise sized to the time until the next bar or phrase.
  - **Impacts:** a sample, or a synth sub-drop plus a noise burst.
  - **Reverse cymbals.**
  - **Glitch stutters:** gated repeats of the current voices.

  These are mostly used by the planner for entries, exits and transitions (§10.6, §11.5), and by cues (§12).

## 8. Harmony and voice leading

### 8.1 The shared harmonic context

Every role reads the same `HarmonySlice` for each beat: the current chord (root degree, quality, extensions, bass note), the scale, the
tension notes the current darkness allows, and the notes to avoid. Melody, arp, pluck, stabs and pad can never disagree about the chord.

### 8.2 Progressions, harmonic rhythm and cadences

- **Progressions are material** (§10.2). Each song picks its own from the banks, by section type:
  - rest: `i–VI–III–VII`, `i–iv–VI–v`
  - tense: `i–♭II` pedal, `i–♭VI–♭II–i`
  - peak: `i–VI–VII–i`, `i–VII–VI–V(harmonic)`
- **Harmonic rhythm:** one chord per bar by default, two per bar in turnarounds, one per two bars in breakdowns and dread. The song's
  `complexity` trait shifts this.
- **Cadences sit at phrase ends:**
  - The last bar of a phrase gets a turnaround (`♭VII → i`, `v → i`, or `♭II → i` under danger).
  - Section ends use a stronger cadence, or a **deceptive** one (to ♭VI) when the planner wants to keep pushing.
  - Builds sit on a **dominant pedal** (V or ♭VII over a held bass) so the drop resolves the tension.
  - **A song's ending** gets a final cadence (§11.3).
- **Pedals:** danger can pin the bass, sub and drone to the tonic while the chords move above.
- **Extensions by palette, song and darkness:** add9 and sus2 colour calm sections and high-`lift` songs. ♭2 and ♭5 tensions colour
  danger.
- **Modulation inside a song:** rare, at section boundaries only.
  - A **lift** up a whole step or a semitone for a late peak. Pure synthwave cheese, played straight.
  - A **modal shift** with the same root (Aeolian → Phrygian) as danger rises.
  - A **return** to the song's home key on recap.
- **Between songs:** the key relation and the pivot chord are chosen by the transition (§11.5).

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

A **motif** is a rhythm cell (1 bar or less), a contour and a set of intervals in scale degrees relative to the chord. **Each song has
its own main motif**, and the planner can invent secondary motifs for a song's bridge. The save's theme motif (§15) is quoted by some
songs, not all, as a thread through the night.

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

All of these are testable on generated phrases (§20).

## 10. Form inside a song

A song develops instead of looping or wandering. Three ideas carry it:

- **Material is kept, not re-rolled.**
- **Bars have roles inside phrases.**
- **A song planner chooses deliberate moves at phrase and section boundaries,** scored against an energy plan and listener fatigue.

### 10.1 The time hierarchy

| Level | Length | What is decided there |
|---|---|---|
| step | a 16th | nothing (rendering only) |
| bar | 16 steps | rendering, micro-variation (§10.3) |
| phrase | 4 or 8 bars | bar roles, fills, one or two arrangement moves (§10.5) |
| section | 2–4 phrases | section type, which material is bound to which role, harmony changes, phrase form |
| song | a few minutes | character, material, energy plan, form, ending (§11) |
| night | many songs | the setlist: which song comes next, contrast, reprises (§11.4) |

### 10.2 Material

Everything a role plays comes from **material**, and **material belongs to a song**:

```ts
interface Material {
  id: string; song: SongId; role: RoleId;
  kind: 'riff' | 'drums' | 'progression' | 'motif' | 'ostinato' | 'arp' | 'rhythm' | 'voicingStyle';
  seed: number;          // generation is deterministic from this
  born: number;          // bar
  variant: number;       // which variation of it is current; variations are derived, not re-rolled
  uses: number; lastUsed: number;
  exposure: number;      // fatigue, §10.5
}
```

- A material is **invented once** and played for as long as the planner wants it. Inside a phrase it repeats, which gives the song an
  identity. Across phrases it advances through **variants**: related versions produced by the role's variation operators (for example a
  bass riff with one note changed, an octave flip, a displaced accent, a thinned version or a busier one). Variants are deterministic from
  `(seed, variant)`.
- New material is invented only when the planner chooses a "new material" move (usually for a bridge). Earlier material can be
  **recalled** for a recap, so a song has callbacks inside itself.
- **A song's material is generated in its character** (§11.1): an acid song's riffs are acid riffs, and a brooding song's progressions
  move slowly.
- Material carries no axis values. The same riff becomes clean or vicious through the patch's mod routes, so a fight that breaks out in a
  bar plays a **fight version of the current song**, not unrelated music.
- Songs are kept in the setlist (§11.4) with all their material, so a song can be **reprised** later in the night.

### 10.3 Inside a phrase: bar roles

Each bar in a phrase has a role:

- **4-bar phrase:** `statement, repeat, variation, turnaround`.
- **8-bar phrase:** `statement, repeat, variation, statement' | statement, repeat, variation', turnaround`, or the sentence shape when the
  lead is playing.

What each role means for the layers:

- **Statement and repeat:** play the bound material as it is. Repetition is deliberate here.
- **Variation:** each eligible layer may apply **one** small operator (a drum ghost note or open-hat accent, a bass note change or
  octave flip, a pad inversion or rhythm change). The variation budget scales with `volatility` and the song's `complexity`.
- **Turnaround:** a fill graded by energy, a bass pickup into the next downbeat, a pad swell or cut, a cadence (§8.2) and, when the next
  phrase brings a big change, a **pre-drop gap** (kick and bass out for the last beat or two).
- **Micro-variation, every bar:** velocity humanizing and an occasional ghost note keep identical bars from sounding machine-printed. It
  never changes the material's identity.

### 10.4 Sections

| Section | Purpose | Shape |
|---|---|---|
| **intro** | Establish the song | Bed and texture first, then one layer enters each phrase. The hook is held back. |
| **groove** (A) | The main material | Steady, with variation bars and the occasional layer swap |
| **build** | Create pull | Add or brighten each phrase (`sectionPos` routes), snare roll density up, a riser, a dominant pedal, then a pre-drop gap |
| **peak** (B) | Pay off | Full band, the hook in front. Stabs on chord changes. |
| **breakdown** | Breathe, so the next peak can land | **Subtract first**: strip to bed, drone and counter or a lead fragment, half-time allowed, new harmony allowed |
| **bridge** (C) | Contrast after A has been heard a lot | New material for one or two roles (new progression, a sibling swap such as pluck→arp or pad→choir, a secondary motif) |
| **recap** (A') | Return | Recall the earlier material in a varied, fuller form, possibly lifted a key (§8.2) |
| **outro** | End the song | Remove layers one per phrase, with tails into the reverb, then a final cadence (§11.3) |
| **transition** | Hand over to the next song | Owned by two songs at once (§11.5) |

Section transitions follow a weighted grammar. The song's character shifts the weights (§11.1), and the planner scores the candidates
(§10.5):

```
intro -> groove
groove -> build | bridge | breakdown
build -> peak
peak -> breakdown | bridge | peak (at most once)
breakdown -> build | recap
bridge -> build | groove
recap -> build | peak | outro
outro -> transition
```

### 10.5 The song planner

This is where the intelligence lives. It uses the same utility-AI pattern as the hero (DESIGN.md §4): score the options, then pick with a
low-temperature softmax from the music Rng. It is deterministic, deliberate, and only rarely surprising.

**Energy.** The arrangement's energy is computed from what is playing:

```
energy = Σ layerWeight(role) × noteDensity(role) × brightness(role)
```

**Energy plan.** From `energyBand`, `volatility` and the song's character, the planner draws an **intended energy curve** across the
song's form:

- a rise into a peak near the band's ceiling, a breakdown near its floor, back up, and a wind-down at the end.
- A wide band (a fight) gives big dynamics. A narrow band (a quiet shop) gives subtle motion: pad inversions, an arp coming and going,
  bells.
- **Constant axes still give a moving curve.** The band stays put while the song moves through its sections inside it, and eventually
  ends.
- The curve's shape is the song's own: a `brood` song has long low stretches and one late peak, a `drive` song sits high with short
  breaths (§11.1).

**Fatigue.** Every active layer, every bound material and the current section type accumulate **exposure** while they play unchanged.
Exposure decays while they rest. Total fatigue raises the value of change. **Familiarity** is valued too: recalling something heard a
while ago scores better than inventing something new, up to a point. Fatigue that no move inside the song can relieve any more is one of
the signals that the song is done (§11.3).

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
| key change | late-song lift, section boundary only, rare |

**Scoring:**

```
score(move) =  wE · (how close the result's energy is to the intended curve)
            +  wN · (fatigue relieved)
            +  wC · (coherence: fits the section's purpose, reuses or recalls the song's material, keeps the hook present, fits the song's character)
            −  wD · (disruption: number of simultaneous changes; touching the foreground voice mid-phrase)
            −  orchestration penalties (§10.6, hard rules are vetoes)
```

**Limits:** at most 1–2 small moves or 1 big move per phrase boundary, and more at section boundaries.

**Planning, not just greedy choices.** At a section boundary the planner picks the next section from the grammar, scored by the energy
plan, fatigue and how far through the song it is (`songPos`). Inside the section, phrase moves serve its purpose:

- A **build** adds or brightens every phrase.
- A **breakdown** subtracts first, then reintroduces one element per phrase.
- A **peak** spotlights the hook.

The result is staggered entries, grouped exits and "subtract before you add" before a payoff, which is how an arranger works.

**Every decision is logged with its reasons** for MusicLab (§10.8), for example
`"Chrome Psalm" phrase 14: drop arp (exposure .82, build next, density budget)`.

### 10.6 Orchestration rules

Hard rules (vetoes):

- **One spotlight.** At most one foreground voice at a time (lead, siren, or the counter when it carries the melody). The counter only
  answers in rests.
- **Slots:** one voice in the low slot (one bassline, even during a transition), one in the air slot, at most two in high-mid, and pluck
  and arp never together.
- **Floors:** a groove section needs kick or bass. The sub plays whenever the bass plays.
- **Minimum lifetimes:** a layer that enters stays at least one phrase, and a material stays at least two phrases, so nothing flickers.
- **Boundaries:** layers enter and leave only at phrase boundaries (or section boundaries for big moves). The only exceptions are cues
  (§12).

Soft rules (penalties):

- **Rhythmic complementarity:** two busy voices (≥ 8 onsets per bar) shouldn't share a slot or the same rhythm. The arp thins when the
  hats are at 16ths, and stabs either lock to the bass or answer it.
- **Density budget:** total onsets per bar stay under a cap set by the energy band.
- **Gestures:** an entry gets an entry gesture (the patch's `entry` mod route: filter-in, swell, or a reverse cymbal on big ones). An
  exit gets an exit gesture (`exit`: filter-close, a tail into the reverb). Hard cuts are reserved for drops, pre-drop gaps and cues.

### 10.7 How the axes and the song share control

- **The axes decide what is allowed and how it sounds:** the palette, which roles are eligible (the siren needs heat, the choir needs
  darkness), the energy band and volatility, and every patch's mod routes.
- **The song decides who it is:** tempo, key, patches, hook, material and the shape of its curve.
- **The planner decides when and how, inside both.** Slow axis drift moves the band, and the planner absorbs it into its curve.
- **Sharp changes override the plan.** A drop or dread cue (§12) makes the planner abandon its current section and jump to a matching
  one (a peak or a breakdown) on the next bar, restarting the phrase count from there. It **keeps the song and its material**, so the
  music changes state without changing identity. Events never end a song, apart from death and dawn (§11.3).

### 10.8 MusicLab timeline

The lab view needed to tune all of this:

- a scrolling timeline of songs (titled), sections and phrases, with transitions shown as overlaps
- active layers as lanes, with entries and exits marked
- the intended and actual energy curves, with the band
- per-layer fatigue, and the song's ending pressure (§11.3)
- the planner's and setlist's log lines for each boundary
- each song's character as a small radar or bar readout, so contrast between songs is visible
- a "next song" button to force a transition while tuning

Sliders let you hold the axes still and listen for whether it still develops, and whether it moves on.

## 11. Songs

A song is the unit of identity. The axes shape how a song is *performed*, while its character decides *what it is*. Over a night the
music plays a **setlist** of songs that differ from each other, each with a beginning, a development and an end, joined by deliberate
transitions.

### 11.1 Character

Each song rolls a **character** when it is created, much as each save rolls Blackbird's personality (`engine/src/personality.ts`).
Character is a vector of 0..1 traits plus a few discrete picks.

**Traits:**

| Trait | Low | High | What it moves |
|---|---|---|---|
| `drive` | loose, half-time leaning | relentless four-floor | kick families, hat density, energy floor, section weights (more groove/peak) |
| `brood` | restless | slow, heavy, spacious | harmonic rhythm, note lengths, breakdown weight, a late single peak |
| `melody` | groove-forward | lead-forward | how often the lead and counter are eligible, hook role |
| `acid` | round bass | resonant, squelchy bass | bass patch and templates, resonance baseline, bass as hook |
| `grit` | polished | crushed, saturated | drive and crush baselines, kit variant, texture level |
| `space` | dry, tight | huge reverb and delay | send levels, IR length, sparser arrangements |
| `swing` | straight | swung | groove swing (added to the palette's) |
| `lift` | bleak minor | heroic synthwave | mode choice (Dorian, add9, the odd major chord), brighter patches |
| `complexity` | simple, hypnotic | busy, developing | harmonic rhythm, chord extensions, how many materials, the variation budget |
| `length` | short and punchy | a long journey | target length (§11.2) |

**Discrete picks:**

- **tempo** inside the palette's range (±6 BPM around its centre), nudged by `drive`
- **key**, chosen by the transition from the previous song (§11.5)
- **mode bias**, from the palette's bias plus `lift` and `brood`
- **patches** for each role, from the alternates, weighted by the traits
- **kit variant**
- **groove templates** the riff draws from
- **form preference**, for example `ABAB'`, `A–build–peak–breakdown–peak`, or a long slow-burn single build
- **the hook (signature):** the one element the song is known for. It is a role plus its main material (an acid riff, a lead motif, a
  stab rhythm, an arp figure, a vox-chop line). The planner keeps it present: it is held back in the intro, it lands at the first peak,
  it returns in the recap, and it gets a coherence bonus throughout.
- **theme quote:** whether this song quotes the save's theme motif (about 30% of songs), and where (counter in the breakdown, bells in the
  outro)
- **a title**, often about what just happened in the night ("Six Separate Groups"), otherwise from a word table ("Chrome Psalm").
  It shows in MusicDock and the timeline. See §11.6.

**How character reaches the music:**

- **Generation:** materials are generated in character (§10.2).
- **Patches:** picks, plus `trait:` mod routes (§6.3).
- **Planner:** section grammar weights, the shape of the energy curve, and coherence scoring for the hook and the song's signature roles.
- **Macro offsets:** small offsets (at most ±0.15) on macros, for example a `grit` song raising the aggression floor a little. The axes
  always dominate: a gritty song in a quiet shop is still quiet, just rough at the edges.

Character traits are **registered like axes**, as a table of rows with weights into the systems above. New traits can be added the same
way new axes can (§5.3).

### 11.2 Length and lifecycle

```
created -> intro -> body (sections per the planner) -> outro -> transition -> (the next song takes over)
```

- **Target length** comes from `length`: about 3 to 7 minutes, converted to bars at the song's tempo and rounded to whole phrases.
- **The arc is required.** A song isn't allowed to end until it has had its intro, at least one peak or full-energy section (scaled to
  the band, so in a quiet stretch it's a modest one), at least one breakdown or bridge, and its hook has been heard at least twice.
- The planner always knows `songPos` (0..1 through the target), and uses it both to place the arc and to steer toward an ending.

### 11.3 Endings

A song ends from **within the music**, even when the game is samey. **Ending pressure** rises with:

- `songPos` past 1.0 (the target length reached)
- **exhaustion:** fatigue that no in-song move can relieve any more (every sibling swapped, every material varied out, the recap done)
- a **sustained shift in the axes**, where the song's character no longer suits the band it has been playing in for several phrases
  (for example, a brooding song through a long chase). It's the axes' lasting state that counts, not a single event.

When pressure crosses a threshold, the planner steers to an ending through the grammar (`recap → outro`, or `peak → outro` for a
big finish). It never cuts away mid-section. There is a **hard ceiling** of 1.5× the target length, after which the outro is forced at
the next section boundary.

**Ending styles,** picked by character and energy:

- **Wind-down:** layers leave one per phrase, then a final cadence into the drone.
- **Big finish:** the last peak ends on a hit and a long reverb tail.
- **Dissolve:** the beat drops out and the beds hold while the next song's intro rises underneath (this is effectively a breakdown-bridge
  transition, §11.5).

**Events that do end a song:**

- **Death** ends it on the spot (the tape-stop cue, §12.1). The music then fades out, since the lab has no music yet. A new song starts
  when the next run goes out.
- **Dawn** moves the song to its outro, and the night ends with it.
- **A district change** after she has stayed long enough (§13) triggers a transition to that district's music, with a shorter outro.

### 11.4 The setlist: choosing the next song

`setlist.ts` keeps every song of the night (seed, character, palette, title, materials, bars played). The last few also survive a
reload (§11.7). When a song begins to end, it
chooses the next one. This is the same scored-candidates pattern again.

1. **Generate candidates:** about 6 new song seeds from the music Rng, each with a rolled character, plus any **reprise** candidates
   (§11.4.1).
2. **Score each one:**
   ```
   score(song) =  wK · contrast with the current song (trait distance: wants clearly different, not maximally different)
               +  wV · variety across the last few songs (penalize a character close to any of them)
               +  wP · fit to the palette (the district's signature roles and mode bias)
               +  wA · fit to the current macros (a long chase favours drive; a long dread favours brood and space)
               −  wT · transition cost (tempo and key distance from the current song, §11.5)
   ```
3. **Pick** with a low-temperature softmax. It is deterministic from the seed.

The aim is that each song plainly has a different character from the last while still belonging to the same night and the same place.

#### 11.4.1 Reprises

A song from earlier in the night can come back, which is the setlist's version of a callback (TONE.md, "Callbacks"):

- She returns to a district whose song she left mid-way.
- Or enough songs have passed that a familiar one feels earned.

A reprise keeps its character, title and material. It starts from its intro (or at its recap, for a quick return) and runs a shorter
form. A song is reprised at most once a night.

### 11.5 Transitions

A transition is a section owned by two songs at once. Both songs' material is available, and the orchestration rules still apply, so
there is always exactly one bassline and one spotlight.

**Key relation** (from the outgoing key to the incoming one, each with a cost):

| Relation | Feel | Cost |
|---|---|---|
| same key | seamless | lowest, but penalized if overused |
| up or down a fifth | natural | low |
| relative major/minor | colour change | medium |
| up a whole step | lift | medium |
| up or down a semitone | dramatic | high, only with a beatless transition or a cut |

The change happens through a **pivot chord** that both keys share. Where there isn't one, it happens over the drone, in a beatless
transition.

**Tempo:** a ramp of at most about 1 BPM per bar inside a beat-carrying transition. Any bigger change happens while there's no beat.

**Transition types**, chosen by tempo and key distance, the contrast between the songs and the current energy:

- **Blend** (8–16 bars), the DJ mix, used when the songs are close in tempo and key:
  - The incoming drums slide under the outgoing song first.
  - The basslines **swap** at a phrase boundary, never overlapping.
  - The outgoing harmony and lead leave, and the harmony pivots.
  - **The incoming hook arrives last**, as the reveal.
  - Favoured when energy is high, so a fight carries straight through a song change.
- **Breakdown bridge**, used for big differences in tempo, key or character:
  - The outgoing song winds down to bed, drone and texture.
  - The tempo and key change while there's no beat.
  - The incoming song's intro builds from that bed.
  - Favoured when energy is low.
- **Riser-drop:** the outgoing song builds, and the drop lands in the incoming song's first peak. Used when a drop cue arrives during an
  outro, or for a high-energy district change.
- **Cut:** the outgoing song ends on a hit, then a beat or a bar of tail, then the new song. It's rare: a hard district change, or after
  a big finish.

Texture beds belong to the place, not the song, so they carry on unbroken through every transition except a cut.

### 11.6 Titles

Songs are often named after what just happened. **A song is about the stretch of night before it:** its title is chosen when it is
created, from what happened while the previous song played. The comedy is the same as the log's: a dead-serious darksynth track called
"Six Bucks".

**Facts.** The bridge keeps a rolling buffer of **title facts** from released events, cleared when a song starts.

- `facts.ts` extracts them at step time, alongside the axis reads, from the event's `data` and the read-only world. It uses a table
  keyed by event type, and events with no row give no facts.
- A fact holds:
  - the event type and outcome
  - the named things: a place, a district, a person's name or role, a gang, a dragon model ("Ares Mk. IV"), an item or weapon
  - any specific number: cash, kills, how many came after her
- Each fact has a **salience** score:
  - the event's weight (a dragon fight or a heist beats a bowl of noodles)
  - an extreme outcome
  - rarity tonight
  - recency
  - a bonus for specific numbers and proper nouns, which are funnier (TONE.md, "Specific numbers and brand-ish nouns")

**Templates.** `titles.ts` holds templates tagged by fact kind and outcome, in the same spirit as the text layer:

| Fact | Template | Example |
|---|---|---|
| a count | `{Count} Separate {Things}` | "Six Separate Groups" |
| cash, small | `{Amount} Bucks` | "Six Bucks" |
| a place and time | `{Place}, {Hour}` | "Rusty Halo, 3 AM" |
| a dragon | `{Model} (Get Inside)` | "Ares Mk. IV (Get Inside)" |
| a person | `Ballad of the {Role}` | "Ballad of the Blue-Haired Bartender" |
| a gang | `{Gang} Don't Dance` | |
| an item lost or broken | `Requiem for a {Item}` | "Requiem for a Pool Cue" |
| a bad night | `{RealName} Has Left the Building` | rare, the deflating government name (TONE.md, "The hero") |

Rules:

- **An event title only when it is earned:** the top fact's salience must clear a bar. Otherwise the song gets a word-table title. In an
  eventful night roughly half the titles reference events, and in a quiet one few do.
- At most 32 characters, in title case.
- No title repeats one in the setlist or the persisted memory, and no fact is used twice.
- Picked with the music Rng, so it is deterministic from the facts and the seed.
- **Inspiration (light):** the fact that names the song nudges its character a little, at most ±0.1 per trait. For example, a dragon
  nudges `brood` and `grit`, a heist nudges `drive`, and a club night nudges `lift`. The song then sounds a bit like what it's named for.

Titles appear in MusicDock ("Now playing") and the MusicLab timeline. They stay out of the chronicle, which belongs to the sim.

### 11.7 Memory across reloads

The **last 5 songs** survive a page reload. The whole history doesn't. This memory lives in its own `localStorage` key
(`cyberknight.music`) next to the game save (`cyberknight.save`), never inside it: the sim's save stays free of music.

```ts
interface MusicMemory {
  v: number;                 // format version: a mismatch discards the memory
  worldSeed: string;         // the save it belongs to: a different save (a new universe) discards it
  songCount: number;         // the next song index, so song seeds keep advancing and never repeat across reloads
  recent: StoredSong[];      // the last 5, newest last
  current?: { index: number; section: SectionType };   // what was playing when the page closed
}

interface StoredSong {
  index: number; seed: number;
  gen: number;               // the song generator's version
  title: string;             // kept verbatim: it came from events that are gone now
  palette: string; key: number; tempo: number;   // set by the transition into it, so not derivable from the seed
  traits: Record<string, number>;
  run: number;               // which night (legacy.runs) it played in
  reprised: boolean; barsPlayed: number;
}
```

- **Material is not stored.** It is regenerated from `seed`, `palette`, `key`, `tempo` and `traits`, which keeps each entry to a few
  hundred bytes.
- If a stored song's `gen` doesn't match the current generator, regenerating it would give different music. It is kept for contrast
  scoring and title de-duplication, but never offered as a reprise.
- **What it's used for:**
  - contrast and variety scoring for the next song (§11.4)
  - reprise candidates. "At most once a night" is checked against `run`.
  - title de-duplication
  - **picking up after a reload:** if `current` is set and the run is the same, the song that was playing comes back from the start of
    the section it was in. This doesn't count as its one reprise. A new night always starts with a new song.
- **Writes** happen at song start, song end and section boundaries, never per bar, and are wrapped in `try/catch`. Without storage
  (private mode, cleared data) the music still works and simply starts with no memory.

## 12. Cues and the viewer

### 12.1 Cues

The bridge turns notable events, and axis thresholds, into cues. Each cue has a **grid**, a **priority** (only the highest pending cue
per grid slot wins) and a **cooldown**. Big cues act through the song planner (§10.7), not around it.

| Trigger | Cue | Grid |
|---|---|---|
| first `fight_round` / `ambush` / `join_brawl` / `gang_brawl` of a group | **Drop**: a riser over the remainder, then the planner jumps to a peak with an impact | bar |
| `dragon_notices`, `dragon_near`, Ares `scream` | **Dread hit**: a sub-drop boom, the kick cuts, the planner jumps to a breakdown with choir and drone, plus a siren swell | beat |
| `give_chase`, `pursuit`, `chase_mount` | **Push**: a fill now, +4 BPM at the next phrase, the siren becomes eligible, double-time hats | 16th → bar |
| `chase_end` (good) | **Release**: a filter sweep down, and the planner heads to a breakdown or groove | bar |
| a hit taken (`fight_round` bad, `injury`, `car_hit`) | **Flinch**: a one-beat master lowpass dip, or a glitch stutter at high aggression | 16th |
| a foe or dragon down, `victory` | An impact plus a crash. A real `victory` gets the Picardy major chord with the hook on bells. | beat / bar |
| `level_up`, `skill_up` | The current song's motif as a quick bell arp | beat |
| `death`, `dying_dies` | **Tape-stop**: `playbackRate` and frequencies ramp down over ~1.2 s, then silence. The song ends (§11.3). | 16th |
| `dawn` | The planner moves to an outro | phrase |
| an axis crossing a threshold (data: `{ axis, above \| below }`) | for axes added later | per row |

Outcomes (`good`/`bad`/`mixed`) only choose between cue variants. They don't move an axis.

### 12.2 Feeding events from the viewer

The viewer **steps the world ahead of what the player reads**: `stepWorld` queues chunks, and `release` reveals one every tick (2.4 s
at 1×). The music follows what is on screen:

- At step time, the bridge runs every registered axis's `read(w)` and attaches the results, plus the chunk's `GameEvent[]`, to the
  chunk. The world stays read-only.
- At step time it also runs the title-fact extractor (§11.6) and attaches those facts.
- **On `release`**, not on step, the bridge calls each axis's `target`, feeds the cue table and adds the facts to the title buffer.

### 12.3 Speed, skip and catch-up

- **At 2× and 5×** the axes follow as normal. Cooldowns scale with speed, and low-priority cues are dropped above 2×. Songs keep their
  own tempo and length, so fast-forwarding doesn't speed through songs.
- **Skip, offline catch-up and a jump to the digest** feed no events. They set the axes to the final state, and the planner moves there
  through one section change. The setlist doesn't pretend that songs played while the music wasn't listening.

## 13. Palettes (place)

A palette is data. It sets the **range** songs are created in: a tempo centre, a mode bias, kit families, a bed preference, signature
roles and swing. It also owns the **texture**, which is continuous across songs.

| District | BPM centre | Mode bias | Kit / color | Bed | Signature roles | Swing | Texture |
|---|---|---|---|---|---|---|---|
| `market` | 108 | Aeolian, Dorian at rest | tight, clicky | bright PWM pad | pluck, bells | 4% | crowd murmur |
| `nightlife` | 124 | Aeolian | full club kit, big claps | lush supersaw | arp, stabs, lead | 0 | none (club wins) |
| `tenement` | 112 | Aeolian | dusty, lo-fi hats | warm filtered pad | counter, pluck | 8% | hum, distant TV hiss |
| `industrial` | 128 | Phrygian | metal perc, hard kick | cold narrow pad, drone | stabs, acid bass | 0 | machine drone |
| `corporate` | 118 | harmonic minor | clean, glassy | glassy wavetable pad | bells, arp | 0 | air-handling whine |
| `slum` | 116 | Phrygian, Locrian tint | distorted, crunchy | grimy saw, choir | siren, broken drums | 10% | dripping, rumble |

**Moving between districts:**

- The texture crossfades over a phrase straight away.
- **The song changes only if she stays.** If she is still in the new district after a dwell (about one phrase of game beats), the
  current song gets a short outro and transitions (§11.5) to a reprise of that district's song, if there is one, or a new song created in
  the new palette. Passing through a district on the way somewhere doesn't make the music thrash.
- Until then, the current song continues with the new palette's continuous parameters blended in a little.

**Location-kind overrides** apply on top of the song, instantly (at the next bar):

- `club`: four-floor and a high energy floor, with aggression capped unless danger is set. She's dancing.
- `bar`: the mix goes through a lowpass about 2 kHz plus a room reverb ("the song from the next room"). It lifts when a fight starts.
- `home`: a quiet bed-only arrangement of the current song (drone, pad, counter).
- `tunnel` and `lair`: long dark reverb, with half-time weighted up.
- `boss`: a danger floor of 0.7.

**The lab screen** is out of scope for now. The music fades out there. It will get its own composed piece later.

## 14. Vehicles

Driving overlays the palette: an engine-drone texture, the band's floor raised one step, and the pluck or arp favoured. This is optional
and comes in the place phase.

## 15. Per-save identity

Each save rolls a **theme** from the music Rng, seeded from the universe's `worldSeed` plus `'music'`. That seed lasts across runs, as the
save does:

- a **home key**, biased toward E, F, F♯, G, A for low-end weight. The night's first song starts here, and the setlist drifts away from
  it and back.
- a **theme motif** of 5–7 notes, which some songs quote (§11.1)
- a seed for every song, from `(theme seed, song index)`. The song index carries across reloads (§11.7).

## 16. Samples (author-supplied)

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
  | `impact`, `boom` | for drops, dread hits and big finishes |
  | `riser`, `reverse_cymbal` | optional |
  | `glitch` ×2, `vox` ×2 | optional chopped one-shots. A `vox` sample can also be an oscillator source (`wave: 'sample'`) for a pitched vocal-chop hook. |
- More variants per role give songs more kits to choose between.
- **Playback variation:** round-robin, ±2% rate drift (not on the kick), and velocity to gain and to a lowpass.
- **Every role has a synth fallback renderer**, so the sample kit is never required.

## 17. Mix and master

- **Buses:** `sub`, `bass`, `drums`, `beds` (pad, choir, drone), `music` (stabs, pluck, arp, bells), `lead` (lead, counter, siren),
  `texture` and `fx`.
  - Sends go to one `reverb` (a `ConvolverNode` with a generated noise-decay IR, length from palette, song `space` and darkness) and one
    `delay` (feedback through a bandpass, tempo-synced).
  - During a transition each song gets its own bus group, so the two can be faded and filtered independently. A new IR is swapped in
    with a crossfade between two convolvers.
- **Sidechain:** faked by automating a gain dip on `bass`, `beds` and `music` at every kick (up to about −8 dB, release about 1/8 note),
  with a shallower dip on `sub`. The `lead` bus is barely ducked, so the melody stays on top.
- **Spotlight mixing:** while a foreground voice plays, `music` drops ~2 dB and loses a little high end (a gentle shelf), so the lead
  sits in front without a volume war.
- **Master:** highpass 25 Hz → glue compressor → tanh soft clip → limiter-style compressor → user volume. Mono below ~120 Hz.
- **Levels:** the music sits *under* reading. The default volume is modest, with an optional dip while the viewer waits on her question.

## 18. Performance

- Persistent mono voices and prebuilt poly pools (§6.2). Only one-shot hits create nodes.
- Aim for about 80 active nodes at peak with the full ensemble, and about 1.5× that during a transition, when two songs' voices
  overlap. Transitions keep their overlap short and move layers across one at a time, so the peak never has two full ensembles.
- A `lowPower` flag, set when the scheduler sees late callbacks, shrinks poly pools, drops unison voices, disables the formant bank (the
  choir falls back to the pad) and prefers breakdown-bridge transitions (less overlap).
- The conductor's work happens once per bar and is cheap. The planner scores a dozen moves at most once per phrase, and the setlist
  scores about six candidates once per song.

## 19. Phases

Each phase ends playable in MusicLab, with `npm test` and `npm run typecheck` green, and has a listening bar to clear.

1. **Engine, axes, patch model, sub and bass.** `synth/engine.ts`, the scheduler, `voice.ts` and `pool.ts`, the patch types, **the
   axis registry and macro table** (from day one, so nothing hard-codes an axis), the synth kick, the sub, and the **character bass
   built as a patch** with the full aggression morph. *Done when sweeping aggression from 0 to 1 goes from clean and locked to distorted
   and syncopated with no clicks, and the sub stays clean.*
2. **Harmony and the beds.** `theory`, `harmony`, `voicing`, synth drums, pad, stabs and drone, the sidechain and the master chain. A
   fixed 8-bar loop for now. *Done when a progression moves smoothly with no voice jumping, and the stabs sit with the bass both locked
   and answering.*
3. **Form inside a song.** The material pool and variants, bar roles, sections, the song planner (energy plan, fatigue, moves,
   scoring), orchestration rules and the MusicLab timeline. One fixed character for now. *Done when five minutes with the sliders held
   still doesn't feel like a loop, and the timeline explains every change.*
4. **Melody.** Motifs, transformations, phrase forms, the lead, counter, pluck and arp, and the spotlight. *Done when the lead sounds
   like phrases that ask and answer, and the motif is recognizable in different sections.*
5. **Songs.** Character and traits, song generation (patch picks, tempo, hook, titles), length and lifecycle, ending pressure and
   ending styles, the setlist with scored candidates and reprises, word-table titles, and all four transition types with key relations
   and pivots. *Done
   when twenty minutes with the sliders held still plays a run of distinct songs, each one recognizable by its hook, and every handover
   sounds intentional.*
6. **Samples.** Manifest loader, round-robin, kick tuning and the author's kit as it arrives.
7. **Bridge.** `bridge.ts` driven by the registry, axis reads on chunks, feeding on `release`, the cue table and planner jumps, speed
   scaling, and `MusicDock` with the now-playing title in NightViewer. Title facts, event titles and inspiration, and the persisted song
   memory with pick-up after a reload. *The first time it plays along with a real night. Done when a reload mid-song picks the song
   back up.*
8. **Heat and place.** The heat axis end to end (tempo push, siren), district palettes, the dwell rule and district transitions,
   location-kind overrides, choir, bells, weather beds, key changes inside songs and the vehicle overlay.
9. **Polish.** Victory, death and dawn cues, glitch gestures, and an `AudioWorklet` only if a voice needs it.

## 20. Tests (all in `npm test`, all node-side, no balance tests)

**Determinism and safety**
- The same theme seed and axis trajectory produce identical bars, identical planner decisions and an identical setlist.
- The music never reads or advances `w.rng`: a run with the bridge attached has the same `rngPosition` as one without.
- Every patch's mod routes name real parameters and known sources.

**Axes and extensibility**
- Asymmetric slew and hysteresis.
- A fixture axis registered only in a test drives a patch parameter (`axis:<id>`) and a role's eligibility with no other file changed.
- Unknown axis or trait ids in any data table fail validation.
- Representative event streams produce the expected targets and cues, and cooldowns hold across a long fight.
- Every cue has a renderer.

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

**Form inside a song**
- **With the axes held constant for 128 bars:**
  - no two consecutive phrases render identically
  - something changes at least every 2 phrases
  - at least one material is recalled in a non-adjacent section
  - energy covers at least half of the band
- Layers enter and leave only at phrase boundaries (cues excepted), and minimum lifetimes hold.
- Never more than one foreground voice or more than one bassline (including during transitions). Slot caps and the pluck/arp exclusion
  hold.
- A drop cue jumps to a peak on the next bar and keeps the song and its material.

**Songs**
- **With the axes held constant for 1,000 bars:** at least three songs play, and every one ends through an outro and a transition (no
  song is cut off by the clock).
- Every song before it ends has had an intro, a peak, a breakdown or bridge, and its hook at least twice.
- No song outlives 1.5× its target length.
- Consecutive songs differ in character by at least a threshold distance, and no two of the last three are within it.
- Key changes between songs use allowed relations. Beat-carrying transitions change tempo by at most ~1 BPM per bar.
- A reprise reuses the original song's material and title, and happens at most once a night.
- A district visit shorter than the dwell doesn't change the song.

**Titles and memory**
- Every title template fills from fixture facts. Titles stay within 32 characters, and none repeats one in the setlist or the memory.
- A dragon fight outranks noodles for the title. Below the salience bar, a song gets a word-table title.
- Fact extraction never mutates the world.
- The memory round-trips through JSON, holds at most 5 songs, and is discarded on a version or `worldSeed` mismatch. A song with a stale
  `gen` is never offered as a reprise.
- Song indices continue across a simulated reload, so no seed repeats.

Listening is the real test. These catch regressions.

## 21. Open questions (for later, not blockers)

- **The lab piece:** its own composed music, out of scope for now (§13).

## As built

### Phase 1: engine, axes, patch model, sub and bass

Where to find it:

| What | Where |
|---|---|
| Types, the shared vocabulary | `music/score/types.ts` |
| Axis registry, macro table, slew and hysteresis | `music/score/axes/` |
| Mod routes: parameter paths, evaluation, validation | `music/score/mods.ts` |
| Patches (sub, bass) | `music/score/patches/index.ts` |
| The character bass generator | `music/score/roles/bass.ts` |
| Kick and sub | `music/score/roles/rhythm.ts` |
| The conductor | `music/score/conductor.ts` |
| Mono voice built from a patch | `music/synth/voice.ts` |
| Synth kick | `music/synth/kick.ts` |
| Buses, sidechain, master | `music/synth/mixer.ts` |
| Graph and live scheduler | `music/synth/graph.ts` |
| Live engine (AudioContext lifecycle) | `music/synth/engine.ts` |
| Offline renderer | `music/synth/offline.ts` |
| Audio measurements | `music/tools/analysis.ts` |
| Render script | `scripts/music-render.ts` (`npm run music:render`) |
| MusicLab | `components/MusicLab.tsx`, at the `/music` route |

Where it differs from the plan:

- **MusicLab is its own route, `/music`**, rather than a `?music=lab` flag on the game page. It keeps the lab out of NightViewer.
- **Randomness is hashed, not streamed** (`music/score/rng.ts`). Every decision is `unit(seed, what, where)`, so it can be re-derived
  without carrying a stream position, and the engine's `Rng` class isn't needed. The music still never touches `w.rng`.
- **The bass riff uses threshold sampling.** Each step of the 2-bar riff owns fixed random numbers, and a note sounds when its number
  falls under the step's probability for the current macros. Aggression only moves the probabilities, so the riff keeps its identity
  across the whole morph.
  - The locked spine and the busy templates combine as a probabilistic OR.
  - The spine fades as `1 - a²`, so syncopation arrives before the roots leave, and the middle of a sweep never thins out.
- **Axes have no `read`/`target` yet.** Those arrive with the bridge (phase 7). Until then axes are set by hand.
- **The sub always holds its root and ties across bars.** It gets its pulse from the kick's sidechain duck, instead of re-triggering
  with the kick at high density.
- **Drive is a pre-gain into a fixed tanh curve with makeup gain** (`amount^-0.4`), because a WaveShaper's curve can't be automated.
  The crusher is a wet/dry mix of a stepped curve. It opens above aggression 0.75 through a new route `window` field.
- **The bass's band-split highpass is 24 dB/oct** (two cascaded biquads at 110 Hz). At 12 dB/oct the square an octave down leaked into
  the sub band (-15 dB below 80 Hz). It now measures about -21 dB.
- **The render script (`npm run music:render`) renders clips in headless Chromium and checks them.** It's outside `npm test`.
  - **Clips:** `sweep`, `locked`, `aggressive`, `dread` and `chase`, written to `out/music/` (gitignored).
  - **Checks on every clip:** clipping, peak, loudness, crest factor and DC.
  - **Extra checks on the sweep's stems:** the sub's energy above 200 Hz, clicks on the sub, the bass's energy in the sub band, and the
    bass-to-sub balance.
  - **Dev dependencies added:** `playwright-core`, which drives the preinstalled Chromium, and `esbuild`, which bundles the renderer.
    On a fresh machine, run `npx playwright install chromium` once.
- **Levels:**
  - The buses meet at 0.22 gain before the master, so the limiter stays idle. Peaks sit around -3 dBFS and loudness around -13 dBFS
    RMS.
  - The bass sits about 7 dB under the sub in RMS, which reads as level, since the sub is so low.

### Phase 2: harmony and the beds

Where to find it:

| What | Where |
|---|---|
| Modes, chord building, borrowed chords | `music/score/theory.ts` |
| Progression banks, the 8-bar loop, turnaround, mode, pedal, tension notes | `music/score/harmony.ts` |
| Voice leading | `music/score/voicing.ts` |
| Pad and drone | `music/score/roles/beds.ts` |
| Stabs | `music/score/roles/stabs.ts` |
| Hats, backbeat, percussion, fills | `music/score/roles/drums.ts` |
| Voice pool and its pure allocator | `music/synth/pool.ts`, `music/synth/alloc.ts` |
| Synth drums | `music/synth/drums.ts` |
| Generated reverb | `music/synth/impulse.ts` |

Where it differs from the plan:

- **Chords are written as scale degrees and take their quality from the mode.** A modal shift re-colours the progression on its own:
  VII becomes ♭vii in Phrygian. Borrowed chords (♭II, the harmonic-minor V) are written by semitones, with an explicit quality.
- **The loop's last bar splits into a turnaround:** ♭VII, or v when the bar is already on VII, or ♭II when darkness is above 0.6. It
  only splits when the cadence chord is new.
  - Phrygian takes over above darkness 0.6.
  - The tonic pedal comes in above 0.8.
  - The ♭2 and ♭5 become allowed tension notes above 0.5.
- **Under a pedal the bass speaks the tonic chord's vocabulary**, not the moving chord's. Before this fix it could stack a diminished
  chord's ♭5 on the tonic.
- **The bass's pitch choices became chord- and scale-aware:** the octave, the chord's own fifth, the diatonic seventh above the chord
  root, and the ♭2 only where the scale has it, or as a tagged tension over the tonic. The first note over a new chord anchors on its
  root.
- **The pad:**
  - Its add9 uses the scale's next note above the root, so it stays in key.
  - **When it's dark, the pad is an open fifth under a rub held on the key's ♭2,** instead of the planned fifth plus a ♭2 over each
    chord root. The planned version moved every voice in parallel, about 4 semitones per chord change. The held rub stays put while the
    fifth moves, under 1 semitone per voice.
  - Its articulation (held, swell, or re-struck on the "and" of 4) is material, chosen once per seed.
- **Stabs and power chords:**
  - A power chord keeps the chord's own fifth, so a diminished chord's is a ♭5.
  - Locked stabs take the bass's accents first, then its strongest-placed notes.
  - Answering stabs take preferred syncopated steps where the bass is neither starting nor sounding.
- **`voice()` drops a doubled note that can't fit** (a power chord's octave on a high root) rather than failing.
- **The kick is tuned to the key's tonic,** not each chord's root, so it doesn't change pitch at every chord.
- **Drums are threshold-sampled from a seeded kit, like the bass.**
  - The kit's backbeat is clap, snare or both.
  - The percussion figure is 2-4 steps of clank and rim.
  - The turnaround fill is graded by density: a hat flam, a 4-step roll, or a full roll with 32nds.
- **The mixer:**
  - Each bus has its own reverb send stage, so a solo also solos its reverb. Before this, every stem carried everyone's reverb.
  - The reverb return isn't ducked.
  - The beds have a trance gate, which opens above drive 0.6.
- **The render script:**
  - Score checks: stabs on or off the bass, and the pad's average movement per voice.
  - `--stems` renders each bus alone and reports its level.
  - Starting balance in the groove clip: sub -14, bass -19, drums -20, beds -20 dBFS RMS. Stabs come in around -22 when on.

