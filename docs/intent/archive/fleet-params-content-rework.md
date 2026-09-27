# Intent: Fleet Params Content Rework

Confirmed via `/interview-me`. Applies to `FleetParamsContent.tsx` and, indirectly, `AudioRigDrawer.tsx`'s `AudioRigEffectPanel` (rendered by it) and `AudioRigDrawer` (Automatic Intensity's fallback content).

## Outcome

Restructure the Fleet Params view into one uniform shape:

- The whole Fleet Params view is wrapped in a single, always-open (non-collapsible) outer panel, colored via `getTraitColorStyle('spectral')` — matching `fleetParams`'s own trait in `navTreeConfig.ts`. This replaces the current bare `<div>` wrapper.
- Immediately inside that outer panel: one `IntroPanel` for the whole section (`loreLabel="Fleet Params LORE TITLE"`, trait `'spectral'`) — already present, kept as-is apart from the placeholder text convention below.
- Below that, exactly 4 accordions, one per group (Pacing, EQ & Filters, Time & Space, Output) — using `FLEET_PARAMS_GROUPS`' existing `nodeId`/`humanLabel`/trait (`composition`/`spectral`/`timeSpace`/`output`, matching `navTreeConfig.ts` and `AUDIO_RIG_EFFECT_TRAIT`). Each accordion is a real `AccordionContainer` (currently only Pacing is; EQ & Filters/Time & Space/Output are just a heading `<div>` today) with independent open/closed state via `useAccordionOpenState`, same as today's Pacing/per-leaf accordions.
- Each group accordion, colored by its own trait, contains when open:
  1. One `IntroPanel` for that group (`loreLabel="${Group Title} LORE TITLE"`, that group's trait).
  2. The group's leaves, rendered as plain stacked sections (each still wrapped in its own `sectionAnchorRef` div for scrollspy) — **not** individually wrapped in their own `AccordionContainer` anymore. This removes the per-leaf accordion today used by EQ & Filters/Time & Space/Output's 7 leaves, and matches how Pacing's Tempo/Automatic Intensity already render as plain anchors (no leaf-level accordion) inside its one shared accordion.
- All 4 groups end up structurally identical: accordion → group IntroPanel → N leaf sections, each leaf just rendering its existing `AudioRigEffectPanel` (or, for Automatic Intensity, `AudioRigDrawer`'s existing content) unchanged.
- Leaf content itself (every param control, LFO group, compressor's special-cased layout, etc.) is untouched — only the accordion/IntroPanel nesting around it changes. Leaves no longer carry their own per-effect trait color wrapper for the *purpose of an accordion frame* (there is no leaf accordion left to color) — `AudioRigEffectPanel`'s own `getTraitColorStyle(AUDIO_RIG_EFFECT_TRAIT[effectKey])` wrapper div stays as-is, since it already colors the leaf's own content block independent of any accordion.
- Placeholder lore/human copy for every new/moved `IntroPanel` follows the convention `"${Section Title} LORE TITLE"` for `loreLabel`, with lorem-ipsum-style placeholder body text for `loreDescription`/`humanDescription` — real copy is a future pass.

## User

You (Crawford), reworking your own in-progress rewrite of this section after an earlier attempt at the same restructuring didn't come together.

## Why now

The prior attempt left Pacing as the only group with the intended shape (one accordion, no leaf-level accordions, IntroPanel at the top) while EQ & Filters/Time & Space/Output are still a heading + a flat list of individually-accordioned leaves. The four groups need to converge on one consistent structure, using Pacing's intended shape (not its current code, which itself needs cleanup) as the template.

## Success

- `FleetParamsContent` renders: outer spectral-traited panel → section `IntroPanel` → 4 accordions (Pacing/EQ & Filters/Time & Space/Output), each independently open/closeable, each colored by its own trait.
- Each open accordion shows its own `IntroPanel` (placeholder `"${Group Title} LORE TITLE"` copy) followed by its leaves as plain sections — no leaf has its own accordion.
- Scrollspy/tree-highlighting behavior (`useSectionObserver`, `setSelectedFleetParamsEffect`) continues to work unchanged for both group-level and leaf-level anchors.
- All existing leaf functionality (params, LFO groups/targeting, drift sliders, compressor's Decay Mode radio) works exactly as before — this is a pure container/wrapping change.

## Constraint

- Respects existing guardrails: no accordions nested inside another accordion's own accordion (group accordions are the only accordion level now — leaves are plain content), state stays in Zustand/local `useState` only where it already does (`useAccordionOpenState`, `useSectionObserver`), no GSAP/audio engine changes.
- No new `Trait` values — reuse `spectral`/`timeSpace`/`output`/`composition` exactly as already assigned in `navTreeConfig.ts`/`AUDIO_RIG_EFFECT_TRAIT`.
- Placeholder lore copy must be easy to grep/find later (`"${Section Title} LORE TITLE"`).

## Out of scope

- Real lore/human copy for any `IntroPanel` — placeholders only.
- Styling the LFO target-selection state (`AudioRigLfoGroup`'s `isTargeted` row class) — noted separately, not part of this pass.
- Any change to leaf-level control logic, param schemas, or `audioRigConfig.ts`.
- Implementation itself — this doc is the confirmed intent; next step (task breakdown / implementation) is a separate follow-up Crawford will direct.
