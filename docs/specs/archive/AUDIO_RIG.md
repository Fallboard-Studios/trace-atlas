# Phase Spec: Audio Rig (Roadmap Phase 4)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/audio-rig.md](../intent/audio-rig.md) (confirmed via `/interview-me`). Source of scope: [docs/todo/roadmap.md § 4](../todo/roadmap.md#4-audio-rig) (note: its "About" text is stale — see § 7.1). Source of target data: [docs/reference/GLOBAL_CHAIN_GRID.md](../reference/GLOBAL_CHAIN_GRID.md) (the authoritative field-by-field source for every schema entry below). Prior art this phase builds directly on: [docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md) (Phase 1's 13 primitives), [docs/AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md) (the already-built `AudioEngine`/`lfoEngine` surface, from Phase 0).

---

## 1. Overview & Claude Explanation

This phase turns the Audio Rig hub tile from a placeholder `<div>` into a live, playable console. `src/data/audioRigConfig.ts` defines `ControlSchema` data (Phase 1's discriminated union) for all 7 global effect blocks — Compressor, 3-Band EQ, Low-Pass Filter, High-Pass Filter, Chorus, Delay, Reverb — with every label, unit, range, default, and LFO flag copied field-for-field from `GLOBAL_CHAIN_GRID.md`, not invented. `AudioRigDrawer.tsx` renders 7 `AccordionContainer` instances in the grid's row order, each mapping its effect's param schemas onto the matching Phase 1 primitive (`SliderLinear`, `SliderLog`, `SliderCenteredZero`, `Stepper`) via a small local dispatcher, and replaces `ConsolePanel.tsx`'s `TILE_CONTENT.audioRig` stub entry.

Unlike Phase 1's components, this is not presentation-only: every control is wired live to the Tone.js FX chain that Phase 0 (LFO Integration) already built in `src/engine/audioEngine/globalFx.ts` and exposed as `AudioEngine.setGlobal*`/`setEffectBypass`/`setGlobalBypass`. `audioStore.ts`'s existing `globalAudio` state and `setGlobalAudio()` action already exist but currently only touch Zustand — `setGlobalAudio` is extended this phase to also push each change to its matching `AudioEngine` setter, mirroring the inline-call pattern `regenerateGlobalAudioFromSeed()` already uses for the seed-regeneration path. Each of the 7 accordions gets its own bypass toggle bound to that effect's `enabled` field; one rig-wide toggle above all 7 binds to `GlobalAudioSettings.globalBypass`. Both kinds of bypass, when engaged, visually and functionally disable their scope's other controls via each primitive's existing `disabled` prop — not just silence audio while leaving knobs interactive.

The 9 params `GLOBAL_CHAIN_GRID.md` flags `LFO?: X` (EQ low/mid/high, LPF/HPF frequency/Q, Chorus delayTime, Delay delayTime — matching `src/types/lfo.ts`'s `GlobalLfoTargetId` 1:1) each get an `Lfo` primitive tucked into its own small nested `AccordionContainer` inside the parent effect's accordion, wired live to `lfoEngine` (`setLfoRate`/`setLfoDepth`/`setLfoShape`/`connectLfoTarget`/`disconnectLfoTarget`) — flipping "active" really connects or disconnects modulation, not just a display flag. Because `lfoEngine` and its 9 global targets already exist but are only ever exercised today by a dev-only debug hook (`lfoDebug.ts`), and no roadmap phase claims seeding global LFO settings, this phase also adds a `generateGlobalLfoSettings(planetId, planetName)` function mirroring `globalAudioSeed.ts`'s existing `generateGlobalAudioSettings` pattern, producing a deterministic `{ shape, rate, depth, active }` per target from the planet noise map — including `active` itself, so a freshly loaded planet can already have real, audible modulation running before the user touches anything. This wires into `audioStore`'s existing planet-sync subscription alongside `regenerateGlobalAudioFromSeed`.

---

## 2. Target File Structure

```text
src/
├── data/
│   ├── audioRigConfig.ts              # NEW — ControlSchema data for all 7 effect blocks, sourced from GLOBAL_CHAIN_GRID.md
│   └── audioRigConfig.test.ts         # NEW — every schema traces to the grid; all 7 effects + 24 params + 9 LFO entries present
├── utils/
│   ├── globalAudioSeed.ts             # MODIFIED — add generateGlobalLfoSettings(planetId, planetName): Record<GlobalLfoTargetId, LfoSettings & { active: boolean }>
│   └── globalAudioSeed.test.ts        # MODIFIED — determinism + bounds tests for the new function
├── stores/
│   ├── audioStore.ts                  # MODIFIED — setGlobalAudio pushes to AudioEngine; new setEffectEnabled/setGlobalBypassEnabled actions call setEffectBypass/setGlobalBypass; new globalLfo state + setGlobalLfo action wired to lfoEngine; planet-sync also seeds+connects global LFOs
│   └── audioStore.test.ts             # MODIFIED — new coverage for all of the above
├── engine/
│   └── AudioEngine.ts                 # MODIFIED — start() re-triggers lfoEngine.start() for every seeded-active global LFO target once the transport actually starts (see § 7.1 — start() no-ops before the transport runs)
├── components/ui/controls/
│   ├── SliderLinear.tsx / .test.tsx           # MODIFIED — add optional `disabled?: boolean` prop (see § 3 — only Stepper/StepperWithToggle have this today)
│   ├── SliderLog.tsx / .test.tsx              # MODIFIED — same
│   ├── SliderCenteredZero.tsx / .test.tsx     # MODIFIED — same
│   └── Toggle.tsx / .test.tsx                 # MODIFIED — same
└── components/panels/screen/console/
    ├── AudioRigDrawer.tsx             # NEW
    ├── AudioRigDrawer.css             # NEW
    ├── AudioRigDrawer.test.tsx        # NEW
    ├── ConsolePanel.tsx               # MODIFIED — TILE_CONTENT.audioRig renders <AudioRigDrawer /> instead of the stub <div>
    └── ConsolePanel.test.tsx          # MODIFIED — replace the "renders the carried-forward stub content for audioRig" assertion

docs/
├── todo/roadmap.md                 # MODIFIED — Phase 4 "About" text doc-fix (see § 7.1)
└── AUDIO_SYSTEM.md                    # MODIFIED — LFO Modulation § Seeding: global-chain LfoSettings are no longer unseeded: correct "not seed-generated... out of scope" line
```

No new dependency — `@radix-ui/react-accordion` is already installed (Phase 1).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in the Target File Structure above unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Zero Hardcoded Strings:** Every label, unit, range, and default in `audioRigConfig.ts` traces to a specific `GLOBAL_CHAIN_GRID.md` row — no invented copy, no adjusted bounds. `AudioRigDrawer.tsx` renders zero raw display strings itself.
* **No Tone objects outside `src/engine/`** (per [CLAUDE.md](../../CLAUDE.md)) — `AudioRigDrawer.tsx` and `audioStore.ts` never import Tone directly; every engine effect goes through `AudioEngine`/`lfoEngine`.
* **`AccordionContainer` is not modified.** It has no header slot for extra content (its `Accordion.Header`/`Trigger` renders only `DualLabel`, and `Trigger` is itself a `<button>` — nesting a `Toggle`'s Radix `Switch` inside it would be an invalid nested-interactive-control). Each effect's bypass toggle renders as a sibling row *above* its `AccordionContainer`, inside a shared wrapper `<div>` — visually a header, structurally independent. See § 4 for the exact shape.
* **Four Phase 1 primitives need a small, additive extension: `disabled?: boolean`.** Checked directly against source, not assumed — only `Stepper`/`StepperWithToggle` currently accept `disabled`; `SliderLinear`, `SliderLog`, `SliderCenteredZero`, and `Toggle` do not. The confirmed intent's "bypass visually and functionally disables its scope" requires all of these. Add the prop to each (Radix `Slider.Root`/`Switch.Root` both natively support `disabled`), default `false`, purely additive — no existing call site's behavior changes. This is the one place this phase touches already-shipped Phase 1 files; keep the diff to exactly this prop, nothing else.
* **Bypass polarity is not uniform — do not normalize it.** `GlobalAudioSettings.enabled` is `true` = audible (its own default); `GlobalAudioSettings.globalBypass` is `true` = **silenced** (bypassing the whole chain to `Destination`; its own default is `false` = chain active). Bind each `Toggle`'s schema/label to its own field's real polarity (e.g. label the rig-wide one "BYPASS" so ON reads as "bypassed", not "powered") — do not invert one to make both read as a generic "on = sound" switch.
* **Disabled cascade — params only, not the nested LFO controls.** An effect's bypass off (`enabled: false`) disables (`disabled` prop) that effect's own param controls. The rig-wide bypass on (`globalBypass: true`) additionally disables every one of the 7 effects' own bypass toggles, not just their params — nothing directly under a fully-bypassed rig is independently toggleable. The nested `Lfo` controls are deliberately **excluded** from this cascade this phase — `Lfo` (and the `RadioButton` it composes) has no `disabled` prop today, and adding one would extend two more already-shipped Phase 1 files beyond the four already listed in § 2. See § 7.5.
* **`setGlobalAudio`'s `EffectKey` names stay `GlobalAudioSettings`' own field names** (`filterLPF`/`filterHPF`, not `lpf`/`hpf`) for the audio-settings path — only the bypass path (`AudioEngine.setEffectBypass`, `audioStore`'s existing `BYPASS_EFFECT_KEYS`) uses the `'lpf'`/`'hpf'` short form. Do not conflate the two naming conventions.
* **`GlobalLfoTargetId` short-form translation:** the 9 LFO-flagged params' schema `id`s in `audioRigConfig.ts` should match `GlobalAudioSettings`' real field paths (e.g. `'filterLPF.frequency'`), consistent with every other param — the nested `Lfo` control's wiring code is what's responsible for translating to `lfoEngine`'s short-form `GlobalLfoTargetId` (e.g. `'lpf.frequency'`) at the call site, the same translation `lfoEngine.ts`'s own `globalSeedRangeKey()` already performs. Do not rename the param schema ids to the short form just to avoid writing that translation.
* **`enabled` stays unseeded** — Phase 0 pinned every effect's `enabled` to `true` regardless of seed; this phase does not change what a fresh seed generates for it, it only adds the UI to toggle it afterward.
* **`generateGlobalLfoSettings` reuses the existing single global bounds** (`LFO_RATE_MIN/MAX`, `LFO_DEPTH_MIN/MAX`, `LFO_SHAPES` from `src/types/lfo.ts`) — no new per-field range table (unlike `GLOBAL_AUDIO_SEED_RANGES`, which does vary by field); `GLOBAL_CHAIN_GRID.md`'s `LFO?` column is a flat X/– flag, not per-field bounds.
* **State stays serializable** — `globalLfo` (the new `audioStore` slice) is plain `{ shape, rate, depth, active }` data per target, Zustand-safe; the live `Tone.LFO` node instances stay inside `lfoEngine.ts`'s own module-scoped map, never entering Zustand, matching the existing `globalAudio`/`globalFx.ts` `_fxParamCache` split.
* **No Session Storage wiring** — edits made through this drawer do not persist across reload; that's Phase 12.
* **No robot-level changes** — `spawnSystem.ts`, `RobotAudioTab.tsx`, `RobotOscillatorsTab.tsx` are untouched; robot-level LFO wiring is Phase 9.

---

## 4. Code Style & Architecture Conventions

`audioRigConfig.ts` groups each effect's accordion metadata, its own bypass schema, and its param schemas together — one record per effect, keyed the same way `GlobalAudioSettings` already is, so the config and the settings object line up 1:1:

```typescript
// src/data/audioRigConfig.ts
import type { ControlSchema, ToggleSchema, AccordionSchema } from '@/types/controls';
import type { GlobalLfoTargetId } from '@/types/lfo';

export interface AudioRigEffectBlock {
  /** Matches GlobalAudioSettings' own key — 'compressor', 'eq3', 'filterLPF', etc. */
  key: 'compressor' | 'eq3' | 'filterLPF' | 'filterHPF' | 'chorus' | 'delay' | 'reverb';
  accordion: AccordionSchema;      // loreLabel/humanLabel = GLOBAL_CHAIN_GRID.md's Effect Label
  enabledSchema: ToggleSchema;     // this effect's own bypass toggle
  params: AudioRigParamSchema[];   // one entry per param row, in the grid's row order
}

export interface AudioRigParamSchema {
  /** Matches the field path on GlobalAudioSettings[block.key], e.g. 'threshold', 'low', 'frequency'. */
  field: string;
  schema: ControlSchema;           // sliderLinear | sliderLog | sliderCenteredZero | stepper, per the grid's UI column
  /** Present only for the 9 rows the grid flags LFO?: X. Short form, matching GlobalLfoTargetId directly. */
  lfoTarget?: GlobalLfoTargetId;
  lfoAccordion?: AccordionSchema;  // the nested "MODULATION" accordion wrapping this param's Lfo control
}

export const AUDIO_RIG_CONFIG: AudioRigEffectBlock[] = [
  {
    key: 'compressor',
    accordion: { id: 'audioRig.compressor', type: 'accordion', loreLabel: 'DYNAMIC RANGE CONDENSER', humanLabel: 'Compressor' },
    enabledSchema: { id: 'audioRig.compressor.enabled', type: 'toggle', humanLabel: 'Enabled' },
    params: [
      { field: 'threshold', schema: { id: 'compressor.threshold', type: 'sliderLinear', loreLabel: 'ATTENUATION THRESHOLD', humanLabel: 'Threshold', min: -60, max: 0, unit: 'dB' } },
      { field: 'ratio', schema: { id: 'compressor.ratio', type: 'stepper', loreLabel: 'COMPRESSION RATIO', humanLabel: 'Ratio', min: 1, max: 20 } },
      { field: 'attack', schema: { id: 'compressor.attack', type: 'sliderLog', loreLabel: 'COMPRESSION RATE', humanLabel: 'Attack', min: 0.001, max: 1, unit: 's' } },
      { field: 'release', schema: { id: 'compressor.release', type: 'sliderLog', loreLabel: 'RAREFACTION RATE', humanLabel: 'Release', min: 0.01, max: 1, unit: 's' } },
      { field: 'knee', schema: { id: 'compressor.knee', type: 'sliderLinear', loreLabel: 'CURVATURE DAMPING', humanLabel: 'Knee', min: 0, max: 40, unit: 'dB' } },
    ],
  },
  {
    key: 'filterLPF',
    accordion: { id: 'audioRig.filterLPF', type: 'accordion', loreLabel: 'HIGH-FREQUENCY MASK', humanLabel: 'Low-Pass Filter' },
    enabledSchema: { id: 'audioRig.filterLPF.enabled', type: 'toggle', humanLabel: 'Enabled' },
    params: [
      {
        field: 'frequency',
        schema: { id: 'filterLPF.frequency', type: 'sliderLog', loreLabel: 'CUTOFF FREQUENCY', humanLabel: 'Frequency', min: 20, max: 20000, unit: 'Hz' },
        lfoTarget: 'lpf.frequency',
        lfoAccordion: { id: 'audioRig.filterLPF.frequency.lfo', type: 'accordion', humanLabel: 'Modulation' },
      },
      {
        field: 'Q',
        schema: { id: 'filterLPF.Q', type: 'sliderLog', loreLabel: 'BOUNDARY RESONANCE', humanLabel: 'Resonance', min: 0.1, max: 20 },
        lfoTarget: 'lpf.Q',
        lfoAccordion: { id: 'audioRig.filterLPF.Q.lfo', type: 'accordion', humanLabel: 'Modulation' },
      },
    ],
  },
  // ...eq3, filterHPF, chorus, delay, reverb follow the same shape — see GLOBAL_CHAIN_GRID.md row-for-row.
];
```

`eq3.low/mid/high` use `sliderCenteredZero` (the grid marks EQ "SLIDER (Center-Zero)"), matching the `-12..12` dB range already on `EQ3Settings`.

`AudioRigDrawer.tsx` dispatches each param's `ControlSchema` to its primitive, disables per the bypass cascade (§ 3), and nests the `Lfo` control where `lfoTarget` is present:

```typescript
// src/components/panels/screen/console/AudioRigDrawer.tsx
import { useAudioStore } from '@/stores/audioStore';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { Toggle } from '@/components/ui/controls/Toggle';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderLog } from '@/components/ui/controls/SliderLog';
import { SliderCenteredZero } from '@/components/ui/controls/SliderCenteredZero';
import { Stepper } from '@/components/ui/controls/Stepper';
import { Lfo } from '@/components/ui/controls/Lfo';
import { AUDIO_RIG_CONFIG, type AudioRigParamSchema } from '@/data/audioRigConfig';
import './AudioRigDrawer.css';

function renderParamControl(param: AudioRigParamSchema, value: number, onChange: (v: number) => void, disabled: boolean) {
  switch (param.schema.type) {
    case 'sliderLinear': return <SliderLinear schema={param.schema} value={value} onChange={onChange} disabled={disabled} />;
    case 'sliderLog': return <SliderLog schema={param.schema} value={value} onChange={onChange} disabled={disabled} />;
    case 'sliderCenteredZero': return <SliderCenteredZero schema={param.schema} value={value} onChange={onChange} disabled={disabled} />;
    case 'stepper': return <Stepper schema={param.schema} value={value} onChange={onChange} disabled={disabled} />;
    default: return null; // exhaustiveness verified by audioRigConfig.test.ts, not a runtime concern here
  }
}

export function AudioRigDrawer() {
  const globalAudio = useAudioStore((s) => s.globalAudio);
  const globalLfo = useAudioStore((s) => s.globalLfo);
  const setGlobalAudio = useAudioStore((s) => s.setGlobalAudio);
  const setEffectEnabled = useAudioStore((s) => s.setEffectEnabled);
  const setGlobalBypassEnabled = useAudioStore((s) => s.setGlobalBypassEnabled);
  const setGlobalLfo = useAudioStore((s) => s.setGlobalLfo);

  const rigDisabled = globalAudio.globalBypass;

  return (
    <div className="audio-rig-drawer">
      <div className="audio-rig-drawer__master-row">
        <Toggle
          schema={{ id: 'audioRig.globalBypass', type: 'toggle', humanLabel: 'Bypass' }}
          value={globalAudio.globalBypass}
          onChange={setGlobalBypassEnabled}
        />
      </div>
      {AUDIO_RIG_CONFIG.map((block) => {
        const effect = globalAudio[block.key];
        const blockDisabled = rigDisabled || !effect.enabled;
        return (
          <div className="audio-rig-drawer__effect-block" key={block.key}>
            <div className="audio-rig-drawer__effect-header">
              <Toggle
                schema={block.enabledSchema}
                value={effect.enabled}
                onChange={(enabled) => setEffectEnabled(block.key, enabled)}
                disabled={rigDisabled}
              />
            </div>
            <AccordionContainer schema={block.accordion}>
              {block.params.map((param) => (
                <div className="audio-rig-drawer__param-row" key={param.field}>
                  {renderParamControl(
                    param,
                    (effect as Record<string, number>)[param.field],
                    (v) => setGlobalAudio(block.key, { [param.field]: v }),
                    blockDisabled,
                  )}
                  {param.lfoTarget && param.lfoAccordion && (
                    <AccordionContainer schema={param.lfoAccordion}>
                      <Lfo
                        schema={{ id: `${param.schema.id}.lfo`, type: 'lfo' }}
                        value={globalLfo[param.lfoTarget]}
                        onChange={(v) => setGlobalLfo(param.lfoTarget!, v)}
                      />
                    </AccordionContainer>
                  )}
                </div>
              ))}
            </AccordionContainer>
          </div>
        );
      })}
    </div>
  );
}
```

`audioStore.ts`'s extension mirrors `regenerateGlobalAudioFromSeed`'s existing inline-call style — the setter updates Zustand, then pushes the same change straight into the engine, no `subscribe()` middle layer:

```typescript
// src/stores/audioStore.ts (excerpt)
const GLOBAL_SETTER: Record<EffectKey, (params: Partial<GlobalAudioSettings[EffectKey]>) => void> = {
  compressor: AudioEngine.setGlobalCompressor,
  eq3: AudioEngine.setGlobalEQ,
  filterLPF: AudioEngine.setGlobalFilterLPF,
  filterHPF: AudioEngine.setGlobalFilterHPF,
  chorus: AudioEngine.setGlobalChorus,
  delay: AudioEngine.setGlobalDelay,
  reverb: AudioEngine.setGlobalReverb,
};
/** EffectKey -> AudioEngine.setEffectBypass's short-form key, same mapping BYPASS_EFFECT_KEYS already implies. */
const BYPASS_KEY: Record<EffectKey, 'compressor' | 'eq3' | 'lpf' | 'hpf' | 'chorus' | 'delay' | 'reverb'> = {
  compressor: 'compressor', eq3: 'eq3', filterLPF: 'lpf', filterHPF: 'hpf', chorus: 'chorus', delay: 'delay', reverb: 'reverb',
};

setGlobalAudio: (effect, partial) => {
  set((state) => ({
    globalAudio: { ...state.globalAudio, [effect]: { ...(state.globalAudio[effect] as object), ...partial } },
  }));
  GLOBAL_SETTER[effect](partial as never);
},

setEffectEnabled: (effect, enabled) => {
  set((state) => ({ globalAudio: { ...state.globalAudio, [effect]: { ...state.globalAudio[effect], enabled } } }));
  AudioEngine.setEffectBypass(BYPASS_KEY[effect], enabled);
},

setGlobalBypassEnabled: (bypass) => {
  set((state) => ({ globalAudio: { ...state.globalAudio, globalBypass: bypass } }));
  AudioEngine.setGlobalBypass(bypass);
},

setGlobalLfo: (target, value) => {
  set((state) => ({ globalLfo: { ...state.globalLfo, [target]: value } }));
  lfoEngine.setLfoShape(target, value.shape);
  lfoEngine.setLfoRate(target, value.rate);
  lfoEngine.setLfoDepth(target, value.depth);
  if (value.active) {
    if (lfoEngine.connectLfoTarget(target)) lfoEngine.start(target);
  } else {
    lfoEngine.disconnectLfoTarget(target);
    lfoEngine.stop(target);
  }
},
```

`globalAudioSeed.ts`'s new function follows `generateGlobalAudioSettings`'s exact shape — same noise map, same `getSeededVal` dot-namespacing convention, one new field added for `active`:

```typescript
// src/utils/globalAudioSeed.ts (addition)
import { GLOBAL_LFO_TARGET_IDS, LFO_RATE_MIN, LFO_RATE_MAX, LFO_DEPTH_MIN, LFO_DEPTH_MAX, LFO_SHAPES, type GlobalLfoTargetId, type LfoSettings } from '@/types/lfo';

export function generateGlobalLfoSettings(planetId: string, planetName: string): Record<GlobalLfoTargetId, LfoSettings & { active: boolean }> {
  const noiseMap = getPlanetNoiseMap(planetId, planetName);
  const result = {} as Record<GlobalLfoTargetId, LfoSettings & { active: boolean }>;

  for (const target of GLOBAL_LFO_TARGET_IDS) {
    const rateT = getSeededVal(noiseMap, `globalLfo.${target}.rate`, 0, 0, 1);
    const depthT = getSeededVal(noiseMap, `globalLfo.${target}.depth`, 0, 0, 1);
    const shapeT = getSeededVal(noiseMap, `globalLfo.${target}.shape`, 0, 0, 1);
    const activeT = getSeededVal(noiseMap, `globalLfo.${target}.active`, 0, 0, 1);

    result[target] = {
      rate: LFO_RATE_MIN + (LFO_RATE_MAX - LFO_RATE_MIN) * rateT,
      depth: LFO_DEPTH_MIN + (LFO_DEPTH_MAX - LFO_DEPTH_MIN) * depthT,
      shape: LFO_SHAPES[Math.min(LFO_SHAPES.length - 1, Math.floor(shapeT * LFO_SHAPES.length))],
      active: activeT >= 0.5, // resolve the exact threshold/probability in Plan — 0.5 is a placeholder, not confirmed
    };
  }
  return result;
}
```

* **Naming Conventions:**
  * Data configs: camelCase (`audioRigConfig.ts`), matching `lfoConfig.ts`/`globalAudioSeedRanges.ts`.
  * Store actions: verb-first, matching `audioStore.ts`'s existing `setBPM`/`setMuted` style (`setEffectEnabled`, `setGlobalBypassEnabled`, `setGlobalLfo`).
  * Components: PascalCase (`AudioRigDrawer.tsx`), CSS class prefix `audio-rig-drawer` (BEM-ish, matching `console-panel__*`'s existing pattern in `ConsolePanel.css`) for drawer-owned layout classes — the `sc-*` prefix stays reserved for the Phase 1 primitives themselves, not their consumers.
* **Formatting:** Plain named function component export (not `React.FC`), co-located `AudioRigDrawer.css`, zero inline style objects.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate (`audioRigConfig.ts` → `.test.ts`, `AudioRigDrawer.tsx` → `.test.tsx`).
* **Coverage targets specific to this phase:**
  1. `SliderLinear.test.tsx`/`SliderLog.test.tsx`/`SliderCenteredZero.test.tsx`/`Toggle.test.tsx` (extend) — `disabled` prop passes through to the underlying Radix root, is `false` by default (no existing test's assertions change), and a disabled control's `onChange` doesn't fire on interaction.
  2. `audioRigConfig.test.ts` — all 7 effects present with the grid's exact label/unit/range/default per param (spot-check every row against `GLOBAL_CHAIN_GRID.md`, not just a count); exactly the 9 grid-flagged rows carry `lfoTarget`, and each `lfoTarget` is a valid `GlobalLfoTargetId`.
  3. `globalAudioSeed.test.ts` (extend) — `generateGlobalLfoSettings` is deterministic (same planet → identical output every call); `rate`/`depth` stay within `LFO_RATE_MIN/MAX`/`LFO_DEPTH_MIN/MAX`; `shape` is always a valid `LfoShape`; `active` varies across differently-seeded planets (not always the same value).
  4. `audioStore.test.ts` (extend, mock `AudioEngine` and `lfoEngine` per the existing `vi.mock` pattern) — `setGlobalAudio` both updates state and calls the matching `GLOBAL_SETTER` entry; `setEffectEnabled`/`setGlobalBypassEnabled` call `setEffectBypass`/`setGlobalBypass` with the right key/value; `setGlobalLfo` calls `setLfoShape`/`setLfoRate`/`setLfoDepth` always, and `connectLfoTarget`+`start` only when `active: true`, `disconnectLfoTarget`+`stop` when `false`; planet-sync seeds `globalLfo` alongside `globalAudio` and connects every target that seeds `active: true`.
  5. `AudioRigDrawer.test.tsx` — renders all 7 accordions with the config's labels; toggling a param control calls `setGlobalAudio` with the right effect/field/value; toggling an effect's own bypass calls `setEffectEnabled` and disables (`aria-disabled`/`disabled`) that effect's other controls; toggling the rig-wide bypass disables all 7 effects' own toggles; the 9 nested LFO accordions render `Lfo` bound to `globalLfo[target]`, and toggling `Lfo`'s active control calls `setGlobalLfo` with `active` flipped.
  6. `ConsolePanel.test.tsx` (update) — the "renders the carried-forward stub content for audioRig" test is replaced with an assertion that `AudioRigDrawer` (or one of its accordions) renders instead.
  7. Basic a11y: every `Toggle`/slider/stepper resolves a real accessible name via the existing `resolveAccessibleName` path (no new mechanism needed — schemas already carry `humanLabel`).
* **Manual/audible check (not automated):** after wiring, start audio (`AudioEngine.start()` via the existing power-on gesture) and confirm at least one slider drag is audible, one per-effect bypass audibly silences that effect, the rig-wide bypass audibly silences everything, and a planet that seeds at least one `active: true` LFO is audibly modulating without touching any control.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/audio-rig`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences (e.g. `Add audioRigConfig with 7 effect block schemas`), roughly one commit per file group in § 2 (config+test, seed function+test, store extension+test, drawer+test, ConsolePanel wiring).

---

## 7. Open Questions & Risks

Carried forward from Specify — resolve in the Plan/Tasks phase before implementation, not silently during coding:

1. **Roadmap doc-fix, exact wording.** `roadmap.md § 4`'s "About" text currently reads the phase as leaving "clean parameter IDs ready for Web Audio setter bindings in subsequent phases" and never mentions LFO seeding. The Plan phase should draft the corrected paragraph (both the stale-framing fix and the new LFO-seeding sentence) rather than leaving it to be improvised during implementation — this is a small, self-contained doc edit, not a scope change to actually verify against.
2. **`AudioEngine.start()` re-triggering seeded-active LFOs — real gap, not yet resolved.** `lfoEngine.start()` no-ops unless a node already exists *and* `Tone.getTransport().state === 'started'`. If `audioStore`'s planet-sync (which can run at module load, before the user's power-on gesture) calls `connectLfoTarget`+`start` for a seeded-active target, `start()` will silently no-op — the LFO is connected but never actually ticking. `AudioEngine.start()` already reaches into a Zustand store directly today (`useLocaleStore.getState().setLocaleData(...)` in its own body), so the precedent for it to read `useAudioStore.getState().globalLfo` and call `lfoEngine.start(target)` for every target marked `active: true`, right after `transport.start()` succeeds, is consistent with existing code — but confirm this is the right seam (vs., say, a `usePlanetStore`/transport-state subscription elsewhere) during Plan, not assumed here.
3. **`generateGlobalLfoSettings`'s `active` seeding threshold.** § 4's snippet uses `activeT >= 0.5` (a flat 50/50 split) as a placeholder. Confirm during Plan whether that's the intended density of "planets with at least one already-modulating effect" — a flat 50% per *target* means most planets will have several concurrently active LFOs (9 independent coin-flips), which may be more activity than intended for a first pass.
4. **`renderParamControl`'s exhaustiveness isn't compiler-enforced.** Its `switch` only covers the 4 `ControlSchema` variants `GLOBAL_CHAIN_GRID.md` actually uses (`sliderLinear`/`sliderLog`/`sliderCenteredZero`/`stepper`) — unlike `CONTROL_SCHEMA_TYPES`' full-union exhaustiveness pattern (`controls.test.ts`), a schema of any other variant silently renders nothing rather than erroring. `audioRigConfig.test.ts` (§ 5.1) is what actually guards against this in practice, by asserting the closed set of UI-column values `GLOBAL_CHAIN_GRID.md` specifies. Acceptable for this phase's closed data set; flag if `audioRigConfig.ts` ever grows a param the grid doesn't cover.
5. **LFO controls stay enabled while their parent effect is bypassed.** A user can still drag a modulatable param's `Lfo` shape/rate/depth/active while that effect's own bypass is off — the settings apply and the LFO connects, but with the effect bypassed, the modulation target itself is silenced (EQ bands zeroed, filter frequency at passthrough, per `setEffectBypass`'s own implementation), so it's inert rather than actually wrong, just not visually disabled. Confirm during Plan whether this is acceptable for this phase or whether `Lfo`/`RadioButton` should gain `disabled` support too (two more already-shipped primitives touched, beyond the four in § 2/§ 3).
