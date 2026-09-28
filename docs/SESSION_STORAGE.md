# Session Storage & Persistence

**Status: shipped, [Roadmap Phase 20](todo/roadmap.md#20-session-storage).** Rewritten from the shipped implementation — see [docs/intent/session-storage.md](intent/session-storage.md), [docs/specs/SESSION_STORAGE.md](specs/SESSION_STORAGE.md), and [docs/tasks/SESSION_STORAGE.md](tasks/SESSION_STORAGE.md) for full design rationale and history. This file supersedes its own prior draft, which described a different, never-built shape (single boot-autoloaded slot, URL sharing, `FirmwareResetModal`) — see "What changed from the original design" below. **No autosave of any kind, in v1 — see "Session Autosave History was scoped, built, then cut" below** for the full history of that amendment.

**Related docs:** [PROCEDURAL_GENERATION.md](PROCEDURAL_GENERATION.md) (the seed determinism this design depends on) · [ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md) (unrelated to this feature — nothing here animates) · [COMPANIES.md](COMPANIES.md) (the `Company` shape this persists, including the spawn-generated-vs-user-created id split) · [UI_SHELL.md](UI_SHELL.md) (where the Sessions accordion sits in Settings) · [todo/roadmap.md](todo/roadmap.md) Phase 6 (deterministic robot IDs), Phase 10 (Companies), Phase 20 (this phase), Phase 21 (shareable links — depends on this phase but is a separate, not-yet-built feature)

## What it does

A "Sessions" accordion — third and last in the Settings view's stack, after "Audio Profile" and "Audio Seeds" (`SettingsContent.tsx`'s `SETTINGS_LEAVES`) — renders `SessionsPanel.tsx`. An operator types a name (or accepts the generated suggestion) and clicks "Save Session" to write the current audio-relevant tuning to `localStorage` under that name; a successful save shows a "Saved `${name}` at `${date + time}`" confirmation banner. Clicking a saved entry's "Load" button applies it immediately, no confirmation; clicking its "Delete" button removes it, behind an `AlertDialog` confirm. **There is no automatic/background saving of any kind** — the only way a session is written to storage is an explicit "Save Session" click. This is purely local, manual persistence — no URL involvement, no sharing, no compression.

## What Gets Persisted

Robot attributes are already fully derived from the active Attenuation Style and locale coordinates — [PROCEDURAL_GENERATION.md](PROCEDURAL_GENERATION.md) guarantees the same seed always regenerates the same world. So a `SessionPayload` (`src/types/session.ts`) does **not** store full robot/company state. It's a diff reapplied on top of a freshly regenerated roster:

1. `attenuationStyleName` and `coordinates: { x, y }` — the active Attenuation Style and locale
2. `globalAudio: GlobalAudioSettings` — Audio Rig FX (Compressor, EQ3, LPF, HPF, Delay, Reverb, Limiter)
3. `robotOverrides: Record<robotId, RobotAudioOverrideDiff>` — only robots whose live values differ from what the seed alone would produce, and only the fields that differ: `adsr`, `layers`, `filterFreq` (`AudioAttributes.filterFreq` — "transducer pressure ratio" in UI lore copy), `rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`, `pitchRepeat`, `octaveRange`, `lfoSettings`, `name`. An untouched robot has **no key** in this map, not a key mapping to `{}`.
4. `companyDiffs: Record<companyId, CompanyDiff>` — spawn-generated companies only, same "no key if untouched" rule, covering just `name`/`robotIds` (membership)
5. `userCreatedCompanies: Company[]` — companies made via `CompanyCrudControls` (`crypto.randomUUID()` ids) have no seed to regenerate from, so they persist as **complete objects**, never diffed
6. `version: 1` — a schema-version field on the payload itself, unused by this phase's own code; exists so a future importer (Phase 21) can distinguish payload shapes without a retrofit

**Explicitly never persisted:** job assignment, docking-state override, battery warning threshold (these drift continuously as the sim runs — a bad fit for a checkpoint), `audioMode` (solo/mute), `masterVolume`, and all UI/layout state (open accordions, selected nav tab, etc.).

`computeRobotAudioOverrideDiff`/`computeCompanyDiff`/`buildSessionPayload`/`applySessionPayload` (`src/utils/sessionDiff.ts`) are the pure diff core. `buildSessionPayload` compares the live roster against a seed-only baseline produced by `generateRobotRosterBaseline`/`generateCompanyRosterBaseline` (`src/systems/spawnSystem.ts`) — pure functions with no store write, extracted from the real spawn path so the baseline they produce is guaranteed to match what a fresh spawn would actually generate. `applySessionPayload` regenerates the world via `worldTransition.ts`'s existing `retransmitWorld` (never a parallel regeneration path), then overlays `globalAudio`, every robot override (merged field-by-field via `useLocaleStore.updateRobot`), every company diff, and every user-created company. Company membership is reapplied via `localeStore.assignRobotToCompany` per affected robot, never a direct `robotIds` write, so a member robot's own `companyId` never desyncs from its company's roster.

## Hard Requirement: Deterministic IDs for Anything Diffed

This only works if regenerating from the same seed reproduces the same IDs in the same order, so a persisted diff can be matched back up to the right entity. **Robot IDs** and **spawn-generated Company IDs** already satisfy this (`generateRobotId`/`generateCompanyId`, `src/systems/spawnSystem.ts`, Phase 6). **User-created Companies** are the one exception, deliberately: they have no seed to derive an id from, so they keep `crypto.randomUUID()` and persist as full objects instead of a diff (see "What Gets Persisted" above).

## The Storage Engine (`src/utils/sessionStorageEngine.ts`)

One namespaced `localStorage` key, `STORAGE_KEY = 'trace-atlas.sessions.v1'`, holding named entries only — `{ named: Record<string, SessionEntry> }`:

- `saveNamedSession(name, payload)` — overwrites the entry named `name` in place if it exists; otherwise creates a new one. The name **is** the storage key, not a separate id.
- `deleteNamedSession(name)` — removes that entry.
- `listSessions()` — every named entry, for the panel's list.
- `loadSession(name)` — looks up a payload by name; returns `undefined` if nothing matches.

Malformed or missing `localStorage` data fails soft: `listSessions()` returns `[]`, `loadSession()` returns `undefined`, never throwing into the render path. Any leftover keys from an earlier storage shape — this codebase's own now-cut autosave-history fields, or the original 6-slot scheme's `autosave`/`nextRotatingIndex` pair — are silently ignored on read, not migrated.

## No Autosave in v1

There is no automatic or background saving of any kind. An earlier iteration of this phase shipped a plain-`setInterval` autosave (first a flat 6-slot scheme, later restructured into a per-session/unsaved-bucket history) — see "Session Autosave History was scoped, built, then cut" below. Both were removed; the only way a session reaches `localStorage` is an explicit "Save Session" click.

## The UI (`SessionsPanel.tsx` / `SessionListItem.tsx`)

`SessionsPanel` holds the Session Name input (`sessionStore.currentSessionName`, prefilled by `sessionStore.ts`'s `suggestSessionName()` — the same word-list mechanism `spawnSystem.ts`'s `generateCompanyName` uses for robot/company names, so it's never blank) and a "Save Session" button above the list of named entries, sorted by `savedAt` descending. A successful save shows a `` `Saved ${name} at ${formattedDateTime}` `` confirmation banner (`formatSessionTimestamp`, `src/utils/helpers.ts` — e.g. "Sep 28, 2:14 PM"); a failed save shows a `` `${name} failed to save.` `` message instead. `SessionsPanel` re-reads `listSessions()` after every save/delete rather than subscribing to a store, since `localStorage` reads aren't reactive.

Each `SessionListItem` row always shows its own plain name and two buttons:
- **Load** — calls `applySessionPayload(entry.payload)` and sets `sessionStore.currentLoadedSessionName` to this entry's name. Always reapplies exactly what was last explicitly saved, discarding any live tweaks since — there is no "Update" button that silently overwrites an entry with live state; overwriting is done by typing the same name into the Session Name input and clicking "Save Session" again.
- **Delete** — behind an `AlertDialog` confirm (the same pattern `CompanyCrudControls.tsx` already establishes), calls `deleteNamedSession(entry.name)`.

A **"Clear Local Storage"** button (lore label "Reset to Factory Settings") sits at the bottom of the panel, behind its own `AlertDialog` confirm. On confirm it calls `localStorage.clear()` — all of `localStorage`, not scoped to the sessions key — and resets `currentLoadedSessionName` to `null`. It does not strip the URL query string or regenerate the world.

## Boot Behavior

Unchanged from before this feature existed, and deliberately so: **no session is ever auto-loaded** on refresh or a fresh tab. There is nothing session-related to do at boot at all now that autosave is gone — `main.tsx` has no session-storage import. The existing `?seed=` param continues to work exactly as it does today, untouched by this feature. Getting back a session is always a deliberate click.

## Session Autosave History was scoped, built, then cut

A follow-on amendment to this phase (`docs/intent/archive/session-autosave-history.md`, `docs/specs/archive/SESSION_AUTOSAVE_HISTORY.md`, `docs/tasks/archive/SESSION_AUTOSAVE_HISTORY.md` — all marked `Status: cut. Do not implement.`) replaced the original 6-slot autosave with a per-named-session 3-deep FIFO history plus two unsaved-work buckets, a drill-down UI to browse it, and a "Primary Save" label. It was partially implemented on `features/session-updates`, then Crawford called it too complicated for a v1 and had it removed — see [docs/intent/session-autosave-removal.md](intent/session-autosave-removal.md) and [docs/specs/SESSION_AUTOSAVE_REMOVAL.md](specs/SESSION_AUTOSAVE_REMOVAL.md)/[docs/tasks/SESSION_AUTOSAVE_REMOVAL.md](tasks/SESSION_AUTOSAVE_REMOVAL.md) for the removal itself. Net effect on what's described above: no autosave of any kind survived either the original 6-slot design or its replacement — this doc's "What it does" section and everything below it describes the current, autosave-free state, not either cut design.

## What changed from the original design

This file's original draft (pre-implementation) described a different feature: a single boot-autoloaded slot, a fixed URL → `localStorage` → procedural-fallback resolution hierarchy, native `CompressionStream`/`DecompressionStream` URL serialization for link sharing, and a `FirmwareResetModal` full-state wipe with a GSAP flash timeline. **None of that shipped.** What's described above shipped instead: multi-session, name-keyed local saves, manual only (see "Session Autosave History was scoped, built, then cut" above for the two autosave designs that were built and then both removed); no URL involvement of any kind; and a "Clear Local Storage" button that overlaps with, but is narrower than, the old `FirmwareResetModal` concept (no URL-stripping, no world regeneration, no GSAP flash). URL-based sharing is tracked separately as [Phase 21](todo/roadmap.md#21-sector-settings-shareable-link-importexport), which depends on this phase but hasn't been built.

## Forbidden Patterns

- Don't persist full robot or spawn-generated-Company objects — persist the seed/coordinates plus an override diff, per "What Gets Persisted" above. Only user-created Companies (no seed to regenerate from) get persisted in full.
- Don't add any automatic/background saving mechanism — v1 is manual-save-only; two prior autosave designs were built and both removed, see "No Autosave in v1" above.
- Don't key a named session, or a spawn-generated robot/Company override, by anything other than name (sessions) or deterministic id (overrides) — see "Hard Requirement" above.
- Don't add a compression dependency, `CompressionStream`, or any URL serialization — out of scope for this phase (Phase 21).
- Don't build a destructive confirm as a plain `window.confirm()` — use the established `AlertDialog` pattern, as both Delete and Clear Local Storage do.
- Don't reimplement world regeneration in `sessionDiff.ts` — always route through `worldTransition.ts`'s `retransmitWorld`.
- Don't write company membership as a direct `robotIds` mutation — always go through `localeStore.assignRobotToCompany` so member robots' own `companyId` stays in sync.
