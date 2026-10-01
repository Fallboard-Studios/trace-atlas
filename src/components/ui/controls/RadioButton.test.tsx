import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
// implementation) so a render-count test (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md
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

  // docs/specs/HEADER_HUB_CONSOLIDATION.md §1.4 (correction found during
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
  // currently-selected one. See docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md §1.1.
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
  // "no hover/partial-pop on unselected options" exclusion (docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md §3).
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

  // docs/specs/HEADER_HUB_CONSOLIDATION.md §1.4 — literal square box size,
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

  // docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.3 — per-option color, consumed by
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

  describe('React.memo (docs/tasks/OBLIQUE_CABINETRY_MEMOIZATION.md Task 9)', () => {
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
    expect(screen.getByText('Dissipation')).toBeTruthy();
  });

  it('does not accept the retired `label` field on an option', () => {
    // @ts-expect-error — `label` was renamed to `humanLabel`; a stale option is a type error, not a runtime fallback
    const stale: RadioButtonSchema['options'][number] = { value: 'x', label: 'X' };
    expect(stale.value).toBe('x');
  });
});
