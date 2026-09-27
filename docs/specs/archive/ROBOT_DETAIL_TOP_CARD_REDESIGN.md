# Phase Spec: Redesign — Robot Detail Top Card

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-detail-top-card-redesign.md](../intent/robot-detail-top-card-redesign.md) (confirmed via `/interview-me`, 2026-09-16). Covers [Roadmap Phase 15.3](../todo/roadmap.md#153-redesign-robot-detail-top-card). Related prior art: [docs/specs/SLIDER_LINEAR_READ_ONLY.md](SLIDER_LINEAR_READ_ONLY.md) (the read-only `SliderLinear` this phase's Battery row already uses, unchanged) and [docs/specs/ROBOT_CARDS_REDESIGN.md](ROBOT_CARDS_REDESIGN.md) (15.2, the sibling redesign whose shipped `isRobotAudible`/`AUDIBILITY_LABELS` this phase reuses). Touches presentation plus one new label schema entry — no `AudioEngine` scheduling behavior change, no new Zustand field, no schema/type change to `controls.ts`.

> **Scope correction, found during this Specify pass (not in the intent doc):** The intent doc assumed Company had no visible label today and needed a new wrapping `DualLabel` row, and left Battery's label as an open point to confirm. Neither is true: `RadioButton.tsx` and `SliderLinear.tsx` both already compose their own internal `DualLabel` from `schema.loreLabel`/`schema.humanLabel` unconditionally — `buildCompanyAssignmentSchema`'s existing `humanLabel: 'Company'` and `BATTERY_READOUT_SCHEMA`'s existing `humanLabel: 'Battery Data'` already render today, in the right order, with no changes needed. Confirmed with Crawford before writing this spec. **Actual scope is narrower than the intent doc implies**: only the Name/Job/Docking/Status grid layout and the new Status field are real work; Battery and Company rows are untouched.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and what's changing

`RobotDisplaySection.tsx` today is a vertical stack: a centered avatar, then three `DualLabel`-captioned rows (Name, Job, Docking — each `.robot-display-section__row`, a flex row with `justify-content: space-between`), with the read-only Battery `SliderLinear` inserted between Job and Docking, and the company `RadioButton` last.

This phase restructures the avatar-and-first-three-fields portion into a centered-avatar grid, and adds a fourth field (Status) that doesn't exist yet:

```
┌─────────────┬───────────┬─────────────┐
│ Name         │           │ Job         │
│              │  avatar   │             │
│ Docking      │  (96×96)  │ Status      │
└─────────────┴───────────┴─────────────┘
        [ Battery — SliderLinear, unchanged ]
        [ Company — RadioButton, unchanged ]
```

A 3-column, 2-row CSS Grid — not a literal circular/orbital arrangement (explicitly ruled out during `/interview-me`): the avatar occupies the center column, spanning both rows; Name/Job sit in row 1 (left/right columns); Docking/Status sit in row 2 (left/right columns). Battery and Company keep their exact current position (directly below the grid, in that order) and exact current markup — see the Scope correction above.

**Every field keeps its `DualLabel` lore/human caption pair** — a deliberate divergence from 15.2's unlabeled card, confirmed directly during `/interview-me`: "keep them, easier to remove them later if I don't like it."

### 1.2 The new Status field

Status is new to this component (it doesn't exist in the current `RobotDisplaySection` at all) — true audibility, reusing 15.2's shipped machinery exactly, not re-derived:

- `isRobotAudible(audioMode, anySolo)` from `src/utils/robotAudibility.ts` — **note the current signature**: `anySolo: boolean`, not a `Robot[]` array (refactored after `ROBOT_CARDS_REDESIGN.md` §1.2 was written, for a re-render perf fix — that older spec's code samples show the pre-refactor signature and are stale on this point).
- `AUDIBILITY_LABELS.emitting`/`.disabled` from `src/data/robotSelectionConfig.ts` (already shipped by 15.2) for the *value* text.
- A **new** field-level label pair for the *Status* row itself — `ROBOT_SELECTION_ROW_SCHEMAS.status` — since 15.2's card never wrapped Status in a `DualLabel` (it renders unlabeled, combined with Docking into one bare line), no field-level lore/human pair for "Status" exists anywhere yet.

`anySolo` is derived the same way `RobotSelectionCard.tsx` already does — a boolean-typed Zustand selector, not a subscription to the whole robots array (that array-subscription shape was the exact re-render bug `isRobotAudible`'s own doc comment describes fixing):

```typescript
const anySolo = useLocaleStore((s) => (s.locales[localeId]?.robots ?? []).some((r) => r.audioMode === 'solo'));
```

### 1.3 New schema entry: `ROBOT_SELECTION_ROW_SCHEMAS.status`

```typescript
status: { id: 'robotSelection.status', type: 'dualLabel', loreLabel: 'ACOUSTIC EMISSION STATE', humanLabel: 'Status' },
```

Best-guess lore label, same convention as every other draft entry in this file (`AUDIBILITY_LABELS`'s own comment: "flagged for Crawford's review, not treated as final") — flagged the same way here.

### 1.4 Judgment calls made while translating intent into a concrete design

Per this skill's "surface assumptions immediately" step — none of these were asked during `/interview-me`:

1. **Grid mechanics**: a 3-column (`1fr auto 1fr`) × 2-row CSS Grid, avatar in the center column spanning both rows via `grid-row: 1 / span 2`. This is the simplest structure that reads as "fields around a centered avatar" without inventing a circular layout technique nothing else in the app uses. The intent doc explicitly leaves exact grid sizing/spacing open.
2. **Left/right column text alignment**: column 1 fields (Name, Docking) left-aligned; column 3 fields (Job, Status) right-aligned — so each pair visually "flanks" the avatar rather than both sides reading identically. A cosmetic default, not fixed by the intent doc; easy to flip in CSS alone if wrong.
3. **Each grid field stacks its `DualLabel` above its value** (vertical, not the old row's side-by-side `space-between`) — a quadrant is narrower than the old full-width row, and label-above-value reads better at narrow widths than forcing both onto one line. The old `.robot-display-section__row`/`__value` classes are retired for the four grid fields; Battery/Company are untouched (§ Scope correction) and don't use this class at all today.
4. **No responsive breakpoint tiers added** — this app is mobile-first and the existing component has none; the grid is expected to hold at every width this screen already renders at (it's plain text in a 3-column grid, not a fixed-size control like a voxel-track slider). Flagged as a manual-check item in §5, not assumed safe without verification.

---

## 2. Target File Structure

```text
src/
├── components/robot/
│   ├── RobotDisplaySection.tsx       # MODIFIED — §4
│   ├── RobotDisplaySection.css       # MODIFIED — §4
│   └── RobotDisplaySection.test.tsx  # MODIFIED — see §5
└── data/
    ├── robotSelectionConfig.ts       # MODIFIED — ROBOT_SELECTION_ROW_SCHEMAS.status added, §1.3
    └── robotSelectionConfig.test.ts  # MODIFIED — see §5
docs/
└── reference/
    └── ROBOT_DATA_GRID.md   # MODIFIED — one new confirmed-table row for the Status field itself
                                #   (English Label "Status" / Lore Label "ACOUSTIC EMISSION STATE"),
                                #   flagged draft/unconfirmed inline the same way AUDIBILITY_LABELS'
                                #   own two Draft-table value rows already are — see §6
```

**Explicitly not touched, and why:**

- `src/components/selection/RobotSelectionCard.tsx` — the sibling 15.2 card; already shipped with its own unlabeled fields and combined "Docking · Status" line. This phase doesn't revisit or reconcile that card's copy/layout.
- `src/utils/robotAudibility.ts` — reused exactly as shipped; no signature or behavior change.
- `src/data/robotSelectionConfig.ts`'s `BATTERY_READOUT_SCHEMA`, `AUDIBILITY_LABELS`, `JOB_TYPE_LABELS`, `DOCKING_STATE_LABELS` — reused exactly as-is (§ Scope correction: Battery needs no relabeling).
- `src/data/companyConfig.ts`'s `buildCompanyAssignmentSchema` — reused exactly as-is (§ Scope correction: Company needs no wrapping).
- `src/components/ui/controls/RadioButton.tsx`, `SliderLinear.tsx`, `DualLabel.tsx`, `RobotBody.tsx` — reused completely as-is; no prop/contract change needed by any of them.
- `src/components/company/CompanyOptionsSection.tsx` — does not render `RobotDisplaySection` at all (grep-confirmed); company-broadcast editing is unaffected by this phase.
- `src/components/robot/AudioSettingSection.tsx`, `PingControlsDrawer.tsx`, `PingContourDrawer.tsx`, `SignatureArrayDrawer.tsx` — already extracted out of `RobotDisplaySection` in earlier work (`docs/tasks/DIRECTIONAL_PANEL_WIRING.md` Task 5); untouched by this phase.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Battery and Company rows are byte-for-byte unchanged** beyond their position relative to each other (which is already correct — no reorder needed). Do not add a wrapping `DualLabel`, `<div>`, or any other markup around either — see the Scope correction at the top of this spec. If implementation reveals either is *not* already labeled as described, stop and flag it rather than silently adding a workaround.
* **`isRobotAudible` is called with `(audioMode, anySolo)` — a boolean second argument**, not a robots array. Confirm this against the live `src/utils/robotAudibility.ts` signature before writing the call site; do not copy the older array-based signature from `ROBOT_CARDS_REDESIGN.md`'s own code samples (stale, pre-refactor).
* **No literal circular/orbital CSS** (no `border-radius: 50%` positioning trick, no `transform: rotate`-based placement) — a 3-column/2-row grid only, per §1.4 item 1.
* **No `setTimeout`/`setInterval`/`requestAnimationFrame`** — this is markup/CSS restructuring plus one new label schema entry, no new timing behavior.
* **Robot visuals still map strictly to audio attributes per `ROBOT_DESIGN.md`** — unaffected by this phase, which only touches card chrome around the avatar, not the avatar's own rendering.
* **`sc-`-prefixed classes are untouched** — this card's own classes stay the existing `robot-display-section` (not `sc-`) prefix; only `SliderLinear`'s/`RadioButton`'s own internal `sc-*` classes (unchanged, reused as-is) apply within Battery/Company.

---

## 4. Code Style & Architecture Conventions

**`RobotDisplaySection.tsx`** (full new shape):

```tsx
import { memo, useCallback, useMemo } from 'react';
import { RobotBody } from '@/components/robot/RobotBody';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { isRobotAudible } from '@/utils/robotAudibility';
import {
  ROBOT_SELECTION_ROW_SCHEMAS,
  BATTERY_READOUT_SCHEMA,
  JOB_TYPE_LABELS,
  UNASSIGNED_JOB_LABEL,
  DOCKING_STATE_LABELS,
  AUDIBILITY_LABELS,
} from '@/data/robotSelectionConfig';
import { FREELANCE_VALUE, buildCompanyAssignmentSchema } from '@/data/companyConfig';
import type { Robot } from '@/types/Robot';

import './RobotDisplaySection.css';

interface RobotDisplaySectionProps {
  robot: Robot;
}

/**
 * Robot Options' always-visible header block (not an AccordionContainer — see
 * docs/specs/ROBOT_OPTIONS.md §1). Redesigned Roadmap 15.3: a centered, day/night-invariant avatar
 * (RobotBody, ignoreDaylight) inside a 3-column/2-row grid — Name/Job in row 1, Docking/Status in
 * row 2, all four keeping their DualLabel lore/human captions (unlike sibling Phase 15.2's
 * unlabeled RobotSelectionCard — a deliberate divergence, confirmed via /interview-me). Status is
 * true audibility (isRobotAudible, shared with 15.2), not just this robot's own audioMode. Battery
 * (read-only SliderLinear, Roadmap 15.1) and Company (RadioButton, Roadmap 10.5) sit below the
 * grid, unchanged from before this phase — both already compose their own internal DualLabel from
 * their schema's loreLabel/humanLabel, so neither needed new wrapping markup (see this spec's own
 * Scope correction). No job reassignment, no docking-state override — both stay fully
 * system-driven. Audio Setting/Volume were rendered here through Roadmap Phase 10, then extracted
 * to RobotOptionsTab/CompanyOptionsSection as their own top-level Output panel
 * (docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 5) — this component is pure read-only meta-data
 * display plus the company RadioButton, nothing editable beyond that.
 */
function RobotDisplaySectionInner({ robot }: RobotDisplaySectionProps) {
  const localeId = getActiveLocaleId();
  const jobLabel = robot.job ? JOB_TYPE_LABELS[robot.job.type] : UNASSIGNED_JOB_LABEL;
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);
  const anySolo = useLocaleStore((s) => (s.locales[localeId]?.robots ?? []).some((r) => r.audioMode === 'solo'));
  const companyAssignmentSchema = useMemo(() => buildCompanyAssignmentSchema(companies), [companies]);
  const statusLabel = isRobotAudible(robot.audioMode, anySolo) ? AUDIBILITY_LABELS.emitting : AUDIBILITY_LABELS.disabled;

  const handleCompanyChange = useCallback((value: string) => {
    useLocaleStore.getState().assignRobotToCompany(localeId, robot.id, value === FREELANCE_VALUE ? null : value);
  }, [localeId, robot.id]);

  return (
    <div className="robot-display-section">
      <div className="robot-display-section__grid">
        <div className="robot-display-section__field robot-display-section__field--name">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.name} />
          <span className="robot-display-section__value">{robot.name || robot.id}</span>
        </div>
        <div className="robot-display-section__field robot-display-section__field--job">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.job} />
          <span className="robot-display-section__value">{jobLabel.humanLabel}</span>
        </div>

        <svg className="robot-display-section__avatar" viewBox="-80 -80 160 160" aria-hidden="true">
          <RobotBody robot={robot} ignoreDaylight />
        </svg>

        <div className="robot-display-section__field robot-display-section__field--docking">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.docking} />
          <span className="robot-display-section__value">{DOCKING_STATE_LABELS[robot.docking].humanLabel}</span>
        </div>
        <div className="robot-display-section__field robot-display-section__field--status">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.status} />
          <span className="robot-display-section__value">{statusLabel.humanLabel}</span>
        </div>
      </div>

      <SliderLinear schema={BATTERY_READOUT_SCHEMA} value={Math.round(robot.batteryLevel)} onChange={() => {}} readOnly />

      <RadioButton
        schema={companyAssignmentSchema}
        value={robot.companyId ?? FREELANCE_VALUE}
        onChange={handleCompanyChange}
      />
    </div>
  );
}

// React.memo (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 5) — unchanged from before this
// phase; see that task doc for why this bails on an identical `robot` reference but not on a new
// one with identical field values (spec §1.2.3 there).
export const RobotDisplaySection = memo(RobotDisplaySectionInner);

export default RobotDisplaySection;
```

Note what changed from today's file: the old `.robot-display-section__row` wrapper around Docking is gone (folded into the grid's `--field--docking`); the bare `<div className="robot-display-section__row">` that used to wrap the company `RadioButton` is removed — `RadioButton` is now a direct child, exactly matching how `SliderLinear` (Battery) was already a direct child with no wrapper. `isRobotAudible`/`AUDIBILITY_LABELS`/`anySolo` are the only genuinely new pieces.

**`RobotDisplaySection.css`** (replaces the old `__avatar`/`__row`/`__value` rules with the grid):

```css
.robot-display-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem 0;
  /* Applied at the root (docs/specs/TYPE_SCALE.md §1.5) — every DualLabel-bearing descendant here
     shares this one rule, matching RobotSelectionCard.css's own version of this fix. RadioButton's
     own explicit font-family still wins by cascade regardless. */
  font-family: var(--font-controls);
  font-weight: var(--font-weight-control);
}

.robot-display-section__grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.robot-display-section__avatar {
  grid-column: 2;
  grid-row: 1 / span 2;
  width: 96px;
  height: 96px;
}

.robot-display-section__field {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.robot-display-section__field--name,
.robot-display-section__field--docking {
  grid-column: 1;
  text-align: left;
}

.robot-display-section__field--job,
.robot-display-section__field--status {
  grid-column: 3;
  text-align: right;
}

.robot-display-section__field--name,
.robot-display-section__field--job {
  grid-row: 1;
}

.robot-display-section__field--docking,
.robot-display-section__field--status {
  grid-row: 2;
}

.robot-display-section__value {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}
```

* **Naming conventions:** `robot-display-section__grid`/`__field`/`__field--name`/`__field--job`/`__field--docking`/`__field--status` — plain BEM-style elements/modifiers, same non-`sc-` prefix convention this file already uses.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

**`robotSelectionConfig.ts`** (diff — add `.status` to `ROBOT_SELECTION_ROW_SCHEMAS`, §1.3):

```typescript
export const ROBOT_SELECTION_ROW_SCHEMAS = {
  name: { id: 'robotSelection.name', type: 'dualLabel', loreLabel: 'ROBOT IDENTIFIER', humanLabel: 'Robot Name' },
  job: { id: 'robotSelection.job', type: 'dualLabel', loreLabel: 'ASSIGNED PROTOCOL', humanLabel: 'Job Data' },
  docking: { id: 'robotSelection.docking', type: 'dualLabel', loreLabel: 'DOCKING STATE', humanLabel: 'Docked Status' },
  // status: new field-level DualLabel (Roadmap 15.3) — the Status VALUE labels (AUDIBILITY_LABELS,
  // below) already existed from Roadmap 15.2, but that card never wrapped Status in a DualLabel of
  // its own (it renders bare, combined with Docking into one line) — this is the first FIELD-level
  // lore/human pair for Status. Best-guess draft, pending review, same as AUDIBILITY_LABELS itself.
  status: { id: 'robotSelection.status', type: 'dualLabel', loreLabel: 'ACOUSTIC EMISSION STATE', humanLabel: 'Status' },
} satisfies Record<string, DualLabelSchema>;
```

No other exports in this file change.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`RobotDisplaySection.test.tsx` (modified):**
  - The existing "renders Name/Job/Docking as plain text..." test needs re-targeting: `.robot-display-section__value` now also includes Status (4 values, not 3) — update the expected array to `['Test Robot', 'Acoustic Survey', 'Active', 'Emitting']` (or the equivalent for whatever `makeRobot()` default resolves to via `isRobotAudible`), and confirm each `.robot-display-section__value` is still not wrapped in any interactive role.
  - The existing Battery test ("renders Battery as a read-only SliderLinear readout...") and the existing company-assignment `describe` block need no logic changes — both already assert against markup this phase doesn't touch (§ Scope correction) — but re-run them to confirm no incidental breakage from the grid restructure around them.
  - New: renders Status text correctly for an audible robot (`audioMode: 'none'`, no other robot in the locale `solo`) → "Emitting", and for a muted robot (`audioMode: 'mute'`) → "Disabled".
  - New: Status reflects locale-wide solo — a robot with `audioMode: 'none'` reads "Disabled" once another robot in the same locale (added via `useLocaleStore.getState().addRobot`) has `audioMode: 'solo'`; reads "Emitting" again once that solo robot is removed/reassigned. Mirrors `RobotSelectionCard.test.tsx`'s own equivalent assertions for the same predicate.
  - New: each of Name/Job/Docking/Status renders inside the app's existing `DualLabel` markup (query for `.sc-dual-label__human` text matching each field's `humanLabel`, e.g. "Robot Name", "Job Data", "Docked Status", "Status") — asserting the "keep labels" decision is actually implemented, not just that the value text is present.
  - New (regression for the Scope correction): Battery's `SliderLinear` still renders its own `.sc-dual-label__human` reading "Battery Data", and the Company `RadioButton` still renders its own `.sc-dual-label__human` reading "Company" — confirming neither needed the wrapping markup the intent doc originally assumed, and that this phase didn't accidentally duplicate or remove either.
* **`robotSelectionConfig.test.ts` (modified):** `ROBOT_SELECTION_ROW_SCHEMAS`'s shape assertions gain `.status`; assert its `loreLabel`/`humanLabel` are both non-empty strings, same shape as `.name`/`.job`/`.docking`.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** `npm run dev`, open Robot Options for any robot. Confirm: avatar sits centered with Name/Job above it (left/right) and Docking/Status below it (left/right), each with a visible small caption above its value; Battery slider and Company picker render below, unchanged from before. Resize to the narrowest supported width and confirm no field's text overflows its column illegibly (§1.4 item 4 — not assumed safe without this check). Set one robot's Audio Setting to Solo (via a different robot's Robot Options) and confirm this robot's own Status flips to "Disabled" when it isn't the soloed one.

---

## 6. Documentation & Git/Workflow Context

* **`docs/reference/ROBOT_DATA_GRID.md` update:** append one new row to the confirmed table (not the Draft table — this is a field, matching the shape of "Docked Status"/"Company" above it), flagged inline as unconfirmed since its lore label is this spec's own best guess, not yet Crawford-reviewed:

  | English Label | Lore Label | Component | Min Value | Max Value | Has LFO | Notes |
  |---|---|---|---|---|---|---|
  | Status | ACOUSTIC EMISSION STATE *(draft, unconfirmed)* | Dual Label Component | N/A | N/A | No | Display only. True audibility (`isRobotAudible`) — Robot Options' own Status field, Roadmap 15.3. Values: Emitting, Disabled (see Draft table below) |

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/robot-detail-top-card-redesign`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `robotSelectionConfig.ts`'s `.status` addition (+ test), (2) `RobotDisplaySection.tsx`/`.css` grid restructure + Status wiring (+ test), (3) `docs/reference/ROBOT_DATA_GRID.md`.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, the `/interview-me` thread, or reasoned through above — not left open):

- ~~Literal circular layout, or a grid?~~ **Resolved: grid** (confirmed via interview).
- ~~Are Docking and Status separate quadrants or combined like 15.2?~~ **Resolved: separate** (confirmed via interview).
- ~~Do Name/Job/Docking/Status keep their `DualLabel` captions?~~ **Resolved: yes, keep them** (confirmed via interview — a correction to the original roadmap draft).
- ~~Does Company get a new wrapping `DualLabel`?~~ **Resolved: no new markup needed — already labeled via `RadioButton`'s own internal `DualLabel`** (found during this Specify pass; see the Scope correction at the top of this spec).
- ~~Does Battery get relabeled "Power"?~~ **Resolved: no — stays "Battery Data," matching 15.2** (confirmed via interview, a correction to the original roadmap draft).

Still open — flag for Plan/Tasks, not blocking this spec:

1. **Grid column/row proportions and gap sizing (§1.4 item 1)** are this spec's own starting point, not a pixel-perfect mandate — the intent doc explicitly leaves this open. Revisit after the manual check in §5 if the 96px avatar feels cramped against narrow-column text.
2. **Left/right text alignment (§1.4 item 2)** is a cosmetic default (Name/Docking left, Job/Status right) — flag for Crawford's visual review; trivial to flip in CSS alone if it reads wrong once actually rendered.
3. **Status's lore label ("ACOUSTIC EMISSION STATE") and the Docs §6 table addition** are both unconfirmed drafts, same status as every other best-guess lore label in `robotSelectionConfig.ts` — pending Crawford's review, not blocking implementation.
