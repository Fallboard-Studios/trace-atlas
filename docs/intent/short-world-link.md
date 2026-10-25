# Intent: Short World Link — `?seed=&x=&y=` plus one compact diff blob, replacing `?session=`

Confirmed via `interview-me` on 2026-10-24 (6 questions; two pre-interview guesses overturned by the size
measurement that preceded it — "the seed-diff is the big win, compression secondary" reversed, and "the rig differs
from its seed because of generator drift" was wrong: Crawford had edited every control), ahead of a
`spec-driven-development` pass. Backlog item
[19](../todo/archive/backlog-archive.md#19-short-world-link-bring-back-seed-x-and-y), first item of plan.md's Stage 2. Supersedes
the wire format of roadmap [21](../todo/roadmap.md#21-sector-settings-shareable-link-importexport)
([sector-settings-shareable-link.md](sector-settings-shareable-link.md)) while keeping its boot seam. Not yet a
roadmap entry; the spec pass gives it a number.

## Outcome

One link format for every shared world. The identity is always readable and hand-editable —
`?seed=<exact Attenuation Style name>&x=<int>&y=<int>` — and an edited world adds **one** compact blob param carrying
only what differs from what that seed regenerates. An untouched world has no blob at all: `?seed=n40dh8p8&x=29&y=-14`
is the whole link, about 25 characters. Crawford's fully edited world (every Audio Rig control, every LFO Bank lane,
every global link and everything on all twelve robots) shares in under 2,000 characters instead of today's 14,000.
The link loads through the existing synchronous boot seam, so there is no flash of the wrong world — exactly what
`?session=` does today, which this format replaces.

## Behavior

- **Two parts, one URL.** `seed`, `x`, `y` are plain query params a person can read, type and edit. The blob is a
  single further param (working name `s=`; the spec picks the final name) and is present only when the live world
  differs from what the seed regenerates. A Transmission preset is the bare triple; a user's save is the triple plus
  blob.
- **The blob is a diff against the seed, all the way down.** Robot overrides and company diffs already follow
  absent-means-seeded (`buildSessionPayload`, [sessionDiff.ts:361](../../src/utils/sessionDiff.ts#L361)). The blob
  extends that to `globalAudio`, `lfoBank`, `globalLfoLinks` and the pacing scalars (bpm, swell frequency and
  duration, humanize, ping variance), diffed against `generateGlobalAudioSettings`, `generateLfoBankSettings`,
  `generateGlobalLfoLinks` ([globalAudioSeed.ts](../../src/utils/globalAudioSeed.ts)) and `generateAttenuationStyleBpm`
  ([bpmSeed.ts](../../src/utils/bpmSeed.ts)), all synchronous. The "never diffed, no meaningful baseline" comment on
  `SessionPayload` ([session.ts](../../src/types/session.ts)) stops being true once the seed is in the URL, and goes.
- **Deflate, then URL-safe text.** The diff is JSON with the existing abbreviated keys, deflated (raw deflate) and
  written as base64url. On Crawford's worst-case link that is ~1,600 characters against 14,000 today and 5,200 for
  lz-string; twelve near-identical robot edits cost almost nothing extra (772 characters for twelve against 516 for
  one). Measured 2026-10-24 on the repo's own generators; the table is in the implementation notes.
- **The app fills in the blanks.** A link missing any part still loads: a missing seed, x or y takes what a fresh
  world would get (random name, default coordinates); a blob without its identity is simply applied to whatever
  world results. Nothing is rejected for being partial. Case and spaces in the name round-trip exactly through
  ordinary URL encoding; **no name is ever sanitised** — the old `?seed=` lowercased and stripped it, which is the
  bug that got it removed (Phase 21 spec §7 item 1).
- **A format version, no migrations.** The blob carries one version marker. A version the app no longer reads is
  dropped and the link degrades to the bare seed-and-coordinates world; it never fails to load. There is no
  per-generator versioning: a link made under an older generator plays whatever today's seed plus the blob produces.
  Crawford is not worried about anything shared before this ships.
- **Two places make a link, one encoder behind both.** A **Copy link** in Settings → Seeds (which already shows the
  name and coordinates) for the live world, and the existing **Share** on a saved session in the Sessions panel
  (`SessionListItem.tsx` / `SessionsPanel.tsx`, `buildShareUrl`). Both call the same encoder, which always emits the
  shortest correct form. Detecting "untouched" means comparing against the regenerated baseline, not just checking
  that `robotOverrides` and `companyDiffs` are empty.
- **The address bar never changes on its own.** Tweaking the world does not grow a blob in the URL; a link is made
  only when asked for. Retransmit does not rewrite the URL either.
- **Old `?session=` links stop resolving.** The `session` param is no longer read. Local saved sessions are
  unaffected (they store the payload object, not the wire string).
- **`theme=` is reserved, absent means classic.** Nothing reads it yet (themes are docs/ideas/themes.md); reserving
  it now means the off-screen redo and themes never reopen this format.

## Style / constraint

- **The boot seam stays synchronous.** `attenuationStyleStore.ts:23` pins the style name and
  `localeStore.ts:73–77` pins the coordinates from `getSessionSharePayload()` at module load, before first paint.
  The new decoder must therefore inflate synchronously, which rules out the native `CompressionStream` (async).
  **One new dependency, approved by Crawford in the interview: `fflate`** (sync inflate/deflate, ~8 kB) — the
  ask-first rule in CLAUDE.md is satisfied by this record. `lz-string` is rejected on the numbers (3x longer).
- **Second wire format for the same boot path, not a revival of the override.** The URL is decoded into a
  `SessionPayload` (exact name, coordinates, and only the fields the blob carries) and handed to the existing
  `getSessionSharePayload` / `consumeSessionSharePayload` seam
  ([sessionShareUtils.ts:471–484](../../src/utils/sessionShareUtils.ts#L471-L484)); `applySessionPayload`
  ([sessionDiff.ts:531](../../src/utils/sessionDiff.ts#L531)) already leaves absent fields at their freshly seeded
  values. The module-level `seedUtils.ts` override primitives (`setGlobalAttenuationStyleSeedOverride`,
  `parseCoordinateParam`, `LocaleCoordinateOverride`) are **deleted** as part of this work, not revived — that is
  the fate roadmap 48's sweep left to this item.
- **A share link is untrusted input.** The decoder fails soft (malformed blob = no blob), and every value still
  passes the setters' clamps as today.
- **State stays JSON-serialisable; nothing new in Zustand.** The encoder and decoder are pure helpers.
- **Copy, not code, for the two buttons:** labels live in `src/content/` via `labels()`, never a literal.
- Pre-v1: no "keep existing links working" constraint ([pre-v1 stance](../todo/backlog.md), Crawford 2026-10-14).

## Out of scope

- **The off screen's presets, themes and sessions UI** — backlog 5, its own interview. This item delivers the wire
  format a preset will print; it does not touch the powered-down screen.
- **Making `theme=` do anything.**
- **Migration or compatibility for `?session=` links or for blobs written under an older generator.**
- **Updating the address bar live** as the world is edited, or on Retransmit.
- **A URL shortener or any server.** Short means short enough to paste, not a redirect service.
- **Changing the local session save format** (`SessionEntry`, the 6-slot autosave) — only the wire format changes.
- **Diffing user-created companies** — they have no seed and keep travelling whole.
- **Rounding floats on the wire.** Measured at ~7 % further saving; a spec-level detail Crawford does not mind either
  way, not a requirement.

## Known implementation notes (not yet spec'd)

- **The measurement** (2026-10-24, Crawford's real link: style `n40dh8p8`, 29,-14, every control and all twelve robots
  edited; URL-param characters; scratch scripts in the session scratchpad, run with `npx vite-node --root <repo>`
  against the repo's generators):

  | payload | base64 (today) | lz-string | deflate-raw + base64url |
  |---|---|---|---|
  | whole payload, today's wire | 14,094 | 5,352 | 1,711 |
  | seed-diffed, identity moved to `?seed=&x=&y=` | 13,866 | 5,217 | 1,615 |
  | same, floats rounded to 4 dp | 12,574 | 4,590 | 1,494 |
  | synthetic: robots only, rig equals seed | 11,962 | 4,218 | 772 |
  | synthetic: one robot edited | 1,024 | 647 | 516 |
  | synthetic: rig only, no robots | 2,084 | 1,238 | 984 |

  Today's blob is 85 % robot overrides, 10 % rig, 4 % LFO bank and links. The seed-diff removed only 1.6 % of this
  link because everything was edited; in the common case (robots edited, rig untouched) it halves the deflated blob.
- **Param names.** `seed` stays (Crawford's word throughout); `x`, `y`, `theme` reserved; the blob's name is the
  spec's call (`s` is the working name). If `seed` is ever present alongside a blob, the blob is applied on top of
  the seed's world, never the other way round.
- **Encoder shape.** `encodeSessionPayload` / `decodeSessionPayload`
  ([sessionShareUtils.ts:441–449](../../src/utils/sessionShareUtils.ts#L441-L449)) and the `CompactSessionPayload`
  abbreviations stay the JSON layer; the diff-against-seed step and the deflate/base64url step wrap them. The
  `SESSION_PARAM = 'session'` constant and its reader go. `buildShareUrl` (`:494`) composes the triple plus optional
  blob.
- **Baseline for the diff.** The generators take `(attenuationStyleId, attenuationStyleName)`; the id is only the
  noise-map cache key ([noiseMaps.ts:20](../../src/utils/noiseMaps.ts#L20)), the seed is the name via
  `deriveAttenuationStyleSeed`. The encoder can call them with a scratch id. Mind the `compressorBeforeDelay` and
  seed-once/carry-forward fields in `regenerateGlobalAudioFromSeed` (`audioStore.ts:591–630`): the baseline for
  pacing scalars is the generator's value, not whatever carried forward from a previous style.
- **Float precision.** Seeded values and log-slider edits carry 15–17 digit doubles (e.g. `0.018377840937736988` on a
  robot ADSR). Rounding to 4 dp saved 7 %; if the spec adopts it, the rounding must happen on the wire only, never in
  state, and the slider steps already define what a human can set.
- **Knock-ons once built** (from the backlog entry): the debug HUD's world line reads a real name again; the perf
  harness's `--world name:x:y` option (`scripts/perf/profile.mjs`) comes back to life and PERFORMANCE.md's suspect
  baselines can be re-measured; PROCEDURAL_GENERATION.md lines 23–38 are rewritten around the new mechanism;
  SESSION_STORAGE.md's "Shareable Links" section and SECTOR_SETTINGS_SHARABLE_LINK.md are updated for the new wire.
- **Tests exercise code, not text** (CLAUDE.md, 2026-10-23): the round-trip, the diff-against-seed, the fill-in-the-
  blanks loader and the version-drop are all behaviour with tests; the docs updates get none.
