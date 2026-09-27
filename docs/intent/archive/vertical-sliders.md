# Intent: Vertical Slider Orientation

Confirmed via `interview-me` on 2026-09-04, on branch `feature/vertical-sliders`.

## Outcome

Add an `orientation: 'horizontal' | 'vertical' | 'auto'` field to `SliderLinearSchema`, `SliderLogSchema`, and `SliderCenteredZeroSchema` (`src/types/controls.ts`) — required, no default, so every existing schema literal must declare one deliberately. Extend the three existing components (`SliderLinear`, `SliderLog`, `SliderCenteredZero`) to render all three orientations rather than adding separate `*Vertical` components:

- **`'horizontal'`** — unchanged from today's rendering.
- **`'vertical'`** — Radix `Slider.Root orientation="vertical"`, track height defaults to **256px**, overridable via an optional prop. Layout order top-to-bottom: `DualLabel` → value readout → track. (Value sits *above* the track, not below, so a dragging thumb never covers it — this is the one deliberate deviation from "rotate the existing three-part stack as a unit.") `SliderCenteredZero`'s zero-anchored fill math (`sliderCenteredZeroMath.ts`) gets a vertical counterpart: zero point and fill become a bottom/height split instead of left/width, with max at the top (standard fader-up-means-more convention).
- **`'auto'`** — wraps a `ResizeObserver` around a **stable parent wrapper** (not the slider's own content box — self-measurement would feedback-loop, since flipping orientation changes the slider's own rendered dimensions) and picks whichever axis, width or height, is longer on that wrapper. Re-measures on resize.

Apply the correct `orientation` to every real slider schema per the classification below, cross-checked against the actual config files (`audioRigConfig.ts`, `robotOptionsConfig.ts`, `Lfo.tsx`'s internal Rate/Depth sliders) — every named control below was verified to map 1:1 to a real schema entry, not assumed from the label alone.

### Classification

**Global effects (`audioRigConfig.ts`):**

| Orientation | Controls |
|---|---|
| Horizontal | Automatic Effects (`PING_VARIANCE_AUTOMATION_SCHEMA`), Tempo (`BPM_SCHEMA`) — Volume is classified Horizontal too, but that slider (`TransportBar.tsx`) is hand-rolled `@radix-ui/react-slider`, not a `SliderLinearSchema` — no schema to attach `orientation` to, and no behavior change since it's already horizontal (caught during spec-writing, see `docs/specs/VERTICAL_SLIDERS.md` §1.1) |
| Vertical | EQ Low/Mid/High (`eq3.low/mid/high`) |
| Auto | LFO Rate, Depth, Rate Drift, Depth Drift (all 4 `LFO_DRIFT_GROUPS` groups); LPF Frequency/Resonance; HPF Frequency/Resonance; Delay Time/Feedback/Mix; Reverb Decay/Pre-Delay/Mix; Compressor Threshold/Ratio/Attack/Release/Knee; Limiter Threshold; Robot Drift Rate/Depth Drift |

**Company and individual robots (`robotOptionsConfig.ts`):**

| Orientation | Controls |
|---|---|
| Horizontal | Volume (`VOLUME_SCHEMA`) |
| Vertical | N/A |
| Auto | Ping Controls (Density, Pitch Repeat), Ping Contour (Attack, Decay, Sustain, Release), Signature Array (Gain, Detune, Phase, Interval — all 3 layers) — every slider field in these three sections |

## User

The developer (Crawford) — wiring the resulting `orientation`-aware schemas into `audioRigConfig.ts`/`robotOptionsConfig.ts` next, then real drawer layout work in a later session.

## Why now

Working on branch `feature/vertical-sliders`; the classification list above already exists and the slider primitives need orientation support before any config file can declare it.

## Success

- All three components render correctly in all three orientations.
- Every schema literal in `audioRigConfig.ts`, `robotOptionsConfig.ts`, and `Lfo.tsx`'s internal Rate/Depth sliders carries the `orientation` value from the classification table above.
- `SliderCenteredZero`'s fill math is correct on the vertical axis (bottom/height split, max at top).
- Vertical layout order is `DualLabel` → value → track, confirmed value is never covered by a dragging thumb.
- `'auto'` behavior is verified by a test that mocks a tall `ResizeObserver` entry (e.g. via Vitest) — not by eyeballing it inside a real drawer, since no real drawer gives `'auto'` sliders a sized wrapper yet.

## Constraint

`'auto'` sliders must measure a parent wrapper's box, never their own content box, to avoid a resize feedback loop when orientation changes the slider's own rendered size.

## Out of scope (this session)

- Reworking any drawer's grid/flex layout (EQ row, LFO/filter/delay/reverb/compressor param rows, Ping Controls/Contour, Signature Array) to actually group sliders side-by-side — deferred to a later session.
- Until that later session, `'auto'` sliders will keep rendering horizontally in practice, because today's drawer rows are wide/short (nothing sizes them squarish/tall yet). This is expected, not a bug.
- Separate `*Vertical` component files — orientation is a prop/schema field on the existing three primitives, not new primitives.

## Downstream

Next step: hand this confirmed intent to `spec-driven-development` (or straight to `planning-and-task-breakdown`) to produce the written spec / ordered task list for implementation.
