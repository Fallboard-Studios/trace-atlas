import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RobotLayerSockets } from './RobotLayerSockets';
import type { Pos } from './greebleSlots';

const POSITIONS: readonly [Pos, Pos] = [
  { x: 10, y: 20 },
  { x: 30, y: 40 },
];
const glass = '#428d95';
const sheen = '#bfe3e6';
const housing = '#15202b';

describe('RobotLayerSockets', () => {
  it('always renders two .socket groups with the coaxial/harmonic modifier classes and a translate equal to their position', () => {
    const { container } = render(
      <svg>
        <RobotLayerSockets positions={POSITIONS} opacities={[1, 0.4]} glass={glass} sheen={sheen} housing={housing} />
      </svg>
    );
    const sockets = container.querySelectorAll('.socket');
    expect(sockets).toHaveLength(2);
    expect(sockets[0].getAttribute('class')).toContain('socket--coaxial');
    expect(sockets[0].getAttribute('transform')).toBe(`translate(${POSITIONS[0].x},${POSITIONS[0].y})`);
    expect(sockets[1].getAttribute('class')).toContain('socket--harmonic');
    expect(sockets[1].getAttribute('transform')).toBe(`translate(${POSITIONS[1].x},${POSITIONS[1].y})`);
  });

  it('the housing ring is fill="none", strokes with `housing`, and sits outside the opacity group so a dark socket still reads as a fixture', () => {
    const { container } = render(
      <svg>
        <RobotLayerSockets positions={POSITIONS} opacities={[1, 1]} glass={glass} sheen={sheen} housing={housing} />
      </svg>
    );
    const socket = container.querySelector('.socket')!;
    const housingRing = socket.querySelector('circle[fill="none"]');
    expect(housingRing).not.toBeNull();
    expect(housingRing!.getAttribute('stroke')).toBe(housing);

    let el: Element | null = housingRing;
    while (el && el !== socket) {
      expect(el.hasAttribute('opacity')).toBe(false);
      el = el.parentElement;
    }
  });

  it('the opacity group carries the given opacity for each socket independently', () => {
    const { container } = render(
      <svg>
        <RobotLayerSockets positions={POSITIONS} opacities={[0.4, 1]} glass={glass} sheen={sheen} housing={housing} />
      </svg>
    );
    const sockets = container.querySelectorAll('.socket');
    expect(sockets[0].querySelector('[opacity]')?.getAttribute('opacity')).toBe('0.4');
    expect(sockets[1].querySelector('[opacity]')?.getAttribute('opacity')).toBe('1');
  });

  it('draws at most 3 circles per socket (housing, glass, sheen)', () => {
    const { container } = render(
      <svg>
        <RobotLayerSockets positions={POSITIONS} opacities={[1, 1]} glass={glass} sheen={sheen} housing={housing} />
      </svg>
    );
    container.querySelectorAll('.socket').forEach((socket) => {
      expect(socket.querySelectorAll('circle').length).toBeLessThanOrEqual(3);
    });
  });

  it('fills are exactly glass/sheen and the housing ring strokes exactly `housing` — no raw colour literals', () => {
    const { container } = render(
      <svg>
        <RobotLayerSockets positions={POSITIONS} opacities={[1, 1]} glass={glass} sheen={sheen} housing={housing} />
      </svg>
    );
    const socket = container.querySelector('.socket')!;
    const circles = Array.from(socket.querySelectorAll('circle'));
    const fills = circles.map((c) => c.getAttribute('fill'));
    expect(fills).toContain(glass);
    expect(fills).toContain(sheen);
    circles.forEach((c) => {
      const fill = c.getAttribute('fill');
      if (fill !== 'none') expect([glass, sheen]).toContain(fill);
    });
    const housingCircle = circles.find((c) => c.getAttribute('fill') === 'none')!;
    expect(housingCircle.getAttribute('stroke')).toBe(housing);
  });
});
