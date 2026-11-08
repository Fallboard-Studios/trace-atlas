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

function renderEditor(identity: EditorIdentity = LIVE, { selected = false, onScan = vi.fn() } = {}) {
  const result = render(<TransmissionEditor identity={identity} selected={selected} onScan={onScan} />);
  return { ...result, onScan };
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
    const { rerender, onScan } = renderEditor();
    rerender(
      <TransmissionEditor
        identity={{ attenuationStyleName: 'landed', coordinates: { x: -7, y: 30 } }}
        selected={false}
        onScan={onScan}
      />,
    );
    expect(shown()).toEqual({ name: 'landed', x: '-7', y: '30' });
  });

  it('the same identity as a fresh object leaves a typed draft alone', () => {
    const { rerender, onScan } = renderEditor();
    fireEvent.change(styleInput(), { target: { value: 'typed' } });
    rerender(<TransmissionEditor identity={structuredClone(LIVE)} selected={false} onScan={onScan} />);
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
    const { rerender, onScan } = renderEditor(LIVE, { selected: true });
    expect(editor().hasAttribute('data-selected')).toBe(true);
    rerender(<TransmissionEditor identity={LIVE} selected={false} onScan={onScan} />);
    expect(editor().hasAttribute('data-selected')).toBe(false);
  });
});
