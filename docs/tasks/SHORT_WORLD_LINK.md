# Implementation Plan: Short World Link

Source spec: [docs/specs/SHORT_WORLD_LINK.md](../specs/SHORT_WORLD_LINK.md). Source intent:
[docs/intent/short-world-link.md](../intent/short-world-link.md). Roadmap slot: proposed **56** (the spec's call; backlog
[19](../todo/archive/backlog-archive.md#19-short-world-link-bring-back-seed-x-and-y) moves to the archive under it in Task 16).

Written 2026-10-24 against `main` at `fee2de9e`. **The spec's §7 veto points were not yet answered when this plan was
written**; every task below builds the spec's stated default, and the Open Questions section names which task to touch if
Crawford vetoes one.

## Overview

One wire format for every shared world: `?seed=<exact name>&x=<int>&y=<int>` and, only when the world differs from
its seed, one `s=1.<base64url of raw-deflated compact JSON>` param. The build is four layers, each left green before the
next starts. **Pure layer (Tasks 1–6):** `deepEqual` moves out of the store-bound `sessionDiff.ts`; `seedBaseline.ts`
regenerates a name's world-level fields and diffs or fills against them; `sessionShareUtils.ts` gains the `CompactWorldDiff`
codec beside today's; `worldLink.ts` adds the versioned blob and the lenient param read. **Seam switch (Tasks 6b–8):** the
codec moves out of `sessionShareUtils.ts` into its own `worldDiffCodec.ts` so the seam can import the link without a
cycle (amended 2026-10-25); then the module-level boot decode, `buildShareUrl` and the dependent tests move to the world
link and the old `?session=` codec is deleted. **Button (Task 9):** Copy link in Settings → Seeds. **Deletions (Tasks 10–12):** the HUD reads the style name,
then the `seedUtils` override primitives go. **Harness and docs (Tasks 13–16):** the `perf:audio` pin check, the five Pixel
links re-minted, the living docs, the roadmap. `fflate` lands first (Task 0) so every later task can import it.

## Architecture Decisions

- **The old codec and the new one coexist from Task 4 to Task 7.** `encodeSessionPayload` / `decodeSessionPayload` keep
  working (and the seam keeps reading `?session=`) until Task 7 swaps the seam in one commit and deletes them. Every
  commit between is green; no task needs a "temporarily broken" note.
- **The compact codec gets its own module, `src/utils/worldDiffCodec.ts` (Task 6b; amended 2026-10-25, Crawford).**
  Built per Task 4 inside `sessionShareUtils.ts`, it made Task 7's import of `decodeWorldLink` a cycle
  (`sessionShareUtils` → `worldLink` → `sessionShareUtils`) that throws at load whenever `worldLink` is imported first:
  `sessionShareUtils` then evaluates first and its module-level decode reads `WORLD_LINK_PARAMS` before it exists (spec
  §1.3, risk 2). After the move the graph runs one way, `sessionShareUtils` → `worldLink` → `worldDiffCodec` /
  `seedBaseline`, and `worldDiffCodec` imports neither of the other two. The move is its own task, before Task 7, so
  Task 7 stays a seam switch and every commit stays green.
- **`deepEqual` moves to `src/utils/math.ts` (Task 1)** rather than being imported from `sessionDiff.ts`: `seedBaseline.ts`
  must not import a module that imports the stores (spec §1.3, risk 2), and `math.ts` already holds `roundToDecimals` /
  `quantizeToStep`, the diff's other helpers.
- **The baseline is one function, the diff and the fill are its two inverses (Tasks 2–3).** `fillWorldFromSeed(identity,
  diffWorldAgainstSeed(p, b), b)` deep-equals `p` is the law both tests pin; the decoder and the encoder are thin over them.
- **Block-level `globalAudio`, lane-level `lfoBank`, target-level `globalLfoLinks` (spec assumption 4)**, implemented as
  shallow spreads over the baseline in `fillWorldFromSeed` — no deep merge anywhere, matching `withGlobalAudioDefaults`'
  "blocks are whole" rule, so a block that lost its `sync` key restores whole.
- **The decoder returns a whole payload (spec assumption 6, §7 item 5)**; `applySessionPayload`, the two store reads and
  `OceanScene`'s mount effect are not edited. The Task 7 acceptance criterion that `sessionDiff.ts` has no diff is the proof.
- **Blob version outside the compression (spec assumption 2):** `s=1.<text>`; the decoder splits at the first `.` and
  refuses anything but `1` before touching `fflate`. The tests assert round trips and the bare-triple string, never a
  recorded blob (deflate bytes need not be stable across `fflate` versions).
- **The HUD moves off the override getter before the getter is deleted (Task 10 before 11)**, so no commit leaves the
  world line without a source.
- **Share live stays (spec assumption 9, §7 item 1).** Task 9 adds Copy link beside it; nothing in the Sessions panel is
  edited.
- **Deletions are Reads, not RED tests** (CLAUDE.md: a task that only deletes gets no test; the only way to make a test
  fail first would be to read source text). Their proof is the pruned suite green plus the static grep in spec §5.
- **The D1–D5 re-mint is done before the old reader is gone in the same branch (Task 14 after Task 7),** by a scratch
  script that decodes the old base64 and runs the new encoder — so the links are produced by the shipped code, not by hand.

## Dependency Graph

```
Task 0 (fflate)
   │
   ├── Task 1 (deepEqual → math.ts)
   │        │
   │        ├── Task 2 (generateWorldSeedBaseline) ── Task 3 (diff / fill)
   │        │                                                 │
   │        └── Task 4 (CompactWorldDiff codec, beside the old one)
   │                                                          │
   └── Task 5 (blob: base64url + version) ────────────────────┤
                                                              │
                                              Task 6 (encodeWorldLinkParams / decodeWorldLink)
                                                              │
                                       Task 6b (codec → worldDiffCodec.ts; no cycle)
                                                              │
                                       Task 7 (seam switch; old codec deleted)
                                                              │
                       ┌──────────────────┬───────────────────┼─────────────────────┐
              Task 8 (boot-path tests)  Task 9 (Copy link)  Task 10 (HUD name)   Task 13 (harness pin check)
                                                              │                     │
                                                       Task 11 (seedUtils cut)   Task 14 (D1–D5 re-mint, PERFORMANCE.md)
                                                              │
                                                       Task 12 (store tests' override cases)
                                                              │
                                              Task 15 (living docs) ── Task 16 (roadmap 56, archive, plan.md)
```

Tasks 8, 9, 10 and 13 are independent of each other and may run in any order (or in parallel sessions) once Task 7 is in.

## Task List

### Phase 0: The dependency

- [x] **Task 0: `package.json` — add `fflate`**

  **Description:** Add `fflate@0.8.3` (the current release, `npm view fflate version` on 2026-10-24) to `dependencies` and
  commit the lockfile change with it. The one new dependency the interview approved (spec §3); nothing else is added.
  Record the `npm run build` size line *before* this change in the commit message, so the bundle delta can be read at
  Checkpoint A.

  **Proof:** Read — `npm ls fflate` shows the one entry; no test (no behaviour).

  **Acceptance criteria:**
  - [ ] `package.json` lists `"fflate": "^0.8.3"` under `dependencies`; `package-lock.json` resolves it with no other
        new packages.
  - [ ] `import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate'` type-checks in a scratch file that is
        not committed.
  - [ ] The commit message records `npm run build`'s pre-change size line for the main chunk.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint`, `npm test` clean (unchanged suite).

  **Dependencies:** None.

  **Files:** `package.json`, `package-lock.json`

  **Estimated scope:** XS (two files, a dependency add)

---

### Phase 1: The pure layer

- [x] **Task 1: `src/utils/math.ts` — `deepEqual` moves out of `sessionDiff.ts`**

  **Description:** Move `deepEqual` (`sessionDiff.ts:52–70`) verbatim to `math.ts` as a named export and import it back
  into `sessionDiff.ts`. A refactor with no behaviour change; it exists so `seedBaseline.ts` (Task 2) can compare without
  importing the store-bound `sessionDiff.ts` (spec §1.3, risk 2).

  **Proof:** RED test — `src/utils/math.test.ts`: `deepEqual` is exported from `math.ts` and distinguishes `{ a: [1, { b: 2 }] }`
  from `{ a: [1, { b: 3 }] }`, treats `undefined` values as present keys the way the original does, and returns true for
  two structurally equal payload-shaped objects (fails before the move: no such export).

  **Acceptance criteria:**
  - [ ] `deepEqual` is exported from `math.ts` with the original body and doc comment; `sessionDiff.ts` imports it and
        has no local copy.
  - [ ] `src/utils/sessionDiff.test.ts` passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/utils/math.test.ts src/utils/sessionDiff.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (Task 0 is independent of it).

  **Files:** `src/utils/math.ts`, `src/utils/math.test.ts`, `src/utils/sessionDiff.ts`

  **Estimated scope:** XS (a move)

- [x] **Task 2: `src/utils/seedBaseline.ts` — `generateWorldSeedBaseline(name)`**

  **Description:** New module. `WorldSeedBaseline` (spec §1.2) and `generateWorldSeedBaseline(attenuationStyleName)`,
  which calls `generateGlobalAudioSettings`, `generateLfoBankSettings`, `generateGlobalLfoLinks`,
  `generateAttenuationStyleBpm`, `generateSwellFrequency`, `generateSwellDuration`, `generateHumanize` and
  `generatePingVarianceAutomation` with the scratch id `'__world-link__'` and the exact name, inside `try … finally
  evictAttenuationStyleNoiseMap('__world-link__')` (spec assumption 5, risk 6). `compressorBeforeDelay` is whatever the
  generator returns (`false`). The module imports no store; a comment cites assumption 5.

  **Proof:** RED test — `src/utils/seedBaseline.test.ts`: for name `n40dh8p8` the result deep-equals the eight generators
  called directly with id `'any-id'` and that name; a second call returns an equal value; after a call,
  `getAttenuationStyleNoiseMap('__world-link__', 'OTHER')` builds a map whose first sample differs from one built under
  `n40dh8p8` (the scratch entry was evicted, not reused); a generator that throws (spied once) still leaves the cache
  evicted.

  **Acceptance criteria:**
  - [ ] `generateWorldSeedBaseline('n40dh8p8')` equals the direct generator calls, field for field, on two consecutive calls.
  - [ ] No `'__world-link__'` noise map survives a call, on the happy path and when a generator throws.
  - [ ] `grep -n "stores/" src/utils/seedBaseline.ts` finds nothing.

  **Verification:**
  - [ ] `npx vitest run src/utils/seedBaseline.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/seedBaseline.ts`, `src/utils/seedBaseline.test.ts`

  **Estimated scope:** S (one new module and its test)

- [x] **Task 3: `src/utils/seedBaseline.ts` — `diffWorldAgainstSeed` and `fillWorldFromSeed`**

  **Description:** Add `WorldIdentity`, `WorldDiff` (spec §1.2), `diffWorldAgainstSeed(payload, baseline)` and
  `fillWorldFromSeed(identity, diff, baseline)`. The diff: per top-level key of `globalAudio` (`deepEqual` on the whole
  block, `compressorBeforeDelay` as its own key), per lane, per target, per pacing scalar, and `robotOverrides` /
  `companyDiffs` / `userCreatedCompanies` copied when non-empty; keys are written only when they differ, never as
  `undefined`. The fill is the shallow-spread shape in spec §4 (`version: 2`). Comments cite assumptions 4 and 6.

  **Proof:** RED test — `src/utils/seedBaseline.test.ts`: `diffWorldAgainstSeed(fillWorldFromSeed(id, {}, b), b)` is `{}`;
  a `delay.feedback` change yields `{ globalAudio: { delay: <whole block> } }` and nothing else; lane `b` without its
  seeded `sync` yields the whole lane; `compressorBeforeDelay: true` yields that one key; `bpm` equal to the seed is absent
  and `bpm + 1` is present; a `swellFrequency` from another style's seed is present; a robot override map with one entry is
  copied; and for a payload with a distinct non-default value in every block, lane, two targets, each scalar, twelve
  robots, one company diff and one user company, `fillWorldFromSeed(id, diffWorldAgainstSeed(p, b), b)` deep-equals `p`.

  **Acceptance criteria:**
  - [ ] The round-trip law holds for the fully edited fixture and for the untouched payload.
  - [ ] No diff key is ever present with an `undefined` value (`Object.keys` of each diff is asserted exactly).
  - [ ] `fillWorldFromSeed` never deep-merges inside a block, a lane or a link (the lost-`sync` case).

  **Verification:**
  - [ ] `npx vitest run src/utils/seedBaseline.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1, Task 2.

  **Files:** `src/utils/seedBaseline.ts`, `src/utils/seedBaseline.test.ts`

  **Estimated scope:** S (two functions, one test file)

- [x] **Task 4: `src/utils/sessionShareUtils.ts` — the `CompactWorldDiff` codec, beside the old one**

  **Description:** Add `CompactWorldDiff` (spec §1.2: today's `CompactSessionPayload` minus `v` / `n` / `c`; `g`, `lb`,
  `gll` partial), `toCompactWorldDiff(diff: WorldDiff)`, `isValidCompactWorldDiff(parsed: unknown)` and
  `fromCompactWorldDiff(parsed: unknown): WorldDiff | null`, reusing every existing private `toCompact*` / `fromCompact*`
  helper and per-field guard. `fromCompactWorldDiff` iterates the canonical id lists for `lb` / `gll` but emits only the
  lanes and targets the blob carried (it fills nothing — that is `fillWorldFromSeed`'s job). `encodeSessionPayload`,
  `decodeSessionPayload`, `CompactSessionPayload` and the seam are **not** touched in this task. Port the per-field
  describes in `sessionShareUtils.test.ts` (`:160` pan, `:235` sends, `:325` effect sends, `:404` performance, `:473`
  articulation, `:863` lane `sync`, `:1001` Delay `sync`, `:1161` colour defaults, `:1237` pedal defaults, `:1326` pedals)
  to the new entry points, keeping each assertion; the `:53` describe and the seam / `buildShareUrl` / `copySessionLink`
  describes stay on the old functions until Task 7.

  **Proof:** RED test — `src/utils/sessionShareUtils.test.ts`: `fromCompactWorldDiff(toCompactWorldDiff(diff))` deep-equals
  a diff carrying one block, one lane with a `sync`, one target, `bpm`, one robot with every per-field code and one company
  diff; `toCompactWorldDiff({})` is `{}`; `fromCompactWorldDiff` returns `null` for a non-object, an array and `{ g: 5 }`,
  drops an unknown `gll` target and keeps the known one, and leaves a lane Free for a bogus `y`.

  **Acceptance criteria:**
  - [ ] Every ported per-field drop case (`ac`/`rc`, `po`/`fq`/`ft`, `p`, `rs`/`ds`/`gr`/`sm`/`db`, `dy`/`rt`/`ax`, lane
        `y` codes, unknown `ll` / `gll` targets, `__proto__` keys) asserts the same outcome through the new entry points.
  - [ ] `toCompactWorldDiff` writes `g` / `lb` / `gll` only for the keys the diff carries, never a whole record.
  - [ ] The old describes still pass untouched (both codecs live).

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionShareUtils.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/utils/sessionShareUtils.ts`, `src/utils/sessionShareUtils.test.ts`

  **Estimated scope:** M (two files, but the largest test edit of the phase)

- [x] **Task 5: `src/utils/worldLink.ts` — the versioned blob (`encodeBlob` / `decodeBlob`)**

  **Description:** New module, first half. `WORLD_LINK_PARAMS`, `WORLD_LINK_BLOB_VERSION = 1`, `toBase64Url` /
  `fromBase64Url` (`btoa` / `atob` over the byte string, `+/` ↔ `-_`, padding stripped and restored), `encodeBlob(diff:
  WorldDiff): string` (`JSON.stringify(toCompactWorldDiff(diff))` → `strToU8` → `deflateSync` → `1.<base64url>`) and
  `decodeBlob(raw: string): WorldDiff | null` (split at the first `.`, version must equal `'1'`, then `fromBase64Url` →
  `inflateSync` → `strFromU8` → `JSON.parse` → `fromCompactWorldDiff`, the whole thing in one `try` that `devWarn`s and
  returns `null`). Comments cite assumption 2 and risk 3.

  **Proof:** RED test — `src/utils/worldLink.test.ts`: `decodeBlob(encodeBlob(diff))` deep-equals a diff whose robot name
  is `'Ärger & Co — 7'` (multi-byte) and whose blob starts with `'1.'` and contains no `+`, `/`, `=` or `.` after the first;
  `encodeBlob({})` decodes to `{}`; each of `'2.' + valid`, `'1' + text (no dot)`, `'.abc'`, `'1.!!'`,
  `'1.' + base64url('not deflate')`, `'1.' + deflate('[]')`, `'1.' + deflate('{"g":5}')` returns `null` without throwing
  and calls `devWarn` once.

  **Acceptance criteria:**
  - [ ] Round trip holds for a multi-byte string; the blob text is URL-safe (no character outside `A–Z a–z 0–9 - _` after
        the `1.` prefix).
  - [ ] Every malformed form listed returns `null`; none throws.
  - [ ] Only `deflateSync`, `inflateSync`, `strToU8`, `strFromU8` are imported from `fflate`.

  **Verification:**
  - [ ] `npx vitest run src/utils/worldLink.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 0, Task 4.

  **Files:** `src/utils/worldLink.ts`, `src/utils/worldLink.test.ts`

  **Estimated scope:** S (one new module, one test)

- [x] **Task 6: `src/utils/worldLink.ts` — `encodeWorldLinkParams` and `decodeWorldLink`**

  **Description:** Second half. `encodeWorldLinkParams(payload)` returns a `URLSearchParams` with `seed`, `x`, `y` and,
  when `diffWorldAgainstSeed(payload, generateWorldSeedBaseline(payload.attenuationStyleName))` is non-empty, `s`.
  `decodeWorldLink(search)` is the spec §4 function: `null` when none of `seed` / `x` / `y` / `s` is present; otherwise
  the exact `seed` (or `generateRandomAttenuationStyleName()` when absent or empty), each coordinate by the `/^-?\d+$/`
  rule or `randomCoordinate()` for that axis, the blob through `decodeBlob` (a `null` is an empty diff), and
  `fillWorldFromSeed`. `theme` and `session` are never read. Comments cite assumption 6 and §1.4.

  **Proof:** RED test — `src/utils/worldLink.test.ts`: an untouched payload for `n40dh8p8`, `(29, -14)` encodes to exactly
  `seed=n40dh8p8&x=29&y=-14` and decodes back deep-equal; the fully edited fixture from Task 3 round-trips with params
  `seed`, `x`, `y`, `s` only; names `'Pelagos 7!'`, `'ÄÖÜ ñ'`, `'a&b=c+d%e'` and `' padded '` round-trip byte-for-byte;
  every row of spec §1.4 (with `generateRandomAttenuationStyleName` / `randomCoordinate` spied: only the missing parts
  call them); `s=2.…` on a valid triple yields the untouched payload; a blob with only `g.reverb` and `lb.b` yields the
  baseline except those two; a blob whose robot id is `'nobody'` keeps that override in the payload; a payload encoded
  while the address bar holds `?debug&load=full` yields no `debug` / `load` / `theme` / `session` param.

  **Acceptance criteria:**
  - [ ] The bare-triple string is exact and the round-trip law holds for both fixtures.
  - [ ] All eight §1.4 rows behave as tabled; `session`-only returns `null`.
  - [ ] Nothing in the module lowercases, trims or truncates the name.

  **Verification:**
  - [ ] `npx vitest run src/utils/worldLink.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5, Task 3.

  **Files:** `src/utils/worldLink.ts`, `src/utils/worldLink.test.ts`

  **Estimated scope:** S (the same two files)

### Checkpoint A: The pure layer
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean (full suite; the old `?session=` path still works).
- [x] `npm run build` clean; the main chunk's size delta against Task 0's recorded line is written into this file under
      "Checkpoint A" (expected about +8 kB minified).
- [x] The encoder and decoder round-trip Crawford's own saved world: decode its old `?session=` value with the old
      `decodeSessionPayload`, encode with `encodeWorldLinkParams`, and record the `s` length here (expected ≈ 1,600).
- [ ] Reviewed with human before proceeding to Phase 2.

**Checkpoint A record (2026-10-25, `feature/short-world-link` at `32cb1a9a`):**

- Full suite 329 files / 12,161 tests green; `build:types` clean; `lint` 0 errors (the 4 warnings predate the branch).
- Bundle, main chunk: before (Task 0) `1,260.90 kB │ gzip: 386.36 kB`; after Task 6 `1,260.90 kB │ gzip: 386.34 kB`.
  **No delta yet, and that is expected:** nothing in the app imports `worldLink.ts` until Task 7 swaps the seam, so
  the bundler drops `fflate` and the new codec. Re-read the delta after Task 7 (expected about +8 kB then).
- **Crawford's own world (run 2026-10-25 from the `?session=` link he pasted; `n40dh8p8`, (29, −14), twelve edited
  robots), through a throwaway test that was not committed:**

  | | characters |
  |---|---|
  | old `session` param | 14,092 |
  | old full URL (`localhost:5173`) | 14,137 |
  | new `s` param | 1,722 |
  | new search string (`seed`, `x`, `y`, `s`) | 1,749 |
  | new full URL (`localhost:5173`) | 1,784 |

  `decodeWorldLink` of the new params deep-equals the old decode, and `decodeBlob(s)` deep-equals the seed diff. The
  diff carries every Audio Rig block (17 of 17), all four lanes, all seven global targets, all five pacing scalars and
  twelve robots, so the rig edits really are hand edits. **`s` is 1,722, about 7 % over the ≈ 1,600 estimate** (the
  intent's measurement said 1,615 for "seed-diffed"); still under the 2,000 the manual check asks for, and 8.2× shorter
  than the old param. Deflate level 9 gives 1,720 (no gain over the default 6; level 1 gives 1,826), so the level is
  not the gap; the cause of the difference from the earlier measurement is not known.

**As built, Phase 1 (deviations from the task text):**

- **New test helper `src/testUtils/worldLinkFixtures.ts`** (not in Task 3's file list): `untouchedWorld` and
  `fullyEditedWorld`, built by hand from the baseline (never through `fillWorldFromSeed`), shared by Tasks 3, 4 and 6.
- **Task 4, two hardenings over the old decoder:** a lane, link, robot or company entry that is not a plain object is
  dropped instead of read (the old decoder could throw on `r: { id: null }`), and a part whose every entry drops writes
  no key. `g` keeps only the blocks `withGlobalAudioDefaults` hands back as given, so an absent, null or wrong-kind
  block is "not carried" and fills from the seed.
- **Task 4, ported assertions whose meaning changed:** a diff has no `version` (wire 1 implies payload 2); an absent
  pacing scalar is no key rather than an `undefined` one; a missing block fills from the seed, not
  `DEFAULT_GLOBAL_AUDIO_SETTINGS`. The three "decoded defaults are copies" cases were dropped from the codec tests
  (this path reads no shared defaults); the whole-payload version is in `worldLink.test.ts` ("two decodes share
  nothing"). One ported lane-sync case compared two `undefined` coordinates and passed by coincidence; it now checks
  fields the diff carries.
- **Task 6:** `x=-0` reads as `0` (normalised, so `Object.is` holds); the spec's integer rule is otherwise as written.
- **For Task 7 — a module cycle the spec's layout creates:** `sessionShareUtils.ts` will import
  `decodeWorldLink` from `worldLink.ts`, which imports the codec back from `sessionShareUtils.ts`. Loaded through a
  store (store → `sessionShareUtils` → `worldLink`), `worldLink` evaluates first and the boot decode works. Loaded
  `worldLink`-first (as `worldLink.test.ts` does, or any future importer), `sessionShareUtils` evaluates first and
  its module-level `decodeWorldLink(window.location.search)` reads `WORLD_LINK_PARAMS` before it is initialised and
  throws. **Resolved in the plan 2026-10-25 (Crawford):** the codec moves to its own module in Task 6b, before Task 7;
  the spec's §1.3 and risk 2 are amended to match.

---

### Phase 2: The seam switch

- [x] **Task 6b: `src/utils/worldDiffCodec.ts` — the compact codec moves out of `sessionShareUtils.ts`** (added
  2026-10-25)

  **Description:** A move with no behaviour change, so Task 7 can import the link into the seam without a cycle (spec
  §1.3, risk 2). Move from `sessionShareUtils.ts` to a new `worldDiffCodec.ts`, verbatim: `CompactWorldDiff` and the
  per-field compact shapes (`CompactBankLfoSettings`, `CompactLfoLink`, `CompactADSR`, `CompactLayer`, `CompactToggle`,
  `CompactRobotOverrideDiff`, `CompactCompanyDiff`); every `toCompact*` / `fromCompact*` helper and guard
  (`isCurveName`, `isFilterType`, `isFiniteNumber`, `isSendFraction`, `isPlainObject`); the note-value code tables
  (`SYNC_DIVISION_TOKENS`, `SYNC_MODIFIER_SUFFIXES`, `noteValueToCode`, `NOTE_VALUE_BY_CODE`); the Task 4 helpers
  (`knownGlobalAudioBlocks`, `decodeEntries`, `decodeKnownIds`, `isNonEmpty`); and `toCompactWorldDiff` /
  `isValidCompactWorldDiff` / `fromCompactWorldDiff`. The old `?session=` codec stays in `sessionShareUtils.ts` until
  Task 7 and still needs eight of those helpers, `isPlainObject` and four of the shapes: `worldDiffCodec.ts` exports
  them under a comment that names them interim, for the old codec only, until Task 7. Point `worldLink.ts` and
  `worldLink.test.ts` at the new module. Move the codec's describes out of `sessionShareUtils.test.ts` into
  `worldDiffCodec.test.ts` (the core codec describe, the per-robot fields, lane `y`, Delay `sync`, colour, modulation
  pedals and Global Pedals), with the helpers they use (`makeDiff`, `asWire`, `wireOf`, `roundTrip`, `makeLfoBank`,
  `makeGlobalLfoLinks`, `decodeRawWire` for the 50.2 fixture); the old `?session=` describe, the seam, `buildShareUrl`
  and `copySessionLink` cases stay where they are. A comment at the top of `worldDiffCodec.ts` says why it is its own
  module.

  **Proof:** RED test — `src/utils/worldDiffCodec.test.ts`: the moved describes, importing `toCompactWorldDiff` /
  `isValidCompactWorldDiff` / `fromCompactWorldDiff` from `./worldDiffCodec`, fail before the move (no such module) and
  pass after with every assertion unchanged.

  **Acceptance criteria:**
  - [ ] `grep -n "sessionShareUtils\|worldLink\|stores/" src/utils/worldDiffCodec.ts` finds nothing, and
        `grep -n "sessionShareUtils" src/utils/worldLink.ts` finds nothing.
  - [ ] `sessionShareUtils.ts` has no copy of a moved helper; its old codec imports them from `worldDiffCodec.ts`.
  - [ ] The moved cases keep their count and assertions; the cases left in `sessionShareUtils.test.ts` pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/utils/worldDiffCodec.test.ts src/utils/sessionShareUtils.test.ts src/utils/worldLink.test.ts`
        passes.
  - [ ] `npm test` full suite green; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/utils/worldDiffCodec.ts`, `src/utils/worldDiffCodec.test.ts`, `src/utils/sessionShareUtils.ts`,
  `src/utils/sessionShareUtils.test.ts`, `src/utils/worldLink.ts`, `src/utils/worldLink.test.ts`

  **Estimated scope:** M (six files, but one move; no logic changes)

- [x] **Task 7: `src/utils/sessionShareUtils.ts` — the boot seam and `buildShareUrl` read and write the world link; the old codec goes**

  **Description:** `SESSION_SHARE_PAYLOAD` becomes `decodeWorldLink(window.location.search)`; `buildShareUrl` sets
  `url.search = encodeWorldLinkParams(payload).toString()` on `origin + pathname`; `copySessionLink` is unchanged.
  `sessionShareUtils.ts` imports the link from `worldLink.ts` and nothing from `worldDiffCodec.ts`. Delete
  `SESSION_PARAM`, `CompactSessionPayload`, `toCompactSessionPayload`, `fromCompactSessionPayload`,
  `isValidCompactSessionPayload`, `encodeSessionPayload`, `decodeSessionPayload`, `encodeBase64Utf8`, `decodeBase64Utf8`,
  and the "once per page load … `?session=`" wording in the seam comments; the interim exports Task 6b added to
  `worldDiffCodec.ts` become private again. Rewrite the `:53`, `:1019`, `:1058`, `:1090` describes of
  `sessionShareUtils.test.ts` to the world link (the seam cases keep their shape with a `?seed=…&s=…` URL;
  `buildShareUrl` yields `origin + '/trace-atlas/' + '?seed=…'` with `?debug&load=full` dropped); wire-shape cases of
  the `:53` describe that still test the codec move to `worldDiffCodec.test.ts`. Re-point
  `transmissionPresets.test.ts:177` to `decodeWorldLink('?' + encodeWorldLinkParams(payload))`. `sessionDiff.ts`,
  `applySessionPayload`, the two stores and `OceanScene.tsx` are not edited (spec assumption 7).

  **Proof:** RED test — `src/utils/sessionShareUtils.test.ts`: with `window.location.search` mocked to
  `?seed=Pelagos%207%21&x=29&y=-14&s=<blob with one robot override>`, `getSessionSharePayload()` returns a payload whose
  name is `'Pelagos 7!'`, coordinates `(29, -14)` and the one override, the same object on every call;
  `consumeSessionSharePayload()` returns it once then `null`; `buildShareUrl(p)` for the untouched payload is exactly
  `origin + pathname + '?seed=n40dh8p8&x=29&y=-14'`; a `?session=` URL yields `null` from `getSessionSharePayload()`;
  and the cycle guard (spec risk 2): after `vi.resetModules()` with that link in the address bar, importing
  `./worldLink` first and `./sessionShareUtils` second does not throw and the seam returns the link's payload.

  **Acceptance criteria:**
  - [ ] `grep -rn "SESSION_PARAM\|encodeSessionPayload\|decodeSessionPayload\|CompactSessionPayload\|encodeBase64Utf8" src scripts`
        finds nothing.
  - [ ] `grep -n "sessionShareUtils" src/utils/worldLink.ts src/utils/worldDiffCodec.ts` finds nothing (the graph runs
        `sessionShareUtils` → `worldLink` → `worldDiffCodec`, one way).
  - [ ] `git diff --stat` for this task shows no change under `src/utils/sessionDiff.ts`, `src/stores/` or
        `src/components/`.
  - [ ] `src/data/transmissionPresets.test.ts` passes through the new entry points; every other test file passes
        unmodified.

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionShareUtils.test.ts src/utils/worldDiffCodec.test.ts src/data/transmissionPresets.test.ts`
        passes.
  - [ ] `npm test` full suite green.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check (dev server): open `/trace-atlas/?seed=n40dh8p8&x=29&y=-14`: the Seeds status line reads
        `n40dh8p8 · (29, -14)` with no flash of another world; open an old `?session=` link: a random world.

  **Dependencies:** Task 6b.

  **Files:** `src/utils/sessionShareUtils.ts`, `src/utils/sessionShareUtils.test.ts`, `src/utils/worldDiffCodec.ts`,
  `src/utils/worldDiffCodec.test.ts`, `src/data/transmissionPresets.test.ts`

  **Estimated scope:** M (five files; a deletion plus the seam's test rewrite)

- [x] **Task 8: The boot path's own tests pin the world link (`attenuationStyleStore`, `localeStore`, `OceanScene`)**

  **Description:** The stores' and the scene's tests today mock or construct `?session=` payloads. Add the world-link
  cases the spec §5 lists and retire the `?session=` wording: `DEFAULT_ATTENUATION_STYLE_NAME` is the exact `seed` and
  `DEFAULT_LOCALE_COORDINATES` the `x` / `y` of a mocked `?seed=Pelagos%207%21&x=29&y=-14`; `OceanScene`'s mount effect
  applies a blob with one robot override once with `skipLocaleRebuild: true`, applies a bare triple once too (assumption 7),
  and does not re-apply on a second mount. No production code changes.

  **Proof:** Tests, green on arrival — the behaviour landed in Task 7; this task's value is that the boot path is pinned
  where it lives (the stores' and scene's own tests), not only in the codec's. Stated here so the "RED first" rule is not
  silently broken: there is no red to show for a test-only task.

  **Acceptance criteria:**
  - [ ] Each of the three test files has at least one case whose URL is a world link and none whose URL is `?session=`.
  - [ ] The bare-triple mount case asserts `applySessionPayload` was called once with `{ skipLocaleRebuild: true }`.
  - [ ] No file outside the three tests changes.

  **Verification:**
  - [ ] `npx vitest run src/stores/attenuationStyleStore.test.ts src/stores/localeStore.test.ts src/components/panels/screen/worldView/OceanScene.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7.

  **Files:** `src/stores/attenuationStyleStore.test.ts`, `src/stores/localeStore.test.ts`,
  `src/components/panels/screen/worldView/OceanScene.test.tsx`

  **Estimated scope:** S (tests only)

**As built, Phase 2 (2026-10-25, `feature/short-world-link`, `376d651f` T6b, `9f1a0e9c` T7, `f16cf7ab` T8):**

- **Task 6b** is a line-range move: 149 codec cases went to `worldDiffCodec.test.ts`, 39 stayed, 248 across the three
  files before and after. The interim exports sat in one `INTERIM EXPORTS` block at the end of `worldDiffCodec.ts`
  (not scattered `export` keywords), so Task 7 deleted one block. **The acceptance grep
  `grep -n "sessionShareUtils\|worldLink\|stores/" src/utils/worldDiffCodec.ts` is not empty:** it matches the top
  comment the task asks for (why the module stands alone names both modules). No import matches.
- **Task 7 touched three test files the task did not list, because deleting `encodeSessionPayload` /
  `decodeSessionPayload` broke their imports:**
  - `src/systems/robotSendsParity.test.ts` (the roadmap 55 "NEVER RE-RECORD" oracle). Case (c) now checks the
    recorded `r` codes (`SHARE_WIRE_JSON`'s `r`, unchanged) through `toCompactWorldDiff`, and round-trips the blob.
    `SHARE_STRING`, the base64 of the deleted wire, is retired; nothing was re-recorded. The share-restore case
    decodes through the link, and its recorded primes still match.
  - `attenuationStyleStore.test.ts` / `localeStore.test.ts` (Task 8's files): the minimum to stay green (the hand-typed
    link replaces `?session=`); Task 8 did the rest.
- **Task 7 also made comment-only edits to `src/utils/sessionDiff.ts`** (the `backfillLfoBank` doc named the deleted
  `fromCompactSessionPayload`) and two comments in `sessionDiff.test.ts`. So the "no change under `sessionDiff.ts`"
  criterion holds for code, not for the file. Without those edits the Task 7 grep for the deleted names was not empty.
- **Of the old `?session=` codec describe, three wire-shape cases were ported** to `worldDiffCodec.test.ts` ("nested
  wire shapes": null-lane `l` omitted, the `a` / `l` / `rm` abbreviations, a layer without `pw`). The ported codec
  tests already covered the rest, or it tested the deleted format (base64 validity, `v` / `n` / `c`, legacy `lf` /
  `gl` keys, the recorded 12-robot size), so it was deleted.
- **Bundle after Task 7:** main chunk `1,273.29 kB │ gzip: 391.70 kB`, against Task 0's `1,260.90 kB │ gzip:
  386.36 kB`: **+12.4 kB minified (+5.3 kB gzip), over the "about +8 kB" estimate.** That is net of the deleted
  old codec.
- **Task 7's manual dev-server check was not run** (the Seeds status line for `?seed=n40dh8p8&x=29&y=-14`, and an old
  `?session=` link loading a random world). It belongs with Checkpoint B's browser check below.
- **Task 8:** the setup's `randomCoordinate` mock alternates 12/68 across a whole file, `vi.resetModules()` or not.
  So a drawn axis is asserted to be one of the two values, and a kept axis exactly. The old "{ x: 12, y: 68 }"
  fallback case only passed because of how many draws ran before it.
- Mutation checks: T7 killed 5 of 5 (the cycle recreated, which only the cycle guard catches; `?debug` leaking into
  `buildShareUrl`; the pathname dropped; the seam blinded; consume never latching). T8 killed 6 of 6.

### Checkpoint B: Links load
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean. (330 files / 12,145 tests at `f16cf7ab`.)
- [x] In the browser (dev server), from the Sessions panel: **Share live** on an untouched world copies a bare triple;
      after editing one robot and the Reverb decay it copies a triple plus one `s=`; each pastes into a new tab and plays
      the same world. A saved row's **Share** does the same for its save. Hand-edit the URL (`x` changed, `y` deleted,
      name capitalised, blob truncated): each loads something, never a blank page.
- **Correction (code review, 2026-10-25, fixed in `7cf54637`):** the box above says Share live on an untouched world
  copies a bare triple. It did not: every untouched world copied a 225–350-character `s=` blob, because the seed
  baseline was the raw generators while a save snaps the rig to its slider steps and rounds the LFO drifts (20 of 20
  fresh worlds, measured headlessly). The baseline now goes through the same capture step
  (`src/utils/sessionCapture.ts`), and `src/utils/worldLinkBoot.test.ts` pins the real boot path. Worth re-checking in
  the browser at Checkpoint C.
- [x] Reviewed with human before proceeding to Phase 3. (Crawford, 2026-10-25: passed. He noted that a probe's
      Volume is not kept between sessions. That is not this branch's doing: `masterVolume` is left out of every saved
      and shared payload by design, on `main` too, per [SESSION_STORAGE.md](../SESSION_STORAGE.md).)

---

### Phase 3: The button

- [x] **Task 9: `SectorSettingsDrawer.tsx` — Copy link for the live world**

  **Description:** One content entry `'sector.copyLink'` (`human: 'Copy link'`; no lore yet — Crawford's column) in
  `src/content/copy/sector.ts`; `COPY_LINK_SCHEMA: ButtonSchema = { id: 'sectorSettings.copyLink', type: 'button',
  ...labels('sector.copyLink') }` in `sectorSettingsConfig.ts`; in the drawer's `.sector-settings-drawer__status` block,
  under the status line, a `<Button schema={COPY_LINK_SCHEMA} face="single" onClick={() => share(buildSessionPayload())} />`
  from `useShareStatus()` and the two status spans (`sector-settings-drawer__share-status`, `--error`; `role="status"` /
  `role="alert"`; `CONTENT['session.status.linkCopied'].human` / `CONTENT['session.status.copyFailed'].human`), styled
  in `SectorSettingsDrawer.css` after the Sessions panel's `.sessions-panel__share-status` rules. The Sessions panel is
  not edited (assumption 9). A comment cites assumption 9.

  **Proof:** RED test — `src/components/panels/screen/console/SectorSettingsDrawer.test.tsx`: with `copySessionLink`
  spied to resolve `true` and `buildSessionPayload` spied, clicking the button named by `labels('sector.copyLink').humanLabel`
  calls `copySessionLink` once with `buildSessionPayload`'s return value and shows the `role="status"` note with
  `CONTENT['session.status.linkCopied'].human`; resolving `false` shows the `role="alert"` note instead; the button is
  absent before the change.

  **Acceptance criteria:**
  - [x] The button renders inside the status block, between the status line and the first section, with the content
        entry's accessible name; no literal string in the component or the config.
  - [x] The two notes render with the roles above and the existing session status entries; only one is ever visible.
  - [x] `src/content/content.test.ts` passes (the key is referenced by its quoted literal in `sectorSettingsConfig.ts`).

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/SectorSettingsDrawer.test.tsx src/content/content.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: Settings → Seeds at 320 px and desktop — the button and its note fit the drawer without a horizontal
        scroll; Copy link then paste reproduces the world.

  **Dependencies:** Task 7.

  **Files:** `src/content/copy/sector.ts`, `src/data/sectorSettingsConfig.ts`,
  `src/components/panels/screen/console/SectorSettingsDrawer.tsx`, `SectorSettingsDrawer.css`, `SectorSettingsDrawer.test.tsx`

  **Estimated scope:** M (five files, one small feature slice)

**As built, Phase 3 (2026-10-25, `feature/short-world-link`, `8485886d` T9):**

- The button and its two notes sit in their own `.sector-settings-drawer__copy-link` row inside the status block
  (flex, wrapping, so on a narrow drawer the note drops under the button instead of pushing it sideways). The task
  named only the two note classes; the row is the one extra class.
- The test stubs `buildSessionPayload` and `copySessionLink` with partial `vi.mock`s (the real modules' other exports
  kept), the Sessions panel's own pattern, not `vi.spyOn`. The drawer calls them through its imports, so a spy would not
  have seen the calls.
- To get a RED that fails for the right reason, the content entry went in before the test was run, so the RED is
  "Unable to find … button … Copy link" (4 of 5 new cases), not a `labels()` lookup error. The "no note on render" case
  passes before and after; it guards the "only one note" criterion.
- Mutation checks: 7 of 7 killed (not the live payload; payload built twice; success note given `role="alert"`; error
  note shown on success; success note shown on error; wrong success copy; button outside the status block).
- Suite 330 files / 12,150 tests (was 12,145). `prettier --check` flags the four edited `.ts`/`.tsx` files, but it
  flagged them at `f16cf7ab` too, so they were left alone.
- **The manual check (320 px and desktop fit, Copy link then paste reproduces the world) was not run.**

---

### Phase 4: The deletions

- [x] **Task 10: `AudioDebugHud.tsx` — the world line reads the Attenuation Style's name**

  **Description:** Replace `getGlobalAttenuationStyleSeedOverride()` with the current style's name:
  `useAttenuationStyleStore((s) => selectCurrentAttenuationStyle(s)?.name ?? null)` passed as `seed` to `buildHudLines`.
  `hudLines.ts` is unchanged (`null` still prints `random`, which now only happens with no style at all). This lands
  before Task 11 so the HUD never loses its source.

  **Proof:** RED test — `src/components/debug/AudioDebugHud.test.tsx`: with a store holding style `n40dh8p8` and a locale
  at `(29, -14)`, the first rendered line starts with `n40dh8p8 @ 29,-14` (fails today: `random @ 29,-14`).

  **Acceptance criteria:**
  - [x] The HUD's first line names the live style; no import of `seedUtils` remains in `AudioDebugHud.tsx`.
  - [x] The selector is as narrow as the existing coordinates one (name only), so unrelated robot writes do not re-render
        the HUD.

  **Verification:**
  - [x] `npx vitest run src/components/debug/AudioDebugHud.test.tsx` passes.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: `?debug&seed=n40dh8p8&x=29&y=-14` shows the name on the HUD's first line.

  **Dependencies:** Task 7.

  **Files:** `src/components/debug/AudioDebugHud.tsx`, `src/components/debug/AudioDebugHud.test.tsx`

  **Estimated scope:** XS

- [x] **Task 11: `seedUtils.ts`, `getSeededVal.ts`, `noiseMaps.ts` — the override primitives go**

  **Description:** Delete `GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE`, `setGlobalAttenuationStyleSeedOverride`,
  `getGlobalAttenuationStyleSeedOverride`, `parseCoordinateParam`, `LocaleCoordinateOverride`,
  `setLocaleCoordinateOverride`, `getLocaleCoordinateOverride`, `resolveDefaultAttenuationStyleName` and their comments;
  `deriveAttenuationStyleSeed` becomes the pure lowercase-and-strip. `precomputeDataX`'s key becomes `dataId` and
  `getLocaleNoiseMap`'s `${x}:${y}` (the formulas already used when nothing set the override — no seeded value moves).
  Prune the override describes from `seedUtils.test.ts`, `getSeededVal.test.ts` and `noiseMaps.test.ts`; the determinism
  cases and `deriveAttenuationStyleSeed('Pelagos 7!') === 'pelagos7'` stay. `vitest.setup.ts`'s mock spreads the actual
  module and needs no edit. Spec assumption 10.

  **Proof:** Read — a deletion with no behaviour on any production path; the proof is the pruned suite green and the
  static grep below (CLAUDE.md: no RED test for a task that only deletes).

  **Acceptance criteria:**
  - [x] `grep -rn "setGlobalAttenuationStyleSeedOverride\|getGlobalAttenuationStyleSeedOverride\|parseCoordinateParam\|LocaleCoordinateOverride\|resolveDefaultAttenuationStyleName\|GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE" src scripts`
        finds nothing.
  - [x] `seedUtils.ts` exports exactly `deriveAttenuationStyleSeed`, `generateRandomAttenuationStyleName`, `randomCoordinate`.
  - [x] Every remaining determinism test in the three test files passes unmodified (the seeded values are the proof that
        the key formulas did not move).

  **Verification:**
  - [x] `npx vitest run src/utils/seedUtils.test.ts src/utils/getSeededVal.test.ts src/utils/noiseMaps.test.ts` passes.
  - [x] `npm test` full suite green (Task 12's two files are the only expected failures if run before it — do Task 12 in
        the same sitting).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10.

  **Files:** `src/utils/seedUtils.ts`, `src/utils/seedUtils.test.ts`, `src/utils/getSeededVal.ts`,
  `src/utils/getSeededVal.test.ts`, `src/utils/noiseMaps.ts`, `src/utils/noiseMaps.test.ts`

  **Estimated scope:** M (six files, but one concept deleted; all edits are removals)

- [x] **Task 12: The stores' tests and comments drop the override**

  **Description:** Remove the override cases from `attenuationStyleStore.test.ts` (2 references) and `localeStore.test.ts`
  (2); rewrite `localeStore.ts:53` and `:75–78` comments (which name `resolveDefaultAttenuationStyleName` and `?session=`)
  and `attenuationStyleStore.ts:11–22`'s comment to describe the world link. No production code changes.

  **Proof:** Read — comments and test pruning only.

  **Acceptance criteria:**
  - [x] Neither test file imports a deleted symbol; both pass.
  - [x] Neither store comment names `?session=`, `resolveDefaultAttenuationStyleName` or the override.

  **Verification:**
  - [x] `npx vitest run src/stores/attenuationStyleStore.test.ts src/stores/localeStore.test.ts` passes.
  - [x] `npm test` full suite green; `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 11.

  **Files:** `src/stores/attenuationStyleStore.test.ts`, `src/stores/localeStore.test.ts`, `src/stores/localeStore.ts`,
  `src/stores/attenuationStyleStore.ts`

  **Estimated scope:** XS

**As built, Phase 4 (2026-10-25, `feature/short-world-link`, `722d4b91` T10, `6e123a15` T11, `958eff76` T8 follow-up,
`27e41b7a` T12):**

- **Task 10:** RED failed as predicted (`'random @ 29,-14   up 0:00'`). Four cases: the live name, the name following a
  retransmit, `random` with no current style, and a React `Profiler` check that a style write with an unchanged name
  commits nothing (that covers the "selector as narrow" criterion). 4 of 4 mutants killed (seed always null; whole-style
  selector; name read once with `getState()`; `''` for `null`). The commit message says the override was "only set by a
  `?seed=` URL". That is wrong: nothing had set it since roadmap Phase 21, so the HUD printed `random` for every world.
  The test comment was corrected in T11.
- **Task 11:**
  - **The plan said `deriveAttenuationStyleSeed('Pelagos 7!') === 'pelagos7'` "stays", but no such test existed.** Two
    cases were added to `seedUtils.test.ts` (that one, plus a clean name kept and an all-symbol name to `''`), green on
    arrival.
  - **The two store-test cases that called deleted symbols went in T11's commit, not T12's**, so T11 builds green (Task
    7's precedent). T12 kept the store comments.
  - Two files outside the task's list changed, comment only: `worldLink.ts` (its `INTEGER` doc named
    `parseCoordinateParam`, which the acceptance grep catches) and `AudioDebugHud.test.tsx` (the T10 comment above).
  - `getSeededVal.test.ts`'s `vi.mock('./seedUtils')` existed only to stub the override, so it went with the case.
- **T8 follow-up:** T11's full run failed one case, T8's "computes dayStartTimestamp from the link x". It compared
  `computeLocaleHour` to exactly 5 across the wall clock, and 1 ms passed under the parallel suite (5.0000667 h; one
  in-world hour is 15 s). Now `toBeCloseTo(5, 0)`, as the file's x=12 sibling case already was. It still fails if the
  link's x were ignored (12 or 20).
- Suite after T12: 330 files / 12,143 tests (12,150 + 4 HUD − 13 override cases + 2 derive cases). The acceptance grep
  over `src scripts` is empty.
- **Task 10's manual `?debug` check was not run.**

### Checkpoint C: The app is whole
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean. (At `27e41b7a`: 330 files / 12,143
      tests; lint 0 errors, the 4 known scenery warnings.)
- [ ] Spec §5's static grep finds nothing; the bundle delta is re-read and recorded here.
      **Bundle at `27e41b7a`:** main chunk `1,273.91 kB │ gzip: 391.81 kB`: +0.6 kB (+0.1 kB gzip) on T7's
      `1,273.29 kB`, the Copy link button; **+13.0 kB (+5.5 kB gzip) on Task 0's `1,260.90 kB`.**
      **The grep is not empty, for two reasons, neither a leftover of Phases 1–4:** (1) `'session'` matches the content
      area name in `src/content/types.ts:64` / `index.test.ts:183` (the pattern is broader than it means to be);
      (2) `scripts/perf/audio-load-lib.mjs:74,78`, `audio-load-lib.test.mjs:427,432` and `audio-load.mjs:143` still read
      `?session=`, which is Task 13's job, so this box can only be ticked after Phase 5's Task 13.
- [x] Crawford's manual list (spec §5 "Manual") run once end to end, each item ticked here or flagged as not done.
      (Crawford, 2026-10-26, at `aad1270e` on the dev server: "checkpoint C is good, all items work and it passes" —
      including the bare triple on a fresh world after the review fix `7cf54637`, the 320 px Seeds drawer, and the
      `?debug` HUD name, which Task 10 had left unchecked.)
- [x] Reviewed with human before proceeding to Phase 5. (Crawford, 2026-10-26; Phase 5 was built before this review, at
      his instruction of 2026-10-25.)

---

### Phase 5: Harness and docs

- [x] **Task 13: `scripts/perf/audio-load-lib.mjs` — the pin check expects the spec's coordinates**

  **Description:** `expectedCoordinates(world)` returns `{ x: world.x, y: world.y }` always: the identity is in the URL for
  every link now, so the `session` branch, its `Buffer.from(…, 'base64')` decode and the `from` field go; `audio-load.mjs:143`'s
  hint loses its `session` wording. `buildPageUrl` is already right and is not edited. Spec assumption 12.

  **Proof:** RED test — `scripts/perf/audio-load-lib.test.mjs`: `expectedCoordinates({ x: 200, y: -30, query:
  'session=eyJjIjp7IngiOjEsInkiOjJ9fQ' })` is `{ x: 200, y: -30 }` (fails today: `{ x: 1, y: 2, from: 'session' }`);
  `buildPageUrl` still emits `seed=&x=&y=` in that order.

  **Acceptance criteria:**
  - [x] The returned object has exactly `x` and `y`; no `session` string appears in either script.
  - [x] The existing `parseWorldSpec` / `buildPageUrl` / bucketing cases pass unmodified.

  **Verification:**
  - [x] `npx vitest run scripts/perf/audio-load-lib.test.mjs` passes (`vitest.config.ts` includes `scripts/**/*.test.mjs`).
  - [x] `npm run lint` clean.

  **Dependencies:** Task 7.

  **Files:** `scripts/perf/audio-load-lib.mjs`, `scripts/perf/audio-load-lib.test.mjs`, `scripts/perf/audio-load.mjs`

  **Estimated scope:** S

- [x] **Task 14: `docs/todo/scratchy-audio-phones.md`, `docs/PERFORMANCE.md` — D1–D5 re-minted; `--world` is live**

  **Description:** A scratch script in the session scratchpad (never committed) run with `npx vite-node --root <repo>`:
  for each of the five recorded `?session=` values, `JSON.parse(base64 → utf8)` into the old compact shape, rebuild a
  `SessionPayload` by hand from it (the old decoder is gone; the shape is `v n c g b sf sd hm pv lb gll r d u` as this
  file's git history shows at `fee2de9e`), then `encodeWorldLinkParams(payload).toString()`. Replace the five links in
  scratchy-audio-phones.md ("The seven links") with the new strings and say the date and that they were re-minted by the
  shipped encoder. In PERFORMANCE.md rewrite `:52` (a world is pinned by `?seed=&x=&y=`, a tweaked one by the `s=` blob),
  `:295` (the row is true again), `:297`, `:387` (`--world name:x:y` pins the world again), `:388` (`?s=` rides along for
  a tweaked world; the pin check reads the spec). Spec assumption 12, §7 item 3.

  **Proof:** Read — Crawford reads the five links; each, opened with `?debug`, shows the recorded coordinates on the HUD.

  **Acceptance criteria:**
  - [x] Five new links, each under 2,000 characters, each named D1–D5 as before, with the old ones removed.
  - [x] No line in PERFORMANCE.md still says the app ignores `?seed=`/`?x=`/`?y=`.

  **Verification:**
  - [ ] Manual review; each link opened once in the browser (recorded in the commit).
  - [x] `npm run lint` clean (docs only).

  **Dependencies:** Task 7, Task 13.

  **Files:** `docs/todo/scratchy-audio-phones.md`, `docs/PERFORMANCE.md`

  **Estimated scope:** S (docs; one scratch script)

- [x] **Task 15: Living docs — `SESSION_STORAGE.md`, `PROCEDURAL_GENERATION.md`, `SECTOR_SETTINGS_SHARABLE_LINK.md`, the two source comments**

  **Description:** `SESSION_STORAGE.md`'s "Shareable Links (Phase 21)" section is rewritten for the world link (the URL
  shape, the blob and its version, the seed diff, the lenient table from spec §1.4, the three buttons, the unchanged two-phase
  boot); the "Known limitation" paragraph about the override goes. `PROCEDURAL_GENERATION.md:15–45` is rewritten: no
  override, `deriveAttenuationStyleSeed` pure, "to reproduce a world, share its link" with the triple, and the `What
  pinning both still doesn't guarantee` paragraph kept. `SECTOR_SETTINGS_SHARABLE_LINK.md` gets a header note: the wire
  format is superseded by SHORT_WORLD_LINK.md, the seam and the two-phase boot are as built there. `src/types/session.ts:83–95`
  and `src/utils/sessionDiff.ts:396–398` comments drop "never diffed" and point at the spec. Every named identifier is
  spot-checked against the shipped source, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] No living doc names `?session=`, `encodeSessionPayload`, `parseCoordinateParam` or the override as current.
  - [x] Every function name in the rewritten sections exists in `src/` at the commit.

  **Verification:**
  - [x] Manual review; `grep -rn "session=" docs/*.md docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md` finds only historical
        wording that says so.
  - [x] `npm run build:types`, `npm run lint` clean (comment edits only in `src/`).

  **Dependencies:** Task 12 (so the docs describe the final tree).

  **Files:** `docs/SESSION_STORAGE.md`, `docs/PROCEDURAL_GENERATION.md`, `docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md`,
  `src/types/session.ts`, `src/utils/sessionDiff.ts`

  **Estimated scope:** S (docs and comments)

- [x] **Task 16: `docs/todo/` — roadmap 56 "As built", backlog 19 archived, plan.md line, the intent committed**

  **Description:** Add `## 56. Short World Link` to `roadmap.md` (an "As built" entry linking the intent, the spec and this
  file, naming the §7 answers as taken, and recording risk 1 — generator drift — as accepted); move backlog 19 to
  `docs/todo/archive/backlog-archive.md` with a pointer to 56 (rebase its links, per the archive conventions); delete
  plan.md's Stage 2 first line; commit `docs/intent/short-world-link.md` if it is still untracked.

  **Proof:** Read — human review.

  **Acceptance criteria:**
  - [x] Roadmap 56 exists; backlog 19 is in the archive and not in `backlog.md`; plan.md's Stage 2 starts at item 5.
  - [x] Every relative link in the moved entry resolves from its new location.

  **Verification:**
  - [ ] Manual review.
  - [x] `npm run lint` clean (docs only).

  **Dependencies:** Task 15.

  **Files:** `docs/todo/roadmap.md`, `docs/todo/backlog.md`, `docs/todo/archive/backlog-archive.md`, `docs/todo/plan.md`,
  `docs/intent/short-world-link.md`

  **Estimated scope:** XS (docs only)

**As built, Phase 5 (2026-10-25, `feature/short-world-link`, `f3c2dec6` T13, `1c733d13` T14, `5c1bbb46` T15,
`f82ed46f` T16):**

- **Task 13:** RED failed as predicted in 4 of 5 new cases (the `?session=` case gave `{ x: 1, y: 2, from: 'session' }`,
  the others carried `from: 'spec'`); the fifth, `buildPageUrl` paired with `expectedCoordinates` ahead of an `s=` blob,
  was green on arrival, as "still emits" expects. `--help` and the mismatch hint name the world link. The function is
  now one line, so the RED cases are its mutation check (each removed branch is one failing case).
- **Task 14:**
  - **The links were in PERFORMANCE.md, not scratchy-audio-phones.md**, and there were two blocks: the T3 "seven links"
    (D1–D5, H1, H2, which backlog 27's runs use) and the T9 rebuild (the same plus X1). **18 links were re-minted, not
    five:** both blocks, the two `alpha` perf:idle links (Phase 53 baseline and R5) and the bare 50.x baseline payload in
    scratchy-audio-phones.md. Dated prose that records `?session=` as the mechanism of its day is left as history,
    flagged by the rewritten PERFORMANCE.md:52.
  - Minted by a scratch `vite-node` script: the old decoder copied out of `fee2de9e` (types unchanged since but for
    `sectorSettingsConfig.ts` data), `encodeWorldLinkParams`, then `decodeWorldLink` back, deep-equal field by field
    (18 of 18). The D params are 250–370 characters against 2,100–2,300 for the old value.
  - Opened once each in headless Chrome on the dev server with `?debug` (scratch probe over `cdp-lib.mjs`): 18 of 18
    HUD world rows read the recorded name and coordinates, the address bar unchanged; D1 `fx in 5/10 · links 43/91`
    as on 2026-10-23. Orphaned Chrome 0 after. Crawford's own read of the links (the Proof line) is still owed.
  - **Correction, 2026-10-26: ten of the eighteen were broken as committed in `1c733d13`.** The old `?session=` values
    ended in URL-encoded padding (`%3D`, `%3D%3D`); the re-mint pattern captured the value without it, so the suffix
    stayed glued to the new blob. `%3D` decodes to `=`, which is outside base64url, so `decodeBlob` dropped the blob and
    the link loaded the bare seed: right name and coordinates, none of the edits (H1's +12 dB EQ push, T3's release,
    X1 …). Neither check could see it: the HUD shows only the triple, and the probe's own pattern stopped at the `%`, so
    it opened the links without the suffix. Crawford found it 2026-10-26 by looking at one. Fixed by stripping the
    suffix (ten links, PERFORMANCE.md only), then checked with the decode the probe should have run: each of the 18 links,
    exactly as written in the doc, applies its blob and decodes to the old payload it replaced, from the docs at
    `1c733d13^` (numbers to within 1e-9, for `7cf54637`'s snapping and `aad1270e`'s exact steps). The 15 D, H and X links
    match field for field. The three `alpha` links differ only in seven fields the old link did not carry (pacing, LFO
    Bank, global links), which the world link fills from the seed, as a fresh load of the old link did.
- **Crawford, 2026-10-26: "the seven links work fine"** — read before the fix above; the HUD looks right with or
  without the blob, so his read and the fix are independent.
- **Task 15:** beyond the planned sections, SESSION_STORAGE.md's per-feature "Share links" bullets now name
  `worldDiffCodec.ts`, three "loads them dry" bullets and the `g.chorus: 1` bullet say a link's missing block takes the
  seed's, and Boot Behavior, "What changed" and two Forbidden Patterns were rewritten (they described `?session=`, the
  base64 rule and the override as current). The plan's line numbers had drifted (`session.ts` 83–86, `sessionDiff.ts`
  380–383).
- **Task 16:** the closing line says "PR pending", since the merge has not happened. A link check over the touched docs
  finds 20 broken before and 20 after, all pre-existing (specs moved to `archive/` folders). The spec and this plan are
  still untracked; only the intent was committed, as the task says.
- **The re-minted links resolve only on a build with the world link**: the on-hold phone sitting must carry this branch
  or `main` after the merge (recorded in roadmap 56's Open list).
- Suite after T16: 330 files / 12,143 tests (T13 swapped five cases for five). Main chunk `1,273.91 kB │ gzip:
  391.81 kB`, unchanged since `27e41b7a`.
- **Spec §5's static grep** over `src scripts` has two hits, both false positives: the `'session'` content area
  (`src/content/types.ts:64`, `index.test.ts:183`) and T13's test comment quoting the old `from: 'session'` return
  (`audio-load-lib.test.mjs:427`). The `audio-load` hits Checkpoint C listed are gone.

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across all tasks are met; spec §5's static grep finds nothing.
- [x] Docs reflect the shipped API — every documented name spot-checked against source.
- [x] Crawford's manual list (spec §5) ticked, including the 320 px look at the Seeds drawer; anything not done this
      session flagged here, never silently skipped.
- [x] The bundle delta and the ≈ 1,600-character measurement of Crawford's world are recorded at Checkpoints A and C.
- [ ] Ready for human review / PR (`feature/short-world-link`; Crawford opens the PR).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A store import creeps into the generator graph and `sessionShareUtils.ts` (imported by two stores at module init) cycles at boot | High | Task 2's acceptance grep (`stores/` absent from `seedBaseline.ts`); `worldLink.test.ts` imports `worldLink` before any store, so a cycle fails the import rather than returning `undefined` (spec risk 2). |
| The seam imports the link while the link imports the codec back from the seam's module (`sessionShareUtils` ↔ `worldLink`), which throws at load whenever `worldLink` is imported first | High | Task 6b moves the codec to `worldDiffCodec.ts` before Task 7 wires the seam; Task 7's acceptance grep (no `sessionShareUtils` in `worldLink.ts` / `worldDiffCodec.ts`) and its `worldLink`-first fresh-import case (spec risk 2, amended 2026-10-25). |
| `fillWorldFromSeed` deep-merges a block, so a lane or block that lost its `sync` restores with the seeded `sync` | Medium | Task 3's lost-`sync` case and the round-trip law; the shallow-spread shape is written out in the spec §4 snippet. |
| The seam switch (Task 7) breaks a test that constructed `?session=` by hand somewhere not in the survey's count | Medium | Task 7's verification runs the full suite; a failing file is re-pointed inside Task 7 (test-only), not deferred. |
| `applySessionPayload` is "improved" to accept partials while the decoder is being written | Medium | Task 7's acceptance criterion that `git diff --stat` shows no change under `sessionDiff.ts`, the stores or components. |
| The HUD loses its world line for one commit if the deletion lands before the re-point | Low | Task 10 precedes Task 11 in the dependency graph. |
| The D1–D5 re-mint is done by hand and a link drifts from its recorded world | Medium | Task 14 mints through the shipped encoder from the old payloads and opens each link once with `?debug` to read the coordinates back. |
| `fflate`'s deflate bytes change in a later release and a recorded blob stops matching | Low | No test records a blob; every test round-trips or asserts the bare-triple string (spec risk 3). |
| A scratch noise map leaks on a generator exception | Low | Task 2's `try … finally` and its throwing-generator case. |
| Generator drift silently changes what an old link plays | Accepted | Recorded in roadmap 56 (Task 16) and the spec's risk 1; pre-v1, no mitigation by design. |

## Open Questions

Carried from the spec's §7; each task below builds the default, and the task to revisit is named.

1. **Share live stays** (spec §7 item 1). **Default built:** yes. A veto removes the button from `SessionsPanel.tsx`'s save
   row and its `SHARE_LIVE_SCHEMA` / `session.shareLive` entry — a new XS task after Task 9, with its test.
2. **Blob param `s`** (item 2). **Default built:** `s`. A veto is one constant in `WORLD_LINK_PARAMS` (Task 5) and the exact
   strings in Tasks 6 and 7's tests.
3. **Re-mint D1–D5** (item 3). **Default built:** Task 14. A veto (keep the `session` reader until the phone sitting) would
   contradict the intent and is not planned; raise before Task 7.
4. **No float rounding on the wire** (item 4). **Default built:** none. A veto adds a rounding pass in `toCompactWorldDiff`
   (Task 4) with a test that state is never rounded.
5. **Whole-payload decode** (item 5). **Default built:** Tasks 3 and 6. A veto reshapes Task 3's `fillWorldFromSeed` into an
   `applySessionPayload` change — a different plan for Phase 2; raise before Task 3.
6. **Name uncapped** (item 6). **Default built:** uncapped. A veto adds a cap in `decodeWorldLink` (Task 6) and a test.
7. **Roadmap number 56, title "Short World Link"** (item 7). **Default built:** Task 16. A veto is a rename there and in this
   file's header.
