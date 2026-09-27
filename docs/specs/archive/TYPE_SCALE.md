# Phase Spec: App-Wide Type Scale

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/type-scale.md](../intent/type-scale.md) (confirmed via `/interview-me`, 2026-09-11). Roadmap item 12 (`docs/todo/roadmap.md`). Prior art reused directly: the existing `--font-sans`/`--font-mono` token pair and self-hosted `@fontsource` import pattern (`src/main.tsx`), the `sc-` control-primitive inventory and `DualLabel` composition rule (`docs/COMPONENT_LIBRARY.md`), and the `--spacing-sm/md/lg` naming convention (`src/index.css`) this spec's new tokens follow.

---

## 1. Overview & Claude Explanation

Today's entire type scale is 3 raw px tokens (`--font-size-sm/md/lg`, `src/index.css:9-11`) plus at least 7 undocumented one-off values scattered across component CSS (`0.7rem`, `0.75rem` ×3, `0.85rem`, `0.95em`, `14px`), all rendered in one font (Rajdhani) at whatever weight each file happened to inherit or hardcode (400 default, a few explicit 600s). This phase replaces all of it with **7 semantic, rem-based size tokens**, **4 weight tokens**, and **1 new font-family token** (`--font-controls`, backed by a new dependency, `@fontsource/titillium-web`), then migrates every real consumer onto the new tokens — no file is left reading the old 3 tokens or a hardcoded literal.

**The two-font split is by component category, not by heading-vs-body hierarchy** (confirmed in the intent doc): the 14 `ControlSchema` primitives split into 2 **chrome/structural** components (`AccordionContainer`, `DirectionalPanel` — containers, not values) that keep Rajdhani, and the other **12 leaf value-controls** (`Button`, `CoordsInput`, `Lfo`, `RadioButton`, `SliderCenteredZero`, `SliderLinear`, `SliderLog`, `Stepper`, `StepperWithToggle`, `TextInput`, `Toggle`, and standalone `DualLabel` display rows — §1.5) that move to the new `--font-controls` (Titillium Web). Everything else app-wide — page shell, `Header`, `SleeveContainer`, `PowerRockerSwitch`, drawer chrome, and any future heading/`<p>` content — keeps inheriting the root `--font-sans` default (Rajdhani), **except** the two smaller heading tiers (`--font-size-heading-sm/md`), which get an explicit `--font-controls` override per the intent doc's "Rajdhani for larger titles, Titillium for smaller headings and p tags" split. `--font-mono` (console-chrome telemetry: `Header`'s status row, `SleeveContainer`'s logo, `SkippedNotesCounter`, `PowerRockerSwitch`'s confirm dialog title) is untouched by this phase entirely — it already has its own explicit `font-family: var(--font-mono)` at each of those 4 call sites and was never part of the `--font-sans`/`--font-controls` split.

**Sizing mechanics** (all confirmed in the intent doc): rem, not px; fixed discrete steps, no `clamp()`/fluid math; container queries, not media queries, drive the one size-swapping case this phase needs — a compact fallback for the 12 leaf controls' own label/value text when their container is too narrow (§1.4). Weight moves off Rajdhani's disliked 300/400 (unused going forward) up to 500 as the new chrome default, 600 for medium headings, 700 for the largest titles — **but Titillium Web's own regular weight (400) is kept**, not bumped to match Rajdhani's 500 floor, because the legibility complaint was specific to Rajdhani being naturally thin-drawn at low weights, not to "400" as a number; Titillium Web has no 500 weight to move to anyway (§1.3).

### 1.1 What's reused vs. what's new

Reused, unchanged: `--font-sans`, `--font-mono`, the `@fontsource` self-hosted (not CDN) import pattern in `main.tsx`, every existing color/spacing/border token, `DualLabel`'s own component (no props change), every `ControlSchema` type and every primitive's `{ schema, value, onChange }` contract (no call site anywhere changes its props).

New: 3 font-size-adjacent groups of tokens in `src/index.css` (§1.2), a new `--font-controls` family token + `@fontsource/titillium-web` dependency (§1.3), a `container-type`/`container-name` declaration added to each of the 12 leaf controls' own root CSS selector plus one new `@container` rule in `DualLabel.css` and each of the 3 slider CSS files (§1.4), and font-family/weight/size overrides on `AccordionContainer.css`/`DirectionalPanel.css`'s own `DualLabel` human-label selectors (§1.6, the direct fix for the "accordion/panel labels read too small" complaint).

Removed: the old `--font-size-sm/md/lg` tokens and every literal `0.7rem`/`0.75rem`/`0.85rem`/`0.95em`/`14px` font-size value in the files listed in §2 — all replaced by the new semantic tokens, none left as dead fallbacks. Rajdhani's 300 and 400 weight imports in `main.tsx` are also removed (§1.3) — nothing in the app will reference those weights once this ships.

### 1.2 The new size/weight tokens

```css
/* src/index.css, replacing the existing 3-token block */
--font-size-label-compact: 0.6875rem;  /* 11px — container-query fallback only, §1.4 */
--font-size-label-lore:    0.75rem;    /* 12px — DualLabel's small uppercase eyebrow caption */
--font-size-label:         0.9375rem;  /* 15px — DualLabel's human label, slider/control value readouts */
--font-size-body:          1rem;       /* 16px — future <p> content (no consumer yet) */
--font-size-heading-sm:    1.125rem;   /* 18px — smaller headings (--font-controls); also used by
                                           AccordionContainer/DirectionalPanel's own bumped human-label
                                           override, §1.6, though those stay --font-sans */
--font-size-heading-md:    1.375rem;   /* 22px — mid headings (--font-controls) */
--font-size-heading-lg:    1.75rem;    /* 28px — large titles (--font-sans) */

--font-weight-control:     400;  /* Titillium Web's own regular — §1.3 explains why this isn't bumped */
--font-weight-regular:     500;  /* Rajdhani chrome/body default, replacing the old bare 400 */
--font-weight-medium:      600;  /* both families' heading-sm/md; AccordionContainer/DirectionalPanel
                                     trigger labels (§1.6); slider/control value-readout emphasis */
--font-weight-bold:        700;  /* heading-lg / large titles only (--font-sans) */
```

`--font-size-heading-sm/md/lg` and `--font-size-body` have **no real consumer yet** — same "defined, ready, unused" status `Stepper`/`StepperWithToggle` already have in this codebase (`docs/COMPONENT_LIBRARY.md`: "Kept in the codebase, unused by any real app schema") — roadmap items 15-17 (Robot Cards / Company CRUD / Robot Detail redesigns) are the first intended consumers, and are explicitly out of scope here (per the intent doc).

`:root`'s existing `font-weight: 400;` line (`src/index.css:73`) becomes `font-weight: var(--font-weight-regular);` — the new document-wide default.

**Correction, found live in a real browser (user report: "I see Arial on buttons"), not anticipated by this spec:** Task 2's removal of the old `h1`/`button` Vite-scaffold rules (§2) was wrong about the `button` one. Browsers' UA stylesheets give `button`/`input`/`select`/`textarea` their own **non-inheriting** default font — the deleted rule's `font-family: inherit;` line was the only thing bridging the page's set font to every real native `<button>` in the app that doesn't set its own `font-family` (`RadioButton`'s own option buttons, `AccordionContainer`'s trigger — used by every accordion section — `Toggle`'s switch, `Stepper`'s +/- buttons, `PowerRockerSwitch`'s confirm dialog). Every one of those was silently rendering in the browser's default UI font (Arial) instead of Rajdhani/Titillium Web. Fixed with a generic reset, added to `src/index.css` right after the old rule's removal comment: `button, input, select, textarea { font-family: inherit; font-size: inherit; font-weight: inherit; }` — `inherit`, not the old rule's hardcoded `font-weight: 500`, so each control's own ancestor rule (e.g. `.sc-radio-button`'s `--font-weight-control`) correctly reaches its native button descendants instead of being overridden by a flat value. The rest of the old rule's properties (`border-radius`/`padding`/`background-color`/`transition`) really were dead — confirmed unaffected, since every real consumer already overrides those via its own higher-specificity class rule.

### 1.3 The new font: Titillium Web

`--font-controls: 'Titillium Web', 'Rajdhani', system-ui, Avenir, Helvetica, Arial, sans-serif;` — falls back to Rajdhani before the generic stack, mirroring `--font-sans`'s own fallback shape.

New dependency (flagged per CLAUDE.md's "ask before adding a new dependency" — approved during the `/interview-me` pass that produced the source intent doc): `@fontsource/titillium-web`. Pin the exact current version the same way `@fontsource/rajdhani` is pinned (`^5.3.0`) — run `npm view @fontsource/titillium-web version` at install time rather than hardcoding a version number here; `@fontsource` packages share one release cadence across the whole scope, so it is very likely also `^5.x`, but do not assume without checking.

`main.tsx` gains, self-hosted like Rajdhani, **latin + latin-ext only, weights 400/600/700** (Titillium Web has no 500; its available weights are 200/300/400/600/700/900 — 200/300/900 are never used, matching the "avoid light/thin weights" rule extended from Rajdhani):

```typescript
import '@fontsource/titillium-web/latin-400.css'
import '@fontsource/titillium-web/latin-ext-400.css'
import '@fontsource/titillium-web/latin-600.css'
import '@fontsource/titillium-web/latin-ext-600.css'
import '@fontsource/titillium-web/latin-700.css'
import '@fontsource/titillium-web/latin-ext-700.css'
```

`main.tsx`'s existing Rajdhani imports **drop the 300 and 400 weight lines** (4 of the current 10 import lines — `latin-300`/`latin-ext-300`/`latin-400`/`latin-ext-400`), leaving 500/600/700 (6 lines) — nothing in the app references Rajdhani 300 or 400 after this phase ships (`--font-weight-regular` is 500, the new document-wide floor). This is a dependency-weight trim, not a version bump or a new package — no separate approval needed, called out here for visibility.

`--font-weight-control: 400` is Titillium Web's own regular weight, used as-is rather than bumped to `--font-weight-regular`'s 500 — Titillium Web's 400 is a substantially heavier-set, more legible-at-small-sizes regular than Rajdhani's, so the "no light weights" complaint (which was about Rajdhani specifically, `docs/intent/type-scale.md`) doesn't carry over to it. Titillium Web has no 500 to move to even if it did.

### 1.4 Container-query compact fallback

> **Errata, found in a real browser during Implement (Tasks 4/6), not caught by this spec's own review or by content-only tests:** the "each of the 12 leaf controls' own root selector" claim below is **wrong for `Button` and for the sliders' own bare/unqualified root** — see the correction at the end of this section. The mechanism, the `@container` rules, and the `120px` breakpoint below are otherwise unchanged.

**Mechanism:** each of the 12 leaf controls' own existing root CSS selector gains 2 lines, establishing a shared named size-container:

```css
container-type: inline-size;
container-name: sc-control;
```

No new class, no JSX change — this is added directly to each control's already-existing root rule (`.sc-slider-linear`, `.sc-toggle`, `.sc-text-input`, etc., §2's full list). `DualLabel.css` and each of the 3 slider CSS files then add one `@container` rule querying that name — this works regardless of *which* ancestor establishes the container, since `@container sc-control` binds to the nearest ancestor carrying that `container-name`, not to a specific selector:

```css
/* DualLabel.css — new rule */
@container sc-control (max-width: 120px) {
  .sc-dual-label__lore,
  .sc-dual-label__human {
    font-size: var(--font-size-label-compact);
  }
}
```

```css
/* SliderLinear.css / SliderLog.css / SliderCenteredZero.css — same new rule in each, targeting that
   file's own __value class */
@container sc-control (max-width: 120px) {
  .sc-slider-linear__value {  /* or .sc-slider-log__value / .sc-slider-centered-zero__value */
    font-size: var(--font-size-label-compact);
  }
}
```

**`120px` is this spec's own engineering default**, not separately confirmed with the user — chosen as roughly the width of 3 default-sized voxel-track boxes plus gap (the `VOXEL_TRACK_MIN_BOX_COUNT` overflow floor, `docs/COMPONENT_LIBRARY.md`), i.e. the point a horizontal slider's own track is already at its tightest fit and its label/value text is the next thing under space pressure. Flagged in §7 for a visual sanity check during Implement, same category as `GLOBAL_VOLUME_CONTROL.md`'s own flagged-but-unconfirmed slider width default.

**Scope is deliberately the 12 leaf controls only** — `AccordionContainer`/`DirectionalPanel` do not get `container-type`/`@container` treatment. Their "labels read too small" complaint is fixed by raising their *default* size (§1.6), not by a narrow-container fallback; the intent doc's container-query ask was specifically framed around "smallest mobile slider label areas" (leaf controls), and this also directly targets item 13's (Vertical Slider Label Overflow) suspected root cause without touching the two container primitives that bug wasn't reported against.

**Standalone `DualLabel` usage** (`RobotSelectionCard.tsx`, `RobotDisplaySection.tsx`, `SectorSettingsDrawer.tsx`'s `STATUS_HEADER_SCHEMA` — rendered directly, not composed inside one of the 12 controls) sits inside those files' own existing root elements, none of which currently establish a `sc-control` container. This is a genuine gap the interview didn't resolve explicitly (§7, item 1) — this spec's default is to **not** add container-query treatment to these 3 call sites (they render fixed-layout rows, not squeezable slider tracks, and were never named alongside "sliders and the like"), but they still get the new `--font-size-label`/`--font-size-label-lore` base tokens (§1.5) and the `--font-controls` family (§1.5) just like every other DualLabel consumer — only the compact-container fallback is scoped out for them.

**Correction (found in a real browser, Tasks 4/6): `container-type: inline-size` collapses a shrink-to-fit-sized element to zero width.** CSS size containment (which `container-type: inline-size` applies) requires an element to have an explicit or externally-imposed ("contextual") width — an element whose own width normally comes from its content (shrink-to-fit) collapses to zero instead (confirmed via MDN's `container-type` docs). Two of the 12 controls are built exactly that way:

- **`Button`** (`.sc-button`) is *always* `display: inline-flex; width: fit-content` — "never larger than its own content" is the component's own stated design. Adding the container declarations directly to it made every Button in the app render invisible.
- **The 3 sliders' `[data-orientation='vertical']` variant** deliberately overrides `display` to `inline-flex` ("so several can sit side by side in a row without a parent grid/flex rework," `VERTICAL_SLIDERS.md`) — same collapse. This is the bug the user's screenshot showed as "vertical sliders completely missing."

The other 9 controls (and the sliders' own `[data-orientation='horizontal']` variant) are block-level `display: flex` roots, which get a contextual width from their parent regardless of content, and are unaffected.

**Corrected mechanism:**
- `Button` does **not** establish `sc-control` at all — removed entirely, not relocated. This isn't just a workaround: a control that always grows to fit its own label can never be cramped the way a fixed-width slider track can, so there was never a real compact-fallback scenario to solve for it.
- The 3 sliders establish `sc-control` **only on their `[data-orientation='horizontal']` selector** (merged into that selector's pre-existing `overflow-x/y` rule, not a new duplicate block), never on the bare/unqualified root. **Vertical sliders lose the compact-fallback mechanism** as a result — a real, currently-unsolved gap, not a silently-accepted one (§7 lists it as an open risk). A proper fix needs an architecture that gives the query-container element an explicit or externally-imposed width without also forcing that same requirement onto the element that must still shrink-to-fit its content — most plausibly a wrapper-element split, which is a real (if small) markup change this spec's original "no JSX change" claim (§1.1) didn't anticipate. Left for whoever scopes item 13 (Vertical Slider Label Overflow) next, since that item already owns "get vertical slider labels right."

This does **not** change §1.5's font-family split below — `Button` still gets `font-family: var(--font-controls)`/`font-weight: var(--font-weight-control)` like every other leaf control, it just doesn't also establish `sc-control`. The corrected picture for *container establishment* specifically (a narrower thing than §1.5's font-family split) is: of the 11 primitives with their own CSS selector, **7 (`CoordsInput`, `Lfo`, `RadioButton`, `Stepper`, `StepperWithToggle`, `TextInput`, `Toggle`) establish `sc-control` unconditionally, the 3 sliders establish it only when horizontal, and `Button` never does** — plus standalone `DualLabel` usage and `AccordionContainer`/`DirectionalPanel`, which never did (unchanged from §1.4's original scope decision above).

### 1.5 Font-family assignment: the exact 12 vs. 2 split

`--font-controls` is added to each of these 12 selectors' existing root rule (alongside the `container-type`/`container-name` pair above, `font-weight: var(--font-weight-control)`, and, where that file already declares its own font-size literal, the token replacing it — full list in §2):

`Button.css` (`.sc-button`), `CoordsInput.css` (`.sc-coords-input`), `Lfo.css` (`.sc-lfo`), `RadioButton.css` (`.sc-radio-button`), `SliderCenteredZero.css` (`.sc-slider-centered-zero`), `SliderLinear.css` (`.sc-slider-linear`), `SliderLog.css` (`.sc-slider-log`), `Stepper.css` (`.sc-stepper`), `StepperWithToggle.css` (`.sc-stepper-toggle`), `TextInput.css` (`.sc-text-input`), `Toggle.css` (`.sc-toggle`) — all 11 class names confirmed directly against each file.

Plus the 3 standalone-`DualLabel` host files' own wrapping elements — `RobotSelectionCard.css` (`.robot-selection-card__field`), `RobotDisplaySection.css` (`.robot-display-section__row`), `SectorSettingsDrawer.css` (the element wrapping the `STATUS_HEADER_SCHEMA` `<DualLabel>` in `SectorSettingsDrawer.tsx:74` — identify its exact class during Implement) — get `font-family: var(--font-controls)` only (no `container-type`, per §1.4's scope decision; no `font-weight` override needed, since `--font-weight-control` (400) is already what they'd inherit once `--font-sans`'s own document-wide default moves to `--font-weight-regular` (500) — wait, that inheritance doesn't hold: these 3 rows must **explicitly** set `font-weight: var(--font-weight-control)` too, since the `:root` default they'd otherwise inherit is 500, not Titillium Web's 400).

**Not touched** (stay on inherited `--font-sans`/`--font-weight-regular`): `AccordionContainer`, `DirectionalPanel` (§1.6 covers their own separate size/weight bump, still Rajdhani), plus everything outside the `ControlSchema` inventory entirely — `Header`, `SleeveContainer`, `PowerRockerSwitch`, `ConsolePanel`, page/drawer chrome.

Because `font-family`/`font-weight` are inherited CSS properties and none of these 12 controls' internal children (including `CabinetBox`'s front face — confirmed empty of any font rule in `CabinetBox.css`) set their own conflicting `font-family`, one rule on each control's root covers every descendant, including `Toggle`'s optional facade `children` (icon/text content, e.g. Header's Mute switch) and every option row inside `RadioButton`.

### 1.6 Fixing the actual "too small" complaint: `AccordionContainer` / `DirectionalPanel`

Both stay `--font-sans`/Rajdhani (§1.5's "not touched" list) but get an explicit size + weight bump on their own `DualLabel` human label — the literal fix for the named pain point:

```css
/* AccordionContainer.css — new rule */
.sc-accordion__row .sc-dual-label__human {
  font-size: var(--font-size-heading-sm);
  font-weight: var(--font-weight-medium);
}
```

```css
/* DirectionalPanel.css — new rule */
.sc-directional-panel > .sc-dual-label__human {
  font-size: var(--font-size-heading-sm);
  font-weight: var(--font-weight-medium);
}
```

Both selectors are scoped narrowly (a `.sc-accordion__row`-scoped descendant selector; a direct-child combinator for the panel, matching that file's own existing direct-child-combinator precedent for its Cabinetry facade rules) specifically so they never also catch a *nested* control's own `DualLabel` inside `children` — e.g. a `SliderLinear` rendered inside an open accordion keeps its own `--font-size-label`/`--font-controls` styling untouched. The **lore** caption (`.sc-dual-label__lore`) is deliberately left alone in both — it stays the small uppercase eyebrow at `--font-size-label-lore`, unbumped; only the primary human label was named as "too small," and keeping the lore/human size contrast preserves the existing visual hierarchy between them.

`AccordionContainer.css:70`'s existing `.sc-accordion__indicator { font-weight: 600; }` becomes `font-weight: var(--font-weight-medium);` (same value, now tokenized) — the `+`/`−` glyph itself needs no size change.

---

## 2. Target File Structure

```text
src/
├── index.css                         # MODIFIED — replace the 3-token block (§1.2) with 7 size + 4
│                                        #   weight tokens; add --font-controls (§1.3); :root's
│                                        #   font-weight: 400 -> var(--font-weight-regular); remove the
│                                        #   two leftover unused Vite-scaffold rules (h1 { font-size:
│                                        #   3.2em }, button's font-size/font-weight, index.css:105-119)
│                                        #   as dead code cleanup, not a migration target (they have zero
│                                        #   real consumers — no <h1>/bare <button> exists in the app)
├── main.tsx                           # MODIFIED — add 6 new Titillium Web import lines (§1.3); drop
│                                        #   the 4 Rajdhani 300/400 import lines
│
├── components/ui/controls/
│   ├── DualLabel.css                  # MODIFIED — __lore: 0.7rem -> var(--font-size-label-lore);
│                                        #   __human: 0.85rem -> var(--font-size-label); new @container
│                                        #   rule (§1.4)
│   ├── Button.css                     # MODIFIED — add --font-controls/--font-weight-control +
│   ├── CoordsInput.css                #   container-type/container-name to each file's own root
│   ├── Lfo.css                        #   selector (§1.4, §1.5) — no other font rules exist in any of
│   ├── RadioButton.css                #   these 8 files today (confirmed via grep), so this is a pure
│   ├── Stepper.css                    #   addition, not a value replacement, in each
│   ├── StepperWithToggle.css          #
│   ├── TextInput.css                  #
│   ├── Toggle.css                     #
│   ├── SliderLinear.css               # MODIFIED — same root-selector addition as above, PLUS
│   │                                    #   __value: 0.75rem -> var(--font-size-label); new @container
│   │                                    #   rule for __value (§1.4)
│   ├── SliderLog.css                  # MODIFIED — same as SliderLinear.css, targeting
│   │                                    #   .sc-slider-log / .sc-slider-log__value (confirmed)
│   ├── SliderCenteredZero.css         # MODIFIED — same as SliderLinear.css, targeting
│   │                                    #   .sc-slider-centered-zero / .sc-slider-centered-zero__value
│   │                                    #   (confirmed)
│   ├── AccordionContainer.css         # MODIFIED — new .sc-accordion__row .sc-dual-label__human rule
│   │                                    #   (§1.6); .sc-accordion__indicator's font-weight: 600 ->
│   │                                    #   var(--font-weight-medium)
│   └── DirectionalPanel.css           # MODIFIED — new .sc-directional-panel > .sc-dual-label__human
│                                        #   rule (§1.6)
│
├── components/ui/physical/
│   └── PowerRockerSwitch.css          # MODIFIED — 3 var(--font-size-sm/md) refs -> var(--font-size-
│                                        #   label) or var(--font-size-label-lore) (pick per line during
│                                        #   Implement — §7 item 2 flags this needs a visual check, since
│                                        #   the old sm/md split doesn't map 1:1 onto the new label/
│                                        #   label-lore split)
├── components/panels/screen/
│   └── Header.css                     # MODIFIED — 1 var(--font-size-sm) ref -> var(--font-size-label)
│                                        #   (this rule is on --font-mono text — §1's "font-mono untouched"
│                                        #   still holds; only the SIZE token reference changes, not the
│                                        #   family)
├── components/panels/physical/
│   └── SleeveContainer.css            # MODIFIED — same var(--font-size-sm) -> var(--font-size-label)
│                                        #   swap, same --font-mono-untouched note as Header.css
├── components/panels/screen/console/
│   ├── ConsolePanel.css               # MODIFIED — .console-panel__stub's 14px -> var(--font-size-
│   │                                    #   label) (this is a placeholder/stub rule — verify during
│   │                                    #   Implement whether .console-panel__stub still has a real
│   │                                    #   render path or is dead CSS; migrate the literal either way)
│   └── SectorSettingsDrawer.css       # MODIFIED — .sector-settings-drawer__status-line's 0.95em ->
│                                        #   var(--font-size-label); also gets the standalone-DualLabel
│                                        #   font-family/weight addition from §1.5 on whichever selector
│                                        #   wraps STATUS_HEADER_SCHEMA's <DualLabel>
├── components/debug/
│   └── SkippedNotesCounter.css        # MODIFIED — var(--font-size-sm) -> var(--font-size-label)
├── components/selection/
│   └── RobotSelectionCard.css         # MODIFIED — .__value's var(--font-size-sm) -> var(--font-size-
│                                        #   label); .__field gets §1.5's standalone-DualLabel font-
│                                        #   family/weight addition
└── components/robot/
    └── RobotDisplaySection.css        # MODIFIED — .__value gains font-family/weight (currently has
                                         #   none — just font-weight: 600, kept, tokenized to var(--font-
                                         #   weight-medium)); .__row gets §1.5's standalone-DualLabel
                                         #   addition

docs/
├── COMPONENT_LIBRARY.md               # MODIFIED — the "CSS tokens" section (docs/COMPONENT_LIBRARY.md
│                                        #   §"CSS tokens") currently states "No new CSS custom properties
│                                        #   were introduced in this phase" — no longer true; needs a short
│                                        #   update listing the new font-size/weight/family tokens and the
│                                        #   sc-control container-query name, or a pointer to this spec
└── todo/roadmap.md                    # MODIFIED — mark item 12 done per that doc's own convention once
                                         #   shipped

package.json                           # MODIFIED — new dependency, @fontsource/titillium-web (§1.3)
```

**Explicitly not touched, and why:** `src/types/controls.ts` and every `ControlSchema` interface (no prop/type changes — this is a pure CSS + token phase). Every domain config file (`audioRigConfig.ts`, `robotOptionsConfig.ts`, `sectorSettingsConfig.ts`, `companyConfig.ts`, `robotSelectionConfig.ts` — no schema content changes). `CabinetBox.css`/`CabinetBox.tsx` (confirmed empty of font rules — nothing to migrate, and its geometry/glow/pop mechanics are unrelated to typography). `VoxelTrack.tsx`/`.css`/`voxelTrackMath.ts` (box geometry, no text). Every test file listed nowhere above — this phase has no new *behavior* to unit-test (§5 explains what "verification" means here instead). `docs/ROBOT_DESIGN.md`'s audio→visual mapping (unrelated to UI typography). Roadmap items 13-17 themselves (their own future specs, not this one).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless a file's exact selector name (flagged "verify against the file" above) turns out to differ from what's written here — in that case, use the real name, don't rename the file's existing selector to match this spec's guess.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No fluid/`clamp()` sizing anywhere in this phase.** Every size is a fixed token value; the one size-swap mechanism (§1.4) is a discrete `@container` breakpoint, not a fluid formula — confirmed explicitly rejected in the source intent doc.
* **Container queries only, never a new `@media` rule, for any of this phase's size-swapping.** `DirectionalPanel`'s existing `useResponsivePanelOrientation` viewport-tier hook is unrelated prior art (layout orientation, not type) and is not a precedent to follow here.
* **`--font-mono` and its 4 existing call sites are out of scope for family changes** — only the *size token reference* changes where they currently read `var(--font-size-sm)` (Header.css, SleeveContainer.css, SkippedNotesCounter.css, PowerRockerSwitch.css's confirm-dialog description/button). Do not add `--font-controls`/`--font-sans` anywhere `--font-mono` is already explicit.
* **`AccordionContainer`/`DirectionalPanel` never gain `container-type`/`container-name`, and never move off `--font-sans`.** Their fix is the §1.6 size/weight bump only.
* **The 12 leaf controls' `container-type: inline-size` addition must not change any existing layout** — `container-type: inline-size` establishes a query context without altering the element's own box/flow behavior (unlike `container-type: size`, which would). If any visual shift is observed during the manual check (§5), that's a bug to fix, not an accepted side effect.
* **No new dependency beyond `@fontsource/titillium-web`.** Do not reach for a CSS-in-JS, PostCSS plugin, or container-query polyfill — native `@container` support is assumed (no browserslist/legacy-browser constraint exists in this repo today).
* **Do not touch `Stepper`/`StepperWithToggle`'s existing "unused by any real app schema" status** — they still get the §1.5 font/container treatment (for whenever a future schema does use them) but no new consumer is wired up by this phase.

---

## 4. Code Style & Architecture Conventions

**Canonical token block** (`src/index.css`, replacing lines 8-11):

```css
:root {
  /* Typography */
  --font-sans: 'Rajdhani', system-ui, Avenir, Helvetica, Arial, sans-serif;
  --font-controls: 'Titillium Web', 'Rajdhani', system-ui, Avenir, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Segoe UI Mono", monospace;

  --font-size-label-compact: 0.6875rem;
  --font-size-label-lore: 0.75rem;
  --font-size-label: 0.9375rem;
  --font-size-body: 1rem;
  --font-size-heading-sm: 1.125rem;
  --font-size-heading-md: 1.375rem;
  --font-size-heading-lg: 1.75rem;

  --font-weight-control: 400;
  --font-weight-regular: 500;
  --font-weight-medium: 600;
  --font-weight-bold: 700;
  /* ...rest of :root unchanged... */
}
```

**Representative leaf-control diff** (`SliderLinear.css` — the pattern every one of the 12 files in §2 follows):

```css
.sc-slider-linear {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-controls);
  font-weight: var(--font-weight-control);
  container-type: inline-size;
  container-name: sc-control;
}

/* ...unchanged rules... */

.sc-slider-linear__value {
  font-size: var(--font-size-label);
  color: var(--color-text-muted);
}

@container sc-control (max-width: 120px) {
  .sc-slider-linear__value {
    font-size: var(--font-size-label-compact);
  }
}
```

**`DualLabel.css` in full** (every line changes or is new):

```css
.sc-dual-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sc-dual-label__lore {
  font-size: var(--font-size-label-lore);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.sc-dual-label__human {
  font-size: var(--font-size-label);
  color: var(--color-text-primary);
}

@container sc-control (max-width: 120px) {
  .sc-dual-label__lore,
  .sc-dual-label__human {
    font-size: var(--font-size-label-compact);
  }
}
```

* **Naming Conventions:** `--font-size-*`/`--font-weight-*`/`--font-*` custom properties, kebab-case, matching every existing token family (`--spacing-*`, `--color-*`). `sc-control` for the shared `container-name` — lowercase, hyphenated, no `sc-` class-prefix collision risk since `container-name` is a separate CSS namespace from class selectors.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing (same rule `GLOBAL_VOLUME_CONTROL.md` followed).

---

## 5. Testing & Verification Requirements

This phase is almost entirely CSS custom-property/value changes with no new component behavior, props, or state — there is little for Vitest/Testing Library to meaningfully assert beyond what `npm run build:types`/`npm run lint` already catch (a typo'd `var(--font-size-labell)` fails silently in CSS, not at build time, so the manual check below is load-bearing, not optional).

* **Framework:** Vitest + React Testing Library (unchanged; no new test files expected).
* **Existing tests that must keep passing unmodified:** `DualLabel.test.tsx` (asserts rendered text content and presence/absence of the lore/human spans — not their computed size, so it should be unaffected), every primitive's own `.test.tsx` (none assert on `font-size`/`font-family` today, confirmed via the same grep that produced §2's inventory).
* **`AccordionContainer.test.tsx`:** if it asserts on `.sc-accordion__indicator`'s inline/computed style anywhere, confirm it checks behavior (open/closed glyph) not the literal `600` weight value — the value itself is unchanged (now tokenized, not renumbered), so this should be a non-issue, but verify during Implement.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (this phase touches no `.ts`/`.tsx` type surface, so this mainly guards against an accidental unrelated break).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all existing tests pass unmodified.
  4. `npm run build` — production bundle builds cleanly (also confirms the new `@fontsource/titillium-web` import paths resolve).
* **Manual check (not automated — this is where this phase's real correctness lives):**
  1. Load the app and confirm Titillium Web is actually rendering (not silently falling back to Rajdhani) on at least one of each of the 12 leaf controls — check DevTools' computed `font-family`, not just visual similarity, since Rajdhani/Titillium Web can look close at a glance.
  2. Confirm `AccordionContainer` and `DirectionalPanel` trigger/group labels are visibly bigger and heavier than before, and still render in Rajdhani.
  3. Narrow a drawer (or resize the window) until a horizontal slider's own box row is at its 3-box overflow floor, and confirm its label/value text visibly steps down to the compact size at some point — then confirm it steps back up once there's room. Do this for at least one vertical slider too (stack several EQ-style vertical sliders in a narrow mobile-width column) — this is the case §1.4/item 13 are both about.
  4. Confirm no layout shift/reflow bug was introduced by the new `container-type: inline-size` declarations — a control's box/track position and size should be pixel-identical to before this phase, only the label/value text size should ever change.
  5. Confirm `prefers-reduced-motion`/focus/keyboard navigation on at least one control of each of the 12 types still works (no CSS in this phase touches interaction, but a stray selector typo could theoretically break a `:focus-visible` rule sharing a file — quick regression pass).
  6. Zoom the browser's text size (or change the OS/browser default font size) and confirm every migrated size visibly scales — proving the rem migration (§1.2) actually took effect and isn't silently still reading a px fallback somewhere.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/type-scale` (new branch off `main`).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `index.css` + `main.tsx` + `package.json` — the token system and new font dependency, landed first since every other commit depends on the tokens existing; (2) `DualLabel.css` + the 12 leaf-control CSS files — the container-query mechanism and font-family split; (3) `AccordionContainer.css` + `DirectionalPanel.css` — the §1.6 label bump, the direct fix for the named complaint; (4) the remaining one-off-value files (`PowerRockerSwitch.css`, `Header.css`, `SleeveContainer.css`, `ConsolePanel.css`, `SectorSettingsDrawer.css`, `SkippedNotesCounter.css`, `RobotSelectionCard.css`, `RobotDisplaySection.css`) — pure token-reference swaps, no new mechanism; (5) `docs/COMPONENT_LIBRARY.md` + `docs/todo/roadmap.md` last.

---

## 7. Open Questions & Risks

Resolved during the pre-spec `interview-me` pass (`docs/intent/type-scale.md`), not re-litigated here: the two-font split's category boundary (chrome/container vs. leaf control), rem over px, fixed steps over fluid, container queries over media queries, full migration scope (not a parallel-system introduction), and the weight change (no more Rajdhani 300/400).

Resolved during this Specify pass, worth a second look before/during Implement:

1. **Standalone `DualLabel` usage (`RobotSelectionCard`, `RobotDisplaySection`, `SectorSettingsDrawer`'s status header) was never explicitly named in the interview** — it's neither "sliders and the like" nor "accordions and panels." This spec's default (§1.4/§1.5): give them the new tokens and `--font-controls` family, but *not* the container-query compact fallback. Low risk (visual-only, easy to add the 2-line container declaration later if it turns out these rows do get squeezed on mobile) but worth a quick confirm-by-looking-at-it during Implement rather than treating as settled.
2. **`PowerRockerSwitch.css`'s 3 existing `var(--font-size-sm)`/`var(--font-size-md)` references don't map 1:1 onto the new 2-tier `--font-size-label`/`--font-size-label-lore` split** — the old file used `sm` for its description/button text and `md` for its dialog title (`--font-mono`, untouched family-wise). §2 flags picking the right new token per line as a visual judgment call during Implement, not a mechanical find-replace.
3. **The `120px` container-query breakpoint (§1.4) is this spec's own unconfirmed engineering default**, same category as `GLOBAL_VOLUME_CONTROL.md`'s flagged `80px` slider width — needs the manual narrow-viewport check (§5.3) to confirm it actually fires where the mobile label-overflow complaint (item 13) is happening, not just somewhere plausible.
4. **This phase does not fix roadmap item 13 itself** — per the intent doc, item 13 stays a separate, blocked-on-this item; if the manual check in §5.3 happens to observe the overflow bug already gone once this ships, note it in that item's own scoping pass rather than closing it here.
5. **`.console-panel__stub`'s real render status is unverified** — it may be dead placeholder CSS from an earlier phase (`ConsolePanel.tsx` should be checked during Implement to confirm whether this class still renders in any real path); migrate its literal `14px` regardless, but don't treat its presence as evidence the stub is live UI.

Found and fixed during Implement (not anticipated by this spec — recorded here rather than silently absorbed into §1.4/§1.5's text):

6. **`container-type: inline-size` collapses `Button` and vertical-orientation sliders to zero width** — a real, user-reported browser bug (CSS size containment requires an explicit/contextual width; both are shrink-to-fit by design). Fixed by removing the container declaration from `Button` entirely and scoping the sliders' to their `[data-orientation='horizontal']` selector only — full explanation in §1.4's correction note. **Open, unresolved as of this writing:** vertical sliders have no compact-fallback mechanism at all now. This is very likely the right thing for item 13 (Vertical Slider Label Overflow) to pick up and solve properly (a wrapper-element split is the most likely real fix), rather than something this phase should block on.
7. **This spec's own §1.1 claim ("no JSX change" beyond the existing 11 primitives) no longer holds as a guarantee for any future fix to item 6** — a real fix for vertical sliders' compact fallback will very likely need a markup change (an extra wrapping element), not a CSS-only one. Flagging so item 13's own spec pass doesn't get blindsided by re-discovering this constraint from scratch.
8. **Task 2's `button {...}` removal broke font inheritance for every native `<button>` without its own explicit `font-family`** — a real, user-reported bug (§1.2's correction note has the full explanation and fix). The lesson worth carrying forward, not just the patch: "zero real consumers" needs checking against *every* property in a rule being deleted, not just the rule's most visually obvious ones (border-radius/padding were correctly dead; `font-family: inherit` was not, and looked identical to the dead properties sitting right next to it).
