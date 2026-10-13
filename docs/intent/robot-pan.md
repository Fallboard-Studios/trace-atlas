# Intent: Robot Pan — a Pan Slider Beside Volume, with Auto

> **Status: shipped 2026-10-13** on `feature/panning-update` (spec [ROBOT_PAN.md](../specs/ROBOT_PAN.md), plan
> [ROBOT_PAN.md](../tasks/ROBOT_PAN.md)). Every outcome below was built as confirmed; the "as built" deltas are in
> [roadmap item 49](../todo/roadmap.md#49-robot-pan-a-pan-slider-beside-volume-with-auto).

Confirmed via `interview-me` on 2026-10-13 (5 questions, every guess confirmed), ahead of a
`spec-driven-development` pass. Roadmap item 49
([docs/todo/roadmap.md](../todo/roadmap.md#49-robot-pan-a-pan-slider-beside-volume-with-auto)),
raised by Crawford 2026-10-09: "we need to give the user panning ability on the robots … put it in
the section with volume, along with an 'auto' button that connects it to the robot as it works today."

## Outcome

A **Pan** row under Volume in `AudioSettingSection.tsx` (the Levels block, rendered by both the
robot screen and the company screen): a centred-zero slider with full ±1 travel and an **Auto**
toggle, on by default. Auto on is today's behaviour untouched — `updateAllPanners` keeps the
robot's existing `Tone.Panner` following its live GSAP x — and the slider shows that value moving.
Auto off holds the sound where it is (the robot keeps swimming) and the slider places it. No new Tone
nodes: every reserved
robot already has a panner on its bus.

- **User:** Crawford, composing a world — placing a robot's voice deliberately instead of letting
  it swim.
- **Why now:** The layout rework has shipped (merged to `main`), so the slider is laid out once on
  the screen that exists. Pan is the last mix control the existing panner supports for free.
- **Success:** Auto on shows the live position-follow pan moving in the slider. Auto off holds
  the sound where it is while the robot keeps moving, the slider nudges it with a short glide, and
  the setting survives a session save and a share link. Companies broadcast both.

## Behavior

- **Auto on (default, every existing world):** the panner follows the robot exactly as today
  (`calculatePanFromPosition`, the ±0.5 field, the once-per-16n-tick write with its epsilon). The
  slider is a **live read-only readout** of that value, not a greyed centre bar — the point of
  putting Auto beside the slider is watching the pan swim and grabbing it when you want to hold it.
  Auto's values therefore sit inside the inner half of the slider's ±1 travel, which quietly shows
  the auto field is narrower than the manual one.
- **Auto off:** the slider's value, full **±1**, is written to the panner and `updateAllPanners`
  leaves that robot alone. Switching Auto off **starts from the live position** ("hold the sound where
  it is now, then nudge it") — not from a remembered manual value. One stored `pan` field is enough.
  **The robot keeps moving around** (Crawford, 2026-10-13); only the panner stops following it.
- **Switching either way glides**, the same short ramp `updateRobotMasterVolume` uses on the bus
  gain, never a snap, so there is no click. Slider edits glide too.
- **Persistence:** unlike `masterVolume` (live-only, a mix-while-listening control), a manual pan
  is a composition choice and is **saved** — `panAuto` and `pan` join the robot override diff
  (session saves) and the share link. Defaults are Auto on / 0, so an untouched robot adds nothing
  to a save and no existing world changes.
- **Companies broadcast both**, broadcast-not-link as every other field: Auto off on a company pins
  every member to the same slider value; Auto on releases them all. The company slider shows the
  resolved snapshot. With Auto on it sits read-only at the snapshot's stored pan — there is no
  single live value across members and no attempt to animate one.

## Style / constraint

- Existing primitives only: `SliderCenteredZero` and `Toggle` (`src/types/controls.ts`), composed
  in `AudioSettingSection` beside the Volume slider; schema beside `VOLUME_SCHEMA` in
  `robotOptionsConfig.ts`. The toggle holds its largest-content size on flip. Both controls get a
  help popover; the help copy may note that phone speakers are mono.
- Content layer: `probe.pan` (human "Pan", a lore name in the copy-tone-guide's voice) and
  `probe.pan.auto` in `src/content/copy/probe.ts`. Never a literal in the component.
- The panner write stays inside `AudioEngine`, on the transport tick or an engine method mirroring
  `updateRobotMasterVolume` — never from a GSAP callback (Strict Separation).
- **The auto mapping does not change**: its ±0.5 field and the visual-x read are "as it works
  today". A wider auto field would change every existing world's mix.
- **Nothing on the robot body moves with pan** — the Visual Mapping guardrail; ROBOT_DESIGN.md's
  dial list is unchanged.
- Audio Load Budget untouched: no new nodes, and manual robots mean fewer tick writes, not more.

## Out of scope

- **Pan as an LFO target** — the per-robot `volume` target was removed as "not as impactful as I
  had hoped" (docs/specs/LFO_LOAD_FIX.md); a pan target is the same class of decision, separate,
  with its own phone load cost.
- **Pan as an audio-swell attribute** — a swells design change, not a slider.
- **A separate manual value that survives an Auto round trip** — rejected in the interview; Auto
  off starts from the live position.
- **An animated company-wide live readout** while Auto is on.
- **Any change to the auto mapping** (span or x source).
- **Any visual sign of pan on the gem.**

## Known implementation note (not yet spec'd)

- How the live readout reaches the slider while Auto is on: a small per-tick store write per
  robot, or a read of the engine's `lastPanByRobot` on the existing lighting tick, only where the
  slider is visible. Decide in the spec with the re-render cost in mind.
- Hot-loop shape: a module-level set/map of manual robots that `updateAllPanners` `continue`s past
  (cleared in `releaseVoice`, like `lastPanByRobot`), so the loop stays store-free.
- `panAuto`/`pan` on `Robot` (spawn defaults `true`/`0` in `spawnSystem.ts`, no noise draw), on
  `CompanyOptionsSnapshot`, in `RobotAudioOverrideDiff`/session diff and the share-link encoding.
- Verify every file:line cited in the roadmap entry against the tree before building; `updateAllPanners`
  is at `AudioEngine.ts:328` today and the company volume handler is `onVolumeChange` in
  `src/components/company/useCompanyOptions.ts`, not `CompanyOptionsSection`.
