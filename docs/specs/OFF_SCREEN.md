# Phase Spec: The Off Screen — power as pause, the two-axis chooser, Keep, and the band table under the themes

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Off-state paint: `npm run perf:idle` (§5.4 — the veil and the paused world must not raise idle paint)
> - Phone underruns: `npm run perf:audio` (§5.4 — the `power-pause` module touches the audio context; Pixel A/B against `main`)
> - Main-thread baseline: `npm run perf` (§5.4 — pause should *lower* work while off)

Source of intent: [docs/intent/off-screen.md](../intent/off-screen.md) (confirmed 2026-10-30 via `interview-me`, six
questions; one guess overturned — power-on no longer replays from the top, the rocker pauses — and one redirected — the
confirm dialog became the Keep button). Backlog item [5](../todo/backlog.md#5-sector-settings-ascoordsfavorites-reorganization),
the whole of [plan.md](../todo/plan.md)'s Stage 1. Drawn first as six stories in
[docs/sketches/off-screen.html](../sketches/off-screen.html); the band mechanism is the idea in
[docs/ideas/themes.md](../ideas/themes.md). **Proposed roadmap number: 57** (56 is the highest in use; the archive holds
nothing above 55) — this spec gives the item its number; the plan's last task moves backlog 5 to the archive under it.
Roadmap [51](../todo/roadmap.md) (the Guide) is untouched: its "Not Doing — no manual on the off screen" stands; the only
thing this phase leaves for it is the description strings (§1.6).

Survey basis (2026-10-30, against `main` at `cc9a01f2`, the merge of PR #593; every citation below was read, not
recalled). Where the survey disagrees with the intent, the survey wins and the difference is named here:

- **Power today.** `src/systems/powerController.ts`: `start()` = `AudioEngine.start()` + `setBPM` + `resetHarmony` +
  `reRegisterAllRobotsAudio` (`:15–20`); `shutdown()` = `stopRobotLifecycle` → `stopWorkLoop` → `AudioEngine.killAll()`
  (which `resetBeatClock`s, `AudioEngine.ts:1568`) → `setPowerOff` (`:35–41`); `powerOnSequence()` = `start` →
  `startLocaleSystems` → `setPowerOn` (`:48–52`). `AudioEngine.pause()` / `resume()` exist as a soft transport pause /
  start (`AudioEngine.ts:1515–1532`) and **have no callers in `src/`**. `PowerRockerSwitch.tsx:185–204`: the on-branch
  is a GSAP timeline (`power-rocker-sequence`, 0.18 s hold → `handlePowerOn`, 0.5 s → `returnRocker`); the off-branch
  is `power-rocker-confirm-delay` (0.18 s) → `setShowConfirm(true)` → `handlePowerOffConfirm` → `returnRocker` +
  `shutdown` (`:172–180`).
- **What rides the transport.** The battery lifecycle is the one `subscribeToMeasure` listener (`robotSystems.ts:240`);
  swells are a `'16n'` `scheduleRepeat` on the BeatClock (`audioSwells.ts:426`); the harmony advances on measures. The
  **work loop is wall-clock**: its `now` defaults to `gsap.ticker.time` (`workLoop.ts:94`, `:752`) and stamps site
  cooldowns as absolute `readyAt` values (`:437`, `:562`, `:693`); its waits and moves are GSAP timelines registered in
  `timelineMap` under `swim-`, `work-`, `dissolve-`, `bob-wait-`, `station-` keys (`:134`, `:403–:622`).
- **Every registered timeline** (`setTimeline(` call sites, 2026-10-30): world movers — `swimAnimation.ts:122`,
  `buildJobTimeline.ts:207`, `stationRipple.ts:91`, `BubbleStream.tsx:243`, `useHaloMotion.ts:68`,
  `useOrbiterMotion.ts:142`/`:301`, `useStripFlicker.ts:109`, `workLoop.ts` ×6, `deckCamera.ts:310`; UI —
  `NavPanel.tsx:66`, `RosterBoard.tsx:145`, `CabinetBox.tsx:401`, `PowerRockerSwitch.tsx` ×4. `timelineMap.ts` exports
  `setTimeline` / `getTimeline` / `killTimeline` / `killAllTimelines` only (`:26–59`). **No world element carries a CSS
  keyframe animation** (`animation:` appears in no stylesheet under `components/robot`, `components/actors`,
  `worldView`), so pausing the registered timelines freezes all world motion.
- **The day clock already runs while off.** `computeLocaleHour(dayStartTimestamp)` (`constants/time.ts:15`) ticks on
  `AttenuationStyleView`'s 1 s interval (`:26–70`), which `WorldView.tsx:36` mounts in both power states; it writes
  `uiStore.activeLocaleLocalTime`, and none of its eight consumers (`Factory`, `Scenery`, `LightShafts`, `TerrainLayer`,
  `WaterColumn`, `RobotBody`, `MetaBox`, the view itself) reads `isPoweredOn`. The intent's "verify, it may not today"
  resolves to: **it does; this phase changes nothing here** (§5.3 keeps the browser look as a check).
- **The off screen today.** `OffScreen.tsx`: a muted `RadioButton` of `preset:<id>` / `save:<name>` values (`:18–19`),
  three `TRANSMISSION_PRESETS` (`transmissionPresets.ts`, three whole `SessionPayload` placeholders), a divider, the
  saves (`listSessions()` once on mount), a readout well `fill('home.off.readout', { name, code })`; a pick calls
  `applySessionPayload` (`sessionDiff.ts:468`). 23 cases in `OffScreen.test.tsx`. `ScreenViewport.tsx:27–34` mounts
  `OffScreen` only while off and Header / NavPanel / ContentPane / NavBreadcrumb only while on; `WorldView` in both.
- **The link.** `worldLink.ts`: `WORLD_LINK_PARAMS = { seed, x, y, blob: 's', theme }` with `theme` "reserved: never
  written, never read" (`:24–30`); `encodeWorldLinkParams(payload)` (`:117`) writes the triple plus `s` when the diff is
  non-empty; `decodeWorldLink(search)` (`:136`) returns a whole payload or `null`. `sessionShareUtils.ts`: decoded once
  at module load (`:16`), `consumeSessionSharePayload` once per page load (`:35`), `buildShareUrl` = origin + pathname +
  params (`:47`); the URL is never cleared. `seedBaseline.ts`: `WorldIdentity { attenuationStyleName, coordinates }`
  (`:48`), `generateWorldSeedBaseline(attenuationStyleName)` (`:95`), `diffWorldAgainstSeed` (`:138`), `fillWorldFromSeed`
  (`:174`). `SessionPayload.version` is `1 | 2` (`types/session.ts:71`); `SessionEntry = { name, savedAt, payload }`.
- **The address bar precedent.** `audioBudgetSystem.ts:158–170` mirrors the two load sliders with `history.replaceState`
  through `withParam(search, name, value | null)` (`audioBudget.ts:189`), preserving every other param.
- **Sessions.** `sessionStore.ts`: `currentSessionName` (seeded by `suggestSessionName()`), `currentLoadedSessionName`,
  `saveNamedSession(name, payload)` (`:60`), `deleteNamedSession` (`:67`), `listSessions` (`:74`), `loadSession` (`:81`);
  `sessionStorageEngine.ts` owns the one localStorage key, `trace-atlas.sessions.v1` (`:19`). Factory Reset is
  `localStorage.clear()` (`SessionsPanel.tsx:76`).
- **The bands.** Global: `GLOBAL_AUDIO_LOADING_RANGES: Record<LoadingRangeKey, LoadingRange>` (`globalAudioLoadingRanges.ts:38`,
  `LoadingRange = { min, max }` `:22`), mirrored from `docs/reference/GLOBAL_CHAIN_GRID.md`'s Loading Range column.
  Sends: `ROBOT_SEND_LOADING_RANGES: Record<RobotSendField, SendLoadingRange>` with `lit` (`robotSendLoadingRanges.ts:15–30`).
  Tempo: `BPM_SEED_RANGE = { min: 40, max: 100 }` (`bpmSeed.ts:18`). Robots: module constants in `spawnSystem.ts` —
  `ATTACK/DECAY/SUSTAIN/RELEASE_RANGE` (`:62–65`), `SHAPED_ATTACK/RELEASE_RANGE` (`:71–72`), `DYNAMICS/RESTS/ACCENTS_SEED_RANGE`
  (`:108–113`), `PORTAMENTO_SEED_RANGE` (`:131`), `OPEN_FILTER_FREQ_RANGE`, `ACCENT_FILTER_FREQ/Q_RANGE` (`:146–150`),
  the thresholds (`:82`, `:127`, `:136–142`, `:182`, `:188`, `:464`, `:496`), `MASTER_VOLUME_MIN/MAX` (`:170–171`), the LFO
  depth ranges (`:482–488`); `rhythmicDensity` and `pitchRepeat` are plain 0–100 draws (`:688`, `:693`),
  `rhythmicMotifLength` and `noteVariance` are `seedToggleValue(raw, 0.15)` → off or a 1–8 value (`:689–692`,
  `:195–200`). Draws go through `getSeededVal(noiseMap, dataId, offset, min, max)` (`getSeededVal.ts:47`); world-level
  choices through `getUniformSeededVal` (`:68`). The bell-fitted shares (`COLOUR_CHARACTER_BANDS`, `PEDAL_LIT_EDGE` in
  `globalAudioSeed.ts`) are not bands in this sense.
- **The content layer.** `CONTENT_AREAS` is a fixed list (`content/types.ts:64`, `home` among them); `ContentKey` is
  `keyof typeof CONTENT` (`content/index.ts:41`); `content.test.ts` requires every entry to be read somewhere.
- **Companies at spawn.** `spawnInitialCompanies` (`spawnSystem.ts:1081–1121`) runs **after** `spawnInitialRoster`:
  2–3 companies (`INITIAL_COMPANIES_MIN/MAX`) each claim 3–4 robots (`COMPANY_SIZE_MIN/MAX`) from a shrinking pool by
  seeded draws (`'company.count'`, `'company.size'`, `'company.member'`); the rest are Freelance (`companyId`
  undefined) "by design, not an edge case" (`:1076`). So a fresh world has 3 to 8 groups (companies + freelancers) and
  every robot has drawn its melody fields before it knows its company. `MAX_COMPANIES = 6` (`constants/index.ts:468`) is
  the manual CRUD ceiling only. `assignRobotToCompany` and user-created companies (random ids) are post-generation.
- **The radio primitive.** `RadioButtonSchema` (`types/controls.ts:123–141`) is single-value (`options[]`,
  `appearance?: 'cabinet' | 'muted'`, `dividerBefore`); there is no multi-select control among the primitives in
  `src/components/ui/controls/` (`Toggle` is one boolean). The cabinet appearance's pop is `cabinetAnimation.ts`.
- **The Tone context accessor already in use:** `Tone.getContext().rawContext` (`audioDiagnostics.ts:156`,
  `globalFx.ts:630`) — a `standardized-audio-context` wrapper, not the bare `AudioContext` (`audioDiagnostics.ts:257`).

**Assumptions** (each is a decision this spec makes; the intent left it open or the survey forced it; §7 lists the ones
worth a second look):

1. **Four modules, one spec, one build order** (§0): `power-pause` → `off-screen-chooser` → `band-table` →
   `themes-and-aspects`. `band-table` depends on nothing in the first two and may be built alongside them; the fourth
   needs all three. Each module is a phase of the task plan with its own checkpoint; the spec is not split into files.
2. **Pause suspends the AudioContext.** `AudioEngine.pause()` becomes `Tone.getContext().rawContext.suspend()` and
   `resume()` its `resume()`; the transport is not touched. Everything on the audio clock freezes together — transport,
   BeatClock's `16n` tick (so measures, battery, harmony, swells), every Tone LFO, every sounding voice and reverb tail
   — and resumes together, mid-note, mid-ramp; and a suspended context renders nothing, so the off state costs no audio
   CPU. The alternative (transport `pause()` + releasing active voices, tails ringing out, LFOs and swell ramps drifting
   on) is recorded in §7 as the fallback if the T0 spike (§5.1) shows Tone 15 mis-resuming.
3. **Timelines carry a scope.** `setTimeline(id, timeline, scope: 'world' | 'ui' = 'ui')`; the fourteen world call
   sites in the survey pass `'world'`, the UI ones keep the default. New `pauseWorldTimelines()` / `resumeWorldTimelines()`
   pause and play every `'world'` entry; a `'world'` timeline registered while the world is paused is paused on
   registration (a robot that re-renders while off must not start swimming). `killAllTimelines` is unchanged.
4. **The work loop pauses by shifting its clock.** `pauseWorkLoop()` / `resumeWorkLoop()`: `loop.now()` returns
   `gsap.ticker.time - pausedSeconds`, with `pausedSeconds` accumulated across pauses, so every stamped `readyAt` keeps
   its meaning; its GSAP timelines pause through assumption 3; `startWorkLoop` / `stopWorkLoop` stay for world changes.
   The `gsap.ticker` follow listener (`:338–364`) keeps running — it copies a frozen body's position, a no-op.
5. **`powerController` grows a state and two paths.** Module state `worldState: 'cold' | 'running' | 'paused'`
   (`getWorldState()` for the screen; not Zustand — it mirrors the audio graph, which is runtime). `pause()` =
   `pauseWorkLoop` → `pauseWorldTimelines` → `AudioEngine.pause()` → `setPowerOff` → `'paused'`; the lifecycle
   subscription is left standing (its tick is frozen with the context). `powerOnSequence()` = `resume()` when
   `'paused'` and the off screen's pick is still Current (`AudioEngine.resume()` → `resumeWorldTimelines` →
   `resumeWorkLoop` → `setPowerOn`), else today's `start` + `startLocaleSystems`. A world change while paused
   (`retransmitWorld` / `applySessionPayload`) tears down as it does today — `stopWorkLoop`, `killAll` — and leaves
   `'cold'`, so the next flip starts. `shutdown()` is deleted.
6. **No confirm dialog.** `PowerRockerSwitch`'s off-branch becomes the mirror of its on-branch: `power-rocker-sequence`
   0.18 s hold → `powerController.pause()`, 0.5 s → `returnRocker`. `showConfirm`, the dialog and `ui.power.confirmTitle`
   / `confirmBody` go (content entries that nothing reads fail `content.test.ts`).
7. **The gate is one flag.** `src/utils/deviceFlags.ts`: key `trace-atlas.device.v1`, JSON `{ heardWorld: true }`;
   `hasHeardWorld()` (plain read, `try/catch`, false on any failure), `markHeardWorld()` (called once from the first
   `start` path). `OffScreen` reads it on mount, as it reads the saves. Factory Reset already clears it.
8. **The chooser's pick values keep today's prefixes and add `current`.** `'current' | 'save:<name>' | 'preset:<id>'`,
   default `'current'`. Current's label is `describeWorld(identity)` — `AS · (x, y)`, or the loaded save's /
   preset's name when the world is one — the same helper the readout and Foundry's status line use (§1.4). The
   Loading axis is two controls: the theme row (one pick) and the Melody row (a **set** of picks, assumptions 21–23).
9. **The world's loading identity lives in one small store.** `src/stores/loadingStore.ts` (Zustand, JSON):
   `{ theme: ThemeId, aspects: Partial<Record<AspectFamilyId, AspectPick[]>> }` where `AspectPick = AspectId | 'theme'`
   (`'theme'` is the selectable "as theme" member of a deal, assumption 21) and each list is kept in the family's
   canonical option order; default `{ theme: 'classic', aspects: {} }`; an absent or empty family = every robot as
   theme. Written only by the world-change paths (`retransmitWorld`, `applySessionPayload`, the link boot) and read by
   the loading context (assumption 15), the deal (assumption 21), the readout, the payload builder and the URL mirror.
10. **Identity in the payload.** `SessionPayloadVersion` adds `3`; `SessionPayload` gains `theme?: ThemeId` and
    `aspects?: Partial<Record<AspectFamilyId, AspectPick[]>>`; absent — every version 1 and 2 payload — reads as
    `'classic'` and `{}` (decode leniency, not a compatibility promise). `WorldIdentity` gains the same two fields;
    `generateWorldSeedBaseline(identity)` takes the identity and generates inside its bands (assumption 15);
    `RetransmitInput` gains `theme` and `aspects`, and `resolveRetransmitAction` gains a `loadingOnly` mode (added at
    planning, 2026-10-30): the same Attenuation Style and coordinates, the global half regenerated from seed under the
    new bands (`regenerateGlobalAudioFromSeed`, `regenerateLfoBankFromSeed`, `regenerateGlobalLfoLinksFromSeed`,
    `regenerateBpmFromSeed` — the AS-sync subscription does not fire for an unchanged id), then the locale removed and
    re-initialised at the same identity so the robots, companies and the deal regenerate.
11. **Identity on the link, as plain params.** `theme=<id>` (the reserved param, now written and read) and one param
    per family, named by the family, carrying the set as a comma list in canonical option order:
    `melody=hypnotic,mechanical`, `melody=theme,wandering`. Written only when not `classic` / when the set is
    non-empty, so an untweaked Classic world is still the bare triple; an unknown id is dropped (with `devWarn`), and
    the same set always encodes to the same string. Never in the blob.
12. **The address bar follows the loaded world — identity only, and never on arrival.** `mirrorWorldToUrl(identity)`
    (`sessionShareUtils.ts`) rewrites `seed`, `x`, `y`, `theme`, the family params through `withParam`, removes `s`, and
    `replaceState`s. Called after the bare boot's `initializeLocale`, after every `retransmitWorld`, after every
    `applySessionPayload` from the off screen, after Roll. **Not** called on a link arrival (the arrival URL, blob
    included, stands until the world changes), not on Keep, not on an edit. `consumeSessionSharePayload` decodes the URL
    once at module load, so a later rewrite cannot re-fire it.
13. **Presets are links.** `TransmissionPreset = { id, nameKey, link }`; `presetPayload(preset)` =
    `decodeWorldLink(searchOf(link))`, where `searchOf` takes a full URL or a bare `?…` query. Until Crawford pastes his
    three, the three entries are the placeholders' bare triples (`kr1nd4ra` 12 68 …), so nothing is lost. The three
    payload constants, `ATTENUATION_STYLE_PRESETS`, `COORDINATE_PRESETS` and their buttons in `SectorSettingsDrawer` are
    deleted, not kept behind.
14. **Roll and Keep.** `rollWorld()` = `retransmitWorld({ attenuationStyleName: generateRandomAttenuationStyleName(),
    coordinates: { x: randomCoordinate(), y: randomCoordinate() } })` — the loading store is untouched, so the theme and
    aspects ride along; the pick returns to `current`. `keepCurrentWorld()` = `saveNamedSession(name, buildSessionPayload())`
    with `name = currentLoadedSessionName ?? currentSessionName`, then `setCurrentLoadedSessionName(name)` and a re-list
    of the saves. Keep is **dirty** (lit) unless `currentLoadedSessionName` names a save whose stored payload deep-equals
    `buildSessionPayload()` now; dirty is computed on mount and after a pick or a Keep, never per render. The warning
    line under the chooser shows only while dirty.
15. **One band table, one resolver, one context.** `src/data/bands/`: `bandKeys.ts` (`BandKey` = `'bpm'` |
    `LoadingRangeKey` | `robot.<field>` | `RobotSendField`; three band kinds — `range { min, max }`, `send { min, max,
    lit }`, `toggle { offShare, min, max }` for the 1–8 fields), `classic.ts` (every constant in the survey, lifted
    byte-for-byte), `themes.ts` (five partial columns; Classic's is `{}`), `aspects.ts` (families, each a key set and
    its options' partial columns — the type forbids an aspect naming a key outside its family), `resolveBands(theme,
    robotAspects): BandTable` (classic ← theme ← at most one aspect per family, replace not widen — **per robot**), and
    `loadingContext.ts`: `getBand(key)` reads the current table; `setLoading(identity)` installs the **theme's** table
    on a world change; `withLoading(identity, fn)` installs it for the duration of `fn` and restores — what
    `generateWorldSeedBaseline` uses, since the generators are synchronous. Aspects never enter the context: they reach
    a robot only through the deal pass (assumptions 21–22), which passes its bands explicitly. The generators
    (`spawnSystem.ts`, `globalAudioSeed.ts`, `bpmSeed.ts`, `generateRobotSends`) read `getBand(...)` where they read
    constants today. The bell-fitted shares stay constants, outside the table, in v1.
16. **The narrow first cut is a key list, not a rewrite.** v1 theme columns may touch: `bpm`, `robot.rhythmicDensity`,
    `robot.rests`, `robot.attack` / `robot.release` (and the shaped pair), `reverbSend`, `delaySend`,
    `filterLPF.frequency`. Melody's three aspects touch `robot.rhythmicDensity`, `robot.noteVariance`,
    `robot.rhythmicMotifLength`, `robot.pitchRepeat`. Every value in `themes.ts` / `aspects.ts` is a placeholder until
    the listen task (§5.3) sets it; the table shape is fixed here, the numbers are not. Hypnotic = low variance (toggle
    on, value 1–2), medium density (40–60); Mechanical = low variance, high density (70–95), long motif; Wandering =
    high variance (6–8), low–medium density (20–50), motif mostly off.
17. **Names are the sketch's lists; descriptions are content.** Ids `classic | calm | bold | adventurous | perilous`;
    family `melody` with `hypnotic | mechanical | wandering`. `home.off.theme.<id>` and `home.off.aspect.melody.<id>`
    (names), `home.off.themeDescription.<id>` / `home.off.aspectDescription.melody.<id>` (one sentence each), the
    "as theme" member's label, plus the family label, the Loading / Transmission group headings, the Keep button, the
    warning line, the Roll button, the footer, and the readout template extended to `{name} · {code} · {theme}` with an
    optional aspects tail (`Hypnotic + Mechanical`). `company.loadedUnder` and `probe.loadedUnder` name the readout
    line of assumption 24. The Guide later reads the same description keys.
18. **Boot theatre and veil belong to `OffScreen`.** On mount a `'ui'` timeline `off-screen-boot`: 0–0.5 s dark, 0.5–1.5 s
    a flicker to full, then ready; `prefers-reduced-motion` jumps to ready; any `pointerdown` on the screen jumps to
    ready; the rocker is outside the screen and works throughout. The veil is `OffScreen`'s own backdrop element
    (`backdrop-filter: blur(3px)` over `rgba(8, 12, 16, .55)`), inside `ScreenViewport`; on power-on `powerController`
    awaits `fadeOffScreen()` (a 0.4 s `'ui'` tween) before `setPowerOn`, so the veil fades before the screen unmounts.
19. **Foundry's status line and Comms.** `SectorSettingsDrawer`'s line becomes `describeWorld(identity)`; the shortcut
    rows go (assumption 13); nothing else moves. `session.clearStorage.confirmBody` loses "and autosaved".
20. **Pre-v1: nothing is kept for sound's sake.** Classic is today's bands by definition at the moment of the lift (§5.2
    pins it); later retunes move it; presets are re-shared when they drift. No fallback for the deleted confirm copy, no
    migration for old links beyond assumption 10's leniency.
21. **A family's picks are dealt round-robin over the fleet's seeded groups** (Crawford, 2026-10-30). The groups are the
    seeded companies in their spawn order (`c = 0, 1, …`), then each Freelance robot on its own in roster order. The
    picked list for a family — in canonical option order, `'theme'` included when selected — is rotated by a seeded
    offset (`getUniformSeededVal(noiseMap, 'aspects.<family>.deal', 0)`, the uniform draw, because one plain
    `getSeededVal` takes only a few values across worlds) and dealt: group 0 gets pick 0, group 1 pick 1, …, wrapping
    until **every group has one**. So one pick is the whole fleet; two picks alternate across companies, then
    freelancers; `'theme'` in the list leaves its groups plain, which is how a mixed fleet keeps plain robots. An empty
    list means every robot as theme. `dealAspects(identity, companies, roster): Map<robotId, Partial<Record<AspectFamilyId,
    AspectId>>>` is a pure function in `src/data/bands/dealAspects.ts`; a given world identity always deals the same
    way, so a link reproduces it, and adding or removing a pick may reshuffle — it is a retransmit anyway. "No room"
    cannot occur: a family's picks never exceed its options (three) and a world never has fewer than three groups.
22. **Aspects are applied after the deal by re-deriving the dealt fields.** Companies form after every robot has drawn
    its melody fields (survey), so `applyAspectDeal(localeId)` runs right after `spawnInitialCompanies`: for each dealt
    robot it recomputes the family's keys (assumption 16) with the same `noiseMap`, `dataId` and `spawnIndex` offset
    but the aspect's band — `getSeededVal` only maps the same noise into `min..max`, and `seedToggleValue` the same raw
    into an `offShare` and value band, so the result is deterministic and the spawn order is untouched; non-member
    fields and non-dealt robots are not touched. **Amended at planning (2026-10-30):** robot baselines are not stored —
    `buildSessionPayload` regenerates them at diff time (`generateRobotRosterBaseline`, `sessionDiff.ts:317–320`) — so
    the pass is one pure function applied both to the live roster after `spawnInitialCompanies` and inside
    `generateRobotRosterBaseline` (after `generateCompanyRosterBaseline`, from the same noise map); an untweaked dealt
    world then diffs `{}` by construction, and `generateWorldSeedBaseline` (world-level fields only) needs only
    `withLoading`. A robot moved between companies afterwards keeps what it rolled (bands are generation-only); a
    user-created company has no aspect.
23. **`RadioButton` gains a `multiple` variant** — a design-system addition, Crawford's call (2026-10-30: "it should use
    the cabinetry effect just like buttons and toggles do already"). `RadioButtonSchema.multiple?: true` makes `value`
    a `string[]` and `onChange(string[])`; each option is independently selectable; in the `cabinet` appearance every
    selected option is popped (the `Toggle`'s on-state look, `cabinetAnimation.ts`), in `muted` it carries the muted
    selected mark; a11y is a `group` of `aria-pressed` buttons, not a `radiogroup`. `docs/COMPONENT_LIBRARY.md` gains the
    variant. **The off screen renders its rows `muted`**, as today, under the standing decision that nothing comes off
    the plate while the power is off — flagged in §7 in case Crawford's "cabinetry" meant the off screen too.
24. **The deal is readable in the app.** The company detail's column and the robot detail's avatar column each carry one
    readout line — *Loaded under Hypnotic* (`company.loadedUnder` / `probe.loadedUnder`), a `DualLabel` over text, never
    a control — fed from a per-robot `loadedUnder` record kept beside the roster in `localeStore` (JSON: family → aspect
    id) and written by the deal pass; a member shows its company's, a freelancer its own, "as theme" shows nothing.

---

## 0. Capability Map

| Module id | Responsibility | Depends on |
|---|---|---|
| `power-pause` | Suspend / resume the audio context; scope and pause the world's timelines; pause the work loop's clock; `powerController`'s `cold / running / paused` paths; the rocker without a dialog | — |
| `off-screen-chooser` | The gate flag; the Transmission axis with Current, Roll, saves, presets-as-links; Keep; the veil, boot theatre and footer; the address-bar mirror; Foundry's shortcut removal | `power-pause` (Current = resume) |
| `band-table` | `src/data/bands/`: keys, Classic lifted byte-for-byte, the resolver, the loading context, the deal and the post-deal re-derivation; `loadingStore`; theme + aspect sets in `WorldIdentity`, the payload (v3) and the link params; `describeWorld` | — |
| `themes-and-aspects` | The Loading axis on the off screen (theme row, the multi-select Melody row, description lines, readout tail); `RadioButton`'s `multiple` variant; the "loaded under" line on the company and robot details; five theme columns and three Melody columns tuned by ear; Foundry's status line | `off-screen-chooser`, `band-table` |

Build order: `power-pause` → `off-screen-chooser` → `band-table` → `themes-and-aspects`. `band-table` has no dependency
on the first two and may be interleaved; nothing in it is user-visible until the fourth module. Each module ends at a
checkpoint (§5.3) before the next starts.

---

## 1. Overview & Claude Explanation

### 1.1 The six stories, as behaviour

Arrival (a bare URL / a shared link) × device (first visit / returning / returning with saves) — the sketch's six frames.

- **First visit, bare URL (story 1).** `hasHeardWorld()` is false. The world is built with its systems held (today's
  `initializeLocale(localeId, { startSystems: false })`), the bare boot mirrors its random identity into the URL
  (assumption 12), and `OffScreen` renders the etched label, the hint and the veil — nothing else. The first flip runs
  `start` + `startLocaleSystems`, then `markHeardWorld()`. Flip off → `pause()`; the screen now shows the chooser with
  Current selected (story 2's screen, same visit). Reload tomorrow → story 2.
- **Returning, bare URL (stories 2 and 3).** The flag is set. The world is the URL's (assumption 12 wrote it last time
  — a bookmark now returns the same world; Roll is how you get another). The chooser: Transmission (Current · saves if
  any · divider · presets) and Loading (theme row, Melody row), one readout. Flip with Current → `start` (the world is
  `'cold'` on a fresh load). Pick a save → silent `applySessionPayload`, the Loading rows follow it, the readout names
  it, the URL follows (assumption 12); flip → `start`. Change the theme, or the Melody set → `retransmitWorld({ theme,
  aspects })`: same AS + coords, the picks dealt over the companies and freelancers (assumption 21), tweaks gone, the
  world row drops to Current.
- **Shared link (stories 4–6).** The link's identity and blob are applied at boot as today; the URL is **not** rewritten.
  First visit: hint only — the friend's world plays on the flip, no choice offered. Returning: Current is the link's
  world, named and selected, the Loading rows at the link's theme and aspects. Picking anything else rewrites the URL
  to that world and drops the blob; a reload then returns to the pick, not the link. Keep saves the linked world as a
  row (a link is not a save until then).
- **Power off, every story.** The rocker pauses (assumption 5): music stops mid-note, robots freeze mid-glide, batteries
  hold, the day keeps turning. The off screen appears over the paused world, Current selected, Keep lit if the world
  differs from its saved form. Flip on with Current → `resume`, mid-phrase. Flip on after a pick → that world, from
  the top.

### 1.2 Power as pause — what freezes, what runs, what starts

| | `pause()` | `resume()` | `start` (cold) |
|---|---|---|---|
| Audio context | `rawContext.suspend()` | `rawContext.resume()` | `Tone.start()` (as today) |
| Transport, BeatClock `16n`, measures | frozen with the context | continue | start at 0 (as today) |
| Battery drain / charge, harmony, swells | frozen (they ride measures) | continue | start (as today) |
| Robot movers (`'world'` timelines) | `pauseWorldTimelines()` | `resumeWorldTimelines()` | built by `startLocaleSystems` |
| Work loop | `pauseWorkLoop()` (clock shifted) | `resumeWorkLoop()` | `startWorkLoop` |
| Day clock, day / night light | **run** (wall clock; never gated) | run | run — from the moment the world loads |
| UI timelines (rocker, nav, cabinets) | run | run | run |
| `isPoweredOn` | false | true | true |
| `worldState` | `'paused'` | `'running'` | `'running'` |

A world change while `'paused'` or `'running'` (a pick, Roll, a theme change, Foundry's Retransmit) goes through today's
teardown (`stopWorkLoop`, `killAll` → `resetBeatClock`) and leaves `'cold'`; the next flip is a `start`. There is no
path from `'paused'` to a different world that resumes.

### 1.3 Data shapes

```ts
// src/data/bands/bandKeys.ts
export type RangeBand  = { min: number; max: number };
export type SendBand   = { min: number; max: number; lit: number };           // ROBOT_SEND_LOADING_RANGES's shape
export type ToggleBand = { offShare: number; min: number; max: number };      // seedToggleValue: off below offShare, else a 1–8 value in [min, max]
export type BandKey    = 'bpm' | LoadingRangeKey | RobotBandKey | RobotSendField;
export type BandTable  = { [K in BandKey]: BandFor<K> };

// src/data/bands/themes.ts · aspects.ts
export type ThemeId = 'classic' | 'calm' | 'bold' | 'adventurous' | 'perilous';
export type AspectFamilyId = 'melody';                                        // 'voice' | 'envelope' | 'space' later
export type AspectId = 'hypnotic' | 'mechanical' | 'wandering';
export type AspectPick = AspectId | 'theme';                                  // 'theme' = the selectable "as theme" member of a deal
export const THEMES: Record<ThemeId, Partial<BandTable>>;                     // classic: {}
export const ASPECT_FAMILIES: Record<AspectFamilyId, { keys: readonly BandKey[]; options: Record<AspectId, Partial<BandTable>> }>;

// src/data/bands/resolveBands.ts — PER ROBOT: at most one aspect per family
export function resolveBands(theme: ThemeId, robotAspects: Partial<Record<AspectFamilyId, AspectId>>): BandTable;

// src/data/bands/dealAspects.ts — the world's picks dealt round-robin over companies (spawn order) then freelancers (roster order)
export function dealAspects(identity: WorldIdentity, companies: readonly Company[], roster: readonly Robot[], noiseMap: NoiseFunction2D):
  Map<string /* robotId */, Partial<Record<AspectFamilyId, AspectId>>>;

// src/stores/loadingStore.ts (JSON)
{ theme: ThemeId; aspects: Partial<Record<AspectFamilyId, AspectPick[]>> }   // lists in canonical option order; empty = all as theme

// src/utils/seedBaseline.ts
export interface WorldIdentity { attenuationStyleName: string; coordinates: { x; y }; theme: ThemeId; aspects: Partial<Record<AspectFamilyId, AspectPick[]>> }

// src/types/session.ts — version 3
theme?: ThemeId;                                       // absent = 'classic'
aspects?: Partial<Record<AspectFamilyId, AspectPick[]>>; // absent = {}

// src/types/controls.ts
multiple?: true;                                       // RadioButtonSchema: value is string[], onChange(string[]); cabinet pops each selected option

// src/data/transmissionPresets.ts
export interface TransmissionPreset { id: string; nameKey: ContentKey; link: string }  // a share URL or a bare "?seed=…" query

// src/utils/deviceFlags.ts — localStorage 'trace-atlas.device.v1'
{ heardWorld: true }
```

The link: `?seed=<AS name>&x=<int>&y=<int>[&theme=<ThemeId>][&melody=<pick>,<pick>…][&s=1.<blob>]` — the two new params
plain, the set as a comma list in canonical order, written only when not the default, never inside the blob.

### 1.4 Where each piece lives, and what moves

- **`powerController.ts`** — `worldState`, `pause()`, `resume()`, the two-way `powerOnSequence()`; `shutdown()` deleted.
  **`AudioEngine.ts`** — `pause()` / `resume()` rewritten to the context (assumption 2); `killAll` unchanged.
  **`timelineMap.ts`** — the scope, `pauseWorldTimelines`, `resumeWorldTimelines`. **`workLoop.ts`** — `pauseWorkLoop`,
  `resumeWorkLoop`, the shifted `now`. **`PowerRockerSwitch.tsx`** — the dialog and its state go; the off-branch timeline.
- **`OffScreen.tsx` (+ `.css`)** — the gate read, the two axes, Current, Roll, Keep, the readout, the veil, the boot
  timeline, the footer. Its pick model stays a `RadioButton` per axis (the theme row and the Melody row are two more
  muted `RadioButton`s). **`deviceFlags.ts`** new. **`transmissionPresets.ts`** — three links. **`sessionShareUtils.ts`**
  — `mirrorWorldToUrl`, `searchOf`. **`SectorSettingsDrawer.tsx`** / **`sectorSettingsConfig.ts`** — the shortcut rows
  deleted, the status line through `describeWorld`.
- **`src/data/bands/*`** new; **`loadingStore.ts`** new; **`seedBaseline.ts`**, **`worldLink.ts`**, **`types/session.ts`**,
  **`sessionDiff.ts`** (`buildSessionPayload` writes the two fields; `applySessionPayload` sets the loading store),
  **`worldTransition.ts`** (`RetransmitInput.theme/aspects`, `setLoading` before generation) — extended.
  **`spawnSystem.ts`**, **`globalAudioSeed.ts`**, **`bpmSeed.ts`** — constants replaced by `getBand(...)` reads; no value
  changes (§5.2 pins them). **`describeWorld.ts`** new (`src/utils/`): `AS · (x, y)[ · Theme][ · Aspect]`, with the
  save / preset name in front when the world is one.
- **Content** (`home.ts`, `ui.ts`, `session.ts`, `settings.ts`): the keys in assumption 17 added; `ui.power.confirm*`
  removed; `session.clearStorage.confirmBody` reworded. **Docs**: `docs/reference/GLOBAL_CHAIN_GRID.md` and
  `ROBOT_DATA_GRID.md` gain a column per theme and a note per aspect; `docs/UI_SHELL.md`, `docs/ROBOT_LIFECYCLE.md`,
  `docs/AUDIO_SYSTEM.md`, `docs/ANIMATION_SYSTEM.md`, `docs/SESSION_STORAGE.md` and `docs/MELODY_SYSTEM.md` each get the
  paragraph that describes the new behaviour; the roadmap gets 57; backlog 5 archives.

### 1.5 Resolution and generation, spelled out

`resolveBands(theme, aspects)` starts from `CLASSIC` (the lifted constants), overlays `THEMES[theme]`, then for each
family in `aspects` overlays `ASPECT_FAMILIES[family].options[aspect]`; an overlay **replaces** the band for the keys it
names and touches nothing else. The type of `ASPECT_FAMILIES[f].options[a]` is `Partial<Pick<BandTable, F['keys'][number]>>`,
so an aspect cannot reach outside its family — no conflict rule is needed. `getBand(key)` reads the table `setLoading`
installed for the loaded world; `withLoading(identity, fn)` is how the seed baseline regenerates inside a saved or linked
world's own bands, so `diffWorldAgainstSeed` never reads a Calm world against Classic's baseline (which would make every
seeded value an override). `getSeededVal(noiseMap, dataId, offset, band.min, band.max)` is unchanged: a theme moves the
last two arguments, never the draw.

**The deal, step by step** (assumptions 21–22). Generation runs as today under the theme's table: roster, then
companies. Then `applyAspectDeal(localeId)`: for each family with a non-empty pick list, build the group list — the
companies in spawn order, then every freelancer alone in roster order — rotate the pick list by the family's seeded
offset, deal pick `i mod n` to group `i`, and for every robot in a group dealt an aspect (not `'theme'`), re-derive that
family's keys from the same noise with `resolveBands(theme, { [family]: aspect })`'s bands; record `loadedUnder` on the
robot. One pick → every robot carries it; `['theme', 'hypnotic']` → alternating plain and hypnotic groups; the Melody
row with nothing picked → the pass is a no-op. The baseline generator runs the identical pass, so an untweaked dealt
world diffs empty against its own seed.

### 1.6 The Guide's part

Nothing on the off screen explains itself except the one-line description under the picked theme and under the picked
aspect — `home.off.themeDescription.<id>`, `home.off.aspectDescription.melody.<id>` — and those strings are the ones the
Guide (roadmap 51) will read for its Themes page. No link, no help popover, no manual on this screen.

---

## 2. Target File Structure

```
src/
  data/bands/
    bandKeys.ts              NEW  BandKey, the three band kinds, BandTable
    classic.ts               NEW  every lifted constant, byte-for-byte (§5.2 parity)
    themes.ts                NEW  ThemeId, THEMES (five partial columns; placeholders until the listen)
    aspects.ts               NEW  AspectFamilyId, AspectId, ASPECT_FAMILIES (melody only)
    resolveBands.ts          NEW  resolveBands() — per robot
    dealAspects.ts           NEW  dealAspects() — round-robin over companies then freelancers, seeded rotation
    loadingContext.ts        NEW  getBand(), setLoading(), withLoading()
  data/transmissionPresets.ts        CHANGED  { id, nameKey, link } ×3; the payload constants deleted
  data/sectorSettingsConfig.ts       CHANGED  ATTENUATION_STYLE_PRESETS / COORDINATE_PRESETS deleted
  data/globalAudioLoadingRanges.ts   CHANGED  the table moves into classic.ts (a re-export or a one-line read remains for the grid mirror)
  data/robotSendLoadingRanges.ts     CHANGED  same
  utils/bpmSeed.ts                   CHANGED  BPM_SEED_RANGE read through getBand('bpm')
  utils/globalAudioSeed.ts           CHANGED  loading-range lookups through getBand(key)
  systems/spawnSystem.ts             CHANGED  the *_RANGE constants and thresholds through getBand(...); applyAspectDeal() after spawnInitialCompanies
  stores/localeStore.ts              CHANGED  per-robot loadedUnder record (JSON), written by the deal pass
  stores/loadingStore.ts             NEW
  types/controls.ts, components/ui/controls/RadioButton.tsx (+ .test.tsx)   CHANGED  the `multiple` variant
  components/panels/screen/screens/CompanyScreen.tsx, RobotScreen.tsx         CHANGED  the "loaded under" readout line
  utils/deviceFlags.ts               NEW
  utils/describeWorld.ts             NEW
  utils/seedBaseline.ts              CHANGED  WorldIdentity + theme/aspects; generateWorldSeedBaseline(identity) via withLoading
  utils/worldLink.ts                 CHANGED  theme + melody params written and read
  utils/sessionShareUtils.ts         CHANGED  mirrorWorldToUrl(), searchOf()
  utils/sessionDiff.ts               CHANGED  payload v3; applySessionPayload sets the loading store
  types/session.ts                   CHANGED  version 3, theme, aspects
  systems/worldTransition.ts         CHANGED  RetransmitInput.theme/aspects; setLoading before generation; the URL mirror call
  systems/powerController.ts         CHANGED  worldState, pause(), resume(), two-way powerOnSequence(); shutdown() gone
  systems/workLoop.ts                CHANGED  pauseWorkLoop(), resumeWorkLoop(), shifted now()
  engine/AudioEngine.ts              CHANGED  pause()/resume() = context suspend/resume
  animation/timelineMap.ts           CHANGED  scope, pauseWorldTimelines(), resumeWorldTimelines()
  animation/*.ts, components/robot/gem/*.ts, components/actors/BubbleStream.tsx, systems/workLoop.ts
                                     CHANGED  setTimeline(..., 'world') at the fourteen survey sites
  components/ui/physical/PowerRockerSwitch.tsx   CHANGED  dialog removed; off-branch timeline
  components/panels/screen/screens/OffScreen.tsx / .css / .test.tsx   CHANGED  the whole screen
  components/panels/screen/console/SectorSettingsDrawer.tsx           CHANGED  shortcut rows gone; describeWorld status
  content/copy/home.ts, ui.ts, session.ts, settings.ts               CHANGED  keys per assumption 17
docs/
  specs/OFF_SCREEN.md (this), tasks/OFF_SCREEN.md (the plan), reference/GLOBAL_CHAIN_GRID.md, reference/ROBOT_DATA_GRID.md,
  UI_SHELL.md, ROBOT_LIFECYCLE.md, AUDIO_SYSTEM.md, ANIMATION_SYSTEM.md, SESSION_STORAGE.md, MELODY_SYSTEM.md,
  COMPANIES.md (the deal), COMPONENT_LIBRARY.md (the multiple variant), todo/roadmap.md (57)
```

Tests are colocated (`*.test.ts(x)` beside the module), as the repo does everywhere.

---

## 3. Implementation Boundaries & Constraints

- **Nothing pops or plays on the off screen.** Every pick is `applySessionPayload` / `retransmitWorld` on the faint
  world; no `AudioEngine.start()` runs from `OffScreen`; the rocker is the only gesture that makes sound.
- **Pause is a transport / context / timeline affair.** No `setTimeout`, `setInterval` or `requestAnimationFrame`
  anywhere in the pause or resume paths; the boot theatre and the veil fade are GSAP timelines in `timelineMap`.
- **GSAP timelines trigger semantic state only.** `fadeOffScreen()` resolves a promise the controller awaits; it does
  not call `AudioEngine` from a callback.
- **State stays JSON-serialisable.** `loadingStore` holds two strings' worth of ids; `worldState` is module state in
  `powerController` because it mirrors the audio graph, which is runtime, and must not persist.
- **Themes change loading bands only.** `GLOBAL_AUDIO_SEED_RANGES`, every slider's range, every LFO swing range and every
  clamp are untouched; the LFO engine never reads the band table.
- **The day is wall-clock and never gated** (CLAUDE.md guardrail); this spec adds no code to the day clock and removes
  none.
- **Every string in `src/content/`**; the ids are code, the names and descriptions are copy, Crawford's. The content test
  will fail on any entry nothing reads, so the deleted confirm copy must go in the same task as the dialog.
- **Interactive UI inside `ScreenViewport`** — the veil, the chooser, Keep and Roll are `OffScreen`'s; the sleeve gets
  nothing new.
- **Dim controls that do nothing:** Keep dims when there is nothing new to keep; no other control on the screen is ever
  inert, so nothing else dims.
- **Pre-v1:** no compatibility code beyond assumption 10's "absent reads as Classic"; no "preserve the old sound" rule.
- **Themes are world-wide, aspects are robot-side — a hard rule now, not a lean:** a band dealt per company cannot
  name `bpm` or a global-chain key; the family type (assumption 15) enforces it.
- **Ask first:** any new dependency (none is expected); any change to the lifecycle beyond §1.2's table (for instance a
  resume path from `'paused'` into a different world); widening the v1 key list in assumption 16; a fourth band kind;
  popping cabinetry on the off screen (the no-pop decision stands until Crawford flips it, §7).
- **Never:** store a timeline, the suspended context or a payload in Zustand; write the tweak blob into the URL; add a
  dialog back; recreate autosave in any form; test a file's text.

---

## 4. Code Style & Architecture Conventions

- Match the surrounding modules: named exports, `// ====` section banners where the file already has them, the doc
  comment on every exported function naming the spec assumption it implements (`(spec assumption 12)`), as `worldLink.ts`
  does for `SHORT_WORLD_LINK.md`.
- The resolver and the context are plain functions over plain data — no classes, no store reads inside `resolveBands`:

```ts
// src/data/bands/resolveBands.ts
/** Classic's bands, the theme's over them, each chosen aspect's over those — replace, never widen (spec §1.5). */
export function resolveBands(theme: ThemeId, aspects: Partial<Record<AspectFamilyId, AspectId>>): BandTable {
  let table: BandTable = { ...CLASSIC, ...THEMES[theme] };
  for (const [family, aspect] of Object.entries(aspects) as [AspectFamilyId, AspectId][]) {
    table = { ...table, ...ASPECT_FAMILIES[family].options[aspect] };
  }
  return table;
}
```

- Generators read bands at the point of the draw, never cache them at module scope (the table changes per world):

```ts
// spawnSystem.ts — before
const rhythmicDensity = Math.round(getSeededVal(noiseMap, 'robot.rhythmicDensity', spawnCount, 0, 100));
// after
const density = getBand('robot.rhythmicDensity');
const rhythmicDensity = Math.round(getSeededVal(noiseMap, 'robot.rhythmicDensity', spawnCount, density.min, density.max));
```

- `OffScreen` keeps its current shape — schemas built with `useMemo`, strings through `labels()` / `options()` / `fill()`,
  one `RadioButton` per axis, the readout a `role="status"` well — and gains no local copies of store state beyond the
  pick, the gate read and the saves list it already keeps.
- `powerController` stays the one place power side effects live; `PowerRockerSwitch` calls it and animates, nothing
  more. The two timelines in the rocker keep their ids.
- CSS: `OffScreen.css` only; the veil and footer are BEM children (`off-screen__veil`, `off-screen__footer`); no new
  global rules; reduced motion through `@media (prefers-reduced-motion: reduce)` where the boot flicker is a CSS state,
  and `gsap.matchMedia` where it is a timeline.

---

## 5. Testing & Verification Requirements

TDD, one commit per task (the repo's rule). Tests exercise code: they import or render what they check; no test reads a
source, CSS or doc file. Docs-only and copy-only tasks have no test and say so on their Proof line.

### 5.1 `power-pause`

- **T0 spike (no commit until it passes, and the result is written into the plan):** in the browser, with a world
  running — `rawContext.suspend()`, wait, `resume()`: the BeatClock's measure count continues from where it stopped (no
  jump, no double tick), a swell mid-ramp completes, a sounding note resumes, the Pixel resumes without a reload. If any
  of these fails, assumption 2's fallback (transport pause + voice release) is adopted and this section is amended.
- `AudioEngine.test.ts`: `pause()` calls `suspend` on the raw context, `resume()` calls `resume`; neither touches the
  transport; both are no-ops before `start()`.
- `timelineMap.test.ts`: a `'world'` timeline pauses and resumes with the two calls and a `'ui'` one does not; a
  `'world'` timeline set while paused is paused on registration; `killAllTimelines` still kills both scopes.
- `workLoop.test.ts`: with an injected `now`, a cooldown stamped before `pauseWorkLoop()` is still unexpired after a
  simulated gap and `resumeWorkLoop()`; the loop's timelines are registered `'world'`.
- `powerController.test.ts` (mocks): `pause()` call order and `worldState`; `powerOnSequence()` resumes from `'paused'`
  and starts from `'cold'`; a world change while paused leaves `'cold'`; `markHeardWorld` fires on the first start only.
- `PowerRockerSwitch.test.tsx`: no dialog renders on an off-click; `pause` is called after the hold; the two timeline ids.

### 5.2 `band-table`

- `resolveBands.test.ts`: **Classic parity** — `resolveBands('classic', {})` equals a literal table of today's values
  (the numbers typed into the test from the survey, so a lift that changes a value fails); a theme column replaces only
  its keys; an aspect replaces only its family's keys; the type test that an aspect cannot name a foreign key.
- `loadingContext.test.ts`: `withLoading` swaps and restores; `getBand` reads the installed table.
- `spawnSystem.test.ts` / `globalAudioSeed.test.ts` / `bpmSeed.test.ts`: under Classic every seeded value for a fixed
  noise map is byte-for-byte what it was (the existing deterministic-generation tests are the gate; add a case per file
  that generates under a non-Classic table and sees a different band applied — the parity-fixture rule: a distinguishing
  value, so the test cannot pass by coincidence).
- `dealAspects.test.ts`: one pick reaches every robot; two picks alternate over companies in spawn order, then
  freelancers in roster order; `'theme'` leaves its groups undealt; the rotation is seeded (two identities differ, one
  identity repeats); an empty list deals nothing; a world of three companies and no freelancers still seats three picks.
- `spawnSystem.test.ts` (deal pass): after `applyAspectDeal`, a dealt robot's four Melody fields equal a direct
  re-derivation from its noise under the aspect's bands, and every other field and every undealt robot are
  byte-for-byte unchanged; `loadedUnder` is written for dealt robots only.
- `seedBaseline.test.ts`: a baseline generated for `{ theme: 'calm' }` differs from Classic's; `diffWorldAgainstSeed` of
  an untweaked Calm world against its own baseline is empty — and so is that of an untweaked world dealt
  `['hypnotic', 'mechanical']` (the baseline runs the deal).
- `worldLink.test.ts`: `theme` / `melody` round-trip, the set as a comma list in canonical order (`mechanical,hypnotic`
  decodes and re-encodes as `hypnotic,mechanical`); absent and unknown ids read as default; a Classic untweaked world
  encodes as the bare triple.
- `sessionDiff.test.ts`: a version 2 payload applies as Classic; a version 3 payload sets the loading store.

### 5.3 `off-screen-chooser` and `themes-and-aspects`

- `deviceFlags.test.ts`: false on empty storage, true after `markHeardWorld`, false after `localStorage.clear()`, false
  when storage throws.
- `OffScreen.test.tsx` (extend the 23): hint-only when the flag is false; the chooser when true; Current selected by
  default and named by `describeWorld`; saves only when any; presets decode from links; a save pick sets the Loading
  rows and the readout; a theme change drops the world row to Current and calls `retransmitWorld` with the theme; Roll
  calls `retransmitWorld` with fresh identity and leaves the loading store alone; Keep saves under the suggested name,
  re-lists, dims; the warning line only while dirty; the footer renders; the veil renders while off.
- `sessionShareUtils.test.ts`: `mirrorWorldToUrl` writes the five params, removes `s`, preserves `debug` / `load`;
  `searchOf` accepts a URL and a bare query; the arrival URL is untouched by the boot path.
- `transmissionPresets.test.ts`: the three entries decode to whole payloads.
- `RadioButton.test.tsx` (extend): with `multiple`, clicking toggles an option in and out of the `string[]` value,
  several can be on at once, each selected option carries the popped / muted selected state, the group has no
  `radiogroup` role; without `multiple` nothing changes.
- `OffScreen.test.tsx` (the Melody row): picking two aspects calls `retransmitWorld` with both in canonical order;
  picking "as theme" alongside one aspect keeps both; clearing the row sends an empty list; the readout tail joins them.
- `CompanyScreen.test.tsx` / `RobotScreen.test.tsx`: the "loaded under" line shows the dealt aspect for a member's
  company and a freelancer's own, and nothing when the robot is as theme.
- `SectorSettingsDrawer.test.tsx`: the status line shows the theme; no shortcut buttons.
- `content.test.ts` passes (every new key read; the deleted keys gone).
- **Checkpoints (Crawford, in the browser):** A after `power-pause` — flip off mid-phrase, wait, flip on: resumes; robots
  frozen; day light moved. B after `off-screen-chooser` — the six stories by hand, phone and desktop; Keep; the URL.
  C after `band-table` — nothing audible changed (a Classic world sounds as before). D after `themes-and-aspects` — the
  **listen task**: the five themes and three aspects on one seed, bands tuned until each is audibly itself; the numbers
  then go into `themes.ts` / `aspects.ts` and the grids.

### 5.4 Performance gates

- `npm run perf:idle` on the off state, before `power-pause` and after `off-screen-chooser`: the veil and the paused
  world must not raise idle paint above the branch's baseline (17.2.5's measure).
- `npm run perf:audio` Pixel A/B against `main` after `power-pause`: no rise in underruns in the worst-case run; the
  HUD's counts recorded in the plan.
- `npm run perf` after `power-pause`: main-thread busy while off is lower than `main`'s off state (a suspended context
  and paused timelines should cost less than today's still frame with its idle ticks); record the figure.

---

## 6. Git & Workflow Context

- Branch: `feature/off-screen` off `main` (`cc9a01f2` or later). Per Crawford (2026-10-30), the intent, this spec and
  the task plan are committed together once the plan exists — not one by one; the build then proceeds one commit per
  task, RED first, with the module checkpoints as stop points. Never pushed by the agent; Crawford opens the PR.
- Commit subjects name the module and task (`power-pause T3: timelineMap scope + pauseWorldTimelines`), as the repo's
  recent branches do.
- The plan's last tasks: roadmap 57 written (About / Decisions / Not Doing), backlog 5 moved to the archive with its
  links rebased, the sketch's header marked BUILT (it becomes the record, as `layout-rework.html` did), `themes.md`
  marked built and pointed here.
- `copilot-instructions.md` is a pointer; any guardrail wording goes to `CLAUDE.md` only (none is expected: the
  two-clocks guardrail already says what §1.2 implements).

---

## 7. Open Questions & Risks

1. **Assumption 2 — suspend vs transport pause.** Tone 15's `Transport` derives ticks from the context clock, so a
   suspended context should freeze it cleanly, but the BeatClock's `16n` `scheduleRepeat` and the swell ramps have not
   been watched across a suspend in this codebase. The T0 spike decides; the fallback is written down. Also check the
   `?debug` HUD and `playbackStats` do not report the suspended span as a stall.
2. **Resume on phones.** `rawContext.resume()` after a long suspend on Android Chrome and iOS Safari — the rocker click
   is a gesture, so autoplay policy should allow it; verify on the Pixel at Checkpoint A. If a browser drops the context
   on long suspends, the resume path falls back to `start`.
3. **Assumption 12's bookmark change.** A bare URL no longer rolls a new world on each reload. Confirmed in the
   interview; recorded here because it is the one behaviour users had by accident that this phase removes.
4. **Assumption 15's refactor surface.** Threading `getBand` through `spawnSystem.ts`'s 51 draws is mechanical but wide;
   the Classic-parity tests (§5.2) are the net. The plan should do it in two or three tasks by file, each pinned.
5. **Assumption 16's v1 key list** is a guess at what makes five themes audibly different with the fewest knobs; the
   listen task may add a key (a Mix, a filter Q) — that is an "ask first" widening, not a silent one.
6. **Keep's dirty test** deep-equals a whole payload; it runs on mount and on picks only, so cost is not a concern, but
   floating-point normalisation (the `sessionDiff.ts` cleanup) must be applied to both sides or an untouched world
   reads dirty.
7. **The `'world'` scope default.** Defaulting `setTimeline` to `'ui'` means a future mover that forgets the scope keeps
   swimming through a pause. A lint rule is out (no file-text tests); the mitigation is the `timelineMap` test plus
   `docs/ANIMATION_SYSTEM.md` saying every mover passes `'world'`.
8. **Names in the lore voice.** Classic / Calm / Bold / Adventurous / Perilous and Hypnotic / Mechanical / Wandering are
   Crawford's starting lists; the copy pass (`docs/reference/copy-tone-guide.md`) may rename — ids stay.
9. **Roadmap number 57** — confirm nothing else has claimed it by the time the plan's last task runs.
10. **Assumption 23's appearance on the off screen.** Crawford asked for the multi-select to "use the cabinetry effect
    just like buttons and toggles do" — read here as the variant's `cabinet` appearance in the app, with the off screen
    still `muted` under the layout rework's no-pop decision. If he meant the off screen's rows should pop, the theme row
    and the Melody row switch to `cabinet` (one line each) and the sketch's "nothing pops" note is amended.
11. **Assumption 22 re-derives from the same noise.** It relies on every Melody key being drawn by `getSeededVal` from a
    `dataId` + `spawnIndex` the pass can repeat; `rhythmicDensity`, `pitchRepeat`, the two toggles and `rests` are
    (survey). If a later family's key is drawn through `getUniformSeededVal` or a dependent draw, its re-derivation
    needs the same recipe — the pass should be written per key, not per field type.
12. **Reshuffling on a pick change.** Adding a third pick may move Hypnotic from one company to another (the rotation
    is of the whole list). Accepted — it is a retransmit and tweaks are gone anyway — but worth a line in the Guide's
    description later.
