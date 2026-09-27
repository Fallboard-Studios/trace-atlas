# Intent: Wire `DirectionalPanel` into the Audio Rig and Robot Effects Drawers

Confirmed via `interview-me` on 2026-09-04. This is the deferred wiring pass `docs/intent/directional-panel.md`'s "Out of scope" section pointed at: `DirectionalPanel` shipped with zero real consumers; this pass gives it its first two, reorganizing both the global Audio Rig drawer and the per-robot audio drawers from today's flat accordion lists into a new nested accordion → panel structure.

## Outcome

Two drawer areas, restructured in one combined pass (confirmed: not split by side — "it's all the same work"):

### Audio Rig (`AudioRigDrawer.tsx` / `audioRigConfig.ts`)

4 `AccordionContainer`s, in this order, each wrapping one or more `DirectionalPanel`s:

1. **Transport & Composition**
   - *Speed & Automation* (`column`) — Automatic Effects (`PING_VARIANCE_AUTOMATION_SCHEMA`) + Tempo (`BPM_SCHEMA`), today's two bare `audio-rig-drawer__master-row` sliders at the bottom of the drawer. New panel, new label — no prior accordion to inherit copy from.
   - *Robot Drift* (`column`) — today's standalone `LFO_DRIFT_GROUPS` `'robots'` entry, currently its own trailing `AccordionContainer`. Keeps its existing label/lore (`driftGroupSchema('robots', 'AGENT FLUX', 'Robot Drift')`).
2. **EQ & Filters**
   - *3-Band EQ* (`row`) — today's `eq3` block: Low/Mid/High sliders (`orientation: 'vertical'`) + their shared `AudioRigLfoGroup` LFO display + `eq3`'s own Rate/Depth Drift sliders (`LFO_DRIFT_GROUPS` `'eq3'`, "EQ Drift"). All of it travels together — it's all "content of the old `3-Band EQ` accordion."
   - *Low-Pass Filter* (`column`) — today's `filterLPF` block, same shape (Frequency/Resonance + shared LFO display + `'filterLPF'` drift, "Low-Pass Drift").
   - *High-Pass Filter* (`column`) — today's `filterHPF` block, same shape ("High-Pass Drift").
3. **Time & Space**
   - *Delay* (`column`) — today's `delay` block (Time/Feedback/Mix).
   - *Reverb* (`column`) — today's `reverb` block (Decay/Pre-Delay/Mix).
4. **Output**
   - *Compressor* (`column`) — today's `compressor` block (Threshold/Ratio/Attack/Release/Knee) **plus** the Decay Mode radio (`DECAY_MODE_SCHEMA`), which is rendered as a special-cased extra row after `compressor`'s params today and travels with it.
   - *Limiter* (`column`) — today's `limiter` block (Threshold).

Every panel/accordion that inherits from an existing `AccordionSchema` keeps that schema's `loreLabel`/`humanLabel` verbatim — no copy changes to moved content. The 4 new accordions and the 1 new panel (*Speed & Automation*) get invented `loreLabel`s in the existing house style (terse, technical/clinical, all-caps, e.g. "SPECTRAL FREQUENCY EQUALIZER") — confirmed low-stakes, draft-and-eyeball rather than dictated up front, same precedent `LFO_DRIFT_GROUPS`' own "first-pass copy... confirm during manual check" comment already sets.

### Robot Effects (identical restructuring at both call sites: `RobotOptionsTab.tsx` — robot detail page — and `CompanyOptionsSection.tsx` — robot list page, beneath `CompanyManager`'s `CompanyButtonRow`)

One panel above the accordions, then 3 `AccordionContainer`s, in this order:

- **Output** (`DirectionalPanel`, not inside an `AccordionContainer` — sits above the first accordion) — Audio Setting + Volume (+ its shared LFO display), today rendered by `AudioSettingSection` *inside* `RobotDisplaySection`, mixed in with the avatar/Name/Job/Battery/Docking rows and the company picker. **`AudioSettingSection` gets extracted out of `RobotDisplaySection`** (which is trimmed down to just the read-only meta rows + company picker) and re-parented as its own sibling in `RobotOptionsTab`/`CompanyOptionsSection`, immediately before the Melody accordion. `AudioSettingSection`'s own internals are unchanged — just wrapped in a `DirectionalPanel` and moved.
- **Melody**
  - *Phrasing* (`column`) — Density, Motif Length, Pitch Repeat, **plus** Click Track (dev-only toggle) and Reset Melody (button) — today all part of the `PingControlsDrawer`'s single "Ping Controls" accordion; these two aren't in the reference table but stay with the density/motif-length group they're adjacent to today, since Frequency's fields have no relation to them.
  - *Frequency* (`column`) — Octave Min, Octave Max, Note Variance.
- **Envelope**
  - *Ping Contour* (`column`) — today's whole `PingContourDrawer` accordion content (Attack/Decay/Sustain/Release). Keeps the old accordion's label (`PING_CONTOUR_ACCORDION_SCHEMA`) as the panel's label, nested inside the new **Envelope** accordion.
- **Source**
  - *Baseline*, *Coaxial*, *Harmonic* (each `column`) — today's 3 `SIGNATURE_ARRAY_CONFIG` layer blocks, currently siblings inside one "Signature Array" accordion. Each becomes its own panel: Type + Gain + Detune + Phase + Interval (pulseWidth, conditional on Type === 'pulse' — not in the reference table since it's conditional, but travels with the rest of its layer) + that layer's shared `LfoTargetGroup` display.

## User

The developer (Crawford), continuing the `DirectionalPanel` work — this is the wiring pass `docs/intent/directional-panel.md` explicitly deferred pending "the fuller list of where `DirectionalPanel` should apply across the app."

## Why now

`DirectionalPanel` shipped (docs/specs/DIRECTIONAL_PANEL.md, docs/tasks/DIRECTIONAL_PANEL.md) with zero real consumers by design, following the same "component first, consumers later" sequencing `useAutoSliderOrientation` used for `docs/specs/VERTICAL_SLIDERS.md`. Crawford now has the full target list for both the Audio Rig and Robot Effects sides, so this pass wires it in.

## Success

- Every control from every listed old accordion/section is reachable in its new panel/accordion location, with no behavior, handler, or store-wiring change — purely a layout/grouping restructure.
- EQ's Low/Mid/High render side-by-side (`row`); every other panel stacks (`column`), per the confirmed orientation rule below.
- Robot Effects' Output panel sits above Melody/Envelope/Source, not inside an accordion, at both call sites (`RobotOptionsTab`, `CompanyOptionsSection`).
- `AudioSettingSection` is fully extracted from `RobotDisplaySection` into its own top-level Output panel at each call site; `RobotDisplaySection` keeps only the read-only meta rows + company picker.
- `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.

## Constraint

- One combined pass across both the Audio Rig and Robot Effects sides — confirmed explicitly ("let's keep them together, it's all the same work"), not split into two separate features.
- Reuse existing sub-components (`AudioSettingSection`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`, `AudioRigLfoGroup`, `LfoTargetGroup`) and their existing internal logic/handlers/props untouched wherever possible — this is a regrouping of *where* content renders, not a rewrite of *what* each control does or how state flows to/from `robotOptionsActions.ts`/`audioStore.ts`.
- No renaming of any existing control's label/copy. No changes to any slider's min/max/step/unit/behavior.
- `DirectionalPanel` itself stays exactly as shipped (per `docs/specs/DIRECTIONAL_PANEL.md` §3) — no `wrap` prop, no gap/align prop, no API change to accommodate this wiring pass. If a `row` panel turns out to overflow in practice, the fix is nesting or reconsidering that panel's orientation, not modifying the primitive.
- CLAUDE.md's audio/animation rules are not implicated — no `AudioEngine`/`BeatClock`/GSAP/`Tone` change, no new Zustand field. Pure presentational regrouping.

## Design discussion (2026-09-04, via `/interview-me`)

- **Orientation rule:** "Infer direction from the sliders — vertical → row, horizontal → column." Checked against `useAutoSliderOrientation`: most sliders in scope use `orientation: 'auto'` (resolved at runtime by measuring the parent's box — no fixed schema value), and every one of them currently sits alone in a full-width, short `param-row` `<div>`, so every `'auto'` slider renders horizontal today. Only 3-Band EQ's sliders are schema-fixed `'vertical'`; only Automatic Effects/Tempo/Volume are schema-fixed `'horizontal'`. Applying the rule against the *actual* schema + current-DOM-shape data (not a per-panel judgment call) resolves to: **EQ is the only `row` panel; every other panel is `column`.** This also sidesteps a real risk `docs/specs/DIRECTIONAL_PANEL.md` §7 already flagged: wrapping an `'auto'` slider in a `row` panel narrows its measured parent and could flip its resolved orientation via the `ResizeObserver` — going all-`column` for every `'auto'` slider avoids that feedback risk entirely for this pass. Confirmed provisional — Crawford may adjust individual panels' orientation after seeing them rendered.
- **Orphaned controls** (not named in the original table, since the table only lists sliders/major fields): Decay Mode radio → stays with Compressor's sliders, moves into the Output accordion's Compressor panel. Click Track toggle + Reset Melody button → stay with Density/Motif Length/Pitch Repeat, land in the Phrasing panel (not Frequency — no relation to Octave/Note Variance). Interval (pulseWidth) → stays with its layer's other 3 fields in each Baseline/Coaxial/Harmonic panel, despite being conditional and not listed in the reference table.
- **Output extraction:** Confirmed that "beneath the robot meta data section" / "above the first accordion" means Audio Setting + Volume must be pulled *out* of `RobotDisplaySection` (today mixed into the avatar/meta-row card) into their own top-level panel, not just left wherever they currently render inside that card.
- **Label copy:** New accordion/panel labels are invented in-house style by Claude, confirmed low-stakes ("sure"), not dictated line-by-line.
- **"Output" name collision:** The Audio Rig side's *Output* is an `AccordionContainer` (Compressor + Limiter). The Robot Effects side's *Output* is a bare `DirectionalPanel`, not in an accordion (Audio Setting + Volume). Same label, different UI shape, different files — not actually a conflict, just worth flagging so it isn't "corrected" into consistency during implementation.

## Out of scope (this round)

- Renaming any existing control's label/copy, or changing any slider's min/max/step/unit/behavior.
- Any `AudioEngine`/`BeatClock`/Zustand-shape change — this is presentation-only.
- Changes to `DirectionalPanel`'s own API (no `wrap`/`gap`/`align` prop) — confirmed out of scope in `docs/specs/DIRECTIONAL_PANEL.md` §3 and not revisited here.
- Re-litigating orientation choices beyond the rule agreed above, though individual panels may be adjusted once rendered (flagged as provisional, not blocking).

## Downstream

Hand this confirmed intent to `spec-driven-development` to produce the written spec, then `planning-and-task-breakdown` for the task list — one combined spec/task pass covering both the Audio Rig and Robot Effects sides (confirmed: not split), following the same process `docs/specs/DIRECTIONAL_PANEL.md`/`docs/tasks/DIRECTIONAL_PANEL.md` used for the sibling feature.
