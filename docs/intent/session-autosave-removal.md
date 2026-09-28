# Intent: Session Autosave Removal

Confirmed via `interview-me` on 2026-09-28, ahead of a `spec-driven-development` pass.

## Outcome

Scrap the per-session/unsaved autosave-history feature that was in progress on `features/session-updates` (per-session 3-deep FIFO history, two unsaved-work buckets, drill-down subrows, "Primary Save" label). Reset the branch back to before that work started, keeping only the date+time formatting change made along the way. Sessions go back to plain manual CRUD for v1: Save (create/overwrite by name), Load, Delete, and the existing "Clear Local Storage" button.

## Behavior

- **No automatic background saving at all.** The 5-minute `setInterval` autosave tick in `sessionAutosave.ts`, and all storage machinery built to support it (per-session FIFO histories, "current"/"last" unsaved buckets), are removed entirely — not simplified, not reduced to a single slot. Saving only happens when the user explicitly clicks Save.
- **`SessionListItem.tsx` stays Load-only**, as already reverted in commit `4566fcf`: every row, including the currently-loaded one, shows Load and calls `applySessionPayload`. No per-row "Update" button is added back — overwrite-by-name is already covered by the top-of-panel Save Session box (same name = overwrite).
- **No "Primary Save" label.** The currently-loaded row goes back to showing plain `entry.name` — the label only existed to distinguish a row from its own autosave subrows, which no longer exist.
- **No autosave subrows / drill-down UI** of any kind — nothing nested beneath a session row.
- **"Clear Local Storage" is untouched** — stays exactly as it is today.
- **Date + time formatting is kept.** The switch from time-only to date + time (e.g. "Sep 28, 2:14 PM") for the save-confirmation banner — the one part of this session's work independent of the autosave-history concept — survives the rollback.

## Style / constraint

- Branch `features/session-updates` gets reset back to the commit before `3227081` (start of the "Add per-session and unsaved-bucket autosave history storage API" work), then the date+time formatting change is reapplied/kept on top. This is a rollback of in-progress work, not a forward-built removal PR.
- `docs/SESSION_STORAGE.md`'s existing "6-Slot Autosave" section describes the pre-this-branch behavior and needs no rewrite as part of this rollback — it already reflects the CRUD-only world being returned to (verify during the spec pass rather than assuming).

## Out of scope

- Any autosave mechanism, single-slot or otherwise — not "reduced," fully absent from v1.
- Per-row Update/overwrite button.
- "Primary Save" label or any other visual marker distinguishing the loaded row.
- Autosave history of any depth, for named sessions or unsaved work.
- Changes to the Session Name input or "Save Session" button's existing create/overwrite behavior.

## Known implementation note (not yet spec'd)

- The three docs from the scrapped feature have been marked `Status: cut. Do not implement.` and moved into their respective `archive/` folders (`docs/intent/archive/session-autosave-history.md`, `docs/specs/archive/SESSION_AUTOSAVE_HISTORY.md`, `docs/tasks/archive/SESSION_AUTOSAVE_HISTORY.md`) as a historical record, not deleted.
- Exact mechanics of resetting the branch (git reset vs. revert commits, and how to cleanly re-extract just the date+time formatting change) are left for the spec/implementation pass.
