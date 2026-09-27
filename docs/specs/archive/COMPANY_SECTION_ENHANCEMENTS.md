# Phase Spec: Company Section Enhancements

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/company-section-enhancements.md](../intent/company-section-enhancements.md) (confirmed via `/interview-me`, 2026-09-13). Related to [Roadmap Phase 16](../todo/roadmap.md#16-redesign-company-crud-area) (a fuller, still-unspecced visual/UX redesign of the same area — this spec is narrower, four independently-landable changes only) and builds on Phase 15.2 ([docs/specs/ROBOT_CARDS_REDESIGN.md](ROBOT_CARDS_REDESIGN.md), shipped on `layout/robot-card-cleanup`) and Phase 14 ([docs/specs/COLOR_SCHEME_TRAIT_THEMING.md](COLOR_SCHEME_TRAIT_THEMING.md), on `main`). Four changes, each independently landable — accordion, company color, `RadioButton` per-option color, robot-list sort.

---

## 1. Overview & Claude Explanation

### 1.1 CRUD accordion

`CompanyCrudControls.tsx` today returns a bare `<div className="company-crud-controls">` (Create row, Rename input, Delete button) rendered directly in `CompanyManager.tsx`, always visible. This phase wraps that same markup in one `AccordionContainer` (`src/components/ui/controls/AccordionContainer.tsx`, Roadmap 11.1.7), collapsed by default, manually toggled only — no auto-open on company selection. `CompanyButtonRow` is untouched and stays outside the accordion, always visible above it (`CompanyManager.tsx`'s own render order — `CompanyButtonRow`, then `CompanyCrudControls`, then `CompanyOptionsSection` — needs no edit).

A new static schema in `companyConfig.ts`, matching the file's existing `AccordionSchema` precedent shape (e.g. `VOLUME_ACCORDION_SCHEMA` in `robotOptionsConfig.ts`):

```typescript
export const COMPANY_CRUD_ACCORDION_SCHEMA: AccordionSchema = {
  id: 'company.crud',
  type: 'accordion',
  loreLabel: 'UNIT COMMISSIONING',
  humanLabel: 'Manage Companies',
};
```

No `style` prop passed at the call site — `CompanyCrudControls` only ever renders inside `CompanyManager`'s own `getTraitColorStyle('company')`-scoped root ([CompanyManager.tsx:21](../../src/components/company/CompanyManager.tsx#L21)), so the accordion's `CabinetBox`es inherit the `company` trait color via ordinary CSS cascade with no explicit wiring — unlike `AudioSettingSection`'s own `style` prop, which exists because that component is genuinely reused across two different trait contexts (`RobotOptionsTab` vs. `CompanyOptionsSection`). `defaultOpen` is omitted, which already defaults to `false` ([AccordionContainer.tsx:62](../../src/components/ui/controls/AccordionContainer.tsx#L62)) — no new prop needed for "collapsed by default."

### 1.2 Per-company identity color

`Company` (`src/types/Company.ts`) gains a new required field:

```typescript
export interface Company {
  id: string;
  name: string;
  color: string; // NEW — a single hex, e.g. '#4f6d7a'. Same shape as Robot.identityColor
                  // (src/types/Robot.ts:118), not a TRAIT_COLORS-style [a, b] pair.
  robotIds: string[];
  lastEditedOptions?: CompanyOptionsSnapshot;
}
```

Required, not optional, matching `Robot.identityColor`'s own precedent — both of this codebase's real company-creation call sites (below) always set it, so an `undefined` `color` never occurs by construction; leaving it optional would only invite a silent "falls back to ambient" case that undercuts the whole point of this phase (every company visually distinct). See §7 item 1 for the test-fixture cost of making it required.

Two creation call sites, two different randomness sources — same split this codebase already uses for company **names** (`generateCompanyName`, seeded, vs. `suggestCompanyName`, `Math.random()`-fed):

**Spawn-time** (`src/systems/spawnSystem.ts`) — a new function alongside the existing `generateRobotIdentityColor` ([spawnSystem.ts:132-137](../../src/systems/spawnSystem.ts#L132-L137)), mirroring it exactly:

```typescript
/** Company identity color — seeded, mirrors generateRobotIdentityColor exactly (same
 *  clamped-index-into-ROBOT_IDENTITY_COLOR_NAMES shape), its own dataId so it doesn't collide
 *  with the robot one's seeded stream, and offset = this company's own index (c) in the spawn
 *  loop below, matching company.size/company.member's own per-c seeding
 *  (spawnSystem.ts:580,588). No collision-avoidance against sibling companies generated in the
 *  same locale pass — see spec §7 item 2. */
function generateCompanyIdentityColor(noiseMap: NoiseFunction2D, offset: number): string {
  const index = Math.min(
    ROBOT_IDENTITY_COLOR_NAMES.length - 1,
    Math.floor(getSeededVal(noiseMap, 'company.identityColor', offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length)),
  );
  return ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[index]];
}
```

Wired into the existing company-spawn loop ([spawnSystem.ts:595-600](../../src/systems/spawnSystem.ts#L595-L600)), same `noiseMap ? f(noiseMap, …) : f(fallbackFn, …)` shape every other seeded field in that object literal already uses:

```typescript
const company: Company = {
  id: noiseMap ? generateCompanyId(noiseMap, c) : `company-${localeId}-${c}`,
  name: noiseMap ? generateCompanyName(noiseMap, c) : `Company ${c}`,
  color: noiseMap
    ? generateCompanyIdentityColor(noiseMap, c)
    : generateCompanyIdentityColor((_x: number, _y: number) => 0 as number, c),
  robotIds: memberIds,
};
```

**User-created** (`src/components/company/CompanyCrudControls.tsx`) — a new local helper alongside the file's existing `suggestCompanyName`:

```typescript
/** A random, currently-unused company color — re-rolls against every color already in use by
 *  an existing company in this locale (spec §1.2), the same Math.random()-for-a-live-UI-roll
 *  precedent suggestCompanyName above already establishes (a live UI convenience roll, not
 *  reproducible world generation). Bounded at ROBOT_IDENTITY_COLOR_NAMES.length attempts — never
 *  an unbounded loop — since MAX_COMPANIES (6) is always smaller than the 18-hue palette; the
 *  fallback return only matters if that invariant is ever broken. */
function pickRandomCompanyColor(existingColors: string[]): string {
  const used = new Set(existingColors);
  for (let attempt = 0; attempt < ROBOT_IDENTITY_COLOR_NAMES.length; attempt++) {
    const name = ROBOT_IDENTITY_COLOR_NAMES[Math.floor(Math.random() * ROBOT_IDENTITY_COLOR_NAMES.length)];
    if (!used.has(ACCENT_COLORS[name])) return ACCENT_COLORS[name];
  }
  return ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[Math.floor(Math.random() * ROBOT_IDENTITY_COLOR_NAMES.length)]];
}
```

`handleCreate` ([CompanyCrudControls.tsx:59-63](../../src/components/company/CompanyCrudControls.tsx#L59-L63)) passes the existing `companies` list already in scope:

```typescript
const handleCreate = () => {
  const color = pickRandomCompanyColor(companies.map((c) => c.color));
  const company: Company = { id: crypto.randomUUID(), name: createNameDraft.trim(), color, robotIds: [] };
  useLocaleStore.getState().addCompany(localeId, company);
  setCreateNameDraft(suggestCompanyName());
};
```

New imports in both files: `ROBOT_IDENTITY_COLOR_NAMES`, `ACCENT_COLORS` from `@/constants/accentColors`.

### 1.3 `RadioButton` per-option color

`RadioButton` ([RadioButton.tsx](../../src/components/ui/controls/RadioButton.tsx)) has no per-option color today — every option's `CabinetBox` reads the same ambient CSS custom properties (`--color-accent-a/-b/--color-accent/--color-accent-gradient`) from whichever ancestor last set them via `buildAccentStyle` (`src/utils/traitColors.ts`). Two rules already consume those ambient properties, both usable unchanged for this feature:

- `CabinetBox.css` — the rest-state pop's own backing/walls/glow are already accent-colored (`var(--color-accent-gradient)`, `var(--color-accent)`), regardless of selection. This is the existing "hint of the option's own accent color before it's ever selected" mechanism RadioButton.tsx's own doc comment already describes ([RadioButton.tsx:47-50](../../src/components/ui/controls/RadioButton.tsx#L47-L50)).
- `RadioButton.css` — only the selected option's front face additionally swaps to the gradient: `.sc-radio-button__item[data-state='on'] .sc-cabinet-box__front { background: var(--color-accent-gradient); }` ([RadioButton.css:50-52](../../src/components/ui/controls/RadioButton.css#L50-L52)).

Because both rules read CSS custom properties (not a prop passed through React), scoping those properties to one specific option is enough to make that option show its own color at rest **and** a stronger tint when selected — with **zero new CSS**. This spec adds an optional per-option `color` to the schema and applies it as a per-item inline style, reusing `getRobotColorStyle` (`src/utils/traitColors.ts:181-183`) exactly as `RobotSelectionCard`'s own `<li>` already does for a single hex:

```typescript
// src/types/controls.ts:88-91 — MODIFIED
export interface RadioButtonSchema extends ControlSchemaBase {
  type: 'radio';
  options: { value: string; label: string; color?: string }[]; // color: NEW, optional
}
```

```tsx
// src/components/ui/controls/RadioButton.tsx:129-148 — MODIFIED (one new prop on ToggleGroup.Item)
{schema.options.map((option) => (
  <ToggleGroup.Item
    key={option.value}
    className="sc-radio-button__item"
    value={option.value}
    aria-label={option.label}
    style={option.color ? getRobotColorStyle(option.color) : undefined}
    onMouseEnter={() => setHoveredValue(option.value)}
    onMouseLeave={() => setHoveredValue((current) => (current === option.value ? null : current))}
  >
    <CabinetBox
      popped={option.value === value || (!disabled && option.value === hoveredValue) ? true : CABINET_REST_POP}
      timelineKey={`cabinet-radio-${schema.id}-${instanceId}-${option.value}`}
      {...(boxSize !== undefined ? { boxHeight: boxSize, frontWidth: boxSize, frontHeight: boxSize } : {})}
    >
      {option.label}
    </CabinetBox>
  </ToggleGroup.Item>
))}
```

New import: `getRobotColorStyle` from `@/utils/traitColors`. An option with no `color` gets `style={undefined}` — identical DOM output to today, so every existing consumer (Audio Setting, Decay Mode, per-layer Type, Header's nav group, …) is unaffected.

Both company-config schema builders populate `color` for real companies, and omit it for the non-company sentinel options (which keep today's ambient fallback exactly as confirmed in the intent doc):

```typescript
// src/data/companyConfig.ts — buildCompanyAssignmentSchema, MODIFIED
export function buildCompanyAssignmentSchema(companies: Company[]): RadioButtonSchema {
  return {
    id: 'company.assign',
    type: 'radio',
    loreLabel: 'UNIT AFFILIATION',
    humanLabel: 'Company',
    options: [
      { value: FREELANCE_VALUE, label: 'Freelance' }, // no color — ambient fallback (robot's own identityColor)
      ...companies.map((c) => ({ value: c.id, label: c.name, color: c.color })),
    ],
  };
}

// buildCompanyButtonRowSchema, MODIFIED
export function buildCompanyButtonRowSchema(companies: Company[]): RadioButtonSchema {
  return {
    id: 'company.buttonRow',
    type: 'radio',
    loreLabel: 'UNIT ROSTER',
    humanLabel: 'Companies',
    options: [
      { value: NONE_VALUE, label: 'None' }, // no color — ambient fallback (CompanyManager's 'company' trait)
      { value: ALL_VALUE, label: 'All' },   // no color — ambient fallback
      ...companies.map((c) => ({ value: c.id, label: c.name, color: c.color })),
    ],
  };
}
```

No change to either function's own call sites (`RobotSelectionCard.tsx`, `RobotDisplaySection.tsx`, `CompanyButtonRow.tsx`) — they already pass the full `companies` array with `color` on it once §1.2 ships.

### 1.4 Selection-driven robot list sort

`RobotsTab.tsx` ([RobotsTab.tsx](../../src/components/panels/screen/console/RobotsTab.tsx)) renders `robots.map(...)` directly from the store in roster order. This phase adds a stable two-block partition, applied only when `uiStore.selectedCompanyId` is a real company id:

```typescript
// src/components/panels/screen/console/RobotsTab.tsx — NEW named export, same file
/** Stable two-block partition: every robot NOT in `companyId` first (original roster order
 *  preserved within the block), that company's members last (original roster order preserved
 *  within their own block too) — spec §1.4. `companyId === null` (both "None" and "All", which
 *  are mutually exclusive with a real selectedCompanyId per uiStore.ts's own selectCompany/
 *  selectAllRobots — see spec §1.5) returns `robots` completely unsorted. Exported for direct
 *  unit testing; RobotsTab is its only real consumer. */
export function sortRobotsByCompanyFocus(robots: Robot[], companyId: string | null): Robot[] {
  if (!companyId) return robots;
  const others = robots.filter((r) => r.companyId !== companyId);
  const members = robots.filter((r) => r.companyId === companyId);
  return [...others, ...members];
}
```

```tsx
// RobotsTab() — MODIFIED
export function RobotsTab() {
  const localeId = getActiveLocaleId();
  const robots = useLocaleStore((s) => s.locales[localeId]?.robots ?? []);
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const sortedRobots = sortRobotsByCompanyFocus(robots, selectedCompanyId);

  return (
    <div className="robots-tab" role="region" aria-label="Robots">
      <ul className="robots-tab__list">
        {sortedRobots.map((robot) => (
          <RobotSelectionCard key={robot.id} robot={robot} />
        ))}
      </ul>
      <CompanyManager />
    </div>
  );
}
```

New imports: `useUIStore` from `@/stores/uiStore`. Pure render-order transform only — no mutation of `useLocaleStore`'s own `robots` array, no change to `RobotSelectionCard`'s own props or its company-assignment `RadioButton`.

### 1.5 Judgment calls made while translating intent into a concrete design

Per this skill's "surface assumptions immediately" step — none of these were asked during `/interview-me`:

1. **`sortRobotsByCompanyFocus` reads only `selectedCompanyId`, never `allRobotsSelected`.** This relies on `uiStore.ts`'s own invariant that the two are mutually exclusive (`selectCompany` always clears `allRobotsSelected`; `selectAllRobots` always clears `selectedCompanyId` — [uiStore.ts:77-78](../../src/stores/uiStore.ts#L77-L78)) rather than re-checking `!allRobotsSelected` locally. Matches `CompanyButtonRow.tsx`'s own existing `value = allRobotsSelected ? ALL_VALUE : (selectedCompanyId ?? NONE_VALUE)` line, which makes the identical assumption. If that invariant is ever relaxed elsewhere, this needs a second look.
2. **`generateCompanyIdentityColor`/`pickRandomCompanyColor` live in their consumer files** (`spawnSystem.ts`, `CompanyCrudControls.tsx` respectively), not a shared `utils/companyColor.ts`. Both have exactly one real call site, unlike `isRobotAudible` (Phase 15.2), which was extracted specifically because it needed two independent consumers (`AudioEngine.ts` and `RobotSelectionCard.tsx`). No such second consumer exists here.
3. **`COMPANY_CRUD_ACCORDION_SCHEMA`'s lore/human labels are a best guess**, same as every other draft label added by a recent phase (e.g. `AUDIBILITY_LABELS` in the 15.2 spec) — flagged for Crawford's review, not treated as final.
4. **`Company.color` is required, not optional** — see §7 item 1 for the tradeoff this creates against existing test fixtures.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── Company.ts                    # MODIFIED — §1.2, new required `color: string` field
│   ├── Company.test.ts               # MODIFIED — every Company literal gains `color`
│   └── controls.ts                   # MODIFIED — §1.3, RadioButtonSchema.options gains optional `color`
├── components/
│   ├── company/
│   │   ├── CompanyCrudControls.tsx      # MODIFIED — §1.1 (AccordionContainer wrap), §1.2 (pickRandomCompanyColor)
│   │   ├── CompanyCrudControls.test.tsx # MODIFIED — see §5
│   │   ├── CompanyManager.tsx           # NOT MODIFIED — render order/composition unchanged, see §2 note below
│   │   ├── CompanyButtonRow.test.tsx    # MODIFIED — new color-prop assertions, see §5
│   │   └── CompanyOptionsSection.tsx    # NOT MODIFIED — out of scope, §1.5/intent doc
│   ├── ui/controls/
│   │   ├── RadioButton.tsx           # MODIFIED — §1.3, per-option `style`
│   │   └── RadioButton.test.tsx      # MODIFIED — see §5
│   ├── selection/
│   │   └── RobotSelectionCard.test.tsx  # MODIFIED — new color-prop assertions, see §5
│   └── panels/screen/console/
│       ├── RobotsTab.tsx             # MODIFIED — §1.4, sortRobotsByCompanyFocus + its call
│       └── RobotsTab.test.tsx        # MODIFIED — see §5
├── data/
│   ├── companyConfig.ts              # MODIFIED — §1.1 (COMPANY_CRUD_ACCORDION_SCHEMA), §1.3 (color on both builders)
│   └── companyConfig.test.ts         # MODIFIED — see §5
└── systems/
    ├── spawnSystem.ts                # MODIFIED — §1.2, generateCompanyIdentityColor + company-loop wiring
    └── spawnSystem.test.ts           # MODIFIED — see §5
```

**Explicitly not touched, and why:**

- `CompanyManager.tsx` — composition/order unchanged; `CompanyCrudControls` owns its own accordion wrapping internally, so the parent needs no edit.
- `CompanyOptionsSection.tsx` and its own 4 domain-trait accordions — separate color system (output/composition/timeSpace/spectral), untouched per the intent doc's own Out of Scope.
- `RobotSelectionCard.tsx`, `RobotDisplaySection.tsx` — both already call `buildCompanyAssignmentSchema(companies)` and render the result through unmodified `RadioButton` props; once §1.2/§1.3 ship, their existing code paths automatically carry `color` through with no call-site change.
- `src/utils/traitColors.ts` — reused completely as-is (`getRobotColorStyle`); no change to its own contract.
- `src/constants/accentColors.ts` — reused as-is (`ACCENT_COLORS`, `ROBOT_IDENTITY_COLOR_NAMES`); no new hues, no reordering (reordering `ROBOT_IDENTITY_COLOR_NAMES` would break existing seeded robot colors — out of scope and not needed here).
- `CabinetBox.tsx`/`.css`, `RadioButton.css` — no changes; §1.3's whole point is that the existing CSS already does the right thing once the right custom properties are scoped per-option.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`Company.color` stays a plain string** — no runtime object, no `[a, b]` pair — consistent with the app's Zustand-state JSON-serializability rule (`CLAUDE.md`).
* **Spawn-time color generation stays fully seeded/reproducible** — `generateCompanyIdentityColor` must use `getSeededVal`, never `Math.random()`, on that path. `Math.random()` is confined to `CompanyCrudControls.tsx`'s own user-triggered creation flow, matching `suggestCompanyName`'s existing precedent exactly.
* ~~No collision-avoidance among spawn-time sibling companies — confirmed out of scope in the intent doc; do not add a seeded-reroll mechanism for this.~~ **Superseded, 2026-09-15** — [docs/specs/ROBOT_SELECTION_FILTER_PANEL_POLISH.md](ROBOT_SELECTION_FILTER_PANEL_POLISH.md) §1.4 reverses this decision: `generateCompanyIdentityColor` now retries (seeded, bounded) against colors already assigned earlier in the same spawn pass, closing the gap this line used to keep open on purpose.
* **`RadioButtonSchema.options[].color` is additive and optional.** Every existing `RadioButton` consumer that doesn't set it must render byte-for-byte identical DOM/CSS to today — no visual regression on Audio Setting, Decay Mode, per-layer Type, Header's nav group, or any other existing schema.
* **No new CSS rules in `RadioButton.css`/`CabinetBox.css`.** §1.3 is deliberately scoped to work through the existing ambient-CSS-custom-property mechanism; if implementation finds that insufficient, stop and revisit this spec rather than improvising new selectors.
* **`AccordionContainer`'s own GSAP timeline/animation behavior is reused unmodified** — `CompanyCrudControls` passes no new props affecting animation (no `skipMountAnimation`, no custom `defaultOpen`). No new `timelineMap` key beyond what `AccordionContainer` already registers internally (`accordion-${schema.id}`, i.e. `accordion-company.crud`).
* **`sortRobotsByCompanyFocus` is a pure function — no store mutation, no side effects.** It must not reorder `useLocaleStore`'s own `robots` array; only `RobotsTab`'s own render output changes.
* **No `setTimeout`/`setInterval`/`requestAnimationFrame`** anywhere in this phase — every change here is either static data (color), a pure derived-value transform (sort), or reuses `AccordionContainer`'s existing GSAP-timeline machinery unmodified.

---

## 4. Code Style & Architecture Conventions

All four changes' full code shapes are given inline in §1.1–§1.4 above (Company type, `spawnSystem.ts`'s `generateCompanyIdentityColor` + spawn-loop wiring, `CompanyCrudControls.tsx`'s `pickRandomCompanyColor` + `handleCreate`, `RadioButtonSchema`'s `color` field, `RadioButton.tsx`'s per-item `style`, both `companyConfig.ts` schema builders, and `RobotsTab.tsx`'s `sortRobotsByCompanyFocus` + its call) — not repeated here.

**Naming conventions:** `generateCompanyIdentityColor` mirrors `generateRobotIdentityColor`'s exact name shape; `pickRandomCompanyColor` reads as a live UI action (matches `suggestCompanyName`'s own naming register in the same file); `sortRobotsByCompanyFocus` names the *reason* for the sort (the current focus company), not just the mechanism ("partition"), matching this codebase's general preference for intent-revealing names over implementation-revealing ones.

**Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`Company.test.ts` (modified):** every existing `Company` object literal (both in the `describe('Company', …)` block) gains a `color` value; add one new assertion that `color` is required (a TypeScript-level check — e.g. a `// @ts-expect-error` case omitting it — is the idiomatic way to assert this at the type level, matching how other required-field additions in this codebase have been tested previously; confirm the exact prior-art pattern before writing).
* **`controls.ts` / `RadioButtonSchema`:** no dedicated test file for the type itself (matches existing convention — `ControlSchema` variants aren't unit-tested as bare types); covered indirectly by `RadioButton.test.tsx` and `companyConfig.test.ts` below.
* **`RadioButton.test.tsx` (modified):**
  - New: an option with `color` set renders that color's hex value inside the CSS custom properties on its own `ToggleGroup.Item` (assert via computed/inline `style`, e.g. `getByRole('radio', { name: … }).style.getPropertyValue('--color-accent-a')`), while a sibling option without `color` has no such inline override.
  - New: existing schemas with no `color` on any option (e.g. reuse an existing test fixture schema) render identically to before — no new inline `style` attribute appears at all when no option sets `color`.
  - Every existing test in this file must keep passing with zero changes to their own assertions (behavior-preserving addition).
* **`companyConfig.test.ts` (modified):**
  - `buildCompanyAssignmentSchema`: new assertion that each company option carries `color: company.color`, and the `Freelance` option has no `color` key (or `color: undefined`).
  - `buildCompanyButtonRowSchema`: same shape — each company option carries `color`; `None`/`All` do not.
  - New `describe('COMPANY_CRUD_ACCORDION_SCHEMA')` block, matching this file's existing per-constant test-block convention: non-empty `loreLabel`/`humanLabel`, `type: 'accordion'`.
* **`CompanyCrudControls.test.tsx` (modified):**
  - New: the CRUD controls render inside a collapsed accordion by default — `Create`/`Rename`/`Delete` are not visible/queryable until the accordion trigger is activated (matching this codebase's existing `AccordionContainer` test convention, e.g. `AudioSettingSection.test.tsx`, for asserting collapsed-by-default content).
  - New: `handleCreate` assigns the new company a `color` not already present in the existing `companies` fixture list passed to the component — construct a fixture with several existing colors, mock `Math.random()`'s sequence if this codebase's existing `suggestCompanyName` tests already established a mocking pattern for it (check `CompanyCrudControls.test.tsx`'s current `Math.random()` handling, if any, before writing this — reuse rather than inventing a new approach).
  - Every existing Create/Rename/Delete test must keep passing (unwrapped only by the accordion now needing to be open first — update setup accordingly, don't change the assertions' own intent).
* **`CompanyButtonRow.test.tsx` (modified):** new assertion that each rendered company button carries that company's own `color`; `None`/`All` do not.
* **`RobotSelectionCard.test.tsx` (modified):** new assertion that the company-assignment `RadioButton`'s options carry each company's `color` (via the schema passed to `RadioButton`, or via the rendered option's own inline style — whichever this file's existing `RadioButton`-schema assertions already prefer).
* **`spawnSystem.test.ts` (modified):**
  - New: `generateCompanyIdentityColor` returns a value from `ACCENT_COLORS`' own value set (same style of assertion `generateRobotIdentityColor`'s own existing test almost certainly already uses — mirror it).
  - New: given the same seed/noiseMap, spawn-time company generation is reproducible — two runs against the same seed produce the same `color` per company (matching this file's existing determinism-testing convention for `id`/`name`).
  - Every spawned `Company` fixture across this file gains a `color` field wherever one is constructed by hand rather than through the real spawn path.
* **`RobotsTab.test.tsx` (modified):**
  - New `describe('sortRobotsByCompanyFocus', …)` (or inline `it` blocks) covering: (1) `companyId: null` returns the input array unchanged (same reference or same order — confirm which this file's existing convention checks); (2) a real `companyId` moves exactly that company's members to the end, preserving relative order within both blocks — construct a fixture with at least 4 robots split across 2+ companies plus at least one Freelance robot to make the partition non-trivially checkable; (3) a `companyId` with zero matching robots returns the input unchanged (empty "members" block, no-op partition).
  - New: rendering `RobotsTab` with `uiStore.selectedCompanyId` set to a real company id renders that company's `RobotSelectionCard`s last in DOM order; setting it back to `null` (or calling `selectAllRobots`) restores original order.
* **Verification Steps (run after all four changes land, and again standalone if landed separately per §6):**
  1. `npm run build:types` — zero TypeScript errors (surfaces any remaining `Company` literal missing `color`).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** `npm run dev`, open the Robots tile. Confirm: (1) the company CRUD controls start collapsed, expand/collapse on click, animate consistently with every other accordion in the app; (2) every company button in the row below the robot list, and every company option inside each robot card's own company picker, shows a distinct resting-state color hint, with the currently-selected/assigned one more strongly tinted; (3) clicking a specific company button reorders the robot list above so that company's cards sink to the bottom, and clicking "None"/"All" restores the original order; (4) creating several new companies never produces two with the same color while `MAX_COMPANIES` (6) isn't exceeded.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** `RadioButton`'s existing contract entry gains a line documenting the new optional per-option `color` field and what it does (rest-state hint + stronger selected-state tint, via the same ambient-CSS-custom-property mechanism every other trait/identity color in the app already uses) — same "internal rendering changed, contract didn't (much)" pattern used for prior Cabinetry primitive updates.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** A new feature branch off `main` once `layout/robot-card-cleanup` merges (or off that branch directly, if this work starts before it merges — confirm with Crawford at Plan/Tasks time) — e.g. `feature/company-section-enhancements`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable, matching this spec's own four-change structure: (1) `Company.color` + both generation call sites (§1.2) + their tests, (2) `RadioButtonSchema`'s `color` field + `RadioButton.tsx`'s per-item style + its tests (§1.3, independent of §1.2 except for `companyConfig.ts`'s two builders, which need both), (3) `companyConfig.ts`'s `COMPANY_CRUD_ACCORDION_SCHEMA` + `CompanyCrudControls.tsx`'s accordion wrap (§1.1, independent of the other three), (4) `RobotsTab.tsx`'s sort (§1.4, independent of the other three), (5) `docs/COMPONENT_LIBRARY.md`.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, or reasoned through above — not left open):

- ~~Does the CRUD accordion auto-open when a company is selected?~~ **Resolved: no, manual toggle only** (intent doc, confirmed via interview).
- ~~Does the sort apply for "None"/"All", or only a specific company selection?~~ **Resolved: only a specific company; "None"/"All" show plain roster order** (intent doc, confirmed).
- ~~Is per-company color collision-avoided?~~ **Resolved: yes for user-created companies (re-roll against existing colors), no for spawn-time siblings** (intent doc, confirmed — this distinction only surfaced once spec-writing found the second, spawn-time creation path the interview hadn't covered).
- ~~Does `RadioButton` need new CSS, or can it reuse existing ambient-accent rules?~~ **Resolved: reuse — see §1.3's derivation from `CabinetBox.css`/`RadioButton.css`'s existing rules.**

Still open — flag for Plan/Tasks, not blocking this spec:

1. **`Company.color` as a required field touches every existing `Company` test fixture across the codebase** — a broader grep found real (non-spawn, non-CRUD) `Company` object literals in `RobotSelectionCard.test.tsx`, `RobotDisplaySection.test.tsx`, `CompanyOptionsSection.test.tsx`, `localeStore.test.ts`, `AttenuationStyleView.test.tsx`, `CompanyButtonRow.test.tsx`, `Company.test.ts`, `factoryPlacementSystem.test.ts`, `audioSwells.test.ts`, and `FactoryBubbleStream.test.tsx` — all of which will fail `npm run build:types` until each adds a `color` value. This spec chose "required" to match `Robot.identityColor`'s own precedent and because both real creation paths always set it, but the fixture-touching blast radius is real and worth Crawford's explicit sign-off before Tasks scopes it (a one-line addition per fixture, but ~10 files).
2. ~~No collision-avoidance for spawn-time sibling companies (§1.2) — accepted in the intent doc as low-risk given `INITIAL_COMPANIES_MIN`/`MAX`'s small counts (this spec didn't re-verify those exact constants' values — confirm at Tasks time if precision matters), but flagged again here since it means two companies in the same freshly-generated locale *can*, rarely, share a color, unlike every user-created company from that point forward.~~ **Resolved, 2026-09-15** — see [docs/specs/ROBOT_SELECTION_FILTER_PANEL_POLISH.md](ROBOT_SELECTION_FILTER_PANEL_POLISH.md) §1.4; `generateCompanyIdentityColor` now takes a third `usedColors` parameter and retries (seeded, bounded at `ROBOT_IDENTITY_COLOR_NAMES.length`) rather than accepting the risk.
3. **`COMPANY_CRUD_ACCORDION_SCHEMA`'s exact label text (§1.5 item 3)** — a best guess, not confirmed with Crawford directly.
4. **Whether this branches off `main` or off `layout/robot-card-cleanup` (§6)** — depends on that branch's merge timing relative to when implementation of this spec actually starts; not resolvable at spec time.
