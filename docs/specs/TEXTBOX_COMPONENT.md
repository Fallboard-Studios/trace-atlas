# Phase Spec: Textbox Component

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/textbox-component.md](../intent/textbox-component.md) (confirmed via
`/interview-me`, 2026-09-24). Prior art this spec follows directly: `TextInput.tsx`/`.css`
(`docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md`) for the permanently-popped/`autoHeight` `CabinetBox`
facade shape, and `Header.tsx`/`NavTreeNode.tsx` for the `getTraitColorStyle(trait)` accent-color
pattern. This phase touches presentation only — no `AudioEngine`, `BeatClock`, or Zustand-shape
change; no existing `ControlSchema` variant changes.

---

## 1. Overview & Claude Explanation

The intent doc resolves every user-facing question already (props shape, sanitization via a new
`dompurify` dependency, cabinetry via `CabinetBox`, trait fallback to `'header'`, class naming).
Two implementation-shape questions remain, resolved below with real code rather than left to Tasks.

### 1.1 `Textbox` is not a `ControlSchema` primitive — no schema, no `value`/`onChange`

Confirmed intent (Out of scope): `html`/`cabinetry`/`trait` are plain, flat component props, not a
`TextboxSchema` entry in the `ControlSchema` discriminated union (`src/types/controls.ts`).
`CONTROL_SCHEMA_TYPES`/`Textbox` is the **first** primitive in `src/components/ui/controls/` with
no schema, no `id`, and no `value`/`onChange` pair — it is a pure display component, closer in
shape to `DirectionalPanel` (`{ schema, children }`, no value) than to any of the 14 schema-driven
controls, but even `DirectionalPanel` still takes a schema. Nothing in `src/types/controls.ts`
changes for this phase.

### 1.2 `CabinetBox`'s `timelineKey` needs a per-instance unique value with no `schema.id` to draw on

Every existing `CabinetBox` consumer builds its `timelineKey` from a schema's `id`
(`` `cabinet-toggle-${schema.id}` ``, `` `cabinet-text-input-facade-${schema.id}` ``, ...) — `Textbox`
has no schema and no `id` prop (confirmed intent's Success list is exactly `html`/`cabinetry`/
`trait`; no `id` was asked for or confirmed). Resolved here, flagged explicitly rather than silently
adding an undiscussed prop: `Textbox` calls React's built-in `useId()` once per instance and builds
`` `cabinet-textbox-${id}` `` — a real per-mounted-instance unique string, with zero new props and no
risk of two `Textbox` instances colliding the way two carelessly-duplicated hand-authored ids could.
`useId()` is only invoked when `cabinetry` is `true` in the sense that its *result* is only ever
read then, but per the Rules of Hooks it's called unconditionally on every render, exactly like
`CabinetBox`'s own unconditional `useCabinetBoxHeight()` call (`docs/specs/OBLIQUE_CABINETRY_TOGGLE.md`
§1.2's precedent for "always call the hook, discard the result when unused").

---

## 2. Target File Structure

```text
src/
└── components/ui/controls/
    ├── Textbox.tsx           # NEW — the primitive itself (§4)
    ├── Textbox.css            # NEW — sc-textbox root + hasCabinetry facade scoping (§4)
    └── Textbox.test.tsx       # NEW — full coverage (§5)

docs/
└── COMPONENT_LIBRARY.md      # MODIFIED — new "Display-only primitives (no ControlSchema)" section
                               #   documenting Textbox, distinct from both the 14 ControlSchema
                               #   primitives table and the "Shared composition components" section
                               #   (§6)

package.json                  # MODIFIED — new runtime dependency: dompurify (§3)
```

**Explicitly not touched, and why:**

- `src/types/controls.ts` — no new `ControlSchema` variant, no `CONTROL_SCHEMA_TYPES` entry (§1.1,
  confirmed intent). `Textbox`'s props are a plain local interface in `Textbox.tsx`, not a type
  exported from there.
- `src/components/ui/controls/CabinetBox.tsx`/`.css` — reused entirely unmodified. Every prop
  `Textbox` passes (`popped`, `skipMountAnimation`, `autoHeight`, `timelineKey`, `children`) already
  exists on `CabinetBoxProps` today; nothing additive is needed this phase.
- `src/utils/traitColors.ts` — `getTraitColorStyle` is called as-is, unmodified; no new trait, no
  new export.
- `src/types/traits.ts` — the `Trait` union/`TRAIT_IDS` are unchanged; `'header'` (the fallback) is
  an existing member.
- Any domain config (`robotOptionsConfig.ts`, `audioRigConfig.ts`, `companyConfig.ts`,
  `sectorSettingsConfig.ts`) or drawer component — this phase ships the primitive only; wiring it
  into a real data-driven consumer (lore/description copy for a robot, company, etc.) is a separate,
  later phase, not scoped here (confirmed intent's Out of scope doesn't name a first real consumer).
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change.
- `src/index.css` — no new global custom property; `Textbox` reads the existing
  `--color-accent-*`/`--color-surface`/`--color-text-primary`/`--color-border` tokens every other
  primitive already reads.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build
  assets.
* **New dependency, confirmed with Crawford (`/interview-me`):** `dompurify`.
  ```bash
  npm install dompurify
  ```
  Verify after install whether a separate `@types/dompurify` package is still needed (`dompurify`'s
  own package has shipped bundled TypeScript types for several major versions; if `npm run
  build:types` fails to resolve types for the installed version, add `@types/dompurify` as a
  devDependency at that point rather than pre-emptively).
* **`html` is sanitized on every render, unconditionally** — `DOMPurify.sanitize(html)` runs before
  `dangerouslySetInnerHTML` regardless of `cabinetry`/`trait`. Never bypassed, even though the
  intent doc confirms the source data is first-party/trusted (defense-in-depth, Crawford's explicit
  choice over skipping sanitization).
* **`dangerouslySetInnerHTML` is the only place raw HTML touches the DOM.** No `ref` +
  `el.innerHTML =` alternative, no second unsanitized render path.
* **No `ControlSchema` variant, no schema field addition** (§1.1). Do not add `Textbox`/`textbox` to
  `CONTROL_SCHEMA_TYPES` or `src/types/controls.test.ts`'s exhaustiveness assertion.
* **`useId()` is the only source of `CabinetBox`'s `timelineKey`** (§1.2) — do not add an `id` prop
  to thread through instead; that would be scope beyond what was confirmed.
* **Every `CabinetBox` prop passed when `cabinetry` is `true` is a literal, never a variable derived
  from other state:** `popped` (literal `true`), `skipMountAnimation` (literal `true`), `autoHeight`
  (literal `true`) — matching `TextInput`'s/`DirectionalPanel`'s own top-level facade precedent
  exactly (`docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md` §1.1). No animated pop-in, ever, regardless
  of `cabinetry`'s own value changing across renders.
* **`CabinetBox` is rendered conditionally on `cabinetry`, not always-mounted-and-hidden.** When
  `cabinetry` is `false`, no `CabinetBox` exists in the tree at all — not a `display: none` box, not
  a `popped={false}` flat box. This matches the intent doc's "no cabinetry effect... at all" wording
  literally.
* **No new interaction surface.** No `onClick`, no `tabIndex`, no keyboard handling — confirmed
  intent explicitly scopes this to pure display.
* **`React.memo`, following this codebase's existing boundary** (`docs/COMPONENT_LIBRARY.md`'s
  `React.memo` boundary section) — every prop (`html: string`, `cabinetry?: boolean`, `trait?:
  Trait`) is a primitive, so the default shallow compare is correct; no custom comparator.
* **Out of scope, per the intent doc:** trait auto-detection/inference from content or any item id,
  a `ControlSchema` wrapper for the content prop, animated cabinetry pop-in, any interactivity,
  sanitizer choice beyond `dompurify`.

---

## 4. Code Style & Architecture Conventions

**`src/components/ui/controls/Textbox.tsx`** (new):

```tsx
import { memo, useId } from 'react';
import DOMPurify from 'dompurify';

import { CabinetBox } from './CabinetBox';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { Trait } from '@/types/traits';
import './Textbox.css';

interface TextboxProps {
  /** Pre-authored HTML, sanitized via DOMPurify immediately before rendering. Always first-party
   *  data (docs/intent/textbox-component.md) — sanitized anyway as defense-in-depth, never
   *  skipped. */
  html: string;
  /** Wraps the content in a permanently-popped, non-animating CabinetBox facade (matching
   *  TextInput's/DirectionalPanel's own top-level facade — docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md
   *  §1.1) when true. Default false: no CabinetBox, no pop styling, no `hasCabinetry` class. */
  cabinetry?: boolean;
  /** Already-resolved trait id, matching every other trait-aware component (NavTreeNode,
   *  AudioSettingSection, ...) — never derived from `html` or any item id here. Omitted falls back
   *  to getTraitColorStyle('header'), the same pair index.css's own ambient default and Header.tsx
   *  use. See docs/specs/TEXTBOX_COMPONENT.md §1.1 for why this isn't a resolved-by-content lookup. */
  trait?: Trait;
}

/**
 * Renders trusted, first-party HTML content (lore/description copy) with color theming that
 * tracks whichever item it's about. The first primitive in this directory with no ControlSchema,
 * no id, and no value/onChange — see docs/specs/TEXTBOX_COMPONENT.md §1.1.
 *
 * `cabinetry={true}` wraps the content in the same permanently-popped, non-animating CabinetBox
 * facade TextInput/DirectionalPanel's own top-level instances already use — popped/
 * skipMountAnimation/autoHeight are all literals, never derived from state, so this never
 * animates. `cabinetry={false}` (the default) renders no CabinetBox at all.
 *
 * The resolved trait accent style is applied on Textbox's own root (`.sc-textbox`), so both the
 * cabinetry facade (if present) and any other descendant reading `--color-accent-*` inherit it via
 * plain CSS cascade — no separate color wiring inside CabinetBox itself.
 */
function TextboxInner({ html, cabinetry = false, trait }: TextboxProps) {
  // Unconditional per Rules of Hooks; its result is only read when cabinetry is true (§1.2).
  const instanceId = useId();
  const accentStyle = getTraitColorStyle(trait ?? 'header');
  const sanitizedHtml = DOMPurify.sanitize(html);

  const content = (
    <div className="sc-textbox__content" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
  );

  return (
    <div className={cabinetry ? 'sc-textbox hasCabinetry' : 'sc-textbox'} style={accentStyle}>
      {cabinetry ? (
        <CabinetBox popped skipMountAnimation autoHeight timelineKey={`cabinet-textbox-${instanceId}`}>
          {content}
        </CabinetBox>
      ) : (
        content
      )}
    </div>
  );
}

// React.memo (docs/COMPONENT_LIBRARY.md's React.memo boundary) — every prop here is a primitive;
// the default shallow compare is correct, no custom comparator.
export const Textbox = memo(TextboxInner);
```

**`src/components/ui/controls/Textbox.css`** (new):

```css
.sc-textbox {
  color: var(--color-text-primary);
}

.sc-textbox__content {
  font-family: var(--font-sans);
}

/* Oblique Cabinetry facade wrapper, only present when cabinetry={true} (hasCabinetry, Textbox.tsx)
   — unlike TextInput's unconditional facade, this one genuinely doesn't exist in the DOM when
   cabinetry is false, so no ":not(.hasCabinetry)" guard is needed on these rules. */
.sc-textbox.hasCabinetry > .sc-cabinet-box {
  width: 100%;
}

/* display: block + height: auto (overrides CabinetBox.css's own fixed height: var(--cabinet-box-height)
   default by selector specificity) lets the front face size itself to .sc-textbox__content's real
   content height — exactly what CabinetBox.tsx's autoHeight prop expects its left-face wall to be
   measured against. Same 12px/14px padding TextInput/DirectionalPanel's own top-level facades use
   (docs/specs/OBLIQUE_CABINETRY_TEXT_INPUT.md §1.2) — both frame a block of content, not one
   centered inline line (Button's horizontal-only default). */
.sc-textbox.hasCabinetry > .sc-cabinet-box > .sc-cabinet-box__front {
  display: block;
  width: 100%;
  height: auto;
  padding: 12px 14px;
}
```

* **Naming conventions:** `sc-textbox` root class (matching this codebase's `sc-` primitive
  prefix), `sc-textbox__content` (BEM-ish element, matching `sc-text-input__el`'s own pattern),
  `hasCabinetry` (Crawford's own exact literal name, deliberately **not** translated to
  `sc-textbox--cabinetry` — see the intent doc), `` `cabinet-textbox-${instanceId}` `` (timelineMap
  key prefix, mirroring `cabinet-text-input-facade-`/`cabinet-toggle-`'s own naming).
* **Formatting:** Matches every other primitive file's existing style (2-space indent, single
  quotes, no semicolon-omission changes) — no reformatting beyond what this phase adds.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** `src/components/ui/controls/Textbox.test.tsx`, colocated (matching every
  other primitive).
* **Mocking `CabinetBox`:** same pattern `TextInput.test.tsx`/`Button.test.tsx`/`Toggle.test.tsx`
  already use — isolates this file's assertions about `Textbox`'s own wiring from `CabinetBox`'s
  already-proven internals:
  ```tsx
  vi.mock('./CabinetBox', () => ({
    CabinetBox: ({ popped, timelineKey, skipMountAnimation, autoHeight, children }: {
      popped: boolean; timelineKey: string; skipMountAnimation?: boolean; autoHeight?: boolean;
      children?: React.ReactNode;
    }) => (
      <div
        data-testid="cabinet-box"
        data-popped={String(popped)}
        data-timeline-key={timelineKey}
        data-skip-mount-animation={String(!!skipMountAnimation)}
        data-auto-height={String(!!autoHeight)}
      >
        {children}
      </div>
    ),
  }));
  ```
* **Mocking `dompurify`:** a thin pass-through spy so tests can assert it was actually called with
  the raw `html`, without pulling in the real sanitizer's DOM-dependent behavior:
  ```tsx
  vi.mock('dompurify', () => ({ default: { sanitize: vi.fn((html: string) => html) } }));
  ```
* **Test cases:**
  1. **Renders the (mocked-passthrough) sanitized HTML via `dangerouslySetInnerHTML`** — e.g.
     `render(<Textbox html="<strong>hi</strong>" />)`, assert `screen.getByText('hi').tagName` is
     `'STRONG'`.
  2. **Calls `DOMPurify.sanitize` with the raw `html` prop, unconditionally** — assert the mocked
     `sanitize` was called with the exact input string, including with `cabinetry` omitted
     (default `false`), proving sanitization isn't gated behind cabinetry.
  3. **Renders no `CabinetBox` and no `hasCabinetry` class when `cabinetry` is omitted (defaults
     false)** — `screen.queryByTestId('cabinet-box')` is `null`; root element's `className` is
     exactly `'sc-textbox'`.
  4. **Renders no `CabinetBox` and no `hasCabinetry` class when `cabinetry={false}` explicitly** —
     same assertions as #3, proving the explicit-false path matches the default.
  5. **Renders a `CabinetBox` with `popped="true"`, `skipMountAnimation="true"`, `autoHeight="true"`
     and the `hasCabinetry` class on the root, when `cabinetry={true}`** — all four literal, never
     conditional on anything else.
  6. **`timelineKey` starts with `cabinet-textbox-` and is non-empty** when `cabinetry={true}`
     (`useId()`'s exact output format isn't asserted, since it's an implementation detail of React
     itself — only the prefix and non-emptiness this component controls).
  7. **Two simultaneously-rendered `Textbox` instances (`cabinetry={true}` on both) get two
     distinct `timelineKey` values** — guards against a hardcoded/shared key regression.
  8. **Applies `getTraitColorStyle('output')`'s exact style object on the root when
     `trait="output"`** — assert the root's inline `--color-accent-a`/`-b` match
     `TRAIT_COLORS.output`.
  9. **Falls back to `getTraitColorStyle('header')`'s exact style object when `trait` is omitted.**
  10. **The trait style is applied identically regardless of `cabinetry`** — same accent custom
      properties present on the root whether `cabinetry` is `true` or `false`.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (including resolving `dompurify`'s types —
     confirm whether `@types/dompurify` is needed per §3).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new tests pass; no existing test file is touched or broken (this phase adds
     files, it doesn't modify any existing primitive).
  4. `npm run build` — production bundle builds cleanly with the new `dompurify` dependency
     included.
* **Manual check:** since this phase ships the primitive with no real data-driven consumer yet
  (§2), manual verification is a temporary local render (e.g. a throwaway call site or Storybook-
  style harness, removed before committing) confirming: HTML tags (`<strong>`, `<em>`, `<p>`, a
  `<script>` tag to confirm DOMPurify strips it) render/are stripped as expected; `cabinetry={true}`
  shows the oblique-cabinetry panel framing content of varying height without clipping; a `trait`
  prop visibly recolors the panel's accent glow/border; omitting `trait` shows Header's own
  teal/green.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** add a new top-level section, **"Display-only primitives
  (no `ControlSchema`)"**, placed after the existing `AccordionContainer` entry and before "Shared
  composition components" — distinct from both: the 14-primitive table above it is exclusively
  `ControlSchema`-driven, and "Shared composition components" describes things that *compose
  several already-rendered primitives* (`LfoTargetGroup`), where `Textbox` is a single leaf with no
  composition of other primitives (aside from optionally wrapping in `CabinetBox`, which every
  Cabinetry primitive already does). Document: props (`html`, `cabinetry?`, `trait?`), the
  `hasCabinetry` class, the `getTraitColorStyle('header')` fallback, and a note that it currently
  ships with no real data-driven consumer (§2) — a later phase wires it into robot/company lore
  copy.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges
  manually.
* **Branch Convention:** to be chosen by Crawford at implementation time (not specified in the
  intent interview); suggest `feature/textbox-component` following this repo's existing
  `feature/<slug>` convention.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences. Suggested grouping, each independently reviewable: (1) `package.json`/lockfile (the
  `dompurify` dependency add, alone); (2) `Textbox.tsx`/`.css`/`.test.tsx` (the primitive itself);
  (3) `docs/COMPONENT_LIBRARY.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, not left open):

- ~~Where does this component live, and is it a `ControlSchema` primitive?~~ **Resolved:
  `src/components/ui/controls/Textbox.tsx`, a 15th primitive but the first with no `ControlSchema`**
  (§1.1, confirmed intent).
- ~~What's the content prop shape?~~ **Resolved: `html: string`, required** (confirmed intent).
- ~~How does `Textbox` learn which trait to use?~~ **Resolved: optional `trait?: Trait`, already
  resolved by the caller — never derived from content** (confirmed intent).
- ~~Is `html` sanitized before rendering?~~ **Resolved: yes, always, via a new `dompurify`
  dependency — Crawford's explicit choice over skipping sanitization given trusted-only data**
  (confirmed intent).

Resolved by direct reasoning during Specify — flagged explicitly since the interview didn't ask
this one directly, not silently assumed:

1. **What unique value does `CabinetBox`'s required `timelineKey` prop get, given `Textbox` has no
   `schema.id`?** **Resolved: `useId()`, called unconditionally, building
   `` `cabinet-textbox-${instanceId}` ``** (§1.2). Reasoning: every existing option either reuses an
   id that doesn't exist here (no schema) or adds a new required prop the interview never confirmed
   — `useId()` gives real per-instance uniqueness for free, within the exact props surface already
   confirmed. Flagged explicitly to Crawford during review in case an explicit `id` prop is actually
   wanted for some other reason (e.g. stable ids across server/client hydration boundaries this app
   doesn't currently have, or a future need to look up a specific `Textbox` instance's timeline from
   outside the component) — nothing in the confirmed intent calls for that, so it's not built here.

No risks carried forward from prior Cabinetry phases apply here in a new way — this phase reuses
`CabinetBox.tsx`'s `autoHeight`/`skipMountAnimation`/`popped` mechanism entirely unmodified, the
exact same combination `TextInput`/`DirectionalPanel`'s own top-level facades already proved out.

**New risk this phase does introduce:** `dangerouslySetInnerHTML` plus a first-time dependency
(`dompurify`) in this codebase. Mitigated by: (a) sanitizing unconditionally, never gated behind a
"trust this caller" flag; (b) the manual-check step in §5 explicitly verifying a `<script>` tag is
stripped; (c) no scope creep toward a second unsanitized render path.

**Forward note:** this phase ships `Textbox` with no real consumer. The natural next phase is
wiring it into an actual first-party HTML data source (robot/company lore or description copy) and
choosing that consumer's own `trait` value — deferred here since the intent interview didn't name a
specific first consumer, only the component's own contract.
