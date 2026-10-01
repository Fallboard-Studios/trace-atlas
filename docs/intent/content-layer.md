# Intent: Content Layer

Confirmed via a six-question interview on 2026-09-30 (not the full `interview-me` pass — the problem was already well evidenced by a code survey the same day), ahead of a `spec-driven-development` pass.

## Problem

User-facing text reaches the app through five unrelated channels, and nothing ties them together:

- Control schemas in `src/data/*Config.ts` (11 files, ~190 label strings) mix copy (`loreLabel`/`humanLabel`) with bounds (`min`/`max`/`orientation`/`verticalHeight`) in the same object literals.
- The nav tree (`src/data/navTreeConfig.ts`) carries its own lore/human label per node, separate from the control the node opens.
- Content components hold their own tables: `FleetParamsContent.tsx`, `SettingsContent.tsx`, `RobotSectionAccordionStack.tsx` each define accordion labels plus intro prose (`IntroContent`: `loreLabel`/`loreDescription`/`humanDescription`, with HTML inside the strings). `Header.tsx`, `SectorSettingsDrawer.tsx`, `CompanyCrudControls.tsx`, `CoordsInput.tsx` define schemas inline.
- Primitives own a few strings themselves (`Lfo.tsx`'s `SHAPE_OPTIONS`, `Stepper`'s `Increment {name}`/`Decrement {name}` accessible-name templates, etc.).
- `docs/reference/text-content-tables.md` was the authoring source for the 2026-09-29 copy pass, hand-transcribed into all of the above; the only sync is a comment in `SettingsContent.tsx` saying its labels "must match navTreeConfig exactly".

Observed cost: 40 label strings are defined in two or more files ("Tempo" lives in the nav tree, `audioRigConfig.ts` and `FleetParamsContent.tsx`); two label vocabularies coexist (`humanLabel` on schemas, `label` on radio options and sector presets); six `[c]` placeholders and a set of ALL CAPS legacy headings survive because no single list of every string exists; prose edits touch `.tsx` files.

## Outcome

All user-facing text lives in one place — a content module under `src/content/` — keyed by a clean, content-owned key scheme, one entry per concept. Everything that renders text reads it from there. The content module is the single source of truth for copy; `docs/reference/text-content-tables.md` is retired (moved to `docs/reference/archive/`), and `docs/reference/copy-tone-guide.md` stays as the rules document.

## Behavior

- **One entry per concept.** "Tempo" is one entry; the nav row, the slider's label and the accordion heading all read it. A concept's entry carries its surface variants as fields (at minimum `human` and `lore`; an optional intro block of `lore`/`loreDescription`/`humanDescription` for sections that render an `IntroPanel`). The nav's lore name is **not** independently authored — it is the concept's `lore`.
- **Clean key scheme**, designed for the content file, not inherited from today's nav-node ids (`fleetParams.pacing.tempo`) or schema ids (`audioRig.tempo`). Those ids keep their current jobs (nav bookkeeping, scroll anchors, accordion sync, accessible-name fallback) and are mapped to content keys where the two meet; a content key is never parsed to derive app state.
- **TypeScript**, typed keys, `as const satisfies` (or equivalent) so a missing or misspelt key is a compile error. Crawford is the only editor; non-developer friendliness is not a goal.
- **Scope of "text": any string a user can see or hear** (screen readers included), unless it is a value the app computes. Labels, headings, intro prose, button text, placeholders, radio/preset option labels, status/badge text, accessible-name templates, the LFO shape words, the Header's Mute/Volume strings, dynamic-label templates (`"Delete {company}"` and the like — the template is content, the interpolated value is data). Unit suffixes (`Hz`, `s`, `%`) count as text. Numeric formatting and seeded names (robot names, attenuation styles) are data, not content.
- **Hardcoded strings become a list, not a guess.** Every string found in a component, primitive or config that is not already a `loreLabel`/`humanLabel`/`label`/intro field is collected into a table (where it is, what it says, what surface it appears on) for Crawford to assign copy to. Nothing hardcoded is silently promoted to content with its existing wording.
- **Placeholders are cleaned up in this pass.** The six `[c]` strings and every ALL CAPS legacy heading get real copy, written to `docs/reference/copy-tone-guide.md`'s Lore/Human rules, and go in the same review list above so Crawford signs off on the wording.
- **One label vocabulary.** `label` on radio options and sector presets becomes `humanLabel`, with `loreLabel` beside it where a lore variant exists.
- **A guard** that keeps the drift from coming back: a test asserting no literal `loreLabel`/`humanLabel`/intro string appears under `src/components`, `src/data` or the primitives, and that every content key is referenced at least once.

## Style / constraint

- **Primitives stay untouched.** `DualLabel` and every control keep reading `loreLabel`/`humanLabel` off their schema (`ControlSchemaBase`, `src/types/controls.ts`; `docs/COMPONENT_LIBRARY.md`). Config files stop typing the strings and spread them in from the content module via a small helper — the component library's contract does not change.
- **Follows the `ROBOT_SECTIONS_CONFIG` precedent** (`docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md`): one shared table replacing hand-duplicated copies, consumers supplying only their own wiring. This pass does for copy what that pass did for section ids.
- **Casing stays a content decision** (`COMPONENT_LIBRARY.md`'s "casing is a content decision, not a CSS one") — no `text-transform` is introduced to paper over the ALL CAPS cleanup; the strings themselves change.
- **Intro prose may still contain the limited HTML `IntroPanel` already sanitises** (DOMPurify); moving it changes where it lives, not its format.
- Every `[c]` removal and heading rewrite is a wording change Crawford reviews; the mechanical migration of existing, already-approved copy is not.

## Out of scope

- **Localisation / i18n.** One language, one editor. The content module should not pretend to be a translation framework.
- **The `docId` doc-content store** stubbed on `NavTreeNodeSchema` — a separate, never-designed feature; this pass does not build it (the stub can be removed or left, spec's call).
- **A generated reference table.** Considered (a script emitting `text-content-tables.md` from the module) and rejected in favour of retiring the doc; cheap to add later if a review view is wanted.
- **Changing any approved wording** from the 2026-09-29 copy pass, beyond the placeholders and headings named above.
- **Restructuring `src/data/*Config.ts` beyond removing copy from it** — bounds, options and ids stay where they are.

## Known implementation note (not yet spec'd)

- The key scheme itself (shape, nesting, naming rules) is the first thing the spec must settle, before any migration task — everything else keys off it.
- Where a concept legitimately needs more than one lore variant per surface (the 2026-09-29 pass gave some nav nodes and panel headings different lore phrases on purpose), the spec decides whether that is a second field on the one entry (`lore` vs `heading`) or a wording consolidation Crawford approves. One entry per concept is the rule; the number of fields on it is open.
- The hardcoded-string inventory should be produced early (a discovery task), since its size decides how many review rounds the placeholder/heading cleanup needs.
- `Lfo.tsx`'s `SHAPE_OPTIONS`, the sector presets' `label`, and the accessible-name templates in `accessibleName.ts`/`Stepper.tsx` are the known cases where text sits inside a primitive or a non-config module — the spec should enumerate the rest from the inventory rather than assume these are all of them.
