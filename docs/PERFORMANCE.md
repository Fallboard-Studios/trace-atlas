# Performance Profiling

How to measure Trace Atlas's main-thread performance, and the running baseline that roadmap 17.2.2–17.2.5 are verified against. Built for roadmap **17.2.1**; the harness is `scripts/perf/profile.mjs`.

## Why this exists

Audio and the UI share one main thread. Tone schedules notes only about **100 ms** ahead (its default `lookAhead`, `latencyHint: "interactive"`), so any main-thread task longer than that risks late or dropped notes — an audible pause. Every metric below is reported against that 100 ms line.

## Running the harness

Needs Node 22+ (built-in `WebSocket`) and an installed Chrome or Edge. No dependency is added.

```bash
npm run build                        # production build (uses base /trace-atlas/, see vite.config.ts)
npx vite preview --port 4173         # terminal 1 — serve it
npm run perf                         # terminal 2 — 4x CPU throttle, desktop viewport
```

Flags (`npm run perf -- --help` for the full list):

| Flag | Effect |
|---|---|
| `--throttle <n>` | CPU slowdown multiplier; `1` = none. Default `4` (Chrome DevTools' "recommended" mobile setting). |
| `--mobile` | 390×844 phone viewport instead of 1280×900. |
| `--width <px>` | Viewport width (overrides `--mobile`/desktop; ≤ 480 is treated as a phone). Use 390 / 820 / 1280 for the three breakpoints. |
| `--smoothness` | Instead of the step table, opens every accordion frame-by-frame-sampled and reports empty-open frames, the height snap at `auto`, and slow frames — see the smoothness section below. **Dormant since the layout rework (roadmap 45) replaced the accordions with section tabs: it finds none, says so and exits** ([backlog 31](todo/backlog.md#31-tooling-profilemjs-against-the-layout-rework)). |
| `--profile` | Adds a CPU profile (top self/inclusive functions) for an idle window and for opening Fleet Params. |
| `--trace` | Adds a layout/paint trace summary for the same two windows. |
| `--url <url>` | Profile a different server (e.g. an unminified build). |
| `--chrome <path>` | Chrome/Edge executable (else `$CHROME_PATH`, else a platform default). |

**Readable function names:** `--profile` is only useful against an unminified build:

```bash
npx vite build --minify false --outDir <some-temp-dir> --emptyOutDir
npx vite preview --outDir <some-temp-dir> --port 4174
npm run perf -- --url http://localhost:4174/trace-atlas/ --profile --trace
```

The default step sequence (since 2026-10-23, [backlog 31](todo/backlog.md#31-tooling-profilemjs-against-the-layout-rework) option A): power on → open Fleet Params → switch to Probes → open the first robot (its roster tile's face) → back to the roster (the nav panel's Probes box) → switch to Settings → back to Fleet Params. Steps are clicked by their visible nav-panel labels (`TILE_*` constants at the top of the script), which are the `human` of each `*.root` entry in `src/content/copy/` — a rename there needs the same rename here. Before the layout rework the sequence also opened each accordion of Fleet Params and of the robot's detail in turn (the `fleet › …` / `detail › …` rows the tables below carry); those rows are dormant now, see the last bullet. Each step reports:

- `tasks >=100ms` / `longest (ms)` / `total in >=100ms tasks (ms)` — main-thread long tasks over Tone's lookahead (the audible-pause count).
- `tasks >=50ms` — total long tasks Chrome reports (its own threshold), including the steady background churn after a switch.
- `cabinetBoxes` — `.sc-cabinet-box` elements on the page. **This includes the header's 12** (present at power-on), and the Probes count drifts upward across a run as factories build robots.
- `boxes in closed accordions` — `.sc-cabinet-box` elements inside a collapsed accordion. Before roadmap 17.2.2 this measured waste (it was 301 on Fleet Params); since the lazy mount it is **expected to be 0 for a never-opened section, so a non-zero value right after a tile opens is a regression alarm** (someone re-added an eager mount). The per-section rows (`fleet › …`, `detail › …`) are the first-open cost of each section. **Dormant since the layout rework (roadmap 45) replaced the accordions with section tabs:** no `.sc-accordion` exists in the app, so the per-section rows find nothing to open and print a note instead, and this column reads 0 for want of accordions, not because of the lazy mount. Re-aiming both at `.section-tabs__trigger` is [backlog 31](todo/backlog.md#31-tooling-profilemjs-against-the-layout-rework) option B.

## Caveats

- **Throttling is main-thread only.** `Emulation.setCPUThrottlingRate` does not slow compositor or raster worker threads. Treat throttled numbers as a *relative* signal for main-thread work, not a phone simulator.
- **Headless Chrome's raster/compositing path differs from a phone GPU's.** Paint and compositing figures (roadmap 17.2.5) are directional until confirmed on real hardware.
- **Audio isn't measured directly.** Headless Chrome has no real audio output (`--mute-audio` is on). The 100 ms threshold is the *proxy* for an audible pause; confirm by ear on a real device.
- **The world is random per load unless pinned.** For like-for-like comparisons (especially audio load) pin it with a world link ([specs/SHORT_WORLD_LINK.md](specs/SHORT_WORLD_LINK.md), roadmap 56): `?seed=<name>&x=<int>&y=<int>` pins the seeded world, and a world tweaked away from its seed adds one `s=1.<blob>` param (Settings → Seeds → Copy link copies both). From 2026-09-28 until the world link only a `?session=` link pinned a world, and the sections from that stretch say so; those links no longer resolve, and every copyable one below was re-minted as a world link on 2026-10-25. The harness does not add these params itself; pass them via `--url`. `perf:idle` sidesteps this by running every variant in one session on one world. Baselines recorded before 2026-09-19 were taken on random worlds.
- **Run-to-run variance is large** (e.g. Probes at 4× throttle: 2.3 s in one run, 3.9 s in another — background robot/swell activity differs per run). Run 3× and compare medians, and only trust differences bigger than that spread.
- **Trace durations overlap.** A `FunctionCall` contains its own layouts, so compare an event's total across runs, never across event names.
- **Trace `RasterTask` totals are unstable** between runs (worker-thread events); ignore them. Their *time*, that is: which layer rastered in which frame is stable, and that is what `rastered screens/frame` reads (localizer section below; "Per-Mover Compositor Layers — the re-rastered area column").
- **Real phone:** the harness does not attach to a phone. To measure one, use Chrome's DevTools → Remote devices over USB and read the Performance panel / Local metrics by hand; record it in the table below.

## Baseline (2026-09-18, production build, desktop 1280×900, headless Chrome)

`tasks ≥100ms / longest ms / total ms in ≥100ms tasks`, from the runs on 2026-09-18. Ranges span 2 runs (4×) and 2 runs (1×).

| Step | Cabinet boxes | 4× throttle | 1× (none) |
|---|---|---|---|
| power on | 12 | 4 / 2.4–2.9 s / 3.1–3.7 s | 1 / 378–470 ms / 378–470 ms |
| open Fleet Params | 318–321 | 4–10 / 1.4–1.7 s / 2.9–4.0 s | 2 / 192–339 ms / 362–634 ms |
| switch to Probes | 481–494 | 6–8 / 2.3–3.9 s / 5.2–7.5 s | 2 / 373–537 ms / 687–1041 ms |
| switch to Nav & Comms | 26 | 1–3 / 330–342 ms / 330–586 ms | 0 / 55–80 ms / 0 ms |
| back to Fleet Params | 318–321 | 4–7 / 1.2–1.3 s / 2.7–3.1 s | 2 / 206–255 ms / 406–456 ms |

Every switch to a 300+ box tile exceeds the 100 ms line **even unthrottled** — the source of the audible pause. (An earlier DevTools Local-metrics capture at 4× on Crawford's machine showed INP 43,184 ms; a click on a `.sc-cabinet-box__front` spent ~25.5 s in processing.)

### Trace and CPU-profile baseline (4× throttle, unminified build)

| Window | Measure | Value |
|---|---|---|
| Open Fleet Params (9 s) | Forced style+layout passes (`Document::UpdateStyleAndLayout`) | **~10,100 events, ~2.7 s** |
| Open Fleet Params (9 s) | Layout events | ~1,600 events, ~2.5 s |
| Open Fleet Params (9 s) | Top JS self time | GSAP `_getComputedProperty` ~1.4 s, `getPropertyValue` ~0.4 s |
| Idle, blank hub (6 s) | Main thread busy | ~5.0 s of 6.0 s is native `(program)` work (paint/composite), ~0.1 s idle |
| Idle, blank hub (6 s) | Paint lifecycle / `PaintArtifactCompositor::Update` | ~2.9 s / ~1.7 s across ~120 frames |
| Idle, blank hub (6 s) | Forced style+layout passes | 31 events, ~30 ms |

Two idle-profile observations recorded for 17.2.5 (not yet investigated): `tickAudioSwells` → `advanceActiveSwells` → `writeRobotValue` (`src/systems/audioSwells.ts`, scheduled on a `16n` repeat) accounted for ~0.4 s inclusive of a 6 s idle window and appears to feed React re-renders (~0.5 s of `performWorkOnRoot`); and native `createPeriodicWave` (not referenced from `src/`, so Tone-internal) showed ~0.26 s self time.

## Pre-change baseline for roadmap 17.2.2 (2026-09-18)

The reference that [docs/specs/ACCORDION_LAZY_MOUNT.md](specs/ACCORDION_LAZY_MOUNT.md)'s success criteria (§5.3) are measured against, recorded **before** the lazy-mount change lands. It supersedes the single-run table above for that purpose: 3 runs per throttle rate instead of 2, plus the robot-detail steps and the per-section first-open rows the earlier table lacks (the earlier table stays as history).

- **Code measured:** commit `33807e6` (production, minified `npm run build` + `vite preview`). Product source under `src/` is identical to `ccddf6e`; only the harness changed between them.
- **Environment:** Windows 11, headless Chrome 153.0.8010.52, desktop viewport 1280×900, `npm run perf` at `--throttle 1` and `--throttle 4`, 3 runs each, run **sequentially with nothing else running**. Cells read `median (min–max)`; a bare number means all three runs agreed.
- **Notes on the data:**
  - An earlier batch was discarded: overlapping background launches collided on the debugging port and left orphaned Chrome processes running the app, so its numbers can't be trusted. The tables below are from a clean re-run (no orphaned processes before or after). Its values match the original single-run figures (Fleet Params 262 ms, Probes list 410 ms at 1×).
  - The per-section rows (`fleet › …`, `detail › …`) measure opening that section **pre-change**: the content is already mounted, so only the height tween runs and the cost is near zero. Post-change, the same rows carry the mount cost that moved here.
  - Two visible outliers, kept in the ranges rather than dropped: one 4× "switch to Probes" run at 5,822 ms (median 2,048 ms), and one 4× `fleet › Output` run at 708 ms total (median 109 ms) — background robot/swell activity varies run to run.
  - Probes-list and robot-detail box counts drift by a few (`481–494`, `401–404`) as factories build robots over a run; the "in closed accordions" column drifts with it.

### 1× throttle — 3 runs (median (min–max))

| Step | tasks ≥100 ms | longest (ms) | total in ≥100 ms tasks (ms) | cabinet boxes | boxes in closed accordions |
|---|---|---|---|---|---|
| power on | 1 | 623 (522–687) | 623 (522–687) | 12 | 0 |
| open Fleet Params | 2 | 262 (255–329) | 523 (507–613) | 321 (318–321) | 301 (298–301) |
| fleet › Transport & Composition | 0 | 0 | 0 | 321 (318–321) | 280 (277–280) |
| fleet › EQ & Filters | 0 | 0 | 0 | 321 (318–321) | 146 |
| fleet › Time & Space | 0 | 0 | 0 | 321 (318–321) | 84 |
| fleet › Output | 0 | 0 | 0 | 321 (318–321) | 0 |
| switch to Probes | 2 | 410 (368–410) | 787 (721–789) | 487 (481–494) | 357 (357–363) |
| open first robot (detail) | 2 | 291 (274–302) | 557 (535–582) | 403 (402–408) | 358 (358–364) |
| detail › Volume | 0 | 0 | 0 | 403 (402–408) | 319 (319–325) |
| detail › Melody | 0 | 0 | 0 | 403 (402–408) | 274 (274–280) |
| detail › Envelope | 0 | 0 | 0 | 403 (402–408) | 233 (233–239) |
| detail › Source | 0 | 0 | 0 | 403 (402–408) | 0 |
| back to robot list | 2 | 397 (374–413) | 729 (696–742) | 487 (481–494) | 357 (357–363) |
| switch to Nav & Comms | 0 | 84 (82–89) | 0 | 26 | 0 |
| back to Fleet Params | 2 | 209 (155–247) | 404 (304–469) | 321 (319–321) | 301 (299–301) |

### 4× throttle — 3 runs (median (min–max))

| Step | tasks ≥100 ms | longest (ms) | total in ≥100 ms tasks (ms) | cabinet boxes | boxes in closed accordions |
|---|---|---|---|---|---|
| power on | 4 | 2214 (2169–2240) | 2934 (2815–2988) | 12 | 0 |
| open Fleet Params | 4 (3–5) | 1270 (1254–1291) | 2659 (2478–2733) | 321 | 301 |
| fleet › Transport & Composition | 0 (0–5) | 92 (85–161) | 0 (0–649) | 321 | 280 |
| fleet › EQ & Filters | 2 (0–4) | 120 (98–141) | 236 (0–496) | 321 | 146 |
| fleet › Time & Space | 0 (0–1) | 82 (77–118) | 0 (0–118) | 321 | 84 |
| fleet › Output | 1 (0–6) | 109 (87–143) | 109 (0–708) | 321 | 0 |
| switch to Probes | 4 (4–10) | 2048 (1837–5822) | 4286 (3959–11557) | 481 (480–495) | 357 (356–358) |
| open first robot (detail) | 4 | 1354 (1287–1808) | 2854 (2756–3506) | 402 (401–404) | 358 (357–359) |
| detail › Volume | 0 (0–2) | 90 (83–176) | 0 (0–300) | 402 (401–404) | 319 (318–320) |
| detail › Melody | 0 (0–2) | 94 (87–210) | 0 (0–380) | 402 (401–404) | 274 (273–275) |
| detail › Envelope | 0 (0–1) | 77 (75–133) | 0 (0–133) | 402 (401–404) | 233 (232–234) |
| detail › Source | 1 (0–1) | 100 (91–109) | 100 (0–109) | 402 (401–404) | 0 |
| back to robot list | 5 (5–7) | 2026 (1938–2089) | 4185 (3959–4506) | 481 (480–495) | 357 (356–358) |
| switch to Nav & Comms | 1 | 379 (369–381) | 379 (369–381) | 26 | 0 |
| back to Fleet Params | 4 (4–7) | 1074 (1043–1672) | 2266 (2256–3871) | 321 | 301 |

### Section sizes (cabinet boxes per accordion, from the "in closed accordions" deltas above)

| Fleet Params | Boxes | Robot detail | Boxes |
|---|---|---|---|
| Transport & Composition | 21 | Volume | 39 |
| EQ & Filters | 134 | Melody | 45 |
| Time & Space | 62 | Envelope | 41 |
| Output | 84 | Source | 233 |

The largest single section is **Source** on the robot detail page (233 boxes), then EQ & Filters (134). Post-change, these are the first-open costs to watch.

### Gate numbers for 17.2.2 (spec §5.3), derived from this baseline

| Gate | Measured against | Threshold |
|---|---|---|
| 1 — deterministic | Total `.sc-cabinet-box` right after a tile opens | Fleet Params ≤ 25 (now 321), Probes list ≤ 150 (now ~481–494), robot detail ≤ 55 (now ~402–403), Nav & Comms unchanged at 26; `boxes in closed accordions` = 0 for every never-opened section |
| 2 — 1×, medians of 3 | Longest task: open Fleet Params (262 ms), open robot detail (291 ms), switch to Probes (410 ms) | Fleet Params and robot detail: **no task ≥ 100 ms**. Probes list: **≤ 205 ms** (≤ 50% of 410) |
| 3 — 4×, medians of 3 | Total time in ≥ 100 ms tasks: open Fleet Params (2,659 ms), open robot detail (2,854 ms) | Down **≥ 60%**: Fleet Params **≤ 1,064 ms**, robot detail **≤ 1,142 ms** |
| 4 — recorded, not gated | First-open cost per section (rows above), 1× and 4× | Target < 100 ms at 1×; a miss is documented, not blocking (spec §7 Q5) |

## Post-change results for roadmap 17.2.2 — accordion lazy mount (2026-09-18)

Measured against the pre-change baseline above, with the same harness, machine, viewport (1280×900), and procedure: 3 sequential runs at each throttle rate with nothing else running, no orphaned processes before or after. **Code measured:** commit `6fb88b7` (production, minified `npm run build` + `vite preview`). Cells read `median (min–max)`.

### 1× throttle — 3 runs (median (min–max))

| Step | tasks ≥100 ms | longest (ms) | total in ≥100 ms tasks (ms) | cabinet boxes | boxes in closed accordions |
|---|---|---|---|---|---|
| power on | 1 | 584 (555–692) | 584 (555–692) | 12 | 0 |
| open Fleet Params | 0 | 0 | 0 | 20 | 0 |
| fleet › Transport & Composition | 0 | 0 | 0 | 41 | 0 |
| fleet › EQ & Filters | 1 (1–2) | 128 (125–132) | 132 (125–229) | 173 (172–174) | 0 |
| fleet › Time & Space | 0 | 0 | 0 | 235 (234–236) | 0 |
| fleet › Output | 0 | 63 (54–72) | 0 | 319 (318–320) | 0 |
| switch to Probes | 1 | 132 (131–147) | 132 (131–147) | 137 (124–137) | 0 |
| open first robot (detail) | 0 | 0 | 0 | 45 (44–45) | 0 |
| detail › Volume | 0 | 0 | 0 | 84 (83–84) | 0 |
| detail › Melody | 0 | 0 | 0 | 129 (128–129) | 0 |
| detail › Envelope | 0 | 0 | 0 | 170 (169–170) | 0 |
| detail › Source | 1 | 106 (106–107) | 106 (106–107) | 402 (400–404) | 0 |
| back to robot list | 1 | 143 (136–150) | 143 (136–150) | 137 (124–137) | 0 |
| switch to Nav & Comms | 0 | 0 | 0 | 26 | 0 |
| back to Fleet Params | 0 | 0 | 0 | 20 | 0 |

### 4× throttle — 3 runs (median (min–max))

| Step | tasks ≥100 ms | longest (ms) | total in ≥100 ms tasks (ms) | cabinet boxes | boxes in closed accordions |
|---|---|---|---|---|---|
| power on | 4 | 2151 (2086–2315) | 2828 (2729–2962) | 12 | 0 |
| open Fleet Params | 1 | 132 (124–143) | 132 (124–143) | 20 | 0 |
| fleet › Transport & Composition | 2 | 164 (150–199) | 303 (296–343) | 41 | 0 |
| fleet › EQ & Filters | 3 (3–4) | 903 (882–965) | 1551 (1473–1566) | 175 | 0 |
| fleet › Time & Space | 2 | 259 (254–307) | 441 (417–512) | 237 | 0 |
| fleet › Output | 2 | 375 (369–436) | 570 (535–685) | 321 | 0 |
| switch to Probes | 4 (3–4) | 917 (754–949) | 1523 (1233–1547) | 124 | 0 |
| open first robot (detail) | 2 | 170 (162–171) | 274 (269–306) | 44 | 0 |
| detail › Volume | 2 | 145 (143–191) | 283 (282–336) | 83 | 0 |
| detail › Melody | 2 | 171 (170–175) | 326 (320–335) | 128 | 0 |
| detail › Envelope | 2 | 176 (168–178) | 279 (268–281) | 169 | 0 |
| detail › Source | 4 | 721 (700–798) | 1623 (1578–1730) | 402 (402–403) | 0 |
| back to robot list | 4 (3–4) | 797 (795–850) | 1346 (1187–1404) | 124 | 0 |
| switch to Nav & Comms | 1 | 189 (188–198) | 189 (188–198) | 26 | 0 |
| back to Fleet Params | 0 | 64 (58–69) | 0 | 20 | 0 |

### Gate results (thresholds from [docs/specs/ACCORDION_LAZY_MOUNT.md](specs/ACCORDION_LAZY_MOUNT.md) §5.3, fixed before implementation)

| Gate | Threshold | Result | |
|---|---|---|---|
| 1 — closed-accordion boxes | 0 in any never-opened section | **0** on every screen | **PASS** |
| 1 — box totals | Fleet Params ≤ 25 · Probes list ≤ 150 · robot detail ≤ 55 · Nav & Comms unchanged | **20** (was 321) · **137**, range 124–137 (was 481–494) · **45**, range 44–45 (was ~402–403) · **26** | **PASS** |
| 2 — open Fleet Params, 1× | no task ≥ 100 ms | **0** tasks ≥ 100 ms, longest 0 ms (was 262 ms) | **PASS** |
| 2 — open robot detail, 1× | no task ≥ 100 ms | **0** tasks ≥ 100 ms, longest 0 ms (was 291 ms) | **PASS** |
| 2 — switch to Probes list, 1× | longest ≤ 205 ms (≤ 50% of 410) | **132 ms** (−68%) | **PASS** |
| 3 — open Fleet Params, 4× | total in ≥ 100 ms tasks ≤ 1,064 ms (down ≥ 60% from 2,659) | **132 ms** (−95%) | **PASS** |
| 3 — open robot detail, 4× | total in ≥ 100 ms tasks ≤ 1,142 ms (down ≥ 60% from 2,854) | **274 ms** (−90%) | **PASS** |

Other steps moved the same direction (medians, pre → post): 4× switch to Probes total 4,286 → 1,523 ms (−64%), 4× back to robot list 4,185 → 1,346 ms (−68%), 4× back to Fleet Params 2,266 → 0 ms; 1× back to Fleet Params 209 ms → no long task. `power on` is unchanged (~580–620 ms; it is audio start-up, not a tile).

### First-open cost — recorded, not gated (spec §5.3.4, §7 Q5)

The work did not disappear; it moved from opening a tile to the first time each section is opened. Longest single task when a never-opened section is first opened (median), pre-change vs post-change:

| Section | Boxes | 1× pre | 1× post | 4× pre | 4× post |
|---|---|---|---|---|---|
| fleet › Transport & Composition | 21 | 0 | 0 | 92 | 164 |
| fleet › EQ & Filters | 132 | 0 | **128** | 120 | **903** |
| fleet › Time & Space | 62 | 0 | 0 | 82 | 259 |
| fleet › Output | 84 | 0 | 63 | 109 | 375 |
| detail › Volume | 39 | 0 | 0 | 90 | 145 |
| detail › Melody | 45 | 0 | 0 | 94 | 171 |
| detail › Envelope | 41 | 0 | 0 | 77 | 176 |
| detail › Source | 232 | 0 | **106** | 100 | **721** |

(Pre-change values are the near-zero height-tween cost, since the content was already mounted; a bare `0` means no task reached Chrome's 50 ms reporting threshold. Box counts are the increase in `.sc-cabinet-box` when the section opened.)

- **Two sections exceed 100 ms at 1×:** EQ & Filters (128 ms, 132 boxes) and Source (106 ms, 232 boxes). Per the decision recorded in the spec (§7 Q5), that is documented, not blocking. At 4× (the phone proxy) EQ & Filters is the worst single hitch at ~0.9 s.
- **Total work is conserved, as designed:** opening all four Fleet Params sections at 4× costs 303 + 1,551 + 441 + 570 ≈ 2,865 ms of ≥ 100 ms tasks in total, against 2,659 ms that the pre-change tile open paid up front — now spread over four separate user-initiated clicks instead of one stall that pauses audio on every tile switch.
- **What remains to be improved** (not this item): the per-box mount cost itself (roadmap 17.2.3) is what makes those first opens 0.1–0.9 s at 4×; and the 137 boxes still on the Probes list plus the header's 12 are outside any accordion.

## Smoothness pass for roadmap 17.2.2 — first-open animation (2026-09-18)

**Historical: the mode is dormant since the layout rework (roadmap 45) replaced the accordions with section tabs; see [backlog 31](todo/backlog.md#31-tooling-profilemjs-against-the-layout-rework).** Measured with `npm run perf -- --smoothness --width <px> --throttle <n>` (see [docs/tasks/ACCORDION_LAZY_MOUNT.md](tasks/ACCORDION_LAZY_MOUNT.md) Task 8): it opens every accordion on Fleet Params and on a robot's detail page while sampling the wrapper on every animation frame, then closes and reopens the first one. Numbers are from real headless Chrome; "tween frames" is how many frames actually rendered a mid-tween height (a 250 ms open at 60 fps would be ~15).

### What it found, and what changed

| Build | EQ & Filters tween frames | Source tween frames | Height snap at `auto` |
|---|---|---|---|
| Pre-change (everything mounted up front), 1280 px, 1× | 12 | 12 | 2–2.5 px |
| Plain lazy mount (commit `6fb88b7`), 1280 px, 1× | **3** | **3** | 2–2.5 px |
| + wait for the section to settle (`d093a41`), 1280 px, 1× | 14 | 13 | 2–2.5 px |
| + tween to the laid-out height (`414cd4b`), 1280 px, 1× | 10–13 (4 runs) | 11–14 (3 of 4 runs; one run gave 3 — a one-off, not seen again in 3 further runs) | **0–0.5 px** |

1. **The plain lazy mount regressed the two heaviest sections' open animation** (12 → 3 frames): the mount work runs while the tween's clock is already ticking, and GSAP stamps a new timeline with its last tick's time, so most of the 250 ms was gone before the first frame. Deferring the start by one tick was not enough (Source got worse: 1 frame, a 15 px snap) — the controls do a second wave of work after their first paint (ResizeObservers, box-count re-fit). The first open now polls on GSAP's own ticks until two consecutive ticks read the same height, then builds the tween from "now".
2. **A 2–2.5 px height snap at the end of every open predates this work** — it appears on the untouched reopen path and in the pre-change build. The tween targeted `scrollHeight`, which counts the last box's popped-out overhang (a transform), while `height: auto` drops it, so everything below the section jumped up ~2.5 px when the tween completed. The tween now targets the inner wrapper's laid-out height. It is now 0–0.5 px.

### Final results, all configurations (production build `414cd4b`, headless Chrome, one run each)

| Viewport | Throttle | Empty-open frames | Largest height snap | EQ & Filters: tween frames / longest frame gap | Source: tween frames / longest frame gap |
|---|---|---|---|---|---|
| 390 px | 1× | 0 | 0.5 px | 14 / 167 ms | 15 / 150 ms |
| 820 px | 1× | 0 | **14.5 px** (see below) | 9 / 250 ms | 14 / 150 ms |
| 1280 px | 1× | 0 | 0.5 px | 10 / 300 ms | 11 / 184 ms |
| 390 px | 4× | 0 | 0.5 px | 1 / 1,384 ms | 1 / 1,100 ms |
| 820 px | 4× | 0 | 0.5 px | 0 / 1,650 ms | 1 / 1,200 ms |
| 1280 px | 4× | 0 | 0.5 px | 1 / 1,367 ms | 0 / 1,350 ms |

- **No open-but-empty frame anywhere** (0 across every toggle, at every width and throttle) — the layout-effect deferral works.
- **At 4× the open effectively snaps — for every section, including untouched reopens** (1–2 tween frames), because each frame takes 100–300 ms (and the mount frame 0.7–1.7 s), so a 250 ms tween has almost no frames to render into. That is the throttled device's frame rate, not the animation; the actionable number is the mount hitch itself (the "longest frame gap" column, and the first-open table above), which is what 17.2.3 addresses.
- **Verified the metric can detect a snap:** with the old `scrollHeight` measurement temporarily restored, it reports 2–2.5 px on every open; with the fix, 0–0.5 px. (An earlier version of the metric compared sampled frames and reported spurious "jumps" of up to 2,032 px at 4× whenever the tween finished between two slow frames; it now reads GSAP's actual style writes, so it means the same thing at any frame rate.)

### Known residual — a late ~15 px growth on EQ & Filters at tablet width

At 820 px wide, opening EQ & Filters (the tallest section, ~3,050 px) sometimes grows by ~14.5 px about seven frames (~120 ms) *after* the open completes: 1 of 1 in the matrix run above, then 2 of 3, 0 of 3, and 1 of 4 in three later batches — **4 of 11 runs (~36%)** overall. The tween itself completes at the correct height; the growth is a separate late re-layout of the just-mounted content that lands after the settle check has already seen two equal readings. **The pre-change build showed it in 0 of 5 runs**, so it is a consequence of lazy mounting, not live-content reflow. Cause not yet identified (candidates: a responsive layout hook or `ResizeObserver`-driven re-render in the EQ & Filters controls at that width). Not chased by making every open wait longer — that would cost more smoothness than it buys. Recorded here so 17.2.3 (per-box mount cost) can look for it.

### Final-build re-check of the Task 7 gates

Because the component changed twice after the first post-change measurement, the gates were re-measured on `414cd4b`: 3 sequential runs each at 1× and 4×. All still pass in absolute terms:

| Gate | Threshold | Final build | |
|---|---|---|---|
| 1 — closed-accordion boxes / totals | 0 · Fleet ≤ 25, Probes ≤ 150, detail ≤ 55, Nav & Comms 26 | 0 · **20**, **137** (124–137), **45** (44–45), **26** | **PASS** |
| 2 — open Fleet Params / robot detail, 1× | no task ≥ 100 ms | **0** / **0** tasks ≥ 100 ms | **PASS** |
| 2 — switch to Probes, 1× | ≤ 205 ms | **178 ms** (167–181) | **PASS** |
| 3 — open Fleet Params, 4× | total ≤ 1,064 ms | **298 ms** (172–314) | **PASS** |
| 3 — open robot detail, 4× | total ≤ 1,142 ms | **453 ms** (386–538) | **PASS** |

**Machine drift, and why the first-open numbers moved.** This session's numbers ran ~15–35% higher than the first post-change session across the board, including `power on` (584 → 666 ms at 1×, 2,151 → 2,878 ms at 4×), which has nothing to do with accordions — so cross-session comparisons of absolute numbers are unreliable here. To separate machine from code, the previous component version (`6fb88b7`) and the final code were run back to back in the same session at 1×: EQ & Filters first open 199 vs 201 ms, Source 166 vs 146 ms, Probes 164 vs 191 ms, `power on` 685 vs 686 ms — the same within run-to-run noise, so the settle and measure changes cost nothing measurable. Final-build first-open numbers, 1× (this session): EQ & Filters 197 ms, Source 151 ms, Output 90 ms, Time & Space 72 ms, all detail sections other than Source 0; 4×: EQ & Filters 1,284 ms, Source 1,158 ms, Output 573 ms, Time & Space 385 ms.

## Diagnosing audio on a real phone — `?debug`, `?latency=`, pinned worlds

Built for the phone-only scratchy / cutting-out audio ([docs/todo/scratchy-audio-phones.md](todo/scratchy-audio-phones.md)), where the headless harness above can't see the audio thread. All three are URL params, read once at load, opt-in, and change nothing when absent.

| Param | Effect |
|---|---|
| `?debug` | Shows a small read-only overlay (bottom-left, no controls, hidden from assistive tech, `pointer-events: none`) — see below. |
| `?latency=interactive|balanced|playback` | Installs the Tone context with that Web Audio `latencyHint` instead of Tone's default `interactive`. Invalid values are ignored. `src/engine/audioContextSetup.ts` — it must stay `main.tsx`'s first app import. Roadmap 17.2.4 territory: Chrome Android's low-latency path is known to glitch on complex graphs and `playback` is the usual mitigation, **unverified for this app**. Does not change Tone's `lookAhead` (still 100 ms). |
| `?load=light\|standard\|full` or `?load=0..100` | The **Robot Load** slider at page load ([specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md)): caps audible robots, polyphony, and — for Light/Standard — selects the `playback` latency hint. Invalid or absent: Light on a phone-like device (coarse pointer), Full elsewhere. Changing either slider in the app mirrors the choice back into this param (`history.replaceState`). An explicit `?latency=` still wins over the preset's hint. |
| `?fxLoad=light\|standard\|full` or `?fxLoad=0..100` | The **Effects Load** slider at page load: caps drift and filter LFOs. Absent or invalid falls back to `?load=` (so an existing `?load=` link keeps pinning both sliders together), then device detection. |
| `?seed=<word>&x=<int>&y=<int>` | Pins the whole generated world ([PROCEDURAL_GENERATION.md](PROCEDURAL_GENERATION.md)); a world tweaked away from its seed adds `s=1.<blob>` ([specs/SHORT_WORLD_LINK.md](specs/SHORT_WORLD_LINK.md)). Print any of these into a bug report and the HUD echoes what was loaded. |

Combine them, e.g. `?debug&latency=playback&seed=bravo&x=-150&y=90`. Known worlds (desktop render capacity, [scratchy-audio-phones.md](todo/scratchy-audio-phones.md)): `charlie:200:-30` ≈ 0.33 (calm, 0 global LFOs), `alpha:12:68` ≈ 0.37, `delta:5:-180` ≈ 0.50, `bravo:-150:90` ≈ 0.55 (heavy, 5 LFOs).

### Reading the overlay

```
bravo @ -150,90   up 1:32
ctx running   clock x1.00   transport started   events 37
latency interactive   ahead 100ms   base 11ms
voices 3/16   audible 5/12   LFOs 5/7
load 100%·fx 100% · sounding 5/12 · standing by 0 · poly 3/16 · fx in 2/10
fps 58   lag 4ms (max 220ms)
out -12.3dB rms -20.1dB  pre -6.0dB  fin ok
underruns 0 (0ms) · lat 44ms (0-47)
1:31 audio clock stalled (x0.00)
1:52 audio clock recovered after 20.0s
```

The border turns red when any failure signature is live: the context is not running, the audio clock stalls, the UI frames stop, playback underruns are occurring, the master is silent while notes sound, or an output tap holds non-finite samples. Each line answers one question from the investigation:

| Reading | Meaning |
|---|---|
| `ctx` (`running` / `suspended` / `interrupted`) | AudioContext state. The app never resumes a suspended context (no `statechange` handler); changes are logged from the context's own `statechange` event, so transient states aren't missed. |
| `clock xN` | Audio-clock seconds advanced per wall second over the last 500 ms. ~1.00 is healthy; **below 0.5 while `ctx` says `running`** is logged as "audio clock stalled" — the audio thread isn't advancing. |
| `events n` | Events pending on Tone's Transport: one-shots (`schedule` / `scheduleOnce`) plus repeats (`scheduleRepeat`), read off Tone's two private timelines, so a dash if a Tone update hides them. Added 2026-10-23 for backlog 27's long run: a count that climbs through a run on a steady world is scheduling that is never cleared. `perf:audio` reads it as its `events` column. |
| `fps` | GSAP ticker ticks/second. **0** logs "UI frames stopped" — the page's animation loop froze. |
| `lag` (`max`) | How late the 500 ms sampler tick ran — a main-thread stall meter. ≥ 500 ms is logged as "main thread stalled". |
| `voices n/16` | `activeVoices` against `MAX_POLYPHONY`. Pinned at 16 with sound gone = the stuck-voice-counter hypothesis. |
| `audible n/12` | Robots in the active locale that `isRobotAudible` lets sound right now (not muted, not excluded by a solo), out of the roster — `0/0` before any robot has spawned. Sampled at the 500 ms tick, so it costs no store subscription. Added for the Audio Load Budget work ([specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md)): the load waves are hypothesised to follow how many robots sound at once, and this is the series to check that against. |
| `load r%·fx e% · sounding a/b · standing by c · poly u/v` | The Audio Load budget, shipped as two independent sliders 2026-09-22: `r` is Robot Load, `e` is Effects Load (only `r` drives `b`/`v` below); `sounding`/`b` are robots the budget lets sound out of the Robot Load cap, `standing by`/`c` are eligible robots waiting, and `poly`/`v` are notes in use out of the *live* polyphony ceiling (`v` is 16 at Full, 8 at Robot Load Light). `sounding` never exceeds `b`; at Full it reads `sounding n/12` and `poly n/16`. Sampled at the 500 ms tick; a dash means unknown. `perf:audio` reads this line too (mean and max `sounding` per bucket). Since roadmap 50.6 the line ends ` · fx in n/10`: how many of the ten global effects are in the signal path, connected into their bypass cells or, since Robot Effect Sends (roadmap 50.7), their room branches (a dark effect or a dark room's branch is out; a darkening one counts until its disconnect fires). A dash before the chain is built. See `docs/AUDIO_SYSTEM.md`, "The bypass cells" and "The three effect rooms". |
| `LFOs n/7` | Global LFOs with rate > 0 — the measured load driver. |
| `latency … ahead … base` | The hint actually installed, Tone's `lookAhead`, and `baseLatency`. (`outputLatency` is not shown: Tone's standardized-audio-context wrapper doesn't expose it.) |
| `out … rms …  pre …  fin …` | **Output level taps** ([specs/AUDIO_OUTPUT_DIAGNOSTIC.md](specs/AUDIO_OUTPUT_DIAGNOSTIC.md)): `out` is the peak (dBFS) and `rms` the RMS of what the destination receives (`masterGain`'s output, so after the limiter and after volume/mute); `pre` is the peak of what the voices hand the FX chain (EQ3's output). Each reading is the last 32768 samples (≈ 0.68 s at 48 kHz) from a native `AnalyserNode`. `-inf` is silence, `-` means no reading. `fin ok` means every sample was finite; **`fin NaN!`** means a tap saw NaN/±Infinity. |
| `underruns n (Dms) · lat Ams (min-max)` | **The browser's own playback statistics** (`AudioContext.playbackStats`, Chrome 146+): playback underruns since the context was created, their total duration, and the average output latency with its min–max. `underruns n/a` when the browser has no such API. A calm desktop run reads `underruns 0 (0ms) · lat 44ms (0-47)`. |

**Telling the causes apart** (what to note when the sound drops):

- `clock` stalls, `ctx` still `running`, `fps`/`lag` fine → audio-thread starvation.
- `ctx` goes `suspended`/`interrupted` → the OS/browser took the context; the app should resume it.
- `lag` spikes and `fps` → 0, `clock` keeps ~1.00 → a main-thread stall (audio is scheduled from the main thread, so it can starve even though the audio thread is fine).
- `voices` pinned at 16 with everything else healthy → the voice counter, not the audio path.
- Everything above reads healthy but it is silent → look at the output taps and the stats (below).

### Reading the output taps and the playback stats

Added because three `bravo` dropouts on the Pixel left **every** reading above normal (`ctx running`, `clock` ≈ x1.00, notes being scheduled, no event) — so what fails is something those readings do not measure ([todo/scratchy-audio-phones.md](todo/scratchy-audio-phones.md)). The question is whether the sound is **silent inside the graph** or **lost after it**:

| `out` | `pre` | `underruns` | Reading |
|---|---|---|---|
| silent, notes sounding | normal | — | The fault is **inside** LPF → HPF → Compressor → Limiter → master, or in the Reverb and Delay rooms and their returns (which rejoin at the Compressor or Limiter input, `docs/AUDIO_SYSTEM.md`). |
| silent | silent | — | **Upstream**: the voices or EQ3 produce nothing although notes are scheduled. |
| normal | normal | count rising | The graph is fine and the **output underran**: load or scheduling, not a silent node. Clicks are underruns. |
| normal | normal | flat | The graph is fine and the browser reports no underrun: the loss is **downstream** (OS/device) and invisible to the app. |
| — | — | `n/a` | Chrome before 146 has no `playbackStats`; the level taps still answer graph-vs-not. |
| `fin NaN!` | either | — | A NaN/Inf is latched; the tap that shows it first locates it. |

Events (edge-triggered, so a long dropout logs two lines, not one per sample):

- `master output silent for 3s while notes sound (pre-chain normal|silent|unknown)` — the master peak was below −80 dBFS (`SILENT_PEAK_THRESHOLD`, strict) for `SILENT_EVENT_AFTER_MS` (3 s) of **counted** time, and the border turns red. Only time with notes in flight counts: a gap between notes **pauses** the count (it neither adds nor restarts it — found in the real browser, where requiring notes at every sample let ordinary gaps hide a real silence). A mute, a stopped transport, a suspended context or an audible master restarts it, so none of those raise it. Recovery: `master output audible again after Xs`, or `silence no longer unexpected after Xs` when it stopped being a fault (e.g. the user muted).
- `non-finite samples in master output` / `… in pre-chain output`, and `… finite again`, per tap.
- `playback underruns began (n total)` and `playback underruns stopped after Xs (+N)` — one pair per burst; a burst ends when the count has been flat for `UNDERRUN_QUIET_MS` (1 s), so a click storm cannot flush the 8-line log. The border is red while underruns are occurring.

**Limits.** It cannot see the Android output stream itself, so "downstream" is by exclusion. A sounding robot whose own volume is 0 is genuine silence with notes in flight and will read as a silent-while-sounding event. The silent event trails a real silence by the FX tail-out (about 2 s: the reverb and delay ring out) plus the 3 s counted, plus any note gaps — 5–8 s in the forced-silence checks. The two analysers sit on the graph of the device under suspicion (debug-only, read-only, a 128 KB buffer reused each tick).

**Two things the real browser taught** (2026-09-21, headless Chrome 153): the taps are native `AnalyserNode`s, not `Tone.Analyser` — Tone's wrapper sets `fftSize = 2 × size`, caps `size` at 16384 and reads only the older half of the window; and Tone's `rawContext` is a `standardized-audio-context` wrapper that does not forward `playbackStats`, so the overlay reads it from the wrapper's private `_nativeAudioContext` / `_nativeContext` fields. That is fragile: a `standardized-audio-context` upgrade could quietly turn the line back into `n/a`, which is why it says `n/a` rather than showing zeros.

Verified (2026-09-21, production build, headless Chrome 153, `charlie:200:-30`): `out` ≈ −12 … −17 dB, `rms` ≈ −23 dB and `pre` ≈ −4 … −13 dB while robots sound, live within ~2 s of power-on; **muting the master drops `out` to `-inf` while `pre` stays live and raises no event**; both taps survive flipping Natural ↔ Controlled Decay (which disconnects every FX node); a calm 90 s run shows `underruns 0 (0ms) · lat 44ms (0-47)`. On the dev server, cutting the chain after EQ3 raised the silent event in 3 of 3 runs (5–8 s after the cut, `pre-chain normal`), turned the border red, and cleared on restore.

Verified in headless Chrome (2026-09-19): a deliberate 2 s main-thread freeze logs `main thread stalled ~1639 ms` while `clock` stays ~x1.01, so the two cases are distinguishable; a no-param load creates one realtime AudioContext and `?latency=playback` replaces Tone's default one (which `setContext(…, true)` closes) — Tone's own import creates a default `interactive` context before this module runs, hence the dispose.

### Getting it onto a phone

`npm run build && npx vite preview --host --port 4173`, then open `http://<pc-lan-ip>:4173/trace-atlas/?debug&…` on the phone (same Wi-Fi; a Windows firewall prompt may need allowing). A production build is the right target — the dev server is unminified and slower. Or deploy the branch. **A phone loading `http://<lan-ip>` is an insecure context** (only https and localhost are secure), where `crypto.randomUUID` does not exist. Before 2026-09-20 that made `AudioEngine.start()` throw in `beatClock.scheduleRepeat`, so the power rocker snapped back and the tablet never powered on; all id generation now goes through `generateUUID()` (`src/utils/randomId.ts`, falls back to `crypto.getRandomValues`). Any *new* secure-context-only API (`crypto.subtle`, `navigator.clipboard`, `navigator.wakeLock`, service workers, …) will break the same way on a LAN phone — you can reproduce that on the PC by loading the preview from its LAN IP instead of `localhost`. The overlay's cost is one 500 ms timer and one GSAP ticker callback, only while `?debug` is on — plus the two output-tap analysers, which are created only then (with `?debug` absent `buildGlobalFxChain` and `wireGlobalFxChain` construct none).

## Audio render-capacity series — `npm run perf:audio`

Where `npm run perf` above measures the main thread, this measures the **audio thread**: it drives headless Chrome over the DevTools Protocol (Node's built-in `WebSocket`, no dependency), loads a served production build of a pinned world, powers it on, waits out a warm-up, then polls the DevTools "Web Audio" panel's `WebAudio.getRealtimeData` every 500 ms. *Render capacity* is the fraction of each audio callback's deadline that rendering takes (0–1; near 1.0 the thread misses deadlines, heard as clicks and dropouts). Built for roadmap 17.2.6 ([specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md)); it replaces the scratch-script recipe in [todo/scratchy-audio-phones.md](todo/scratchy-audio-phones.md).

```
npm run build && npx vite preview --port 4173                                 # terminal 1 — a production build
npm run perf:audio -- --world charlie:200:-30 --seconds 240 --bucket 15       # terminal 2
```

One row per time bucket — mean and max capacity, mean callback interval, and the overlay's audible-robot count — then the **peak window** (the highest bucket mean; the number the Audio Load gates compare), the overall mean and max, and `r(audible, capacity)`, the Pearson correlation between the per-bucket audible count and capacity (`-` when either is constant).

**The long-run columns (backlog 27, 2026-10-23).** Three more per-bucket means, for a run long enough to catch load that grows: `nodes`, the live `AudioNode`s of the polled context, tallied from the DevTools `WebAudio.audioNodeCreated` / `audioNodeWillBeDestroyed` events (counted from `WebAudio.enable`, before the page loads); `heap (MB)`, the renderer's used JS heap (`Performance.getMetrics`, `JSHeapUsedSize`); and `events`, the overlay's pending-Transport-event count (above); plus `max lag`, the largest main-thread lag the overlay's 500 ms sampler reported in the bucket (a stall is a maximum, not a mean). The summary's last line gives each as *first bucket → last bucket (delta)*, and a further line breaks the node change down by type (`Oscillator +198   Gain +31`), from the created event's `nodeType`; on a steady world every delta should sit near zero once the roster has spawned, and a steady climb names the leak. Read `nodes` as *not yet destroyed*: Chrome destroys a node's handler when its wrapper is garbage-collected (an ended source included), so a climbing count is either collection lag or a retained reference, and only a forced GC (`HeapProfiler.collectGarbage` over CDP, then a recount) tells which. The first use, 2026-10-23, found the latter: see [todo/scratchy-audio-phones.md](todo/scratchy-audio-phones.md), "Backlog 27, desktop step 1". Before the table the script prints the overlay's lines once, as they read after the warm-up (`carried after warm-up:`), so the record says what the world carried — the tier, the sounding cap, `fx in`, the bank and the tiers. The long run is the ordinary command with a longer series and wider buckets, e.g. `--seconds 900 --bucket 60`; the 10-minute tool limit on an agent's shell does not apply to a terminal.

`--help` documents every flag:

| Flag | Meaning |
|---|---|
| `--world name:x:y` / `--worlds a,b,c` | World(s): `name`, `x` and `y` go out as `?seed=&x=&y=`, which pins the seeded world (the world link, roadmap 56). `--worlds` runs them one after another, each in a fresh Chrome. |
| `bravo:-150:90?s=1.…` | Anything after `?` rides along into the page URL: a tweaked world's `s=` blob, copied from its world link ("The seven links" below has D1–D5), and variants of one world (a `?load=` preset, `?latency=`) to A/B within one session. **The pin check (2026-10-23; since roadmap 56 it reads the spec):** after the warm-up the script reads where the overlay says the page landed and aborts if that differs from the spec's `x:y`, so a random world can no longer be measured under a pinned label (which happened once; see the 17.2.6 baseline's retraction). |
| `--rot n` | Rotates the start order of `--worlds` left by `n`, for interleaved rounds. |
| `--seconds` / `--bucket` / `--warmup` | Series length (240), bucket width (15), warm-up after power-on (8) — all seconds. |
| `--url` | Base URL of the served build (default `http://localhost:4173/trace-atlas/`). A LAN address works too — the insecure-context case a phone hits. Any query on it is replaced. |
| `--no-debug` | Leave `?debug` off: no overlay, so no audible column. (The overlay's own cost is one 500 ms timer and one GSAP ticker callback.) |
| `--json path` | Also write each run's buckets and summary to a file, e.g. to pool the correlation across runs. |

Only the bucketing, statistics and URL/world handling are unit-tested (`scripts/perf/audio-load-lib.mjs`); the Chrome plumbing is verified by real runs. The audio context polled is the most recently created, not-yet-destroyed *realtime* one, so `?latency=` (which replaces Tone's default context with a second one) polls the right context.

### Measurement hygiene

These rules exist because uncontaminated data was the whole point.

- **Foreground, one call at a time.** Never overlap two runs, and don't run tests, builds or anything else CPU-heavy while one is going — the audio thread shares the machine.
- **Check for orphaned Chrome before and after** — the count must be 0:
  `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match 'trace-atlas-perf' } | Measure-Object`. Every perf script closes Chrome the same way (`scripts/perf/cdp-lib.mjs`, `withChrome`): `Browser.close`, then `taskkill /T` as a fallback, on Ctrl+C too, and removes its temp profile.
- **A/B within one session, interleaved, ≥ 3 rounds.** Same-world stock capacity drifts run to run (0.30–0.41 across rounds in the 2026-09-19 data), so compare *differences from same-round stock*, rotate the start order with `--rot`, and never compare absolute numbers across sessions. A single run is not evidence.
- **Name the code measured by commit**, and build variants from a clean tree (patch → `vite build --outDir <scratch>` → `git checkout --` the patched files); never commit a throwaway measurement variant.
- **Test a metric by reintroducing the problem it should catch** before trusting it on a fix.
- The audio thread is not throttled by Chrome's CPU throttling, so `perf:audio` takes no throttle flag.

Verified 2026-09-20 (production build of `35ff6a8`): a 60 s `charlie` run reads ≈ 0.34 mean (the known ≈ 0.33), callback interval 10.67 ms, audible robots climbing 3.5 → 8 over the first minute (matching the battery-cycle simulation in the spec); `bravo` ≈ 0.53 (known ≈ 0.55); both work from `http://<lan-ip>:4173/`; runs leave no Chrome process behind.

## Pre-change baseline for roadmap 17.2.6 — Audio Load Budget (2026-09-20)

The reference every Audio Load result is compared against ([specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md) §5.3 criteria 1 and 4; plan task 3). **Nothing in the product was changed to take it.** It also tests the spec's central inference — that render load tracks how many robots are sounding — which until now rested on a simulation and one time series.

**Code measured:** `4bab2ea` (clean tree). Its product code is identical to `35ff6a8`; against `main` the only product difference is the overlay's `audible n/12` reading. Production build served by `vite preview`, headless Chrome 153.0.8010.52, desktop, no throttle, `npm run perf:audio` (above).

**Method:** worlds `charlie:200:-30` and `bravo:-150:90`; **3 runs each**, a **240 s series** after an 8 s warm-up, **15 s buckets**; a fresh Chrome per run, foreground, one call at a time, nothing else running; start order rotated between rounds (charlie→bravo, bravo→charlie, charlie→bravo); orphaned-Chrome count 0 before and after every run. Plus one **spot re-run** of `charlie` afterwards (see "Noise band"). The audio callback interval read 10.67 ms in every bucket of every run (one bucket 10.69) — no deadline-miss doubling at stock, though single samples touched 0.99 (below).

### Headline numbers

| | charlie (0 global LFOs) | bravo (5 global LFOs) |
|---|---|---|
| **Peak window** (highest 15 s bucket mean) — the number Light must beat by ≥ 25 % | **0.414** median; runs 0.414 / 0.381 / 0.416 (spot re-run 0.404) | **0.558** median; runs 0.558 / 0.550 / 0.585 |
| Overall mean | **0.327** median; runs 0.330 / 0.324 / 0.327 (spot re-run 0.342) | **0.488** median; runs 0.486 / 0.488 / 0.506 |
| Highest single sample | 0.99 / 0.71 / 0.66 (spot 0.83) | 0.99 / 0.99 / 0.99 |
| Peak window of the 3-run average | 0.400 (at 45 s) | 0.558 (at 135 s) |
| r(audible, capacity), per run | 0.89 / 0.89 / 0.91 (spot 0.94) | 0.76 / 0.74 / 0.77 |

### The waves — per-bucket means over the 3 runs (audible robots are identical run to run)

| t (s) | audible | charlie cap (run range) | bravo cap (run range) |
|---:|---:|---|---|
| 0 | 3.5 / 4.5 | 0.302 (0.289–0.312) | 0.516 (0.485–0.550) |
| 15 | 5.0 / 7.1 | 0.319 (0.305–0.327) | 0.530 (0.519–0.541) |
| 30 | 6.2 / 7.6 | 0.366 (0.361–0.370) | 0.533 (0.510–0.562) |
| 45 | 7.8 / 7.8 | 0.400 (0.371–0.416) | 0.534 (0.504–0.558) |
| 60 | 7.1 / 5.4 | 0.371 (0.364–0.375) | 0.511 (0.474–0.559) |
| 75 | 3.9 / 1.8 | 0.291 (0.278–0.305) | 0.441 (0.417–0.462) |
| 90 | 4.7 / 3.5 | 0.303 (0.295–0.317) | 0.422 (0.414–0.431) |
| 105 | 6.4 / 3.9 | 0.355 (0.334–0.397) | 0.437 (0.426–0.458) |
| 120 | 6.5 / 5.7 | 0.342 (0.329–0.364) | 0.490 (0.473–0.519) |
| 135 | 7.1 / 7.7 | 0.366 (0.358–0.381) | 0.558 (0.541–0.585) |
| 150 | 5.5 / 6.1 | 0.330 (0.324–0.335) | 0.518 (0.503–0.538) |
| 165 | 4.0 / 5.4 | 0.320 (0.313–0.329) | 0.528 (0.512–0.541) |
| 180 | 2.1 / 4.4 | 0.264 (0.251–0.274) | 0.498 (0.477–0.512) |
| 195 | 3.1 / 5.0 | 0.262 (0.257–0.265) | 0.458 (0.428–0.475) |
| 210 | 5.2 / 5.6 | 0.306 (0.297–0.321) | 0.474 (0.434–0.509) |
| 225 | 6.3 / 3.8 | 0.333 (0.330–0.336) | 0.453 (0.432–0.475) |

(Audible robots are shown charlie / bravo. A pinned world replays the same robot lifecycle, so this series repeats across runs to within ±0.1 — only capacity varies.)

### Does load track audible robots? — the reading

| Correlation (Pearson r over 15 s buckets) | charlie | bravo | both worlds |
|---|---|---|---|
| per run | 0.89 / 0.89 / 0.91 | 0.76 / 0.74 / 0.77 | |
| pooled over the 3 runs (48 buckets) | **0.89** | **0.74** | |
| on the 3-run-averaged capacity (16 buckets) | 0.94 | 0.83 | |
| both worlds pooled, raw (96 buckets) | | | **0.38** |
| both worlds pooled, world means removed | | | **0.81** |

**Reading: yes, strongly, within a world.** Capacity follows the audible count through every wave — bravo dips from 0.53 to 0.44 exactly where audible robots drop from 7.8 to 1.8, and charlie's two lowest buckets (0.262 and 0.264, at 195 s and 180 s) are the two lowest audible counts (3.1 and 2.1) — and the fitted slope is the same in both worlds, **≈ 2 capacity points per audible robot** (charlie ≈ 0.209 + 0.0223 × audible, bravo ≈ 0.385 + 0.0204 × audible). bravo sits ≈ 0.17 above charlie at the same audible count; that offset is the 5 global LFOs, and it is why the **raw pooled r is only 0.38** — it compares a bravo bucket with a charlie bucket, so the world difference swamps the robot effect. That figure is below the plan's "~0.5" line but it is not the relevant test: the caps act *within* a world, and once the world offset is removed the pooled r is 0.81.

**Caveats, so the number is not over-read.** The runs are not independent samples of the relationship: the audible series is the same each run, so pooling three runs repeats the same x values with different noise on y, and adjacent buckets in a time series are autocorrelated, so treat r as descriptive, not as a significance test. "Audible" is eligibility (`isRobotAudible`), not notes actually sounding; it is a proxy. A correlation is not a controlled test — that is what plan task 11 (caps alone, `charlie`) does.

**What this predicts for the gates (a model, not a measurement).** With the fitted slope, capping `charlie` at Light's 4 robots would pull its peak bucket from ≈ 0.40 to ≈ 0.30 — a **≈ 25 % reduction, right on the ≥ 25 % gate**. Capping at Standard's 8 robots would do **almost nothing** on `charlie`, whose audible robots average at most 7.8 per bucket — so the ≥ 10 % Standard gate on `charlie` looks out of reach for the robot cap alone (only the polyphony cap of 12, drift and filter LFOs — none of which `charlie` has — could contribute). `bravo` should gain more than `charlie` at Light (drift and the filter LFOs come off as well). Plan task 11 tests this on `charlie`; a Standard shortfall there would be expected and is a decision for Crawford, not a tuning target.

### Noise band

Across all four `charlie` runs the peak window spans 0.381–0.416 and the overall mean 0.324–0.342 (the spot re-run sat 0.012 above the three-round range), so **≈ ±0.02 on a run's overall mean and ±0.02 on its peak window** — the band that "Full within ±0.03 of baseline" (§5.3 criterion 1) has to be read against. Single-sample spikes to ≈ 0.99 occur in most runs (every `bravo` run, one `charlie` run) without the callback interval leaving 10.67 ms; the peak window, being a 15 s mean, is unaffected by them.

### Decision line for Crawford (plan task 3)

The plan says to stop if the correlation is weak (|r| < ~0.5). **The per-world and within-world correlations are 0.74–0.94 — the spec's premise holds — but the raw both-worlds-pooled figure the plan literally asks for is 0.38**, for the confounded reason above. This is recorded as a judgment call for review at Checkpoint A, not silently reinterpreted; the work continues to plan task 4 (measurement only) and stops at Checkpoint A before any product change.

## Robot-LFO cost by target type — where the robot-LFO caps come from (2026-09-20)

Spec decision K: the per-tier robot-LFO caps come from measurement, not the spec's 4 / 12 placeholders ([specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md) §1.4; plan task 4). Before this, only "51 connected at once saturate the audio thread" was known.

**Method.** Throwaway build (recipe below; never committed). World `charlie:200:-30` (0 global LFOs, so any change is the robot LFOs). Every arm is the *same build* with a different query string; a few seconds after the roster and voices exist, N robot LFOs of **one target type** are connected and started (rate 1 Hz, depth 50 %, sine). 10 arms × **3 interleaved rounds** (start order rotated by 3 each round), each a **60 s series after a 12 s warm-up**, fresh Chrome each, foreground one call at a time, orphaned-Chrome count 0 before and after every call. Every figure is a **difference from the same round's stock arm** (stock overall mean 0.338 / 0.339 / 0.334 over the three rounds), never an absolute level. Code measured: `b9aac16` + the throwaway patches (tree clean before, restored after; scratch build deleted).

Two switches were needed, and the second changed the design of the measurement:
- **`?rlfo=<type>&n=<N>`** — the injector. `connectLfoTarget` is what counts, so N is the number that *actually connected* (checked from the page title): on `charlie`, `volume` has 12 targets, `gain` and `detune` 28 each (layers with gain 0 have no node), and **`pulseWidth` only 1** — only pulse-type layers have a width to modulate, and across six pinned worlds there were 0, 0, 0, 0, 1 and 2 of them.
- **`?nodrift`** — makes `lfoDrift.attachDrift` a no-op. A first pass with drift on showed the cost was **not** linear in N (4 LFOs ≈ +0.12, 12 ≈ +0.22): the first robot LFO instantiates the robot drift group's shared pool of 8 always-running LFOs, and each robot LFO gets two drift Gains, one an audio-rate connection into the LFO's own frequency. **Light and Standard both switch drift off** (spec §1.4), and those are the tiers the caps apply to, so the cap-relevant cost is the drift-off cost. The drift-on figures are kept as an add-on measurement.

### Results — drift off (Δ overall capacity vs same-round stock)

| Arm | round 1 / 2 / 3 | mean Δ | per LFO | max callback interval |
|---|---|---|---|---|
| `volume` N = 4 | +0.068 / +0.014 / +0.091 | **+0.057** | +0.014 | 10.67 ms |
| `volume` N = 12 | +0.132 / +0.113 / +0.142 | **+0.129** | +0.011 | 10.67 ms |
| `gain` N = 4 | +0.035 / +0.048 / +0.059 | **+0.048** | +0.012 | 10.67 ms |
| `gain` N = 12 | +0.134 / +0.136 / +0.142 | **+0.137** | +0.011 | 10.67 ms |
| `gain` N = 28 (all available) | +0.338 / +0.291 / +0.355 | **+0.328** | +0.012 | 10.69 ms |
| `detune` N = 4 | +0.050 / +0.038 / +0.056 | **+0.048** | +0.012 | 10.67 ms |
| `detune` N = 12 | +0.174 / +0.157 / +0.163 | **+0.165** | +0.014 | 10.67 ms |
| `pulseWidth` N = 1 (all available) | +0.091 / +0.073 / +0.076 | **+0.080** | **+0.080** | 10.67 ms |

- **An audio-rate robot LFO costs about +0.012 render capacity each** (0.011–0.015 across `volume`, `gain`, `detune`), **linear in N**: `gain` gives +0.0119 / +0.0114 / +0.0117 per LFO at N = 4 / 12 / 28, and the marginal cost from 12 to 28 is the same as from 0 to 12. The N = 4 arms are noisy (round-to-round spread up to ±0.04); N = 12 and 28 are tight (±0.01–0.03), so per-LFO numbers lean on those.
- **A `pulseWidth` LFO costs ≈ 0.08 — about 7× any other robot LFO** (all three rounds: 0.073–0.091). It is bounded by how many pulse layers a world has (0–2 in the worlds seen; a robot with all three layers `pulse` could in principle offer more), so it cannot dominate a realistic mix, but it is the one target where a count-based cap under-charges.
- **No deadline misses up to 28 LFOs**: the callback interval stayed 10.67 ms (10.69 at N = 28) — no doubling — and capacity peaked ≈ 0.72 (overall mean 0.66, against a 0.34 stock).
- Consistent with the earlier "51 saturates": 51 × 0.012 ≈ +0.60 on a 0.34 stock ≈ 0.94 even with drift off, and > 1 with it on.

### Drift add-on (why the drift tier also bounds robot LFOs)

`gain` N = 12 with drift **on**: **+0.222** (+0.201 / +0.225 / +0.239) versus **+0.137** with drift off — **drift adds ≈ +0.085**, about 60 % on top of the LFOs themselves (≈ +0.007 per LFO on top of ≈ +0.012). An exploratory first pass on an earlier build (drift on, round 1 only) read stock 0.357 → `volume` N = 4 0.477 (+0.120), N = 12 0.582 (+0.225), `gain` N = 4 0.474 (+0.117), N = 12 0.557 (+0.200): the same picture, and what exposed the non-linearity. **At Full, robot LFOs are uncapped and carry drift, so the hazard there is real** (spec: Full is today's behaviour, unchanged).

### The cap values — chosen from this

**`ROBOT_LFO_CAP_LIGHT = 4` and `ROBOT_LFO_CAP_STANDARD = 12`** — the spec's placeholders, *confirmed by the measurement rather than assumed*. The criterion (spec §5.3.5: the worst realistic mix at each cap keeps capacity < 0.9 with no interval doubling) with pessimistic inputs — cost per LFO 0.0146 (the highest observed marginal), **two of the slots being `pulseWidth`** (0.08 each), and each tier's baseline taken as the *heaviest* known world's peak with only the robot-count saving:

| Tier | Baseline (bravo peak, estimated) | + worst mix at the cap | Worst realistic capacity | Margin to 0.9 |
|---|---|---|---|---|
| Light, cap 4 | ≈ 0.48 (0.558 − 3.8 robots × 0.020) | 2 × 0.0146 + 2 × 0.08 | **≈ 0.67** | 0.23 |
| Standard, cap 12 | ≈ 0.56 (8 robots ≈ no saving on a 7.8-robot peak) | 10 × 0.0146 + 2 × 0.08 | **≈ 0.86** | 0.04 |

Both pass, but **Standard's margin is thin under these pessimistic inputs** (it ignores the ≈ 0.08 that dropping drift saves on `bravo` — the earlier all-seven-LFOs figure, +0.11 for drift, scaled to its five — so the realistic figure is nearer 0.78). Cap 8 would give ≈ 0.81 and is the obvious alternative if a wider margin is wanted; the choice between 12 and 8 is Crawford's call at Checkpoint A. These baselines are *estimates from the fitted slope* — the real check is plan task 24's stress run (every robot's seeded LFOs requested at the shipped caps), and each cap is a one-line constant. **Not decided here:** whether `pulseWidth` LFOs should count as several slots (≈ 6) because they cost ≈ 7× — that would change spec §1.4 from a plain count to a weighted one, and is raised for review, not adopted.

### Patch recipe (throwaway — reproduce, never commit)

From a clean tree: create `src/measureRobotLfos.ts`, add `import './measureRobotLfos'` to `src/main.tsx` after the `lfoDebug` import, add the one-line early return to `attachDrift` in `src/engine/lfoDrift.ts`, then `npx vite build --outDir <scratch>/dist-rlfo --emptyOutDir`, then `git checkout -- src/main.tsx src/engine/lfoDrift.ts && rm src/measureRobotLfos.ts` and confirm `git status` is clean. Serve it with `npx vite preview --outDir <scratch>/dist-rlfo --port 4173` and drive it with `--worlds "charlie:200:-30,charlie:200:-30?rlfo=gain&n=12&nodrift,…"`. The page title reports what connected (`rlfo:gain n=12 connected=12 drift=off`) — read it from `http://127.0.0.1:9334/json` during a short run to confirm before a measured batch.

```ts
// src/measureRobotLfos.ts — THROWAWAY (never committed). Inert without ?rlfo, so the stock arm is the same build.
import { lfoEngine } from './engine/lfoEngine';
import { AudioEngine } from './engine/AudioEngine';
import { useLocaleStore } from './stores/localeStore';
import { getActiveLocaleId } from './utils/localeHelpers';
import type { RobotLfoTargetId } from './types/lfo';

const params = new URLSearchParams(window.location.search);
const kind = params.get('rlfo');            // volume | gain | detune | pulseWidth
const wanted = Number(params.get('n') ?? 0);

if (kind && wanted > 0) {
  const started = performance.now();
  const timer = setInterval(() => {
    if (performance.now() - started > 60000) { clearInterval(timer); document.title = `rlfo:${kind} TIMEOUT`; return; }
    const robots = useLocaleStore.getState().locales[getActiveLocaleId()]?.robots ?? [];
    if (robots.length < 12) return;                                            // robots spawn AFTER power-on
    if (!robots.every((r) => AudioEngine.getRobotModulationTarget(r.id, 'volume'))) return;
    clearInterval(timer);
    const targets: Array<{ target: RobotLfoTargetId; id: string }> = [];
    if (kind === 'volume') for (const r of robots) targets.push({ target: 'volume', id: r.id });
    else for (let layer = 0; layer < 3; layer++) for (const r of robots) targets.push({ target: `layer${layer}.${kind}` as RobotLfoTargetId, id: r.id });
    let connected = 0;
    for (const { target, id } of targets) {
      if (connected >= wanted) break;
      lfoEngine.setLfoRate(target, 1, id); lfoEngine.setLfoDepth(target, 50, id); lfoEngine.setLfoShape(target, 'sine', id);
      if (lfoEngine.connectLfoTarget(target, id)) { lfoEngine.start(target, id); connected++; }
    }
    document.title = `rlfo:${kind} n=${wanted} connected=${connected} drift=${params.has('nodrift') ? 'off' : 'on'}`;
  }, 250);
}
// lfoDrift.ts, first line of attachDrift:  if (new URLSearchParams(window.location.search).has('nodrift')) return;
```

## Caps-only measurement for roadmap 17.2.6 — the plan-task-11 decision gate (2026-09-21)

**Result: both thresholds are missed. The work stops here for Crawford's call; nothing was tuned to pass** ([tasks/AUDIO_LOAD_BUDGET.md](tasks/AUDIO_LOAD_BUDGET.md) task 11, [specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md) §5.3 criterion 4).

**What was measured.** The audible-robot cap and the polyphony ceiling *alone* — the sounding-set gate, `audioBudgetSystem` and the dial exist; no UI, no LFO tiers yet. `charlie:200:-30` has no global LFOs, so its Light / Standard / Full difference here *is* the robot + polyphony effect. Code `90dfc09`, clean tree, production build. **`?load=light`, `?load=standard`, `?load=full`, 3 interleaved rounds each** (start order full/standard/light rotated across five foreground calls), **240 s series, 15 s buckets, 8 s warm-up**, `npm run perf:audio`, orphaned-Chrome count 0 before and after every call.

| | Light (0.2: 4 robots, 8 notes) | Standard (0.6: 8 robots, 12 notes) | Full (1: today) |
|---|---|---|---|
| **Peak window** (highest 15 s bucket mean), per run | 0.323 / 0.323 / 0.332 | 0.378 / 0.413 / 0.399 | 0.415 / 0.383 / 0.395 |
| **Peak window, median** | **0.323** | **0.399** | **0.395** |
| **Reduction vs Full** (median; mean of runs) | **18.2 %** (18.1 %) — range 13.4–22.2 % | **−1.2 %** (0.1 %) — range −7.9 to +8.8 % | — |
| **Gate** | ≥ 25 % — **missed** | ≥ 10 % — **missed** | |
| Overall mean, per run | 0.300 / 0.301 / 0.306 | 0.315 / 0.334 / 0.327 | 0.331 / 0.334 / 0.327 |
| Overall mean vs Full (median) | −0.029 | −0.003 | — |
| Cap held? (max sounding robots in any sample) | 4 of 4 ✓ | 8 of 8 ✓ | 8 (roster peak) |
| Max callback interval | 10.67 ms | 10.67 ms | 10.67 ms |

**Full versus the Task 3 baseline** (`charlie`, code `4bab2ea`, an earlier session): peak-window median 0.395 vs 0.414 (−0.019) and overall-mean median 0.331 vs 0.327 (+0.004) — **within ±0.03**, so Full is unchanged by the feature. (Criterion 1 asks for a same-session A/B against a build of the pre-feature commit; that is plan task 24's job — this cross-session comparison is a sanity check, not that gate.)

### The waves — per-bucket capacity (3-run mean) with mean robots sounding

| t (s) | audible | Light cap (sounding) | Standard cap (sounding) | Full cap (sounding) |
|---:|---:|---|---|---|
| 0 | 3.5 | 0.294 (3.4) | 0.301 (3.5) | 0.325 (3.5) |
| 15 | 5.0 | 0.310 (4.0) | 0.317 (5.0) | 0.314 (5.0) |
| 30 | 6.2 | 0.318 (4.0) | 0.358 (6.3) | 0.373 (6.2) |
| 45 | 7.8 | 0.316 (4.0) | 0.392 (7.8) | 0.381 (7.8) |
| 60 | 7.1 | 0.310 (4.0) | 0.356 (7.0) | 0.385 (7.0) |
| 75 | 3.9 | 0.299 (3.7) | 0.296 (3.9) | 0.296 (3.9) |
| 90 | 4.7 | 0.305 (3.9) | 0.307 (4.7) | 0.310 (4.7) |
| 105 | 6.4 | 0.310 (4.0) | 0.345 (6.5) | 0.352 (6.4) |
| 120 | 6.5 | 0.316 (4.0) | 0.356 (6.4) | 0.361 (6.5) |
| 135 | 7.1 | 0.313 (4.0) | 0.375 (7.1) | 0.383 (7.1) |
| 150 | 5.5 | 0.311 (4.0) | 0.346 (5.5) | 0.330 (5.5) |
| 165 | 4.0 | 0.304 (3.6) | 0.308 (4.0) | 0.315 (4.0) |
| 180 | 2.1 | 0.267 (2.1) | 0.257 (2.1) | 0.271 (2.1) |
| 195 | 3.1 | 0.271 (3.1) | 0.266 (3.1) | 0.269 (3.1) |
| 210 | 5.2 | 0.289 (4.0) | 0.301 (5.2) | 0.303 (5.2) |
| 225 | 6.3 | 0.298 (4.0) | 0.328 (6.3) | 0.320 (6.3) |

### Why the gates are missed — the mechanism works; the anchors are the issue

- **The lever is real and the cap does exactly what it should.** Light flattens the waves: capacity stays 0.29–0.32 while Full climbs to 0.38, and Light's cost at 4 sounding robots (≈ 0.29–0.32) is the same as Full's at about 4 audible robots (≈ 0.30–0.32; e.g. 0.296 and 0.315 in the 3.9- and 4.0-audible buckets). The link confirmed in Task 3 holds: r(audible, capacity) is 0.82–0.94 per run for Standard and Full, and 0.65–0.75 for Light, where the cap flattens the relationship as intended.
- **A 4-robot ceiling has a floor of ≈ 0.31, and the gate asks for ≤ 0.296** (25 % under Full's 0.395). Full itself only reads that low at ≈ 3.9 audible robots or fewer. The Task 3 fit predicted the 4-robot level at ≈ 0.30 (≈ 25 %, "right on the gate"); the measured Light peak window is 0.323, ≈ 0.02 higher — the peak window is the highest of 16 noisy bucket means, biased upward by a run's noise (±0.02). So the prediction was optimistic by about that much, and Light lands at ≈ 18 %, not ≈ 25 %.
- **Standard's 8-robot cap does nothing on this world** because `charlie`'s audible robots peak at 7.8 (mean) — Standard is within run-to-run noise (±0.03 per bucket) of Full in every bucket, as the Task 3 write-up forecast. Only Standard's polyphony ceiling (12) differs, and it has no measurable effect.
- Neither miss is noise: the three Light runs (0.323 / 0.323 / 0.332) are all below 0.34 and all above 0.296; the Standard runs straddle Full's.

### What would meet the gates (from this data; not tested, not adopted)

Reading the Full column as "capacity at n audible robots": **≥ 25 % needs Light at about 3 robots** (Full at 3.1–3.9 audible reads 0.27–0.30; ≤ 0.296 is the target), and **≥ 10 % needs Standard at about 6 robots** (Full at ≤ 6.4 audible reads ≤ 0.352; target ≤ 0.356). Today's interpolation is `round(2 + 10·t)` robots (Light 4, Standard 8), so this is a change of anchors (for example Light 3 / Standard 6 / Full 12), not of mechanism.

### Decision for Crawford (plan task 11: stop and report)

1. **Change the anchors** — e.g. Light 3 robots, Standard 6 — and re-run this same protocol (≈ 40 minutes) to confirm. This keeps the thresholds; the cost is a quieter Light and Standard (fewer robots heard at once, more "Standing by").
2. **Keep 4 / 8 and re-set the gates** — Light ≈ 15–18 % on robots alone; Standard's ≥ 10 % is then met (if at all) through the LFO tiers on `bravo` rather than on `charlie`. The spec's criterion 4 already has a `bravo` mean condition for Standard; the robot cap only matters there when many robots are audible.
3. **Judge on `bravo` first** — Light also removes drift and the filter LFOs there (worth ≈ 0.08–0.19 in the Task 4 data), so Light very likely clears 25 % on `bravo` regardless. The `charlie`-only gate exists to isolate the robot lever; it was always the strict one.

The plan says not to proceed to Phase 4 without this call, and none of the UI, LFO-tier, latency or documentation tasks (12–26) has been started.

## Audio Load Budget — the finished feature against the gates (2026-09-21, plan task 24)

The whole feature measured against the pre-feature build ([specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md) §5.3 criteria 1, 4, 5, with criterion 4 as revised by decision M). **One gate is missed: Standard's mean on `bravo`. Nothing was tuned to pass.**

**Code measured.** Current = `6e4f8eb` (product code identical to `5df69fb`: caps, LFO tiers, drift tier, UI, URL mirror, boot-time latency). Pre-feature = `4bab2ea` (the commit whose product code is `main` plus only the overlay's `audible` reading), built from a temporary checkout of `src` at that commit and served **beside** the current build in the same directory (`pre.html`; the perf script now accepts `world@page`). Production builds, `npm run perf:audio`, headless Chrome 153. **Same session, interleaved**: 12 foreground calls of two 4-minute runs (15 s buckets, 8 s warm-up), alternating worlds and rotating order so every arm has exactly **3 runs** on each of `charlie:200:-30` and `bravo:-150:90`; orphaned-Chrome count 0 before and after every call.

### Results (per-run peak windows / overall means; medians in brackets)

| World · arm | Peak window | Overall mean | Max sounding | Callback interval (max bucket mean) |
|---|---|---|---|---|
| `charlie` Light | 0.266 / 0.274 / 0.265 (**0.266**) | 0.236 / 0.250 / 0.237 (0.237) | 4 of 4 | 21.33 ms (Light's own context) |
| `charlie` Standard | 0.379 / 0.396 / 0.403 (0.396) | 0.317 / 0.329 / 0.330 (0.329) | 8 of 8 | 11.07 ms |
| `charlie` Full | 0.375 / 0.359 / 0.392 (**0.375**) | 0.310 / 0.315 / 0.334 (0.315) | 8 | 10.67 ms |
| `charlie` pre-feature | 0.361 / 0.355 / 0.376 (**0.361**) | 0.314 / 0.312 / 0.314 (0.314) | – | 10.67 ms |
| `bravo` Light | 0.329 / 0.332 / 0.316 (**0.329**) | 0.290 / 0.306 / 0.287 (0.290) | 4 of 4 | 21.34 ms |
| `bravo` Standard | 0.444 / 0.456 / 0.468 (**0.456**) | 0.384 / 0.402 / 0.392 (**0.392**) | 8 of 8 | 11.06 ms |
| `bravo` Full | 0.499 / 0.527 / 0.525 (**0.525**) | 0.460 / 0.468 / 0.461 (**0.461**) | 8 | 10.67 ms |
| `bravo` pre-feature | 0.533 / 0.569 / 0.533 (**0.533**) | 0.462 / 0.488 / 0.456 (0.462) | – | 10.67 ms |

### The gates

| Gate (spec §5.3, revised by decision M) | Measured | |
|---|---|---|
| **Criterion 4 — Light lowers the peak window ≥ 25 % on `bravo`** | **37.3 %** (per-run range 33.5–40.1 %) | met |
| **Criterion 4 — Light lowers the peak window ≥ 15 % on `charlie`** (robots, polyphony and — new — the latency hint) | **29.0 %** (23.6–32.6 %) | met |
| **Criterion 4 — Standard lowers `bravo`'s peak window ≥ 10 %** | **13.2 %** (mean of runs 11.8 %; per-run range 6.2–15.7 %) | met, but thin: the most pessimistic pairing of runs is 6.2 % |
| **Criterion 4 — Standard lowers `bravo`'s mean ≥ 0.10** | **0.069** (0.461 → 0.392) | **MISSED** |
| Criterion 4 — no `charlie` gate for Standard | −5.7 % peak, −0.014 mean (Standard ≈ Full there) | informational |
| **Criterion 1 — Full within ±0.03 of the pre-feature build, same session** | `charlie` mean Δ +0.002, peak Δ +0.014; `bravo` mean Δ −0.001, peak Δ −0.008 | met |
| Criterion 2 — the caps hold | max robots sounding 4 of 4 (Light) and 8 of 8 (Standard) in every run | met |

### Criterion 5 — robot-LFO stress at the shipped caps

Throwaway build (same recipe as the Task 4 injector; never committed) on `bravo`, requesting up to 99 `detune` LFOs through `lfoEngine` the way the user would (36 exist), so the Audio Load policy decides what connects. Preflight: **Light connects 4 of 36, Standard 12 of 36**, the rest held off. 3 interleaved 60 s runs each:

| Arm | Peak windows | Overall means | Callback interval | Verdict |
|---|---|---|---|---|
| Light (cap 4) | 0.509 / 0.506 / 0.503 | 0.495 / 0.486 / 0.485 | 21.33–21.35 ms (its own base — no doubling) | **< 0.9, no deadline misses — met** |
| Standard (cap 12) | 0.708 / 0.725 / 0.699 | 0.684 / 0.687 / 0.694 | 10.67–10.72 ms | **< 0.9, no doubling — met** |
| Full, uncapped, same 36 LFOs (one run, for context) | 0.994 | 0.988 | 11.3–11.6 ms | saturated — the hazard the caps prevent |

### What this says

- **Light works better than the caps alone predicted, because of the latency hint.** Task 11 measured Light at −18 % on `charlie` with the caps only (peak 0.323); with the boot-time `playback` context it is −29 % (0.266). Different sessions, so the ≈ 0.06 difference is indicative, not a controlled A/B — but it is the size of the effect, and it is why Light's callback interval is 21.33 ms (a 1024-frame buffer) rather than 10.67 ms.
- **Standard is the weak preset, and the caps are not why.** On `charlie` it is indistinguishable from Full (its 8-robot cap is inert there). On `bravo` it does lower the peak (−13 %) and the mean (−0.069) — that is drift coming off; `bravo`'s 5 global LFOs cost ≈ 0.11–0.19 in the earlier global-LFO measurements ([todo/scratchy-audio-phones.md](todo/scratchy-audio-phones.md): all 7 ≈ +0.19, drift ≈ half of it) — but **not by the 0.10 the spec asked for**, and the filter LFOs, which Standard keeps, are the other big share. These render-capacity numbers were measured with `interactive` latency (decision J, at the time); a same-session phone comparison on 2026-09-21 gave Standard `playback` 6.6× fewer output underruns than `interactive` on `bravo` (1227 vs 186 over ~5 min), and Standard now ships with `playback` — see [scratchy-audio-phones.md](todo/scratchy-audio-phones.md) "Standard, and decision J" and [AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md) §7 J. This desktop table was not re-measured with `playback`, so its numbers describe the pre-decision-J build.
- Standard's per-run peak reductions (6–16 %) straddle the 10 % gate, so even the met peak gate should not be leaned on.

### Decision for Crawford (plan task 24: report a missed gate, do not re-tune)

The missed gate is the mean on `bravo` under Standard. Levers that are already measured or built, none applied here:
1. **Accept it and re-set the gate** to what Standard delivers (≈ 0.07). Standard then means "drift off, half the robots"; Light is the preset that actually relieves a phone.
2. **Take the filter-frequency/Q LFOs off at Standard too** (raise `LOAD_FILTER_LFOS_MIN` from 0.4 to just above 0.6). The earlier global-LFO measurements put them at ≈ +0.06 each; on `bravo` that could close the gap but leaves Standard with only the EQ-gain LFOs.
3. **Give Standard the `playback` latency** (decision J was "interactive until the phone A/B says otherwise"). The phone protocol (plan task 25) already includes `load=standard&latency=playback` to answer exactly this; deciding after that run costs nothing.

**Decided 2026-09-21 (Crawford): option 1 — accept it and re-set the gate to what Standard delivers** (0.069; spec decision N). **Option 3 was resolved later the same day**: the output diagnostic's underrun counts gave a clean same-session `bravo` comparison (Standard/`interactive` 1227 vs Standard/`playback` 186), and Standard now ships with `playback` (decision J, [scratchy-audio-phones.md](todo/scratchy-audio-phones.md) "Standard, and decision J"). The 0.069 mean figure above predates that change and was not re-measured with `playback`; option 2 (filter LFOs off at Standard) stays the documented lever if that gap still matters once re-measured.

## Robot-LFO priming — the Task 11 perf gate (2026-09-30 / 2026-10-01, LFO Load Fix)

[docs/tasks/LFO_LOAD_FIX.md](tasks/LFO_LOAD_FIX.md) Task 11: the decision gate for assumption 3 ("Full's robot-LFO cap stays unlimited for now"). Robot-LFO priming (`primeRobotLfos`/`primeRosterLfos`, Tasks 6–10) makes seeded robot LFOs actually connect for the first time — previously a robot's LFO settings showed in the UI but nothing ever reached the engine. **Gate: at Full, `bravo`'s peak render capacity stays below 0.9 with no interval doubling. If it fails, stop and report** — a finite Full cap is Crawford's decision, not a tuning knob.

### First result: the gate failed, badly

One round each, pre-branch (`506f2366`, the commit before Task 1) vs this-branch pre-fix (`f17f3723`, Tasks 1–10 complete):

| Build | World | Peak window | Overall mean | Callback interval |
|---|---|---|---|---|
| pre-branch | `charlie` | 0.353 | 0.322 | 10.67 ms |
| pre-branch | `bravo` | 0.399 | 0.361 | 10.67 ms |
| this-branch pre-fix | `charlie` | **0.996** | 0.994 | 11.0–12.0 ms |
| this-branch pre-fix | `bravo` | **0.998** | 0.995 | 11.1–12.6 ms |

Root cause: `robotLfoCap(load)` (`src/utils/audioBudget.ts`) returned `Infinity` only at exactly Full — the documented "stays unlimited for now" decision — and `lfoEngine.connectOne` does enforce the budget correctly (traced directly; no bypass). With the volume/pulseWidth removal and 25% seed odds (Tasks 2–5), ≈18 audio-rate robot LFOs now connect on a 12-robot roster at Full, each costing ≈ +0.033 render capacity (measured here; well above the spec's assumption-9 budget of ≈0.012/LFO from the earlier `docs/PERFORMANCE.md` "Robot-LFO cost by target type" measurement), saturating the audio thread on both worlds — including `charlie`, which has 0 global LFOs and previously ran at 0.32.

### Fix: `ROBOT_LFO_CAP_FULL`

Commit `df689ba8`: `robotLfoCap` now plateaus at Standard's cap (12) from Standard through Full instead of climbing toward the old `ROBOT_LFO_CAP_CEILING` and snapping to `Infinity` at exactly Full. `ROBOT_LFO_CAP_CEILING` is removed (dead code). TDD'd against `audioBudget.test.ts`/`audioBudgetSystem.test.ts`; full suite, lint, types, build all clean.

### Re-measurement against the fix

**Method.** Worlds `charlie:200:-30` and `bravo:-150:90`; **3 interleaved rounds each**, pre-branch (`506f2366`) vs the fixed this-branch (`df689ba8`); 240 s series, 15 s buckets, 8 s warm-up; fresh Chrome per run, foreground, one call at a time; orphaned-Chrome count 0 before and after every run. Plus one run each of Standard and Light on `bravo` (fixed build only).

| | pre-branch `charlie` | fixed `charlie` | pre-branch `bravo` | fixed `bravo` |
|---|---|---|---|---|
| Peak window, per run | 0.353 / 0.433 / 0.403 | 0.429 / 0.413 / 0.395 | 0.399 / 0.399 / 0.497 | 0.581 / 0.443 / 0.369 |
| **Peak window, median** | **0.403** | **0.413** | **0.399** | **0.443** |
| Overall mean, per run | 0.322 / 0.391 / 0.366 | 0.398 / 0.362 / 0.351 | 0.361 / 0.355 / 0.431 | 0.470 / 0.394 / 0.314 |
| Overall mean, median | 0.366 | 0.362 | 0.361 | 0.394 |
| Callback interval | 10.67 ms | 10.67 ms | 10.67 ms | 10.67–10.72 ms |

| World · load | Peak window | Overall mean | Callback interval |
|---|---|---|---|
| `bravo` Standard (fixed build) | 0.326 | 0.288 | 21.33 ms (playback context, decision J — not a deadline miss) |
| `bravo` Light (fixed build) | 0.254 | 0.238 | 21.33 ms |

### Gate result

| Gate | Threshold | Result | |
|---|---|---|---|
| `bravo` Full, peak render capacity | < 0.9 | **0.443** (median), range 0.369–0.581 across 3 rounds | **PASS**, wide margin |
| No interval doubling at Full | callback interval stays ≈10.67 ms | 10.67–10.72 ms across every Full run | **PASS** |

`charlie` and `bravo` at Full with the fix (0.40–0.44 median) sit close to the pre-branch baseline (0.36–0.40) — priming now contributes a modest, bounded amount rather than saturating the thread. Single-sample spikes toward ≈0.99 appear within a few buckets (the `max cap` column) without the interval ever leaving the 10.67 ms floor, consistent with the noise pattern recorded in the Audio Load Budget sections above.

## LFO Bank — the Task 19 perf gate (2026-10-01)

[docs/tasks/LFO_BANK.md](tasks/LFO_BANK.md) Task 19: measures the finished LFO Bank feature (Tasks 1–18 — four shared world-level lanes replacing one `Tone.LFO` per modulation target) against the pre-branch build. **Both gates pass, decisively.**

### Methodology note: `charlie:200:-30` / `bravo:-150:90` no longer pin anything

The plan's own method (inherited from the LFO Load Fix precedent above) calls for `?seed=charlie&x=200&y=-30`-style pinning. That mechanism is gone: `?seed=`/`?x=`/`?y=` were removed by the Shareable Link work (2026-09-28), which predates even the `08bae3a2` pre-branch commit — confirmed by grepping `src/` on both commits (only `sessionShareUtils.ts`, `debugParams.ts`, `audioBudget.ts`, and `audioBudgetSystem.ts` read `URLSearchParams` on either), and by live-loading `?seed=charlie&x=200&y=-30` against both builds, which produced a random world each time. [docs/PROCEDURAL_GENERATION.md](PROCEDURAL_GENERATION.md)'s `?seed=`/`?x=`/`?y=` section is stale on this point and needs its own fix (not done here — out of this task's scope). This likely also means the `0.413`/`0.443` baseline recorded in the section above was itself measuring random worlds under the `charlie`/`bravo` labels: its two medians are suspiciously close (0.403 vs 0.399) where every genuinely-pinned measurement elsewhere in this doc shows `bravo` reading ≈0.15–0.22 above `charlie` (0 vs 5 global LFOs).

The only live pinning mechanism now is `?session=<payload>` (Shareable Link, roadmap Phase 21). Crawford supplied two hand-built session links — `attenuationStyleName: "charlie"` / `coordinates: {200,-30}` and `"bravo"` / `{-150,90}` — each a full `SessionPayload` (globalAudio, pacing, `lfoBank`/`globalLfoLinks`, and a few robot layer overrides) captured from his own live session. Verified against both builds before measuring: coordinates land correctly (confirmed via a read-only HUD probe, not committed), the LFO Bank fields restore correctly on the current branch (`bank 4/4`), and the pre-branch build — which predates the Bank entirely and has no `lb`/`gll` wire keys — decodes the same payload without error, simply leaving its own fresh-seeded old-style per-target LFO settings in place (the only fields it doesn't understand are silently ignored, same contract `isValidCompactSessionPayload` already guarantees for forward-compatibility). The HUD's own world-name line always reads "random" on both builds now — it echoes a `seed` field that genuinely no longer exists anywhere in the data model (`session.ts`'s own doc comment: "no literal 'seed' field") — so that line is cosmetically dead, not a sign either pin failed; the coordinates and bank/links readings are the real confirmation.

Using `?session=` through the existing `--world name:x:y?session=<payload>` harness flag works unmodified (the trailing `?query` rides along additively; the dummy `seed=`/`x=`/`y=` the flag still emits are simply ignored by the app).

### Method

**Code measured.** This-branch = `cfb32da6` (feature/LFO-pool, Task 18 complete). Pre-branch = `08bae3a2` (git worktree, the commit immediately before the LFO Bank branch started — confirmed to already include the earlier `ROBOT_LFO_CAP_FULL` fix). Both production builds (`npm run build`), served by separate `vite preview` instances (ports 4173/4174) in the same session. `npm run perf:audio`, headless Chrome, no CPU throttle (the audio thread isn't throttled). **3 interleaved rounds**, rotating which build ran first each round; **240 s series, 15 s buckets, 8 s warm-up**; fresh Chrome per run, foreground, one call at a time; orphaned-Chrome count 0 before and after every call. Plus one **Standard** and one **Light** run on `bravo`, this-branch only (informational, not gated).

### Results (Full load, 3 rounds each)

| Arm | Round 1 | Round 2 | Round 3 | **Median peak** | Median mean | Max callback interval |
|---|---|---|---|---|---|---|
| `charlie` this-branch | 0.365 / 0.287 | 0.320 / 0.264 | 0.335 / 0.267 | **0.335** | 0.267 | 15.49 ms (one-bucket spike, R1 only; every other bucket 10.00 ms) |
| `charlie` pre-branch | 0.993 / 0.944 | 0.984 / 0.886 | 0.988 / 0.879 | **0.988** | 0.886 | 10.16–10.55 ms |
| `bravo` this-branch | 0.423 / 0.361 | 0.413 / 0.362 | 0.444 / 0.360 | **0.423** | 0.361 | 10.00–10.02 ms |
| `bravo` pre-branch | 0.997 / 0.995 | 0.997 / 0.995 | 0.998 / 0.996 | **0.997** | 0.995 | 12.72–13.42 ms |

(Cells read `peak window / overall mean`.) `bank`/`links` HUD readings (single-sample spot checks, not part of the statistical series, this-branch only): `charlie` — `bank 4/4`, `links` 10–19/79 across two probes taken at different points in roster spawn-in; `bravo` — `bank 4/4`, `links 23/79`. Both confirm the Bank primed and linked correctly during measurement.

### The gates

| Gate | Threshold | Result | |
|---|---|---|---|
| **Hard gate — `bravo` Full, peak render capacity** | < 0.9 | **0.423** (median), range 0.413–0.444 | **PASS**, wide margin |
| **Hard gate — no interval doubling at `bravo` Full** | callback interval stays ≈10.67 ms | 10.00–10.02 ms across every round | **PASS** |
| **Success bar — `charlie` Full median peak ≤ pre-branch** | ≤ 0.988 (this session's own pre-branch measurement) | **0.335** (−66 %) | **MET** |
| **Success bar — `bravo` Full median peak ≤ pre-branch** | ≤ 0.997 (this session's own pre-branch measurement) | **0.423** (−58 %) | **MET** |
| Success bar, against the (likely unreliable) recorded baseline above | ≤ 0.413 / 0.443 | 0.335 / 0.423 | also met |

Both gates pass with a wide margin either way the success bar is read.

### Informational: Standard and Light on `bravo` (this-branch only)

| Arm | Peak window | Overall mean | Max callback interval |
|---|---|---|---|
| Standard | 0.366 | 0.306 | 20.00 ms (`playback` latency hint's own buffer size — not a deadline miss) |
| Light | 0.324 | 0.278 | 20.00 ms |

Consistent with every presets measurement elsewhere in this doc: Standard and Light both sit comfortably below Full, with the `playback` hint's larger (1024-frame) buffer showing as a ~2× callback interval that is a configuration choice, not a doubling under load.

### Why pre-branch saturates so hard on these two particular worlds

The gap here (pre-branch ≈0.99, this-branch ≈0.35–0.45) is much larger than the ≈0.40-vs-0.44 gap the old (now-suspect) `charlie`/`bravo` numbers showed. That is not a measurement error: `attenuationStyleName` is now a literal, human-chosen string (not a raw seed), so hashing the strings `"charlie"`/`"bravo"` through the pre-branch's own per-target LFO seed generator is an unrelated draw from the one the old `?seed=` scheme made — and this particular draw happens to light up many robot targets with non-trivial rate/depth and drift enabled, which Full never capped or disabled on the old engine (documented hazard, "Robot-LFO cost by target type" section above: "at Full, robot LFOs are uncapped and carry drift, so the hazard there is real"). The callback interval staying near 10–13 ms (not doubling to ~21 ms) during this shows the audio thread is genuinely close to its limit, not that the harness is misreading. This is a legitimate same-session, same-world A/B — the Bank's bounded four-lane design is precisely what keeps the new engine calm on a world that saturates the old one, which is the result Task 19 exists to check for.

## Idle paint & composite — roadmap 17.2.5 (2026-10-02)

The last of the 17.2.x series: with nothing open, the main thread was ~84 % busy at 4× throttle, almost all of it native paint/composite work (the "(program)" row in the idle profile above). This section records how it was localized, the two fixes that landed, one that was measured and reverted, and what remains.

### The localizer — `npm run perf:idle`

`scripts/perf/idle-paint.mjs` traces the powered-on blank hub in **one Chrome session on one world** (so every variant is comparable) and answers "what repaints every frame?" two ways:

- **Attribution:** every `Paint` trace event names the DOM node it painted; the stock window reports paint time per node, resolved to a selector, plus the clip area.
- **Ablation:** the same 6 s window is re-traced with one suspect switched off at a time — a `<style>` injected into the page (no rebuild), or, for the moving nodes, the nodes *removed* from the DOM. It also summarizes Chrome's invalidation-tracking events (`StyleRecalc` / `Layout` reason + node), which is what names the culprit directly.

Flags: `--throttle n` (default 4), `--window ms` (6000), `--width px` (1280), `--url`, `--only a,b` (ablation names; `stock` always runs first), `--help` lists the ablations. Each row reports main-thread busy time (`RunTask` on the renderer main thread), frames, `Paint` count/ms, `PaintArtifactCompositor::Update` ms, style/layout ms and JS buckets. Two things learned building it: pick the renderer main thread by its `thread_name` metadata (the busiest thread in a trace is not it), and `display: none` is **not** "nothing moves" — GSAP keeps writing transforms to a hidden element and Blink still invalidates style for it, so the moving-node ablations detach the nodes instead.

**Redrawn area (roadmap Phase 53).** Every row also reports `redrawn px²/frame` and its headline form `screens/frame`: the area of every `Paint` event in the window, divided by the window's frame count (and, for `screens/frame`, by the emulated viewport's device-pixel area). `scripts/perf/paint-area-lib.mjs` computes it. A `Paint` event's `clip` is a cull rect and not the repainted area, and a promoted mover's is unbounded, so each `Paint` is **clamped** to the area of the compositor layer it drew into (LayerTree, matched by backend node, with the stage's scale applied to layers inside the stage, since LayerTree reports bounds before it); a node with no layer of its own is capped at one viewport and counted in the `unresolved Paints` column. Chrome also opens one `Paint` on `#document` per frame that paints anything, the whole-frame paint pass with a viewport-sized cull rect, and the per-layer `Paint` events sit inside its span; it is a wrapper, not a repaint (the document's layer does not raster for it), so `framePaintWrappers` leaves it out of the sum and of the per-node table, and the `frame wrappers` column counts how many were left out (a `#document` Paint with nothing nested still counts: "Per-Mover Compositor Layers — the Task 20 gate, re-run" below, and [tasks/DOCUMENT_REPAINT.md](tasks/DOCUMENT_REPAINT.md)). The readout also prints `Mover layers:` (the count, sizes and estimated memory of the `.mover` layers, apart from the sheets'), and layers are named by their `data-scene-slot`. The metric is proved by ablation, not by reading: on `main` stock reads a few screens per frame and `detach-bubbles+robots` reads 0. Method, baseline and the phase's gate are under "Pre-change baseline for Phase 53" and "Per-Mover Compositor Layers — the Task 20 gate" below. **Re-rastered area (DOCUMENT_REPAINT.md Phase 5, option b).** Every row also reports `rastered px²/frame` and `rastered screens/frame`: what the compositor actually re-drew, from the `RasterTask` events on the raster worker threads (`args.tileData.layerId` and `sourceFrameNumber`), each compositor layer charged its on-screen area (the LayerTree snapshot, keyed by layer id, stage scale applied) once for every frame it rastered in, summed and divided by the frames; `rasteredArea` in `paint-area-lib.mjs`. A layer that rasters but was in neither the pre-window snapshot nor a second one read right after the window is charged 0 and counted in `unresolved raster layers` (`late layers` counts the ones the second read sized), so the figure is a floor, and the stock window's "raster by layer" table names every layer that rastered with its frames and tasks. Recorded, not gated; its baseline is "Per-Mover Compositor Layers — the re-rastered area column" below.

### What was found (main `368e5cd4`, desktop 1280×900, production build, 6 s windows)

Every frame, the whole ocean scene repainted at full viewport size (the `div.world-view` row, clip 1280×900, one paint per frame), and the factories were what made each repaint expensive:

| Variant (one session, 1× throttle) | main busy (ms) | Paint (ms) | Compositor::Update (ms) |
|---|---|---|---|
| stock | 3121 | 1096 | 840 |
| no factories (hidden) | 2060 | 95 | 135 |
| bubbles detached | 3164 | 992 | 721 |
| bubbles + robots detached (fill transitions still on) | 2509 | 943 | 11 |
| bubbles + robots detached + fill transitions off | **897** | **23** | 13 |

Two independent causes, each sufficient to repaint the whole scene every frame:

1. **The CSS `fill 4.8s` transition on every lighting-driven factory fill** (`FILL_TRANSITION`). Lightness is rounded to a whole number and steps every ~2 s, so with a 4.8 s transition some fill was *always* mid-transition, and a running transition style-invalidates its element on every frame (`StyleRecalc Animation` on hundreds of `rect`/`polygon` nodes). With the moving nodes gone this alone was 943 ms of paint per 6 s.
2. **Robots and bubbles moving inside the same `<svg>` as the sixty static factories.** Any transform write dirtied the one paint layer, so the factories re-rasterized every frame. Removing the factories cut paint from 1096 to 95 ms with the same number of paints.

The flicker overlay (`.screen-viewport::before`), the rocker light pulse and the depth-gradient rects were all ruled out (no change when switched off).

### Fixes — the ledger (all unthrottled, 6 s idle window, same session; `npm run perf:idle --only none --url …` against three served builds)

| Build | main busy (ms) | Paint (ms) | Compositor::Update (ms) | Verdict |
|---|---|---|---|---|
| main `368e5cd4` | 3229 | 1006 | 773 | baseline |
| fix 1 — `FILL_TRANSITION` removed (`a70b9022`) | 2093 | 900 | 718 | **kept** — −35 % busy; paint barely moves (the robots still repaint the scene) but the per-frame style recalc of every factory fill is gone |
| fix 1 + fix 2 — scene split into static/moving layers (`c4a61d15`) | 1672 | 147 | 446 | **kept** — paint −85 % vs main; the factory layers now paint 6 times per 6 s (the lighting tick), the moving layers every frame |
| fix 3 — robots as HTML-positioned, individually composited divs (not committed) | 1404 / 1788 / 1793 vs fix 2's 1377 / 1748 / 1817 (three interleaved rounds) | 82–114 | 457–495 | **reverted** — inside run-to-run noise |

At 4× throttle fix 1+2 reads paint 416 ms / compositor 1319 ms per 6 s against ~2000 / ~1600 on main; the main thread is still saturated there because the JS half (below) alone fills it at 4×.

**Fix 2's shape** (OceanScene.tsx): four stacked `<svg>` layers sharing the viewBox and `xMidYMid slice` fit — static back (background + midground factories and the depth gradients), moving bubbles, moving robots, static front (foreground factories). The moving layers carry `will-change: transform` so they are compositor layers of their own. Bubbles moved out of `Factory.tsx` into `BubbleLayer` (vent/seed/tint/depth derived in `factoryBubbleProps.ts`); z-order is unchanged except that every building's bubbles now rise behind the robots and below the foreground row (Crawford's call).

**Why fix 3 did nothing:** the hypothesis was that the remaining `PaintArtifactCompositor::Update` (~450 ms per 6 s) came from the robots' SVG `<g>` transforms rebuilding the paint property tree every frame — detaching the robots does take it from ~390 to 9 ms. But with each robot an HTML `div` with `will-change: transform` the compositor update stayed at 457–495 ms, so it is the twelve moving layers themselves (or GSAP's per-frame style writes) that cost it, not the SVG transforms. The propellers were also checked (detached: −40 ms paint, −100 ms compositor) and are not worth a change.

### What remains at idle (fix 1+2, unthrottled)

- **Robots: ≈ 800 ms per 6 s** (removing them: 1580 → 749 ms busy). GSAP ticker JS, per-robot SVG relayout, and the compositor update above. Not a paint problem any more; an architecture one (fewer moving things, or cheaper ones).
- **JavaScript: ≈ 750 ms per 6 s of `FunctionCall` + ≈ 300 ms `TimerFire`** with the whole scene removed (`no-scene` ablation at 4×: 2.4 s of 6 s busy). The audio-swell `16n` tick and its store writes (noted under 17.2.1 above) live here; not investigated in this pass.
- **Real phone: not yet confirmed.** Headless Chrome's software raster is not a phone GPU (caveats above), and the layer split trades per-frame paint for three extra full-screen compositor layers (≈ 10 MB each at the Pixel 8's 1080×2400). Crawford's Pixel run is the gate before this is called fixed.

## Gem Polygon Robots — the Task 9 idle-paint gate (2026-10-05, Phase 39)

Gate ([docs/tasks/GEM_POLYGON_ROBOTS.md](tasks/GEM_POLYGON_ROBOTS.md) Task 9): idle paint/composite on the gem-robot build within the 17.2.5 noise band of `main`. **Missed** — and the plan's two cuts (orbiter lines, then facet strokes) do not close it.

**Method:** production builds served side by side — `main` `fe306004` (:4173), branch `41da1793` (:4175), and three throwaway variants built by patch → build → `git checkout` (never committed): **cut1** no orbiter boundary lines (:4176), **cut1+2** also no facet strokes (:4177), **size** gem robots drawn at 0.6× body scale ≈ the old on-screen footprint, a diagnostic not a candidate (:4178). One pinned world for all (`?session=`, Attenuation Style `rwnpswe5` at (130, −60), captured from the dev app with `buildSessionPayload`); `npm run perf:idle --throttle 1 --only none` (stock 6 s window, desktop 1280×900, headless); foreground, one call at a time, orphaned-Chrome count 0 before; 6 rounds of main vs gem and 3 rounds of all five, order rotated each round. Both builds verified to load the same robots at matching positions (old parts on main, `.gem` on the branch) before measuring.

### Results (6 s idle window, 1×; every run)

| Build | main busy (ms) | Paint (ms) | Layout (ms) | Compositor::Update (ms) |
|---|---|---|---|---|
| main | 2080 · 2127 · 2050 · 2124 · 2103 · 2144 | 198 · 198 · 194 · 198 · 206 · 199 | 118–122 | 552–579 |
| gem | 2401 · 2377 · 2425 · 2391 · 2482 · 2385 | 382 · 383 · 387 · 369 · 396 · 384 | 218–227 | 537–569 |
| cut1 (no orbiter lines) | 2406 · 2395 · 2458 | 381 · 372 · 385 | 208–215 | 533–563 |
| cut1+2 (+ no facet strokes) | 2336 · 2372 · 2361 | 350 · 351 · 355 | 205–214 | 542–546 |
| size (0.6× footprint) | 2453 · 2357 · 2427 | 392 · 383 · 379 | 216–224 | 544–557 |

Medians: main busy **~2110**, gem **~2396 (+14 %)**; paint **198 → 384 (+94 %)**; layout ~120 → ~220. The ranges never overlap. Compositor is flat. The robot layer alone (paint-by-node) went 67 → 161 ms per 6 s, and `Layout SVG changed` invalidations doubled (≈51 k → ≈103 k): each frame a moving robot `<g>` re-lays-out and the moving layer re-rasterizes every child.

### Why — element count, not area

- **Element count:** drawn shapes in `#robot-layer` (12 robots): main **417** (~35/robot), gem **1046** (~87/robot), cut1+2 998. Paint scales with it (×1.94 for ×2.5 shapes).
- **Not area:** the size probe shrinks the gem robots to about the old footprint and paint does not move (379–392 vs 369–396). The moving robot layer re-rasterizes every frame and its cost is per display item, not per pixel.
- **The plan's cuts are the wrong lever:** orbiter lines are 48 of the 1046 shapes (no measurable change); dropping every facet stroke saves ~30 ms of paint and ~40 ms busy — still far outside the band. Facets themselves (one polygon per outline edge, ~45 per robot) are the bulk.

What would close it (not tested): draw each part's facets as one `<path>` per tone (and each part's lines as one path) — roughly 35–45 shapes per robot, the old count. Exact-fill merging is invisible but saves little (few facets share a rounded tone); quantizing to ~3–4 tones per part changes the look slightly. Decision for Crawford.

### Follow-up — merged paths and quantized tones (Tasks 9a/9b, 2026-10-05)

Crawford chose merging into paths. Task 9a (`975c2786`) draws each part's facets as one `<path>` per fill and its lines as one path; Task 9b (`4a8bc274`) adds `quantizeShade` / `GEM_FACET_TONES`, shipped at 0 (off). Same method, same pinned world, same `main` build; variants built from HEAD with the constant patched (never committed). Three rounds, order rotated.

| Build | main busy (ms) | Paint (ms) | Layout (ms) | Shapes / robot (render) |
|---|---|---|---|---|
| main | 2058 · 2100 · 2131 | 190 · 202 · 194 | 118–122 | ~35 |
| merge only (HEAD, tones off) | 2544 · 2600 · 2507 | 418 · 453 · 423 | 227–241 | 73–84 |
| 4 tones | 2200 · 2404 · 2200 | 285 · 320 · 278 | 155–170 | 47 |
| 3 tones | 2226 · 2224 · 2201 | 266 · 257 · 260 | 144–147 | 39–40 |
| 3 tones, no facet strokes (1 run) | 2217 | 252 | 145 | 39–40 |

- **Merging alone is worse than not merging** (paint ~423 vs ~384 for Task 8's separate polygons; busy ~2544 vs ~2396): fewer elements, but stroked multi-subpath paths cost more per element. It only pays off with quantized tones, which collapse the paths. If tones stay off, Task 9a should be reverted.
- **3 tones** brings the gem robots to busy **+6 %** / paint **+34 %** over main (from +14 % / +94 %) — most of the gap, still outside the strict noise band. Facet strokes are not worth cutting on top (252 vs 260).
- Visually (real `RobotGem` + `gemPalette` render, 6 robots × per-edge / 4 / 3 tones): the tone steps barely register at world scale and not at all at 64 px. The sketch has a matching "Facet tones" selector.

Decision for Crawford: ship 3 tones and accept the residual, or keep the strict gate and look further (the residual is paint per element — face, lines and lights are now a larger share).

## Districts — the Task 9 D1 perf gate (2026-10-06, Phase 42)

Gate ([docs/tasks/WORLD_VIEW_DISTRICTS.md](tasks/WORLD_VIEW_DISTRICTS.md) Task 9): D1 (districts, terrain,
water column, factories only — no scenery renderers yet) idle busy/Paint within the 17.2.5 noise band of
base, on the two heaviest pinned districts. **Passed** on `dense` (apples-to-apples content); `ventfield`
is not a like-for-like comparison in D1, for a reason explained below, but shows no overhead either.

**Method:** production builds served side by side — base `c600d2ac` (:4173, the commit D1 branched from,
pre-districts) and branch tip `ed7cc3dc` (:4175, Tasks 1–8 complete). One pinned `?session=` world per
district: coordinates were found by scanning the real `pickDistrict` (same technique as
`districts.test.ts`'s `findCoordsForDistrict`) for the first `(x, y)` landing on `dense` (−500, −480) and
`ventfield` (−500, −410), then encoded with `encodeSessionPayload` (`attenuationStyleName: 'alpha'`,
`DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides) — base predates `placeDistrict` entirely but, like the
Shareable Link payload contract guarantees, decodes the same `coordinates` field it already understands.
`npm run perf:idle --throttle 1 --only none --port 9301` (stock-only window, desktop 1280×900, headless);
foreground, one call at a time, orphaned-Chrome count 0 before and after. Three rounds per
world per build, order rotated.

### Results (6 s idle window, 1×, `--only none`)

| World | Build | main busy (ms) | Paint (ms) | Factories | Circles |
|---|---|---|---|---|---|
| dense | base (`c600d2ac`) | 2715 · 2882 · 2802 | 341 · 354 · 341 | 59 | 748 |
| dense | branch (`ed7cc3dc`) | 2684 · 2861 · 2771 | 342 · 371 · 354 | 59 | 746 |
| ventfield | base (`c600d2ac`) | 3725 · 3896 · 3941 | 394 · 399 · 410 | 60 | 880 |
| ventfield | branch (`ed7cc3dc`) | 1880 · 2483 · 2698 | 314 · 392 · 465 | 4 | 42 |

(One `dense`/branch round read 3277 ms/413 ms, well outside its own other two rounds; a same-build recheck
immediately after read 2771 ms/354 ms, back in band — treated as a one-off scheduling blip, not a result,
per the "never chase a flaky single reading" rule.)

- **`dense` passes cleanly:** base and branch place the same ~59 factories (the old fixed `FACTORY_ROWS`
  table and the new `dense` recipe happen to be nearly the same size at this locale), so this is the valid
  apples-to-apples reading. Busy and Paint medians overlap base's own round-to-round spread; `Layout SVG
  changed` invalidations in both builds are dominated by the twelve robots' gem facets (`g.gem`,
  `polygon.gem__face`, ≈45k events/window either way) — `TerrainLayer`'s ridge/ground polygons and
  `WaterColumn`'s gradient/glow never appear in the top-8 invalidation or paint-by-node attribution, and
  each new static `<svg>` layer paints only 3–7 times across the ~340-frame window (on par with the
  existing static factory layers), not once per frame. Static layers are not re-laying-out between ticks.
- **`ventfield` is not comparable, by design, not by regression:** base has no concept of districts — the
  same ~59–60-factory table renders at every coordinate — while branch's `ventfield` recipe is
  deliberately sparse in D1 (SHIPPED_SCENERY is empty; most of its rows are reserved for `vent`,
  `pipeline`, `tank` etc. that don't exist until D2) and places only 4 factories. Branch's lower busy time
  there is the expected consequence of placing less, not evidence either way about per-element cost; the
  ~30–40 % run-to-run spread on both builds' `ventfield` readings tracks back to the twelve
  always-present, always-moving robots (unaffected by district), the same noise source 17.2.5 already
  documented for the robot layer, not to anything district-specific.
- Element counts (via a one-off DOM query, not part of the harness): `dense`/branch has 1281 shapes in
  `#factory-background-layer`, 257 in `#factory-midground-layer`, 958 in `#factory-foreground-layer`
  (≈2,500 total static factory shapes) plus 2 terrain polygons and 1 water shape — 3,490 shapes total,
  against base's 3,491 (the 1-shape difference being terrain/water's net effect at this locale). Adding
  two entire new static layers moved the shape count by under 0.1 % and the measured busy/Paint by nothing
  outside base's own noise.

### D2 element budget (spec §7 Q1)

`SCENERY_SHAPE_BUDGET = 700` (`src/systems/districtRecipes.ts`), keeping the sketch's provisional number
rather than raising it, derived from the above: static SVG content (factories today, scenery from D2) only
repaints on the lighting tick, not per frame, so idle busy/Paint — this gate's own metric — can't observe a
per-shape cost for it the way Phase 39 did for the continuously-moving robot layer. What this run does show
is headroom: `dense`'s ~2,500 static factory shapes, plus two brand-new static layers, together cost
nothing measurable at idle. A 700-shape ceiling for all of D2's scenery combined is well under that
already-proven-safe footprint (28 %), and `districtRecipes.test.ts` confirms it comfortably covers even
`outskirts` (26 non-factory items, the busiest district) at the simplest shipped body (GemShape's 4
polygons + 1 outline = 5 shapes) with wide room left for the heavier body-bearing kinds. The real backstop
is Task 18's D2 perf run, once renderers exist to measure the lighting-tick repaint cost directly rather
than infer it.

## Districts — the Task 18 D2 perf gate (2026-10-06, Phase 42)

Gate ([docs/tasks/WORLD_VIEW_DISTRICTS.md](tasks/WORLD_VIEW_DISTRICTS.md) Task 18): D2 (all sixteen scenery
families live, through the one dispatcher) idle busy/Paint within the noise band of the D1 tip, on the
three pinned worlds with the heaviest scenery, most bubbles and most body-bearing items. **Passed** on all
three — `dense`, `ventfield` and `yard`.

**Method:** production builds served side by side — D1 tip `4e30ac62` (Task 10, the last D1 commit, before
any scenery renderer exists; :4177 after port contention pushed both builds up from the usual 4173/4175)
and D2 tip `d2a573cf` (Task 17 complete; :4178). Coordinates were found the same way as Task 9
(`findCoordsForDistrict` against the real `pickDistrict`) for `dense` (−500, −480), `ventfield`
(−500, −495) and `yard` (−500, −455) — different from Task 9's own `ventfield` pin because that scan
takes the *first* match and nothing guarantees stability across unrelated table edits; both builds in this
run share the one coordinate set per world, which is what apples-to-apples requires, not matching Task 9's
literal numbers. Encoded with `encodeSessionPayload` (`attenuationStyleName: 'alpha'`,
`DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides). `npm run perf:idle --throttle 1 --only none --port 9301`
(stock-only window, desktop 1280×900, headless); foreground, one call at a time, orphaned headless-Chrome
count 0 before and after. Three rounds per world per build, order rotated.

### Results (6 s idle window, 1×, `--only none`)

| World | Build | main busy (ms) | Paint (ms) | Factories | Bubble/factory circles | Vents |
|---|---|---|---|---|---|---|
| dense | D1 (`4e30ac62`) | 2570 · 2409 · 3376 | 295 · 304 · 414 | 59 | 746 | 0 |
| dense | D2 (`d2a573cf`) | 2492 · 2500 · 3092 | 309 · 303 · 371 | 59 | 753 | 0 |
| ventfield | D1 (`4e30ac62`) | 1962 · 2543 · 2316 | 272 · 343 · 310 | 4 | 68 | 0 |
| ventfield | D2 (`d2a573cf`) | 2095 · 3055 · 2452 | 266 · 411 · 325 | 4 | 148 | 9 |
| yard | D1 (`4e30ac62`) | 2421 · 2935 · 3376 | 292 · 322 · 414 | 18 | 255 | 0 |
| yard | D2 (`d2a573cf`) | 2463 · 3148 · 3135 | 301 · 365 · 339 | 18 | 265 | 0 |

- **Factory counts are identical build-to-build on every world** (59 / 4 / 18) — unlike Task 9's
  `ventfield` reading, this is a genuinely apples-to-apples comparison: D2 adds scenery actors on top of
  the same factory placement, nothing about the factories themselves changed.
- **Median busy/Paint deltas (D2 vs D1): dense −2.7 % / +1.6 %, ventfield +5.9 % / +4.8 %, yard +6.8 % /
  +5.3 %** — every delta sits well inside each build's own round-to-round spread on the same world (24–41 %,
  the same robot-driven noise source 17.2.5 documented and Task 9 re-confirmed), so none of the three reads
  as a regression.
- **The bubbles-layer cost of `ventfield`'s 9 vents is unmeasurable at idle, not "small":** its circle count
  rises 68 → 148 (+80, tracking the vents' static plume ellipses) while busy/Paint stay in band and the
  bubbles layer never appears in the stock window's top-12 paint-by-node attribution in either build — the
  same "static content only repaints on the lighting tick" finding Task 9 made for terrain/water holds for
  vent plumes too. `no-bubbles` was not run this gate (`--only none`, per the method); `no-bubbles` is the
  ablation that would isolate it if a future gate needs to.
- **`SCENERY_SHAPE_BUDGET = 700` is met with wide headroom**, confirmed two ways: the existing budget test
  (`districtRecipes.test.ts`) stays green unchanged, and a one-off DOM count on the D2 build (not part of
  the harness, same caveat as Task 9's count) found 120 scenery shapes across 19 actors on `dense`, 173
  shapes across 23 actors (incl. 9 vents) on `ventfield`, and 157 shapes across 29 actors on `yard` — the
  busiest of the three pinned worlds uses 25 % of the budget.

**Verdict:** no miss to report. No lever was pulled — every family already shipped keeps its spot.

## Districts — the Task 22 D3 perf gate (2026-10-07, Phase 42)

Gate ([docs/tasks/WORLD_VIEW_DISTRICTS.md](tasks/WORLD_VIEW_DISTRICTS.md) Task 22): D3 (LightShafts; MarineSnow
was built, judged at Checkpoint C, and cut — Task 21) idle busy/Paint within the noise band of the D2 tip,
on one pinned world at hour 12 (shafts on) and the same locale's coordinate rotated to hour 0 (shafts off).
**Passed** at both hours.

**Method:** production builds served side by side — D2 tip `a8f35cbe` (Task 19, the last D2 commit; a
`git worktree` checkout, built fresh) on :4175, and D3 branch tip `87c279a3` (Task 21, MarineSnow built then
reverted — net content vs D2 is LightShafts only) on :4173. `computeLocaleHour` reads straight off a locale's
`dayStartTimestamp`, which `buildLocale` stamps as `abs(coordinates.x % 24)` at load time (`src/constants/
time.ts`, `src/systems/worldTransition.ts`), so the in-world hour at power-on is just `abs(x % 24)` — no
scan for a district was needed, only an `x` with the right remainder: `x = 12` (hour 12, shafts' opacity
`0.11 × (1 − nd)` at its daytime peak, nd = 0 at noon) and `x = 0` (hour 0, the group absent per Task 20's `< 0.005`
cutoff), `y = 50` for both, encoded with `encodeSessionPayload` (`attenuationStyleName: 'alpha'`,
`DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides — same recipe as Tasks 9/18). `npm run perf:idle --throttle 1
--only none` (stock-only window, desktop 1280×900, headless); foreground, one call at a time; three rounds
per world per build, order rotated.

**Gotcha, caught before trusting the numbers:** the first attempt reused ports 4173/4175 without checking
who already held them — leftover `vite preview` processes from an earlier, unrelated session (orphaned,
not cleaned up) were still listening there, so both URLs served the *same* stock bundle regardless of which
`--outDir` was requested. Caught by diffing the served `assets/index-*.js` filename against each build's own
(`CY1QB4Xr` branch vs `Cq5aYoYF` D2 tip) before trusting any reading — they matched on both ports, which is
impossible for two different commits. All six readings taken before the check were discarded; every orphaned
`vite preview` process was killed, both servers restarted, and the bundle check re-run clean before any
number below was recorded. Verify what a URL actually serves before measuring it, not just that it answers.

### Results (6 s idle window, 1×, `--only none`)

| World (hour) | Build | main busy (ms) | Paint (ms) |
|---|---|---|---|
| x=12 (hour 12, shafts on) | D2 tip (`a8f35cbe`) | 2334 · 2386 · 2390 | 229 · 239 · 240 |
| x=12 (hour 12, shafts on) | D3 branch (`87c279a3`) | 2430 · 2440 · 2337 | 226 · 240 · 231 |
| x=0 (hour 0, shafts off) | D2 tip (`a8f35cbe`) | 1651 · 1661 · 1639 | 217 · 216 · 216 |
| x=0 (hour 0, shafts off) | D3 branch (`87c279a3`) | 1653 · 1609 · 1624 | 220 · 216 · 217 |

Medians (branch vs D2 tip): hour 12 busy 2430 vs 2386 (**+1.8 %**), paint 231 vs 239 (**−3.3 %**); hour 0
busy 1624 vs 1651 (**−1.6 %**), paint 217 vs 216 (**+0.5 %**) — every delta sits well inside the 24–41 %
round-to-round spread Tasks 9/18 documented on this same robot-driven noise source, so neither hour reads as
a regression in either direction.

- **Front layer's `Layout SVG changed` count unchanged:** top invalidation at hour 12 was `g.gem` /
  `polygon.gem__face` (the twelve robots' facets) at 49,743 (branch) vs 49,603 (D2 tip) — both builds
  dominated by the same robot layer, confirming LightShafts' static back-layer polygons don't add per-frame
  layout churn (same "static content only repaints on the lighting tick" finding Tasks 9/18 made for
  terrain/water/vent plumes).
- **Hour 0 confirms the `< 0.005` opacity cutoff costs nothing to leave the group unmounted:** busy/paint at
  hour 0 are in-band on both builds, and lower than hour 12 on both (fewer painted shapes at the lower
  gradient opacity generally, consistent with less going on, not a build difference).

**Verdict:** no miss to report. MarineSnow's revert (Task 21) left no residual: branch content vs D2 tip is
LightShafts alone, and it costs nothing measurable at idle in either shafts-on or shafts-off state.

## Robot Jobs J1 — the Checkpoint B perf gate (2026-10-07, Phase 43)

Gate ([docs/tasks/ROBOT_JOBS_AND_STATIONS.md](tasks/ROBOT_JOBS_AND_STATIONS.md) Checkpoint B): J1 changes the
lifecycle and builds world data but draws nothing new, so idle busy should not move against the branch base.
**Passed.**

**Method:** production builds served side by side from scratch `--outDir`s on fresh ports. Branch
`feature/jobs-lifecycle` `20fd82d9` (Task 15) went on :4177 (`index-qpTXpUqM.js`). The base, main `0d9cc51f`, was
built from a throwaway `git worktree` and served on :4178 (`index-CY1QB4Xr.js`, the same bundle the D3 gate
recorded). Each port's served bundle filename was checked against its build before measuring. The pinned world is the D3 gate's hour-0 one,
built from code with `encodeSessionPayload`: style `alpha`, `(0, 50)`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, no
overrides. Both builds rendered the same scene: 12 robots, 2 factories, 36 circles. `npm run perf:idle --throttle 1 --only
none`; three rounds, order rotated, foreground; 0 orphaned Chrome before and after every round.

| Round (order) | Branch busy / paint (ms) | Base busy / paint (ms) |
|---|---|---|
| 1 (branch first) | 1779 / 233 | 1952 / 242 |
| 2 (base first) | 1893 / 240 | 1921 / 241 |
| 3 (branch first) | 1892 / 238 | 1896 / 234 |
| **Median** | **1892 / 238** | **1921 / 241** |

Busy **−1.5 %**, paint **−1.2 %**. Both are inside one build's own round-to-round spread (base 1896–1952), so
the gate reads no change, as expected. The robots' moving layer is still the only node that paints every
frame, on both builds (106–110 ms per 6 s).

**Don't gate on a default-throttle run.** A `perf:idle` run at the default `--throttle 4` read main busy
≈ 5950–5985 ms of the 6000 ms window in every ablation. At 4× the main thread is saturated, so busy can't
show a change either way. Gate at `--throttle 1`.

## Robot Jobs J2 — the Task 26 perf gate (2026-10-08, Phase 43)

Gate ([docs/tasks/ROBOT_JOBS_AND_STATIONS.md](tasks/ROBOT_JOBS_AND_STATIONS.md) Task 26, spec §5.4): J2 (stations,
the work loop, card states) idle busy and Paint within the 17.2.5 noise band of its base, with per-element
counts for the robots layer, stations included. **Passed on the harness: no miss.** Crawford's Pixel listen
passed 2026-10-08, taken on J3, which carries J2's code. Measured before Checkpoint C (Crawford's call), so if Checkpoint C changes the robots layer the
gate is re-run.

**Method:** production builds served side by side from scratch `--outDir`s on fresh ports, checked free first.
Branch `feature/job-lifecycle-2` `76e12e28` (Task 25) on :4181 (`index-DzZo4j2a.js`). Base: the J1 merge on
main, `e4f90d1d`, which this branch was cut from, built in a throwaway `git worktree` and served on :4182
(`index-Dv7Xr-Fn.js`). Each port's served bundle filename was checked against its build before measuring.
Same pinned world as the J1 gate: style `alpha`, `(0, 50)`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides,
encoded with `encodeSessionPayload` (version 2). `npm run perf:idle --throttle 1 --only none`; three rounds,
order rotated, foreground; 0 orphaned Chrome after. `idle-paint.mjs` now prints the robots stack's element
counts and has a `no-stations` ablation (this gate).

| Round (order) | Branch busy / paint (ms) | Base busy / paint (ms) |
|---|---|---|
| 1 (branch first) | 1642 / 134 | 2140 / 356 |
| 2 (base first) | 2637 / 221 | 2527 / 390 |
| 3 (branch first) | 1798 / 132 | 1623 / 215 |
| **Median** | **1798 / 134** | **2140 / 356** |

Busy **−16 %**, paint **−62 %**. Busy sits inside both builds' own round-to-round spread (base 1623–2527,
branch 1642–2637), so it reads no change. Paint is lower on every round.

**Per-element counts** (after the harness's 8 s power-on settle, the same on every run):

| | Stations | `#station-l4-layer` | `#station-l3-layer` | `#robot-layer` | `#station-front-layer` | Robots visible |
|---|---|---|---|---|---|---|
| Branch | 2 | 4 | 16 | 854–860 | 58 | 3 of 12 |
| Base | — | — | — | 854–860 | — | 12 of 12 |

The stations add 78 elements across their three fragments. `#robot-layer` is the same size on both builds;
the 6-element swing is facet paths inserted and removed as orbiters dock, on both.

**Why paint fell: fewer robots are drawn, not a faster robot.** On J2 a charging robot is `autoAlpha: 0`
(spec §1.12), so at the measured moment 9 of 12 robots were hidden in their stations, while J1 drew all 12. So
this gate shows J2's idle state is cheaper on this world. It doesn't show a worst case with every robot Active.
The J1 sim puts the mean at about 5 Active.

**Ablation pass** (one run per build, `--only no-stations,no-robots`; windows run stock → no-robots →
no-stations):

| Build | stock | no-robots | no-stations |
|---|---|---|---|
| Branch busy / paint | 1769 / 130 | 1990 / 41 | 2502 / 182 |
| Base busy / paint | 1595 / 211 | 1804 / 21 | 2378 / 246 |

- **Busy can't be read within one run.** Base has no stations, so its `no-stations` window hides nothing, yet
  it read +49 % busy (1595 → 2378). Later windows simply ran busier on both builds. Read only paint here.
- **The robots' paint:** 89 ms on the branch (3 visible) vs 190 ms on base (12 visible), about 30 vs 16 ms
  per visible robot. That figure is rough (one run, three robots), and its cause isn't measured. One
  candidate is J2's swims and exit arcs re-rasterizing more of each visible robot than J1's wander did. Worth
  re-checking at J3, when the move set lands.
- **Stations: no measurable paint.** Hiding them raised branch paint 130 → 182, close to the +35 the base
  control showed with nothing hidden.
- **Invalidations (round 1):** base's top entry was `Layout SVG changed` 33,592 (`g.gem`); the branch's was
  `StyleRecalc Attribute` 25,807 (`ellipse.gem__halo`, `g.robot`), with `Layout SVG changed` 13,019. The branch
  shows more `Layout Style changed` on `g.robot` (3,899 vs 830), from the swim tweens on its visible robots.

## Robot Jobs J3 — the Task 30 perf gate (2026-10-08, Phase 43)

Gate ([docs/tasks/ROBOT_JOBS_AND_STATIONS.md](tasks/ROBOT_JOBS_AND_STATIONS.md) Task 30, spec §5.4): J3 (the
six jobs' moves: trace, ring with its spark flicker, fan, carry, per-robot variation) idle busy and Paint
within the 17.2.5 noise band of its base, as Task 26. **Passed on the harness by the J1/J2 gates' rule (each
median inside the base's own round-to-round spread), with a lean flagged below.** Crawford's Pixel listen
passed 2026-10-08.

**Method:** as the J2 gate. Branch `feature/jobs-moves` `017acd6a` (Checkpoint D) on :4183
(`index-76-_ptck.js`). Base: J2's tip `af560c36` (Task 27), which this branch was cut from, built in a
throwaway `git worktree` and served on :4184 (`index-DzZo4j2a.js`, the same bundle the J2 gate measured as its
branch: Task 27 was docs only). Each port's served bundle filename was checked against its build before
measuring. Same pinned world: style `alpha`, `(0, 50)`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides,
encoded with `encodeSessionPayload` (version 2). `npm run perf:idle --throttle 1 --only none`, foreground;
0 orphaned Chrome before and after. Four rounds, not three: in the first three, whichever build ran first
read higher every time, and the rotation had put the branch first twice, so a fourth base-first round
balanced the order.

| Round (order) | Branch busy / paint (ms) | Base busy / paint (ms) |
|---|---|---|
| 1 (branch first) | 2161 / 185 | 1897 / 163 |
| 2 (base first) | 2589 / 197 | 2781 / 205 |
| 3 (branch first) | 2353 / 175 | 2129 / 162 |
| 4 (base first) | 2887 / 217 | 2311 / 188 |
| **Median** | **2471 / 191** | **2220 / 176** |

Busy **+11 %**, paint **+9 %**. Both branch medians sit inside the base's own spread (busy 1897–2781, paint
162–205), so by the rule the J1 and J2 gates used this reads no change.

**The lean, and why it reads as noise.** The branch was higher in 3 of the 4 pairs (busy +264, −192, +224,
+576; paint +22, −8, +13, +29), so this isn't a clean zero. Three things point to run-to-run drift rather
than a cost the moves added:

- **Every bucket moves together.** In each pair `TimerFire` rises and falls with busy (branch vs base: 230 vs
  198, 322 vs 363, 312 vs 239, 341 vs 289). J3 adds no timers (no `setTimeout`, `setInterval`,
  `requestAnimationFrame`, `delayedCall` or `onUpdate` in its source diff; its moves are plain GSAP tweens),
  so a real J3 cost would show in `Animation frame` alone. Instead the whole thread is slower in that window.
- **The robots' own paint is unchanged** (ablation below): 112 vs 111 ms.
- **The ablation run's stock windows agree:** 2007 / 160 branch vs 1987 / 158 base.

Crawford accepted the lean as noise (2026-10-08).

Same scene on both builds in every window: 12 robots, 3 visible, 2 stations; `#robot-layer` 859–860 elements,
L4 4, L3 16, front 58 (the J2 gate's counts; J3 draws its moves with existing elements). Top invalidation
on both: `StyleRecalc Attribute` ≈ 23–25 k (`g.robot`, `ellipse.gem__halo`).

**Ablation pass** (one run per build, `--only no-robots`; read paint only, as in the J2 gate):

| Build | stock busy / paint | no-robots busy / paint | Robots' paint |
|---|---|---|---|
| Branch | 2007 / 160 | 2110 / 48 | 112 ms |
| Base | 1987 / 158 | 2629 / 47 | 111 ms |

**The J2 gate's open lead (≈ 30 ms paint per visible robot on J2 vs 16 on J1), re-checked:** ≈ 37 ms per
visible robot on both builds here (3 visible). J3's moves add nothing measurable per robot. The J2-vs-J1 gap
is still unexplained. It's still one run per build, so it stays a lead, not a finding.

## Robot Jobs J4 — the Task 35 perf gate (2026-10-08, Phase 43)

Gate ([docs/tasks/ROBOT_JOBS_AND_STATIONS.md](tasks/ROBOT_JOBS_AND_STATIONS.md) Task 35, spec §5.4): J4 (the six-layer
scene split, the back robot row, the four depth tints, layer-aware legs and the dissolve, exits from the back row,
`BACK_HOSTS_ENABLED` on) idle busy and Paint within the noise band of J3's tip, as Tasks 26 and 30, plus the extra
compositor layers' memory and the tints. **Harness: paint misses by the J1–J3 rule; busy passes. Stopped for
Crawford.** His Pixel run is the gate. **The Pixel run passed (2026-10-08):** `89077960` from the LAN production
preview, on the Full Audio Load Budget, in landscape, for 3 minutes, "it was great" (Crawford first said "on
high" and corrected it to Full). The paint miss is accepted as J4's cost.

**Method:** as the J2 and J3 gates. Branch `feature/jobs-depth` `f6c3d16c` (Checkpoint E) on :4185
(`index-Fsw5VSqs.js`). Base: J3's tip on main, `409957d7` (the T31 docs merge this branch was cut from), built
in a throwaway `git worktree` (its `node_modules` a junction to the checkout's; `package.json` and the lockfile
are identical) and served on :4186 (`index-Cl1wGU9O.js`). Each port's served bundle filename was checked against
its build before measuring. Same pinned world: style `alpha`, `(0, 50)`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, no
overrides, encoded with `encodeSessionPayload` (version 2). `npm run perf:idle --throttle 1 --only none`,
foreground; 0 orphaned Chrome before and after. Four rounds, order alternated (T30's first-run lesson). The
harness was run from the branch against both ports; it gained a compositor-layer readout for this gate.

| Round (order) | Branch busy / paint (ms) | Base busy / paint (ms) |
|---|---|---|
| 1 (branch first) | 2950 / 209 | 2894 / 185 |
| 2 (base first) | 2855 / 216 | 2827 / 182 |
| 3 (branch first) | 2770 / 206 | 2401 / 172 |
| 4 (base first) | 2305 / 173 | 2503 / 166 |
| **Median** | **2813 / 208** | **2665 / 177** |

Busy **+5.5 %**, inside the base's own spread (2401–2894): **no change by the rule**. Paint **+17 %**: the branch
median sits **outside** the base's spread (166–185), and the branch painted more in all four pairs (+24, +34,
+34, +7 ms). **A miss by the rule the J1–J3 gates used.** In absolute terms it is about +31 ms of paint per 6 s
window, ≈ 5 ms a second, under 0.1 ms per frame at the 340 frames measured.

Same scene on both builds in every window: 12 robots, 3 visible, 2 stations, L4 4 / L3 16 / front 58 elements. On
the branch 1 of the 3 visible robots was in the back row (`#robot-back-layer` 75–76 elements), so `#robot-layer`
read 791–796 against the base's 854–860.

**Where the paint goes** (stock window, per painted node, every round):

| Node | Branch (r1–r4) | Base (r1–r4) |
|---|---|---|
| Moving robot layers, summed | 88, 91, 87, 73 (two layers: 55–69 + 18–22) | 78, 77, 73, 70 (one layer) |
| Root (`''`, 1280 × 900 clip) | 119, 124, 118, 99 | 106, 104, 98, 95 |
| Static layers (back, mid, front; tints included) | 1–3 paints, 0 ms | 1–3 paints, 0 ms |

- **The second moving layer.** `robots-back` repaints every frame while a robot moves in it, like `robots`. Moving
  one robot there didn't move its cost: the two moving layers together paint about 12 ms more than the base's
  one (medians 87.5 vs 75).
- **The root paints more too** (medians 118.5 vs 101, +17.5 ms). The cause isn't measured. The `no-robots`
  ablation below leaves a residual of the same size, so it reads as a fixed cost of the extra layers, not of
  robots.
- **The four tints cost nothing at idle.** They live in static layers, which paint 1–3 times a window at 0 ms,
  the same as the base's two gradients.

**Ablation pass** (one run per build, `--only no-robots`; read paint only, as in the J2 and J3 gates):

| Build | stock busy / paint | no-robots busy / paint | Robots' paint |
|---|---|---|---|
| Branch | 2158 / 172 | 3534 / 73 | 99 ms |
| Base | 2435 / 174 | 2789 / 55 | 119 ms |

This run's stock windows read level (172 vs 174), unlike all four rounds. With every robot hidden the branch still
paints 18 ms more (73 vs 55), which is the fixed overhead. The robots' own paint is not higher on the branch
(99 vs 119).

**Compositor layers and memory** (DevTools' estimate, width × height × 4 B per device pixel, for layers that draw
content; not the GPU's real allocation):

| Viewport | Branch | Base | Difference |
|---|---|---|---|
| Desktop 1280 × 900, DPR 1 | 29 layers (26 drawing), ≈ 32.9 MB | 27 (24), ≈ 24.6 MB | +2 layers, **+8.3 MB** |
| Phone 412 × 844, DPR 2 | 22 (19), ≈ 40.9 MB | 20 (17), ≈ 31.6 MB | +2 layers, **+9.3 MB** |

The scene's composited layers are `robots-back`, `mid`, `robots`, `front` on the branch, and `robots`, `front` on
the base (each the world view's size: 1248 × 868 CSS px on desktop, 380 × 812 on the phone). The two new ones are
`robots-back` (`will-change: transform`) and `mid`, which is static but painted above a composited layer, so
Chrome must give it its own. +8.3 MB is exactly two 1248 × 868 layers. On a Pixel 8 (DPR ≈ 2.6) the same two
layers would be ≈ +17 MB, an estimate from the phone run; it wasn't measured on the device.

**For the Pixel run:** the harness can't say whether +5 ms of paint a second and two more full-size layers matter
on the phone; the plan makes the Pixel run the gate. If it does miss, the fallback is J4 not merging and
`BACK_HOSTS_ENABLED` staying false on main. Smaller options, all unmeasured: promote `robots-back` only while a
robot is in it, or collapse `mid` into a non-composited layer by reordering what overlaps it.

## World Gem Material — the Task 19 perf gate (2026-10-09, Phase 44)

Gate ([docs/tasks/WORLD_GEM_MATERIAL.md](tasks/WORLD_GEM_MATERIAL.md) Task 19): the world gem material
(bevel ring on every mass, 1.5 px hairline on everything else solid) idle busy/Paint within each build's own
round-to-round spread of `main`, on the three pinned worlds. **Passed** on all three — `dense`, `ventfield`
and `yard`. No cut was needed.

**Method:** production builds served side by side from scratch `--outDir`s — `main` `6802c8b4` (the
branch's merge base, from a throwaway `git worktree`) on :4181 (`index-Fsw5VSqs.js`) and the branch tip
`2b405cfb` (Task 18, all six `WORLD_GEM` switches on) on :4182 (`index-1APSSzjo.js`). The served bundle
filenames were checked against each build's own before any number was taken (the D3 gate's gotcha). Worlds
are the D2 gate's coordinates — `dense` (−500, −480), `ventfield` (−500, −495), `yard` (−500, −455) —
re-verified against the real `pickDistrict` on this tree before the run, and encoded with
`encodeSessionPayload` (`attenuationStyleName: 'alpha'`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides).
`x = −500` makes the in-world hour 20 (`abs(x % 24)`), identical for both builds, so the run is a night
look; the 9 am light vector is judged by eye at Checkpoint C / Task 20, not here. `npm run perf:idle
--throttle 1 --only none --port 9301` (stock-only window, desktop 1280×900, headless); foreground, one
call at a time, orphaned headless-Chrome count 0 before and after. Three rounds per world per build, order
rotated (`dense` and `yard` M B B M M B, `ventfield` B M M B B M; M = `main`, B = branch).

### Results (6 s idle window, 1×, `--only none`)

| World | Build | main busy (ms) | Paint (ms) | Compositor::Update (ms) | Factories | Bubble/factory circles |
|---|---|---|---|---|---|---|
| dense | `main` (`6802c8b4`) | 3245 · 3349 · 3558 | 240 · 241 · 258 | 572 · 559 · 592 | 59 | 753 |
| dense | branch (`2b405cfb`) | 3302 · 3435 · 3419 | 258 · 234 · 257 | 505 · 469 · 496 | 59 | 753 |
| ventfield | `main` (`6802c8b4`) | 2534 · 2600 · 2445 | 181 · 192 · 183 | 192 · 204 · 192 | 4 | 149 |
| ventfield | branch (`2b405cfb`) | 2578 · 2589 · 2569 | 184 · 197 · 181 | 192 · 205 · 189 | 4 | 149 |
| yard | `main` (`6802c8b4`) | 3397 · 3311 · 3431 | 257 · 247 · 241 | 356 · 329 · 340 | 18 | 265 |
| yard | branch (`2b405cfb`) | 3392 · 3410 · 3456 | 241 · 237 · 247 | 283 · 273 · 280 | 18 | 265 |

(Values in run order within each build, not sorted.)

Medians (branch vs `main`): **dense** busy 3419 vs 3349 (**+2.1 %**), Paint 257 vs 241 (**+6.6 %**);
**ventfield** busy 2578 vs 2534 (**+1.7 %**), Paint 184 vs 183 (**+0.5 %**); **yard** busy 3410 vs 3397
(**+0.4 %**), Paint 241 vs 247 (**−2.4 %**). Each delta sits inside the spread `main` shows against
itself on the same world (busy 3245–3558, 2445–2600, 3311–3431; Paint 240–258, 181–192, 241–257) —
`dense` Paint's +16 ms is the nearest to the edge, and the branch's own Paint rounds (234–258) straddle
`main`'s, so it does not read as a regression. Factory and circle counts are identical build to build on
every world: the same placement, only the material changed.

- **Compositor::Update is lower on the branch on `dense` (median 496 vs 572, −13 %) and `yard` (280 vs
  340, −18 %), flat on `ventfield`.** Every branch round is below every `main` round on those two worlds,
  so it is not round noise, but the cause was not investigated (not a gate metric, and the gate is about
  regressions). Recorded as observed, not claimed as a win.
- **Ablation, one round per world, `WORLD_GEM.members`/`.others` off and `.terrain` off,** built from
  patches never committed (:4183 `index-lhM0ZxD-.js`, :4184 `index-Bmgtymba.js`), each next to a stock-branch
  control in the same session. Nothing separates from its control: `dense` branch 3395 / 255, no
  hairlines 3438 / 240, no terrain 3356 / 253 (busy ms / Paint ms); `ventfield` no terrain 2646 / 195,
  branch 2506 / 183, no hairlines 2703 / 170. So neither the hairlines nor the terrain ring carries a cost
  the idle window can resolve, which is also why no cut order had to be exercised.
- **`yard`'s ablation round was run twice because the machine drifted.** The first attempt's control read
  4354 / 292 (against 3392–3456 / 237–247 in the gate rounds) with the ablated builds at 3241 · 4185, so it
  was discarded. The re-run, controls at both ends, read branch 3733 / 259, no hairlines 3952 / 259, no
  terrain 3708 / 250, branch 4003 / 275 — the controls themselves span 3733–4003, wider than any
  ablation's gap to them. Same-session comparison is the only valid reading; absolute `yard` numbers in
  the ablation round are not comparable with the gate table.

**Verdict:** no miss to report. No lever was pulled — every switch stays on, and the cut order
(hairlines, then terrain; never factories or mass) was not exercised. The Pixel is Task 20's.

## Layout Rework — the Task 29 perf gate (2026-10-10, Phase 45)

Gate ([docs/tasks/LAYOUT_REWORK.md](tasks/LAYOUT_REWORK.md) Task 29): idle busy and Paint on the Deck and on
Fleet Params within the noise band of `main`, and a powered-off screen that runs no frame loop (no periodic
long tasks, paint count flat). **The first branch build passed the powered-on half and failed the powered-off
half**; the cause was an old bug, fixed in `153c2956`, after which both halves hold.

**Method:** production builds served side by side from scratch `--outDir`s — `main` `6802c8b4` (the branch's
merge base, from a throwaway `git worktree`) on :4181 (`index-Fsw5VSqs.js`), the branch at Checkpoint D
`9703ef90` on :4182 (`index-CSM65Zeo.js`), and the branch with the fix `153c2956` on :4184
(`index-BSzQfKQY.js`). Each port's served bundle filename was checked against its build before any number was
taken. One pinned world for all: style `alpha`, `(0, 50)`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides,
encoded with `encodeSessionPayload` (version 2); every run loaded the same 12 robots, 2 factories, 36 circles.
`npm run perf:idle --throttle 1 --only none --port 9301` (stock window, desktop 1280×900, headless), foreground,
one run at a time, orphaned headless-Chrome count 0 before and after. Three rounds per cell, order rotated
(M = `main`, B = Checkpoint D, F = fixed). Two harness additions, in this commit: `--steps "Fleet Params"`
clicks the named buttons after power-on (both builds reach the Fleet Params screen — same heading), and
`--stay-off` skips the power-on click; power-on is now a real mouse click (the branch's rocker ignores a
scripted `.click()`), and the stock line reports `Paint n` and long tasks (> 50 ms main-thread tasks).

### Results (6 s idle window, 1×, `--only none`; values in run order)

| Screen | Build | busy (ms) | Paint (ms) | Compositor::Update (ms) | Paint n |
|---|---|---|---|---|---|
| Deck | `main` | 2165 · 2025 · 2088 | 167 · 169 · 163 | 142 · 143 · 143 | 1061–1071 |
| Deck | Checkpoint D (B) | 1999 · 2037 · 2269 | 169 · 170 · 160 | 130 · 134 · 125 | 1047–1074 |
| Deck, second set | `main` | 2096 · 2171 · 1918 | 171 · 161 · 157 | 147 · 140 · 134 | 1059–1074 |
| Deck, second set | fixed (F) | 1425 · 1366 · 1426 | 146 · 145 · 149 | 125 · 124 · 130 | 1071–1080 |
| Fleet Params | `main` | 2085 · 2063 · 2236 | 172 · 168 · 176 | 241 · 232 · 244 | 1063–1067 |
| Fleet Params | Checkpoint D (B) | 2163 · 2166 · 2091 | 180 · 170 · 178 | 272 · 266 · 289 | 1066–1069 |
| Fleet Params, second set | `main` | 2088 · 2107 · 2149 | 176 · 176 · 176 | 241 · 242 · 243 | 1078–1085 |
| Fleet Params, second set | fixed (F) | 1539 · 1470 · 1550 | 156 · 161 · 165 | 280 · 272 · 298 | 1072–1075 |

**Powered on: passed.** Checkpoint D against `main` on the Deck: busy 2037 vs 2088 (median), Paint 169 vs 167;
on Fleet Params: busy 2163 vs 2085, Paint 178 vs 172 — every branch round inside the spread `main` shows against
itself (busy 2025–2236, Paint 163–176). With the fix the branch is *below* `main`: Deck busy 1425 vs 2096
(**−32 %**), Paint 146 vs 161; Fleet Params busy 1539 vs 2107 (**−27 %**), Paint 161 vs 176. The fix is not
part of the layout rework's own cost; it is a bug `main` has too (below), so the like-for-like reading of the
rework is the Checkpoint D rows.

- **Compositor::Update is higher on Fleet Params on the branch** (266–289 vs 232–244 ms, about +15–20 %; 272–298
  with the fix) and *lower* on the Deck (125–134 vs 142–147). Not a gate metric and not investigated; it is
  there in both branch builds, so it comes from the Fleet Params screen's own structure (section tabs, the
  opaque content surface), not from the halo fix. Recorded as observed.
- Fleet Params content differs by design (`main`: the accordion stack, 1 slider mounted; branch: 9 tabs, 4
  sliders), so that row compares the screens, not identical DOM.

### Powered off

| Build | busy (ms) | Paint (ms) | Paint n | long tasks |
|---|---|---|---|---|
| `main` (no world behind the power button) | 24 · 24 · 24 | 0 | 0 | 0 |
| Checkpoint D (B) | 999 · 947 · 893 | 41 · 41 · 41 | 353 · 349 · 361 | 1 · 2 · 0 |
| fixed (F) | 200 · 226 · 206 | 2 · 3 · 3 | 26 · 26 · 26 | 0 · 0 · 0 |

**Checkpoint D failed this half**: 350 paints in 6 s (one per frame) and about 1 s of main-thread time in 6 s,
on a world that is meant to be still. Attribution (the harness's invalidation list) put it on
`ellipse.gem__halo`: about 17,000 attribute style recalcs in the window, and a `MutationObserver` over 48 s
counted a steady ~2,250 gradient-stop writes and ~375 halo `rx`/`ry` writes per second, never settling.

**Cause, a bug older than this branch.** `RobotBody` builds a new `{ rx, ry, stops }` object on every render and
`useHaloMotion`'s dial-change effect listed that object as its dependency, so every re-render started a 0.5 s
tween of the halo's attributes — even when nothing had changed. The same write rate is on `main` powered on
(9,600–11,300 stop writes per 4 s, measured with the same probe). Proven before it was fixed: a scratch build with
the dependency list changed to the dial's values took the halo writes to ~0. `153c2956` keys the effect on
`rx`, `ry` and a string of the stops, with four new tests (an equal-valued fresh object and twenty equal
re-renders start no tween; ry, rx, one stop's offset or opacity alone each still do) and five mutants killed.

**Powered off after the fix: passed**, with one note. The remaining ~26 paints are not a frame loop: they are a
1 Hz tick — the moving scene layer repaints 6 times in 6 s and the meta box 6 times (the paint-by-node
table; attributed by node, the cause is presumed to be the per-second lighting fills and the clock, not
traced) — plus the rocker light's own breathing animation (46 animation style recalcs). Paint count is flat at
about 4 per second, long tasks 0. Not zero: something still ticks once a second behind the off screen.

**Verdict:** no miss remains. No cut was needed. The Pixel is not part of this gate.

## Mobile Deck Camera — the Task 11 perf gate (Phase 46)

Gate ([docs/tasks/MOBILE_DECK_CAMERA.md](tasks/MOBILE_DECK_CAMERA.md) Task 11): idle busy and Paint on
the finished branch within `main`'s round-to-round spread, at the default width and at 375 px (where
the new scroller overflows), plus one round with a camera cut forced inside the idle window.

**No "Checkpoint A" (scroller-only) baseline exists in this file** — Tasks 1–10 were built and
committed without that intermediate measurement being recorded here, so this gate compares the
*finished* branch against `main` directly; there is no scroller-alone number to isolate the scroller's
share of any delta from the camera module's.

**Method:** `main` (`26afd526`, the branch's own merge-base — a clean checkout, no other product
difference) on :4182, this branch at `7c8ea183` **plus its uncommitted Checkpoint-B ease/duration
tweak** (`power1.inOut`, 1.4 s — the working tree as it stands) on :4181. Both production builds
(`npm run build` + `vite preview`), served side by side, headless Chrome, desktop 1280×900 and
375×812, `npm run perf:idle --throttle 1 --only none`, one pinned world (`?session=`, Attenuation
Style `alpha`, locale `(0, 50)`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides, version 2 — the same
world the Phase 45 Task 29 gate used). Three rounds per build per width, foreground, one call at a
time, start order rotated each round, orphaned-Chrome count 0 before and after (checked by filtered
`Win32_Process` query). Cells read `median (min–max)`.

### Results (6 s idle window, 1×, `--only none`)

| Width | Build | busy (ms) | Paint (ms) | Compositor::Update (ms) | long tasks |
|---|---|---|---|---|---|
| 1280 | `main` | 1363 (1360–1400) | 143 (142–147) | 125 (123–126) | 0 |
| 1280 | branch | **1456** (1448–1458) | **165** (161–169) | **155** (150–161) | 0 |
| 375 | `main` | 1337 (1283–1385) | 153 (151–157) | 95 (95–98) | 0 |
| 375 | branch | **1441** (1407–1441) | **170** (167–174) | **132** (128–133) | 0 · 0 · 1 |

### Reading

**Does not cleanly pass the stated criterion.** At both widths the branch's busy/Paint/Compositor
medians sit *outside* `main`'s own round-to-round spread, not inside it: at 375 px the branch's lowest
busy round (1407 ms) is still above `main`'s highest (1385 ms) — a consistent gap, not round noise.

- **1280 px:** busy +93 ms (+6.8 %), Paint +22 ms (+15.4 %), Compositor::Update +30 ms (+24 %).
- **375 px:** busy +104 ms (+7.8 %), Paint +17 ms (+11.1 %), Compositor::Update +37 ms (+38.9 %).
- Compositor::Update carries the largest relative increase at both widths — consistent with the
  risk this phase's plan called out (a scroll container changing how the six absolutely positioned
  layers composite), though whether it is the scroller, the extra `.ocean-scene__snap` marks, or the
  `deckCamera.ts` module's own `scroll`/`pointerdown`/`wheel` listeners was not isolated (no
  scroller-only build exists to test against).
- One of three 375 px branch rounds logged 1 long task (≥ 50 ms, Chrome's own threshold, not the
  ≥ 100 ms audible-pause line); the other two rounds, and every 1280 px round on either build, logged
  none. Not treated as a pattern on a single occurrence.
- Absolute deltas are small (17–37 ms inside a 6 s window) and no round crossed the ≥ 100 ms
  audible-pause threshold on either build. Compositor layer counts at 375 px (branch, one sample):
  25 layers, 19 drawing content, 16 with an owning node, DPR 2 — the four moving-layer elements
  (`robots-back`, `mid`, `robots`, `front`) each reported at the stage's own CSS size (1444×812 at
  375 px, wider than the 375 px viewport), consistent with them still being separately composited
  rather than collapsed into the static layers; this was read from the harness's own layer summary,
  not DevTools' Layers panel directly.

**Not declared PASS.** Per the gate's own wording ("miss: stop and report") this is reported rather
than waved through: a real, repeatable, three-round-consistent regression, modest in absolute terms,
concentrated in Compositor::Update, isolated to neither the Phase-1 scroller nor the camera module
specifically. Candidate next steps if this is worth chasing: `contain: paint` or
`will-change: scroll-position` on `.world-view__scroller` (the mitigations Checkpoint A's own
write-up names), tried one at a time; or accept it as the scroller's cost, same as the Phase 45
Fleet-Params-vs-Deck Compositor::Update difference was accepted as structural. **Crawford's call.**

### Root-cause follow-up (same day): two separate causes, not one

The "isolated to neither" line above was resolved by building a third variant — `e4cba4f4` (Task 5's
tip: the scroller and snap marks, no camera module or triggers yet) — and serving it alongside `main`
and the finished branch, 3 rotated rounds at 375 px. Medians: `main` busy 1336 / Paint 155 /
Compositor 96; **scroller-only** busy 1365 / Paint 152 / Compositor 107; **full branch** busy 1407 /
Paint 171 / Compositor 131. Two distinct, additive causes, not one:

1. **The aspect-ratio stage box rasters at its full stage width, not the visible slice — on every
   viewport narrower than 16:9, including this gate's own 1280×900 default-width round.** `.ocean-scene`
   reported `scrollWidth` 1444 px at a 375 px viewport (DPR 2, ≈ 106.7 MB of compositor-layer memory)
   against `main`'s exactly-viewport-sized 343 px (≈ 34.7 MB) — a ≈ 3× bigger raster surface for the
   same four moving SVG layers, because the browser must be ready to show any scrolled position, not
   just the part on screen right now. **This also fires at 1280×900**: that viewport's own aspect ratio
   (1.42:1) is narrower than 16:9, so the stage box is 1543 px wide against a 1248 px client width — a
   1.24× area increase that lines up almost exactly with the measured +24 % Compositor::Update at that
   width. The spec's assumption 2 ("every desktop frame... is byte-identical") only holds at or above a
   true 16:9 viewport (1920×1080, 1600×900) — **1280×900 is not wide enough**, so the gate's own
   "default width" round was never a clean no-scroll control to begin with. This cause alone explains
   essentially all of the 1280 px delta and roughly a third of the 375 px delta (scroller-only vs `main`:
   +11 ms Compositor, +2 % busy, flat Paint).
2. **A real, deterministic deck-camera cut fires inside the nominally-idle 375 px trace window on this
   pinned world, and accounts for the rest.** Probed directly: `.world-view__scroller.scrollLeft` reads
   551 (the centred start, `(1444−343)/2`) immediately before the stock trace begins and **0**
   immediately after, on every run tried. Cause: the deck camera's idle gate is keyed to *user* input
   (`noteDeckUserInput`), and the headless harness never performs any — so `isDeckCameraIdle()` is
   unconditionally true for the harness's entire life, and the first robot in this world
   (Attenuation Style `alpha`, locale `(0, 50)`) to reach `'active'` inside the 8–14 s settle/window
   fires a real `cutDeckCameraTo`, landing off-screen and panning the full width. This is not a bug —
   it is the feature working as designed — but it means the "stock" window compared one build doing a
   real 1.4 s animated scroll against another doing nothing, which is not the steady-state idle
   comparison the gate intends. It explains the *remaining* 375 px gap beyond cause 1 (scroller-only
   vs full branch: +19 ms Paint, +24 ms Compositor, both beyond cause 1's share) and the one stray long
   task recorded above. The forced-cut round Task 11 asks for turned out to already be sitting inside
   the "stock" numbers, unlabelled.

**Revised reading:** the steady-state, no-cut cost of this feature is cause 1 alone — modest (+11 ms
Compositor at 375 px; the ≈ +24 % at 1280 px is explained by the harness's own too-narrow default
viewport, not a 1600×900+ phone-or-desktop frame) and the expected, spec-acknowledged price of a
scroller that must be ready to show the whole stage. Cause 2 is not a steady-state cost at all; it is
what a cut genuinely costs, and the gate's "stock" window picked it up only because this pinned
world's timing happens to line up with it. **Re-measurement options, Crawford's call:** (a) re-run
with a wider default-width comparison (≥ 1600×900) so cause 1 reads correctly as near-zero on desktop,
and a 375 px pinned world/locale chosen so no robot goes `'active'` in the window, reporting the cut's
cost as its own separately-labelled round per the original Task 11 wording; or (b) accept both causes
as read here and move on — neither is a surprise relative to the spec's own named risks.

## Deck Camera Follow — the Task 10 perf gate (Phase 46)

Gate ([docs/tasks/DECK_CAMERA_FOLLOW.md](tasks/DECK_CAMERA_FOLLOW.md) Task 10): idle busy and Paint on the
finished branch within each build's round-to-round spread, plus one continuous-tracking round, recorded not gated.

**Method:** production builds from clean `git worktree` checkouts (the working tree had unrelated uncommitted
OceanScene edits, so it was not built) — `main` `26afd526` on :4183 (`index-BqL4ymWK.js`), branch `5c791ee1`
(Checkpoint B) on :4182 (`index-D_bR8rLX.js`); each port's served bundle was checked against its build. Pinned
`?session=` world: style `alpha`, `(0, 50)`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides, version 2.
`npm run perf:idle --throttle 1 --only none`, desktop 1280×900 headless, foreground, one run at a time, order
rotated (M B B M M B), orphaned headless Chrome 0 afterwards. (:4181 was held by a stale server, so `main` ran on :4183.)

### Results (6 s idle window, 1×; values in run order)

| Build | busy (ms) | Paint (ms) | Compositor::Update (ms) | Paint n | long tasks |
|---|---|---|---|---|---|
| `main` | 1248 · 1283 · 1265 | 155 · 151 · 146 | 129 · 127 · 125 | 1080–1083 | 0 |
| branch | 1523 · 1551 · 1607 | 157 · 158 · 168 | 145 · 144 · 154 | 1083–1089 | 0 |

Medians: busy 1265 → 1551 (+286 ms, +23 %), Paint 151 → 158 (+7), Compositor::Update 127 → 145 (+18). Paint is
inside `main`'s spread plus noise; **busy is not** — the branch's lowest round (1523) is above `main`'s highest (1283).

### Continuous-tracking round (30 s window, one run each, recorded not gated)

| Build | busy (ms) | Paint (ms) | Compositor::Update (ms) | Paint n | long tasks |
|---|---|---|---|---|---|
| `main` | 5294 | 548 | 442 | 3708 | 5 |
| branch | 5203 | 501 | 481 | 3330 | 4 |

Over 30 s the branch is *not* busier than `main` (5203 vs 5294), i.e. about 1040 ms per 6 s on both. So the
6 s-window gap is not a steady per-frame cost of the follow ticker; it is something that falls inside the short
window. Not isolated — candidates are a float starting inside the 6 s window (as the Task 11 write-up of
[Mobile Deck Camera](#mobile-deck-camera--the-task-11-perf-gate-phase-46) found for a cut) and a one-off start-up
cost. One sample each; no 30 s repeat.

**Verdict: the idle-busy criterion is not met as measured** (busy +23 % outside the spread); Paint holds. Reported,
not waved through. Crawford's call: accept given the 30 s result, or isolate the in-window cost first.

## Deck Camera Follow — the Task 11 Pixel check (Phase 46)

Gate ([docs/tasks/DECK_CAMERA_FOLLOW.md](tasks/DECK_CAMERA_FOLLOW.md) Task 11): Pixel underrun A/B, `main` against the
branch, then the §5.3 walk on the phone.

**Not run as specified.** The three two-minute `?debug` listens per build were not captured, so there is **no
underrun table** for this phase and nothing to compare against the 17.2.6 spread. What exists is Crawford's
report (2026-10-11), after the Task 10 gate: the Pixel "has been running great lately" with the deck camera on
the branch. That is an observation, not a measurement; it does not show underruns within the 17.2.6 spread.

**Sign-off:** given verbally by Crawford on that basis; no constant (follow/cooldown durations, battery threshold)
was re-tuned. The Task 10 idle-busy miss (+23 % in the 6 s window, no gap over 30 s) therefore stands as accepted,
not explained. Re-measure with the `?debug` overlay if audio trouble appears on this feature.

## Job Decorations — the Task 14 perf gate (2026-10-13, Phase 52)

Gate ([docs/tasks/JOB_DECORATION.md](tasks/JOB_DECORATION.md) Task 14): the six job decorations (T6–T12, wired
into the work loop by T13) idle busy and Paint within the parent's own round-to-round spread. **Missed on both
metrics. Stopped for Crawford**, as the plan requires; no rung of the tier ladder has been applied.

**Method:** as the J2–J4 gates. Branch `feature/job-decorations` `37ed92cb` (T13) on :4191 (`index-CyC6MIHB.js`).
Parent: `various-small-fixes` `07274cf6`, the branch's merge base, built in a throwaway `git worktree` (its
`node_modules` a junction to the checkout's, removed with `rmdir` before the worktree) and served on :4192
(`index-BvvhFeaA.js`). Both from scratch `--outDir`s with `vite preview`; each port's served bundle filename was
checked against its build before measuring. Same pinned world: style `alpha`, `(0, 50)`,
`DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides, encoded with `encodeSessionPayload` (version 2).
`npm run perf:idle --throttle 1 --only none --port 9301`, foreground, one run per call; 0 orphaned Chrome before
and after. Four rounds, order alternated (branch first in rounds 1 and 3, parent first in 2 and 4).

| Round (order) | Branch busy / paint (ms) | Parent busy / paint (ms) |
|---|---|---|
| 1 (branch first) | 1962 / 179 | 1741 / 153 |
| 2 (parent first) | 1987 / 184 | 1704 / 158 |
| 3 (branch first) | 1919 / 181 | 1773 / 153 |
| 4 (parent first) | 1832 / 184 | 1753 / 155 |
| **Median** | **1941 / 183** | **1747 / 154** |

Busy **+11 %** (+194 ms), paint **+18.5 %** (+28.5 ms). The parent's own spread is narrow (busy 1704–1773, paint
153–158) and every branch run sits outside it on both metrics: the lowest branch busy (1832) is above the
parent's highest (1773), and the lowest branch paint (179) is above the parent's highest (158). Branch higher in
all four pairs (busy +221, +283, +146, +79; paint +26, +26, +28, +29). **A miss by the rule the J1–J4 gates used.**

Same scene on both builds in every window: 12 robots, 3 visible (1 in the back row), 2 stations, L4 4 / L3 16 /
front 58. `#robot-layer` read 880 elements on the branch against 824 on the parent, and `#robot-back-layer` 122
against 108: +70 elements, the live `.robot__work` groups.

**Where it goes** (medians of the four stock windows):

| Bucket | Branch | Parent | Difference |
|---|---|---|---|
| Animation frame (ms) | 840 | 668 | **+172** |
| FunctionCall (ms) | 1264 | 1096 | +168 |
| TimerFire (ms) | 176 | 183 | none |
| Paint, root `''` (ms) | 101.5 | 87.5 | +14 |
| Paint, moving robot layer (ms) | 64.5 | 53.5 | +11 |
| Paint, second moving layer (ms) | 15 | 13 | +2 |
| `Layout SVG resource invalidated` | 3650–3944 | 931–1131 | ≈ 3.5× |

- **Most of the busy increase is script, in `Animation frame`** (+172 of +194 ms): the decorations' per-frame
  attribute writes from the job timeline's `onUpdate`. Unlike the J3 gate's lean, `TimerFire` does not move with
  busy here (176 vs 183), so this is not whole-thread drift.
- **The paint increase is the two moving layers and the root** (+27 of +28.5 ms), the same shape as the J4 gate's
  miss: the decorations sit in `.robot__row`, so they repaint with the robots' moving layer every frame.
- **`Layout SVG resource invalidated` is the new top invalidation** on the branch (`line.robot__work-tick`,
  `line.robot__work-trail`): gradient and stroke attributes changing on lines that use `<defs>` resources.

**Why neither plan rung can close it.** `decorTier(robotLoad)` returns `'all'` at Full, and the ladder is unbound
(both `DECOR_TIER_*` constants are `'all'`). Rung 1 (bind the ladder) changes Standard and Light only; rung 2
(halve `INSPECT_TRAIL_SEGMENTS` and `FLUID_DROPS` on `'cheap'`) changes `'cheap'` only. The Pixel is judged at
Full, so neither rung lowers the cost measured here. Lowering Full means a different rung: fewer attribute
writes per frame (skip a write when its value is unchanged), or fewer nodes at `'all'`.

**Not measured:** one pinned world with whichever jobs the three visible robots happened to be running; no
worst case with every robot working a heavy job (Inspection or Fluid). The Pixel run (Task 15) is the real gate.

**Decision (Crawford, 2026-10-13): accept the miss and go to the Pixel run (Task 15).** The ladder stays unbound and
no write or node was cut. The Pixel run is the gate: Full Audio Load Budget with a working fleet, as the J4 gate's
was. If it shows new dropouts or visible stutter on a job, the next step is cutting Full-tier cost (skip unchanged
attribute writes, or fewer nodes at `'all'`), not the tier ladder.

**Update (2026-10-13): the Pixel run (Task 15) was not run.** Crawford could not test and asked to continue as if it
were fine. That is a decision to proceed, not a measurement: there is no underrun table for this phase and nothing
to compare against the 17.2.6 spread. Re-measure with the `?debug` overlay on the Pixel, at Full with a working
fleet, if audio trouble or stutter on a job appears.

**Update (2026-10-22): the Pixel run is covered.** Crawford's Robot Effect Sends T21 runs
([scratchy-audio-phones.md](todo/scratchy-audio-phones.md), "Robot Effect Sends (roadmap 50.7) on the Pixel — T21") ran
seven times at Full and Standard, 3–6 minutes each, on two builds that both carry the decorations (PR #551 is in the base
`2dc5b4a2`), with the fleet working; no stutter reported, "sounded fine", 3:00 counts 48–95. Task 15 is recorded as
passed in docs/tasks/JOB_DECORATION.md. Not a decorations-off A/B.

## One Day Clock — the idle-paint A/B and the fixed-hour parity check (2026-10-13, roadmap 48)

Gate ([todo/roadmap.md](todo/roadmap.md) item 48): removing the measure-based day deletes a Zustand write on
every measure (the locale's per-measure mirror) and changes no pixel, so idle busy should be neutral or better and the
lit world should be byte-identical. **Passed: no miss.**

**Method:** production builds served side by side from scratch `--outDir`s on fresh ports. Branch
`fix/unused-clock-code` `1b9744f5` on :4181 (`index-5juWcBro.js`). Base: main `11ce8a1b`, built in a throwaway
`git worktree` and served on :4182 (`index-CyC6MIHB.js`). Each port's served bundle filename was checked against its
build before measuring. Pinned world as the J1 gate (style `alpha`, `(0, 50)`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, no
overrides, `encodeSessionPayload` version 2). Both builds rendered the same scene: 12 robots, 2 factories, 36
circles, identical per-layer element counts. `npm run perf:idle --throttle 1 --only none`; three rounds, order
rotated, foreground; 0 orphaned Chrome after every call.

| Round (order) | Branch busy / paint (ms) | Base busy / paint (ms) |
|---|---|---|
| 1 (branch first) | 1924 / 189 | 1957 / 183 |
| 2 (base first) | 1833 / 181 | 1949 / 176 |
| 3 (branch first) | 1948 / 173 | 1773 / 174 |
| **Median** | **1924 / 181** | **1949 / 176** |

Busy **−1.3 %**, paint **+2.8 %**. Both are inside one build's own round-to-round spread (base busy 1773–1957,
branch 1833–1948), so the gate reads no change. One long task appeared on the branch in round 3 and none in the
other five runs.

**Fixed-hour parity (the "no visual change" check).** A screenshot cannot be exact (the robots and bubbles move),
so the static scene layers (`svg[data-scene-layer]` back, mid, front: factories with their lit windows, scenery,
terrain, water column, light shafts) were serialised as markup at ten in-world hours (0, 3, 6, 9, 10.5, 12, 15,
18, 21, 23.5) with `Date.now` frozen and stepped, locale UUIDs normalised, and hashed. The same build twice agreed
at every hour (the control), and **base and branch were byte-identical at all ten**. The markup length moves from
50,660 to 58,477 characters across the day, so the check does see lighting and window changes. The script was a
throwaway (CDP, Node's built-in `WebSocket`, never committed).

## Desktop full-screen underruns are raster-bound (2026-10-16)

**Symptom (Crawford's laptop, Chrome 155, external 2560 × 1440 monitor at 150 % scale, 60 Hz, full screen).** About 25–30 s
after power-on the sound distorts and drops out in bursts; the `?debug` HUD shows playback underruns climbing while the audio
clock stays near ×1, fps around 25 and main-thread stalls of 450–1,600 ms. First seen on `feature/palette-performance` and
suspected of the new Robot Performance features; it is not them. The case is recorded here as the baseline for backlog item 26.

### The runs that settled it (production preview build, one `?session=` world, HUD read at the time shown)

| Build | Window | fps | underruns | burst onset |
|---|---|---|---|---|
| `feature/palette-performance` | full screen | 27 | 721 by 0:44 | 0:25–0:28 |
| **`main` 2ec52f2f** | full screen | 25 | 411 by 0:47 | 0:30 |
| `main` 2ec52f2f | ~25 % of the area, 16:9 | 54 | 66 by 1:00 | 0:50 |

`main` reproduces it, so the branch is cleared; a quarter of the pixels doubles fps and cuts underruns six-fold, so the cost
scales with pixel area. A headless Chrome on another machine, same page and viewport (2000 × 1284 at 1.63×, emulated), ran
60 fps with zero underruns for 60 s, so this is measured on Crawford's machine or not at all. (Earlier headless A/Bs that
showed bursts on both builds were taken while the full test suite ran concurrently; treat them as noise.)

### `chrome://gpu`

Canvas, compositing and rasterization all hardware accelerated, GPU rasterization on (raster workers ~0). The active adapter is
**GPU0, the integrated AMD Radeon 0x1638**; the RTX 3060 (GPU1) is idle. Lenovo subsystem; a 165 Hz internal panel exists but the
external 60 Hz monitor was in use for every run.

### The trace (DevTools Performance, 31 s on `main`, full screen; summarised with `npm run perf:trace`)

| Thread | Busy | Where the time is |
|---|---|---|
| GPU process `CrGpuMain` | 94 % | `GPUTask` 16.1 s, `RunTask` 13.0 s |
| Renderer `CrRendererMain` | 62 % | `FunctionCall` 7.6 s, `Layerize` 3.3 s, `UpdateLayoutTree` 1.75 s, `Paint` 1.6 s, `PrePaint` 0.8 s, layout ~1.1 s |
| Realtime AudioWorklet thread | 97 %* | *includes the wait for the next quantum — not CPU; see render capacity below |
| Raster workers | ~0 | raster is on the GPU |

JS self-samples on the main thread: the requestAnimationFrame frame 31 %, GSAP's `Timeline.render` 26 %, `(program)` 18 %,
`deckCamera.targetFor` 4.2 %, `setAttribute` 3.1 %. Long tasks: one 312 ms at load, then 50–91 ms every few seconds.

**Render capacity on the same machine** (`npm run perf:audio`, headless, 60 s): mean 0.55, max 0.99, r(audible, capacity) 0.85.
The graph takes about half of each 10 ms quantum on average but individual quanta reach the deadline even without a full-screen
paint competing; the GPU and main-thread load steal the time those spikes need.

### What the page does per frame (`main`, read headlessly at the full-screen viewport, ~26 s after power-on)

3,110 elements, 2,913 of them SVG, 66 gradients, 1 filter; **four `will-change` layers — the four stage-sized moving `<svg>`
roots (`robots-back`, `bubbles`, `robots`, `marker`)**; about 50 elements change per frame (orbiters, work sparks, robot
bodies, bubbles); 287 GSAP-cached elements. Chrome composites an SVG root, never a `<g>` inside it, so one robot's transform
write re-rasters its whole 2560 × 1440 layer: that is the 94 %.

**The deck camera ran at full screen** (fixed 2026-10-16, `fix/deck-camera-idle-range`: dimensions cached on resize, the camera
stands down at scroll range 0). The world view has scroll range 0 there, but `registerDeckScroller` added the per-frame
tick whenever a scroller element exists; `targetFor` reads `scrollWidth` / `clientWidth` (a forced layout after GSAP's writes)
and writes `scrollLeft` every frame for a result that is always 0. The camera is a cost here, not the cause.

### Fix candidates

Ranked in backlog item 26: (1) small compositor layers per mover, a spec'd change; (2) the deck camera's idle no-op and cached
dimensions, a small test-first fix; (3) Audio Load / `?latency=playback` as headroom. Forcing Chrome onto the RTX in Windows
graphics settings did not take (the AMD stayed active); the NVIDIA Control Panel and Lenovo discrete-mode routes were not tried.

### Re-measuring (before and after, all on Crawford's machine, full screen, same `?session=` link)

1. Production build, `npx vite preview`, `?debug`, 60 s: note fps, the underrun count and the max lag.
2. DevTools Performance, record 0:20–0:40, save JSON beside the repo (not in it: `.gitignore` covers `docs/reference/Trace-*.json`
   and `perf-traces/`), then `npm run perf:trace -- <file>` and compare the thread table and the per-frame movers.
3. `npm run perf:idle` for the paint-per-node attribution, the gate this document already uses.

## Pre-change baseline for Phase 53 — Per-Mover Compositor Layers (2026-10-17)

The reference Phase 53's gate is compared against ([specs/PER_MOVER_COMPOSITOR_LAYERS.md](specs/PER_MOVER_COMPOSITOR_LAYERS.md) §5; plan [tasks/PER_MOVER_COMPOSITOR_LAYERS.md](tasks/PER_MOVER_COMPOSITOR_LAYERS.md) Task 4). **Nothing in the product was changed to take it.** It is the idle Deck on today's `main`, with the Deck camera idle no-op already merged, so the phase is judged against the world it ships into rather than against the 2026-10-16 diagnosis.

**Code measured:** `main` `4a9b3fec` (merge of PR #562), from a clean `git worktree` checkout, `npx vite build`, served by `vite preview` on :4183. Served bundle `index-CVUy7kf3.js` (checked against the build, and identical to the Task 3 proof build). Headless Chrome via `npm run perf:idle -- --throttle 1 --only none --port 9301 --url <link>`: desktop **1280 × 900** at 1×, no CPU throttle, the stock **6 s** window after the 8 s power-on settle.

**Pinned world:** one `?session=` link, Attenuation Style `alpha`, locale `(0, 50)`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides, version 2 — the world the Phase 45 and Phase 46 gates used. Built with `encodeSessionPayload` (a throwaway `vite-node` script, not committed); the link below was re-minted as a world link on 2026-10-25 (roadmap 56; the same world, decoded back field for field):

```text
http://localhost:4183/trace-atlas/?seed=alpha&x=0&y=50&s=1.bVLJbsIwEP0Xn1OUhG7KtRXqoYdWrcTZSQYyIomDbYIQ4t_7xtBgqnLJmLfMelRrVRyVpZFsKVFNlT6oIps9JGqw9EqtPNNZmidqTx7IKQEp_CtsBN_ckVBySFZEdamrTXhHisp0cHPOWJH5BnFj2loVd_l9oqz2bFQBgfb-ok7TOQBqSbvJfdMT4kf40XYuRq3ZA0tUx7DCt-F1gwCEFbee7PvHIuQ7DNAJe9DOKaCWtjvqKzSRp_gl6vNc51n2diMT0_90k6hm541FC72odGd2PdpOZ2ggDEDqqRoqD66hUSjG1oRB_A5I8JL9i92BEAaEl1PFc4TrnTdLjeYAYiKLayGZlG8qr0eC5jFRjnrHnkf2srlQJTKtNaM8BCvTYhCS57oiyTA08A3ZsY4wckx88kUvf_LOH-DtvF4LnF2mgU_UskFHV8NwU9HFzM_vwcvKZk8ww4loLDJ7hk10SdEdeUudaXErkynQyQN-Nx5TKSOXoEeyOHMWEacFfzW8wiWIwkl4W4YDRGbJNfVnzp7rSwlAW-74oo0vPctPp9MP
```

**Method:** 3 rounds of the same build, each a fresh headless Chrome, foreground, one run at a time (one call per run), nothing else running; a single build, so there is no start order to rotate. Orphaned `trace-atlas-perf` Chrome count 0 before the first round and 0 after the last (filtered `Win32_Process` query on `Name='chrome.exe'`).

### Results (6 s idle window, stock, 1×)

| Round | redrawn px²/frame | screens/frame | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|
| 1 | 5376976 | 4.67 | 1674 | 185 | 146 | 147 | 359 |
| 2 | 5332588 | 4.63 | 1694 | 161 | 136 | 138 | 360 |
| 3 | 5332588 | 4.63 | 1719 | 177 | 139 | 141 | 360 |
| Median | 5332588 | 4.63 | 1694 | 177 | 139 | 141 | 360 |
| Min–max | 5332588–5376976 | 4.63–4.67 | 1674–1719 | 161–185 | 136–146 | 138–147 | 359–360 |

Long tasks 0 in every round. **The number the phase is gated on is `screens/frame`: 4.63 (4.63–4.67).** It is tight because the repainted rectangles are fixed: every frame paints the document (one viewport, clip 1 152 000 px²) and the two moving sheets (`robots-back` and `robots`, clip 2 074 680 each), 359–360 times in the window. Busy time spreads under 3 % across the rounds and Paint ms about 14 %, so a later A/B that claims less than that on those two columns is noise; `screens/frame` is the column to read.

**Compositor-layer readout (identical in all three rounds):** `Compositor layers: 28 (24 drawing content, ≈ 37.8 MB at 4 B per device px, DPR 1; 23 with an owning node)`; the scene's named layers `robots-back`, `mid`, `robots`, `front` and `marker`, each 1465 × 824 CSS px. `Mover layers: 0` — there are no movers on `main`. This is the layer-memory figure the Task 20 gate compares the branch against.

**Stock painters (round 1, top of the attribution table):** the document 359 paints, 103 ms; the `robots` sheet 359 paints, 65 ms; the `robots-back` sheet 359 paints, 16 ms. Everything else paints a handful of times in 6 s.

**What the numbers mean — and do not.** `redrawn px²/frame` sums each `Paint` event's `clip`, so it counts the area the paint phase recorded, not raster damage, and the sheet clips are in the scene's own units (1920 × 1080 → 2 074 680 here, the scene units, not the 1465 × 824 CSS px of the layer). It is comparable only at one viewport and one device scale; do not read it as device pixels, and do not compare a phone run's `px²/frame` with this one (use `screens/frame` against each run's own viewport, and treat it as approximate while the stage scale is not 1). Whether a promoted mover's `Paint` event reads as a small patch is unproved until the first mover exists (Task 13); see the plan's "Perf gate results" in [tasks/PER_MOVER_COMPOSITOR_LAYERS.md](tasks/PER_MOVER_COMPOSITOR_LAYERS.md) for the proof on `main` (stock 4.62, movers detached 0) and the two caveats.

## Per-Mover Compositor Layers — the Task 20 gate (2026-10-17)

The A/B the phase is gated on ([specs/PER_MOVER_COMPOSITOR_LAYERS.md](specs/PER_MOVER_COMPOSITOR_LAYERS.md) §5.2; plan [tasks/PER_MOVER_COMPOSITOR_LAYERS.md](tasks/PER_MOVER_COMPOSITOR_LAYERS.md) Task 20). **Result: one of the four criteria is a MISS, and the run stopped here, not acted on.** The headline criterion, `screens/frame` ≤ 0.25 × `main`, reads 0.31 × `main`; busy time, Paint time and layer memory pass. The decision is Crawford's.

**Builds:** `main` `4a9b3fec`, from a throwaway `git worktree`, served on :4183, bundle `index-CVUy7kf3.js` (the Task 4 baseline's bundle); the branch `perf/per-mover-layers` at `6e3b07cb`, served on :4181, bundle `index-DwiFixlk.js`. Both bundles were read back from the served HTML before measuring. Both sides were measured with the **branch's** harness (`scripts/perf/idle-paint.mjs` at `6e3b07cb`, which reads either markup), so the metric is one function on both. Headless Chrome via `npm run perf:idle -- --throttle 1 --only none --port 9301 --url <link>`: **1280 × 900** at 1×, no CPU throttle, the stock **6 s** window after the 8 s power-on settle. The pinned world is the baseline's `?session=` link above (style `alpha`, `(0, 50)`, defaults), with the port changed per side.

**Method:** three rounds alternated, main then branch each round (main, branch, main, branch, main, branch), each a fresh headless Chrome, foreground, one run at a time. Orphaned `trace-atlas-perf` Chrome count 0 before the first run and 0 after the last.

**The metric changed, so the baseline's 4.63 is not the comparison.** The Task 4 baseline summed unbounded `Paint` clips (a sheet read in scene units; a promoted mover reads ±8 388 608, which gave ~4e8 `screens/frame` with movers on the page, plan "Task 16"). Commit `6e3b07cb` clamps each `Paint` to the area of the layer it drew into (LayerTree, by backend node, with the stage's scale applied to layers inside it, since LayerTree reports bounds before it). A node with no layer of its own is capped at one viewport and counted in `unresolved Paints`. `main` was therefore re-measured with the same harness, and reads **3.10**, not 4.63: its two moving sheets are 1465 × 824 layers (1.05 screens each), not the 1920 × 1080 scene-unit clips (1.8 each).

### Results (6 s idle window, stock, 1×)

#### main (`index-CVUy7kf3.js`)

| Round | redrawn px²/frame | screens/frame | unresolved Paints | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| 1 | 3562980 | 3.09 | 3 | 2732 | 237 | 212 | 214 | 349 |
| 2 | 3579797 | 3.11 | 3 | 2749 | 246 | 231 | 233 | 352 |
| 3 | 3569868 | 3.10 | 3 | 2791 | 278 | 247 | 249 | 352 |
| Median | 3569868 | 3.10 | 3 | 2749 | 246 | 231 | 233 | 352 |
| Min–max | 3562980–3579797 | 3.09–3.11 | 3–3 | 2732–2791 | 237–278 | 212–247 | 214–249 | 349–352 |

#### branch (`index-DwiFixlk.js`)

| Round | redrawn px²/frame | screens/frame | unresolved Paints | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| 1 | 1092027 | 0.95 | 47 | 2284 | 134 | 240 | 242 | 356 |
| 2 | 1090930 | 0.95 | 47 | 2424 | 128 | 242 | 244 | 352 |
| 3 | 1038786 | 0.90 | 36 | 2295 | 127 | 237 | 239 | 348 |
| Median | 1090930 | 0.95 | 47 | 2295 | 128 | 240 | 242 | 352 |
| Min–max | 1038786–1092027 | 0.90–0.95 | 36–47 | 2284–2424 | 127–134 | 237–242 | 239–244 | 348–356 |

### The gate

| Gate criterion | main | branch | Limit | Result |
|---|---|---|---|---|
| screens/frame (median) | 3.10 | 0.95 | ≤ 0.25 × main = 0.775 | MISS: 0.31 × main |
| busy (median ms) | 2749 (2732–2791) | 2295 | within main's spread | PASS: below it |
| Paint (median ms) | 246 (237–278) | 128 | within main's spread | PASS: below it |
| Layer memory | 37.8 MB | 24.2 MB | ≤ main | PASS |

Compositor::Update 231 ms → 240 ms and Layerize 233 ms → 242 ms (medians, both inside each other's spreads, so no change) are recorded, not gated (spec §5.2), as are the layer counts: 28 → 30–31 compositor layers, 0 → 4 mover layers (≈ 0.1 MB in all).

**Compositor-layer readouts.** Main (all three rounds): `Compositor layers: 28 (24 drawing content, ≈ 37.8 MB at 4 B per device px, DPR 1, stage scale 1.000; 23 with an owning node)`; the scene's five named layers (`robots-back`, `mid`, `robots`, `front`, `marker`) are each 1465 × 824 CSS px; `Mover layers: 0`. Branch: `Compositor layers: 30` or `31` (27–28 drawing content, ≈ 24.2–24.3 MB, stage scale 0.763); `mid` and the empty `dissolve` div are 1920 × 1080 layers before the scale, and three robot movers and the marker are 90–145 × 80–173; `Mover layers: 4`. No bubble strip appears among the drawing layers in this window, so spec §7 Q3's question (do fifty always-promoted strips cost more than the sheet they replace?) is not tested by it; the layer-memory line passes on the sheets' and robots' account.

### Where the missing 0.20 screens/frame is

**Stock painters (round 1, top of the attribution table).** Main: the document 345 paints / 131 ms; the `robots` sheet 345 / 84 ms; the `robots-back` sheet 345 / 20 ms; every other node paints a handful of times. Branch: the document 279 / 78 ms; the three robot movers 227, 179, 219 paints at 4 657–14 199 px² (25, 13, 13 ms); the static sheets 23, 21, 3 and 4 paints; everything else a handful.

The area added up per frame, branch round 1: the document ≈ 0.78 screens, the three movers ≈ 0.015, the static sheets ≈ 0.14 (47 of their paints are `unresolved`, capped at a viewport each, which understates them by under 0.01 screens, since a sheet's true area is 1.207 M px² against the 1.152 M cap). Main: the document ≈ 0.99, the two moving sheets ≈ 2.07. **The work the phase set out to remove fell from ≈ 2.07 screens/frame to ≈ 0.16, a drop of over 90 %.** The miss is the document layer, which the phase does not touch: it repaints a full viewport on 279–345 frames of ~350 on both builds, and on the branch it alone (≈ 0.78 in round 1) already equals the limit (0.775). With nothing else drawn at all, the branch would still sit on the line.

**Not the `rocker-light` pulse.** Task 16 suspected it. `--only no-rocker-pulse` on `main` leaves `screens/frame` unchanged (stock 3.12, ablated 3.14), so the document repaint is not the pulse. The branch's own ablated window reads 3.58 and cannot be used: every window after the first in a session is busier on both builds (main 2672 → 4247 ms busy), and the layer map was read before the ablation. The cause of the document repaint is unidentified.

**The sheets are not the ripple.** Spec §7 Q2's fallback (per-station sheets) is for a ripple-driven paint miss; the static sheets paint 3–23 times in 6 s, so this miss is not that.

**Stopped here, not acted on** (plan Task 20: "Do not act on a miss"). The options for Crawford: (1) accept the criterion as written against the document layer, recording the phase as met on the work it targeted (≈ 2.07 → ≈ 0.16 screens/frame) with the document repaint filed as its own item; (2) find and fix the document repaint first, then re-run this gate unchanged; (3) amend the criterion to exclude the document layer from both sides. Option 3 changes the gate after seeing the result, so it should be a stated decision, not a quiet one. The Pixel listen (Task 21) is Crawford's either way and has not been run.

Plan: [tasks/PER_MOVER_COMPOSITOR_LAYERS.md](tasks/PER_MOVER_COMPOSITOR_LAYERS.md) "Task 20 — the gate".

## Per-Mover Compositor Layers — the Task 21 Pixel listen (2026-10-17)

The phone half of the phase's gates ([specs/PER_MOVER_COMPOSITOR_LAYERS.md](specs/PER_MOVER_COMPOSITOR_LAYERS.md) §5.2 item 4; plan [tasks/PER_MOVER_COMPOSITOR_LAYERS.md](tasks/PER_MOVER_COMPOSITOR_LAYERS.md) Task 21). Crawford ran it by hand on the Pixel after the Task 20 miss and reported it back in his own words; this section records what he reported and nothing he did not.

**Conditions as planned:** the Pixel, landscape, the LAN production preview of `perf/per-mover-layers` (tip `a04d4a0c` when the result was reported), the pinned `?session=` link of the Task 20 gate, Full Audio Load, the `?debug` overlay open. Crawford's report stated only the audio setting, the length and the counts, so the link, the orientation and the overlay are the plan's conditions, not something he restated.

| What | Result |
|---|---|
| Audio setting | Full Audio Load |
| Length | over five minutes (the spec asked for three) |
| Playback underruns (overlay count) | about 12, a dozen, in the whole listen |
| Distortion | no distortion, for the whole length |
| Clipping | no clipping; no underrun caused any |
| Crawford's verdict | **good to go** |

**What this does not establish.** No `main` listen was taken in the same session, so there is no `main` count and no run-to-run spread to compare the 12 against. The plan's criterion "the branch's count is not above the recorded run-to-run spread" is therefore open, not met: this is a clean listen of the branch on its own terms (a dozen underruns over more than five minutes, none audible as a fault), not an A/B. The length also differs from the spec's three minutes, so the count is not comparable with a three-minute figure from earlier phases without scaling.

**The Task 20 miss stands, unchanged.** `screens/frame` 0.31 × `main` against the 0.25 limit is still recorded as a MISS above, and the document-layer repaint is still unidentified. Crawford went on to the docs phase after this listen; that is a decision to proceed, and this section does not rewrite the gate into a pass or amend its criterion.

Plan: [tasks/PER_MOVER_COMPOSITOR_LAYERS.md](tasks/PER_MOVER_COMPOSITOR_LAYERS.md) "Task 21".

## Per-Mover Compositor Layers — review follow-up R5: bubble strips drawing (2026-10-17)

The measurement spec §7 Q3 left open ([specs/PER_MOVER_COMPOSITOR_LAYERS.md](specs/PER_MOVER_COMPOSITOR_LAYERS.md); plan [tasks/PER_MOVER_REVIEW_FOLLOWUPS.md](tasks/PER_MOVER_REVIEW_FOLLOWUPS.md) R5): do the always-promoted bubble strips cost more than the one sheet they replaced, while bubbles are actually drawing? **Result: one of the three criteria is a MISS, and the run stopped here, not acted on.** Layer memory passes (29.7 MB against 42.4 MB) and Paint passes; busy time reads 10330 ms against `main`'s 9514–9572 ms. Compositor::Update and Layerize, recorded and not gated, are 18 % higher on the branch. The decision is Crawford's (spec Q3: the reaction to a miss on the bubbles' account is his bubble redesign, not a promote-only-mid-burst workaround).

### The Task 20 world could not have tested this

The Task 20 gate's pinned world (style `alpha`, locale `(0, 50)`) has **0 bubble circles**: the harness's `Scene:` line reads "2 factories, 0 bubble circles" there, so no strip existed to draw, and the Task 20 note that "no bubble strip appears among the drawing layers" was a statement about that world, not about the strips. This measurement therefore uses another world. Nine locales were tried on the branch build (the world follows the locale `(x, y)`; the style made no difference in the cases tried); the busiest found, and the one used, is `alpha` at `(-100, -100)`: 12 robots, **18 factories, 135 bubble circles, 18 bubble streams**. The others read 0 to 18 streams (`(0, 50)` 0, `(200, -30)` 0, `(50, -200)` 4, `(100, 100)` 8, `(-150, 90)` 13, `(0, 0)` 13, `(0, 300)` 13, `(300, 300)` 18). The spec's "fifty-odd strips" was an estimate; **18 is the most any tried world has**, so the always-promoted cost is bounded by that here, and a denser world may exist that was not found.

### Method

**Builds:** `main` `4a9b3fec`, from a throwaway `git worktree`, built with `npx vite build`, served by `vite preview` on :4183, bundle `index-CVUy7kf3.js` (the Task 20 and Task 4 bundle). The branch `perf/per-mover-layers`, built at `c1414fbe` (its `src/` is identical to `4d754d94`, the last commit that touched it), served on :4181, bundle `index-Dil0Vyn4.js`. Both bundles were read back from the served HTML. Both sides were measured with the **branch's** harness (`scripts/perf/idle-paint.mjs` at `f4d20775`).

**World link** (port changed per side; re-minted from its `?session=` form on 2026-10-25, roadmap 56):

```text
http://localhost:4183/trace-atlas/?seed=alpha&x=-100&y=-100&s=1.bVLJbsIwEP0Xn1OUhG7KtRXqoYdWrcTZSQYyIomDbYIQ4t_7xtBgqnLJmLfMelRrVRyVpZFsKVFNlT6oIps9JGqw9EqtPNNZmidqTx7IKQEp_CtsBN_ckVBySFZEdamrTXhHisp0cHPOWJH5BnFj2loVd_l9oqz2bFQBgfb-ok7TOQBqSbvJfdMT4kf40XYuRq3ZA0tUx7DCt-F1gwCEFbee7PvHIuQ7DNAJe9DOKaCWtjvqKzSRp_gl6vNc51n2diMT0_90k6hm541FC72odGd2PdpOZ2ggDEDqqRoqD66hUSjG1oRB_A5I8JL9i92BEAaEl1PFc4TrnTdLjeYAYiKLayGZlG8qr0eC5jFRjnrHnkf2srlQJTKtNaM8BCvTYhCS57oiyTA08A3ZsY4wckx88kUvf_LOH-DtvF4LnF2mgU_UskFHV8NwU9HFzM_vwcvKZk8ww4loLDJ7hk10SdEdeUudaXErkynQyQN-Nx5TKSOXoEeyOHMWEacFfzW8wiWIwkl4W4YDRGbJNfVnzp7rSwlAW-74oo0vPctPp9MP
```

It is the Task 20 link with only the locale changed (the same style and `DEFAULT_GLOBAL_AUDIO_SETTINGS`, built by decoding that link and rewriting `c`).

**Command** (each side, from the branch's checkout):

```text
npm run perf:idle -- --throttle 1 --only none --window 30000 --bubbles 5 --expect-dimmed no --port 9301 --url <link>
```

Headless Chrome at **1280 × 900**, 1×, no CPU throttle, the 8 s power-on settle, then a **30 s** window (a burst starts somewhere about every 4 s, so the window holds several; the stock 6 s window can hold none). `--bubbles 5` waits until at least 5 bubble circles are visible before the layers are read (the wait returned at once every time: 15–16 were in flight), and `--expect-dimmed no` rejects a run whose world is dimmed, before and after the windows (none was; the Deck is undimmed). Three rounds alternated, main then branch each round (main, branch, main, branch, main, branch), each a fresh headless Chrome, foreground, one run at a time. Orphaned `trace-atlas-perf` Chrome count 0 before the first run and 0 after the last (after the diagnostic runs below as well).

**A harness finding that changed the method.** The first 30 s runs reported **325 frames** (about 11 a second) and a busy time of a 6 s window. The trace held only the first ~5.8 s: the default trace buffer fills in about 6 s with the invalidation tracking category on, and the trace then stops. The harness now drops that category for any window over 6 s (`traceCategories` in `scripts/perf/world-state-lib.mjs`) and prints a warning when a window holds under 30 frames a second; those runs held 1799–1801 frames over a 30.0 s span. The 6 s stock window keeps every category, so earlier baselines are unchanged. **A long window prints no invalidation table, and its busy time is not comparable with a 6 s window's** (the tracing overhead differs): this section compares only with itself. The two truncated runs were discarded.

### Results (30 s window, stock, 1×)

#### main (`index-CVUy7kf3.js`)

| Round | redrawn px²/frame | screens/frame | unresolved Paints | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| 1 | 3661137 | 3.18 | 30 | 9572 | 1567 | 1938 | 1945 | 1801 |
| 2 | 3656556 | 3.17 | 30 | 9566 | 1575 | 1940 | 1948 | 1800 |
| 3 | 3657827 | 3.18 | 28 | 9514 | 1578 | 1964 | 1972 | 1801 |
| Median | 3657827 | 3.18 | 30 | 9566 | 1575 | 1940 | 1948 | 1801 |
| Min–max | 3656556–3661137 | 3.17–3.18 | 28–30 | 9514–9572 | 1567–1578 | 1938–1964 | 1945–1972 | 1800–1801 |

#### branch (`index-Dil0Vyn4.js`)

| Round | redrawn px²/frame | screens/frame | unresolved Paints | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| 1 | 4421260 | 3.84 | 4950 | 10410 | 1571 | 2309 | 2316 | 1801 |
| 2 | 4410964 | 3.83 | 4934 | 10330 | 1559 | 2283 | 2289 | 1800 |
| 3 | 4403028 | 3.82 | 4942 | 10251 | 1557 | 2287 | 2294 | 1800 |
| Median | 4410964 | 3.83 | 4942 | 10330 | 1559 | 2287 | 2294 | 1800 |
| Min–max | 4403028–4421260 | 3.82–3.84 | 4934–4950 | 10251–10410 | 1557–1571 | 2283–2309 | 2289–2316 | 1800–1801 |

Long tasks 0 in every round, both sides.

### The gate

| Gate criterion | main | branch | Limit | Result |
|---|---|---|---|---|
| busy (median ms) | 9566 (9514–9572) | 10330 | within main's spread | MISS: 758 ms above the top of main's spread (9572), +8 % on its median |
| Paint (median ms) | 1575 (1567–1578) | 1559 | within main's spread | PASS: below it |
| Layer memory | 42.4 MB | 29.7 MB | ≤ main | PASS |

Compositor::Update 1940 → 2287 ms (+347, +18 %) and Layerize 1948 → 2294 ms (+346, +18 %) are outside each other's spreads, and are recorded, not gated (as in Task 20). They are about half of the busy gap (758 ms); the rest is not located.

**Compositor-layer readouts** (identical in all three rounds of a side). Main: `Compositor layers: 28 (25 drawing content, ≈ 42.4 MB at 4 B per device px, DPR 1, stage scale 1.000; 24 with an owning node)`; `Mover layers: 0`; `Bubble layers: 1 (1 drawing now, ≈ 4.60 MB; ≈ 4.60 MB if every one drew at once)`, which is the one 1465 × 824 bubbles sheet. Branch: `Compositor layers: 51 (48 drawing content, ≈ 29.7 MB at 4 B per device px, DPR 1, stage scale 0.763; 47 with an owning node)`; `Mover layers: 23, ≈ 1.0 MB`; `Bubble layers: 18 (18 drawing now, ≈ 0.85 MB; ≈ 0.85 MB if every one drew at once)`, the 18 strips (the 23 movers are those 18, four robots and the marker). At the read 15–16 circles were visible, in a few strips at most, yet all 18 strips were drawing layers, so a strip is a drawing layer without a visible bubble in it (its circles are transparent, not removed), and "if every one drew at once" equals "drawing now". **The memory half of Q3 is answered:** 18 strips hold ≈ 0.85 MB where the one sheet held ≈ 4.60 MB. The layers are read once, before the window.

### What the Paint column does not see

The bubbles are moving: a throwaway probe on the `main` build sampled the circles' computed opacity every 500 ms for 45 s, and 0–23 of the 135 were visible at any moment, fading in and out. Yet the paint events for the bubble layers total **43, 42 and 44 on `main` (one sheet)** and **43, 44 and 44 on the branch (18 strips)**, in a window of about 1800 frames; the `Bubble paints` line of the harness gives them, and they are the same on both builds. So bubble motion is **not visible in the `Paint` column or in `screens/frame` on either build**. Hypothesis, not proved: a transform or opacity change on an SVG child updates a property-tree node and re-layerizes without re-recording the display list, so it lands in Compositor::Update and Layerize and not in `Paint`. If that holds, those two columns and busy time are the ones that can see the bubbles, which is why the miss is on them.

`screens/frame` (3.18 on main, 3.83 on the branch) is recorded and **not read**. The layer map is read once before the window, and in 30 s new movers appear (dissolve copies, among them) that have no layer in it, so each of their paints is capped at one viewport: the branch's 4942 unresolved Paints account for at most 4942 ÷ 1800 = 2.75 of its 3.83 screens/frame. It is not comparable with Task 20's 6 s figure.

### Diagnostic (one run each, indicative, not gated): detach the bubbles

`--only detach-bubbles` traces the stock window, then removes every bubble circle and traces again, in one session. Later windows in a session run busier on both builds (Task 20), so the busy column is confounded; Compositor::Update is the column read.

| Side | stock Compositor::Update (ms) | after detach (ms) | change | busy before → after (ms) |
|---|---|---|---|---|
| main | 1975 | 1770 | −205 | 9721 → 10545 |
| branch | 2303 | 2102 | −201 | 10281 → 10917 |

Removing the circles takes about 200 ms off Compositor::Update on both builds, so the bubbles' motion costs the same on each. The branch's extra ≈ 330 ms is still there afterwards (2102 against 1770), so **it is not the circles' motion**. This cannot say whether it is the 18 strip layers themselves: the detach removes the circles and leaves the strip `div`s in the page, and whether they stay layers was not read. The branch's other movers are also in the gap. (The branch's `redrawn` after the detach, 7.43 screens/frame, is an artefact of the stale layer map and is ignored.)

### Stopped here, not acted on

The criterion as written is a MISS (busy). Options for Crawford: (1) accept it: +8 % busy and +18 % Compositor::Update on a 18-stream world over a 30 s window, against 0.85 MB of layers instead of 4.60 MB; (2) the bubble redesign spec §7 Q3 names (fewer layers, for example one stream per district); (3) first separate how much of the gap is the strips, for example with a sticky ablation that removes the strip `div`s themselves (not run), since the diagnostic above does not attribute it to them. Nothing was changed in the product, and the Task 20 result above stands as recorded.

Plan: [tasks/PER_MOVER_REVIEW_FOLLOWUPS.md](tasks/PER_MOVER_REVIEW_FOLLOWUPS.md) "R5: Bubble strips with bubbles actually drawing".

## Per-Mover Compositor Layers — review follow-up R6: the dimmed world (2026-10-17)

The state the app is in whenever a branch is open, which the Task 20 gate never ran in ([specs/PER_MOVER_COMPOSITOR_LAYERS.md](specs/PER_MOVER_COMPOSITOR_LAYERS.md); plan [tasks/PER_MOVER_REVIEW_FOLLOWUPS.md](tasks/PER_MOVER_REVIEW_FOLLOWUPS.md) R6). With a hub tile open, `WorldView.tsx` sets `data-dimmed` on `.world-view` and `WorldView.css` puts `filter: brightness(0.42)` on every `.mover` (and `brightness(0.42) blur(2px)` on each sheet), so each robot, bubble strip and the marker becomes a filtered surface. **Result: all three gated criteria PASS.** With Fleet Params open the branch is below `main`'s whole spread on busy time and Paint time, and at 0.61 × `main` on `screens/frame`. Compositor::Update is 9 % higher on the branch, recorded and not gated.

### Method

**Builds:** the same two as the R5 section above: `main` `4a9b3fec` on :4183, bundle `index-CVUy7kf3.js`; the branch `perf/per-mover-layers`, built at `c1414fbe` (its `src/` is identical to `4d754d94`), on :4181, bundle `index-Dil0Vyn4.js`. Both measured with the branch's harness (`scripts/perf/idle-paint.mjs` at `f4d20775`, plus the one-line message fix committed with this section).

**World:** the R5 world (`alpha` at `(-100, -100)`, 12 robots, 18 factories, 135 bubble circles; link in the R5 section), chosen over the Task 20 world because the dim is per mover and that world has no bubble strips to filter. **Command** (each side, from the branch's checkout):

```text
npm run perf:idle -- --throttle 1 --only none --steps "Fleet Params" --expect-dimmed yes --port 9301 --url <link>
```

Headless Chrome at **1280 × 900**, 1×, no CPU throttle, the stock **6 s** window (every category traced, as in Task 20) after the 8 s power-on settle and the click that opens Fleet Params. `--steps` opens the tile; `--expect-dimmed yes` makes the harness read `data-dimmed` on `.world-view` after the click **and again after the windows** and throw if either is not dimmed. Three rounds alternated, main then branch each round (main, branch, main, branch, main, branch), each a fresh headless Chrome, foreground, one run at a time. Orphaned `trace-atlas-perf` Chrome count 0 before the first run and 0 after the last.

**Every run was dimmed and on the same screen.** Each of the six logs prints `World: dimmed` before and after its window, and the harness's like-for-like line is identical on both sides: `Screen after steps: {"tabs":11,"sliders":4,"cabinetBoxes":58,"heading":"Fleet Params — your key to mesh-wide performance."}`. The rejection was also tried live on the branch build, in both directions: the Deck (undimmed) asked for a dimmed world ended with `Run rejected: expected a dimmed world, read "undimmed".` and exit 1; Fleet Params asked for an undimmed one ended with `Run rejected: expected an undimmed world, read "dimmed".` and exit 1.

### Results (6 s window, stock, 1×, Fleet Params open, world dimmed)

#### main (`index-CVUy7kf3.js`)

| Round | redrawn px²/frame | screens/frame | unresolved Paints | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| 1 | 3665259 | 3.18 | 5 | 3717 | 262 | 511 | 513 | 315 |
| 2 | 3683133 | 3.20 | 6 | 3651 | 259 | 520 | 521 | 318 |
| 3 | 3672251 | 3.19 | 6 | 3654 | 258 | 521 | 522 | 317 |
| Median | 3672251 | 3.19 | 6 | 3654 | 259 | 520 | 521 | 317 |
| Min–max | 3665259–3683133 | 3.18–3.20 | 5–6 | 3651–3717 | 258–262 | 511–521 | 513–522 | 315–318 |

#### branch (`index-Dil0Vyn4.js`)

| Round | redrawn px²/frame | screens/frame | unresolved Paints | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| 1 | 2255700 | 1.96 | 270 | 3555 | 221 | 567 | 568 | 326 |
| 2 | 2222130 | 1.93 | 259 | 3607 | 221 | 558 | 560 | 326 |
| 3 | 2146974 | 1.86 | 250 | 3527 | 218 | 567 | 569 | 328 |
| Median | 2222130 | 1.93 | 259 | 3555 | 221 | 567 | 568 | 326 |
| Min–max | 2146974–2255700 | 1.86–1.96 | 250–270 | 3527–3607 | 218–221 | 558–567 | 560–569 | 326–328 |

Long tasks 2–4 per window on both sides (main 4, 2, 3; branch 3, 4, 4); not gated.

### The gate

The criterion is the task's own: the branch's median not above `main`'s dimmed median.

| Gate criterion | main | branch | Limit | Result |
|---|---|---|---|---|
| busy (median ms) | 3654 (3651–3717) | 3555 | ≤ main's median | PASS: below main's whole spread (its minimum is 3651) |
| Paint (median ms) | 259 (258–262) | 221 | ≤ main's median | PASS: below main's whole spread (its minimum is 258) |
| screens/frame (median) | 3.19 (3.18–3.20) | 1.93 | ≤ main's median | PASS: 0.61 × main |

Compositor::Update 520 → 567 ms (+47, +9 %) and Layerize 521 → 568 ms are outside each other's spreads (511–521 and 558–567), and are recorded, not gated (as in Task 20). **Layers:** main `Compositor layers: 39 (36 drawing content, ≈ 51.5 MB at 4 B per device px, DPR 1, stage scale 1.000; 34 with an owning node)`, `Mover layers: 0`, `Bubble layers: 1 (1 drawing now, ≈ 4.60 MB; ≈ 4.60 MB if every one drew at once)`; branch `Compositor layers: 66` or `67` (`63`–`64 drawing content, ≈ 39.3–40.1 MB`, stage scale 0.763), `Mover layers: 24, ≈ 1.1 MB`, `Bubble layers: 18 (18 drawing now, ≈ 0.85 MB; ≈ 0.85 MB if every one drew at once)`. Layer memory is not gated here, and is lower on the branch. The dimmed Fleet Params runs have more layers than the undimmed Deck runs of the R5 section (main 39 against 28, branch 66–67 against 51), but that run was on a different screen as well, so the dim is not isolated by it.

**Reading `screens/frame` with care.** The branch's figure includes 250–270 unresolved Paints per window (nodes with no layer when the layer map was read, each capped at one viewport): at most 270 ÷ 326 = 0.83 of its 1.86–1.96 screens/frame. The ratio is therefore an upper bound on the branch's, and it passes with that bound in. `main` has 5–6 unresolved.

**Not tested, by design.** This is a cost measurement, not a look test: whether the dimmed world *looks* the same (the `blur(2px)` now sitting inside the scaled stage, so its effective radius is 2 × the stage scale; the plan's note 4 under "Open before merge") is Crawford's at Checkpoint B. One world, one tile (Fleet Params, 58 cabinet boxes), one viewport.

No miss, so nothing is stopped here. Had a gate missed, any fix would change how the dimmed world is produced, which is a look decision for Crawford and a short amendment to the spec, not a quiet change.

Plan: [tasks/PER_MOVER_REVIEW_FOLLOWUPS.md](tasks/PER_MOVER_REVIEW_FOLLOWUPS.md) "R6: The dimmed world (`data-dimmed`)".

## Per-Mover Compositor Layers — the Task 20 gate, re-run with the frame wrappers left out (2026-10-17)

The Task 20 gate above, run again unchanged after the "document repaint" it missed on was found ([tasks/DOCUMENT_REPAINT.md](tasks/DOCUMENT_REPAINT.md), Crawford's option 2: find and fix it, then re-run). **Result: all four criteria PASS.** `screens/frame` reads 0.08 × `main` against the 0.25 limit; busy time, Paint time and layer memory are below `main`'s. The original section is left as it was written; this one is the re-run.

**What was found.** There is no document repaint. The unnamed painter in the Task 20 attribution table ("the document", 279–345 paints of ~350 frames, a full viewport each) is the `Paint` trace event Chrome opens on `#document` (`layerId` 0, cull rect = the viewport) once per frame that paints anything: the whole-frame paint pass, inside whose span the per-layer `Paint` events sit. On both builds every one of 179 such events in a 3 s probe wrapped other `Paint` events and none stood alone, and the document's own compositor layer (layer 9, 1280 × 900) rastered on one frame in 179 (`RasterTask` events by `tileData.layerId`). The harness charged that wrapper one viewport per frame, because its clip is exactly the viewport and it has no layer of its own; that charge was ≈ 0.99 screens/frame on `main` and ≈ 0.77 on the branch, the whole of the miss. The spec had raised this doubt before the baseline (§4 assumption 6, Task 2 spike: "a `#document` paint with a clip of the whole page") and let the metric stand because `main` read near the predicted four screens; the agreement was a coincidence of the two sheets plus the wrapper. No ablation could name it: hiding the robots, factories, stations, gradients or transitions left the paint count untouched (`static-scene` 1054 of stock 1088 paints), and only `no-scene`, which leaves nothing to paint, removed it.

**The metric changed, so the Task 20 numbers are not the comparison.** Commit `998207a5` (`scripts/perf/paint-area-lib.mjs` `framePaintWrappers`): a `#document` `Paint` whose span contains another complete `Paint` is a frame wrapper and is left out of the sum and of the per-node table; one with nothing nested still counts, so a genuine root-layer repaint is not hidden. Each `Paint` is still **clamped** to the area of the compositor layer it drew into, as before. Every row now also reports `frame wrappers` (the count left out): 355–357 on `main`, 277–280 on the branch, in the rounds below. TDD: 11 tests, 4 mutations killed; `scripts/perf/scene-markup-lib.test.mjs` pins the harness. No product file changed.

**Builds:** `main` `4a9b3fec`, from a throwaway `git worktree`, served on :4183, bundle `index-CVUy7kf3.js` (the Task 20 and Task 4 bundle, rebuilt and read back from the served HTML); the branch `fix/document-repaint` at `6e61e0ee` (= `perf/per-mover-layers` `570b279b` plus the harness fix and this investigation's docs; `src/` unchanged since `4d754d94`), served on :4181, bundle `index-Dil0Vyn4.js`. Both sides measured with the **branch's** harness at `998207a5`. Headless Chrome via `npm run perf:idle -- --throttle 1 --only none --port 9301 --url <link>`: **1280 × 900** at 1×, no CPU throttle, the stock **6 s** window after the 8 s power-on settle. The pinned world is the baseline's `?session=` link (style `alpha`, `(0, 50)`, defaults), with the port changed per side.

**Method:** three rounds alternated, main then branch each round (main, branch, main, branch, main, branch), each a fresh headless Chrome, foreground, one run at a time, in one session. Orphaned `trace-atlas-perf` Chrome count 0 before the first run and 0 after the last. The same session first re-ran the Task 20 harness as it was (commit `8fb301e1`) on both builds and reproduced its numbers (main 3.09 / 3.09 / 3.10, branch 0.95 / 0.91 / 0.91 screens/frame), so the drop below is the metric change and nothing else.

### Results (6 s idle window, stock, 1×)

#### main (`index-CVUy7kf3.js`)

| Round | redrawn px²/frame | screens/frame | unresolved Paints | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| 1 | 2417168 | 2.10 | 3 | 1905 | 172 | 153 | 155 | 361 |
| 2 | 2437359 | 2.12 | 3 | 1801 | 172 | 154 | 156 | 359 |
| 3 | 2410480 | 2.09 | 3 | 1845 | 173 | 158 | 159 | 361 |
| Median | 2417168 | 2.10 | 3 | 1845 | 172 | 154 | 156 | 361 |
| Min–max | 2410480–2437359 | 2.09–2.12 | 3–3 | 1801–1905 | 172–173 | 153–158 | 155–159 | 359–361 |

#### branch (`index-Dil0Vyn4.js`)

| Round | redrawn px²/frame | screens/frame | unresolved Paints | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| 1 | 194502 | 0.17 | 49 | 1522 | 76 | 158 | 159 | 360 |
| 2 | 182225 | 0.16 | 45 | 1500 | 78 | 160 | 161 | 359 |
| 3 | 187811 | 0.16 | 47 | 1516 | 80 | 163 | 164 | 361 |
| Median | 187811 | 0.16 | 47 | 1516 | 78 | 160 | 161 | 360 |
| Min–max | 182225–194502 | 0.16–0.17 | 45–49 | 1500–1522 | 76–80 | 158–163 | 159–164 | 359–361 |

### The gate

| Gate criterion | main | branch | Limit | Result |
|---|---|---|---|---|
| screens/frame (median) | 2.10 | 0.16 | ≤ 0.25 × main = 0.525 | PASS: 0.08 × main |
| busy (median ms) | 1845 (1801–1905) | 1516 | within main's spread | PASS: below it |
| Paint (median ms) | 172 (172–173) | 78 | within main's spread | PASS: below it |
| Layer memory | 37.8 MB | 24.2 MB | ≤ main | PASS |

Compositor::Update 154 ms → 160 ms and Layerize 156 ms → 161 ms (medians) are recorded, not gated (spec §5.2), as are the layer counts: 28 → 31 compositor layers, 0 → 4 mover layers (≈ 0.1 MB in all). Busy and Paint are lower on both sides than in the Task 20 session (main 2749 → 1845 ms busy); sessions differ, which is why each gate is read inside one.

**Compositor-layer readouts.** Main (all three rounds): `Compositor layers: 28 (24 drawing content, ≈ 37.8 MB at 4 B per device px, DPR 1, stage scale 1.000; 23 with an owning node)`; the scene's five named layers (`robots-back`, `mid`, `robots`, `front`, `marker`) each 1465 × 824 CSS px; `Mover layers: 0`. Branch (all three rounds): `Compositor layers: 31 (28 drawing content, ≈ 24.2 MB at 4 B per device px, DPR 1, stage scale 0.763; 27 with an owning node)`; `mid` and the empty `dissolve` div are 1920 × 1080 layers before the scale, three robot movers and the marker are 90–145 × 80–159; `Mover layers: 4`. The same world as Task 20, so no bubble strip draws in this window either; the bubble question is R5's.

**Stock painters (round 1, top of the attribution table, the wrapper now left out).** Main: the `robots` sheet 356 paints / 61 ms; the `robots-back` sheet 356 / 14 ms; every other node a handful (`html` 2, the static sheets 2–4, `div.meta-box` 6). Branch: the three robot movers 191, 182 and 220 paints at 4 657–13 050 px² (12, 8, 7 ms); the static sheets 24, 22, 3 and 4 paints; `html` 2; everything else a handful. The area per frame on the branch is the movers (≈ 0.015 screens) and the static sheets' occasional paints (≈ 0.14, 45–49 of them `unresolved` and capped at a viewport each); on `main` it is the two moving sheets (≈ 2.07). The work the phase set out to remove is the whole of the difference.

**Three side findings from the probe, filed and not acted on** ([tasks/DOCUMENT_REPAINT.md](tasks/DOCUMENT_REPAINT.md) Gate 1 outcome): the branch promotes a `g.gem__part` (70 × 190) and a `circle.robot__work-drop` to compositor layers of their own, plus six small unnamed layers, and the gem part rasters every frame; both builds force a synchronous style-and-layout inside the rAF tick every frame (`Blink.ForcedStyleAndLayout` under the swim's `FunctionCall`, two `Layout`s per frame); and Chrome dispatches a fake mouse move with a hit test at the top of every frame, which follows from layout changing every frame.

Plan: [tasks/PER_MOVER_COMPOSITOR_LAYERS.md](tasks/PER_MOVER_COMPOSITOR_LAYERS.md) "Task 20 — the gate" (the criteria) and [tasks/DOCUMENT_REPAINT.md](tasks/DOCUMENT_REPAINT.md) (this run).

## Per-Mover Compositor Layers — the re-rastered area column (2026-10-18)

Option (b) of [tasks/DOCUMENT_REPAINT.md](tasks/DOCUMENT_REPAINT.md) (Phase 5), taken after option (a) shipped: a **new recorded column, not a gate and not a replacement.** `rastered screens/frame` reads what the compositor actually re-drew, where `screens/frame` reads the paint phase's cull rects clamped to their layers. The Task 20 criteria and their re-run above are untouched; this section is the column's baseline on the same two builds.

**The column.** Each compositor layer is charged its on-screen area once for every frame in which at least one `RasterTask` ran for it (one or more tiles per layer per frame, on the raster worker threads; `args.tileData.layerId` names the layer, `sourceFrameNumber` the frame), summed over the layers and divided by the window's frames. The time of those tasks is unstable between runs (caveats at the top) and is not read; their presence per layer per frame is. The layer's area is the LayerTree snapshot's, keyed by layer id, with the stage scale applied as the paint clamp applies it. `rasteredArea` in `scripts/perf/paint-area-lib.mjs` (14 tests, 5 mutants killed: charge per task instead of per frame, charge an unknown layer a viewport, ignore the device scale, count a non-`RasterTask` event, accept a missing frame number); the harness also reads the LayerTree a second time right after each window so a layer that appeared during it is sized (`late layers`), and a layer in neither snapshot is charged 0 and counted in `unresolved raster layers`, which makes the figure a **floor**. The stock window prints a "raster by layer" table: layer id, node, size, frames rastered, tasks.

**Builds:** `main` `4a9b3fec`, from the throwaway `git worktree`, served on :4183, bundle `index-CVUy7kf3.js`; the branch `perf/per-mover-layers` at `10833d3f` (harness only; `src/` unchanged since `4d754d94`, checked with `git diff`), served on :4181, bundle `index-Dil0Vyn4.js`, the re-run's build. Both sides measured with the branch's harness. Headless Chrome via `npm run perf:idle -- --throttle 1 --only none --port 9301 --url <link>`: **1280 × 900** at 1×, no CPU throttle, the stock **6 s** window after the 8 s power-on settle. The pinned world is the baseline's `?session=` link (style `alpha`, `(0, 50)`, defaults), with the port changed per side.

**Method:** three rounds alternated, main then branch each round, each a fresh headless Chrome, foreground, one run at a time, in one session. Orphaned `trace-atlas-perf` Chrome count 0 before the first run and 0 after the last. The paint-clip columns (`screens/frame`, its clamp and `frame wrappers`) kept their rule, so they are the check that the wiring changed nothing else: they reproduce the re-run above on the same builds (main 2.12 against 2.10, branch 0.17 against 0.16).

### Results (6 s idle window, stock, 1×)

#### main (`index-CVUy7kf3.js`)

| Round | rastered px²/frame | rastered screens/frame | unresolved raster layers | late layers | redrawn px²/frame | screens/frame | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 3699840 | 3.21 | 0 | 0 | 2424017 | 2.10 | 2372 | 238 | 188 | 190 | 355 |
| 2 | 3723624 | 3.23 | 0 | 0 | 2441090 | 2.12 | 2491 | 252 | 197 | 199 | 352 |
| 3 | 3739248 | 3.25 | 0 | 0 | 2454808 | 2.13 | 2657 | 266 | 208 | 210 | 352 |
| Median | 3723624 | 3.23 | 0 | 0 | 2441090 | 2.12 | 2491 | 252 | 197 | 199 | 352 |
| Min–max | 3699840–3739248 | 3.21–3.25 | 0–0 | 0–0 | 2424017–2454808 | 2.10–2.13 | 2372–2657 | 238–266 | 188–208 | 190–210 | 352–355 |

#### branch (`index-Dil0Vyn4.js`)

| Round | rastered px²/frame | rastered screens/frame | unresolved raster layers | late layers | redrawn px²/frame | screens/frame | busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 267489 | 0.23 | 7 | 5 | 194139 | 0.17 | 2131 | 126 | 206 | 208 | 353 |
| 2 | 290341 | 0.25 | 7 | 5 | 190630 | 0.17 | 2065 | 133 | 203 | 205 | 353 |
| 3 | 283003 | 0.25 | 7 | 4 | 186500 | 0.16 | 2134 | 129 | 207 | 209 | 355 |
| Median | 283003 | 0.25 | 7 | 5 | 190630 | 0.17 | 2131 | 129 | 206 | 208 | 353 |
| Min–max | 267489–290341 | 0.23–0.25 | 7–7 | 4–5 | 186500–194139 | 0.16–0.17 | 2065–2134 | 126–133 | 203–207 | 205–209 | 353–355 |

Long tasks 1, 1, 2 on `main` and 1, 1, 1 on the branch; busy is 2372–2657 ms against the re-run's 1801–1905 on the same `main` build, so this session was slower throughout (both sides moved together, and the branch stays below `main` on busy and Paint). Sessions differ; the column is read inside this one.

### Reading

**`rastered screens/frame`: main 3.23, branch 0.25, a ratio of 0.08 × `main`** (recorded, not gated; the Paint-clip ratio on the same runs is 0.17 / 2.12 = 0.08 too). The two columns agree on the ratio and disagree on what `main` is made of:

- **`main` is three moving sheets, not two.** The raster-by-layer table (round 1; rounds 2 and 3 within ±2 frames) has the three `--moving` sheets at 1465 × 824 (1 207 160 px², 1.05 screens each) rastering on 351, 351 and 347 of 355 frames (449, 390 and 347 tasks), ≈ 3.14 screens/frame; then `div.screen-content` (1248 × 824) on 34 frames (≈ 0.10) and the two static sheets on 6 and 4. The paint table on the same window has only **two** of the moving sheets, 351 paints each (85 and 20 ms); the third, the `marker` sheet by layer order, rastered every frame with one tile per frame and **no `Paint` event in any round**. That is the shape R5 hypothesised ("What the Paint column does not see"): a layer can re-raster without the main thread re-recording it, and the `Paint` column cannot see it. What invalidates the marker sheet each frame is not read here.
- **The branch is the sheets' occasional rasters, not the movers.** The three robot movers (145 × 112, 141 × 173, 100 × 80 pre-scale; 4 657–14 199 px² after it) raster on 181, 124 and 78 frames for ≈ 0.01 screens/frame in all; the `g.gem__part` layer (side finding 1 above; 560–574 × 14–26, a thin part) on 136–147 frames for ≈ 0.003. The area is three big layers rastering now and then: the empty `dissolve` div (1920 × 1080 at 0.763 = 1 207 069 px²) on 25–26 frames with 79 tasks (≈ 0.075 screens/frame), the `mid` sheet (same size) on 23–25 frames with 54 tasks (≈ 0.075), and `div.screen-content` on 31–35 frames (≈ 0.09). Those three are ≈ 0.24 of the 0.25.
- **The floor.** Seven layers on the branch rastered and were in neither LayerTree snapshot (ids above the snapshot's highest, so created after it, and gone or unreported by the second read): one on 108 frames of 353, then 71–73, 33–34, 23, 22–23 and two smaller. Each had exactly one task per frame it rastered in, so each is a single-tile layer; they are charged 0, and the branch's 0.23–0.25 is a floor by whatever seven tiles come to. Zero on `main`. The six "small unnamed layers" in side finding 1 are these.
- **`div.screen-content` rasters about one frame in eleven on both builds** (29–34 frames on `main`, 31–35 on the branch; 112–137 tasks, so three to four tiles each time), a 1248 × 824 shell layer that is not the scene and that neither the Paint table nor the invalidation table names. New side finding, filed with the three above and not acted on.

**Compositor-layer readouts** are the re-run's: `main` `Compositor layers: 28 (24 drawing content, ≈ 37.8 MB …; 23 with an owning node)`, `Mover layers: 0`; branch `Compositor layers: 30 (27 drawing content, ≈ 24.2 MB …, stage scale 0.763; 26 with an owning node)`, `Mover layers: 4, ≈ 0.1 MB` (30 rather than the re-run's 31: one fewer unowned layer at the read, the same drawing set). Compositor::Update 197 → 206 ms and Layerize 199 → 208 ms (medians) are recorded, not gated, as before.

**What to do with the column.** Read it next to `screens/frame`, not instead of it: `screens/frame` says what the main thread recorded, `rastered screens/frame` what the GPU redrew, and a layer that shows in one and not the other (the marker sheet here) is the finding. Compare it only inside one session and at one viewport, like every other figure here. Plan and record: [tasks/DOCUMENT_REPAINT.md](tasks/DOCUMENT_REPAINT.md) Phase 5.

### Follow-up, same day: the shell layer and the marker sheet are the deck camera

Crawford asked for the `div.screen-content` rasters to be looked into. Two of the four findings above have one cause: **the deck camera's pans.** The camera (`src/animation/deckCamera.ts`, Phase 46) scrolls `.world-view__scroller` by writing `scrollLeft` from a 1.4 s GSAP tween (`DECK_CAMERA_PAN_S`), then follows the robot for up to 20 s, rests 3 s and picks again. The scroller is not a composited scroller (no layer of its own in any LayerTree read), so its scrolling contents are drawn into the nearest composited ancestor's layer, which is `div.screen-content`; every frame the scroll offset changes, cc re-rasters the shell layer's damaged tiles with **no `Paint` event** (the display list is unchanged; only the scroll offset moved). The marker sheet is the same thing one layer down: the followed-robot marker is placed on the robot each frame while the camera follows, so its sheet re-rasters every frame on `main` with no `Paint`. The camera runs in the harness at all because 1280 × 900 (1.42:1) is narrower than the stage's 16:9, which the "Mobile Deck Camera — the Task 11 perf gate" root-cause follow-up had already established (its cause 1: the stage box is wider than the client at that viewport, so the scroll range is not 0); what is new is that the raster column makes the cost of each pan visible, and names the layer it lands on.

**How it was found** (`main`, same build and link, three scratch probes in this session's scratchpad, not committed). (1) A 6 s `MutationObserver` on `.screen-content` outside the scene saw only the clock text once a second and a handful of marker attribute writes: nothing that could raster a 1248 × 824 layer 30 times. (2) A per-variant trace (stock, no header, no nav, no bridge flicker, no rocker pulse, no scene, no meta box) read the shell layer at 0–4 raster frames per 4 s window whatever was switched off, against the harness's 29–35 per 6 s: the rasters were not steady, so no ablation could own them. (3) One continuous 22 s trace from power-on + 6 s: the shell layer rastered on 98–99 frames, of which 86–89 fell in **one burst of about 1.5 s at every frame, 4 tiles per frame** (16.0–17.5 s after power-on in one run, 20.5–22.1 s in the other), the rest one frame every 1–2 s. In the burst frames, two bundle functions ran that ran almost nowhere else (92 of 104 and 90 of 92 calls), one DOM node took 100 of its 115 style invalidations, and `div.world-view__scroller` painted once. The burst's length is the camera's pan; which frames it lands in depends on when a robot the camera will pick goes active, so a 6 s window catches a pan, part of one, or none, which is why the Phase 5 rounds read 29–35 frames and the probes 0–4.

**The confirmation: one run per build at 1600 × 900**, a true 16:9 viewport, where the scroll range is 0 and the camera stands down (`handleResize`/`scrollRange`), everything else as in the rounds above:

| Width | Build | shell layer frames rastered (tasks) | marker sheet frames rastered | rastered screens/frame | screens/frame | compositor layers |
|---|---|---|---|---|---|---|
| 1280 | `main` (round 1 above) | 34 (133) | 347 | 3.21 | 2.10 | 28 |
| 1600 | `main` | **3 (8)** | **not composited, 0** | **1.81** | 1.81 | 28 |
| 1280 | branch (round 1 above) | 31 (121) | 1 | 0.23 | 0.17 | 30 |
| 1600 | branch | **0** | 0 | **0.16** | 0.17 | 29 |

At 1600 × 900 `main` rasters exactly its two robot sheets (1568 × 824 each, 350 of 353 frames) and nothing else of note, and the two area columns agree to the hundredth (1.81 and 1.81). On the branch the shell layer leaves the raster table altogether; what stays (the `dissolve` div 27 frames, the `mid` sheet 25, the seven single-tile layers) is **not** the camera and is still unexplained. The per-second single-tile shell raster that remains at 1600 × 900 and under `no-scene` (3–7 frames in 6 s) is also not the camera; it is small and not chased.

**What it means.** On a desktop window at or wider than 16:9 there is no cost: the camera never moves. On every narrower viewport, which is every phone in portrait and the harness's own default, each pan re-rasters the shell layer's visible scroller contents every frame for 1.4 s, then the follow re-rasters it on every frame the robot moves a whole pixel, and on `main` the marker sheet re-rasters every frame of the follow as well. The Task 11 follow-up named the mitigations without trying them: `will-change: scroll-position` (a composited scroller, so a scroll is a transform on the compositor and no re-raster) or `contain: paint` on `.world-view__scroller`, one at a time, measured with this column at 1280 × 900 and on the Pixel. Not done here: the camera is a shipped feature, the scroller's compositing is architecture, and the raster column has just arrived; **Crawford's call** whether a pan's raster cost is worth a spec. Findings 1 and 4 under Phase 5 in [tasks/DOCUMENT_REPAINT.md](tasks/DOCUMENT_REPAINT.md) are closed with this cause; 2 and 3 stay open.

## Deck scroller compositing — the desktop A/B (2026-10-18)

Phase 1 of [tasks/DECK_SCROLLER_COMPOSITING.md](tasks/DECK_SCROLLER_COMPOSITING.md): the two mitigations the follow-up above named for the deck camera's pans, one CSS declaration each on `.world-view__scroller`, against stock. **Recorded, not gated:** Gate 1 is read at Gate 2, which is Crawford's decision. No variant is committed; the scroller rule on the branch is unchanged.

**Builds.** All three from `feature/deck-scroller-compositing` at `c456ee82` (cut from `perf/per-mover-layers`), built with `npx vite build --outDir <scratch>` and served with `vite preview`: **A, stock**, the tip as it is, :4184, `index-Dil0Vyn4.js`; **B**, `will-change: scroll-position` added to the rule, :4185, `index-BSuw5Pa7.js`; **C**, `contain: paint` added, :4186, `index-Ds3mB9Ot.js`. B and C were built from a working-tree edit restored from a `cp` backup, and each built stylesheet was read back: only the added declaration differs. Every bundle was read from the served HTML before measuring. Harness: `scripts/perf/idle-paint.mjs` at `76927960`, which adds `--raster-top` (the stock window's raster-by-layer table at 30 s rasters 113–124 layers, and the robot movers push the shell layer out of the default 12 rows; a first round 1 taken without it could not read the shell row and was discarded).

**Method.** `npm run perf:idle -- --throttle 1 --window 30000 --only none --port 9301 --raster-top 300 --url <link>`, the pinned link of "Pre-change baseline for Phase 53" (`?session=`, style `alpha`, `(0, 50)`, defaults) with the port changed per variant, **1280 × 900** at 1×, the 8 s power-on settle, then one **30 s** window: one camera cycle is at most 1.4 + 20 + 3 s, so every window holds a pan (the scroll range at 1280 × 900 is 217 px: `scrollWidth` 1465, `clientWidth` 1248). Three rounds with the start order rotated (A B C, B C A, C A B), each run a fresh headless Chrome, foreground, one call per round, and the orphaned-Chrome count 0 before and 0 after every call (filtered `Win32_Process` query on `Name='chrome.exe'`). A 30 s window is traced without the invalidation table, so these figures compare only with each other, never with the 6 s sections above. `shell layer` is `div.screen-content`'s row in the stock window's raster-by-layer table; `scroller layer` is the row of B's scrolling-contents layer, owned by `div.world-view__scroller` (1465 × 824); 0 means the layer did not raster or does not exist.

**Gate 0** ([tasks/DECK_SCROLLER_COMPOSITING.md](tasks/DECK_SCROLLER_COMPOSITING.md), Phase 0): the camera moves in all three builds, and only B gives the scroller a layer of its own (a 1248 × 824 container that draws nothing and the 1465 × 824 scrolling-contents layer that draws), while `div.screen-content`'s layer stops drawing content. The harness's `Compositor layers:` line names only scene slots, so the scroller layer is read from the raster table here.

### A, stock

| Round | rastered px²/frame | rastered screens/frame | unresolved raster layers | late layers | redrawn px²/frame | screens/frame | busy (ms) | Paint n | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames | long tasks | shell layer frames | shell layer tasks | scroller layer frames | scroller layer tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 326139 | 0.28 | 108 | 11 | 2477393 | 2.15 | 10343 | 9992 | 1571 | 1530 | 1540 | 1798 | 0 | 140 | 475 | 0 | 0 |
| 2 | 333891 | 0.29 | 110 | 9 | 2544966 | 2.21 | 9827 | 10080 | 1505 | 1459 | 1468 | 1797 | 0 | 139 | 476 | 0 | 0 |
| 3 | 333807 | 0.29 | 110 | 9 | 2549417 | 2.21 | 9799 | 10106 | 1497 | 1463 | 1473 | 1800 | 0 | 142 | 480 | 0 | 0 |
| Median | 333807 | 0.29 | 110 | 9 | 2544966 | 2.21 | 9827 | 10080 | 1505 | 1463 | 1473 | 1798 | 0 | 140 | 476 | 0 | 0 |
| Min–max | 326139–333891 | 0.28–0.29 | 108–110 | 9–11 | 2477393–2549417 | 2.15–2.21 | 9799–10343 | 9992–10106 | 1497–1571 | 1459–1530 | 1468–1540 | 1797–1800 | 0–0 | 139–142 | 475–480 | 0–0 | 0–0 |

### B, `will-change: scroll-position`

| Round | rastered px²/frame | rastered screens/frame | unresolved raster layers | late layers | redrawn px²/frame | screens/frame | busy (ms) | Paint n | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames | long tasks | shell layer frames | shell layer tasks | scroller layer frames | scroller layer tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 284200 | 0.25 | 102 | 10 | 2343291 | 2.03 | 9635 | 9777 | 1467 | 1421 | 1430 | 1800 | 0 | 0 | 0 | 45 | 241 |
| 2 | 286374 | 0.25 | 110 | 9 | 2572131 | 2.23 | 9720 | 10106 | 1484 | 1427 | 1435 | 1795 | 0 | 0 | 0 | 48 | 250 |
| 3 | 285535 | 0.25 | 111 | 10 | 2543521 | 2.21 | 9764 | 10082 | 1494 | 1441 | 1450 | 1798 | 0 | 0 | 0 | 48 | 247 |
| Median | 285535 | 0.25 | 110 | 10 | 2543521 | 2.21 | 9720 | 10082 | 1484 | 1427 | 1435 | 1798 | 0 | 0 | 0 | 48 | 247 |
| Min–max | 284200–286374 | 0.25–0.25 | 102–111 | 9–10 | 2343291–2572131 | 2.03–2.23 | 9635–9764 | 9777–10106 | 1467–1494 | 1421–1441 | 1430–1450 | 1795–1800 | 0–0 | 0–0 | 0–0 | 45–48 | 241–250 |

### C, `contain: paint`

| Round | rastered px²/frame | rastered screens/frame | unresolved raster layers | late layers | redrawn px²/frame | screens/frame | busy (ms) | Paint n | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames | long tasks | shell layer frames | shell layer tasks | scroller layer frames | scroller layer tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 340058 | 0.30 | 111 | 9 | 2577582 | 2.24 | 9776 | 10150 | 1487 | 1445 | 1454 | 1800 | 0 | 143 | 481 | 0 | 0 |
| 2 | 327764 | 0.28 | 110 | 9 | 2538236 | 2.20 | 9798 | 10076 | 1506 | 1448 | 1458 | 1797 | 0 | 140 | 477 | 0 | 0 |
| 3 | 331297 | 0.29 | 110 | 10 | 2550457 | 2.21 | 9671 | 10093 | 1468 | 1457 | 1467 | 1798 | 0 | 142 | 479 | 0 | 0 |
| Median | 331297 | 0.29 | 110 | 9 | 2550457 | 2.21 | 9776 | 10093 | 1487 | 1448 | 1458 | 1798 | 0 | 142 | 479 | 0 | 0 |
| Min–max | 327764–340058 | 0.28–0.30 | 110–111 | 9–10 | 2538236–2577582 | 2.20–2.24 | 9671–9798 | 10076–10150 | 1468–1506 | 1445–1457 | 1454–1467 | 1797–1800 | 0–0 | 140–143 | 477–481 | 0–0 | 0–0 |

### The control: 1600 × 900, one run each

`--width 1600`, A B C, everything else as above. 1600 × 900 is 16:9, the scroll range is 0 and the camera stands down (`scrollRange()`), so the three variants should read alike here.

| Variant | rastered px²/frame | rastered screens/frame | unresolved raster layers | late layers | redrawn px²/frame | screens/frame | busy (ms) | Paint n | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames | long tasks | shell layer frames | shell layer tasks | scroller layer frames | scroller layer tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A, stock | 321383 | 0.22 | 109 | 11 | 3179950 | 2.21 | 9358 | 10094 | 1485 | 1433 | 1442 | 1798 | 0 | 48 | 100 | 0 | 0 |
| B, `will-change: scroll-position` | 324461 | 0.23 | 101 | 9 | 2944406 | 2.04 | 9108 | 9806 | 1449 | 1399 | 1408 | 1800 | 0 | 0 | 0 | 48 | 100 |
| C, `contain: paint` | 319672 | 0.22 | 109 | 10 | 3187826 | 2.21 | 9426 | 10102 | 1500 | 1438 | 1447 | 1799 | 0 | 47 | 99 | 0 | 0 |

All three read alike on `rastered screens/frame` (0.22, 0.23, 0.22). **The plan's "≤ 7 shell frames in 30 s" was wrong**: it scaled the follow-up's 6 s single run (branch 0) and the "3–7 frames in 6 s" per-second raster, and a 30 s window holds 47–48 of those per-second frames (99–100 tasks, about two tiles each). In B the same 48 frames and 100 tasks move from the shell layer to the scroller layer, so the per-second raster is something **inside the scroller**, not the camera and not the shell's own chrome; it is not chased here. C reads as A.

### Compositor-layer readouts

A `30–31 (27–28 drawing content, ≈ 24.2 MB at 4 B per device px, DPR 1, stage scale 0.763)`, B `32 (27 drawing content, ≈ 24.9 MB …)` in all three rounds, C `30–31 (27–28 drawing content, ≈ 24.2 MB …)`; `Mover layers: 4, ≈ 0.1 MB` on all three, and the named scene layers are the same set on all three (`mid`, `dissolve` and the movers), so B did not move the Phase 53 layer structure. B's two extra layers are the scroller's; its memory rises **≈ 0.7 MB at 1×**: the scrolling-contents layer adds 1465 × 824 × 4 B ≈ 4.6 MiB and `div.screen-content` stops drawing (1248 × 824 × 4 B ≈ 3.9 MiB released). At 1600 × 900 the two are the same size (1568 × 824) and B reads 29.0 MB, as A and C do.

### A finding outside the plan: the phone already composites the scroller

The Risks table asks what B's layer costs on the Pixel, so A and B were also run once each at the harness's phone emulation (`--width 412`: 412 × 844, DPR 2, `mobile: true`):

| Variant | rastered px²/frame | rastered screens/frame | unresolved raster layers | late layers | redrawn px²/frame | screens/frame | busy (ms) | Paint n | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames | long tasks | shell layer frames | shell layer tasks | scroller layer frames | scroller layer tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A, stock | 898835 | 0.65 | 21 | 9 | 3261374 | 2.34 | 9439 | 10134 | 1441 | 1247 | 1257 | 1798 | 0 | 0 | 0 | 50 | 263 |
| B, `will-change: scroll-position` | 905163 | 0.65 | 21 | 7 | 3247721 | 2.33 | 10413 | 10088 | 1587 | 1475 | 1486 | 1794 | 0 | 0 | 0 | 47 | 257 |

**Stock A already has the scroller layer there** (1365 × 768, rastering on 50 frames), and its shell layer does not raster; B reads the same layers and the same 62.8 MB. A scratch probe on stock A at 1280 × 900 (the Phase 0 probe, one LayerTree read per setting) found where the line is: the scroller is **not** composited at DPR 1 and 1.25 with `mobile: false`, and **is** composited at DPR 1.5, at DPR 2, and at DPR 1 with `mobile: true`. Chrome composites a scroller on its own whenever it does not need to keep LCD sub-pixel text (DPR ≥ 1.5, or a mobile device), and those are the cases where it keeps the layer we are asking B for. So the camera's per-pan re-raster of the shell is a **low-DPI desktop** cost only: on the Pixel (DPR ≈ 2.6, mobile) stock is already on B's path, and B can change nothing there. The phone runs are one each and their main-thread numbers (busy 9439 against 10413) are not read; their layer readouts are the finding.

### Reading (Gate 1, recorded)

Medians over the three rounds, each variant against A:

- **The shell layer: A 140 frames rastered (476 tasks), B 0, C 142.** B takes the shell out of the raster table entirely. What B's own scroller layer rasters instead, 48 frames, is the per-second raster the control round shows on every variant at 1600 × 900 (48 frames there too), so B removes exactly the camera's share: about 92 frames per 30 s, the 1.4 s pan at every frame plus the follow's whole-pixel steps.
- **`rastered screens/frame`: A 0.29, B 0.25, C 0.29**, B at 0.86 × A. The 0.04 is the shell's 140 × 1248 × 824 px² over the window's frames (≈ 0.07) less B's scroller layer's 48 × 1465 × 824 (≈ 0.03). The column charges a layer its whole area for every frame it rasters in, however few tiles, so both shares are upper bounds of the tiles actually drawn.
- **Main thread: no variant is distinguishable.** Busy A 9827 ms (9799–10343), B 9720, C 9776; Paint A 1505 ms (1497–1571), B 1484, C 1487; Compositor::Update A 1463 ms (1459–1530), B 1427, C 1448. B and C both sit just under A's minimum on all three, and C is a no-op by every other column, so the gap is session spread that a no-op shows too, not B's doing. As expected, B's work is off the main thread: a composited scroll moves a layer on the compositor and never reached Paint.
- **C, `contain: paint`: no change**, as the plan expected. It does not composite the scroller, so the shell still re-rasters on every pan. Per the plan's default, it is dropped from Phase 2.
- **Layer memory: B + 0.7 MB at 1×** (above), and nothing at DPR ≥ 1.5, where stock already holds the same layer.

What Gate 2 is left with, for Crawford: on a DPR-1 desktop window narrower than 16:9, B removes the camera's raster of the shell layer (≈ 92 frames per 30 s of a 1248 × 824 layer) for ≈ 0.7 MB, with no main-thread change; on the phone it changes nothing because the phone already does it. The Phase 2 Pixel underrun A/B would compare two builds whose layers are the same, so it cannot show B's effect; whether to run it as planned, replace it with a check that the Pixel's own LayerTree shows the scroller layer on stock, or drop it, is part of the Gate 2 decision. The look check (T2.2) still applies to a desktop window: a composited scroller is exactly the case where Chrome gives up LCD sub-pixel text at DPR 1, and the only text under the scroller is the world's own.

**Gate 2 decision (2026-10-18): adopt B.** Crawford's call, on the evidence above. His desktop runs at Windows 125 % scaling, DPR 1.25, the case B changes: a probe at DPR 1.25 reads stock with no scroller layer and B with the scrolling-contents layer and the shell layer not drawing, as at DPR 1. T2.1 (the Pixel underrun A/B) was skipped, since the phone composites the scroller on stock and the A/B would compare identical layers. T2.2 (the look, A against B in desktop Chrome at 125 %) passed: "they both look fine". The cost, stated: ≈ 0.7 MB at 1× on 1280 × 900, ≈ 1.1 MB at DPR 1.25 (× 1.25²), nothing on a phone. Committed as `9443dd1c`: `will-change: scroll-position` on `.world-view__scroller`, pinned at the time by `WorldView.css.test.ts` (removed 2026-10-22 with the other CSS source-scan tests; nothing pins the declaration now), and a paragraph in ANIMATION_SYSTEM.md's deck camera section. The tables above stay as measured; "No variant is committed" was true when they were taken.

## Per-Mover Compositor Layers — review follow-up R5, option 3: the strips separated (2026-10-18)

Option (3) of "review follow-up R5" above ([tasks/PER_MOVER_REVIEW_FOLLOWUPS.md](tasks/PER_MOVER_REVIEW_FOLLOWUPS.md) R5): before Crawford chooses between accepting R5's busy MISS and the bubble redesign, find out how much of the branch's extra cost is the 18 bubble strips themselves, as layers, and how much is the other movers. R5's own diagnostic detached the circles and left the strip `div`s in the page, so it could not say. **Recorded, not gated, and not a decision:** the R5 section above stands as written, and what to do about its MISS is still Crawford's.

**Result, in one line:** at the moment measured, about a third of the branch's Compositor::Update gap (and more of its busy gap) is the strip layers standing in the page, almost none of it is the circles' motion, and the rest is the other movers, mostly the robots, whose share rises and falls with how many robots are moving.

### Method

**Builds:** `main` `4a9b3fec`, R5's own build, still served on :4183, bundle `index-CVUy7kf3.js`; the branch `perf/per-mover-layers` at `f5e38e46` (with the deck scroller change, `will-change: scroll-position`), served on :4187, bundle `index-BSuw5Pa7.js`. Both bundles read back from the served HTML. Harness: `scripts/perf/idle-paint.mjs` with two additions, `2d05d6d8` (`detach-bubble-strips`, a sticky step that removes `sceneSlotSelector('bubbles')`: the 18 strip movers on the branch, the one bubbles sheet on `main`) and `1eb022d2` (a checked step prints how many elements it matched, how many were left, and how many match again after its window, and throws if any are left). Every run read 1 matched and 0 left on `main`, 18 and 0 on the branch, 135 and 0 for the circles, and 0 again after every window: no detach decayed.

**World and command:** R5's world, `alpha` at `(-100, -100)` (18 factories, 135 bubble circles, 18 streams), R5's `?session=` link with the port changed per build. `npm run perf:idle -- --throttle 1 --window 30000 --bubbles 5 --expect-dimmed no --port 9301 --only <steps> --url <link>`, 1280 × 900 at 1×, the 8 s power-on settle, 30 s windows. Each run is a fresh headless Chrome, foreground, one at a time, the builds alternated and the order rotated between rounds; the orphaned-Chrome count 0 before and 0 after every call (filtered `Win32_Process` query on `Name='chrome.exe'`).

**Why every comparison is at the same window position.** A run traces its windows one after another, and the world does not stand still between them: in the second window (about 40–72 s after power-on) the branch's robot movers raster on ≈ 1 600 frames each, against ≈ 600–700 in the third. The branch-over-`main` gap moves with it. So a condition is never compared with another window of the same run; each condition is the **second window** of its own runs, after the same stock first window, and is compared with the other build at the same window position. Three run shapes give the three conditions:

- **bubbles present:** `--only "stock (again),detach-bubbles,detach-bubble-strips"`, window 2 = `stock (again)` (these runs' windows 3 and 4 are under "Later windows" below);
- **circles detached, strips kept:** `--only detach-bubbles`, R5's own diagnostic, re-run;
- **strips detached (circles with them):** `--only detach-bubble-strips`.

**The acceptance rule.** From 12:33 the machine had bursts of slowness lasting about a window (the user's own Chrome, then a burst with every Chrome closed), +25–30 % on every column of a stock window. A run is **accepted if its stock window's Compositor::Update is within ±10 % of its build's median stock over every run in the session**, which is `main` 1940 ms and the branch 2305 ms; ordinary run-to-run spread is ≈ 2 %. Every run is in the tables, rejected ones included. `q3a`, `q3b` and `q3` are the three takes of round 3 (12:33, 12:37 and 12:43, after Crawford closed Chrome); `q5-main` replaced the rejected `q4-main`. `q3a-main` passes the rule on its stock window although its second window was caught by the burst; the rule keeps it, and the median is 1775 ms with or without it.

### Window 2, bubbles present

| Run | Build | stock Compositor::Update (ms) | accepted | window 2 busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| r1-main | `main` | 1940 | yes | 11123 | 1864 | 2103 | 2111 | 1800 |
| r1-tip | branch | 2292 | yes | 11601 | 1923 | 2455 | 2462 | 1800 |
| r2-main | `main` | 1965 | yes | 11156 | 1929 | 2111 | 2118 | 1801 |
| r2-tip | branch | 2249 | yes | 11687 | 1933 | 2483 | 2489 | 1801 |
| r3-main | `main` | 1904 | yes | 11078 | 1891 | 2112 | 2120 | 1801 |
| r3-tip | branch | 2269 | yes | 11695 | 1916 | 2468 | 2475 | 1800 |

### Window 2, circles detached, strips kept

| Run | Build | stock Compositor::Update (ms) | accepted | window 2 busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| d2-main | `main` | 1975 | yes | 10296 | 1909 | 1742 | 1749 | 1801 |
| d2-tip | branch | 2290 | yes | 11102 | 1944 | 2082 | 2089 | 1799 |
| d3-main | `main` | 1919 | yes | 10540 | 1904 | 1759 | 1766 | 1801 |
| d3-tip | branch | 2296 | yes | 10972 | 1933 | 2102 | 2108 | 1799 |
| r5diag-main | `main` | 1927 | yes | 10573 | 1908 | 1770 | 1778 | 1801 |
| r5diag-tip | branch | 2354 | yes | 10997 | 1985 | 2101 | 2108 | 1800 |

### Window 2, strips detached (circles with them)

| Run | Build | stock Compositor::Update (ms) | accepted | window 2 busy (ms) | Paint (ms) | Compositor::Update (ms) | Layerize (ms) | frames |
|---|---|---|---|---|---|---|---|---|
| q1-main | `main` | 1926 | yes | 10682 | 1920 | 1775 | 1783 | 1799 |
| q1-tip | branch | 2361 | yes | 10781 | 1939 | 2017 | 2023 | 1800 |
| q2-main | `main` | 1935 | yes | 11028 | 2081 | 1914 | 1922 | 1800 |
| q2-tip | branch | 2337 | yes | 10770 | 1912 | 1984 | 1991 | 1801 |
| q3-main | `main` | 1964 | yes | 10511 | 1883 | 1730 | 1737 | 1801 |
| q3-tip | branch | 2314 | yes | 10624 | 1908 | 1965 | 1972 | 1800 |
| q3a-main | `main` | 1902 | yes | 12618 | 2456 | 2219 | 2229 | 1791 |
| q3a-tip | branch | 2730 | **no** | 13227 | 2525 | 2612 | 2621 | 1795 |
| q3b-main | `main` | 2472 | **no** | 12576 | 2379 | 2269 | 2279 | 1798 |
| q3b-tip | branch | 2973 | **no** | 13111 | 2494 | 2557 | 2566 | 1799 |
| q4-main | `main` | 2568 | **no** | 10604 | 1922 | 1735 | 1742 | 1800 |
| q4-tip | branch | 2294 | yes | 12933 | 2256 | 2434 | 2442 | 1797 |
| q5-main | `main` | 1948 | yes | 10424 | 1928 | 1744 | 1752 | 1800 |

### Medians of the accepted runs, and the gap

| Window 2 condition | `main` runs | branch runs | busy main → branch (gap) | Paint main → branch (gap) | Compositor::Update main → branch (gap) | Layerize main → branch (gap) |
|---|---|---|---|---|---|---|
| bubbles present | 3 | 3 | 11123 → 11687 (+564) | 1891 → 1923 (+32) | 2111 → 2468 (+357) | 2118 → 2475 (+357) |
| circles detached, strips kept | 3 | 3 | 10540 → 10997 (+457) | 1908 → 1944 (+36) | 1759 → 2101 (+342) | 1766 → 2108 (+342) |
| strips detached (circles with them) | 5 | 4 | 10682 → 10775.5 (+93.5) | 1928 → 1925.5 (-2.5) | 1775 → 2000.5 (+225.5) | 1783 → 2007 (+224) |

### Later windows, the sequence runs

| Window | condition | `main` runs | branch runs | busy main → branch (gap) | Compositor::Update main → branch (gap) |
|---|---|---|---|---|---|
| 3 | circles detached, strips kept | 3 | 3 | 7817 → 7293 (-524) | 1604 → 1659 (+55) |
| 4 | strips detached (circles with them) | 3 | 3 | 7293 → 7089 (-204) | 1502 → 1515 (+13) |

### Reading

Window 2, medians of the accepted runs: the **Compositor::Update gap +357 → +342 → +226 ms**, and the **busy gap +564 → +457 → +94 ms**, from bubbles present, to circles detached, to strips detached.

- **The circles' motion is not the gap.** Detaching the 135 circles takes about the same off both builds: Compositor::Update −367 ms on the branch (2468 → 2101) and −352 on `main` (2111 → 1759); busy −690 and −583. The gap barely moves (+357 → +342). Moving circles cost the same whether they sit in one sheet or in 18 strips, which is what R5's diagnostic found too.
- **The strip layers themselves are a real share.** With the circles already gone, removing the 18 empty strips takes another ≈ 100 ms of Compositor::Update off the branch (2101 → 2000.5); removing `main`'s one empty sheet changes nothing (1759 → 1775). On Compositor::Update that is ≈ 116 ms of the gap, about a third; on busy, the column R5 gated, the gap falls by 363 ms (the branch's own drop is 222 ms), so the strips cost the main thread more than their Compositor::Update share. Busy is the noisier column here (the accepted runs spread over ≈ 600 ms in the strips condition, ≈ 50 ms in Compositor::Update), so read the busy share as somewhere between 220 and 360 ms of 564, not as a point.
- **With no bubbles at all, a gap remains, and it is the other movers.** +226 ms Compositor::Update and +94 ms busy with every strip and the sheet gone: what is left on the branch that `main` does not have is the robot, marker and dissolve movers. Its size follows the robots: in the same runs' later windows, where fewer robots move, the strips-detached gap is +13 ms Compositor::Update and the branch is **faster** than `main` on busy (−204 ms), as it is with only the circles detached (−524 ms).
- **Paint does not see any of it**: the Paint gap is +32, +36 and −2.5 ms across the three conditions, as R5 found for the bubbles.

**What this says about R5's options** (Crawford's call, not decided here): a bubble redesign that cuts the number of always-promoted strip layers goes after the strips' share, about a third of the Compositor::Update gap and roughly half of the busy gap at this moment; nothing done to the bubbles touches the robots' share, which is the larger part of the Compositor::Update gap whenever several robots are moving and close to nothing when few are. The decomposition is of window 2 only: the harness always traces a stock window first, so R5's own gated window (window 1) cannot be detached in place. Its gap reproduces on this build (stock busy 9537 → 10379.5 ms, Compositor::Update 1935 → 2295, against R5's 9566 → 10330 and 1940 → 2287), so the branch build with the scroller change carries the same gap R5 measured.

**A harness caveat found on the way.** In a 3 s smoke run on `main` with every step at once, the page had no `.world-view` after `detach-bubbles+robots` (after `detach-bubble-strips`), and the run was rejected by the world check: the robots' detach pulls out nodes React owns, and the next React update after it appears to unmount the world. The rounds above do not use that step, and the world check passed at the end of every one. Not chased.

**Decision (2026-10-18): Crawford accepts R5's busy MISS.** On the evidence above: +8 % busy and +18 % Compositor::Update on the busiest world found, over 30 s, for 0.85 MB of bubble layers instead of 4.60 MB, with the larger part of the gap belonging to the robot movers that no bubble change reaches. No bubble redesign follows from it, and spec §7 Q3 is closed by this decision; R5's numbers and its MISS stand as recorded.

## Per-Mover Compositor Layers — the Pixel A/B: not separable on the phone (2026-10-18)

The `main` listen the Task 21 section above left open ([tasks/PER_MOVER_REVIEW_FOLLOWUPS.md](tasks/PER_MOVER_REVIEW_FOLLOWUPS.md), "Open before merge" item 3): the Pixel, `perf/per-mover-layers` against `main`, by ear and with the `?debug` overlay. **Result: the run-to-run spread on the phone is larger than the difference being looked for, so the A/B could not separate the two builds.** The gate was decided by Crawford on that basis (below).

**Conditions.** The Pixel 8, **portrait**, the LAN production previews: the branch's own `npm run build` of the tip (`82282e32` source, `dist/` built 14:41, served by `vite preview --host` on :4173, bundle `index-BdWK58nR.js`) and `main` `4a9b3fec` (served on :4174, bundle `index-CVUy7kf3.js`, the R5 and Task 20 `main` build). The world is the Task 20 gate's pinned `?session=` link (the overlay reads `@ 0,50`), with `&debug&load=light`: **Light** Audio Load on both dials (`load 20%·fx 20%`, latency `playback`, all three LFO tiers off), so lighter than Task 21's Full. Crawford let the phone cool first. Readings are from his screenshots of the overlay; the first run's are small and read approximately.

| Listen | Build | Length | Underruns (overlay total) | Crawford's words |
|---|---|---|---|---|
| Task 21, 2026-10-17 (section above) | branch (`a04d4a0c`) | over 5 min, Full | about 12 | no distortion; "good to go" |
| Run 1 | branch | 5:11 | about 12 at 0:34, about 68 at 2:03, about 88 at 5:11 | "MUCH better" than an earlier incognito try (non-stop distortion from about 3 min, no numbers), "still a little more distortion than I wanted" |
| Run 2 | `main` | 3:03 | about 22–23 | "good at light audio quality" |
| Run 3 | branch | 3:02 | 41 (875 ms), avg output latency 265 ms (21–307), `lag 9ms (max 650ms)` | "a few distortions, but not as bad as earlier runs" |

**What the screenshots do establish.** Every reading is `fin ok` with the master peak well below 0 dB (−3.4 to −11.5 dB): no clipping and no non-finite samples. The crackle is **playback underruns**, the audio thread missing its deadline in bursts of one to four, with the UI at 57–60 fps and the main-thread lag low between bursts. **`main` also underruns** (about 22 in three minutes), so the crackle predates this branch and is filed on its own as backlog item 27 ([todo/backlog.md](todo/backlog.md)). The branch's own counts run from about 12 (Task 21, Full, over five minutes) to about 88 (run 1, Light, five minutes): a spread far wider than the `main`-against-branch difference in this sitting (about 22 against 41 at three minutes), so that difference is not evidence either way. The branch's changes are to how the screen is composited, with no path into the audio graph; on a phone the two still share the CPU, which is why the gate asks.

**Correction to the Task 21 section above.** It lists landscape among the plan's conditions and says Crawford did not restate the orientation. He has since said every run on his phone, Task 21's included, was **portrait**, where the deck camera runs. The Task 21 section stands as written; this is the correction.

**Decision (2026-10-18): Crawford moves on.** The A/B is not separable on this instrument; with Task 21's clean listen, today's runs ("a few distortions, not as bad as earlier runs") and `main` underrunning too, the open "not above `main`" item is closed by his decision, not met as a measured criterion. A better instrument, if this ever needs settling, is the audio thread's render capacity read through Chrome's remote DevTools over USB, a continuous load figure rather than a count of failures.

## Output level series — `npm run perf:level` (roadmap 54, 2026-10-23)

Where `perf:audio` measures how hard the audio thread works, this measures **how loud the output is**. Built for roadmap 54 ([specs/OUTPUT_HEADROOM.md](specs/OUTPUT_HEADROOM.md) §5.2), whose gate is that nothing leaves the app at or above 0 dBFS. It drives headless Chrome over the DevTools Protocol as `perf:audio` does, loads one page URL per run, powers on, waits out a warm-up, then reads the `?debug` overlay's output line (`out <peak> rms <rms>  pre <peak>  fin <flag>`, [Reading the output taps](#reading-the-output-taps-and-the-playback-stats) above) every 500 ms. `out` is the master gain's output, what the browser plays; `pre` is the EQ3's output, the fleet's summed dry signal entering the FX chain. The overlay's sampler reads a 0.68 s window every 500 ms, so no peak falls between readings. Above 0 dBFS the browser hard-clips, so a reading at or above 0 is a clip.

```
npm run build && npx vite preview --port 4173                                                      # terminal 1 — a production build
npm run perf:level -- --url "http://localhost:4173/trace-atlas/?debug&seed=…&x=…&y=…&s=1.…" --seconds 120     # terminal 2
```

Per run it prints the overlay's world row (`random @ -116,-2`: where the link landed; the name always reads `random`, see the LFO Bank section), then per tap the peak max and mean, the master RMS mean, the readings at or above 0 dBFS out of N, and how many were missing (`-`) or silent (`-inf`, counted in N, left out of the means). It exits non-zero on a page with no overlay or no output line, and on any `fin NaN!`.

| Flag | Meaning |
|---|---|
| `--url a,b,c` | Full page URLs, run one after another in fresh browsers. Each must carry `?debug`, and should carry a world link's `seed`/`x`/`y` (and `s=`, for a tweaked world) to pin the world (the links below). |
| `--seconds` / `--warmup` | Series length (120, i.e. 239 readings) and the wait after power-on (8). |
| `--robot-volume-full` | Before the warm-up, set every robot's Volume to 100 % through the All Probes form (H1 and H2, below). Applies to every `--url` in the call. |
| `--json path` | Also write every reading and the summary, one entry per URL. |
| `--chrome` / `--port` | As `perf:audio`; the port defaults to 9335. |

Only the HUD parsing and the summary are unit-tested (`scripts/perf/output-level-lib.mjs`); the Chrome plumbing is verified by real runs. The [measurement hygiene](#measurement-hygiene) above applies unchanged, orphan check included (the probe's temp profiles carry the same `trace-atlas-perf` prefix).

Verified 2026-10-23 (served build of `315f7884`): a 30 s run at a random world printed the table and exited 0; a URL without `?debug`, and a run with no `--url`, each exited 1 naming the problem.

### The seven links (spec §5.2's variants)

**How they were made.** On `npm run dev`, in headless Chrome, a fresh page per variant, over CDP `Runtime.evaluate` with dynamic imports of the app's own modules: `retransmitWorld({ attenuationStyleName, coordinates })` (`systems/worldTransition.ts`) to the variant's world; then the three seed-once fields (`swellFrequency`, `swellDuration`, `humanize`) set to `generateSwellFrequency` / `generateSwellDuration` / `generateHumanize` of the new style (`utils/globalAudioSeed.ts`), because a retransmit carries them over from the random world the page booted into, where a fresh boot seeds them from its own style; for H1 and H2 only, `setGlobalAudio('eq3', { low: 12, mid: 12, high: 12 })` and `setGlobalAudio('limiter', { threshold: 0 })`; then `buildShareUrl(buildSessionPayload())` (`utils/sessionShareUtils.ts`, `utils/sessionDiff.ts`). Two corrections to the plan's recipe: the modules are served under the base path (`/trace-atlas/src/…`, not `/src/…`), and `getSessionSharePayload()` returns the payload the page's own URL carried, not the live state; `buildSessionPayload()` is what the Share button uses. `pingVarianceAutomation` is drawn at random once per session, not seeded, so each link pins whatever its session drew (0.30–0.40 below). The master slider is at 100 % in every one: that is its default, and it is never saved in a session.

**Checked.** Each link was reloaded on the dev server and the stores read back: Attenuation Style, coordinates, EQ, Limiter, Compressor threshold and ratio, swell frequency and duration, humanize and ping variance all as built, 12 robots. One difference: the payload rounds the Compressor's attack and release to three decimals (D1: 0.02812 → 0.028 s, 0.07137 → 0.071 s), under a millisecond. On the production build the overlay's world row read `-116,-2` for D1 and `-150,90` for D5.

**H1 and H2's robot Volumes are pushed by the probe, not the link.** Spec §5.2 asks for every robot Volume at 100 %, but `masterVolume` is excluded from session payloads by design ([specs/SESSION_STORAGE.md](specs/SESSION_STORAGE.md) §1.2, `src/types/session.ts`), and the production build the probe drives exposes no store to set it from. So the H links carry the EQ and Limiter push, and every H run adds `--robot-volume-full`: after power-on and before the warm-up, the probe opens Probes → All Probes → the Levels tab and presses End on the form's Volume slider, which broadcasts 100 % to every member (`src/components/company/useCompanyOptions.ts`, the edit a user would make; it also cancels any volume swell under way). Crawford chose this on 2026-10-23, over accepting the EQ and Limiter push alone or running H on the dev server. Checked on the dev server with the stores read back: D1's twelve robots went from 0.70–0.81 to 1.0 each. On the production build of `main`, H1 for 60 s without and with the flag:

| H1, 60 s, `main` | `out` peak max | `out` peak mean | `out` ≥ 0 dBFS | `pre` peak max | `pre` peak mean |
|---|---|---|---|---|---|
| link only | +3.4 | −0.6 | 41 of 119 | +12.4 | +6.4 |
| link + `--robot-volume-full` | +7.3 | +4.2 | 119 of 119 | +21.5 | +16.1 |

`pre`'s mean rises 9.7 dB, about what the seeded Volumes sat below unity on the 40 dB taper (0.70–0.81 is −12 to −7.6 dB). This checks the push; the gate's H runs are T7's, 120 s on the branch.

| Variant | World | EQ low / mid / high (dB) | Limiter (dB) | Compressor | Swell frequency / duration, humanize, ping variance |
|---|---|---|---|---|---|
| D1 | `56c2t2t8` (−116, −2) | +3.5 / +3.5 / +4.0 | −3 | −34 dB, 2:1 | 3 / 7, 6 ms, 0.30 |
| D2 | `charlie` (200, −30) | −3.5 / −3.5 / −4.0 | −3 | −32 dB, 3:1 | 3 / 3, 3 ms, 0.40 |
| D3 | `alpha` (12, 68) | −3.5 / −3.5 / −3.5 | −3 | −33 dB, 3:1 | 3 / 3, 5 ms, 0.35 |
| D4 | `delta` (5, −180) | 0 / 0 / 0 | −2 | −28 dB, 4:1 | 4 / 5, 3 ms, 0.35 |
| D5 | `bravo` (−150, 90) | −3.5 / −3.5 / −3.5 | −2 | −28 dB, 4:1 | 4 / 3, 3 ms, 0.35 |
| H1 | `56c2t2t8` (−116, −2) | **+12 / +12 / +12** | **0** | −34 dB, 2:1 | 3 / 7, 6 ms, 0.40 |
| H2 | `bravo` (−150, 90) | **+12 / +12 / +12** | **0** | −28 dB, 4:1 | 4 / 3, 3 ms, 0.35 |

D1–D5 are each world's own seeded values; H1 and H2 differ from D1 and D5 in the bold cells, the unseeded ping variance, and every robot Volume at 100 %, which the probe sets (`--robot-volume-full`, run in its own call). The links, for the default `vite preview` host (the params are host-independent; swap the host for a LAN address). **Re-minted 2026-10-25** as world links (roadmap 56) by the shipped encoder: each T3 `?session=` payload was decoded by the old reader (`fee2de9e`), re-encoded by `encodeWorldLinkParams`, and checked to decode back through `decodeWorldLink` to the same payload, field for field; 250–370 characters of params each, against 2,100–2,300 for the old `session=` value:

```
D1  http://localhost:4173/trace-atlas/?debug&seed=56c2t2t8&x=-116&y=-2&s=1.ZVBBbsMgEPzLnqlrwEpqn6uqhx5aqR8gsI5RsHGBOrIs_70LaitFuc0OMzuzbHCGboOAC4ZTRga1WqET1YEzmAM-o8tzXdVHBldM0PGdkaqwWU7g046YJQ0XDHpEc1L6kgkh_zwM4jrp4rCLjdZP0AF_lAIYjN7Y3mIgxviU0MBOEdqPFB-jJ36DNBAevDPQPciGQVDJeqrJQKX0m1aLJ3pAhyqWOvWRYi8T0sBr2thblzC8vb-UhetMPDh_nVWM1KIP-PWNk87HN6Jl8JF_QbT_xtcb42DPw71THoqPV7LNN8xL7iH3Hw
D2  http://localhost:4173/trace-atlas/?debug&seed=charlie&x=200&y=-30&s=1.ZY7LDoIwEEX_ZdbVQHnEdG2MCxf6CRVGSqi0thVCCP_uFI2JcXfv3JyTmaEBMYPDAd01phorOYFItuWOgXW4R_3uScpgxAAiXRhU5k6b98ZFJijKyugaxCbjDJwMrQGRMZAhyKpb8aSgATVKj2uP_q5HKiUJb60O6E7nw-qbLJ1Bm9FK74FWh48n9hU9kvOCvJeo4PwLHn9A1Tbqn-T5h0vLhUA7xJwvLw
D3  http://localhost:4173/trace-atlas/?debug&seed=alpha&x=12&y=68&s=1.ZY7BDoIwEET_Zc_VIA0QezbGgwf9hFpWSqi0thVCCP_uUhMT421mZ9_sztCAmMHjgP62qhqVnEBk26pi4Dwe0Hx8xhmMGEHsFgbKPigLwfqViZq0tqYGseG05mVsLQhSMkapuoRnBQVoUAZMvtwz6HokU1LhvTUR_flyTH2TozEYOzoZAlDq8fnCXtEjfFdQ73WtyPMvePoBddvofzKng4njC3FuSLJY3g
D4  http://localhost:4173/trace-atlas/?debug&seed=delta&x=5&y=-180&s=1.ZY5BDoIwEEXvMutKKCIga2NcuNAj1DJSQqXYVgkhvbtTXBl38-fl_fwFWqgXsPhGe4tXg1LMUPOkYDBaPKCOMU1SyhN6IoGBNA9izhkbFa_oVkY3UG-yioEVvjNQ5wyE90L2q84zAqhROIyZZzsG_YAUKiq8d9qjPV-Oa9880hu0mUbhHBC1-HzhIGlIXm45g2usKOOSr3j6EVXXqn-zSFePJ9k-hPAB
D5  http://localhost:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&s=1.ZY7LDoIwEEX_ZdbVQHkEuzbGhQv9hAojECqtbYUQwr87RWNi3N07N-dkZqhBzGBxQHsNqcJSTiCi7S5hYCzuUb17lDEY0YOIFwalvtPmnLaB8Q3lRqsKxIYXDKz0rQaRMpDey7Jb8cBbVCgdhh7znEHXI5WchLdWebSn82H1TYbOoPRopHNAq8XHE_uSHkmLhESXoOD8Cx5_wKatm38y5x-uyBcCzRByki0v
H1  http://localhost:4173/trace-atlas/?debug&seed=56c2t2t8&x=-116&y=-2&s=1.ZZDdTsMwDIXfxdeh5KfaWK8R4oILkHiBrHHXaGnTJWFTVfXdsStAAu6OT_z5OF7gBM0CCa-YjqwctnaGRlc7JWBK-IiBa1nJvYAbFmjUKqhrc7mdxLsfkFtqpQV0iO5o2zMb2nwzAvI8thvhrz77OEID6t5oEDBE5zuPiRwXS0EHK0W0caD4nCP5C5SedB-Dg-bO1AKSLT7SmgJsKV9pUj_QAwa0eVtH7in2PCIVStJEvBgeFeKNDCIHT9NY9P7Us6KezoeC6eX1aQudJ2IZmGzOtGmX8PKBY8sHqvVBwBtfSh9-wOdfIM_9T5rdxqnKMBf84An880e5rusn
H2  http://localhost:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&s=1.ZY_BDoIwEET_Zc_VICjBno3x4EE_oeIKDYVCWyGE8O_u4sGot9nMvpndCQqQEzjs0d1Y3TFXI8hovU8EtA4PaN5ztBMwYAC5mQXktibPe-uYCSXp0po7yFWcCXAqaAtyK0CFoPJqwZl3aFB55HkTpwKqBmlIKRC7hJOMHaggFlBrCmNR6qJkRTsPbQK68-W4dI4toQy0ynsg12H3xCanY7dZQmVXrok_4OkL5Nx_MqXGhcv4KKNrTeDPi9FMVtvzVrKbXw
```

### `main` before any engine change

**Code measured.** The production build `index-Dhv9XsRM.js`, built at `315f7884`, whose app code (`src/`, `index.html`, `vite.config.ts`, `public/`) is identical to `main` at `abde941e`: the branch's commits so far are docs and `scripts/perf/` only. Headless Chrome 155, `vite preview` on :4173, 8 s warm-up, 120 s series (239 readings), foreground, D1's three runs in one call and D5 in the next, nothing else running, orphan count 0 before and after each call. All levels in dBFS.

| Run | `out` peak max | `out` peak mean | `out` RMS mean | `out` ≥ 0 dBFS | `pre` peak max | `pre` peak mean | `pre` ≥ 0 dBFS | `fin` |
|---|---|---|---|---|---|---|---|---|
| D1, run 1 | +4.6 | −3.0 | −13.9 | 60 of 239 (25.1 %) | +14.0 | +1.8 | 141 of 239 (59.0 %) | ok, 239 of 239 |
| D1, run 2 | +3.6 | −3.2 | −14.1 | 52 of 239 (21.8 %) | +14.5 | +1.9 | 143 of 239 (59.8 %) | ok, 239 of 239 |
| D1, run 3 | +3.0 | −2.7 | −13.6 | 56 of 239 (23.4 %) | +12.8 | +2.2 | 160 of 239 (66.9 %) | ok, 239 of 239 |
| D5 | −3.2 | −12.8 | −23.2 | 0 of 239 | +7.7 | −1.2 | 106 of 239 (44.4 %), 9 silent | ok, 239 of 239 |

**Against the roadmap's reading.** Roadmap 54 measured D1's world on `feature/robot-effect-sends` (`0de3fc06`), loaded fresh, in eight alternating 5 s windows of 150 readings a side: `out` peaks +2.2 to +3.4 dB, over 0 dBFS in 11–22 % of readings; `pre` +12 to +13 dB, mean +1.6 to +2.3 dB. Runs 2 and 3 fall inside the plan's band (`out` +2 to +4 dB, 10–25 %); **run 1 is just outside it** (+4.6 dB, 25.1 %), and `pre` reaches +14.5 dB against the roadmap's +13. The methods differ (one 120 s series against eight 5 s windows, a session link against a fresh load), and so does one seeded value: this link's EQ high band is +4.0 dB where the roadmap's world showed +1.9 dB, though the seeder's EQ draw is unchanged since `0de3fc06` (not investigated, per the finish-the-branch rule). The answer to the roadmap's question stands either way: **the level did not move. On `main`, D1's master is at or over full scale in about a quarter of its readings.**

**D5 does not clip at the master.** `bravo`'s `out` peaks at −3.2 dB and never reaches 0 dBFS, although its `pre` peaks at +7.7 dB and is at or over 0 in 44 % of readings. Its `pre` read silent (`-inf`) 9 times while `out` never did, which fits the rooms' tails sounding on after the dry signal stops (the rooms rejoin after the `pre` tap).

### The branch: the trim and the ceiling (T7, the gate)

**Code measured.** `993217fc`: `HEADROOM_TRIM_DB` −12 dB (unchanged from T4; spec assumption 3), the ceiling at knee 0.7 and oversample `'none'`; production build `index-DxO5fP4y.js`. The trim-alone rows are a build of `ab3d0616` with a one-line local edit that made the ceiling's `getToneCtor('WaveShaper')` find nothing (not committed; T5.1's fix changes nothing that build runs). Headless Chrome 155, `vite preview` on :4173 (the trim-alone build on :4174), 8 s warm-up, 120 s series (239 readings), foreground, one call at a time (D1 ×3; D2 + D3; D4 + D5; H1 + H2 with `--robot-volume-full`), nothing else measuring, orphan count 0 before and after. All levels in dBFS; the gate (spec §5.2) is in each column head.

| Run | `out` peak max (gate ≤ −0.5) | `out` peak mean | `out` RMS mean | `out` ≥ 0 dBFS (gate 0) | `pre` peak max (recorded) | `pre` peak mean | `pre` ≥ 0 dBFS | `fin` (gate ok) |
|---|---|---|---|---|---|---|---|---|
| D1, run 1 | −1.8 | −9.7 | −20.6 | 0 of 239 | +2.1 | −10.2 | 5 of 239 (2.1 %) | ok, 239 of 239 |
| D1, run 2 | −2.3 | −9.6 | −20.5 | 0 of 239 | +1.4 | −10.0 | 8 of 239 (3.3 %) | ok, 239 of 239 |
| D1, run 3 | −2.2 | −9.3 | −20.3 | 0 of 239 | +1.8 | −9.7 | 2 of 239 (0.8 %) | ok, 239 of 239 |
| D2 | −12.9 | −17.9 | −27.6 | 0 of 239, 19 silent | −12.6 | −23.0 | 0 of 239, 20 silent | ok, 239 of 239 |
| D3 | −6.2 | −9.7 | −19.8 | 0 of 239 | −7.4 | −15.5 | 0 of 239 | ok, 239 of 239 |
| D4 | −5.1 | −9.3 | −20.5 | 0 of 239 | +2.1 | −7.6 | 22 of 239 (9.2 %) | ok, 239 of 239 |
| D5 | −6.9 | −13.1 | −23.4 | 0 of 239, 5 silent | −4.2 | −13.4 | 0 of 239, 9 silent | ok, 239 of 239 |
| H1 | **−0.6** | −2.3 | −12.2 | 0 of 239 | +11.1 | +4.9 | 238 of 239 (99.6 %) | ok, 239 of 239 |
| H2 | −2.0 | −7.2 | −17.2 | 0 of 239, 8 silent | +12.6 | +6.0 | 205 of 239 (85.8 %), 13 silent | ok, 239 of 239 |

**Every gate is met on all seven variants.** H1, the hand push, sits at the ceiling's own top: −0.65 dBFS, which the overlay rounds to −0.6.

**Trim alone, and the ceiling that was empty.** The first complete run (build of `ab3d0616`) stopped the gate: its ceiling had no curve (Tone's `WaveShaper` reads `mapping`, not `curve`; fixed in T5.1, spec §7), so that build was trim-alone in effect. Its H1 row, beside the trim-alone build's two runs:

| Run | `out` peak max | `out` peak mean | `out` RMS mean | `out` ≥ 0 dBFS | `pre` peak max | `pre` peak mean | `pre` ≥ 0 dBFS |
|---|---|---|---|---|---|---|---|
| D1, trim alone | −2.2 | −9.7 | −20.6 | 0 of 239 | +1.1 | −10.3 | 4 of 239 (1.7 %) |
| H1, trim alone (an extra run, not in the plan) | +2.3 | −1.8 | −12.2 | 38 of 239 (15.9 %) | +10.2 | +4.9 | 238 of 239 (99.6 %) |
| H1, the empty ceiling (`ab3d0616`) | +2.7 | −1.8 | −12.3 | 40 of 239 (16.7 %) | +10.9 | +4.7 | 238 of 239 (99.6 %) |
| H1, the ceiling (`993217fc`, above) | −0.6 | −2.3 | −12.2 | 0 of 239 | +11.1 | +4.9 | 238 of 239 (99.6 %) |

What the trim alone showed: **on D1 at the seeded defaults the trim alone is enough** (`out` −2.2 dB, never at 0); the plan expected D1 to still touch 0 dBFS, and it did not. The ceiling is what holds a **hand-pushed** world: H1 without it is over full scale in about one reading in six, with it never, at the same RMS (−12.2 against −12.3 dB): the ceiling takes the peaks and leaves the level. The empty-ceiling run's other eight rows sat within the run-to-run spread of the table above, except `bravo`'s (below); its `pre` readings, upstream of the ceiling, are what the trim decision was made on: `pre` peaked over −6 dBFS on D1, D4 and D5 at −12 dB, stepping the trim to meet that would have gone near −22 dB, and Crawford held −12 dB with `pre` recorded, not gated (spec assumption 3).

**Against `main`.** D1: `out` peak max from +3.0 to +4.6 dB down to −1.8 to −2.3 dB; readings at or over full scale from 22–25 % to none; `out` RMS mean from −13.9 (the three runs' average) to −20.5 dB, **6.6 dB quieter**; `pre` peak mean down 12 dB, the trim. D5: `out` RMS mean −23.2 on `main` against −23.4 here and −27.2 in the empty-ceiling run, **0.2 to 4.0 dB quieter**. That `out` moves less than `pre` fits the seeded Compressor (spec survey): above its threshold an input change of x dB leaves as x / ratio, so D1's 2:1 halves the trim (−6 dB) and D5's 4:1 quarters it (−3 dB).

**`bravo` varies between loads of the same link.** D5's `out` peak mean read −13.1 dB here and −17.0 dB in the empty-ceiling run, and H2's RMS mean −17.2 against −25.6 dB, from identical links; the ceiling cannot raise a level, so this is the world's own variation from load to load (its silent readings vary with it), not investigated (finish the branch first). A `bravo` comparison needs several runs a side; D1's runs agree within 0.3 dB of RMS.

### The ceiling's audio-thread cost (T8)

`npm run perf:audio` on D5's link (`bravo:-150:90?session=…`, the session value as in the table of links), 240 s series, 15 s buckets, 8 s warm-up, in one foreground call: `main` first, then the branch. Both builds served side by side from one directory on :4173 (the `@page` form): the branch's `index-DxO5fP4y.js` (`993217fc`) as `index.html`, `main`'s `index-Dhv9XsRM.js` (`abde941e`, the same bundle T3 measured, rebuilt from a `git archive` of `main`) as `main.html`, every shared asset byte-identical. Headless Chrome 155, orphan count 0 before and after. Both runs played the same world: the overlay's audible-robot series matched bucket for bucket (5.0, 7.9, 9.3, 9.8, … robots).

| Build | Overall mean capacity | Peak 15 s window | Overall max |
|---|---|---|---|
| `main` | 0.558 | 0.687 (at 45 s) | 0.991 |
| branch | 0.545 | 0.650 (at 180 s) | 0.991 |

**Within the gate** (spec §5.3: the branch's mean within +0.02 of `main`'s): the branch read 0.013 *lower*. A build with one more node cannot be cheaper, so that is the run-to-run spread, and the WaveShaper at oversample `'none'` costs less than this method resolves.

### After T9: the seeded Compressor release at 0.25–0.3 s (the gate re-run)

**Why.** Checkpoint A (spec §7) heard one world crunch, `6j0mgo5z` at (−132, 83) with every robot Volume at 100 %: its seeded Compressor's 70 ms release under 13–17 dB of gain reduction, not clipping and not the ceiling. T9 raised the seeded release band from 0.05–0.3 s to 0.25–0.3 s, and T7's complete run was repeated.

**Code measured.** `1c13470d`, production build `index-BPtv2uVr.js`. **The links:** T3's payloads carry the whole `globalAudio`, so they pin the old seeded release (0.068–0.126 s). Each was rebuilt with only `g.compressor.release` replaced by its world's new seeded value (`generateGlobalAudioSettings` run through `vite-node`, rounded to three decimals as `buildSessionPayload` does): D1 and H1 0.071 → 0.259 s, D2 0.068 → 0.258, D3 0.069 → 0.258, D4 0.125 → 0.274, D5 and H2 0.126 → 0.275. Every other field, the drawn ping variance included, is T3's, so the release is the only difference from the table above. Plus **X1**, the world Checkpoint A heard: `6j0mgo5z` at (−132, 83), its seeded defaults (a link made by T3's recipe on the dev server, its release 0.070 → 0.259 s the same way), run with `--robot-volume-full`. Method as above, one call at a time (H1 + H2 + X1; D1 ×3; D2 + D3; D4 + D5), orphan count 0 before and after.

| Run | `out` peak max (gate ≤ −0.5) | `out` peak mean | `out` RMS mean | `out` ≥ 0 dBFS (gate 0) | `pre` peak max (recorded) | `pre` peak mean | `pre` ≥ 0 dBFS | `fin` (gate ok) |
|---|---|---|---|---|---|---|---|---|
| D1, run 1 | −3.6 | −10.0 | −21.0 | 0 of 239 | +1.6 | −10.2 | 7 of 239 (2.9 %) | ok, 239 of 239 |
| D1, run 2 | −2.9 | −9.8 | −20.9 | 0 of 239 | +0.9 | −9.8 | 6 of 239 (2.5 %) | ok, 239 of 239 |
| D1, run 3 | −2.5 | −10.0 | −20.9 | 0 of 239 | +1.8 | −10.0 | 7 of 239 (2.9 %) | ok, 239 of 239 |
| D2 | −12.9 | −18.3 | −28.2 | 0 of 239, 19 silent | −11.3 | −23.0 | 0 of 239, 20 silent | ok, 239 of 239 |
| D3 | −5.8 | −10.1 | −20.5 | 0 of 239 | −7.8 | −15.5 | 0 of 239 | ok, 239 of 239 |
| D4 | −5.7 | −9.7 | −20.9 | 0 of 239 | +2.3 | −7.5 | 24 of 239 (10.0 %) | ok, 239 of 239 |
| D5 | −8.0 | −13.5 | −23.9 | 0 of 239, 4 silent | −4.4 | −13.2 | 0 of 239, 9 silent | ok, 239 of 239 |
| H1 | −0.6 | −2.0 | −12.0 | 0 of 239 | +11.6 | +5.4 | 234 of 239 (97.9 %) | ok, 239 of 239 |
| H2 | −2.1 | −7.6 | −17.5 | 0 of 239, 8 silent | +13.1 | +6.2 | 209 of 239 (87.4 %), 13 silent | ok, 239 of 239 |
| X1, every robot 100 % | −0.9 | −5.0 | −15.2 | 0 of 239 | +10.6 | −0.9 | 118 of 239 (49.4 %) | ok, 239 of 239 |

**Every gate is still met, on all eight runs.** The slower release barely moves the level: D1's `out` RMS mean −20.9 dB against −20.5 before T9 (a release that holds gain reduction longer reads a little quieter), D5's −23.9 against −23.4 (inside `bravo`'s spread); `pre`, upstream of the Compressor, is unchanged within the run-to-run spread. X1 at full Volume peaks at −0.9 dB, under the ceiling's top. Whether its crunch is gone is an ear's question: Checkpoint A heard a 0.25 s release fix it in the Output tab, and this seeded world now loads with 0.259 s.

The eight links (the T9 rebuilds), re-minted 2026-10-25 as world links the same way as the seven above:

```
D1  http://localhost:4173/trace-atlas/?debug&seed=56c2t2t8&x=-116&y=-2&s=1.ZZDBTsQgEIbfZc5YC9TV9myMBw-a-AIsTLdkaamA3TRN392BqMlmbzM_883_DxucoNsg4ILhmCuDWq3QierAGcwBn9Hlvq7qRwYXTNDxndFUUfM4FZ92xDzScMGgRzRHpc9ZEPKPYRDXSRfCLjZaP0EH_F4KYDB6Y3uLgRTjU0IDO1loP5J9jJ70DdJA9eCdge5ONgyCStZTTAYqpV-3WjzRAzpUscQRDy2D84TU8Jo29tYlDG_vL2XhOpMOzl9mFSOl6AN-feOk8_GNIPIj_4Jo_8HXK3Cwp-GWlIfC8Uq2-YZ5yTnk_gM
D2  http://localhost:4173/trace-atlas/?debug&seed=charlie&x=200&y=-30&s=1.ZY7LDoIwEEX_ZdbVQHnEdG2MCxf6CRVGSqi0thVCCP_uFI2JcXfv3JyTmaEBMYPDAd01phorOYFItuWOgXW4R_3uScpgxAAiXRhU5k6b98ZFJijKyugaxCbjDJwMrQGRMZAhyKpb8aSgATVKj7Hzgvxdj1RKEt5aHdCdzofVN1k6gzajld4DrQ4fT-wreiTnBXkvq4J_weMPqNpG_ZM8_3BpuRBoh5jz5QU
D3  http://localhost:4173/trace-atlas/?debug&seed=alpha&x=12&y=68&s=1.ZY7LDoIwEEX_ZdZoeKSiXRvjwoV-Qi0jJVRa2wohhH93qMbEuLu3t-dkJqiBT-CwR3ddUoVSjMDTdVkmYB3uUb97WiQwYACezQlIc6fNe-MWJijKyugK-Kqgb06ExgCnJEIQso14ymhAjcLj0nO2TaDtkMqGhLdGB3Sn8yH6RkvPoM1ghfdAq8PHEztJhxQZI-8lKvIvePwBVVOrfzLffbhiJs72MbL5BQ
D4  http://localhost:4173/trace-atlas/?debug&seed=delta&x=5&y=-180&s=1.ZY5BDoIwEEXvMutKoBrAro1x4UKPUMtICZViWyWE9O5OcWXczZ-X9_MXaEEs4PCN7pauBpWcQRRZyWB0eECTYp7llCcMRCIDZR_EvLcuKUHTra1pQGx4zcDJ0FkQOwYyBKn6VS84ATQoPabMK8L9gBRqKrx3JqA7X45r3zzSG4ydRuk9EHX4fOGgaMiu2hYMrqmiSku-4ulH1F2r_80yX70i4_sY4wc
D5  http://localhost:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&s=1.Zc5NDoIwEAXgu8y6GuRP7NoYFy70CBVGSqi0thVCCHd3isbEuHuvk--lE9TAJ7DYo72GVGEpRuDRepcwMBb3qN49yhgM6IFvZgalvtPNOW2D8ZKy1KoCvooLBlb4RgNPGQjvRdkuPHiLCoXD0OMt9bZDKjkN3hrl0Z7Oh2VvNPQMSg9GOAd0tfh4YlfSR9IiIXhZJuIvPP5A2dTyX-bxxxX5TND0ISfZ_AI
H1  http://localhost:4173/trace-atlas/?debug&seed=56c2t2t8&x=-116&y=-2&s=1.ZZDBTsMwDIbfxedQ2qQM1jNCHDiAxAtkjbtaS5suCZuqqu-OXQEScPv9x99vxwscoVkg4gXjQZTD1s7Q6GJXKZgiPqKXuizKewVXzNBUq-KuzZV2Fu80oLTUlVbQIbqDbU9iaPPNKEjz2G4EXShRGKGB6tZoUDAERx1hZMeFnNHByiPaMPD4lAL7C-SedR-8g-bG1AqizRR4TQU2569ppX7gB_Ro07aOvtsrOI3IRVVyIp6NRPlwZYPJgThNRE_HXhT3dOQzxpfXp23oPDErwGRT4k27iOcPHFs5UK05_U0upfc_4PMvUHL_k2a3cVVhhPM0EIN__liu6_oJ
H2  http://localhost:4173/trace-atlas/?debug&seed=bravo&x=-150&y=90&s=1.ZY_NDoIwEITfZc_VIPiDPRvjwYM-QsUVGgqFtkII4d3dxYNRbzPZ_WZ2R8hBjuCwQ3djdcdMDSCj5T4R0Dg8oHn7aCOgxwByNQnIbEUz761jJhSkC2vuIBdxKsCpoC3ItQAVgsrKGWfeoUHlkX28I1_WSGZLgdgmnGRsTwWxgEpTGItC5wUr2nloE9CdL8e5c2gIZaBR3gNNHbZPrDM6dp0mFH6daz7g6Qvk3H9yS40zl_JRRleawJ8Xo4lGTcdbyWZ6AQ
X1  http://localhost:4173/trace-atlas/?debug&seed=6j0mgo5z&x=-132&y=83&s=1.ZY7NDoIwEITfZc-V8CcqZ2M8eNBHqGWlhEprWyGE8O5u68l4m9nJNzsLtFAvYHFEew-qQcFnqLOkKBgYi0dUwadJWjKY0FO0MhD6SZlz2gbGS9JSqwbqTcAs952GmhT3nos-4llOASrkDoPPtwcG_YBk9lT46JRHe7meYt9s6AxKT4Y7B5RafL1xEDSkyIqKwS1U7MKSL3j-AWXXyn8yp4eRK6uVQDNGvX4A
```

## Oscillator Leak Fix — the T3 proof run, patched against stock (2026-10-23, backlog 32)

Spec [specs/OSCILLATOR_LEAK_FIX.md](specs/OSCILLATOR_LEAK_FIX.md) §5.2, plan [tasks/OSCILLATOR_LEAK_FIX.md](tasks/OSCILLATOR_LEAK_FIX.md) Task 3. The question: does the shipped patch (`patchOscillatorEndedDisconnect`, applied at boot by `audioContextSetup.ts`) close the leak the way step 2's throwaway build did, and does it cost anything? The band to read against is backlog 27's step 2 A/B in [todo/scratchy-audio-phones.md](todo/scratchy-audio-phones.md) ("Backlog 27, desktop step 2"): stock about +320 oscillators in 240 s, patched about +20 to +60 in step with `Gain`.

**Builds.** Patched: `fix/oscillator-leak` at `13ee3b7d` (T2), `npm run build -- --outDir <scratch>/t3-patched`, bundle `index-BJ-YFaEE.js`, `vite preview` on :4177. Stock: `39dd3629`, the commit before T2, from a clean `git worktree` checkout, built the same way to `<scratch>/t3-stock`, bundle `index-DekV9Q83.js`, on :4179. The stock hash is the step 1 build's: `tonePatches.ts` has no caller there and is tree-shaken out, so stock is byte-identical to what step 1 measured, and the two builds differ only by the boot call (`oscillatorEndedDisconnect` appears once in the patched bundle, never in the stock one). Ports 4173 and 4175 were held by an earlier session's preview servers and were left alone; the harness took `--url`.

**Command.** `npm run perf:audio -- --world "d1:-116:-2?load=light&session=<D1>" --url http://localhost:<port>/trace-atlas/ --seconds 240 --bucket 15`, D1 being the "seven links" payload above (`56c2t2t8`, Compressor release 0.071 s, the one steps 1 and 2 used, not the T9 rebuild). Headless Chrome, three rounds interleaved (stock patched, patched stock, stock patched), foreground, one run per call, orphaned Chrome 0 before and after. **Pin check** passed on all six: the overlay landed at (−116, −2), `load 20%·fx 20%`, `latency playback`, `fx in 5/10`, `links 43/91`, as in step 1. Mean audible 5.30–5.32 on every run (the same world curve).

| Round | Build | mean cap | peak window | overall max | nodes first → last | by type | heap MB | max lag range |
|---|---|---|---|---|---|---|---|---|
| 1 | stock | 0.500 | 0.568 | 0.898 | 1801 → 2124 (+322) | Oscillator +325, Gain +48 | +7.9 | 11–20 ms |
| 1 | patched | 0.500 | 0.546 | 0.995 | 1795 → 1841 (+46) | Gain +30, Oscillator +23 | +7.6 | 11–21 ms |
| 2 | patched | 0.511 | 0.582 | 0.995 | 1793 → 1841 (+48) | Gain +30, Oscillator +23 | +5.7 | 10–20 ms |
| 2 | stock | 0.513 | 0.621 | 0.997 | 1799 → 2128 (+329) | Oscillator +328, Gain +54 | +7.3 | 9–22 ms |
| 3 | stock | 0.487 | 0.529 | 0.995 | 1800 → 2128 (+327) | Oscillator +325, Gain +54 | +9.5 | 7–23 ms |
| 3 | patched | 0.516 | 0.717 | 0.995 | 1794 → 1841 (+47) | Gain +48, Oscillator +32 | +3.4 | 10–23 ms |

**Against the plan's criteria.**
- **The leak is closed: met, 3 of 3.** Patched `Oscillator` +23 / +23 / +32 in 240 s, in step with `Gain` (+30 / +30 / +48), inside step 2's band; stock +325 / +328 / +325, as step 2 read (+322 to +325). The shipped wrapper does what the throwaway one did, and the patched node count ends at 1841 on all three rounds.
- **Max lag: met.** Patched 10–23 ms, stock 7–23 ms; no growth over the four minutes on either.
- **Mean capacity and peak window inside the stock spread: met on rounds 1 and 2, missed on round 3.** Stock's three rounds span 0.487–0.513 on the mean and 0.529–0.621 on the peak window. Patched round 3 reads 0.516 (0.003 above) and 0.717 (0.096 above). The peak is one 15 s bucket at 90 s; that run's next-highest bucket is 0.580, inside the stock range, and stock round 2 has the same shape (0.621 at 30 s, next 0.555). Pooled with step 2's same-world rounds, stock's means span 0.487–0.579 and patched's 0.500–0.558; the 0.717 bucket is above every stock peak window in both sittings (highest 0.648), and above step 1's D1 peaks (0.554–0.659). Overall max (the 0.99 bursts) is the same on both builds.
- **Pin check: met** on every run.

**Reading.** The fix works and the leak is gone. On cost, five of the six patched figures sit inside stock's spread and one 15 s bucket does not. One bucket on one round is the shape of noise; step 2's three patched rounds (0.617–0.650) showed nothing like it. But the criterion as written is missed, and this run alone cannot rule a cost out. Not re-run or re-tuned here: whether to take more rounds is Crawford's call at Checkpoint B.

**Checkpoint B (Crawford, 2026-10-23):** the round 3 bucket accepted as noise, no more rounds; his listen on the desktop passed (no change to the sound, no click at a note's end).

## BeatClock passes the Transport time — the console check (2026-10-26, backlog 35)

Spec [specs/BEATCLOCK_TRANSPORT_TIME.md](specs/BEATCLOCK_TRANSPORT_TIME.md) §5.2, plan [tasks/BEATCLOCK_TRANSPORT_TIME.md](tasks/BEATCLOCK_TRANSPORT_TIME.md) Task 11. The question: is Tone's "Events scheduled inside of scheduled callbacks should use the passed in scheduling time" warning gone now that the swell tick passes the callback's time to every write? The tally is `perf:audio`'s `console:` line (T10): every `Runtime.consoleAPICalled` from navigation on, warnings and errors listed by first line. Tone warns once per page, on the first offending write, so stock must read 1 and the branch 0.

**The links.** Two world links on `charlie` (200, −30), minted on `npm run dev` in headless Chrome by importing the app's own modules: `useAudioStore.getState().setSwellFrequency(f)` and `setSwellDuration(1)`, then `buildShareUrl(buildSessionPayload())`; each was reloaded and the store read back (16 / 1 and 0 / 1; the boot world's own values were 3 / 3). Swell Frequency 16 per measure is `SWELL_FREQUENCY_STEPS`' top step and Duration 1 measure `SWELL_DURATION_SCHEMA`'s minimum, so both swell pools run swells back to back. The control (Frequency 0) is Task 12's.

| Link | Swell frequency / duration | URL (default `vite preview` host) |
|---|---|---|
| S1, swell-heavy | 16 / 1 | `http://localhost:4173/trace-atlas/?seed=charlie&x=200&y=-30&s=1.q1YqTlOyMjTTUSpOAdK1AA` |
| S0, control | 0 / 1 | `http://localhost:4173/trace-atlas/?seed=charlie&x=200&y=-30&s=1.q1YqTlOyMtBRKk5RsjKsBQA` |

**Builds.** Stock: `main` at `ff5155ce` (the branch's base), from a clean `git worktree` checkout, `npx vite build --outDir <scratch>`, bundle `index-DdMlmlwt.js`, `vite preview` on :4174. Branch: `fix/beatclock-transport-time` at `7435d138` (T10; `src/` as at T9's `7a4c7878`), built the same way, bundle `index-CGIdmOHf.js`, on :4173.

**Command.** `npm run perf:audio -- --url http://localhost:<port>/trace-atlas/ --world "charlie:200:-30?s=1.q1YqTlOyMjTTUSpOAdK1AA" --seconds 120 --bucket 15` (the harness takes the link as a `name:x:y?s=` spec, not the URL). Headless Chrome, three rounds interleaved (stock branch, branch stock, stock branch), foreground, one run per call, orphaned Chrome 0 before and after. **Pin check** passed on all six: `charlie @ 200,-30`, `load 100%·fx 100%`, `latency interactive`.

| Round | Build | warnings | errors | Tone scheduling line | mean cap | peak window | overall max |
|---|---|---|---|---|---|---|---|
| 1 | stock | 1 | 0 | 1 | 0.495 | 0.636 | 0.990 |
| 1 | branch | 0 | 0 | absent | 0.505 | 0.651 | 0.990 |
| 2 | branch | 0 | 0 | absent | 0.496 | 0.618 | 0.988 |
| 2 | stock | 1 | 0 | 1 | 0.495 | 0.615 | 0.991 |
| 3 | stock | 1 | 0 | 1 | 0.491 | 0.599 | 0.991 |
| 3 | branch | 0 | 0 | absent | 0.483 | 0.623 | 0.903 |

**Against the plan's criteria.**
- **The metric is proven: met, 3 of 3.** Stock's only console line in every round is the Tone warning, count 1.
- **The warning is gone: met, 3 of 3.** The branch logged nothing at all: 0 warnings, 0 errors.
- Backlog 36's `pulseWidth` line did not appear on either build on this world, so it did not need telling apart here.

The capacity columns are context, not a criterion (the change moves no sound): the branch's means (0.483–0.505) and peak windows (0.618–0.651) are each within 0.02 of stock's range (0.491–0.495, 0.599–0.636), run-to-run noise on this harness.

### The swell tick's main-thread share (Task 12)

Spec §5.3, plan Task 12: the number behind spec §7 question 2, whether the pre-scheduled swell curve is ever built. **Threshold** (plan, Architecture Decisions): build it only if, at 4× throttle, the swell tick's inclusive share of the IDLE window exceeds **2 %** of sampled time with the store half (`updateRobot` and below) excluded, or any task ≥ 50 ms in the window is attributed to the tick.

**Build.** `fix/beatclock-transport-time` at `2cf452df` (`src/` as at `7a4c7878`), `npx vite build --minify false --outDir <scratch>`, bundle `index--X0VW9Mz.js`, `vite preview` on :4174. **Command.** `npm run perf -- --url "http://localhost:4174/trace-atlas/?seed=charlie&x=200&y=-30&s=<S1 or S0>" --profile --throttle 4`, headless Chrome, six runs interleaved S1 S0 S1 S0 S1 S0, foreground, one per call, orphaned Chrome 0 before and after. `profile.mjs` prints only the top 20 inclusive functions, so the runs used a scratch copy that differs in one thing: after each window it also saves the raw CPU profile and the page's long-task entries inside the window (the `PerformanceObserver` `profile.mjs` already installs). The shares below are sample-weighted inclusive time over the **IDLE (blank hub)** window's sampled time (6811–7424 ms per run), counting a sample once when the function is anywhere on its stack, as `profile.mjs` does. A long task "holds" tick time when a sample with `tickAudioSwells` on its stack falls inside it.

| Share of sampled time | S1 run 1 | S1 run 2 | S1 run 3 | **S1 median (min–max)** | S0 median (min–max) |
|---|---|---|---|---|---|
| `tickAudioSwells`, inclusive | 4.13 % | 4.21 % | 6.45 % | **4.21 % (4.13–6.45)** | 0.01 % (0.00–0.02) |
| tick with the store half excluded | 3.35 % | 3.38 % | 5.68 % | **3.38 % (3.35–5.68)** | 0.01 % (0.00–0.02) |
| store half: `updateRobot` under the tick | 0.78 % | 0.83 % | 0.77 % | **0.78 % (0.77–0.83)** | 0 |
| Tone half: the four robot engine methods | 2.41 % | 2.22 % | 4.66 % | **2.41 % (2.22–4.66)** | 0 |
| global pool: `setGlobalAudio` (its engine setters) | 0.59 (0.23) % | 0.96 (0.48) % | 0.72 (0.36) % | 0.72 (0.36) % | 0 |
| long tasks in the window / holding tick time | 4 / 2 | 4 / 2 | 6 / 1 | | 1–2 / 0 |

The long tasks that hold tick time: run 1 a 185 ms task (26.8 ms of tick) and a 92 ms one (8.1 ms); run 2 163 ms (22.9 ms) and 61 ms (15.9 ms); run 3 175 ms (36.2 ms). In each, Tone's clock callbacks (`forEachTickBetween`, which runs every scheduled callback, notes and the tick alike) hold 88–121 ms and React's render microtask 35–36 ms. The tick is part of those tasks, never all of them. Across the whole window, Tone's clock callbacks take 11.2–13.5 % on S1 and 7.2–7.4 % on S0. The 4–6 point difference is about the tick's own share.

**Where the tick's time goes.** Each tick sample is put in one bucket, in this order: the store, then the oscillator setting path, then the envelope, then the param writes, then the global setters, then the rest.

| Bucket, share of sampled time | S1 run 1 | S1 run 2 | S1 run 3 | Would a param curve remove it? |
|---|---|---|---|---|
| oscillator settings: `applyOscFieldViaSet` → Tone's oscillator `set` (phase, pulse width), of which native `createPeriodicWave` | 2.02 % (1.46) | 1.87 % (1.20) | 4.17 % (2.93) | No. Phase and pulse width are settings, which stay stepwise in the agreed design. |
| of the settings row, under Tone's `phase` setter / the rest (pulse width) | 1.90 / 0.12 % | 1.82 / 0.05 % | 4.10 / 0.07 % | |
| robot param writes: volume, sends, layer gain and detune (`rampOrSet`, `setOrPoint`, `applyOscDetune`) | 0.21 % | 0.21 % | 0.24 % | Yes |
| global setters: EQ, LPF, HPF | 0.23 % | 0.48 % | 0.36 % | Yes |
| envelope: `updateVoiceEnvelope` | 0.18 % | 0.13 % | 0.25 % | No. The envelope is read at trigger. |
| store: `updateRobot` | 0.78 % | 0.83 % | 0.77 % | Excluded by the threshold |
| the rest: the tick's rolls, bookkeeping, `setGlobalAudio`'s store write | 0.71 % | 0.68 % | 0.66 % | Partly: the per-tick interpolation goes, the rolls stay |

Inside `updateVoiceLayerParams` in run 3, 295 of 310 ms is the settings path, 210 ms of it `createPeriodicWave`. The param writes in the same method total about 12 ms.

**Verdict (spec §7 question 2): the threshold is cleared, by the rule as written.** With the store half excluded the tick reads **3.38 %** (median; 3.35–5.68), against **2 %**. The second condition is ambiguous: no ≥ 50 ms task is the tick's alone, but five tasks of 61–185 ms hold 8–36 ms of it each. The first condition decides it either way. The breakdown changes what building the curve would buy. The part a param curve takes off the main thread is the robot param writes and the global setters: **0.45 / 0.70 / 0.60 %** (median 0.60 %). Adding the whole "rest" bucket gives an upper bound of about 1.3 %, still under the threshold. Most of the tick is phase writes rebuilding a periodic wave on every `16n` (Tone's `phase` setter re-runs its `type` setter, which misses its wave cache for each new phase; pulse width, a Signal, is 0.05–0.12 %), and the agreed design leaves phase stepwise. The phase cost is backlog [37](todo/backlog.md#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick). **Decided at Checkpoint C (Crawford, 2026-10-26): the curve is not built; the phase cost is backlog 37.**

## Phase and pulse width off the swell targets — the console check (2026-10-26, backlog 36/37)

Spec [specs/SWELL_PHASE_PULSE_WIDTH_CUT.md](specs/SWELL_PHASE_PULSE_WIDTH_CUT.md) §5.2, plan [tasks/SWELL_PHASE_PULSE_WIDTH_CUT.md](tasks/SWELL_PHASE_PULSE_WIDTH_CUT.md) Task 6. The question: is backlog 36's flood, `[AudioEngine] Failed to set pulseWidth on composite layer`, gone now that no swell targets `layerN.pulseWidth`? The line is a `devWarn`, which prints only when `import.meta.env.DEV` is true, so both builds ran on the Vite dev server, not `vite preview`.

**The harness on a dev server (step 1).** `perf:audio` drives `npm run dev` unchanged: a 15 s probe on stock passed the pin check (`charlie @ 200,-30`, `load 100%·fx 100%`, `latency interactive`) and read the `?debug` overlay. No harness change was needed.

**Builds.** Stock: the branch base `main` at `12008fd9`, from a clean `git worktree` checkout (`node_modules` a junction to the main checkout's), `npx vite --port 5180 --strictPort`. Branch: `fix/swell-targets` at `2b094f68` (37 and 38, Checkpoint A2), its own checkout, `npx vite --port 5181 --strictPort`.

**Command.** `npm run perf:audio -- --url http://localhost:<port>/trace-atlas/ --world "charlie:200:-30?s=1.q1YqTlOyMjTTUSpOAdK1AA" --seconds <n> --bucket <b>` on S1 (Swell Frequency 16, Duration 1; spec §7 Q3: no other world remembered). Headless Chrome, foreground, one run per call, orphaned Chrome 0 before and after. Pin check passed on all three runs.

| Run | Build | Seconds | warnings | errors | pulse-width line | distinct first lines |
|---|---|---|---|---|---|---|
| 1 | stock | 120 | 0 | 0 | absent | none |
| 2 | stock (§7 Q3 fallback) | 300 | 0 | 0 | absent | none |
| 3 | branch | 300 | 0 | 0 | absent | none |

**Against the plan's criteria.**
- **The metric: unproven.** Stock did not print the pulse-width line on S1 in 120 s, nor in the fallback's 300 s. The line needs a pulse-width swell on a layer with no stored `pulseWidth`, and none occurred in either run; backlog 35's six `vite preview` runs on this world (above) did not show it either, though a production build could not have printed it. Per spec §7 Q3 the check is recorded as unproven, and the proof that the flood is gone is Task 4's test: no robot swell starts on `layerN.phase` or `layerN.pulseWidth`, and the started set equals a literal 16-id array.
- **No new line on the branch: met.** The branch logged nothing at all, 0 warnings and 0 errors, so there is no first line stock lacks.

Dev-mode capacity is not compared (spec §5.2); for the record, the overall means were 0.485 and 0.463 on stock's two runs and 0.480 on the branch's.

## Steady-state review — what runs continuously, and which of it can pop (2026-10-26)

Crawford, hearing cracks and pops on the desktop (not level distortion), asked for a review of everything that runs
continuously while the world plays: the Transport ticks, the store writes they make, what React re-renders for them,
and what GSAP writes per frame. A code read on `main` at `959a989b`, not a measurement; the one measured number it
leans on is the swell tick's share above (Task 12). Two of the findings were not in the backlog and are now
[38](todo/backlog.md#38-audio-swell-writes-land-as-steps-not-ramps) and
[39](todo/backlog.md#39-main-thread-recurring-store-writes-fan-out-to-the-world-view-measure-first).

### Two mechanisms, told apart by the overlay

A pop is either a **discontinuity** (a parameter or waveform jumps while a note sounds; the audio thread is fine and
`underruns` stays flat) or an **underrun** (the render thread misses its deadline, from its own standing load or from a
main-thread task longer than Tone's 100 ms `lookAhead`). The `?debug` overlay separates them: pops with `underruns`
flat and `lag` low are discontinuities; `underruns` rising with `max lag` under 100 ms is the audio thread;
`underruns` rising with lag spikes is the main thread. The quickest A/B for the first kind is Swell Frequency at 0 in
the Audio Rig.

### Ranked

| # | What runs | How often | Why it costs, or pops | Record |
|---|---|---|---|---|
| 1 | A phase swell's write | every `16n` per swelling layer | Tone's `phase` setter re-runs `type`, which builds a periodic wave (most of the tick's CPU, Task 12) and calls `setPeriodicWave` on the **sounding** native oscillator: a waveform jump mid-note. | [backlog 37](todo/backlog.md#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick), decided |
| 2 | Every other swell write through `setOrPoint` (`src/engine/audioEngine/voiceEntry.ts`) | every `16n` per active swell | A bare `setValueAtTime`: layer gain (range 0–2, minimum swing half the range, times Intensity), EQ3 low/mid/high (±12 dB), LPF/HPF Q and detune each move as 16 hard steps a measure, a staircase on a sustained note. Volume, the sends and the filter frequencies ramp (50 ms) and are fine. Backlog 35 dropped the pre-scheduled curve on a CPU criterion; the audible staircase was never the criterion. | [backlog 38](todo/backlog.md#38-audio-swell-writes-land-as-steps-not-ramps), new |
| 3 | `updateAllPanners` (`src/engine/AudioEngine.ts`) | every `16n` per swimming robot | Writes `pan.value` directly (cancel + `setValueAtTime`), a step on every sounding robot in motion; the slider path (`updateRobotPan`) ramps 50 ms. | folded into 38 |
| 4 | The swell tick's store writes | 25–65 writes/s with both pools full | `updateRobot` rebuilds the locale, so every robot swell write re-renders Robot → RobotBody → RobotGem (RobotGem's memo is defeated: RobotBody hands it new `palette`, `orbiters` and `halo` objects each render), LightShafts and both TerrainLayers (they select the whole locale and recompute the terrain outline and facets), and a `layer1.gain`/`layer2.gain` swell rebuilds the strip-flicker timeline every tick because the gain is in the trigger tuple. EQ/filter swells re-render 6–9 ChargingStation fragments. The audio budget's `signature()` string runs per write. Zustand renders at the blocking lane, inside the Tone clock callback. Measured: the store half under 1 % and React about a third of the long tasks it sat in (Task 12). | [backlog 39](todo/backlog.md#39-main-thread-recurring-store-writes-fan-out-to-the-world-view-measure-first), new |
| 5 | The 1 Hz clock tick (`AttenuationStyleView`'s `setInterval` → `activeLocaleLocalTime`) | once a second, powered off too | About 60 Factories (fills, facets, window grids), every scenery actor, the 12 world robots, water, shafts and terrain subscribe to the float; LocaleView → OceanScene (neither memo'd) cascades to every non-memo child. One burst a second: a long-task candidate only if the burst exceeds 100 ms, which is unmeasured. | 39 |
| 6 | The battery tick (`tickRobotLifecycle`) | 10–12 separate `updateRobot` sets per measure | Each set carries the full fan-out of row 4, for a dimming overlay that is a step function and usually changes nothing visible. One batched set would do. | 39 |
| 7 | The audio graph's standing cost | always | Audio-rate LFO modulation of biquads (global LPF/HPF frequency and Q, each robot's `bus.frequency` link, Phaser and AutoWah when lit) recomputes coefficients per sample; plus the node count. The only row that explains underruns proper. | [backlog 27](todo/backlog.md#27-audio-phone-playback-underruns-at-light-load-main-included), the interview |
| 8 | Per-frame rendering residue | per frame | Job decorations write SVG attributes per working robot, halo waves read `getScreenCTM` twice a frame during a station arc, bubble streams tween continuously, a camera pan re-rasters the marker sheet and shell layer (the 2026-10-18 section above). Roadmap 53 took the bulk; nothing measured points at the remainder. | none |

Checked and fine: the melody tick's per-note work (two roster finds, three `alea` draws, one `Tone.Time` parse per
note), bypass-cell connects (only on a Mix crossing zero), the reverb IR rebuild (coalesced), the deck camera at scroll
range 0 (a no-op), session save and the URL mirror (user action only), the melody and harmony schedulers (module state,
no store writes).

### Verdict on rows 3–8 (asked the same day)

Row 3 rides with 38: one call changed to the existing ramp, the same listen proves both. Row 7 stays where the plan has
it. Rows 4–6 are worth about an hour between them, but only if the overlay shows lag spikes beside the pops; if the pops
survive 37 + 38 with the lag line quiet, the remaining cause is a discontinuity not yet found and rows 4–6 will not help.
Row 5 is measured first (one `npm run perf -- --profile` window over the idle world), fixed only if its burst shows as a
long task. Row 6 is done opportunistically, next time that file is open. Row 8 is left until something measured points
at it.

## Recording a new baseline

After a fix from 17.2.2–17.2.5, re-run `npm run perf` 3× at the same settings, compare medians against the table above, and add a dated row/section here rather than overwriting it, so the history of what each fix bought stays visible.
