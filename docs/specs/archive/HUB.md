# Phase Spec: Hub (Roadmap Phase 3)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/phase-3-hub.md](../intent/phase-3-hub.md) (confirmed via
`/interview-me`). Source of scope: [docs/todo/roadmap.md § 3](../todo/roadmap.md#3-hub).

---

## 1. Overview & Claude Explanation

This phase tears out `ConsoleNavigation`'s Radix `Tabs.Root` bar and replaces it with a
real tile grid, `HubNav`, driven entirely by a new typed data file,
`src/data/hubNavConfig.ts` — no hardcoded labels, no inline routing logic. Session and
Composition are deleted outright: their `uiStore` entries, their stub content, and any
trace of them in the tab set. `HubNav` renders each tile as the **existing** `Button`
primitive (`src/components/ui/controls/Button.tsx`) — this phase does not add a 14th
`ControlSchema` variant; a `HubNavItem` in the data file pairs a `ButtonSchema` (id, lore
title, human subtitle) with a `target` field pointing at one of the four surviving tiles.
Selecting a tile does a full-screen takeover of the hub-nav area — `ConsolePanel` renders
either the grid (`activeHubTile === null`) or the selected tile's content plus a back
button (also the `Button` primitive) that returns to the grid — as a plain conditional
render, not a GSAP timeline. `uiStore.ts`'s `ConsoleTab`/`activeConsoleTab` is renamed to
a shared `HubTile` type (defined once in `src/types/hub.ts` so both the store and the data
file import it without the data layer reaching into a Zustand store module) and
`activeHubTile`, dropping to four values (`robotOptions`, `robotEditor`, `audioRig`,
`settings`) and defaulting to `null` — the app opens on the grid, not a pre-selected tile.
`robotOptions` and `robotEditor` keep rendering the real, unmodified `RobotOptionsTab`/
`RobotEditorTab` components (Phases 7–9 own their eventual removal/replacement); `audioRig`
and `settings` keep today's placeholder stub content, now reached through the full-screen
shell instead of a tab switch. One existing cross-tile call —
`RobotOptionsTab.tsx`'s `handleNewRobot` calling `setActiveConsoleTab('robotEditor')` after
spawning a robot — must be updated to the renamed setter, not dropped; it's real existing
behavior (auto-navigate to the editor for a freshly spawned robot), not something this
phase is retiring.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── hub.ts                                     # NEW — HubTile union (4 values: robotOptions | robotEditor | audioRig | settings) and HubNavItem interface ({ schema: ButtonSchema; target: HubTile }). Single source of truth so uiStore.ts and hubNavConfig.ts both import from here instead of one importing from the other.
├── data/
│   └── hubNavConfig.ts                             # NEW — HUB_NAV_ITEMS: HubNavItem[], one entry per surviving tile (robotOptions, robotEditor, audioRig, settings), each with a lore title + human subtitle. No labels live in component code after this file exists.
├── stores/
│   └── uiStore.ts                                  # MODIFIED — remove ConsoleTab (moves to src/types/hub.ts as HubTile, session/composition dropped); rename activeConsoleTab → activeHubTile (default null, was 'session'); rename setActiveConsoleTab → setActiveHubTile
└── components/
    └── panels/screen/console/
        ├── ConsoleNavigation.tsx                   # DELETED — replaced by HubNav.tsx
        ├── HubNav.tsx                               # NEW — maps HUB_NAV_ITEMS to <Button> primitives in a grid; onClick calls setActiveHubTile(item.target); no Tabs.Root, no hardcoded TabDef array
        ├── HubNav.css                               # NEW — grid layout for the tile buttons
        ├── ConsolePanel.tsx                         # MODIFIED — renders <HubNav /> when activeHubTile is null; otherwise renders a back Button + the active tile's content (RobotOptionsTab/RobotEditorTab unchanged, or the existing audioRig/settings stub markup); Session/Composition cases removed entirely from the render switch
        ├── ConsolePanel.css                         # MODIFIED — remove `.console-nav__list`/`.console-nav__trigger` (Tabs-specific); add tile-content/back-button layout classes
        ├── RobotOptionsTab.tsx                       # MODIFIED — handleNewRobot's setActiveConsoleTab('robotEditor') call renamed to setActiveHubTile('robotEditor'); no other logic changes
        └── RobotEditorTab.tsx                        # MODIFIED — activeConsoleTab read renamed to activeHubTile; its `if (activeHubTile !== 'robotEditor') return null;` guard stays as defensive code even though ConsolePanel now only renders this component when the tile is already active — not worth removing as a side effect of this phase

docs/
└── UI_SHELL.md                                     # MODIFIED — fold "Planned Replacement: Hub Tiles" into a renamed "Console Navigation" section for the tab→tile, surviving-tiles, and Session/Composition-dropped points; drop "not yet implemented" framing for those points specifically. The robotOptions/robotEditor points stay under "planned" framing until Phases 7 and 9 land (their internals are untouched this phase).
```

**Not touched this phase** (confirmed out of scope in the intent doc): no real Audio Rig or
Sector Settings content (Phases 4/5), no changes to `RobotOptionsTab`/`RobotEditorTab`
internals beyond the rename cascade above, no GSAP timeline/`timelineMap` entry for the
grid↔tile transition, no `src/types/controls.ts` changes (`CONTROL_SCHEMA_TYPES` stays at
13), no Session Storage persistence work (Phase 12).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in the Target File Structure above unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No new `ControlSchema` variant:** `HubNavItem`'s `schema` field is a plain `ButtonSchema` (`type: 'button'`). Do not add `HubNavButtonSchema`/`'hubNavButton'` to `src/types/controls.ts` or `CONTROL_SCHEMA_TYPES` — the existing `Button` primitive covers tile buttons and the back button both.
* **`Console.tsx` stays untouched:** it's `ScreenViewport.tsx`'s stable import boundary and `ScreenViewport.test.tsx` mocks it by path (`@/components/panels/screen/console/Console`) — no rename, no changed export shape.
* **Zero Hardcoded Strings:** Tile lore titles/human subtitles come from `hubNavConfig.ts` only. `HubNav.tsx` contains no literal label strings.
* **State stays serializable:** `activeHubTile` is a plain `HubTile | null` union on `uiStore` — no runtime-only values. No new persisted fields beyond the rename.
* **No animation this phase:** the grid↔tile switch is a synchronous conditional render in `ConsolePanel.tsx`. Do not add a GSAP timeline, a `timelineMap` entry, or a `prefers-reduced-motion` branch for it — that pattern is reserved for phases that actually specify a transition (none does here).
* **Preserve the existing cross-tile navigation call:** `RobotOptionsTab.tsx`'s `handleNewRobot` must still land the user on the Robot Editor tile after spawning a robot — update the call to `setActiveHubTile('robotEditor')`, don't drop it.
* **`RobotOptionsTab`/`RobotEditorTab` internals are hands-off:** only the store-field rename cascades into these files (§2). No behavior, markup, or styling changes beyond that.
* **`audioRig`/`settings` stub content is carried forward verbatim:** reuse today's placeholder markup/text (currently `<div className="console-panel__stub">Audio Rig</div>` / `...Settings</div>` in `ConsolePanel.tsx`), just rendered through the new full-screen branch instead of the old tab-switch branch. Do not invent new placeholder copy.

---

## 4. Code Style & Architecture Conventions

```typescript
// src/types/hub.ts — new, shared by uiStore.ts and hubNavConfig.ts
import type { ButtonSchema } from './controls';

export type HubTile = 'robotOptions' | 'robotEditor' | 'audioRig' | 'settings';

export interface HubNavItem {
  schema: ButtonSchema;
  target: HubTile;
}
```

```typescript
// src/data/hubNavConfig.ts — new, zero hardcoded labels anywhere else
import type { HubNavItem } from '@/types/hub';

export const HUB_NAV_ITEMS: HubNavItem[] = [
  {
    schema: { id: 'robotOptions', type: 'button', loreLabel: 'ROBOT REGISTRY', humanLabel: 'Robot Options' },
    target: 'robotOptions',
  },
  // ...robotEditor, audioRig, settings entries, same shape
];
```

```typescript
// src/components/panels/screen/console/HubNav.tsx — new, replaces ConsoleNavigation.tsx
import { Button } from '@/components/ui/controls/Button';
import { HUB_NAV_ITEMS } from '@/data/hubNavConfig';
import { useUIStore } from '@/stores/uiStore';
import './HubNav.css';

export function HubNav() {
  const setActiveHubTile = useUIStore((s) => s.setActiveHubTile);

  return (
    <div className="hub-nav" role="region" aria-label="Hub Navigation">
      <div className="hub-nav__grid">
        {HUB_NAV_ITEMS.map((item) => (
          <Button
            key={item.schema.id}
            schema={item.schema}
            onClick={() => setActiveHubTile(item.target)}
          />
        ))}
      </div>
    </div>
  );
}

export default HubNav;
```

```typescript
// src/components/panels/screen/console/ConsolePanel.tsx — shape, not final markup
// Back button uses the same Button primitive as tiles — no bespoke back-button component.
const BACK_SCHEMA: ButtonSchema = { id: 'hubNavBack', type: 'button', humanLabel: 'Back' };

export function ConsolePanel() {
  const activeHubTile = useUIStore((s) => s.activeHubTile);
  const setActiveHubTile = useUIStore((s) => s.setActiveHubTile);

  if (activeHubTile === null) {
    return (
      <div className="console-panel" role="region" aria-label="Console Panel">
        <HubNav />
      </div>
    );
  }

  return (
    <div className="console-panel" role="region" aria-label="Console Panel">
      <Button schema={BACK_SCHEMA} onClick={() => setActiveHubTile(null)} />
      <div className="console-panel__content">{renderTile(activeHubTile)}</div>
    </div>
  );
}
```

* **Naming Conventions:**
  * Components: PascalCase. `ConsoleNavigation.tsx` → `HubNav.tsx` is the one intentional
    rename this phase (the roadmap names the replacement explicitly); `Console.tsx` and
    `ConsolePanel.tsx` keep their file names even though `ConsolePanel`'s internal logic
    changes materially — no rename without a reason stronger than "the job changed
    slightly" (same rule `LAYOUT.md` applied to `TransportBar.tsx`).
  * Data configs: camelCase (`hubNavConfig.ts`), types: PascalCase (`HubTile`,
    `HubNavItem`).
  * CSS classes: BEM-ish double-underscore convention already in use elsewhere
    (`hub-nav__grid`, `console-panel__content`).
* **Formatting:** Plain named function component exports (not `React.FC`), explicit prop interfaces, co-located plain CSS files per component, zero inline style objects unless calculating dynamic values.
* **Grid-area names stay put:** `Console.tsx`'s outer `.console { grid-area: console; }` is untouched — `ConsolePanel`'s internal restructuring doesn't change its own place in `ScreenViewport`'s grid.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate unit/component tests alongside implementation. Neither `ConsoleNavigation.tsx` nor `ConsolePanel.tsx` currently has a test file (only `RobotAudioTab.test.tsx` exists in this directory today) — this phase is a clean slate for `HubNav.test.tsx` and `ConsolePanel.test.tsx`, not an update to existing tests.
* **Coverage targets specific to this phase:**
  1. `HubNav.test.tsx` — renders one `Button` per `HUB_NAV_ITEMS` entry with the configured lore/human labels; clicking a tile calls `setActiveHubTile` with that entry's `target`; asserts exactly four tiles render (no Session/Composition remnants).
  2. `ConsolePanel.test.tsx` — renders `HubNav` when `activeHubTile` is `null`; renders the back `Button` + `RobotOptionsTab`/`RobotEditorTab` when those tiles are active (mock the tab components the way `ScreenViewport.test.tsx` mocks `Console`, to isolate `ConsolePanel`'s own switch logic from real Tone.js/GSAP-touching children); renders the carried-forward stub content for `audioRig`/`settings`; clicking the back button resets `activeHubTile` to `null`.
  3. `RobotOptionsTab.test.tsx` (existing) — re-run and confirm `handleNewRobot`'s post-spawn navigation still lands on `robotEditor` after the setter rename; add an assertion if none currently covers this path.
  4. `uiStore` — no dedicated test file exists today; if one is added, confirm `activeHubTile` defaults to `null` and `setActiveHubTile` only accepts the four `HubTile` values.
  5. No test should assert on `'session'`/`'composition'` anywhere — their complete absence from `HubTile`, `HUB_NAV_ITEMS`, and the rendered DOM is itself part of what "done" means this phase.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (this will also catch any leftover `ConsoleTab`/`activeConsoleTab` references across the codebase from the rename).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
  5. Manual check: load the app, confirm it opens on the tile grid (not a pre-selected tile); select each of the four tiles and confirm the back button returns to the grid; confirm spawning a new robot from Robot Options still navigates to Robot Editor.
  6. Manual a11y check (per CLAUDE.md's "Accessibility & performance" expectation): keyboard/focus navigation through the tile grid and the back button — `Button`'s existing `resolveAccessibleName` handling should already cover accessible names, but confirm focus order and visible focus states read sensibly in the new full-screen layout.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/hub` (or similar — not yet opened as of this spec).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences (e.g. `Replace ConsoleNavigation tab bar with HubNav tile grid`).

---

## 7. Open Questions & Risks

Carried forward from Specify — resolve in the Plan phase before implementation, not silently during coding:

1. **`hubNavConfig.ts`'s actual lore/human copy is not written yet.** The intent doc and this spec establish the *shape* (`ButtonSchema` + `target`) but not the four tiles' real lore titles/human subtitles — those need real copy (matching the lore/human dual-label voice already established elsewhere in the data layer, e.g. `lfoConfig.ts`'s target labels) before `HubNav` can render anything meaningful. Don't placeholder these into Implement; write the real copy as part of the Plan/Tasks phase.
2. **Full-screen takeover layout is unspecified.** The intent doc confirms *that* a tile takes over the hub-nav area with a back button, but not the visual arrangement (back button position — top-left corner vs. inline above content; grid column/row count for the tile buttons; whether the grid is 2×2, a single row, or responsive). This is presentational and lower-risk than the Layout phase's cutaway math, but should still get a concrete answer in Plan rather than being improvised per-component during Implement.
3. **`RobotEditorTab`'s internal `activeHubTile !== 'robotEditor'` guard is now provably redundant** (§3) but is being kept as defensive code per this spec's "hands-off internals" boundary. Flagging in case Crawford would rather have it removed now than carry dead logic forward — a one-line judgment call, not a blocking question.
4. **No test currently exists for `uiStore.ts` itself.** Whether to add one as part of this phase (covering just the `activeHubTile` default/setter) or leave store testing implicit through component tests, as today, is a Plan-phase call, not answered by the intent doc.

**Resolution note:** item 3 above is superseded by §8's amendment below — the guard isn't
just redundant now, it references a `HubTile` value (`'robotEditor'`) that no longer exists
in the type, so it must be removed, not merely left as harmless dead code.

---

## 8. Amendment: `robots` list+detail flow (post-ship revision)

Resolves two open items with Crawford after the original four-tile version of this spec
shipped on `feature/hub`. Full rationale in
[docs/intent/phase-3-hub.md](../intent/phase-3-hub.md)'s Amendment section.

**`HubTile` shrinks to three values:** `'robots' | 'audioRig' | 'settings'`. The
`robotOptions` tile is renamed `robots`; the standalone `robotEditor` tile is retired —
it's reached only by selecting a robot from the `robots` list, not directly from the grid.

**Nested state reuses `selectedRobotId`, no new store field:** within the `robots` tile,
`selectedRobotId === null` shows a new list component; `selectedRobotId` set shows today's
`RobotEditorTab`, unchanged. Back's behavior becomes tile-aware: from the robot editor, it
clears `selectedRobotId` (→ list, same tile); from the list or any other tile, it clears
`activeHubTile` (→ grid).

**File changes on top of §2's original structure:**
```text
src/
├── types/hub.ts                                    # MODIFIED — HubTile: 'robotOptions' | 'robotEditor' | ... → 'robots' | 'audioRig' | 'settings'
├── data/hubNavConfig.ts                             # MODIFIED — robotOptions + robotEditor entries collapse into one 'robots' entry (humanLabel "Robots", loreLabel kept as "UNIT ROSTER" — fits a roster/list even better than it fit the old spawn-config screen)
└── components/panels/screen/console/
    ├── RobotOptionsTab.tsx/.css/.test.tsx           # DELETED — min/max slider and auto-spawn toggle are dropped outright (Phase 7 removes them anyway); "+ New Robot" moves to RobotsTab
    ├── RobotsTab.tsx                                # NEW — lists every robot in the active locale (name + click, via the Button primitive — no avatar/job/battery card, that's Phase 8's job once Battery/Job data exists) plus a "+ New Robot" action reusing today's spawnRobot call
    ├── RobotsTab.css                                # NEW
    ├── RobotsTab.test.tsx                           # NEW
    ├── RobotEditorTab.tsx                           # MODIFIED — remove the now type-invalid `activeHubTile !== 'robotEditor'` guard (that HubTile value no longer exists); keep the existing `!selectedRobotId` empty-state fallback as-is
    └── ConsolePanel.tsx                              # MODIFIED — renderTile's 'robots' case switches on selectedRobotId (null → RobotsTab, set → RobotEditorTab); back button clears selectedRobotId first when set, otherwise clears activeHubTile
```

**Still hands-off:** `RobotEditorTab`'s own internals (Meta/Audio/Oscillators sub-tabs) —
only the now-invalid guard changes. This is still not Phase 9's rebuild.
