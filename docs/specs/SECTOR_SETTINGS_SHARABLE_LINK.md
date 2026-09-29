# Phase Spec: Sector Settings — Shareable Link

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/sector-settings-shareable-link.md](../intent/sector-settings-shareable-link.md), confirmed via `interview-me` 2026-09-28. Roadmap: [Phase 21](../todo/roadmap.md#21-sector-settings-shareable-linkimportexport). Depends on [Session Storage (20)](SESSION_STORAGE.md) and [World Clock (20.5)](WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md), both shipped. Status: Plan/Tasks in progress (`docs/tasks/SECTOR_SETTINGS_SHARABLE_LINK.md`) — **all three §7 items resolved by Crawford, 2026-09-28**, including one scope change found only by tracing `worldTransition.ts`/`seedUtils.ts`/`noiseMaps.ts` directly: `?seed=`/`?x=`/`?y=` are removed, not just deprioritized (see §7 item 1).

---

## 1. Overview & Claude Explanation

Any `SessionPayload` — a saved session's stored entry, or the current live state — can be turned into a URL that reproduces that exact world when opened: same locale (Attenuation Style name, coordinates), same robot/company audio tuning, same global audio. Two new "Share Session" buttons produce the link (one per saved-session row, one next to Save Session) and copy it to the clipboard with a "Link copied" note. No manual import UI — opening a link with the param is the only load path.

**The mechanism is plain base64-encoded JSON in one URL query param (`?session=`) — no compression library, no new dependency**, and no change to `SessionPayload`'s shape (it already carries everything needed; its `version` field was written in Phase 20 anticipating exactly this consumer).

**The hard constraint is "no flash of the wrong world" (Crawford, confirmed in interview):** the shared locale must be correct from the very first paint, not spawn-then-replace. This is solved the same way `?seed=`/`?x=`/`?y=` already solve it (`seedUtils.ts`) — decode the URL param synchronously at module-load time, before `localeStore.ts`/`attenuationStyleStore.ts` construct their default-locale module constants — but **cannot reuse those existing override mechanisms as-is**; see §7 item 1 for why, and the resolution this spec proposes.

### 1.1 Two entry points, one mechanism

- **Per-row Share** (`SessionListItem.tsx`, between the existing Load and Delete buttons): shares that row's stored `entry.payload`, untouched by live app state.
- **Panel-level Share** (`SessionsPanel.tsx`, next to Save Session): shares the *current live state*, built the same way Save does — `buildSessionPayload()` — not whatever is in local storage.

Both call one new shared helper (§4.1) that encodes a `SessionPayload` into a full URL and writes it to the clipboard. Neither button reads from nor writes to `localStorage` — sharing is orthogonal to saving.

### 1.2 Boot-time load, two phases

1. **Before the default locale is constructed** (module-load time, synchronous): if `?session=` is present and decodes successfully, its `attenuationStyleName`/`coordinates` feed directly into the module-level constants `attenuationStyleStore.ts`/`localeStore.ts` already compute once at import (`DEFAULT_ATTENUATION_STYLE_NAME`/`DEFAULT_LOCALE_COORDINATES`) — same timing `seedUtils.ts` already achieves for `?seed=`/`?x=`/`?y=`. The correct locale (which robots exist, where they are, factory placement/colors — all seeded from these two values) is what `OceanScene.tsx`'s existing mount-effect `initializeLocale(localeId)` call spawns the first and only time. No spawn-then-replace.
2. **Immediately after that same mount effect's `initializeLocale` call:** apply `robotOverrides`/`companyDiffs`/`globalAudio`/`userCreatedCompanies` via the existing `applySessionPayload()` — same function `SessionListItem`'s Load button already calls — but **with locale reconstruction suppressed** (§7 item 2), since phase 1 already built the correct locale. This is allowed to visibly settle a moment after first paint, confirmed acceptable by Crawford — only the locale itself must be right from frame one.

A loaded shared session behaves like a Load afterward: the Session Name input keeps its normal freshly-generated suggestion (no name travels in the payload), and Save Session persists it locally like any other load. The URL param stays in the address bar — no `history.replaceState` clearing; the link is durable and bookmarkable.

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── sessionShareUtils.ts          NEW — encode/decode SessionPayload <-> base64 URL param;
│   │                                  module-level SESSION_SHARE_PAYLOAD constant (decoded once
│   │                                  at import, same timing as seedUtils.ts's overrides);
│   │                                  getSessionSharePayload() getter; buildShareUrl(payload);
│   │                                  copySessionLink(payload) (encode + clipboard write, used by
│   │                                  both Share buttons)
│   ├── sessionShareUtils.test.ts     NEW
│   ├── sessionDiff.ts                MODIFIED — applySessionPayload gains an options param to
│   │                                  suppress the retransmitWorld call (§4.2, §7 item 2)
│   └── sessionDiff.test.ts           MODIFIED — new cases for the suppressed-retransmit path
├── stores/
│   ├── attenuationStyleStore.ts      MODIFIED — DEFAULT_ATTENUATION_STYLE_NAME prefers a share
│   │                                  payload's exact (unsanitized) name, falling back to a
│   │                                  fresh random name (?seed= removed, §7 item 1)
│   └── localeStore.ts                MODIFIED — DEFAULT_LOCALE_COORDINATES prefers a share
│                                      payload's coordinates, falling back to random (?x=/?y=
│                                      removed, §7 item 1)
├── main.tsx                          MODIFIED — removes the post-render ?seed= block (§7 item 1)
├── components/panels/screen/
│   ├── worldView/
│   │   ├── OceanScene.tsx            MODIFIED — mount effect calls applySessionPayload
│   │   │                              (skipLocaleRebuild: true) right after initializeLocale, if
│   │   │                              a share payload is present
│   │   └── OceanScene.test.tsx       MODIFIED — new case(s) for the boot-time apply
│   └── console/
│       ├── SessionListItem.tsx       MODIFIED — new Share button between Load and Delete
│       ├── SessionListItem.css       MODIFIED — three-button row layout
│       ├── SessionListItem.test.tsx  MODIFIED
│       ├── SessionsPanel.tsx         MODIFIED — new Share button next to Save Session
│       ├── SessionsPanel.css         MODIFIED
│       └── SessionsPanel.test.tsx    MODIFIED
└── data/
    └── sessionConfig.ts              MODIFIED — SHARE_SESSION_SCHEMA button schema (one schema,
                                       cloned with a dynamic humanLabel per-row the same way
                                       LOAD_SESSION_SCHEMA/DELETE_SESSION_SCHEMA already are)
docs/
├── SESSION_STORAGE.md                MODIFIED — documents the share-link mechanism
└── todo/roadmap.md                   MODIFIED — Phase 21 marked in progress, then done
```

No new dependency. `sessionShareUtils.ts` is a new file (not folded into `seedUtils.ts`) deliberately — see §7 item 1 for why reusing `seedUtils.ts`'s existing override plumbing is wrong here, not just inconvenient.

---

## 3. Implementation Boundaries & Constraints

Non-negotiable, from `CLAUDE.md` (re-checked for this change):

- **No new dependency.** Confirmed in interview — plain base64 JSON, not compression.
- **State stays JSON-serializable.** No new state shape — `SessionPayload` is reused as-is; the URL param is a derived, transient encoding of it, not a new store field.
- **No `setTimeout`/`setInterval` for musical timing.** N/A — nothing here touches audio scheduling. (A UI-only "Link copied" auto-dismiss timer, if used per §7 item 3, is not musical timing and isn't covered by this guardrail — but see that item for why this spec defaults to *not* using one.)
- **Musical audio scheduling stays in AudioEngine/BeatClock.** Untouched — `applySessionPayload`'s existing `applyGlobalAudioToEngine`/`AudioEngine.registerRobotMelody` calls are reused verbatim.

**Ask first** (per `CLAUDE.md`): none anticipated — no new dependency, no change to the audio/animation architecture.
**Never:** let the boot-time decode step be asynchronous (it must complete before `localeStore.ts`/`attenuationStyleStore.ts` are first evaluated — a `fetch`/`Promise`-based decode would miss that window and reintroduce the exact flash this phase exists to avoid); let `sessionShareUtils.ts`'s decode throw into an importer (fails soft, same convention as `sessionStorageEngine.ts`'s `readStorage`); let the panel-level Share button read from `localStorage` (it must build from live state via `buildSessionPayload()`, not `listSessions()`).

---

## 4. Code Style & Architecture Conventions

### 4.1 `src/utils/sessionShareUtils.ts` (new)

```typescript
import type { SessionPayload } from '../types/session';
import { devWarn } from './helpers';

const SESSION_PARAM = 'session';

/** UTF-8-safe base64 encode/decode -- plain btoa/atob only handle Latin1, and robot/company
 *  names (TextInput fields, maxLength-bounded but not charset-restricted) can contain non-Latin1
 *  characters. TextEncoder/TextDecoder, not the classic unescape/escape trick (deprecated). */
function encodeBase64Utf8(json: string): string {
  const bytes = new TextEncoder().encode(json);
  return btoa(String.fromCharCode(...bytes));
}
function decodeBase64Utf8(encoded: string): string {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encodes a SessionPayload for a URL query param. */
export function encodeSessionPayload(payload: SessionPayload): string {
  return encodeBase64Utf8(JSON.stringify(payload));
}

/** Decodes a `?session=` param value. Fails soft -- malformed base64, malformed JSON, or a shape
 *  that doesn't look like a SessionPayload all return null, never throw. Same convention as
 *  sessionStorageEngine.ts's readStorage: a corrupted/tampered link degrades to "no share param
 *  present," not a crash. */
export function decodeSessionPayload(encoded: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(decodeBase64Utf8(encoded));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.attenuationStyleName !== 'string' || !parsed.coordinates) {
      return null;
    }
    return parsed as SessionPayload;
  } catch (err) {
    devWarn('[sessionShareUtils] malformed ?session= param, ignoring', err);
    return null;
  }
}

/** Decoded once, at module load -- same timing as seedUtils.ts's GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE/
 *  LOCALE_COORDINATE_OVERRIDE, so attenuationStyleStore.ts/localeStore.ts's own module-level
 *  constants can read it before the default locale is built (§1.2 phase 1). */
const SESSION_SHARE_PAYLOAD: SessionPayload | null =
  typeof window !== 'undefined' ? decodeSessionPayload(new URLSearchParams(window.location.search).get(SESSION_PARAM) ?? '') : null;

/** The decoded share payload from this page load's URL, or null if absent/malformed. */
export function getSessionSharePayload(): SessionPayload | null {
  return SESSION_SHARE_PAYLOAD;
}

/** Builds a full, absolute shareable URL for a payload -- origin + pathname + exactly one
 *  `?session=` param. Deliberately drops any other query params currently in the address bar
 *  (e.g. ?debug, ?seed) -- a share link is a clean, self-contained artifact, not a snapshot of
 *  whatever debug flags happened to be active when it was generated. */
export function buildShareUrl(payload: SessionPayload): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(SESSION_PARAM, encodeSessionPayload(payload));
  return url.toString();
}

/** Builds the link and writes it to the clipboard. Returns true on success, false on failure
 *  (e.g. clipboard permission denied) -- never throws, mirroring saveNamedSession's try/catch
 *  convention at the SessionsPanel.tsx call site (§4.3). */
export async function copySessionLink(payload: SessionPayload): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildShareUrl(payload));
    return true;
  } catch (err) {
    devWarn('[sessionShareUtils] clipboard write failed', err);
    return false;
  }
}
```

### 4.2 `applySessionPayload`'s new option (`src/utils/sessionDiff.ts`)

```typescript
export function applySessionPayload(payload: SessionPayload, options?: { skipLocaleRebuild?: boolean }): void {
  if (!options?.skipLocaleRebuild) {
    // ...existing attenuationStyleUnchanged / retransmitWorld call, unchanged...
  }
  // ...existing globalAudio / robotOverrides / companyDiffs / userCreatedCompanies application, unchanged...
}
```

`skipLocaleRebuild: true` is passed only by the new boot-time caller (§4.3) — `SessionListItem.tsx`'s existing Load button call keeps its default (`undefined`/`false`), so its behavior is byte-for-byte unchanged (§7 item 2 explains why boot needs this and Load doesn't).

### 4.3 Boot-time apply (`OceanScene.tsx`'s existing mount effect)

```typescript
useEffect(() => {
  initializeLocale(localeId);

  const sharePayload = getSessionSharePayload();
  if (sharePayload) {
    applySessionPayload(sharePayload, { skipLocaleRebuild: true });
  }

  return () => {
    stopRobotLifecycle();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

### 4.4 Early-override reads (`attenuationStyleStore.ts`, `localeStore.ts`)

```typescript
// attenuationStyleStore.ts
export const DEFAULT_ATTENUATION_STYLE_NAME = getSessionSharePayload()?.attenuationStyleName ?? resolveDefaultAttenuationStyleName();
```

```typescript
// localeStore.ts
const sharePayload = getSessionSharePayload();
const coordinateOverride = getLocaleCoordinateOverride();
const DEFAULT_LOCALE_COORDINATES = {
  x: sharePayload?.coordinates.x ?? coordinateOverride.x ?? randomCoordinate(),
  y: sharePayload?.coordinates.y ?? coordinateOverride.y ?? randomCoordinate(),
};
```

A share payload takes priority over `?x=`/`?y=`/`?seed=` when both are somehow present — confirmed in interview (one combined param, not split/merged with the existing debug params).

### 4.5 The two Share buttons

```typescript
// SessionListItem.tsx — between Load and Delete
const [linkCopied, setLinkCopied] = useState(false);
const handleShare = async () => {
  const ok = await copySessionLink(entry.payload);
  setLinkCopied(ok);
};
// ...
<Button schema={loadSchema} onClick={handleLoad} />
<Button schema={shareSchema} onClick={handleShare} />
<Button schema={deleteSchema} onClick={() => setConfirmOpen(true)} />
{linkCopied && <span className="session-list-item__share-status" role="status">Link copied</span>}
```

```typescript
// SessionsPanel.tsx — next to Save Session
const [linkCopied, setLinkCopied] = useState(false);
const handleShare = async () => {
  const ok = await copySessionLink(buildSessionPayload());
  setLinkCopied(ok);
};
// ...
<Button schema={SAVE_SESSION_SCHEMA} onClick={handleSave} disabled={nameIsBlank} />
<Button schema={SHARE_SESSION_SCHEMA} onClick={handleShare} />
{linkCopied && <span className="sessions-panel__share-status" role="status">Link copied</span>}
```

`SHARE_SESSION_SCHEMA` (new, `sessionConfig.ts`) follows the existing schema shape:

```typescript
export const SHARE_SESSION_SCHEMA: ButtonSchema = {
  id: 'session.share',
  type: 'button',
  loreLabel: 'TRANSMIT COORDINATES',
  humanLabel: 'Share Session',
};
```

`SessionListItem.tsx` clones it with a dynamic `humanLabel` the same way `loadSchema`/`deleteSchema` already do (`${SHARE_SESSION_SCHEMA.humanLabel} ${label}`).

**Per §7 item 3 (resolved):** the status note is a discriminated `'copied' | 'error' | null` state, not a plain boolean — `copySessionLink`'s `false` result now maps to a visible "Unable to copy" note, not silence. Both outcomes auto-dismiss after 5 seconds via `setTimeout`, cleared on unmount and superseded by a fresh click:

```typescript
type ShareStatus = 'copied' | 'error' | null;
const [shareStatus, setShareStatus] = useState<ShareStatus>(null);
const handleShare = async () => {
  const ok = await copySessionLink(entry.payload);
  setShareStatus(ok ? 'copied' : 'error');
  window.setTimeout(() => setShareStatus(null), 5000);
};
// ...
{shareStatus === 'copied' && <span className="session-list-item__share-status" role="status">Link copied</span>}
{shareStatus === 'error' && <span className="session-list-item__share-status session-list-item__share-status--error" role="alert">Unable to copy</span>}
```

A `setTimeout` here is a UI-only auto-dismiss, not musical timing — `CLAUDE.md`'s no-`setTimeout`-for-musical-timing guardrail doesn't apply.

---

## 5. Testing & Verification Requirements

### 5.1 Framework and location

Vitest + Testing Library, co-located `*.test.ts`/`*.test.tsx`, unchanged.

### 5.2 New/changed tests

- **`sessionShareUtils.test.ts`:** `encodeSessionPayload`/`decodeSessionPayload` round-trip a representative `SessionPayload` (including a company/robot name with non-Latin1 characters, to exercise the UTF-8-safe path); `decodeSessionPayload` returns `null` (not throw) for malformed base64, malformed JSON, and a well-formed-JSON-but-wrong-shape value (e.g. `{}`, an array, a string); `buildShareUrl` produces `origin + pathname + ?session=<encoded>` and drops any other query params present on `window.location`; `copySessionLink` calls `navigator.clipboard.writeText` with the exact `buildShareUrl` output and resolves `true`, and resolves `false` (not throw) when the clipboard write rejects (mock `navigator.clipboard.writeText` to reject); `getSessionSharePayload()` reflects a mocked `window.location.search` at **module import time** (this needs `vi.resetModules()` + dynamic re-import per case, since the value is a module-level constant computed once — same test-setup shape `seedUtils.test.ts`, if it exists, would already need for its own overrides — confirm the existing pattern there and reuse it).
- **`sessionDiff.test.ts`:** `applySessionPayload(payload, { skipLocaleRebuild: true })` does NOT call `retransmitWorld` (mock it, assert zero calls) but still applies `globalAudio`/`robotOverrides`/`companyDiffs`/`userCreatedCompanies` exactly as the no-options call does; `applySessionPayload(payload)` (no options / `{}`) is unchanged from today's behavior (existing tests must pass unmodified).
- **`OceanScene.test.tsx`:** when `getSessionSharePayload()` returns a payload (mocked), the mount effect calls `applySessionPayload` with `{ skipLocaleRebuild: true }` after `initializeLocale`; when it returns `null` (the common case), `applySessionPayload` is never called.
- **`SessionListItem.test.tsx`:** clicking Share calls `copySessionLink(entry.payload)` (not `buildSessionPayload()` — regression guard that the per-row button shares the *stored* payload, not live state); on success, "Link copied" appears; on failure (mocked rejection), it does not.
- **`SessionsPanel.test.tsx`:** clicking Share calls `copySessionLink(buildSessionPayload())` (regression guard that the panel-level button shares *live* state, not `listSessions()`/local storage); same success/failure note behavior as above.
- **`attenuationStyleStore.test.ts`/`localeStore.test.ts`** (if they test the module-level defaults, per existing coverage): a mocked `?session=` param produces `DEFAULT_ATTENUATION_STYLE_NAME`/`DEFAULT_LOCALE_COORDINATES` matching the payload's exact (unsanitized) `attenuationStyleName`/`coordinates`, taking priority over a simultaneously-present `?seed=`/`?x=`/`?y=`.

### 5.3 Success criteria

1. Round-trip fidelity: encoding then decoding a `SessionPayload` produces a deep-equal result, including non-Latin1 strings.
2. A malformed or absent `?session=` param never throws anywhere in the boot path — the app boots normally (fresh random world), same as today.
3. The prove-it-style boot check: given a mocked share payload, `DEFAULT_ATTENUATION_STYLE_NAME` equals the payload's exact `attenuationStyleName` string (not lowercased/stripped) and `DEFAULT_LOCALE_COORDINATES` equals its `coordinates` — before any component mounts.
4. `applySessionPayload(payload, { skipLocaleRebuild: true })` never calls `retransmitWorld` — the one behavior this whole phase depends on to avoid a redundant/wasteful re-spawn on top of phase 1's already-correct locale.
5. Both Share buttons' existing-behavior regression guards (§5.2) pass — row shares stored, panel shares live.
6. `npm run build:types`, `npm run lint`, `npm test` (full suite), `npm run build` all clean.
7. **Manual browser check required** (unlike World Clock, which had nothing to click): open the app, Save a session with a distinctive Attenuation Style name and at least one robot audio edit, click Share Session (panel-level), open the copied link in a new tab, and confirm — by eye — no flash of a different world before the shared one appears, and that the Attenuation Style name displayed matches exactly (not lowercased).

### 5.4 Verification order

`npm run build:types` → `npm run lint` → `npm test` → `npm run build` → manual browser check (§5.3 item 7).

---

## 6. Documentation & Git/Workflow Context

- **Docs to update:** `docs/SESSION_STORAGE.md` — document the share-link mechanism and its relationship to the existing local-CRUD payload. `docs/todo/roadmap.md` Phase 21 — mark in progress, then done, following the citation style of completed phases (20, 20.5).
- **Branch:** new branch off `main`, name left for the Plan phase, following the existing `feature/[phase-slug]` convention (e.g. `feature/shareable-link`).
- **Commits:** one per task, tests with their code; attribution per this session's rules. **PR:** references this spec; reviewed by another contributor per `CLAUDE.md`.
- **Sequencing:** touches `sessionDiff.ts`, `attenuationStyleStore.ts`, `localeStore.ts`, `OceanScene.tsx`, and the Sessions panel components — no known overlap with any other in-flight branch as of this writing.

---

## 7. Open Questions & Risks

**All three resolved by Crawford, 2026-09-28:**

1. **Resolved — ditch `?seed=`/`?x=`/`?y=` entirely, not just avoid reusing them.** Crawford's call: those params existed purely for reproducible debugging, and the new `?session=` link is a strictly better tool for that same purpose (exact reproduction, not just a pinned seed/coordinate pair). So this phase removes their URL-reading at boot (`seedUtils.ts`'s module-level parsing, `main.tsx`'s post-render `setGlobalAttenuationStyleSeedOverride(seedParam)` block) — see new Task 0 in the task plan. **This also fully resolves the original concern below** (reusing a *persistent* override would sanitize the name and leak into later-created Attenuation Styles) **since nothing populates that override from a URL anymore.** The underlying `setGlobalAttenuationStyleSeedOverride`/`getGlobalAttenuationStyleSeedOverride`/`setLocaleCoordinateOverride`/`getLocaleCoordinateOverride` functions themselves are NOT removed — they're general-purpose primitives still used by tests, `AudioDebugHud.tsx` (read-only display), and `getSeededVal.ts`/`noiseMaps.ts` (which mix the override into their own seed formulas when something *has* set it) — only their URL-param *entry point* goes away. Ripping out the primitives themselves would be a separate, larger refactor into shared seeded-generation machinery, out of proportion to this phase.
   - §4.4's design (`DEFAULT_ATTENUATION_STYLE_NAME`/`DEFAULT_LOCALE_COORDINATES` read the share payload's exact values directly, bypassing `resolveDefaultAttenuationStyleName()`/the override chain) is **unchanged** by this — it was already the correct approach independent of whether `?seed=` exists, since it avoids the sanitization problem either way. What's dropped is only the "share payload takes priority over `?seed=`/`?x=`/`?y=` when both are present" concern (§4.4's last paragraph) — moot once those params don't exist.
   - **Known limitation, still applies:** a session saved while the *setter functions* were called directly (e.g. a future dev tool, or a test fixture) rather than a real prior boot could theoretically diverge — vanishingly unlikely in practice now that no URL path drives them.
2. **Resolved — confirmed, `skipLocaleRebuild` option approach.** As proposed.
3. **Resolved — "Link copied" fades after 5 seconds; a clipboard-write failure shows "Unable to copy" instead of staying silent.** Both buttons get a `setTimeout`-driven auto-dismiss (UI-only, not musical timing — `CLAUDE.md`'s no-timer guardrail is scoped to audio scheduling and doesn't apply here) and an explicit error string on failure, replacing §4.5's earlier no-auto-dismiss/silent-failure draft.
