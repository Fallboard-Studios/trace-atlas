# Phase Spec: Redesign — Robot Cards

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-cards-redesign.md](../intent/robot-cards-redesign.md) (confirmed via `/interview-me`, 2026-09-13). Covers [Roadmap Phase 15.2](../todo/roadmap.md#152-redesign-robot-cards). Related prior art: [docs/specs/SLIDER_LINEAR_READ_ONLY.md](SLIDER_LINEAR_READ_ONLY.md) (the read-only `SliderLinear` this phase's Battery row reuses, already shipped and already consumed by `RobotDisplaySection`) and [docs/specs/COLOR_SCHEME_TRAIT_THEMING.md](COLOR_SCHEME_TRAIT_THEMING.md) (the trait-color root this phase's card keeps). Touches presentation plus one small, pure-logic extraction (the shared audibility predicate) — no `AudioEngine` scheduling behavior change, no new Zustand field, no schema/type change.

> **Correction (found via `/code-review-and-quality`, after implementation):** §4's `RobotSelectionCard.tsx` code sample below passes `BATTERY_READOUT_SCHEMA` — a single shared, static object — directly to `SliderLinear` for every robot's card. That's wrong for this consumer specifically: `SliderLinear` derives `VoxelTrack`'s GSAP `timelineKeyPrefix` from `schema.id`, and `timelineMap` is one module-global `Map`, so every simultaneously-rendered card (the roster is always 12) collided on identical timeline keys, each mount/update killing a sibling robot's still-live pop-in animation. The shipped code derives a per-robot id instead (`` `${BATTERY_READOUT_SCHEMA.id}.${robot.id}` ``) before passing the schema down. Left unedited below as a record of what was actually specified — see `docs/tasks/ROBOT_CARDS_REDESIGN.md`'s Risks table for the full writeup.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and what's changing

`RobotSelectionCard.tsx` today is a single clickable `<li role="button">`: an avatar, a centered Name row (`DualLabel` + value), a company `RadioButton` row guarded by `stopBubble` (to stop its clicks from also firing the card's own `selectRobot`), and a 2-column `__meta-grid` of four `DualLabel`-captioned fields (Job, Battery %, Docking, and an `AudioStatusBadge` dot for Audio Setting).

This phase restructures it into two literal sibling regions inside the same `<li>`:

- **`.robot-selection-card__top`** — a new `<div>` that takes over the activation contract the `<li>` currently holds (`role="button"`, `tabIndex`, `onClick`/`onKeyDown` → `selectRobot`, `aria-label`). Contains, top to bottom:
  1. **`.robot-selection-card__meta-row`** — two columns: the existing avatar (unchanged `RobotBody`/`ignoreDaylight` rendering) on the left; on the right, three bare text lines (no `DualLabel` — plain `<span>`s), Name (visually distinct — larger/heavier, reads as the card's title), Job, and a combined "Docking · Status" line (e.g. "Active · Emitting").
  2. The read-only `SliderLinear` Battery row, reusing `BATTERY_READOUT_SCHEMA` exactly as already wired into `RobotDisplaySection` — **keeps its label** (composed internally by `SliderLinear`'s own `DualLabel`), unlike the three bare lines above it.
- **`.robot-selection-card__bottom`** — a new `<div>`, no click handlers at all, holding only the company `RadioButton` (unchanged schema/wiring).

The outer `<li className="robot-selection-card">` keeps only the robot-color-scoping `style={getRobotColorStyle(...)}` (Roadmap 14) and its border/background/padding — no `role`, no `tabIndex`, no handlers, no `cursor: pointer`. `stopBubble` is deleted entirely: the company section is now a sibling of the clickable top region, not a descendant of it, so there's nothing left for it to guard against.

### 1.2 Status ("Emitting"/"Disabled") is a new shared predicate, not a new inline check

Confirmed via `/interview-me`: Status reflects true audibility, not just this robot's own `audioMode` — "Disabled" when this robot's `audioMode` is `mute`, **or** when any other robot in the same locale is `solo` and this one isn't. That exact two-part rule already exists, inlined, in `AudioEngine.ts`'s `triggerWithCap` ([AudioEngine.ts:311-321](../../src/engine/AudioEngine.ts#L311-L321)):

```typescript
const localeRobots = getActiveLocaleRobots();
if (localeRobots.length > 0) {
  const robotFromStore = localeRobots.find((r) => r.id === robotId);
  if (robotFromStore?.audioMode === 'mute') {
    return false;
  }
  const anySoloInStore = localeRobots.some((r) => r.audioMode === 'solo');
  if (anySoloInStore && robotFromStore?.audioMode !== 'solo') {
    return false;
  }
  // Highlight attenuation is handled in scheduleNote; skip here to avoid double-attenuation.
}
```

This phase extracts the mute/solo half of that (not the highlight-attenuation logic in `scheduleNote`, which is a different concern — velocity attenuation, not audibility) into one pure, shared, exported function — `isRobotAudible` — that both `AudioEngine.ts` and this new UI code call, rather than re-deriving the rule a second time (same class of issue as the open [docs/DUPLICATE_VALUE_AUDIT.md](../DUPLICATE_VALUE_AUDIT.md) items).

```typescript
// src/utils/robotAudibility.ts (NEW)
import type { Robot } from '@/types/Robot';

/**
 * True if a robot with `audioMode` would actually be heard right now, given every robot
 * currently in its locale — mirrors AudioEngine.ts's own triggerWithCap mute/solo check
 * exactly (that check is refactored to call this instead of re-deriving the rule). `undefined`
 * (a robot not yet in the store, or audioMode unset) behaves identically to `'none'`.
 */
export function isRobotAudible(audioMode: Robot['audioMode'], localeRobots: Robot[]): boolean {
  if (audioMode === 'mute') return false;
  const anySolo = localeRobots.some((r) => r.audioMode === 'solo');
  if (anySolo && audioMode !== 'solo') return false;
  return true;
}
```

Deliberately takes `audioMode` (a plain value), not a whole `Robot`/robot id — `AudioEngine.ts`'s own call site already has `robotFromStore?.audioMode` (a robot that may not be found in the store at all), and `RobotSelectionCard`'s call site already has `robot.audioMode` directly from its own prop. Neither needs a lookup the function would otherwise have to duplicate.

`AudioEngine.ts`'s `triggerWithCap` becomes:

```typescript
try {
  const localeRobots = getActiveLocaleRobots();
  if (localeRobots.length > 0) {
    const robotFromStore = localeRobots.find((r) => r.id === robotId);
    if (!isRobotAudible(robotFromStore?.audioMode, localeRobots)) {
      return false;
    }
    // Highlight attenuation is handled in scheduleNote; skip here to avoid double-attenuation.
  }
} catch (err) {
  devWarn('[AudioEngine] triggerWithCap.audioMode failed', err);
}
```

Behaviorally identical to today — every existing `AudioEngine.test.ts` mute/solo assertion should pass unmodified.

### 1.3 New value labels: `AUDIBILITY_LABELS`

`robotSelectionConfig.ts` gains a fourth per-value label map, matching the existing `JOB_TYPE_LABELS`/`DOCKING_STATE_LABELS`/`AUDIO_MODE_LABELS` shape (a `loreLabel`/`humanLabel` pair per value) even though only `humanLabel` is ever rendered by this card — kept in the same shape as its siblings for consistency and so `docs/reference/ROBOT_DATA_GRID.md`'s existing "draft, pending review" convention for these maps extends to it without a special case:

```typescript
export const AUDIBILITY_LABELS: Record<'emitting' | 'disabled', ValueLabel> = {
  emitting: { loreLabel: 'ACOUSTIC EMISSION ACTIVE', humanLabel: 'Emitting' },
  disabled: { loreLabel: 'ACOUSTIC EMISSION SUPPRESSED', humanLabel: 'Disabled' },
};
```

Best-guess lore labels, same as every other draft entry in this file — flagged for Crawford's review, not treated as final.

### 1.4 The combined "Docking · Status" line

One `<span>`, both values joined with a middle-dot separator, no wrapping element between them:

```tsx
<span className="robot-selection-card__status-line">
  {dockingLabel.humanLabel} · {statusLabel.humanLabel}
</span>
```

### 1.5 Judgment calls made while translating intent into a concrete design

Per this skill's "surface assumptions immediately" step — none of these were asked during `/interview-me`:

1. **`ROBOT_SELECTION_ROW_SCHEMAS.battery` and `.audio` become genuinely dead code once this phase ships** (no remaining consumer anywhere — unlike `AudioStatusBadge`, item 2 below, these are just two entries in an object literal, not a standalone component). This spec removes them outright rather than leaving them orphaned; `.name`/`.job`/`.docking` stay, since `RobotDisplaySection` still consumes them.
2. **`AudioStatusBadge` itself is kept, not deleted**, even though `RobotSelectionCard` was its only real consumer (confirmed by grep — no other `.tsx` renders it) and this phase removes that render. Same precedent this codebase already has for `Stepper`/`StepperWithToggle`: "kept in the codebase, unused by any real app schema" ([docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md)). `AUDIO_MODE_LABELS`/`AUDIO_STATUS_COLOR_MAP` stay too, since `AudioStatusBadge.tsx` itself still imports them — they aren't dead the way `.battery`/`.audio` are, just unreachable from any real screen today.
3. **Typography for the Name "title" treatment**: `--font-size-heading-sm` (18px, already `--font-controls` — TYPE_SCALE.md's own comment names roadmap items 15-17 as its first intended consumers) plus `--font-weight-medium` (600) — not `--font-weight-bold` (700), which `src/index.css`'s own comment reserves for `--font-sans`/Rajdhani large titles, not `--font-controls`/Titillium Web elements like this card. Job/Status lines keep the existing `--font-size-label` (15px) at regular weight.
4. **The company section's centering** (`justify-content: center`, today's `.robot-selection-card__row--company`) carries over unchanged to `.robot-selection-card__bottom` — purely a rename, not a visual change, since the intent doc leaves this presentational detail unspecified.

---

## 2. Target File Structure

```text
src/
├── components/selection/
│   ├── RobotSelectionCard.tsx       # MODIFIED — §4
│   ├── RobotSelectionCard.css       # MODIFIED — §4
│   └── RobotSelectionCard.test.tsx  # MODIFIED — see §5
├── utils/
│   ├── robotAudibility.ts           # NEW — isRobotAudible, §1.2
│   └── robotAudibility.test.ts      # NEW — see §5
├── engine/
│   └── AudioEngine.ts               # MODIFIED — triggerWithCap calls isRobotAudible instead of
│                                       #   re-deriving the mute/solo check inline; no behavior change
└── data/
    ├── robotSelectionConfig.ts      # MODIFIED — AUDIBILITY_LABELS added; ROBOT_SELECTION_ROW_SCHEMAS
    │                                   #   drops .battery/.audio (dead once this ships, §1.5 item 1)
    └── robotSelectionConfig.test.ts # MODIFIED — see §5
docs/
└── reference/
    └── ROBOT_DATA_GRID.md   # MODIFIED — two new draft rows (Emitting/Disabled) appended to the
                                #   existing "Draft — pending review" table, same convention as the
                                #   Job Data/Docked Status/Audio Setting value rows already there
```

**Explicitly not touched, and why:**

- `src/components/robot/RobotDisplaySection.tsx` — already has its own read-only battery slider from Phase 15.1; this phase doesn't add Status/audibility to it (that's 15.3's own scope, not asked for here).
- `src/components/company/CompanyManager.tsx` — Roadmap 16, a different component.
- `src/components/selection/AudioStatusBadge.tsx`/`.css`/`.test.tsx` — kept as-is, unused by any real screen after this ships (§1.5 item 2).
- `src/components/ui/controls/SliderLinear.tsx`, `RadioButton.tsx`, `RobotBody.tsx`, `src/data/companyConfig.ts`, `src/utils/traitColors.ts` — reused completely as-is; no prop/contract change needed by any of them.
- `src/engine/AudioEngine.test.ts` — no assertion changes expected; `isRobotAudible` reproduces `triggerWithCap`'s existing mute/solo behavior exactly, so its own tests should require no edits (only new coverage lives in the new `robotAudibility.test.ts`).

No new dependency. No file is renamed (only classes/exports within existing files change).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`stopBubble` is deleted, not kept-but-unused.** Its entire reason to exist (a nested interactive element inside something clickable) no longer applies once the company section is a sibling `<div>` with no handlers of its own.
* **`isRobotAudible` must not change `AudioEngine.ts`'s observable behavior.** It is a like-for-like extraction of existing logic — the `highlight` attenuation branch in `scheduleNote` is untouched and out of scope (a different concern: velocity attenuation of audible notes, not an audibility gate).
* **No new visual treatment for Battery beyond what `SliderLinear`'s `readOnly` mode already provides** — same schema, same call shape as `RobotDisplaySection`'s own usage. No desaturation, no card-specific variant.
* **Zero DOM roles left over from the old structure**: no `role="button"` on the outer `<li>`, no `AudioStatusBadge`/`role="status"` dot anywhere in this card, no `.robot-selection-card__meta-grid`/`__field`/`__value`/`__row`/`__row--name`/`__row--company` classes remaining in the CSS.
* **`sc-`-prefixed classes are untouched** — this card's own classes stay the existing `robot-selection-card` (not `sc-`) prefix, unchanged convention; only `SliderLinear`'s own internal `sc-slider-linear*` classes (already shipped, Phase 15.1) apply to the Battery row.

---

## 4. Code Style & Architecture Conventions

**`RobotSelectionCard.tsx`** (full new shape):

```tsx
import type { KeyboardEvent, ReactEventHandler } from 'react';
import { RobotBody } from '@/components/robot/RobotBody';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { isRobotAudible } from '@/utils/robotAudibility';
import {
  BATTERY_READOUT_SCHEMA,
  JOB_TYPE_LABELS,
  UNASSIGNED_JOB_LABEL,
  DOCKING_STATE_LABELS,
  AUDIBILITY_LABELS,
} from '@/data/robotSelectionConfig';
import { FREELANCE_VALUE, buildCompanyAssignmentSchema } from '@/data/companyConfig';
import { getRobotColorStyle } from '@/utils/traitColors';
import type { Robot } from '@/types/Robot';
import './RobotSelectionCard.css';

interface RobotSelectionCardProps {
  robot: Robot;
}

/**
 * One robot's card in the Robot Selection hub tile (Roadmap Phase 8, redesigned Phase 15.2) —
 * two sibling regions: `.robot-selection-card__top` (a native clickable element — not the
 * `Button` primitive, which accepts no children — carrying the same role="button"/tabIndex/
 * onKeyDown activation contract the outer `<li>` used to hold) and `.robot-selection-card__bottom`
 * (the company-assignment RadioButton, a plain sibling with no click handling — there is no
 * longer a nested-interactive-element bubbling concern to guard against, so no stopBubble).
 */
export function RobotSelectionCard({ robot }: RobotSelectionCardProps) {
  const selectRobot = useUIStore((s) => s.selectRobot);
  const localeId = getActiveLocaleId();
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);
  const localeRobots = useLocaleStore((s) => s.locales[localeId]?.robots ?? []);
  const companyAssignmentSchema = buildCompanyAssignmentSchema(companies);
  const displayName = robot.name || robot.id;
  const jobLabel = robot.job ? JOB_TYPE_LABELS[robot.job.type] : UNASSIGNED_JOB_LABEL;
  const dockingLabel = DOCKING_STATE_LABELS[robot.docking];
  const statusLabel = isRobotAudible(robot.audioMode, localeRobots)
    ? AUDIBILITY_LABELS.emitting
    : AUDIBILITY_LABELS.disabled;

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
    <li className="robot-selection-card" style={getRobotColorStyle(robot.identityColor)}>
      <div
        className="robot-selection-card__top"
        role="button"
        tabIndex={0}
        aria-label={displayName}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
      >
        <div className="robot-selection-card__meta-row">
          <svg className="robot-selection-card__avatar" viewBox="-80 -80 160 160" aria-hidden="true">
            <RobotBody robot={robot} ignoreDaylight />
          </svg>

          <div className="robot-selection-card__meta-text">
            <span className="robot-selection-card__name">{displayName}</span>
            <span className="robot-selection-card__job">{jobLabel.humanLabel}</span>
            <span className="robot-selection-card__status-line">
              {dockingLabel.humanLabel} · {statusLabel.humanLabel}
            </span>
          </div>
        </div>

        <SliderLinear
          schema={BATTERY_READOUT_SCHEMA}
          value={Math.round(robot.batteryLevel)}
          onChange={() => {}}
          readOnly
        />
      </div>

      <div className="robot-selection-card__bottom">
        <RadioButton
          schema={companyAssignmentSchema}
          value={robot.companyId ?? FREELANCE_VALUE}
          onChange={handleCompanyChange}
        />
      </div>
    </li>
  );
}

export default RobotSelectionCard;
```

Note what's gone from the imports: `DualLabel` (no longer used anywhere in this file — every remaining text row is a bare `<span>`), `AudioStatusBadge`, `ROBOT_SELECTION_ROW_SCHEMAS`, and the `ReactEventHandler`-typed `stopBubble` constant.

**`RobotSelectionCard.css`** (full new shape — replaces every rule from `.robot-selection-card__row` through `.robot-selection-card__value`):

```css
.robot-selection-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--color-surface);
  list-style: none;
  font-family: var(--font-controls);
  font-weight: var(--font-weight-control);
}

.robot-selection-card__top {
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
}

.robot-selection-card__top:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.robot-selection-card__meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.robot-selection-card__avatar {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
}

.robot-selection-card__meta-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.robot-selection-card__name {
  font-size: var(--font-size-heading-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.robot-selection-card__job,
.robot-selection-card__status-line {
  font-size: var(--font-size-label);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.robot-selection-card__bottom {
  display: flex;
  justify-content: center;
}
```

* **Naming conventions:** `robot-selection-card__top`/`__bottom`/`__meta-row`/`__meta-text`/`__name`/`__job`/`__status-line` — plain BEM-style elements, same non-`sc-` prefix convention this file already used (it isn't one of the 14 `ControlSchema` primitives).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

**`robotSelectionConfig.ts`** (diff — add `AUDIBILITY_LABELS`, §1.3; remove now-dead entries):

```typescript
export const ROBOT_SELECTION_ROW_SCHEMAS = {
  name: { id: 'robotSelection.name', type: 'dualLabel', loreLabel: 'ROBOT IDENTIFIER', humanLabel: 'Robot Name' },
  job: { id: 'robotSelection.job', type: 'dualLabel', loreLabel: 'ASSIGNED PROTOCOL', humanLabel: 'Job Data' },
  docking: { id: 'robotSelection.docking', type: 'dualLabel', loreLabel: 'DOCKING STATE', humanLabel: 'Docked Status' },
  // .battery and .audio removed — dead once RobotSelectionCard/RobotDisplaySection no longer
  // reference them (§1.5 item 1).
} satisfies Record<string, DualLabelSchema>;

// ... JOB_TYPE_LABELS / UNASSIGNED_JOB_LABEL / DOCKING_STATE_LABELS / AUDIO_MODE_LABELS / AUDIO_STATUS_COLOR_MAP unchanged ...

export const AUDIBILITY_LABELS: Record<'emitting' | 'disabled', ValueLabel> = {
  emitting: { loreLabel: 'ACOUSTIC EMISSION ACTIVE', humanLabel: 'Emitting' },
  disabled: { loreLabel: 'ACOUSTIC EMISSION SUPPRESSED', humanLabel: 'Disabled' },
};
```

**`AudioEngine.ts`** (diff — `triggerWithCap` only; see §1.2 for the full before/after):

```typescript
import { isRobotAudible } from '@/utils/robotAudibility';
// ...
if (!isRobotAudible(robotFromStore?.audioMode, localeRobots)) {
  return false;
}
```

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`robotAudibility.test.ts` (new):**
  1. Returns `false` when `audioMode` is `'mute'`, regardless of any other robot's state.
  2. Returns `true` when `audioMode` is `'none'`/`undefined`/`'highlight'` and no robot in `localeRobots` is `'solo'`.
  3. Returns `false` when another robot in `localeRobots` is `'solo'` and this `audioMode` isn't `'solo'`.
  4. Returns `true` when this `audioMode` is `'solo'`, even if it's the only entry in `localeRobots` marked so.
  5. Returns `true` for an empty `localeRobots` array (no solo possible) unless `audioMode` is itself `'mute'`.
* **`AudioEngine.test.ts` (unmodified):** every existing mute/solo assertion must still pass with zero edits — proves the extraction is behavior-preserving.
* **`RobotSelectionCard.test.tsx` (modified):**
  - Every existing test keeps passing in spirit but several need re-targeting since the DOM changed: `screen.getByRole('button')` now resolves to `.robot-selection-card__top`, not the `<li>`; `.robot-selection-card` (the color-scoping root) is still the outer `<li>`, so the existing "scopes the card root to the robot's own identityColor" tests need no change.
  - No `.robot-selection-card__value` class exists anymore — replace with `.robot-selection-card__name`/`__job`/`__status-line` where those specific assertions land.
  - New: renders the combined "Docking · Status" line correctly for an audible robot (e.g. `docking: 'active'`, no other robot solo/muted → "Active · Emitting") and for a muted robot ("Active · Disabled").
  - New: Status reflects locale-wide solo — a robot with `audioMode: 'none'` reads "Disabled" once another robot in the same locale has `audioMode: 'solo'`; reverts to "Emitting" once that solo is removed or reassigned.
  - New: the Battery row renders via the read-only `SliderLinear` (assert `role="status"`, `data-readonly="true"`, `Math.round(robot.batteryLevel)` formatted with `%`) — no `role="slider"` anywhere in the card.
  - New: no `AudioStatusBadge`/audio-status `role="status"` dot renders anywhere in the card (the old audio-mode-dot tests are removed, not just re-targeted).
  - "clicking a company radio option does not also select the robot" and "clicking elsewhere on the card still selects the robot" both still pass with no `stopBubble` in the implementation — the new sibling-region structure achieves the same isolation structurally.
* **`robotSelectionConfig.test.ts` (modified):** `ROBOT_SELECTION_ROW_SCHEMAS`'s shape assertions drop `.battery`/`.audio`; new `describe('AUDIBILITY_LABELS')` block asserts both `'emitting'`/`'disabled'` keys have non-empty `loreLabel`/`humanLabel`.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (surfaces any remaining reference to removed classes/exports).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including `AudioEngine.test.ts` unmodified.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** `npm run dev`, open the Robots tile — confirm each card shows avatar + Name (visually bolder) + Job + "Docking · Status" line, then the battery slider with its label, then the company picker below. Click anywhere in the top region (avatar, text, or the battery slider) and confirm it selects the robot; click a company option and confirm it does not. Set one robot's Audio Setting to Solo (via Robot Options) and confirm every other robot's card in the list flips to "Disabled" while the soloed one's stays "Emitting."

---

## 6. Documentation & Git/Workflow Context

* **`docs/reference/ROBOT_DATA_GRID.md` update:** append two new draft rows to the existing "Draft — pending review" table, following the exact format of the Job Data/Docked Status/Audio Setting value rows already there:

  | English Label | Lore Label | Field | Notes |
  |---|---|---|---|
  | Emitting | ACOUSTIC EMISSION ACTIVE | `AUDIBILITY_LABELS.emitting` | Card Status value — true audibility (not muted, and not excluded by another robot's Solo) |
  | Disabled | ACOUSTIC EMISSION SUPPRESSED | `AUDIBILITY_LABELS.disabled` | Card Status value |

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/robot-cards-redesign`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `robotAudibility.ts` + its own test, standalone, no consumer wired yet, (2) `AudioEngine.ts`'s `triggerWithCap` refactor to call it (behavior-preserving, verified against the unmodified `AudioEngine.test.ts`), (3) `robotSelectionConfig.ts`'s `AUDIBILITY_LABELS` addition + `.battery`/`.audio` removal (+ test), (4) `RobotSelectionCard.tsx`/`.css` restructure (+ test), (5) `docs/reference/ROBOT_DATA_GRID.md`.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, or reasoned through above — not left open):

- ~~Does the top/bottom split move the click handler, or keep it on the outer `<li>` with `stopBubble`?~~ **Resolved: move it, delete `stopBubble` entirely** (intent doc, confirmed via interview).
- ~~Is Battery dropped from this card (as the roadmap's pre-interview draft assumed)?~~ **Resolved: no — it stays, now as the read-only slider, label kept** (corrected mid-interview).
- ~~Does Name get visual hierarchy over Job/Status?~~ **Resolved: yes, larger/heavier** (intent doc, confirmed).
- ~~How are Docking and Status joined?~~ **Resolved: one line, middle-dot separator** (intent doc, confirmed).
- ~~Is Status this robot's own `audioMode` or true locale-wide audibility?~~ **Resolved: true audibility, shared predicate extracted from `AudioEngine.ts`** (confirmed earlier in this same interview thread, before the intent doc was written).

Still open — flag for Plan/Tasks, not blocking this spec:

1. **`ROBOT_SELECTION_ROW_SCHEMAS.battery`/`.audio` removal (§1.5 item 1)** is this spec's own judgment call, not something `/interview-me` was asked about directly. Low risk — grep-confirmed zero remaining consumers — but flagged in case Crawford would rather leave them defined-but-unused for a possible future consumer.
2. **`AudioStatusBadge` kept despite zero real consumers (§1.5 item 2)** — matches existing `Stepper` precedent, but worth Crawford's explicit sign-off since it's a whole component, not just a config entry, sitting unused after this phase.
3. **Exact avatar sizing/column proportions** in the new `.robot-selection-card__meta-row` — the intent doc explicitly leaves this open; §4's CSS is a reasonable starting point (64px avatar unchanged, flex-shrink: 0, text column flexes to fill), not a pixel-perfect mandate.
