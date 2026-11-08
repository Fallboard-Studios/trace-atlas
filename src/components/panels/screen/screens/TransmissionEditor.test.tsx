import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/*
 * docs/tasks/OFF_SCREEN_CONSOLE.md Task 4 (spec §1.2): the New Transmission editor — a titled group with Scan in its
 * title row, a style name input and the coordinates, holding a draft of the identity it is handed. The draft follows a
 * new identity; typing moves the draft alone.
 */
import { TransmissionEditor, type EditorIdentity } from './TransmissionEditor';
import { CONTENT } from '@/content';

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
