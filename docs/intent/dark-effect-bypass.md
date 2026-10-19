# Intent: Dark-Effect Bypass — a dark global effect leaves the chain

Confirmed via `interview-me` on 2026-10-19 (five questions, every guess confirmed), ahead of a
`spec-driven-development` pass. Built on `feature/pedals`, as part of Global Pedals (proposed roadmap 50.6,
[docs/specs/GLOBAL_PEDALS.md](../specs/GLOBAL_PEDALS.md)), because the pedals cannot ship without it: the T14 phone gate
missed on it. Not yet its own roadmap entry; the spec pass decides whether it is a sub-phase of 50.6 or a number of its
own.

## Outcome

Each of the ten global effects is taken out of the signal path while it is dark, and put back when it lights. The
ten are the Chorus, Tremolo, Vibrato, FrequencyShifter and StereoWidener (this branch), the AutoWah and Phaser (50.4),
and the Distortion, Chebyshev and BitCrusher (50.3). A dark effect then costs the audio thread close to nothing,
instead of its full price. The wiring lives in `src/engine/audioEngine/globalFx.ts` (`wireGlobalFxChain` and the ten
`setGlobal*` setters).

- **User:** anyone playing on a phone. Crawford's Pixel 8 is the measuring device.
- **Why now:** the T14 phone gate missed, and round 2 found the cause
  ([docs/todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md), "Global Pedals (roadmap 50.6) on the
  Pixel", 2026-10-19). The cost is the effects being *present*, not lit. On the branch with every new pedal dark, the
  Pixel read 380 underruns at 3:00 and collapsed hands-off at about 2:50. On `main` in the same sitting it read 94 and
  stayed clean. With the Chorus lit alone it read 360 and collapsed the same way. Tone 15's `Effect` keeps its wet path
  running behind the CrossFade at any `wet`, and the browser does not skip a node whose output is faded to zero.
- **The desktop measurement.** Raw Tone 15 nodes in headless Chrome, a 30 s OfflineContext render, 5 interleaved rounds,
  medians, counting extra render ms per audio second, i.e. ‰ of one desktop core:

  | Effect | Dark, in the chain | Dark, disconnected |
  |---|---|---|
  | Phaser (10 stages) | 57 | 5.5 |
  | AutoWah | 32 | 3.8 |
  | FrequencyShifter | 23 | 4.5 |
  | Chorus | 19 | 5.0 |
  | Tremolo | 17 | 7.6 |
  | StereoWidener (0.5) | 14 | 4.4 |
  | BitCrusher | 13 | 6.4 |
  | Vibrato | 11 | 3.3 |
  | Chebyshev | 7 | 0.7 |
  | Distortion | 6 | 0 |
  | **All ten** | **213** | **48** |

  `main`'s five dark effects cost about 115 today, and the branch adds about 85. Disconnecting saves about 78 %. What is
  left is the effects' own LFOs, constant signals and the BitCrusher's worklet, which run whether or not anything listens.

- **Success:**
  - The Pixel, Full, 3:00, hands off, on the baseline link with every new pedal dark (round 2's run A): the count lands
    near `main`'s, with no runaway.
  - An ordinary seeded world with two pedals lit passes too.
  - The six-lit worst case (set by hand only; a seed lights at most two pedals) only has to not be catastrophic. It does
    not have to pass.

## Behavior

- **Dark means Mix exactly 0.** For the StereoWidener, which has no Mix, it means Width exactly 0.5 (Tone's neutral).
  This follows the house rule from the toggle removals: an LFO at 0 Hz is disconnected, and a layer at gain 0 is muted.
  There is no Active toggle and no "nearly zero counts as off" threshold.
- **Crossing is inaudible, both ways.** Dragging Mix up from 0 reconnects the effect at Mix 0, then fades it up.
  Dragging Mix to 0 fades it out, then disconnects it. There is no click, gap or level jump at the crossing, nor on the
  dry signal passing through.
- **Loading decides it before any sound.** A seed, a session restore or a share link puts each effect in or out of the
  chain as part of applying the settings.
- **Width out means the rooms join at the Limiter.** Since T6, the Reverb and Delay returns join at the StereoWidener
  under Controlled Decay. While Width is out, they join at the Limiter instead, which sounds the same, since Width 0.5
  changes nothing. When Width lights, the join moves back. Crawford judged this extra rewire worth the 14 ‰.
- **Nothing on screen changes.** There is no "bypassed" indicator. Mix at 0 (or Width at 0.5) already says it, and the
  drawer, sliders and stored settings are untouched.
- **Unchanged:** stored settings and their JSON, the seed's draws and odds, the two-lit cap, the chain order of the lit
  effects, the Free | Sync rails, and every effect's sound when lit.

## Style / constraint

- **Disconnect only.** A dark effect stays built, and its LFOs keep running. Tearing it down and rebuilding it when it
  lights would take the remaining 48 ‰ to 0, but it adds construction and a rewire at the moment of lighting. That is
  the next lever if the phone still struggles, not this pass's.
- **Built on `feature/pedals`.** The rewiring touches code this branch rewrote: the zero-delay cut nodes that bound
  Tone's cycle search, and the downstream-first disconnect order (fix 659ac66b, the `chainCycleSearch.test.ts`
  tripwire). Building it off `main` would land it on the old wiring and conflict on merge. It goes in as its own phase,
  with its own spec, commits and PR section.
- **Follows the existing audio architecture:** `AudioEngine`'s setters stay the only route to the nodes, and GSAP and
  components never touch them.

## Out of scope

- **Teardown and rebuild** of dark effects. It is a later lever.
- **EQ3, the low-pass and the high-pass filter at their neutral settings.** They are cheap built-in filters, and they
  are LFO targets, so an LFO sweeping through neutral would flap them in and out. A backlog note only.
- **Any visual "bypassed" cue.**
- **Swells on these ten effects.** That is a later swell pass, carrying the caveat that a swell on one of these
  effects only works while the effect is lit.
- **Making the six-lit worst case pass on the phone.**
- **An Active or Enabled toggle,** removed project-wide and not coming back.

## Known implementation notes (not yet spec'd)

- **Mechanism.** Either the whole chain is rewired by `wireGlobalFxChain` with the dark nodes skipped, or each
  crossing makes a local splice around one node. Either way, every rewire re-runs Tone's cycle search, so the cost of
  a crossing and the cycle-search tripwire both need a look.
- **Fade timing against the lookahead.** The fade has to finish before the disconnect lands, and the reconnect has to
  land before the fade-up starts. The Spread duck in `f0ddc8eb` (`Tone.getContext().setTimeout` after lookAhead
  + 20 ms + 10 ms) is the nearest precedent.
- **The setters' mirror state** has to know whether a node is in the chain, so a re-sent unchanged value does nothing,
  as the Spread skip does.
- **Exact 0 and exact 0.5.** The settings must hold those values exactly through a slider, the seed and session
  normalisation (see the `sessionDiff.ts` floating-point cleanup), or the effect never leaves.
- **A drag that crosses 0 repeatedly** must not pile up overlapping fades and rewires.
- **Verification.**
  - Unit tests over the Tone mocks, for which nodes are in the chain in both Decay Modes.
  - Re-run the desktop probe, or `npm run perf:audio` A/B'ing `main` against the branch.
  - Then the phone: run A again, a two-lit seeded world, and the worst case.
- **Order against the remaining plan.** This lands before T16 and T17. T17's docs (AUDIO_SYSTEM's Signal Graph) describe
  the bypass, and T14 is re-run on it.
