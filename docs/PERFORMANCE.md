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
| `--smoothness` | Instead of the step table, opens every accordion frame-by-frame-sampled and reports empty-open frames, the height snap at `auto`, and slow frames — see the smoothness section below. |
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

The default step sequence: power on → open Fleet Params → open each of its accordions in turn → switch to Probes → open the first robot (detail) → open each of its accordions in turn → back to the robot list → switch to Nav & Comms → back to Fleet Params. Steps are clicked by their visible header-nav labels (`TILE_*` constants at the top of the script) — a label rename in `src/data/headerNavConfig.ts` needs the same rename there. Each step reports:

- `tasks >=100ms` / `longest (ms)` / `total in >=100ms tasks (ms)` — main-thread long tasks over Tone's lookahead (the audible-pause count).
- `tasks >=50ms` — total long tasks Chrome reports (its own threshold), including the steady background churn after a switch.
- `cabinetBoxes` — `.sc-cabinet-box` elements on the page. **This includes the header's 12** (present at power-on), and the Probes count drifts upward across a run as factories build robots.
- `boxes in closed accordions` — `.sc-cabinet-box` elements inside a collapsed accordion. Before roadmap 17.2.2 this measured waste (it was 301 on Fleet Params); since the lazy mount it is **expected to be 0 for a never-opened section, so a non-zero value right after a tile opens is a regression alarm** (someone re-added an eager mount). The per-section rows (`fleet › …`, `detail › …`) are the first-open cost of each section.

## Caveats

- **Throttling is main-thread only.** `Emulation.setCPUThrottlingRate` does not slow compositor or raster worker threads. Treat throttled numbers as a *relative* signal for main-thread work, not a phone simulator.
- **Headless Chrome's raster/compositing path differs from a phone GPU's.** Paint and compositing figures (roadmap 17.2.5) are directional until confirmed on real hardware.
- **Audio isn't measured directly.** Headless Chrome has no real audio output (`--mute-audio` is on). The 100 ms threshold is the *proxy* for an audible pause; confirm by ear on a real device.
- **The world is random per load unless pinned.** For like-for-like comparisons (especially audio load) load `?seed=<word>&x=<int>&y=<int>` — `?seed=` alone leaves the locale coordinates random, so robots, BPM and day phase still differ between runs (see [PROCEDURAL_GENERATION.md](PROCEDURAL_GENERATION.md)). The harness does not add these params itself; pass them via `--url`. Baselines recorded before 2026-09-19 were taken on random worlds.
- **Run-to-run variance is large** (e.g. Probes at 4× throttle: 2.3 s in one run, 3.9 s in another — background robot/swell activity differs per run). Run 3× and compare medians, and only trust differences bigger than that spread.
- **Trace durations overlap.** A `FunctionCall` contains its own layouts, so compare an event's total across runs, never across event names.
- **Trace `RasterTask` totals are unstable** between runs (worker-thread events); ignore them.
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

Measured with `npm run perf -- --smoothness --width <px> --throttle <n>` (see [docs/tasks/ACCORDION_LAZY_MOUNT.md](tasks/ACCORDION_LAZY_MOUNT.md) Task 8): it opens every accordion on Fleet Params and on a robot's detail page while sampling the wrapper on every animation frame, then closes and reopens the first one. Numbers are from real headless Chrome; "tween frames" is how many frames actually rendered a mid-tween height (a 250 ms open at 60 fps would be ~15).

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
| `?seed=<word>&x=<int>&y=<int>` | Pins the whole generated world ([PROCEDURAL_GENERATION.md](PROCEDURAL_GENERATION.md)). Print any of these into a bug report and the HUD echoes what was loaded. |

Combine them, e.g. `?debug&latency=playback&seed=bravo&x=-150&y=90`. Known worlds (desktop render capacity, [scratchy-audio-phones.md](todo/scratchy-audio-phones.md)): `charlie:200:-30` ≈ 0.33 (calm, 0 global LFOs), `alpha:12:68` ≈ 0.37, `delta:5:-180` ≈ 0.50, `bravo:-150:90` ≈ 0.55 (heavy, 5 LFOs).

### Reading the overlay

```
bravo @ -150,90   up 1:32
ctx running   clock x1.00   transport started
latency interactive   ahead 100ms   base 11ms
voices 3/16   audible 5/12   LFOs 5/7
fps 58   lag 4ms (max 220ms)
1:31 audio clock stalled (x0.00)
1:52 audio clock recovered after 20.0s
```

The border turns red when any failure signature is live. Each line answers one question from the investigation:

| Reading | Meaning |
|---|---|
| `ctx` (`running` / `suspended` / `interrupted`) | AudioContext state. The app never resumes a suspended context (no `statechange` handler); changes are logged from the context's own `statechange` event, so transient states aren't missed. |
| `clock xN` | Audio-clock seconds advanced per wall second over the last 500 ms. ~1.00 is healthy; **below 0.5 while `ctx` says `running`** is logged as "audio clock stalled" — the audio thread isn't advancing. |
| `fps` | GSAP ticker ticks/second. **0** logs "UI frames stopped" — the page's animation loop froze. |
| `lag` (`max`) | How late the 500 ms sampler tick ran — a main-thread stall meter. ≥ 500 ms is logged as "main thread stalled". |
| `voices n/16` | `activeVoices` against `MAX_POLYPHONY`. Pinned at 16 with sound gone = the stuck-voice-counter hypothesis. |
| `audible n/12` | Robots in the active locale that `isRobotAudible` lets sound right now (not muted, not excluded by a solo), out of the roster — `0/0` before any robot has spawned. Sampled at the 500 ms tick, so it costs no store subscription. Added for the Audio Load Budget work ([specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md)): the load waves are hypothesised to follow how many robots sound at once, and this is the series to check that against. |
| `LFOs n/7` | Global LFOs with rate > 0 — the measured load driver. |
| `latency … ahead … base` | The hint actually installed, Tone's `lookAhead`, and `baseLatency`. (`outputLatency` is not shown: Tone's standardized-audio-context wrapper doesn't expose it.) |

**Telling the causes apart** (what to note when the sound drops):

- `clock` stalls, `ctx` still `running`, `fps`/`lag` fine → audio-thread starvation.
- `ctx` goes `suspended`/`interrupted` → the OS/browser took the context; the app should resume it.
- `lag` spikes and `fps` → 0, `clock` keeps ~1.00 → a main-thread stall (audio is scheduled from the main thread, so it can starve even though the audio thread is fine).
- `voices` pinned at 16 with everything else healthy → the voice counter, not the audio path.

Verified in headless Chrome (2026-09-19): a deliberate 2 s main-thread freeze logs `main thread stalled ~1639 ms` while `clock` stays ~x1.01, so the two cases are distinguishable; a no-param load creates one realtime AudioContext and `?latency=playback` replaces Tone's default one (which `setContext(…, true)` closes) — Tone's own import creates a default `interactive` context before this module runs, hence the dispose.

### Getting it onto a phone

`npm run build && npx vite preview --host --port 4173`, then open `http://<pc-lan-ip>:4173/trace-atlas/?debug&…` on the phone (same Wi-Fi; a Windows firewall prompt may need allowing). A production build is the right target — the dev server is unminified and slower. Or deploy the branch. **A phone loading `http://<lan-ip>` is an insecure context** (only https and localhost are secure), where `crypto.randomUUID` does not exist. Before 2026-09-20 that made `AudioEngine.start()` throw in `beatClock.scheduleRepeat`, so the power rocker snapped back and the tablet never powered on; all id generation now goes through `generateUUID()` (`src/utils/randomId.ts`, falls back to `crypto.getRandomValues`). Any *new* secure-context-only API (`crypto.subtle`, `navigator.clipboard`, `navigator.wakeLock`, service workers, …) will break the same way on a LAN phone — you can reproduce that on the PC by loading the preview from its LAN IP instead of `localhost`. The overlay's cost is one 500 ms timer and one GSAP ticker callback, only while `?debug` is on.

## Audio render-capacity series — `npm run perf:audio`

Where `npm run perf` above measures the main thread, this measures the **audio thread**: it drives headless Chrome over the DevTools Protocol (Node's built-in `WebSocket`, no dependency), loads a served production build of a pinned world, powers it on, waits out a warm-up, then polls the DevTools "Web Audio" panel's `WebAudio.getRealtimeData` every 500 ms. *Render capacity* is the fraction of each audio callback's deadline that rendering takes (0–1; near 1.0 the thread misses deadlines, heard as clicks and dropouts). Built for roadmap 17.2.6 ([specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md)); it replaces the scratch-script recipe in [todo/scratchy-audio-phones.md](todo/scratchy-audio-phones.md).

```
npm run build && npx vite preview --port 4173                                 # terminal 1 — a production build
npm run perf:audio -- --world charlie:200:-30 --seconds 240 --bucket 15       # terminal 2
```

One row per time bucket — mean and max capacity, mean callback interval, and the overlay's audible-robot count — then the **peak window** (the highest bucket mean; the number the Audio Load gates compare), the overall mean and max, and `r(audible, capacity)`, the Pearson correlation between the per-bucket audible count and capacity (`-` when either is constant). `--help` documents every flag:

| Flag | Meaning |
|---|---|
| `--world name:x:y` / `--worlds a,b,c` | Pinned world(s): `name` is `?seed=`, `x`/`y` the integer locale coordinates. `--worlds` runs them one after another, each in a fresh Chrome. |
| `charlie:200:-30?load=light` | Anything after `?` rides along into the page URL, so variants of one world (a `?load=` preset, `?latency=`) can be A/B-ed within one session. |
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
  `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match 'trace-atlas-perf' } | Measure-Object`. The script closes Chrome with `Browser.close` (then `taskkill /T` as a fallback) and removes its temp profile.
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

## Recording a new baseline

After a fix from 17.2.2–17.2.5, re-run `npm run perf` 3× at the same settings, compare medians against the table above, and add a dated row/section here rather than overwriting it, so the history of what each fix bought stays visible.
