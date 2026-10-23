# Intent: Fleet Drift Consolidation

Confirmed via `interview-me` on 2026-09-29, ahead of a `spec-driven-development` pass.

## Outcome

The 3 existing global-chain LFO drift groups (`eq3`, `filterLPF`, `filterHPF` in `DriftGroupId`, `src/types/lfo.ts`) collapse into a single drift group covering all 7 global-chain LFO targets (`GLOBAL_LFO_TARGET_IDS`, `src/types/lfo.ts`) — matching the "one shared drift" pattern already shipped for robot LFOs (`DriftGroupId`'s `'robots'` group, read/written by `RobotDriftPanel` in `src/components/robot/SignatureArrayDrawer.tsx`). The merged drift gets its own new top-level Fleet Params nav group, "Fleet Drift" (label likely to change in an upcoming label review — not final), positioned as a new sibling to Pacing/EQ & Filters/Time & Space/Output, right after EQ & Filters. The 3 Rate/Depth Drift slider pairs currently embedded inside the EQ, Low-Pass Filter, and High-Pass Filter panels (`AudioRigEffectPanel`'s `driftContent`, `src/components/panels/screen/console/AudioRigDrawer.tsx`) are removed from those panels entirely.

## Behavior

- One Rate Drift / Depth Drift slider pair, in the new Fleet Drift accordion, replaces the 3 separate pairs currently shown inside EQ's/LPF's/HPF's own panels — editing it affects the drift on all 7 targets (EQ low/mid/high, LPF frequency/Q, HPF frequency/Q) together, the same way the existing `'robots'` group's one pair already affects every robot's LFOs together.
- The Fleet Drift accordion gets its own intro panel, matching every other Fleet Params group's existing `IntroPanel` (`FleetParamsContent.tsx` already gives every group one — Fleet Drift follows the identical pattern, not a new one).
- The `'robots'` drift group (Probe Drift) is **fully untouched** — not merged, not renamed, not repositioned. This phase is scoped only to the 3 global-chain groups.
- Nav tree: a new node appears at `Fleet Params > Fleet Drift`, a sibling of `Fleet Params > EQ & Filters`, not nested inside it — confirmed explicitly, since Fleet Params' existing breadcrumb behavior (a leaf's own name is trimmed, only its parent group's name shows) only produces "Fleet Params > Fleet Drift" if Fleet Drift is itself a group, not a leaf under EQ & Filters.

## Style / constraint

- Matches the existing `'robots'` group precedent exactly: one shared `{ rateDrift, depthDrift }` pair per group (`GlobalAudioSettings.lfoDrift`, `src/types/globalAudio.ts`), not a per-target setting — `driftGroupForTarget()` (`src/engine/lfoDrift.ts`) is what needs to stop distinguishing `eq3`/`filterLPF`/`filterHPF` and instead map all 7 targets to one merged group id.
- Matches Fleet Params' existing group shape (`FleetParamsContent.tsx`): one accordion → one group-level `IntroPanel` → leaves with no accordion of their own. Fleet Drift should render through the same shell other groups already use, not a bespoke layout.
- The Audio Load Budget's drift suppression (`audioStore.ts`'s `driftHeldOff`) is already a single boolean applied uniformly across every drift group, not per-group — merging 3 groups into 1 should require no change to *when* drift gets suppressed.

## Out of scope

- **Merging the `'robots'` drift group into this one** — rejected explicitly; Probe Drift stays exactly as it is today, fully separate from this merge.
- **A specific Effects Load rule change** — not requested. Flagged only as something to keep an eye on for side effects, not a spec to build against. (One known internal detail, not a product decision: `DRIFT_POOL_SIZE` in `lfoDrift.ts` currently sizes eq3/filterLPF/filterHPF's oscillator pools separately (3/2/2) for their own small target counts; a merged group needs its own pool-size decision for all 7 targets combined. This is implementation tuning, not a load-rule change.)
- **Renaming "Fleet Drift" now** — the label is a placeholder pending a separate, not-yet-scheduled label review across the app; do not treat it as final when implementing.

## Known implementation note (not yet spec'd)

- The exact new `DriftGroupId` shape (e.g. collapsing `'eq3' | 'filterLPF' | 'filterHPF'` into one new id, vs. some other representation) isn't decided — a spec pass should read `lfoDrift.ts`, `globalAudio.ts`, `audioRigConfig.ts`'s `LFO_DRIFT_GROUPS`, and `sessionDiff.ts`'s existing `lfoDrift` handling (session save/load) before choosing, since all four currently key off the 4-way `DriftGroupId` union.
- The new Fleet Params group's id/type plumbing (`FleetParamsGroup`, `SelectedFleetParamsEffect`, `FLEET_PARAMS_GROUP_FIRST_LEAF` in `useNavTree.ts`, `FLEET_PARAMS_LEAF_TO_EFFECT_KEY`) isn't designed yet — needs at least one new leaf id/effect-key pair for the merged drift control itself.
- Trait/color for the new Fleet Drift group/accordion wasn't asked about explicitly — `'spectral'` (matching EQ & Filters, since it's drift of those same effects) is the natural default, but not yet confirmed with Crawford.
