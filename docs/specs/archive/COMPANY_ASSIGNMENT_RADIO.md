# Phase Spec: Company Assignment — `Select` → `RadioButton` (Roadmap Phase 10.5)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/company-assignment-radio.md](../intent/company-assignment-radio.md)
(confirmed via `/interview-me`, 2026-09-10). Not derived from an existing roadmap draft — this phase
doesn't exist in `docs/todo/roadmap.md` yet; it's inserted by this spec as `10.5`, the same
out-of-sequence pattern `10.1`–`10.4` already used. Prior art this spec follows directly:
`buildCompanyButtonRowSchema`/`NONE_VALUE` (`src/data/companyConfig.ts`) — the sibling company-list
`RadioButtonSchema` builder already shipped for `CompanyButtonRow`, reused here as the direct structural
template; `RadioButton.tsx`'s own deselect-to-empty guard (`if (next) onChange(next)`), reused unmodified.
This phase touches presentation and one data-config function only — no `AudioEngine`, `BeatClock`, or
`Locale`/`Robot`/`Company` shape change; `assignRobotToCompany` is unchanged.

---

## 1. Overview & Claude Explanation

The intent doc confirms three things beyond the surface control swap: `Select` is removed outright (not
left unused), the removal reaches into the still-open roadmap (cutting `11.1.8`), and the whole pass goes
through a written spec/tasks trail. Research below resolves the concrete mechanics and corrects one
miscount in the intent doc itself.

### 1.1 The schema builder is renamed, not just retyped

`buildCompanySelectSchema` (`src/data/companyConfig.ts`) already returns the exact `{ value, label }[]`
shape `RadioButtonSchema` expects — Freelance first via `FREELANCE_VALUE`, then every company in array
order — so the data itself needs no change. Left named `buildCompanySelectSchema` while returning
`type: 'radio'` would read as a lie about what it builds, so it's renamed to
`buildCompanyAssignmentSchema`, matching `buildCompanyButtonRowSchema`'s own naming pattern (named for what
it's *for*, not the control type it happens to render through). `FREELANCE_VALUE`'s own id (`'company.assign'`)
is unchanged — no other schema uses that id, so no `timelineMap`-key collision risk from keeping it.

### 1.2 `FREELANCE_VALUE`'s own justification no longer holds — reworded, not removed

`FREELANCE_VALUE`'s existing doc comment reasons entirely from `Select`: "Radix `Select.Item` rejects an
empty-string value." `RadioButton.tsx`'s own underlying `ToggleGroup` also emits `''` on a deselect-to-empty
click, but `RadioButton.tsx` (line 53) already guards against that itself (`if (next) onChange(next)` — a
falsy, i.e. empty, `next` never reaches `onChange`), so `FREELANCE_VALUE` being non-empty is no longer
load-bearing against a framework rejection the way it was for `Select`. It's kept anyway, for the same
reason `NONE_VALUE`'s own comment already gives for itself: a non-empty sentinel for defensiveness and
symmetry with the file's other sentinels, and because every consumer already branches on it
(`value === FREELANCE_VALUE ? null : value`) — changing the sentinel's shape would be a gratuitous risk for
zero benefit. The comment is reworded to say this; the value itself (`'__freelance__'`) is unchanged.

### 1.3 The nested-interactive click guard stays — the *reason* it's needed changes

`RobotSelectionCard.tsx`'s `stopBubble` handler and its wrapping `onClick`/`onKeyDown` on the company row
are still required: a `RadioButton` option is a real DOM `<button>` (Radix `ToggleGroup.Item`), nested
inside the card's own `role="button"` `<li onClick={handleActivate}>` — without the guard, clicking or
key-activating an option would still bubble up and also fire `handleActivate()`, exactly like `Select`'s
trigger did. What changes is *why* a DOM-tree guard is sufficient now: `Select`'s dropdown options rendered
into a Radix `Portal` outside the card's DOM subtree, which is why the existing comment specifically calls
out that "React re-propagates portal events along the component tree, not the DOM tree" — a plain
`target.closest()` check would have missed those. `RadioButton` has no portal at all; every option is a
literal DOM descendant of the row `stopBubble` is already attached to. The mechanism (`stopPropagation` at
the row) doesn't need to change, but the comment explaining it is now overspecified for a portal case that
no longer exists — reworded to state the plain nested-interactive-element reason directly, dropping the
portal-specific justification.

### 1.4 Corrects the intent doc: the Design System reverts to **14** primitives, not 13

The intent doc's own Outcome/Success sections say "revert to 13 primitives." Checked against
`docs/COMPONENT_LIBRARY.md` and `src/types/controls.ts` directly: the Design System shipped Phase 1 at
**13**, `Select` (Phase 10) made it **14**, and `DirectionalPanel` (shipped after Select, per
`docs/specs/DIRECTIONAL_PANEL.md`) made it **15** — the count `CONTROL_SCHEMA_TYPES`'s own
`toHaveLength(15)` assertion (`src/types/controls.test.ts`) and `COMPONENT_LIBRARY.md`'s "All 15 live in…"
line both confirm as today's real, current count. Removing `Select` now takes the live count from **15
back to 14** — `DirectionalPanel` isn't touched by this phase and stays in the inventory. This spec
supersedes the intent doc's "13" on every point where it appears; nothing about the intent doc's actual
*decision* (remove `Select` entirely) changes, only the resulting number.

### 1.5 A pre-existing side effect of 1.4: `CLAUDE.md`'s reference bullet needs **no edit**

Checked directly rather than assumed: `CLAUDE.md`'s own reference-doc bullet already reads "The **14**
stateless UI primitives in `src/components/ui/controls/`…" — a number that was accurate the moment `Select`
shipped (Phase 10, 13→14) but has been **silently stale since `DirectionalPanel` shipped** (14→15,
`CLAUDE.md` never updated to 15). This phase's own removal (§1.4, 15→14) makes `CLAUDE.md`'s existing text
correct again by coincidence, not by any edit this phase makes. Flagged explicitly in §7 so this isn't
"fixed" to 15 mid-implementation by someone assuming it must currently say the right thing, and so the
Tasks phase doesn't schedule a `CLAUDE.md` edit that isn't actually needed.

### 1.6 Cascading count text: one more pre-existing stale "14" that also self-corrects

`src/data/companyConfig.test.ts` (line 19) already reads `'every schema type is one of the 14 closed-set
ControlSchema variants'` — also stale today (real count is 15, same root cause as §1.5), and also becomes
accurate again once this phase's removal lands. No edit needed to that describe-block string either; noted
for the same reason as §1.5.

### 1.7 Test consolidation: the portal-specific double-fire test has no `RadioButton` equivalent

`RobotSelectionCard.test.tsx` currently has two separate "doesn't also select the robot" tests: one for
clicking the `Select` trigger, one specifically for clicking a *portaled* dropdown option (added because a
DOM-only guard would have missed exactly that case, per §1.3). `RadioButton` collapses trigger and option
into the same thing — there is no portal, and no separate "open the dropdown" step — so these two tests
collapse into one (§5): "clicking a company radio option does not also select the robot." This is a
deliberate reduction, not an accidental coverage loss — the scenario the second test existed to catch
(portal event re-propagation) cannot occur with a non-portaled control.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── controls.ts                 # MODIFIED — SelectSchema interface removed, removed from the
│   │                                #   ControlSchema union, 'select' removed from CONTROL_SCHEMA_TYPES
│   │                                #   (15 → 14 entries)
│   └── controls.test.ts            # MODIFIED — SelectSchema import/fixture removed, counts updated
│                                    #   15 → 14 (§4)
├── data/
│   ├── companyConfig.ts            # MODIFIED — buildCompanySelectSchema renamed to
│   │                                #   buildCompanyAssignmentSchema, returns RadioButtonSchema
│   │                                #   (type: 'radio'); FREELANCE_VALUE/NONE_VALUE doc comments
│   │                                #   reworded (§1.1/§1.2); SelectSchema import dropped
│   └── companyConfig.test.ts       # MODIFIED — renamed import/calls, schema.type assertion
│                                    #   'select' → 'radio', FREELANCE_VALUE test description reworded
├── components/
│   ├── selection/
│   │   ├── RobotSelectionCard.tsx      # MODIFIED — Select → RadioButton (§1.1/§1.3), full
│   │   │                                #   replacement below (§4)
│   │   └── RobotSelectionCard.test.tsx # MODIFIED — company-assignment describe block rewritten
│   │                                    #   for RadioButton roles/interactions (§1.7, §5)
│   ├── robot/
│   │   ├── RobotDisplaySection.tsx      # MODIFIED — Select → RadioButton (§1.1), full replacement
│   │   │                                #   below (§4)
│   │   └── RobotDisplaySection.test.tsx # MODIFIED — company-assignment describe block rewritten (§5)
│   └── ui/controls/
│       ├── Select.tsx               # DELETED
│       ├── Select.css               # DELETED
│       └── Select.test.tsx          # DELETED

docs/
├── COMPONENT_LIBRARY.md   # MODIFIED — "All 15" → "All 14"; CONTROL_SCHEMA_TYPES paragraph updated;
│                           #   Select's table row and its own "### Select" subsection removed;
│                           #   one-sentence historical pointer added (§6)
├── COMPANIES.md           # MODIFIED — "Company Membership" section: Select/dropdown language →
│                           #   RadioButton, the "14th primitive" callout dropped, the stopPropagation
│                           #   paragraph reworded per §1.3, FREELANCE_VALUE description reworded (§6)
└── todo/roadmap.md     # MODIFIED — new `## 10.5` section added after `10.4`; `## 11.1.8` marked
                            #   Cut (Select no longer exists to wire in); small text updates to
                            #   `11.1.9`'s and `11.2`'s own prose, which both still actively described
                            #   Select as in-scope future work (§6)
```

**Explicitly not touched, and why:**

- `src/components/company/CompanyButtonRow.tsx`/`.css`/`.test.tsx`, `src/data/companyConfig.ts`'s
  `NONE_VALUE`/`ALL_VALUE`/`buildCompanyButtonRowSchema` — a different feature (viewing/bulk-editing a
  company) already built on `RadioButton`, untouched by this phase (confirmed intent, "Out of scope").
- `src/stores/localeStore.ts`'s `assignRobotToCompany` — the data-flow function itself; only *what calls
  it* changes (still the same two call sites, same arguments).
- `src/components/robot/RobotOptionsTab.tsx`, `src/components/company/CompanyOptionsSection.tsx` — neither
  imports `Select` (confirmed by a repo-wide search for `Select`/`SelectSchema` usage; the only real
  consumers are the two files in §2).
- `docs/reference/ROBOT_DATA_GRID.md`, `docs/UI_SHELL.md` — neither mentions `Select`/a dropdown/`combobox`
  for company assignment (confirmed by direct search); no stale reference to correct.
- `docs/specs/COMPANIES.md`, `docs/tasks/COMPANIES.md`, `docs/intent/companies.md`, this roadmap's own
  `## 10` section — historical record of what Phase 10 actually shipped and decided at the time (including
  adding `Select` as the 14th primitive), left as-is per this codebase's own established precedent (e.g.
  `10.4`'s own Docs section: "this roadmap's own `## 10.1` section stay[s] untouched — historical record of
  what was decided at the time, including 10.1's own now-reversed... call"). `docs/todo/roadmap.md`'s
  `## 10` Docs checklist item recording "`CLAUDE.md`'s reference bullet text… updated to 14" is not
  rewritten either — it accurately records what happened *then*; it doesn't need to anticipate this phase's
  later reversal.
- `CLAUDE.md` — no edit; see §1.5.
- `src/data/companyConfig.test.ts`'s "14 closed-set ControlSchema variants" describe-block string — no
  edit; see §1.6.
- Every non-company `ControlSchema` variant/primitive file — no other consumer of `SelectSchema`/`Select`
  exists (confirmed by repo-wide search); nothing else in `src/` references either name.

No new dependency. No file is renamed except `Select.tsx`/`.css`/`.test.tsx`'s deletion (not a rename —
`RadioButton.tsx` already existed and is reused as-is, not created to replace it).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`RadioButton` is reused exactly as shipped (Roadmap `11.1.6`) — no prop added, no new variant.** Do not
  give it a `disabled`-per-option, a new size, or any other change to accommodate this phase; both call
  sites already pass exactly the props `RadioButton` already accepts (`schema`, `value`, `onChange`).
* **`assignRobotToCompany`'s call signature and semantics are unchanged.** `handleCompanyChange`
  (both call sites) keeps the exact same body:
  `assignRobotToCompany(localeId, robot.id, value === FREELANCE_VALUE ? null : value)`.
* **`buildCompanyAssignmentSchema`'s option order is unchanged: Freelance first, then companies in
  `companies` array order.** Do not re-sort, alphabetize, or otherwise reorder — this was already the
  confirmed-correct order before this phase (the intent doc's own framing was "Freelance should go first,
  then the remaining companies," which the existing `buildCompanySelectSchema` already did).
* **`RobotSelectionCard`'s `stopBubble` guard (both `onClick` and `onKeyDown`) is preserved, not removed.**
  §1.3 confirms it's still required; do not delete it under the assumption that removing the portal made it
  unnecessary.
* **`FREELANCE_VALUE`'s literal value (`'__freelance__'`) does not change** — only its doc comment (§1.2).
  Do not introduce a second sentinel or repurpose `NONE_VALUE`/`ALL_VALUE` for this schema.
* **No `ControlSchema` variant is added.** This phase only removes one (`SelectSchema`) — do not introduce
  a replacement variant; `RadioButtonSchema` (already existing) is reused as-is.
* **`Select.tsx`/`.css`/`.test.tsx` are deleted outright, not deprecated/kept-unused.** Per the confirmed
  intent ("Remove it entirely") — do not follow `Stepper`/`StepperWithToggle`'s own "kept in the codebase,
  unused" precedent here; that precedent was for primitives with no live consumer at all going forward but
  worth keeping for their own general shape, which was a different call than this one.
* **CLAUDE.md's Strict Separation and audio/animation guardrails are not implicated.** No `AudioEngine`,
  `BeatClock`, GSAP timeline, or Zustand-shape change anywhere in this phase — pure presentation
  (control-type swap) plus one data-config rename plus documentation bookkeeping.
* **Do not edit `CLAUDE.md`** (§1.5) or `companyConfig.test.ts`'s "14 closed-set" describe string (§1.6) —
  both already read correctly once this phase's other edits land; editing them would be a no-op at best and
  a confusing diff at worst.
* **Out of scope, per the intent doc:** `CompanyButtonRow`/`CompanyOptionsSection` (already `RadioButton`,
  a different feature); any change to how companies are generated/stored/seeded; any visual redesign beyond
  the control-type swap — reuse `RadioButton`'s existing pill-row look exactly as shipped, including its
  existing `flex-wrap: wrap` handling for a row that doesn't fit (already sufficient for the 7-option
  Freelance+`MAX_COMPANIES` ceiling — confirmed by reading `RadioButton.css` directly, no new CSS needed at
  either call site, see §4).

---

## 4. Code Style & Architecture Conventions

**`src/data/companyConfig.ts`** (top section replaced; everything from `// COMPANY MANAGER` onward, i.e.
`NONE_VALUE` through `DELETE_COMPANY_SCHEMA`, is unchanged except `NONE_VALUE`'s own comment, §4 below):

```ts
// ========================================
// IMPORTS
// ========================================
import type { RadioButtonSchema, ButtonSchema, TextInputSchema, DualLabelSchema } from '../types/controls';
import type { Company } from '../types/Company';

// ========================================
// COMPANY ASSIGNMENT (RadioButton)
// ========================================

/** Radix ToggleGroup (RadioButton's own underlying primitive) emits '' on a deselect-to-empty
 *  click, which RadioButton.tsx already guards against (never calls onChange with it) — this
 *  sentinel isn't load-bearing against that the way it was for Radix Select.Item's own
 *  empty-string rejection back when this schema built a Select. Kept non-empty anyway, for the
 *  same defensive-and-symmetry reason NONE_VALUE documents below, and because every consumer
 *  already branches on it (value === FREELANCE_VALUE ? null : value). */
export const FREELANCE_VALUE = '__freelance__';

/**
 * Dynamic — unlike every other schema in this file (and every other *Config.ts file in the
 * codebase), this one depends on runtime data (the current company list), so it's a function,
 * not a static export. Used for the robot-to-company assignment RadioButton in both
 * RobotSelectionCard and RobotDisplaySection. Named/typed for a Select (buildCompanySelectSchema,
 * SelectSchema) through Roadmap Phase 10; renamed and retyped to RadioButtonSchema by 10.5 when
 * Select was removed entirely — see docs/specs/COMPANY_ASSIGNMENT_RADIO.md.
 */
export function buildCompanyAssignmentSchema(companies: Company[]): RadioButtonSchema {
  return {
    id: 'company.assign',
    type: 'radio',
    loreLabel: 'UNIT AFFILIATION',
    humanLabel: 'Company',
    options: [
      { value: FREELANCE_VALUE, label: 'Freelance' },
      ...companies.map((c) => ({ value: c.id, label: c.name })),
    ],
  };
}

// ========================================
// COMPANY MANAGER — BUTTON ROW / CRUD
// ========================================

/** Distinct sentinel from FREELANCE_VALUE — two different UI surfaces (the robot-to-company
 *  assignment RadioButton vs. this row's own "view/edit this company's options" RadioButton),
 *  each with its own "nothing selected" meaning. Both are RadioButton today (Roadmap 10.5) — this
 *  sentinel predates that and was already distinct from FREELANCE_VALUE for the same reason. */
export const NONE_VALUE = '__none__';

// ...ALL_VALUE, buildCompanyButtonRowSchema, COMPANY_SELECTION_HEADER_SCHEMA,
// COMPANY_NAME_INPUT_SCHEMA, CREATE_COMPANY_SCHEMA, DELETE_COMPANY_SCHEMA — unchanged.
```

**`src/components/selection/RobotSelectionCard.tsx`** (full replacement):

```tsx
import type { KeyboardEvent, ReactEventHandler } from 'react';
import { AudioStatusBadge } from './AudioStatusBadge';
import { RobotBody } from '@/components/robot/RobotBody';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import {
  ROBOT_SELECTION_ROW_SCHEMAS,
  JOB_TYPE_LABELS,
  UNASSIGNED_JOB_LABEL,
  DOCKING_STATE_LABELS,
} from '@/data/robotSelectionConfig';
import { FREELANCE_VALUE, buildCompanyAssignmentSchema } from '@/data/companyConfig';
import type { Robot } from '@/types/Robot';
import './RobotSelectionCard.css';

interface RobotSelectionCardProps {
  robot: Robot;
}

/**
 * Stops a click/keydown from reaching the card's own onClick/onKeyDown — the company RadioButton
 * is a nested interactive element (real DOM buttons, not portaled), so without this guard,
 * clicking or key-activating an option would also fire the card's own selectRobot activation via
 * ordinary DOM bubbling. (Through Roadmap Phase 10.5 this guarded a Select whose dropdown options
 * rendered via a Radix Portal outside the card's DOM subtree entirely — see
 * docs/specs/COMPANY_ASSIGNMENT_RADIO.md §1.3 for why the portal-specific reasoning no longer
 * applies but the guard itself still does.)
 */
const stopBubble: ReactEventHandler = (event) => event.stopPropagation();

/**
 * One robot's card in the Robot Selection hub tile (Roadmap Phase 8) — a native clickable
 * element, not the Button primitive, since Button accepts no children and can't hold a card's
 * worth of content. role="button"/tabIndex/onKeyDown give it the same activation contract a real
 * <button> gets for free. The company-assignment RadioButton (Roadmap Phase 10, converted from
 * Select by 10.5) is this card's first nested interactive element — its wrapper's stopBubble
 * handlers keep it from also firing the card's own selectRobot activation.
 */
export function RobotSelectionCard({ robot }: RobotSelectionCardProps) {
  const selectRobot = useUIStore((s) => s.selectRobot);
  const localeId = getActiveLocaleId();
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);
  const companyAssignmentSchema = buildCompanyAssignmentSchema(companies);
  const displayName = robot.name || robot.id;
  const jobLabel = robot.job ? JOB_TYPE_LABELS[robot.job.type] : UNASSIGNED_JOB_LABEL;
  const dockingLabel = DOCKING_STATE_LABELS[robot.docking];

  function handleActivate() {
    selectRobot(robot.id);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate();
    }
  }

  function handleCompanyChange(value: string) {
    useLocaleStore.getState().assignRobotToCompany(localeId, robot.id, value === FREELANCE_VALUE ? null : value);
  }

  return (
    <li
      className="robot-selection-card"
      role="button"
      tabIndex={0}
      aria-label={displayName}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
    >
      <svg className="robot-selection-card__avatar" viewBox="-80 -80 160 160" aria-hidden="true">
        <RobotBody robot={robot} ignoreDaylight />
      </svg>

      <div className="robot-selection-card__row robot-selection-card__row--name">
        <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.name} />
        <span className="robot-selection-card__value">{displayName}</span>
      </div>

      <div
        className="robot-selection-card__row robot-selection-card__row--company"
        onClick={stopBubble}
        onKeyDown={stopBubble}
      >
        <RadioButton
          schema={companyAssignmentSchema}
          value={robot.companyId ?? FREELANCE_VALUE}
          onChange={handleCompanyChange}
        />
      </div>

      <div className="robot-selection-card__meta-grid">
        <div className="robot-selection-card__field">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.job} />
          <span className="robot-selection-card__value">{jobLabel.humanLabel}</span>
        </div>

        <div className="robot-selection-card__field">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.battery} />
          <span className="robot-selection-card__value">{Math.round(robot.batteryLevel)}%</span>
        </div>

        <div className="robot-selection-card__field">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.docking} />
          <span className="robot-selection-card__value">{dockingLabel.humanLabel}</span>
        </div>

        <div className="robot-selection-card__field">
          <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.audio} />
          <AudioStatusBadge audioMode={robot.audioMode ?? 'none'} />
        </div>
      </div>
    </li>
  );
}

export default RobotSelectionCard;
```

`RobotSelectionCard.css` is **not modified** — `.robot-selection-card__row--company`'s existing
`justify-content: center` centers whichever single child it holds (today `.sc-select`, tomorrow
`.sc-radio-button` — both are flex-column wrappers occupying one flex-item slot in the row), and
`RadioButton.css`'s own `flex-wrap: wrap` (already shipped, 11.1.6) already handles a row of up to 7 options
not fitting on one line. Confirmed by reading both stylesheets directly rather than assumed (§3).

**`src/components/robot/RobotDisplaySection.tsx`** (full replacement):

```tsx
import { RobotBody } from '@/components/robot/RobotBody';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import {
  ROBOT_SELECTION_ROW_SCHEMAS,
  JOB_TYPE_LABELS,
  UNASSIGNED_JOB_LABEL,
  DOCKING_STATE_LABELS,
} from '@/data/robotSelectionConfig';
import { FREELANCE_VALUE, buildCompanyAssignmentSchema } from '@/data/companyConfig';
import type { Robot } from '@/types/Robot';

import './RobotDisplaySection.css';

interface RobotDisplaySectionProps {
  robot: Robot;
}

/**
 * Robot Options' always-visible header block (not an AccordionContainer — see
 * docs/specs/ROBOT_OPTIONS.md §1). The avatar and Name/Job/Battery/Docking rows all reuse the
 * exact display pattern Phase 8's RobotSelectionCard already established — same sunlight/time-
 * agnostic RobotBody rendering (ignoreDaylight, so the portrait reads consistently regardless of
 * the active locale's time of day), same read-only DualLabel rows, no job reassignment, no
 * docking-state override (both stay fully system-driven), plus the company picker (a RadioButton
 * as of Roadmap 10.5; a Select through Phase 10). Audio Setting and Volume were rendered here via
 * AudioSettingSection through Roadmap Phase 10, then extracted out to
 * RobotOptionsTab/CompanyOptionsSection as their own top-level Output panel
 * (docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 5) — this component is now pure read-only meta-
 * data display plus the company RadioButton, nothing editable beyond that.
 */
export function RobotDisplaySection({ robot }: RobotDisplaySectionProps) {
  const localeId = getActiveLocaleId();
  const jobLabel = robot.job ? JOB_TYPE_LABELS[robot.job.type] : UNASSIGNED_JOB_LABEL;
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);
  const companyAssignmentSchema = buildCompanyAssignmentSchema(companies);

  const handleCompanyChange = (value: string) => {
    useLocaleStore.getState().assignRobotToCompany(localeId, robot.id, value === FREELANCE_VALUE ? null : value);
  };

  return (
    <div className="robot-display-section">
      <svg className="robot-display-section__avatar" viewBox="-80 -80 160 160" aria-hidden="true">
        <RobotBody robot={robot} ignoreDaylight />
      </svg>

      <div className="robot-display-section__row">
        <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.name} />
        <span className="robot-display-section__value">{robot.name || robot.id}</span>
      </div>
      <div className="robot-display-section__row">
        <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.job} />
        <span className="robot-display-section__value">{jobLabel.humanLabel}</span>
      </div>
      <div className="robot-display-section__row">
        <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.battery} />
        <span className="robot-display-section__value">{Math.round(robot.batteryLevel)}%</span>
      </div>
      <div className="robot-display-section__row">
        <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.docking} />
        <span className="robot-display-section__value">{DOCKING_STATE_LABELS[robot.docking].humanLabel}</span>
      </div>

      <div className="robot-display-section__row">
        <RadioButton
          schema={companyAssignmentSchema}
          value={robot.companyId ?? FREELANCE_VALUE}
          onChange={handleCompanyChange}
        />
      </div>
    </div>
  );
}

export default RobotDisplaySection;
```

`RobotDisplaySection.css` is **not modified**, for the same reason given above for `RobotSelectionCard.css`.

**`src/types/controls.ts`** — `SelectSchema` interface (and its preceding doc comment) deleted entirely;
`| SelectSchema` removed from the `ControlSchema` union; `'select'` removed from `CONTROL_SCHEMA_TYPES`;
the array's own doc comment updated from "all 15 variants" to "all 14 variants":

```diff
- /** The Design System's 14th primitive (Roadmap Phase 10) — a dropdown, wrapping
-  *  @radix-ui/react-select. Options are supplied by the schema (built dynamically for
-  *  company assignment — see src/data/companyConfig.ts's buildCompanySelectSchema), the same
-  *  shape RadioButtonSchema's options already use. */
- export interface SelectSchema extends ControlSchemaBase {
-   type: 'select';
-   options: { value: string; label: string }[];
- }
-
  /** Layout axis for DirectionalPanel — mirrors SliderOrientation's own precedent
   ...
  export type ControlSchema =
    | StepperSchema | StepperWithToggleSchema
    | SliderLinearSchema | SliderLogSchema | SliderCenteredZeroSchema
    | RadioButtonSchema | ToggleSchema | TextInputSchema | CoordsInputSchema
-   | ButtonSchema | DualLabelSchema | AccordionSchema | LfoSchema | SelectSchema
-   | DirectionalPanelSchema;
+   | ButtonSchema | DualLabelSchema | AccordionSchema | LfoSchema
+   | DirectionalPanelSchema;

- /** Every ControlSchema discriminant, paired with the union per the pattern
-  *  src/types/lfo.ts established (LFO_SHAPES, ROBOT_LFO_TARGET_IDS) — makes
-  *  "all 15 variants covered, no duplicates" a runtime-testable assertion. */
+ /** Every ControlSchema discriminant, paired with the union per the pattern
+  *  src/types/lfo.ts established (LFO_SHAPES, ROBOT_LFO_TARGET_IDS) — makes
+  *  "all 14 variants covered, no duplicates" a runtime-testable assertion. */
  export const CONTROL_SCHEMA_TYPES: readonly ControlSchema['type'][] = [
    'stepper', 'stepperToggle',
    'sliderLinear', 'sliderLog', 'sliderCenteredZero',
    'radio', 'toggle', 'textInput', 'coordsInput',
-   'button', 'dualLabel', 'accordion', 'lfo', 'select',
-   'directionalPanel',
+   'button', 'dualLabel', 'accordion', 'lfo',
+   'directionalPanel',
  ];
```

**`src/types/controls.test.ts`** — `SelectSchema` import removed; the `select` fixture and its inclusion in
the `variants` array removed; both count assertions `15` → `14`:

```diff
    type LfoSchema,
-   type SelectSchema,
    type DirectionalPanelSchema,

  describe('CONTROL_SCHEMA_TYPES', () => {
-   it('has exactly 15 entries, no duplicates', () => {
-     expect(CONTROL_SCHEMA_TYPES).toHaveLength(15);
-     expect(new Set(CONTROL_SCHEMA_TYPES).size).toBe(15);
+   it('has exactly 14 entries, no duplicates', () => {
+     expect(CONTROL_SCHEMA_TYPES).toHaveLength(14);
+     expect(new Set(CONTROL_SCHEMA_TYPES).size).toBe(14);
    });

    it('matches the ControlSchema union discriminants exactly', () => {
      expect([...CONTROL_SCHEMA_TYPES].sort()).toEqual(
        [
          'stepper', 'stepperToggle',
          'sliderLinear', 'sliderLog', 'sliderCenteredZero',
          'radio', 'toggle', 'textInput', 'coordsInput',
-         'button', 'dualLabel', 'accordion', 'lfo', 'select',
-         'directionalPanel',
+         'button', 'dualLabel', 'accordion', 'lfo',
+         'directionalPanel',
        ].sort()
      );
    });
  });

    const lfo: LfoSchema = { id: 'volumeLfo', type: 'lfo' };
-   const select: SelectSchema = { id: 'company.assign', type: 'select', options: [{ value: 'a', label: 'A' }] };
    const directionalPanel: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel', orientation: 'row' };

    const variants: ControlSchema[] = [
      stepper, stepperToggle, sliderLinear, sliderLog, sliderCenteredZero,
-     radio, toggle, textInput, coordsInput, button, dualLabel, accordion, lfo, select,
-     directionalPanel,
+     radio, toggle, textInput, coordsInput, button, dualLabel, accordion, lfo,
+     directionalPanel,
    ];

-   expect(variants).toHaveLength(15);
+   expect(variants).toHaveLength(14);
```

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.

* **`src/data/companyConfig.test.ts` (modified):**
  ```diff
  - describe('buildCompanySelectSchema', () => {
  + describe('buildCompanyAssignmentSchema', () => {
      it('starts with the Freelance option, followed by one entry per company', () => {
        const companies: Company[] = [
          { id: 'c1', name: 'Iron Consortium', robotIds: [] },
          { id: 'c2', name: 'Null Syndicate', robotIds: [] },
        ];
  -     const schema = buildCompanySelectSchema(companies);
  -     expect(schema.type).toBe('select');
  +     const schema = buildCompanyAssignmentSchema(companies);
  +     expect(schema.type).toBe('radio');
        expect(schema.options[0]).toEqual({ value: FREELANCE_VALUE, label: 'Freelance' });
        expect(schema.options[1]).toEqual({ value: 'c1', label: 'Iron Consortium' });
        expect(schema.options[2]).toEqual({ value: 'c2', label: 'Null Syndicate' });
        expect(schema.options).toHaveLength(3);
      });

      it('returns just the Freelance option when there are no companies yet', () => {
  -     const schema = buildCompanySelectSchema([]);
  +     const schema = buildCompanyAssignmentSchema([]);
        expect(schema.options).toEqual([{ value: FREELANCE_VALUE, label: 'Freelance' }]);
      });

      it('is namespaced under "company." like every other schema in this file', () => {
  -     expect(buildCompanySelectSchema([]).id.startsWith('company.')).toBe(true);
  +     expect(buildCompanyAssignmentSchema([]).id.startsWith('company.')).toBe(true);
      });
    });

    describe('FREELANCE_VALUE', () => {
  -   it('is a non-empty string — Radix Select.Item rejects an empty-string value', () => {
  +   it('is a non-empty string, kept for defensiveness/symmetry though RadioButton\'s own deselect guard no longer requires it', () => {
        expect(typeof FREELANCE_VALUE).toBe('string');
        expect(FREELANCE_VALUE.length).toBeGreaterThan(0);
      });
    });
  ```
  Update the `buildCompanySelectSchema` import to `buildCompanyAssignmentSchema` at the top of the file.
  `companyConfig.test.ts`'s own "every schema type is one of the 14 closed-set ControlSchema variants"
  describe-block string is **not** edited — see §1.6.

* **`src/components/selection/RobotSelectionCard.test.tsx` (modified)** — every test outside the "company
  assignment" describe block is unchanged (name/job/battery/docking/audio rendering, click/keyboard
  activation, avatar daylight-independence, accessible name). The describe block itself:
  ```tsx
  describe('company assignment (Roadmap Phase 10, converted to RadioButton by 10.5)', () => {
    const localeId = getActiveLocaleId();

    afterEach(() => {
      useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
    });

    it('defaults to "Freelance" selected for an unassigned robot', () => {
      render(<RobotSelectionCard robot={makeRobot({ companyId: undefined })} />);
      expect(screen.getByRole('radio', { name: 'Freelance' }).getAttribute('aria-checked')).toBe('true');
    });

    it("shows the assigned company's option selected when the robot belongs to one", () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', robotIds: ['r1'] });
      render(<RobotSelectionCard robot={makeRobot({ id: 'r1', companyId: 'c1' })} />);

      expect(screen.getByRole('radio', { name: 'Iron Consortium' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('radio', { name: 'Freelance' }).getAttribute('aria-checked')).toBe('false');
    });

    it("selecting a company calls assignRobotToCompany with that company's id", () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', robotIds: [] });
      const assignSpy = vi.spyOn(useLocaleStore.getState(), 'assignRobotToCompany');
      render(<RobotSelectionCard robot={makeRobot({ id: 'r1', companyId: undefined })} />);

      fireEvent.click(screen.getByRole('radio', { name: 'Iron Consortium' }));

      expect(assignSpy).toHaveBeenCalledWith(localeId, 'r1', 'c1');
    });

    it('selecting "Freelance" calls assignRobotToCompany with null', () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', robotIds: ['r1'] });
      const assignSpy = vi.spyOn(useLocaleStore.getState(), 'assignRobotToCompany');
      render(<RobotSelectionCard robot={makeRobot({ id: 'r1', companyId: 'c1' })} />);

      fireEvent.click(screen.getByRole('radio', { name: 'Freelance' }));

      expect(assignSpy).toHaveBeenCalledWith(localeId, 'r1', null);
    });

    // Replaces the old pair of "trigger" + "portaled option" double-fire tests (§1.7) — RadioButton
    // has no separate trigger/portal step, so there's exactly one interaction to guard.
    it('clicking a company radio option does not also select the robot (no nested-interactive double-fire)', () => {
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', robotIds: [] });
      render(<RobotSelectionCard robot={makeRobot({ id: 'r1' })} />);

      fireEvent.click(screen.getByRole('radio', { name: 'Iron Consortium' }));

      expect(useUIStore.getState().selectedRobotId).toBeNull();
    });

    it('clicking elsewhere on the card still selects the robot as before', () => {
      render(<RobotSelectionCard robot={makeRobot({ id: 'r1', name: 'Unit One' })} />);

      fireEvent.click(screen.getByText('Unit One'));

      expect(useUIStore.getState().selectedRobotId).toBe('r1');
    });
  });
  ```

* **`src/components/robot/RobotDisplaySection.test.tsx` (modified)** — every test outside the "company
  assignment" describe block is unchanged. The describe block itself:
  ```tsx
  describe('company assignment (Roadmap Phase 10, converted to RadioButton by 10.5)', () => {
    it('defaults to "Freelance" selected for an unassigned robot', () => {
      const robot = makeRobot({ companyId: undefined });
      useLocaleStore.getState().addRobot(localeId, robot);
      render(<RobotDisplaySection robot={robot} />);

      expect(screen.getByRole('radio', { name: 'Freelance' }).getAttribute('aria-checked')).toBe('true');
    });

    it("shows the assigned company's option selected when the robot belongs to one", () => {
      const robot = makeRobot({ companyId: 'c1' });
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', robotIds: [robot.id] });
      useLocaleStore.getState().addRobot(localeId, robot);
      render(<RobotDisplaySection robot={robot} />);

      expect(screen.getByRole('radio', { name: 'Iron Consortium' }).getAttribute('aria-checked')).toBe('true');
    });

    it("selecting a company calls assignRobotToCompany with that company's id", () => {
      const robot = makeRobot({ companyId: undefined });
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', robotIds: [] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const assignSpy = vi.spyOn(useLocaleStore.getState(), 'assignRobotToCompany');
      render(<RobotDisplaySection robot={robot} />);

      fireEvent.click(screen.getByRole('radio', { name: 'Iron Consortium' }));

      expect(assignSpy).toHaveBeenCalledWith(localeId, robot.id, 'c1');
    });

    it('selecting "Freelance" calls assignRobotToCompany with null', () => {
      const robot = makeRobot({ companyId: 'c1' });
      useLocaleStore.getState().addCompany(localeId, { id: 'c1', name: 'Iron Consortium', robotIds: [robot.id] });
      useLocaleStore.getState().addRobot(localeId, robot);
      const assignSpy = vi.spyOn(useLocaleStore.getState(), 'assignRobotToCompany');
      render(<RobotDisplaySection robot={robot} />);

      fireEvent.click(screen.getByRole('radio', { name: 'Freelance' }));

      expect(assignSpy).toHaveBeenCalledWith(localeId, robot.id, null);
    });
  });
  ```
  The file's own "renders no job-reassignment or docking-override control anywhere" test (scoped to
  `combobox`/`job` and `radio`/`docked|docking|departing|active`) is unaffected — it doesn't query
  anything the company row renders and needs no change.

* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (confirms `SelectSchema`'s removal leaves no dangling
     reference anywhere in `src/`).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including `RadioButton.test.tsx`/`CompanyButtonRow.test.tsx`
     (unmodified, unaffected by this phase) and every other file that imports `CONTROL_SCHEMA_TYPES`
     (`companyConfig.test.ts` among them) — none assert an exact count other than the two updated in §4.
  4. `npm run build` — production bundle builds cleanly (confirms no orphaned `Select.tsx` import survives
     anywhere, since a stale import would fail this step even if type-checking somehow missed it).
  5. `grep -rn "Select" src/ --include=*.ts --include=*.tsx` (excluding `RadixSelect`-unrelated hits like
     `selectRobot`/`selectedRobotId`/`selectCompany`) returns nothing referencing the removed primitive.
* **Manual check:** load the app and confirm, at both call sites (the Robot Selection hub tile's card list,
  and an individual robot's Robot Options detail page):
  1. The company row renders as a `RadioButton` pill row (Freelance, then every company in the active
     locale), not a dropdown — no click-to-open step.
  2. The currently-assigned company (or Freelance, for an unassigned robot) shows popped/accent-tinted,
     matching `RadioButton`'s existing selected-state styling used elsewhere (e.g. `CompanyButtonRow`).
  3. Clicking a different option reassigns immediately — the robot's card (list view) or detail page
     reflects the new selection with no page reload/re-render glitch.
  4. On `RobotSelectionCard` specifically, clicking any company option does **not** also select/open that
     robot's detail page.
  5. With a locale seeded up to `MAX_COMPANIES` (6) companies, the 7-option row (Freelance + 6) wraps
     cleanly on the compact `RobotSelectionCard` (one of several cards in a grid) without visually breaking
     the card's layout — confirms `RadioButton.css`'s existing `flex-wrap: wrap` is sufficient with no new
     CSS (§3/§4).
  6. Keyboard interaction (`Tab` into the row, arrow keys between options, `Space`/`Enter` to select) works
     the same way it already does for `CompanyButtonRow` elsewhere in the app.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md`:**
  - `"All 15 live in..."` → `"All 14 live in..."`.
  - The `CONTROL_SCHEMA_TYPES` paragraph (currently: *"`select` (`Select`) was added in Roadmap Phase 10
    (Companies), the first addition to this inventory since this phase shipped it at 13;
    `directionalPanel` (`DirectionalPanel`) is the second, added by `docs/specs/DIRECTIONAL_PANEL.md`."*)
    is rewritten to: *"`select` (`Select`) was added in Roadmap Phase 10 (Companies) and removed in Roadmap
    Phase 10.5 (`docs/specs/COMPANY_ASSIGNMENT_RADIO.md`) once its one real use — robot-to-company
    assignment — moved to `RadioButton`; `directionalPanel` (`DirectionalPanel`), added by
    `docs/specs/DIRECTIONAL_PANEL.md` after `select`, is unaffected and remains, keeping the live count at
    14 (13 at Phase 1, +1 for `select` then -1 for its removal, +1 for `directionalPanel`)."*
  - The `Select` row is removed from the primitives table.
  - The `### Select (added Roadmap Phase 10)` subsection is removed entirely (not kept as a stub) — its
    content described a primitive that no longer exists in `src/`.
* **`docs/COMPANIES.md`** — "Company Membership" section:
  - *"Reassignment happens through a `Select` dropdown (the Design System's 14th primitive — see
    [COMPONENT_LIBRARY.md](COMPONENT_LIBRARY.md), added specifically to support this) shown in two
    places..."* → *"Reassignment happens through a `RadioButton` (`Select` through Roadmap Phase 10;
    replaced by Roadmap 10.5, `docs/specs/COMPANY_ASSIGNMENT_RADIO.md`, once it turned out to be the
    Design System's only dropdown and its one real consumer — this one — didn't need a floating panel)
    shown in two places..."*
  - *"The dropdown lists every company by name plus 'Freelance' (`FREELANCE_VALUE`, a non-empty sentinel —
    Radix `Select.Item` rejects an empty string)."* → *"The row lists every company by name plus
    'Freelance' (`FREELANCE_VALUE`, a non-empty sentinel kept for defensiveness/symmetry — see
    `docs/specs/COMPANY_ASSIGNMENT_RADIO.md` §1.2)."*
  - The `stopPropagation`/portal paragraph is reworded per §1.3 — drop the portal-specific justification,
    state the plain nested-interactive-element reason, and note `RadioButton` has no portal at all.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/company-assignment-radio` (this is not part of the Oblique Cabinetry
  series' own `feature/cabinetry-*` naming — it's a separate line of work that happens to intersect it).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences.
  Suggested grouping, each independently reviewable: (1) `src/types/controls.ts`/`.test.ts` (schema
  removal); (2) `src/data/companyConfig.ts`/`.test.ts` (rename); (3) the two component
  files + their tests (the actual UI swap); (4) `Select.tsx`/`.css`/`.test.tsx` deletion; (5) docs
  (`COMPONENT_LIBRARY.md`, `COMPANIES.md`, `roadmap.md`) last.

### Roadmap edits (`docs/todo/roadmap.md`)

**New section, inserted immediately after `## 10.4` and before `## 11. Console Theming — Cut`:**

```markdown
## 10.5 Company Assignment: Select → RadioButton

Inserted out of sequence, following 10.1–10.4's own precedent (not renumbering later phases). Not
derived from the roadmap draft — raised directly by Crawford during review, confirmed via
`/interview-me`. Source of intent: [docs/intent/company-assignment-radio.md](../intent/company-assignment-radio.md).

### Restructure

- The robot→company assignment `Select` dropdown, at both real call sites (`RobotSelectionCard`,
  `RobotDisplaySection`), replaced by `RadioButton` — Freelance first, then every company in order,
  the same option order `Select` already used. `assignRobotToCompany` and every other piece of the
  company data flow are unchanged; this is a control-type swap only.
- `Select` removed entirely — component, schema, tests — taking the Design System's live primitive
  count from 15 back to 14. `Select`'s own Phase 10 addition is undone; `DirectionalPanel`, added
  after `Select`, is unaffected and remains at 14 alongside the original 13.

### About

A UI preference against dropdowns for this one interaction, not a data-model concern — surfaced
while reviewing the app with the Oblique Cabinetry series (11.1.1–11.1.9) freshly in progress, which
is what caught the conflict with 11.1.8 (below) before that item's own work began.

### Docs

- `docs/COMPONENT_LIBRARY.md` updated: primitive count 15 → 14, `Select`'s table row and its own
  subsection removed.
- `docs/COMPANIES.md`'s "Company Membership" section updated for `RadioButton`.
- `CLAUDE.md`'s reference bullet needs no edit — it already read "14," stale since `DirectionalPanel`
  shipped (14→15, never updated), made accidentally correct again by this phase's own removal
  (15→14). See `docs/specs/COMPANY_ASSIGNMENT_RADIO.md` §1.5.
```

**`## 11.1.8 Oblique Cabinetry: Select`'s heading and opening paragraph replaced; its existing
Create/Restructure/About/Docs content preserved below a `<details>` fold, matching `## 11`'s own
already-established cut-record format:**

```markdown
## 11.1.8 Oblique Cabinetry: Select — Cut

**Cut before any implementation began, not reverted for a bug**: `Select` itself was removed by
[10.5](#105-company-assignment-select--radiobutton) — a UI preference against dropdowns for its one
real use (robot→company assignment) — so there is no longer a trigger to wire into Cabinetry. The
original scope below (a single state-keyed `CabinetBox` around `RadixSelect.Trigger`'s content) was
never built; preserved for historical reference only, the same way `## 11`'s own original content is
kept below its cut line.

<details>
<summary>Original 11.1.8 content (Select trigger cabinetry, as scoped — historical reference only,
never implemented)</summary>

[...original "Wires `Select`'s trigger..." paragraph and Create/Restructure/About/Docs sections,
verbatim, unchanged...]

</details>
```

**`## 11.1.9`'s own "About" section** — the sentence *"The last of the 15 primitives to receive
Cabinetry — `Stepper`/`StepperWithToggle` were already dropped (see 11.1.1)..."* is corrected to
*"The last of the 14 primitives to receive Cabinetry — `Stepper`/`StepperWithToggle` were already
dropped (see 11.1.1), `Select` was cut entirely (see 11.1.8, above) rather than dropped from Cabinetry
specifically, and `DualLabel`/`DirectionalPanel` are pure layout/display..."* — the rest of that
paragraph (free text having no natural "popped" precedent) is unchanged, since it was never actually
about `Select`.

**`## 11.2`'s own "About" section** — the clause *"`AccordionContainer`/`Select`'s trigger-only boxes
(confirming the trigger's own focus ring and the coexisting content-height/open-panel timeline both
still behave correctly alongside the new pop timeline)"* is corrected to *"`AccordionContainer`'s
trigger-only box (confirming the trigger's own focus ring and the coexisting content-height timeline
both still behave correctly alongside the new pop timeline) — `Select`'s own equivalent check no
longer applies, since 11.1.8 was cut (10.5) before it was ever built"*.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against this codebase's real files, not left open):

- ~~Does the Design System revert to 13 or 14 primitives?~~ **Resolved: 14 — the intent doc's "13" is a
  miscount, corrected here** (§1.4). The live count was already 15 (`Select` + `DirectionalPanel` both
  shipped on top of the original 13); removing only `Select` lands on 14.
- ~~Does `CLAUDE.md` need an edit?~~ **Resolved: no — it already reads "14," already stale (since
  `DirectionalPanel` shipped, 14→15, and was never updated), made correct again by this phase's own
  removal** (§1.5). Flagged explicitly so it isn't "corrected" to 15 mid-implementation.
- ~~Is `RobotSelectionCard`'s `stopBubble` guard still needed once there's no portal?~~ **Resolved: yes —
  the guard exists because the option is a nested interactive DOM element, not specifically because of the
  portal; only the explanatory comment needed rewriting** (§1.3).
- ~~Does `FREELANCE_VALUE` need to change shape (e.g. become `''`) now that `Select`'s empty-string
  rejection no longer applies?~~ **Resolved: no — keep it exactly as-is; `RadioButton.tsx`'s own
  deselect-to-empty guard makes the non-empty requirement moot, but every consumer already branches on the
  sentinel and there's no benefit to changing it, only reworded to state the current, real reason** (§1.2).
- ~~Does `RadioButton`/its CSS need any change to handle up to 7 options on the compact
  `RobotSelectionCard`?~~ **Resolved: no — `RadioButton.css`'s existing `flex-wrap: wrap` already handles
  this; confirmed by reading the stylesheet directly rather than assumed** (§3), matching the intent doc's
  own framing that this was "an implementation detail, not a design fork."

Resolved by direct reasoning during Specify — flagged explicitly since the interview didn't ask these
directly, not silently assumed:

1. **Rename `buildCompanySelectSchema` or keep the name?** **Resolved: rename to
   `buildCompanyAssignmentSchema`** (§1.1) — keeping a `*SelectSchema`-shaped name on a function that
   returns `type: 'radio'` would misdescribe it, and this codebase's own naming rigor (e.g.
   `buildCompanyButtonRowSchema`, named for purpose not control type) supports the rename.
2. **What happens to the two now-collapsed "double-fire" tests in `RobotSelectionCard.test.tsx`?**
   **Resolved: merged into one** (§1.7) — the scenario the second one specifically existed to catch (portal
   event re-propagation bypassing a DOM-only guard) cannot occur once there's no portal; keeping a
   still-named "portaled option" test around would assert a mechanism that no longer exists.
3. **Roadmap numbering for the new item.** **Resolved: `10.5`**, following `10.1`–`10.4`'s own established
   "insert out of sequence under the phase it reopens, don't renumber later phases" convention — this
   reopens Phase 10's own `Select` decision, the same relationship `10.4` had to `10.1`.
4. **How to record `11.1.8`'s cut given it was never actually built** (unlike `## 11` Console Theming,
   which was built, evaluated, then cut)? **Resolved: reuse the same `<details>`-fold historical-record
   mechanism `## 11` established, with wording that says "never implemented" rather than describing an
   evaluation that never happened** — keeps one consistent pattern for "roadmap item didn't ship as
   planned" rather than inventing a second one for the "cut before starting" case.

No risks carried forward from `11.1.1`–`11.1.7`/`10.1`–`10.4` apply here in a new way — this phase touches
none of `CabinetBox`/`cabinetGeometry.ts`/`cabinetAnimation.ts`/`useCabinetBoxHeight.ts`, and reuses
`RadioButton` and its existing CSS completely unmodified.

**Forward note:** Nothing here reopens `11.1.6`'s own `RadioButton` Cabinetry design (box-per-option,
state-keyed pop) — this phase adds no new `RadioButton` consumer shape, only two more call sites using the
exact pattern `CompanyButtonRow` already established for a dynamic, seed-length company list.
