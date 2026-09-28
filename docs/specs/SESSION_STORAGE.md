# Phase Spec: Session Storage

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/session-storage.md](../intent/session-storage.md), confirmed via `interview-me` 2026-09-27. Roadmap [Phase 20](../todo/roadmap.md#20-session-storage). **This spec supersedes `docs/SESSION_STORAGE.md` in several load-bearing ways** — that file describes a single boot-autoloaded slot with URL sharing built in; this feature is deliberately narrower (local-only, manual save/load, multi-slot autosave) and `docs/SESSION_STORAGE.md` should be rewritten from this spec once implemented, not reconciled against as prior ground truth. Status: not yet implemented — Specify phase, pending Crawford's review before Plan.

---

## 1. Overview & Claude Explanation

We're adding local session save/load to Trace Atlas: a new "Sessions" accordion — third and last in the Settings view's stack, after "Audio Profile" and "Audio Seeds" (`SettingsContent.tsx`'s `SETTINGS_LEAVES`) — containing one panel, "Load Sessions." That panel has a required "Session Name" text input (autopopulated with a word-list-generated name, same mechanism `spawnSystem.ts` uses for robot/company names) and a "Save Session" button above a list of load buttons, one per stored session.

A saved session is a **diff on top of a freshly regenerated world**, not a full snapshot: active seed and coordinates, Audio Rig FX settings, audio-relevant per-robot overrides (not job/docking/battery), robot and company names, and company membership. Saving under a name that already exists **overwrites** it — the name is the storage key, not a separate id; renaming before saving creates a new entry instead. Loading applies immediately, no confirmation. Deleting a named session requires confirmation via the same `AlertDialog` pattern `CompanyCrudControls.tsx` already uses.

A background autosave runs every 5 minutes regardless of user action, across **6 total slots**: 5 rotate FIFO as "Unsaved Session" checkpoints whenever no named session is currently the loaded one, and 1 dedicated "draft" slot activates only while a named session **is** loaded — capturing in-progress tweaks to it without ever touching the named entry itself, which stays frozen until the next explicit "Save Session" click. Both slot kinds appear in the same "Load Sessions" list as named saves.

**Nothing about today's boot behavior changes.** No session — named or autosaved — is ever auto-loaded on refresh or a fresh tab; `?seed=` (`main.tsx`) keeps working exactly as it does today, untouched by this feature. Getting back a session is always a deliberate click.

**Explicitly out of scope this phase:** URL-based sharing, `CompressionStream`/`DecompressionStream` serialization, and any cross-tab/shareable-link mechanism — tracked separately in [roadmap Phase 21](../todo/roadmap.md#21-sector-settings-shareable-link-importexport). Also out of scope: a "wipe everything" destructive reset, and any cap/eviction/delete affordance on the 6 autosave slots themselves (self-managing by construction).

### 1.1 Existing precedents this design reuses

- **`CompanyOptionsSnapshot` / `Company.lastEditedOptions`** (`src/types/Company.ts`) is the closest existing precedent for "a partial diff that only records touched fields" — but it exists for the company bulk-edit broadcast feature (`docs/COMPANIES.md`), not persistence, and isn't reused directly here (see §7, "Diff mechanism for robots" for why robots use a different approach).
- **Deterministic ids** — `generateRobotId`/`generateCompanyId` (`spawnSystem.ts`) — are the hard prerequisite this design leans on: a persisted diff can be matched back onto a regenerated roster by id.
- **The word-list naming mechanism** — `ADJECTIVES`/`COMPANY_NOUNS`-style generation in `spawnSystem.ts` — is reused verbatim for the Session Name input's autopopulated default.
- **`CompanyCrudControls.tsx`'s `AlertDialog`** usage is reused for session-delete confirmation, per `CLAUDE.md`'s existing-pattern-over-new-mechanism boundary.
- **`SettingsContent.tsx`'s `SETTINGS_LEAVES`/`AccordionContainer`** stacking pattern is what "Sessions" slots into — no new UI shell mechanism.
- **`debugParams.ts`/`seedUtils.ts`'s boot-time `URLSearchParams` read** confirms `?seed=` today is read synchronously at module load, independent of any store; this feature adds nothing to that path.

### 1.2 What gets persisted, precisely

| Category | Fields | Source |
|---|---|---|
| World | active seed, locale coordinates (x, y) | `attenuationStyleStore`/`localeStore` |
| Audio Rig FX | Compressor, EQ3, LPF, HPF, Delay, Reverb, Limiter (`GlobalAudioSettings`) | `audioStore.globalAudio` |
| Per-robot audio overrides | ADSR (`audioAttributes.adsr`), oscillator layers (`audioAttributes.layers`), filter cutoff a.k.a. "transducer pressure ratio" in UI lore copy (`audioAttributes.filterFreq`), rhythmic density, motif length, note variance, pitch repeat, octave range, robot LFO settings (`lfoSettings`) | `localeStore` robot records |
| Identity | robot `name`, company `name` | `localeStore` |
| Grouping | company `robotIds` (membership) | `localeStore` |

**Explicitly not persisted:** `audioMode` (solo/mute), `masterVolume`, job assignment, docking state, battery level/warning threshold, `clickTrackActive`, and all UI/layout state (open accordions, selected nav tab). See §7 for two fields (`masterVolume`, `audioMode`) that are arguably "audio" but weren't named in the interview — flagged there for explicit confirmation, not silently included.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── session.ts                        NEW — SessionPayload, RobotAudioOverrideDiff, CompanyDiff,
│                                          SessionEntry (name + payload + savedAt), AutosaveSlotId
├── utils/
│   ├── sessionDiff.ts                    NEW — PURE: computeRobotAudioOverrideDiff(liveRobot, seedBaseline),
│   │                                     computeCompanyDiff(liveCompany), buildSessionPayload(), 
│   │                                     applySessionPayload(payload) — regenerate-then-overlay
│   ├── sessionDiff.test.ts               NEW
│   ├── sessionStorageEngine.ts           NEW — localStorage read/write for the whole sessions collection
│   │                                     (named entries + 6 autosave slots) under one namespaced key;
│   │                                     save/overwrite-by-name, delete, list, get-slot, set-slot
│   └── sessionStorageEngine.test.ts      NEW
├── systems/
│   ├── sessionAutosave.ts                NEW — startSessionAutosave()/stopSessionAutosave() (module-singleton
│   │                                     pair, mirrors startAudioBudget/startRobotLifecycle); 5-minute
│   │                                     setInterval; decides rotating-5 vs draft-slot-6 by reading
│   │                                     sessionStore.currentLoadedSessionName
│   ├── sessionAutosave.test.ts           NEW
│   └── spawnSystem.ts                    MODIFIED — extract pure per-robot seed-baseline generation
│                                         (already-exported generateAudioAttributes/generateRobotLfoSettings
│                                         plus the inline rhythmicDensity/rhythmicMotifLength/noteVariance/
│                                         pitchRepeat locals in spawnRobot) into a function callable without
│                                         a live store write, reused by sessionDiff.ts for baseline comparison
├── stores/
│   └── sessionStore.ts                   NEW — currentSessionName (Session Name input value) and
│                                         currentLoadedSessionName (string | null — which named session,
│                                         if any, is currently loaded; drives the draft-slot vs rotating-5
│                                         choice). Both plain serializable state, neither itself persisted.
├── components/panels/screen/console/
│   ├── SessionsPanel.tsx                 NEW — "Load Sessions" panel: Session Name input + Save Session
│   │                                     button + session list
│   ├── SessionsPanel.test.tsx            NEW
│   ├── SessionListItem.tsx               NEW — one row: label, Load button, Delete button (+ AlertDialog,
│   │                                     named entries only)
│   └── SessionListItem.test.tsx          NEW
├── components/panels/screen/nav/content/
│   └── SettingsContent.tsx               MODIFIED — add 'sessions' to SETTINGS_LEAVES (third/last) and its
│                                         AccordionSchema entry
└── data/
    └── navTreeConfig.ts                  MODIFIED — settings.sessions leaf (id/humanLabel), mirroring
                                          settings.quality/settings.sectorSettings
docs/
├── SESSION_STORAGE.md                    REWRITTEN post-implementation from this spec
├── UI_SHELL.md                           MODIFIED — Sessions section noted alongside Audio Profile/Audio Seeds
└── todo/roadmap.md                       MODIFIED — Phase 20 status
```

No new dependency. Nothing removed.

---

## 3. Implementation Boundaries & Constraints

Non-negotiable, from `CLAUDE.md` (re-checked for this change):

- **No Tone synths in components.** `SessionsPanel`/`SessionListItem` only read/write `sessionStore` and call `sessionStorageEngine`/`sessionDiff`; applying a loaded session goes through existing store setters (`audioStore.setGlobalAudio`, `localeStore` robot/company updates) exactly as a user's own edits would, never a new direct `AudioEngine` call.
- **State stays JSON-serializable, no runtime objects in Zustand.** `sessionStore`'s two fields (`currentSessionName: string`, `currentLoadedSessionName: string | null`) qualify. `SessionPayload`/`SessionEntry` (the persisted shape) are plain data too — this whole feature adds no timelines, refs, or synth instances to any store.
- **The 5-minute autosave is a plain `setInterval`, not a debounced `subscribe()`.** This is a deliberate departure from the original `docs/SESSION_STORAGE.md` design (which called for a debounced store listener) and is **not** a `CLAUDE.md` guardrail violation: the "no `setTimeout`/`setInterval`/`requestAnimationFrame` for musical timing" rule scopes to audio scheduling and animation, not an unrelated background persistence tick. Confirm this reasoning holds during review — flagged explicitly since it reverses a documented prior decision.
- **No GSAP involved.** Nothing in this feature animates; if a future pass wants a save/load transition, it must go through `timelineMap` like everything else, but nothing here requires it.
- **UI shell:** `SessionsPanel` lives inside `ScreenViewport`'s Settings content (via `SettingsContent.tsx`), never `SleeveContainer`.
- **Melodies untouched.** Loading a session regenerates melodies from the seed exactly as any locale/seed change does today; nothing here stores or replays literal melody data.

**Ask first** (per `CLAUDE.md`): none anticipated — no new dependency (plain `localStorage` + `JSON.stringify`/`parse`, no compression); no change to audio/animation architecture beyond the explicitly-flagged `setInterval` reasoning above.
**Never:** persist job assignment, docking state, battery level/threshold, or UI/layout state; auto-load any session (named or autosaved) on boot under any circumstance; let autosave write to a named entry (only the draft slot may shadow one, per §1); key a named session by anything other than its name.

---

## 4. Code Style & Architecture Conventions

### 4.1 Types (`src/types/session.ts`)

```typescript
export interface RobotAudioOverrideDiff {
  adsr?: ADSREnvelope;
  layers?: OscillatorLayer[];
  filterFreq?: number;
  rhythmicDensity?: number;
  rhythmicMotifLength?: { active: boolean; value: number };
  noteVariance?: { active: boolean; value: number };
  pitchRepeat?: number;
  octaveRange?: [number, number];
  lfoSettings?: Partial<Record<RobotLfoTargetId, LfoSettings>>;
  name?: string;
}

export interface CompanyDiff {
  name?: string;
  robotIds?: string[];
}

export interface SessionPayload {
  /** Payload schema version, independent of sessionStorageEngine.ts's own storage-key version
   *  (§4.3's `.v1` suffix, which only versions the local blob). This field travels WITH the
   *  payload — the only version marker still present once a payload is exported/imported outside
   *  this browser (roadmap Phase 21, which depends on this phase). Unused by this phase's own
   *  code (nothing reads or branches on it yet); it exists purely so Phase 21's importer has a
   *  way to distinguish payload shapes later, which is not retrofittable after sessions already
   *  exist without it. */
  version: 1;
  /** Renamed from "seed" after implementation discovery: this codebase has no literal "seed"
   *  field. Locale/robot generation keys off {x, y} alone (noiseMaps.ts's getLocaleNoiseMap);
   *  Audio Rig/global-LFO generation keys off the Attenuation Style's NAME alone
   *  (deriveAttenuationStyleSeed) — its id is a random bookkeeping value, never a seed input.
   *  Maps directly onto worldTransition.ts's existing retransmitWorld({ attenuationStyleName,
   *  coordinates }) entry point. */
  attenuationStyleName: string;
  coordinates: { x: number; y: number };
  globalAudio: GlobalAudioSettings;
  robotOverrides: Record<string /* robot id */, RobotAudioOverrideDiff>;
  companyDiffs: Record<string /* company id (spawn-generated) or crypto.randomUUID() (user-created) */, CompanyDiff>;
  userCreatedCompanies: Company[]; // full objects — no seed to regenerate from, same as docs/SESSION_STORAGE.md's original treatment
}

export interface SessionEntry {
  name: string;           // the storage key
  savedAt: number;        // epoch ms, for display/sort
  payload: SessionPayload;
}

export type AutosaveSlotId = `unsaved-${0 | 1 | 2 | 3 | 4}` | 'draft';
```

### 4.2 The pure diff core (`src/utils/sessionDiff.ts`)

Mirrors `AUDIO_LOAD_BUDGET.md`'s "pure core, thin shells" split (`audioBudget.ts`/`audioHealth.ts`): every decision is a pure, independently tested function.

```typescript
/** What the seed alone would have produced for this robot — no live store read, no side effect.
 *  Built from spawnSystem.ts's extracted baseline generator (§2's spawnSystem.ts refactor). */
export function computeRobotSeedBaseline(noiseMap: NoiseFunction2D, offset: number): RobotAudioOverrideDiff;

/** Field-by-field comparison — only fields that differ from the seed baseline are included.
 *  A robot the user never touched round-trips to an empty object. */
export function computeRobotAudioOverrideDiff(
  live: Robot,
  baseline: RobotAudioOverrideDiff,
): RobotAudioOverrideDiff;

/** Company membership/name diff — a company with an empty roster diff vs. its spawn defaults
 *  round-trips to {}. User-created companies (no seed) are never passed here — see buildSessionPayload. */
export function computeCompanyDiff(live: Company, spawnDefault: Pick<Company, 'name' | 'robotIds'>): CompanyDiff;

/** Assembles a full SessionPayload from current store state, stamped with version: 1. */
export function buildSessionPayload(): SessionPayload;

/** Regenerates the world from payload.attenuationStyleName/coordinates (via worldTransition.ts's retransmitWorld),
 *  then overlays globalAudio, robotOverrides, companyDiffs, and userCreatedCompanies on top —
 *  "diff on top of a regenerated roster," per docs/SESSION_STORAGE.md's original phrasing. */
export function applySessionPayload(payload: SessionPayload): void;
```

### 4.3 The storage engine (`src/utils/sessionStorageEngine.ts`)

```typescript
const STORAGE_KEY = 'trace-atlas.sessions.v1'; // versioned — a schema change bumps this, old key left alone

interface SessionsStorageShape {
  named: Record<string, SessionEntry>;              // keyed by name — save-by-name overwrite semantics
  autosave: Partial<Record<AutosaveSlotId, SessionEntry>>;
  nextUnsavedSlot: 0 | 1 | 2 | 3 | 4;                // FIFO write cursor for the 5 rotating slots
}

export function saveNamedSession(name: string, payload: SessionPayload): void;   // overwrites if name exists
export function saveAutosaveSlot(slotId: AutosaveSlotId, payload: SessionPayload): void;
export function deleteNamedSession(name: string): void;
export function listSessions(): SessionEntry[];      // named entries + populated autosave slots, for the UI list
export function loadSession(name: string): SessionPayload | undefined;
```

Malformed/missing `localStorage` data (corrupted JSON, a future schema mismatch) fails soft — `listSessions()` returns `[]`, `loadSession()` returns `undefined` — never throws into the render path, matching this codebase's `swallow`/`devWarn` convention (`src/utils/helpers.ts`).

### 4.4 The autosave system (`src/systems/sessionAutosave.ts`)

```typescript
export function startSessionAutosave(): void;  // idempotent, module-singleton — mirrors startAudioBudget()
export function stopSessionAutosave(): void;
```

On each 5-minute tick: read `sessionStore.getState().currentLoadedSessionName`. If `null`, build the payload and write it to the next slot in the 5-slot FIFO rotation (`sessionStorageEngine.saveAutosaveSlot`, advancing `nextUnsavedSlot`). If non-null, write to the single `'draft'` slot instead — never touching `named[currentLoadedSessionName]`. Started once at app boot (`main.tsx`, alongside `startAudioBudget()`), never torn down by a power cycle — persistence isn't audio-session-scoped.

### 4.5 The UI (`SessionsPanel.tsx`)

Follows `SettingsContent.tsx`'s existing per-leaf pattern: a fourth `AccordionSchema` entry (`{ id: 'settings.sessions', type: 'accordion', humanLabel: 'Sessions' }`) appended to `SETTINGS_LEAVES`/`SETTINGS_ACCORDION_SCHEMAS`, rendering `<SessionsPanel />` from `renderLeafContent`. Inside: a labeled text input (`Session Name`, defaulting to a freshly generated word-list name on mount, matching `CompanyCrudControls.tsx`'s naming convention) and a "Save Session" button above a list of `SessionListItem` rows (one per `listSessions()` entry, autosave slots and named saves interleaved by `savedAt`). Each row: a label (the session's name, or a fixed display label like "Unsaved Session" for autosave slots — exact copy left to implementation), a "Load" button (calls `applySessionPayload`, sets `sessionStore.currentLoadedSessionName` for named entries, clears it to `null` for autosave-slot loads), and — named entries only — a "Delete" button behind an `AlertDialog` confirm, matching `CompanyCrudControls.tsx`.

### 4.6 Naming and conventions

`SessionPayload`, `SessionEntry`, `AutosaveSlotId`, `currentLoadedSessionName`, "Unsaved Session" (user-facing autosave label). Section-header comment blocks (`// ====`) and `IMPORTS/TYPES/FUNCTIONS` layout, matching `audioStore.ts`/`debugParams.ts`. Plain named function component exports, explicit prop interfaces, co-located CSS per `docs/specs/SPEC_TEMPLATE.md`'s established style.

---

## 5. Testing & Verification Requirements

### 5.1 Framework and location

Vitest + Testing Library, co-located `*.test.ts(x)`. Pure diff/storage logic first (TDD), then the autosave system with real stores, then UI.

### 5.2 New tests

- **`sessionDiff.test.ts`** — `computeRobotAudioOverrideDiff` returns `{}` for an untouched robot; returns only the touched field(s) when one differs from baseline; `buildSessionPayload`/`applySessionPayload` round-trip (save, mutate live state, load, confirm original values restored); `applySessionPayload` never restores job assignment/docking/battery (regression guard for the explicit non-goal); user-created companies round-trip as full objects, spawn-generated companies as diffs.
- **`sessionStorageEngine.test.ts`** — save-by-name overwrites an existing entry in place (not a duplicate); a different name creates a new entry; the 5 autosave slots rotate FIFO (6th write evicts slot 0); the draft slot is single and gets overwritten on repeat writes; `deleteNamedSession` removes only the named entry, never an autosave slot; malformed `localStorage` JSON fails soft (`listSessions()` → `[]`, no throw).
- **`sessionAutosave.test.ts`** — with `currentLoadedSessionName: null`, five consecutive ticks populate all 5 rotating slots, a sixth overwrites the oldest; with a named session loaded, ticks only ever write the `'draft'` slot and never touch that name's entry in `named`; switching to a different loaded named session overwrites the same draft slot rather than creating a second one; idempotent start/stop.
- **`SessionsPanel.test.tsx`** — the Session Name input is prefilled with a generated (non-empty) name on mount; Save writes under the current input value and the list re-renders with it; saving again under the same name updates the existing row rather than adding a new one; Load applies immediately with no confirmation; Delete opens an `AlertDialog` and only removes the entry on confirm.
- **`SettingsContent.test.tsx`** (existing file, extended) — "Sessions" renders as the third/last accordion, after "Audio Profile" and "Audio Seeds".
- **Boot regression** — an existing or new test confirms a fresh app load never calls `applySessionPayload`/`loadSession`, and that `?seed=` behavior (`seedUtils.test.ts`/`main.tsx`-adjacent coverage) is unaffected.

### 5.3 Success criteria

1. Saving under an existing name overwrites it in place; a new name creates a new list entry. (deterministic, unit-tested)
2. An untouched robot's diff is `{}` after a full save/regenerate/load round trip — no spurious overrides accumulate. (deterministic, unit-tested)
3. Loading a session never changes job assignment, docking state, battery level, or any UI/layout state. (deterministic, unit-tested — explicit non-goal regression guard)
4. Across any sequence of autosave ticks, at most 5 "Unsaved Session" entries and at most 1 draft entry ever exist in storage; named entries are never touched by autosave. (deterministic, unit-tested)
5. A fresh page load / refresh never auto-loads any session, with or without `?seed=` present. (deterministic, unit-tested — regression guard for the "boot behavior unchanged" requirement)
6. `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
7. Manual check: the Sessions accordion appears in the right place, the input is never blank, Save/Load/Delete all behave as described, and a saved session survives an actual browser refresh when reloaded by hand.

### 5.4 Verification order

`npm run build:types` → `npm run lint` → `npm test` → `npm run build` → manual check in `npm run dev`.

---

## 6. Documentation & Git/Workflow Context

- **Docs to update:** `docs/SESSION_STORAGE.md` (rewritten post-implementation to describe the shipped design, not the original single-slot/URL-inclusive one), `docs/UI_SHELL.md` (Sessions section in the Settings view), `docs/todo/roadmap.md` (Phase 20 status).
- **Branch:** `feature/session-storage` (current branch).
- **Commits:** one per task, tests with their code; attribution per this session's rules. **PR:** references this spec; reviewed by another contributor per `CLAUDE.md`.
- **Sequencing:** independent of the rest of the roadmap's open items. [Phase 21](../todo/roadmap.md#21-sector-settings-shareable-link-importexport) (shareable links) depends on this phase shipping first but is not part of it.

---

## 7. Open Questions & Risks

These are spec-author (Claude) decisions and assumptions made to keep the interview from expanding indefinitely — **flagged for Crawford's explicit confirmation before the Plan phase**, not silently baked in.

1. **`masterVolume` and `audioMode` (solo/mute) were never explicitly discussed in the interview.** They're arguably "audio-related" (the interview's stated inclusion criterion) but weren't named in either the original `docs/SESSION_STORAGE.md` list or the interview's confirmed field list. This spec **excludes** both, on the reasoning that `audioMode` is closer to a runtime/session-scoped toggle (like the excluded lifecycle fields) than a deliberate tuning choice, and `masterVolume` is a live per-robot fader more analogous to the global Header volume slider (already documented as "never persisted across sessions"). **Confirm or correct.**
2. **Diff mechanism for robots: structural comparison against a regenerated seed baseline, not a tracked field.** Unlike `Company.lastEditedOptions` (which is incrementally written by the company bulk-edit UI), individual robots have no existing "what did the user touch" tracker — `robotOptionsActions.ts` mutates `Robot` fields directly. Two options were considered:
   - **(Chosen) Compute the diff at save time** by regenerating the robot's seed-only baseline values (via a small `spawnSystem.ts` refactor exposing the per-robot generation logic without a store write) and comparing field-by-field. Pros: zero changes to the hot edit path in `robotOptionsActions.ts`, pure and easily testable, no new field on `Robot`. Con: requires `spawnSystem.ts`'s inline `spawnRhythmicDensity`/etc. locals to be extracted into a reusable pure function.
   - **(Not chosen) Add a `Robot.lastEditedOptions`-style tracked field**, mirroring `Company`'s mechanism, populated incrementally by every `robotOptionsActions.ts` write path. More invasive (touches every edit call site), but avoids the `spawnSystem.ts` refactor and would double as reusable state for any future feature wanting "what did the user actually change" (e.g. a per-robot reset-to-default button).
   **Confirm the chosen approach, or prefer the tracked-field alternative.**
3. **"Transducer pressure ratio"** (named in the intent doc, carried over from `docs/SESSION_STORAGE.md`'s original list) is assumed to map to `AudioAttributes.filterFreq` — the only per-robot filter-cutoff-shaped field in `Robot.ts`. Not verified against the actual UI label in `RobotOptionsTab.tsx`; confirm during Plan/Tasks.
4. **Exact `localStorage` schema** (§4.3's `SessionsStorageShape`) — one namespaced key holding everything vs. one key per session — is a first-pass proposal, not load-bearing to the interview's confirmed behavior. Revisit if `localStorage`'s ~5–10MB practical limit becomes a concern with many named sessions (unlikely given the payload is a diff, not a snapshot, but not measured).
5. **Autosave slot display labels** ("Unsaved Session" vs. something using the word-list generator) weren't specified in the interview beyond "the last 'unsaved' session" — left as an implementation-level copy decision for the Tasks phase.
6. **Risk: the `spawnSystem.ts` refactor (item 2) touches code the recent `TEST_COVERAGE_CORE_MODULES` pass just finished covering.** Mitigation: extract without changing `spawnRobot`'s existing observable behavior, and re-run the full suite after the refactor before building diffing on top of it.
7. **Risk: `applySessionPayload`'s "regenerate then overlay" must not reintroduce a duplicate-value bug of the class tracked in `docs/DUPLICATE_VALUE_AUDIT.md`.** Mitigation: route regeneration through the existing `worldTransition.ts` entry point rather than a new parallel regeneration path, so any future fix to that audit lands here automatically.
8. **Resolved during implementation (task breakdown, `docs/tasks/SESSION_STORAGE.md`):** `SessionPayload.seed` renamed to `attenuationStyleName` (§1.2/§4.1 updated above — this codebase has no literal "seed" field); company diffing needs its own pure `generateCompanyRosterBaseline` mirroring §4.1's robot one (`spawnInitialCompanies`'s membership loop is inline/store-coupled); company-membership reapplication must go through `localeStore.assignRobotToCompany` per affected robot, not a direct `robotIds` write, since `updateCompany` alone doesn't keep a member robot's own `companyId` in sync.
