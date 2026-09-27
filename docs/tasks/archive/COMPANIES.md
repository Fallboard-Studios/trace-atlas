# Implementation Plan: Companies (Roadmap Phase 10)

Source spec: [docs/specs/COMPANIES.md](../specs/COMPANIES.md). Source intent:
[docs/intent/companies.md](../intent/companies.md).

## Overview

Build foundation types/constants first (parallel-safe with each other), then the store layer that
depends on them, then three independent branches that all depend only on the store: (a) spawn
generation, (b) the `Select` primitive plus the shared `robotOptionsActions.ts`/`companyOptions.ts`
logic, and (c) nothing yet needs UI. The riskiest, most cross-cutting work — refactoring the four
existing Robot Options sections from a `{ robot }` prop to a `{ value, onChange }` contract — comes
next, gated behind its own checkpoint because it touches code that already ships and must not
regress single-robot editing. Only once that refactor is proven safe does new Company-specific UI
get built on top of it. `RobotsTab`/`Robot.tsx` wiring and docs land last. The scope matches spec
§2's file list exactly; every one of spec §7's decisions is treated as already resolved (not
re-litigated here).

## Architecture Decisions

Spec §7 already resolved this phase's 5 design questions (snapshot-merge shape, component-reuse
interpretation, company-naming collision avoidance, `MAX_COMPANIES` enforcement point, Radix
Select's empty-string restriction) — nothing from that list is reopened here. One additional
sequencing-level note, discovered while ordering tasks:

- **The drawer refactor (Phase 5) is the hinge of this whole plan.** Every Company-specific
  component (Phase 7) is built *on top of* the refactored `AudioSettingSection`/
  `PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer`, not alongside them. This means
  Phase 5's checkpoint is the single highest-risk gate in this plan — a regression there breaks
  robot editing, which is a shipped, working feature today, not just an unfinished new one. Phase
  5's checkpoint accordingly requires a full manual pass through `RobotOptionsTab` (not just green
  tests) before Phase 6+ begins.
- **`worldTransition.ts`'s one-line change rides along with `spawnSystem.ts` (Task 8)** rather than
  being its own task — mirrors how `docs/tasks/ROBOT_OPTIONS.md`'s Task 11 folded `ConsolePanel.tsx`'s
  one-line import update into the larger rename task it was a trivial consequence of.
- **`generateCompanyName` (Task 8) is a hard dependency for `CompanyCrudControls` (Task 20)**, not
  just spawn generation — the Create button reuses it to pre-fill a suggested name. This is called
  out explicitly in the dependency graph below since it's easy to miss (the function lives in
  `spawnSystem.ts`, a file otherwise unrelated to `CompanyCrudControls`' own concerns).

## Dependency Graph

```
Task 1 (Company.ts)   Task 2 (controls.ts:      Task 3 (Robot.ts:   Task 5 (constants:
   │                   SelectSchema)              companyId)          MAX_COMPANIES etc.)
   │                       │                          │                    │
   └──→ Task 4 (locale.ts: Locale.companies +          │                    │
        LocaleState company action signatures)          │                    │
                       │                                │                    │
                       └────────────┬───────────────────┴────────────────────┘
                                    │
                                    └──→ Task 6 (localeStore.ts: company CRUD +
                                          assignRobotToCompany)
                                                        │
                        Task 7 (uiStore.ts: selectedCompanyId) ── parallel-safe with Task 6
                                                        │
                                    ┌───────────────────┼──────────────────────┐
                                    │                   │                      │
                                    └──→ Task 8          │                      │
                                    (spawnSystem.ts:      │                      │
                                    spawnInitialCompanies  │                      │
                                    + worldTransition.ts)  │                      │
                                            │              │                      │
                                            │      Task 9 (Select.tsx) ←── Task 2 only
                                            │              │
                                            │      Task 10 (robotOptionsActions.ts) ──
                                            │              independent of Company types entirely;
                                            │              parallel-safe with Tasks 1–9
                                            │              │
                                            │      Task 11 (companyOptions.ts) ←── Task 1
                                            │              │
                                            │      Task 12 (companyConfig.ts) ←── Tasks 1, 2
                                            │              │
                                    └───────┴───────┬──────┘
                                                    │
                                        Checkpoint: Foundation + Shared Logic
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    │                               │                               │
        Task 13 (AudioSettingSection +   Task 14 (PingControlsDrawer   Task 15 (PingContourDrawer
        RobotDisplaySection, incl.        refactor) ←── Task 10        refactor) ←── Task 10
        company Select row)
        ←── Tasks 6, 9, 10, 12
                    │                               │                               │
                    │                    Task 16 (SignatureArrayDrawer refactor) ←── Task 10
                    │                               │                               │
                    └───────────────┬───────────────┴───────────────────────────────┘
                                    │
                                    └──→ Task 17 (RobotOptionsTab.tsx wiring) ←── Tasks 13–16
                                                    │
                                        Checkpoint: Robot Options Refactored
                                        (manual regression pass required)
                                                    │
        Task 18 (RobotSelectionCard company row) ←── Tasks 6, 9, 12 (parallel-safe with Phase 5/17)
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    │                               │                               │
        Task 19 (CompanyButtonRow)      Task 20 (CompanyCrudControls)   Task 21 (CompanyOptionsSection)
        ←── Tasks 6, 7                  ←── Tasks 5, 6, 8               ←── Tasks 6, 7, 10, 11, 13–16
                    │                               │                               │
                    └───────────────┬───────────────┴───────────────────────────────┘
                                    │
                                    └──→ Task 22 (CompanyManager.tsx) ←── Tasks 19, 20, 21
                                                    │
                                        Checkpoint: Company UI
                                                    │
                    ┌───────────────────────────────┴───────────────┐
                    │                                                │
        Task 23 (RobotsTab.tsx mounts CompanyManager)    Task 24 (Robot.tsx isCompanyMember glow)
        ←── Task 22                                      ←── Task 7 (parallel-safe with Task 23)
                    │                                                │
                    └───────────────────────┬────────────────────────┘
                                            │
                                Checkpoint: Feature Wired In
                                            │
                                Task 25 (docs) ←── Tasks 1–24
                                            │
                                Checkpoint: Complete
```

Tasks 1, 2, 3, 5 are parallel-safe with each other (no shared file). Task 10
(`robotOptionsActions.ts`) has no dependency on any Company type and can be built any time in
parallel with Tasks 1–9 — it is a pure extraction of already-shipped logic. Tasks 13–16 (the four
drawer/section refactors) are parallel-safe with each other once the Foundation + Shared Logic
checkpoint lands, but Task 17 needs all four. Tasks 19–21 are parallel-safe with each other once
their own listed dependencies land.

## Task List

### Phase 1: Foundation Types & Constants

- [ ] **Task 1: `src/types/Company.ts` — `Company`/`CompanyOptionsSnapshot`**

  **Description:** New type file defining `Company` (`id`, `name`, `robotIds: string[]`,
  `lastEditedOptions?: CompanyOptionsSnapshot`) and `CompanyOptionsSnapshot` (every field optional
  — spec §4's exact shape).

  **Acceptance criteria:**
  - [ ] `CompanyOptionsSnapshot` has all 10 fields from spec §4 (`audioMode`, `masterVolume`,
    `volumeLfo`, `rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`, `octaveRange`, `adsr`,
    `layers`, `lfoSettings`), every one optional
  - [ ] `Company` has `id: string`, `name: string`, `robotIds: string[]`, `lastEditedOptions?:
    CompanyOptionsSnapshot`
  - [ ] No field is required on `CompanyOptionsSnapshot` — a `{}` literal type-checks as valid

  **Verification:**
  - [ ] `npx vitest run src/types/Company.test.ts` passes (type-level smoke test: an empty
    `CompanyOptionsSnapshot` and a fully-populated one both type-check)
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** None (parallel-safe with Tasks 2, 3, 5).

  **Files:** `src/types/Company.ts`, `src/types/Company.test.ts`

  **Estimated scope:** XS (1–2 files)

- [ ] **Task 2: `src/types/controls.ts` — `SelectSchema`, 14th `ControlSchema` variant**

  **Description:** Add `SelectSchema` (`type: 'select'`, `options: { value: string; label: string
  }[]`) to the `ControlSchema` union and `CONTROL_SCHEMA_TYPES`.

  **Acceptance criteria:**
  - [ ] `SelectSchema extends ControlSchemaBase` with `type: 'select'` and `options: { value:
    string; label: string }[]`
  - [ ] `ControlSchema` union includes `SelectSchema`
  - [ ] `CONTROL_SCHEMA_TYPES` has exactly 14 entries, `'select'` included, no duplicates

  **Verification:**
  - [ ] `npx vitest run src/types/controls.test.ts` — updated assertion for 14 variants passes
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** None (parallel-safe with Tasks 1, 3, 5).

  **Files:** `src/types/controls.ts`, `src/types/controls.test.ts`

  **Estimated scope:** XS (2 files)

- [ ] **Task 3: `src/types/Robot.ts` — `companyId?: string`**

  **Description:** Add the one new field. `undefined` means Freelance — no separate boolean.

  **Acceptance criteria:**
  - [ ] `Robot.companyId?: string` added
  - [ ] No other field on `Robot` changes

  **Verification:**
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** None (parallel-safe with Tasks 1, 2, 5).

  **Files:** `src/types/Robot.ts`

  **Estimated scope:** XS (1 file)

- [ ] **Task 4: `src/types/locale.ts` — `Locale.companies`, `LocaleState` company action
  signatures**

  **Description:** Add `companies: Company[]` to `Locale` and the six new method signatures
  (`addCompany`/`updateCompany`/`removeCompany`/`getCompanyById`/`getCompanyMembers`/
  `assignRobotToCompany`) to `LocaleState` — signatures only, implementations land in Task 6.

  **Acceptance criteria:**
  - [ ] `Locale.companies: Company[]`
  - [ ] `LocaleState` declares `addCompany(localeId, company: Company): void`
  - [ ] `LocaleState` declares `updateCompany(localeId, companyId, updates: Partial<Company>): void`
  - [ ] `LocaleState` declares `removeCompany(localeId, companyId): void`
  - [ ] `LocaleState` declares `getCompanyById(localeId, companyId): Company | undefined`
  - [ ] `LocaleState` declares `getCompanyMembers(localeId, companyId): Robot[]`
  - [ ] `LocaleState` declares `assignRobotToCompany(localeId, robotId, companyId: string | null):
    void`
  - [ ] `npm run build:types` surfaces `localeStore.ts` as now-incomplete (expected — implemented
    in Task 6)

  **Verification:**
  - [ ] `npm run lint` clean for this file

  **Dependencies:** Task 1 (`Company` type).

  **Files:** `src/types/locale.ts`

  **Estimated scope:** XS (1 file)

- [ ] **Task 5: `src/constants/index.ts` — company generation/CRUD constants**

  **Description:** `MAX_COMPANIES = 6` (CRUD ceiling), `INITIAL_COMPANIES_MIN = 2` /
  `INITIAL_COMPANIES_MAX = 3`, `COMPANY_SIZE_MIN = 3` / `COMPANY_SIZE_MAX = 4` (spawn generation —
  a separate concept from the CRUD ceiling, per spec §3).

  **Acceptance criteria:**
  - [ ] All 5 constants exported with the exact values above
  - [ ] A code comment states explicitly that `MAX_COMPANIES` is a CRUD ceiling, not the spawn
    target — matching `RHYTHMIC_DENSITY_MIN`/etc.'s existing comment-density convention in this
    file

  **Verification:**
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** None (parallel-safe with Tasks 1, 2, 3).

  **Files:** `src/constants/index.ts`

  **Estimated scope:** XS (1 file)

### Checkpoint: Foundation Types

- [ ] `npm run build:types` shows only the expected downstream error in `localeStore.ts` (missing
  company action implementations) — no other unexpected breakage.
- [ ] `npm run lint` clean for all 5 touched/created files.

### Phase 2: Store Layer

- [ ] **Task 6: `src/stores/localeStore.ts` — company CRUD + `assignRobotToCompany`**

  **Description:** Implement the six methods declared in Task 4, mirroring the existing
  `addRobot`/`updateRobot`/`removeRobot`/`getRobotById` pattern. `removeCompany` clears `companyId`
  on every member first (mirrors `removeLocale`'s per-robot cleanup shape).
  `assignRobotToCompany` is one atomic `set()` — not composed from separate `updateRobot` +
  `updateCompany` calls (spec §4's exact implementation shape).

  **Acceptance criteria:**
  - [ ] `addCompany`/`updateCompany`/`getCompanyById` round-trip correctly against `state.locales[localeId].companies`
  - [ ] `removeCompany` clears `companyId` on every former member robot and removes the company
    from `locale.companies`, in one logical operation
  - [ ] `getCompanyMembers(localeId, companyId)` returns exactly the robots whose `companyId`
    matches
  - [ ] `assignRobotToCompany(localeId, robotId, companyId)` is a single `set()` call updating the
    robot's `companyId` and both the old and new company's `robotIds` together — not two or three
    separate `set()` calls
  - [ ] `assignRobotToCompany(localeId, robotId, null)` moves a robot to Freelance: old company's
    `robotIds` no longer contains it, `robot.companyId` becomes `undefined`
  - [ ] `removeLocale` does not throw for a locale with populated `companies` (no `AudioEngine`
    cleanup needed for companies themselves — only robots have engine state)

  **Verification:**
  - [ ] `npx vitest run src/stores/localeStore.test.ts` — all passing, including all 6 new cases
    from spec §5
  - [ ] `npm run build:types` passes (resolves Task 4's expected error)
  - [ ] `npm run lint` clean

  **Dependencies:** Tasks 1, 4.

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** M (2 files, 6 new methods)

- [ ] **Task 7: `src/stores/uiStore.ts` — `selectedCompanyId`**

  **Description:** `selectedCompanyId: string | null` (default `null`) and `selectCompany`,
  independent of `selectedRobotId`.

  **Acceptance criteria:**
  - [ ] `selectedCompanyId` defaults to `null`
  - [ ] `selectCompany(id: string | null)` sets it
  - [ ] Setting `selectedCompanyId` never touches `selectedRobotId`, and vice versa

  **Verification:**
  - [ ] `npx vitest run src/stores/uiStore.test.ts` — new cases pass
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** None (parallel-safe with Task 6).

  **Files:** `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`

  **Estimated scope:** XS (2 files)

### Checkpoint: Foundation + Store

- [ ] `npm test` passes for `localeStore.test.ts`, `uiStore.test.ts`.
- [ ] `npm run build:types` and `npm run lint` clean project-wide.

### Phase 3: Spawn Generation

- [ ] **Task 8: `src/systems/spawnSystem.ts` — `spawnInitialCompanies` + `worldTransition.ts` hook**

  **Description:** New `spawnInitialCompanies(localeId)`, `generateCompanyName`/`generateCompanyId`
  (mirroring `generateRobotName`/`generateRobotId`'s pattern, using a new `COMPANY_NOUNS` list
  paired with the existing `ADJECTIVES`, per spec §7.3). `worldTransition.ts`'s `initializeLocale`
  calls it immediately after `spawnInitialRoster`, inside the same `if (locale.robots.length ===
  0)` guard.

  **Acceptance criteria:**
  - [ ] `spawnInitialCompanies` produces 2-3 companies (seeded via `getSeededVal`, not
    `Math.random()`)
  - [ ] Each company has 3-4 members, drawn from a shrinking pool so no robot ID is ever claimed by
    more than one company
  - [ ] Any robot not claimed by a company is left with `companyId: undefined` (Freelance)
  - [ ] `generateCompanyName` uses `ADJECTIVES` + a new `COMPANY_NOUNS` list (not the existing
    robot `NOUNS` list) — a company name is never generatable in the exact same word-pair form a
    robot name is
  - [ ] `generateCompanyId` mirrors `generateRobotId`'s deterministic-ID shape
  - [ ] Same locale coordinates (same seed) → identical company count, membership, and names
    across two independent `spawnInitialCompanies` runs
  - [ ] `worldTransition.ts`'s `initializeLocale` calls `spawnInitialCompanies(localeId)`
    immediately after `spawnInitialRoster(localeId)`, inside the existing `if
    (locale.robots.length === 0)` block — no new guard condition added
  - [ ] `initializeLocale` called a second time against an already-populated locale does not call
    `spawnInitialCompanies` again (inherits the existing guard)

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts` — all passing, including the 5 new cases
    from spec §5
  - [ ] `npx vitest run src/systems/worldTransition.test.ts` — new case passes
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Tasks 3, 5, 6.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`,
  `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** M (4 files)

### Checkpoint: Spawn Generation

- [ ] `npm test` passes for `spawnSystem.test.ts`, `worldTransition.test.ts`.
- [ ] Manual check (`npm run dev`): load a fresh locale, inspect `useLocaleStore.getState()` in the
  browser console — confirm 2-3 companies exist with 3-4 members each and at least one Freelance
  robot in the common case. **Pending human operator.**

### Phase 4: Primitives & Shared Logic

- [ ] **Task 9: `src/components/ui/controls/Select.tsx` — 14th Design System primitive**

  **Description:** Wraps `@radix-ui/react-select` (already a dependency, previously unused). Same
  props contract as `RadioButton` plus `disabled`.

  **Acceptance criteria:**
  - [ ] `{ schema: SelectSchema; value: string; onChange: (value: string) => void; disabled?:
    boolean }`
  - [ ] Renders every `schema.options` entry as a selectable item
  - [ ] Composes `DualLabel` internally per `COMPONENT_LIBRARY.md`'s composition rule
  - [ ] `disabled` prevents interaction and is passed through to `RadixSelect.Root`
  - [ ] Accessible name resolves via `resolveAccessibleName(schema)`, matching every other
    interactive primitive
  - [ ] No new npm dependency added — only `@radix-ui/react-select` is imported

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/Select.test.tsx` — all passing
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean
  - [ ] `grep -n "@radix-ui/react-select" package.json` confirms no version bump / re-add needed

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/Select.tsx`, `src/components/ui/controls/Select.css`,
  `src/components/ui/controls/Select.test.tsx`

  **Estimated scope:** S (3 files)

- [ ] **Task 10: `src/systems/robotOptionsActions.ts` — extract shared per-field apply functions**

  **Description:** Move today's inline drawer handler bodies (`handleAudioModeChange`,
  `handleVolumeChange`, `handleVolumeLfoChange`, `handleDensityChange`, `handleMotifLengthChange`,
  `handleNoteVarianceChange`, `handleOctaveMinChange`, `handleOctaveMaxChange`, `commitAdsr`,
  `commitContinuous`, `commitStructural`, the Signature Array `handleLfoChange`) out of
  `RobotDisplaySection.tsx`/`PingControlsDrawer.tsx`/`PingContourDrawer.tsx`/
  `SignatureArrayDrawer.tsx` into this new module, verbatim — behavior unchanged, only location
  changes. This is a pure extraction with **no functional dependency on any Company type** — it
  can be built and tested in complete isolation from Tasks 1–9.

  **Acceptance criteria:**
  - [ ] `applyAudioMode`, `applyVolume`, `applyVolumeLfo`, `applyDensity`, `applyMotifLength`,
    `applyNoteVariance`, `applyOctaveMin`, `applyOctaveMax`, `applyAdsr`, `applyLayersContinuous`,
    `applyLayersStructural`, `applyLayerLfo` are all exported, each `(robot: Robot, localeId:
    string, value) => void`
  - [ ] Each function's body is byte-for-byte identical in behavior to today's corresponding inline
    handler (same `updateRobot` call shape, same `AudioEngine`/`lfoEngine`/`regenerateMelody`
    calls) — this task does not change what any edit does, only where the code lives
  - [ ] No function in this module reads from or writes to `uiStore`

  **Verification:**
  - [ ] `npx vitest run src/systems/robotOptionsActions.test.ts` — one test per function, each a
    like-for-like port of that field's existing assertion from the 4 drawer test files today
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** None (parallel-safe with Tasks 1–9).

  **Files:** `src/systems/robotOptionsActions.ts`, `src/systems/robotOptionsActions.test.ts`

  **Estimated scope:** M (2 files, 12 extracted functions — mechanical but not small)

- [ ] **Task 11: `src/systems/companyOptions.ts` — `resolveCompanyOptions`**

  **Description:** The per-field merge — `{ ...fromFirstMember, ...company.lastEditedOptions }` —
  that makes "revert to last edited state, or first member's current values if unused" true
  without a special-cased first-edit branch (spec §7.1).

  **Acceptance criteria:**
  - [ ] `resolveCompanyOptions(company: Company, firstMember: Robot): Required<CompanyOptionsSnapshot>`
  - [ ] With `company.lastEditedOptions` undefined, every resolved field equals `firstMember`'s
    current live value (or its documented default, e.g. `audioMode` falls back to `'none'`)
  - [ ] With `company.lastEditedOptions` partially populated, only the recorded fields override —
    every other field still falls back to `firstMember`
  - [ ] `firstMember`'s own subsequent live changes are reflected for any field the company
    snapshot doesn't cover — never frozen at "whenever the company was first selected"

  **Verification:**
  - [ ] `npx vitest run src/systems/companyOptions.test.ts` — all 3 cases from spec §5 pass
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Task 1.

  **Files:** `src/systems/companyOptions.ts`, `src/systems/companyOptions.test.ts`

  **Estimated scope:** S (2 files)

- [ ] **Task 12: `src/data/companyConfig.ts` — `Select` schema builder + CRUD schemas**

  **Description:** `buildCompanySelectSchema(companies): SelectSchema` (dynamic — the one config
  file in this codebase whose schema depends on runtime data, not a static definition),
  `FREELANCE_VALUE` sentinel (non-empty string — Radix `Select.Item` rejects `''`, per spec §3),
  Create/Rename/Delete `ButtonSchema`/`TextInputSchema` entries, company row `DualLabel` schema.
  Audio Setting/Volume/Ping Controls/Ping Contour/Signature Array schemas are imported from
  `robotOptionsConfig.ts`, never redefined here.

  **Acceptance criteria:**
  - [ ] `FREELANCE_VALUE` is a non-empty string constant (e.g. `'__freelance__'`)
  - [ ] `buildCompanySelectSchema(companies)` returns a `SelectSchema` whose `options` array starts
    with `{ value: FREELANCE_VALUE, label: 'Freelance' }` followed by one entry per company
    (`{ value: company.id, label: company.name }`)
  - [ ] Create/Rename/Delete each have a schema entry (`ButtonSchema`/`TextInputSchema` as
    appropriate)
  - [ ] No schema for Audio Setting, Volume, Density, Motif Length, Octave Range, Note Variance,
    Attack/Decay/Sustain/Release, or any Signature Array param is redefined in this file — grep
    confirms zero duplicate `id` strings against `robotOptionsConfig.ts`

  **Verification:**
  - [ ] `npx vitest run src/data/companyConfig.test.ts` — all passing
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Tasks 1, 2.

  **Files:** `src/data/companyConfig.ts`, `src/data/companyConfig.test.ts`

  **Estimated scope:** S (2 files)

### Checkpoint: Foundation + Shared Logic

- [ ] `npm test` passes project-wide (Tasks 1–12's suites, no regressions elsewhere).
- [ ] `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [ ] Ready to start the drawer refactor — every backing type/store/primitive/shared-logic piece it
  needs exists.

### Phase 5: Robot Options Drawer Refactor (regression-critical)

- [ ] **Task 13: `AudioSettingSection.tsx` extraction + `RobotDisplaySection.tsx` rewiring**

  **Description:** Extract Audio Setting radio + Volume slider + Volume LFO accordion out of
  `RobotDisplaySection.tsx` into a new presentational `AudioSettingSection` (`{ value: { audioMode,
  masterVolume, volumeLfo }; onAudioModeChange; onVolumeChange; onVolumeLfoChange; disabled? }`).
  `RobotDisplaySection.tsx` keeps its read-only Name/Job/Battery/Docking rows unchanged, renders
  `AudioSettingSection` wired to `robotOptionsActions` for the editable part, and gains the new
  company-assignment `Select` row (using `buildCompanySelectSchema`/`FREELANCE_VALUE`, calling
  `assignRobotToCompany`).

  **Acceptance criteria:**
  - [ ] `AudioSettingSection` renders correctly with an explicit `value` prop — no `robot` prop
    anywhere in its interface
  - [ ] `AudioSettingSection`'s 3 callbacks fire with the same argument shapes today's
    `RobotDisplaySection` inline handlers already produce
  - [ ] `disabled` on `AudioSettingSection` renders every internal control disabled
  - [ ] `RobotDisplaySection.tsx`'s read-only Name/Job/Battery/Docking rows are pixel-for-pixel
    unchanged from today (regression guard)
  - [ ] `RobotDisplaySection.tsx` wires `AudioSettingSection`'s callbacks to
    `robotOptionsActions.applyAudioMode`/`applyVolume`/`applyVolumeLfo`, passing `(robot, localeId,
    value)`
  - [ ] `RobotDisplaySection.tsx`'s new company row renders a `Select` defaulting to "Freelance"
    for an unassigned robot, or the assigned company's name otherwise; changing it calls
    `assignRobotToCompany(localeId, robot.id, companyId)`

  **Verification:**
  - [ ] `npx vitest run src/components/robot/AudioSettingSection.test.tsx
    src/components/robot/RobotDisplaySection.test.tsx` — all passing (assertions split per spec §5:
    read-only rows + company row stay in `RobotDisplaySection.test.tsx`; Audio Setting/Volume
    assertions move to `AudioSettingSection.test.tsx`)
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Tasks 6, 9, 10, 12.

  **Files:** `src/components/robot/AudioSettingSection.tsx`,
  `src/components/robot/AudioSettingSection.css`,
  `src/components/robot/AudioSettingSection.test.tsx`,
  `src/components/robot/RobotDisplaySection.tsx`, `src/components/robot/RobotDisplaySection.css`,
  `src/components/robot/RobotDisplaySection.test.tsx`

  **Estimated scope:** L (6 files — split `AudioSettingSection` extraction from
  `RobotDisplaySection`'s company-row addition into two sub-tasks if this proves too large for one
  session, matching `docs/tasks/ROBOT_OPTIONS.md`'s precedent for oversized tasks)

- [ ] **Task 14: `PingControlsDrawer.tsx` — prop-contract refactor**

  **Description:** `{ robot }` → `{ value: PingControlsValue; onDensityChange; onMotifLengthChange;
  onOctaveMinChange; onOctaveMaxChange; onNoteVarianceChange; onResetMelody?; disabled? }`. Internal
  JSX unchanged; internals call the passed callbacks instead of `robotOptionsActions` directly.

  **Acceptance criteria:**
  - [ ] No `robot` prop anywhere in `PingControlsDrawerProps`
  - [ ] `onResetMelody` is optional; when omitted, the Reset Melody `Button` does not render at all
    (not disabled — company mode has no melody-reset concept, per spec §3)
  - [ ] `disabled` renders every internal control disabled
  - [ ] Every callback fires with the same argument shape today's inline handlers already produce

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingControlsDrawer.test.tsx` — same assertions as
    today, re-pointed at the new prop contract, plus the new `onResetMelody`-omitted case
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Task 10.

  **Files:** `src/components/robot/PingControlsDrawer.tsx`,
  `src/components/robot/PingControlsDrawer.test.tsx`

  **Estimated scope:** S (2 files)

- [ ] **Task 15: `PingContourDrawer.tsx` — prop-contract refactor**

  **Description:** `{ robot }` → `{ value: ADSREnvelope; onChange: (next: ADSREnvelope) => void;
  disabled? }` — the smallest of the four refactors (spec §4's worked example).

  **Acceptance criteria:**
  - [ ] No `robot` prop anywhere in `PingContourDrawerProps`
  - [ ] Sustain's `%`-vs-`0..1` conversion still happens inside this component (at the `onChange`
    boundary), unchanged from today
  - [ ] `disabled` renders every internal control disabled

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingContourDrawer.test.tsx` — same assertions as
    today, re-pointed at the new prop contract, including the existing Sustain round-trip case
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Task 10.

  **Files:** `src/components/robot/PingContourDrawer.tsx`,
  `src/components/robot/PingContourDrawer.test.tsx`

  **Estimated scope:** S (2 files)

- [ ] **Task 16: `SignatureArrayDrawer.tsx` — prop-contract refactor**

  **Description:** `{ robot }` → `{ value: { layers, lfoSettings? }; onContinuousChange;
  onStructuralChange; onLfoChange; disabled? }`. The module-level `commitContinuous`/
  `commitStructural` functions are deleted from this file (moved to `robotOptionsActions.ts` in
  Task 10 as `applyLayersContinuous`/`applyLayersStructural`).

  **Acceptance criteria:**
  - [ ] No `robot` prop anywhere in `SignatureArrayDrawerProps`
  - [ ] `commitContinuous`/`commitStructural` no longer defined in this file
  - [ ] Exactly 3 layer sections render from `value.layers`, indexed directly — unchanged from
    today
  - [ ] `disabled` renders every internal control disabled

  **Verification:**
  - [ ] `npx vitest run src/components/robot/SignatureArrayDrawer.test.tsx` — same assertions as
    today, re-pointed at the new prop contract, including the "toggling Active mutes, doesn't
    clear settings" regression case
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Task 10.

  **Files:** `src/components/robot/SignatureArrayDrawer.tsx`,
  `src/components/robot/SignatureArrayDrawer.test.tsx`

  **Estimated scope:** M (2 files — most composed of the three drawer refactors)

- [ ] **Task 17: `RobotOptionsTab.tsx` — robot-mode wiring**

  **Description:** Derive each section's `value` from the selected `robot` and wire each
  `on*Change` to `(v) => applyX(robot, localeId, v)` — the code today's inline handlers used to
  contain now lives here instead, one call site per section.

  **Acceptance criteria:**
  - [ ] `RobotOptionsTab.tsx` renders `RobotDisplaySection`, `PingControlsDrawer`,
    `PingContourDrawer`, `SignatureArrayDrawer` (unchanged order) when a robot is selected
  - [ ] Every drawer's `value` is derived directly from `robot`; every `on*Change` calls the
    matching `robotOptionsActions.applyX(robot, localeId, value)`
  - [ ] `PingControlsDrawer` receives `onResetMelody={() => regenerateMelody(robot, localeId)}` (the
    one callback not in `robotOptionsActions.ts`, since it has no per-field "apply" shape)
  - [ ] Renders the existing not-selected fallback unchanged when `selectedRobotId` is falsy

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/RobotOptionsTab.test.tsx` — all
    passing, no behavior change from today
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Tasks 13, 14, 15, 16.

  **Files:** `src/components/panels/screen/console/RobotOptionsTab.tsx`,
  `src/components/panels/screen/console/RobotOptionsTab.test.tsx`

  **Estimated scope:** S (2 files — composition only, the hard work is already done by Tasks 13–16)

### Checkpoint: Robot Options Refactored

- [ ] `npm test` passes for all of Phase 5's test files and project-wide.
- [ ] `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [ ] **Manual regression pass (`npm run dev`), pending human operator:** select a robot, confirm
  Robot Display's read-only rows, Audio Setting, Volume (+ LFO), Ping Controls, Ping Contour, and
  Signature Array all behave exactly as they did before this phase — every edit audible/visible,
  no console errors. This is the single most important checkpoint in this plan; do not proceed to
  Phase 6 on green tests alone.

### Phase 6: Company Assignment in the Robot List

- [ ] **Task 18: `RobotSelectionCard.tsx` — company-assignment `Select` row**

  **Description:** Adds the same company `Select` `RobotDisplaySection` gained in Task 13, in the
  robot list view.

  **Acceptance criteria:**
  - [ ] Renders a `Select` row (via `buildCompanySelectSchema`/`FREELANCE_VALUE`) showing the
    card's robot's current company or "Freelance"
  - [ ] Selecting an option calls `assignRobotToCompany(localeId, robot.id, companyId |
    null)`
  - [ ] Existing card content (avatar, name, job/battery/docking/audio fields) unchanged

  **Verification:**
  - [ ] `npx vitest run src/components/selection/RobotSelectionCard.test.tsx` — new case passes,
    all existing cases still pass
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Tasks 6, 9, 12. Parallel-safe with Phase 5 (Tasks 13–17) — touches an unrelated
  file.

  **Files:** `src/components/selection/RobotSelectionCard.tsx`,
  `src/components/selection/RobotSelectionCard.test.tsx`

  **Estimated scope:** S (2 files)

### Phase 7: Company Manager UI

- [ ] **Task 19: `CompanyButtonRow.tsx`**

  **Description:** One button per company (visually capped at `MAX_COMPANIES`) plus "None"; calls
  `uiStore.selectCompany`.

  **Acceptance criteria:**
  - [ ] Renders one button per `locale.companies` entry, labeled by `company.name`, plus one
    "None" button
  - [ ] Clicking a company button calls `selectCompany(company.id)`; clicking "None" calls
    `selectCompany(null)`
  - [ ] The button matching the current `selectedCompanyId` (or "None" when `null`) renders in a
    visually active state

  **Verification:**
  - [ ] `npx vitest run src/components/company/CompanyButtonRow.test.tsx` — all passing
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Tasks 6, 7.

  **Files:** `src/components/company/CompanyButtonRow.tsx`,
  `src/components/company/CompanyButtonRow.css`,
  `src/components/company/CompanyButtonRow.test.tsx`

  **Estimated scope:** S (3 files)

- [ ] **Task 20: `CompanyCrudControls.tsx`**

  **Description:** Create (disabled at `MAX_COMPANIES`; pre-fills a `TextInput` with a name from
  `generateCompanyName`, editable before confirming), Rename (`TextInput`, enabled only when a
  company is selected), Delete (`Button`, enabled only when a company is selected — calls
  `removeCompany` then `selectCompany(null)`).

  **Acceptance criteria:**
  - [ ] Create is disabled when `locale.companies.length >= MAX_COMPANIES`
  - [ ] Create's `TextInput` pre-fills with a `generateCompanyName`-produced suggestion; confirming
    calls `addCompany` with either the suggestion as-is or the user's edited text
  - [ ] Rename and Delete are both disabled when `selectedCompanyId` is `null`
  - [ ] Delete calls `removeCompany(localeId, selectedCompanyId)` then `selectCompany(null)`, in
    that order

  **Verification:**
  - [ ] `npx vitest run src/components/company/CompanyCrudControls.test.tsx` — all passing,
    including the `MAX_COMPANIES`-disabled case and the delete-then-deselect case
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Tasks 5, 6, 8 (`generateCompanyName` must be exported from `spawnSystem.ts`).

  **Files:** `src/components/company/CompanyCrudControls.tsx`,
  `src/components/company/CompanyCrudControls.css`,
  `src/components/company/CompanyCrudControls.test.tsx`

  **Estimated scope:** M (3 files)

- [ ] **Task 21: `CompanyOptionsSection.tsx`**

  **Description:** "Company mode" call site for `AudioSettingSection`/`PingControlsDrawer`/
  `PingContourDrawer`/`SignatureArrayDrawer` — the core of this phase. Disabled/valueless when
  `selectedCompanyId === null`; otherwise wires each section's `value` from
  `resolveCompanyOptions(company, members[0])` and each `on*Change` to broadcast across
  `getCompanyMembers(localeId, companyId)` plus patch `company.lastEditedOptions`.

  **Acceptance criteria:**
  - [ ] With `selectedCompanyId === null`, every section renders `disabled` with no bound value
  - [ ] With a company selected, every section's displayed value matches
    `resolveCompanyOptions(company, members[0])`
  - [ ] Editing one field (e.g. Volume) calls the matching `robotOptionsActions.applyX` once per
    member robot (assert via call-count === member count) — never a single bulk call
  - [ ] Editing one field patches only that field into `company.lastEditedOptions` via
    `updateCompany` — every other field of `lastEditedOptions` is untouched by that edit
  - [ ] The Ping Controls instance omits `onResetMelody` entirely (no Reset Melody button renders
    in company mode)
  - [ ] Re-selecting a company after editing it, selecting a different company, then re-selecting
    the first: the panel shows the first company's last-edited values, not `members[0]`'s possibly
    since-drifted live values
  - [ ] Editing an individual member robot's value directly (simulated via `applyVolume` outside
    this component) does not change `company.lastEditedOptions` and is not reverted on the next
    render of this component

  **Verification:**
  - [ ] `npx vitest run src/components/company/CompanyOptionsSection.test.tsx` — all 6 cases from
    spec §5 pass
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Tasks 6, 7, 10, 11, 13, 14, 15, 16.

  **Files:** `src/components/company/CompanyOptionsSection.tsx`,
  `src/components/company/CompanyOptionsSection.css`,
  `src/components/company/CompanyOptionsSection.test.tsx`

  **Estimated scope:** L (3 files, but the highest-complexity single component in this phase — the
  broadcast + snapshot-patch wiring for 4 sections' worth of callbacks; split into per-section
  sub-tasks — e.g. wire Audio Setting first, verify, then Ping Controls, etc. — if it proves too
  large for one session)

- [ ] **Task 22: `CompanyManager.tsx`**

  **Description:** Composes `CompanyButtonRow` + `CompanyCrudControls` + `CompanyOptionsSection`.
  The single component `RobotsTab` will mount.

  **Acceptance criteria:**
  - [ ] Renders `CompanyButtonRow`, then `CompanyCrudControls`, then `CompanyOptionsSection`, in
    that order
  - [ ] No logic of its own beyond composition and reading `locale.companies`/`selectedCompanyId`
    to pass down

  **Verification:**
  - [ ] `npx vitest run src/components/company/CompanyManager.test.tsx` — all passing
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Tasks 19, 20, 21.

  **Files:** `src/components/company/CompanyManager.tsx`,
  `src/components/company/CompanyManager.css`,
  `src/components/company/CompanyManager.test.tsx`

  **Estimated scope:** S (3 files — pure composition)

### Checkpoint: Company UI

- [ ] `npm test` passes for all of Phase 7's test files and project-wide.
- [ ] `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [ ] Manual check (`npm run dev`, mounting `CompanyManager` at a temporary point if `RobotsTab`
  isn't wired yet): create, rename, delete a company; select one and edit a field; confirm the
  broadcast reaches every member. **Pending human operator.**

### Phase 8: Final Wiring

- [ ] **Task 23: `RobotsTab.tsx` — mount `CompanyManager`**

  **Description:** Renders `<CompanyManager />` beneath the existing robot card list.

  **Acceptance criteria:**
  - [ ] `CompanyManager` renders after the existing `<ul className="robots-tab__list">`
  - [ ] No other change to `RobotsTab.tsx`

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/RobotsTab.test.tsx` — new case passes
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Task 22.

  **Files:** `src/components/panels/screen/console/RobotsTab.tsx`,
  `src/components/panels/screen/console/RobotsTab.test.tsx`

  **Estimated scope:** XS (2 files)

- [ ] **Task 24: `Robot.tsx` — `isCompanyMember` world-view glow**

  **Description:** Second CSS hook alongside `isSelected`: `isCompanyMember`, true when
  `robot.companyId === selectedCompanyId` and `selectedCompanyId !== null`. Reuses
  `.robot.selected`'s existing glow treatment.

  **Acceptance criteria:**
  - [ ] `isCompanyMember` class applies when `robot.companyId === selectedCompanyId` and
    `selectedCompanyId !== null`
  - [ ] Does not apply when `selectedCompanyId` is `null`, even for a robot with a `companyId`
  - [ ] No new CSS visual language introduced — the glow reuses `.robot.selected`'s existing rule
  - [ ] `isSelected`'s existing behavior (driven by `selectedRobotId`) is completely unaffected

  **Verification:**
  - [ ] `npx vitest run src/components/robot/Robot.test.tsx` — new case passes, existing cases
    unaffected
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Task 7. Parallel-safe with Task 23.

  **Files:** `src/components/robot/Robot.tsx`, `src/components/robot/Robot.test.tsx`

  **Estimated scope:** XS (2 files)

### Checkpoint: Feature Wired In

- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` all clean project-wide.
- [ ] **Manual end-to-end check (`npm run dev`), pending human operator:** load a fresh locale,
  confirm 2-3 companies exist with some robots Freelance; select a company, confirm its members'
  cards highlight and glow in the world view; edit each of the 4 sections in company mode, confirm
  every member is audibly/visibly affected; switch to "None," confirm the panel greys out; re-select
  the company, confirm edited values persisted; edit one member individually via its own Robot
  Options screen, confirm the company panel is unaffected; delete the selected company, confirm its
  members show "Freelance" in both the list and Robot Options and the panel greys out.

### Phase 9: Docs

- [ ] **Task 25: `COMPONENT_LIBRARY.md`, `COMPANIES.md`, `UI_SHELL.md`, `CLAUDE.md`,
  `roadmap.md`**

  **Description:** Document shipped behavior against the final implementation, per spec §2/§6.

  **Acceptance criteria:**
  - [ ] `docs/COMPONENT_LIBRARY.md`: `Select` documented as the 14th primitive, in the same table
    format as the existing 13
  - [ ] `docs/COMPANIES.md`: "not yet implemented" banner removed, content folded into an
    implementation-sourced version matching what actually shipped
  - [ ] `docs/UI_SHELL.md`: Robots tile description updated to mention the company row/panel
  - [ ] `CLAUDE.md`: "The 13 stateless UI primitives" → "14"; `docs/COMPANIES.md`'s reference bullet
    drops its "not yet implemented" clause
  - [ ] `docs/todo/roadmap.md` § 10's bullets marked resolved, linking to
    `docs/specs/COMPANIES.md`

  **Verification:**
  - [ ] Manual proofread: every claim spot-checked against the actually-shipped code (field names,
    exact file paths, constant values) — not copied from this plan or the spec without verifying
    against real code, per this project's standing "verify roadmap against code" practice
  - [ ] Links resolve (relative paths correct)

  **Dependencies:** Tasks 1–24.

  **Files:** `docs/COMPONENT_LIBRARY.md`, `docs/COMPANIES.md`, `docs/UI_SHELL.md`, `CLAUDE.md`,
  `docs/todo/roadmap.md`

  **Estimated scope:** S (5 files, text-only)

### Checkpoint: Complete

- [ ] All acceptance criteria across Tasks 1–25 met.
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean project-wide.
- [ ] Every manual checkpoint above has been walked through by the human operator.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The Phase 5 drawer refactor regresses single-robot editing (a shipped, working feature) while all-green on automated tests alone | High | Phase 5's checkpoint explicitly requires a human manual pass through the real `RobotOptionsTab` screen before Phase 6 starts — not gated on tests alone |
| `CompanyOptionsSection` (Task 21) broadcasts a bulk `updateRobot` instead of the per-member `applyX` calls the spec requires, silently reproducing Phase 9's already-fixed stale-`AudioEngine`-cache bug | High | Task 21's acceptance criteria explicitly assert `applyX` call count equals member count, not just that `updateRobot` was called once |
| Radix `Select.Item`'s empty-string restriction is missed and `FREELANCE_VALUE` ends up as `''` somewhere (a thrown dev warning, easy to miss in a quick manual check) | Medium | Task 9/12's acceptance criteria both name the sentinel explicitly; `grep -rn "value: ''" src/components/company src/components/robot src/components/selection` as an extra manual grep before Task 25 |
| `spawnInitialCompanies` (Task 8) is seeded with `Math.random()` or `crypto.randomUUID()` by mistake, breaking the same-seed-same-result determinism every other spawn-time system relies on | High | Task 8's acceptance criteria include an explicit determinism test (same seed → identical company output across two runs), mirroring `spawnInitialRoster`'s own existing test |
| `CompanyOptionsSection` (Task 21) or `AudioSettingSection`+`RobotDisplaySection` (Task 13) prove too large for one focused session once real implementation starts | Medium/process | Both tasks' own notes pre-authorize splitting into smaller sub-tasks without needing a new round of spec/plan review, matching `docs/tasks/ROBOT_OPTIONS.md`'s precedent for its own oversized `SignatureArrayDrawer` task |
| A company name collides in form with a robot name (both drawing from the same word lists), confusing the UI | Low | Task 8's acceptance criteria require a distinct `COMPANY_NOUNS` list, not reuse of the robot `NOUNS` list |
| `MAX_COMPANIES` is accidentally enforced inside `localeStore.addCompany` itself (a store-level invariant) rather than only in `CompanyCrudControls`' Create button, contradicting spec §7.4 | Low | Task 6's acceptance criteria describe `addCompany` as a plain unconditional append, with no cap check; the cap only appears in Task 20's acceptance criteria |

## Open Questions

None remaining — spec §7's items are all resolved and folded into the task list above.
