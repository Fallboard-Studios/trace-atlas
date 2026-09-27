# Intent: BPM Control (Audio Rig)

Confirmed via `/interview-me`, 2026-09-01. Started from an external (Gemini-drafted) UI brief for a generic DAW-style tempo control; most of that brief's specifics (drag-scrub box, TAP tempo, SYNC: INT/EXT) did not survive contact with this codebase's actual architecture and are explicitly out of scope below.

## Outcome

BPM becomes a real, seed-driven **locale-compositional property** — generated from the active locale's (x, y) coordinates at build time, the same way other procedurally generated locale content is derived — with a live manual-override control added to the Audio Rig drawer that drives the actual `Tone.Transport` tempo via `AudioEngine.setBPM`. The control is built from Trace Atlas's existing closed-set `ControlSchema` primitives; no new UI primitive is introduced.

## User

Whoever is operating the console from the Audio Rig drawer — the same audience as every other live Rig control (reverb, delay, filters, Ping Variance Automation).

## Why now

BPM currently exists as two disconnected, non-seeded values, discovered while grounding this interview against the actual code:

- `audioStore.bpm` — feeds the real `Tone.Transport` tempo via `AudioEngine.setBPM`, but is a hardcoded static default (`60`) that never varies; nothing ever seeds or syncs it from a locale.
- `locale.settings.bpm` — also hardcoded to `60` in `buildLocale`, consumed only by `Factory.tsx`/`BubbleStream.tsx` for production-cadence/burst-interval math. Entirely unrelated to the music.

This feature unifies the *audio* BPM into one real, seed-driven, operator-adjustable value, bringing it in line with how `globalAudio`/`globalLfo` already behave in the Audio Rig drawer (seeded default + live operator override).

## Success

- **Seeded per locale.** BPM is generated (via `getSeededVal` against the locale's x/y coordinates) when a `Locale` is built — not left at a hardcoded constant.
- **Live manual override.** The Audio Rig drawer gets a control (default assumption: `SliderLinear`, continuous drag + numeric readout, matching Volume/Gain/Sustain — not `Stepper`) that lets the operator retune BPM in real time; changes go through `AudioEngine.setBPM`/the transport, never a raw timer.
- **Full reseed on every retransmit, no override carryover.** Any locale coordinate change (coords-only retransmit, full retransmit, a freshly built locale) always regenerates that locale's BPM from its new seed and discards whatever the operator had manually dialed in. This is a deliberate divergence from `globalAudio`'s rule (which *preserves* edits across a coords-only retransmit) — the user explicitly chose determinism ("every place sounds the same [on arrival]") over preserving operator tweaks across a place change, after going back and forth on it.
- **No persistence carve-out needed.** Because overrides never survive retransmit, there's nothing BPM-specific for Session Storage (Phase 12, not yet built) to pick up later — an ordinary page reload without a retransmit is the only case Phase 12's eventual generic persistence would need to cover, same as any other Rig setting.

## Constraint

- Reuse only the existing 14 `ControlSchema` primitives (`src/components/ui/controls/`) — no new drag-scrub/typed-hybrid input, no tap-tempo button.
- Scheduling/timing stays on the `AudioEngine`/`Transport` path — no `setTimeout`/`setInterval`/`requestAnimationFrame` involved.
- Value stays plain, serializable Zustand state (`audioStore` and/or the `Locale` type, TBD at spec time).
- Implementation detail (not re-litigated here, flagged only as an assumption): apply a short Tone-native `rampTo` on the transport while dragging, instead of an instant per-pixel `transport.bpm.value` jump, to avoid zipper/click artifacts — `AudioEngine.setBPM` does an instant set today.

## Out of scope

- **TAP tempo button** — may come later, explicitly deferred, not part of this feature.
- **Drag-scrub numeric box / SYNC: INT/EXT** — generic DAW UI conventions from the original brief that don't fit this app's closed component inventory or its single local transport; dropped.
- **`locale.settings.bpm` / Factory production cadence / `BubbleStream` timing** — left completely untouched. That system is expected to be reworked separately soon; this feature does not touch it or attempt to reconcile the two "BPM" concepts beyond fixing the one that actually drives the music.
- **Any bespoke persistence work ahead of Phase 12** — not needed, per the no-override-carryover decision above.
- **Exact generated range/distribution and numeric precision (integer vs. decimal BPM)** — not decided in this interview; left for Spec/Plan.
