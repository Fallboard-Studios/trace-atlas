# Phase Spec: Short World Link — `?seed=&x=&y=` plus one compact diff blob

> **Execution Commands**
> - Build check: `npm run build` (also prints the bundle size: record the delta fflate adds, §5)
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - No phone gate and no `npm run perf:audio` A/B (§3): the audio graph, the generators and every seeded value are
>   untouched; only the wire format, its two buttons and some dead seed-override code change.

Source of intent: [docs/intent/short-world-link.md](../intent/short-world-link.md) (confirmed 2026-10-24 via
`interview-me`, six questions, two pre-interview guesses overturned by the size measurement that preceded it). Backlog
item [19](../todo/archive/backlog-archive.md#19-short-world-link-bring-back-seed-x-and-y), the first item of
[plan.md](../todo/plan.md)'s Stage 2. **Proposed roadmap number: 56** (55 is the highest in use; the archive holds
nothing above it) — this spec gives the item its number, the plan's last task moves backlog 19 to the archive under it.
Supersedes the wire format of roadmap [21](../todo/archive/roadmap-archive.md#21-sector-settings-shareable-link-importexport)
([SECTOR_SETTINGS_SHARABLE_LINK.md](SECTOR_SETTINGS_SHARABLE_LINK.md)) while keeping its boot seam, and finishes the
dead-code sweep roadmap 48 left to this item (the `seedUtils.ts` override primitives).

Survey basis (2026-10-24, against `main` at `fee2de9e`; every citation below was read, not recalled). Where the survey
disagrees with the intent, the survey wins and the difference is named here:

- **The wire today.** `src/utils/sessionShareUtils.ts`: `SESSION_PARAM = 'session'` (`:19`); `CompactSessionPayload`
  (`:38–58`) carries `v`, `n`, `c`, `g` always and `b`/`sf`/`sd`/`hm`/`pv`/`lb`/`gll`/`r`/`d`/`u` when present;
  `encodeSessionPayload` is `btoa` over UTF-8 JSON (`:441`), `decodeSessionPayload` fails soft (`:449`);
  `SESSION_SHARE_PAYLOAD` is decoded once at module load (`:463`); `getSessionSharePayload` / `consumeSessionSharePayload`
  (`:471`, `:484`) are the seam; `buildShareUrl` composes `origin + pathname + ?session=` and drops every other param
  (`:494`); `copySessionLink` (`:502`) is what both Share buttons call through `useShareStatus.ts`.
- **The boot seam.** `src/stores/attenuationStyleStore.ts:23` pins `DEFAULT_ATTENUATION_STYLE_NAME` and
  `src/stores/localeStore.ts:79–83` pins `DEFAULT_LOCALE_COORDINATES` from `getSessionSharePayload()` at module load;
  `OceanScene.tsx:269` consumes the payload once and calls `applySessionPayload(payload, { skipLocaleRebuild: true })`.
  Everything on that path is synchronous.
- **What `applySessionPayload` fills in itself** (`src/utils/sessionDiff.ts:531`): the pacing scalars are skipped when
  `undefined` (`:579–584`); `lfoBank` / `globalLfoLinks` are skipped when `undefined` but a *partial* record is backfilled
  from `DEFAULT_BANK_LFO` / `DEFAULT_LFO_LINK` (`:71`, `:116`), **not from the seed**; `globalAudio` is required and
  written whole (`:565`) after `withGlobalAudioDefaults`, whose rule is "blocks are whole, never deep-merged"
  (`src/types/globalAudio.ts:294`). So a diff against the seed cannot simply hand partial world-level fields to this
  function; the decoder must produce a whole payload (assumption 6).
- **The generators are pure and synchronous**: `generateGlobalAudioSettings`, `generatePingVarianceAutomation`,
  `generateSwellFrequency`, `generateSwellDuration`, `generateHumanize`, `generateLfoBankSettings`,
  `generateGlobalLfoLinks` (`src/utils/globalAudioSeed.ts:216–663`) and `generateAttenuationStyleBpm`
  (`src/utils/bpmSeed.ts:37`), each `(attenuationStyleId, attenuationStyleName)`; the id is only the noise-map cache key
  (`noiseMaps.ts:20`), the seed is the name. `evictAttenuationStyleNoiseMap` (`noiseMaps.ts:71`) exists. None of these
  modules imports a store (checked: `globalAudioSeed` → `audioRigConfig`, `sliderLogMath`, `tempoSync`, `lfoShapeDraw`,
  content, types, data), so `worldLink.ts`, and through it `sessionShareUtils.ts`, can import them without a cycle
  through the stores that import it.
- **The baseline for the pacing scalars** is the generator's value, not the store's: `regenerateGlobalAudioFromSeed`
  (`src/stores/audioStore.ts:581–630`) seeds `pingVarianceAutomation`, `swellFrequency`, `swellDuration` and `humanize`
  once and carries them forward across later style switches, and carries `compressorBeforeDelay` forward always (the
  generator returns the default `false` for it).
- **The override primitives** (`src/utils/seedUtils.ts`): `deriveAttenuationStyleSeed` consults
  `GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE` (`:17`); `setGlobalAttenuationStyleSeedOverride` / `get…` (`:41`, `:50`),
  `parseCoordinateParam` (`:60`), `LocaleCoordinateOverride` + `setLocaleCoordinateOverride` / `get…` (`:65–89`),
  `resolveDefaultAttenuationStyleName` (`:127`, **not in the intent's list; it only wraps the getter and has no production
  caller**). The getter is mixed into `precomputeDataX`'s key (`getSeededVal.ts:29–30`) and `getLocaleNoiseMap`'s key
  (`noiseMaps.ts:55–56`) and read by `AudioDebugHud.tsx:44` (whose world line has read `random` since 2026-09-28,
  `hudLines.ts:112`). Production callers of the setters: none. Test references: `seedUtils.test.ts` 38,
  `noiseMaps.test.ts` 4, `getSeededVal.test.ts` 3, `attenuationStyleStore.test.ts` 2, `localeStore.test.ts` 2.
- **Three buttons make a link today, not two.** `SessionListItem.tsx:95` (**Share**, a saved row's payload) and
  `SessionsPanel.tsx:117` (**Share live**, `buildSessionPayload()`, the Save & Share row from the layout-rework sketch,
  Crawford 2026-10-10) both exist; the intent names only the saved row's Share and a new **Copy link** in Settings → Seeds
  for the live world. Assumption 9 keeps Share live; §7 item 1 offers the cut.
- **Settings → Seeds** is `SectorSettingsDrawer.tsx`; its status block (`:84–89`) already renders
  `{name} · ({x}, {y})` under a `DualLabel` header. Content area `sector.*` (`src/content/copy/sector.ts`); the status
  strings `session.status.linkCopied` / `session.status.copyFailed` exist (`session.ts:31–32`).
- **The perf harness.** The `--world name:x:y` option is `perf:audio`'s (`scripts/perf/audio-load-lib.mjs:55` already
  emits `seed=&x=&y=`; `expectedCoordinates` at `:67` decodes a `?session=` base64 payload for the pin check), **not
  `profile.mjs`'s** as the intent and backlog say (`profile.mjs` takes only `--url`). The five recorded Pixel links D1–D5
  in [scratchy-audio-phones.md](../todo/scratchy-audio-phones.md) are `?session=` links that Stage 1's on-hold phone
  sitting still means to carry (plan.md); §7 item 3.
- **The address bar is already rewritten by one system**: `audioBudgetSystem.ts:135` mirrors `?load=` through
  `withParam` (`audioBudget.ts:162`), which keeps every other param byte-for-byte. Other readers: `debugParams.ts:44`
  (`debug`, `latency`), `audioBudget.ts:194–204` (`load`, `fxLoad`). None reads `seed`, `x`, `y`, `theme` or `session`
  besides `sessionShareUtils.ts`.
- **`fflate` is not in the lockfile**; `lz-string` is transitive only. `vite.config.ts` serves under `base: '/trace-atlas/'`,
  which `buildShareUrl`'s `origin + pathname` already honours.
- **`src/types/session.ts:83–87`** still says `lfoBank` / `globalLfoLinks` are "never diffed … no meaningful untouched
  baseline"; the transmission presets (`src/data/transmissionPresets.ts`) are whole payloads applied by `OffScreen.tsx:84`,
  and their test round-trips `encodeSessionPayload` / `decodeSessionPayload` (`transmissionPresets.test.ts:177`).

**Assumptions** (each is a decision this spec makes; the intent left them open or the survey forced them; §7 lists the
ones worth a veto):

1. **Param names:** `seed`, `x`, `y` (the identity), `s` (the blob, Crawford's working name kept — no reason surfaced to
   change it), `theme` (reserved: never written, ignored when read). `session` is not read. A link never carries any other
   param: `debug`, `load`, `fxLoad`, `latency` are dropped on the way out as today.
2. **The blob is `s=<version>.<base64url>`:** one digit wire version (`1`), a literal `.` (URL-safe, outside the base64url
   alphabet), then unpadded base64url of raw-deflated UTF-8 JSON. The version sits *outside* the compression so a reader
   can refuse a blob without inflating it, and so a later wire need not be deflate at all. A blob whose version is not `1`,
   whose text is not base64url, which does not inflate, or whose JSON fails the shape check is dropped whole; the link
   loads as the bare triple. No per-generator version.
3. **The blob JSON is `CompactWorldDiff`**: today's `CompactSessionPayload` minus `v`, `n`, `c`, with `g` now a partial
   record over `GlobalAudioSettings`' top-level keys, `lb` a partial record over the lanes, `gll` a partial record over the
   global targets, the pacing scalars present only when they differ from the seed, and `r` / `d` / `u` exactly as today.
   The payload-schema version is implied: wire version 1 means `SessionPayload.version` 2. An empty diff (`{}`) is not
   written at all — the link is the bare triple.
4. **Diff granularity against the seed:** `globalAudio` per top-level key (a whole effect block when any leaf differs, so a
   block that lost its `sync` key still travels and restores whole — the rule `withGlobalAudioDefaults` already states;
   `compressorBeforeDelay` is one such key against `false`); `lfoBank` per lane, whole lane; `globalLfoLinks` per target,
   whole link; `bpm`, `swellFrequency`, `swellDuration`, `humanize`, `pingVarianceAutomation` each on its own. Robot
   overrides, company diffs and user companies are unchanged (already diffed against the roster baseline by
   `buildSessionPayload`). Comparison is `deepEqual` on the payload as `buildSessionPayload` builds it (swell bases applied,
   drifts at two decimals), against the generators' output for the payload's name. No float rounding beyond what the
   payload already carries (the intent's 4 dp is out of scope; §7 item 4).
5. **The baseline is regenerated with a scratch id and evicted.** `generateWorldSeedBaseline(name)` calls the eight
   generators with `attenuationStyleId = '__world-link__'` and the exact name, then `evictAttenuationStyleNoiseMap` so the
   cache does not grow; the output equals what boot seeds for that name because the seed is the name alone (assumption 10
   makes that literally true). The encoder never reads a store: it takes a `SessionPayload`.
6. **The decoder returns a whole `SessionPayload` or `null`.** `null` only when none of `seed`, `x`, `y`, `s` is present.
   Otherwise: `attenuationStyleName` = the exact `seed` value, or `generateRandomAttenuationStyleName()` when absent or
   empty; each coordinate = its param when it is a plain optionally-negative integer string, else `randomCoordinate()` for
   that axis alone; every world-level field = the blob's value where the blob carries it, else the regenerated baseline's
   (so `applySessionPayload` never sees a partial `lfoBank` and never backfills from `DEFAULT_BANK_LFO`); `robotOverrides`
   / `companyDiffs` / `userCreatedCompanies` from the blob or empty; `version: 2`. A blob without an identity is applied to
   whatever world the randoms produce; a robot id the roster does not have is skipped by `applySessionPayload`'s own loop.
   `decode(encode(p))` is deep-equal to `p` for any payload `buildSessionPayload` produces — the round-trip test.
7. **The seam is unchanged.** `SESSION_SHARE_PAYLOAD` is now `decodeWorldLink(window.location.search)`;
   `getSessionSharePayload`, `consumeSessionSharePayload`, the two store reads and `OceanScene`'s one apply keep their
   code. A bare triple therefore also runs `applySessionPayload` once at boot with values equal to the ones the store just
   seeded — a no-op in effect, and the price of one rule instead of two.
8. **Untrusted input, same guards as today:** `isValidCompactWorldDiff` type-checks every optional field the way
   `isValidCompactSessionPayload` does; the per-field drops (`isSendFraction`, `isFiniteNumber`, `isCurveName`,
   `NOTE_VALUE_BY_CODE`, the target-id filters) stay; `withGlobalAudioDefaults`' kind check runs on the merged
   `globalAudio`; the store setters clamp on apply. The name is not capped (parity with `n` today; §7 item 6).
9. **Three buttons, one encoder.** A new **Copy link** `Button` in `SectorSettingsDrawer`'s status block, under the
   name-and-coordinates line, calls `useShareStatus().share(buildSessionPayload())` and shows the same two status notes
   as the Sessions panel. **Share live** (Sessions panel) and **Share** (saved row) are unchanged and now emit the new
   format through `copySessionLink`. Content: one new key `sector.copyLink` (human `Copy link`; lore is Crawford's column);
   the status notes reuse `session.status.linkCopied` / `session.status.copyFailed` (one entry per concept).
10. **The override primitives are deleted, not kept behind.** `setGlobalAttenuationStyleSeedOverride`,
    `getGlobalAttenuationStyleSeedOverride`, `parseCoordinateParam`, `LocaleCoordinateOverride`,
    `setLocaleCoordinateOverride`, `getLocaleCoordinateOverride`, `resolveDefaultAttenuationStyleName` and their tests go;
    `deriveAttenuationStyleSeed` becomes the pure lowercase-and-strip; `precomputeDataX`'s key is `dataId` and
    `getLocaleNoiseMap`'s is `${x}:${y}` (the formulas they already use when no override is set, so no seeded value moves);
    the HUD's world line reads the current Attenuation Style's name. `parseCoordinateParam`'s integer rule lives on inside
    the decoder as a private helper.
11. **The address bar is never written by this phase.** No `history.replaceState`, no URL update on edit or Retransmit.
    `audioBudgetSystem`'s `?load=` mirroring already preserves the link's params through `withParam`, so a pasted link
    keeps its `seed`, `x`, `y`, `s` after the budget writes.
12. **The perf harness follows.** `expectedCoordinates` returns the spec's `x:y` always (the `session` branch and its
    `from` hint go — the identity is now in the URL for every link); `buildPageUrl` is already right. The five D1–D5
    links are re-minted in the new format by a one-off scratch script (old base64 → `SessionPayload` → new encoder) and
    recorded in scratchy-audio-phones.md in the same docs task that removes the old reader.
13. **Transmission presets are untouched** as data; `OffScreen` applies them as before. Their share form (the bare triple
    a preset "prints") is backlog 5's interview. One consequence recorded, not fixed: a preset whose captured rig predates
    today's generators encodes with a blob, not as a bare triple, until Crawford re-captures the three.
14. **Pre-v1: nothing is kept for old links.** No `session` fallback, no deprecation note in the UI, no migration for blobs
    written under an older generator (the intent's own words). Local saves are unaffected: they store the payload object.

---

## 1. Overview & Claude Explanation

A shared world becomes a link a person can read: `?seed=<exact Attenuation Style name>&x=<int>&y=<int>`, and when the
live world differs from what that seed regenerates, one more param `s=1.<blob>` carrying only the difference. The encoder
takes a `SessionPayload` (from `buildSessionPayload()` for the live world, or a saved row's stored payload), regenerates
the seed's own Audio Rig, LFO Bank, global links and pacing with the pure generators, keeps only what differs (block by
block, lane by lane, target by target, scalar by scalar; the robot and company diffs already are differences), writes that
as the existing abbreviated-key JSON, raw-deflates it with `fflate` and prints it as base64url behind a one-character wire
version. The decoder runs synchronously at module load, as `?session=` did: it reads the three identity params leniently
(a missing or malformed part takes the random a fresh world would get), inflates the blob if its version is the one it
knows (otherwise the blob is simply gone), fills every world-level field the blob omits from the same generators, and hands
one whole `SessionPayload` to the unchanged `getSessionSharePayload` / `consumeSessionSharePayload` seam, so the locale is
pinned before first paint and `applySessionPayload` runs once after mount, exactly as today. Nothing is sanitised, nothing
persists past the boot read, and the module-level seed override that made the old `?seed=` dangerous is deleted along
with its coordinate twin. A new **Copy link** in Settings → Seeds and the two existing Share buttons all go through the one
encoder, which always emits the shortest correct form: an untouched world is about 25 characters, Crawford's fully edited
twelve-robot world about 1,600 instead of 14,000.

### 1.1 The URL

```text
?seed=n40dh8p8&x=29&y=-14                         an untouched world (24 characters of params)
?seed=Pelagos%207%21&x=12&y=68                     case and punctuation round-trip exactly; `+` is a space
?seed=n40dh8p8&x=29&y=-14&s=1.eJyrVkrOz1PSUUrOL…   an edited world: identity, then one blob
?x=5                                               loads: random name, x = 5, random y
?s=1.eJy…                                          loads: a random world with the blob applied on top
?seed=n40dh8p8&x=29&y=-14&s=2.AAAA                 loads the bare world: unknown wire version, blob dropped
?session=eyJ2IjoyLC…                               loads a random world: not read
```

Precedence: `seed` / `x` / `y` always define the world; the blob is applied on top, never the other way round. `theme` is
reserved (absent means classic) and ignored.

### 1.2 Data shapes

```ts
// src/utils/worldLink.ts (new)
export const WORLD_LINK_PARAMS = { seed: 'seed', x: 'x', y: 'y', blob: 's', theme: 'theme' } as const;
export const WORLD_LINK_BLOB_VERSION = 1;

/** The params for a payload: always seed/x/y; `s` only when the world differs from its seed. */
export function encodeWorldLinkParams(payload: SessionPayload): URLSearchParams;
/** The payload a page's search string describes, or null when it names no world at all (assumption 6). */
export function decodeWorldLink(search: string): SessionPayload | null;

// src/utils/seedBaseline.ts (new) — the world-level fields a name regenerates; no store import
export interface WorldSeedBaseline {
  globalAudio: GlobalAudioSettings;            // generateGlobalAudioSettings (compressorBeforeDelay false)
  lfoBank: Record<LfoLaneId, BankLfoSettings>; // generateLfoBankSettings
  globalLfoLinks: Record<GlobalLfoTargetId, LfoLink>;
  bpm: number; swellFrequency: number; swellDuration: number; humanize: number; pingVarianceAutomation: number;
}
export function generateWorldSeedBaseline(attenuationStyleName: string): WorldSeedBaseline; // scratch id, evicted
/** Only what differs (assumption 4). Empty object when nothing does. */
export function diffWorldAgainstSeed(payload: SessionPayload, baseline: WorldSeedBaseline): WorldDiff;
/** A whole payload: identity + blob values where present, else the baseline's. */
export function fillWorldFromSeed(identity: WorldIdentity, diff: WorldDiff, baseline: WorldSeedBaseline): SessionPayload;

export interface WorldIdentity { attenuationStyleName: string; coordinates: { x: number; y: number } }
export interface WorldDiff {
  globalAudio?: Partial<GlobalAudioSettings>;
  lfoBank?: Partial<Record<LfoLaneId, BankLfoSettings>>;
  globalLfoLinks?: Partial<Record<GlobalLfoTargetId, LfoLink>>;
  bpm?: number; swellFrequency?: number; swellDuration?: number; humanize?: number; pingVarianceAutomation?: number;
  robotOverrides?: SessionPayload['robotOverrides'];
  companyDiffs?: SessionPayload['companyDiffs'];
  userCreatedCompanies?: SessionPayload['userCreatedCompanies'];
}

// src/utils/worldDiffCodec.ts (new) — the JSON layer, renamed to what it now is, in its own module so the link and the
// seam both import it and neither imports the other's importer (§1.3, risk 2; amended 2026-10-25)
interface CompactWorldDiff {           // was CompactSessionPayload; v / n / c gone
  g?: Partial<GlobalAudioSettings>;    // per top-level key
  b?: number; sf?: number; sd?: number; hm?: number; pv?: number;
  lb?: Partial<Record<LfoLaneId, CompactBankLfoSettings>>;
  gll?: Partial<Record<GlobalLfoTargetId, CompactLfoLink>>;
  r?: Record<string, CompactRobotOverrideDiff>;
  d?: Record<string, CompactCompanyDiff>;
  u?: SessionPayload['userCreatedCompanies'];
}
export function toCompactWorldDiff(diff: WorldDiff): CompactWorldDiff;
export function fromCompactWorldDiff(parsed: unknown): WorldDiff | null;   // the shape check + per-field drops
```

The blob text: `const json = JSON.stringify(toCompactWorldDiff(diff)); const bytes = deflateSync(strToU8(json)); return
`${WORLD_LINK_BLOB_VERSION}.${toBase64Url(bytes)}`;` and the inverse with `inflateSync` / `strFromU8` inside one `try`.
`toBase64Url` is `btoa` over the byte string with `+/` → `-_` and padding stripped; the inverse restores both. The
`TextEncoder`-based helpers that exist today are replaced by `fflate`'s `strToU8` / `strFromU8` (same UTF-8 contract).

### 1.3 Where each piece lives, and what moves

- **`worldLink.ts`** owns the params, the wire version, the base64url pair and the lenient identity read (the integer
  rule from the deleted `parseCoordinateParam`). It imports `seedBaseline.ts`, `worldDiffCodec.ts`,
  `seedUtils.ts`' two random helpers and `fflate`. No store, and never `sessionShareUtils.ts`.
- **`worldDiffCodec.ts`** (amended 2026-10-25) owns the compact JSON layer: `CompactWorldDiff` and the per-field
  compact shapes (`CompactRobotOverrideDiff`, `CompactBankLfoSettings`, `CompactLfoLink`, …), every `toCompact*` /
  `fromCompact*` helper and per-field guard, the note-value code table, and `toCompactWorldDiff` /
  `isValidCompactWorldDiff` / `fromCompactWorldDiff`. It imports types, data tables and `withGlobalAudioDefaults` only:
  no store, no `seedBaseline.ts` beyond the `WorldDiff` type, never `worldLink.ts` or `sessionShareUtils.ts`. **Why its
  own module:** with the codec inside `sessionShareUtils.ts`, the seam's import of `decodeWorldLink` closes a cycle
  (`sessionShareUtils` → `worldLink` → `sessionShareUtils`). Loaded through a store, `worldLink` evaluates first and
  boot works; loaded `worldLink`-first (its own test, any future importer), `sessionShareUtils` evaluates first and its
  module-level `decodeWorldLink(window.location.search)` reads `WORLD_LINK_PARAMS` before it is initialised and
  throws. The graph is now one way: `sessionShareUtils` → `worldLink` → `worldDiffCodec` / `seedBaseline`.
- **`seedBaseline.ts`** imports the eight generators, `evictAttenuationStyleNoiseMap`, `deepEqual` (moved from
  `sessionDiff.ts` to `src/utils/math.ts` or a sibling so neither module imports the store-bound `sessionDiff`) and the
  three id lists. No store.
- **`sessionShareUtils.ts`** keeps the module-level decode (now `decodeWorldLink`), the seam, `buildShareUrl` (now
  `url.search = encodeWorldLinkParams(payload).toString()`) and `copySessionLink`, importing only `worldLink.ts` for the
  link. The compact codec moves out to `worldDiffCodec.ts`. `SESSION_PARAM`, `CompactSessionPayload`,
  `encodeSessionPayload`, `decodeSessionPayload`, `isValidCompactSessionPayload`, `encodeBase64Utf8` /
  `decodeBase64Utf8` go.
- **`sessionDiff.ts`**: `buildSessionPayload` and `applySessionPayload` are unchanged in behaviour; the only edit is the
  `deepEqual` move and the two "never diffed" comments (`:396–398`), which now point here.
- **`src/types/session.ts`**: the `lfoBank` / `globalLfoLinks` doc comment (`:83–87`) and the pacing comment (`:90–95`)
  drop "never diffed … no meaningful baseline" and say the share link diffs them against the seed while a local save keeps
  them whole.
- **`seedUtils.ts`** after the cut: `deriveAttenuationStyleSeed` (pure), `generateRandomAttenuationStyleName`,
  `randomCoordinate`. `getSeededVal.ts` and `noiseMaps.ts` lose their imports of the getter; `AudioDebugHud.tsx` passes
  `selectCurrentAttenuationStyle(s)?.name` as `seed`.
- **`SectorSettingsDrawer.tsx`**: `COPY_LINK_SCHEMA` in `sectorSettingsConfig.ts` (`id: 'sectorSettings.copyLink'`,
  `...labels('sector.copyLink')`); the button and the two status spans inside `.sector-settings-drawer__status`, the
  status spans with the same `role="status"` / `role="alert"` pair the Sessions panel uses; styles in
  `SectorSettingsDrawer.css`.
- **`scripts/perf/audio-load-lib.mjs`**: `expectedCoordinates(world)` → `{ x: world.x, y: world.y }`; `audio-load.mjs`'s
  hint text loses its `session` branch.

### 1.4 Lenient loading, spelled out

| URL | name | x | y | world-level fields | overrides |
|---|---|---|---|---|---|
| nothing relevant | `getSessionSharePayload()` is `null`; the stores' own randoms, as today | | | | |
| `seed` only | exact | random | random | seed's | none |
| `x` only (`y` absent or `1.5` or `abc`) | random | 5 | random | seed's | none |
| triple | exact | int | int | seed's | none |
| triple + blob v1 | exact | int | int | blob's where present, else seed's | blob's |
| triple + blob v≠1 / malformed | exact | int | int | seed's | none |
| blob only | random | random | random | blob's over the random seed's | blob's (unmatched robot ids skipped) |
| `session` only | `null` | | | | |

"Random" uses `generateRandomAttenuationStyleName()` / `randomCoordinate()` — the same calls the stores make, so tests
that mock them (`vitest.setup.ts`) see the same fixed coordinates.

---

## 2. Target File Structure

```text
package.json / package-lock.json                   + fflate (the one new dependency, approved in the interview)
src/
├── utils/
│   ├── worldLink.ts / .test.ts                    NEW — params, wire version, base64url, lenient decode, encode
│   ├── seedBaseline.ts / .test.ts                 NEW — generateWorldSeedBaseline, diffWorldAgainstSeed, fillWorldFromSeed
│   ├── worldDiffCodec.ts / .test.ts               NEW — CompactWorldDiff codec and its per-field helpers (from sessionShareUtils)
│   ├── sessionShareUtils.ts / .test.ts            seam reads decodeWorldLink; buildShareUrl composes; the codec moved out;
│   │                                                SESSION_PARAM, encode/decodeSessionPayload, the base64 helpers deleted
│   ├── sessionDiff.ts / .test.ts                  deepEqual moved out; two comments
│   ├── math.ts / .test.ts                         + deepEqual (from sessionDiff)
│   ├── seedUtils.ts / .test.ts                    the override primitives, parseCoordinateParam, resolveDefaultAttenuationStyleName deleted
│   ├── getSeededVal.ts / .test.ts                 precomputeDataX key = dataId
│   └── noiseMaps.ts / .test.ts                    getLocaleNoiseMap key = `${x}:${y}`
├── types/session.ts                               doc comments only
├── stores/
│   ├── attenuationStyleStore.ts / .test.ts        unchanged code; the test's override cases go
│   └── localeStore.ts / .test.ts                  comments; the test's override cases go
├── components/
│   ├── debug/AudioDebugHud.tsx / .test.tsx        world line reads the style name
│   ├── panels/screen/console/SectorSettingsDrawer.tsx / .test.tsx / .css   Copy link + status notes
│   └── panels/screen/worldView/OceanScene.test.tsx                          the ?session= cases become world-link cases
├── data/
│   ├── sectorSettingsConfig.ts                    COPY_LINK_SCHEMA
│   └── transmissionPresets.test.ts                round-trip through the new codec
└── content/copy/sector.ts                         'sector.copyLink'
scripts/perf/
├── audio-load-lib.mjs / audio-load-lib.test.mjs   expectedCoordinates = the spec
└── audio-load.mjs                                 the pin-check hint
docs/
├── SESSION_STORAGE.md                             "Shareable Links" rewritten for the new wire
├── PROCEDURAL_GENERATION.md                       lines 15–45 rewritten: no override, the world link pins a world
├── PERFORMANCE.md                                 :52, :295–297, :387–388 — `--world` is live again; D1–D5 re-minted
├── todo/scratchy-audio-phones.md                  D1–D5 in the new format
├── specs/SECTOR_SETTINGS_SHARABLE_LINK.md         header note: wire superseded here, seam kept
├── todo/roadmap.md                                56 (new entry, "As built"); plan.md's Stage 2 line deleted; backlog 19 archived
└── intent/short-world-link.md                     committed with this spec (untracked on main today)
```

Nothing under `src/engine/`, `src/systems/`, the generators (`globalAudioSeed.ts`, `bpmSeed.ts`, `spawnSystem.ts`), the
session store or `sessionStorageEngine.ts` changes. `SessionEntry` and the local save format are untouched.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Anything else is a conflict to surface, not a quiet widening.
- **No seeded value moves.** The generators are read, never edited; the override removal changes a key formula only on a
  code path nothing in production reached. `npm test`'s existing seed-determinism cases are the proof.
- **The boot seam stays synchronous.** No `CompressionStream`, no `await` anywhere between `window.location.search` and
  `getSessionSharePayload()`. `fflate`'s `*Sync` functions only.
- **One new dependency, `fflate`, named imports only** (`deflateSync`, `inflateSync`, `strToU8`, `strFromU8`) so the
  bundle takes the two codecs and nothing else; the `npm run build` size delta is recorded at the checkpoint. Nothing else
  is added; `lz-string` is not.
- **State stays JSON-serialisable; nothing new in Zustand.** Encoder, decoder and baseline are pure helpers; the decoded
  payload lives in the existing module-level constant.
- **Content:** one new key, `sector.copyLink`; no literal in a component or config; the ESLint content rule and
  `content.test.ts` are the guard. Lore for the key is left for Crawford's column (a `human` alone is valid).
- **Copy, not behaviour, for themes:** `theme` is read by nothing and written by nothing; no branch on it anywhere.
- **The address bar is never written** by any code this phase adds (assumption 11).
- **Tests exercise code, not text** (CLAUDE.md, 2026-10-23): no docs guard, no source scan; the docs tasks are Reads.
- **Pre-v1:** no `session` fallback, no compatibility shim, no "legacy link" note.
- **Ask first:** a second dependency; capping or trimming the name; rounding floats on the wire; a different blob param name
  than `s` once §7 is answered; any change to `applySessionPayload`'s behaviour; touching the transmission presets' data.
- **Never:** `.env*`, `node_modules/`, build output; relaxing a CLAUDE.md guardrail; reviving the module-level override in
  any form; writing a display string outside `src/content/`.

---

## 4. Code Style & Architecture Conventions

```ts
// src/utils/worldLink.ts — the lenient identity read; every part falls back on its own (assumption 6)
const INTEGER = /^-?\d+$/;
function readCoordinate(raw: string | null): number {
  return raw !== null && INTEGER.test(raw) ? Number(raw) : randomCoordinate();
}

export function decodeWorldLink(search: string): SessionPayload | null {
  const params = new URLSearchParams(search);
  const seed = params.get(WORLD_LINK_PARAMS.seed);
  const blob = params.get(WORLD_LINK_PARAMS.blob);
  if (seed === null && blob === null && !params.has(WORLD_LINK_PARAMS.x) && !params.has(WORLD_LINK_PARAMS.y)) return null;
  const identity: WorldIdentity = {
    // Exact: URLSearchParams has already undone the percent-encoding and the `+`; nothing here lowercases or strips.
    attenuationStyleName: seed || generateRandomAttenuationStyleName(),
    coordinates: { x: readCoordinate(params.get(WORLD_LINK_PARAMS.x)), y: readCoordinate(params.get(WORLD_LINK_PARAMS.y)) },
  };
  // A blob of the wrong version, or one that will not inflate or parse, is no blob (SHORT_WORLD_LINK.md assumption 2).
  const diff = blob === null ? {} : (decodeBlob(blob) ?? {});
  return fillWorldFromSeed(identity, diff, generateWorldSeedBaseline(identity.attenuationStyleName));
}
```

```ts
// src/utils/seedBaseline.ts — one rule for every world-level field: present in the diff, or the seed's
export function fillWorldFromSeed(identity: WorldIdentity, diff: WorldDiff, baseline: WorldSeedBaseline): SessionPayload {
  return {
    version: 2,
    ...identity,
    // Per top-level key, never a deep merge inside a block (types/globalAudio.ts withGlobalAudioDefaults' rule).
    globalAudio: { ...baseline.globalAudio, ...diff.globalAudio },
    lfoBank: { ...baseline.lfoBank, ...diff.lfoBank },
    globalLfoLinks: { ...baseline.globalLfoLinks, ...diff.globalLfoLinks },
    bpm: diff.bpm ?? baseline.bpm,
    swellFrequency: diff.swellFrequency ?? baseline.swellFrequency,
    swellDuration: diff.swellDuration ?? baseline.swellDuration,
    humanize: diff.humanize ?? baseline.humanize,
    pingVarianceAutomation: diff.pingVarianceAutomation ?? baseline.pingVarianceAutomation,
    robotOverrides: diff.robotOverrides ?? {},
    companyDiffs: diff.companyDiffs ?? {},
    userCreatedCompanies: diff.userCreatedCompanies ?? [],
  };
}
```

```tsx
// SectorSettingsDrawer.tsx — the live world's Copy link, the Sessions panel's own hook and status pair
const { shareStatus, share } = useShareStatus();
…
<div className="sector-settings-drawer__status">
  <DualLabel … />
  <div className="sector-settings-drawer__status-line">{name} · ({x}, {y})</div>
  <Button schema={COPY_LINK_SCHEMA} face="single" onClick={() => share(buildSessionPayload())} />
  {shareStatus === 'copied' && <span className="sector-settings-drawer__share-status" role="status">{CONTENT['session.status.linkCopied'].human}</span>}
  {shareStatus === 'error' && <span className="sector-settings-drawer__share-status sector-settings-drawer__share-status--error" role="alert">{CONTENT['session.status.copyFailed'].human}</span>}
</div>
```

- Names: `WORLD_LINK_PARAMS`, `WORLD_LINK_BLOB_VERSION`, `encodeWorldLinkParams`, `decodeWorldLink`, `encodeBlob`,
  `decodeBlob`, `toBase64Url`, `fromBase64Url`, `WorldIdentity`, `WorldDiff`, `WorldSeedBaseline`,
  `generateWorldSeedBaseline`, `diffWorldAgainstSeed`, `fillWorldFromSeed`, `CompactWorldDiff`, `toCompactWorldDiff`,
  `fromCompactWorldDiff`, `isValidCompactWorldDiff`, `COPY_LINK_SCHEMA`, `sector.copyLink`.
- Comments cite this spec by assumption number where a choice is not obvious: the `.` separator and the outside version
  (2), block-level `g` (4), the scratch id (5), whole-payload decode (6), the name left exact and uncapped (6, 8), the
  kept Share live (9), the deleted primitives (10).
- `deepEqual` moves verbatim; it is the one comparison, for the diff and for the tests.
- Tests colocated; TDD per task (RED first); one commit per task; Prettier on touched files; the repo index is LF (the
  working tree is CRLF under autocrlf — match the sibling file, never mix within one). `fflate` is imported by name.

---

## 5. Testing & Verification Requirements

**Unit (Vitest), per module** — each case names its fixture's non-default values (the parity-fixture rule):

- `worldLink.test.ts`:
  - **Untouched world → bare triple.** A payload equal to `fillWorldFromSeed(identity, {}, baseline)` for name `n40dh8p8`,
    `(29, -14)` encodes to exactly `seed=n40dh8p8&x=29&y=-14` (no `s`); `decodeWorldLink('?' + that)` deep-equals the
    payload.
  - **Round trip.** A payload with every world-level field off its seed (a distinct non-default value in every effect
    block, every lane, two targets, each pacing scalar), twelve robot overrides each with two fields, one company diff and
    one user company: `decodeWorldLink(encode…)` deep-equals it; the blob starts with `1.`; the params are only
    `seed`, `x`, `y`, `s`.
  - **Name fidelity.** `Pelagos 7!`, `ÄÖÜ ñ`, a name with `&`, `=`, `+`, `%` and a leading/trailing space each round-trip
    byte-for-byte through `URLSearchParams`; nothing is lowercased or stripped.
  - **Lenient identity.** Each row of §1.4: `seed` only; `x` only; `y=1.5`; `y=abc`; `x=-0`; blob only; `session` only
    (`null`); nothing (`null`). The random fallbacks are asserted by spying `generateRandomAttenuationStyleName` /
    `randomCoordinate`, and only the missing parts call them.
  - **Version drop.** `s=2.<valid blob text>`, `s=1<no dot>`, `s=.abc`, `s=1.<not base64url>`, `s=1.<base64url of
    non-deflate bytes>`, `s=1.<deflate of "[]">`, `s=1.<deflate of '{"g":5}'>` each load the bare world (deep-equal to the
    untouched payload) and warn through `devWarn` without throwing.
  - **Partial fills.** A blob carrying only `g.reverb` and `lb.b` yields `globalAudio` equal to the baseline except
    `reverb`, `lfoBank` equal to the baseline except lane `b`, every other field the baseline's.
  - **Precedence.** A blob whose robot override names an id the roster lacks is kept in the payload (the skip is
    `applySessionPayload`'s, covered in `sessionDiff.test.ts` already).
  - **Other params dropped on the way out**: encode never emits `debug`, `load`, `theme`, `session`.
- `seedBaseline.test.ts`: `generateWorldSeedBaseline('n40dh8p8')` equals the eight generators called with any id and that
  name, twice in a row, and leaves no `__world-link__` entry in the noise-map cache (the evict is observable through a
  second call producing a fresh map with equal output); `diffWorldAgainstSeed` of the baseline itself is `{}`; a changed
  leaf in `delay` puts the whole `delay` block and nothing else in `globalAudio`; a lane that lost its `sync` travels whole;
  `compressorBeforeDelay: true` travels as that one key; `bpm` equal to the seed is absent, off by one is present; the
  pacing scalars are compared as numbers (a carried-forward `swellFrequency` from another style is a diff);
  `fillWorldFromSeed(diffWorldAgainstSeed(p, b), b)` deep-equals `p`.
- `worldDiffCodec.test.ts` (amended 2026-10-25): the codec cases, moved from `sessionShareUtils.test.ts` with their
  module; every per-field drop case (`ac`/`rc`, `po`/`fq`/`ft`, `p`, the five sends, `dy`/`rt`/`ax`, `y` lane codes,
  unknown `ll` / `gll` targets, `__proto__` keys) keeps its assertion against `toCompactWorldDiff` /
  `fromCompactWorldDiff`.
- `sessionShareUtils.test.ts`: the seam and the share URL only. `buildShareUrl` yields
  `origin + '/trace-atlas/' + '?seed=…'` with `?debug&load=full` in the address bar dropped; the seam cases
  (`getSessionSharePayload` stable, `consumeSessionSharePayload` once) keep their shape with a world-link URL; and a
  fresh `worldLink`-first import (`vi.resetModules()`, a world link in the address bar, `./worldLink` imported before
  `./sessionShareUtils`) loads without throwing and the seam returns the link's payload — the cycle guard (risk 2).
- `attenuationStyleStore.test.ts` / `localeStore.test.ts`: `DEFAULT_ATTENUATION_STYLE_NAME` is the exact `seed` and
  `DEFAULT_LOCALE_COORDINATES` the `x`/`y` of a mocked `?seed=Pelagos%207%21&x=29&y=-14`; the override cases are deleted.
- `seedUtils.test.ts`: the override, `parseCoordinateParam` and `resolveDefaultAttenuationStyleName` describes go;
  `deriveAttenuationStyleSeed('Pelagos 7!') === 'pelagos7'` stays. `getSeededVal.test.ts` / `noiseMaps.test.ts`: the
  override cases go; the determinism cases stay unchanged.
- `AudioDebugHud.test.tsx`: the world line reads `n40dh8p8 @ 29,-14` for a store holding that style and locale.
- `SectorSettingsDrawer.test.tsx`: Copy link calls `copySessionLink` with `buildSessionPayload()`'s result (both spied);
  a resolved `true` shows the `role="status"` note with `CONTENT['session.status.linkCopied'].human`, `false` the
  `role="alert"` one; the button's accessible name is the content entry's.
- `OceanScene.test.tsx`: the `?session=` cases become world-link cases (a blob with one robot override is applied once,
  with `skipLocaleRebuild: true`; a bare triple still calls `applySessionPayload` once; a second mount does not).
- `transmissionPresets.test.ts:177`: round trip through `encodeWorldLinkParams` / `decodeWorldLink`.
- `scripts/perf/audio-load-lib.test.mjs`: `expectedCoordinates({ x: 200, y: -30, query: 'session=…' })` is `{ x: 200,
  y: -30 }`; `buildPageUrl` unchanged.

**Mutation checks (by hand, at the task):** make `encodeBlob` write version `2` and watch the round-trip case go red;
drop the `evict` and watch the cache case go red; deep-merge `globalAudio` and watch the lost-`sync` case go red; cap the
name at 8 characters and watch the fidelity case go red; leave `fillWorldFromSeed`'s `lfoBank` partial and watch the
partial-fill case go red.

**Static:** `npm run build:types`, `npm run lint`, `npm run build` clean. `grep -rn "SESSION_PARAM\|'session'\|
setGlobalAttenuationStyleSeedOverride\|getGlobalAttenuationStyleSeedOverride\|parseCoordinateParam\|LocaleCoordinateOverride\|
resolveDefaultAttenuationStyleName\|encodeSessionPayload\|decodeSessionPayload" src scripts` finds nothing. The bundle
size line of `npm run build` before and after is recorded in the task file (expected: about +8 kB minified, less gzipped).

**Manual (Crawford):** `npm run dev`; open a fresh world; Settings → Seeds → Copy link, paste into a new tab: the same
name and coordinates, no `s=`. Edit one robot and the Reverb decay; Copy link again: one `s=` param, the link under
2,000 characters for a fully edited world (Crawford's own saved world through the Sessions panel's Share is the measure:
≈ 1,600 against today's 14,000); the new tab plays the edited world with no flash of another one. Hand-edit the URL:
change `x`, delete `y`, capitalise the name, break the blob — each loads something and never a blank page. Open an old
`?session=` link: a random world. With `?debug`, the HUD's first line shows the name and coordinates. Phone width: the
Copy link button and its note fit the Seeds drawer at 320 px.

---

## 6. Git & Workflow Context

- **Order of work:** (1) Crawford approves this spec (the §7 veto points have defaults); (2) `planning-and-task-breakdown`
  → `docs/tasks/SHORT_WORLD_LINK.md` (the repo convention overrides the skill's `tasks/plan.md`); (3) the build on
  **`feature/short-world-link`** off `main` (name is a proposal; Crawford creates branches, PRs and merges). The first
  task adds `fflate` (one commit, lockfile included) so every later task's tests can import it; the override deletion
  (assumption 10) is its own task after the new reader is in, so the HUD never loses its world line in between.
- One commit per task, RED first, imperative subject, no conventional-commit prefix, the session's co-author line. Commits
  only when Crawford says so. Docs-only and deletion-only tasks are Reads (no RED test), per CLAUDE.md.
- The intent is untracked on `main`; it is committed with this spec (docs only) or carried onto the branch — Crawford's
  call. `gh` is not on PATH in the agent's shell; the PR is Crawford's.
- Roadmap: a new entry **56. Short World Link** in `docs/todo/roadmap.md` (written at the end as "As built", linking this
  spec, the intent and the task file); backlog 19 moves to the backlog archive with a pointer to 56; plan.md's Stage 2
  first line is deleted when the PR merges, per [the archive conventions](../todo/plan.md).

---

## 7. Open Questions & Risks

**For Crawford — veto points before the plan (each has a default this spec proceeds with):**

1. **Assumption 9 — Share live stays.** The intent names two link-makers; the tree has three once Copy link lands, two of
   them for the live world (Sessions panel's Share live, Seeds' Copy link). The alternative removes Share live from the
   Save & Share row (one button, one row shorter, the layout-rework sketch's row changes). Default: keep it — it is
   approved layout, and both call one encoder.
2. **Assumption 1 — the blob param is `s`.** `d` ("delta") or `w` were considered; `s` is the working name from the
   interview and nothing argued against it. Default: `s`.
3. **Assumption 12 — the D1–D5 Pixel links.** Dropping the `session` reader breaks the five recorded `?session=` links the
   on-hold phone sitting (plan.md Stage 1) means to carry. Default: re-mint them in the new format in this branch's docs
   task (a scratch script decodes the old base64 and runs the new encoder; the new links go into
   scratchy-audio-phones.md) — the sitting then uses the new links. The alternative, keeping the `session` reader until
   the sitting is done, contradicts the intent's "old links stop resolving" and is not proposed.
4. **Assumption 4 — no float rounding on the wire.** Measured at a further ~7 % (1,615 → 1,494). The intent calls it a
   spec-level detail Crawford does not mind either way. Default: none; the slider steps already bound what a human can set,
   and the saved-session path does not round either, so a save and its link stay byte-equal in meaning.
5. **Assumption 6 — the decoder returns a whole payload** (and a bare triple runs `applySessionPayload` once with values
   equal to the seeded ones). The alternative returns `undefined` for untouched fields and teaches `applySessionPayload`
   to fill a *partial* `lfoBank` / `globalLfoLinks` / `globalAudio` from the generators — more surface in a function this
   phase otherwise leaves alone. Default: whole.
6. **Assumption 8 — the name is not capped.** The Seeds input caps at 128 (`sectorSettingsConfig.ts`); a URL has no cap,
   same as `n` today. A cap is a kind of sanitising, which the intent rules out. Default: no cap; a long name is a nuisance
   (the status line), not a crash.
7. **The roadmap number 56 and the title "Short World Link".**

**Risks:**

1. **Generator drift.** Absent-means-seeded is stable only while the generators are frozen: a later generator change
   makes every untouched field of an old link a "diff" nobody wrote (bigger links) and silently changes what an old link
   plays (an omitted field takes the new seed). Robot overrides carry this exposure today; the intent accepts it pre-v1
   and records it. Nothing here mitigates it; the roadmap entry says so.
2. **Module-load import graph.** `sessionShareUtils.ts` is imported by two stores at module init and now imports the
   generators through `worldLink.ts`; `globalAudioSeed` reaches `@/data/audioRigConfig` and content. Verified acyclic on
   `main` today (survey); a store import added to any of those modules later would recreate the hazard. The
   `worldLink.test.ts` file imports `worldLink` first, before any store, so a cycle shows as a failing import, not a
   silent `undefined`. **Amended 2026-10-25:** the first layout put the compact codec in `sessionShareUtils.ts`, which
   `worldLink.ts` then imported back — a `sessionShareUtils` ↔ `worldLink` cycle that throws at load when `worldLink` is
   imported first (§1.3). The codec now lives in `worldDiffCodec.ts`, which imports neither, and the seam test
   imports `worldLink` first on purpose to keep it that way.
3. **`fflate` API surface.** `deflateSync` / `inflateSync` are raw deflate (no zlib header), which is what the intent
   measured; `strToU8` / `strFromU8` are UTF-8. The first task pins the version in `package.json` and a test round-trips a
   multi-byte string, so a wrong pick fails at once. Deflate output need not be byte-stable across `fflate` versions: the
   tests assert round trips and the bare-triple string, never a recorded blob.
4. **The 203-reference test file.** `sessionShareUtils.test.ts` is rewritten, not patched; each existing per-field drop case
   must survive under the new entry points or the untrusted-input guards have silently lost coverage. The task's acceptance
   criterion lists them by name.
5. **`URLSearchParams.set` writes a space as `+`.** `get` undoes it, so the round trip holds; a hand-typed `%20` also reads
   as a space. A name containing a literal `+` is percent-encoded on the way out and restored on the way in. The fidelity
   case pins both.
6. **The scratch noise map.** `generateWorldSeedBaseline` runs at every encode and at boot; each creates and evicts one
   simplex map (`alea` + `createNoise2D`), the same cost `getAttenuationStyleNoiseMap` pays per style. Negligible, but the
   evict must not be skipped on an exception: a `try … finally`.
7. **The transmission presets** may encode with a blob (assumption 13) if their captured rigs predate today's generators.
   Not this phase's bug; recorded for backlog 5.
8. **`?load=` mirroring and a pasted link.** `withParam` preserves the link's params; a future rewrite of that helper
   through `URLSearchParams` would re-encode the name (still correct) — no action, noted.
