# Implementation Plan: The Off Screen — Crawford's revisions after the listen

Source: Crawford's eight notes of 2026-10-31, given after passing every checkpoint of
[docs/tasks/OFF_SCREEN.md](OFF_SCREEN.md) (roadmap
[57](../todo/roadmap.md#57-the-off-screen-power-as-pause-the-two-axis-chooser-keep-and-the-band-table), spec
[docs/specs/OFF_SCREEN.md](../specs/OFF_SCREEN.md), sketch [docs/sketches/off-screen.html](../sketches/off-screen.html)).
Written 2026-10-31 against `feature/off-screen` at `8694c478`, before any of it is built. Each note is one group below,
in Crawford's numbering; the spec paragraphs each one amends are named on the task, and the amendments land in the docs
task last. The build runs one commit per task, RED first for every behaviour task, on the same branch (the PR is not
open yet).

**The notes, as given:**

1. The current session, saved sessions and presets in a **list**, as the wireframe draws them — less cluttered; the
   cabinetry look may go.
2. **Roll attached to the Current row** — it makes what Roll does obvious.
3. The **remaining aspect families** from the wireframe: Voice (Glassy, Woody, Hollow), Envelope (Plucked, Swelling,
   Held), Space (Dry, Hall, Cavern).
4. **No "as theme" option** — the theme's version may be heard anyway, and "why am I hearing it if I didn't select
   it?" is the confusion to avoid.
5. The **aspect cabinetry pops** on hover and select.
6. On the phone the **veil scrolls away** with the content; it should stay put.
7. A **smooth transition on the world when the coordinates change** — maybe a GSAP blue wash between scenes.
8. `#screen-viewport[data-shell='phone'] .off-screen`'s top padding should be `var(--power-corner-height) + 12px`.

## Overview

Five groups. **Quick fixes** (notes 8, 6): two stylesheet tasks, one of them a small restructure of the screen's DOM so
the veil sits outside the scrolling column. **The list** (notes 1, 2): a third `RadioButton` appearance, `list`, with a
trailing slot per option, and the Transmission axis rebuilt on it with Roll in the Current row. **Aspects** (notes 4, 3,
5): the `'theme'` pick removed from the type, the store, the deal, the link and the screen; three new families — each a
key set, three placeholder columns, a per-family re-derivation in the deal pass and a push to the running engine — and
the family rows rendered generically in the cabinet appearance; the Voice family needs one decision (below). **The
wash** (note 7): a semantic world-change request that the wash covers before the rebuild and uncovers after. **Docs**
last: the spec's amended paragraphs, the four system docs, the grids and roadmap 57's addendum.

## Architecture Decisions

- **The list is a third `RadioButton` appearance, not a new primitive.** `RadioButtonSchema.appearance` gains
  `'list'`: every option is a full-width row — a dot, the label, an optional `meta` (the sketch's "saved 2 days ago" on
  a save) — stacked, with `dividerBefore` a full-width rule. The selected row carries a filled dot and a quiet fill; no
  cabinet, no pop (the muted family, as Crawford allows). A **trailing slot** lets a row carry an action: a new prop
  `trailing?: (value: string) => ReactNode` renders its result as a *sibling* of the Radix item inside a row wrapper
  (`.sc-radio-button__row`), never inside the item, since the item is a button and a button may not contain one.
  The primitive already carries two appearances for this screen; a third keeps the `ControlSchema` contract and the
  component count where they are (`docs/COMPONENT_LIBRARY.md` lists 13).
- **Roll is the Current row's trailing action; Keep stays under the list.** Crawford asked for Roll; Keep saves the
  current world too, so it could sit beside Roll — a question below, defaulting to "Keep stays where it is, muted",
  which changes the least.
- **`'theme'` leaves the pick type; an empty set means every robot as theme.** `AspectPick` becomes `AspectId`;
  `THEME_PICK`, `pickOrderOf`'s first member, the `melody=theme,…` form, the `home.off.asTheme` label and the
  `home.off.melodyDescription.theme` sentence go. The deal is unchanged in shape: with *n* picks every group is dealt one
  (round-robin from the seeded rotation); with none, nothing is dealt. A world that wants plain robots beside an aspect
  has no way to ask for it any more — that is the point of the note, recorded in the spec's assumption 21 as amended.
  A link or payload carrying `theme` as a pick (none exists outside this branch) is dropped by the lenient readers as
  any unknown id is.
- **A family is a key set, three option columns, a derive function and an engine push.** The band table already types a
  family as `AspectFamily<K>` over its keys, and `resolveBands` is generic; what is Melody-specific today is
  `deriveMelodyFields` (the one derivation of the four fields, used at spawn, in the baseline and in the deal) and the
  deal pass's `dealtFields`, which branches on `aspects.melody`. Each new family gets the same shape, extracted from
  `generateAudioAttributes` / `generateRobotSends` the way Task 27 extracted Melody's: the same dataIds, offsets and
  draw order, so a dealt robot is exactly what it would have been had it spawned under the aspect, and Classic parity
  holds (the Task 21 fixture must pass unmodified). **Live, the pass must reach the engine:** Melody's re-derivation
  calls `regenerateMelody`; an envelope or voice change is `AudioEngine.reReserveVoice(robotId)` (it reads the robot
  back from the store, so one call after `updateRobot` rebuilds the voice), a send change is `updateRobotSends` through
  `applySendValue`'s path — the same calls a hand edit makes, never new ones. With the tablet off the engine is not
  started and the calls are no-ops, as they are at spawn.
- **Family keys:**
  - **Envelope** — `robot.attack`, `robot.decay`, `robot.sustain`, `robot.release`, `robot.shapedAttack`,
    `robot.shapedRelease`. Plucked: near-instant attack, low sustain, short release, shaped shares high. Swelling: a long
    attack, high sustain. Held: a modest attack, full sustain, a long release. All bands exist; the shaped stages' `lit`
    rides along, so a Plucked robot may still get a curve.
  - **Space** — `reverbSend`, `delaySend` (the robot-side depth into the two rooms). Dry: both near 0 and mostly unlit;
    Hall: deep reverb, little delay; Cavern: deep reverb and deep delay. A room's own size (`reverb.decay`,
    `delay.delayTime`) is a global band — a theme's, never an aspect's (spec §3, "themes are world-wide, aspects
    robot-side") — so Cavern cannot lengthen the room, only sink its robots into it. Said in the description so nobody
    expects a longer tail. Grit, Shimmer and Double are left to the theme (their shares are fitted draws; a later
    widening).
  - **Voice** — see the open question. Recommended: `robot.filterFreq`, `robot.accentFilterFreq` (lit),
    `robot.accentFilterQ`, `robot.layerGain` (lit), **and a new fourth band kind for the waveform**, `PickBand`
    (`{ weights: Record<WaveformType, number> }`), read by the base-waveform and layer-waveform draws in place of the
    uniform index pick. Classic's weights are equal, and the draw must stay byte-for-byte: the index is the first
    cumulative weight the sample falls under, with Classic's cumulative edges written as `k / 5` so they equal what
    `Math.floor(v * 5)` gave (pinned by the Task 21 fixture). Glassy leans sine / triangle with an open filter and quiet
    partials; Woody leans triangle / square with a lower cutoff and warm layers; Hollow leans square / pulse with the
    accent bandpass share up. A fourth kind is "ask first" in spec §3 — this plan is the ask; Task 10 does not start
    until Crawford answers. The fallback is Voice over the continuous keys alone, which makes Woody and Hollow faint.
- **The family rows render from `ASPECT_FAMILY_IDS`, in the cabinet appearance.** `OffScreen` loops the families
  (schema, value, change handler and description line per family) instead of naming Melody, so a fifth family is a
  data change. Each row drops `appearance: 'muted'`: the `multiple` variant already pops every selected option in the
  cabinet appearance (Task 29), so note 5 is a deletion plus the rows' spacing. The spec's §3 "nothing pops on the off
  screen" and §7 Q10 are amended: the aspect rows pop; the theme row, the Transmission list, Roll and Keep stay flat
  (a question below if Crawford wants the theme row popping too).
- **The wash is a semantic request, covered before the rebuild, uncovered after.** `retransmitWorld` and
  `applySessionPayload` rebuild synchronously, so a wash started in the same handler can only snap on in the frame the
  new world first paints — a hidden cut, not a smooth one. For a fade in *and* out the rebuild has to wait for the
  cover, and GSAP may only trigger semantic state (CLAUDE.md, Strict Separation). So: a new `uiStore` field
  `sceneWash: 'clear' | 'covering' | 'covered' | 'uncovering'` (JSON), and `requestWorldChange(change: () => void)`
  in a new `src/systems/worldChange.ts`: it stores the pending change at module scope (runtime-only), sets
  `'covering'`, and returns. The wash module (`src/animation/sceneWash.ts`, timeline `scene-wash`, `'ui'` scope so it
  plays over a paused world) subscribes to the store: on `'covering'` it tweens the wash element to opaque and its
  `onComplete` sets `'covered'` — semantic state, nothing else. `worldChange.ts` subscribes too: on `'covered'` it runs
  the pending change (the whole synchronous body — retransmit or apply plus the caller's follow-ups), then sets
  `'uncovering'`; the wash fades out and sets `'clear'`. A second request while one is pending replaces it (the last
  pick wins). Under `prefers-reduced-motion` the module skips both tweens: the change runs on the next microtask-free
  path — synchronously inside `requestWorldChange` — and the state goes straight back to `'clear'`. Callers that
  rebuild from a user gesture (the off screen's picks, Roll, the theme and family rows, Foundry's Retransmit and a
  session Load) go through the request; the boot path, the link boot and `applySessionPayload`'s internal
  `retransmitWorld` do not. The wash element is a sibling of `.world-view__scroller` inside `.world-view`, over the
  scene and under `MetaBox`, so it reads through the off screen's veil as a blue tint. Colour: a deep water blue from
  the stylesheet's tokens, a placeholder until Crawford looks. **This changes how a retransmit is sequenced — one of
  spec §3's "ask first" items — so Task 13 waits on Crawford's yes;** the alternative (the instant cover, no deferral)
  is written on the task as the fallback.
- **The veil leaves the scrolling element.** `.off-screen` is `overflow-y: auto` on the phone and the veil is
  `position: absolute` inside it, so it scrolls with the column. The screen becomes a non-scrolling root holding the
  veil, the dark layer and a new `.off-screen__scroll` child that holds the column and scrolls; the fade and the
  theatre keep their targets (the root for the fade, the dark layer for the theatre). A `position: fixed` veil was
  rejected: the tablet is scaled and offset, and fixed would leave the glass.
- **Order.** Quick fixes first (an afternoon's look for Crawford, no dependencies). The list before the aspects, since
  both touch `OffScreen.tsx` and the list changes its shape most. Within aspects, the `'theme'` removal first (every
  later task's type gets simpler), then Envelope and Space (no decision needed), the generic rows, then Voice (its
  decision can land late). The wash last among the code, since it changes every world-change caller and is the one
  item that may be vetoed whole.

## Dependency Graph

```
Task 1 (phone padding)   Task 2 (veil outside the scroll)
        │                          │
        └────────── Checkpoint A ──┘
                        │
Task 3 (RadioButton 'list' + trailing) → Task 4 (OffScreen: the Transmission list, Roll in the Current row) → Task 5 (list CSS, Look)
                                                                                                                   │
                                                                                                           Checkpoint B
                                                                                                                   │
Task 6 ('theme' pick removed) → Task 7 (Envelope + Space: keys, columns, resolver) → Task 8 (derive + deal pass + engine push)
                                                                                              │
                                                                   Task 9 (the family rows, generic, cabinet) → Task 10 (Voice: PickBand or fallback)
                                                                                              │
                                                                                      Task 11 (the listen)
                                                                                              │
                                                                                      Checkpoint C
                                                                                              │
                                  Task 12 (sceneWash store + worldChange request) → Task 13 (the wash element and timelines; callers)
                                                                                              │
                                                                                      Checkpoint D
                                                                                              │
                                                                               Task 14 (docs, spec amendments, roadmap 57)
```

## Task List

Every task names its **Proof**: **RED test** for behaviour, **Look** for what only the browser shows, **Read** for
docs and copy. Only a RED-test task lists a `*.test.ts(x)` in its Files (CLAUDE.md, "Tests exercise code, not text").
Commit subjects: `off-screen-revisions T<n>: <what>`.

### Phase 1: Quick fixes (notes 8, 6)

- [x] **Task 1: `OffScreen.css` — the phone's top padding clears the power corner** (f093df66; Crawford's value as given — measured headless, the label sits **24 px** under the corner's bottom at 375 × 812, 360 × 640 and 640 × 360, not 12: the screen's top edge is 12 px below the corner's top, so `var(--power-corner-height)` alone would give 12 px if that was the intent; the sideways phone scrolls)

  **Description:** `#screen-viewport[data-shell='phone'] .off-screen { padding-top: calc(var(--power-corner-height) + 12px) }`
  in place of `12vh`. `--power-corner-height` is `src/index.css`'s `calc(var(--power-switch-height) + (var(--power-corner-margin) * 2))`,
  the sleeve's power corner; the column then starts a fixed 12 px under it on every phone height instead of a share of
  the viewport.

  **Proof:** Look — at 375 × 812 and 360 × 640 the etched label clears the power corner by 12 px; a phone on its side
  (640 × 360) still scrolls the picker rather than clipping it.

  **Acceptance criteria:**
  - [ ] The rule reads the variable; no `vh` remains in the phone padding.
  - [ ] Desktop padding unchanged.

  **Verification:**
  - [ ] The Look above, recorded in the commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/screens/OffScreen.css`

  **Estimated scope:** XS (one declaration)

- [x] **Task 2: `OffScreen.tsx` / `.css` — the veil stays put while the phone's column scrolls** (ba9a57b8; the scroll child is `position: absolute; inset: 0; z-index: 1`, between the veil and the dark layer, so the old `:not()` stacking rule is gone rather than moved; the two veil-order cases that read `root.lastElementChild` now read the column's last child; headless at 375 × 812 the column scrolls 174 px while the veil's rect does not move)

  **Description:** The root `.off-screen` stops scrolling and keeps `inset: 0` with the veil and the dark layer as its
  first children; a new `div.off-screen__scroll` wraps the etch, the picker and the footer and takes the phone's
  `overflow-y: auto`, its padding and its `flex-direction: column` layout (the desk's centring moves with it). The
  fade (`fadeOffScreen`) still targets the root through `OFF_SCREEN_REF_KEY`, so the veil and the column fade together;
  the theatre still targets the dark layer; `onPointerDown={skipOffScreenBoot}` stays on the root. The
  `.off-screen > :not(.off-screen__veil):not(.off-screen__dark)` stacking rule moves to the scroll child.

  **Proof:** RED test — `OffScreen.test.tsx`: the veil and the dark layer are direct children of the root and the
  footer is a descendant of `.off-screen__scroll`, not a sibling of the veil (structure, which jsdom can see); the
  existing presence and gate cases pass unmodified. **Look** — on the phone, scroll the chooser to the footer: the
  blur and dim stay over the whole glass; the fade on the flip still takes the veil.

  **Acceptance criteria:**
  - [ ] The veil never moves on a phone scroll; the column scrolls under it.
  - [ ] Desktop layout and the two timelines unchanged (existing tests pass).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx` passes.
  - [ ] The Look above, recorded in the commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (the same stylesheet; land 1 first).

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/screens/OffScreen.css`,
  `src/components/panels/screen/screens/OffScreen.test.tsx`

  **Estimated scope:** S

### Checkpoint A: Quick fixes
- [x] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Phone: the label clears the power corner; the veil stays while the column scrolls. Desktop unchanged. (Headless
      self-check passed, record below; Crawford's own look pending.)
- [ ] Reviewed with human before Phase 2. (Crawford asked for an unattended run on 2026-10-31 — "don't stop to wait for
      my approval" — so the build went on; his review of A is pending.)

**Checkpoint A record (2026-10-31, `feature/off-screen` at `ba9a57b8`, automated half):** `npm run build:types` clean;
`npm run lint` 0 errors (the 4 pre-existing `react-refresh` warnings in `Scenery.tsx` / `gemShape.tsx`); `npx vitest run`
342 files, 12 888 tests, all passed (the parent plan's 12 884 plus Task 2's four). Headless Chrome on a private dev
server (`look.mjs`, a scratchpad script over `scripts/perf/cdp-lib.mjs`): the label 24 px under the power corner at
375 × 812, 360 × 640 and 640 × 360 (see Task 1); the phone column scrolls under a still veil; the desk at 1600 × 900
unchanged, no overflow.

---

### Phase 2: The list (notes 1, 2)

- [x] **Task 3: `RadioButton.tsx` / `.css` / `controls.ts` — the `list` appearance and the trailing slot** (09dea0ac; the row mirrors its item's `data-state` itself, so the CSS needs no `:has()`; `meta` is wired as the item's `aria-describedby`, its id from `useId` and the option index since a save's value may hold spaces; a trailing result of `null`, `undefined`, a boolean or `''` draws no slot; `cabinet` and `muted` never call `trailing` nor draw `meta`; 10 mutants, all killed)

  **Description:** `RadioButtonSchema.appearance` gains `'list'`; each option may carry `meta?: string`. In `list`
  every option is a full-width row (`.sc-radio-button__row`): the Radix item (`.sc-radio-button__list-item`) holding a
  dot, the label and the meta in small type, and beside it — a sibling, never a child — the result of a new component
  prop `trailing?: (value: string) => ReactNode` when it returns one. The root stacks rows (`flex-direction: column`,
  no wrap); `dividerBefore` is a full-width rule between rows; the selected row's dot fills and the row takes a quiet
  fill, keyed off Radix's `data-state='on'` as the other appearances are. No `CabinetBox`, no pop timeline, no hover
  pop (the muted family). Single-value and `multiple` both work in `list`; the single-value path is the consumer.
  The `cabinet` and `muted` appearances are untouched.

  **Proof:** RED test — `RadioButton.test.tsx`: in `list`, options render as rows with the `role="radio"` item and the
  trailing node as siblings in one row; the trailing node is not inside the item; a click on the trailing node does
  not change the value; `meta` renders; `dividerBefore` draws a rule; the selected row carries `data-state='on'`; no
  `sc-cabinet-box` renders. Existing cases pass unmodified.

  **Acceptance criteria:**
  - [ ] The row shape and the trailing contract above; a row without a trailing result renders no empty slot.
  - [ ] Controls hold their largest-content size (a selection change never reflows the list).
  - [ ] `cabinet` and `muted` byte-for-byte unchanged (existing tests).

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/RadioButton.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/types/controls.ts`, `src/components/ui/controls/RadioButton.tsx`,
  `src/components/ui/controls/RadioButton.css`, `src/components/ui/controls/RadioButton.test.tsx`

  **Estimated scope:** M

- [x] **Task 4: `OffScreen.tsx` — the Transmission list; Roll in the Current row** (7b84ac6a; **the meta is absolute, not relative** — the helper the Sessions panel uses, `formatSessionTimestamp`, prints "Sep 28, 2:14 PM", so a save row reads "saved Sep 28, 2:14 PM", the time the Sessions list shows, and the key is `home.off.savedAt`, not `savedAgo`; a relative "2 days ago" needs a new helper — Crawford's call; Roll carries no `accessibleName` override, its schema name being "Roll" already; the divider case and the phone's long-name case read the list's row and item; 7 mutants, all killed)

  **Description:** The Transmission schema becomes `appearance: 'list'`; each save option carries `meta` from its
  `savedAt` (a relative "saved …" through a content template, `home.off.savedAgo`, with the date-formatting helper the
  Sessions panel already uses — reuse it, don't write one); the Current row's trailing slot renders the Roll `Button`
  (`face="single"`, `muted`, `accessibleName` "Roll" so a screen reader hears it apart from the row). The
  `.off-screen__actions` row keeps Keep alone, relabelled **"Save the last session"** (`home.off.keep`'s human label,
  Crawford's words, 2026-10-31). Everything else — the pick handlers, Keep's dim, the warning, the readout — is
  unchanged.

  **Proof:** RED test — `OffScreen.test.tsx`: the Transmission root carries `sc-radio-button--list`; Roll is inside the
  Current row and outside its radio item; clicking Roll calls `rollWorld` and does not change the pick; a save row shows
  its meta; the existing pick, Keep and readout cases pass unmodified.

  **Acceptance criteria:**
  - [ ] Current, the saves (newest first, with meta), a rule, the presets, as rows; Roll on the Current row.
  - [ ] No behaviour change in picks, Keep, Roll or the readout.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/screens/OffScreen.test.tsx`,
  `src/content/copy/home.ts`

  **Estimated scope:** S

- [x] **Task 5: `OffScreen.css` / `RadioButton.css` — the list's look on the desk and the phone** (80a14c07; Roll takes the sketch's small flat button, a 26 px face and the lore-size label, 6 px in from the row's end; an unselected row's border brightens faintly on hover, the muted button's engaged state for a row, never a lift — beyond the plan's list; the phone's rows take the boxes' 10 px padding; headless: rows 36 px, Current 50 px, no sideways scroll at 360 px, long names ellipsise; Crawford's look pending)

  **Description:** Row height, the dot, the meta's type, the rule, the selected fill, Roll's seat at the row's end, the
  Transmission column's width inside `.off-screen__axes` (the list wants the column's full width where the boxes
  wanted centring), and the phone's row padding. Nothing lifts off the plate.

  **Proof:** Look — 1600 × 900: the list reads as the sketch's rows (dot, name, code; Roll at the Current row's end;
  the saves' meta quiet); 375 × 812: rows full width, a long save name ellipsises or wraps without widening the column.

  **Acceptance criteria:**
  - [ ] The list as the sketch draws it; no horizontal scroll at 360 px.

  **Verification:**
  - [ ] The Look above, recorded in the commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/components/panels/screen/screens/OffScreen.css`, `src/components/ui/controls/RadioButton.css`

  **Estimated scope:** S (CSS only)

### Checkpoint B: The list
- [x] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Browser, desk and phone: the Transmission list; Roll on the Current row rolls and leaves the pick on Current; a
      save pick, a preset pick and Keep behave as before. (Headless pass recorded below; Crawford's own look pending.)
- [ ] Reviewed with human before Phase 3 — and the two list questions below answered. (The questions were answered
      before the build; the review is pending, as at Checkpoint A.)

**Checkpoint B record (2026-10-31, `feature/off-screen` at `80a14c07`, automated half):** `npm run build:types` clean;
`npm run lint` 0 errors (the 4 pre-existing warnings). `npx vitest run`: 340 files passed outright; the other two
(`loadingStore.test.ts`, `dealAspects.test.ts`) failed only on Task 6's new RED cases, which the run picked up mid-edit —
so the committed versions of the five files Task 6 had touched were run on their own at `80a14c07`: 5 files, 155 tests,
all passed. Headless Chrome, 1600 × 900, the real app: Roll renamed Current and kept it selected; a preset pick
(Vessport Null) selected its row and the readout named it; "Save the last session" was lit, saved a row ("Drift
Collective", meta "saved Oct 31, 4:16 AM") and dimmed; picking that save selected it; no console errors. 375 × 812 and
360 × 640: the list full width, no sideways scroll, long names ellipsised.

---

### Phase 3: Aspects (notes 4, 3, 5)

- [x] **Task 6: `aspects.ts` and its readers — the `'theme'` pick goes** (942b0234; `AspectPick` is deleted outright rather than kept as an alias of `AspectId`; the empty row's sentence is `home.off.melodyDescription.none`, the old as-theme sentence's words as the stand-in; tests outside the plan's list that used `'theme'` as a pick in fixtures — SectorSettingsDrawer, seedBaseline, sessionDiff, sessionShareUtils, worldIdentity, worldTransition, spawnSystem — take real ids, intent unchanged; 4 mutants, all killed)

  **Description:** `AspectPick = AspectId`; `THEME_PICK` deleted; `pickOrderOf(family)` is the family's options in
  `ASPECT_IDS` order; `canonicalPicks` / `canonicalAspects` unchanged otherwise; `dealAspects` loses its `'theme'`
  branch (every group is dealt one of the picks; an empty list deals nothing); `describeWorld` loses its filter;
  `worldLink`'s `readAspects` drops `theme` as it drops any unknown id; `OffScreen`'s Melody row lists the three options
  and its description line shows the family's own sentence when nothing is picked (`home.off.melodyDescription.none`,
  a stand-in); `home.off.asTheme` and `home.off.melodyDescription.theme` are deleted (unread entries fail the content
  test); `loadingNames.ts`'s maps follow. Spec assumption 21's "as theme" member is amended in Task 14.

  **Proof:** RED test — `dealAspects.test.ts`: two picks over three groups seat both and every group has one (the
  `['theme','hypnotic']` case is deleted); `aspects` / `loadingStore` tests: `canonicalPicks(['theme','hypnotic'])`
  is `['hypnotic']`; `worldLink.test.ts`: `melody=theme,hypnotic` decodes to `['hypnotic']`; `describeWorld.test.ts`:
  the `'theme'` member case goes; `OffScreen.test.tsx`: the Melody row has three options, clearing it sends `[]`, the
  empty-row sentence shows; `content.test.ts` passes with the two keys gone. Every other existing case unmodified.

  **Acceptance criteria:**
  - [ ] No `'theme'` pick anywhere in `src/`; the type no longer admits it.
  - [ ] An empty family list means every robot as theme — the deal, the readout and the link all read it so.

  **Verification:**
  - [ ] `npx vitest run src/data/bands src/stores/loadingStore.test.ts src/utils/worldLink.test.ts src/utils/describeWorld.test.ts src/components/panels/screen/screens/OffScreen.test.tsx src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4 (the same screen file).

  **Files:** `src/data/bands/aspects.ts`, `src/data/bands/dealAspects.ts`, `src/utils/describeWorld.ts`,
  `src/utils/worldLink.ts`, `src/utils/loadingNames.ts`, `src/components/panels/screen/screens/OffScreen.tsx`,
  `src/content/copy/home.ts`, their `*.test.ts(x)`

  **Estimated scope:** M (many small edits, one idea)

- [x] **Task 7: `aspects.ts`, `bandKeys.ts` — the Envelope and Distance families: keys and placeholder columns** (114f3f88; the key sets sit beside `MELODY_BAND_KEYS` in `aspects.ts`, so `bandKeys.ts` needed nothing; `ASPECT_IDS` gives way to `ASPECT_IDS_BY_FAMILY` with `AspectIdOf<F>`, and `resolveBands` reads a column through a widened lookup so another family's id moves nothing; `isAspectOf` is the membership the family-keyed readers use; the intent checks also pin the shaped bands, since a shaped stage is drawn from its own band and Classic's 0.03-0.25 shaped attack would undo a pluck; 12 mutants, all killed)

  **Description:** `ASPECT_FAMILY_IDS` becomes `['melody', 'envelope', 'distance']`; `ASPECT_IDS` is per family now
  (`ASPECT_IDS_BY_FAMILY`, with `AspectId` the union: `hypnotic | mechanical | wandering | plucked | swelling | held |
  near | far | remote`); `ENVELOPE_BAND_KEYS` (`robot.attack`, `robot.decay`, `robot.sustain`, `robot.release`,
  `robot.shapedAttack`, `robot.shapedRelease`) and `DISTANCE_BAND_KEYS` (`reverbSend`, `delaySend`); `ASPECT_FAMILIES`
  gains the two entries with placeholder columns on the Architecture Decisions' sketch (every number for Task 11's
  listen); the foreign-key type still fails to compile for a column outside its family. `resolveBands` needs no change.
  Content: `home.off.envelope`, `home.off.distance` (labels), `home.off.envelope.<id>`, `home.off.distance.<id>` (names),
  `home.off.envelopeDescription.<id|none>`, `home.off.distanceDescription.<id|none>` (sentences) — stand-ins; the
  Distance sentences say "how far off a probe sounds", never "room".

  **Proof:** RED test — `resolveBands.test.ts`: each Envelope and Distance option differs from Classic on a subset of
  its family's keys and nowhere else; Plucked's attack max ≤ 0.05 and sustain max ≤ 0.3, Remote's reverb min ≥ 0.6
  (intent checks, so a wrong-way edit fails); every band inside its field's range; a `// @ts-expect-error` column
  naming `bpm` in Distance. `loadingStore.test.ts`: `canonicalAspects` keeps three families.

  **Acceptance criteria:**
  - [ ] Three families, nine options; the key sets as above; the intent checks hold.
  - [ ] Classic and the Melody options byte-for-byte unchanged (existing cases).

  **Verification:**
  - [ ] `npx vitest run src/data/bands src/stores/loadingStore.test.ts src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/data/bands/aspects.ts`, `src/data/bands/bandKeys.ts`, `src/data/bands/resolveBands.test.ts`,
  `src/utils/loadingNames.ts`, `src/content/copy/home.ts`

  **Estimated scope:** M

- [x] **Task 8: `spawnSystem.ts` — `deriveEnvelopeFields`, `deriveSendFields`; the deal pass per family; the engine push** (eb334995; **the Envelope push is `updateVoiceEnvelope`, not `reReserveVoice`** — the plan's own rule is "the same calls a hand edit makes", and the hand edit (`applyAdsr`) writes the envelope live, curves included, with no rebuild; Distance pushes all five sends through `updateRobotSends(robotSendLevels(robot))`; Melody now regenerates only a Melody-dealt robot; the compose helpers take their bands, so the deal reads every band from its own theme; the per-family pass is a `switch`; 11 mutants, 10 killed, the survivor — accumulating the robot as dealt so far — removed until Voice needed it)

  **Description:** Extract the ADSR draw (the two curve rolls against the shaped shares, then the four stages from
  their bands) from `generateAudioAttributes` into `deriveEnvelopeFields(noiseMap, offset, bands)` and the five-send
  draw from `generateRobotSends` into `deriveSendFields(noiseMap, offset, bands)`, each called where the draws were
  (same dataIds, same order — the Task 21 fixture must pass unmodified). `dealtFields` becomes a per-family table:
  `melody` → `deriveMelodyFields`, `envelope` → `deriveEnvelopeFields` (writes `audioAttributes.adsr`), `space` →
  `deriveSendFields` (writes `reverbSend` / `delaySend`; the three exclusive sends are re-derived and come out the same,
  since the aspect's column cannot name them). `applyDealToBaselines` and `applyAspectDeal` loop the families;
  `loadedUnder` gains one entry per dealt family. **Live:** after `updateRobot`, an envelope-dealt robot gets
  `AudioEngine.reReserveVoice(id)` (it reads the robot back from the store) and a space-dealt one `updateRobotSends`
  through `applySendValue`; both are no-ops before the engine starts, as a cold spawn is.

  **Proof:** RED test — `spawnSystem.test.ts`: a robot dealt Plucked has an `adsr` equal to a direct
  `deriveEnvelopeFields` under `resolveBands(theme, { envelope: 'plucked' })` and its sends untouched; one dealt Cavern
  has sends equal to `deriveSendFields` under its bands and its `adsr` untouched; a robot dealt one of each has both;
  undealt robots and every other field byte-for-byte unchanged; `loadedUnder` has one key per dealt family; a
  copied-baseline robot re-derives from its own index; the live pass calls `reReserveVoice` once for an envelope-dealt
  robot and `updateRobotSends` for a space-dealt one (engine mocked). `sessionDiff.test.ts`: an untweaked world dealt
  `{ melody: ['hypnotic'], envelope: ['plucked', 'held'], space: ['cavern'] }` has `robotOverrides` `{}`.

  **Acceptance criteria:**
  - [ ] Live roster and regenerated baseline agree for every family (the `{}` diff).
  - [ ] Classic parity (the Task 21 fixture and every deterministic case) unmodified.
  - [ ] The engine is told exactly what a hand edit would tell it, and nothing when it has not started.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts src/systems/worldTransition.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, `src/types/Robot.ts` (the `loadedUnder`
  comment only), `src/utils/sessionDiff.test.ts`

  **Estimated scope:** M (one wide file; mechanical extraction plus the loop)

- [x] **Task 9: `OffScreen.tsx` / `.css` — the family rows, generic, in the cabinet appearance** (52cd93fe; one handler sends the **whole** loading with the changed family replaced — `retransmitWorld` replaces the aspects whole, so a family-only send would drop the others' picks; the description memory is per family; found at the Look: the desk column outgrew a 1280 × 720 screen and the centred, clipped column cut the label and the footer off, so the column scrolls on the desk too with `justify-content: safe center`, and each description sits half the gap under its row; 7 mutants, all killed)

  **Description:** The Loading axis renders one `multiple` `RadioButton` per `ASPECT_FAMILY_IDS` entry (schema from
  `familyLabels` / `aspectName`, value from the shown identity's list, a change handler sending the whole canonical
  set for that family, a description line naming the aspect toggled on last, else the last of the set, else the
  family's `none` sentence — the Melody row's rules, applied per family), under the theme row. **The rows drop
  `appearance: 'muted'`:** a cabinet `multiple` group pops every selected option and pops on hover (Task 29). Row
  spacing and the description lines' height on the desk's two columns and the phone's one. `describeWorld` already
  loops the families; `CompanyScreen` / `RobotScreen`'s "Loaded Under" line already joins a record's families — check,
  don't change. The spec's "nothing pops on the off screen" is amended in Task 14; the theme row stays muted (question
  below).

  **Proof:** RED test — `OffScreen.test.tsx`: four family rows render in `ASPECT_FAMILY_IDS` order, each `multiple`,
  each with `sc-cabinet-box` elements (the "nothing comes off the plate" cases are rewritten to cover the Transmission
  list, the theme row, Roll and Keep only); toggling Plucked calls `retransmitWorld({ aspects: { melody: […],
  envelope: ['plucked'], space: […] } })` with the other families' lists carried as they were; a save with
  `aspects.space = ['cavern']` selects Cavern; the readout tail joins the families (`… · Hypnotic · Plucked + Held ·
  Cavern`). **Look** — hover and select pops on the aspect rows; two columns at 1600 × 900, one at 375 × 812.

  **Acceptance criteria:**
  - [ ] Four rows from the data; the set semantics per family; the readout and the "Loaded Under" line agree with it.
  - [ ] The aspect boxes pop; nothing else on the screen does.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/utils/describeWorld.test.ts src/content/content.test.ts` passes.
  - [ ] The Look above, recorded in the commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 7, 8.

  **Files:** `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/screens/OffScreen.css`,
  `src/components/panels/screen/screens/OffScreen.test.tsx`

  **Estimated scope:** M

- [x] **Task 10: Voice — `PickBand`, the waveform draws, the family** *(decided 2026-10-31: the `PickBand` path)* (f511af0b; the pick draws over [0, total weight], so Classic's five unit weights are the old [0, 5] call and its integer edges Math.floor's index exactly — pinned over 400 robots against an independent oracle, base and layers; a draw at the very top lands on the last weighted waveform; the Voice push is `reReserveVoice` **and** `primeRobotLinks`, the structural edit's `rebuildVoice` — the rebuild disposes the nodes the LFO links were wired to; Voice keys: waveform, filterFreq, accentFilterFreq, accentFilterQ, layerGain; 15 mutants, all killed after the Woody and Hollow cases were made to pin the bands' outcomes; with four family rows the desk column at 1600 × 900 scrolls 75 px — a Look note for Crawford)

  **Description:** If Crawford takes the recommendation: `bandKeys.ts` gains a fourth kind, `PickBand`
  (`{ weights: Record<WaveformType, number> }`), one key `robot.waveform`, Classic's weights equal; the base-waveform
  and layer-waveform draws in `generateAudioAttributes` pick the first cumulative edge the sample falls under, with
  Classic's edges `k / 5` so `Math.floor(v * 5)`'s index is reproduced exactly (the Task 21 fixture is the proof);
  `deriveVoiceFields(noiseMap, offset, bands)` is extracted around the waveform, filter and layer draws (`robot.filterFreq`,
  `robot.accentFilterFreq`, `robot.accentFilterQ`, `robot.layerGain`, `robot.waveform`), the family `voice` with Glassy /
  Woody / Hollow placeholder columns joins `ASPECT_FAMILIES` (and the generic row, the deal table — `reReserveVoice` is
  the push — and the content keys follow Task 7's and 9's shapes). If he takes the fallback: the family over the four
  continuous keys only, no new kind. Either way `docs/reference/ROBOT_DATA_GRID.md`'s aspect table gets the column in
  Task 14. Spec §3's three-kinds rule is amended if the kind is added.

  **Proof:** RED test — `resolveBands.test.ts`: the Voice options on their keys only, intent checks (Glassy's sine +
  triangle weights ≥ 0.7 of the total; Hollow's filter max below Classic's); `spawnSystem.test.ts`: under Classic the
  fixture passes unmodified (the edge arithmetic); under a `PickBand` of one waveform every robot gets it; a robot dealt
  Woody has a waveform, filter and layers equal to `deriveVoiceFields` under its bands; `OffScreen.test.tsx`: a fifth
  row.

  **Acceptance criteria:**
  - [ ] Classic waveform parity byte-for-byte; a moved weight is applied.
  - [ ] The family dealt, pushed and read like the other three.

  **Verification:**
  - [ ] `npx vitest run src/data/bands src/systems/spawnSystem.test.ts src/components/panels/screen/screens/OffScreen.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 9; Crawford's answer to open question 3.

  **Files:** `src/data/bands/bandKeys.ts`, `src/data/bands/classic.ts`, `src/data/bands/aspects.ts`,
  `src/systems/spawnSystem.ts`, `src/content/copy/home.ts`, their `*.test.ts(x)`

  **Estimated scope:** M

- [x] **Task 11: The listen — the new families' numbers** (Crawford, 2026-11-01, answering the review walkthrough's "listen to the new aspects": "sounds good", taken as the listen passing, so the placeholder columns stand as final; `docs/tasks/OFF_SCREEN_FINAL_FIXES.md` Open Questions asks him to say if it meant "later". Before that: The build ran unattended on 2026-10-31, so the placeholder columns of Tasks 7 and 10 stand as written; `npx vitest run src/data/bands` passes with them. When he listens, the agreed numbers replace them in `aspects.ts` and the grids' aspect tables.)

  **Description:** On one seed, Crawford listens to each new option alone against Classic and against one theme and
  adjusts the placeholder bands until each is itself; the agreed numbers go into `aspects.ts` and the grids' aspect
  table (Task 14 carries the docs if they move after). Tasks 7 and 10's tests keep the columns on their families'
  keys.

  **Proof:** Listen — nine (or six) options recognisable on a company. Numbers recorded under Checkpoint C.

  **Acceptance criteria:**
  - [ ] Crawford's sign-off per option recorded here.

  **Verification:**
  - [ ] `npx vitest run src/data/bands` passes with the final numbers.

  **Dependencies:** Tasks 9, 10.

  **Files:** `src/data/bands/aspects.ts`

  **Estimated scope:** S (data; the time is listening)

### Checkpoint C: Aspects
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Browser: four (or five) aspect rows popping on hover and select; a Plucked pick audibly shortens a company's
      notes; a Cavern pick sinks one into the rooms; the company detail's "Loaded Under" line names every dealt
      family; a save made under two families reloads with the rows set; its link carries
      `melody=…&envelope=…&space=…`; no "as theme" anywhere. (Headless half recorded below; the two by-ear items are
      Crawford's.)
- [ ] `npm run perf:audio` Pixel A/B on a Perilous + Plucked + Cavern world against `main` (the densest, wettest case).
      (Not run: the Pixel is Crawford's.)
- [ ] Reviewed with human before Phase 4. (Pending, as at A and B.)

**Checkpoint C record (2026-10-31, `feature/off-screen` at `96c557d2`, automated half):** `npm run build:types` clean;
`npm run lint` 0 errors (the 4 pre-existing warnings); `npx vitest run` 342 files, 12 979 tests, all passed;
`npm run build` built (the usual over-500 kB chunk warning). Headless Chrome, the real app at 1600 × 900: Hypnotic,
Mechanical, Wandering, Plucked, Swelling, Held, Near, Far, Remote, Glassy, Woody, Hollow render as cabinet boxes in
four family rows; a click pops the box (front offset 4,2 against the rest's 2,1) with the accent fill, a hover pops it
too; picking Wandering, Plucked, Held, Remote and Woody left the address bar at
`?seed=…&x=…&y=…&melody=wandering&envelope=plucked,held&distance=remote&voice=woody` and the readout at
`… · Wandering · Plucked + Held · Remote · Woody`; no console errors. The company detail's line across four families
is pinned by a unit case (96c557d2: "Hypnotic + Held + Remote + Woody", in family order); a save carrying Distance
Remote and two Envelope picks reloads with those rows set (OffScreen.test.tsx). No "as theme" in `src/` outside the
stale-pick tests. Still Crawford's: the Plucked and Remote listens, Task 11's numbers, the Pixel A/B, and the Look
note that four family rows make the 1600 × 900 desk column scroll by 75 px.

---

### Phase 4: The wash (note 7) *(decided 2026-10-31: the deferral, 0.5 s each way, the world's sea colour)*

- [x] **Task 12: `uiStore.ts`, `systems/worldChange.ts` — the request and its four states** (6a10cc3a; **beyond the plan: the wash attaches itself while mounted** (`attachSceneWash`), and with no wash attached a request runs at once, as under reduced motion — otherwise a request made while no wash element exists would wait for a `'covered'` that never comes; detaching mid-cover runs the pending change and clears; the pending change runs in a loop with the uncover in a `finally`, so a throwing change still uncovers and a change that asks for another runs it before the uncover; 8 mutants, all killed)

  **Description:** `uiStore.sceneWash: 'clear' | 'covering' | 'covered' | 'uncovering'` (JSON, default `'clear'`) with
  `setSceneWash`. New `src/systems/worldChange.ts`: `requestWorldChange(change: () => void)` keeps the latest pending
  change at module scope and sets `'covering'` (a request while `'covering'` or `'covered'` replaces the pending change;
  one while `'uncovering'` restarts the cover); a store subscription runs the pending change when the state becomes
  `'covered'` and then sets `'uncovering'`; `prefers-reduced-motion` (read through `matchMedia`, the theatre's pattern)
  runs the change synchronously and leaves the state `'clear'`. Nothing here touches GSAP or the audio; the module is
  testable with the store alone.

  **Proof:** RED test — `src/systems/worldChange.test.ts`: a request sets `'covering'` and does not run the change;
  setting `'covered'` runs it once and sets `'uncovering'`; a second request before `'covered'` replaces the first (the
  first never runs); under reduced motion the change runs at once and the state stays `'clear'`; `'uncovering'` →
  `'clear'` runs nothing.

  **Acceptance criteria:**
  - [ ] The state machine above; last request wins; exactly one run per cover.

  **Verification:**
  - [ ] `npx vitest run src/systems/worldChange.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (code); Crawford's answer to open question 4.

  **Files:** `src/stores/uiStore.ts`, `src/systems/worldChange.ts`, `src/systems/worldChange.test.ts`

  **Estimated scope:** S

- [x] **Task 13: `animation/sceneWash.ts`, `WorldView.tsx` / `.css`, the callers — the wash itself** (split at the build: 43c992a8 the module and the element, 585f2e82 the callers; then two fixes found at the checks: 36383ed2, **the fade-out starts on the frame after the change** — the rebuild ran inside the cover's completion, mid-tick, and ate all but about 75 ms of the 0.5 s fade-out — and aac3d181, **an unedited Retransmit raises no wash**; the Load handler is `SessionListItem`'s, not `SessionsPanel`'s; the colour is the water column's own two stops at the current hour, moved into `src/utils/waterColumnColors.ts`, not a new token or hex; the element has no `will-change`; mutants 10 + 9 + 4 + 3, one equivalent survivor in 13b — a family's line memory set before the cover rather than after shows nothing different; the fallback was not needed)

  **Description:** `div.world-view__wash` as a sibling of the scroller (over it, under `MetaBox`; `pointer-events:
  none`; a deep water blue token, placeholder). `sceneWash.ts` subscribes to `uiStore.sceneWash` once the element is
  registered (`setRef('world-wash')` from `WorldView`'s `useGSAP`): `'covering'` → a `'ui'` timeline `scene-wash` tweens
  opacity 0 → 1 over 0.5 s, `onComplete: setSceneWash('covered')`; `'uncovering'` → 1 → 0 over 0.5 s (both durations Crawford's, 2026-10-31; the colour is the world's own sea fill, read from the source at build),
  `onComplete: setSceneWash('clear')`; a new state kills the running tween first. Semantic callbacks only. Callers:
  `OffScreen`'s pick, Roll, theme and family handlers, `SectorSettingsDrawer`'s Retransmit and `SessionsPanel`'s Load
  wrap their synchronous bodies in `requestWorldChange(() => { … })` (the UI's own `setPick` / `setDirty` run after the
  change inside the closure, as today); `bootWorld`, the link boot and `applySessionPayload`'s own `retransmitWorld` do
  not. **Fallback if the deferral is vetoed:** no `worldChange.ts`; `retransmitWorld` bumps a `uiStore.worldChangeCount`
  and the wash snaps to opaque in the same commit and fades over 0.6 s.

  **Proof:** RED test — `src/animation/sceneWash.test.ts` (the shared GSAP stub): `'covering'` registers `scene-wash`
  as `'ui'` and its completion sets `'covered'`; `'uncovering'`'s completion sets `'clear'`; a state change mid-tween
  kills the first; no `AudioEngine` import. `OffScreen.test.tsx`: a preset pick runs `applySessionPayload` only after
  `sceneWash` reaches `'covered'` (the store driven by the test); Roll likewise. `SectorSettingsDrawer.test.tsx`:
  Retransmit goes through the request. **Look** — a Roll fades to blue, the new world fades in; the same under the
  veil while off (a blue tint through the blur); Foundry's Retransmit while powered on; reduced motion cuts.

  **Acceptance criteria:**
  - [ ] Every user-gesture world change is covered before and uncovered after; the boot paths are not.
  - [ ] No audio call from any wash callback; the wash never blocks clicks.
  - [ ] `npm run perf:idle` on the off state: no rise against Checkpoint B of the parent plan (the wash is transparent
        at rest and must not promote a layer; measure).

  **Verification:**
  - [ ] `npx vitest run src/animation/sceneWash.test.ts src/components/panels/screen/screens/OffScreen.test.tsx src/components/panels/screen/console/SectorSettingsDrawer.test.tsx src/components/panels/screen/console/SessionsPanel.test.tsx` passes.
  - [ ] The Look above, recorded in the commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 12.

  **Files:** `src/animation/sceneWash.ts`, `src/animation/sceneWash.test.ts`,
  `src/components/panels/screen/worldView/WorldView.tsx`, `src/components/panels/screen/worldView/WorldView.css`,
  `src/components/panels/screen/screens/OffScreen.tsx`, `src/components/panels/screen/console/SectorSettingsDrawer.tsx`,
  `src/components/panels/screen/console/SessionsPanel.tsx`, their `*.test.tsx`

  **Estimated scope:** L — split at the build into 13a (module + element + WorldView, RED) and 13b (the callers, RED)
  if the diff runs past five files of code.

### Checkpoint D: The wash
- [x] `npm run build:types`, `npm run lint`, `npm test` clean. (Types and lint clean; the suite had one failure that
      passes alone, recorded below. Ticked at Checkpoint: Complete, where its one re-run passed.)
- [ ] Browser: Roll, a preset pick, a theme pick, Foundry's Retransmit and a Load each fade through blue; a reload and
      a link arrival do not; reduced motion cuts; `perf:idle` off-state figure recorded. (Headless half recorded below;
      the look of the wash is Crawford's.)
- [ ] Reviewed with human before docs. (Pending, as at A, B and C.)

**Checkpoint D record (2026-10-31, `feature/off-screen` at `aac3d181`, automated half):** `npm run build:types` clean;
`npm run lint` 0 errors (the 4 pre-existing warnings). `npx vitest run` at `36383ed2`: 344 files, 13 016 tests,
13 015 passed. The one failure, `audioStore.test.ts`'s "relinks every global target with the new links" (roadmap
17.2.8), passes alone (122 of 122), and this plan changed none of the audio store, the link generator or the engine:
a one-off under load by Crawford's flake rule, with the Complete run as its one re-run. The drawer fix after that run
is covered by its own file (23 of 23).

Headless Chrome, the real app at 1600 × 900, the wash's opacity sampled every frame from the click. "Off" is the
powered-off screen; "on" is the Settings screen after the rocker.

| Gesture | Opaque at | The change, under the cover | Last visible |
| --- | --- | --- | --- |
| Roll (off) | 468 ms | the new world named at 907 ms | 1385 ms |
| A preset pick (off) | 457 ms | named at 870 ms, opacity 1 | 1341 ms |
| A theme pick, Perilous (off) | 468 ms | named at 905 ms, opacity 1 | 1371 ms |
| An Envelope pick, Plucked (off) | 471 ms | named at 743 ms, opacity 1 | 1212 ms |
| Retransmit after an X edit (on) | 468 ms | the 355 ms rebuild, from 501 ms | 1330 ms |
| A session Load (on) | 465 ms | the 267 ms rebuild, from 493 ms | 1223 ms |

Each fade-out shows 0.46 to 0.48 s after the change and ends at opacity 0. An unedited Retransmit leaves the wash at 0
(aac3d181; before it, a full wash over a no-op). Under `prefers-reduced-motion` a Roll raises no cover and the world
changes at once. A reload, and a link arrival carrying a theme and two families (readout
`n40dh8p8 · (29, -14) · Calm · Held · Woody`), leave the wash at 0 through their first 2 s. The wash's
`pointer-events` is `none`; no console errors.

`npm run perf:idle -- --stay-off`, A/B in one session: the parent plan's tip `8694c478` against `36383ed2`, two runs
each.

| Build | Run | Main busy (ms) | Redrawn screens/frame | Rastered screens/frame |
| --- | --- | --- | --- | --- |
| `8694c478`, before this plan | 1 | 5492 | 0.09 | 0.09 |
| `8694c478` | 2 | 5134 | 0.10 | 0.11 |
| `36383ed2`, the wash in | 1 | 3949 | 0.07 | 0.08 |
| `36383ed2` | 2 | 4340 | 0.10 | 0.08 |

No rise. The wash promotes no layer of its own: the layer tree's 1248 × 824 layer that the parent attributes to
`div.meta-box` is attributed to the wash, its first painter, and the layer count is unchanged. The comparison is the
parent's tip in the same session, not the parent plan's recorded Checkpoint B figure: an A/B is only fair inside one
session. Still Crawford's: the look of the wash (a tint through the blur while off, Foundry's Retransmit while on)
and the review.

---

### Phase 5: Docs

- [x] **Task 14: Spec amendments, the four system docs, the grids, roadmap 57** (929f11d5; beyond the plan's list, every other spec passage the revisions made stale carries its own dated note — assumptions 8, 10, 11 and 14–18, the capability map, §1.1 and §1.3–1.6, the file map, the §5 test lists and §7 Q11 — and two content-key names the first build had already changed are corrected; the global grid gets a sentence, since no aspect reaches it, not a table; the robot grid's three new tables are marked placeholders, not "listened-to", since Task 11 is open; then 7a99db57, six source comments the revisions made stale, comment-only)

  **Description:** `docs/specs/OFF_SCREEN.md`: assumption 21 (no as-theme member; an empty list is every robot as
  theme), assumption 23 (the aspect rows in `cabinet`), §3 ("nothing pops" → the aspect rows pop; three kinds → four if
  Task 10 added one; the retransmit sequencing if Task 13 built the deferral), §7 Q10 resolved the other way; an
  "Amended 2026-…" line at the top. `docs/COMPONENT_LIBRARY.md` (the `list` appearance, `meta`, `trailing`);
  `docs/UI_SHELL.md` (the list, Roll on Current, the family rows, the veil's new place, the wash);
  `docs/AUDIO_SYSTEM.md` (the families' keys and derive functions, `PickBand`); `docs/COMPANIES.md` (the deal per
  family, the engine push, no as-theme); `docs/ANIMATION_SYSTEM.md` (`scene-wash`, the `worldChange` seam, the
  semantic-callback rule applied); `docs/SESSION_STORAGE.md` (the link's family params); the grids' aspect tables (the
  new families' columns, the listened-to numbers); `docs/todo/roadmap.md` 57 gets a "Revised after the listen" block
  listing the eight notes and what each became; the sketch header's "what shipped differently" line is updated.
  Every name spot-checked against the tree.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every documented identifier exists in the final source with the documented behaviour; every amended spec
        paragraph names its date and this plan.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1–13.

  **Files:** the docs named above

  **Estimated scope:** M (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] Every open question below answered and its task built or struck. (All six answered; every task built but
      Task 11, the listen, which is Crawford's ear.)
- [x] Any manual check not performed is flagged here, never silently skipped. (Below.)
- [ ] Ready for Crawford's PR (one PR for the parent plan and this one, or two — his call). (Ready on the automated
      side; the checks below are his first.)

**Checkpoint: Complete record (2026-10-31, `feature/off-screen` at `7a99db57`):** `npm run build:types` clean;
`npm run lint` 0 errors (the 4 pre-existing warnings); `npx vitest run` 344 files, 13 017 tests, all passed;
`npm run build` built (the usual over-500 kB chunk warning). The suite run is also the one re-run of Checkpoint D's
single failure, the audio store's global relink case: it passed, so that was load, not code.

**Not performed, flagged for Crawford:**
- Task 11's listen: the Envelope, Distance and Voice columns are the plan's placeholders, in `aspects.ts` and the robot
  grid's three new tables.
- The Looks at Checkpoints A–D: the phone's padding and the still veil; the list on the desk and the phone; the aspect
  rows popping, and four rows scrolling the 1600 × 900 desk column by 75 px; the wash's colour and feel, off and on.
  Each checkpoint's headless half is recorded under it.
- The human reviews at Checkpoints A–D.
- Checkpoint C's Pixel `perf:audio` A/B on the densest, wettest world against `main`.
- Copy: the stand-ins for Roll, a save row's "saved …", the three families' labels, names and sentences, and the
  Melody row's `none` sentence (`home.ts`); a relative "saved 2 days ago" needs a helper of its own, if wanted.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Extracting the ADSR and send draws moves a dataId or an offset and Classic drifts | High | Task 21's value-for-value fixture and every deterministic case must pass unmodified; the extraction is mechanical, one draw at a time |
| The `PickBand` edge arithmetic differs from `Math.floor(v * 5)` at a boundary | High | Classic's edges written as `k / 5` and compared to the fixture over the 400-robot pin; if any robot moves, the draw keeps `floor` under equal weights and the weighted path is taken only for a non-Classic column |
| The deferred rebuild leaves a caller reading stale state (Keep's dirty, the pick) | Medium | The caller's follow-ups live inside the requested closure, after the change, as they run today; the OffScreen tests drive the store to `'covered'` and assert the order |
| A request while a cover is in flight double-runs or drops a change | Medium | Last request wins, exactly one run per `'covered'`; pinned in `worldChange.test.ts` |
| The wash element promotes a compositor layer at rest and raises idle paint | Low | `opacity: 0` with no `will-change`; `perf:idle` measured at Checkpoint D against the parent plan's Checkpoint B |
| Removing `'theme'` strands a saved world or link from this branch | Low | None exist off the branch; the lenient readers drop the id as unknown, so even one would load |
| Nine new aspect sentences and six labels of stand-in copy | Low | Marked in `home.ts` as the parent plan's are; Crawford's pass lands in any later commit |


## Open Questions - all answered (Crawford, 2026-10-31)

1. **Keep's seat (note 2).** Stays under the list, and its label becomes **"Save the last session"** (`home.off.keep`,
   his words). Task 4 carries the copy change.
2. **The saves' meta (note 1).** Yes - "saved ..." on each save row, as Task 4 has it.
3. **Voice (note 3) - the waveform.** "Go with your gut": the fourth band kind, `PickBand`, weighting the five
   waveforms (the recommendation). Task 10 is unblocked and builds it; spec s3's three-kinds rule is amended in Task 14.
4. **The wash (note 7).** The deferral stands (Tasks 12-13). **Both fades 0.5 s.** The colour is **an ocean colour from
   the existing world** - the sea fill the water column paints with (`WaterColumn.tsx` draws its gradient from the
   terrain palette; name the token from the source at Task 13, never a new hex).
5. **The theme row (note 5).** The *aspect* radio buttons pop; the theme row stays muted (the default), as do the
   list, Roll and Keep.
6. **Space (note 3) -> Distance.** Not a room: the family is **Distance** (`distance`), how far off a probe sounds -
   its options **Near**, **Far**, **Remote** (my words for his "distance"; Remote echoes the Reverb slider's lore word
   REMOTENESS; names are content, one line each to change). Near: both sends low and mostly unlit; Far: deep reverb,
   little delay; Remote: deep reverb and deep delay. Tasks 8, 9 and 14 read `distance` wherever they say `space`
   (Task 7 already does), and `ASPECT_FAMILY_IDS` is `['melody', 'envelope', 'distance']` (then `'voice'` at Task 10).

**For the building session:** start at Task 1; every decision above is final, so no task waits on a question. Commit
subjects `off-screen-revisions T<n>: <what>`; RED first for every behaviour task; the Looks are Crawford's and are
recorded on the commit as pending.
