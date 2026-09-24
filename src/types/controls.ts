/**
 * ControlSchema types, resolving docs/tasks/ARCHITECTURE_AND_COMPONENTS_PLAN.md
 * Task 1. One interface per stateless UI primitive (docs/specs/
 * ARCHITECTURE_AND_COMPONENTS.md §4) — every later drawer phase (Audio Rig,
 * Sector Settings, Robot Options) renders its content through these schemas
 * instead of hardcoded JSX. Bounds/options trace to
 * docs/reference/ROBOT_DATA_GRID.md's Component column.
 */
import type { LfoSettings } from './lfo';

// ========================================
// BASE
// ========================================

export interface ControlSchemaBase {
  id: string;
  /** Both optional — a schema entry may supply neither, either, or both.
   *  Rendered by this control's own internally-composed <DualLabel />. */
  loreLabel?: string;
  humanLabel?: string;
}

// ========================================
// VARIANTS
// ========================================

export interface StepperSchema extends ControlSchemaBase {
  type: 'stepper';
  min: number;
  max: number;
  step?: number;
}

export interface StepperWithToggleSchema extends ControlSchemaBase {
  type: 'stepperToggle';
  min: number;
  max: number;
}

/**
 * Rendering orientation for the 3 slider primitives (SliderLinear/SliderLog/
 * SliderCenteredZero) — docs/specs/VERTICAL_SLIDERS.md. 'horizontal'/'vertical'
 * render fixed; 'auto' resolves at render time via useAutoSliderOrientation,
 * measuring the slider's parent element and picking whichever axis is longer.
 */
export type SliderOrientation = 'horizontal' | 'vertical' | 'auto';

/**
 * On a `'vertical'` (or auto-resolved-to-vertical) slider, the box-fitting
 * BUDGET its component forwards to `useVoxelTrackSlider` — never a live
 * measurement of the real container (roadmap 13: that was tried and reverted,
 * see `useVoxelTrackBoxCount.ts`'s own comment). Omitted, it falls back to
 * `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` (256px) — the same value every real
 * schema below sets explicitly today, so it's tunable per-schema without
 * touching the slider components themselves once a given panel's real
 * available height turns out to need something smaller. Meaningless for a
 * schema that only ever renders horizontal.
 */
export interface SliderVerticalHeightProp {
  verticalHeight?: number;
}

export interface SliderLinearSchema extends ControlSchemaBase, SliderVerticalHeightProp {
  type: 'sliderLinear';
  min: number;
  max: number;
  step?: number;
  unit?: string;
  orientation: SliderOrientation;
}

export interface SliderLogSchema extends ControlSchemaBase, SliderVerticalHeightProp {
  type: 'sliderLog';
  min: number;
  max: number;
  unit?: string;
  orientation: SliderOrientation;
}

export interface SliderCenteredZeroSchema extends ControlSchemaBase, SliderVerticalHeightProp {
  type: 'sliderCenteredZero';
  min: number; // negative bound, e.g. -50
  max: number; // positive bound, e.g. +50
  step?: number;
  unit?: string;
  orientation: SliderOrientation;
}

export interface RadioButtonSchema extends ControlSchemaBase {
  type: 'radio';
  /** color is optional and additive (docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.3) — an
   *  option that sets it gets that hex scoped to its own CabinetBox via getRobotColorStyle
   *  (rest-state hint + a stronger tint when selected, through the same ambient-CSS-custom-
   *  property mechanism every other trait/identity color already uses); an option that omits it
   *  keeps today's ambient-accent fallback exactly as before. */
  options: { value: string; label: string; color?: string }[];
}

export interface ToggleSchema extends ControlSchemaBase {
  type: 'toggle';
}

export interface TextInputSchema extends ControlSchemaBase {
  type: 'textInput';
  placeholder?: string;
  maxLength?: number;
}

export interface CoordsInputSchema extends ControlSchemaBase {
  type: 'coordsInput';
}

export interface ButtonSchema extends ControlSchemaBase {
  type: 'button';
}

export interface DualLabelSchema extends ControlSchemaBase {
  type: 'dualLabel';
}

export interface AccordionSchema extends ControlSchemaBase {
  type: 'accordion';
}

export interface LfoSchema extends ControlSchemaBase {
  type: 'lfo';
}

/** Layout axis for DirectionalPanel — mirrors SliderOrientation's own precedent
 *  as a named, exported union rather than an inline literal type. Optional on
 *  the schema (unlike SliderOrientation, which is required): omitting it
 *  defaults to 'row' in the component, not the type. 'auto' resolves at render
 *  time via useAutoPanelOrientation, measuring the panel's own parent element
 *  and going 'row' once it's wide enough, 'column' otherwise — the panel-level
 *  counterpart to SliderOrientation's own 'auto' (docs/tasks/
 *  DIRECTIONAL_PANEL_WIRING.md follow-up fix). 'responsive' resolves via
 *  useResponsivePanelOrientation instead: the same fixed mobile/tablet/desktop
 *  viewport tier CabinetBox sizing already uses, never a per-parent
 *  measurement — every 'responsive' panel resolves identically ('column' on
 *  mobile/tablet, 'row' on desktop), unlike 'auto', which can resolve
 *  differently per instance depending on how much room that instance's own
 *  parent has (docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.2). */
export type PanelOrientation = 'row' | 'column' | 'auto' | 'responsive';

/** Pure layout container — groups already-rendered controls into a row or
 *  column flex box. No value/onChange: docs/specs/DIRECTIONAL_PANEL.md. */
export interface DirectionalPanelSchema extends ControlSchemaBase {
  type: 'directionalPanel';
  orientation?: PanelOrientation;
}

export type ControlSchema =
  | StepperSchema | StepperWithToggleSchema
  | SliderLinearSchema | SliderLogSchema | SliderCenteredZeroSchema
  | RadioButtonSchema | ToggleSchema | TextInputSchema | CoordsInputSchema
  | ButtonSchema | DualLabelSchema | AccordionSchema | LfoSchema
  | DirectionalPanelSchema;

/** Every ControlSchema discriminant, paired with the union per the pattern
 *  src/types/lfo.ts established (LFO_SHAPES, ROBOT_LFO_TARGET_IDS) — makes
 *  "all 14 variants covered, no duplicates" a runtime-testable assertion. */
export const CONTROL_SCHEMA_TYPES: readonly ControlSchema['type'][] = [
  'stepper', 'stepperToggle',
  'sliderLinear', 'sliderLog', 'sliderCenteredZero',
  'radio', 'toggle', 'textInput', 'coordsInput',
  'button', 'dualLabel', 'accordion', 'lfo',
  'directionalPanel',
];

// ========================================
// LFO VALUE
// ========================================

/** Lfo component's controlled value — a plain alias of the real engine type
 *  (Phase 0). No longer carries `active`: the OSCILLATION STATE toggle was
 *  removed, and rate=0 is now the "off" signal instead of a separate flag. */
export type LfoValue = LfoSettings;
