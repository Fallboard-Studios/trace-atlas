# Layout Updates — Instructions

Plain-language instructions only, grouped by section, matching the outline order. No code — this is a checklist to work from later. File/component names below reflect the current state of the repo as of 2026-09-25 (including your uncommitted nav-label renames), so they should still be the right place to look when you sit down to do each one.

---

## Settings section

Top-level content component: `src/components/panels/screen/nav/content/SettingsContent.tsx`.

- Internal colors are wrong — walk the whole section and fix wherever a trait color is missing, wrong, or defaulting when it shouldn't (check every `getTraitColorStyle`/similar call in `SettingsContent.tsx` and the two drawers it renders, `AudioLoadPanel.tsx` and `SectorSettingsDrawer.tsx`).
- Add a section-level intro block at the top of `SettingsContent.tsx` (lore title + lore blurb + human blurb), same pattern as the Fleet Params section's own intro panel.
- Wrap the whole section in one outer panel, same pattern as Fleet Params' outer wrapper.
- The section currently has 2 accordions already, in the right order: the one labeled "Audio Profile" (was "Performance") and the one labeled "Audio Seeds" (was "Presets"). Both labels are already correct in the nav tree (`navTreeConfig.ts`) — `SettingsContent.tsx` itself still needs updating to match and to add its own intro-panel treatment per accordion (same pattern as Fleet Params' group accordions: one accordion → one group intro panel → its leaves).

### Audio Profiles accordion (was "Performance")

- Add a group-level intro block (lore title + blurbs) inside this accordion, same pattern as above.
- Reconfigure the panel layout so it reads as 2 rows:
  - Row 1: the Audio Profiles preset control, paired with a "Current Settings" description next to it. There is currently no "Current Settings" description anywhere in the app — this needs to be built new. It should describe, in words, what the current Robot Load / Effects Load values actually mean/do (i.e. a live readout of the current preset state, not just the raw numbers).
  - Row 2: Robot Load and Effects Load side by side (these already exist as 2 sliders inside `AudioLoadPanel.tsx` — just reposition them into this row).

### Audio Seeds accordion (was "Presets")

- Add a group-level intro block, same pattern.
- Layout: Attenuation Style on its own row, Coordinates on its own row, Retransmit on its own row below both.
- The Retransmit button currently lives inside `SectorSettingsDrawer.tsx` alongside Attenuation Style/Coordinates already — it just needs to be moved to sit below them as its own row rather than wherever it currently sits in that file's layout.

---

## Probes section

Top-level nav branch: "Probes" (`navTreeConfig.ts`), content rendered by whatever content component currently backs it (check `src/components/panels/screen/nav/content/` for the probes-branch content component — it wasn't part of this round's research, confirm the filename before editing).

- Add a section-level intro block (lore title + blurbs) at the top.
- The probe cards (`src/components/selection/RobotSelectionCard.tsx`) need a visual restyle:
  - Colors are wrong internally — check every trait/identity color call in this component (`getRobotColorStyle`, etc.) the same way you'll check Settings.
  - Button text on the cards isn't visible — find the buttons inside `RobotSelectionCard.tsx` and fix whatever color/contrast issue is hiding their label text (likely a text color matching the background, or a missing color override).

### All Probes

- Add a group-level intro block.
- The 4 groups below (Levels, Composition, Envelope, Source) should follow the same "one accordion → one group intro panel → plain leaf sections, no leaf gets its own accordion" pattern you just built for Fleet Params — apply that same structural pattern here.

#### Levels accordion (was "Output")

- This was the group previously labeled "Output" — the nav tree already renames it to "Levels" (`navTreeConfig.ts`'s `SECTION_CHILDREN`), but the accordion's own parent-accordion title inside the actual content component still needs to be fixed to match (find wherever "Output" is still hardcoded as this accordion's own title, separate from the nav tree, and rename it to "Levels").
- Reconfigure the panel layout:
  - Row 1: Monitor Mode (this is `AudioSettingSection.tsx`'s radio control — already renamed from "Audio Setting" to "Monitor Mode" in the data config, `robotOptionsConfig.ts`; the UI copy should already say "Monitor Mode" as a result).
  - Row 2: Volume, together with its LFO control, on the same row/panel as each other.
- Note this accordion is currently labeled "Dynamics" inside `RobotOptionsTab.tsx` (and duplicated identically in `CompanyOptionsSection.tsx` for the company bulk-edit version) — that's the specific hardcoded title to change to "Levels" in both places.

#### Composition accordion

- Currently this is 2 separate accordions — "Rhythm" (Density, Motif Length, Pitch Repeat, a Click Track toggle, Reset Melody) and "Pitches" (Octave Min, Octave Max, Note Variance) — both inside `PingControlsDrawer.tsx`, duplicated in `CompanyOptionsSection.tsx`.
- Add one new parent accordion labeled "Composition" wrapping both of today's groups.
- Remove the Click Track toggle/button entirely (it's in `PingControlsRhythmSection`, backed by `CLICK_TRACK_SCHEMA` in `robotOptionsConfig.ts`, and an engine module `src/engine/clickTrack.ts` — removing the button is the UI-facing part of this; whether to also remove the underlying engine wiring is your call).
- Take Rhythm and Pitches out of being their own individually-collapsible accordions — their contents become plain sections inside the one new Composition accordion, same "no leaf gets its own accordion" pattern.
- Reconfigure the layout into 3 rows, 2 fields each:
  - Row 1: Density, Motif Length
  - Row 2: Pitch Repeat, Note Variance
  - Row 3: Octave Min, Octave Max
- Reset Melody isn't mentioned in your outline — decide where it lands (it currently lives in the Rhythm group) and note that decision so it doesn't get lost in the reshuffle.
- Do this in both places this structure is duplicated: `RobotOptionsTab.tsx` (per-robot) and `CompanyOptionsSection.tsx` (company bulk-edit).

#### Envelope accordion

- Currently labeled "Contour" (backed by `PingContourDrawer.tsx`) — rename the accordion title to "Envelope".
- Layout: Attack/Decay on one row, Sustain/Release on the row below.
- Same rename + layout change in both `RobotOptionsTab.tsx` and `CompanyOptionsSection.tsx`.

#### Source accordion

- Currently this is one accordion per oscillator layer (Baseline/Coaxial/Harmonic Oscillator) plus a separate "Probe Drift" accordion, all flat/siblings — in `SignatureArrayDrawer.tsx`, duplicated in `CompanyOptionsSection.tsx`.
- Add one new parent accordion labeled "Source" wrapping all 4.
- Reconfigure the layout so the 3 oscillator accordions and the Drift accordion stack in order underneath the new Source parent (Baseline, Coaxial, Harmonic, then Drift).
- The individual Oscillator accordions and the Drift accordion are fine as they already are internally — this task is only about adding the wrapping parent accordion and putting them in the right stacking order underneath it, not changing what's inside each one.
- Same change in both `RobotOptionsTab.tsx` and `CompanyOptionsSection.tsx`.

---

## Individual Probes (single-robot detail view)

- Layout order top to bottom: Top Card, Company Selection, then the same 4 accordions as All Probes (Levels, Composition, Envelope, Source) using the same restructuring described above.
- Top Card (`RobotDisplaySection.tsx`) still needs a visual restyle — this was already flagged as outstanding, not newly discovered here.
- Company Selection is currently the radio control embedded at the bottom of the Top Card itself (`RobotDisplaySection.tsx`), not a separate component — confirm whether you want it pulled out into its own visually distinct block, or if "Top Card" and "Company Selection" in your outline are just naming the existing top-card layout's own 2 halves (card body, then the company radio row at the bottom). This is a naming/scope question worth settling before touching the code.

---

## Companies section

- Add a section-level intro block.
- Layout order: Create Company, Company Selection, Selected Company Update, Selected Company Delete.
- Create Company and the Update/Delete controls already exist in `CompanyCrudControls.tsx`. Company selection currently happens through the nav tree itself, not a dedicated in-content component — decide whether you want a real in-content "Company Selection" block built to match this outline, or whether the nav tree's own selection is what this row refers to (same kind of scope question as the Individual Probes Company Selection row above).

## Individual Companies

- Layout order: Selected Company Update, Selected Company Delete, then the same 4 accordions as All Probes (Levels, Composition, Envelope, Source) — this is the company bulk-edit view, backed by `CompanyOptionsSection.tsx`, and should get the identical restructuring described under "All Probes" above (Levels/Composition/Envelope/Source), since that file already duplicates the same accordion structure as `RobotOptionsTab.tsx` today.
