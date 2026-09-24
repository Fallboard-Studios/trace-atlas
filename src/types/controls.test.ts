// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  CONTROL_SCHEMA_TYPES,
  type ControlSchema,
  type StepperSchema,
  type StepperWithToggleSchema,
  type SliderLinearSchema,
  type SliderLogSchema,
  type SliderCenteredZeroSchema,
  type SliderOrientation,
  type RadioButtonSchema,
  type ToggleSchema,
  type TextInputSchema,
  type CoordsInputSchema,
  type ButtonSchema,
  type DualLabelSchema,
  type AccordionSchema,
  type LfoSchema,
  type DirectionalPanelSchema,
  type PanelOrientation,
  type LfoValue,
} from './controls';

// ========================================
// TESTS
// ========================================

describe('CONTROL_SCHEMA_TYPES', () => {
  it('has exactly 14 entries, no duplicates', () => {
    expect(CONTROL_SCHEMA_TYPES).toHaveLength(14);
    expect(new Set(CONTROL_SCHEMA_TYPES).size).toBe(14);
  });

  it('matches the ControlSchema union discriminants exactly', () => {
    expect([...CONTROL_SCHEMA_TYPES].sort()).toEqual(
      [
        'stepper', 'stepperToggle',
        'sliderLinear', 'sliderLog', 'sliderCenteredZero',
        'radio', 'toggle', 'textInput', 'coordsInput',
        'button', 'dualLabel', 'accordion', 'lfo',
        'directionalPanel',
      ].sort()
    );
  });
});

describe('ControlSchema variants', () => {
  it('accepts one literal object per variant, each optional loreLabel/humanLabel omitted', () => {
    const stepper: StepperSchema = { id: 'density', type: 'stepper', min: 1, max: 16 };
    const stepperToggle: StepperWithToggleSchema = { id: 'noteVariance', type: 'stepperToggle', min: 1, max: 8 };
    const sliderLinear: SliderLinearSchema = { id: 'lfoRate', type: 'sliderLinear', min: 0.1, max: 10, orientation: 'horizontal' };
    const sliderLog: SliderLogSchema = { id: 'attack', type: 'sliderLog', min: 0, max: 10, orientation: 'horizontal' };
    const sliderCenteredZero: SliderCenteredZeroSchema = { id: 'detune', type: 'sliderCenteredZero', min: -50, max: 50, orientation: 'horizontal' };
    const radio: RadioButtonSchema = { id: 'lfoShape', type: 'radio', options: [{ value: 'sine', label: 'SINE' }] };
    const toggle: ToggleSchema = { id: 'layerActive', type: 'toggle' };
    const textInput: TextInputSchema = { id: 'robotName', type: 'textInput' };
    const coordsInput: CoordsInputSchema = { id: 'sectorCoords', type: 'coordsInput' };
    const button: ButtonSchema = { id: 'resetMelody', type: 'button' };
    const dualLabel: DualLabelSchema = { id: 'jobData', type: 'dualLabel' };
    const accordion: AccordionSchema = { id: 'pingControls', type: 'accordion' };
    const lfo: LfoSchema = { id: 'volumeLfo', type: 'lfo' };
    const directionalPanel: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel', orientation: 'row' };

    const variants: ControlSchema[] = [
      stepper, stepperToggle, sliderLinear, sliderLog, sliderCenteredZero,
      radio, toggle, textInput, coordsInput, button, dualLabel, accordion, lfo,
      directionalPanel,
    ];

    expect(variants).toHaveLength(14);
  });

  it('accepts loreLabel and/or humanLabel on the shared base, both optional', () => {
    const neither: ButtonSchema = { id: 'a', type: 'button' };
    const lore: ButtonSchema = { id: 'b', type: 'button', loreLabel: 'CALIBRATE PING' };
    const human: ButtonSchema = { id: 'c', type: 'button', humanLabel: 'Reset Melody' };
    const both: ButtonSchema = { id: 'd', type: 'button', loreLabel: 'CALIBRATE PING', humanLabel: 'Reset Melody' };

    expect(neither.loreLabel).toBeUndefined();
    expect(lore.loreLabel).toBe('CALIBRATE PING');
    expect(human.humanLabel).toBe('Reset Melody');
    expect(both.loreLabel).toBe('CALIBRATE PING');
    expect(both.humanLabel).toBe('Reset Melody');
  });
});

describe('SliderOrientation', () => {
  it('accepts horizontal, vertical, and auto as literal values', () => {
    const values: SliderOrientation[] = ['horizontal', 'vertical', 'auto'];
    expect(values).toHaveLength(3);
  });

  it('is accepted as the optional orientation field on all 3 slider schema variants', () => {
    const linear: SliderLinearSchema = { id: 'a', type: 'sliderLinear', min: 0, max: 1, orientation: 'vertical' };
    const log: SliderLogSchema = { id: 'b', type: 'sliderLog', min: 0, max: 1, orientation: 'auto' };
    const centeredZero: SliderCenteredZeroSchema = { id: 'c', type: 'sliderCenteredZero', min: -1, max: 1, orientation: 'horizontal' };

    expect(linear.orientation).toBe('vertical');
    expect(log.orientation).toBe('auto');
    expect(centeredZero.orientation).toBe('horizontal');
  });

  it('accepts an optional step field on SliderCenteredZeroSchema, unset by default', () => {
    const noStep: SliderCenteredZeroSchema = { id: 'detune', type: 'sliderCenteredZero', min: -50, max: 50, orientation: 'horizontal' };
    const withStep: SliderCenteredZeroSchema = { id: 'eq3Low', type: 'sliderCenteredZero', min: -12, max: 12, step: 0.5, orientation: 'horizontal' };

    expect(noStep.step).toBeUndefined();
    expect(withStep.step).toBe(0.5);
  });
});

describe('PanelOrientation', () => {
  it('accepts row, column, auto, and responsive as literal values', () => {
    const values: PanelOrientation[] = ['row', 'column', 'auto', 'responsive'];
    expect(values).toHaveLength(4);
  });

  it('is optional on DirectionalPanelSchema — omitting it still type-checks', () => {
    const withOrientation: DirectionalPanelSchema = { id: 'a', type: 'directionalPanel', orientation: 'column' };
    const withoutOrientation: DirectionalPanelSchema = { id: 'b', type: 'directionalPanel' };

    expect(withOrientation.orientation).toBe('column');
    expect(withoutOrientation.orientation).toBeUndefined();
  });
});

describe('LfoValue', () => {
  it('is a plain alias of LfoSettings — no separate active flag', () => {
    const value: LfoValue = { shape: 'triangle', rate: 2, depth: 40 };
    expect(value.shape).toBe('triangle');
    expect('active' in value).toBe(false);
  });
});
