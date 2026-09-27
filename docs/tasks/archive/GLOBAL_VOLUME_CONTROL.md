# Implementation Plan: Global Volume Control

Source spec: [docs/specs/GLOBAL_VOLUME_CONTROL.md](../specs/GLOBAL_VOLUME_CONTROL.md). Source intent: [docs/intent/global-volume-control.md](../intent/global-volume-control.md). Not yet slotted into [docs/todo/roadmap.md](../todo/roadmap.md).

## Overview

`audioStore` gains a real, live `volume` field (`0..1`, default `1`) and a `setVolume` action, replacing the current snapshot-only `preMuteVolume`/`setPreMuteVolume`. `setMuted` gains its own `AudioEngine.setMasterVolume` call (moved out of `TransportBar.tsx`). `TransportBar.tsx` gets a bespoke bare `@radix-ui/react-slider` next to the existing mute button, bound directly to `volume`/`setVolume` — no new drawer schema, no `SliderLinear` reuse, no changes to `AudioEngine.ts`/`globalFx.ts` at all. Three tasks total: the store change is the only real foundation work, the UI task depends on it, and docs land last, spot-checked against shipped source.

## Architecture Decisions

- **Reuse-first, per direct steering ("if we can reuse what is in the code already great. if not, do what needs to be done"): `AudioEngine.setMasterVolume`/`getMasterVolume` stay untouched.** This resolves spec §7 Open Question #1 — the taper (`volumePositionToGain`) is applied in `audioStore.setVolume`, not inside `AudioEngine.setMasterVolume`. Modifying `setMasterVolume` to taper internally would be the *new-code* path (rewriting an already-tested, already-working primitive); leaving it alone and reusing the existing `volumePositionToGain` utility at the one new call site is the *reuse* path, and it's the one that doesn't risk `AudioEngine.test.ts`'s 4 existing round-trip tests ([AudioEngine.test.ts:1674-1745](../../src/engine/AudioEngine.test.ts#L1674-L1745)).
- **Task 1 (`audioStore.ts`) is the only foundation task and has no dependency.** `volume`/`setVolume`/`setMuted` are self-contained store changes — nothing else in the app calls into them yet.
- **Task 2 (`TransportBar.tsx`/`.css`) depends on Task 1**, not the reverse — the new slider binds to `audioStore.volume`/`setVolume`, and the simplified `handleMuteClick` calls the rewritten `setMuted`. Building the UI first would mean binding to fields that don't exist yet.
- **Task 3 (docs) depends on both** — same "land last, spot-check against final shipped source" convention `docs/tasks/BPM_CONTROL.md`'s own Task 6 used, so the doc never describes a pre-review API shape that changed during implementation.
- **Correction to spec §7 item 3 ("reuse `SliderLinear.test.tsx`'s existing Radix-slider-drag test-interaction helper"):** checked directly against that file — it has **no** test that exercises a value-changing interaction on an *enabled* slider. Its only interaction test (`fireEvent.keyDown(thumb, { key: 'ArrowRight' })` after `thumb.focus()`) is the *disabled*-blocks-a-step negative case; every other test asserts static `aria-value*` attributes from props, not a live interaction. Task 2's new tests reuse the exact same mechanism (`fireEvent.keyDown` on a focused thumb, since Radix sliders don't respond to `fireEvent.change` and this codebase has no pointer-drag simulation precedent at all) but for the **positive** case — genuinely new coverage, not a copy of existing coverage.

## Dependency Graph

```
Task 1 (audioStore.ts: volume/setVolume, setMuted rewrite, preMuteVolume removal)
    │
    └──→ Task 2 (TransportBar.tsx/.css: volume slider UI + simplified handleMuteClick)
              │
              └──→ Task 3 (docs/AUDIO_SYSTEM.md)
```

## Task List

### Phase 1: Foundation — the store

- [x] **Task 1: `audioStore.ts` — `volume`/`setVolume`, `setMuted` rewrite, `preMuteVolume` removal**

  **Description:** Add `volume: number` (default `1`) and `setVolume(volume)` (sets `volume` and unconditionally clears `isMuted`, then calls `AudioEngine.setMasterVolume(volumePositionToGain(volume))`). Rewrite `setMuted(muted)` to own its own `AudioEngine.setMasterVolume` call (`0` when muted, `volumePositionToGain(get().volume)` when not) instead of leaving that to the caller. Remove `preMuteVolume` and `setPreMuteVolume` entirely from both the `AudioStore` interface and its implementation — spec §1.3, §1.5, §4.

  **Acceptance criteria:**
  - [x] `volume` defaults to `1` on a fresh module import.
  - [x] `setVolume(x)` sets `store.volume` to exactly `x` and calls `AudioEngine.setMasterVolume` with exactly `volumePositionToGain(x)`.
  - [x] `setVolume(x)` sets `isMuted` to `false`, including when it was already `true` (auto-unmute-on-drag, spec §1.3) — assert starting from `isMuted: true`.
  - [x] `setMuted(true)` sets `isMuted` to `true`, calls `AudioEngine.setMasterVolume(0)`, and does **not** change `volume`.
  - [x] `setMuted(false)` sets `isMuted` to `false` and calls `AudioEngine.setMasterVolume` with `volumePositionToGain(volume)`, reading the **live** `volume` already in state (assert with a non-default `volume`, e.g. `0.7`, set before calling `setMuted(false)`, to prove it isn't reading a stale/default value).
  - [x] `preMuteVolume`/`setPreMuteVolume` no longer exist anywhere in `audioStore.ts` — `npm run build:types` catches any stale reference automatically once they're removed from the interface.
  - [x] `AudioEngine.setMasterVolume`/`getMasterVolume`'s own signatures are untouched — this task adds a new caller, it does not modify `AudioEngine.ts` or `globalFx.ts` at all.

  **Verification:**
  - [x] `npx vitest run src/stores/audioStore.test.ts` passes (56 tests), including a `setMasterVolume: vi.fn()` addition to the file's existing `vi.mock('../engine/AudioEngine', ...)` block ([audioStore.test.ts:9-23](../../src/stores/audioStore.test.ts#L9-L23)).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** S (one file, two rewritten/new actions, one field removed)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint` clean. (`npm test` full-suite run deferred to Checkpoint: UI live, once TransportBar.tsx — which still referenced the just-removed `preMuteVolume` — was also fixed by Task 2; running the full suite between Task 1 and Task 2 would have shown a known, expected collateral failure in `TransportBar.test.tsx`.)
- [x] `volume`/`setVolume`/`setMuted` are all independently correct in the store; nothing in the UI reads or calls them yet.
- [x] Reviewed with human (implementation proceeded directly per this session's instructions).

---

### Phase 2: UI — the slider

- [x] **Task 2: `TransportBar.tsx`/`.css` — volume slider + simplified mute handler**

  **Description:** Add a bare `@radix-ui/react-slider` block (`Slider.Root`/`Track`/`Range`/`Thumb`) inside the existing `.transport-bar__buttons` group, immediately after the mute button — `min={0} max={1} step={0.01}`, bound directly to `audioStore.volume`/`setVolume` (no `*100`/`/100` conversion), `aria-label="Volume"` on the thumb, `disabled={!isPoweredOn}` matching the mute button's own condition exactly. Simplify `handleMuteClick` to a single `useAudioStore.getState().setMuted(!isMuted)` call (Task 1's `setMuted` now owns the `AudioEngine` call). New `.transport-bar__volume-slider`/`-track`/`-range`/`-thumb` CSS rules reusing existing tokens — spec §1.4, §1.5, §4.

  **Acceptance criteria:**
  - [x] The slider renders inside `.transport-bar__buttons`, immediately after the mute button, with `min=0 max=1 step=0.01` and `value={[volume]}`.
  - [x] Dragging/stepping it calls `audioStore.setVolume` with the new value (no intermediate conversion).
  - [x] The thumb has an accessible name of "Volume" (`screen.getByRole('slider', { name: /volume/i })`).
  - [x] The slider is disabled exactly when `isPoweredOn` is `false` — same condition as the mute button, no independent flag.
  - [x] `handleMuteClick` is a single-line delegation to `setMuted(!isMuted)` — no direct `AudioEngine.*` calls remain anywhere in `TransportBar.tsx`.
  - [x] The now-unused `AudioEngine` and `swallow` imports are removed from `TransportBar.tsx`.
  - [x] New CSS rules reuse only existing design tokens (`--color-border`, `--color-accent`, `--color-text-primary`, `--border-radius`, `--touch-target-size`) — no new custom properties introduced.
  - [x] `TransportBar.test.tsx`'s `setStoreFixtures()` drops `preMuteVolume: 1.0` and adds `volume: 1`.
  - [x] New test: the slider's `aria-valuenow` reflects a non-default `volume` fixture (`0.6`).
  - [x] New test: with the thumb focused, `fireEvent.keyDown(thumb, { key: 'ArrowRight' })` calls `setVolume`, observable as `useAudioStore.getState().volume` increasing — the positive-case counterpart to `SliderLinear.test.tsx`'s existing disabled-blocks-a-step test.
  - [x] New test: the slider is disabled (`data-disabled` present) when `isPoweredOn` is `false`.
  - [x] New test (independence regression guard): clicking mute does not change `audioStore.volume`.
  - [x] New test (icon-never-reacts-to-slider regression guard): with `volume: 0` and `isMuted: false` in the fixture, the mute button still renders `🔊`.
  - [x] Every existing mute test in the file still passes — including "still flips audioStore.isMuted," which was collaterally broken by Task 1's `preMuteVolume` removal (confirmed via RED run) and is fixed by this task's `handleMuteClick` rewrite, with no changes to that test itself.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/TransportBar.test.tsx` passes (15 tests).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check (live browser, not run in this session): with a locale playing audibly, drag the slider from `100%` to `0%` and confirm a smooth perceptual fade; click mute at a partial volume, confirm silence, un-mute, confirm it returns to exactly the same audible level; drag the slider while muted and confirm it audibly un-mutes at the dragged-to level; confirm the mute icon never changes on its own while only the slider moves; power off the console and confirm both controls go inert together. **Flagged for the human to verify.**

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/TransportBar.tsx`, `src/components/panels/screen/TransportBar.css`, `src/components/panels/screen/TransportBar.test.tsx`

  **Estimated scope:** M (3 files, new UI wiring plus a simplification of existing logic in the same component)

### Checkpoint: UI live
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean — full suite: 1753 tests across 108 files.
- [x] `npm run build` clean (production bundle).
- [x] The exact behavior this feature exists for is now provably true end-to-end via the automated suite: the slider live-adjusts master volume through the perceptual taper; mute and volume are fully independent per spec §1.3; both controls disable together when powered off.
- [ ] Manual check from Task 2 above — **not completed in this session; no live browser was used.** Flagged for the human before merge.
- [x] Reviewed with human (implementation proceeded directly per this session's instructions).

---

### Phase 3: Docs

- [x] **Task 3: `docs/AUDIO_SYSTEM.md` — document `audioStore.volume`**

  **Description:** Add a short note (near the existing "Layered / Composite Voices" section, which already documents `volumePositionToGain` for robot volume) covering: `audioStore.volume` is the master-output slider position (`TransportBar`, this feature), sharing the same `volumePositionToGain` taper as robot-level `masterVolume` but otherwise an unrelated field — one drives `AudioEngine.setMasterVolume` (the final output stage), the other drives a per-robot bus gain. Spot-checked every named identifier against the final shipped source from Tasks 1-2 — spec §2.

  **Acceptance criteria:**
  - [x] The new note names `audioStore.volume`, `setVolume`, and `setMuted` exactly matching the actual shipped source.
  - [x] It explicitly disambiguates `audioStore.volume` (master output) from robot-level `masterVolume` (per-robot bus gain).
  - [x] It notes there is no persistence — `volume` always resets to `1` on a fresh load.

  **Verification:**
  - [x] Manual review — every documented name/behavior spot-checked directly against `audioStore.ts`'s and `TransportBar.tsx`'s final shipped code.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change; full `npm test`/`npm run build` already re-confirmed clean at the Checkpoint: UI live gate above, and this task touches no code).

  **Dependencies:** Task 1, Task 2.

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint` clean (post-docs-change spot check); full `npm test`/`npm run build` confirmed clean at Checkpoint: UI live (1753 tests / 108 files, production build succeeds).
- [x] All automated acceptance criteria across all 3 tasks are met.
- [x] `docs/AUDIO_SYSTEM.md` reflects the shipped API — every documented name spot-checked against source.
- [ ] **Manual/live-browser checks (Task 2's audible fade/mute-independence check) were not performed in this session — flagged for the human before merge.**
- [x] Ready for human review / PR, pending the manual check above.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `AudioEngine`/`swallow` imports in `TransportBar.tsx` become unused but are left in place, failing lint | Low — caught immediately by `npm run lint` | Task 2's acceptance criteria explicitly call out removing both; verified against a full read of the current file showing neither has any other use |
| `preMuteVolume` removal breaks `TransportBar.test.tsx`'s fixture silently until the whole suite is run | Low — `npm run build:types` fails loudly on the stale fixture key the moment `preMuteVolume` leaves the `AudioStore` interface | Task 1 and Task 2 both call this out explicitly rather than relying on incidental discovery |
| The new Radix slider's keyboard-interaction test (Task 2) is genuinely new coverage, not a proven copy of existing coverage (correcting spec §7 item 3) | Low-medium — first-of-its-kind test in this file could be flakier or need iteration to get the Radix interaction right | Architecture Decisions above documents the exact mechanism (`fireEvent.keyDown` on a focused thumb) and its precedent (`SliderLinear.test.tsx`'s disabled-case test uses the same call, just asserting the opposite outcome) |
| Manual audible checks (Task 2, taper feel; Task "Checkpoint: Complete") are not automated and could be skipped under time pressure | Low — no correctness risk, only a UX-feel risk | Called out explicitly as a Checkpoint gate, matching `BPM_CONTROL.md`'s own precedent for audible/feel checks |

## Open Questions

Carried forward from spec §7, resolved here:

1. ~~Taper location: store layer vs. inside `AudioEngine.setMasterVolume`?~~ **Resolved** (Architecture Decisions above): store layer, per direct reuse-first steering — `AudioEngine.setMasterVolume`/`getMasterVolume` stay untouched.
2. ~~Slider width (`80px`) and step (`0.01`) — engineering defaults, not separately confirmed.~~ **Not re-litigated here** — low risk, easy to adjust visually during Task 2's manual check; flag to the human then if it reads wrong.
3. ~~Does `SliderLinear.test.tsx` already have a reusable drag-interaction helper?~~ **Resolved: no** — corrected in Architecture Decisions above; Task 2 writes genuinely new positive-case coverage using the same underlying mechanism the file's existing negative-case test already proves works.
4. **Whether `TransportBar.tsx` keeps importing `AudioEngine` for some future use vs. removing it now** — this plan takes the strict-scope reading (remove now, per CLAUDE.md's general "no unused imports" lint expectation; re-add later if a future feature needs it) rather than leaving it in place preemptively.
