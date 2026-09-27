# Intent: Global Volume Control

Confirmed via `interview-me` on 2026-09-02, ahead of a `spec-driven-development` pass.

## Outcome

A compact, always-visible volume slider sits directly next to the existing 🔊/🔇 mute button in [TransportBar.tsx](../../src/components/panels/screen/TransportBar.tsx), giving live drag control over master output volume.

## Behavior

- Dragging the slider calls `AudioEngine.setMasterVolume` through the same log/perceptual taper robot volume already uses (`volumePositionToGain`, [volumeTaper.ts](../../src/engine/audioEngine/volumeTaper.ts), 40dB range) — not a raw linear pass-through.
- Mute and volume are **fully independent controls**:
  - Muting silences output without moving or reading the slider — the slider keeps showing wherever it was set.
  - Un-muting restores audio to exactly the slider's current position.
  - Dragging the slider while muted **automatically un-mutes**, jumping straight to the dragged-to level.
  - The mute icon reflects only the `isMuted` flag, never slider position — it stays 🔊 even if the slider is dragged all the way to 0%. Mute and "slider at 0%" are deliberately not coupled.
- The slider is disabled together with the mute button whenever `!isPoweredOn`, matching the console's existing powered-off behavior.
- Volume resets to a fixed 100% default on every fresh load — **no persistence** across sessions (no localStorage), consistent with how `audioStore`'s other live-adjustable fields (BPM, Ping Variance Automation) behave today.

## Style / constraint

- A **bespoke compact slider** (bare `@radix-ui/react-slider`), not the existing `SliderLinear` drawer primitive from `docs/COMPONENT_LIBRARY.md` — that component renders a full labeled row (lore label + human label + numeric value/unit readout) meant for the Audio Rig drawer's vertical layout, and CLAUDE.md itself scopes that primitive set to "later drawer phases."
- No label row, no numeric `%` readout — matches TransportBar's existing minimal, icon-first style (buttons have aria-labels, not visible text labels).

## Out of scope

- Session/localStorage persistence of the volume level.
- Placement in `AudioRigDrawer`'s master-row (that pattern — `SliderLinear` + a `*_SCHEMA` entry in `audioRigConfig.ts` — was considered and explicitly not chosen for this control).
- Changing `AudioEngine.setMasterVolume`'s own signature or moving the taper conversion inside it — the taper is applied at the store/wiring layer, the same place robot volume applies it today.
- Any coupling between the mute icon and slider position.
- Disabling the slider while muted (it stays interactive, per the auto-unmute-on-drag behavior above).

## Known implementation note (not yet spec'd)

Today's `audioStore` has no live `volume` field — only `isMuted` and a one-shot `preMuteVolume` snapshot captured at mute time. Realizing the behavior above will need a real `volume` field (0–1 position, default 1) as the slider's single source of truth, with the engine's live gain derived as `isMuted ? 0 : volumePositionToGain(volume)`. `preMuteVolume`'s snapshot-and-restore mechanic becomes unnecessary under this model. Left for the `spec-driven-development` pass to formalize.
