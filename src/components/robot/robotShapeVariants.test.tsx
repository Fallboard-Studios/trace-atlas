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
  colors: { primary: '#111111', secondary: '#222222', accent: '#333333' },
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

  it('applies scale * (1 + scaleBias) to the root transform, defaulting scaleBias to 0', () => {
    const { container: defaultCase } = render(<svg><Component {...baseProps} scale={2} /></svg>);
    const rootGroup = defaultCase.querySelector('g[transform^="scale("]');
    expect(rootGroup?.getAttribute('transform')).toBe('scale(2)');

    const { container: biasedCase } = render(
      <svg>
        <Component {...baseProps} scale={2} shapeParams={{ torsoAspect: 1, appendageLength: 1, scaleBias: 0.5 }} />
      </svg>,
    );
    const biasedRootGroup = biasedCase.querySelector('g[transform^="scale("]');
    // overall = scale * (1 + scaleBias) = 2 * 1.5 = 3
    expect(biasedRootGroup?.getAttribute('transform')).toBe('scale(3)');
  });

  it('renders no propeller or propeller mounting arm', () => {
    const { container } = render(<svg><Component {...baseProps} /></svg>);
    expect(container.querySelector('.propeller')).toBeNull();
    expect(container.querySelector('.propeller-arm')).toBeNull();
  });
});
