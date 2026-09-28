# Session Storage & Persistence

**Status: shipped, [Roadmap Phase 20](todo/roadmap.md#20-session-storage).** Rewritten from the shipped implementation — see [docs/intent/session-storage.md](intent/session-storage.md), [docs/specs/SESSION_STORAGE.md](specs/SESSION_STORAGE.md), and [docs/tasks/SESSION_STORAGE.md](tasks/SESSION_STORAGE.md) for full design rationale and history. This file supersedes its own prior draft, which described a different, never-built shape (single boot-autoloaded slot, URL sharing, `FirmwareResetModal`) — see "What changed from the original design" below.

**Related docs:** [PROCEDURAL_GENERATION.md](PROCEDURAL_GENERATION.md) (the seed determinism this design depends on) · [ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md) (unrelated to this feature — nothing here animates) · [COMPANIES.md](COMPANIES.md) (the `Company` shape this persists, including the spawn-generated-vs-user-created id split) · [UI_SHELL.md](UI_SHELL.md) (where the Sessions accordion sits in Settings) · [todo/roadmap.md](todo/roadmap.md) Phase 6 (deterministic robot IDs), Phase 10 (Companies), Phase 20 (this phase), Phase 21 (shareable links — depends on this phase but is a separate, not-yet-built feature)

## What it does

A "Sessions" accordion — third and last in the Settings view's stack, after "Audio Profile" and "Audio Seeds" (`SettingsContent.tsx`'s `SETTINGS_LEAVES`) — renders `SessionsPanel.tsx`. An operator types a name (or accepts the generated suggestion) and clicks "Save Session" to write the current audio-relevant tuning to `localStorage` under that name; clicking a saved entry's "Load" button applies it immediately, no confirmation. A 5-minute background autosave protects against forgetting to save. This is purely local persistence — no URL involvement, no sharing, no compression.

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

One namespaced `localStorage` key, `STORAGE_KEY = 'trace-atlas.sessions.v1'`, holding named entries and the 6 autosave slots together:

- `saveNamedSession(name, payload)` — overwrites the entry named `name` in place if it exists; otherwise creates a new one. The name **is** the storage key, not a separate id.
- `saveAutosaveSlot(mode, payload)` — `mode` is `'rotating'` or `'draft'`, never a specific slot id; the engine owns the FIFO rotation cursor internally (a deliberate change from an earlier draft that took an explicit slot id — see "What changed" below).
- `deleteNamedSession(name)` / `deleteAutosaveSlot(slotId)` — each removes only its own kind of entry, even if a name happens to collide with a slot id (e.g. a session literally named `"draft"`).
- `listSessions()` — every named entry plus every populated autosave slot, for the panel's list.
- `loadSession(key)` — looks up a payload by name or slot id; returns `undefined` if nothing matches.

Malformed or missing `localStorage` data fails soft: `listSessions()` returns `[]`, `loadSession()` returns `undefined`, never throwing into the render path.

## The 6-Slot Autosave (`src/systems/sessionAutosave.ts`)

`startSessionAutosave()`/`stopSessionAutosave()` — an idempotent, module-singleton pair (mirroring `startAudioBudget()`'s shape), called once at boot from `main.tsx`. Every `SESSION_AUTOSAVE_INTERVAL_MS` (5 minutes), a plain `setInterval` tick:

- **`sessionStore.currentLoadedSessionName === null`** (no named session currently loaded) → writes to the next of **5 rotating "Unsaved Session" slots**, FIFO — a 6th write evicts the oldest.
- **A named session is loaded** → writes to a single dedicated **`draft`** slot instead, and never touches that named entry itself. Switching to a *different* loaded session still writes the same one `draft` slot (overwritten, not duplicated). A named entry, once explicitly saved, is otherwise frozen — the only way to update it is another explicit "Save Session" (or "Update," see below) click.

The 5-minute interval is a plain `setInterval`, a deliberate departure from an earlier design (debounced `subscribe()` listener) — **not** a `CLAUDE.md` guardrail violation: the "no `setInterval` for musical timing" rule scopes to audio/animation scheduling, not this unrelated background persistence tick.

## The UI (`SessionsPanel.tsx` / `SessionListItem.tsx`)

`SessionsPanel` holds the Session Name input (`sessionStore.currentSessionName`, prefilled by `sessionStore.ts`'s `suggestSessionName()` — the same word-list mechanism `spawnSystem.ts`'s `generateCompanyName` uses for robot/company names, so it's never blank) and a "Save Session" button above the list. It re-reads `listSessions()` after every save/delete rather than subscribing to a store, since `localStorage` reads aren't reactive.

Each `SessionListItem` row:
- **Named entry:** shows its own name. If it's the currently-loaded session (`sessionStore.currentLoadedSessionName`), its button is **"Update"** instead of "Load" — overwrites that same entry with the current live state via `saveNamedSession`, rather than reloading it, and doesn't change `currentLoadedSessionName`. Otherwise it's **"Load"** — calls `applySessionPayload` and sets `currentLoadedSessionName` to this entry's name.
- **Autosave-slot entry:** shows `${attenuationStyleName} @ (${x}, ${y})` (derived from its own payload) suffixed `(Autosaved Session)` — a generic "Unsaved Session" label made all 6 slots indistinguishable in the list, so the world identity is shown instead. Loading one always clears `currentLoadedSessionName` to `null`, so it never shows "Update."
- **Delete** (every row, named or autosave) sits behind an `AlertDialog` confirm — the same pattern `CompanyCrudControls.tsx` already establishes — routing to `deleteNamedSession` or `deleteAutosaveSlot` depending on the row's kind.

A **"Clear Local Storage"** button (lore label "Reset to Factory Settings") sits at the bottom of the panel, behind its own `AlertDialog` confirm. On confirm it calls `localStorage.clear()` — all of `localStorage`, not scoped to the sessions key — and resets `currentLoadedSessionName` to `null`. It does not strip the URL query string or regenerate the world.

## Boot Behavior

Unchanged from before this feature existed, and deliberately so: **no session — named or autosaved — is ever auto-loaded** on refresh or a fresh tab. `main.tsx` calls `startSessionAutosave()` once at module load; that's the only session-related thing that happens at boot. The existing `?seed=` param continues to work exactly as it does today, untouched by this feature. Getting back a session is always a deliberate click.

## What changed from the original design

This file's original draft (pre-implementation) described a different feature: a single boot-autoloaded slot, a fixed URL → `localStorage` → procedural-fallback resolution hierarchy, native `CompressionStream`/`DecompressionStream` URL serialization for link sharing, and a `FirmwareResetModal` full-state wipe with a GSAP flash timeline. **None of that shipped.** What's described above shipped instead: multi-session, name-keyed local saves; a 6-slot split-purpose autosave on a plain interval; no URL involvement of any kind; and a "Clear Local Storage" button that overlaps with, but is narrower than, the old `FirmwareResetModal` concept (no URL-stripping, no world regeneration, no GSAP flash). URL-based sharing is tracked separately as [Phase 21](todo/roadmap.md#21-sector-settings-shareable-link-importexport), which depends on this phase but hasn't been built.

`sessionStorageEngine.ts`'s `saveAutosaveSlot` also ended up taking a `mode: 'rotating' | 'draft'` rather than an explicit slot id, keeping the FIFO rotation cursor fully encapsulated in the engine rather than exposed to callers — a refinement made during implementation, not part of the original plan.

## Forbidden Patterns

- Don't persist full robot or spawn-generated-Company objects — persist the seed/coordinates plus an override diff, per "What Gets Persisted" above. Only user-created Companies (no seed to regenerate from) get persisted in full.
- Don't let autosave write to a named entry — only the single `draft` slot may shadow one, and only while it's loaded.
- Don't key a named session, or a spawn-generated robot/Company override, by anything other than name (sessions) or deterministic id (overrides) — see "Hard Requirement" above.
- Don't add a compression dependency, `CompressionStream`, or any URL serialization — out of scope for this phase (Phase 21).
- Don't build a destructive confirm as a plain `window.confirm()` — use the established `AlertDialog` pattern, as both Delete and Clear Local Storage do.
- Don't reimplement world regeneration in `sessionDiff.ts` — always route through `worldTransition.ts`'s `retransmitWorld`.
- Don't write company membership as a direct `robotIds` mutation — always go through `localeStore.assignRobotToCompany` so member robots' own `companyId` stays in sync.
