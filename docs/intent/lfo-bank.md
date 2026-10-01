# Intent: LFO Bank (four shared LFOs replace per-target instances)

Confirmed via `idea-refine` + `interview-me` on 2026-10-01, ahead of a `spec-driven-development` pass.

## Outcome

The world's modulation comes from **four shared LFOs** — the LFO Bank — instead of one private `Tone.LFO` per target. Each bank LFO owns its own shape, rate, rate drift and depth drift. Every existing modulation target (the 7 global-chain targets in `GLOBAL_LFO_TARGET_IDS`, and the per-robot layer gain/detune targets in `ROBOT_LFO_TARGET_IDS`, `src/types/lfo.ts`) stops storing `{ shape, rate, depth }` and instead stores **which bank LFO drives it, or none, and a depth**. The engine runs four oscillators plus one Gain per link, nothing else; the per-target `Tone.LFO` graphs, the drift pools and per-primary drift Gain pairs (`src/engine/lfoDrift.ts`), the robot-LFO cap, and the whole held-off / reconcile machinery in `src/engine/lfoEngine.ts` go away. The four LFOs are edited in one new Fleet Params accordion, **"LFO Bank"** (lore: **"Phase Locking"**), which replaces the current Drift accordion.

Why now: the robot-LFO priming fix on `bug/LFO-load` (roadmap 17.2.7) made the seeded robot LFOs real for the first time, and at ≈18 connected the audio thread saturated at Full (render capacity 0.998); the finite Full cap that shipped is a stopgap, not a design. Free | Sync (docs merged, code not started) would have multiplied the per-target surface again.

## Behavior

- **Four bank LFOs, world-level, app-lifetime.** Each is a real audio-rate `Tone.LFO` (not control-rate — that direction was considered and rejected for this phase). Each owns `shape`, `rate` (Hz, same `LFO_RATE_MIN..MAX`), `rateDrift` and `depthDrift`. Drift on a bank LFO is the same thing a drift group is today (a slow secondary wobbling that LFO's own rate and depth), collapsed onto one oscillator: at most four secondaries in the whole app.
- **Per target: lane + depth, nothing else.** A target stores `{ lfo: <one of the four> | null, depth }`. `null` means not in the graph at all — no link Gain, no connection — and is what the seed's quiet roll now produces (today's `rate: 0` "off" state is gone). The UI for a target is a four-way lane picker with an off position plus one Depth slider. The per-target Shape/Rate controls and the per-target shared `Lfo` display (`LfoTargetGroup`'s current Rate/Depth/Shape) are removed from every robot layer panel and every EQ/filter panel. No polarity/invert flag.
- **Lockstep is a feature.** Every link on the same bank LFO moves phase-coherently. Twelve robots breathing together on lane B is the intended sound, not something to decorrelate.
- **Depth drift on a bank LFO scales every link on it** at once. Confirmed acceptable (follows from lockstep).
- **Seeding leans toward variety, mildly:**
  - The four bank LFOs are seeded per world: rates spread across the range (one slow, one fast, two between, each jittered) rather than four independent draws; shapes and both drift amounts seeded too.
  - Per target, the seed draws "lane or none" with the existing on-odds (robot `LFO_QUIET_THRESHOLD` in `spawnSystem.ts`, global `LFO_QUIET_THRESHOLD` in `utils/globalAudioSeed.ts` — both untouched in value), then picks the lane by a **weighted draw that favours the lanes with fewer links so far** — not strict round-robin. A world can still have a lane dominate a robot; it should rarely have everything on one lane.
  - Depth is drawn from today's depth range. **The seed never emits a lane with depth 0** (no pointless combos on load). A user may still set depth 0 by hand.
  - Per-target shape and rate draws no longer exist. The Task 1 seed oracle in `spawnSystem.test.ts` (added on `bug/LFO-load`) is retired, not preserved.
- **User can edit everything the seed set:** the four bank LFOs in the LFO Bank accordion; each target's lane and depth where that target's slider lives today (robot Signature Array layers, EQ & Filters panels); company broadcast sends lane + depth per target exactly as it sends shape/rate/depth today.
- **Phase targets are cut.** `layer0/1/2.phase` leave `RobotLfoTargetId` (6 robot targets remain: `layer{0,1,2}.{gain,detune}`). Alignment stays a plain slider. The control-rate phase-polling fallback in `lfoEngine.ts` is deleted with it — every remaining target is a live Signal/Param.
- **Load dial:** the robot-LFO cap (`ROBOT_LFO_CAP_LIGHT/STANDARD/FULL`, `robotLfoCap`, `lfoAllowed`, `maxRobotLfos`) and all held-off state (`heldOff`, `requested`, `reconcileLfos`, `subscribeHeldOff`, `getHeldOffLfoKeys`, `HeldOffNote`, the `heldOff` props on `Lfo`/`LfoTargetGroup`, `heldOffLfoKeys` in the store) are removed. `filterLfosEnabled` (the destination-side filter switch) and drift-off at Light stay, now applied to the four bank LFOs. Revisit later if measurement says robot links still cost at Light.
- **Fleet Params layout:** the current **Drift** accordion (`fleetDrift` in `FleetParamsContent.tsx`, holding Environmental Drift (`FleetDriftPanel`) and Voice Drift (`RobotDriftPanel`)) is removed along with both panels. The new **LFO Bank** accordion sits **between Pacing and EQ & Filters**, carries the **`timeSpace`** trait, and follows the existing group shape (one accordion → group `IntroPanel` → leaf sections, no nested accordions). The nav tree (`navTreeConfig.ts`, `useNavTree.ts`'s `FLEET_PARAMS_GROUP_FIRST_LEAF`, `uiStore.ts`'s `FleetParamsGroup`) and `FleetParamsContent.tsx`'s own table both change, kept in sync by hand as today.
- **Free | Sync** shrinks to one Float/Anchored toggle per bank LFO (four) plus Delay Time's own. The merged plan `docs/tasks/FREE_SYNC_TOGGLE.md` is re-planned **after** this lands, not before.
- **Saved sessions / share links are not migrated.** The loader drops `lfoSettings` / `globalLfo` / `lfoDrift` overrides in the old shape and falls back to the new seed; the share payload version bumps. Crawford is the only user; nothing save-wise is set in stone.

## Style / constraint

- CLAUDE.md rules hold: the four LFOs are Tone nodes owned by the engine, no timers for modulation, Zustand stays JSON-serialisable (lane ids and depths, never nodes), rate stays a plain Hz float in the engine.
- The additive-connect fix (`connectAdditively`, `centeredSwingFromRange` in `lfoShared.ts`) still applies per link: the link Gain carries depth × the target's bounded swing, so a bank LFO's unit output never pushes a filter past its range.
- New user-facing strings (accordion, intro, lane names, picker labels) go through `src/content/` per the content layer; the four lanes get lore names there — a spec detail, not decided here.
- Success bars (all three, confirmed): measurable perf headroom at Full with every seeded link connected and no cap (today's median peak is 0.40–0.44 on the pinned worlds); fewer things to manage (configure four, then only assign); sounds as good or better by ear on `charlie:200:-30` / `bravo:-150:90`.

## Out of scope

- **Control-rate / polled bank LFOs** — considered as a cheaper variant (and would have fixed filter a-rate cost and made LFO phase replayable); rejected for this phase in favour of real audio-rate nodes. May be revisited.
- **Phase (`layerN.phase`) as a modulation target** — cut, see Behavior.
- **Per-link polarity/invert or any other decorrelation** — lockstep is wanted.
- **Lane-based load degradation** (Light runs two lanes, Full four) — not now; the filter switch and drift-off are the only dial effects on modulation.
- **Fixed lane "characters" (Tide/Breath/Pulse/Flutter) with constrained ranges** — the four are seeded with spread rates but are otherwise blank, fully editable oscillators.
- **Migrating old sessions / share links** — dropped, not converted.
- **A modulation-matrix overview UI** — rejected; the per-target picker is the UI.
- **The Free | Sync implementation itself** — re-planned after this lands.
- **Changing the on-odds** for robot or global targets.

## Known implementation note (not yet spec'd)

- Exact data shapes: the bank LFO settings record (four entries, where in `GlobalAudioSettings`/`audioStore`), the per-target link type replacing `LfoSettings` on `Robot.lfoSettings`, `CompanyOptionsSnapshot.lfoSettings` and `audioStore.globalLfo`, and the lane id type (`'a' | 'b' | 'c' | 'd'` vs something else).
- The engine surface: `lfoEngine.ts` is largely rewritten (bank setters, `linkTarget(target, lane, depth, robotId?)` / `unlinkTarget`, re-link after `reReserveVoice` — the stale-signal rewire `robotLfoPriming.ts` just added still matters, but now re-links instead of re-primes). `lfoDrift.ts` collapses to one secondary per bank LFO.
- Seeding mechanics: the "spread with jitter" rate draw for the four, the weighted lane draw (how strongly to favour the least-used lane), and keeping `getSeededVal` keys deterministic per world.
- UI primitive for the lane picker (likely `RadioButton` with an off option) and what the `LfoTargetGroup` composition becomes once the shared display is gone — possibly a plain row of sliders with a picker + depth per row.
- Docs to correct afterwards: `docs/AUDIO_SYSTEM.md` LFO Modulation section, `docs/specs/FREE_SYNC_TOGGLE.md` + plan, roadmap entry (new phase, sibling of 17.2.7), `docs/reference/ROBOT_DATA_GRID.md` / `GLOBAL_CHAIN_GRID.md` LFO columns, `docs/PERFORMANCE.md` dated measurement.
- One known doc/code discrepancy to carry forward: the LFO Load Fix docs say robot odds are 25% on, but `LFO_QUIET_THRESHOLD` in `spawnSystem.ts` is 0.7 (30% on). The value is untouched by this phase; the docs should say 30%.
