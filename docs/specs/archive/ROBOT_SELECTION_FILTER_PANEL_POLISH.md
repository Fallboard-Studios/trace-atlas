# Phase Spec: Robot Selection Filter Panel — Polish Pass

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-selection-filter-panel-polish.md](../intent/robot-selection-filter-panel-polish.md)
(confirmed via `/interview-me`, 2026-09-15). Follow-up to the filter panel built in
[ROBOT_SELECTION_FILTER_PANEL.md](ROBOT_SELECTION_FILTER_PANEL.md) (shipped, `feature/company-cleanup`). Touches
`RobotFilterPanel.tsx`/`.css` (bug fix, new close button, repositioned/sized), `RobotsTab.css` (layout mechanism
change), and `spawnSystem.ts` (one function). Three independent fixes bundled into one spec because they were
confirmed together in one interview and touch a small, non-overlapping file set — not because they're related in
implementation.

---

## 1. Overview & Claude Explanation

### 1.1 Slide-in bug fix — GSAP/CSS percentage-transform mismatch

**Diagnosed root cause** (not yet confirmed live — flagged for manual verification in §5): `RobotFilterPanel.css`
sets the closed-state resting baseline via a stylesheet rule, `transform: translateX(-100%)`, documented as "the
closed-state resting value for the very first paint, before any JS has run." But `animateTo()` in
`RobotFilterPanel.tsx` never establishes GSAP's own internal transform cache to match that baseline before its
first real tween — it just calls `tl.to(el, { xPercent: ... })` directly. GSAP resolves an element's *existing*
computed transform via `getComputedStyle`, which never reports percentages — only a resolved pixel matrix. On its
first tween, GSAP parses `translateX(-100%)` into a baked-in pixel `x` offset (the panel's width at that moment,
negated) and tracks `xPercent` as a *separate*, additive channel starting at `0` — it does not recover "this was
`-100%`" as the `xPercent` value itself. Every subsequent `xPercent` tween then composes with that already-baked
pixel offset instead of replacing it, so `xPercent: 0` (open) does not return the panel to `x: 0` — it lands back
near its original off-screen pixel position, which reads as "barely appears" rather than a full slide-in.

**Fix:** establish GSAP's own internal transform state to match the CSS baseline on mount, via `gsap.set()` —
the same "instant, no-tween initialization" pattern `CabinetBox.tsx` already uses for its own skew/scale setup
(`gsap.set(topFaceRef.current, { skewX: CABINET_TOP_FACE_SKEW_DEG })`, called once on mount before any tween
touches that element). Added to `RobotFilterPanel.tsx`:

```typescript
useEffect(() => {
  if (!panelRef.current || isDesktop) return;
  gsap.set(panelRef.current, { xPercent: -100 });
}, [isDesktop]);
```

Runs once on mount (and again if `isDesktop` flips false→true after a tier change, re-establishing the baseline —
harmless no-op the rest of the time since the value doesn't change). After this, `xPercent` is the single channel
GSAP tracks for this element from the start, so every subsequent `animateTo()` tween (`xPercent: 0` open,
`xPercent: -100` closed) lands exactly where intended. The CSS stylesheet rule stays as the pre-JS paint baseline
(unchanged) — this fix makes GSAP's own state agree with it instead of silently diverging from it.

**Judgment call:** the root cause above is inferred from GSAP's documented `getComputedStyle`-based transform
parsing and this exact "CSS owns the baseline, GSAP owns the transition" split already being the file's stated
intent — not confirmed by reproducing the bug directly. First implementation task must verify live (`npm run dev`,
resize to mobile width, tap the toggle) that this actually resolves the reported symptom before considering it
closed — see §5's manual check.

### 1.2 Close button + accessible labels (`RobotFilterPanel.tsx`)

Two schema constants replace today's single `FILTER_TOGGLE_SCHEMA`:

```typescript
const FILTER_TOGGLE_SCHEMA: ButtonSchema = { id: 'robotFilterPanel.toggle', type: 'button', humanLabel: 'Show Filters' };
const FILTER_CLOSE_SCHEMA: ButtonSchema = { id: 'robotFilterPanel.close', type: 'button', humanLabel: 'Hide Filters' };
```

Both are `Button`'s only accessible-name source (`resolveAccessibleName`: `humanLabel ?? loreLabel ?? id`) and its
only visible text (`DualLabel`) — one field change drives both, no separate ARIA wiring. This resolves the
previous spec's own open question (§7 item 1 of `ROBOT_SELECTION_FILTER_PANEL.md`) in favor of option (b): a
state-changing accessible name across two distinct buttons, rather than `aria-expanded` on one. `Button.tsx`
takes no props beyond `{ schema, onClick, disabled? }` (confirmed by reading it directly) — the state-changing
name is the only mechanism available without a `Button.tsx` contract change, and none is needed here.

The toggle button stays mounted and rendered unconditionally off-desktop (unchanged from today), even while the
open panel visually covers it — confirmed in interview: no `aria-hidden`/`inert`/focus-trap work requested, it
simply becomes covered and its close counterpart takes over as the reachable control.

```tsx
return (
  <>
    {!isDesktop && (
      <div className="robot-filter-panel__toggle">
        <Button schema={FILTER_TOGGLE_SCHEMA} onClick={handleToggle} />
      </div>
    )}
    <div ref={panelRef} className={withActiveClass('robot-filter-panel', open)} data-tier={tier}>
      {!isDesktop && open && (
        <div className="robot-filter-panel__close">
          <Button schema={FILTER_CLOSE_SCHEMA} onClick={handleToggle} />
        </div>
      )}
      <CompanyManager />
    </div>
  </>
);
```

The close button reuses `handleToggle` (identical to tapping the toggle again) — no new close-specific handler;
it's a second entry point to the same open/close state, not new behavior. It renders only when `open` is true (no
point showing "Hide Filters" on a closed panel), before `CompanyManager` in document order (top of the pane, per
the intent).

### 1.3 Sticky, content-sized panel — all tiers (`RobotFilterPanel.css`, `RobotsTab.css`)

Two changes to how the panel occupies space, both driven by the same interview outcome: *"the user should always
see the company filters on screen while scrolling with the filters open (or, if on desktop, all the time)"* and
*"the filter panel [should be] only as tall as its content."*

**Desktop** goes from `position: static` (scrolls away with the page) to `position: sticky`. **Mobile/tablet**
goes from a `top: 0; bottom: 0` full-height absolute overlay to a `position: sticky`, content-height box anchored
at the same top-left spot the toggle already occupies (`top: 8px; left: 8px`, matching
`.robot-filter-panel__toggle`'s existing offset) — which is *why* the open panel currently covers the toggle
(§1.2's motivation): it's short, but starts exactly where the toggle sits.

The scrolling ancestor both tiers stick against is `.console-panel__content`
([ConsolePanel.css](../../src/components/panels/screen/console/ConsolePanel.css)) — the actual `overflow-y: auto`
box the whole console screen scrolls inside (its `padding-top: 265px`/`216px` already reserves room for the sticky
transport header above it, so `top: 8px` on the panel positions it just below that reserved band, not underneath
it).

**Mechanism — CSS Grid stacking, not flex.** Today's `.robots-tab__body` is a flex row where the mobile/tablet
panel is pulled out of flow via `position: absolute` (so it costs the list zero width) and the desktop panel is a
real `flex-shrink: 0` sidebar item (so it costs the list real width, and the two are laid out side-by-side).
Switching the mobile/tablet panel to `position: sticky` keeps it in normal flow *unless something else removes it*
— a `position: sticky` element still occupies its own box in a flex/grid track, unlike `absolute`. To preserve
"costs the list zero width, layers visually on top of it" off-desktop while still giving desktop its own real
column, `.robots-tab__body` becomes a CSS Grid with the panel and list sharing grid cell `(1, 1)` by default
(mobile/tablet: stacked, panel overlaid above the list via `z-index`), and desktop widening to a second track the
list moves into:

```css
/* RobotsTab.css */
.robots-tab__body {
  display: grid;
  grid-template-columns: 1fr;
  align-items: start;
  gap: 12px;
}

/* Desktop: give the panel its own real column; the list moves into the second one. `:has()` reads
   the panel's own data-tier so RobotsTab.tsx needs no new prop threaded down to this wrapper. */
.robots-tab__body:has(> .robot-filter-panel[data-tier='desktop']) {
  grid-template-columns: 260px 1fr;
}

.robots-tab__list,
.robots-tab__empty {
  grid-column: 1;
  grid-row: 1;
  min-width: 0; /* unchanged reasoning — see existing comment */
}

.robots-tab__body:has(> .robot-filter-panel[data-tier='desktop']) .robots-tab__list,
.robots-tab__body:has(> .robot-filter-panel[data-tier='desktop']) .robots-tab__empty {
  grid-column: 2;
}
```

```css
/* RobotFilterPanel.css */
.robot-filter-panel {
  grid-column: 1;
  grid-row: 1;
  align-self: start;   /* content-height, not stretched to the grid row's height — item 2a */
  position: sticky;
  top: 8px;
}

.robot-filter-panel:not([data-tier='desktop']) {
  left: 8px;
  width: min(85vw, 320px);
  transform: translateX(-100%); /* unchanged pre-JS baseline, see §1.1 */
  z-index: var(--z-overlay);
  background: var(--color-surface);
  padding: 12px;
}

.robot-filter-panel[data-tier='desktop'] {
  width: 260px;
}
```

`position: absolute`/`top: 0`/`bottom: 0` (mobile/tablet) and `position: static`/`flex-shrink: 0` (desktop) are
both removed — `position: sticky` plus grid placement replaces both. `.robots-tab`'s own `position: relative`
(today's comment: "contains `RobotFilterPanel`'s absolute positioning off-desktop") becomes unnecessary now that
nothing under it uses `position: absolute` — left in place as a harmless no-op rather than removed, since nothing
in this spec depends on removing it and it costs nothing to keep (**judgment call**, flagged in case a reviewer
wants it cleaned up).

**`overflow-y: auto` on `.robot-filter-panel` itself** (existing rule, `RobotFilterPanel.css:1-3` today) is kept —
if `CompanyManager`'s content ever grows taller than the viewport allows for a sticky element pinned near the top,
this lets the panel's own content scroll internally rather than pushing off-screen. Not expected to trigger in
practice at today's content size (button row + CRUD controls), but it's an existing safety net, not new surface
area.

**`:has()` selector — judgment call.** Not previously used anywhere in this codebase (checked: no existing
`:has(` in any `.css` file). Chosen over threading a `data-tier` prop down to `.robots-tab__body` in
`RobotsTab.tsx` because it keeps this a CSS-only change with zero JSX/prop changes — `RobotFilterPanel` already
carries `data-tier` on its own root for exactly this kind of tier-conditional styling. `:has()` has been supported
in every evergreen browser (Chrome, Firefox, Safari) since 2023; `CLAUDE.md`/this repo's `package.json` state no
legacy-browser target. Flagged as a first-use precedent, not a risk.

### 1.4 Company color collisions — spawn-time gap (`spawnSystem.ts`)

`generateCompanyIdentityColor` currently draws each company's color independently
(`getSeededVal(noiseMap, 'company.identityColor', offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length)`, `offset = c`,
the company's own index in the spawn loop) with **no check against colors already assigned to earlier companies
in the same pass** — its own doc comment says as much: *"No collision-avoidance against sibling companies
generated in the same locale pass ... accepted (low-risk given `INITIAL_COMPANIES_MIN`/`MAX`'s small counts)"*,
a decision made explicitly in `docs/specs/COMPANY_SECTION_ENHANCEMENTS.md` §7 item 2. **This spec reverses that
decision** — confirmed in this interview ("close the gap if we already have an implementation in place") — the
gap is no longer accepted.

`CompanyCrudControls.tsx`'s own `pickRandomCompanyColor` already solves the identical problem for manual creation
(bounded re-roll against every color in `companies.map((c) => c.color)`, using `Math.random()`). The fix mirrors
its *shape* — bounded retries, skip colors already in use — without its randomness source, since spawn-time
generation must stay deterministic (`CLAUDE.md`; `docs/specs/COMPANY_SECTION_ENHANCEMENTS.md`'s own constraint:
*"Spawn-time color generation stays fully seeded/reproducible ... must use `getSeededVal`, never
`Math.random()`"*).

```typescript
/**
 * Deterministic per-company identity color — see generateRobotIdentityColor's own doc comment for
 * the shared clamped-index-into-ROBOT_IDENTITY_COLOR_NAMES shape. Unlike that function, retries on
 * collision against `usedColors` (every color already assigned to an earlier company in this same
 * spawn pass — spawnInitialCompanies calls addCompany before generating the next company, so
 * useLocaleStore.getState() already reflects every prior sibling by the time this runs), bounded at
 * ROBOT_IDENTITY_COLOR_NAMES.length attempts — same bound pickRandomCompanyColor uses for the
 * identical problem on the manual-creation path (CompanyCrudControls.tsx), but seeded instead of
 * Math.random()-driven to stay reproducible. Attempt 0 uses the exact same dataId/offset pair as
 * before this fix ('company.identityColor', offset = c) — so a seed that never collides produces
 * byte-for-byte the same colors it always has; only a seed that *would* collide now diverges,
 * picking a different (still deterministic) color instead. Each retry attempt gets its own dataId
 * suffix (not an arithmetic offset shift) specifically so it can never accidentally land on another
 * company's own base draw and reintroduce a collision by a different path.
 */
function generateCompanyIdentityColor(noiseMap: NoiseFunction2D, offset: number, usedColors: string[]): string {
  const used = new Set(usedColors);
  for (let attempt = 0; attempt < ROBOT_IDENTITY_COLOR_NAMES.length; attempt++) {
    const dataId = attempt === 0 ? 'company.identityColor' : `company.identityColor.retry${attempt}`;
    const index = Math.min(
      ROBOT_IDENTITY_COLOR_NAMES.length - 1,
      Math.floor(getSeededVal(noiseMap, dataId, offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length)),
    );
    const color = ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[index]];
    if (!used.has(color)) return color;
  }
  // Bound exhausted (every one of the 18 colors already in use) — cannot happen at today's
  // INITIAL_COMPANIES_MAX (3), kept only as the same defensive last-resort
  // pickRandomCompanyColor's own bound uses.
  const index = Math.min(ROBOT_IDENTITY_COLOR_NAMES.length - 1, Math.floor(getSeededVal(noiseMap, 'company.identityColor', offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length)));
  return ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[index]];
}
```

Call site (`spawnInitialCompanies`, inside the `for (let c = 0; ...)` loop):

```typescript
const company: Company = {
  id: noiseMap ? generateCompanyId(noiseMap, c) : `company-${localeId}-${c}`,
  name: noiseMap ? generateCompanyName(noiseMap, c) : `Company ${c}`,
  color: noiseMap
    ? generateCompanyIdentityColor(noiseMap, c, (useLocaleStore.getState().getLocaleById(localeId)?.companies ?? []).map((co) => co.color))
    : ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[0]],
  robotIds: memberIds,
};
```

`useLocaleStore.getState().getLocaleById(localeId)?.companies` already reflects every company generated earlier
in this same loop, since each iteration calls `addCompany` before the next iteration's `generateCompanyIdentityColor`
call — no new accumulator array needed, no change to the loop's existing structure.

**Non-seeded fallback branch (`noiseMap` falsy) is out of scope.** It already hardcodes every company in that
branch to `ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[0]]` (guaranteed collision, not just possible) — but this
branch only runs when `getLocaleNoiseMap` can't produce a noise map for the locale at all, a defensive/degenerate
path with no confirmed real-world trigger (every other seeded field in this file has the identical fallback
shape). Fixing it would mean inventing non-seeded dedup logic for a path that may never actually execute in
production — flagged in §7, not fixed here without confirming it's reachable.

**Scope: per-locale, not cross-locale/session** — matches `pickRandomCompanyColor`'s existing scope exactly
(`companies` there is also implicitly the current locale's list only). Two companies in *different* locales can
still share a color; this was never in question (`pickRandomCompanyColor` doesn't dedupe across locales either).

---

## 2. Target File Structure

```text
src/
├── components/
│   └── panels/screen/console/
│       ├── RobotFilterPanel.tsx        # MODIFIED — §1.1 (gsap.set fix), §1.2 (close button, 2 schemas)
│       ├── RobotFilterPanel.css        # MODIFIED — §1.3 (sticky, content-height, grid placement)
│       ├── RobotFilterPanel.test.tsx   # MODIFIED — see §5
│       ├── RobotsTab.css               # MODIFIED — §1.3 (flex → grid)
│       └── RobotsTab.test.tsx          # possibly MODIFIED — see §5
└── systems/
    ├── spawnSystem.ts                  # MODIFIED — §1.4
    └── spawnSystem.test.ts             # MODIFIED — see §5
```

**Explicitly not touched, and why:**

- `RobotsTab.tsx` — no JSX/prop changes; `.robots-tab__body`'s new grid layout is driven entirely by
  `RobotFilterPanel`'s own existing `data-tier` attribute via `:has()` (§1.3).
- `Button.tsx` — no new props; both new/changed labels flow through the existing `humanLabel` field.
- `CompanyManager.tsx`, `CompanyCrudControls.tsx` (manual-creation path), `CompanyButtonRow.tsx` — untouched;
  `pickRandomCompanyColor`'s own dedup logic is reused as a *pattern* reference only, not called from or by
  `spawnSystem.ts`.
- `docs/COMPONENT_LIBRARY.md` — no primitive added/changed; still exactly 14, still the same `Button` contract.
- `uiStore.ts` — no state shape change; `open` stays `RobotFilterPanel`'s own local state, unchanged category.

No new dependency.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Per `CLAUDE.md`:** the slide animation stays a GSAP timeline registered in `timelineMap`
  (`setTimeline`/`killTimeline`), respecting `prefers-reduced-motion` — unchanged from the original spec's own
  constraint. The new `gsap.set()` mount call (§1.1) is an instant, untweened state sync — not itself a timeline,
  matching `CabinetBox.tsx`'s own precedent for the same kind of call — and is not gated behind
  `prefers-reduced-motion` (nothing animates; it just sets a value).
* **Company color generation must stay deterministic and seeded** (`getSeededVal`, no `Math.random()`) on the
  spawn path (§1.4) — `pickRandomCompanyColor`'s genuine randomness on the manual-creation path is unaffected and
  must not be touched.
* **No new persistent/shared "color pool" module** — the fix closes the gap by extending
  `generateCompanyIdentityColor`'s own signature (`usedColors` parameter) and internal retry loop, reading the
  already-current locale state at the call site — confirmed in interview, not a new module/store.
* **A seed that doesn't collide today must keep producing the same company colors it always has** — §1.4's
  attempt-0 draw is byte-for-byte identical to pre-fix behavior (same dataId, same offset); only colliding seeds
  see a changed (still deterministic) result.
* **Desktop's "robot list must never overlap the filter panel" constraint carries forward unchanged** from the
  original spec — §1.3's grid-column split (`260px 1fr`) is the new mechanism enforcing it, replacing the old
  flex `flex-shrink: 0` + `min-width: 0` mechanism, same guarantee.
* **The filter panel and its filtering behavior still exist only on `RobotsTab`** — unchanged, not revisited here.
* **No `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in `RobotFilterPanel`** — unchanged from the
  original spec's own constraint.

---

## 4. Code Style & Architecture Conventions

Full code shapes given inline in §1.1–§1.4 above.

**Naming:**
- `FILTER_TOGGLE_SCHEMA`/`FILTER_CLOSE_SCHEMA` — both `SCREAMING_SNAKE_CASE`, matching the existing
  `FILTER_TOGGLE_SCHEMA` convention (itself matching `ConsolePanel.tsx`'s `BACK_SCHEMA`).
- `.robot-filter-panel__close` — kebab-case, `__` BEM element separator, matching
  `.robot-filter-panel__toggle`'s own existing sibling convention exactly.
- `usedColors` parameter name on `generateCompanyIdentityColor` — matches `pickRandomCompanyColor`'s own
  `existingColors` parameter in spirit (`used`/`existingColors`); named `usedColors` here to read clearly at the
  call site (`.map((co) => co.color)`) rather than implying "colors that exist" more broadly.

**Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually
changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Locations:** Colocated, matching §2.

**`RobotFilterPanel.test.tsx` (MODIFIED):**
- Every existing `screen.getByRole('button', { name: /filters/i })` query still matches (`/filters/i` is a
  case-insensitive substring match against `'Show Filters'`/`'Hide Filters'` — unaffected).
- **New: mount initializes GSAP state.** At mobile/tablet tier, rendering calls
  `gsap.set` (mock it alongside the existing `setTimeline`/`killTimeline` mock) with
  `(panelRef.current, { xPercent: -100 })` on mount, before any toggle click. At desktop tier, it does not (the
  effect's own `isDesktop` guard).
- **New: close button.** At mobile/tablet tier, before opening: `screen.queryByRole('button', { name: /hide
  filters/i })` is `null`. After clicking the toggle (`{ name: /show filters/i }`): a `{ name: /hide filters/i }`
  button now renders; clicking *it* closes the panel (`isActive` class removed — same assertion style as the
  existing toggle-closes test) and the toggle button (`{ name: /show filters/i }`) is still present and enabled
  throughout, both before and after opening (asserts it never unmounts/disables).
- **New: desktop renders neither close nor toggle button** — extends the existing "renders no toggle button"
  desktop test to also assert `screen.queryByRole('button', { name: /hide filters/i })` is `null` (can't open a
  panel that's always open, so there's nothing to close).
- `data-tier` assertions unchanged.

**`RobotsTab.test.tsx` (possibly MODIFIED):** audit existing tests that query DOM structure/class names on
`.robots-tab__body`/`.robots-tab__list` (e.g. any that assert flex-specific classes or ordering) — the grid
rewrite (§1.3) changes CSS only, not element structure or document order, so behavioral assertions (card
presence, order, filtering) should be unaffected; only a test that specifically asserted the old flex mechanism
(unlikely, none seen while reading the current file) would need updating. Confirm at implementation time by
running the existing suite unmodified first.

**`spawnSystem.test.ts` (MODIFIED):**
- **New: `spawnInitialCompanies` never assigns two companies in the same locale the same color** across a
  meaningful sample of seeds (mirroring this file's existing `it('creates between ${MIN} and ${MAX} companies')`
  seed-sampling style) — assert `new Set(companies.map((c) => c.color)).size === companies.length` for each
  sampled seed/locale.
- **New: a non-colliding seed's colors are unchanged by this fix** — pick (or construct) a seed where the
  pre-fix draw never collides, assert `generateCompanyIdentityColor`'s attempt-0 output still matches what
  `getSeededVal(noiseMap, 'company.identityColor', c, 0, ROBOT_IDENTITY_COLOR_NAMES.length)` alone would produce
  — proving the "byte-for-byte identical when non-colliding" constraint from §3, not just the absence-of-duplicates
  outcome.
- **New: a constructed colliding case retries deterministically** — call `generateCompanyIdentityColor` twice
  with the same `noiseMap`/`offset`/`usedColors` and confirm identical output both times (determinism), and with
  `usedColors` containing the attempt-0 result, confirm the returned color differs and is *not* in `usedColors`.
- Existing company-count/size tests unaffected.

* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** `npm run dev`, open the Robots tile.
  1. At mobile width: tap "Show Filters" — confirm the panel now slides **fully** into view (§1.1's actual bug
     fix — the one item in this spec not provable by a unit test alone, since jsdom doesn't run GSAP's real
     transform math). Tap "Hide Filters" (the new button, top of the panel) — confirm it closes. Confirm "Show
     Filters" is still present/tappable underneath while the panel is open (tab to it, or briefly note its
     position).
  2. At mobile/tablet width: confirm the open panel is short (content-height, not full-screen) and sticky —
     scroll the robot list underneath it and confirm the panel stays on screen until the list itself ends.
  3. At desktop width: confirm the sidebar now stays on screen while scrolling the robot list (previously
     scrolled away), still never overlapping the list at a narrow desktop width with many cards.
  4. Confirm `prefers-reduced-motion` still makes the panel snap instead of sliding (unchanged behavior, verify
     it survived the `gsap.set()` addition).
  5. Reseed a planet a few times (Sector Settings) and spot-check a locale with 3 companies — confirm no two
     company buttons in `CompanyButtonRow` ever show the same color.

---

## 6. Documentation & Git/Workflow Context

* **`docs/specs/COMPANY_SECTION_ENHANCEMENTS.md` update needed:** §7 item 2 currently documents spawn-time
  collision-avoidance as accepted/out-of-scope, and the `generateCompanyIdentityColor` doc comment there states
  the same. Once this spec's §1.4 lands, that item should be marked resolved (reversed), pointing here — flagged
  so it isn't silently left stale, matching this repo's own precedent of correcting doc comments describing code
  that no longer matches (`CLAUDE.md`; the original filter-panel spec's own `buildCompanyButtonRowSchema` comment
  rewrite).
* **`docs/COMPANIES.md` audit:** does not currently document per-company color collision behavior at all (checked
  directly — no match); no update strictly needed, but worth a glance once implemented in case it's added there
  later.
* **`docs/COMPONENT_LIBRARY.md` update:** none needed — no primitive added, removed, or given a new prop.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** Flagged for the human to decide, same as the original spec's own open item — current
  branch state should be checked at implementation time (`git status`/`git branch`) rather than assumed here.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Given
  three independently-verifiable fixes (slide-in bug + close button are one coherent unit; sticky/grid layout is
  a second; the color-collision fix is fully independent of the other two, touching a different file with no
  shared code path), separate commits per fix are more reviewable than one combined commit — left for the
  Tasks phase to actually sequence.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, or reasoned through above — not left open):

- ~~Does the toggle hide while the panel is open?~~ **Resolved: no, stays mounted/focusable** (intent doc,
  confirmed via interview).
- ~~Does "sticky" apply to one tier or all?~~ **Resolved: all tiers** (intent doc, confirmed via interview).
- ~~Does content-height sizing apply to mobile/tablet too, or just desktop?~~ **Resolved: all tiers — the panel
  is short everywhere, which is why it covers the toggle** (intent doc, confirmed via interview).
- ~~Is the color fix a new shared "pool" abstraction or closing an existing gap?~~ **Resolved: close the existing
  gap** (intent doc, confirmed via interview).
- ~~What resolves the previous spec's open `aria-expanded` question?~~ **Resolved: state-changing accessible name
  across two buttons** (this spec, §1.2).

Still open — flag for Tasks/implementation, not blocking this spec:

1. **§1.1's root-cause diagnosis is inferred, not reproduced.** First implementation task should verify the bug
   live before writing the fix, in case the actual cause differs from the GSAP/CSS percentage-transform mismatch
   described here — if so, stop and reconcile this section rather than implementing a fix for the wrong cause.
2. **Non-seeded fallback branch's color collision (§1.4)** — left unfixed, flagged as possibly unreachable in
   production; confirm whether `noiseMap` can actually be null in a real (non-test) code path before deciding
   whether it's worth fixing.
3. **`docs/specs/COMPANY_SECTION_ENHANCEMENTS.md` §7 item 2 staleness (§6)** — not corrected as part of this spec
   itself, flagged for whoever implements it.
4. **`:has()` as a first-use CSS selector in this codebase (§1.3)** — flagged as a precedent-setting choice, not
   a blocking risk; revisit if it turns out to cause any issue this spec didn't anticipate.
5. **Branch choice (§6)** — left for the human.
