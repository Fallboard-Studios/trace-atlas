import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

/*
 * docs/tasks/MONITOR_MODE_TRUSTWORTHY.md Task 8 (spec §1.5, §7.1 B1–B3): the small light before the Status word. Its
 * colour is the robot's own mode (Auto green, Solo yellow, Mute red, Highlight blue) through getStatusLightColor;
 * `lit` says whether the robot is heard right now.
 */

import { ModeLight } from './ModeLight';
import { getStatusLightColor } from '@/utils/statusLightColors';
import type { Robot } from '@/types/Robot';

type Mode = NonNullable<Robot['audioMode']>;

const light = (container: HTMLElement) => container.querySelector('.mode-light') as HTMLElement;

describe('ModeLight', () => {
  it.each([
    ['none', 'green'],
    ['solo', 'yellow'],
    ['mute', 'red'],
    ['highlight', 'blue'],
  ] as const)('colours mode %s %s, from getStatusLightColor', (mode, state) => {
    const { container } = render(<ModeLight mode={mode} lit />);
    const el = light(container);
    expect(el.style.getPropertyValue('--mode-light-color')).toBe(getStatusLightColor(state).color);
    expect(el.style.getPropertyValue('--mode-light-glow')).toBe(getStatusLightColor(state).glow);
  });

  it('gives each of the four modes its own colour', () => {
    const colours = (['none', 'solo', 'mute', 'highlight'] as const).map((mode) => {
      const { container } = render(<ModeLight mode={mode} lit={false} />);
      return light(container).style.getPropertyValue('--mode-light-color');
    });
    expect(new Set(colours).size).toBe(4);
  });

  it.each(['none', 'solo', 'mute', 'highlight'] as const)('carries data-mode %s', (mode: Mode) => {
    const { container } = render(<ModeLight mode={mode} lit />);
    expect(light(container).dataset.mode).toBe(mode);
  });

  it('carries data-lit true when lit and false when dim', () => {
    const { container, rerender } = render(<ModeLight mode="none" lit />);
    expect(light(container).dataset.lit).toBe('true');
    rerender(<ModeLight mode="none" lit={false} />);
    expect(light(container).dataset.lit).toBe('false');
  });

  it('changes nothing but data-lit between lit and dim', () => {
    const lit = render(<ModeLight mode="highlight" lit />).container.innerHTML;
    const dim = render(<ModeLight mode="highlight" lit={false} />).container.innerHTML;
    expect(dim).not.toBe(lit);
    expect(dim.replace('data-lit="false"', 'data-lit="true"')).toBe(lit);
  });

  it('is one empty inline span, hidden from the accessibility tree (the word carries the meaning)', () => {
    const { container } = render(<ModeLight mode="solo" lit />);
    const el = light(container);
    expect(container.children).toHaveLength(1);
    expect(el.tagName).toBe('SPAN');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.textContent).toBe('');
    expect(el.children).toHaveLength(0);
  });
});
