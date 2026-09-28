# Phase Spec: Session Autosave History

> **Status: cut. Do not implement.** This spec was drafted from
> [docs/intent/archive/session-autosave-history.md](../intent/archive/session-autosave-history.md),
> then the underlying work was reverted at Crawford's call as too complicated for v1 — see
> [docs/intent/session-autosave-removal.md](../intent/session-autosave-removal.md). Sessions go back
> to plain manual CRUD with no autosave at all. This doc is kept as a historical record only.

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/archive/session-autosave-history.md](../../intent/archive/session-autosave-history.md), confirmed via `interview-me` 2026-09-28. Amends roadmap [Phase 20](../todo/roadmap.md#20-session-storage) (shipped) — this is not a new independent feature, it restructures that phase's autosave mechanism and reverses one of its later UI additions. **This spec supersedes `docs/SESSION_STORAGE.md`'s "The 6-Slot Autosave" section and `docs/specs/SESSION_STORAGE.md` §4.4/§4.5's Update-button description** in several load-bearing ways — see §7 for the full list of what's reversed vs. what's new. Status: not yet implemented — Specify phase, pending Crawford's review before Plan.

---

## 1. Overview & Claude Explanation

Two changes to the shipped Sessions feature (`SessionsPanel.tsx`/`SessionListItem.tsx`):

**Revert: Load, not Update.** The currently-loaded named session's row no longer swaps its Load button for an "Update" button that silently overwrites the entry with live state. Every row — including the currently-loaded one — always shows Load, and Load always reapplies exactly what was last explicitly saved, discarding any live tweaks since. `UPDATE_SESSION_SCHEMA` (`sessionConfig.ts`) is removed as unused. Instead, the currently-loaded named session's row label changes to `` `${entry.name} Primary Save` `` — visual distinction only, not a different action.

**New: per-session autosave history, 3 deep.** The existing "5 rotating slots + 1 shared draft slot" autosave scheme (`docs/SESSION_STORAGE.md` §"The 6-Slot Autosave", `types/session.ts`'s `AutosaveSlotId`) is replaced by:
- **Per named session**, its own rotating FIFO of up to 3 autosaves, written to whenever that session is the currently-loaded one at autosave-tick time. Different named sessions each keep an independent history.
- **Two buckets for unsaved work** (no named session loaded), each *also* a FIFO of up to 3: a **"current"** bucket, written to on every autosave tick while nothing is loaded, and a **"last"** bucket, a frozen copy of whatever "current" held as of the *previous app boot*. Promotion (`current` → `last`, overwriting `last`, then clearing `current`) happens exactly once, at `startSessionAutosave()`'s first real call each boot — never mid-session, never on a named-session load/save.

**Display is drill-down, exclusive, and off by default.** No row's autosave history is visible on a fresh load/reload. A row's own history becomes visible only once the user has clicked Load on that specific row (or one of its own subrows) this browsing session; loading a different row hides it again. This applies to the currently-loaded named session (shows its own up-to-3 subrows, nested directly beneath it) and to the single visible unsaved-history row (see below) alike — never to a named session that isn't the currently-loaded one. Loading a subrow keeps its parent "current" (reverses today's code, where loading any autosave clears `currentLoadedSessionName` unconditionally) — this is a deliberate behavior change, see §7 item 3.

**The "current" unsaved bucket is never a row.** Only "last" ever appears in the list, as a single row (existing label convention: `` `${attenuationStyleName} @ (${x}, ${y})` `` derived from its own newest entry, suffixed `(Autosaved Session)`) — a summary/identity row for the bucket, not one specific autosave entry. Clicking its Load button applies the newest of its up-to-3 entries. Clicking it also reveals all of its own up-to-3 entries as subrows (each individually labeled and individually loadable), same drill-down rule as a named session.

**Timestamp formatting changes to date + time.** Both the new `` `Autosave from ${formattedTimestamp}` `` subrow label and the already-shipped `` `Saved ${sessionName} at ${formattedTimestamp}` `` save-confirmation banner (`SessionsPanel.tsx`) switch from time-only to date + time (e.g. `Sep 28, 2:14 PM`), via one new shared formatter.

### 1.1 Existing precedents this design reuses

- **`AlertDialog` destructive-confirm pattern** (`CompanyCrudControls.tsx`, already reused by `SessionListItem.tsx`/`SessionsPanel.tsx`) — unchanged, still gates every named-session Delete.
- **`SessionListItem.tsx` itself, reused recursively** for subrows (an `indented` prop drives a CSS modifier class) rather than a new component — keeping one row implementation for both tiers, per `CLAUDE.md`'s existing-pattern-over-new-mechanism boundary.
- **`sessionAutosave.ts`'s idempotent module-singleton start/stop shape** (mirroring `startAudioBudget()`) — unchanged; the boot-time promotion described above is added as one line inside the existing idempotency guard, not a new lifecycle mechanism.
- **`ScheduleWakeup`/timer precedent:** none needed — this still runs on the existing 5-minute `setInterval` (`SESSION_AUTOSAVE_INTERVAL_MS`), no new scheduling.

### 1.2 What's explicitly NOT changing

- The top-of-panel Session Name input and "Save Session" button (`SessionsPanel.tsx`'s `handleSave`) — still creates/overwrites a named entry by name, still does not itself mark that entry as loaded.
- "Clear Local Storage" — still wipes all of `localStorage` and resets `currentLoadedSessionName` to `null`; per §3, it must now also reset the new `viewingUnsavedHistory` flag (see §4.1) to `false`, since that flag is new state this phase introduces that Clear Local Storage's existing "reset everything session-related" contract implicitly covers.
- Boot behavior: no session — named, per-session-autosave, or unsaved-history — is ever auto-*loaded* on refresh. (The unsaved-bucket *promotion* described above is not a load: it moves stored data between two storage buckets without calling `applySessionPayload`.)
- The apply path itself (`applySessionPayload` → `worldTransition.ts`'s `retransmitWorld`, then overlay) — every tier of autosave and every named save applies through the exact same function, unchanged.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── session.ts                        MODIFIED — remove AutosaveSlotId / AUTOSAVE_ROTATING_SLOT_IDS /
│                                          isAutosaveSlotName (superseded); add AutosaveHistory (SessionEntry[],
│                                          length 0..3), MAX_AUTOSAVES_PER_SESSION, LAST_UNSAVED_SESSION_KEY
├── utils/
│   ├── sessionStorageEngine.ts           MODIFIED — SessionsStorageShape restructured (§4.3); named-session
│   │                                     autosave history keyed by name (cascade-deleted with the session),
│   │                                     two unsaved buckets replace the 5-slot+draft scheme, boot promotion
│   ├── sessionStorageEngine.test.ts      MODIFIED — new/changed cases per §5.2
│   └── helpers.ts                        MODIFIED — new formatSessionTimestamp(ms) date+time formatter,
│                                          shared by SessionsPanel.tsx and SessionListItem.tsx
├── systems/
│   ├── sessionAutosave.ts                MODIFIED — tick() writes to the loaded session's own history or the
│   │                                     unsaved "current" bucket (never a shared draft slot);
│   │                                     startSessionAutosave() promotes current→last once, inside the
│   │                                     existing idempotency guard
│   └── sessionAutosave.test.ts           MODIFIED — new/changed cases per §5.2
├── stores/
│   └── sessionStore.ts                   MODIFIED — add viewingUnsavedHistory: boolean +
│                                         setViewingUnsavedHistory(); setCurrentLoadedSessionName(name) with a
│                                         non-null name clears viewingUnsavedHistory (exclusivity, §4.1)
├── data/
│   └── sessionConfig.ts                  MODIFIED — remove UPDATE_SESSION_SCHEMA (unused after the Load revert)
└── components/panels/screen/console/
    ├── SessionsPanel.tsx                 MODIFIED — save-confirmation banner uses formatSessionTimestamp;
    │                                     top-level row list becomes named entries + the single "last unsaved"
    │                                     pseudo-row (if populated), sorted by savedAt as today
    ├── SessionsPanel.test.tsx            MODIFIED — new/changed cases per §5.2
    ├── SessionListItem.tsx               MODIFIED — Update branch removed; Primary Save label; indented prop;
    │                                     recursive subrow rendering gated on viewing-state (§1); Load
    │                                     semantics per §1 (subrow load keeps parent current)
    ├── SessionListItem.css                MODIFIED — indented-row modifier
    └── SessionListItem.test.tsx          MODIFIED — new/changed cases per §5.2
docs/
├── SESSION_STORAGE.md                    REWRITTEN post-implementation — "The 6-Slot Autosave" section replaced
├── UI_SHELL.md                           MODIFIED if any Sessions-panel-visible description needs updating
└── todo/roadmap.md                       MODIFIED — new sub-entry amending Phase 20 (see §6)
```

No new dependency. No new component file (subrows reuse `SessionListItem`).

---

## 3. Implementation Boundaries & Constraints

Non-negotiable, from `CLAUDE.md` (re-checked for this change):

- **No Tone synths in components.** Unchanged — `SessionsPanel`/`SessionListItem` still only read/write `sessionStore` and call `sessionStorageEngine`/`sessionDiff`; nothing here calls `AudioEngine` directly.
- **State stays JSON-serializable, no runtime objects in Zustand.** `sessionStore`'s new `viewingUnsavedHistory: boolean` qualifies trivially. The restructured `SessionsStorageShape` (§4.3) lives in `localStorage`, not a store, and remains plain data throughout.
- **The autosave tick stays a plain `setInterval`.** Unchanged from `docs/specs/SESSION_STORAGE.md`'s already-established, already-justified exception to the CLAUDE.md musical-timing guardrail (this is background persistence, not audio/animation scheduling) — this phase adds no new timer, just changes what one existing tick writes.
- **No GSAP involved.** Nothing here animates.
- **UI shell:** unchanged — everything stays inside `ScreenViewport`'s Settings content, never `SleeveContainer`.
- **Melodies untouched.** Unchanged — loading any tier of session still regenerates melodies from the seed via the existing apply path.

**Ask first** (per `CLAUDE.md`): none anticipated — no new dependency, no architecture change beyond the already-flagged reuse of the existing `setInterval`.
**Never:** let an autosave write silently overwrite a named entry's own manually-saved payload (only its *own* history bucket, never `named[name]` itself); auto-load or auto-expand any session/history on boot; exceed 3 entries in any single autosave history bucket; promote the unsaved "current" bucket into "last" anywhere other than the one boot-time call site.

---

## 4. Code Style & Architecture Conventions

### 4.1 Store (`src/stores/sessionStore.ts`)

```typescript
export interface SessionStore {
  currentSessionName: string;
  /** Which NAMED session, if any, is currently loaded — unchanged meaning from today. Drives
   *  sessionAutosave.ts's per-session-vs-unsaved-bucket choice, the "Primary Save" label, and
   *  that session's own subrow visibility. Setting this to a non-null value clears
   *  viewingUnsavedHistory (mutual exclusivity — only one row's history is ever expanded). */
  currentLoadedSessionName: string | null;
  /** True only once the single "last unsaved session" row has been Loaded this browsing session
   *  — purely a display flag for that row's own subrow visibility, never read by
   *  sessionAutosave.ts (autosave mode is decided by currentLoadedSessionName alone, per §1).
   *  Setting this true clears currentLoadedSessionName to null (same mutual exclusivity). */
  viewingUnsavedHistory: boolean;
  setCurrentSessionName: (name: string) => void;
  setCurrentLoadedSessionName: (name: string | null) => void;
  setViewingUnsavedHistory: (viewing: boolean) => void;
}
```

### 4.2 Types (`src/types/session.ts`)

```typescript
export const MAX_AUTOSAVES_PER_SESSION = 3;

/** 0 to MAX_AUTOSAVES_PER_SESSION entries. Storage order is not meaningful — always sort by
 *  savedAt (descending) for display, same convention SessionsPanel.tsx already uses for the
 *  top-level list. */
export type AutosaveHistory = SessionEntry[];

/** Stable React key / "which row is expanded" identifier for the single visible unsaved-history
 *  row — it has no user-given name (unlike a named session) so needs a sentinel distinct from
 *  any real session name. Never written to localStorage as a key into `named`. */
export const LAST_UNSAVED_SESSION_KEY = '__last-unsaved-session__';
```

`AutosaveSlotId`, `AUTOSAVE_ROTATING_SLOT_IDS`, and `isAutosaveSlotName` are removed — fully superseded by the per-session/bucket model below. Nothing else in `types/session.ts` changes.

### 4.3 The storage engine (`src/utils/sessionStorageEngine.ts`)

```typescript
interface SessionsStorageShape {
  named: Record<string, SessionEntry>;               // unchanged — manual saves, keyed by name
  namedAutosaves: Record<string, AutosaveHistory>;    // keyed by session name; deleteNamedSession cascades here
  unsavedCurrent: AutosaveHistory;                    // never surfaced to the UI directly
  unsavedLast: AutosaveHistory;                       // the one bucket listSessions() surfaces as a row
}

export function saveNamedSession(name: string, payload: SessionPayload): void;         // unchanged
export function deleteNamedSession(name: string): void;                                 // NOW also clears namedAutosaves[name] — see §7 item 1
export function listSessions(): SessionEntry[];                                         // named entries only now, sorted desc by savedAt
export function loadSession(name: string): SessionPayload | undefined;                  // named only now

export function saveNamedSessionAutosave(name: string, payload: SessionPayload): void;  // push+cap at MAX_AUTOSAVES_PER_SESSION; no-op if named[name] no longer exists (session deleted mid-tick)
export function listNamedSessionAutosaves(name: string): SessionEntry[];                // sorted desc by savedAt, [] if none

export function saveUnsavedAutosave(payload: SessionPayload): void;                     // push+cap into unsavedCurrent
export function promoteUnsavedHistoryOnBoot(): void;                                    // unsavedLast = unsavedCurrent; unsavedCurrent = []
export function listUnsavedLastAutosaves(): SessionEntry[];                             // sorted desc by savedAt, [] if none — [] means the row itself doesn't render
```

Malformed/missing `localStorage` data still fails soft on every read path — `listSessions()` → `[]`, `listNamedSessionAutosaves()`/`listUnsavedLastAutosaves()` → `[]`, `loadSession()` → `undefined` — matching the existing `readStorage()` fallback, unchanged in shape.

### 4.4 The autosave system (`src/systems/sessionAutosave.ts`)

```typescript
function tick(): void {
  const payload = buildSessionPayload();
  const loadedName = useSessionStore.getState().currentLoadedSessionName;
  if (loadedName !== null) {
    saveNamedSessionAutosave(loadedName, payload);
  } else {
    saveUnsavedAutosave(payload);
  }
}

export function startSessionAutosave(): void {
  if (intervalId !== null) return;
  promoteUnsavedHistoryOnBoot();       // once per real app boot, before the first tick can run
  intervalId = setInterval(tick, SESSION_AUTOSAVE_INTERVAL_MS);
}
```

`stopSessionAutosave()` is unchanged. Because `startSessionAutosave()`'s existing idempotency guard (`if (intervalId !== null) return`) already prevents a second call from doing anything, `promoteUnsavedHistoryOnBoot()` naturally runs exactly once per module lifetime (i.e. once per real page load, since `main.tsx` calls this once at boot) — no separate "have we promoted yet" flag needed.

### 4.5 The UI (`SessionListItem.tsx`, recursive for subrows)

```typescript
interface SessionListItemProps {
  entry: SessionEntry;
  /** Renders the indented-row CSS modifier and skips the Delete/AlertDialog affordance — a
   *  subrow's own lifecycle is entirely FIFO-managed (§3's "never exceed 3" rule), not
   *  individually deletable, per the intent doc's explicit out-of-scope call. */
  indented?: boolean;
  onChange?: () => void;
}
```

For a **named entry**: `isCurrentlyLoaded = entry.name === currentLoadedSessionName`. Label is `` `${entry.name} Primary Save` `` when `isCurrentlyLoaded`, else plain `entry.name`. Load always calls `applySessionPayload(entry.payload)` then `setCurrentLoadedSessionName(entry.name)` (never `handleUpdate`/`saveNamedSession` — that path is deleted). When `isCurrentlyLoaded`, render `listNamedSessionAutosaves(entry.name)` as `indented` `SessionListItem`s directly beneath it, each with its own label `` `Autosave from ${formatSessionTimestamp(subEntry.savedAt)}` `` and its own Load button that calls `applySessionPayload(subEntry.payload)` then `setCurrentLoadedSessionName(entry.name)` (the **parent's** name — this is the "stays loaded" behavior from §1/§7 item 3, not `null`).

For the **single unsaved-history row** (rendered by `SessionsPanel.tsx` only when `listUnsavedLastAutosaves()` is non-empty, using the newest entry for its label/payload): label is `` `${newest.payload.attenuationStyleName} @ (${newest.payload.coordinates.x}, ${newest.payload.coordinates.y}) (Autosaved Session)` ``, matching today's existing autosave-slot label convention. Load calls `applySessionPayload(newest.payload)`, then `setCurrentLoadedSessionName(null)` and `setViewingUnsavedHistory(true)`. When `viewingUnsavedHistory` is true, render all of `listUnsavedLastAutosaves()` (all up to 3, including the newest — it's a summary row, not one specific entry, so no de-duplication needed) as `indented` subrows, each labeled the same `` `Autosave from ${formatSessionTimestamp(...)}` `` way, each Load setting `currentLoadedSessionName: null` / `viewingUnsavedHistory: true` (stays "current" the same way a named subrow does).

### 4.6 Shared formatter (`src/utils/helpers.ts`)

```typescript
/** "Sep 28, 2:14 PM" — no year (autosave history is bounded to 3 entries per bucket, so a
 *  multi-year-old entry surviving is not a realistic case worth designing the format around). */
export function formatSessionTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
```

Reused by both `SessionsPanel.tsx`'s save-confirmation banner (replacing today's `toLocaleTimeString()`) and every autosave-subrow label in `SessionListItem.tsx`.

### 4.7 Naming and conventions

`AutosaveHistory`, `MAX_AUTOSAVES_PER_SESSION`, `LAST_UNSAVED_SESSION_KEY`, `viewingUnsavedHistory`, `formatSessionTimestamp` — new identifiers, chosen to read as extensions of the existing `SessionEntry`/`currentLoadedSessionName`/"Autosaved Session" vocabulary rather than a competing scheme. Section-header comment blocks (`// ====`) and `IMPORTS/TYPES/FUNCTIONS` layout preserved in every modified file, matching the existing style.

---

## 5. Testing & Verification Requirements

### 5.1 Framework and location

Vitest + Testing Library, co-located `*.test.ts(x)`, unchanged. Storage/autosave logic first (TDD), then UI.

### 5.2 New/changed tests

- **`sessionStorageEngine.test.ts`** — `saveNamedSessionAutosave` caps a session's own history at 3, evicting the oldest on a 4th write, and does not affect a different session's history; `deleteNamedSession` also clears that session's `namedAutosaves` entry (cascade); `saveUnsavedAutosave` caps `unsavedCurrent` at 3; `promoteUnsavedHistoryOnBoot` moves `unsavedCurrent` into `unsavedLast` (overwriting any prior `unsavedLast` content) and leaves `unsavedCurrent` empty; `listSessions()` no longer returns any autosave-shaped entries; malformed JSON still fails every read path soft.
- **`sessionAutosave.test.ts`** — with a named session loaded, five ticks leave exactly 3 entries in that session's own history (not the old shared draft slot); with nothing loaded, five ticks leave exactly 3 entries in `unsavedCurrent`, never touching any named session's history; `startSessionAutosave()` calls `promoteUnsavedHistoryOnBoot()` exactly once even if called twice in a row (idempotency guard covers it); switching which named session is loaded mid-run writes subsequent ticks into the newly-loaded session's own history, leaving the previous one untouched.
- **`SessionListItem.test.tsx`** — the currently-loaded named row always shows a "Load" button, never "Update" (regression guard for the revert); clicking it re-applies the saved payload and does not call `saveNamedSession`; the currently-loaded row's label reads `` `${name} Primary Save}` ``, a non-loaded row's label does not; the currently-loaded row renders up to 3 indented autosave subrows with `Autosave from …` labels; a non-loaded named row renders none, even if it has its own stored history; clicking Load on a subrow keeps the parent session "current" (`currentLoadedSessionName` still equals the parent's name afterward, not `null`) — regression guard for the reversed behavior; the unsaved-history row (when present) shows the existing `@ (x, y) (Autosaved Session)` label format and, once loaded, reveals its own up-to-3 subrows.
- **`SessionsPanel.test.tsx`** — the save-confirmation banner text uses the new date+time format (regex, not an exact string, since the format is locale-dependent); the unsaved-history row only appears when `listUnsavedLastAutosaves()` is non-empty; nothing is expanded on initial render even if a prior test run left `viewingUnsavedHistory`/`currentLoadedSessionName` set (store reset in `beforeEach`, matching the file's existing pattern).
- **Boot regression** — an existing or new test confirms a fresh app load never calls `applySessionPayload` and never sets `viewingUnsavedHistory`/`currentLoadedSessionName` to a truthy/non-null value on its own, even after `promoteUnsavedHistoryOnBoot()` runs (promotion moves data, it never applies it).

### 5.3 Success criteria

1. Every row's Load button always reapplies exactly the payload it was last given — no row's Load button ever writes to storage. (deterministic, unit-tested — regression guard for the revert)
2. A named session's own autosave history never exceeds 3 entries and is never shared with or overwritten by a different session's autosave ticks. (deterministic, unit-tested)
3. The unsaved "current" bucket is promoted into "last" exactly once per app boot, never mid-session, and a named session's autosave history is never affected by that promotion. (deterministic, unit-tested)
4. No row's autosave subrows are visible without the user first clicking that row's own Load button this browsing session; loading a different row collapses the previous one. (deterministic, unit-tested)
5. Loading a subrow leaves its parent session "current" (label + subrows stay visible), matching the confirmed reversal of today's unconditional-clear behavior. (deterministic, unit-tested)
6. `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
7. Manual check: Load/Primary-Save-label/subrow-reveal all behave as described in `npm run dev`, across a real 5-minute autosave tick (or a shortened test-only interval override, if one already exists) and an actual browser refresh to confirm boot-time promotion.

### 5.4 Verification order

`npm run build:types` → `npm run lint` → `npm test` → `npm run build` → manual check in `npm run dev`.

---

## 6. Documentation & Git/Workflow Context

- **Docs to update:** `docs/SESSION_STORAGE.md` ("The 6-Slot Autosave" section rewritten to describe the per-session/two-bucket model; Update-button mention removed), `docs/UI_SHELL.md` (only if it currently describes the Update button or the old slot labeling — confirm during Plan), `docs/todo/roadmap.md` (a new dated sub-entry under or immediately following Phase 20, since this amends already-"Done" work rather than opening a new numbered phase — exact placement left for the Plan phase to decide against the roadmap's established convention for post-ship amendments).
- **Branch:** new branch off `main` (current branch is `main`, clean) — name left for the Plan phase, following the existing `feature/[phase-slug]` convention (e.g. `feature/session-autosave-history`).
- **Commits:** one per task, tests with their code; attribution per this session's rules. **PR:** references this spec; reviewed by another contributor per `CLAUDE.md`.
- **Sequencing:** independent of every other open roadmap item; touches only files this same phase (20) already owns.

---

## 7. Open Questions & Risks

Spec-author (Claude) decisions made to keep the implementation concrete — **flagged for Crawford's explicit confirmation before the Plan phase**, not silently baked in. None of these contradict the confirmed intent doc; each fills a gap the interview didn't reach.

1. **Deleting a named session cascades to delete its own autosave history.** Not discussed in the interview. Reasoning: leaving `namedAutosaves[name]` behind after the parent is deleted would be unreachable dead storage (nothing in the UI could ever surface it, since subrows only render beneath their still-existing parent row). **Confirm or correct.**
2. **No Delete button on any autosave subrow**, named or unsaved — matches the intent doc's explicit "any cap, eviction, or manual-delete affordance beyond the FIFO-of-3 rule per bucket — not addressed here." The existing top-level Delete button on a named session row is unchanged (still deletes the whole entry, now cascading per item 1 above); the unsaved-history row's own top-level Delete button (today's `deleteAutosaveSlot` equivalent) is **kept** as-is, now clearing the entire `unsavedLast` bucket — this is preserving an existing capability under the new schema, not adding new scope. **Confirm this reading, or say subrows should get Delete too.**
3. **Loading a subrow keeps the parent "current"** (§1, §4.5) — this is a confirmed behavior change from today's code (where loading *any* autosave slot unconditionally clears `currentLoadedSessionName` to `null`). Restated here because it's the single biggest behavioral departure from the shipped Session Storage feature and worth a final explicit check before implementation.
4. **The unsaved-history row's own label stays identity-based** (`` `${attenuationStyleName} @ (x, y)` ``), not timestamp-based, even though its Load action specifically applies its *newest* entry. This avoids a duplicate-looking subrow (the newest entry would otherwise appear both as the row's own implicit payload and again as a subrow). Flagged since the interview didn't explicitly address this specific asymmetry between the named-session case (top row = a distinct manual save, subrows = separate autosave ticks, no overlap) and the unsaved case (top row = a summary of the same 3 entries the subrows show). **Confirm or propose an alternative.**
5. **Exact `localStorage` schema** (§4.3) is a first-pass proposal, not load-bearing to the confirmed behavior — a single namespaced key continues to work fine at this scale (still diffs, not snapshots; now capped at 3× more entries per session than before, still small). Revisit only if this ever becomes a measured concern.
6. **Risk:** `namedAutosaves`/`unsavedCurrent`/`unsavedLast` are new top-level keys in `SessionsStorageShape` — any existing saved data in a user's browser from before this change (`autosave: Partial<Record<AutosaveSlotId, SessionEntry>>`, `nextRotatingIndex`) will simply be ignored by the new read path (extra keys, not a parse failure) rather than migrated. Given autosave data is explicitly disposable/non-authoritative by design (named saves are the durable artifact), no migration is proposed — old autosave slots are silently orphaned in storage until `localStorage.clear()` or manual inspection removes them. **Confirm this is acceptable, or ask for an explicit cleanup step.**
