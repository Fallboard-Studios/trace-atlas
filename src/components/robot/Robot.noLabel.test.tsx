import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// docs/tasks/LAYOUT_REWORK.md Task 24 (spec §1.7): robots carry no text box in the world. Selection is a
// halo only; the robot's name and state read in the meta box. This renders the REAL RobotBody (Robot.test.tsx
// stubs it), so a label added anywhere in the body would show here.
vi.mock('@/systems/workLoop', () => ({ onRobotMounted: vi.fn() }));

import { Robot } from './Robot';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import type { Robot as RobotType } from '@/types/Robot';
import type { Locale } from '@/types/locale';

const localeId = getActiveLocaleId();

function makeRobot(): RobotType {
  return {
    id: 'r1',
    name: 'Tidal Wisp',
    identityColor: '#428d95',
    gemSeed: 20261004,
    position: { x: 10, y: 20 },
    melody: [],
    audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' },
    octaveRange: [3, 4],
    masterVolume: 0.7,
    docking: 'active',
    activity: 'working',
    batteryLevel: 80,
    companyId: 'c1',
  } as unknown as RobotType;
}

describe('a selected robot in the world has no text label', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useLocaleStore.getState().setLocaleData(localeId, {
      robots: [makeRobot()],
      companies: [{ id: 'c1', name: 'Rust Syndicate', color: '#b5502a', robotIds: ['r1'] }],
    } as unknown as Partial<Locale>);
  });

  it("renders no <text> and not the robot's name, selected", () => {
    useUIStore.getState().selectRobot('r1');
    const { container } = render(<svg><Robot robotId="r1" /></svg>);
    expect(container.querySelector('g.robot.selected')).toBeTruthy();
    expect(container.querySelectorAll('text, foreignObject, title')).toHaveLength(0);
    expect(container.textContent).not.toContain('Tidal Wisp');
  });

  it('nor as a member of the selected company', () => {
    useUIStore.getState().selectCompany('c1');
    const { container } = render(<svg><Robot robotId="r1" /></svg>);
    expect(container.querySelector('g.robot.isCompanyMember')).toBeTruthy();
    expect(container.querySelectorAll('text, foreignObject, title')).toHaveLength(0);
    expect(container.textContent).not.toContain('Tidal Wisp');
    expect(container.textContent).not.toContain('Rust Syndicate');
  });

  it('and no source file under components/robot draws an SVG <text>', () => {
    const dir = resolve(__dirname);
    const offenders = (readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f))
      .filter((f) => /<text[\s>]/.test(readFileSync(join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
