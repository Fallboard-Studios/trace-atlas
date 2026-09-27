# Intent: Audio Rig — Responsive Layout Rework

Confirmed via `/interview-me`, 2026-09-10. Raised directly by Crawford after a resize/overflow bug report
(the `DirectionalPanel.css` `flex-wrap: wrap`/`flex: 1 1 auto` regression, plus a `filterLPF`/`filterHPF`
orientation misconfiguration, both fixed same session) exposed how fragile the Audio Rig drawer's layout
was across viewport widths. This item goes further than a bugfix — it replaces `'auto'`-resolved
orientation (both panel and slider) throughout the Audio Rig with explicit, viewport-tier-driven values.

**Amendment, 2026-09-10 (post-ship):** the EQ & Filters desktop split named below (EQ 40% / LPF 30% /
HPF 30%) was corrected to a straight equal-thirds split immediately after shipping — see the spec's own
§1.6 amendment for the mechanism change this enabled (the custom `flexBasis` override was removed
entirely, since equal shares are exactly `DirectionalPanel.css`'s own default).

## Outcome

Every panel/slider orientation decision in `AudioRigDrawer.tsx` and `audioRigConfig.ts` becomes either a
single fixed value (sliders) or a value keyed off the same fixed viewport-width tiers `CabinetBox` already
defines — mobile ≤640px / tablet 641–1024px / desktop >1024px (`cabinetBreakpoints.ts`) — not the existing
per-parent-measured `'auto'` mechanism (`useAutoPanelOrientation`/`useAutoSliderOrientation`).

## User

Crawford (solo dev), working section-by-section through the console's control layout — Audio Rig now,
Robot Options later (not yet started, see Out of scope).

## Success — per section

- **LFO sliders** (Rate/Depth inside every `Lfo` display, and Rate Drift/Depth Drift beneath it, wherever
  they appear — Speed & Automation, and inside each `AudioRigLfoGroup`-bearing block): fixed `horizontal`,
  each its own row, at every breakpoint. Currently `'auto'`. Does **not** reach the modulation *targets*
  (EQ's Low/Mid/High, Filters' Frequency/Resonance) — those follow their own rules below/stay unchanged.
- **Transport & Composition** (`SPEED_AUTOMATION_PANEL_SCHEMA` — Tempo + Automatic Effects): two rows
  (stacked/column) on mobile and tablet; one row on desktop. Currently fixed `'row'` at every width.
- **EQ & Filters**: the current nesting (`EQ_FILTERS_ROW_PANEL_SCHEMA` wrapping eq3 beside
  `FILTERS_COLUMN_PANEL_SCHEMA`, which itself wraps LPF beside HPF) is flattened — EQ, LPF, and HPF become
  three siblings with no intermediate grouping panel. Each stacks full-width, one per row, on mobile and
  tablet. On desktop they share one row: EQ 40%, LPF 30%, HPF 30% (an even split of the remaining 60%).
  This is the deepest nesting in the drawer today and the clearest candidate for de-nesting — see the
  general de-nesting principle below.
- **Filter Frequency/Resonance sliders** (inside the LPF block and inside the HPF block, each rendered via
  `AudioRigLfoGroup` since both params carry an `lfoTarget`): fixed `vertical` at every breakpoint, and
  always share one row together — never stacked into a column, at any width. **This reverses a change from
  earlier in this same session**: `filterLPF.frequency`/`filterLPF.Q`/`filterHPF.frequency`/`filterHPF.Q`
  were just changed from a hardcoded `'vertical'` to `'auto'` to satisfy `audioRigConfig.test.ts`'s
  "Low-Pass/High-Pass Filter (Frequency/Resonance) is auto" assertion and `AudioRigDrawer.test.tsx`'s
  matching "sliders panel is column" assertion (both encoding `docs/specs/VERTICAL_SLIDERS.md`'s
  classification and `docs/tasks/DIRECTIONAL_PANEL_WIRING.md`'s follow-up fix). This item deliberately
  overrides that classification for these two params specifically — the two tests, and the doc language in
  `VERTICAL_SLIDERS.md`/`DIRECTIONAL_PANEL_WIRING.md` that documents the now-superseded "auto"/"column"
  reasoning for `filterLPF`/`filterHPF`, need to be updated alongside the code, not left contradicting it.
- **Time & Space**: Delay and Reverb blocks stack on mobile and tablet; sit side-by-side (row) on desktop.
  Inside each block, every param slider (Delay: Time/Feedback/Mix; Reverb: Decay/Pre-Delay/Mix) gets its
  own full-width row **at every breakpoint, including desktop** — the current hand-composed
  Time+Feedback/Decay+Pre-Delay paired top-rows are removed entirely, not just collapsed on narrow widths.
  ("Full-width" means the full width of that block's own column — on desktop, Delay and Reverb each still
  occupy only 50% of the shared row, which is expected, not a bug.)
- **Output**: Compressor's and Limiter's sliders each get their own row on mobile and tablet. On desktop,
  Compressor's existing paired sub-rows (Threshold+Ratio, Attack+Release) stay paired side-by-side — this
  section is deliberately scoped to "mobile and tablet" only, unlike Time & Space's unscoped rule above.
- **Compressor/Limiter slider orientation** (Threshold, Ratio, Attack, Release, Knee, and Limiter's
  Threshold): fixed `horizontal` at every breakpoint. Currently `'auto'` — unaddressed by Crawford's
  original instructions, confirmed directly during the interview.
- **EQ's Low/Mid/High sliders**: unchanged — stay fixed `'vertical'`, as they are today. Not part of the
  general LFO-slider rule above, and not otherwise touched by this item.

## General de-nesting principle

"We're building this all with `DirectionalPanel` as much as we can unless we run into an outlier that
can't [be]." Confirmed directly by Crawford. Concretely: prefer flattening a nested `DirectionalPanel`
structure over preserving it when the new layout no longer requires the intermediate grouping (EQ & Filters
is the clear case — the current `FILTERS_COLUMN_PANEL_SCHEMA` sub-grouping existed to pair LPF/HPF into
their own row, which the new flattened three-way row/column layout no longer needs). Where a layout
genuinely can't be expressed as a `DirectionalPanel` row/column (an outlier), that's an acceptable
exception — but the default assumption for every section above is a `DirectionalPanel`-only solution,
including the EQ 40/30/30 desktop split and the tier-driven row/column switches, not a bespoke CSS grid or
a component-specific layout escape hatch.

## Constraint

- `useAutoSliderOrientation` and `useAutoPanelOrientation` are **not removed or deprecated** by this item —
  they stay exactly as they are in the codebase. This item only stops *using* them inside
  `AudioRigDrawer.tsx`/`audioRigConfig.ts`. Robot Options (`robotOptionsConfig.ts` and its drawers) still
  relies on `'auto'` for both panels and sliders and has not been converted yet — that conversion is a
  separate, future item.
- Per CLAUDE.md: state stays serializable, no GSAP/timeline involvement expected (this is pure
  layout/orientation, not animation), and any new schema field this needs must stay JSON-serializable like
  every existing `ControlSchema`/`DirectionalPanelSchema` field.

## Out of scope

- Robot Options' sliders and panels (`robotOptionsConfig.ts`, `PingControlsDrawer`, `PingContourDrawer`,
  `SignatureArrayDrawer`) — untouched by this pass. A future item converts those off `'auto'` the same way,
  at which point removing `useAutoSliderOrientation`/`useAutoPanelOrientation` entirely becomes a fair
  question to revisit — not decided here.
- The exact schema/CSS mechanism for tier-driven panel orientation (e.g. a new `PanelOrientation`-adjacent
  field or hook shaped like `useCabinetTier()`, versus three literal per-tier schema values) and for
  percentage-width row shares (nothing in `DirectionalPanel.css` today supports unequal flex shares — every
  row child gets `flex: 1 1 0`, an equal share) — implementation-shape decisions for the spec-driven-
  development pass this intent feeds, not resolved here.
- Any visual/Cabinetry (facade, glow, pop) changes — this item is pure orientation/layout, not rendering.
- Any change to non-Audio-Rig `DirectionalPanel` consumers (`SignatureArrayDrawer`, `PingControlsDrawer`,
  `PingContourDrawer`, `AudioSettingSection`, `LfoTargetGroup`).

## Forward Note

This item establishes the pattern for retiring `'auto'` orientation section-by-section rather than in one
sweep — Robot Options is next, not part of this item. Whatever tier-driven panel-orientation mechanism gets
designed in the spec phase should be built generically enough that Robot Options' own future conversion
doesn't need a second, bespoke mechanism.
