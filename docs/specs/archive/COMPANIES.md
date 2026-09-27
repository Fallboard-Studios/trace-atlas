# Phase Spec: Companies (Roadmap Phase 10)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/companies.md](../intent/companies.md) (confirmed via
`/interview-me`). Source of scope: [docs/todo/roadmap.md § 10](../todo/roadmap.md#10-companies).
Design doc: [docs/COMPANIES.md](../COMPANIES.md). Prior art / current architecture:
[docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md), [docs/UI_SHELL.md](../UI_SHELL.md),
[docs/PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md),
[docs/ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md), and the immediately-prior phase spec
[docs/specs/ROBOT_OPTIONS.md](ROBOT_OPTIONS.md) (this phase reuses its schemas and drawer
components directly — see § 1).

---

## 1. Overview & Claude Explanation

This phase adds **Companies** — seeded, named groups of robots that let every Robot Options field
be edited across many robots at once. It touches three layers: new domain state (`Company`,
`Robot.companyId`), a refactor of the four existing Robot Options sections so their rendering is
robot-agnostic (a `value`/`onChange` contract, not a `robot` prop) so both a single robot and a
Company can drive them, and new UI in `RobotsTab` (company button row, CRUD, and the reused
sections in "company mode").

**Spawn generation.** `spawnInitialCompanies` (new, `spawnSystem.ts`) runs immediately after
`spawnInitialRoster` inside `worldTransition.ts`'s `initializeLocale` — the same place job
assignment already hooks in, and for the same reason (avoiding scattering "what does bringing a
locale online mean" across call sites). It seeds 2-3 companies, each claiming a seeded 3-4 robots
(disjoint — a shrinking pool guarantees no robot is ever double-claimed and every company's
membership is final at generation time), each given a generated name. Any robot not claimed is
Freelance (`companyId: undefined`) — the implicit default, not a distinct flag. Because this hooks
into `initializeLocale`'s existing `if (locale.robots.length === 0)` guard, Companies inherit
`worldTransition.ts`'s existing retransmit semantics for free: a `coordsOnly`/`both` retransmit
builds a genuinely new, empty locale (robots *and* companies regenerate fresh), while a
`planetOnly` retransmit re-parents the *existing* locale onto a new planet untouched (robots *and*
companies both survive, unchanged) — no new branching logic needed, no company-specific case to
get wrong.

**The value/onChange refactor.** Today, `PingControlsDrawer`/`PingContourDrawer`/
`SignatureArrayDrawer` and (part of) `RobotDisplaySection` each take a `robot: Robot` prop and read
straight off it. This phase extracts:

- The Audio Setting radio + Volume slider + Volume LFO accordion out of `RobotDisplaySection` into
  a new sibling component, `AudioSettingSection` — `RobotDisplaySection` keeps the read-only
  Name/Job/Battery/Docking rows (unchanged) and renders `AudioSettingSection` for the editable
  part.
- Every drawer's inline field handlers (`handleDensityChange`, `commitAdsr`, `commitContinuous`/
  `commitStructural`, etc.) out into a new shared module, `src/systems/robotOptionsActions.ts` —
  each exported as `applyX(robot, localeId, value)`, doing exactly what today's inline handler body
  does (the `updateRobot` store write plus whatever `AudioEngine`/`lfoEngine`/`regenerateMelody`
  call already accompanies it). Nothing about *what* an edit does changes — only *where* the
  function bodies live.
- `AudioSettingSection`/`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer`'s prop
  interfaces change from `{ robot: Robot }` to `{ value: <ThisSection'sValueShape>; on*Change: ...;
  disabled?: boolean }` (exact shapes in § 4). They no longer know or care whether they're editing
  one robot or broadcasting to a company.

`RobotOptionsTab.tsx` becomes the "robot mode" call site: it derives each section's `value` from
the selected `robot` and wires each `on*Change` to `(v) => applyX(robot, localeId, v)`. This is a
pure refactor — `RobotOptionsTab`'s own rendered output and behavior are unchanged; only where the
derivation/wiring code lives moves (from inside each drawer to its call site).

**Company mode.** A new `CompanyOptionsSection` (`src/components/company/`) is the "company mode"
call site for the same four sections, mounted by a new `CompanyManager` component that `RobotsTab`
renders beneath the existing robot card list. With "None" selected (`uiStore.selectedCompanyId ===
null`, the default), every section renders `disabled` with no bound `value`. With a company
selected, `CompanyOptionsSection` computes a merged display snapshot —
`resolveCompanyOptions(company, firstMember)` (new, `src/systems/companyOptions.ts`): every field
the company has never had an edit for falls back live to `firstMember`'s (the company's first
member robot's) current value; every field the company *has* been edited for reads from
`company.lastEditedOptions` instead — and wires each `on*Change` to a broadcast: call the matching
`applyX` once per member robot, then patch that one field into `company.lastEditedOptions` via
`localeStore.updateCompany`. This is what makes "revert to the last state it was in when last
editing, or the first robot's options if unused" and "only the touched field changes, individual
robot edits afterward stay individual" both true without any special-cased first-edit branch —
the merge just prefers the company's own recorded value over the live fallback, field by field.
Ping Controls' Reset Melody `Button` is omitted in company mode entirely (not disabled — it has no
company-scoped meaning, per the confirmed intent).

**Selection & assignment.** `uiStore` gains `selectedCompanyId: string | null` (default `null`) and
`selectCompany`, independent of the existing `selectedRobotId`. Selecting a company highlights its
members' `RobotSelectionCard`s and glows them in the world view (`Robot.tsx` gains a second CSS
hook, `isCompanyMember`, reusing `.robot.selected`'s existing glow treatment rather than a new
visual language). A robot's company is reassigned through a new `Select` primitive — the Design
System's 14th (`@radix-ui/react-select` is already an installed, currently-unused dependency; no
new package needed) — shown in both `RobotSelectionCard` and `RobotDisplaySection`, listing every
company by name plus "Freelance". Reassignment goes through one new atomic store action,
`localeStore.assignRobotToCompany(localeId, robotId, companyId | null)`, rather than composing
separate `updateRobot`/`updateCompany` calls from a component — it updates the robot's `companyId`
and both the old and new company's `robotIds` in one `set()`, the same one-action-one-transition
shape `removeRobot`/`removeCompany` already use for their own cross-entity cleanup.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── Company.ts                         # NEW — Company, CompanyOptionsSnapshot (see § 4)
│   ├── Company.test.ts                    # NEW — see § 5
│   ├── Robot.ts                           # MODIFIED — `companyId?: string` added (undefined =
│   │                                      #   Freelance, the implicit default)
│   ├── locale.ts                          # MODIFIED — `Locale.companies: Company[]`;
│   │                                      #   `LocaleState` gains `addCompany`/`updateCompany`/
│   │                                      #   `removeCompany`/`getCompanyById`/
│   │                                      #   `getCompanyMembers`/`assignRobotToCompany`
│   ├── controls.ts                        # MODIFIED — new `SelectSchema` variant + `'select'`
│   │                                      #   added to `ControlSchema` union and
│   │                                      #   `CONTROL_SCHEMA_TYPES` (13 → 14)
│   └── controls.test.ts                   # MODIFIED — assertion updated to 14 variants
├── stores/
│   ├── localeStore.ts                     # MODIFIED — company CRUD actions (§ 4), mirroring the
│   │                                      #   existing robot-helper pattern exactly;
│   │                                      #   `removeCompany`/`removeLocale` clear `companyId` on
│   │                                      #   every affected member robot first
│   ├── localeStore.test.ts                # MODIFIED — new cases for the above
│   ├── uiStore.ts                         # MODIFIED — `selectedCompanyId: string | null` (default
│   │                                      #   `null`) + `selectCompany`, independent of
│   │                                      #   `selectedRobotId`
│   └── uiStore.test.ts                    # MODIFIED — new cases for the above
├── constants/
│   └── index.ts                           # MODIFIED — `MAX_COMPANIES = 6` (CRUD ceiling),
│                                          #   `INITIAL_COMPANIES_MIN = 2`/`_MAX = 3`,
│                                          #   `COMPANY_SIZE_MIN = 3`/`_MAX = 4` (spawn generation
│                                          #   — distinct from the CRUD ceiling)
├── systems/
│   ├── spawnSystem.ts                     # MODIFIED — new `spawnInitialCompanies(localeId)`,
│   │                                      #   `generateCompanyName`/`generateCompanyId` (mirror
│   │                                      #   `generateRobotName`/`generateRobotId`'s pattern; a
│   │                                      #   new `COMPANY_NOUNS` word list pairs with the
│   │                                      #   existing `ADJECTIVES` so a generated company name
│   │                                      #   never collides in form with a robot name — see § 7.3)
│   ├── spawnSystem.test.ts                # MODIFIED — new `spawnInitialCompanies` assertions:
│   │                                      #   2-3 companies, 3-4 members each, disjoint
│   │                                      #   membership, deterministic across two runs with the
│   │                                      #   same seed (mirrors the existing
│   │                                      #   `spawnInitialRoster` determinism test)
│   ├── robotOptionsActions.ts             # NEW — `applyAudioMode`/`applyVolume`/
│   │                                      #   `applyVolumeLfo`/`applyDensity`/
│   │                                      #   `applyMotifLength`/`applyNoteVariance`/
│   │                                      #   `applyOctaveMin`/`applyOctaveMax`/`applyAdsr`/
│   │                                      #   `applyLayersContinuous`/`applyLayersStructural`/
│   │                                      #   `applyLayerLfo` — each `(robot, localeId, value) =>
│   │                                      #   void`, extracted verbatim from today's inline
│   │                                      #   drawer handlers (see § 4)
│   ├── robotOptionsActions.test.ts        # NEW — see § 5
│   ├── companyOptions.ts                  # NEW — `resolveCompanyOptions(company, firstMember):
│   │                                      #   CompanyOptionsSnapshot` (the per-field
│   │                                      #   snapshot-or-fallback merge, see § 4)
│   ├── companyOptions.test.ts             # NEW — see § 5
│   └── worldTransition.ts                 # MODIFIED — `initializeLocale` calls
│                                          #   `spawnInitialCompanies(localeId)` immediately after
│                                          #   `spawnInitialRoster(localeId)`, inside the same
│                                          #   `if (locale.robots.length === 0)` guard
│   └── worldTransition.test.ts            # MODIFIED — new case: `initializeLocale` populates
│                                          #   `locale.companies` on first call, does not on a
│                                          #   second call against an already-populated locale
├── data/
│   ├── companyConfig.ts                   # NEW — `buildCompanySelectSchema(companies): SelectSchema`
│                                          #   (dynamic — options depend on the current company
│                                          #   list, unlike every static `*Config.ts` schema so
│                                          #   far), `FREELANCE_VALUE` sentinel (see § 4),
│                                          #   Create/Rename/Delete `ButtonSchema`/`TextInputSchema`
│                                          #   entries, and the company row's `DualLabel` schema.
│                                          #   Audio Setting/Volume/Ping Controls/Ping Contour/
│                                          #   Signature Array schemas are reused directly from
│                                          #   `robotOptionsConfig.ts` — not redefined here.
│   └── companyConfig.test.ts              # NEW — see § 5
├── components/
│   ├── ui/controls/
│   │   ├── Select.tsx                     # NEW — 14th Design System primitive, wraps
│   │   │                                  #   `@radix-ui/react-select` (already a dependency,
│   │   │                                  #   previously unused)
│   │   ├── Select.css                     # NEW
│   │   └── Select.test.tsx                # NEW — see § 5
│   ├── robot/
│   │   ├── AudioSettingSection.tsx        # NEW — extracted from RobotDisplaySection: Audio
│   │   │                                  #   Setting radio + Volume slider + Volume LFO
│   │   │                                  #   accordion, now `{ value, onAudioModeChange,
│   │   │                                  #   onVolumeChange, onVolumeLfoChange, disabled? }`
│   │   ├── AudioSettingSection.css        # NEW
│   │   ├── AudioSettingSection.test.tsx   # NEW — see § 5
│   │   ├── RobotDisplaySection.tsx        # MODIFIED — keeps read-only Name/Job/Battery/Docking
│   │   │                                  #   rows + the new company-assignment `Select` row;
│   │   │                                  #   renders `AudioSettingSection` for the editable part,
│   │   │                                  #   wiring its callbacks to `robotOptionsActions`
│   │   ├── RobotDisplaySection.css        # MODIFIED — company row styling
│   │   ├── RobotDisplaySection.test.tsx   # MODIFIED — assertions split: read-only rows +
│   │   │                                  #   company Select stay here; Audio Setting/Volume
│   │   │                                  #   assertions move to AudioSettingSection.test.tsx
│   │   ├── PingControlsDrawer.tsx         # MODIFIED — `{ robot }` → `{ value, onDensityChange,
│   │   │                                  #   onMotifLengthChange, onOctaveMinChange,
│   │   │                                  #   onOctaveMaxChange, onNoteVarianceChange,
│   │   │                                  #   onResetMelody?, disabled? }`; internals call the
│   │   │                                  #   passed callbacks instead of `robotOptionsActions`
│   │   │                                  #   directly (that call now lives at each call site)
│   │   ├── PingControlsDrawer.test.tsx    # MODIFIED — same assertions, driven through props
│   │   │                                  #   instead of a seeded `robot`/store spy
│   │   ├── PingContourDrawer.tsx          # MODIFIED — `{ robot }` → `{ value: ADSREnvelope,
│   │   │                                  #   onChange, disabled? }`
│   │   ├── PingContourDrawer.test.tsx     # MODIFIED — same assertions, driven through props
│   │   ├── SignatureArrayDrawer.tsx       # MODIFIED — `{ robot }` → `{ value: { layers,
│   │   │                                  #   lfoSettings? }, onContinuousChange,
│   │   │                                  #   onStructuralChange, onLfoChange, disabled? }`;
│   │   │                                  #   `commitContinuous`/`commitStructural` module
│   │   │                                  #   functions are deleted here (moved to
│   │   │                                  #   robotOptionsActions.ts as `applyLayersContinuous`/
│   │   │                                  #   `applyLayersStructural`)
│   │   └── SignatureArrayDrawer.test.tsx  # MODIFIED — same assertions, driven through props
│   ├── selection/
│   │   ├── RobotSelectionCard.tsx         # MODIFIED — new company-assignment `Select` row,
│   │   │                                  #   calling `assignRobotToCompany`
│   │   └── RobotSelectionCard.test.tsx    # MODIFIED — new case for the Select row
│   ├── company/
│   │   ├── CompanyManager.tsx             # NEW — top-level container `RobotsTab` mounts beneath
│   │   │                                  #   the robot card list: composes CompanyButtonRow +
│   │   │                                  #   CompanyCrudControls + CompanyOptionsSection
│   │   ├── CompanyManager.css             # NEW
│   │   ├── CompanyManager.test.tsx        # NEW — see § 5
│   │   ├── CompanyButtonRow.tsx           # NEW — one button per company (capped visually at
│   │   │                                  #   `MAX_COMPANIES`, though the CRUD panel is what
│   │   │                                  #   actually enforces the cap) plus "None"; calls
│   │   │                                  #   `uiStore.selectCompany`
│   │   ├── CompanyButtonRow.css           # NEW
│   │   ├── CompanyButtonRow.test.tsx      # NEW — see § 5
│   │   ├── CompanyCrudControls.tsx        # NEW — Create (Button, disabled at the
│   │   │                                  #   `MAX_COMPANIES` cap; generates a name via
│   │   │                                  #   `generateCompanyName`, pre-filled into a `TextInput`
│   │   │                                  #   the user can accept as-is or edit before confirming
│   │   │                                  #   — see § 4), Rename (`TextInput`, only enabled when
│   │   │                                  #   a company is selected), Delete (`Button`, only
│   │   │                                  #   enabled when a company is selected — calls
│   │   │                                  #   `removeCompany`, then `selectCompany(null)`)
│   │   ├── CompanyCrudControls.css        # NEW
│   │   ├── CompanyCrudControls.test.tsx   # NEW — see § 5
│   │   ├── CompanyOptionsSection.tsx      # NEW — "company mode" call site for
│   │   │                                  #   AudioSettingSection/PingControlsDrawer/
│   │   │                                  #   PingContourDrawer/SignatureArrayDrawer; disabled/
│   │   │                                  #   valueless when `selectedCompanyId === null`, else
│   │   │                                  #   wires value from `resolveCompanyOptions` and
│   │   │                                  #   broadcasts each edit across
│   │   │                                  #   `getCompanyMembers(localeId, companyId)`
│   │   ├── CompanyOptionsSection.css      # NEW
│   │   └── CompanyOptionsSection.test.tsx # NEW — see § 5
│   ├── panels/screen/console/
│   │   ├── RobotsTab.tsx                  # MODIFIED — renders `<CompanyManager />` beneath the
│   │   │                                  #   existing `<ul className="robots-tab__list">`
│   │   └── RobotsTab.test.tsx             # MODIFIED — new case: `CompanyManager` renders
│   └── robot/Robot.tsx                    # MODIFIED — second CSS hook, `isCompanyMember`, true
│       (already listed above under robot/) #   when `robot.companyId === selectedCompanyId` and
│                                          #   `selectedCompanyId !== null`; reads
│                                          #   `uiStore.selectedCompanyId` alongside the existing
│                                          #   `selectedRobotId` read
│   └── robot/Robot.test.tsx               # MODIFIED — new case for `isCompanyMember`
docs/
├── COMPONENT_LIBRARY.md                   # MODIFIED — `Select` added as the 14th primitive
├── COMPANIES.md                           # MODIFIED — "not yet implemented" banner removed,
│                                          #   folded into an implementation-sourced version
├── UI_SHELL.md                            # MODIFIED — Robots tile description gains the company
│                                          #   row/panel
├── CLAUDE.md                              # MODIFIED — reference bullet text "The 13 stateless UI
│                                          #   primitives" → "14"; `docs/COMPANIES.md`'s bullet
│                                          #   drops its "not yet implemented" clause
└── todo/roadmap.md                     # MODIFIED — § 10's bullets marked resolved
```

**Confirmed NOT touched:** `AccordionContainer`/`SliderLinear`/`SliderLog`/`SliderCenteredZero`/
`RadioButton`/`Stepper`/`StepperWithToggle`/`Toggle`/`Button`/`TextInput`/`DualLabel`/`Lfo` (the
existing 12 non-`Select` primitives — none change), `AudioEngine.ts`/`compositeVoice.ts` (every
method this phase calls — `updateRobotMasterVolume`/`updateVoiceEnvelope`/
`updateVoiceLayerParams`/`reReserveVoice` — already exists exactly as needed; company mode's
"broadcast" is purely a matter of calling them once per member robot, nothing engine-side changes),
`lfoEngine.ts` (already robot-scoped via its optional `robotId` parameter), `melodyGenerator.ts`/
`regenerateMelody.ts` (called once per member, unchanged signature), `robotSystems.ts` (job/docking
stay fully automatic; company membership is never read by lifecycle logic), `RobotOptionsTab.tsx`'s
own routing (`selectedRobotId ? <RobotOptionsTab /> : <RobotsTab />` — unaffected; a company is
never itself "selected" the way a robot is, in the sense of switching which screen renders).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in § 2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build
  assets.
* **No new dependency.** `@radix-ui/react-select` is already in `package.json` (`^2.2.6`),
  currently imported nowhere — `Select.tsx` is the first consumer. Do not add any other package.
* **Companies are fully seeded/deterministic**, like everything else in the app — no
  `crypto.randomUUID()`, no bare `Math.random()`, for company count, size, membership, or name.
  Route every random draw through `getSeededVal`/the locale noise map
  ([PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md)).
* **Spawn generation (2-3 companies, 3-4 members each) is a separate concept from `MAX_COMPANIES`
  (6)** — the former is what `spawnInitialCompanies` produces; the latter is only the ceiling
  `CompanyCrudControls`' Create button enforces. Do not conflate the two constants, and do not let
  spawn generation read `MAX_COMPANIES` as its upper bound.
* **A company-wide edit must replicate every live side effect a single-robot edit already makes.**
  Every `applyX` in `robotOptionsActions.ts` must be called once per member robot when broadcasting
  — never a bulk `updateRobot`-only write that skips the matching `AudioEngine`/`lfoEngine`/
  `regenerateMelody` call. Skipping it would reproduce the exact stale-cache class of bug Phase 9's
  post-launch fixes already found and fixed once for the single-robot case (see
  [ROBOT_OPTIONS.md § 7's commit history](ROBOT_OPTIONS.md) and roadmap Phase 9's "Post-launch
  fixes" note).
* **A company edit is a one-time broadcast, never a standing link.** `Company` never becomes a
  live source of truth a member robot re-reads from later. A robot edited individually after a
  company broadcast stays exactly as edited — nothing reconciles it against its company, ever.
* **`CompanyOptionsSnapshot` fields are all optional** (`Partial`-shaped) — do not "seed" a full
  clone of `firstMember`'s values into `lastEditedOptions` on first edit. `resolveCompanyOptions`
  does the merge live, per field, on every render (§ 4) — this is a deliberate simplification from
  the intent doc's "seeded from first member's values" phrasing, functionally identical from the
  user's perspective (see § 7.1).
* **Reset Melody has no company-scoped equivalent.** `CompanyOptionsSection`'s Ping Controls
  instance omits the button entirely (renders no `onResetMelody`), rather than disabling it or
  broadcasting a melody reset to every member.
* **Company selection (`selectedCompanyId`) and robot selection (`selectedRobotId`) are
  independent uiStore fields.** Never conflate them, never clear one as a side effect of setting
  the other.
* **`isCompanyMember` reuses `.robot.selected`'s existing glow** — do not introduce a second CSS
  visual language for "this robot is highlighted." Company selection is a visual-only state; it
  must never touch `audioMode`, `AudioEngine` routing, or anything audio-side.
* **Deleting a company frees its robots to Freelance, synchronously, before the company itself is
  removed** — `removeCompany` clears `companyId` on every member first, mirroring
  `removeLocale`'s existing per-robot-cleanup-before-removal shape. If the deleted company was
  selected, the caller (`CompanyCrudControls`) also calls `selectCompany(null)`.
* **Radix Select's `Item` value cannot be an empty string** (`@radix-ui/react-select` reserves `""`
  for its own internal "no selection" affordance and throws in dev if an `Item` uses it). The
  Freelance option in every company `Select` must use a non-empty sentinel value (this spec fixes
  it as `'__freelance__'`, see § 4) — not `''`, not `null` coerced to a string.
* **`robotOptionsActions.ts` functions never read from or write to `uiStore`** — they take
  `(robot, localeId, value)` and touch only `localeStore`/`AudioEngine`/`lfoEngine`/
  `regenerateMelody`, exactly matching what today's inline handlers already touch. Selection state
  is a caller concern, not theirs.
* **`robotOptionsConfig.ts`'s existing schemas are reused as-is for company mode** — Audio
  Setting/Volume/Ping Controls/Ping Contour/Signature Array schemas are not duplicated into
  `companyConfig.ts`. Only genuinely new schemas (company Select, CRUD controls, company row
  `DualLabel`) live there.

---

## 4. Code Style & Architecture Conventions

**`src/types/Company.ts`:**

```typescript
import type { Robot, ADSREnvelope } from './Robot';
import type { OscillatorLayer } from './layeredAudio';
import type { RobotLfoTargetId, LfoSettings } from './lfo';

/** Every field is optional — an untouched field falls back to the company's first member's
 *  live current value (see companyOptions.ts's resolveCompanyOptions). Never fully populated
 *  on creation; grows one field at a time as the company is actually edited. */
export interface CompanyOptionsSnapshot {
  audioMode?: Robot['audioMode'];
  masterVolume?: number;
  volumeLfo?: LfoSettings & { active: boolean };
  rhythmicDensity?: number;
  rhythmicMotifLength?: { active: boolean; value: number };
  noteVariance?: { active: boolean; value: number };
  octaveRange?: [number, number];
  adsr?: ADSREnvelope;
  layers?: OscillatorLayer[];
  lfoSettings?: Partial<Record<RobotLfoTargetId, LfoSettings & { active: boolean }>>;
}

export interface Company {
  id: string;
  name: string;
  robotIds: string[];
  lastEditedOptions?: CompanyOptionsSnapshot;
}
```

**`src/systems/companyOptions.ts` — the merge that makes "last edited, or first member's current
values" true without a special-cased first-edit branch:**

```typescript
export function resolveCompanyOptions(company: Company, firstMember: Robot): Required<CompanyOptionsSnapshot> {
  const fromRobot: Required<CompanyOptionsSnapshot> = {
    audioMode: firstMember.audioMode ?? 'none',
    masterVolume: firstMember.masterVolume,
    volumeLfo: firstMember.lfoSettings?.volume ?? { ...DEFAULT_LFO_SETTINGS.volume, active: false },
    rhythmicDensity: firstMember.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY,
    rhythmicMotifLength: firstMember.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
    noteVariance: firstMember.noteVariance ?? DEFAULT_NOTE_VARIANCE,
    octaveRange: firstMember.octaveRange,
    adsr: firstMember.audioAttributes.adsr,
    layers: firstMember.audioAttributes.layers ?? [],
    lfoSettings: firstMember.lfoSettings ?? {},
  };
  return { ...fromRobot, ...company.lastEditedOptions };
}
```

**`src/systems/robotOptionsActions.ts` — extracted verbatim from today's inline handlers (shown:
two representative examples; the remaining 10 follow the same shape 1:1 from their current
call sites in `RobotDisplaySection.tsx`/`PingControlsDrawer.tsx`/`PingContourDrawer.tsx`/
`SignatureArrayDrawer.tsx`):**

```typescript
// BEFORE (RobotDisplaySection.tsx, today) — inline, closed over `robot`/`localeId` from props
const handleVolumeChange = (pct: number) => {
  const value = pct / 100;
  useLocaleStore.getState().updateRobot(localeId, robot.id, { masterVolume: value });
  AudioEngine.updateRobotMasterVolume(robot.id, value);
};

// AFTER (robotOptionsActions.ts) — same body, now a standalone exported function
export function applyVolume(robot: Robot, localeId: string, pct: number): void {
  const value = pct / 100;
  useLocaleStore.getState().updateRobot(localeId, robot.id, { masterVolume: value });
  AudioEngine.updateRobotMasterVolume(robot.id, value);
}

// BEFORE (SignatureArrayDrawer.tsx, today) — module-level, already close to standalone
function commitStructural(robot: Robot, localeId: string, layers: OscillatorLayer[]) {
  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    audioAttributes: { ...robot.audioAttributes, layers },
  });
  AudioEngine.reReserveVoice(robot.id);
}

// AFTER — moved as-is, renamed for the shared module's naming convention
export function applyLayersStructural(robot: Robot, localeId: string, layers: OscillatorLayer[]): void {
  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    audioAttributes: { ...robot.audioAttributes, layers },
  });
  AudioEngine.reReserveVoice(robot.id);
}
```

**Drawer prop-interface refactor — `PingContourDrawer.tsx` as the smallest, clearest example:**

```typescript
// BEFORE
interface PingContourDrawerProps {
  robot: Robot;
}
export function PingContourDrawer({ robot }: PingContourDrawerProps) {
  const localeId = getActiveLocaleId();
  const adsr = robot.audioAttributes.adsr;
  const commitAdsr = (next: ADSREnvelope) => {
    useLocaleStore.getState().updateRobot(localeId, robot.id, {
      audioAttributes: { ...robot.audioAttributes, adsr: next },
    });
    AudioEngine.updateVoiceEnvelope(robot.id, next);
  };
  // ...four handlers calling commitAdsr...
}

// AFTER
interface PingContourDrawerProps {
  value: ADSREnvelope;
  onChange: (next: ADSREnvelope) => void;
  disabled?: boolean;
}
export function PingContourDrawer({ value: adsr, onChange, disabled }: PingContourDrawerProps) {
  const handleAttackChange = (v: number) => onChange({ ...adsr, attack: v });
  const handleDecayChange = (v: number) => onChange({ ...adsr, decay: v });
  const handleReleaseChange = (v: number) => onChange({ ...adsr, release: v });
  const handleSustainChange = (pct: number) => onChange({ ...adsr, sustain: pct / 100 });
  // JSX unchanged except each control also receives `disabled={disabled}`
}
```

**`RobotOptionsTab.tsx`'s new robot-mode wiring** (this is where the code `commitAdsr` used to
contain now lives):

```typescript
<PingContourDrawer
  value={robot.audioAttributes.adsr}
  onChange={(adsr) => applyAdsr(robot, localeId, adsr)}
/>
```

**`CompanyOptionsSection.tsx`'s company-mode wiring** — the same component, a different call site:

```typescript
const resolved = selectedCompany ? resolveCompanyOptions(selectedCompany, members[0]) : undefined;

<PingContourDrawer
  value={resolved?.adsr ?? DEFAULT_DISABLED_ADSR}
  disabled={!selectedCompany}
  onChange={(adsr) => {
    if (!selectedCompany) return;
    members.forEach((m) => applyAdsr(m, localeId, adsr));
    useLocaleStore.getState().updateCompany(localeId, selectedCompany.id, {
      lastEditedOptions: { ...selectedCompany.lastEditedOptions, adsr },
    });
  }}
/>
```

**`localeStore.ts` — company actions, mirroring the existing robot-helper pattern exactly:**

```typescript
addCompany: (localeId, company) => void;
updateCompany: (localeId, companyId, updates: Partial<Company>) => void;
removeCompany: (localeId, companyId) => void;   // clears companyId on every member first
getCompanyById: (localeId, companyId) => Company | undefined;
getCompanyMembers: (localeId, companyId) => Robot[];
// One atomic transition — not composed from updateRobot + two updateCompany calls at the
// component layer, the same "one action, one cross-entity transition" shape removeRobot/
// removeCompany already use for their own cleanup:
assignRobotToCompany: (localeId, robotId, companyId: string | null) => void;
```

```typescript
// assignRobotToCompany's implementation shape
assignRobotToCompany: (localeId, robotId, companyId) => {
  set((state) => {
    const existing = state.locales[localeId];
    if (!existing) return state;
    const robot = existing.robots.find((r) => r.id === robotId);
    if (!robot) return state;
    const oldCompanyId = robot.companyId;

    const nextRobots = existing.robots.map((r) =>
      r.id === robotId ? { ...r, companyId: companyId ?? undefined } : r
    );
    const nextCompanies = existing.companies.map((c) => {
      if (c.id === oldCompanyId) return { ...c, robotIds: c.robotIds.filter((id) => id !== robotId) };
      if (c.id === companyId) return { ...c, robotIds: [...c.robotIds, robotId] };
      return c;
    });
    return { locales: { ...state.locales, [localeId]: { ...existing, robots: nextRobots, companies: nextCompanies } } };
  });
},
```

**`Select` primitive — 14th `ControlSchema` variant, `src/types/controls.ts`:**

```typescript
export interface SelectSchema extends ControlSchemaBase {
  type: 'select';
  options: { value: string; label: string }[];
}

export type ControlSchema =
  | StepperSchema | StepperWithToggleSchema
  | SliderLinearSchema | SliderLogSchema | SliderCenteredZeroSchema
  | RadioButtonSchema | ToggleSchema | TextInputSchema | CoordsInputSchema
  | ButtonSchema | DualLabelSchema | AccordionSchema | LfoSchema | SelectSchema;

export const CONTROL_SCHEMA_TYPES: readonly ControlSchema['type'][] = [
  'stepper', 'stepperToggle',
  'sliderLinear', 'sliderLog', 'sliderCenteredZero',
  'radio', 'toggle', 'textInput', 'coordsInput',
  'button', 'dualLabel', 'accordion', 'lfo', 'select',
];
```

**`Select.tsx`** — same props contract as `RadioButton` (the closest existing precedent: an
options-list control wrapping a Radix primitive), plus `disabled` (new to the family, needed for
the company-assignment dropdown's "no companies exist yet" case and the greyed-out company panel):

```typescript
interface SelectProps {
  schema: SelectSchema;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}
export function Select({ schema, value, onChange, disabled }: SelectProps) {
  const accessibleName = resolveAccessibleName(schema);
  return (
    <div className="sc-select">
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      <RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled}>
        <RadixSelect.Trigger className="sc-select__trigger" aria-label={accessibleName}>
          <RadixSelect.Value />
          <RadixSelect.Icon />
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className="sc-select__content">
            <RadixSelect.Viewport>
              {schema.options.map((opt) => (
                <RadixSelect.Item key={opt.value} value={opt.value} className="sc-select__item">
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}
```

**`companyConfig.ts` — the Freelance sentinel, required because Radix `Select.Item` rejects an
empty-string `value`:**

```typescript
export const FREELANCE_VALUE = '__freelance__';

export function buildCompanySelectSchema(companies: Company[]): SelectSchema {
  return {
    id: 'company.assign',
    type: 'select',
    loreLabel: 'UNIT AFFILIATION',
    humanLabel: 'Company',
    options: [
      { value: FREELANCE_VALUE, label: 'Freelance' },
      ...companies.map((c) => ({ value: c.id, label: c.name })),
    ],
  };
}

// Call site (RobotSelectionCard.tsx / RobotDisplaySection.tsx):
const handleCompanyChange = (value: string) =>
  useLocaleStore.getState().assignRobotToCompany(localeId, robot.id, value === FREELANCE_VALUE ? null : value);
```

**`spawnSystem.ts` — company generation, mirroring `spawnInitialRoster`'s existing shape:**

```typescript
const COMPANY_NOUNS = ['Collective', 'Consortium', 'Guild', 'Division', 'Outfit', 'Crew', 'Cartel', 'Syndicate'];

function generateCompanyName(noiseMap: NoiseFunction2D, offset: number): string {
  const a = ADJECTIVES[Math.floor(getSeededVal(noiseMap, 'company.name.adj', offset, 0, ADJECTIVES.length))];
  const n = COMPANY_NOUNS[Math.floor(getSeededVal(noiseMap, 'company.name.noun', offset, 0, COMPANY_NOUNS.length))];
  return `${a} ${n}`;
}

function generateCompanyId(noiseMap: NoiseFunction2D, index: number): string {
  const idSeed = getSeededVal(noiseMap, 'company.id', index, 0, 1);
  return `company-${index}-${idSeed.toString(36).slice(2, 10)}`;
}

export function spawnInitialCompanies(localeId: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  const noiseMap = locale ? getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y) : null;
  const robotIds = (locale?.robots ?? []).map((r) => r.id);

  const companyCount = INITIAL_COMPANIES_MIN + Math.floor(
    getSeededVal(noiseMap, 'company.count', 0, 0, INITIAL_COMPANIES_MAX - INITIAL_COMPANIES_MIN + 1)
  );

  let pool = [...robotIds]; // shrinks as members are claimed — guarantees disjoint membership
  for (let c = 0; c < companyCount && pool.length > 0; c++) {
    const size = Math.min(pool.length, COMPANY_SIZE_MIN + Math.floor(
      getSeededVal(noiseMap, 'company.size', c, 0, COMPANY_SIZE_MAX - COMPANY_SIZE_MIN + 1)
    ));
    const memberIds: string[] = [];
    for (let i = 0; i < size; i++) {
      const idx = Math.floor(getSeededVal(noiseMap, 'company.member', c * 100 + i, 0, pool.length));
      memberIds.push(pool[idx]);
      pool = pool.filter((_, j) => j !== idx);
    }
    const company: Company = {
      id: noiseMap ? generateCompanyId(noiseMap, c) : `company-${c}`,
      name: noiseMap ? generateCompanyName(noiseMap, c) : `Company ${c}`,
      robotIds: memberIds,
    };
    useLocaleStore.getState().addCompany(localeId, company);
    memberIds.forEach((id) => useLocaleStore.getState().updateRobot(localeId, id, { companyId: company.id }));
  }
}
```

```typescript
// worldTransition.ts — the one call-site change
if (locale.robots.length === 0) {
  spawnInitialRoster(localeId);
  spawnInitialCompanies(localeId);   // NEW — same guard, right after the roster exists
  const freshRobots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
  freshRobots
    .filter((r) => r.docking === DockingState.Active)
    .forEach((r) => assignJob(localeId, r.id));
}
```

* **Naming Conventions:** `src/components/company/` is a new flat directory, PascalCase files,
  matching every other `src/components/*/` directory's convention. `companyConfig.ts` follows
  `robotSelectionConfig.ts`'s naming (`*Config.ts`, `UPPER_SNAKE`/`SCREAMING_SNAKE` exported
  constants). `robotOptionsActions.ts`/`companyOptions.ts` are plain camelCase function-export
  modules, matching `regenerateMelody.ts`'s shape (one focused responsibility per file, no default
  export).
* **Formatting:** Match each touched file's existing comment-banner style; no new convention.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library, real Zustand stores (not deep-mocked) — matching
  every existing Robot Options test file's pattern: seed `useLocaleStore`/`useUIStore` directly,
  spy on `updateRobot`/`updateCompany`/`AudioEngine` methods, assert on rendered DOM by accessible
  name/role.
* **Test File Location:** Colocate (see § 2 for exact files).
* **`Company.test.ts` (new):** type-level smoke test only (matches `controls.test.ts`'s style for
  pure type files) — a `CompanyOptionsSnapshot` with every field omitted, and one with every field
  present, both type-check as valid.
* **`controls.test.ts` (modified):** `CONTROL_SCHEMA_TYPES` has exactly 14 entries, `'select'`
  included, still no duplicates.
* **`localeStore.test.ts` (new cases):**
  1. `addCompany`/`updateCompany`/`getCompanyById` round-trip, mirroring `addRobot`/`updateRobot`/
     `getRobotById`'s existing test shape.
  2. `removeCompany` clears `companyId` on every former member and removes the company from
     `locale.companies`.
  3. `removeLocale` on a locale with companies doesn't throw (companies have no `AudioEngine`
     state to release, unlike robots — this is a defensive regression guard, not new cleanup
     logic).
  4. `assignRobotToCompany` moves a robot from company A to company B: A's `robotIds` no longer
     contains it, B's does, robot's `companyId` is B's id.
  5. `assignRobotToCompany(..., null)` moves a robot to Freelance: its old company's `robotIds` no
     longer contains it, `companyId` is `undefined`.
  6. `getCompanyMembers` returns exactly the robots whose `companyId` matches.
* **`uiStore.test.ts` (new cases):** `selectCompany` sets `selectedCompanyId` independent of
  `selectedRobotId`; default is `null`.
* **`companyOptions.test.ts` (new):**
  1. With `company.lastEditedOptions` undefined, every resolved field equals `firstMember`'s
     current value (or its documented default, e.g. `audioMode` falls back to `'none'`).
  2. With `company.lastEditedOptions` partially populated (e.g. only `masterVolume` set), the
     resolved snapshot uses the recorded `masterVolume` but still falls back to `firstMember` for
     every other field.
  3. `firstMember`'s own live changes after a company snapshot exists are reflected for any field
     the company snapshot doesn't cover (never frozen at "whenever the company was first
     selected").
* **`robotOptionsActions.test.ts` (new):** one test per exported `applyX`, each a like-for-like
  port of that field's existing assertion in `RobotDisplaySection.test.tsx`/
  `PingControlsDrawer.test.tsx`/`PingContourDrawer.test.tsx`/`SignatureArrayDrawer.test.tsx` today
  — same store spy, same `AudioEngine`/`lfoEngine`/`regenerateMelody` call assertions, just called
  directly instead of through a rendered component.
* **`spawnSystem.test.ts` (modified):**
  1. `spawnInitialCompanies` produces 2-3 companies.
  2. Each company has 3-4 members.
  3. No robot ID appears in more than one company's `robotIds` (disjoint membership).
  4. At least one robot is left Freelance in the common case (not asserted as guaranteed every
     single run, since `COMPANY_SIZE_MAX * INITIAL_COMPANIES_MAX` can reach `MAX_ROBOTS` — assert
     the *distribution*, not a hard 100%-of-runs guarantee).
  5. Same seed (same locale coordinates) → identical company count, membership, and names across
     two independent `spawnInitialCompanies` runs — mirrors `spawnInitialRoster`'s existing
     determinism test almost verbatim.
* **`worldTransition.test.ts` (modified):** `initializeLocale` populates `locale.companies` the
  first time it runs against an empty locale; calling it again against an already-populated locale
  is a no-op for companies (same guard robots already rely on).
* **`Select.test.tsx` (new):** renders all `schema.options` as items; selecting one calls
  `onChange` with that option's `value`; `disabled` prevents interaction; accessible name resolves
  per `resolveAccessibleName` (matching `RadioButton.test.tsx`'s existing coverage shape).
* **`AudioSettingSection.test.tsx` (new):** ported from `RobotDisplaySection.test.tsx`'s existing
  Audio Setting/Volume/Volume-LFO assertions, now driven through `value`/`on*Change` props instead
  of a seeded `robot`.
* **`PingControlsDrawer.test.tsx`/`PingContourDrawer.test.tsx`/`SignatureArrayDrawer.test.tsx`
  (modified):** same assertions as today, re-pointed at the new prop contract — render with an
  explicit `value` and spy `onChange`/`on*Change` props directly, rather than seeding a `robot` in
  the store and spying on `updateRobot`. Add one new case each: `disabled` renders every internal
  control disabled and (where applicable) suppresses `onResetMelody`'s button entirely when the
  prop is omitted (`PingControlsDrawer` only).
* **`RobotOptionsTab`-adjacent regression:** `RobotDisplaySection.test.tsx` gains a case
  confirming it still renders read-only Name/Job/Battery/Docking correctly and now also a company
  `Select` defaulting to "Freelance" for an unassigned robot.
* **`RobotSelectionCard.test.tsx` (modified):** new case — company `Select` renders, selecting an
  option calls `assignRobotToCompany`.
* **`CompanyManager.test.tsx`/`CompanyButtonRow.test.tsx`/`CompanyCrudControls.test.tsx`/
  `CompanyOptionsSection.test.tsx` (new):**
  1. `CompanyButtonRow` renders one button per company plus "None"; clicking calls `selectCompany`.
  2. `CompanyCrudControls`'s Create button is disabled at `MAX_COMPANIES`; confirms a generated
     name pre-fills the `TextInput`, editable before confirming; Delete calls `removeCompany` then
     `selectCompany(null)`.
  3. `CompanyOptionsSection` renders every section `disabled` with no bound value when
     `selectedCompanyId` is `null`.
  4. `CompanyOptionsSection` with a company selected: editing one field (e.g. Volume) calls the
     matching `applyX` once per member robot (asserted via `AudioEngine.updateRobotMasterVolume`
     call count === member count) and patches `company.lastEditedOptions` via `updateCompany` —
     regression guard for "only the touched field, once per member, not a bulk write."
  5. Re-selecting a company after editing it, then selecting a different company, then
     re-selecting the first: the panel shows the first company's last-edited values, not
     `firstMember`'s possibly-since-drifted live values — regression guard for the "sticky memory"
     behavior confirmed in the intent doc.
  6. Editing an individual member robot's value afterward (via `RobotOptionsTab`, simulated
     directly through `applyVolume`) does not change the company's `lastEditedOptions` and is not
     reverted on the next company-panel render — regression guard for "broadcast, not link."
* **`RobotsTab.test.tsx` (modified):** `CompanyManager` renders beneath the robot card list.
* **`Robot.test.tsx` (modified):** `isCompanyMember` class applies when `robot.companyId ===
  selectedCompanyId` and `selectedCompanyId !== null`; does not apply when `selectedCompanyId` is
  `null`, even for a robot with a `companyId`.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including every modified drawer test file.
  4. `npm run build` — production bundle builds cleanly.
  5. Manual check (`npm run dev`): confirm a fresh locale loads with 2-3 companies already
     populated and some robots Freelance; select a company, confirm its members' cards highlight
     and glow in the world view and the options panel populates from the first member; edit
     Volume, confirm every member's volume audibly changes; switch to "None," confirm the panel
     greys out; re-select the company, confirm the edited Volume value is still shown (not reset to
     any member's current value); edit one member individually via its own Robot Options screen,
     confirm the company's panel is unaffected; create, rename, and delete a company via the CRUD
     controls, confirming a deleted company's members show "Freelance" in both the list and Robot
     Options.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges
  manually.
* **Branch Convention:** `feature/companies` (matching `feature/robot-options`'s precedent).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences, roughly: (1) `Company.ts`/`Robot.ts`/`locale.ts`/`controls.ts` type changes + tests,
  (2) `constants/index.ts` additions, (3) `localeStore.ts` company actions + tests, (4)
  `uiStore.ts` `selectedCompanyId` + tests, (5) `Select.tsx`/`.css` + test, (6)
  `robotOptionsActions.ts` extraction + tests, (7) `companyOptions.ts` + tests, (8)
  `spawnSystem.ts`/`worldTransition.ts` company generation + tests, (9)
  `AudioSettingSection.tsx`/`.css` extraction + `RobotDisplaySection.tsx` update + tests, (10)
  `PingControlsDrawer.tsx`/`PingContourDrawer.tsx`/`SignatureArrayDrawer.tsx` prop-contract
  refactor + `RobotOptionsTab.tsx` wiring update + tests, (11) `companyConfig.ts` + test, (12)
  `CompanyButtonRow`/`CompanyCrudControls`/`CompanyOptionsSection`/`CompanyManager` + tests, (13)
  `RobotsTab.tsx`/`RobotSelectionCard.tsx`/`Robot.tsx` wiring + tests, (14) doc updates
  (`COMPONENT_LIBRARY.md`, `COMPANIES.md`, `UI_SHELL.md`, `CLAUDE.md`, `roadmap.md`) last.

---

## 7. Open Questions & Risks

Resolved during this spec's own drafting (not carried forward as open) — kept as a decision record
so Plan/Tasks, and anyone reading this spec later, has the "why," not just the "what":

1. **`CompanyOptionsSnapshot` is a `Partial`-shaped per-field merge, not a full clone seeded at
   first edit.** The confirmed intent doc says a company's panel "revert[s] to the last state it
   was in when last editing... or, if it hasn't been used yet, the options of the first robot."
   Read literally, that's two branches. Implemented as `resolveCompanyOptions`'s field-by-field
   `{ ...fromFirstMember, ...company.lastEditedOptions }` merge, the same two outcomes fall out
   automatically — no field ever touched means the whole object equals `fromFirstMember`; a field
   touched once and never again keeps that recorded value forever after, even if the first member
   later drifts. Functionally identical to a literal first-edit clone from the user's perspective,
   simpler to implement and reason about, and avoids ever storing a stale duplicate of fields the
   company was never actually edited for.
2. **Company mode reuses the existing four drawer *components* (refactored to a `value`/`onChange`
   contract), not four new parallel company-specific components.** The roadmap's original "About"
   prose said company mode "reus[es] the same `RobotDisplaySection`/`PingControlsDrawer`/
   `PingContourDrawer`/`SignatureArrayDrawer` primitives" — read literally that could mean
   re-mounting those exact robot-shaped components with a synthesized fake `Robot`. Rejected:
   `RobotDisplaySection` also renders read-only Name/Job/Battery/Docking rows that have no
   company-scoped meaning at all (already explicitly out-of-scope per the intent doc), and
   synthesizing a fake `Robot` object just to satisfy a prop type is exactly the kind of
   shape-forcing this codebase avoids elsewhere. The `value`/`onChange` refactor (§ 1, § 4) is what
   "reuse the primitives" actually means here — same rendered JSX and schemas, genuinely
   robot-agnostic props.
3. **Company names pull from a new `COMPANY_NOUNS` list, not the same `NOUNS` array robot names
   use.** The confirmed intent doc says company naming follows "the same deterministic
   adjective/noun word-list pattern robot names already use" — read as literally sharing both
   arrays, a company and a robot could generate the identical name (e.g. both "Iron Drifter"),
   confusing in a UI where both appear together (company button row sits directly above robot
   cards carrying their own names). Resolved by reusing `ADJECTIVES` (the shared "sounds like this
   universe" half) paired with a new, org-flavored `COMPANY_NOUNS` list — same generation
   *mechanism*, visually distinct *output*.
4. **`MAX_COMPANIES` (6) is enforced only by `CompanyCrudControls`' Create button being disabled at
   the cap — not by `localeStore.addCompany` itself refusing a 7th company.** Consistent with how
   `updateRobot`'s clamping lives in the store (a data-integrity concern) while `MAX_ROBOTS` itself
   is never store-enforced (the roster is simply never asked to exceed it) — `MAX_COMPANIES` is a
   UI-level constraint on the one place companies get created after spawn, not a store invariant.
   `spawnInitialCompanies` also never approaches the cap (2-3, well under 6), so there's no
   spawn-time path that could violate it either.
5. **Radix Select's empty-string restriction is called out explicitly (§ 3, § 4)** because it's the
   one place this phase's design would silently misbehave if implemented the "obvious" way
   (`companyId ?? ''` as the Select's value/sentinel) — worth flagging in the spec rather than
   discovering it as a thrown dev warning mid-implementation.
