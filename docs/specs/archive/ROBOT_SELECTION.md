# Phase Spec: Robot Selection (Roadmap Phase 8)

> **Note (added when committing, after the fact):** written and confirmed before Phase 9 existed —
> "Robot Options (Phase 9) does not exist yet" and references to `RobotEditorTab` below (§ 1, § 3)
> describe routing as it stood at the time, on `feature/robot-selection`. Phase 9 has since shipped;
> `RobotEditorTab.tsx` was renamed to `RobotOptionsTab.tsx`, and robot selection now routes there
> instead. Also, `AudioStatusBadge`'s `role="img"` in § 4's code sample shipped as `role="status"`
> — a later code-review "Consider" finding, not an error in this spec. Left otherwise unedited as a
> historical planning record — see [docs/todo/roadmap.md §§ 8-9](../todo/roadmap.md) for what
> actually shipped.

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-selection.md](../intent/robot-selection.md) (confirmed via
`/interview-me`). Source of scope: [docs/todo/roadmap.md § 8](../todo/roadmap.md#8-robot-selection).
Prior art / current architecture: [docs/UI_SHELL.md](../UI_SHELL.md),
[docs/ROBOT_DESIGN.md](../ROBOT_DESIGN.md), [docs/ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md),
[docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md),
[docs/reference/ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md).

---

## 1. Overview & Claude Explanation

This phase replaces `RobotsTab.tsx`'s plain `Button`-per-robot list with a real card-based Robot
Selection UI, and fixes the world-view click-through the roadmap's About section calls for. Robot
Options (Phase 9) does not exist yet — a selected card routes to the exact same place today's list
already routes to, `RobotEditorTab`, confirmed during intake.

**Cards.** `RobotSelectionCard` (new, `src/components/selection/`) is a single **native clickable
element**, not the `Button` primitive — `Button.tsx` renders only its own schema's `DualLabel` and
accepts no children, so it can't hold a card's worth of content. Each card shows:

- An avatar (`RobotBody`, reused as-is) with its day/night `lightnessMultiplier` neutralized, so
  the thumbnail looks the same regardless of the active locale's time of day. The separate,
  non-audio battery-dim overlay (`computeBatteryDimOpacity`) is **kept** — confirmed during
  intake, it's a different signal from time-of-day and stays visible.
- Robot Name / Job Data / Battery Data (text %, no gauge) / Docked Status rows, each a `DualLabel`
  using the exact lore/human pairs already in `ROBOT_DATA_GRID.md`.
- An `AudioStatusBadge` (new) — a colored dot, not text: off=purple, mute=red, solo=green,
  highlight=amber. Colors are sourced from `colorTheme.json` (the same file/`hslToString()` pattern
  `realWorldGradient.ts` already uses for the `vent` family), not new hardcoded hex.

**Color unification.** Confirmed during intake: `AccordionContainer.css`'s hardcoded status-light
hex (`#8b1a14` red / `#1a8f40` green) and `PowerRockerSwitch.css`'s matching literals (the pair
`AccordionContainer` explicitly mirrors, plus its own amber `#c08800` transitioning state) get
refactored onto the same `colorTheme.json` source as `AudioStatusBadge`, via one new shared helper
(`src/utils/statusLightColors.ts`) — one color source instead of three duplicated hex sets.

**World-view click-through.** `Robot.tsx`'s `onClick` already calls `selectRobot(id)`
unconditionally, but nothing today routes that into the tile. Two things are needed:

1. **The actual blocker** (confirmed during intake): `Console.css`'s `.console` is
   `position: absolute; inset: 0` — a full-bleed box covering the entire screen area, `z-index: 1`,
   above `.world-view`. With no `pointer-events: none` anywhere in that chain, `.console` (and its
   descendants `.console-panel`/`.hub-nav`) swallow every click in that area — including the empty
   space around/between `HubNav`'s grid tiles — before it can ever reach a robot's `<g>` in the SVG
   below. This didn't matter until the hub nav genuinely spans the full screen (the mobile-first
   Phase 2 layout), which is why it "used to work." The fix follows the same
   `pointer-events: none` + selectively-`auto` pattern already used elsewhere (`SleeveContainer.css`,
   `App.css`, `.rocker-panel`): while `activeHubTile === null` (the grid state — the *only* state
   `Console` renders bare `HubNav` with nothing else in `.console-panel`), `.console` gets
   `pointer-events: none` with `pointer-events: auto` restored on the grid's own `Button`s
   (`.sc-button`) so they stay clickable. Once any tile is open, `.console` reverts to its current
   `pointer-events: auto` (unchanged) — full click capture, exactly like today.
2. **The routing itself:** `Robot.tsx`'s click handler also calls `setActiveHubTile('robots')`,
   guarded to only fire when `activeHubTile === null` — this is a JS-level guard, not reliance on
   the CSS fix alone, so "robots aren't clickable once a tile is open" is a real, unit-testable rule
   rather than an emergent side effect of hit-testing.

**Grid draft rows.** `ROBOT_DATA_GRID.md` only defines category-level lore/human pairs ("Job
Data"/"ASSIGNED PROTOCOL"), not per-*value* labels — there's no lore term for "Vent Extraction"
itself, for "Docked"/"Active" as individual states, or for "Mute"/"Solo"/"Highlight"/"Off" as
individual audio-mode values. This phase appends best-guess draft rows for all of these to the
bottom of the grid, clearly marked as draft, for Crawford's review/edit — not treated as final.

## 2. Target File Structure

```text
src/
├── components/
│   ├── selection/                        # NEW directory
│   │   ├── RobotSelectionCard.tsx         # NEW — the clickable card (native element, not Button).
│   │   │                                  #   Composes RobotBody(ignoreDaylight), 4x DualLabel rows,
│   │   │                                  #   and AudioStatusBadge. onClick -> selectRobot(robot.id).
│   │   ├── RobotSelectionCard.css         # NEW
│   │   ├── RobotSelectionCard.test.tsx    # NEW — see § 5
│   │   ├── AudioStatusBadge.tsx           # NEW — colored dot, maps Robot['audioMode'] to a
│   │   │                                  #   StatusLightState via statusLightColors.ts
│   │   ├── AudioStatusBadge.css           # NEW
│   │   └── AudioStatusBadge.test.tsx      # NEW — see § 5
│   ├── robot/
│   │   ├── RobotBody.tsx                  # MODIFIED — new optional `ignoreDaylight?: boolean`
│   │   │                                  #   prop; when true, lightnessMultiplier is fixed at a
│   │   │                                  #   neutral 1 instead of being derived from
│   │   │                                  #   uiStore.activeLocaleLocalTime. Battery dim
│   │   │                                  #   (computeBatteryDimOpacity) is untouched.
│   │   ├── RobotBody.test.tsx             # NEW — first test file for this component; scoped to
│   │   │                                  #   the new prop only (see § 5), not a retroactive suite
│   │   │                                  #   for existing untested logic
│   │   ├── Robot.tsx                      # MODIFIED — handleClick also calls
│   │   │                                  #   setActiveHubTile('robots') when activeHubTile is
│   │   │                                  #   already null; reads activeHubTile from useUIStore
│   │   └── Robot.test.tsx                 # NEW — first test file for this component; scoped to
│   │                                       #   the click/navigation behavior (see § 5)
│   ├── ui/
│   │   ├── controls/
│   │   │   ├── AccordionContainer.tsx     # MODIFIED — status light's color/glow now computed via
│   │   │   │                              #   getStatusLightColor('green' | 'red') and applied as
│   │   │   │                              #   inline style, replacing the CSS attribute-selector
│   │   │   │                              #   hardcoded hex (documented inline-style exception,
│   │   │   │                              #   same one SliderCenteredZero already uses)
│   │   │   ├── AccordionContainer.css     # MODIFIED — `color`/`box-shadow` removed from the
│   │   │   │                              #   `[data-content-active='...']` rules; the pulse
│   │   │   │                              #   `animation` declarations stay (CSS still owns motion,
│   │   │   │                              #   JS now owns color)
│   │   │   └── AccordionContainer.test.tsx # MODIFIED — asserts the light's inline `color` matches
│   │   │                                   #   `getStatusLightColor`'s output instead of a
│   │   │                                   #   hardcoded hex
│   │   └── physical/
│   │       ├── PowerRockerSwitch.tsx      # MODIFIED — same treatment as AccordionContainer, for
│   │       │                              #   its three states (off=red, on=green,
│   │       │                              #   transitioning=amber)
│   │       ├── PowerRockerSwitch.css      # MODIFIED — same split as AccordionContainer.css
│   │       └── PowerRockerSwitch.test.tsx # MODIFIED — same treatment as AccordionContainer.test.tsx
│   └── panels/screen/console/
│       ├── RobotsTab.tsx                  # MODIFIED — renders one RobotSelectionCard per robot
│       │                                  #   instead of a Button-per-robot list; still owns the
│       │                                  #   locale robots lookup, unchanged
│       ├── RobotsTab.css                  # MODIFIED — list layout adjusted for cards (grid/stack)
│       ├── RobotsTab.test.tsx             # MODIFIED — rewritten for card content/roles instead of
│       │                                  #   plain buttons (see § 5)
│       ├── Console.tsx                    # MODIFIED — reads activeHubTile from useUIStore, adds a
│       │                                  #   conditional class (e.g. `console--grid`) when null
│       ├── Console.css                    # MODIFIED — `.console--grid { pointer-events: none; }`
│       │                                  #   plus `.console--grid .sc-button { pointer-events:
│       │                                  #   auto; }` to keep HubNav's own tiles clickable
│       └── Console.test.tsx               # NEW — first test file for this component; asserts the
│                                          #   conditional class (see § 5)
├── data/
│   ├── robotSelectionConfig.ts            # NEW — DualLabelSchema entries for the five card rows
│   │                                      #   (Name/Job/Battery/Docking/Audio, exact grid pairs),
│   │                                      #   plus draft per-value label maps for JobType/
│   │                                      #   DockingState/'none' audio mode (see § 4), and
│   │                                      #   AUDIO_STATUS_COLOR_MAP: Record<AudioMode,
│   │                                      #   StatusLightState>
│   └── robotSelectionConfig.test.ts       # NEW — see § 5
└── utils/
    ├── statusLightColors.ts               # NEW — getStatusLightColor(state, glowAlpha?) ->
    │                                      #   { color, glow }, sourced from colorTheme.json's
    │                                      #   vent/alert.powered/indicator.powered/strut.base
    ├── statusLightColors.test.ts          # NEW — see § 5
    ├── colorUtils.ts                      # MODIFIED — hslToString gains an optional `alpha`
    │                                      #   second parameter (backward compatible — every
    │                                      #   existing call site omits it and is unaffected)
    └── colorUtils.test.ts                 # MODIFIED — new case for the alpha parameter
docs/
├── reference/
│   └── ROBOT_DATA_GRID.md                 # MODIFIED — new rows appended at the bottom under a
│                                          #   clearly-marked "Draft — pending review" heading:
│                                          #   per-JobType, per-DockingState, and per-AudioMode
│                                          #   value labels
├── ROBOT_DESIGN.md                        # MODIFIED — documents RobotBody's new `ignoreDaylight`
│                                          #   prop under "Non-Audio Brightness Overlays"
├── UI_SHELL.md                            # MODIFIED — the "still planned" Robot Selection bullet
│                                          #   (§ "Still planned (not yet built)") becomes real;
│                                          #   notes the Console.css pointer-events fix
└── todo/roadmap.md                     # MODIFIED — § 8's bullets marked resolved
```

**Confirmed NOT touched:** `src/systems/robotSystems.ts`/`ROBOT_LIFECYCLE.md` (this phase only
*reads* Battery/Docking/Job — no state-machine change), `ConsolePanel.tsx` (its existing
`selectedRobotId ? <RobotEditorTab /> : <RobotsTab />` ternary already routes a card selection
correctly — no change needed), `RobotEditorTab.tsx`/`RobotMetaTab.tsx`/`RobotAudioTab.tsx`/
`RobotOscillatorsTab.tsx` (Phase 9's job), `src/engine/AudioEngine.ts` (read-only `audioMode`
display, no new capability), `WorldView.tsx`/`OceanScene.tsx`/`PlanetView.tsx` (no render-tree
change — the click fix is CSS on the sibling `Console` layer, not a WorldView change), any of the
other 12 `ui/controls/` primitives besides `AccordionContainer` and `DualLabel` (used as-is, no
changes needed), `docs/COMPONENT_LIBRARY.md` (`RobotSelectionCard`/`AudioStatusBadge` are domain
components in `src/components/selection/`, not additions to the closed 13-primitive set).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in § 2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build
  assets.
* **No battery gauge.** Battery Data is plain text percentage via `DualLabel`, confirmed during
  intake to save room on the card — a real gauge is Phase 9's Robot Display drawer's job.
* **`Button.tsx` is not modified.** It stays a no-children, schema-only primitive; the card's
  click target is a plain native element, not a stretched/wrapped `Button`.
* **Robot visuals still map strictly to audio attributes** per `ROBOT_DESIGN.md`'s guardrail —
  `ignoreDaylight` is a rendering-context override for where the thumbnail sits in the day/night
  cycle, not a change to what `audioAttributes` produce, and it must not affect the live in-world
  `Robot.tsx` instances' own day/night behavior (they don't pass the new prop).
  Battery-dim (`computeBatteryDimOpacity`) is untouched and still applies on the thumbnail.
* **No new `AudioEngine` capability.** `AudioStatusBadge` only reads `robot.audioMode` — it never
  writes it (editing stays `RobotAudioTab.tsx`'s job) and calls nothing on `AudioEngine`.
* **No `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in this phase's code.** The
  pointer-events fix is pure CSS + a conditional class; the click-routing fix is a plain
  synchronous store write.
* **`hslToString`'s new `alpha` parameter is additive only** — every existing call site
  (`realWorldGradient.ts`, `robotVisualHelpers.ts` if applicable) omits it and must continue
  producing byte-identical output.
* **`statusLightColors.ts` is the single place `colorTheme.json`'s indicator/alert/vent/strut
  families get read for status-light purposes.** `AccordionContainer.tsx`, `PowerRockerSwitch.tsx`,
  and `AudioStatusBadge.tsx` all consume it — none hardcodes a hex value or duplicates the
  `colorTheme.json` lookup itself.
* **`ROBOT_DATA_GRID.md`'s new rows are explicitly drafts.** Append them under a heading that says
  so (e.g. "Draft — pending review") — do not silently fold them into the existing table as if
  already confirmed.
* **This phase does not touch Robot Options.** Card selection continues routing to
  `RobotEditorTab`, unchanged; no Phase 9 drawer work happens here.

---

## 4. Code Style & Architecture Conventions

**`colorUtils.ts` — `hslToString` gains an optional `alpha`:**

```typescript
export function hslToString(hsl: HSL, alpha?: number): string {
  const { h, s, l } = hsl;
  return alpha === undefined ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}
```

**`src/utils/statusLightColors.ts` — the single color source for every status light:**

```typescript
import colorTheme from '@/constants/colorTheme.json';
import { hslToString, type HSL } from '@/utils/colorUtils';

/** off=purple, mute/inactive=red, solo/active=green, highlight/transitioning=amber — confirmed
 *  during intake, sourced from colorTheme.json rather than invented hex. */
export type StatusLightState = 'purple' | 'red' | 'green' | 'amber';

const STATUS_LIGHT_SOURCE: Record<StatusLightState, HSL> = {
  purple: colorTheme.vent.base,
  red: colorTheme.alert.powered,
  green: colorTheme.indicator.powered,
  amber: colorTheme.strut.base,
};

export function getStatusLightColor(state: StatusLightState, glowAlpha = 0.6) {
  const hsl = STATUS_LIGHT_SOURCE[state];
  return { color: hslToString(hsl), glow: hslToString(hsl, glowAlpha) };
}
```

**`AccordionContainer.tsx` — status light color moves from CSS to a computed inline style:**

```typescript
// BEFORE: color driven entirely by CSS attribute selectors in AccordionContainer.css
<span
  className="sc-accordion__light"
  aria-hidden="true"
  data-content-active={contentActive === undefined ? undefined : String(contentActive)}
/>

// AFTER
const light = contentActive === undefined ? null : getStatusLightColor(contentActive ? 'green' : 'red');
// ...
<span
  className="sc-accordion__light"
  aria-hidden="true"
  data-content-active={contentActive === undefined ? undefined : String(contentActive)}
  style={light ? { color: light.color, boxShadow: `0 0 4px 1px ${light.glow}` } : undefined}
/>
```

`AccordionContainer.css`'s `[data-content-active='true'|'false']` rules keep their `animation`
declaration (motion stays CSS-owned) but drop `color`/`box-shadow` (color is now JS-owned, matching
`SliderCenteredZero`'s already-documented inline-style exception). `PowerRockerSwitch.tsx` gets the
identical treatment for its three states (`off`→red, `on`→green, `transitioning`→amber).

**`src/components/robot/RobotBody.tsx` — day/night bypass:**

```typescript
interface RobotBodyProps {
  robot: Robot;
  /** When true, renders as if local time is always neutral (no day/night dimming) — used for
   *  the Robot Selection card thumbnail so it reads consistently regardless of the active
   *  locale's time of day. Battery dim is unaffected — it's a separate, non-audio signal. */
  ignoreDaylight?: boolean;
}

export const RobotBody = memo(function RobotBody({ robot, ignoreDaylight }: RobotBodyProps) {
  const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);
  const lightnessMultiplier = ignoreDaylight
    ? 1
    : 0.5 + 0.5 * Math.sin(((localTime - 6) / 24) * Math.PI * 2);
  // ...unchanged below
```

**`src/data/robotSelectionConfig.ts` — schema + draft value-label maps, following
`audioRigConfig.ts`'s style (no hardcoded copy in components):**

```typescript
import type { DualLabelSchema } from '@/types/controls';
import type { JobType, DockingState } from '@/types/Robot';
import type { StatusLightState } from '@/utils/statusLightColors';

export const ROBOT_SELECTION_ROW_SCHEMAS = {
  name: { id: 'robotSelection.name', type: 'dualLabel', loreLabel: 'ROBOT IDENTIFIER', humanLabel: 'Robot Name' },
  job: { id: 'robotSelection.job', type: 'dualLabel', loreLabel: 'ASSIGNED PROTOCOL', humanLabel: 'Job Data' },
  battery: { id: 'robotSelection.battery', type: 'dualLabel', loreLabel: 'POWER CELL STATUS', humanLabel: 'Battery Data' },
  docking: { id: 'robotSelection.docking', type: 'dualLabel', loreLabel: 'DOCKING STATE', humanLabel: 'Docked Status' },
  audio: { id: 'robotSelection.audio', type: 'dualLabel', loreLabel: 'PROBE DIAGNOSTICS', humanLabel: 'Audio Setting' },
} satisfies Record<string, DualLabelSchema>;

// Draft — mirrored into ROBOT_DATA_GRID.md's new "Draft" rows for review.
export const JOB_TYPE_LABELS: Record<JobType, { loreLabel: string; humanLabel: string }> = {
  ventExtraction: { loreLabel: 'VOLATILE VENT EXTRACTION', humanLabel: 'Vent Extraction' },
  acousticSurvey: { loreLabel: 'HIGH-ALTITUDE ACOUSTIC SURVEY', humanLabel: 'Acoustic Survey' },
  structuralInspection: { loreLabel: 'STRUCTURAL INTEGRITY INSPECTION', humanLabel: 'Structural Inspection' },
  fluidMonitoring: { loreLabel: 'SUBSTATION FLUID MONITORING', humanLabel: 'Fluid Monitoring' },
};
export const UNASSIGNED_JOB_LABEL = { loreLabel: 'NO PROTOCOL ASSIGNED', humanLabel: 'Unassigned' };

export const DOCKING_STATE_LABELS: Record<DockingState, { loreLabel: string; humanLabel: string }> = {
  docked: { loreLabel: 'DOCKED', humanLabel: 'Docked' },
  docking: { loreLabel: 'DOCKING', humanLabel: 'Docking' },
  departing: { loreLabel: 'DEPARTING', humanLabel: 'Departing' },
  active: { loreLabel: 'ACTIVE', humanLabel: 'Active' },
};

type AudioMode = NonNullable<import('@/types/Robot').Robot['audioMode']>;
export const AUDIO_MODE_LABELS: Record<AudioMode, { loreLabel: string; humanLabel: string }> = {
  none: { loreLabel: 'OFFLINE', humanLabel: 'Off' },
  mute: { loreLabel: 'SILENCED', humanLabel: 'Mute' },
  solo: { loreLabel: 'ISOLATED', humanLabel: 'Solo' },
  highlight: { loreLabel: 'PRIORITIZED', humanLabel: 'Highlight' },
};
export const AUDIO_STATUS_COLOR_MAP: Record<AudioMode, StatusLightState> = {
  none: 'purple', mute: 'red', solo: 'green', highlight: 'amber',
};
```

**`src/components/selection/RobotSelectionCard.tsx` — the clickable card:**

```typescript
export function RobotSelectionCard({ robot }: { robot: Robot }) {
  const selectRobot = useUIStore((s) => s.selectRobot);
  const jobLabel = robot.job ? JOB_TYPE_LABELS[robot.job.type] : UNASSIGNED_JOB_LABEL;

  return (
    <li
      className="robot-selection-card"
      role="button"
      tabIndex={0}
      onClick={() => selectRobot(robot.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectRobot(robot.id); }}
      aria-label={robot.name || robot.id}
    >
      <svg className="robot-selection-card__avatar" viewBox="-50 -50 100 100">
        <RobotBody robot={robot} ignoreDaylight />
      </svg>
      <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.name} />
      <span className="robot-selection-card__value">{robot.name || robot.id}</span>
      <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.job} />
      <span className="robot-selection-card__value">{jobLabel.humanLabel}</span>
      <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.battery} />
      <span className="robot-selection-card__value">{Math.round(robot.batteryLevel)}%</span>
      <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.docking} />
      <span className="robot-selection-card__value">{DOCKING_STATE_LABELS[robot.docking].humanLabel}</span>
      <DualLabel {...ROBOT_SELECTION_ROW_SCHEMAS.audio} />
      <AudioStatusBadge audioMode={robot.audioMode ?? 'none'} />
    </li>
  );
}
```

`role="button"`/`tabIndex`/`onKeyDown` give the native element the same activation contract
`Button.tsx` gets for free from a real `<button>` — needed here since the card is intentionally not
that primitive. `RobotsTab.tsx` renders these inside a `<ul>` (unchanged element from today).

**`src/components/selection/AudioStatusBadge.tsx`:**

```typescript
export function AudioStatusBadge({ audioMode }: { audioMode: NonNullable<Robot['audioMode']> }) {
  const { color, glow } = getStatusLightColor(AUDIO_STATUS_COLOR_MAP[audioMode]);
  const label = AUDIO_MODE_LABELS[audioMode];
  return (
    <span
      className="audio-status-badge"
      role="img"
      aria-label={`${label.humanLabel} (${label.loreLabel})`}
      style={{ color, boxShadow: `0 0 4px 1px ${glow}` }}
    />
  );
}
```

**`Console.tsx` — pointer-events gate:**

```typescript
function Console() {
  const activeHubTile = useUIStore((s) => s.activeHubTile);
  return (
    <div className={activeHubTile === null ? 'console console--grid' : 'console'}>
      <ConsolePanel />
    </div>
  );
}
```

```css
/* Console.css addition */
.console--grid {
  pointer-events: none;
}
.console--grid .sc-button {
  pointer-events: auto;
}
```

**`Robot.tsx` — click also routes into the tile, guarded:**

```typescript
// BEFORE
const handleClick = () => { selectRobot(robot.id); };

// AFTER
const activeHubTile = useUIStore((s) => s.activeHubTile);
const setActiveHubTile = useUIStore((s) => s.setActiveHubTile);
const handleClick = () => {
  selectRobot(robot.id);
  if (activeHubTile === null) setActiveHubTile('robots');
};
```

* **Naming Conventions:** `src/components/selection/` mirrors the flat, PascalCase-file pattern
  already used by `src/components/robot/`. `statusLightColors.ts` follows `colorUtils.ts`'s
  lowercase-camel export style. `robotSelectionConfig.ts` follows `audioRigConfig.ts`'s naming
  (`*Config.ts`, `UPPER_SNAKE` exported constants).
* **Formatting:** Match each touched file's existing comment-banner style; no new convention.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate (see § 2 for exact files).
* **`colorUtils.test.ts` (new case):** `hslToString` with an `alpha` argument produces an
  `hsla(...)` string with that alpha; omitting it still produces the existing `hsl(...)` string
  byte-identical to before.
* **`statusLightColors.test.ts` (new):** `getStatusLightColor` returns the expected `color`
  for each of the four `StatusLightState`s, sourced from `colorTheme.json`'s
  `vent.base`/`alert.powered`/`indicator.powered`/`strut.base` respectively; the default
  `glowAlpha` (0.6) appears in the returned `glow` string, and a custom `glowAlpha` overrides it.
* **`robotSelectionConfig.test.ts` (new):** every `JobType` member has an entry in
  `JOB_TYPE_LABELS`; every `DockingState` member has an entry in `DOCKING_STATE_LABELS`; every
  `AudioMode` value has an entry in both `AUDIO_MODE_LABELS` and `AUDIO_STATUS_COLOR_MAP` — mirrors
  `controls.test.ts`'s "every variant covered" runtime-assertion style.
* **`RobotBody.test.tsx` (new, scoped to the new prop):**
  1. With `ignoreDaylight` omitted/false, rendering with a non-neutral
     `uiStore.activeLocaleLocalTime` produces a different color than at local time 12 (existing
     day/night behavior, used as a baseline/regression check).
  2. With `ignoreDaylight={true}`, the rendered color is identical regardless of
     `activeLocaleLocalTime`'s value.
  3. `computeBatteryDimOpacity`'s effect (the dim `<g opacity>`) is unaffected by `ignoreDaylight`
     — still present and driven by `batteryLevel` in both cases.
* **`Robot.test.tsx` (new):**
  1. Clicking a robot when `uiStore.activeHubTile === null` calls both `selectRobot(robot.id)` and
     `setActiveHubTile('robots')`.
  2. Clicking a robot when `uiStore.activeHubTile` is already set to something else calls
     `selectRobot(robot.id)` but does not change `activeHubTile`.
* **`Console.test.tsx` (new):** renders with the `console--grid` class when
  `activeHubTile === null`, and without it for any other `activeHubTile` value.
* **`AccordionContainer.test.tsx` (modified):** the status light's inline `color` style matches
  `getStatusLightColor('green').color` when `contentActive={true}`, and
  `getStatusLightColor('red').color` when `contentActive={false}`; no inline `color` when
  `contentActive` is omitted (existing unlit-dot behavior, unchanged).
* **`PowerRockerSwitch.test.tsx` (modified):** same pattern for its `off`/`on`/`transitioning`
  states against `getStatusLightColor('red'|'green'|'amber')`.
* **`RobotSelectionCard.test.tsx` (new):**
  1. Renders the robot's name, job label (or "Unassigned" when `job` is undefined), rounded battery
     percentage, and docking-state label as visible text.
  2. Renders an `AudioStatusBadge` whose accessible name reflects the robot's `audioMode`
     (defaulting to `'none'`/Off when unset).
  3. Clicking the card (and pressing Enter/Space on it) calls `selectRobot(robot.id)`.
  4. Passes `ignoreDaylight` through to the rendered `RobotBody`.
* **`AudioStatusBadge.test.tsx` (new):** for each of the four `audioMode` values, the rendered
  dot's inline `color` matches `getStatusLightColor(AUDIO_STATUS_COLOR_MAP[mode]).color`, and its
  accessible name includes both the human and lore labels.
* **`RobotsTab.test.tsx` (rewritten):** replaces the old "renders a Button per robot" assertions
  with "renders a `RobotSelectionCard` per robot" (by role/aria-label), keeps the existing
  fallback-to-id-on-blank/missing-name coverage, keeps the "no + New Robot button" coverage, and
  keeps the "clicking a robot selects it" coverage (now via the card, not a `Button`).
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including the modified
     `AccordionContainer`/`PowerRockerSwitch`/`RobotsTab`/`colorUtils` suites.
  4. `npm run build` — production bundle builds cleanly.
  5. Manual check (`npm run dev`): on the main hub grid, confirm a robot swimming in the world view
     is clickable and opens Robot Selection → that robot's editor; confirm clicking empty space
     between grid tiles does *not* accidentally trigger a tile; open Audio Rig or Settings and
     confirm world-view robots are no longer clickable; confirm a Robot Selection card's avatar
     looks the same at different times of day while its battery-dim still visibly reflects a low
     battery; confirm the four `AudioStatusBadge` colors and the Accordion/PowerRocker lights all
     still read clearly against the dark theme.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges
  manually.
* **Branch Convention:** `feature/robot-selection` (current branch).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences, roughly: (1) `colorUtils.ts`'s `alpha` param + `statusLightColors.ts` + tests, (2)
  `AccordionContainer`/`PowerRockerSwitch` refactor onto `statusLightColors` + tests, (3)
  `RobotBody.tsx`'s `ignoreDaylight` prop + test, (4) `robotSelectionConfig.ts` + test, (5)
  `RobotSelectionCard`/`AudioStatusBadge` + tests, (6) `RobotsTab.tsx` rewired to cards + test, (7)
  `Console.tsx`/`Console.css` pointer-events fix + test, (8) `Robot.tsx` click-routing + test, (9)
  doc updates (`ROBOT_DATA_GRID.md`, `ROBOT_DESIGN.md`, `UI_SHELL.md`, `roadmap.md`) last.

---

## 7. Open Questions & Risks

Carried forward from Specify — resolve in the Plan/Tasks phase before implementation, not silently
during coding:

1. **Exact draft label copy** (`JOB_TYPE_LABELS`/`DOCKING_STATE_LABELS`/`AUDIO_MODE_LABELS` in § 4)
   is a best guess, explicitly called out during intake as pending Crawford's review in
   `ROBOT_DATA_GRID.md`. Low risk to ship as drafts, but don't treat the exact strings as locked.
2. **`RobotSelectionCard`'s avatar `viewBox`/sizing.** § 4's sketch uses a placeholder
   `viewBox="-50 -50 100 100"` — the real value should match whatever coordinate space
   `RobotBody`'s shape components actually render in at full scale (check `Robot.tsx`'s own `<g>`
   usage and the individual `RobotSleek`/`RobotAngular`/etc. components before finalizing), scaled
   down to a card-appropriate thumbnail size. Finalize during implementation.
3. **`console--grid`'s selector specificity against nested tiles.** § 4 assumes `.sc-button` is a
   stable, sufficient selector to re-enable pointer-events for every `HubNav` tile. Confirm no
   other interactive element needs the same treatment once `HubNav`'s actual rendered markup is
   checked directly (it should only ever render `Button`s per `HubNav.tsx`, but verify during
   implementation rather than assuming).
4. **Keyboard activation duplication risk.** `RobotSelectionCard`'s `onKeyDown` (§ 4) checks for
   both `Enter` and `Space` — confirm this doesn't double-fire if the card ever gets a native
   `<button>` descendant later; not a concern today since the card has no nested interactive
   elements, but worth a comment in the code so a future addition doesn't silently break it.
5. **Whether `Console.test.tsx`/`Robot.test.tsx` being net-new test files for previously-untested
   components should also backfill minimal coverage of their pre-existing behavior** (e.g.
   `Console.tsx` rendering `ConsolePanel` at all, `Robot.tsx`'s GSAP-set mount effect) or stay
   scoped strictly to this phase's new behavior per § 3's Strict Scope boundary. Default: scoped
   strictly to new behavior, consistent with the boundary — flag if Plan wants broader backfill.
