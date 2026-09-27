# Intent: Company Section Enhancements

Confirmed via `/interview-me`, 2026-09-13. Related to [Roadmap Phase 16](../todo/roadmap.md#16-redesign-company-crud-area) (Redesign: Company CRUD Area) — not that phase itself (which is still "not yet interviewed/specced" and covers a fuller visual/UX pass), but a set of four scoped, independently-landable changes to the same `CompanyManager.tsx`/`RobotsTab.tsx` area, gathered in one interview because they were requested together. Builds on Phase 15.2 (Robot Cards, shipped on `layout/robot-card-cleanup`) and Phase 14 (Color Scheme, on `main`).

## Outcome

Four changes, independently landable in any order (each has its own file surface):

1. **CRUD accordion.** `CompanyCrudControls` (Create/Rename/Delete) wraps in an `AccordionContainer`, default collapsed, manually toggled only — no auto-open on company selection. `CompanyButtonRow` stays outside it, always visible, directly above.
2. **Per-company identity color.** `Company` gains a new `color: string` field (a single hex, same shape as `robot.identityColor` — not a `TRAIT_COLORS`-style `[a, b]` pair), picked from the existing `ROBOT_IDENTITY_COLOR_NAMES` 18-hue list (not the full `ACCENT_COLORS` map, which also holds black/white/darkGray):
   - **Spawn-time companies** (`spawnSystem.ts`'s `INITIAL_COMPANIES_MIN`–`MAX` loop): a new `generateCompanyIdentityColor`, seeded via `getSeededVal`, mirroring `generateRobotIdentityColor` exactly (same dataId-string/offset/clamped-index shape, new dataId e.g. `'company.identityColor'`). No collision-avoidance against sibling companies generated in the same locale pass — accepted as low-risk given `INITIAL_COMPANIES_MIN`/`MAX`'s small counts, and a reroll-on-collision mechanism for a seeded value doesn't exist anywhere in this codebase today.
   - **User-created companies** (`CompanyCrudControls.handleCreate`): `Math.random()`, matching the file's own existing `suggestCompanyName` precedent (a live UI convenience roll, not reproducible world generation). Re-rolls against every other company's `color` already in the locale's `companies` list until it lands on one not currently in use — cheap and guaranteed at `MAX_COMPANIES = 6` against 18 hues.
3. **Per-option `RadioButton` color.** `RadioButton`'s schema gains an optional per-option `color`, applied to that specific option's `CabinetBox` — a primitive-level change (`docs/COMPONENT_LIBRARY.md`-documented contract), not a one-off fork. Every option carrying a `color` shows a rest-state hint of its own color (replacing the ambient ancestor ACCENT inherited today) plus a full accent-tinted front face when selected — both states simultaneously visible across all options in the group, not just the active one. Two consumers populate it:
   - `RobotSelectionCard`'s company-assignment `RadioButton` (the bottom region) — each company option carries that company's `color`; the `Freelance` option omits `color` and keeps today's ambient fallback (the robot's own `identityColor`, inherited from the card's outer `<li>` style).
   - `CompanyButtonRow`'s own per-company buttons — same per-company `color`; `None`/`All` omit `color` and keep today's ambient fallback (the `company` trait pair via `CompanyManager`'s root style).
4. **Selection-driven robot list sort.** Selecting a specific company in `CompanyButtonRow` (`uiStore.selectedCompanyId`, with `allRobotsSelected` false) reorders `RobotsTab`'s rendered robot list into a stable two-block partition: every robot **not** in that company first (original roster order preserved within the block), that company's members last (original roster order preserved within their block too). Selecting `None` or `All` reverts to plain, unpartitioned roster order — the rule only has meaning once one specific company is the active selection.

## User

Crawford (solo dev), managing companies and browsing/assigning robots from the Robots hub tile.

## Why now

Opportunistic follow-on to Phase 15.2 while already working in this area, ahead of (and narrower in scope than) the still-unspecced full Phase 16 redesign.

## Success

- The CRUD accordion starts collapsed on every load; toggling is the only way it opens or closes.
- Every company in a locale — however it was created — has a `color` that's visually distinct from every other company that currently exists in that locale (user-created path only; spawn-time siblings are not guaranteed distinct).
- Every company-representing option box, in both `RobotSelectionCard`'s company row and `CompanyButtonRow`, is visibly tinted with that company's own color at rest, and more strongly tinted when it's the selected option — simultaneously, across all options in the group at once.
- Selecting a company in `CompanyButtonRow` visibly moves that company's robot cards to the bottom of the list above it, without otherwise reordering either block; selecting `None`/`All` restores original roster order.
- `npm run build:types`, `npm run lint`, and `npm test` all pass clean.

## Constraint

- `Company.color` stays a plain JSON-serializable string field — no runtime object, consistent with the app's Zustand-state rules.
- Spawn-time color generation stays fully reproducible per-seed (`getSeededVal`, mirroring the robot identity-color precedent) — no `Math.random()` on that path, per `PROCEDURAL_GENERATION.md`'s seeded-determinism rule.
- `RadioButton`'s per-option `color` is additive/optional — every existing consumer that doesn't set it (Audio Setting, Decay Mode, per-layer Type, and the `Freelance`/`None`/`All` options here) keeps its exact current ambient-accent behavior, unchanged.
- The robot-list sort is a pure render-order transform in `RobotsTab` — it does not mutate roster order in the store, and does not touch `RobotSelectionCard`'s own per-card company-assignment `RadioButton` or its `onChange` wiring.

## Out of scope

- `CompanyOptionsSection`'s own domain-trait coloring (output/composition/timeSpace/spectral per accordion) — untouched, unrelated color system.
- `RobotSelectionCard`'s top region (avatar/meta/battery) — keeps the robot's own `identityColor` exactly as shipped in 15.2.
- Any reordering triggered by a robot's own individual company-assignment `RadioButton` click — only `CompanyButtonRow`'s selection drives the sort.
- Collision-avoidance for spawn-time sibling companies' colors.
- Any persistence or migration of existing data — no localStorage/session persistence exists yet (Roadmap Phase 20), so there is nothing to backfill.
- The broader Phase 16 visual/UX redesign of `CompanyManager` beyond these four changes.
