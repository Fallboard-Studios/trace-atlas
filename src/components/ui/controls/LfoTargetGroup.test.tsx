import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

let lastOnComplete: (() => void) | undefined;

vi.mock('gsap', () => ({
  default: {
    timeline: vi.fn((config?: { onComplete?: () => void }) => {
      lastOnComplete = config?.onComplete;
      // Chainable — CabinetBox.tsx's own real (non-skipMountAnimation) mount
      // path chains several .fromTo() calls on the same timeline instance
      // (docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md). Every CabinetBox
      // this file exercised before roadmap 11.1.6 (SliderLinear's/Toggle's
      // voxel-track boxes) passes skipMountAnimation, which skips this path
      // entirely — RadioButton (Lfo's Shape row, 11.1.6) deliberately does
      // NOT skip it, since a newly-selected option's pop is a real
      // transition, not a remount — so this is the first real exercise of
      // the .fromTo() branch in this file. `to` stays for LfoTargetGroup's
      // own row-select transition timeline, unrelated to CabinetBox. See
      // docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md.
      const tl: { to: () => void; fromTo: () => typeof tl; kill: () => void } = {
        to: vi.fn(),
        fromTo: vi.fn(() => tl),
        kill: vi.fn(),
      };
      return tl;
    }),
    // LfoTargetGroup renders Lfo, which renders through SliderLinear/Toggle
    // and therefore CabinetBox — CabinetBox now calls gsap.set() directly
    // (its one-time wall-skew effect, unconditional on mount; see
    // docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md), which this file's
    // own local gsap mock didn't previously need to stub. A no-op here is
    // sufficient — no test in this file asserts on gsap.set's call args.
    set: vi.fn(),
  },
}));

vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Captures every `schema` prop the real Lfo component receives, without replacing its actual
// rendering — Lfo is itself already React.memo-wrapped, so it can't be spied on via vi.fn the way
// a plain function export can (same reasoning as AudioSettingSection.test.tsx's own Lfo-schema
// capture for docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 1).
const capturedLfoSchemas = vi.hoisted(() => [] as unknown[]);
vi.mock('@/components/ui/controls/Lfo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./Lfo')>();
  function LfoSchemaCapture(props: ComponentProps<typeof actual.Lfo>) {
    capturedLfoSchemas.push(props.schema);
    return <actual.Lfo {...props} />;
  }
  return { ...actual, Lfo: LfoSchemaCapture };
});

import { LfoTargetGroup } from './LfoTargetGroup';
import { useLfoTargetGroup, type LfoTargetGroupField } from './useLfoTargetGroup';
import type { LfoValue } from '@/types/controls';

function lfo(rate: number): LfoValue {
  return { shape: 'sine', rate, depth: 50 };
}

const FIELDS: LfoTargetGroupField[] = [
  { field: 'low', label: 'Low', lfoValue: lfo(1) },
  { field: 'mid', label: 'Mid', lfoValue: lfo(2) },
  { field: 'high', label: 'High', lfoValue: lfo(3) },
];

// renderField deliberately wires no click/focus handling of its own — the row wrapper
// LfoTargetGroup renders around it is what must supply the "click/click-around" targeting.
function renderField(field: string, targeted: boolean) {
  return <span data-testid={`field-${field}`}>{targeted ? `${field}:targeted` : field}</span>;
}

function flushTransition() {
  act(() => {
    lastOnComplete?.();
  });
}

describe('LfoTargetGroup', () => {
  beforeEach(() => {
    lastOnComplete = undefined;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('is a thin wrapper around the useLfoTargetGroup hook, both importable independently', () => {
    // Task 3 (AudioRigDrawer) calls useLfoTargetGroup directly, from its own module, against
    // its own pre-rendered rows — one source of truth for the state machine, two consumers.
    // LfoTargetGroup is React.memo-wrapped (docs/todo/backlog.md #27 follow-up) — an object at
    // runtime, not a plain function — so this checks importability via $$typeof instead.
    expect((LfoTargetGroup as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    expect(typeof useLfoTargetGroup).toBe('function');
  });

  it('renders exactly one row per fields entry, defaulting the first to targeted', () => {
    const { container } = render(
      <LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} />,
    );
    const rows = container.querySelectorAll('.sc-lfo-target-group__row');
    expect(rows).toHaveLength(3);
    expect(rows[0].classList.contains('isActive')).toBe(true);
    expect(rows[1].classList.contains('isActive')).toBe(false);
    expect(rows[2].classList.contains('isActive')).toBe(false);
    expect(screen.getByTestId('field-low').textContent).toBe('low:targeted');
  });

  it('renders exactly one shared Lfo display regardless of field count, showing the targeted field', () => {
    render(<LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} />);
    // renderField's own stub renders no sliders of its own — these 2 (Rate, Depth) can only
    // come from the one shared Lfo display.
    expect(screen.getAllByRole('slider')).toHaveLength(2);
    expect(screen.getByText('Low')).toBeTruthy();
  });

  describe('sliders panel (docs/tasks/DIRECTIONAL_PANEL_WIRING.md follow-up: column[sliders-panel, Lfo, driftContent])', () => {
    it('wraps the field rows in their own DirectionalPanel, defaulting to column orientation', () => {
      const { container } = render(
        <LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} />,
      );
      const slidersPanel = container.querySelector('.sc-directional-panel')!;
      expect(slidersPanel).not.toBeNull();
      expect(slidersPanel.querySelector('.sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('column');
      expect(container.querySelectorAll('.sc-directional-panel .sc-lfo-target-group__row')).toHaveLength(3);
    });

    it('honors an explicit sliderPanelOrientation of "row"', () => {
      const { container } = render(
        <LfoTargetGroup
          groupId="audioRig.eq3"
          fields={FIELDS}
          onLfoChange={() => {}}
          renderField={renderField}
          sliderPanelOrientation="row"
        />,
      );
      const slidersPanel = container.querySelector('.sc-directional-panel')!;
      expect(slidersPanel.querySelector('.sc-directional-panel__content')?.getAttribute('data-orientation')).toBe('row');
    });

    it('renders the sliders panel, then the shared Lfo display, then driftContent — in that DOM order, all inside the outer sc-lfo-target-group wrapper', () => {
      const { container } = render(
        <LfoTargetGroup
          groupId="audioRig.eq3"
          fields={FIELDS}
          onLfoChange={() => {}}
          renderField={renderField}
          driftContent={<div data-testid="drift">Drift</div>}
        />,
      );
      const root = container.querySelector('.sc-lfo-target-group')!;
      const slidersPanel = root.querySelector('.sc-directional-panel')!;
      const display = root.querySelector('.sc-lfo-target-group__display')!;
      const drift = screen.getByTestId('drift');
      expect(root.contains(slidersPanel)).toBe(true);
      expect(slidersPanel.compareDocumentPosition(display) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(display.compareDocumentPosition(drift) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('renders driftContent inside the same wrapper, below the shared Lfo display, only when passed', () => {
    const { container, rerender } = render(
      <LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} />,
    );
    expect(container.querySelector('[data-testid="drift"]')).toBeNull();

    rerender(
      <LfoTargetGroup
        groupId="audioRig.eq3"
        fields={FIELDS}
        onLfoChange={() => {}}
        renderField={renderField}
        driftContent={<div data-testid="drift">Drift</div>}
      />,
    );
    const root = container.querySelector('.sc-lfo-target-group')!;
    const display = container.querySelector('.sc-lfo-target-group__display')!;
    const drift = screen.getByTestId('drift');
    expect(root.contains(drift)).toBe(true);
    // Comes after the display in document order — "directly beneath" per spec §1.2.
    expect(display.compareDocumentPosition(drift) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("calls onLfoChange with the currently-selected field when the shared Lfo control's value changes", () => {
    const onLfoChange = vi.fn();
    render(<LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={onLfoChange} renderField={renderField} />);
    fireEvent.click(screen.getByRole('radio', { name: 'SQUARE' }));
    expect(onLfoChange).toHaveBeenCalledWith('low', { ...lfo(1), shape: 'square' });
  });

  it('clicking anywhere in a row (click-around, not just the rendered control) selects that row after the transition completes', () => {
    const { container } = render(
      <LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} />,
    );
    const rows = container.querySelectorAll('.sc-lfo-target-group__row');
    fireEvent.click(rows[1]);
    flushTransition();

    expect(rows[1].classList.contains('isActive')).toBe(true);
    expect(rows[0].classList.contains('isActive')).toBe(false);
    expect(screen.getByText('Mid')).toBeTruthy();
  });

  it('keyboard-focusing a row selects it, same as clicking', () => {
    const { container } = render(
      <LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} />,
    );
    const rows = container.querySelectorAll('.sc-lfo-target-group__row');
    fireEvent.focus(rows[2]);
    flushTransition();

    expect(rows[2].classList.contains('isActive')).toBe(true);
    expect(screen.getByText('High')).toBeTruthy();
  });

  it("passes renderField the row's own select callback as its third argument", () => {
    const received: Array<() => void> = [];
    const { container } = render(
      <LfoTargetGroup
        groupId="audioRig.eq3"
        fields={FIELDS}
        onLfoChange={() => {}}
        renderField={(field, _targeted, select) => {
          received.push(select);
          return <span data-testid={`field-${field}`}>{field}</span>;
        }}
      />,
    );
    expect(received).toHaveLength(3);
    act(() => received[1]());
    flushTransition();
    const rows = container.querySelectorAll('.sc-lfo-target-group__row');
    expect(rows[1].classList.contains('isActive')).toBe(true);
  });

  it('shows the neutral placeholder display (disabled) while a target-swap transition is in flight', () => {
    const { container } = render(
      <LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} />,
    );
    const rows = container.querySelectorAll('.sc-lfo-target-group__row');
    fireEvent.click(rows[1]);
    // Before flushTransition() — the display is mid-transition.
    expect(container.querySelector('.sc-lfo-target-group__display')?.classList.contains('isActive')).toBe(true);
    expect(screen.getAllByRole('slider')[0].getAttribute('data-disabled')).toBe('');
  });

  it('disables the shared Lfo display when the disabled prop is true', () => {
    render(
      <LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} disabled />,
    );
    expect(screen.getAllByRole('slider')[0].getAttribute('data-disabled')).toBe('');
  });

  describe('heldOff (Audio Load Budget)', () => {
    it('passes Lfo heldOff=true, and shows Rate/Depth as 0, only while the TARGETED field is held off', () => {
      const { container } = render(
        <LfoTargetGroup
          groupId="audioRig.eq3"
          fields={FIELDS}
          onLfoChange={() => {}}
          renderField={renderField}
          heldOff={{ low: true }}
        />,
      );
      // 'low' is the default-targeted field (first in FIELDS), lfo(1) → rate 1.
      expect(container.querySelector('.sc-lfo.sc-held-off')).toBeTruthy();
      expect(screen.getAllByRole('slider')[0].getAttribute('aria-valuenow')).toBe('0');
    });

    it('shows the real value, and no sc-held-off class, once the targeted field is switched away from the held-off one', () => {
      const { container } = render(
        <LfoTargetGroup
          groupId="audioRig.eq3"
          fields={FIELDS}
          onLfoChange={() => {}}
          renderField={renderField}
          heldOff={{ low: true }}
        />,
      );
      const rows = container.querySelectorAll('.sc-lfo-target-group__row');
      fireEvent.click(rows[1]); // 'mid', not held off
      flushTransition();
      expect(container.querySelector('.sc-lfo.sc-held-off')).toBeNull();
      expect(screen.getAllByRole('slider')[0].getAttribute('aria-valuenow')).toBe('2'); // lfo(2)'s rate
    });

    it('treats an omitted heldOff prop, and a field missing from it, as not held off', () => {
      const { container: withoutProp } = render(
        <LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} />,
      );
      expect(withoutProp.querySelector('.sc-lfo.sc-held-off')).toBeNull();

      const { container: withOtherField } = render(
        <LfoTargetGroup groupId="audioRig.mid" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} heldOff={{ mid: true }} />,
      );
      // 'low' (the default target) isn't a key in heldOff at all.
      expect(withOtherField.querySelector('.sc-lfo.sc-held-off')).toBeNull();
    });
  });

  describe('memoization (docs/todo/backlog.md #27 follow-up, 2026-09-15)', () => {
    it('passes Lfo the same schema object reference across re-renders with the same groupId/displayLabel', () => {
      capturedLfoSchemas.length = 0;
      const { rerender } = render(
        <LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} />,
      );
      rerender(
        <LfoTargetGroup groupId="audioRig.eq3" fields={FIELDS} onLfoChange={() => {}} renderField={renderField} disabled />,
      );

      expect(capturedLfoSchemas.length).toBeGreaterThanOrEqual(2);
      expect(capturedLfoSchemas[1]).toBe(capturedLfoSchemas[0]);
    });
  });
});
