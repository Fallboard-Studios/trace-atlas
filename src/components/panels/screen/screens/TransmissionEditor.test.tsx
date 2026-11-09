import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/*
 * docs/tasks/OFF_SCREEN_CONSOLE.md Task 4 (spec §1.2): the New Transmission editor — a titled group with Scan in its
 * title row, a style name input and the coordinates, holding a draft of the identity it is handed. The draft follows a
 * new identity; typing moves the draft alone.
 */
import { TransmissionEditor, type EditorIdentity } from './TransmissionEditor';
import { CONTENT } from '@/content';
import * as seedUtils from '@/utils/seedUtils';

const human = (key: keyof typeof CONTENT) => CONTENT[key].human;
const LIVE: EditorIdentity = { attenuationStyleName: 'live-as', coordinates: { x: 1, y: 2 } };

function renderEditor(identity: EditorIdentity = LIVE, { selected = false, onScan = vi.fn(), onCommit = vi.fn() } = {}) {
  const result = render(<TransmissionEditor identity={identity} selected={selected} onCommit={onCommit} onScan={onScan} />);
  /** The same editor handed a new identity. */
  const handOver = (next: EditorIdentity) =>
    result.rerender(<TransmissionEditor identity={next} selected={selected} onCommit={onCommit} onScan={onScan} />);
  return { ...result, onScan, onCommit, handOver };
}

const editor = () => screen.getByRole('group', { name: human('home.off.newTransmission') });
const styleInput = () => screen.getByRole('textbox') as HTMLInputElement;
const coordInputs = () => screen.getAllByRole('spinbutton') as HTMLInputElement[];
const shown = () => ({ name: styleInput().value, x: coordInputs()[0].value, y: coordInputs()[1].value });
const scan = () => screen.getByRole('button', { name: human('home.off.scan') });

describe('TransmissionEditor', () => {
  it('is a group titled New Transmission, with Scan in its title row', () => {
    renderEditor();
    expect(editor().textContent).toContain(human('home.off.newTransmission'));
    expect(editor().contains(scan())).toBe(true);
    expect(editor().querySelector('.transmission-editor__title')!.contains(scan())).toBe(true);
  });

  it('shows the identity it is handed in its inputs', () => {
    renderEditor();
    expect(shown()).toEqual({ name: 'live-as', x: '1', y: '2' });
  });

  it('typing a name or a coordinate moves the draft, not the identity', () => {
    const identity = structuredClone(LIVE);
    renderEditor(identity);
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    fireEvent.change(coordInputs()[1], { target: { value: '-40' } });
    expect(shown()).toEqual({ name: 'typed', x: '1', y: '-40' });
    expect(identity).toEqual(LIVE);
  });

  it('an empty name is a draft too: the field may be cleared', () => {
    renderEditor();
    fireEvent.change(styleInput(), { target: { value: '' } });
    expect(styleInput().value).toBe('');
  });

  it('a new identity re-syncs an untouched draft', () => {
    const { handOver } = renderEditor();
    handOver({ attenuationStyleName: 'landed', coordinates: { x: -7, y: 30 } });
    expect(shown()).toEqual({ name: 'landed', x: '-7', y: '30' });
  });

  it('the same identity as a fresh object leaves a typed draft alone', () => {
    const { handOver } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    handOver(structuredClone(LIVE));
    expect(styleInput().value).toBe('typed');
  });

  it('Scan calls onScan and nothing else: the draw is the caller’s', () => {
    const { onScan } = renderEditor();
    fireEvent.click(scan());
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(shown()).toEqual({ name: 'live-as', x: '1', y: '2' });
  });

  it('Scan is a flat, muted button', () => {
    renderEditor();
    expect(scan().classList.contains('sc-button--muted')).toBe(true);
    expect(scan().querySelector('[class*="sc-cabinet-box"]')).toBeNull();
  });

  // Checkpoint A (Crawford): the three fields share one panel — one static cabinet facade — under the title row, where
  // each drew its own and the editor took too much room.
  it('frames its three fields in one panel: one cabinet box, under the title row, and no field facade of their own', () => {
    renderEditor();
    const boxes = editor().querySelectorAll('.sc-cabinet-box');
    expect(boxes).toHaveLength(1);
    const panel = editor().querySelector('.transmission-editor__panel')!;
    expect(panel.contains(boxes[0])).toBe(true);
    expect(editor().querySelectorAll('.sc-text-input-facade')).toHaveLength(0);
    for (const input of [styleInput(), ...coordInputs()]) expect(boxes[0].contains(input)).toBe(true);
    expect(panel.contains(scan())).toBe(false);
    expect(editor().querySelector('.transmission-editor__title')!.nextElementSibling).toBe(panel);
  });

  it('wears data-selected only while selected', () => {
    const { rerender, onScan, onCommit } = renderEditor(LIVE, { selected: true });
    expect(editor().hasAttribute('data-selected')).toBe(true);
    rerender(<TransmissionEditor identity={LIVE} selected={false} onCommit={onCommit} onScan={onScan} />);
    expect(editor().hasAttribute('data-selected')).toBe(false);
  });
});

/*
 * docs/tasks/OFF_SCREEN_CONSOLE.md Task 5 (spec §1.2): a commit is Enter in any input or a blur out of the group, and an
 * unchanged draft commits nothing. A sync never overwrites a draft the user is mid-edit on; a commit makes the draft the
 * baseline again, so the next identity lands.
 */
describe('TransmissionEditor — the commit and the mid-edit draft (console Task 5)', () => {
  const enter = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });

  it('Enter in the name input commits the draft, once', () => {
    const { onCommit } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    enter(styleInput());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ attenuationStyleName: 'typed', coordinates: { x: 1, y: 2 } });
    enter(styleInput());
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('Enter in a coordinate input commits the draft, both fields as typed', () => {
    const { onCommit } = renderEditor();
    fireEvent.change(coordInputs()[0], { target: { value: '9' } });
    fireEvent.change(coordInputs()[1], { target: { value: '-3' } });
    enter(coordInputs()[1]);
    expect(onCommit).toHaveBeenCalledWith({ attenuationStyleName: 'live-as', coordinates: { x: 9, y: -3 } });
  });

  it('a blank name commits as blank', () => {
    const { onCommit } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: '' } });
    enter(styleInput());
    expect(onCommit).toHaveBeenCalledWith({ attenuationStyleName: '', coordinates: { x: 1, y: 2 } });
  });

  it('an unchanged draft commits nothing, by Enter or by blur', () => {
    const { onCommit } = renderEditor();
    enter(styleInput());
    fireEvent.blur(styleInput(), { relatedTarget: null });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a draft typed back to the identity commits nothing', () => {
    const { onCommit } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    fireEvent.change(styleInput(), { target: { value: 'live-as' } });
    enter(styleInput());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('other keys commit nothing', () => {
    const { onCommit } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    fireEvent.keyDown(styleInput(), { key: 'Tab' });
    fireEvent.keyDown(styleInput(), { key: 'a' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Enter on Scan is Scan’s, not a commit', () => {
    const { onCommit } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    enter(scan());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a blur to outside the group commits, as Enter does; a blur to nowhere too', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const { onCommit, handOver } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    fireEvent.blur(styleInput(), { relatedTarget: outside });
    expect(onCommit).toHaveBeenCalledWith({ attenuationStyleName: 'typed', coordinates: { x: 1, y: 2 } });
    handOver({ attenuationStyleName: 'typed', coordinates: { x: 1, y: 2 } });
    fireEvent.change(coordInputs()[0], { target: { value: '5' } });
    fireEvent.blur(coordInputs()[0], { relatedTarget: null });
    expect(onCommit).toHaveBeenLastCalledWith({ attenuationStyleName: 'typed', coordinates: { x: 5, y: 2 } });
    outside.remove();
  });

  it('a blur between the group’s own inputs, or onto Scan, commits nothing', () => {
    const { onCommit } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    fireEvent.blur(styleInput(), { relatedTarget: coordInputs()[0] });
    fireEvent.blur(coordInputs()[0], { relatedTarget: coordInputs()[1] });
    fireEvent.blur(coordInputs()[1], { relatedTarget: scan() });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a mid-edit draft survives a new identity', () => {
    const { handOver } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    handOver({ attenuationStyleName: 'landed', coordinates: { x: -7, y: 30 } });
    expect(shown()).toEqual({ name: 'typed', x: '1', y: '2' });
  });

  it('a mid-edit draft is still committed against the identity it now differs from', () => {
    const { handOver, onCommit } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    handOver({ attenuationStyleName: 'landed', coordinates: { x: -7, y: 30 } });
    enter(styleInput());
    expect(onCommit).toHaveBeenCalledWith({ attenuationStyleName: 'typed', coordinates: { x: 1, y: 2 } });
  });

  it('after a commit the next identity lands in the inputs', () => {
    const { handOver } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    enter(styleInput());
    handOver({ attenuationStyleName: 'landed', coordinates: { x: -7, y: 30 } });
    expect(shown()).toEqual({ name: 'landed', x: '-7', y: '30' });
  });

  it('Scan drops a mid-edit draft, so the drawn world lands in the inputs', () => {
    const { handOver, onScan, onCommit } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    fireEvent.click(scan());
    expect(onScan).toHaveBeenCalledTimes(1);
    handOver({ attenuationStyleName: 'drawn', coordinates: { x: 101, y: 102 } });
    expect(shown()).toEqual({ name: 'drawn', x: '101', y: '102' });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

/*
 * Found at the "editor" checkpoint (docs/tasks/OFF_SCREEN_CONSOLE.md): a coordinate field may be emptied, which makes a
 * sign flip easy, and a commit with an axis left blank draws that axis with randomCoordinate(); a typed axis is kept.
 */
describe('TransmissionEditor — a blank coordinate is drawn on commit', () => {
  const enter = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });
  let draws: number;

  beforeEach(() => {
    draws = 0;
    vi.spyOn(seedUtils, 'randomCoordinate').mockImplementation(() => 70 + ++draws);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a coordinate field may be cleared: it stays empty, and nothing is drawn yet', () => {
    renderEditor();
    fireEvent.change(coordInputs()[0], { target: { value: '' } });
    expect(shown()).toEqual({ name: 'live-as', x: '', y: '2' });
    expect(draws).toBe(0);
  });

  it('Enter with X blank draws X, keeps the typed Y, and shows the drawn X once the world is handed back', () => {
    const { onCommit, handOver } = renderEditor();
    fireEvent.change(coordInputs()[0], { target: { value: '' } });
    fireEvent.change(coordInputs()[1], { target: { value: '-5' } });
    enter(coordInputs()[1]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ attenuationStyleName: 'live-as', coordinates: { x: 71, y: -5 } });
    handOver({ attenuationStyleName: 'live-as', coordinates: { x: 71, y: -5 } });
    expect(shown()).toEqual({ name: 'live-as', x: '71', y: '-5' });
  });

  it('Y blank draws Y alone', () => {
    const { onCommit } = renderEditor();
    fireEvent.change(coordInputs()[1], { target: { value: '' } });
    enter(styleInput());
    expect(onCommit).toHaveBeenCalledWith({ attenuationStyleName: 'live-as', coordinates: { x: 1, y: 71 } });
  });

  it('both blank draws both, once each', () => {
    const { onCommit } = renderEditor();
    fireEvent.change(coordInputs()[0], { target: { value: '' } });
    fireEvent.change(coordInputs()[1], { target: { value: '' } });
    enter(coordInputs()[0]);
    expect(onCommit).toHaveBeenCalledWith({ attenuationStyleName: 'live-as', coordinates: { x: 71, y: 72 } });
    expect(draws).toBe(2);
  });

  it('a blur out of the group with a blank axis commits a drawn one; a blur within the group draws nothing', () => {
    const { onCommit } = renderEditor();
    fireEvent.change(coordInputs()[0], { target: { value: '' } });
    fireEvent.blur(coordInputs()[0], { relatedTarget: coordInputs()[1] });
    expect(onCommit).not.toHaveBeenCalled();
    expect(draws).toBe(0);
    fireEvent.blur(coordInputs()[1], { relatedTarget: null });
    expect(onCommit).toHaveBeenCalledWith({ attenuationStyleName: 'live-as', coordinates: { x: 71, y: 2 } });
  });

  it('the drawn world handed back is the baseline: a second Enter commits nothing and draws nothing', () => {
    const { onCommit, handOver } = renderEditor();
    fireEvent.change(coordInputs()[0], { target: { value: '' } });
    enter(coordInputs()[0]);
    handOver({ attenuationStyleName: 'live-as', coordinates: { x: 71, y: 2 } });
    enter(coordInputs()[0]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(draws).toBe(1);
    expect(shown()).toEqual({ name: 'live-as', x: '71', y: '2' });
  });

  it('a draw that lands back on the identity commits nothing, and the field shows it', () => {
    vi.mocked(seedUtils.randomCoordinate).mockReturnValue(1);
    const { onCommit } = renderEditor();
    fireEvent.change(coordInputs()[0], { target: { value: '' } });
    enter(coordInputs()[0]);
    expect(onCommit).not.toHaveBeenCalled();
    expect(shown()).toEqual({ name: 'live-as', x: '1', y: '2' });
  });

  it('a blank axis survives a new identity mid-edit, and a new identity lands over an untouched draft', () => {
    const { handOver } = renderEditor();
    fireEvent.change(coordInputs()[0], { target: { value: '' } });
    handOver({ attenuationStyleName: 'landed', coordinates: { x: -7, y: 30 } });
    expect(shown()).toEqual({ name: 'live-as', x: '', y: '2' });
  });

  it('Scan drops a blank axis with the rest of the draft', () => {
    const { handOver } = renderEditor();
    fireEvent.change(coordInputs()[0], { target: { value: '' } });
    fireEvent.click(scan());
    handOver({ attenuationStyleName: 'drawn', coordinates: { x: 101, y: 102 } });
    expect(shown()).toEqual({ name: 'drawn', x: '101', y: '102' });
  });
});
