// ========================================
// MOCKS
// ========================================
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';

// AccordionContainer's own real rendering (Radix + GSAP) is already proven in
// AccordionContainer.test.tsx — this file only needs to verify RobotSectionAccordionStack wires
// the right id/humanLabel/open/onOpenChange/style/children into it and nests it correctly, so a
// thin stub keeps these tests about THIS component's own logic, not AccordionContainer's.
vi.mock('@/components/ui/controls/AccordionContainer', () => ({
  AccordionContainer: ({ schema, open, onOpenChange, style, children }: {
    schema: { id: string; humanLabel: string };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    style?: CSSProperties;
    children?: ReactNode;
  }) => (
    <div data-testid={`accordion-${schema.id}`} data-human-label={schema.humanLabel} data-open={String(open)} style={style}>
      <button data-testid={`toggle-${schema.id}`} onClick={() => onOpenChange(!open)}>toggle</button>
      <div data-testid={`content-${schema.id}`}>{children}</div>
    </div>
  ),
}));

// ========================================
// IMPORTS
// ========================================
import { RobotSectionAccordionStack, type RobotSectionAccordionStackProps } from './RobotSectionAccordionStack';

// ========================================
// HELPERS
// ========================================
function makeProps(overrides: Partial<RobotSectionAccordionStackProps> = {}): RobotSectionAccordionStackProps {
  return {
    prefix: 'probes.r1',
    isOpen: () => false,
    setOpen: vi.fn(),
    hasApproached: () => true,
    sectionAnchorRef: vi.fn((_id: string) => () => {}),
    resolveStyle: (trait) => ({ '--test-trait': trait }) as CSSProperties,
    renderSubsection: (subId) => <span data-testid={`rendered-${subId}`}>{subId}</span>,
    ...overrides,
  };
}

// ========================================
// TESTS
// ========================================

describe('RobotSectionAccordionStack', () => {
  it('renders one AccordionContainer per non-merged subsection, with the correct id and accordion trigger label', () => {
    render(<RobotSectionAccordionStack {...makeProps()} />);
    expect(screen.getByTestId('accordion-probes.r1.volume.audioSettings').getAttribute('data-human-label')).toBe('Levels');
    expect(screen.getByTestId('accordion-probes.r1.melody.rhythm').getAttribute('data-human-label')).toBe('Composition');
    expect(screen.getByTestId('accordion-probes.r1.envelope.pingContour').getAttribute('data-human-label')).toBe('Envelope');
    expect(screen.getByTestId('accordion-probes.r1.source.baselineOscillator').getAttribute('data-human-label')).toBe('Baseline Oscillator');
    expect(screen.getByTestId('accordion-probes.r1.source.coaxialOscillator').getAttribute('data-human-label')).toBe('Coaxial Oscillator');
    expect(screen.getByTestId('accordion-probes.r1.source.harmonicOscillator').getAttribute('data-human-label')).toBe('Harmonic Oscillator');
  });

  it("wires each accordion's open state from isOpen and its onOpenChange to setOpen", () => {
    const setOpen = vi.fn();
    const isOpen = (id: string) => id === 'probes.r1.melody.rhythm';
    render(<RobotSectionAccordionStack {...makeProps({ isOpen, setOpen })} />);

    expect(screen.getByTestId('accordion-probes.r1.melody.rhythm').getAttribute('data-open')).toBe('true');
    expect(screen.getByTestId('accordion-probes.r1.envelope.pingContour').getAttribute('data-open')).toBe('false');

    fireEvent.click(screen.getByTestId('toggle-probes.r1.envelope.pingContour'));
    expect(setOpen).toHaveBeenCalledWith('probes.r1.envelope.pingContour', true);

    fireEvent.click(screen.getByTestId('toggle-probes.r1.melody.rhythm'));
    expect(setOpen).toHaveBeenCalledWith('probes.r1.melody.rhythm', false);
  });

  it("nests source's 3 subsection accordions inside one outer, wrapping Source accordion", () => {
    render(<RobotSectionAccordionStack {...makeProps()} />);
    const outer = screen.getByTestId('accordion-probes.r1.source');
    expect(outer.getAttribute('data-human-label')).toBe('Source');

    const outerContent = screen.getByTestId('content-probes.r1.source');
    expect(outerContent.querySelector('[data-testid="accordion-probes.r1.source.baselineOscillator"]')).not.toBeNull();
    expect(outerContent.querySelector('[data-testid="accordion-probes.r1.source.coaxialOscillator"]')).not.toBeNull();
    expect(outerContent.querySelector('[data-testid="accordion-probes.r1.source.harmonicOscillator"]')).not.toBeNull();
  });

  it('renders volume/melody/envelope with no section-level wrapping accordion — only their one subsection accordion', () => {
    render(<RobotSectionAccordionStack {...makeProps()} />);
    expect(screen.queryByTestId('accordion-probes.r1.volume')).toBeNull();
    expect(screen.queryByTestId('accordion-probes.r1.melody')).toBeNull();
    expect(screen.queryByTestId('accordion-probes.r1.envelope')).toBeNull();
    // Their own single subsection accordion still renders, unwrapped, directly under the section's anchor div.
    expect(screen.queryByTestId('accordion-probes.r1.volume.audioSettings')).not.toBeNull();
  });

  it('excludes frequency ("Pitches") entirely — no accordion rendered, not present in output', () => {
    render(<RobotSectionAccordionStack {...makeProps()} />);
    expect(screen.queryByTestId('accordion-probes.r1.melody.frequency')).toBeNull();
    expect(screen.queryByText('probes.r1.melody.frequency')).toBeNull();
  });

  it('only calls renderSubsection for a subsection whose id hasApproached reports true — lazy-mount gating', () => {
    const renderSubsection = vi.fn((subId: string) => <span>{subId}</span>);
    const hasApproached = (id: string) => id === 'probes.r1.envelope.pingContour';
    render(<RobotSectionAccordionStack {...makeProps({ hasApproached, renderSubsection })} />);

    expect(renderSubsection).toHaveBeenCalledWith('pingContour', 'envelope');
    expect(renderSubsection).not.toHaveBeenCalledWith('rhythm', 'melody');
    // Each accordion's own intro panel renders unconditionally (not lazy-mount gated), so its
    // content wrapper's text includes that intro plus the gated renderSubsection() output.
    expect(screen.getByTestId('content-probes.r1.envelope.pingContour').textContent).toContain('pingContour');
    expect(screen.getByTestId('content-probes.r1.melody.rhythm').textContent).not.toContain('rhythm');
  });

  it("applies resolveStyle(section trait) as every accordion's style, including nested source subsections", () => {
    const resolveStyle = vi.fn((trait: string) => ({ '--trait': trait }) as CSSProperties);
    render(<RobotSectionAccordionStack {...makeProps({ resolveStyle })} />);

    expect(resolveStyle).toHaveBeenCalledWith('output');
    expect(resolveStyle).toHaveBeenCalledWith('composition');
    expect(resolveStyle).toHaveBeenCalledWith('timeSpace');
    expect(resolveStyle).toHaveBeenCalledWith('spectral');
    expect(screen.getByTestId('accordion-probes.r1.volume.audioSettings').style.getPropertyValue('--trait')).toBe('output');
    expect(screen.getByTestId('accordion-probes.r1.source.baselineOscillator').style.getPropertyValue('--trait')).toBe('spectral');
  });

  it('registers a scroll anchor for every section id and every non-merged subsection id', () => {
    const sectionAnchorRef = vi.fn((_id: string) => () => {});
    render(<RobotSectionAccordionStack {...makeProps({ sectionAnchorRef })} />);

    const calledIds = sectionAnchorRef.mock.calls.map((call) => call[0]);
    expect(calledIds).toEqual(expect.arrayContaining([
      'probes.r1.volume', 'probes.r1.volume.audioSettings',
      'probes.r1.melody', 'probes.r1.melody.rhythm',
      'probes.r1.envelope', 'probes.r1.envelope.pingContour',
      'probes.r1.source', 'probes.r1.source.baselineOscillator', 'probes.r1.source.coaxialOscillator',
      'probes.r1.source.harmonicOscillator',
    ]));
    expect(calledIds).not.toContain('probes.r1.melody.frequency');
  });
});
