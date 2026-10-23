import { cloneElement, type ReactElement } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { SliderLinear } from './SliderLinear';
import { SliderLog } from './SliderLog';
import { SliderCenteredZero } from './SliderCenteredZero';
import { RadioButton } from './RadioButton';
import { Toggle } from './Toggle';
import { TextInput } from './TextInput';
import { CoordsInput } from './CoordsInput';
import { Stepper } from './Stepper';
import { StepperWithToggle } from './StepperWithToggle';
import { LfoLink } from './LfoLink';
import { TempoSyncToggle } from './TempoSyncToggle';
import { DirectionalPanel } from './DirectionalPanel';
import { Button } from './Button';
import { CONTENT, fill, labels } from '@/content';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 12: every primitive that composes DualLabel for its own label row
 * passes `schema.help` through, so the "?" appears wherever a control's content entry has help. One
 * never shows one: Button draws its label inside its own trigger, and a "?" there would be a button
 * inside a button.
 */

const HELP = { human: 'What this control does.' };
const NAME = 'Probe Dial';
const base = { id: 'test.control', humanLabel: NAME, loreLabel: 'LORE DIAL', help: HELP };
const helpButton = () => screen.getByRole('button', { name: fill('ui.help', { name: NAME }) });
const noop = () => {};

const CASES: [string, () => ReactElement][] = [
  ['SliderLinear', () => <SliderLinear schema={{ ...base, type: 'sliderLinear', min: 0, max: 10, orientation: 'horizontal' }} value={2} onChange={noop} />],
  ['SliderLog', () => <SliderLog schema={{ ...base, type: 'sliderLog', min: 1, max: 100, orientation: 'horizontal' }} value={10} onChange={noop} />],
  ['SliderCenteredZero', () => <SliderCenteredZero schema={{ ...base, type: 'sliderCenteredZero', min: -10, max: 10, orientation: 'horizontal' }} value={0} onChange={noop} />],
  ['RadioButton', () => <RadioButton schema={{ ...base, type: 'radio', options: [{ value: 'a', humanLabel: 'One' }, { value: 'b', humanLabel: 'Two' }] }} value="a" onChange={noop} />],
  ['Toggle', () => <Toggle schema={{ ...base, type: 'toggle' }} value={false} onChange={noop} />],
  ['TextInput', () => <TextInput schema={{ ...base, type: 'textInput' }} value="" onChange={noop} />],
  ['CoordsInput', () => <CoordsInput schema={{ ...base, type: 'coordsInput' }} value={{ x: 0, y: 0 }} onChange={noop} />],
  ['Stepper', () => <Stepper schema={{ ...base, type: 'stepper', min: 0, max: 4 }} value={1} onChange={noop} />],
  ['StepperWithToggle', () => <StepperWithToggle schema={{ ...base, type: 'stepperToggle', min: 0, max: 4 }} value={{ active: true, value: 1 }} onChange={noop} />],
  ['LfoLink', () => <LfoLink schema={{ ...base, type: 'lfoLink' }} value={{ lane: null, depth: 0 }} onChange={noop} />],
  ['DirectionalPanel', () => <DirectionalPanel schema={{ ...base, type: 'directionalPanel', orientation: 'column' }}><p>body</p></DirectionalPanel>],
];

describe('help on control labels', () => {
  it.each(CASES)('%s passes schema.help to its label', (_, make) => {
    render(make());
    expect(helpButton()).toBeTruthy();
  });

  it.each(CASES)('%s shows no "?" when its schema has no help', (_, make) => {
    const element = make() as ReactElement<{ schema: Record<string, unknown> }>;
    render(cloneElement(element, { schema: { ...element.props.schema, help: undefined } }));
    expect(screen.queryByRole('button', { name: fill('ui.help', { name: NAME }) })).toBeNull();
  });

  it("TempoSyncToggle's label carries ui.tempoSync's own help", () => {
    render(<TempoSyncToggle schemaId="lfoBank.a.rate" synced={false} onChange={noop} />);
    expect(screen.getByRole('button', { name: fill('ui.help', { name: CONTENT['ui.tempoSync'].human }) })).toBeTruthy();
  });

  it("LfoLink's Lane and Depth rows carry their own content help", () => {
    render(<LfoLink schema={{ id: 'test.link', type: 'lfoLink' }} value={{ lane: 'a', depth: 40 }} onChange={noop} />);
    expect(screen.getByRole('button', { name: fill('ui.help', { name: labels('ui.lfoLane').humanLabel }) })).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('ui.help', { name: labels('ui.lfo.depth').humanLabel }) })).toBeTruthy();
  });

  it("a read-only slider is a readout (role=status), and a readout's label takes no \"?\"", () => {
    render(<SliderLinear schema={{ ...base, type: 'sliderLinear', min: 0, max: 10, orientation: 'horizontal' }} value={2} onChange={noop} readOnly />);
    expect(within(screen.getByRole('status')).queryByRole('button')).toBeNull();
  });

  it('a radio option never takes the "?" — it stays on the control\'s own label', () => {
    render(<RadioButton schema={{ ...base, type: 'radio', options: [{ value: 'a', humanLabel: 'One', loreLabel: 'ONE' }] }} value="a" onChange={noop} />);
    expect(screen.getAllByRole('button', { name: /^Help/ })).toHaveLength(1);
  });

  it('Button never shows a "?" — its label is inside the button', () => {
    render(<Button schema={{ ...base, type: 'button' }} onClick={noop} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
