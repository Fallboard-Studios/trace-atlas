# Phase Spec: Robot Selection Screen — Filter Panel

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-selection-filter-panel.md](../intent/robot-selection-filter-panel.md)
(confirmed via `/interview-me`, 2026-09-14). Touches `RobotsTab.tsx`, `CompanyManager.tsx`,
`CompanyButtonRow.tsx`/`companyConfig.ts` (schema reorder/relabel/recolor), `robotListSort.ts` (reorder →
filter, renamed), and adds one new component (the responsive panel shell + its mobile toggle). Larger
surface area than a single-file phase — five existing files change behavior, one is renamed, one new
component + its CSS + GSAP timeline is added — so this gets its own spec rather than folding into an
existing one.

---

## 1. Overview & Claude Explanation

### 1.1 Button row: reorder, relabel, recolor (`companyConfig.ts`, `CompanyButtonRow.tsx`)

`buildCompanyButtonRowSchema` changes shape and order. Today:

```typescript
options: [
  { value: NONE_VALUE, label: 'None' },
  { value: ALL_VALUE, label: 'All' },
  ...companies.map((c) => ({ value: c.id, label: c.name, color: c.color })),
]
```

Becomes:

```typescript
options: [
  { value: ALL_VALUE, label: 'All', color: ACCENT_COLORS.green },
  ...companies.map((c) => ({ value: c.id, label: c.name, color: c.color })),
  { value: NONE_VALUE, label: 'Reset', color: ACCENT_COLORS.red },
]
```

- **`NONE_VALUE`'s sentinel string (`'__none__'`) is unchanged** — only its option's `label` (`'None'` →
  `'Reset'`) and position (first → last) change. Every existing consumer that branches on
  `v === NONE_VALUE` (`CompanyButtonRow.tsx`'s `handleChange`) needs no change at all; only the schema's
  `options` array changes.
- **`ALL_VALUE` keeps its label `'All'`** — only gains a `color`. `selectAllRobots()`'s behavior (highlight
  every robot, arm bulk-edit for the whole roster including freelancers) is **unchanged** — confirmed
  explicitly in interview, this is not being narrowed.
- **No `FREELANCE_VALUE` option is added to this row.** `FREELANCE_VALUE` keeps its one existing use
  (`buildCompanyAssignmentSchema`, the per-robot company-assignment radio) untouched.
- `companyConfig.ts` needs a new import: `ACCENT_COLORS` from `@/constants/accentColors` (already exported
  there — `red: '#cd5e57'`, `green: '#68cb97'` — no new color tokens needed).
- `buildCompanyButtonRowSchema`'s own doc comment (currently: *"None and All come first ... so the two 'no
  single company' meta-options aren't separated by the ... per-company list"*) gets rewritten — the new
  order deliberately sandwiches the company list between All and Reset instead.

`RadioButton.tsx` needs **zero changes** — it already renders `option.color` via `getRobotColorStyle`
whenever an option supplies one (`RadioButton.tsx:143`), unconditionally. Every option in this row now
supplies a color, so the "no color → no `style` attribute at all" branch this row's own tests currently
assert for `None` (`CompanyButtonRow.test.tsx:40`) no longer applies to *any* option here — see §5.

### 1.2 The one real logic change: filter, not sort (`robotListSort.ts` → `robotListFilter.ts`)

```typescript
// RENAMED FILE: src/utils/robotListSort.ts → src/utils/robotListFilter.ts
// RENAMED FUNCTION: sortRobotsByCompanyFocus → filterRobotsByCompanyFocus

export function filterRobotsByCompanyFocus(robots: Robot[], companyId: string | null): Robot[] {
  if (!companyId) return robots;
  return robots.filter((r) => r.companyId === companyId);
}
```

`companyId` is only ever non-null when a specific company button is selected (`selectedCompanyId`) —
`selectCompany(null)` (Reset) and `selectAllRobots()` (All) both pass/resolve to `null` at the call site in
`RobotsTab.tsx`, exactly as today. Both continue to render the full, unfiltered roster; nothing about their
own behavior changes. Only a real company selection now **hides** every non-member robot instead of sinking
them to the bottom of the list.

**Judgment call:** renaming the file and function, not just changing the function body. `robotListSort.ts`
would be a misleading name for a function that filters rather than sorts, and this codebase's existing
naming discipline (see e.g. `sortRobotsByCompanyFocus`'s own now-stale doc comment being rewritten below)
treats a stale name as a real defect, not a nitpick. `robotListSort.test.ts` moves and renames alongside it.

### 1.3 `CompanyManager.tsx`: drop `CompanyOptionsSection`

```tsx
// CompanyManager() — MODIFIED
export const CompanyManager = memo(function CompanyManager() {
  return (
    <div className="company-manager" style={getTraitColorStyle('company')}>
      <CompanyButtonRow />
      <CompanyCrudControls />
    </div>
  );
});
```

`CompanyOptionsSection` import and render removed. `CompanyManager` keeps its name and its `memo()` wrap
(still correct and sufficient — still zero props) and its Company-trait root styling; it now represents
exactly "the button row and CRUD controls," which is what moves into the new filter panel (§1.5).
`CompanyOptionsSection`'s own internal logic is **untouched** — confirmed in interview it "shouldn't need
amending" — it just moves to being a direct sibling in `RobotsTab.tsx` instead of a child of
`CompanyManager` (§1.6).

`CompanyManager.css`'s `padding-top`/`border-top` rule (today visually separating `CompanyManager` from the
robot card list stacked above it in one column) is removed — `CompanyManager` no longer sits in that
stacked column; it renders inside the new side panel instead, which supplies its own visual boundary (the
panel's own edge/background, §1.4).

### 1.4 `CompanyCrudControls.tsx`: drop the `AccordionContainer` wrap

```tsx
// CompanyCrudControls() — MODIFIED, return statement only
return (
  <div className="company-crud-controls">
    <div className="company-crud-controls__create"> … </div>
    <div className="company-crud-controls__rename"> … </div>
    <Button schema={deleteSchema} onClick={handleDelete} disabled={!hasSelectedCompany} />
  </div>
);
```

The `<AccordionContainer schema={COMPANY_CRUD_ACCORDION_SCHEMA}>` wrapper is removed; its children render
directly. `COMPANY_CRUD_ACCORDION_SCHEMA` (`companyConfig.ts`) becomes dead — removed, not left as an
unused export (this codebase has no other precedent for keeping a schema constant around with zero
consumers). No CSS padding needs adding in its place: `AccordionContainer.css`'s `.sc-accordion__content`/
`.sc-accordion__content-inner` rules only ever controlled height/opacity for the collapse animation, never
padding around the children — `company-crud-controls`'s own `gap: 0.5rem` (already in
`CompanyCrudControls.css`) is the only spacing rule that was ever doing real layout work here, and it's
unaffected.

### 1.5 New component: `RobotFilterPanel` — the responsive shell

New file, `src/components/panels/screen/console/RobotFilterPanel.tsx` (colocated with `RobotsTab.tsx`,
`ConsolePanel.tsx` — this is console-screen layout chrome, not a company-domain component, which is why it
lives here rather than under `src/components/company/`). Wraps `CompanyManager` and owns:

1. **Tier-driven behavior**, via the existing shared hook (no new breakpoint value):
   ```typescript
   const tier = useCabinetTier(); // '@/components/ui/controls/useCabinetBoxHeight'
   const isDesktop = tier === 'desktop';
   ```
   Mirrors `useResponsivePanelOrientation`'s own mobile+tablet-vs-desktop split exactly — confirmed in
   interview, not a new three-way behavior.

2. **Open/closed state**, local to this component (ephemeral UI state, not domain state — same category as
   `AccordionContainer`'s own `open`):
   ```typescript
   const [open, setOpen] = useState(false); // starts off-screen, per the intent doc
   ```
   Meaningless on desktop (the panel is never transformed there — see §1.5's CSS below) but harmless to
   keep as one piece of state rather than branching the component in two.

3. **Auto-close on selection**, reading the same store fields `CompanyButtonRow` already writes to,
   skipping the very first render (mount) so this never fires an unwanted close/animate on initial load —
   the same "mount is special-cased" precedent `AccordionContainer.tsx`'s own `defaultOpen` `useEffect`
   already establishes:
   ```typescript
   const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
   const allRobotsSelected = useUIStore((s) => s.allRobotsSelected);
   const didMountRef = useRef(false);

   useEffect(() => {
     if (!didMountRef.current) {
       didMountRef.current = true;
       return;
     }
     if (open) {
       setOpen(false);
       animateTo(false);
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [selectedCompanyId, allRobotsSelected]);
   ```

4. **GSAP slide animation**, following `AccordionContainer.tsx`'s own `animateTo`/`timelineMap` pattern
   exactly (a `gsap.timeline()` registered via `setTimeline`/killed via `killTimeline`, `prefers-reduced-motion`
   snaps instead of tweening) — a transform tween instead of a height tween:
   ```typescript
   const timelineKey = 'robot-filter-panel';
   const panelRef = useRef<HTMLDivElement>(null);

   useEffect(() => () => killTimeline(timelineKey), []);

   function animateTo(nextOpen: boolean) {
     const el = panelRef.current;
     if (!el || isDesktop) return; // desktop never transforms — always laid out in flow
     killTimeline(timelineKey);
     const prefersReducedMotion = typeof window.matchMedia === 'function'
       && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
     const tl = gsap.timeline();
     tl.to(el, { xPercent: nextOpen ? 0 : -100, duration: prefersReducedMotion ? 0 : 0.25, ease: 'power2.out' });
     setTimeline(timelineKey, tl);
   }

   function handleToggle() {
     const next = !open;
     setOpen(next);
     animateTo(next);
   }
   ```
   Reuses `ACCORDION_DURATION` (0.25s) rather than a new tuned constant — same "not a fresh timing
   decision" reasoning as this component's other borrowed conventions. `xPercent` (GSAP's own
   percentage-of-element-width transform) needs no separate CSS custom property for panel width the way a
   pixel-based `x` tween would.

5. **Render** — the toggle only exists off-desktop; the panel itself always renders (so
   `CompanyManager`/`CompanyButtonRow`/`CompanyCrudControls` are never unmounted/remounted across a tier
   change, only repositioned):
   ```tsx
   return (
     <>
       {!isDesktop && (
         <Button
           schema={FILTER_TOGGLE_SCHEMA}
           onClick={handleToggle}
           // aria-expanded isn't part of ButtonSchema/Button's own contract (unlike
           // AccordionContainer's Radix-driven one) — added directly on this call site, the same way
           // ConsolePanel's own BACK_SCHEMA Button call needs no extra accessibility wiring beyond
           // what Button already provides. See §3 for why this doesn't touch Button.tsx itself.
         />
       )}
       <div ref={panelRef} className={withActiveClass('robot-filter-panel', open)} data-tier={tier}>
         <CompanyManager />
       </div>
     </>
   );
   ```
   `FILTER_TOGGLE_SCHEMA` is a local `ButtonSchema` constant (`{ id: 'robotFilterPanel.toggle', type:
   'button', humanLabel: 'Filters' }`), the exact same "plain schema constant, no domain config file" shape
   `ConsolePanel.tsx`'s own `BACK_SCHEMA` already uses — this is UI chrome, not a `companyConfig.ts`-owned
   domain schema.

**CSS** (`RobotFilterPanel.css`, new file):

```css
.robot-filter-panel {
  overflow-y: auto;
}

/* Mobile + tablet: off-canvas overlay. transform is owned by the GSAP timeline above at runtime;
   this is the closed-state resting value for the very first paint, before any JS has run — same
   "CSS owns the closed-state baseline, GSAP owns the transition" split AccordionContainer.css
   documents for its own height/opacity. */
.robot-filter-panel:not([data-tier='desktop']) {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: min(85vw, 320px);
  transform: translateX(-100%);
  z-index: var(--z-overlay);
  background: var(--color-surface);
  padding: 12px;
}

/* Desktop: plain sidebar, in flow, never transformed. */
.robot-filter-panel[data-tier='desktop'] {
  position: static;
  width: 260px;
  flex-shrink: 0;
}

.robot-filter-panel__toggle {
  position: sticky;
  top: 8px;
  left: 8px;
  z-index: var(--z-overlay);
}

@media (prefers-reduced-motion: reduce) {
  .robot-filter-panel {
    transition: none;
  }
}
```

`--z-overlay` (`50`, `src/index.css`) is the existing app-wide overlay z-index token — reused, not a new
magic number. The absolutely-positioned mobile/tablet panel is scoped to `.robots-tab`'s own box (which
becomes `position: relative`, §1.6), not `position: fixed` against the browser viewport — this app renders
its console inside a simulated physical screen bezel (`ScreenViewport`/`SleeveContainer`), and a
viewport-fixed panel would break out of that frame. **Judgment call**, not explicit in the intent doc.

**Judgment call: no backdrop/scrim.** The intent doc explicitly deferred "exact visual/CSS treatment" to
this spec. Only the toggle (tap again) or picking a filter option closes the panel — there's no separate
click-outside-to-dismiss element added. Simplest option consistent with everything actually confirmed in
interview; flagged in §7 in case it turns out wanted later.

### 1.6 `RobotsTab.tsx`: wiring it together

```tsx
// RobotsTab() — MODIFIED
export function RobotsTab() {
  const localeId = getActiveLocaleId();
  const robots = useLocaleStore((s) => s.locales[localeId]?.robots ?? []);
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const filteredRobots = filterRobotsByCompanyFocus(robots, selectedCompanyId);

  return (
    <div className="robots-tab" role="region" aria-label="Robots">
      <div className="robots-tab__body">
        <RobotFilterPanel />
        <ul className="robots-tab__list">
          {filteredRobots.map((robot) => (
            <RobotSelectionCard key={robot.id} robot={robot} />
          ))}
        </ul>
      </div>
      <CompanyOptionsSection />
    </div>
  );
}
```

`CompanyManager` is no longer imported directly here — `RobotFilterPanel` owns rendering it.
`CompanyOptionsSection` is now imported and rendered directly by `RobotsTab` (previously nested inside
`CompanyManager`), in the exact same document position `CompanyManager` used to occupy: beneath the robot
card list.

**CSS** (`RobotsTab.css`, additions):

```css
.robots-tab {
  position: relative; /* contains RobotFilterPanel's absolute positioning off-desktop */
}

.robots-tab__body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.robots-tab__list {
  flex: 1;
  min-width: 0; /* same shrink-to-fit fix CompanyCrudControls.css/CoordsInput.css already use */
}
```

`min-width: 0` on `.robots-tab__list` is the same fix already applied to
`.company-crud-controls__create > .sc-text-input-facade` for the identical reason: a flex row's default
`min-width: auto` would otherwise let the list's own intrinsic content width push `RobotFilterPanel` (on
desktop, a `flex-shrink: 0` sibling) out of a non-overlapping layout (§3's "never overlap" constraint) once
enough robot cards are present to want more room than the row has.

### 1.7 Judgment calls made while translating intent into a concrete design

Per this skill's "surface assumptions immediately" step — none of these were asked during `/interview-me`:

1. **New component's name and location** — `RobotFilterPanel.tsx` in
   `src/components/panels/screen/console/`, not under `src/components/company/`. Reasoning: it's
   responsive-layout chrome for this one console screen (toggle, tier detection, GSAP slide), not a
   company-domain component — keeping `src/components/company/*` free of any responsive/layout concern
   matches that directory's existing scope (pure company CRUD/selection/options, zero tier awareness
   today).
2. **The toggle is a plain `Button`, not a new primitive.** `docs/COMPONENT_LIBRARY.md` documents exactly
   14 primitives as a deliberately fixed, tested count (`CONTROL_SCHEMA_TYPES`). This toggle is
   screen-chrome exactly like `ConsolePanel.tsx`'s own `BACK_SCHEMA`/`Button` pair — a locally-defined
   schema constant, no new `ControlSchema` variant, no change to that documented count.
3. **`robotListSort.ts` is renamed to `robotListFilter.ts`**, function renamed to
   `filterRobotsByCompanyFocus` — see §1.2's own note.
4. **No backdrop/scrim, no click-outside-to-dismiss** on the mobile/tablet overlay — see §1.5.
5. **Positioning is `position: absolute` scoped to `.robots-tab`, not `position: fixed` against the
   viewport** — see §1.5.
6. **The auto-close effect skips the initial mount** via a ref flag, mirroring `AccordionContainer.tsx`'s
   own mount-special-casing for `defaultOpen` — without this, the effect's first run (mount) would call
   `animateTo(false)` for no reason (harmless in practice since the panel starts closed anyway, but adds a
   pointless GSAP timeline creation on every mount).
7. **`aria-expanded` on the toggle is set directly at the `RobotFilterPanel` call site**, not added to
   `Button`'s own contract — `Button.tsx` takes no such prop today, and adding one for this single consumer
   would be a documented-contract change (`docs/COMPONENT_LIBRARY.md`'s `Button` row) for a need this phase
   doesn't otherwise have. **Open question in §7**, since this can't actually work without either a prop
   Button doesn't have or a wrapper element — see there.

---

## 2. Target File Structure

```text
src/
├── components/
│   ├── company/
│   │   ├── CompanyManager.tsx             # MODIFIED — §1.3, drops CompanyOptionsSection
│   │   ├── CompanyManager.css             # MODIFIED — §1.3, drops border-top/padding-top
│   │   ├── CompanyManager.test.tsx        # MODIFIED — see §5
│   │   ├── CompanyButtonRow.tsx           # UNCHANGED — no logic change, schema shape only
│   │   ├── CompanyButtonRow.test.tsx      # MODIFIED — see §5
│   │   ├── CompanyCrudControls.tsx        # MODIFIED — §1.4, drops AccordionContainer wrap
│   │   ├── CompanyCrudControls.test.tsx   # MODIFIED — see §5
│   │   └── CompanyOptionsSection.tsx      # UNCHANGED — logic untouched, new render parent only
│   └── panels/screen/console/
│       ├── RobotFilterPanel.tsx           # NEW — §1.5
│       ├── RobotFilterPanel.css           # NEW — §1.5
│       ├── RobotFilterPanel.test.tsx      # NEW — see §5
│       ├── RobotsTab.tsx                  # MODIFIED — §1.6
│       ├── RobotsTab.css                  # MODIFIED — §1.6
│       └── RobotsTab.test.tsx             # MODIFIED — see §5
├── data/
│   ├── companyConfig.ts                   # MODIFIED — §1.1
│   └── companyConfig.test.ts              # MODIFIED — see §5
└── utils/
    ├── robotListSort.ts                   # RENAMED → robotListFilter.ts (§1.2)
    └── robotListSort.test.ts              # RENAMED → robotListFilter.test.ts (§1.2)
```

**Explicitly not touched, and why:**

- `src/stores/uiStore.ts` — `selectedCompanyId`/`allRobotsSelected`/`selectCompany`/`selectAllRobots` all
  keep their exact current shape and meaning. No new state field — confirmed in interview the existing pair
  already fully drives both filtering and the button row.
- `src/components/company/CompanyOptionsSection.tsx` / `.css` / `.test.tsx` — internal bulk-edit logic,
  disabled-state rules, `resolveCompanyOptions`, snapshot patching all untouched; it only gets a new render
  parent (`RobotsTab` directly, instead of via `CompanyManager`).
- `src/data/companyConfig.ts`'s `buildCompanyAssignmentSchema`/`FREELANCE_VALUE` — the unrelated per-robot
  company-assignment radio. Untouched.
- `src/components/ui/controls/RadioButton.tsx`, `Button.tsx`, `AccordionContainer.tsx` — every primitive
  reused here already supports what this phase needs (`option.color`, a plain schema+onClick, nothing).
- `src/components/ui/controls/useCabinetBoxHeight.ts` (`useCabinetTier`) — reused as-is, no new breakpoint
  value, no new tier.
- `docs/COMPONENT_LIBRARY.md`'s documented 14-primitive count and `ControlSchema` union — unaffected; see
  §1.7 item 2.

No new dependency. No change to `RobotSelectionCard.tsx` or `sortRobotsByCompanyFocus`'s former *consumer*
signature shape (`(robots, companyId) => Robot[]`) beyond the rename.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Per `CLAUDE.md`:** the panel's slide animation must go through a GSAP timeline registered in
  `timelineMap` (`setTimeline`/`killTimeline`) — no bare CSS `transition` driven by a class toggle, no
  `requestAnimationFrame` loop. `prefers-reduced-motion` must be respected (snap, not tween), matching
  `AccordionContainer`'s own precedent exactly.
* **The filter panel and its filtering behavior exist only on `RobotsTab`** — never on `RobotOptionsTab`
  (the individual robot-detail screen). Confirmed explicitly in interview: "we should only see this on the
  robot selection screen as you can't filter robots without a list to filter." `RobotFilterPanel` is
  imported and rendered by `RobotsTab.tsx` only.
* **Desktop: the robot card list must never be laid out so it overlaps `RobotFilterPanel`.** §1.6's
  `min-width: 0` on `.robots-tab__list` is the mechanism; verify at a real narrow-desktop width (just above
  the `tablet`/`desktop` boundary, 1025px+) with many robot cards, not just at a wide default viewport.
* **`allRobotsSelected`/`selectedCompanyId` keep their current meaning and mutual exclusivity** — no new
  `uiStore` field. `ALL_VALUE`'s bulk-edit-everyone behavior (via `CompanyOptionsSection`'s existing
  `allRobotsSelected` branch) is explicitly **not** narrowed to exclude freelancers — confirmed directly in
  interview, kept as a known, accepted risk (uniform audio settings across the whole roster can sound bad;
  a warning is a possible future addition, not part of this phase).
* **`FREELANCE_VALUE` and `buildCompanyAssignmentSchema` are out of bounds** — no new consumer, no shape
  change.
* **`CompanyOptionsSection`'s internal logic is out of bounds** — member resolution, `active` gating,
  `resolveCompanyOptions`, snapshot patching all stay exactly as shipped; this phase only changes who
  renders it and where.
* **No `setTimeout`/`setInterval`/`requestAnimationFrame`** anywhere in `RobotFilterPanel` — the auto-close
  effect fires synchronously off a store-value change, and the slide itself is the one GSAP timeline (§1.5
  item 4).

---

## 4. Code Style & Architecture Conventions

Full code shapes for every changed/new file are given inline in §1.1–§1.6 above — not repeated here.

**Naming conventions:**
- `filterRobotsByCompanyFocus` — verb-first, matches the renamed file's own new purpose (mirrors
  `sortRobotsByCompanyFocus`'s own naming register, just the verb swapped for what it now actually does).
- `RobotFilterPanel` — PascalCase component file, matching every other component in
  `src/components/panels/screen/console/`. `robot-filter-panel`/`robot-filter-panel__toggle` CSS classes —
  plain kebab-case with a `__` BEM-style element separator, matching `robots-tab__list`/
  `robots-tab__body`'s own existing convention in the same directory (not the `sc-` prefix, which is
  reserved for `ControlSchema` primitives per `docs/COMPONENT_LIBRARY.md` — `RobotFilterPanel` isn't one).
- `FILTER_TOGGLE_SCHEMA` — `SCREAMING_SNAKE_CASE` local constant, matching `ConsolePanel.tsx`'s own
  `BACK_SCHEMA` naming exactly.

**Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines
actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Locations:** Colocated, matching §2.

**`companyConfig.test.ts` (MODIFIED):** whatever existing assertions cover `buildCompanyButtonRowSchema`'s
option order/labels for `NONE_VALUE`/`ALL_VALUE` update to the new order (`All`, then companies, then
`Reset`) and new colors (`ACCENT_COLORS.green` on `All`, `ACCENT_COLORS.red` on `Reset`).

**`CompanyButtonRow.test.tsx` (MODIFIED):**
- Every `{ name: 'None' }` query becomes `{ name: 'Reset' }`.
- `'shows each company\'s own color on its button, and no color on None'` — rewritten: `Reset` now *does*
  carry a color (`ACCENT_COLORS.red`, via `--color-accent-a`), and so does `All` (`ACCENT_COLORS.green`) —
  there is no longer any option in this row with a `null` `style` attribute. Assert both colors explicitly
  rather than just removing the old "no color" assertion.
- `'renders one button per company plus "None"'`, `'renders just "None" when there are no companies'`,
  `'defaults to "None" selected'`, `'reflects the currently selected company as checked'`, `'clicking
  "None" calls selectCompany with null'`, `'shows "All" as checked ... every other button unchecked'`,
  `'clicking "None" after "All" was selected deselects "All" too'`, and the `MAX_COMPANIES` ceiling test —
  every `'None'` name string becomes `'Reset'`; underlying behavior assertions (which value gets passed to
  `selectCompany`/`selectAllRobots`, which button ends up `aria-checked`) are otherwise unchanged.
* **New: order.** A test asserting `screen.getAllByRole('radio').map(r => r.getAttribute('aria-label'))` (or
  equivalent) renders `All` first, then each company, then `Reset` last — the one property this whole
  reorder is about, not otherwise covered by any per-button test above.

**`CompanyCrudControls.test.tsx` (MODIFIED):**
- The entire `describe('CRUD accordion', …)` block (2 tests: starts collapsed, expands/collapses on click)
  is **deleted** — there is no longer an accordion trigger to query (`screen.getByRole('button', { name:
  /manage companies/i })` no longer exists).
- Every other test in this file is unaffected — none of them depend on the accordion wrapper; Create/
  Rename/Delete's own buttons and the name inputs are direct children either way.

**`CompanyManager.test.tsx` (MODIFIED):**
- `'renders the company button row, CRUD controls, and options section, in that order'` — rewritten to
  drop the `optionsSection` query and its ordering assertion entirely; becomes "renders the company button
  row and CRUD controls, in that order" (2-element check, not 3).
- `'renders the "None" company button by default'` — becomes `'renders the "Reset" company button by
  default'` (query text only; the assertion that nothing is selected by default is unchanged in spirit,
  just renamed).
- The Company-trait color-scoping test is unaffected.

**New: `robotListFilter.test.ts`** (renamed+rewritten from `robotListSort.test.ts`):
- `'returns the input unchanged when companyId is null'` — unchanged in spirit (still a real behavior:
  `null` companyId is a no-op).
- `'filters down to only the given company\'s members'` (replaces the old "moves ... to the end" test) —
  same `robots` fixture, asserts `filterRobotsByCompanyFocus(robots, 'c1').map(r => r.id)` equals
  `['r1', 'r3']` (members only, in original relative order), **not** the old 4-element reordered array.
- `'returns an empty array when no robot belongs to the given company'` (replaces the old "returns the
  input unchanged" test for this case) — `filterRobotsByCompanyFocus(robots, 'no-such-company')` now
  returns `[]`, not the original 4-robot array.

**`RobotsTab.test.tsx` (MODIFIED):**
- The `describe('company-selection-driven sort (rendered)', …)` block is renamed
  (`'company-selection-driven filter (rendered)'`) and rewritten:
  - `'renders in original roster order with no company selected'` — unchanged (still true; nothing is
    filtered when `selectedCompanyId` is null).
  - `'sinks the selected company\'s members to the bottom ...'` → replaced with `'shows only the selected
    company\'s members, hiding everyone else'`: after `selectCompany('c1')`, `robotNamesInOrder(container)`
    equals `['Alpha', 'Gamma']` (members only) — **not** all 4 names.
  - `'reverts to original roster order once selectAllRobots() is called'` → `'reverts to showing every
    robot once selectAllRobots() is called'` — same call sequence, same expected 4-name result (`selectAll`
    still resolves to an unfiltered list); rewritten for the new comment/name, not a new assertion.
- `'renders CompanyManager beneath the robot card list (Roadmap Phase 10)'` — **replaced.**
  `.company-manager` no longer renders as a direct descendant of `.robots-tab` in the position this test
  checks (it's now nested inside `.robot-filter-panel`, itself inside `.robots-tab__body`, itself before the
  list). New test(s) instead assert the structure §1.6 actually produces:
  - `.robots-tab__body` contains both `.robot-filter-panel` (which contains `.company-manager`) and
    `.robots-tab__list`, with the panel before the list in document order.
  - `.company-options-section` (rendered by `RobotsTab` directly now, not via `CompanyManager`) still
    follows `.robots-tab__body` in document order — the same relative position `CompanyManager` used to
    occupy.
* Every other existing `RobotsTab.test.tsx` test (card listing, name fallback, job/battery/docking display,
  card-click selection, no-spawn-button) is behavior-unrelated and unaffected.

**New: `RobotFilterPanel.test.tsx`:**
- Renders `CompanyManager`'s own contents (`.company-button-row`, `.company-crud-controls`) regardless of
  tier.
- At `desktop` tier (stub `useCabinetTier`/`matchMedia` per this codebase's existing per-`it()` stubbing
  convention, e.g. `CabinetBox`/`useResponsivePanelOrientation`'s own test setup): no toggle button is
  rendered (`screen.queryByRole('button', { name: /filters/i })` is `null`); the panel's own root carries
  `data-tier="desktop"`.
- At `mobile`/`tablet` tier: the toggle renders; clicking it once and reading the panel's root class list
  confirms the `isActive` class (`withActiveClass`) is present; clicking again removes it.
- Selecting a company (`useUIStore.getState().selectCompany('c1')`) while the panel is open (mock-opened via
  the toggle click) removes the `isActive` class — the auto-close behavior — **and this does not fire on
  initial mount** (assert the panel does *not* carry a "just closed" side effect — e.g. no extra
  `setTimeline` call — purely from rendering with a pre-existing `selectedCompanyId`, only from a
  *change* to it after mount).
- Selecting `selectAllRobots()` while open also auto-closes (same mechanism, `allRobotsSelected` branch of
  the same effect).

* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** `npm run dev`, open the Robots tile.
  1. At a desktop-width viewport: filter panel renders to the left of the robot list, always visible, no
     toggle button anywhere; resize the window down through the tablet/mobile breakpoints and confirm the
     toggle appears and the panel disappears off-screen to the left.
  2. At mobile/tablet width: tap the toggle — panel slides in over the list; tap a company button — panel
     auto-closes and the list now shows only that company's robots; tap the toggle again — panel opens
     empty-handed (no auto-select) back to whatever's currently selected.
  3. Confirm `All`'s button reads green, `Reset`'s reads red, and each company button still shows its own
     color.
  4. Confirm selecting `All` still lets every one of `CompanyOptionsSection`'s 4 accordions bulk-edit every
     robot including freelancers (unchanged behavior) — not a regression check for new behavior, a
     regression check that nothing broke it.
  5. Confirm `prefers-reduced-motion` (OS-level or devtools emulation) makes the panel snap instead of
     sliding.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** none needed — no primitive added, removed, or given a new prop;
  see §1.7 item 2.
* **`docs/COMPANIES.md` update:** likely needed for the button row's new order/labels/colors and the
  filter-not-sort behavior change — check its current content against this spec once implementation lands
  and update if it documents the old None/All-first order or the reorder-only behavior specifically (out of
  scope to audit line-by-line here; flagged so it isn't silently missed).
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** Given the current branch (`feature/company-cleanup`) is oriented around cleanup of
  already-shipped company UI rather than a new layout feature, and this phase is a genuinely new screen
  restructure (new component, renamed util, responsive shell) — **flagged for the human to decide**: land on
  a fresh branch (e.g. `feature/robot-filter-panel`) or continue on `feature/company-cleanup`. Not resolved
  here.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences.
  Given the number of independently-verifiable pieces (schema reorder, filter-not-sort rename, accordion
  removal, new panel component, `RobotsTab` rewiring), multiple commits following the task breakdown (next
  phase, per this skill's own Plan/Tasks gates) is more reasonable than one large one — left for that phase
  to actually sequence.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, or reasoned through above — not left
open):

- ~~Does the filter panel wrap `RobotOptionsTab` too, or only `RobotsTab`?~~ **Resolved: `RobotsTab` only**
  (intent doc, confirmed via interview).
- ~~Does selecting a company filter the list or just reorder it?~~ **Resolved: filters — hides non-members**
  (intent doc, the one real logic change).
- ~~Does "All" narrow to exclude freelancers now that "Freelance" isn't a separate option?~~ **Resolved:
  no — kept exactly as today, freelancers included, bulk-edit armed for everyone** (intent doc, explicit
  correction mid-interview).
- ~~Do the 4 bulk-edit accordions move into the new panel?~~ **Resolved: no, they stay in the main content
  area** (intent doc, "too large to hold in the filter panel").
- ~~Does the panel auto-close on selection (mobile/tablet)?~~ **Resolved: yes** (intent doc).
- ~~Which viewport tiers get the toggle/overlay behavior vs. the always-visible sidebar?~~ **Resolved:
  mobile+tablet vs. desktop, reusing `useCabinetTier`'s existing 3-tier split 2-ways** (intent doc,
  confirmed via interview).

Still open — flag for Tasks/implementation, not blocking this spec:

1. **`aria-expanded` on the toggle button (§1.7 item 7).** `Button`'s own props
   (`{ schema: ButtonSchema; onClick: () => void }`) don't currently accept arbitrary extra ARIA attributes,
   and `Button.tsx`'s underlying rendered element needs checking directly (not assumed here) to know
   whether an `aria-expanded` prop can even be threaded through to the right DOM node without a `Button.tsx`
   change. If it can't cleanly, either (a) accept a small, generic `aria-expanded?: boolean` passthrough
   prop on `Button` (a real, if small, primitive contract change — would need a
   `docs/COMPONENT_LIBRARY.md` line), or (b) skip `aria-expanded` here and rely on the toggle's own
   accessible name changing between open/closed states (e.g. "Show Filters"/"Hide Filters") as the
   accessible signal instead. Not decided in this spec — first real implementation task should resolve this
   by reading `Button.tsx`, not guess further here.
2. **No backdrop/scrim (§1.5).** If manual testing (§5) finds the overlay confusing without one (e.g. it's
   unclear the list behind it is still there/interactive), revisit — not blocking, flagged as a real
   possibility given it's the one purely-invented piece of this spec with no interview grounding either way.
3. **`docs/COMPANIES.md` audit (§6)** — not performed as part of writing this spec; needs a real pass once
   the code changes land, not assumed clean.
4. **Branch choice (§6)** — left for the human.
