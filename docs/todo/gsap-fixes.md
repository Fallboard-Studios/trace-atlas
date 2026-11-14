# GSAP fixes

A read of every GSAP consumer against GSAP's own best practices (`useGSAP`, `gsap.context`,
`contextSafe`, `quickSetter`/`quickTo`, `gsap.matchMedia`) and the repo's rules (CLAUDE.md, the
"Contributor Rules" and "What to Avoid" in `docs/ANIMATION_SYSTEM.md`). Audit date 2026-11-13, on
`feature/note-cloud` at `9a1d3bca`; GSAP 3.14.2, `@gsap/react` 2.1.2. Nothing here is built — each item
is a proposal for Crawford to pick up or cut. Line numbers are as of that commit.

Scope: the 27 non-test files that import `gsap` or `@gsap/react`, plus `RobotBody.tsx` (wires the
hooks) and `powerController.ts` (drives the world pause). What was checked for each: the
`useGSAP`/`contextSafe` idiom in components, timeline ownership (`timelineMap`, never state), the
`'world'`/`'ui'` scope, Strict Separation (no audio in a GSAP callback), no `requestAnimationFrame`
loops, transform-only tweens, reduced motion, and per-frame cost.

Verified before writing: the suite's `useNoteCloud.test.tsx` is green on this commit (59 tests), and
GSAP's `Context.kill(revert)` order was read in `node_modules/gsap/gsap-core.js` (tweens revert first,
then the cleanup functions a `useGSAP` callback returned) — that order is what makes item 1 a real pop.

## Fix (behaviour)

### 1. The orbiter Size tween pops on every edit after the first

**Fixed 2026-11-14** on `fix/gsap-finds`: `revertOnUpdate` dropped from the size tween's `useGSAP`.
Reproduced first on real GSAP (`useOrbiterMotion.size.test.tsx`): every edit after the first snapped
to the *mount* size, not the previous one, because each new tween is created after a revert to it.
One correction to the text below: without `revertOnUpdate` the returned kill runs only on unmount;
the re-target on an edit is `setTimeline` killing the old tween under the same key.

[useOrbiterMotion.ts:135-146](../../src/components/robot/gem/useOrbiterMotion.ts#L135-L146). The size
tween's `useGSAP` passes `revertOnUpdate: true` **and** returns `() => killTimeline(key)`. On a
`dials.size` change the context reverts the previous `gsap.to` first, which writes the locals' `scale`
back to the value recorded when *that* tween started, and only then runs the kill and the new callback.

- First edit (S0 → S1): the reverted tween started at S0, the locals are at S0 already — no pop.
- Second edit (S1 → S2): the reverted tween started at S0, so the locals snap S1 → S0, then ease
  S0 → S2. A visible pop, worse the further the dial has travelled.

This is the Visual Mapping guardrail's "each continuous or animated, never a pop" on the one dial the
hook exists to animate. Fix: drop `revertOnUpdate` here (the returned kill already retargets through the
registry, which was the stated intent: "keyed so a second change re-targets rather than stacking"), or
replace the per-edit `gsap.to` with one `gsap.quickTo` per local, GSAP's tool for a retargeted value.
Proof: by eye — turn the Size dial twice in a row on the avatar and in the world. A unit test needs the
real `gsap` (the global mock never renders), so `vi.unmock('gsap')` in a file of its own if one is wanted.

### 2. CabinetBox's geometry effect depends on `width` and `boxHeight`, which its own comment and body say it must not

**Fixed 2026-11-14** on `fix/gsap-finds`: both left the array. Visible change to check by eye: a box
that mounts engaged and is not square (a selected radio option, the active section tab, the current
nav box) now eases its 2 px pop in on mount, as a Toggle (square, so never cut) always has. A resting
box is unchanged: its mount tween runs from 0.5 to 0.5. Four tests pinned the width-only re-run; two
became the new "a size change alone leaves a pop in flight alone" cases, two now drive the instant
reposition branch through a pop-distance change, which still reaches it.

[CabinetBox.tsx:269](../../src/components/ui/controls/CabinetBox.tsx#L269) says `width` "is deliberately
NOT a dependency of the geometry effect below"; [CabinetBox.tsx:402](../../src/components/ui/controls/CabinetBox.tsx#L402)
lists `width` and `boxHeight` in that effect's `dependencies`. Neither is read in the effect body (the
walls scale by `poppedT`, the front offset by `resolvedPopDistance`). Each re-run calls `killTimeline`
and, with `poppedT` unchanged, takes the `!isTransition` path and `gsap.set`s the target state:

- A `ResizeObserver` width change mid-pop kills the pop and snaps the box to its end.
- On mount, `width` starts as `frontWidth ?? boxHeight` and the observer corrects it "moments later",
  so a Button whose real width is not its height has its mount-in tween cut on the observer's first
  callback. At `CABINET_REST_POP` (a 1 px pop) this is invisible, which is why nobody has seen it.

Fix: remove `width` and `boxHeight` from the array (the comment is right, the array is stale).
Proof: a RED test in `CabinetBox.test.tsx`, which already has a controllable `MockResizeObserver` —
fire it mid-pop and assert the registered timeline is the same object and still running.

### 3. The followed-robot marker does three `gsap.getProperty` reads and a `gsap.set` per frame

**Done 2026-11-14** on `fix/gsap-finds`: two `quickSetter`s made once in the effect. The frame was
two `getProperty` reads by then, not three, and the code is at lines 74-97 of the file, not 309-322.
Checked on real GSAP first that a quick setter keeps the `xPercent`/`yPercent` centring (the
transform it writes is the one `gsap.set` wrote). No perf number taken: one element, no long task.

[FollowedRobotMarker.tsx:309-322](../../src/components/panels/screen/worldView/FollowedRobotMarker.tsx#L309-L322).
The `gsap.ticker` listener is the right loop (no `requestAnimationFrame`), but each frame builds a
vars object and runs a full `gsap.set` (a zero-duration tween: parse, init, render, kill). The work loop
does the identical job for a dissolve copy with `gsap.quickSetter` ([workLoop.ts:372-379](../../src/systems/workLoop.ts#L372-L379)),
which is GSAP's documented tool for a value written every frame. Fix: two `quickSetter`s (x, y in px)
created once in the effect, plus the `xPercent`/`yPercent` set that is already once-only. Proof: by
read; `npm run perf` if a number is wanted (the marker is one mover, so expect a small one).

## Tidy (best-practice drift, no visible bug today)

### 4. Four component hooks build GSAP animations outside `useGSAP` / `gsap.context`

CLAUDE.md: "Use `useGSAP` in components". These create tweens in plain effects and clean up by hand
through `timelineMap`, so nothing leaks; what is missing is the context (automatic revert on unmount,
`contextSafe` for handlers, a `scope`), and with it the one idiom for the whole app:

- [useNoteCloud.ts:118](../../src/components/robot/notes/useNoteCloud.ts#L118) (the belt, a `useEffect`)
  and [useNoteCloud.ts:318](../../src/components/robot/notes/useNoteCloud.ts#L318) (the re-size fade).
  **Active branch** (backlog 79): leave until that PR merges, then decide.
- [NavPanel.tsx:51-66](../../src/components/panels/screen/nav/NavPanel.tsx#L51-L66) `useNavPanelWidth`,
  a `useEffect` tweening a CSS variable on `#screen-viewport` found by a DOM query.
- [RosterBoard.tsx:128-147](../../src/components/panels/screen/screens/RosterBoard.tsx#L128-L147)
  `useRosterGlide`, `Flip.from` in a `useLayoutEffect`. A `gsap.context` knows Flip timelines (it pushes
  them to their end on revert), so this one gains the most from the wrap.
- [FollowedRobotMarker.tsx:304](../../src/components/panels/screen/worldView/FollowedRobotMarker.tsx#L304)
  (item 3's effect).

Fix: `useGSAP(callback, { scope, dependencies })` in each, keeping the registry registration as it is
(`useGSAP` and `timelineMap` are not alternatives: the context owns the lifetime, the map the lookup).
Proof: the files' existing tests; `useGSAP` runs on a layout effect, so `NavPanel`'s "first value set
at once" and the roster glide's before-paint `Flip.from` keep their timing.

### 5. `revertOnUpdate: true` beside a returned kill, in three places

[useStripFlicker.ts:426](../../src/components/robot/gem/useStripFlicker.ts#L426),
[BubbleStream.tsx:491](../../src/components/actors/BubbleStream.tsx#L491),
[useOrbiterMotion.ts:312](../../src/components/robot/gem/useOrbiterMotion.ts#L312) (the mount effect).
Each callback returns `() => killTimeline(key)`, and `revertOnUpdate` reverts the same tweens a moment
earlier. Harmless in these three (the reverted values are the rest values), but it is the same mechanism
that bites in item 1, and two teardowns for one timeline is one too many. Decide one idiom per hook: the
context's revert (then the returned function only tidies the registry), or the registry's kill (then no
`revertOnUpdate`). Proof: the hooks' tests, which pin the keys and scopes.

### 6. Reduced motion is read three ways

`prefersReducedMotion()` (`src/utils/reducedMotion.ts`) in most places; an inline
`window.matchMedia('(prefers-reduced-motion: reduce)')` copy in
[CabinetBox.tsx:377](../../src/components/ui/controls/CabinetBox.tsx#L377) and
[useEasedControlValue.ts:398](../../src/components/ui/controls/useEasedControlValue.ts#L398);
`gsap.matchMedia()` in `offScreenTheatre.ts` alone. The two inline copies are the duplicate-value class
`docs/DUPLICATE_VALUE_AUDIT.md` tracks. And only the theatre reacts to the preference changing
mid-session: every hook reads the flag once per effect run. Fix: the util in the two inline spots; a
`gsap.matchMedia` wrap where a live reaction is wanted (GSAP's own idiom), which is a design call, not a bug.

### 7. `useStripFlicker` flickers on mount under StrictMode

[useStripFlicker.ts:401-404](../../src/components/robot/gem/useStripFlicker.ts#L401-L404). The
"skip the first run" guard sets `mountedRef` on the first effect run. `main.tsx` wraps the app in
`StrictMode`, which in development mounts, reverts and re-runs every effect, so the re-run sees
`mountedRef` true and plays all four lines' flicker on every robot's mount. Dev-only. Fix: reset
`mountedRef` in the returned cleanup, or replace the counter with the trigger tuple's previous value.

### 8. `jobDecor` overrides `kill()` on a timeline instance

[jobDecor.ts:490-494](../../src/animation/jobMoves/decor/jobDecor.ts#L490-L494). The comment is right
that GSAP has no "on kill" callback and that `onInterrupt` misses `progress(1, true)` then `kill()`. But
replacing a method on a GSAP object is fragile across upgrades (the Context's revert and the registry
both call `kill`). The timeline already carries `tl.data` (`JobTimelineData`); a `remove` on it, called by
the work loop's `finishJobSilently` and by `killAllTimelines`'s callers, keeps the group's removal where
the ends are decided. Low.

### 9. The orbiter master key registers a `{ kill }` stub cast to a Timeline

[useOrbiterMotion.ts:304](../../src/components/robot/gem/useOrbiterMotion.ts#L304). Deliberate and
documented (ANIMATION_SYSTEM.md). It is safe only because the stub stays `'ui'`: any future registry
pass that calls `.paused()` or `.pause()` on every entry would throw on it. Fix: give `timelineMap` an
honest `Killable` entry type, or drop the registration (the hop tweens are already killed from the
cleanup, and nothing looks the key up). Low.

### 10. `createSwimTimeline`'s no-ref fallback schedules an unkeyed `gsap.delayedCall`

**Done 2026-11-14** on `fix/gsap-finds`: the fallback is gone. With no ref the function returns
`null` and does nothing; the work loop's `swimTo` branches on that return instead of checking the
body first, so there is one check, in the function that builds the swim. The two tests that covered
the fallback are replaced, and both `ANIMATION_SYSTEM.md` passages are updated.

[swimAnimation.ts:178-186](../../src/animation/swimAnimation.ts#L178-L186). The only caller
([workLoop.ts:476-486](../../src/systems/workLoop.ts#L476-L486)) checks for the body first and builds
its own keyed `swim-` timeline precisely because this fallback can't be killed by `stopWorkLoop`. The
fallback is dead code that would leak a callback if ever reached. Fix: remove it (return `null`, or
throw) and update ANIMATION_SYSTEM.md's "Swim animation" sequence, which still describes it. Low.

### 11. Small

- [BubbleStream.tsx:494](../../src/components/actors/BubbleStream.tsx#L494) reads `timelineMap.get`
  directly; every other consumer goes through `getTimeline`.
- [useEasedControlValue.ts:403](../../src/components/ui/controls/useEasedControlValue.ts#L403) sets
  React state on every `quickTo` frame. Deliberate (the slider primitives render `displayValue`), and
  the file documents why; noted so the per-frame `setState` is a known cost, not a surprise.

## Confirmed in order

Checked and found to follow the rules, so nobody re-audits them:

- **Strict Separation.** Every `onComplete`, `onUpdate`, `onInterrupt` and `.call` was read. They write
  store or loop state, resolve promises, or move DOM; none reaches `AudioEngine`, `Tone` or the
  BeatClock. The power rocker's sequence calls `powerController.pause()` / `powerOnSequence()` from a
  tween's `onComplete`, a semantic power action the spec names, not an audio call.
- **Scopes.** Every world mover in ANIMATION_SYSTEM.md's key table passes `'world'`; the tablet's chrome
  (cabinet pops, nav width, roster glide, rocker, off-screen theatre, scene wash) stays `'ui'`; the
  note cloud's two keys are `'world'` and pinned so in its tests.
- **No `requestAnimationFrame`.** The five per-frame loops (`deckCamera`, `sceneWash`'s one-frame wait,
  the work loop's dissolve follower, the marker, `audioDiagnostics`' frame counter) are all
  `gsap.ticker` listeners, each removed with its owner.
- **Ownership.** No timeline, ref or tween lives in Zustand or React state: `timelineMap`, `refs.ts`,
  `robotMotionRegistry`, module-level maps and `useRef` only.
- **Transforms.** Tweens are `x`/`y`/`scale`/`rotation`/`opacity`/`autoAlpha` and CSS variables; the SVG
  `attr` tweens (rocker `points`, ripple gradient `stop`s) are the documented exceptions.
- **`contextSafe`.** `PowerRockerSwitch` is the one component that animates from event handlers, and it
  wraps all three in `contextSafe` as GSAP prescribes.
- **Worth knowing, not a violation.** `AudioEngine.getRobotVisualX` ([AudioEngine.ts:369-387](../../src/engine/AudioEngine.ts#L369-L387))
  reads a robot's GSAP `x` for its pan — the picture feeding the audio. That is the Robot Pan design
  (roadmap 49), outside the note cloud's "audio to the picture, never back" rule, which is about the
  cloud alone.
