# Phase Spec: Global Volume Control

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/global-volume-control.md](../intent/global-volume-control.md) (confirmed via `/interview-me`, 2026-09-02). Prior art reused directly rather than re-derived: `AudioEngine.setMasterVolume`/`getMasterVolume` (already-tested, thin wrappers over `globalFx.ts`'s `_masterGain` `Tone.Gain` node — see [AudioEngine.test.ts:1674-1745](../../src/engine/AudioEngine.test.ts#L1674-L1745)), `volumePositionToGain` (the perceptual/log taper already used for robot volume, [volumeTaper.ts](../../src/engine/audioEngine/volumeTaper.ts)), and `audioStore.ts`'s `setBPM`/`setPingVarianceAutomation` shape (the "plain live-adjustable field + action that calls `AudioEngine` directly, no persistence" convention this spec's new `volume` field follows).

---

## 1. Overview & Claude Explanation

`TransportBar.tsx` gains a compact, always-visible volume slider next to its existing 🔊/🔇 mute button. `audioStore` gains a real, live `volume` field (`0..1`, default `1`) as the slider's single source of truth, replacing the current `preMuteVolume` snapshot-only field. Dragging the slider calls a new `setVolume(position)` action, which writes `volume` to state and pushes `AudioEngine.setMasterVolume(volumePositionToGain(position))` — the same perceptual taper (`40dB` range, position `0` = true silence, position `1` = unity gain) already used for per-robot volume, applied here at the store layer rather than inside `AudioEngine.setMasterVolume` itself (§1.2 explains why, correcting one detail of the source intent doc's own wording). Mute and volume stay fully independent: `setMuted(true)` sets `isMuted` and silences the engine without touching `volume`; `setMuted(false)` restores audio to exactly the current `volume` position; `setVolume` always also clears `isMuted` (§1.3), so dragging the slider while muted jumps straight to the dragged-to level, un-muting as a side effect. The mute icon reflects only `isMuted`, never slider position.

The slider itself is a bespoke, bare `@radix-ui/react-slider` instance built directly in `TransportBar.tsx` — no label row, no numeric readout — matching the bar's existing icon-first, minimal style. It is **not** `SliderLinear` (the drawer primitive used by `AudioRigDrawer.tsx`'s `BPM_SCHEMA`/`PING_VARIANCE_AUTOMATION_SCHEMA` rows), which always renders a lore/human label pair and a text value+unit span — correct for the Audio Rig drawer's vertical layout, wrong for this bar (confirmed during Specify's predecessor interview, §1.4).

### 1.1 What's reused vs. what's new

Reused, unchanged: `AudioEngine.setMasterVolume`/`getMasterVolume` (no signature or behavior change — see §1.2 for why), `volumePositionToGain`/`VOLUME_TAPER_DB_RANGE` (`volumeTaper.ts`, imported into a new consumer but not itself modified), `TransportBar.tsx`'s existing `transport-bar__buttons`/`transport-bar__btn` structure and `!isPoweredOn`-gated disabled pattern (the mute button's own shape, extended to the new slider).

New: an `audioStore.volume` field + `setVolume` action, a bespoke Radix-Slider block in `TransportBar.tsx` (plus its CSS), and a rewritten `handleMuteClick`/`setMuted` split (§1.3). Removed: `audioStore.preMuteVolume` and `setPreMuteVolume` (§1.5) — no longer needed once `volume` itself is always available as the restore target.

### 1.2 Where the taper is applied — correcting the intent doc's own precedent claim

The intent doc's Style section says the taper is applied "at the store/wiring layer, same place robot volume does it today." **That last clause doesn't hold up against the actual code:** robot volume's taper call (`volumePositionToGain(masterVolume)`) lives *inside* `AudioEngine.ts` itself — in `reserveVoice` ([AudioEngine.ts:718](../../src/engine/AudioEngine.ts#L718)) and `updateRobotMasterVolume` ([AudioEngine.ts:971](../../src/engine/AudioEngine.ts#L971)) — not at the calling layer (`robotOptionsActions.ts`'s `applyVolume` passes a raw `0..1` fraction straight into `AudioEngine.updateRobotMasterVolume`, untapered).

This spec still applies the taper at the **store** layer (`audioStore.ts`'s `setVolume`), not inside `AudioEngine.setMasterVolume`, for a different, independently-sufficient reason: `AudioEngine.setMasterVolume`/`getMasterVolume` already have four passing round-trip tests asserting an untapered identity relationship (`setMasterVolume(0.3)` → `getMasterVolume() === 0.3`, [AudioEngine.test.ts:1674-1745](../../src/engine/AudioEngine.test.ts#L1674-L1745)) and no other caller today besides the code this spec is rewriting. Changing `setMasterVolume`'s own contract to taper internally would break that existing, unrelated-to-this-feature coverage for no benefit `setVolume`-side tapering doesn't already deliver. `setMasterVolume` stays a general "assign this raw clamped gain" primitive, matching its existing tested behavior; `setVolume` is the layer translating a UI slider position into that raw gain, which is a legitimate (if not byte-for-byte identical to the robot case) place to draw the line. Flagged non-blocking in §7.

### 1.3 Mute/volume independence — the exact state machine

```typescript
// audioStore.ts
setVolume: (volume) => {
  set({ volume, isMuted: false });
  AudioEngine.setMasterVolume(volumePositionToGain(volume));
},

setMuted: (muted) => {
  set({ isMuted: muted });
  AudioEngine.setMasterVolume(muted ? 0 : volumePositionToGain(get().volume));
},
```

One function, one behavior each — no caller-side branching for "was this drag-while-muted or a normal drag." `setVolume` unconditionally clears `isMuted` (a harmless no-op write when it was already `false`) and always pushes the tapered gain, satisfying both "normal drag while unmuted" and "drag while muted auto-unmutes to the dragged level" with the same code path. `setMuted` now owns its own `AudioEngine` call — moved out of `TransportBar.tsx`'s `handleMuteClick` (§1.5) — matching the shape every other `audioStore` setter already uses (`setBPM`, `setGlobalBypassEnabled`, `setEffectEnabled`, `setCompressorBeforeDelay` all call their own `AudioEngine`/`globalFx` function directly; `setMuted` was previously the only setter that didn't, leaving `TransportBar.tsx` to call `AudioEngine` itself).

### 1.4 The slider: bespoke, bare Radix, no `SliderLinear`

Confirmed via `interview-me` (`docs/intent/global-volume-control.md`): `SliderLinear` renders a `DualLabel` row and a numeric `value` + `unit` span unconditionally — right for `AudioRigDrawer`'s vertical rows, wrong for `TransportBar`'s horizontal, icon-first toolbar (no other control there has a visible label or live numeric readout). The new slider is built directly from `@radix-ui/react-slider` primitives (`Slider.Root`/`Track`/`Range`/`Thumb`), the same underlying library `SliderLinear` itself wraps, just without that wrapper's label/value chrome.

- **Domain:** `min={0} max={1} step={0.01}` — binds directly to `audioStore.volume`'s own `0..1` domain, no `*100`/`/100` conversion layer (unlike `pingVarianceAutomation`'s fraction-to-percent split) since there's no numeric readout to display in a different unit.
- **Accessible name:** `aria-label="Volume"` on `Slider.Thumb`, mirroring the mute button's own `aria-label="Mute"` — Radix supplies `role="slider"` plus live `aria-valuenow`/`aria-valuemin`/`aria-valuemax` automatically from `min`/`max`/`value`.
- **Placement:** inside the existing `transport-bar__buttons` flex group, immediately after the mute button, sharing that group's existing `gap: var(--spacing-sm)` — visually grouped with mute, per the confirmed intent ("next to the mute button").
- **Keyboard:** Radix `Slider.Root` provides arrow-key stepping (by `step`), Home/End (min/max), and Page Up/Down out of the box — no custom keyboard handling needed.

### 1.5 `handleMuteClick` simplifies; `preMuteVolume` is removed

With `volume` always live in the store, there's nothing left for `preMuteVolume` to snapshot — the restore target on un-mute is just `volume`, unconditionally. `TransportBar.tsx`'s `handleMuteClick` collapses to a single call:

```typescript
const handleMuteClick = () => {
  if (!isPoweredOn) return;
  useAudioStore.getState().setMuted(!isMuted);
};
```

No more direct `AudioEngine.getMasterVolume()`/`setMasterVolume()` calls in `TransportBar.tsx` — both now happen inside `setMuted`/`setVolume` (§1.3), and no `try`/`catch`/`swallow` wrapper is needed at the call site since neither store action can throw (the underlying `AudioEngine.setMasterVolume` already catches internally — see `globalFx.ts`'s existing `try`/`catch`/`devWarn`).

### 1.6 Lifecycle: disabled under `!isPoweredOn`, no persistence

The new slider gets `disabled={!isPoweredOn}`, identical to the mute button's existing condition — both go inert together when the console powers off. `volume` itself is a plain in-memory field like `bpm`/`pingVarianceAutomation`: it initializes to `1` in the store's `create(...)` call and is never written to or read from `localStorage`/`sessionStorage` — a fresh page load always starts at `100%`, per the confirmed intent and matching every other live-adjustable `audioStore` field's existing behavior (none of them persist today; see `docs/SESSION_STORAGE.md`, a *future*, not-yet-implemented roadmap phase).

---

## 2. Target File Structure

```text
src/
├── stores/
│   ├── audioStore.ts               # MODIFIED — remove preMuteVolume field + setPreMuteVolume
│   │                                  #   action; add volume field (default 1) + setVolume
│   │                                  #   action; setMuted gains its own AudioEngine.setMasterVolume
│   │                                  #   call (§1.3); new import of volumePositionToGain
│   └── audioStore.test.ts          # MODIFIED — new setVolume/setMuted coverage; mock gains
│                                      #   setMasterVolume: vi.fn()
├── components/panels/screen/
│   ├── TransportBar.tsx            # MODIFIED — new bare Radix Slider block next to the mute
│   │                                  #   button; handleMuteClick simplifies to a single
│   │                                  #   setMuted(!isMuted) call (§1.5); new
│   │                                  #   @radix-ui/react-slider import
│   ├── TransportBar.css            # MODIFIED — new .transport-bar__volume-* rules
│   └── TransportBar.test.tsx       # MODIFIED — fixture drops preMuteVolume, adds volume;
│                                      #   new slider render/drag/disabled/independence tests
└── engine/
    └── audioEngine/
        └── volumeTaper.ts           # UNCHANGED — imported into a new consumer only

docs/
└── AUDIO_SYSTEM.md   # MODIFIED — short new note under "Layered / Composite Voices and Visual
                        #   Mapping" or a new small subsection disambiguating audioStore.volume
                        #   (master output, TransportBar slider, this spec) from robot-level
                        #   masterVolume (per-robot bus gain, Robot Options) — both use the same
                        #   volumePositionToGain taper but are otherwise unrelated fields
```

**Explicitly not touched, and why:** `src/engine/AudioEngine.ts` (`setMasterVolume`/`getMasterVolume` keep their existing untapered-passthrough contract — §1.2). `src/engine/audioEngine/globalFx.ts` (`_masterGain` wiring is unchanged; this feature only adds a new caller of the already-existing `setMasterVolume`). `src/components/ui/controls/SliderLinear.tsx` and `src/data/audioRigConfig.ts` (no drawer schema or primitive is touched — this control deliberately isn't a `SliderLinear` row, §1.4). `src/components/panels/screen/console/AudioRigDrawer.tsx` (placement was explicitly decided against during the pre-spec interview). No new dependency (`@radix-ui/react-slider` is already installed and used by `SliderLinear.tsx`). No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`AudioEngine.setMasterVolume`/`getMasterVolume` keep their current signatures and untapered behavior.** Do not add taper logic inside either function — §1.2 explains why, and `AudioEngine.test.ts`'s existing four round-trip tests must keep passing unmodified.
* **No new drawer schema, no `SliderLinear` reuse.** The new control is a bespoke bare `@radix-ui/react-slider` block built directly in `TransportBar.tsx` — not a `ControlSchema`/`SliderLinearSchema` entry, not rendered via `SliderLinear`.
* **`setVolume` and `setMuted` are each a single, unconditional code path** (§1.3) — no `instant`/`fromDrag`-style boolean parameter branching between "normal" and "while-muted" cases.
* **The mute icon (`🔊`/`🔇`) reacts only to `isMuted`.** Never derive it from `volume === 0` or any slider position.
* **No persistence.** `volume` must not be read from or written to `localStorage`/`sessionStorage`/any other storage — always initializes to `1` in the store.
* **Slider domain stays `0..1`, no `*100`/`/100` conversion layer** — bind `audioStore.volume` directly to the Radix `Slider.Root`'s `value`/`onValueChange`.
* **Scheduling/timing is not implicated by this feature at all** — volume is a continuous `Tone.Gain` param set instantly (matching `setMasterVolume`'s existing unramped assignment), not scheduled audio. No `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask` anywhere touched by this spec, per CLAUDE.md's non-negotiable rule (restated here only because it's easy to reach for a debounce/rAF pattern on a drag handler — don't).
* **Both the slider and the mute button share the exact same `!isPoweredOn` disabled condition** — do not introduce a second, independently-computed disabled flag.

---

## 4. Code Style & Architecture Conventions

**`src/stores/audioStore.ts`** (diff shape):

```typescript
import { volumePositionToGain } from '../engine/audioEngine/volumeTaper';

export interface AudioStore {
  // ...existing fields unchanged...
  isMuted: boolean;
  /** Live master-volume slider position, [0, 1] — TransportBar's volume slider's single source
   *  of truth. Default 1 (100%), never persisted (§1.6). The engine's actual live gain is
   *  `isMuted ? 0 : volumePositionToGain(volume)` — see setVolume/setMuted below. */
  volume: number;
  // preMuteVolume: REMOVED — volume itself is always the un-mute restore target now.

  /** Sets the master-volume slider position and pushes the tapered gain to AudioEngine.
   *  Always also clears isMuted — dragging the slider while muted un-mutes as a side effect,
   *  jumping straight to the dragged-to level (docs/specs/GLOBAL_VOLUME_CONTROL.md §1.3). */
  setVolume: (volume: number) => void;
  /** Sets isMuted and pushes the resulting gain (0 when muted, volume's tapered gain when not)
   *  to AudioEngine — owns its own AudioEngine call now, matching every other audioStore setter's
   *  shape (setBPM, setGlobalBypassEnabled, etc.); TransportBar.tsx no longer calls AudioEngine
   *  directly for mute (docs/specs/GLOBAL_VOLUME_CONTROL.md §1.3, §1.5). */
  setMuted: (muted: boolean) => void;
  // setPreMuteVolume: REMOVED.
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  // ...existing fields unchanged...
  isMuted: false,
  volume: 1,

  setVolume: (volume) => {
    set({ volume, isMuted: false });
    AudioEngine.setMasterVolume(volumePositionToGain(volume));
  },

  setMuted: (muted) => {
    set({ isMuted: muted });
    AudioEngine.setMasterVolume(muted ? 0 : volumePositionToGain(get().volume));
  },

  // ...existing actions unchanged, preMuteVolume-related ones deleted...
}));
```

**`src/components/panels/screen/TransportBar.tsx`** (diff shape):

```typescript
import * as Slider from '@radix-ui/react-slider';
// ...existing imports unchanged; AudioEngine import may become unused here — remove it if
// nothing else in this file still calls it directly after §1.5's simplification...

function TransportBar() {
  // ...existing reads unchanged...
  const isMuted = useAudioStore((s) => s.isMuted);
  const volume = useAudioStore((s) => s.volume);

  const handleMuteClick = () => {
    if (!isPoweredOn) return;
    useAudioStore.getState().setMuted(!isMuted);
  };

  const handleVolumeChange = (values: number[]) => {
    if (!isPoweredOn) return;
    useAudioStore.getState().setVolume(values[0]);
  };

  return (
    <Toolbar.Root className="transport-bar" aria-label="Transport controls">
      <div className="transport-bar__buttons">
        <Toolbar.Button
          className={`transport-bar__btn transport-bar__btn--mute${isMuted ? ' transport-bar__btn--muted' : ''}`}
          aria-label="Mute"
          aria-pressed={isMuted}
          disabled={!isPoweredOn}
          onClick={handleMuteClick}
        >
          {isMuted ? '🔇' : '🔊'}
        </Toolbar.Button>

        <Slider.Root
          className="transport-bar__volume-slider"
          min={0}
          max={1}
          step={0.01}
          value={[volume]}
          onValueChange={handleVolumeChange}
          disabled={!isPoweredOn}
        >
          <Slider.Track className="transport-bar__volume-track">
            <Slider.Range className="transport-bar__volume-range" />
          </Slider.Track>
          <Slider.Thumb className="transport-bar__volume-thumb" aria-label="Volume" />
        </Slider.Root>
      </div>

      {/* ...rest of the component (separator, displays) unchanged... */}
    </Toolbar.Root>
  );
}
```

`swallow`/`err` handling from the old `handleMuteClick` is dropped — nothing in the new path can throw synchronously (§1.5); if that import becomes unused elsewhere in the file, remove it.

**`src/components/panels/screen/TransportBar.css`** (new rules, appended after the existing `.transport-bar__btn[data-disabled]` block, before the Displays section):

```css
/* ----------------------------------------
   Volume slider (Radix)
   ---------------------------------------- */
.transport-bar__volume-slider {
  position: relative;
  display: flex;
  align-items: center;
  width: 80px;
  height: var(--touch-target-size);
  touch-action: none;
}

.transport-bar__volume-track {
  position: relative;
  flex: 1;
  height: 3px;
  border-radius: var(--border-radius);
  background: var(--color-border);
}

.transport-bar__volume-range {
  position: absolute;
  height: 100%;
  border-radius: var(--border-radius);
  background: var(--color-accent);
}

.transport-bar__volume-thumb {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-text-primary);
  cursor: pointer;
}

.transport-bar__volume-thumb:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.transport-bar__volume-slider[data-disabled] .transport-bar__volume-thumb,
.transport-bar__volume-slider[data-disabled] .transport-bar__volume-range {
  opacity: 0.35;
  cursor: not-allowed;
}
```

Reuses the same design tokens (`--color-border`, `--color-accent`, `--color-text-primary`, `--border-radius`, `--touch-target-size`) the rest of `TransportBar.css` and `SliderLinear.css` already draw from — no new tokens introduced. `80px` width is this spec's own engineering default (§7 flags it as easy to adjust, not separately confirmed with the user).

* **Naming Conventions:** `volume`, `setVolume`, `handleVolumeChange`, `transport-bar__volume-slider`/`-track`/`-range`/`-thumb` — same `camelCase`/BEM-ish-with-double-underscore conventions the surrounding files already use (`transport-bar__btn`, `transport-bar__btn--mute`).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`audioStore.test.ts` (modified):**
  1. Add `setMasterVolume: vi.fn()` to the existing `vi.mock('../engine/AudioEngine', ...)` block ([audioStore.test.ts:9-22](../../src/stores/audioStore.test.ts#L9-L22)) — required before any new test below can assert against it.
  2. `setVolume(0.5)` updates `store.volume` to `0.5` and calls `AudioEngine.setMasterVolume` with `volumePositionToGain(0.5)` (import the real `volumePositionToGain` in the test to compute the expected value, not a hardcoded number).
  3. `setVolume(x)` while `isMuted` is `true` also sets `isMuted` back to `false` (the auto-unmute-on-drag behavior, §1.3) — set up the store with `isMuted: true` first, call `setVolume`, assert both `isMuted === false` and the `setMasterVolume` call.
  4. `setMuted(true)` sets `isMuted` to `true` and calls `AudioEngine.setMasterVolume(0)`, regardless of the current `volume` value — does not modify `volume` itself.
  5. `setMuted(false)` sets `isMuted` to `false` and calls `AudioEngine.setMasterVolume` with `volumePositionToGain(volume)`, using whatever `volume` was already in state (assert with a non-default `volume`, e.g. `0.7`, set via `useAudioStore.setState` before calling `setMuted(false)`, to prove it reads the live value rather than a stale/default one).
  6. `volume` defaults to `1` on a fresh module import.
* **`TransportBar.test.tsx` (modified):**
  1. Update `setStoreFixtures()` — drop `preMuteVolume: 1.0`, add `volume: 1` (TypeScript will otherwise fail to compile the fixture once `preMuteVolume` is removed from `AudioStore`).
  2. Renders a slider (`screen.getByRole('slider', { name: /volume/i })`) next to the mute button, inside `.transport-bar__buttons`.
  3. The slider's accessible value reflects `audioStore.volume` (assert `aria-valuenow` matches, for a non-default fixture value like `0.6`).
  4. Dragging/changing the slider (fire the appropriate Radix-compatible interaction — check how `SliderLinear.test.tsx` already exercises the same underlying `@radix-ui/react-slider` component and mirror that interaction pattern exactly, since Radix sliders don't respond to a plain `fireEvent.change`) calls `audioStore.setVolume` with the new value — assert via `useAudioStore.getState().volume` after the interaction, same "assert on real store state" style the existing "still flips audioStore.isMuted" mute test already uses ([TransportBar.test.tsx:117-123](../../src/components/panels/screen/TransportBar.test.tsx#L117-L123)).
  5. The slider is disabled when `isPoweredOn` is `false`, mirroring the existing "disables the mute toggle when powered off" test ([TransportBar.test.tsx:125-130](../../src/components/panels/screen/TransportBar.test.tsx#L125-L130)) — same assertion shape, new target element.
  6. Clicking mute no longer changes `audioStore.volume` (regression guard for independence, §1.3) — set a non-default `volume` fixture, click mute, assert `volume` is unchanged while `isMuted` flips.
  7. The mute icon stays `🔊` when `volume` is set to `0` in the fixture and `isMuted` is `false` — regression guard for §1.3/§1.4's "icon never reacts to slider position."
* **`AudioEngine.test.ts`:** no changes expected — `setMasterVolume`/`getMasterVolume`'s existing coverage ([AudioEngine.test.ts:1674-1745](../../src/engine/AudioEngine.test.ts#L1674-L1745)) must keep passing unmodified, proving §1.2's "no contract change" claim.
* **`AUDIO_SYSTEM.md` doc change:** no automated test; verify by reading — the new note must clearly disambiguate `audioStore.volume` (master output, TransportBar slider) from robot-level `masterVolume` (per-robot bus gain, Robot Options), noting both share `volumePositionToGain` but are otherwise unrelated.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (this will also catch every stale `preMuteVolume` reference automatically, since removing it from the `AudioStore` interface makes any leftover usage a compile error).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** with a locale playing audibly, drag the volume slider from `100%` down to `0%` and confirm a smooth perceptual fade (not an abrupt drop near the bottom, nor a long dead zone near the top — the taper doing its job); click mute at a partial volume, confirm silence, then un-mute and confirm it returns to exactly the same audible level; drag the slider while muted and confirm it audibly un-mutes at the dragged-to level; confirm the mute icon never changes on its own while only the slider is being dragged; power off the console and confirm both the mute button and the slider go inert together.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/global-volume-control` (new branch off `main`).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `audioStore.ts` (+ test) — the `volume`/`setVolume` field and action, `setMuted`'s new `AudioEngine` call, `preMuteVolume`/`setPreMuteVolume` removal; (2) `TransportBar.tsx`/`.css` (+ test) — the new slider and simplified `handleMuteClick`; (3) `docs/AUDIO_SYSTEM.md` last.

---

## 7. Open Questions & Risks

Resolved during the pre-spec `interview-me` pass (`docs/intent/global-volume-control.md`), not re-litigated here:

- ~~Placement?~~ **Resolved: next to the mute button in TransportBar**, not `AudioRigDrawer`.
- ~~Taper?~~ **Resolved: reuse `volumePositionToGain`.**
- ~~Mute/volume coupling?~~ **Resolved: fully independent**, with the specific auto-unmute-on-drag and icon-never-reacts-to-slider rules in §1.3/§1.4.
- ~~Persistence?~~ **Resolved: none — resets to `100%` every load.**
- ~~Component to use?~~ **Resolved: bespoke bare Radix slider, not `SliderLinear`.**

Resolved during this Specify pass, worth a second look before/during Implement:

1. **§1.2's taper-location call (store layer, not inside `AudioEngine.setMasterVolume`) diverges from the intent doc's literal "same place robot volume does it today" wording**, because that wording doesn't match the actual code (robot volume's taper is inside `AudioEngine.ts`, not at its caller). This spec's choice is justified independently (avoids touching `setMasterVolume`'s already-tested untapered contract) but is a correction of a stated-intent premise, not a verbatim implementation of it — flagging in case the human operator weighs the "match robot volume's exact code shape" goal more heavily than "don't touch `AudioEngine.test.ts`'s existing coverage." Low risk either way (single function, no data-model impact, easy to move later).
2. **The slider's `80px` width and `0.01` step are this spec's own engineering defaults**, not separately confirmed with the user — same category as `BPM_CONTROL.md`'s own flagged-but-unconfirmed ramp duration. Low risk, worth a quick visual sanity check during Implement.
3. **`TransportBar.test.tsx`'s exact interaction pattern for driving a Radix `Slider.Root` in tests isn't yet verified against this codebase's own precedent** — `SliderLinear.test.tsx` almost certainly already solves this for the drawer's identical underlying primitive; Plan/Implement should read that file first and reuse its interaction helper rather than reinventing one.
4. **Whether `AudioEngine` remains imported in `TransportBar.tsx` after this change** depends on whether anything else in that file still references it directly — likely not, per §1.5's diff, in which case the import should be removed to avoid an unused-import lint failure.
