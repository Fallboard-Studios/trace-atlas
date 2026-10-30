# Intent: The Off Screen — power as pause, the chooser (saves, presets, themes, aspects) and Keep

Confirmed via `interview-me` on 2026-10-30 (6 questions; one guess overturned — "power-on replays the world from the
top" became a true pause — and one redirected — "no power-off dialog" became the Keep button), ahead of a
`spec-driven-development` pass. Backlog item 5 ([docs/todo/backlog.md](../todo/backlog.md#5-sector-settings-ascoordsfavorites-reorganization)),
plan.md Stage 1. Builds on the six-story sketch ([docs/sketches/off-screen.html](../sketches/off-screen.html)) and the
decisions in [docs/ideas/themes.md](../ideas/themes.md) (2026-10-09 and 2026-10-30). Not yet a roadmap entry; the spec
pass gives it a number.

## Outcome

The powered-down screen (`OffScreen.tsx`) is where a listener chooses what plays before any sound — their saves,
Crawford's three curated worlds, a **theme** and an **aspect** as band sets over the same seed — and the power rocker
becomes a **pause**: flip off and the world freezes exactly as it is, flip on and it resumes mid-phrase. Under it, the
scattered loading bands (`GLOBAL_AUDIO_LOADING_RANGES`, the `spawnSystem.ts` `*_RANGE` constants, `BPM_SEED_RANGE`,
`ROBOT_SEND_LOADING_RANGES`) become one table with one resolver, so a theme is a column, not code; the theme and aspect
ids join the Attenuation Style and coordinates as the world's identity in the payload and the world link.

- **User:** three people on one screen — a first-timer (sees a label, a hint and a switch, nothing else), a returning
  listener who has heard a world (sees the chooser), and someone handed a link (hears that world, no choice to make).
- **Why now:** the faint-world off screen is built, the short world link exists, pause is the lifecycle the two-clocks
  guardrail already implies, and the bands a theme needs are scattered — this phase lifts them and gives the off
  screen its real job before the Guide (roadmap 51, Stage 2) describes it.
- **Success:** first visit = music in one action. Returning = a world you like — Keep, a preset, Calm, Hypnotic —
  reached without searching random seeds, chosen in silence. Five themes audibly different on the same AS + coords.
  Power off / on leaves nothing changed but the clock. The address bar always names the loaded world.

## Behavior

### Who sees what — the gate

- **First visit** (no "heard a world" flag in localStorage, no saves): the off screen shows the etched label and product
  line (`home.off.label`), the power hint (`home.off.powerHint`, unchanged) and nothing else, over the faint world —
  random, Classic, or the link's world when the URL names one. A shared-link first-timer sees exactly the same screen.
- **The first power-on writes the flag** (one boolean; the second localStorage key beside `trace-atlas.sessions.v1`).
  From then on — including immediately after a power-off in the same visit — the off screen shows the chooser. Factory
  Reset (`localStorage.clear()`) clears it with the saves: the device is a first visit again.
- The flag gates only what the off screen *shows*. Nothing about the world, the link or the saves depends on it.

### The chooser — two axes, one readout

- **Transmission (which world).** One muted `RadioButton`, as today: **Current** on top (selected by default; named
  `AS · (x, y)`, or by its save / preset name), then the user's saves newest first (only when any exist; each row shows
  its `savedAt`), a divider, then the three presets. A pick retransmits the faint world silently — nothing pops,
  nothing plays; the rocker is still the only way to start sound.
- **Roll** is an action beside the Current row, not a radio: a fresh random Attenuation Style + coordinates under the
  chosen theme and aspects. Current is renamed; the Loading rows do not move.
- **Loading (how it loads).** A **Theme** row of five single-line radios — **Classic** (default; today's bands), **Calm**,
  **Bold**, **Adventurous**, **Perilous** — with one muted description line under the picked theme. Then one flat row
  per aspect **family**, "as theme" first. v1 ships one family, **Melody**: Hypnotic, Mechanical, Wandering.
- **Rules.** Pick a save or preset → the Loading rows follow it (a world carries its theme + aspects). Change a theme or
  an aspect → the same AS + coords regenerate under the new bands, live tweaks are discarded (themes.md, 2026-10-09),
  and the world row drops back to Current. The readout well (`home.off.readout`, extended) names the whole pick:
  `name · code · theme · aspect`.
- **Keep.** One button beside Current: saves the loaded world under the suggested name the Comms Save already proposes
  (`sessionStore.currentSessionName`) — no name field — and it appears at once as the newest save row. Keep dims once
  the loaded world is already kept and nothing has changed since (dim-controls rule), and re-lights on any change. A
  muted line under the chooser carries the only warning worth having: picking another transmission discards this
  world's unsaved tweaks. Rename, Delete and Load stay in Comms.
- **Layout.** Two columns on desktop (Transmission left, Loading right, the readout spanning both), one column on the
  phone, scrolling; the lore footer (Crawford's legalese, tiny etched type) under it; the veil over the faint world
  until the flip, fading on power.

### Themes and aspects — the engine

- A **theme** is a named set of min / max loading bands applied **system-wide at generation time** — BPM and the global
  chain included. An **aspect** is a named band set for a handful of **robot** attributes, grouped in families, one pick
  per family. Resolution: Classic's bands, the theme's over them, each chosen aspect's over those — **replace, not
  widen**. Classic is today's tables under a name.
- Themes and aspects change **only what a fresh seed is allowed to roll**: the same AS + coords under Classic and under
  Calm sound similar, not identical. Sliders' ranges, LFO swing ranges (`GLOBAL_AUDIO_SEED_RANGES`) and hand edits are
  untouched.
- **Amended 2026-10-30, at the spec review (Crawford):** a family's aspects are **multi-select**. The picked set is
  dealt **round-robin** over the fleet's seeded groups — the companies in spawn order, then each freelance robot on its
  own — until every group has one: one pick is the whole fleet, two alternate, "as theme" can be picked as a member to
  keep plain groups in a mixed fleet; all seeded, so a link reproduces the deal. Per robot nothing changes: at most one
  aspect per family, replace-not-widen. The multi-select is a `RadioButton` `multiple` variant that wears the cabinetry
  like Button and Toggle do. The company and robot details show what a robot loaded under (a readout, not a control).
  Supersedes "one pick per family" below and the parked "per-aspect share" in Out of scope.
- **Narrow first cut.** Each theme bands a short list of attributes — BPM, note density, envelopes, the reverb / delay
  sends, filter brightness are the candidates; the spec fixes the list — tuned by ear against Classic; every other band
  keeps Classic's column. Melody's three aspects band the Melody family's attributes (`rhythmicDensity`, `noteVariance`,
  `rhythmicMotifLength`, `pitchRepeat`, `octaveRange`; the spec picks which).
- **Identity.** The theme id and the aspect ids are seed inputs, not edits: a payload field (absent = Classic, no
  aspects), plain params on the world link beside `seed` / `x` / `y` (`theme` is already reserved in `worldLink.ts`),
  and part of the identity `seedBaseline.ts` regenerates against — so an untweaked Calm world shares as a bare link and
  a saved one diffs against the right baseline.

### Presets

- `TRANSMISSION_PRESETS` entries become `{ id, nameKey, link }`, where `link` is a share URL of a world Crawford saved,
  pasted in. On pick the app decodes the URL's params with `decodeWorldLink` and applies them through
  `applySessionPayload` — the path a shared-link arrival already takes; nothing navigates. The three placeholder
  payload constants go. Curation is the existing flow: Save → Share → paste → name it in `home.ts`.
- A preset's `s=` blob is a diff against what its seed regenerates, so presets drift as the engine is retuned; the
  maintenance is "re-share the three after a retune". A wrong-version blob degrades to the seed world, never breaks.

### Power is a pause

- **Rocker off — no dialog.** The transport pauses in place (`AudioEngine.pause()` is the soft pause that exists); the
  robots' swim, job and station timelines pause; the work loop pauses (its wall-clock deadlines shift by the paused
  span, so no robot "arrives" during the pause); battery drain and recharge pause (they ride the measure tick, so they
  stop with the transport). The audio graph stays alive. Robots freeze where they are — no recall to a station. The off
  screen appears over the paused world with Current selected.
- **Rocker on with Current selected: resume** — everything as it was except time; the music picks up mid-phrase. With
  any other row picked, that world loads fresh and starts from the top (today's power-on path). Loading a save is how
  you "start from the beginning"; a real transport (play / stop / restart) is a later phase.
- **The in-world day keeps going.** The wall-clock day (`DAY_DURATION_MS` from `dayStartTimestamp`) and the day / night
  light run while the tablet is off, and run from the moment a world loads, before the first flip. (Two clocks:
  measures pause with the music; the day never does.)
- **A fresh page load is unchanged:** the world is built with systems off; the first flip *starts* (the one path that is
  not a resume).
- **Boot theatre:** ≤ 1.5 s — dark, a flicker, then the off screen; GSAP timelines in `timelineMap`, no timers. The
  rocker works from t = 0; any tap skips to ready; reduced motion gets no flicker and no wait. The old 3 s splash text
  is the etched label, already on the screen.

### The address bar follows the loaded world

- Every change of the loaded world — the random boot, a pick, Roll, a theme or aspect change, a link arrival — mirrors
  the identity (`seed`, `x`, `y`, theme, aspects) into the URL with `replaceState`, as the load sliders already do. A
  reload brings back the same world; Roll is how you get a new one. The tweak blob is **not** mirrored live — Keep and
  Share are for that — so an unkept tweaked world reloads untweaked.

### Foundry and Comms

- **Settings → Seeds (Foundry):** the status line gains the theme and aspects (the same readout as the off screen); the
  `ATTENUATION_STYLE_PRESETS` and `COORDINATE_PRESETS` shortcut buttons go (themes and presets-as-links supersede the
  old "favorites"); the Attenuation Style input, the coordinates and Retransmit are unchanged. No theme rows here in v1.
- **Settings → Save & Share (Comms):** unchanged — Save overwrites by name, Share live, per-row Load / Share / Delete,
  Factory Reset. In passing: the stale "autosaved" wording in `session.clearStorage.confirmBody` goes.
- The power confirm copy (`ui.power.confirmTitle` / `confirmBody`) retires with the dialog.

## Style / constraint

- **Nothing pops or plays on the off screen** (layout rework, 2026-10-09): every pick is a silent retransmit of the
  faint world; the rocker is the only way to sound.
- **Pause goes through the transport, the AudioEngine and the GSAP timelines in `timelineMap`** — never timers for
  timing; the two-clocks guardrail stands as written (day = wall clock, lifecycle = measures).
- **State stays JSON-serialisable:** the gate is one boolean, the theme and aspect ids are strings in the payload;
  timelines and the paused transport are runtime objects outside Zustand.
- **Reuse the primitives:** the muted `RadioButton`, the readout well, single-line radios, the content layer. The veil
  lives inside `ScreenViewport`; a blur that also covers the sleeve is decoration and allowed.
- **Themes change loading bands only** — never `GLOBAL_AUDIO_SEED_RANGES`, a slider's range or an edit's clamp.
- **Copy is Crawford's, in `src/content/`:** the sketch's lists are the starting names (Classic / Calm / Bold /
  Adventurous / Perilous; Hypnotic / Mechanical / Wandering); the theme and aspect description lines are the content
  entries the Guide will read later — no manual on the off screen (roadmap 51's Not Doing stands).
- **Dim controls that do nothing:** Keep after a keep; nothing else on the screen is ever inert.
- **No "keep existing sound" constraint** (pre-v1 rule): Classic is today's bands by definition, retunes may move it, and
  presets are re-shared when they do.

## Out of scope

- **Save management on the off screen** — Keep only; rename, delete and load-by-row stay in Comms. No name field.
- **A save prompt or confirm dialog on the rocker** — power-off loses nothing, so neither earns its place.
- **A real transport** (play / stop / restart, scrubbing) — "an eventuality"; from-the-top is loading a save.
- **The Voice, Envelope and Space aspect families** — names reserved (Glassy / Woody / Hollow; Plucked / Swelling / Held;
  Dry / Hall / Cavern), built once Melody proves the mechanism.
- **Five columns for every seeded band** — the first cut bands a short list; the rest stays Classic.
- **Per-aspect shares** (an aspect landing on some robots, not all) — parked; the table shape may leave room.
- **User-authored themes** — a band editor; not this.
- **Theme / aspect rows in Foundry** — a follow-up on the same component (Comms already mirrors the off screen's saves).
- **The Guide** beyond the description lines — Stage 2.
- **Item 7's Mood row** — it gets a slot in the Loading axis, in the same flat-row form, built in Stage 3.
- **Robots recalling to a station on power-off** — pause freezes them where they are; the recall path stays for the
  work loop's own use.
- **"Last played" timestamps** on save rows — `savedAt` exists; a per-load write was declined.
- **Autosave** — removed by decision ([docs/intent/session-autosave-removal.md](session-autosave-removal.md)); never again.
- **A collapsed chooser on the first visit, or a visit-count reveal** — both rejected: the first is a question the user
  can't answer yet, the second is arbitrary. The gate is a fact: has this device heard a world.
- **Mirroring the tweak blob into the URL live** — identity only.

## Known implementation notes (not yet spec'd)

- **Pause primitives.** `AudioEngine.pause()` / `resume()` exist (soft transport pause). `powerController.shutdown()`
  today is `stopRobotLifecycle` + `stopWorkLoop` + `AudioEngine.killAll()` (which resets the BeatClock) and
  `powerOnSequence()` is `start` + `setBPM` + `resetHarmony` + re-register + `startLocaleSystems`; both become two paths
  each — first start / fresh world vs pause / resume. The work loop (`workLoop.ts`) has `startWorkLoop` / `stopWorkLoop`
  only and needs a pause that shifts its wall-clock deadlines; `timelineMap` has set / get / kill and needs pause / resume
  over the robot movers (GSAP `pause()` / `play()`). The spec decides whether LFOs and swells freeze by pausing the
  transport alone or by suspending the AudioContext, and verifies nothing wall-clock remains in the battery lifecycle.
- **The day clock while off.** `computeLocaleHour(dayStartTimestamp)` ticks on a 1 s interval in `AttenuationStyleView`,
  which mounts in both power states — so the hour already runs while off. Verify in the browser that the day / night
  light animates while off and from first load; Crawford expects it to, and today it may not.
- **The gate flag:** key name and module (the sessions engine is the precedent; Factory Reset already clears everything).
- **Payload and link:** a `SessionPayload` version bump with the theme + aspect fields (absent = Classic / none); the
  link's `theme` param and the aspect params' names; `WorldIdentity` in `seedBaseline.ts` gains them;
  `TransmissionPreset` becomes `{ id, nameKey, link }`.
- **The band table and resolver:** lift `GLOBAL_AUDIO_LOADING_RANGES`, the `spawnSystem.ts` constants, `BPM_SEED_RANGE`
  and `ROBOT_SEND_LOADING_RANGES` behind one accessor keyed by attribute, with themes and aspects as partial columns and
  Classic the full one; the grids (`docs/reference/GLOBAL_CHAIN_GRID.md`, `ROBOT_DATA_GRID.md`) gain columns.
  `noteVariance` and `rhythmicMotifLength` are an off-share plus a 1–8 value (thresholds 0.15), so "low variance" is two
  bands, not one; the bell-fitted shares (colour, pedal edges) are not themed in v1.
- **Keep's "dirty" test:** `buildSessionPayload()` against the loaded entry's payload (`sessionStore.currentLoadedSessionName`)
  or the regenerated baseline for a world that came from a seed, a preset or a link.
- **URL mirroring:** `audioBudgetSystem.ts`'s `replaceState` mirror is the precedent; `consumeSessionSharePayload` runs
  once per page load and must not re-fire when the URL changes under it.
- **Likely phases** (the spec decides the split and the branches): (a) the screen without themes — gate, Current, Roll,
  Keep, presets as links, veil, footer, boot theatre, pause lifecycle, URL mirror; (b) the band table, the resolver and
  the identity plumbing, no audible change; (c) the theme and aspect rows, the description lines, Foundry's status line,
  and the by-ear tuning of five themes and three aspects.
- **Performance:** the veil sits over a still frame while off, so it rasters once; the idle-paint gate (17.2.5) still
  applies to the off state; pause should *lower* main-thread work while off — verify with `npm run perf`.
