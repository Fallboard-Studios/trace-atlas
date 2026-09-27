# Intent: Robot Options — Responsive Layout Rework

Confirmed via `/interview-me`, 2026-09-10. Extends the same tier-driven `'responsive'` `PanelOrientation`
and fixed-slider-orientation treatment from [audio-rig-responsive-layout.md](audio-rig-responsive-layout.md)
to Robot Options — the section of that earlier intent doc's Out of scope explicitly deferred as "a future
item." Raised directly by Crawford immediately after the Audio Rig pass shipped.

## Outcome

Every panel/slider orientation decision in `robotOptionsConfig.ts` and its 3 consumer drawers
(`AudioSettingSection.tsx`, `PingControlsDrawer.tsx`, `PingContourDrawer.tsx`) becomes either a single
fixed value (sliders) or `'responsive'` (panels) — mobile/tablet stacks one-per-row, desktop shares a row —
the same mechanism `AUDIO_RIG_RESPONSIVE_LAYOUT.md` already built and `useResponsivePanelOrientation`
already provides; no new mechanism is expected here. This cascades automatically to the company/broadcast
bulk-edit panel (`CompanyOptionsSection.tsx`) too, since it renders these exact same 4 components
(`AudioSettingSection`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`) with zero JSX
difference from the single-robot screen — nothing about this item touches `CompanyOptionsSection.tsx`
directly, the propagation is free.

`SignatureArrayDrawer.tsx` (Source) is explicitly **not** part of the orientation rework — its layer
sliders (Gain/Detune/Phase/Interval) are already fixed `'vertical'`, its per-layer panels already fixed
`'row'`, and none of that is being touched. Source's one item here is a genuine rendering bug (see below).

## User

Crawford (solo dev), continuing the same section-by-section `'auto'`-retirement — Audio Rig, now Robot
Options. No further section is known to be pending after this one as of writing.

## Success — per section

- **First panel (Volume):** a new `VOLUME_ACCORDION_SCHEMA` (humanLabel `'Volume'`, loreLabel `'Probe
  Acoustic Amplitude'`) **replaces** the existing bare, unlabeled `ROBOT_OUTPUT_PANEL_SCHEMA` wrapper
  directly — `AudioSettingSection` gains a real `AccordionContainer`, which it does not have today. No
  redundant double label (the accordion's own label is the only one; no separately-labeled inner panel).
  Inside: the Audio Setting radio, the Volume slider, and Volume's shared LFO display (Rate/Depth — already
  fixed `horizontal` from the Audio Rig pass, since `Lfo.tsx` is the same shared component; no change
  needed there). Audio Setting's `'none'` option's display label changes from `'Off'` to `'Auto'` — a copy
  change only, the stored value (`'none'`) is unchanged. Layout: on mobile and tablet, all three stack in
  one column, top to bottom (Audio Setting → Volume → LFO). On desktop, two columns side by side: left
  column = Audio Setting + Volume (stacked); right column = the LFO display. This needs no change to the
  shared `LfoTargetGroup`/`useLfoTargetGroup` contract — `AudioSettingSection` calls `useLfoTargetGroup`
  directly and hand-composes the two-column split itself, the same escape hatch `AudioRigLfoGroup`
  (`AudioRigDrawer.tsx`) already uses for its own custom composition needs, rather than teaching the shared
  `LfoTargetGroup` wrapper component a new side-by-side layout mode it has no other consumer for.
- **Melody:** `RHYTHM_PANEL_SCHEMA` (Density, Motif Length, Pitch Repeat) and `FREQUENCY_PANEL_SCHEMA`
  (Octave Min, Octave Max, Note Variance) both go from fixed `'row'` to `'responsive'` — each of their 3
  sliders gets its own row on mobile/tablet, all 3 share one row on desktop. `PHRASING_PANEL_SCHEMA` (the
  outer column wrapping `RHYTHM_PANEL_SCHEMA` + the dev-only Click Track toggle + Reset Melody) is
  unaffected — it stays fixed `'column'`.
- **Envelope:** `PING_CONTOUR_PANEL_SCHEMA`'s flat row of 4 sliders (Attack, Decay, Sustain, Release)
  splits into 2 nested `'responsive'` sub-rows — Attack+Decay, then Sustain+Release, preserving ADSR's own
  left-to-right order — each stacking to 2 separate rows on mobile/tablet and pairing into 1 row on
  desktop ("two across"). This is the same nested-pairing mechanism Audio Rig's Compressor
  (Threshold+Ratio / Attack+Release) already uses, reused here rather than inventing a new shape.
  `PING_CONTOUR_PANEL_SCHEMA` itself becomes a plain `'column'` wrapper around the 2 new sub-row panels
  (it no longer directly holds the 4 sliders).
- **Source:** the "Robot Drift" panel (`RobotDriftPanel`, rendered last in `SignatureArrayDrawer.tsx`,
  after Baseline/Coaxial/Harmonic) has a confirmed, real rendering bug — its two `SliderCenteredZero`
  controls (Rate Drift, Depth Drift) render nothing visible; only the panel's own outer box/label shows,
  empty inside. This is **not** an orientation/layout preference to design around — the schema is already
  correct (`orientation: 'horizontal'` on both sliders since the Audio Rig pass, `'column'` on the panel
  itself) and existing tests (`SignatureArrayDrawer.test.tsx`) already assert the sliders render correctly
  in jsdom. Root cause is unknown as of writing — plausibly a real-browser-only layout quirk (the same
  category of bug several `CabinetBox`/`VoxelTrack` fixes have already addressed, none of which jsdom can
  reproduce) rather than a logic bug. This is its own implementation-phase debugging task, not a design
  decision — "follow the standard LFO rules" means: once fixed, it should behave exactly like every other
  fixed-horizontal, own-row LFO slider elsewhere in the app, nothing more specific than that.
- **Slider orientation:** Density, Motif Length, Pitch Repeat, Octave Range Min, Octave Range Max, Note
  Variance, Attack, Decay, Sustain, Release — all currently `'auto'` — become fixed `horizontal`. None of
  these are "modulation target" sliders that earned a vertical exception the way EQ's Low/Mid/High or the
  Audio Rig filters' Frequency/Resonance did.

## Constraint

- `useAutoSliderOrientation`/`useAutoPanelOrientation` are not removed or deprecated by this item, same as
  the Audio Rig item's own constraint — this may be the section that finally makes both hooks fully
  unused across the app, but that's a fact to notice after this ships, not a goal to engineer toward here.
  Don't go looking for a reason to delete them as part of this work.
- Signature Array's own per-layer sliders/panels are untouched (already fixed `'vertical'`/`'row'`,
  confirmed correct, not part of this item).
- No change to `CompanyOptionsSection.tsx`'s own JSX — the propagation to company/broadcast mode is a
  consequence of shared components, not something this item implements directly.

## Out of scope

- Root-causing and fixing the Robot Drift rendering bug is included in this item's Success criteria above,
  but the *mechanism* of the fix (CSS, a measurement-timing fix, something else entirely) is not resolved
  here — that's implementation-phase debugging work, following `debugging-and-error-recovery`'s
  reproduce-first discipline rather than guessed at during intent-gathering.
- Any change to `LfoTargetGroup`/`useLfoTargetGroup`'s own shared contract — `AudioSettingSection`'s
  two-column need is met by calling the hook directly, not by extending the shared wrapper component.
- Any visual/Cabinetry (facade, glow, pop) changes — pure orientation/layout, matching the Audio Rig item's
  own scope boundary.

## Forward Note

If this is genuinely the last section still using `'auto'` anywhere in the app, that's worth confirming
directly (grep for `orientation: 'auto'` across `src/data/`) once this ships — at that point, retiring
`useAutoSliderOrientation`/`useAutoPanelOrientation` entirely becomes a fair question to raise with
Crawford, not something to decide unilaterally here or there.
