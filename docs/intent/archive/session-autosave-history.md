# Intent: Session Autosave History

> **Status: cut. Do not implement.** This work was scoped and partially implemented on
> `features/session-updates`, then reverted at Crawford's call as too complicated for v1 — see
> [docs/intent/session-autosave-removal.md](session-autosave-removal.md) for the rollback decision.
> Sessions go back to plain manual CRUD (Save/Load/Delete/Clear Local Storage) with no autosave at
> all. This doc is kept as a historical record of what was scoped, not current or planned behavior.

Confirmed via `interview-me` on 2026-09-28, ahead of a `spec-driven-development` pass.

## Outcome

Revert `SessionListItem.tsx`'s per-row "Update" button back to "Load" everywhere, and replace the flat "5 rotating slots + 1 draft slot" autosave scheme (`docs/SESSION_STORAGE.md` §"The 6-Slot Autosave") with a per-session, 3-deep rotating autosave history: each named session keeps its own last 3 autosaves, and unsaved (no-named-session-loaded) work is protected by two buckets — one visible, one a boot-to-boot safety net — each also 3-deep.

## Behavior

- **Load, not Update, everywhere.** `SessionListItem.tsx`'s `isCurrentlyLoaded` branch (`handleUpdate`, which today calls `saveNamedSession(entry.name, buildSessionPayload())` to silently overwrite the entry with live state) is removed. Every row — including the currently-loaded one — always shows Load and always calls `applySessionPayload(entry.payload)`, reapplying exactly what was last explicitly saved and discarding any live tweaks since. `UPDATE_SESSION_SCHEMA` (`sessionConfig.ts`) becomes unused and should be removed, not left dead.
- **"Primary Save" label.** The currently-loaded named session's row label changes from plain `entry.name` to `` `${entry.name} Primary Save` ``. This applies **only** to whichever named session is currently loaded (`sessionStore.currentLoadedSessionName`) — every other named session row still shows its plain name. Purpose is purely to visually distinguish that row from its own autosave subrows nested beneath it, not a general "this is a manual save" badge.
- **Per-named-session autosave history (3 deep, FIFO).** While a specific named session is loaded, the 5-minute autosave tick writes into that session's own rotating 3-slot history (replacing today's single shared "draft" slot). A 4th autosave for that session evicts its oldest. Different named sessions each keep an independent 3-entry history — loading Session A, letting it autosave, then loading Session B does not touch or evict A's history.
- **Two unsaved-session buckets, each also 3 deep.** When no named session is loaded, the autosave tick writes into a **"current"** bucket's own rotating 3-slot history (same FIFO-of-3 mechanic as a named session). A separate **"last"** bucket holds a frozen copy of whatever the "current" bucket contained as of the *previous* app boot.
  - **Promotion only happens at boot.** On app load/init (mirroring `startSessionAutosave()`'s existing boot-time call in `main.tsx`), if the current bucket has any history, it's promoted wholesale into "last" (overwriting "last" entirely, not merging), and a fresh empty "current" bucket starts. Loading or saving a named session mid-session does **not** trigger promotion — it just means the current-unsaved bucket temporarily stops receiving new autosave writes (ticks go to the loaded named session's own history instead) while continuing to exist, unpromoted, until the next boot.
- **Display is drill-down, not always-expanded.** No row's autosave subrows are visible by default on a fresh page load/reload — `currentLoadedSessionName` (or equivalent tracked state) starts at its normal "nothing loaded" value regardless of what was loaded before the refresh, consistent with existing "no auto-load on boot" behavior. A row's own up-to-3 autosave subrows (indented, appearing directly beneath that row and before the next top-level row) become visible only once the user has clicked Load on that specific row this browsing session. This is exclusive — loading a different row hides the previously-expanded row's subrows.
  - This applies uniformly to named sessions and to the unsaved "last" bucket's row alike. The unsaved "current" bucket is never shown as a row at all (not even collapsed) — it exists purely as the boot-to-boot safety net described above.
- **Loading a subrow keeps its parent "current."** Clicking Load on one of a session's own 3 nested autosave subrows still counts as loading that session: `currentLoadedSessionName` (or equivalent) is set/stays set to that session's name, its "Primary Save" label and its subrow history both stay visible, so a person can keep browsing/comparing within that session's history after restoring an earlier point. This is a deliberate departure from today's code, where loading *any* autosave slot unconditionally clears `currentLoadedSessionName` to null.
- **Date + time formatting.** Both the new "Autosave from `${formattedRealWorldLocalTime}`" subrow label and the already-shipped "Saved `${sessionName}` at `${formattedRealWorldLocalTime}`" save-confirmation banner (`SessionsPanel.tsx`, added earlier this session) switch from time-only to date + time (e.g. "Sep 28, 2:14 PM").

## Style / constraint

- Reuses the existing 5-minute `setInterval` autosave tick (`sessionAutosave.ts`) — no new scheduling mechanism. Per `docs/SESSION_STORAGE.md`, this plain interval is a deliberate, already-justified exception to the CLAUDE.md "no `setTimeout`/`setInterval` for musical timing" guardrail, since this is unrelated background persistence, not audio/animation scheduling.
- Reuses the existing apply path (`applySessionPayload` → `worldTransition.ts`'s `retransmitWorld`, then overlay of `globalAudio`/robot overrides/company diffs/`assignRobotToCompany`) — no parallel regeneration path for any autosave tier.
- `docs/SESSION_STORAGE.md`'s "The 6-Slot Autosave" section (5 rotating + 1 draft) is fully superseded by this intent and should be rewritten in the spec pass, not reconciled against as ground truth.

## Out of scope

- No change to the top-of-panel Session Name input or "Save Session" button (`SessionsPanel.tsx`'s `handleSave`) — it still creates/overwrites a named entry by name, and still does **not** itself mark that entry as currently loaded (only clicking a row's Load button does, unchanged from today).
- No change to "Clear Local Storage."
- No persistence of "currently loaded / currently expanded" state across a reload — it always resets to nothing-expanded on boot, consistent with "no session is ever auto-loaded."
- Any cap/eviction/manual-delete affordance beyond the FIFO-of-3 rule per bucket — not addressed here.
- Whether the unsaved "current"/"last" buckets' own autosave history transfers if the user saves that in-progress unsaved work as a brand-new named session — not addressed; the current bucket keeps accumulating independently and gets promoted (or not) at the next boot exactly as described above, regardless of any intervening explicit Save.

## Known implementation note (not yet spec'd)

- Exact new tracked state for "which row is currently expanded/loaded" — `currentLoadedSessionName` (`sessionStore.ts`) today is `string | null` and its `null` state already means "nothing loaded." It can't also represent "the unsaved 'last' row is loaded," so a sentinel value or a separate field is needed. Left for the spec pass.
- Exact `localStorage` schema change in `sessionStorageEngine.ts`/`types/session.ts` to move from the flat `{ named, autosave: Partial<Record<AutosaveSlotId, SessionEntry>>, nextRotatingIndex }` shape to per-named-session FIFO-3 histories plus the two-bucket unsaved scheme — left for the spec pass.
- Whether `AUTOSAVE_ROTATING_SLOT_IDS`/`AutosaveSlotId` (`types/session.ts`, currently 5 rotating ids + `'draft'`) are repurposed or replaced outright — left for the spec pass.
