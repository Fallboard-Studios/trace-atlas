import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RobotAngular } from './RobotAngular';
import { RobotIndustrial } from './RobotIndustrial';
import { RobotOrganic } from './RobotOrganic';
import { RobotSleek } from './RobotSleek';

// The 4 shape variants share an identical RobotSVGProps contract (colors,
// scale, detailLevel, shapeParams?, dimOpacity?) and the same detailLevel/
// dimOpacity behavioral hooks — confirmed by direct read — so
// they're exercised here as one shared parametrized file rather than four
// near-duplicate ones (docs/specs/TEST_COVERAGE_CORE_MODULES.md §3.4).
const VARIANTS = [
  ['RobotAngular', RobotAngular],
  ['RobotIndustrial', RobotIndustrial],
  ['RobotOrganic', RobotOrganic],
  ['RobotSleek', RobotSleek],
] as const;

const baseProps = {
  colors: { primary: '#111111', secondary: '#222222', accent: '#333333', highlight: '#444444', shadow: '#050505' },
  scale: 1,
  detailLevel: 0.2,
};

describe.each(VARIANTS)('%s', (_name, Component) => {
  it('renders without throwing given typical props', () => {
    expect(() => render(<svg><Component {...baseProps} /></svg>)).not.toThrow();
  });

  it('renders the .details group only when detailLevel > 0.5 (strict >, not >=)', () => {
    const { container: atThreshold } = render(<svg><Component {...baseProps} detailLevel={0.5} /></svg>);
    expect(atThreshold.querySelector('.details')).toBeNull();

    const { container: aboveThreshold } = render(<svg><Component {...baseProps} detailLevel={0.6} /></svg>);
    expect(aboveThreshold.querySelector('.details')).not.toBeNull();
  });

  it('defaults dimOpacity to 1 on the viewport group when omitted', () => {
    // opacity="1" uniquely identifies the dimOpacity-driven group — every
    // other opacity attribute in these components is a static decorative
    // value below 1 (highlights/shadows/etc.), never exactly "1".
    const { container } = render(<svg><Component {...baseProps} /></svg>);
    const dimmed = container.querySelector('[opacity="1"]');
    expect(dimmed).not.toBeNull();
  });

  it('applies an explicit dimOpacity to the viewport group', () => {
    const { container } = render(<svg><Component {...baseProps} dimOpacity={0.4} /></svg>);
    const dimmed = container.querySelector('[opacity="0.4"]');
    expect(dimmed).not.toBeNull();
  });

  it('centre-scales the root about (48,36): translate(48,36) scale(s) translate(-48,-36)', () => {
    const { container } = render(<svg><Component {...baseProps} scale={2} /></svg>);
    const rootGroup = container.querySelector('g[transform^="translate(48,36)"]');
    expect(rootGroup?.getAttribute('transform')).toBe('translate(48,36) scale(2) translate(-48,-36)');
  });

  it('leaves the inner torsoAspect scale group unchanged', () => {
    const { container } = render(
      <svg><Component {...baseProps} shapeParams={{ torsoAspect: 1.2 }} /></svg>,
    );
    const torsoGroup = container.querySelector('g[transform^="scale("]');
    expect(torsoGroup?.getAttribute('transform')).toBe('scale(1.2,1)');
  });

  it('shapeParams is { torsoAspect } only — appendageLength/scaleBias no longer type-check (compile-time)', () => {
    // Each line is a type error once the fields are gone: an excess-property check on the
    // object literal passed as shapeParams. Runtime: render ignores unknown props, so this
    // stays green. One element per line, per the project's ts-expect-error convention.
    const { container } = render(<svg><Component {...baseProps} shapeParams={{ torsoAspect: 1 }} /></svg>);
    expect(container.querySelector('svg')).not.toBeNull();
    // @ts-expect-error appendageLength no longer exists on ShapeParams
    render(<svg><Component {...baseProps} shapeParams={{ torsoAspect: 1, appendageLength: 1 }} /></svg>);
    // @ts-expect-error scaleBias no longer exists on ShapeParams
    render(<svg><Component {...baseProps} shapeParams={{ torsoAspect: 1, scaleBias: 0.5 }} /></svg>);
  });

  it('renders no propeller or propeller mounting arm', () => {
    const { container } = render(<svg><Component {...baseProps} /></svg>);
    expect(container.querySelector('.propeller')).toBeNull();
    expect(container.querySelector('.propeller-arm')).toBeNull();
  });

  it('shades from the robot\'s own highlight/shadow colours, not a fixed grey/black (Phase 36 Task 9)', () => {
    const { container } = render(<svg><Component {...baseProps} /></svg>);
    expect(container.querySelector('[fill="#a9adb0"]')).toBeNull();
    expect(container.querySelector('[fill="#000000"]')).toBeNull();
    expect(container.querySelector(`[fill="${baseProps.colors.highlight}"]`)).not.toBeNull();
    expect(container.querySelector(`[fill="${baseProps.colors.shadow}"]`)).not.toBeNull();
  });
});
