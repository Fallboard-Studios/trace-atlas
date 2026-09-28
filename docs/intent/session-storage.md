# Intent: Session Storage

Confirmed via `interview-me` on 2026-09-27, ahead of a `spec-driven-development` pass.

## Outcome

A new "Sessions" accordion in the Settings view (`SettingsContent.tsx`'s `SETTINGS_LEAVES`, third entry — after `quality`/"Audio Profile" and `sectorSettings`/"Audio Seeds") lets an operator manually save the current audio-relevant tuning to `localStorage` under a name, and reload any past save later. A 5-minute background autosave protects against forgetting to save, without ever silently overwriting a deliberate named save. This is purely local persistence — no URL involvement, no sharing. (A separate, already-tracked roadmap phase covers shareable links; this phase is not it, and should not be conflated with it the way an earlier design pass conflated them.)

## Behavior

- **Where it lives:** one new accordion, "Sessions," last in the Settings view stack. It contains a single panel, "Load Sessions," with a required "Session Name" text input (autopopulated with a generated name — same word-list mechanism `spawnSystem.ts` uses for robot/company names, per `CompanyCrudControls.tsx`'s pattern — so it's never blank) and a "Save Session" button above a list of load buttons, one per stored session.
- **What gets persisted**, as a diff reapplied on top of a freshly regenerated world (same principle as the existing `docs/SESSION_STORAGE.md` design, deterministic robot/company IDs from `spawnSystem.ts`'s `generateRobotId`/`generateCompanyId` make this possible):
  - Active seed and locale coordinates
  - Audio Rig FX settings (Compressor, EQ3, LPF, HPF, Delay, Reverb, Limiter)
  - Per-robot overrides, but **only the audio-relevant fields**: transducer pressure ratio, oscillator layer params, ADSR envelope, rhythmic density/motif length/octave bounds/note variance
  - Robot names (`Robot.ts`'s `name?: string`) and company names (`Company.ts`'s `name: string`)
  - Company membership (which robots belong to which company)
- **Explicitly NOT persisted:** job assignment, docking-state override, battery warning threshold (these drift continuously on their own as the sim runs — a bad fit for a checkpoint), and all UI/layout state (open accordions, selected nav tab, etc.).
- **Save is keyed by name.** Saving under a name that already exists overwrites that entry in place. To keep both an old and a new version, the user renames before saving (creating a new entry) rather than the app offering a "save as copy" affordance.
- **Load applies immediately** — no confirmation dialog. Losing current in-memory state isn't treated as destructive, because autosave already protects recent work.
- **Deleting a named session** requires confirmation, reusing the existing `AlertDialog` pattern (`@radix-ui/react-alert-dialog`) already established for destructive actions in `CompanyCrudControls.tsx`.
- **Autosave runs every 5 minutes**, independent of any Save button click, using 6 total slots split by purpose:
  - **5 rotating "Unsaved Session" slots** (FIFO — oldest evicted first) used whenever no named session is currently the active/loaded one. These give the user up to 5 recent autosave checkpoints to fall back on, not just the latest.
  - **1 dedicated "draft" slot**, used only while a named session is currently loaded. It captures ongoing in-session tweaks without ever touching the actual named entry — switching to load a *different* named session overwrites this same draft slot (there is exactly one, not one per named session).
  - A named session, once explicitly saved, is otherwise frozen — autosave never mutates it. The only way to update a named entry is another explicit "Save Session" click with the same name.
- **Boot/reload behavior is unchanged from today:** no session (named or autosaved) is ever auto-loaded on refresh or a fresh tab. The existing `?seed=` URL param (`main.tsx`) still works exactly as it does now, independent of this feature. Getting back a saved or autosaved session is always a deliberate click in "Load Sessions."

## Style / constraint

- No new dependency for compression, encoding, or storage — this is `localStorage` only (no `CompressionStream`/`DecompressionStream`, no URL serialization of any kind in this phase).
- The 5-minute autosave timer is a plain interval, not a debounced Zustand `subscribe()` listener — this supersedes `docs/SESSION_STORAGE.md`'s original "debounced subscribe, not polling" design, which was written for a different (single-slot, boot-autoload) shape of this feature. This is not a CLAUDE.md guardrail violation: the "no `setInterval` for musical timing" rule scopes specifically to audio/animation scheduling, not an unrelated background persistence tick.
- Reuses the existing word-list name-generation mechanism (`spawnSystem.ts`) for the default Session Name value, rather than inventing a second naming scheme.
- Reuses the existing `AlertDialog` destructive-confirm pattern (`CompanyCrudControls.tsx`) for session deletion, rather than a new confirmation mechanism.
- `docs/SESSION_STORAGE.md` in its current form is superseded by this intent in several load-bearing ways (single autosave slot → 6 split-purpose slots; debounced-subscribe → 5-minute timer; boot-time URL resolution hierarchy and URL compression → dropped from this phase entirely; "SESSION console tab" framing). The spec-driven-development pass should rewrite it rather than treat it as ground truth to reconcile against.

## Out of scope

- URL-based session sharing/export/import, and the native `CompressionStream`/`DecompressionStream` serialization it would need — tracked separately in the roadmap (the "Sector Settings: Shareable Link Import/Export" phase), which depends on this phase shipping first but is a distinct feature.
- A "wipe everything" destructive reset (the old `FirmwareResetModal` concept) — not part of this pass.
- Any cap, eviction policy, or manual delete affordance on the 6 autosave slots themselves — they're self-managing by construction (FIFO rotation + single draft slot).
- Persisting job assignment, docking-state override, battery warning threshold, or any UI/layout state.
- Auto-loading any session on boot/refresh under any circumstance.

## Known implementation note (not yet spec'd)

- Exact `localStorage` schema/key structure for storing multiple named sessions plus the 6 autosave slots as one namespaced payload (vs. multiple keys) is left for the spec pass.
- Whether "currently loaded named session" needs to become new tracked state somewhere (e.g. a store field), since nothing today tracks "which session, if any, is active" — this is new state the autosave draft-slot logic depends on.
- Exact list-item UI for "Load Sessions" (button label format for autosave slots vs. named saves, delete-button placement/icon) is left for the spec pass.
