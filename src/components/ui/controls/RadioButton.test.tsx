import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

// Mocked the same way Button.test.tsx/Toggle.test.tsx mock CabinetBox — keeps
// this file's assertions about RadioButton's own event-to-prop wiring
// isolated from CabinetBox's already-proven internals (11.1.1). None of the
// existing tests below depend on CabinetBox's real rendering (role/aria-label/
// data-state/data-disabled all live on ToggleGroup.Item itself), so the mock
// is safe for the whole file rather than needing a separate unmocked block.
vi.mock('./CabinetBox', () => ({
  CabinetBox: ({ popped, timelineKey, boxHeight, frontWidth, frontHeight, children }: {
    popped: boolean;
    timelineKey: string;
    boxHeight?: number;
    frontWidth?: number;
    frontHeight?: number;
    children?: React.ReactNode;
  }) => (
    <div
      data-testid="cabinet-box"
      data-popped={popped}
      data-timeline-key={timelineKey}
      data-box-height={boxHeight}
      data-front-width={frontWidth}
      data-front-height={frontHeight}
    >{children}</div>
  ),
}));

// Spied (real cross-module call, wrapped so it still delegates to the actual
// implementation) so a render-count test (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md
// Task 9) can tell whether RadioButton's render body actually re-executed —
// resolveAccessibleName(schema) is called unconditionally in the render body.
vi.mock('./accessibleName', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accessibleName')>();
  return { ...actual, resolveAccessibleName: vi.fn(actual.resolveAccessibleName) };
});

import { RadioButton } from './RadioButton';
import { resolveAccessibleName } from './accessibleName';
import type { RadioButtonSchema } from '@/types/controls';

const schema: RadioButtonSchema = {
  id: 'lfoShape',
  type: 'radio',
  humanLabel: 'LFO Shape',
  options: [
    { value: 'triangle', humanLabel: 'TRIANGLE' },
    { value: 'sine', humanLabel: 'SINE' },
    { value: 'square', humanLabel: 'SQUARE' },
    { value: 'sawtooth', humanLabel: 'SAWTOOTH' },
  ],
};

describe('RadioButton', () => {
  it('renders one item per schema.options entry', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'TRIANGLE' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'SINE' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'SQUARE' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'SAWTOOTH' })).toBeTruthy();
  });

  it('marks exactly the option matching value as pressed/selected', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'SINE' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'TRIANGLE' }).getAttribute('aria-checked')).toBe('false');
  });

  it('calls onChange(newValue) on selection', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={schema} value="sine" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'SQUARE' }));
    expect(onChange).toHaveBeenCalledWith('square');
  });

  it('does not call onChange on a deselect-to-empty event (clicking the already-selected option)', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={schema} value="sine" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'SINE' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  // docs/specs/archive/HEADER_HUB_CONSOLIDATION.md §1.4 (correction found during
  // Header's own implementation, Task 8) — every existing consumer relies on
  // the deselect-to-empty event being silently swallowed (the test above),
  // so it can't just start forwarding '' to onChange without risking a
  // behavior change for Audio Setting/Decay Mode/LFO Shape/CompanyButtonRow.
  // onDeselect is a separate, optional, additive hook specifically for the
  // event onChange already swallows.
  it('calls onDeselect (not onChange) on a deselect-to-empty event, when provided', () => {
    const onChange = vi.fn();
    const onDeselect = vi.fn();
    render(<RadioButton schema={schema} value="sine" onChange={onChange} onDeselect={onDeselect} />);
    fireEvent.click(screen.getByRole('radio', { name: 'SINE' }));
    expect(onDeselect).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onDeselect on a genuine selection of a different option', () => {
    const onDeselect = vi.fn();
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} onDeselect={onDeselect} />);
    fireEvent.click(screen.getByRole('radio', { name: 'SQUARE' }));
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('omitting onDeselect does not throw on a deselect-to-empty event — every existing consumer omits it', () => {
    const onChange = vi.fn();
    expect(() => {
      render(<RadioButton schema={schema} value="sine" onChange={onChange} />);
      fireEvent.click(screen.getByRole('radio', { name: 'SINE' }));
    }).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to schema.id for the group\'s accessible name when neither label is present, never leaving it unlabeled', () => {
    const bareSchema: RadioButtonSchema = { id: 'lfoShape', type: 'radio', options: schema.options };
    render(<RadioButton schema={bareSchema} value="sine" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'lfoShape' })).toBeTruthy();
  });

  it('is not disabled by default — no existing behavior changes', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    const item = screen.getByRole('radio', { name: 'SINE' });
    expect(item.getAttribute('data-disabled')).toBeNull();
    expect(item.getAttribute('tabindex')).not.toBeNull();
  });

  it('marks every item data-disabled when disabled is true', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} disabled />);
    expect(screen.getByRole('radio', { name: 'SINE' }).getAttribute('data-disabled')).toBe('');
    expect(screen.getByRole('radio', { name: 'TRIANGLE' }).getAttribute('data-disabled')).toBe('');
  });

  it('does not call onChange on a disabled item when clicked', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={schema} value="sine" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('radio', { name: 'SQUARE' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  // Roadmap 11.1.6 — one CabinetBox per option, popped only for the
  // currently-selected one. See docs/specs/archive/OBLIQUE_CABINETRY_RADIO_BUTTON.md §1.1.
  it('renders one CabinetBox per option, fully popped only for the option matching value, resting at CABINET_REST_POP for every other', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    expect(screen.getAllByTestId('cabinet-box')).toHaveLength(4);

    const boxFor = (name: string) =>
      screen.getByRole('radio', { name }).querySelector('[data-testid="cabinet-box"]');

    expect(boxFor('SINE')?.getAttribute('data-popped')).toBe('true');
    expect(boxFor('TRIANGLE')?.getAttribute('data-popped')).toBe('0.5');
    expect(boxFor('SQUARE')?.getAttribute('data-popped')).toBe('0.5');
    expect(boxFor('SAWTOOTH')?.getAttribute('data-popped')).toBe('0.5');
  });

  it('passes a distinct timelineKey per option, derived from schema.id, the option\'s own value, and this instance\'s own useId()', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    const boxFor = (name: string) =>
      screen.getByRole('radio', { name }).querySelector('[data-testid="cabinet-box"]');

    const triangleKey = boxFor('TRIANGLE')?.getAttribute('data-timeline-key');
    const squareKey = boxFor('SQUARE')?.getAttribute('data-timeline-key');
    expect(triangleKey).toMatch(/^cabinet-radio-lfoShape-.+-triangle$/);
    expect(squareKey).toMatch(/^cabinet-radio-lfoShape-.+-square$/);
    // Same instance's own id segment on both options, options themselves distinct.
    expect(triangleKey?.replace('-triangle', '')).toBe(squareKey?.replace('-square', ''));
  });

  it('bugfix: two simultaneously-mounted RadioButtons rendering the same schema get non-colliding timelineKeys — Header\'s duplicated nav group (.primary/.secondary) was stomping each other\'s shared timelineMap entry, killing one instance\'s in-flight pop/flatten animation from the other\'s own effect', () => {
    render(
      <>
        <RadioButton schema={schema} value="sine" onChange={() => {}} />
        <RadioButton schema={schema} value="sine" onChange={() => {}} />
      </>,
    );
    const boxesFor = (name: string) =>
      screen.getAllByRole('radio', { name }).map((el) => el.querySelector('[data-testid="cabinet-box"]'));

    const [firstKey, secondKey] = boxesFor('TRIANGLE').map((box) => box?.getAttribute('data-timeline-key'));
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(firstKey).not.toBe(secondKey);
  });

  it('renders the option\'s label as CabinetBox\'s own children, not directly inside the toggle item', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    const box = screen.getByRole('radio', { name: 'SINE' }).querySelector('[data-testid="cabinet-box"]');
    expect(box?.textContent).toBe('SINE');
  });

  it('reflects selection via Radix\'s own data-state attribute, which the accent-tint CSS rule depends on', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'SINE' }).getAttribute('data-state')).toBe('on');
    expect(screen.getByRole('radio', { name: 'TRIANGLE' }).getAttribute('data-state')).toBe('off');
  });

  // Hover-pop, matching Button's own hover behavior — reverses 11.1.6's original
  // "no hover/partial-pop on unselected options" exclusion (docs/specs/archive/OBLIQUE_CABINETRY_RADIO_BUTTON.md §3).
  it('pops an unselected option fully on mouseEnter and rests it again at CABINET_REST_POP on mouseLeave', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    const item = screen.getByRole('radio', { name: 'TRIANGLE' });
    const box = () => item.querySelector('[data-testid="cabinet-box"]');

    expect(box()?.getAttribute('data-popped')).toBe('0.5');
    fireEvent.mouseEnter(item);
    expect(box()?.getAttribute('data-popped')).toBe('true');
    fireEvent.mouseLeave(item);
    expect(box()?.getAttribute('data-popped')).toBe('0.5');
  });

  it('the selected option stays popped through a hover+unhover — hover only adds pop, never removes the selected state\'s own pop', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    const item = screen.getByRole('radio', { name: 'SINE' });
    const box = () => item.querySelector('[data-testid="cabinet-box"]');

    fireEvent.mouseEnter(item);
    fireEvent.mouseLeave(item);
    expect(box()?.getAttribute('data-popped')).toBe('true');
  });

  it('hovering one option does not pop any other option', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    fireEvent.mouseEnter(screen.getByRole('radio', { name: 'TRIANGLE' }));

    const boxFor = (name: string) =>
      screen.getByRole('radio', { name }).querySelector('[data-testid="cabinet-box"]');
    expect(boxFor('TRIANGLE')?.getAttribute('data-popped')).toBe('true');
    expect(boxFor('SQUARE')?.getAttribute('data-popped')).toBe('0.5');
    expect(boxFor('SAWTOOTH')?.getAttribute('data-popped')).toBe('0.5');
  });

  it('clears a stale hover when value changes without an intervening mouseLeave — bugfix, Header nav switching between tiles', () => {
    // Simulates the real-world sequence a mouseleave sometimes fails to fire
    // for (see RadioButton.tsx's own bugfix comment): TRIANGLE gets hovered
    // (and popped) but never a real mouseLeave; the group's value then
    // changes to SQUARE by some other means (a click's onChange, or an
    // external/programmatic change) with no mouseLeave in between.
    const { rerender } = render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    fireEvent.mouseEnter(screen.getByRole('radio', { name: 'TRIANGLE' }));
    expect(screen.getByRole('radio', { name: 'TRIANGLE' }).querySelector('[data-testid="cabinet-box"]')?.getAttribute('data-popped')).toBe('true');

    rerender(<RadioButton schema={schema} value="square" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: 'TRIANGLE' }).querySelector('[data-testid="cabinet-box"]')?.getAttribute('data-popped')).toBe('0.5');
    expect(screen.getByRole('radio', { name: 'SQUARE' }).querySelector('[data-testid="cabinet-box"]')?.getAttribute('data-popped')).toBe('true');
  });

  it('never pops beyond CABINET_REST_POP on hover while disabled, matching Button\'s own disabled-blocks-hover rule', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} disabled />);
    const item = screen.getByRole('radio', { name: 'TRIANGLE' });
    fireEvent.mouseEnter(item);
    expect(item.querySelector('[data-testid="cabinet-box"]')?.getAttribute('data-popped')).toBe('0.5');
  });

  // docs/specs/archive/HEADER_HUB_CONSOLIDATION.md §1.4 — literal square box size,
  // overriding the responsive useCabinetBoxHeight() tier every other
  // consumer relies on by omitting these props entirely.
  it('passes boxSize as boxHeight/frontWidth/frontHeight on every option\'s CabinetBox when provided', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} boxSize={44} />);
    const boxFor = (name: string) =>
      screen.getByRole('radio', { name }).querySelector('[data-testid="cabinet-box"]');

    for (const name of ['TRIANGLE', 'SINE', 'SQUARE', 'SAWTOOTH']) {
      const box = boxFor(name);
      expect(box?.getAttribute('data-box-height')).toBe('44');
      expect(box?.getAttribute('data-front-width')).toBe('44');
      expect(box?.getAttribute('data-front-height')).toBe('44');
    }
  });

  it('omitting boxSize passes none of boxHeight/frontWidth/frontHeight — every existing consumer\'s responsive-tier behavior is unaffected (regression guard)', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    const box = screen.getByRole('radio', { name: 'SINE' }).querySelector('[data-testid="cabinet-box"]');
    expect(box?.getAttribute('data-box-height')).toBeNull();
    expect(box?.getAttribute('data-front-width')).toBeNull();
    expect(box?.getAttribute('data-front-height')).toBeNull();
  });

  // docs/specs/archive/COMPANY_SECTION_ENHANCEMENTS.md §1.3 — per-option color, consumed by
  // CompanyButtonRow and RobotSelectionCard's company-assignment RadioButton. Scopes
  // getRobotColorStyle's 4 custom properties to just that option's own ToggleGroup.Item, letting
  // CabinetBox.css/RadioButton.css's existing ambient-accent rules do the rest — no new CSS.
  describe('per-option color', () => {
    const coloredSchema: RadioButtonSchema = {
      id: 'company.buttonRow',
      type: 'radio',
      humanLabel: 'Companies',
      options: [
        { value: 'none', humanLabel: 'None' },
        { value: 'c1', humanLabel: 'Iron Consortium', color: '#4f6d7a' },
        { value: 'c2', humanLabel: 'Null Syndicate', color: '#65617f' },
      ],
    };

    it('scopes an option\'s own color to its own ToggleGroup.Item via the 4 accent custom properties', () => {
      render(<RadioButton schema={coloredSchema} value="c1" onChange={() => {}} />);
      const item = screen.getByRole('radio', { name: 'Iron Consortium' });
      expect(item.style.getPropertyValue('--color-accent-a')).toBe('#4f6d7a');
      expect(item.style.getPropertyValue('--color-accent-b')).toBe('#4f6d7a');
      expect(item.style.getPropertyValue('--color-accent-gradient')).toContain('#4f6d7a');
    });

    it('gives two differently-colored options two independently-scoped colors', () => {
      render(<RadioButton schema={coloredSchema} value="c1" onChange={() => {}} />);
      const c1 = screen.getByRole('radio', { name: 'Iron Consortium' });
      const c2 = screen.getByRole('radio', { name: 'Null Syndicate' });
      expect(c1.style.getPropertyValue('--color-accent-a')).toBe('#4f6d7a');
      expect(c2.style.getPropertyValue('--color-accent-a')).toBe('#65617f');
    });

    it('an option with no color gets no inline style at all — byte-for-byte today\'s behavior (regression guard)', () => {
      render(<RadioButton schema={coloredSchema} value="c1" onChange={() => {}} />);
      const none = screen.getByRole('radio', { name: 'None' });
      expect(none.getAttribute('style')).toBeNull();
    });

    it('a schema where no option sets color renders with no inline style on any option (regression guard)', () => {
      render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
      schema.options.forEach((option) => {
        expect(screen.getByRole('radio', { name: option.humanLabel }).getAttribute('style')).toBeNull();
      });
    });
  });

  describe('React.memo (docs/tasks/archive/OBLIQUE_CABINETRY_MEMOIZATION.md Task 9)', () => {
    it('is a React.memo-wrapped component', () => {
      expect((RadioButton as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('does not re-execute its render body on a re-render with identical props', () => {
      const onChange = () => {};
      const { rerender } = render(<RadioButton schema={schema} value="sine" onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<RadioButton schema={schema} value="sine" onChange={onChange} />);
      rerender(<RadioButton schema={schema} value="sine" onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });

    it('does re-execute its render body when a real prop changes (value)', () => {
      const onChange = () => {};
      const { rerender } = render(<RadioButton schema={schema} value="sine" onChange={onChange} />);
      const callsAfterMount = (resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length;

      rerender(<RadioButton schema={schema} value="triangle" onChange={onChange} />);

      expect((resolveAccessibleName as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});

describe('RadioButton — option label vocabulary (docs/specs/CONTENT_LAYER.md, Task 6)', () => {
  // One label vocabulary app-wide: schemas say `humanLabel`, so options do too. An option's
  // human text is both its visible label and its accessible name.
  const content: RadioButtonSchema = {
    id: 'decayMode',
    type: 'radio',
    humanLabel: 'Decay Mode',
    options: [
      { value: 'natural', humanLabel: 'Natural Decay', loreLabel: 'Dissipation' },
      { value: 'controlled', humanLabel: 'Controlled Decay' },
    ],
  };

  it('renders each option\'s humanLabel as the radio\'s accessible name and visible text', () => {
    render(<RadioButton schema={content} value="natural" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Natural Decay' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Controlled Decay' })).toBeTruthy();
    // The option's lore is back on its face, above the human label (Crawford, 2026-10-10), but the
    // accessible name stays the human label alone.
    expect(screen.getByText('Dissipation')).toBeTruthy();
  });

  it('does not accept the retired `label` field on an option', () => {
    // @ts-expect-error — `label` was renamed to `humanLabel`; a stale option is a type error, not a runtime fallback
    const stale: RadioButtonSchema['options'][number] = { value: 'x', label: 'X' };
    expect(stale.value).toBe('x');
  });
});

describe('RadioButton — appearance "muted" (docs/tasks/LAYOUT_REWORK.md Task 27)', () => {
  // The off screen's picker: power is off, so nothing pops, glows or comes off the plate. Each option
  // is the box's own shape and size with no cabinet walls, the selected one a monochrome fill.
  const muted: RadioButtonSchema = {
    id: 'transmission',
    type: 'radio',
    humanLabel: 'Transmission',
    appearance: 'muted',
    options: [
      { value: 'a', humanLabel: 'Kryndara' },
      { value: 'b', humanLabel: 'Vessport Null', loreLabel: 'Preset' },
      { value: 'c', humanLabel: 'Dusk Run', dividerBefore: true },
    ],
  };

  it('renders no CabinetBox for any option — no walls, no pop timeline', () => {
    const { container } = render(<RadioButton schema={muted} value="b" onChange={() => {}} />);
    expect(screen.queryAllByTestId('cabinet-box')).toHaveLength(0);
    expect(container.querySelector('.sc-cabinet-box')).toBeNull();
    expect(container.querySelector('[class*="sc-cabinet-box__"]')).toBeNull();
  });

  it('still renders each option as a radio with its face, and marks the value selected', () => {
    render(<RadioButton schema={muted} value="b" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Vessport Null' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Kryndara' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Preset')).toBeTruthy();
  });

  it('marks the group and the selected face as muted so the monochrome fill can key off them', () => {
    const { container } = render(<RadioButton schema={muted} value="b" onChange={() => {}} />);
    expect(container.querySelector('.sc-radio-button--muted')).not.toBeNull();
    const faces = container.querySelectorAll('.sc-radio-button__flat');
    expect(faces).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Vessport Null' }).getAttribute('data-state')).toBe('on');
  });

  it('takes the box\'s own height from the cabinet tier, so it is the same size as a cabinet option', () => {
    const { container } = render(<RadioButton schema={muted} value="b" onChange={() => {}} />);
    const flat = container.querySelector<HTMLElement>('.sc-radio-button__flat');
    expect(flat?.style.getPropertyValue('--cabinet-box-height')).toMatch(/^\d+px$/);
  });

  it('honours boxSize for the flat face\'s height too', () => {
    const { container } = render(<RadioButton schema={muted} value="b" onChange={() => {}} boxSize={50} />);
    const flat = container.querySelector<HTMLElement>('.sc-radio-button__flat');
    expect(flat?.style.getPropertyValue('--cabinet-box-height')).toBe('50px');
  });

  it('calls onChange on selection and swallows re-clicking the selected one, as the cabinet one does', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={muted} value="b" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Kryndara' }));
    expect(onChange).toHaveBeenCalledWith('a');
    onChange.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: 'Vessport Null' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows nothing selected for an empty value', () => {
    render(<RadioButton schema={muted} value="" onChange={() => {}} />);
    for (const name of ['Kryndara', 'Vessport Null', 'Dusk Run']) {
      expect(screen.getByRole('radio', { name }).getAttribute('aria-checked')).toBe('false');
    }
  });

  it('draws a divider only before an option that asks for one', () => {
    const { container } = render(<RadioButton schema={muted} value="a" onChange={() => {}} />);
    const dividers = container.querySelectorAll('.sc-radio-button__divider');
    expect(dividers).toHaveLength(1);
    expect(dividers[0].getAttribute('aria-hidden')).toBe('true');
    // Sits between the second and third items.
    expect(dividers[0].nextElementSibling).toBe(screen.getByRole('radio', { name: 'Dusk Run' }));
  });

  it('never pops on hover — the muted option has no CabinetBox to pop', () => {
    render(<RadioButton schema={muted} value="b" onChange={() => {}} />);
    fireEvent.mouseEnter(screen.getByRole('radio', { name: 'Kryndara' }));
    expect(screen.queryAllByTestId('cabinet-box')).toHaveLength(0);
  });

  it('a disabled muted group does not call onChange', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={muted} value="b" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('radio', { name: 'Kryndara' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the cabinet look when appearance is omitted or "cabinet" — the default is unchanged', () => {
    const { rerender } = render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    expect(screen.getAllByTestId('cabinet-box')).toHaveLength(4);
    rerender(<RadioButton schema={{ ...schema, appearance: 'cabinet' }} value="sine" onChange={() => {}} />);
    expect(screen.getAllByTestId('cabinet-box')).toHaveLength(4);
  });

  it('draws a divider on a cabinet group too when an option asks (the field is not muted-only)', () => {
    const { container } = render(
      <RadioButton schema={{ ...schema, options: [schema.options[0], { ...schema.options[1], dividerBefore: true }] }} value="triangle" onChange={() => {}} />,
    );
    expect(container.querySelectorAll('.sc-radio-button__divider')).toHaveLength(1);
  });
});

describe('RadioButton — the multiple variant (docs/specs/OFF_SCREEN.md assumption 23, docs/tasks/OFF_SCREEN.md Task 29)', () => {
  // The off screen's Melody row: a set of picks, each independently on or off. `schema.multiple` makes the
  // value a string[] and the group a Radix ToggleGroup of type "multiple" — a `group` of `aria-pressed`
  // buttons, never a radiogroup of radios.
  const multi: RadioButtonSchema = {
    id: 'offMelody',
    type: 'radio',
    humanLabel: 'Melody',
    appearance: 'muted',
    multiple: true,
    options: [
      { value: 'theme', humanLabel: 'As theme' },
      { value: 'hypnotic', humanLabel: 'Hypnotic', dividerBefore: true },
      { value: 'mechanical', humanLabel: 'Mechanical' },
      { value: 'wandering', humanLabel: 'Wandering' },
    ],
  };
  const cabinetMulti: RadioButtonSchema = { ...schema, id: 'lfoShapes', multiple: true };

  const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

  it('renders the options as aria-pressed buttons inside a group — no radio, no radiogroup', () => {
    render(<RadioButton schema={multi} value={['hypnotic']} onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Melody' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(pressed('Hypnotic')).toBe('true');
    expect(pressed('As theme')).toBe('false');
    expect(pressed('Mechanical')).toBe('false');
    expect(pressed('Wandering')).toBe('false');
  });

  it('holds several options on at once, each carrying the selected state the muted fill keys off', () => {
    const { container } = render(<RadioButton schema={multi} value={['hypnotic', 'wandering']} onChange={() => {}} />);
    expect(pressed('Hypnotic')).toBe('true');
    expect(pressed('Wandering')).toBe('true');
    expect(pressed('As theme')).toBe('false');
    expect(screen.getByRole('button', { name: 'Hypnotic' }).getAttribute('data-state')).toBe('on');
    expect(screen.getByRole('button', { name: 'Mechanical' }).getAttribute('data-state')).toBe('off');
    expect(container.querySelector('.sc-radio-button--muted')).not.toBeNull();
    expect(container.querySelector('.sc-radio-button--multiple')).not.toBeNull();
    expect(container.querySelectorAll('.sc-radio-button__item[data-state="on"] .sc-radio-button__flat')).toHaveLength(2);
    expect(container.querySelectorAll('.sc-radio-button__flat')).toHaveLength(4);
  });

  it('shows nothing selected for an empty list', () => {
    render(<RadioButton schema={multi} value={[]} onChange={() => {}} />);
    for (const name of ['As theme', 'Hypnotic', 'Mechanical', 'Wandering']) {
      expect(pressed(name)).toBe('false');
    }
  });

  it('clicking an unselected option calls onChange with it added to the list', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={multi} value={['hypnotic']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wandering' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['hypnotic', 'wandering']);
  });

  it('clicking a selected option calls onChange with it removed — a re-click is a toggle out, not a swallowed deselect', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={multi} value={['hypnotic', 'wandering']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hypnotic' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['wandering']);
  });

  it('emits the list in schema option order whatever the toggle order, so the same set is always the same list', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={multi} value={['wandering']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'As theme' }));
    expect(onChange).toHaveBeenCalledWith(['theme', 'wandering']);
  });

  it('drops a value no option has from the emitted list', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={multi} value={['ghost', 'hypnotic']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mechanical' }));
    expect(onChange).toHaveBeenCalledWith(['hypnotic', 'mechanical']);
  });

  it('clearing the last selected option calls onChange([]) and never onDeselect — an empty set is a value here', () => {
    const onChange = vi.fn();
    const onDeselect = vi.fn();
    render(<RadioButton schema={multi} value={['hypnotic']} onChange={onChange} onDeselect={onDeselect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hypnotic' }));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('is controlled: the pressed state follows value, not the click', () => {
    render(<RadioButton schema={multi} value={['hypnotic']} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wandering' }));
    expect(pressed('Wandering')).toBe('false');
    expect(pressed('Hypnotic')).toBe('true');
  });

  it('a disabled multiple group marks every item and calls no onChange', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={multi} value={['hypnotic']} onChange={onChange} disabled />);
    expect(screen.getByRole('button', { name: 'Wandering' }).getAttribute('data-disabled')).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Wandering' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws a divider before the option that asks for one, in the multiple variant too', () => {
    const { container } = render(<RadioButton schema={multi} value={[]} onChange={() => {}} />);
    const dividers = container.querySelectorAll('.sc-radio-button__divider');
    expect(dividers).toHaveLength(1);
    expect(dividers[0].getAttribute('aria-hidden')).toBe('true');
    expect(dividers[0].nextElementSibling).toBe(screen.getByRole('button', { name: 'Hypnotic' }));
  });

  it('keeps each option its own size: the muted face still takes the cabinet tier height', () => {
    const { container } = render(<RadioButton schema={multi} value={['hypnotic']} onChange={() => {}} boxSize={50} />);
    for (const flat of container.querySelectorAll<HTMLElement>('.sc-radio-button__flat')) {
      expect(flat.style.getPropertyValue('--cabinet-box-height')).toBe('50px');
    }
  });

  describe('cabinet appearance', () => {
    const boxFor = (name: string) =>
      screen.getByRole('button', { name }).querySelector('[data-testid="cabinet-box"]');

    it('pops a CabinetBox for every selected option and rests every other at CABINET_REST_POP', () => {
      render(<RadioButton schema={cabinetMulti} value={['triangle', 'square']} onChange={() => {}} />);
      expect(screen.getAllByTestId('cabinet-box')).toHaveLength(4);
      expect(boxFor('TRIANGLE')?.getAttribute('data-popped')).toBe('true');
      expect(boxFor('SQUARE')?.getAttribute('data-popped')).toBe('true');
      expect(boxFor('SINE')?.getAttribute('data-popped')).toBe('0.5');
      expect(boxFor('SAWTOOTH')?.getAttribute('data-popped')).toBe('0.5');
      expect(screen.getByRole('button', { name: 'TRIANGLE' }).getAttribute('data-state')).toBe('on');
    });

    it('hover pops an unselected option and rests it again; the selected ones keep their pop throughout', () => {
      render(<RadioButton schema={cabinetMulti} value={['triangle', 'square']} onChange={() => {}} />);
      const sawtooth = screen.getByRole('button', { name: 'SAWTOOTH' });
      fireEvent.mouseEnter(sawtooth);
      expect(boxFor('SAWTOOTH')?.getAttribute('data-popped')).toBe('true');
      expect(boxFor('TRIANGLE')?.getAttribute('data-popped')).toBe('true');
      fireEvent.mouseLeave(sawtooth);
      expect(boxFor('SAWTOOTH')?.getAttribute('data-popped')).toBe('0.5');
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'SQUARE' }));
      fireEvent.mouseLeave(screen.getByRole('button', { name: 'SQUARE' }));
      expect(boxFor('SQUARE')?.getAttribute('data-popped')).toBe('true');
    });

    it('a change of the selected set clears a stale hover, as a single-value change does', () => {
      const { rerender } = render(<RadioButton schema={cabinetMulti} value={['triangle']} onChange={() => {}} />);
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'SINE' }));
      expect(boxFor('SINE')?.getAttribute('data-popped')).toBe('true');
      rerender(<RadioButton schema={cabinetMulti} value={['triangle', 'square']} onChange={() => {}} />);
      expect(boxFor('SINE')?.getAttribute('data-popped')).toBe('0.5');
      expect(boxFor('SQUARE')?.getAttribute('data-popped')).toBe('true');
    });

    it('a re-render with a new array of the same values is not a change: a live hover survives it', () => {
      const { rerender } = render(<RadioButton schema={cabinetMulti} value={['triangle']} onChange={() => {}} />);
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'SINE' }));
      rerender(<RadioButton schema={cabinetMulti} value={['triangle']} onChange={() => {}} />);
      expect(boxFor('SINE')?.getAttribute('data-popped')).toBe('true');
    });

    it('never pops beyond CABINET_REST_POP on hover while disabled', () => {
      render(<RadioButton schema={cabinetMulti} value={['triangle']} onChange={() => {}} disabled />);
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'SINE' }));
      expect(boxFor('SINE')?.getAttribute('data-popped')).toBe('0.5');
      expect(boxFor('TRIANGLE')?.getAttribute('data-popped')).toBe('true');
    });

    it('toggles in and out through the cabinet path too', () => {
      const onChange = vi.fn();
      render(<RadioButton schema={cabinetMulti} value={['triangle']} onChange={onChange} />);
      fireEvent.click(screen.getByRole('button', { name: 'SAWTOOTH' }));
      expect(onChange).toHaveBeenCalledWith(['triangle', 'sawtooth']);
      fireEvent.click(screen.getByRole('button', { name: 'TRIANGLE' }));
      expect(onChange).toHaveBeenLastCalledWith([]);
    });
  });

  it('types the two shapes apart: a string[] value needs a string[] onChange', () => {
    // @ts-expect-error — the multiple variant's onChange receives the whole list, never one value
    const element = <RadioButton schema={multi} value={['hypnotic']} onChange={(next: string) => void next} />;
    expect(element).toBeTruthy();
  });

  it('leaves the single-value control as it was: without multiple the options are radios and value is one string', () => {
    render(<RadioButton schema={schema} value="sine" onChange={() => {}} />);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('radio', { name: 'SINE' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('RadioButton — appearance "list" (docs/tasks/OFF_SCREEN_REVISIONS.md Task 3)', () => {
  // The off screen's Transmission list (Crawford's notes 1 and 2): every option a full-width row — a dot, the face,
  // an optional meta — and a trailing slot that lets a row carry an action (Roll on Current) beside its radio,
  // never inside it, since the radio is a button. Muted family: no cabinet, no pop.
  const list: RadioButtonSchema = {
    id: 'offTransmission',
    type: 'radio',
    humanLabel: 'Transmission',
    appearance: 'list',
    options: [
      { value: 'current', humanLabel: 'q7-sh0al · (3, -41)', loreLabel: 'Current' },
      { value: 'save:Dusk Run', humanLabel: 'Dusk Run', meta: 'saved 2 days ago' },
      { value: 'preset:kryndara', humanLabel: 'Kryndara', dividerBefore: true },
      { value: 'preset:vessport', humanLabel: 'Vessport Null' },
    ],
  };
  const NAMES = ['q7-sh0al · (3, -41)', 'Dusk Run', 'Kryndara', 'Vessport Null'];
  const radio = (name: string) => screen.getByRole('radio', { name });
  const rowOf = (el: Element) => el.closest('.sc-radio-button__row');
  const rollOnCurrent = (value: string) => (value === 'current' ? <button type="button">Roll</button> : null);

  it('marks the group as a list and renders every option as a row holding its one radio item', () => {
    const { container } = render(<RadioButton schema={list} value="current" onChange={() => {}} />);
    expect(container.querySelector('.sc-radio-button--list')).not.toBeNull();
    const rows = Array.from(container.querySelectorAll('.sc-radio-button__row'));
    expect(rows).toHaveLength(4);
    rows.forEach((row, i) => {
      const radios = row.querySelectorAll('[role="radio"]');
      expect(radios).toHaveLength(1);
      expect(radios[0].getAttribute('aria-label')).toBe(NAMES[i]);
      expect(radios[0].classList.contains('sc-radio-button__list-item')).toBe(true);
    });
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R8: Radix's roving root takes the focus of a Shift+Tab that leaves any
  // descendant that is not one of its items and hands it to the selected item, so a slot inside the root made Shift+Tab
  // loop between it and the selected row. The slot now follows the root, and shares its row's grid line instead.
  it('renders the trailing node after the radio group\'s root, outside its roving focus, on its row\'s grid line (review R8)', () => {
    const { container } = render(<RadioButton schema={list} value="current" onChange={() => {}} trailing={rollOnCurrent} />);
    const root = container.querySelector('.sc-radio-button__root')!;
    const roll = screen.getByRole('button', { name: 'Roll' });
    const current = radio(NAMES[0]);
    const slot = roll.closest('.sc-radio-button__trailing') as HTMLElement;
    expect(slot).not.toBeNull();
    expect(current.contains(roll)).toBe(false);
    expect(root.contains(slot)).toBe(false);
    expect(root.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(Array.from(rowOf(current)!.children)).toEqual([current]);
    expect(slot.style.gridRow).not.toBe('');
    expect(slot.style.gridRow).toBe((rowOf(current) as HTMLElement).style.gridRow);
  });

  it('gives every row and divider a grid line of its own, and a slot its row\'s line, a divider counting as one (review R8)', () => {
    const shareOnKryndara = (value: string) => (value === 'preset:kryndara' ? <button type="button">Share</button> : null);
    const { container } = render(<RadioButton schema={list} value="current" onChange={() => {}} trailing={shareOnKryndara} />);
    const line = (el: Element | null) => (el as HTMLElement).style.gridRow;
    expect(NAMES.map((name) => line(rowOf(radio(name))))).toEqual(['1', '2', '4', '5']);
    expect(line(container.querySelector('.sc-radio-button__divider'))).toBe('3');
    expect(line(screen.getByRole('button', { name: 'Share' }).closest('.sc-radio-button__trailing'))).toBe('4');
    expect(line(container.querySelector('.sc-radio-button__root'))).toBe('1 / span 5');
  });

  it('keeps the group\'s role and name over its radios, and the arrow keys move between the radios only', async () => {
    render(<RadioButton schema={list} value="current" onChange={() => {}} trailing={rollOnCurrent} />);
    const group = screen.getByRole('group', { name: 'Transmission' });
    expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(NAMES);
    expect(within(group).queryByRole('button', { name: 'Roll' })).toBeNull();
    radio(NAMES[0]).focus();
    fireEvent.keyDown(radio(NAMES[0]), { key: 'ArrowDown' });
    // Radix moves the roving focus in a timeout, out of the keydown.
    await waitFor(() => expect(document.activeElement).toBe(radio('Dusk Run')));
  });

  it('asks the trailing function once per option, with the option value', () => {
    const trailing = vi.fn(() => null);
    render(<RadioButton schema={list} value="current" onChange={() => {}} trailing={trailing} />);
    expect(trailing.mock.calls.map((call: unknown[]) => call[0])).toEqual(list.options.map((o) => o.value));
  });

  it('a row with no trailing result renders no empty slot (null, undefined, false and an empty string alike)', () => {
    const results: Record<string, unknown> = { current: null, 'save:Dusk Run': undefined, 'preset:kryndara': false, 'preset:vessport': '' };
    const { container } = render(
      <RadioButton schema={list} value="current" onChange={() => {}} trailing={(v) => results[v] as React.ReactNode} />,
    );
    expect(container.querySelector('.sc-radio-button__trailing')).toBeNull();
    const rows = container.querySelectorAll('.sc-radio-button__row');
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row.children).toHaveLength(1);
  });

  it('only the rows whose trailing result is a node get a slot', () => {
    const { container } = render(<RadioButton schema={list} value="current" onChange={() => {}} trailing={rollOnCurrent} />);
    expect(container.querySelectorAll('.sc-radio-button__trailing')).toHaveLength(1);
  });

  it('a click on the trailing node runs its own handler and changes no value, on the selected row or another', () => {
    const onChange = vi.fn();
    const onRoll = vi.fn();
    const onOther = vi.fn();
    const trailing = (value: string) =>
      value === 'current' ? (
        <button type="button" onClick={onRoll}>Roll</button>
      ) : value === 'preset:kryndara' ? (
        <button type="button" onClick={onOther}>Share</button>
      ) : null;
    render(<RadioButton schema={list} value="current" onChange={onChange} trailing={trailing} />);
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(onOther).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(radio(NAMES[0]).getAttribute('aria-checked')).toBe('true');
    expect(radio('Kryndara').getAttribute('aria-checked')).toBe('false');
  });

  it('renders an option meta in its row, inside the radio, describing it while the name stays the label', () => {
    render(<RadioButton schema={list} value="current" onChange={() => {}} />);
    const meta = screen.getByText('saved 2 days ago');
    const dusk = radio('Dusk Run');
    expect(meta.classList.contains('sc-radio-button__meta')).toBe(true);
    expect(dusk.contains(meta)).toBe(true);
    expect(meta.id).not.toBe('');
    expect(dusk.getAttribute('aria-describedby')).toBe(meta.id);
  });

  it('an option without a meta renders no meta element and no description', () => {
    const { container } = render(<RadioButton schema={list} value="current" onChange={() => {}} />);
    expect(container.querySelectorAll('.sc-radio-button__meta')).toHaveLength(1);
    expect(radio('Kryndara').getAttribute('aria-describedby')).toBeNull();
  });

  it('keeps the face: the lore line above the label, as the other appearances draw it', () => {
    render(<RadioButton schema={list} value="current" onChange={() => {}} />);
    const current = radio(NAMES[0]);
    expect(current.querySelector('.sc-radio-button__lore')?.textContent).toBe('Current');
    expect(current.querySelector('.sc-radio-button__label')?.textContent).toBe(NAMES[0]);
  });

  it('draws dividerBefore as a decorative rule between two rows', () => {
    const { container } = render(<RadioButton schema={list} value="current" onChange={() => {}} />);
    const dividers = container.querySelectorAll('.sc-radio-button__divider');
    expect(dividers).toHaveLength(1);
    expect(dividers[0].getAttribute('aria-hidden')).toBe('true');
    expect(dividers[0].previousElementSibling).toBe(rowOf(radio('Dusk Run')));
    expect(dividers[0].nextElementSibling).toBe(rowOf(radio('Kryndara')));
  });

  it('the selected row carries data-state on and every other row off; every row has its dot', () => {
    const { container } = render(<RadioButton schema={list} value="save:Dusk Run" onChange={() => {}} />);
    expect(rowOf(radio('Dusk Run'))!.getAttribute('data-state')).toBe('on');
    expect(radio('Dusk Run').getAttribute('data-state')).toBe('on');
    for (const name of [NAMES[0], 'Kryndara', 'Vessport Null']) expect(rowOf(radio(name))!.getAttribute('data-state')).toBe('off');
    const dots = container.querySelectorAll('.sc-radio-button__dot');
    expect(dots).toHaveLength(4);
    for (const dot of dots) expect(dot.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders no CabinetBox and no flat face, and a hover pops nothing', () => {
    const { container } = render(<RadioButton schema={list} value="current" onChange={() => {}} />);
    expect(screen.queryAllByTestId('cabinet-box')).toHaveLength(0);
    expect(container.querySelector('[class*="sc-cabinet-box"]')).toBeNull();
    expect(container.querySelector('.sc-radio-button__flat')).toBeNull();
    fireEvent.mouseEnter(radio('Kryndara'));
    expect(screen.queryAllByTestId('cabinet-box')).toHaveLength(0);
  });

  it('calls onChange on a row pick and swallows re-clicking the selected row, as the other appearances do', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={list} value="current" onChange={onChange} />);
    fireEvent.click(radio('Kryndara'));
    expect(onChange).toHaveBeenCalledWith('preset:kryndara');
    onChange.mockClear();
    fireEvent.click(radio(NAMES[0]));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a selection change re-renders every row with the same parts, so the list never reflows', () => {
    const partsOf = (name: string) =>
      Array.from(rowOf(radio(name))!.querySelectorAll('*')).map((el) => el.className);
    const { rerender } = render(<RadioButton schema={list} value="current" onChange={() => {}} trailing={rollOnCurrent} />);
    const before = NAMES.map(partsOf);
    rerender(<RadioButton schema={list} value="preset:kryndara" onChange={() => {}} trailing={rollOnCurrent} />);
    expect(NAMES.map(partsOf)).toEqual(before);
  });

  it('a disabled list calls no onChange and marks every radio disabled', () => {
    const onChange = vi.fn();
    render(<RadioButton schema={list} value="current" onChange={onChange} disabled />);
    fireEvent.click(radio('Kryndara'));
    expect(onChange).not.toHaveBeenCalled();
    for (const name of NAMES) expect(radio(name).getAttribute('data-disabled')).toBe('');
  });

  it('works for the multiple variant too: pressed buttons in rows, the set in option order', () => {
    const onChange = vi.fn();
    const multiList: RadioButtonSchema = { ...list, id: 'offListMulti', multiple: true };
    const { container } = render(
      <RadioButton schema={multiList} value={['preset:vessport', 'current']} onChange={onChange} trailing={rollOnCurrent} />,
    );
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
    expect(pressed(NAMES[0])).toBe('true');
    expect(pressed('Vessport Null')).toBe('true');
    expect(pressed('Kryndara')).toBe('false');
    expect(container.querySelectorAll('.sc-radio-button__row[data-state="on"]')).toHaveLength(2);
    expect(screen.getByRole('button', { name: NAMES[0] }).contains(screen.getByRole('button', { name: 'Roll' }))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Kryndara' }));
    expect(onChange).toHaveBeenCalledWith(['current', 'preset:kryndara', 'preset:vessport']);
  });

  it('leaves cabinet and muted as they were: no rows, no trailing slot, no meta, whatever is passed', () => {
    const withMeta = (appearance: 'cabinet' | 'muted'): RadioButtonSchema => ({ ...list, appearance });
    for (const appearance of ['cabinet', 'muted'] as const) {
      const { container, unmount } = render(
        <RadioButton schema={withMeta(appearance)} value="current" onChange={() => {}} trailing={rollOnCurrent} />,
      );
      expect(container.querySelector('.sc-radio-button__row')).toBeNull();
      expect(container.querySelector('.sc-radio-button__trailing')).toBeNull();
      expect(container.querySelector('.sc-radio-button__meta')).toBeNull();
      expect(container.querySelector('.sc-radio-button__dot')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Roll' })).toBeNull();
      expect(container.querySelector('.sc-radio-button--list')).toBeNull();
      unmount();
    }
  });
});
