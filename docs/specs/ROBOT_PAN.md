# Phase Spec: Robot Pan — a Pan Slider Beside Volume, with Auto

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Main-thread check (optional, §5): `npm run perf`

Source of intent: [docs/intent/robot-pan.md](../intent/robot-pan.md) (confirmed 2026-10-13, five questions,
every guess confirmed). Roadmap slot: **49** ([roadmap.md](../todo/roadmap.md#49-robot-pan-a-pan-slider-beside-volume-with-auto));
its "Shape" paragraph is superseded wherever this spec differs (notably: one `pan` field, no remembered
manual value). Branch `feature/robot-pan`, off `main` at `d195f81d`. The layout rework is merged, so the
slider is laid out once on the screen that ships.

Survey basis (2026-10-13, against the current tree):

- **The panner exists and already follows the robot.** `reserveVoice` builds `composite.output → panner →
  busGain → busFilter → chain` per robot (`src/engine/AudioEngine.ts:664–689`). `updateAllPanners`
  (`:328`) runs once per 16n tick from the melody playback loop (`:443`), reads live GSAP x via
  `getRobotVisualX` (`:224`), maps it with `calculatePanFromPosition(x) = x / WORLD_WIDTH − 0.5`
  (`src/engine/audioEngine/panning.ts`, ±0.5), skips writes under `PAN_WRITE_EPSILON = 0.0005` using the
  module map `lastPanByRobot` (`:177`, cleared in `releaseVoice` `:734`), and writes `panner.pan.value`
  directly (an instant set, no ramp).
- **The volume pattern this mirrors.** `applyVolume` (`src/systems/robotOptionsActions.ts:35`) =
  `updateRobot` + `AudioEngine.updateRobotMasterVolume` (`AudioEngine.ts:886`), which ramps `busGain.gain`
  over `VOLUME_RAMP_SECONDS = 0.05` (`:84`) via `rampTo` when the live param supports it, else sets
  `.value`. Reservation reads `robot.masterVolume` from the store at three sites: `spawnSystem.ts:729`,
  `:883` (`reRegisterAllRobotsAudio`) and `AudioEngine.loadInstruments` (`:269`).
- **The UI host.** `AudioSettingSection.tsx` is a pure value/onChange component (no store access,
  `memo`-wrapped) rendering `RadioButton` + `SliderLinear` inside two column `DirectionalPanel`s.
  Value shape `AudioSettingValue { audioMode, masterVolume }`. Two call sites: `RobotScreen.tsx`
  (`useRobotSubsectionRenderer`, `:191` value memo, `:214` volume handler) and
  `CompanyOptionsSection.tsx` via `useCompanyOptions.ts` (`:189` value memo, `:259` `onVolumeChange`
  broadcast + `patchSnapshot`). Schemas in `src/data/robotOptionsConfig.ts` (`VOLUME_SCHEMA` `:56`).
- **Primitives.** `SliderCenteredZero` (`src/components/ui/controls/SliderCenteredZero.tsx`) takes
  `{ schema, value, onChange, disabled?, verticalHeight?, swelling? }` and has **no `readOnly` branch**;
  `SliderLinear` has one (roadmap 15.1, `SliderLinear.tsx:90–109`: `role="status"`, `data-readonly`, plain
  divs, same VoxelTrack fill). `Toggle` bare (no `children`) renders a fixed `CABINET_TOGGLE_BOX_SIZE = 44`
  box with an external `DualLabel`, so it never resizes on flip. `ControlSchemaBase.help` is spread by
  `labels()` from the content entry's `help` and renders the "?" popover (layout spec §1.4).
- **Persistence.** `RobotAudioOverrideDiff` (`src/types/session.ts:17`) and
  `computeRobotAudioOverrideDiff` (`src/utils/sessionDiff.ts:230`) diff against `RobotAudioBaseline`
  (`spawnSystem.ts:420`); `buildRobotUpdates` (`:368`) and the apply loop (`:523`) restore;
  `sessionShareUtils.ts` abbreviates via `CompactRobotOverrideDiff` (`:98`, `to`/`from` at `:209`/`:225`).
  `masterVolume` is on `docs/SESSION_STORAGE.md`'s "explicitly never persisted" list; `audioMode` too.
- **Companies.** `CompanyOptionsSnapshot` (`src/types/Company.ts:16`), `resolveCompanyOptions`
  (`src/systems/companyOptions.ts:33`) falls back per field to the first member; `useCompanyOptions`
  hands each section a narrowly-memoised value and `latest`-ref handlers.
- **Content.** `probe.volume` (`src/content/copy/probe.ts:150`) carries `human`, `lore`, `unit`, `help`;
  `probe.levels` (`:131`) has the section intro naming Monitor Mode and Volume. Toggle precedent:
  `probe.composition.clickTrack` (`:170`) → `CLICK_TRACK_SCHEMA` (`robotOptionsConfig.ts:145`).
- **Store writes from the audio tick have precedent** (Audio Swells write robot fields every 16n), but
  `localeStore.robots` is subscribed to by the roster, cards and the world, so a per-tick `updateRobot`
  is the wrong channel for a readout (§1.4 picks a dedicated store).

ASSUMPTIONS I'm making beyond the intent's five decisions (correct now or I'll proceed with these):

1. **Stored `pan` is in [−1, 1]; the slider displays −100…100 in steps of 1, no unit and no L/R letters.**
   `SliderCenteredZero` has no `formatValue`; adding one is a primitive change this phase doesn't need.
   The roadmap's "L / R percentages or a centred bar?" question resolves to: a centred bar with a signed
   number. (Veto point: if you want "L 40 / R 40", that is one `formatValue` on the primitive, same shape
   as `SliderLinearSchema.formatValue`.)
2. **One robot field pair, `panAuto: boolean` and `pan: number`, both required on `Robot`** (like
   `masterVolume`), spawn defaults `true` / `0`, no noise draw, so existing worlds are byte-identical and
   `generateRobotAudioBaseline` needs no new field (the baseline is a constant).
3. **The session/share diff carries a single optional `pan`**: present means "Auto off at this value";
   absent means Auto (the default). No `panAuto` key in the diff. Restoring a payload with `pan` sets both
   robot fields and primes the engine. A robot whose Auto was switched off and back on diffs to nothing.
4. **The live readout travels through a new, tiny Zustand store** (`robotPanReadoutStore`, §1.4),
   written by `updateAllPanners` only on the writes it already makes (epsilon-gated), never through
   `localeStore`. JSON-serialisable (`Record<robotId, number>`), so CLAUDE.md's state rule holds; it is
   never saved, never shared.
5. **`SliderCenteredZero` gains `readOnly`** on `SliderLinear`'s 15.1 pattern (same `role="status"`,
   `data-readonly`, no Radix root). It is the Auto-on rendering for both screens, so the value keeps its
   normal colours and is never desaturated. `CONTROL_SCHEMA_TYPES` stays 14.
6. **Switching Auto off writes the live value into the robot** (`pan = AudioEngine.getLivePan(id)` ??
   current readout ?? 0) in the same action that flips the flag, so the slider never jumps and one field
   suffices. Switching Auto on leaves `pan` as it was (ignored while Auto; not diffed, see 3).
7. **Both directions and every slider edit ramp over `PAN_RAMP_SECONDS = 0.05`**, the Volume constant's
   value in a constant of its own, on `panner.pan.rampTo` when available, else a `.value` set (test
   environments). Auto-on's ramp lands on the current auto value and seeds `lastPanByRobot` with it, so the
   tick's epsilon gate takes over without a second jump.
8. **Engine state for a manual robot is a module map `manualPanByRobot`** consulted by `updateAllPanners`
   (`continue`), set/cleared by `updateRobotPan`, and **cleared in `releaseVoice`** like `lastPanByRobot`.
   The store is the source of truth: every reservation site re-primes a manual pan from `robot.pan`
   (§1.3), so release/re-reserve never loses it and nothing leaks.
9. **Companies broadcast `pan` and `panAuto` as two handlers**, each mirroring `onVolumeChange` (loop the
   members through the robot action, then `patchSnapshot`). The company slider is read-only whenever the
   resolved `panAuto` is true and shows the resolved stored `pan` (snapshot, else first member's field);
   it never subscribes to the readout store.
10. **Lore names are placeholders until Crawford's copy pass:** `probe.pan` { Pan / **Bearing** } and
    `probe.pan.auto` { Auto / **Tracking** }. The help copy says phone speakers are mono (intent). Keys and
    human words are fixed; the lore words are the one thing here I expect to be changed.
11. **No Pixel underrun A/B is required** (no new nodes, fewer writes for manual robots); a before/after
    `npm run perf` run is a courtesy check, not a gate.

---

## 1. Overview & Claude Explanation

A Pan row under Volume on the robot and company screens: a centred-zero slider with full ±1 travel and an
Auto toggle, on by default. With Auto on nothing about today's audio changes: `updateAllPanners` keeps the
robot's existing `Tone.Panner` following its live GSAP x across the ±0.5 field, and the slider is a live,
read-only readout of that value, fed by a tiny readout store the tick already has the number for. Switching
Auto off holds the **sound** where it is while the robot keeps swimming: the action copies the live pan
into `robot.pan`, flips `panAuto`, and the engine moves that robot into a manual map the tick skips. The
robot's movement is never touched — the work loop, swim and job timelines and `position` are not part of
this phase; only the panner stops following them. The slider then writes `robot.pan`
through `applyPan` → `AudioEngine.updateRobotPan`, a short ramp on the panner, over the full ±1. Switching
Auto on ramps back to the live position and hands the robot to the tick again. A manual pan is a
composition choice, so it is saved (session diff and share link, one optional `pan` key, absent = Auto);
Volume stays live-only. Companies broadcast both the value and the toggle; their slider is read-only at
the stored value while Auto is on. Nothing on the robot body moves with pan; no new Tone nodes.

### 1.1 Data shape

```ts
// src/types/Robot.ts
export interface Robot {
  // …
  masterVolume: number;
  /** Stereo position, −1 (left) … 1 (right), written by the Pan slider and by switching Auto off (the
   *  live value at that moment). Ignored by the engine while `panAuto` is true. Spawn default 0. */
  pan: number;
  /** True (spawn default): the panner follows the robot's live x (updateAllPanners, ±0.5 field) and
   *  `pan` is ignored. False: `pan` is written to the panner and the tick leaves this robot alone. */
  panAuto: boolean;
}

// src/constants.ts
export const PAN_MIN = -1;
export const PAN_MAX = 1;
export const PAN_DISPLAY_SCALE = 100;       // slider shows −100…100, stores −1…1 (same split as Volume)

// src/types/Company.ts
export interface CompanyOptionsSnapshot { /* … */ pan?: number; panAuto?: boolean; }

// src/types/session.ts
export interface RobotAudioOverrideDiff {
  // …
  /** Present ⇒ Auto off at this value (−1…1). Absent ⇒ Auto, the default. There is no panAuto key:
   *  "Auto on" is the baseline, so it is the absence of this field (assumption 3). */
  pan?: number;
}

// src/stores/robotPanReadoutStore.ts  (§1.4)
interface RobotPanReadoutState {
  /** Last pan the engine wrote for a robot under Auto, −0.5…0.5. Absent until its first write. */
  pan: Record<string, number>;
  setPan: (robotId: string, value: number) => void;
  clearPan: (robotId: string) => void;
}
```

Spawn (`spawnSystem.ts` robot literal, after `masterVolume`): `pan: 0, panAuto: true`. No `getSeededVal`
call, no change to any existing key or draw order. Test fixtures that build a `Robot` by hand gain the two
fields (the type makes the compiler find them).

### 1.2 Actions — `src/systems/robotOptionsActions.ts`

```ts
/** Pan slider: display −100…100 → stored −1…1, then one engine ramp. Only meaningful with Auto off;
 *  with Auto on the slider is read-only and never calls this. */
export function applyPan(robot: Robot, localeId: string, display: number): void {
  const value = clamp(display / PAN_DISPLAY_SCALE, PAN_MIN, PAN_MAX);
  useLocaleStore.getState().updateRobot(localeId, robot.id, { pan: value });
  AudioEngine.updateRobotPan(robot.id, value);
}

/** Auto off: hold the sound where the robot is now (assumption 6) — the live auto value becomes `pan`,
 *  then the engine takes the robot out of the pan tick. The robot itself keeps moving. Auto on: flag only;
 *  the engine ramps back to the live position. */
export function applyPanAuto(robot: Robot, localeId: string, auto: boolean): void {
  if (auto) {
    useLocaleStore.getState().updateRobot(localeId, robot.id, { panAuto: true });
    AudioEngine.updateRobotPan(robot.id, null);
    return;
  }
  const live = AudioEngine.getLivePan(robot.id) ?? robot.pan;
  useLocaleStore.getState().updateRobot(localeId, robot.id, { panAuto: false, pan: live });
  AudioEngine.updateRobotPan(robot.id, live);
}
```

`localeStore.updateRobot` needs no new normalisation beyond clamping `pan` into `[PAN_MIN, PAN_MAX]` where
it already clamps `rhythmicDensity` etc. (so a hand-edited payload can't store 7).

### 1.3 Engine — `src/engine/AudioEngine.ts`

```ts
const PAN_RAMP_SECONDS = 0.05;                       // same value as VOLUME_RAMP_SECONDS, own constant
const manualPanByRobot = new Map<string, number>();  // robots the tick must skip (assumption 8)

function updateAllPanners(_time?: number): void {
  for (const [robotId, entry] of compositeVoices.entries()) {
    if (manualPanByRobot.has(robotId)) continue;       // NEW — before the DOM read, so it's also cheaper
    const panValue = calculatePanFromPosition(getRobotVisualX(robotId));
    const previous = lastPanByRobot.get(robotId);
    if (previous !== undefined && Math.abs(previous - panValue) < PAN_WRITE_EPSILON) continue;
    entry.panner.pan.value = panValue;
    lastPanByRobot.set(robotId, panValue);
    useRobotPanReadoutStore.getState().setPan(robotId, panValue);   // NEW — same gate, no extra writes
  }
}

export const AudioEngine = {
  /** Auto off (`value` a number): pin the panner there and stop the tick touching it. Auto on (`null`):
   *  ramp to the current auto position, seed lastPanByRobot so the tick's epsilon gate resumes cleanly,
   *  and hand the robot back. Ramps over PAN_RAMP_SECONDS on `rampTo` when the live param has it, else a
   *  `.value` set. Safe no-op with a devWarn when no composite is reserved (updateRobotMasterVolume's
   *  pattern) — the store still holds the value, and reservation re-primes it. */
  updateRobotPan(robotId: string, value: number | null): void;
  /** The value the engine would show a slider under Auto: lastPanByRobot's entry (−0.5…0.5), or
   *  undefined before the first tick write / after release. Pure read; never touches the DOM. */
  getLivePan(robotId: string): number | undefined;
  releaseVoice(robotId) { /* … */ lastPanByRobot.delete(robotId); manualPanByRobot.delete(robotId); useRobotPanReadoutStore.getState().clearPan(robotId); }
};
```

`updateRobotPan(id, v)` for a manual value: `manualPanByRobot.set(id, v)`, ramp the panner to `v`, and
`lastPanByRobot.delete(id)` (a stale auto value must not short-circuit the first write after Auto returns).
`updateRobotPan(id, null)`: `manualPanByRobot.delete(id)`, `target = calculatePanFromPosition(getRobotVisualX(id))`,
ramp to `target`, `lastPanByRobot.set(id, target)`, `setPan(id, target)`.

**Reservation re-primes from the store** (assumption 8). After each existing `reserveVoice(...)` call that
passes `robot.masterVolume` — `spawnSystem.ts:729`, `:883`, `AudioEngine.loadInstruments` (`:269`) — add
`if (!robot.panAuto) AudioEngine.updateRobotPan(robot.id, robot.pan)`. `reserveVoice`'s signature is not
widened (it already has eight positional parameters). The `AudioEngine.updateVoice*` re-reservation path
(`:788–800`) goes through `releaseVoice` + `reserveVoice` and so re-primes for free via the caller site
that follows it; §5 has a test for exactly that round trip.

Nothing else in the engine changes: `calculatePanFromPosition`, the ±0.5 field, the DOM read, the epsilon,
the tick cadence and `scheduleNote` are untouched. No GSAP callback is involved anywhere.

### 1.4 The live readout — `src/stores/robotPanReadoutStore.ts`

A 20-line Zustand store, `pan: Record<string, number>` plus `setPan`/`clearPan` (which return the same
state object when nothing changes, so no subscriber re-renders). Writer: `updateAllPanners` (§1.3) and
`updateRobotPan(id, null)`. Reader: `RobotScreen`'s subsection renderer, through one selector
`useRobotPanReadoutStore((s) => (panAuto ? s.pan[robot.id] : undefined))` — the selector returns
`undefined` for a manual robot, so a manual robot's screen never re-renders on anyone's tick. Cost while
a robot's screen is open and that robot is swimming: one memoised section re-render per epsilon-passing
tick (≤ 4/s at 60 BPM, 0 while it stands still). Never persisted, never shared, never read by the engine
(the engine reads its own `lastPanByRobot`). The company screen does not subscribe (assumption 9).

Why not `localeStore`: a per-tick `updateRobot` would churn the `robots` array every subscriber of the
roster, cards and world keys on. Why not an emitter outside Zustand: this *is* state a component renders,
and the house rule keeps rendered state in Zustand.

### 1.5 UI — `AudioSettingSection` and its schemas

```ts
// src/data/robotOptionsConfig.ts, beside VOLUME_SCHEMA
export const PAN_SCHEMA: SliderCenteredZeroSchema = {
  id: 'robotOptions.pan', type: 'sliderCenteredZero', ...labels('probe.pan'),
  min: -PAN_DISPLAY_SCALE, max: PAN_DISPLAY_SCALE, step: 1, orientation: 'horizontal',
};
export const PAN_AUTO_SCHEMA: ToggleSchema = { id: 'robotOptions.panAuto', type: 'toggle', ...labels('probe.pan.auto') };
export const PAN_ROW_PANEL_SCHEMA: DirectionalPanelSchema = { id: 'robotOptions.panRow', type: 'directionalPanel', orientation: 'row' };
```

```ts
// src/components/robot/AudioSettingSection.tsx
export interface AudioSettingValue {
  audioMode: NonNullable<Robot['audioMode']>;
  masterVolume: number;
  /** −1…1 stored; displayed ×PAN_DISPLAY_SCALE. Under Auto this is the stored value, not the readout. */
  pan: number;
  panAuto: boolean;
}
interface AudioSettingSectionProps {
  value: AudioSettingValue;
  onAudioModeChange: (mode: Robot['audioMode']) => void;
  onVolumeChange: (pct: number) => void;
  onPanChange: (display: number) => void;        // −100…100, same display-domain contract as onVolumeChange
  onPanAutoChange: (auto: boolean) => void;
  /** The engine's live auto value (−0.5…0.5) for the robot screen; undefined on the company screen and
   *  whenever Auto is off. Kept out of `value` so the ≤4 Hz readout only re-renders this section. */
  livePan?: number;
  disabled?: boolean;
  volumeSwelling?: boolean;
  style?: CSSProperties;
}
```

Rendering: a third row inside `VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA`, after the Volume row, as a
`DirectionalPanel` with `PAN_ROW_PANEL_SCHEMA` holding the slider (grows) and the toggle (its own 44 px
box). The slider's `value` is `(value.panAuto ? (livePan ?? value.pan) : value.pan) * PAN_DISPLAY_SCALE`
and it is `readOnly={value.panAuto}`; `onChange={onPanChange}`. `swelling` is not passed: the readout
arrives at ≤ 4 Hz and `useEasedControlValue`'s 250 ms `quickTo` ease is the right smoothing for that
cadence (unlike a swell, the readout has no smoothing of its own). The toggle is a bare `Toggle`
(`PAN_AUTO_SCHEMA`, `value.panAuto`, `onPanAutoChange`), so it holds its size on flip by construction.
Both handlers are already-stable props (memo contract unchanged). The slider wrapper div carries the same
no-`display:flex` treatment the Volume row documents (`useVoxelTrackSlider` must see a block box); the
row panel supplies the flex.

**`SliderCenteredZero.readOnly`** (assumption 5): a branch above the interactive return, mirroring
`SliderLinear.tsx:90–109` — same wrapper class with `data-readonly="true"` and `role="status"`, the
`DualLabel` **with** `help` (the "?" is still useful on a readout; `SliderLinear`'s branch omits it, which
this phase leaves alone), the value label, and the `VoxelTrack` with the same `states`. CSS: copy the
`[data-readonly]` rules from `SliderLinear.css:166–175` into `SliderCenteredZero.css`. `COMPONENT_LIBRARY.md`'s
row for the primitive gains `readOnly?: boolean`.

**`RobotScreen.tsx`** (`useRobotSubsectionRenderer`): `audioSettingValue` memo gains `pan`/`panAuto` and
their deps; `livePan` from the §1.4 selector; `handlePanChange` → `applyPan(latestRobot.current, …)`,
`handlePanAutoChange` → `applyPanAuto(…)`, both `useCallback([localeId])` like the volume handler. No
swell cancel (pan is not a swell attribute).

**Company** (`useCompanyOptions.ts`): `DISABLED_AUDIO_SETTING` gains `pan: 0, panAuto: true`;
`resolveCompanyOptions` gains `pan: firstMember.pan ?? 0, panAuto: firstMember.panAuto ?? true`;
`audioSettingValue` memo adds the two resolved locals; two handlers:

```ts
const onPanChange = useCallback((display: number) => {
  latest.current.members.forEach((m) => applyPan(m, localeId, display));
  patchSnapshot({ pan: display / PAN_DISPLAY_SCALE });
}, [localeId, patchSnapshot]);
const onPanAutoChange = useCallback((auto: boolean) => {
  latest.current.members.forEach((m) => applyPanAuto(m, localeId, auto));
  patchSnapshot({ panAuto: auto, ...(auto ? {} : { pan: latest.current.resolved?.pan ?? 0 }) });
}, [localeId, patchSnapshot]);
```

Auto off on a company: every member's sound holds at **its own** live position (applyPanAuto per member) and the
snapshot records `panAuto: false` with the resolved pan; the next slider move broadcasts one value to all.
This is the broadcast-not-link rule, not a bug: members disagree until the slider is touched, and the
company screen shows the snapshot (COMPANIES.md's resolve rule). `CompanyOptionsSection` passes the two
new handlers; no `livePan`.

### 1.6 Persistence and sharing

- **Diff** (`computeRobotAudioOverrideDiff`): `if (!live.panAuto) diff.pan = roundToDecimals(live.pan, 2)`.
  Two decimals matches the slider's 1/100 step. No baseline field needed (the baseline is Auto for every
  robot). The doc comment listing "never inspects audioMode, masterVolume, …" stays true; `pan` joins the
  inspected set.
- **Restore** (`buildRobotUpdates`): `if (diff.pan !== undefined) { updates.pan = diff.pan; updates.panAuto = false; }`.
  In the apply loop, after `regenerateMelody`, `if (diff.pan !== undefined) AudioEngine.updateRobotPan(robot.id, diff.pan)`
  — the same "prime only what this diff changed" shape as `primeRobotLinks`. Before the audio context
  starts this is the documented no-op, and `loadInstruments`' post-load reservation pass re-primes from
  the store (§1.3).
- **Share link** (`sessionShareUtils.ts`): `CompactRobotOverrideDiff.p?: number`; `to`/`from` mirror `pr`.
  An out-of-range or non-numeric `p` is dropped at decode (absent ⇒ Auto), the "never misread" rule the
  `ll` decoder already follows. Payload `version` stays 2: absent key = Auto is structural compatibility.
- **`docs/SESSION_STORAGE.md`**: `pan` is persisted (manual only); `masterVolume` and `audioMode` stay on
  the never-persisted list, with one sentence on why pan differs (composition choice vs. listening choice).

### 1.7 Content — `src/content/copy/probe.ts`

```ts
'probe.pan': {
  human: 'Pan', lore: 'Bearing',                                   // lore = placeholder, assumption 10
  help: { human: 'Where this probe sits between the left and right speakers. With Auto on it follows the probe across the field and the bar just shows where it is; turn Auto off to hold it where it is and place it yourself, as far left or right as you like. Phone speakers are mono, so you will only hear the difference on headphones or a stereo.' },
},
'probe.pan.auto': {
  human: 'Auto', lore: 'Tracking',                                 // lore = placeholder
  help: { human: 'On: the probe’s sound follows it across the field. Off: it stays where the Pan bar puts it.' },
},
```

`probe.levels.intro.humanDescription` gains a sentence naming Pan and Auto. Every key is referenced from
`robotOptionsConfig.ts`, so `content.test.ts` and the ESLint literal guard stay green with no exemptions.
`docs/reference/ROBOT_DATA_GRID.md` and `SLIDER_VALUES.md` get a Pan row each (Centered-zero, −100…100,
step 1, stored −1…1, no seed).

---

## 2. Target File Structure

```text
src/
├── constants.ts                                   + PAN_MIN, PAN_MAX, PAN_DISPLAY_SCALE
├── types/
│   ├── Robot.ts                                   + pan, panAuto
│   ├── Company.ts                                 + CompanyOptionsSnapshot.pan / panAuto
│   └── session.ts                                 + RobotAudioOverrideDiff.pan
├── stores/
│   ├── robotPanReadoutStore.ts / .test.ts         NEW (§1.4)
│   └── localeStore.ts / .test.ts                  updateRobot clamps pan
├── engine/
│   ├── AudioEngine.ts / .test.ts                  manualPanByRobot, updateRobotPan, getLivePan, tick skip + readout write, releaseVoice clears, loadInstruments re-prime
│   └── audioEngine/panning.ts                     untouched (cited only)
├── systems/
│   ├── spawnSystem.ts / .test.ts                  spawn defaults; two reserve-site re-primes
│   ├── robotOptionsActions.ts / .test.ts          applyPan, applyPanAuto
│   └── companyOptions.ts / .test.ts               resolveCompanyOptions fallbacks
├── utils/
│   ├── sessionDiff.ts / .test.ts                  diff / restore / prime
│   └── sessionShareUtils.ts / .test.ts            `p` codec
├── data/robotOptionsConfig.ts                     PAN_SCHEMA, PAN_AUTO_SCHEMA, PAN_ROW_PANEL_SCHEMA
├── content/copy/probe.ts                          §1.7
├── components/
│   ├── ui/controls/SliderCenteredZero.tsx / .css / .test.tsx   readOnly branch
│   ├── robot/AudioSettingSection.tsx / .css / .test.tsx        Pan row, livePan, two handlers
│   ├── panels/screen/screens/RobotScreen.tsx / .test.tsx       value, readout selector, handlers
│   ├── company/useCompanyOptions.ts / .test.ts                 resolved fields, two broadcast handlers
│   └── company/CompanyOptionsSection.tsx                       passes the two handlers
└── docs/robotPanDocs.test.ts                      NEW — every symbol the docs cite exists; no stale line claims
docs/
├── AUDIO_SYSTEM.md                                "Panning" item: Auto/manual, the readout store, the ramp
├── SESSION_STORAGE.md                             §1.6
├── COMPANIES.md                                   snapshot fields + the Auto-off-per-member note
├── COMPONENT_LIBRARY.md                           SliderCenteredZero readOnly
├── reference/ROBOT_DATA_GRID.md, reference/SLIDER_VALUES.md   Pan rows
├── ROBOT_DESIGN.md                                one line: pan reaches the body through no dial (guardrail unchanged)
├── intent/robot-pan.md                            status banner on ship
└── todo/roadmap.md                                49: status + "as built" deltas from the Shape paragraph
```

Not touched: `panning.ts`, `calculatePanFromPosition`'s ±0.5, `getRobotVisualX`, `scheduleNote`,
`reserveVoice`'s signature, `audioSwells.ts`, `src/types/lfo.ts` (no pan target), any gem/robot-body
file, `Toggle.tsx`, `SliderLinear.tsx`.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Anything else is a conflict to surface, not a quiet widening.
- **Auto is byte-identical to today's audio.** With `panAuto` true the panner receives exactly the writes
  it receives on `main` now (same mapping, same epsilon, same cadence); the only addition is the readout
  store write on those same iterations. A test pins this (§5, "no extra AudioParam writes").
- **Panner writes stay inside `AudioEngine`** (`updateAllPanners`, `updateRobotPan`), on the transport
  tick or in response to a store action — never from a GSAP callback, never from a component.
- **No new Tone nodes.** The Audio Load Budget tables and `LOAD_*` thresholds are untouched.
- **JSON-serialisable state.** `pan`/`panAuto` are primitives; the readout store is a plain record. Engine
  maps (`manualPanByRobot`, `lastPanByRobot`) are module-level, never in a store.
- **Robots keep moving with Auto off.** Pan never touches the work loop, the swim/job/station timelines
  or `Robot.position` (Crawford, 2026-10-13: "the robots should still move around, we just shouldn't set
  the panning to their location"). The source-scan test below also greps `src/systems/workLoop.ts`,
  `src/systems/siteChoice.ts`, `src/systems/lifecycleSim.ts` and `src/animation/` for the two
  identifiers and expects none.
- **Nothing on the robot body reads `pan` or `panAuto`.** ROBOT_DESIGN.md's dial list is unchanged; a
  source-scan test in `robotPanDocs.test.ts` greps `src/components/robot/gem/` and `RobotBody.tsx` for the
  two identifiers and expects none.
- **Content:** every new word in `src/content/copy/probe.ts`; no guard exemptions.
- **Primitives:** `SliderCenteredZero` gains one optional prop and one early-return branch; `Toggle` is used
  bare; `CONTROL_SCHEMA_TYPES` stays 14.
- **Ask first:** a `formatValue` on `SliderCenteredZero` (assumption 1), widening `reserveVoice`'s
  signature, any change to the ±0.5 auto field, any new dependency.
- **Never:** `.env*`, `node_modules/`, build output; relaxing a CLAUDE.md guardrail; a pan LFO target or
  swell attribute (roadmap 49 "Not Doing").

---

## 4. Code Style & Architecture Conventions

The engine method, on `updateRobotMasterVolume`'s shape (safe no-op, ramp-or-set, devWarn):

```ts
// src/engine/AudioEngine.ts
updateRobotPan(robotId: string, value: number | null): void {
  const entry = compositeVoices.get(robotId);
  if (!entry) { devWarn(`[AudioEngine] updateRobotPan: no composite reserved for ${robotId}`); return; }
  try {
    let target: number;
    if (value === null) {
      manualPanByRobot.delete(robotId);
      target = calculatePanFromPosition(getRobotVisualX(robotId));
      lastPanByRobot.set(robotId, target);                       // the tick's epsilon gate resumes from here
      useRobotPanReadoutStore.getState().setPan(robotId, target);
    } else {
      manualPanByRobot.set(robotId, value);
      lastPanByRobot.delete(robotId);                            // never let a stale auto value gate the first write back
      target = value;
    }
    const pan = entry.panner.pan as unknown as { rampTo?: (v: number, t: number) => void; value: number };
    if (typeof pan.rampTo === 'function') pan.rampTo(target, PAN_RAMP_SECONDS); else pan.value = target;
  } catch (err) {
    devWarn('[AudioEngine] updateRobotPan failed', err);
  }
},
```

The section's new row, in the house value/onChange style — no store, no literals:

```tsx
<DirectionalPanel schema={PAN_ROW_PANEL_SCHEMA}>
  <div className="audio-setting-section__pan-slider">
    <SliderCenteredZero
      schema={PAN_SCHEMA}
      value={(value.panAuto ? (livePan ?? value.pan) : value.pan) * PAN_DISPLAY_SCALE}
      onChange={onPanChange}
      readOnly={value.panAuto}
      disabled={disabled}
    />
  </div>
  <Toggle schema={PAN_AUTO_SCHEMA} value={value.panAuto} onChange={onPanAutoChange} disabled={disabled} />
</DirectionalPanel>
```

Conventions: named exports, `memo`-wrapped function components, co-located CSS and tests, doc comments
that say *why* and cite this spec's section, constants in `src/constants.ts` next to `MASTER_VOLUME_*`.

---

## 5. Testing & Verification Requirements

Vitest + Testing Library, co-located. House rhythm: RED first, one commit per task, mutation check at the
named gates (see `docs/tasks/ROBOT_PAN.md` once written).

- **Engine (`AudioEngine.test.ts`)** — `updateRobotPan(id, 0.8)` ramps the mock panner to 0.8 and
  subsequent `updateAllPanners` ticks make **no** write to that panner even when the robot's x changes;
  `updateRobotPan(id, null)` ramps to `calculatePanFromPosition(x)` and the next tick writes nothing until
  x moves past epsilon (seeded `lastPanByRobot`); manual → auto → first move writes (the `delete` in the
  manual branch); `getLivePan` is `undefined` before any tick, the last auto write after, `undefined`
  after `releaseVoice`; `releaseVoice` clears the manual map (a re-reserved robot with no re-prime follows
  x again); no composite → devWarn, no throw. **"No extra AudioParam writes":** with every robot on Auto,
  the count of `pan.value` sets per tick equals `main`'s (the existing coalescing suite's spy), and the
  readout store receives exactly one `setPan` per set. `loadInstruments`' post-load pass re-primes a
  store robot with `panAuto: false`.
- **Readout store** — `setPan` with an equal value returns the same state object (no re-render);
  `clearPan` removes the key; nothing else.
- **Actions (`robotOptionsActions.test.ts`)** — `applyPan(robot, l, 40)` writes `pan: 0.4` and calls
  `updateRobotPan(id, 0.4)`; `applyPan(…, 150)` clamps to 1; `applyPanAuto(…, false)` with
  `getLivePan` mocked at −0.3 writes `{ panAuto: false, pan: −0.3 }` and calls `updateRobotPan(id, −0.3)`;
  with `getLivePan` undefined it uses `robot.pan`; `applyPanAuto(…, true)` writes only `panAuto` and calls
  `updateRobotPan(id, null)`.
- **Spawn** — every spawned robot has `pan: 0, panAuto: true`; the seed oracle for a fixed locale is
  unchanged apart from the two new keys (determinism guard); both reserve sites call `updateRobotPan` only
  for a manual robot (re-register path with a hand-set `panAuto: false`).
- **Session (`sessionDiff.test.ts`)** — a manual robot diffs to `{ pan: 0.4 }` (two decimals); an Auto
  robot with a stale `pan: 0.4` diffs to `{}`; restoring `{ pan: −0.25 }` sets both fields and calls
  `updateRobotPan(id, −0.25)`; a payload without `pan` leaves `panAuto` true; `localeStore.updateRobot`
  clamps `pan: 7` to 1. **Mutation check:** drop the `panAuto: false` line in `buildRobotUpdates` and watch
  the restore test go red.
- **Share (`sessionShareUtils.test.ts`)** — `pan` round-trips through `p` `toEqual`; absent `p` → no `pan`
  key; `p: 'x'` and `p: 3` decode to no `pan` key.
- **Company (`companyOptions.test.ts`, `useCompanyOptions.test.ts`)** — `resolveCompanyOptions` falls back
  to the first member's `pan`/`panAuto` and a snapshot wins; `audioSettingValue` `toEqual`s now include the
  two fields (the existing `{ audioMode, masterVolume }` assertions are updated, not duplicated);
  `onPanChange(40)` calls `applyPan` once per member with 40 and records `{ pan: 0.4 }`; `onPanAutoChange(false)`
  calls `applyPanAuto(m, l, false)` per member and records `{ panAuto: false, pan: <resolved> }`;
  `onPanAutoChange(true)` records `{ panAuto: true }` only; handler identities are stable across an
  unrelated edit (the existing identity test gains the two handlers).
- **UI** — `SliderCenteredZero` `readOnly`: `role="status"`, `data-readonly`, no `slider` role, value label
  and VoxelTrack present, `onChange` never called on keyboard. `AudioSettingSection`: Auto on renders the
  readout at `livePan × 100` when given, else `pan × 100`, read-only; Auto off renders an interactive
  slider at `pan × 100` and a drag calls `onPanChange` with the display number; the toggle calls
  `onPanAutoChange`; labels come from `CONTENT` (no literal). `RobotScreen`: the readout selector returns
  `undefined` for a manual robot (a `setPan` for it does not re-render the screen — the existing
  "battery tick does not re-render" test's pattern); a readout write for an Auto robot re-renders only the
  Levels section. Company screen never subscribes to the readout store (source-scan).
- **Docs (`robotPanDocs.test.ts`)** — every backticked symbol this spec and the updated docs cite exists;
  the gem/body source scan from §3; `docs/SESSION_STORAGE.md` names `pan` as persisted and still names
  `masterVolume` as never persisted.
- **Content** — `content.test.ts` green unchanged; `help` present on both new entries.
- **Lint / type / build** clean at every checkpoint.

**Manual (Crawford, final checkpoint):** on headphones, a swimming robot's bar moves with it and the sound
follows; Auto off mid-swim holds the sound and the bar where they are while the robot keeps swimming, no
click; drag hard left/right —
clearly wider than Auto ever reaches; Auto on glides back, no click; save a session with one manual robot,
reload, it is still where you put it and every other robot still follows; share link the same; a company
with Auto off and one slider move puts every member in the same place, Auto on releases them all; keyboard
reaches the toggle and (Auto off) steps the slider; the "?" on both controls reads right; Pixel still plays
clean at Light (courtesy listen, not a gate — assumption 11).

---

## 6. Git & Workflow Context

- Branch `feature/robot-pan`, off `main` at `d195f81d`. One commit per task, imperative subject, body cites
  the spec section, co-author trailer. Crawford merges.
- Roadmap **49** already exists; the last task adds a status line, records the "as built" deltas from its
  Shape paragraph (one `pan` field; the readout store; `SliderCenteredZero.readOnly`; `useCompanyOptions`
  not `CompanyOptionsSection` as the company handler home) and leaves its Not Doing list as is.
- Docs land in the last task; `docs/intent/robot-pan.md` gets the shipped banner the other intent files carry.

---

## 7. Open Questions & Risks

**For Crawford — none blocking.** Both judgment calls are settled (2026-10-13): assumption 1 (users edit
pan from −100 through 100, a signed number, no L/R letters) is confirmed, and assumption 10 (the
placeholder lore words *Bearing* / *Tracking*) is accepted as placeholders.

**Risks:**

1. **A manual pan set before the audio context starts** reaches the panner only through the reservation
   re-prime (§1.3). All three reservation sites are covered and tested; a fourth, future site that forgets
   the line would silently play a manual robot centred. The engine test "post-load pass re-primes" and the
   spawn test guard the three that exist.
2. **Company Auto-off holds members' sounds at different places** (§1.5). Intended under broadcast-not-link and
   written into COMPANIES.md, but it is the one behaviour a user might read as a bug; the slider's next
   move resolves it.
3. **Readout store writes with nobody listening** — up to 12 robots × ≤ 4 writes/s while every robot is
   swimming, each a record spread. Negligible against the AudioParam write it accompanies, but if the
   optional `npm run perf` run shows it, the fallback is to gate `setPan` on a `subscriberCount` the
   screen's mount/unmount maintains (one extra store action, no design change).
4. **`readOnly` on `SliderCenteredZero` is new code in a shared primitive.** It is an early return above
   the interactive path, so the interactive branch is textually unchanged; the primitive's existing test
   suite plus the new readOnly cases are the guard.
5. **`PAN_WRITE_EPSILON` is tuned for ±0.5 values**; a manual write of ±1 goes through `updateRobotPan`,
   not the gate, so the epsilon never applies to it. No change needed; noted so nobody "fixes" it.
