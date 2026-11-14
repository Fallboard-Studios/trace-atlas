# Component fixes

**Closed 2026-11-14.** Crawford picked H1, H2, M1, M3, M4 and the three removals (L11, L12, L13). They were built on
`fixes/components`, one commit each; the full suite ran green at the end (14,343 passed, 0 failed, 2 skipped). The
rest was read against the code the same day and either handed to the accessibility review or left unbuilt, with the
reason below. Line numbers in the audit are as of `6480c952`, before these commits.

| Item | Commit | What was built |
| --- | --- | --- |
| H1 | `6657af36` | An arrow key moves a log slider a hundredth of the track, a page key or Shift+arrow a tenth (`sliderLogKeyStep`); a `steps` list makes one stop the Radix step. Home and End unchanged. |
| H2 | `24643018` | The sleeve's name is `ui.sleeve`; the lint also reads a string or template literal that is the braces' own child. |
| M1 | `d6721e6c` | The hour state and the `localTime` prop chain are deleted, with a render-count test; the empty `#ui-layer` group went too (nothing targets it). |
| M4 | `6acacf58` | Both company forms fall back to one shared `NO_COMPANIES`. |
| M3 | `5a6c41c0` | `useActiveLocaleId()` at the twelve render sites; `getActiveLocaleId()` stays for handlers. Two of the twelve have a component test. Also fixes the stale `motion` comment in `RobotBody` (L24). |
| L11 | `206600d7` | `LIGHTING_PRESETS` and `DEBUG_LIGHTING_PRESET` deleted. |
| L13 | `af00c39a` | `@radix-ui/react-toggle` removed from `package.json`; still installed under `react-toggle-group`. |
| L12 | `885436d0` | `PingControlsDrawer`, `PingControlsRhythmSection` and `PingControlsFrequencySection` deleted, with their tests, the stylesheet, the three panel schemas only they read and the content entry `probe.composition.phrasing`. **`SignatureArrayDrawer` was not removed** (below). |

**Where the audit was wrong, or the build differs from it:**

- **H1:** the `steps` case was worse than "look dead". No arrow press could move Automation Rate at all, and the
  existing test passed anyway because `onChange` fired with the unchanged value.
- **H2:** the proposed descendant selector would flag the content key in every `CONTENT['key']` and `fill('key')`
  read. The built selector matches a literal only as the direct child of the braces.
- **M4:** not only a warning. With no locale under them both forms threw "Maximum update depth exceeded" on mount.
- **M8:** `Button` already takes `expanded` and `controls`, so the missing ARIA does not need the `Trigger` refactor.
- **L4:** the example given (the company cap) disables a `TextInput` and a `Button`, which the audit itself says have
  disabled rules. Whether the gap is ever visible is unchecked.
- **L12:** `SignatureArrayDrawer` has no importer in the app, but its test file renders it 38 times and is the main
  coverage of `SignatureArrayLayer`, which is in use. It stays until those tests are re-pointed; recorded as a
  bullet in backlog 62.

**Handed to backlog 61 (the accessibility review), as things to check:** M8, M10, L4, L7, L8, L25, L26, L27, L28.

**Not built:**

- **M2, M5, M6, M7** (memo boundaries and repeated work): no measurement asks for them. M2 is backlog 39 again,
  closed as moot on 2026-11-10 with the same facts, which stay in PERFORMANCE.md's steady-state rows.
- **M9** (the Header pop-out's `!important` block): it fixes a placement swing that Radix's own positioning caused,
  and says so in a comment. It matters only on a Radix upgrade.
- **L5:** no new dependency for a radio group that works.
- **L1, L2, L3, L6, L9, L10, L14, L15, L17, L18, L20, L21, L23, L29:** no effect a user can see or hear today.
- **L19, L22:** small, but each rests on a claim nobody has seen in a browser.
- **L16, L24:** the parts in files this branch touched are done (`localTime`, `#ui-layer`, the `motion` comment). The
  unread `displayValueRef` in `useEasedControlValue.ts`, the `SleeveContainer` example in UI_SHELL.md, the
  `RobotScreen` and `OffScreen` restructures and the four Fast Refresh warnings are not.

The audit as written follows.

---

# Component findings: React and Radix best practices

A read-only review of `src/components/**` (160 non-test files, ~22k lines) on 2026-11-14 against React 19
practice and the Radix UI primitives' own docs, with CLAUDE.md's constraints as the frame. Nothing was
changed; this file is the whole output. Like `backlog.md`, it is a review-output list, not a spec: an item
that gets picked up takes the next number from the shared todo counter and its own spec or interview pass
as its size warrants.

Method: three parallel read-only passes (Radix usage; `ui/` + `panels/`; `robot/`, `actors/`, `stations/`,
`company/`, `debug/`), each reading the components and hooks in full and the pure geometry helpers for
per-render cost, ids and keys. `npx eslint src/components` is clean apart from four
`react-refresh/only-export-components` warnings (listed under Low). Every `path:line` below was re-read
before it was written down. The app was not run and no test was executed (another session was working
in the tree), so claims about what a user sees or hears are from the code, not the browser.

Perspective first: the hard rules hold everywhere. No Tone or synth in a component, no timeline, DOM ref or
synth instance in Zustand or React state, no audio call from a GSAP callback, no `setTimeout`,
`setInterval` or `requestAnimationFrame` for musical or animation timing. `eslint-plugin-react-hooks` 7's
`recommended` set is on, which includes the React Compiler rules (`refs`, `set-state-in-effect`,
`set-state-in-render`, `purity`, `immutability`, `preserve-manual-memoization`, `static-components`), so
the classic hook mistakes are machine-checked and absent. There is no `forwardRef` in `src/components`;
`MoveChipButton` takes `ref` as a plain prop the React 19 way. The findings below are what the linter
cannot see.

## Summary

| Severity | Count | Themes |
| --- | --- | --- |
| High | 2 | Keyboard-dead log sliders; a display literal that slips the content-layer lint |
| Medium | 10 | Per-second re-renders on the Deck; memo boundaries defeated by fresh props; unsubscribed locale-id reads; three Radix composition gaps |
| Low | 24 | Hand-built ids, duplicated patterns, dead code, a11y polish, doc drift |

Decisions that need Crawford (not changes to make unasked): adding `@radix-ui/react-radio-group`
(L5), removing the unused drawer components (L12) and the unused `@radix-ui/react-toggle` dependency
(L13), deleting the Factory lighting debug switch (L11).

---

## High

### H1. `SliderLog`'s keyboard step is 0.1 % of the track

`src/components/ui/controls/SliderLog.tsx:83` passes `step={0.001}` on a 0..1 track and the root has no
`onKeyDown` (lines 78 to 91). Radix Slider's keyboard contract is one `step` per arrow and ten per
Shift+Arrow / PageUp / PageDown, so a keyboard user needs about 1,000 arrow presses, or 100 page presses,
to cross Attack, Decay, Release or any Rig log slider. In the `schema.steps` variant it is worse:
`stepsTToValue` (`sliderLogMath.ts:58-62`) rounds `t * (n - 1)` to an index, so most arrow presses round
back to the same stop and the keys look dead.

`SliderCenteredZero.tsx:93-95, 130, 138` already solves the identical problem for its signed-log taper:
`signedLogKeyStep` in an `onKeyDown` with `preventDefault`, which Radix honours by skipping its own
handler.

Fix: mirror that. An `onKeyDown` on `Slider.Root` that steps `t` by 0.01 (0.1 for page or shift) and
calls `handleValueChange(sliderLogTToValue(...))`. For the `steps` variant pass
`step={1 / (steps.length - 1)}` and Radix snaps per index with no handler at all.

### H2. A display string literal in a component, hidden from the content-layer lint by braces

`src/components/panels/physical/SleeveContainer.tsx:8` has `aria-label={"Device controls"}`. The string
exists nowhere in `src/content/`. The ESLint guard at `eslint.config.js:91` is
`JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] > Literal`, a direct-child selector, so a
braces-wrapped literal (`JSXExpressionContainer > Literal`) and any template literal slip through. This is
the only such case today, but the hole is general; `hudLines.ts` (L18) shows the template-literal half
of it.

Fix: a content entry read through `labels()` for the sleeve, and widen the selector to a descendant
match such as `"JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] :matches(Literal, TemplateLiteral)"`.
(The `PowerRockerSwitch` living in the sleeve is not a breach: `docs/UI_SHELL.md` names it as the one
allowed interactive element there.)

---

## Medium

### M1. A per-second state write re-renders the whole scene tree for a prop nobody reads

`AttenuationStyleView.tsx:21, 53, 85` keeps `currentHour` in state, writes it on the 1 s tick and passes
it down as `localTime` through `LocaleView.tsx:14, 26` to `OceanScene.tsx:37, 159`, which destructures
it as `_localTime` and never uses it. The hour also goes to `uiStore.activeLocaleLocalTime`, which is what
`WaterColumn`, `TerrainLayer` and `LightShafts` actually subscribe to. So `AttenuationStyleView`,
`LocaleView` and `OceanScene` re-render every second on the Deck, the surface the idle-paint gate
measures: OceanScene's dozen `useMemo`s and every non-memoised child run again (`Sheet`, `TintGradient`,
`TintRect`, `FollowedRobotMarker`, and `PipeBridges`, a plain `React.FC` at
`actors/scenery/pipeBridges.tsx:28`). `Robot`, `Factory`, `Scenery`, `BubbleLayer` and `ChargingStation`
are memoised and bail.

Fix: delete the `currentHour` state and the `localTime` prop chain (the effect keeps writing `uiStore`),
or at minimum `memo(PipeBridges)`.

### M2. `RobotGem`'s memo is defeated on every `RobotBody` render, and the palette is rebuilt each time

`RobotBody.tsx:151` calls `gemPalette(...)` in render, unmemoised; `:154-161` builds `orbiters` and
`:165-168` builds `halo` as fresh object literals, all consumed by `memo(RobotGem)` at
`gem/RobotGem.tsx:240`. `gemPalette` runs `partFacetShades` and `edgeNormals` plus `hexToHsl` and
`hslToString` for seven parts times every edge, then RobotGem reconciles ~50 SVG elements per robot because
three of its props are always new references. In the world context RobotBody re-renders on every write to
its robot (battery ticks, swells) and once a second for every robot on the daylight tick
(`RobotBody.tsx:86` reads `activeLocaleLocalTime`, a float written each second), so twelve robots rebuild
palettes and re-diff their gem trees every second even though `css()` rounds lightness to integers and
almost no DOM write results.

Fix: `useMemo` the palette on `[gem, identityColor, quantisedDaylight, audio.midLit[0], audio.midLit[1], dimOpacity]`;
quantise `daylight` in the uiStore selector (for example to two decimals) so a tick that changes no
rounded colour returns the same value; `useMemo` `orbiters` and `halo` so RobotGem's memo can hold.

### M3. `getActiveLocaleId()` read during render at 12 sites (unsubscribed store read)

`src/utils/localeHelpers.ts:3-7` is `useAttenuationStyleStore.getState()`. It is called in the render body
at `RobotBody.tsx:123`, `CompanyCrudControls.tsx:71, 131`, `useCompanyOptions.ts:174`,
`useEntityRoster.ts:25`, `CompanyScreen.tsx:76`, `RobotScreen.tsx:92`, `RosterBoard.tsx:69`,
`RosterTile.tsx:65, 236`, `MetaBox.tsx:35, 53`. Every `useLocaleStore` selector in those components then
closes over that id, so a change of the active locale while they are mounted does not re-run the selectors
and they keep reading the old locale until something else re-renders them. Today world changes happen
powered-off (the screens unmounted) and theme or aspect edits keep the locale, so it is latent, not live.
`Robot.tsx:64` and `OceanScene.tsx:162` do it correctly with a subscribed selector; `RosterBoard.tsx:124`
is a correct event-handler use of `getActiveLocaleId()`.

Fix: a `useActiveLocaleId()` hook wrapping
`useAttenuationStyleStore((s) => selectCurrentAttenuationStyle(s)?.currentLocaleId ?? '')`, used in all
twelve render sites; keep `getActiveLocaleId()` for handlers.

### M4. Zustand selector that returns a fresh array when the locale is missing

`CompanyCrudControls.tsx:72` and `:132`: `useLocaleStore((s) => s.locales[localeId]?.companies ?? [])`.
Zustand 5's `useStore` is `useSyncExternalStore`; a selector whose result is a new reference every call
makes React warn that the snapshot should be cached and can re-render in a loop. It only bites while
`s.locales[localeId]` is undefined (a stale `localeId` during a locale swap, or a cold store), but
`useCompanyOptions.ts:76-77, 176, 181` already solves exactly this with module-level `NO_COMPANIES` and
`NO_ROBOTS` constants and documents why.

Fix: hoist `const NO_COMPANIES: Company[] = []` and use it in both selectors.

### M5. Each charging-station fragment rebuilds the whole station, so geometry and paint run three times

`stations/ChargingStation.tsx:72-86`: every fragment (`l4`, `l3`, `front`, rendered from
`OceanScene.tsx:300, 342, 372`) subscribes to five `audioStore` values plus the lit-colour key, then runs
`stationGeometry(roll, dials)` (which builds all four layers, `stationGem.ts`) and `stationPaint(...)`
(all four layers' paths) in its own `useMemo`, and uses one layer of the result. With three fragments per
station the geometry and paint are computed three times per station on every rig-dial or occupancy change,
and the `l4` fragment re-renders on charging-set changes it never draws.

Fix: compute geometry and paint once per station (a parent that renders the three fragments, or a
module-level cache keyed on `(gemSeed, gap, band, spread, falloff, litKey)`), and give `l4` a selector
that ignores `litKey`.

### M6. `memo(CabinetBox)` can never bail for VoxelTrack boxes: inline `children` on the hot path

`ui/controls/VoxelTrack.tsx:125, 173, 187` pass a fresh
`<div className="sc-voxel-track__fill" style={{ background: computeVoxelFillBackground(...) }} />` element
each render, so every box re-renders on every slider render (a drag, a swell tick, an ease frame) even
when its own `popped` or `delay` did not change; `CabinetBox.tsx:492`'s memo is defeated for its heaviest
consumer. Non-straddling boxes have a `fillPercent` of exactly 0 or 100 (`voxelTrackMath.ts:132-134`),
so their fill is one of four constants.

Fix: hoist four module-level elements (full and empty, horizontal and vertical) and pass those for
non-straddling boxes; only the straddle pair needs the computed element.

### M7. Inline callbacks and schemas handed to `React.memo` primitives

`docs/COMPONENT_LIBRARY.md` ("React.memo boundary") says a fresh inline callback defeats the primitive's
memo. Live sites: `Header.tsx:186-188` (`handleVolumeChange` to `SliderLinear`) and `:208` (an inline
`onChange` to `Toggle`); `OffScreen.tsx:704-707` (`onShare` to `Button`, the one un-memoised handler in a
file that `useCallback`s everything else); `TransmissionEditor.tsx:84, 100` (`scan` to `Button`);
`console/LfoBankLanePanel.tsx:67, 88, 96` (three inline arrows to `RadioButton` and
`SliderCenteredZero`, while the same file memoises the TempoSyncSlider handlers); `RosterBoard.tsx:177,
226` (inline `onClick` to `Button`); `ui/controls/CoordsInput.tsx:45-56` (two schemas and two handlers
rebuilt per render, so both `TextInput`s re-render when either axis changes);
`ui/controls/StepperWithToggle.tsx:28-29, 36, 42` (no live consumer).

Fix: `useCallback` or module-level handlers as `FleetParamsScreen.tsx:56-62` already does; in
`CoordsInput` memoise the two schemas on `schema.id` and the handlers on `[value, onChange]`.

### M8. `Button` cannot be a Radix Trigger, so focus return is hand-rolled three times

`ui/controls/Button.tsx:57` accepts no `ref` and spreads no rest props. `CompanyCrudControls.tsx:149-154`
works around it with `openerRef` plus `document.activeElement` and an `onCloseAutoFocus` at `:196`; so do
`OffScreen.tsx:663, 711, 865, 874` and `OffScreenConfirm.tsx:17, 32, 40`. Radix's Composition guide: an
`asChild` child must forward its ref and spread props. Dialog and AlertDialog return focus to the
`Trigger` on close and put `aria-haspopup`, `aria-expanded` and `aria-controls` on it; the Delete and
Factory Reset buttons have none of these today. `MoveChipButton` (`RosterTile.tsx:194-205`,
`ComponentPropsWithRef<'button'>` spread first, own `onClick` composed) is the in-repo model.

Fix: `function ButtonInner({ schema, onClick, ..., ref, ...rest }: ButtonProps & ComponentPropsWithRef<'button'>)`,
spread `{...rest}` before the own attributes and compose `onClick`; then
`<AlertDialog.Trigger asChild><Button schema={deleteSchema} /></AlertDialog.Trigger>` and delete the
opener refs and `onCloseAutoFocus` handlers.

### M9. The Header pop-out defeats Radix's popper with `!important` on an internal attribute

`panels/screen/Header.css:227-232` targets `[data-radix-popper-content-wrapper]` (not part of the
documented API) and forces `position`, `transform`, `left` and `top` with `!important`; `Header.tsx:78-106`
explains the swing it fixes. Popover's documented way to position content is `Popover.Anchor` plus
`side`, `align`, `sideOffset` and `avoidCollisions`.

Fix: lift `Popover.Root` to wrap the phone stack and put `<Popover.Anchor asChild>` on `.header__stack`
(`Header.tsx:231`), keep `side="bottom" align="start" sideOffset={8}` and add `avoidCollisions={false}`;
the pop-out then sits flush-left under the stack with no CSS override and survives a Radix internals
change. Open state moves to `Header`; shut it on the shell flip the way `NavPanel.tsx:105-107` shuts the
sheet. Related latent point: `Popover.Portal container={container}` at `Header.tsx:99` receives `null`
until the ref callback re-renders, and Radix's Portal then falls back to `document.body`; safe today only
because the content cannot be open on first render.

### M10. The phone nav sheet has no `Dialog.Trigger` and no `Dialog.Close`; its opener is a `role="switch"` outside the modal

`PhoneBar.tsx:29` opens the sheet with `Toggle` (Radix Switch, `aria-checked`); `NavPanel.tsx:137-160`
renders a modal `Dialog` with neither part, and `:151` hand-rolls the focus return. A modal Dialog
aria-hides and pointer-blocks everything outside `Content`, so the menu's ✕ is hidden from assistive tech
while the sheet is open and the only in-dialog close is Escape. The anatomy's `Close` and `Trigger` give
the close affordance, `aria-expanded` and the focus return for free. The roster Move sheet
(`RosterTile.tsx:134-146`) has the same `Close` gap; it closes only on a pick, Escape or a scrim press.

Fix: make the menu a `<Dialog.Trigger asChild><button aria-label=...>` (Root renders nothing, so it can
move up to a common ancestor of Header and NavPanel) and add a `<Dialog.Close asChild>` button in each
sheet (a `VisuallyHidden` one is enough).

---

## Low

### Radix

- **L1. AlertDialog portal container gated on `open`, changing the tree shape on close.**
  `CompanyCrudControls.tsx:232` and `OffScreenConfirm.tsx:34, 60` (`open ? getScreenViewportDomNode() : null`).
  On close the Portal node is removed in the same commit, so `Content` unmounts by tree removal rather
  than through Radix Presence: `data-state="closed"` never applies and no exit animation could ever run.
  `HelpPopover.tsx:64` and `ScreenPortal` (`RosterTile.tsx:186-191`) resolve the container
  unconditionally. Fix: drop the `open ?` guard.
- **L2. Popover widths use `100vw` where Radix provides the available width.** `HelpPopover.css:60` and
  `RosterTile.css:196` use `calc(100vw - ...)` while both contents set `collisionBoundary` to the screen
  (`HelpPopover.tsx:45`, `RosterTile.tsx:168`). Fix:
  `max-width: var(--radix-popover-content-available-width)` (and the `-height` variable for the Move
  panel's wrapping option grid).
- **L3. Row `data-state` mirrored by hand "to avoid `:has()`" in a file whose CSS already uses `:has()`.**
  `RadioButton.tsx:256` sets `data-state` on the list row; `RadioButton.css:234` already uses
  `.sc-radio-button__row:has(> [data-disabled])`. Fix: `.sc-radio-button__row:has(> [data-state='on'])`
  and drop the manual attribute, or keep it and fix the comment.
- **L4. No primitive stylesheet styles Radix's `data-disabled`.** `Toggle.css`, `SliderLinear.css`,
  `SliderLog.css`, `SliderCenteredZero.css` and `SectionTabs.css` have no `[data-disabled]` or `:disabled`
  rule (`Button.css`, `RadioButton.css` and `Stepper.css` do). The disabled look comes from a
  `.sc-held-off` ancestor, so a primitive disabled on its own (`CompanyCrudControls.tsx:102-103` at the
  company cap) shows no change, against the "dim inert controls" rule. Fix: one shared rule on the roots'
  `[data-disabled]`.
- **L5. `ToggleGroup type="single"` stands in for a radio group.** `RadioButton.tsx:69-75, 328-333`
  swallows Radix's deselect-to-empty and adds `onDeselect`. ToggleGroup has no required-selection mode;
  RadioGroup gives `radiogroup` semantics and never deselects. The code records this as a deliberate
  choice to avoid a dependency. A decision for Crawford, not a change to make.
- **L6. `<div>`s inside Radix `<button>` parts.** `CabinetBox.tsx:464-480` renders `<div>`s and sits inside
  `Switch.Root` (`Toggle.tsx:96-111`), `ToggleGroup.Item` (`RadioButton.tsx:257, 279`), `Tabs.Trigger`
  (`SectionTabs.tsx:72-86`) and the Header `Popover.Trigger` button. Button content is phrasing content;
  browsers tolerate it, validators flag it. Fix: render CabinetBox's boxes as `<span>` (its CSS already
  sets `display`).
- **L7. Switch labelled by a duplicated `aria-label`, not by its visible label.** `Toggle.tsx:95-100`
  renders `DualLabel` then repeats the text as `aria-label` on `Switch.Root`. Valid today; `aria-labelledby`
  to a `useId()` on the DualLabel would remove the duplication and keep the lore line out of the name.
- **L8. Long-press opens the Move sheet outside the Trigger, so focus returns to the chip.**
  `RosterTile.tsx:283` opens via the store; on close Radix focuses `Dialog.Trigger` (the chip, `:135`), not
  the face button that was held. Fix: an `onCloseAutoFocus` that focuses the face when the open came from
  the long press.
- **L9. Focus reached by querying Radix internals.** `OffScreen.tsx:583` selects
  `.sc-radio-button--list [role="radio"][aria-checked="true"]`. Works with ToggleGroup 1.1.x's single-mode
  roles but couples to them; a `focusSelected` ref API or `autoFocus` on the selected item is the stable
  route.

### Hand-built ids (both React trees)

- **L10. `useId` is not used where an id is needed.** SVG `<defs>` ids are built from entity ids:
  `RobotBody.tsx:167` (`halo-${motion ?? 'card'}-${robot.id}`, read by `RobotGem.tsx` and threaded into
  `data-trail-id` for GSAP), `ChargingStation.tsx:98-99`, `Factory.tsx:337-338`. Form ids come from the
  schema: `TextInput.tsx:194-195` (`id={schema.id}`, dotted ids such as `sectorSettings.planetName`).
  All unique today because each entity and schema mounts once per context; a second avatar of the same
  robot, or two instances of one schema, would collide silently. Fix: `useId()` as the base in
  `RobotGem`, `ChargingStation`, `Factory` and `TextInput`, threading the halo id through the same
  attribute GSAP reads.

### Dead code, duplication and decisions

- **L11. Dead debug switch in production code.** `Factory.tsx:27-39, 290`: `LIGHTING_PRESETS` and
  `DEBUG_LIGHTING_PRESET = null` with a branch every render. Proposal: delete, or move behind the existing
  `?debug` param.
- **L12. Unused drawer components.** `PingControlsDrawer.tsx:149` (`PingControlsDrawer`), `:212`
  (`PingControlsRhythmSection`), `:248` (`PingControlsFrequencySection`) and `SignatureArrayDrawer.tsx:317`
  (`SignatureArrayDrawer`) have no non-test importer; only `PingControlsCompositionSection` and
  `SignatureArrayLayer` are used (`RobotScreen.tsx:11, 13`, `CompanyOptionsSection.tsx:4, 6`). Proposal for
  Crawford: remove them, keeping the exported `*Value` types.
- **L13. Unused direct dependency `@radix-ui/react-toggle`.** `package.json:37`; no `src` file imports it.
  ToggleGroup depends on it transitively, so removing the entry is safe. Proposal only.
- **L14. Duplicated constants and types across the gem files.** `StripLine` declared in both
  `RobotGem.tsx` and `useStripFlicker.ts` (the second noting the first is not exported);
  `ORBITER_CORNERS` in both `RobotGem.tsx` and `useOrbiterMotion.ts`; private `clamp01` copies. Fix: export
  once from `gem/polygon.ts` or a small `gem/constants.ts`.
- **L15. Engagement state duplicated four times.** `Button.tsx:267-296`, `nav/NavBox.tsx:34-56`,
  `RosterTile.tsx:206-220` (`MoveChipButton`), and the hover halves in `RadioButton` and `SectionTabs` each
  hand-roll hovered, focused and pressed with the same eight handlers. Fix: a `useEngaged()` hook returning
  `{ engaged, handlers }`.
- **L16. Small dead bits.** `useEasedControlValue.ts:48, 51` writes `displayValueRef` and never reads it.
  `OceanScene.tsx:37, 159` the `localTime` prop (M1). `OceanScene.tsx:381` an empty `<g id="ui-layer" />`
  (unverified whether any module targets it). `SleeveContainer.tsx:5` takes no props while
  `docs/UI_SHELL.md` shows `<SleeveContainer hasPowerSwitch={true} />` (docs drift).
- **L17. A cast stub stored in `timelineMap` as a `Timeline`.** `useOrbiterMotion.ts:311`:
  `setTimeline(masterKey, { kill: () => {} } as unknown as ReturnType<typeof gsap.timeline>)`. The comment
  explains it (a registration token in `'ui'` scope so `pauseWorldTimelines` never calls `.paused()` on it),
  but it makes the map's type a lie and any future iteration over all entries would throw. Fix: a separate
  `Set<string>` of registered motion keys, or `gsap.timeline({ paused: true })`.
- **L18. Display strings in the debug HUD.** `debug/hudLines.ts:104, 116, 135` (`'underruns n/a'`,
  `'random'`, `'no events yet'`) are template-string text the ESLint guard does not see (H2). The HUD is
  `aria-hidden` developer tooling behind `?debug`, so arguably exempt; if so, say so in the file header,
  otherwise move to content keys.

### Effects, GSAP and rendering

- **L19. First-paint measurement in a passive effect.** `CabinetBox.tsx:237-266` creates its
  `ResizeObserver` in `useEffect`, but the comment at `:221-222` says the first callback lands before the
  first paint. It does not, so the first frame uses the `boxHeight` guess at `:461` for the left wall,
  wrong exactly in the documented phone case where the 44 px touch floor exceeds the tier height. Fix:
  `useLayoutEffect` (as `useStageFit.ts:23` and `RobotScreen.tsx:469` do) and fix the comment.
- **L20. `getElementById` during render.** `HelpPopover.tsx:36`, `RosterTile.tsx:168, 187`,
  `OffScreenConfirm.tsx:34` call `getScreenViewportDomNode()` in the render body for Radix `container` and
  `collisionBoundary`. Deterministic in practice but an impure read React cannot track. Fix: resolve it
  once in `ScreenViewport` and expose via a tiny context, or read it in a ref callback into state.
- **L21. Timelines created in plain `useEffect` rather than `useGSAP`.** `useNoteCloud.ts:236-244`
  (the belt tween) and `:332-337` (the re-size fade). Both are registered under `'world'` and killed on
  cleanup (`:314`, `:341`), so nothing leaks, but they sit outside a GSAP context and so outside
  `useGSAP`'s revert, which `docs/ANIMATION_SYSTEM.md` presents as the component pattern. Optional: wrap in
  `useGSAP(..., { revertOnUpdate: false })` or note the exception in the file header. Related: the orbiter
  hop tweens (`useOrbiterMotion.ts:194-223, 244-256`) are deliberately never registered so a hop finishes
  under a pause; the doc's "the world's timelines pause as a set" should name that exception too.
- **L22. Mount-only `useGSAP` can miss `setRef` and `onRobotMounted` if the robot is transiently absent.**
  `Robot.tsx:84-97`: `dependencies: [robotId]`, body guarded by `ref.current && robot`; if `robot` is
  undefined on the first run (the file's own `if (!robot) return null` at `:107` admits it can be) the ref
  is never registered and the work loop never gets the robot, and nothing retries. If the guard is truly
  defensive-only, drop it; otherwise add `robot !== undefined` to the dependencies.
- **L23. `<Context.Provider>` where React 19 allows `<Context value>`.** `DirectionalPanel.tsx:92-94`, the
  only Provider in `src/components`.
- **L24. Pattern notes, no bug.** `RobotScreen.tsx:343-428` is a render-prop hook with a 30-entry
  dependency array; a memoised `RobotSubsectionPanel({ subsectionId, robot, localeId })` component would
  let React do the bookkeeping. `OffScreen.tsx:276-288` keeps `intentRef`/`intent` and
  `snapshotRef`/`snapshot` in lockstep by hand (correct and commented); the 882-line file would read better
  with the Transmission axis (`:781-825`) and Loading axis (`:827-844`) as two child components.
  `RobotBody.tsx:51` still says the `motion` prop is "not yet wired by any caller"; `Robot.tsx:169` and
  `RobotScreen.tsx:450` pass it. The four `react-refresh/only-export-components` warnings
  (`Scenery.tsx:42`, `gemShape.tsx:32, 39, 44`) mean Fast Refresh falls back to a full reload when those
  files change; move the helpers to their own modules.

### Accessibility polish

- **L25. Reduced motion not applied to the rocker's own tweens.** `PowerRockerSwitch.tsx:106-153`: the
  0.06 s thunk and the 1.0 s motor return always animate, while `CabinetBox`, `NavPanel`, `RosterBoard`
  and `useEasedControlValue` all read `prefers-reduced-motion`. Fix: `prefersReducedMotion() ? 0 : MOTOR`.
- **L26. Live region that announces nothing.** `PowerRockerSwitch.tsx:305-312`: `role="status"` with only
  a changing `aria-label`; live regions announce content changes, and most screen readers do not
  re-announce a label change. Fix: the state word as visually hidden text content, or drop `role="status"`.
- **L27. Pointer-only skip of the boot theatre.** `OffScreen.tsx:762`: `onPointerDown={skipOffScreenBoot}`
  on the root; a keyboard user cannot skip the 1.5 s theatre (reduced-motion users skip it, and the
  rocker works throughout). Fix: an `onKeyDown` for Enter, Space or Escape, or skip on first focus.
- **L28. Hover-only engagement on radio options and tabs.** `RadioButton.tsx:284-285` and
  `SectionTabs.tsx:51-59` pop on `mouseenter` only, whereas `Button.tsx` and `NavBox.tsx` also pop on
  focus. Unverified whether the CSS supplies an equivalent `:focus-visible` treatment.
- **L29. GSAP `onComplete` drives the power action.** `PowerRockerSwitch.tsx:175-180`:
  `seq.to({}, { duration: 0.18, onComplete: act })` where `act` is `powerController.pause()` or
  `powerOnSequence()`. A semantic system action, so on the right side of the Strict Separation guardrail,
  but it is the one place a GSAP callback reaches audio-adjacent code; worth a line in
  `docs/ANIMATION_SYSTEM.md` if not already there (unverified).

---

## What is already right

- Every `Dialog.Content` and `AlertDialog.Content` has a `Title`; descriptions are real or explicitly
  `aria-describedby={undefined}`; hidden titles use `VisuallyHidden asChild`; AlertDialogs use `Cancel` and
  `Action` with controlled `open`; nothing uses `forceMount` or mixes controlled and uncontrolled.
- Portals land in ScreenViewport (the UI Shell guardrail), never on `body`, with sensible collision
  boundaries. All three sliders pass `value` as an array, give every `Thumb` an `aria-label`, add
  `aria-valuetext` where `aria-valuenow` would mislead, and keep `Track` plus `Range` in the DOM. Tabs
  trigger and content values match and the `List` is labelled. Styling keys off Radix's own `data-state`.
- Media queries go through `useSyncExternalStore` with ref-counted shared listeners. Zustand selectors are
  narrow and reference-stable almost everywhere (per-robot `find`, single strings, primitives,
  `useShallow`, `useStableSelector`); no whole-store subscriptions.
- "Adjust state during render" is used instead of effects where it fits (`RadioButton`, `SectionTabs`,
  `VoxelTrack`, `TransmissionEditor`); measurement writes CSS custom properties rather than state.
- All motion is GSAP through `useGSAP` with `scope`; every timeline is registered in `timelineMap` with
  `useId`-namespaced keys and killed on unmount; `setRef` and `deleteRef` are paired. Seeded geometry is
  cached once per seed and never stored in state; Factory's static/dynamic greeble split keeps layout out
  of the once-a-second tick.
- Both `dangerouslySetInnerHTML` uses sanitise content-layer strings through DOMPurify (`IntroPanel.tsx`).

## Not covered

CSS files beyond the ones cited (so `:focus-visible` treatment is unverified); test files; the bodies of
the fifteen scenery renderers beyond `dome` and `wreck`; `facadeGreebles` and `rooftopGreebles` beyond
their key, id and memo surfaces; `polygon.ts`'s generator internals; whether any slider consumer's
`onChange` is expensive enough to want `onValueCommit`. No browser run.
