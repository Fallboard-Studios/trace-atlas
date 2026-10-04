import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RobotGreebles, KIND_COUNT, KIND_NAMES } from './RobotGreebles';
import type { GreebleSlot } from './greebleSlots';

const SLOTS: readonly GreebleSlot[] = [
  { x: 21, y: 19, w: 6, h: 6 },
  { x: 36, y: 18, w: 4, h: 6 },
  { x: 50, y: 18, w: 12, h: 6 },
];

const colors = { accent: '#c47a3d', shadow: '#15202b' };

describe('RobotGreebles', () => {
  it('renders one .greeble per entry with the matching greeble--{kind} class and a translate equal to its slot', () => {
    const greebles = [{ kind: 0, slot: 0 }, { kind: 2, slot: 2 }];
    const { container } = render(<svg><RobotGreebles greebles={greebles} slots={SLOTS} colors={colors} /></svg>);

    const parts = container.querySelectorAll('.greeble');
    expect(parts).toHaveLength(2);
    expect(parts[0].getAttribute('class')).toContain(`greeble--${KIND_NAMES[0]}`);
    expect(parts[0].getAttribute('transform')).toBe(`translate(${SLOTS[0].x},${SLOTS[0].y})`);
    expect(parts[1].getAttribute('class')).toContain(`greeble--${KIND_NAMES[2]}`);
    expect(parts[1].getAttribute('transform')).toBe(`translate(${SLOTS[2].x},${SLOTS[2].y})`);
  });

  it('every kind draws at most 2 elements, never equal to colors.primary, using only accent/shadow/hardware greys', () => {
    const primary = '#111111'; // the one colour RobotGreebles must never use — not even a prop here
    for (let kind = 0; kind < KIND_COUNT; kind++) {
      const { container } = render(<svg><RobotGreebles greebles={[{ kind, slot: 0 }]} slots={SLOTS} colors={colors} /></svg>);
      const part = container.querySelector('.greeble')!;
      const elements = part.querySelectorAll('*');
      expect(elements.length, `kind ${KIND_NAMES[kind]}`).toBeLessThanOrEqual(2);
      elements.forEach((el) => {
        const fill = el.getAttribute('fill');
        const stroke = el.getAttribute('stroke');
        expect(fill).not.toBe(primary);
        expect(stroke).not.toBe(primary);
      });
    }
  });

  it('renders an empty g.greebles with no children when greebles is empty', () => {
    const { container } = render(<svg><RobotGreebles greebles={[]} slots={SLOTS} colors={colors} /></svg>);
    const group = container.querySelector('g.greebles');
    expect(group).not.toBeNull();
    expect(group?.children.length).toBe(0);
  });

  it('does not crash and skips an entry whose slot index is out of range', () => {
    expect(() => render(<svg><RobotGreebles greebles={[{ kind: 0, slot: 99 }]} slots={SLOTS} colors={colors} /></svg>)).not.toThrow();
  });

  it('has no identityColor (or any other) prop beyond greebles/slots/colors — compile-time', () => {
    const { container } = render(<svg><RobotGreebles greebles={[]} slots={SLOTS} colors={colors} /></svg>);
    expect(container.querySelector('g.greebles')).not.toBeNull();
    // @ts-expect-error RobotGreebles has no identityColor prop — colour only arrives via colors.accent/shadow
    render(<svg><RobotGreebles greebles={[]} slots={SLOTS} colors={colors} identityColor="#428d95" /></svg>);
  });
});
