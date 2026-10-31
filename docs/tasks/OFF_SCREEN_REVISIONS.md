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

- [ ] **Task 1: `OffScreen.css` — the phone's top padding clears the power corner**

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

- [ ] **Task 2: `OffScreen.tsx` / `.css` — the veil stays put while the phone's column scrolls**

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
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Phone: the label clears the power corner; the veil stays while the column scrolls. Desktop unchanged.
- [ ] Reviewed with human before Phase 2.

---

### Phase 2: The list (notes 1, 2)

- [ ] **Task 3: `RadioButton.tsx` / `.css` / `controls.ts` — the `list` appearance and the trailing slot**

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

- [ ] **Task 4: `OffScreen.tsx` — the Transmission list; Roll in the Current row**

  **Description:** The Transmission schema becomes `appearance: 'list'`; each save option carries `meta` from its
  `savedAt` (a relative "saved …" through a content template, `home.off.savedAgo`, with the date-formatting helper the
  Sessions panel already uses — reuse it, don't write one); the Current row's trailing slot renders the Roll `Button`
  (`face="single"`, `muted`, `accessibleName` "Roll" so a screen reader hears it apart from the row). The
  `.off-screen__actions` row keeps Keep alone (see the question below). Everything else — the pick handlers, Keep's dim,
  the warning, the readout — is unchanged.

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

- [ ] **Task 5: `OffScreen.css` / `RadioButton.css` — the list's look on the desk and the phone**

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
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Browser, desk and phone: the Transmission list; Roll on the Current row rolls and leaves the pick on Current; a
      save pick, a preset pick and Keep behave as before.
- [ ] Reviewed with human before Phase 3 — and the two list questions below answered.

---

### Phase 3: Aspects (notes 4, 3, 5)

- [ ] **Task 6: `aspects.ts` and its readers — the `'theme'` pick goes**

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

- [ ] **Task 7: `aspects.ts`, `bandKeys.ts` — the Envelope and Space families: keys and placeholder columns**

  **Description:** `ASPECT_FAMILY_IDS` becomes `['melody', 'envelope', 'space']`; `ASPECT_IDS` is per family now
  (`ASPECT_IDS_BY_FAMILY`, with `AspectId` the union: `hypnotic | mechanical | wandering | plucked | swelling | held |
  dry | hall | cavern`); `ENVELOPE_BAND_KEYS` (`robot.attack`, `robot.decay`, `robot.sustain`, `robot.release`,
  `robot.shapedAttack`, `robot.shapedRelease`) and `SPACE_BAND_KEYS` (`reverbSend`, `delaySend`); `ASPECT_FAMILIES`
  gains the two entries with placeholder columns on the Architecture Decisions' sketch (every number for Task 11's
  listen); the foreign-key type still fails to compile for a column outside its family. `resolveBands` needs no change.
  Content: `home.off.envelope`, `home.off.space` (labels), `home.off.envelope.<id>`, `home.off.space.<id>` (names),
  `home.off.envelopeDescription.<id|none>`, `home.off.spaceDescription.<id|none>` (sentences) — stand-ins.

  **Proof:** RED test — `resolveBands.test.ts`: each Envelope and Space option differs from Classic on a subset of its
  family's keys and nowhere else; Plucked's attack max ≤ 0.05 and sustain max ≤ 0.3, Cavern's reverb min ≥ 0.6 (intent
  checks, so a wrong-way edit fails); every band inside its field's range; a `// @ts-expect-error` column naming
  `bpm` in Space. `loadingStore.test.ts`: `canonicalAspects` keeps three families.

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

- [ ] **Task 8: `spawnSystem.ts` — `deriveEnvelopeFields`, `deriveSendFields`; the deal pass per family; the engine push**

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

- [ ] **Task 9: `OffScreen.tsx` / `.css` — the family rows, generic, in the cabinet appearance**

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

- [ ] **Task 10: Voice — `PickBand`, the waveform draws, the family** *(waits on the open question)*

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

- [ ] **Task 11: The listen — the new families' numbers**

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
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Browser: four (or five) aspect rows popping on hover and select; a Plucked pick audibly shortens a company's
      notes; a Cavern pick sinks one into the rooms; the company detail's "Loaded Under" line names every dealt
      family; a save made under two families reloads with the rows set; its link carries
      `melody=…&envelope=…&space=…`; no "as theme" anywhere.
- [ ] `npm run perf:audio` Pixel A/B on a Perilous + Plucked + Cavern world against `main` (the densest, wettest case).
- [ ] Reviewed with human before Phase 4.

---

### Phase 4: The wash (note 7) *(waits on the open question)*

- [ ] **Task 12: `uiStore.ts`, `systems/worldChange.ts` — the request and its four states**

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

- [ ] **Task 13: `animation/sceneWash.ts`, `WorldView.tsx` / `.css`, the callers — the wash itself**

  **Description:** `div.world-view__wash` as a sibling of the scroller (over it, under `MetaBox`; `pointer-events:
  none`; a deep water blue token, placeholder). `sceneWash.ts` subscribes to `uiStore.sceneWash` once the element is
  registered (`setRef('world-wash')` from `WorldView`'s `useGSAP`): `'covering'` → a `'ui'` timeline `scene-wash` tweens
  opacity 0 → 1 over 0.3 s, `onComplete: setSceneWash('covered')`; `'uncovering'` → 1 → 0 over 0.6 s,
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
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Browser: Roll, a preset pick, a theme pick, Foundry's Retransmit and a Load each fade through blue; a reload and
      a link arrival do not; reduced motion cuts; `perf:idle` off-state figure recorded.
- [ ] Reviewed with human before docs.

---

### Phase 5: Docs

- [ ] **Task 14: Spec amendments, the four system docs, the grids, roadmap 57**

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
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every open question below answered and its task built or struck.
- [ ] Any manual check not performed is flagged here, never silently skipped.
- [ ] Ready for Crawford's PR (one PR for the parent plan and this one, or two — his call).

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

## Open Questions

1. **Keep's seat (note 2).** Roll goes on the Current row. Does Keep join it there, or stay as the one muted button
   under the list? Default if unanswered: it stays under the list (least change).
2. **The saves' meta (note 1).** The wireframe shows "saved 2 days ago" on each save row. Include it (Task 4 as
   written), or names only? Default: include.
3. **Voice (note 3) — the waveform.** Recommended: a fourth band kind, `PickBand`, weighting the five waveforms, so
   Glassy / Woody / Hollow can lean sine / triangle / square; Classic parity is held by construction. Fallback: Voice
   over the filter and layer bands only, which makes the three options faint. Spec §3 makes a fourth kind ask-first;
   this is the ask. Task 10 waits on it.
4. **The wash (note 7) — defer the rebuild?** Recommended: the request seam (Tasks 12–13), so the world fades to
   blue, rebuilds under the cover and fades back — a change to how a user-gesture retransmit is sequenced (spec §3
   ask-first). Fallback: an instant cover that fades out (no deferral, no new seam; the cut is hidden, not smoothed).
   Also: the colour — a deep water blue is the placeholder — and the two durations (0.3 s in, 0.6 s out).
5. **The theme row (note 5).** The note says the *aspect* cabinetry pops. Does the theme row pop too, or stay
   muted beside the list? Default: stays muted.
6. **Space and the room (note 3).** Cavern deepens each robot's sends but cannot lengthen the room (a global band, the
   theme's). Fine as a robot-side family, or should Space be struck until a room-size theme key exists? Default: build
   it as robot-side and say so in its sentence.
