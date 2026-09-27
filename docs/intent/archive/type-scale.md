# Intent: App-Wide Type Scale

Confirmed via `interview-me` on 2026-09-11, ahead of a `spec-driven-development` pass. Roadmap item 12 (`docs/todo/roadmap.md`).

## Outcome

Replace the current 3 raw px font-size tokens (`--font-size-sm: 12px`, `--font-size-md: 16px`, `--font-size-lg: 20px`, [index.css:9-11](../../src/index.css#L9-L11)) with a real, semantic, rem-based type-scale system — and introduce a second font, splitting the app's text by component category rather than by heading-vs-body hierarchy.

## Two-font split

- **Rajdhani** (already imported) stays for **structural/chrome text**: large titles, `AccordionContainer` triggers, `DirectionalPanel` labels.
- **Titillium Web** (new `@fontsource` dependency — flagged per CLAUDE.md's "ask before adding a new dependency," approved in this interview) is added for **interactive value-controls**: the 14 leaf controls in `src/components/ui/controls/` (sliders and "the like" — `Toggle`, `RadioButton`, `TextInput`, `Stepper`, etc.), and for future body/`<p>` content and smaller heading tiers once that content exists.
- Rationale for the split isn't heading-vs-body — it's chrome/navigation vs. leaf value-controls. The "labels feel too small" complaint below is about accordion/directional-panel text, which stays on Rajdhani; it gets fixed by size/weight, not a font swap.
- Rajdhani's 300/400 weights are disliked and should not be used going forward. Default control/label weight moves to ~500, headings to ~600/700. (Exact weight numbers, and which Titillium Web weights to import, are left to the spec pass — but avoid light/thin weights for Titillium Web too, since it's replacing text that was already flagged as hard to read.)

## Scale mechanics

- **Rem, not px** — so sizes respect a user's browser font-size preference. No `html { font-size }` override exists to defeat this.
- **Fixed discrete steps only — no fluid/clamp sizing.** Explicitly rejected `clamp()`/`cqi`/`cqw`-based fluid scaling because it "gets wonky with some glyphs."
- **Container queries, not media queries**, drive any size-swapping (e.g. `container-type: inline-size` + `@container` breakpoints), consistent with per-component responsive sizing rather than viewport-based rules.
- At least one compact fallback step is needed for the smallest mobile slider label areas — a named token (e.g. `--font-size-label-compact`) swapped in via a container-query breakpoint when a control's box is too narrow for the default label size, not a fluid shrink.
- Naming convention: **semantic, usage-tied names** (e.g. `--font-size-label`, `--font-size-body`, `--font-size-heading-sm/md/lg`), matching the rest of the token system's style (`--spacing-sm/md/lg`, `--slider-vertical-height`), not a numeric/t-shirt abstract ramp.
- Exact step count, exact rem values, and exact token names are not fixed by this interview — none of the current pixel values are sacred ("not married to any particular font size that exists"). Left to the spec pass, informed by the current usage inventory below.

## Migration scope

This phase migrates **every existing font-size and font-weight declaration** onto the new tokens — not just introducing the new system alongside the old one. Current inventory to fold in:
- Old tokens: `--font-size-sm/md/lg` (12/16/20px)
- One-off values found in component CSS: `0.7rem` ([DualLabel.css](../../src/components/ui/controls/DualLabel.css)), `0.75rem` ([SliderCenteredZero.css](../../src/components/ui/controls/SliderCenteredZero.css), [SliderLinear.css](../../src/components/ui/controls/SliderLinear.css), [SliderLog.css](../../src/components/ui/controls/SliderLog.css)), `0.85rem` (DualLabel.css), `0.95em` ([SectorSettingsDrawer.css](../../src/components/panels/screen/console/SectorSettingsDrawer.css)), `14px` ([ConsolePanel.css](../../src/components/panels/screen/console/ConsolePanel.css))
- Leftover unused Vite-scaffold rules (`h1 { font-size: 3.2em }`, button font-size) in [index.css](../../src/index.css) — not real app usage, can be cleaned up or left as dead boilerplate; not a real migration target.
- Known pain points called out directly: accordion and directional-panel labels read too small today and should get visibly bigger and heavier (Rajdhani, no 300/400 weight).

## Out of scope

- Color/palette work — roadmap item 14, explicitly deferred by Crawford at the start of this interview.
- The actual heading/`<p>`-bearing screen redesigns that will *consume* the new body/heading tokens (roadmap items 15–17) — this phase only establishes the scale and fonts, not that markup.
- Fixing roadmap item 13 (vertical slider label overflow bug) — separate item, blocked on this one landing; re-check after this ships whether it's already resolved before scoping a dedicated fix.
- Any third font, or a body-specific font distinct from Titillium Web — Titillium Web already covers the future body/`<p>` case.
- Seed-driven or user-configurable type scale — this is a static, hand-authored scale like the current "Ballast" color palette, not a generated/seeded system.
