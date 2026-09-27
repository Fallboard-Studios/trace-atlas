# Intent: Textbox Component

Confirmed via `/interview-me`, 2026-09-24.

## Outcome

A new stateless UI primitive, `Textbox` (`src/components/ui/controls/Textbox.tsx`), joining the
existing 14 in `docs/COMPONENT_LIBRARY.md` as a 15th — renders trusted, first-party HTML content
(lore/flavor text, item descriptions) with the app's oblique-cabinetry visual language available
on demand, and with color theming that tracks whatever item the content is about.

## User

Crawford (solo dev) — needs a reusable way to drop pre-authored HTML copy (never user-generated)
into the UI, optionally dressed in the same Oblique Cabinetry panel look every other control
already carries, and colored to match the item it's describing rather than always reading as a
generic gray block of text.

## Why now

HTML content blocks recur across the app's data (lore/description copy tied to robots, companies,
etc.) with no shared component to render them consistently — each would otherwise need its own
one-off rendering and styling.

## Success

- Props: `html: string` (required — the HTML to render), `cabinetry?: boolean` (default `false`),
  `trait?: Trait` (optional).
- The `html` prop is sanitized via a new `dompurify` dependency immediately before rendering, then
  rendered with `dangerouslySetInnerHTML` on an inner content element. Defense-in-depth: the
  content is first-party/trusted today, but the sanitization step is not skipped on that basis.
- `cabinetry={true}` wraps the rendered content in the existing `CabinetBox` primitive, configured
  `popped skipMountAnimation autoHeight` — the same permanently-popped, content-sized,
  non-animating facade Header/DirectionalPanel already use for their own top-level cabinetry. No
  new visual pattern.
- `cabinetry={false}` (the default) renders the content with no `CabinetBox` and no pop styling at
  all.
- Root element always carries the base class `sc-textbox`, matching this codebase's existing
  primitive naming convention (`sc-toggle`, `sc-slider-linear`, `sc-cabinet-box`, ...). When
  `cabinetry={true}`, the root additionally carries the literal class `hasCabinetry` (Crawford's
  own exact name, camelCase, not translated into the `sc-`/BEM convention).
- `trait`, when supplied, is an already-resolved `Trait` id (`src/types/traits.ts`) — Textbox does
  not derive a trait from the HTML content or infer it from any item data itself. This matches
  every existing trait-aware component (`NavTreeNode`, `AudioSettingSection`, ...), which all
  receive their trait as a prop already resolved by their caller.
- When `trait` is omitted, Textbox falls back to `getTraitColorStyle('header')` — the same
  teal/green pair `index.css`'s own app-wide ambient default and `Header.tsx` use.
- The resolved trait style (`getTraitColorStyle`, `src/utils/traitColors.ts`) is applied as inline
  styles on Textbox's own root element (`sc-textbox`), so both the cabinetry facade (if present)
  and any other descendant reading `--color-accent-*` inherit it via normal CSS cascade — no
  separate color wiring needed inside `CabinetBox` itself.

## Constraint

- No new interaction surface — Textbox is a pure display primitive. No click/focus handling, no
  `value`/`onChange`, no `ControlSchema` wrapper for the content prop (unlike the other 14
  primitives, which are all schema + value/onChange driven).
- `dompurify` (+ `@types/dompurify`) is a new dependency — added with Crawford's explicit sign-off
  per CLAUDE.md's "ask before adding a new dependency" boundary.
- Per CLAUDE.md: no GSAP timelines, no Zustand/React state for anything CabinetBox itself already
  owns (it manages its own `timelineMap`-registered pop timeline internally — Textbox does not
  touch that).

## Out of scope

- Trait auto-detection/inference from HTML content or from any item id — always caller-supplied,
  never guessed.
- A `ControlSchema`-style wrapper object for the `html`/`trait`/`cabinetry` props — they're plain,
  flat component props.
- Animated cabinetry pop-in, or any pop distance/behavior different from the existing
  Header/DirectionalPanel facade pattern.
- Any interactivity: click handling, focus management, `aria-*` role beyond whatever the sanitized
  HTML itself carries.
- Sanitizer choice beyond `dompurify` — no hand-rolled allowlist, no alternative library.

## Forward Note

Once implemented, add `Textbox` to `docs/COMPONENT_LIBRARY.md` alongside the other 14 primitives,
noting its display-only (non-`ControlSchema`) contract explicitly since it's the first primitive
that doesn't follow the schema + value/onChange shape.
