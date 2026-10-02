# Intent: Free | Sync Toggle (beat-synced Delay Time and LFO Rate)

Confirmed via `interview-me` on 2026-09-30 (six questions from a desktop-drafted brief), ahead of a `spec-driven-development` pass. Branch `feature/free-sync-toggle`, off `main` at the Content Layer merge (PR #518).

## Re-scope after the LFO Bank (2026-10-02) — supersedes the sections below where they conflict

The LFO Bank (PR #521) replaced per-target LFO rate with four shared, world-level lanes (`lfoBank.a`–`d`, `BankLfoSettings`); a modulated field now stores only `{ lane, depth }`. Work continues on branch `feature/sync-toggle` (off `main` at `07da4a73`). Crawford's decisions, 2026-10-02:

- **Five toggles total: one per LFO Bank lane (4) plus Delay Time.** Not per target, not per robot, not per company. The toggle sits on the lane's Rate slider in `LfoBankLanePanel`. Company broadcast, robot seeding and the per-target `Lfo.tsx` surface are all out of scope — there is nothing per-target left to sync.
- **BPM becomes Attenuation-Style-seeded (structural change, part of this phase).** Attenuation Style is timbre, and tempo belongs with timbre more than with the notes a locale picks. BPM seeds from the Attenuation Style's noise map (same `[40, 100]` integer band), reseeds on every Attenuation Style change alongside `globalAudio`/`lfoBank`/`globalLfoLinks`, and **no longer reseeds on a coordinates-only retransmit**. This inverts `docs/specs/archive/BPM_CONTROL.md` §1.3's rule. Consequence: the seed tempo for the lane and Delay Sync draws is the Attenuation Style's own BPM, deterministic from the Attenuation Style alone — no locale lookup, no threading.
- **Seeded Sync odds per lane:** a 75%, b 66%, c 33%, d 25% (slow lanes lean synced). Delay 66%.
- **Seeded Sync draw band:** a synced lane draws from the note values whose rate at the seed BPM falls inside **its own lane's rate band** (`LFO_BANK_RATE_BANDS`). If that is empty, it draws from the next faster lane's band; if there is no faster lane (or that is empty too), the next slower one. At today's 40–100 BPM seed range every band is non-empty, so the fallback is insurance against a future retune, not a live path.
- **The Sync slider's own range is the full LFO list (0–20 Hz),** same as the Free slider; only the seed draw is band-restricted.
- **No Off step.** Crawford wanted it only if more performant and clutter-free; it is perf-neutral (a lane at 0 Hz is still a running `Tone.LFO`, same cost as its slowest note), so it's dropped. The Sync list is note values only for lanes and Delay alike; Free → Sync from 0 Hz snaps to the slowest allowed note. Holding a lane still stays a Free-mode thing (rate 0).
- **Wording (old spec §7 items 1–3):** "Tempo Sync" / "Anchoring" confirmed; word readouts ("1/8 dotted", "1/4 triplet", "1 bar", "2 bars") confirmed over symbols; 2 and 4 bars stay straight-only.

## Outcome

The global Delay Time slider (`audioRigConfig.ts`, `delay.delayTime`) and every LFO Rate slider (`Lfo.tsx`) gain a small Free | Sync toggle beside the label. LFO settings live in three places in state, and the toggle reaches all of them: the 7 global-chain targets in `audioStore.globalLfo` (shown as 3 panels: EQ, LPF, HPF), the 13 per-robot targets in `Robot.lfoSettings` (4 panels: Volume + 3 oscillator layers), and the partial company-level override in `CompanyOptionsSnapshot.lfoSettings`. Free is today's behaviour: an absolute seconds or Hz value that stays fixed when the tempo changes. Sync locks the value to a note division of the current tempo and follows tempo changes. Seeded worlds land on Free or Sync 50/50 per toggle. Lore labels: Free = **Float**, Sync = **Anchored**.

## Behavior

- **The toggle is per stored target, not per panel.** Each `LfoSettings` entry (e.g. `eq3.mid`, `layer1.detune`) carries its own Free/Sync choice alongside its own shape, rate and depth; the panel's target swap shows whichever target is selected, exactly as it does for rate today. EQ Mid can be Anchored while EQ High is Float. The seeder rolls once per stored target, so 7 rolls for the global chain and 13 per robot.
- **Same slider, different stops.** In Sync mode the existing slider is kept (same track, same place) but only accepts the allowed note values, and its readout shows the note name ("1/8 dotted") instead of seconds or Hz. No second control for the modifier: straight, dotted and triplet variants are all entries in one list sorted by actual duration. The LFO's list runs slowest to fastest to match the Hz direction and has an explicit **Off** step at the slow end, because 0 Hz has no note-value equivalent. Delay's list runs shortest to longest to match seconds.
- **Note-value range** is roughly 1/32 through 4 bars with straight, dotted and triplet modifiers. The longest values (multi-bar) apply to the LFO only.
- **Stored as division + modifier, never as derived seconds/Hz.** Seconds and Hz are derived from `audioStore.bpm` at read time by a pure conversion function. A tempo change therefore moves every synced value and leaves every Free value alone. State stays JSON-serialisable.
- **Conversion is ours, not Tone's.** `audioStore.bpm` already flows one way to `AudioEngine.setBPM` to `Transport.bpm.value`, and `beatClock.ts` only reads Transport position, so the two are already in sync and no new linkage is needed. Tone's `"8n."`-style time strings are **not** used: seeding, the Delay cap check and the readout all need the conversion without a running Transport, and the data layer must not depend on Tone.
- **Delay cap.** Sync mode hides (or clamps to) the note values whose duration at the current tempo exceeds the Delay node's real `maxDelay`, which is **10 s** (`globalFx.ts`), matching the slider's 0–10 s range. The brief's "1 s" came from the stale `GLOBAL_CHAIN_GRID.md` row and is not a design decision. If a tempo change pushes the stored division past the cap, the effective value clamps to the longest allowed one.
- **Free → Sync snaps to the nearest allowed value** at the current tempo (0.3 s at 60 BPM becomes 1/4 triplet; a 0 Hz LFO becomes Off; a Delay whose nearest value exceeds the cap takes the longest allowed). **Sync → Free keeps the equivalent seconds/Hz** so nothing audibly jumps.
- **Seeding.** Wherever a Delay Time or LFO is seeded (`generateGlobalAudioSettings` / `globalAudioLoadingRanges.ts` for the global chain, robot generation for robot LFOs, company generation for company overrides), each toggle rolls Free or Sync 50/50, deterministically from the seed. Free draws from the existing loading range exactly as today. Sync draws uniformly from the note values whose duration at the seeded tempo falls **inside the same loading range** (Delay 0.05–0.5 s, LFO 0–20 Hz, so Off is drawable), never from the whole list. The seeder is a pure function with no Tone dependency.
- **Company broadcast** carries the toggle and the note value the same way it carries shape/rate/depth today (broadcast-not-link semantics, `docs/COMPANIES.md`).
- **Backward compatibility.** Sessions and share links saved before this feature load with every toggle on Free and their existing seconds/Hz values, so they sound identical. The share-link wire format (`sessionShareUtils.ts`) learns the new fields; absence means Free.
- **LFO Drift still applies to synced LFOs** for now (it modulates rate by a percentage, which pushes a synced LFO slightly off the grid). This is a single, obvious switch in the drift wiring so it can be flipped to "drift skips synced LFOs" without a refactor.
- **Unchanged:** every existing lore/human label, the Hz and seconds ranges in Free mode, the LFO shape and depth controls, the `MAX_POLYPHONY` and Audio Load Budget paths, and all guardrails in `CLAUDE.md`.

## Style / constraint

- Reuses the existing `Toggle` primitive (CabinetBox styling, `docs/COMPONENT_LIBRARY.md`) and the existing slider; no new control primitive beyond a stepped-value mode on the slider if the current `sliderLinear` cannot express it.
- All new text (Float / Anchored, "Off", the note-value readouts, the toggle's human labels) lives in `src/content/` and is read through `labels()`/`options()`; the content guard (ESLint rule + `content.test.ts`) must stay green.
- Follows the "off via parameter" precedent: Off is a value on the Sync list, not a separate enable flag (same spirit as the LFO Active-toggle removal, rate 0 = off).
- Follows the per-concept seeding precedent in `globalAudioSeed.ts` / `globalAudioLoadingRanges.ts`: one seeded draw per toggle, no shared coin.

## Out of scope

- Probe envelope times (Attack / Decay / Release). A possible later follow-up reusing the same note-value picker; not in this pass.
- Reverb Length, Reverb Pre-Delay, Compressor Attack / Release, Drift amounts, Sustain Level, Phrase Length (already in 16ths).
- Any lore or human label change on existing controls.
- Linking Tone's Transport to anything new, or a second BPM source. The single source stays `audioStore.bpm`.
- Removing drift from synced LFOs. Considered; deferred behind the switch above.
- Restoring the stale 1 s Delay cap or editing `GLOBAL_CHAIN_GRID.md`'s delay row beyond a correction note.

## Known implementation note (not yet spec'd)

- **Data shape** is the first spec decision: whether `LfoSettings`/`DelaySettings` keep `rate`/`delayTime` and add an optional `sync: { division, modifier }` (absent = Free, cheapest for backward compatibility and the diff/wire code), or become a discriminated union. The intent only fixes the invariant: the synced value is stored as division + modifier, and the Free value as seconds/Hz.
- The exact note-value list (which divisions, which modifiers, where the LFO-only multi-bar tail starts, where Off sits) and the duration-sort order are spec items.
- How the stepped Sync mode is expressed on the existing slider schema (`sliderLinear` with a value map vs. a new `sliderStepped` schema type) is a spec item; the constraint is "same slider, different stops".
- Where the drift "skip synced" switch lives (`lfoDrift.ts` attach time vs. `lfoEngine.ts` connect time) is a spec item.
- Whether the robot-level and global-level seed draws need their own loading-range entries (e.g. `'delay.delayTime.sync'`) or reuse the Free range by conversion is a spec item; the behaviour (Sync draws filtered to the Free range at the seeded tempo) is fixed.
