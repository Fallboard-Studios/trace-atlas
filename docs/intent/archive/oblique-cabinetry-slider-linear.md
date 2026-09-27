# Intent: Oblique Cabinetry — SliderLinear (Voxel-Track Foundation) (Roadmap Phase 11.1.3)

Confirmed via `/interview-me`, 2026-09-08. Scopes the third item of the
[11.1.1–11.1.9 Oblique Cabinetry series](../todo/roadmap.md#1113-oblique-cabinetry-sliderlinear-voxel-track-foundation),
wiring `SliderLinear` into the shared cabinet-box mechanism
[11.1.1](oblique-cabinetry-foundation.md) built, and building the shared voxel-track
rendering `SliderLog` (11.1.4) and `SliderCenteredZero` (11.1.5) will reuse unchanged.

## Outcome

`SliderLinear`'s track+handle is replaced by a row of uniform `CabinetBox` facades — fixed
size and gap per breakpoint (32×32px/8px mobile, 40×40px/10px tablet, 48×48px/12px desktop,
as the roadmap stub already specified) — but the **number of boxes in the row is not a fixed
constant or a per-schema-authored value**. It's derived live from the slider's own container:
as many boxes as fit without overflowing, recomputed on resize the same way
`useAutoSliderOrientation` already recomputes orientation. This is the one significant
correction the interview made to the roadmap stub's original framing, which explicitly
deferred "exact per-slider box counts" to a separate, unnumbered layout-rebuild phase — that
phase turns out not to be needed. Dual-fill value readout and extrusion-falloff (as the
roadmap already describes) apply unchanged against whatever count is currently fitted.

## User

Crawford (solo dev) — same "field equipment reporting what it's tuned to" fiction the rest of
the console leans on. Every real `SliderLinear` consumer across the app (Volume, Sustain,
Gain, Phase, Interval, LFO Rate/Depth, Density, Motif Length, Note Variance, Octave Range
Min/Max, Compressor Ratio) switches over the moment this ships — no flag, no partial rollout,
matching 11.1.1/11.1.2's own rollout posture.

## Why this scope first

`SliderLinear` is the first of the 3 sliders and the first genuinely new rendering shape after
Button/Toggle's single-box mechanism (11.1.1/11.1.2) — a row of boxes rather than one, with a
continuous value mapped across them rather than a binary state. Building the voxel-track
infrastructure here, on the primitive with the simplest value-mapping curve (plain linear,
vs. `SliderLog`'s epsilon-floor curve or `SliderCenteredZero`'s zero-anchored fill), lets
11.1.4/11.1.5 each be a thin follow-up that swaps in only their own `t → value` function.

## Success

- **Box size and gap are exactly as already specced** per breakpoint — nothing changed there;
  only the box *count* is new territory.
- **Box count is derived live from the slider's own container**, not authored per-schema and
  not a single flat constant applied everywhere. A `ResizeObserver` on the slider's *parent*
  (never the slider's own rendered element — same feedback-loop reasoning
  `useAutoSliderOrientation` already documents) measures available space and fits as many
  fixed-size boxes as possible without overflowing.
- **Composes with the existing `SliderOrientation` system rather than replacing it** —
  `'horizontal'`/`'vertical'`/`'auto'` resolve exactly as they do today (unchanged mechanism,
  unchanged `useAutoSliderOrientation`); box-count-fitting then fills whatever length the
  *resolved* axis has. Orientation answers "which way," box count answers "how many" — two
  independent questions, not one collapsed into the other.
- **Recomputes live on resize** — a tablet rotation or a window resize across a breakpoint
  re-fits the box count, the same way orientation already re-resolves live today. No stale
  count left over from a previous container size.
- **Floor of 3 boxes.** If the container is too narrow to fit even 3 boxes at the current
  breakpoint's fixed size, clamp to 3 and let the row scroll/overflow rather than shrinking
  boxes below their fixed size or rendering fewer than 3 (a 1- or 2-box row can't meaningfully
  show the extrusion-falloff step-down the roadmap already describes).
- **Dual-fill and extrusion-falloff math apply unchanged** against whatever count is currently
  fitted — the box straddling the exact value hard-splits at the local percentage; boxes below
  it (toward min) step down in equal decrements (`100% / boxes-below-straddling`) to 0% at the
  box nearest the minimum end; boxes above stay flat.
- **This fully closes the "later, unnumbered layout-rebuild phase"** the roadmap deferred to
  in three places (11.1.1's About, this item's own original About, and 11.1.6's About) — once
  a slider self-fits its own box count to whatever space a drawer's ordinary CSS gives it,
  there's no separate future phase left to decide "how many boxes fit in a given row."
  `docs/todo/roadmap.md` is updated in the same pass as this intent doc to remove that
  stale deferral.
- `SliderLinear` (`src/components/ui/controls/`) keeps its existing
  `{ schema; value; onChange; disabled?; verticalHeight? }` contract — no call site needs to
  change.

## Constraint

- Per CLAUDE.md's Strict Separation guardrail: every cabinet pop/collapse and box-count
  refit is a GSAP timeline registered in `timelineMap` (`setTimeline`/`killTimeline`) — no
  timeline state in Zustand or React state, and the timeline drives only the cosmetic
  pop/fill/refit, never calls `AudioEngine`. `onChange` still fires straight from Radix's
  `Slider.Root` drag/keyboard handling.
- `prefers-reduced-motion` snaps transitions instantly instead of tweening, inherited from
  `CabinetBox`/`cabinetAnimation.ts` the same way every prior item gets it for free.
- The box-count `ResizeObserver` measures the slider's *parent*, never its own rendered
  element — self-observation would feed back into itself the moment the box count it computes
  changes its own rendered width, the same class of bug `useAutoSliderOrientation` already
  avoids for orientation.

## Out of scope

- **Exact hook implementation/naming** (e.g. whether box-count-fitting lives in a new sibling
  hook to `useAutoSliderOrientation` or extends it) — left to this item's own
  spec-driven-development pass, the same way `src/utils/cabinetShading.ts`'s illustrative
  filename in 11.1.1's original draft got resolved to plain CSS during that item's spec pass
  rather than settled here.
- **A drawer's own CSS grid/flex sizing of the space a slider sits in** — ordinary layout, not
  something this item or the Cabinetry series specially designs for. This item answers "how
  many boxes fit in whatever space a slider is given," not "how much space a drawer should
  give a slider."
- `SliderLog`/`SliderCenteredZero`'s own wiring (11.1.4/11.1.5) — they reuse this item's
  voxel-track mechanism unchanged, swapping in only their own value-mapping math.
- `Stepper`/`StepperWithToggle` (dropped from Cabinetry scope entirely, see 11.1.1),
  WorldView/terrain/sky styling, robot visuals (locked to audio attributes per CLAUDE.md), and
  the power rocker switch/`SleeveContainer` — same exclusions as every prior item.
- Accessibility/performance verification — deferred to 11.2, once every 11.1.x item has
  shipped (11.2's own scope already covers this item explicitly).

## Forward Note

`docs/todo/roadmap.md`'s 11.1.3 section, plus the stale "later, unnumbered layout-rebuild
phase" references in 11.1.1's and 11.1.6's About sections, are updated in the same pass as
this intent doc to match. `SliderLog` (11.1.4) and `SliderCenteredZero` (11.1.5) inherit the
live-refitting box-count mechanism for free once this item ships — neither needs its own
container-measurement logic, only its own `t → value` curve feeding the box-placement math
this item builds.
