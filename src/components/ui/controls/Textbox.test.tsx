import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mocked the same way every other CabinetBox consumer's own test file does
// (Button/Toggle/TextInput) — isolates this file's assertions about Textbox's own wiring from
// CabinetBox's already-proven internals.
vi.mock('./CabinetBox', () => ({
  CabinetBox: ({ popped, timelineKey, skipMountAnimation, autoHeight, children }: {
    popped: boolean; timelineKey: string; skipMountAnimation?: boolean; autoHeight?: boolean;
    children?: React.ReactNode;
  }) => (
    <div
      data-testid="cabinet-box"
      data-popped={String(popped)}
      data-timeline-key={timelineKey}
      data-skip-mount-animation={String(!!skipMountAnimation)}
      data-auto-height={String(!!autoHeight)}
    >
      {children}
    </div>
  ),
}));

// Pass-through spy (docs/specs/TEXTBOX_COMPONENT.md §5) — lets tests assert dompurify was
// actually called with the raw html, without pulling in the real sanitizer's DOM-dependent
// behavior.
vi.mock('dompurify', () => ({ default: { sanitize: vi.fn((html: string) => html) } }));

import DOMPurify from 'dompurify';
import { Textbox } from './Textbox';
import { getTraitColorStyle } from '@/utils/traitColors';

describe('Textbox — sanitized HTML rendering', () => {
  it('renders sanitized HTML via dangerouslySetInnerHTML', () => {
    render(<Textbox html="<strong>hi</strong>" />);
    const el = screen.getByText('hi');
    expect(el.tagName).toBe('STRONG');
  });

  it('calls DOMPurify.sanitize with the raw html prop, unconditionally', () => {
    render(<Textbox html="<em>raw</em>" />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith('<em>raw</em>');
  });

  it('calls DOMPurify.sanitize even when cabinetry is omitted (default false) — sanitization is never gated behind cabinetry', () => {
    render(<Textbox html="<em>always</em>" />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith('<em>always</em>');
  });
});

describe('Textbox — cabinetry off (default)', () => {
  it('renders no CabinetBox and root className is exactly "sc-textbox" when cabinetry is omitted', () => {
    const { container } = render(<Textbox html="<p>x</p>" />);
    expect(screen.queryByTestId('cabinet-box')).toBeNull();
    expect(container.firstElementChild?.className).toBe('sc-textbox');
  });

  it('renders no CabinetBox and root className is exactly "sc-textbox" when cabinetry is explicitly false', () => {
    const { container } = render(<Textbox html="<p>x</p>" cabinetry={false} />);
    expect(screen.queryByTestId('cabinet-box')).toBeNull();
    expect(container.firstElementChild?.className).toBe('sc-textbox');
  });
});

describe('Textbox — cabinetry on', () => {
  it('renders a CabinetBox with popped/skipMountAnimation/autoHeight all true and the hasCabinetry class on the root', () => {
    const { container } = render(<Textbox html="<p>x</p>" cabinetry />);
    const box = screen.getByTestId('cabinet-box');
    expect(box.dataset.popped).toBe('true');
    expect(box.dataset.skipMountAnimation).toBe('true');
    expect(box.dataset.autoHeight).toBe('true');
    expect(container.firstElementChild?.className).toBe('sc-textbox hasCabinetry');
  });

  it('gives CabinetBox a timelineKey starting with "cabinet-textbox-" that is non-empty', () => {
    render(<Textbox html="<p>x</p>" cabinetry />);
    const box = screen.getByTestId('cabinet-box');
    expect(box.dataset.timelineKey).toMatch(/^cabinet-textbox-.+/);
  });

  it('gives two simultaneously-rendered instances two distinct timelineKey values', () => {
    render(
      <>
        <Textbox html="<p>one</p>" cabinetry />
        <Textbox html="<p>two</p>" cabinetry />
      </>,
    );
    const boxes = screen.getAllByTestId('cabinet-box');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].dataset.timelineKey).not.toBe(boxes[1].dataset.timelineKey);
  });
});

describe('Textbox — trait color', () => {
  it('applies getTraitColorStyle(\'output\')\'s exact accent values on the root when trait="output"', () => {
    const { container } = render(<Textbox html="<p>x</p>" trait="output" />);
    const root = container.firstElementChild as HTMLElement;
    const expected = getTraitColorStyle('output') as Record<string, string>;
    expect(root.style.getPropertyValue('--color-accent-a')).toBe(expected['--color-accent-a']);
    expect(root.style.getPropertyValue('--color-accent-b')).toBe(expected['--color-accent-b']);
  });

  it('falls back to getTraitColorStyle(\'header\')\'s exact accent values when trait is omitted', () => {
    const { container } = render(<Textbox html="<p>x</p>" />);
    const root = container.firstElementChild as HTMLElement;
    const expected = getTraitColorStyle('header') as Record<string, string>;
    expect(root.style.getPropertyValue('--color-accent-a')).toBe(expected['--color-accent-a']);
    expect(root.style.getPropertyValue('--color-accent-b')).toBe(expected['--color-accent-b']);
  });

  it('applies the same trait style regardless of cabinetry', () => {
    const { container: withoutCabinetry } = render(<Textbox html="<p>x</p>" trait="composition" />);
    const { container: withCabinetry } = render(<Textbox html="<p>y</p>" trait="composition" cabinetry />);
    const rootA = withoutCabinetry.firstElementChild as HTMLElement;
    const rootB = withCabinetry.firstElementChild as HTMLElement;
    expect(rootA.style.getPropertyValue('--color-accent-a')).toBe(rootB.style.getPropertyValue('--color-accent-a'));
    expect(rootA.style.getPropertyValue('--color-accent-b')).toBe(rootB.style.getPropertyValue('--color-accent-b'));
  });
});
