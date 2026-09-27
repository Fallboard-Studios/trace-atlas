# Intent: Replace Nav Row Underline with a Colored Cabinet Box

Confirmed via `/interview-me`. Replaces `UnderlineLink`'s flat, translating bar (docs/intent/nav-underline-link-and-auto-expand.md) with a real Oblique Cabinetry pop, matching the tactile hover/focus/press language every other interactive control in the design system already uses.

## Outcome

- The nav panel's two deepest tree levels (mid/leaf under Settings/Fleet Params; section/subsection under Probes/Companies — see docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §5.3 for the exact level list) get a small, textless, animated `CabinetBox` in place of `UnderlineLink`'s flat bar.
- Same position as today: directly beneath the row's plain text label, spanning the full row width (not a small fixed-size square like Toggle's).
- Thin at rest — a first-pass ~4px resting height, same order of magnitude as today's bar (Crawford is a little skeptical this reads well that thin; confirmed try-it-and-see, tunable later in his usual manual visual pass).
- Pops out 4px on hover/focus/press — the same `UNDERLINE_POP_DISTANCE`/timing (`getCabinetPopDuration`/`getCabinetPopEase`) the old bar used, now driving the real oblique wall/front-face pop instead of a single-axis translateY.
- Entirely in the row's resolved trait/accent color — walls, backing, **and** front face all tinted (unlike Button/Toggle's neutral-front default, which only makes sense when the front carries real text) — closest to today's solid-colored bar look.

## Color mechanism

- `CabinetBox` (`CabinetBox.tsx`/`.css`) gains a new **optional** color-override prop. When provided, it overrides `--color-accent` everywhere CabinetBox's own CSS currently hardcodes it (backing tint, top-face, left-face-inner, front face) for that instance only — every existing consumer (Button, Toggle, VoxelTrack) that doesn't pass it is visually unchanged.
- Color **resolution** itself does not change: still `node.trait ?? nearest-ancestor-trait`, computed exactly where it is today, just passed into `CabinetBox` instead of `UnderlineLink`. No new color-resolution logic anywhere.

## File changes

- **Deleted** (not renamed): `UnderlineLink.tsx`, `UnderlineLink.css`, `UnderlineLink.test.tsx` — the row now renders `CabinetBox` directly (with the new color prop) instead of a separate flat-bar wrapper component.
- **Renamed**: `UnderlineLinkNavRow.tsx`/`.css`/`.test.tsx` → box-appropriate naming (proposed: `NavCabinetRow`, `sc-nav-cabinet-row`, timelineKey `cabinet-nav-row-${node.id}` — matching `CabinetBox`'s own `cabinet-toggle-${id}`/`cabinet-button-${id}` convention; exact name open to refinement during implementation).
- Doc references updated to match: `docs/COMPONENT_LIBRARY.md`, `docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md`, `docs/intent/nav-underline-link-and-auto-expand.md` (historical — left as a record of the prior design, cross-referenced from here rather than rewritten).

## User

You (Crawford), continuing the nav panel polish pass on Trace Atlas.

## Why now

The flat, translating bar was a deliberately "genuinely simplified version of CabinetBox's pop language" (see the original underline intent doc) — close enough to prototype the deepest-level row treatment, but not the real thing. This pass closes that gap now that the simplified version has been live long enough to confirm the row-height/level-scoping decisions around it.

## Success

- Hovering/focusing/pressing a mid/leaf/section/subsection row pops a small `CabinetBox` 4px, with the full wall-scale/front-face-offset/glow animation, entirely tinted in that row's resolved trait color.
- Branch-level and entity-level rows are visually and behaviorally unchanged — same full `CabinetBox`+`Button` chrome as today.
- Every other `CabinetBox` consumer (Button, Toggle, VoxelTrack) renders identically to before — the new color prop is additive and optional.

## Constraint

- No new color-resolution logic — reuse the existing `node.trait ?? inherited-ancestor-cascade` exactly as it works today.
- The color-override prop must be opt-in — no existing `CabinetBox` consumer's visual output may change.
- Respects existing guardrails: no interactive UI outside `ScreenViewport`; GSAP timelines still only trigger semantic state changes, never call `AudioEngine` directly (n/a here, but stated for completeness); timelines registered in `timelineMap` and killed on unmount, matching `CabinetBox`'s and the old `UnderlineLink`'s own existing pattern.

## Out of scope

- Any change to how trait/color is resolved or cascaded up the tree.
- Any change to which tree levels get this treatment (still mid/leaf and section/subsection only — see the original underline intent doc).
- Tuning the exact rest-height/pop-distance values beyond a reasonable first pass — confirmed later in Crawford's manual visual review, same as the original underline pass.
- Any other `CabinetBox` consumer adopting the new color prop — this pass only wires it into the nav row use case.
