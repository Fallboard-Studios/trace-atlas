import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

import { HelpPopover } from './HelpPopover';
import { CONTENT, fill } from '@/content';
import { SCREEN_VIEWPORT_ID } from '@/utils/helpers';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 12 (spec §1.4): a focusable "?" on a control's label opens a well
 * with the human description, the lore name and the lore description.
 *
 * Radix's Popover.Content is wrapped (still the real one) only to record the collision boundary it is
 * handed, which jsdom cannot place anything against.
 */
const seen = vi.hoisted(() => ({ collisionBoundary: undefined as unknown }));
vi.mock('@radix-ui/react-popover', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@radix-ui/react-popover')>();
  const { forwardRef, createElement } = await import('react');
  const Content = forwardRef<HTMLDivElement, Parameters<typeof actual.Content>[0]>((props, ref) => {
    seen.collisionBoundary = props.collisionBoundary;
    return createElement(actual.Content, { ...props, ref });
  });
  return { ...actual, Content };
});

const HELP = { human: 'How fast the music plays, in beats per minute.', lore: 'The cadence every probe keeps.' };

/** Radix arms its outside-press listener a tick after open and returns focus a tick after close. */
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

/** The "?", found by its name while closed. While open the modal popover aria-hides everything outside it,
 *  the "?" included, and a hidden element has no accessible name — so a test holds on to the element. */
const trigger = () => screen.getByRole('button', { name: fill('ui.help', { name: 'Tempo' }) });

describe('HelpPopover', () => {
  it('is a "?" button named for its control, closed until pressed', () => {
    render(<HelpPopover help={HELP} humanLabel="Tempo" loreLabel="Ping Rate" />);
    const button = trigger();
    expect(button.textContent).toBe('?');
    expect(button.querySelector('[aria-hidden="true"]')?.textContent).toBe('?');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a well with the name, the human description, the lore name and the lore description', () => {
    render(<HelpPopover help={HELP} humanLabel="Tempo" loreLabel="Ping Rate" />);
    const button = trigger();
    fireEvent.click(button);

    const dialog = screen.getByRole('dialog', { name: fill('ui.help', { name: 'Tempo' }) });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-hidden')).toBe('true'); // modal: the rest of the screen is inert
    expect(dialog.querySelector('.sc-help__title')?.textContent).toBe('Tempo');
    expect(dialog.querySelector('.sc-help__human')?.textContent).toBe(HELP.human);
    expect(dialog.querySelector('.sc-help__lore-name')?.textContent).toBe('Ping Rate');
    expect(dialog.querySelector('.sc-help__lore-description')?.textContent).toBe(HELP.lore);
  });

  it('shows the lore name alone when the help has no lore description', () => {
    render(<HelpPopover help={{ human: HELP.human }} humanLabel="Tempo" loreLabel="Ping Rate" />);
    fireEvent.click(trigger());
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.sc-help__lore-name')?.textContent).toBe('Ping Rate');
    expect(dialog.querySelector('.sc-help__lore-description')).toBeNull();
  });

  it('has no lore block at all when there is neither a lore name nor a lore description', () => {
    render(<HelpPopover help={{ human: HELP.human }} humanLabel="Tempo" />);
    fireEvent.click(trigger());
    expect(screen.getByRole('dialog').querySelector('.sc-help__lore')).toBeNull();
  });

  it('names itself for the lore label when there is no human one, and plainly when there is neither', () => {
    const { unmount } = render(<HelpPopover help={HELP} loreLabel="Ping Rate" />);
    expect(screen.getByRole('button', { name: fill('ui.help', { name: 'Ping Rate' }) })).toBeTruthy();
    unmount();
    render(<HelpPopover help={HELP} />);
    expect(screen.getByRole('button', { name: CONTENT['ui.help'].human })).toBeTruthy();
  });

  it('Escape closes it and focus returns to the "?"', async () => {
    render(<HelpPopover help={HELP} humanLabel="Tempo" />);
    act(() => trigger().focus());
    fireEvent.click(trigger());
    await tick();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await tick();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  // Code review 2026-10-11: the app always has a #screen-viewport, so the portal path is the one in use;
  // closing used to swap the tree between <Portal> and in-place content, remounting the focus scope.
  it('in the screen viewport, Escape closes it and focus returns to the "?"', async () => {
    render(
      <main id={SCREEN_VIEWPORT_ID}>
        <HelpPopover help={HELP} humanLabel="Tempo" />
      </main>,
    );
    act(() => trigger().focus());
    fireEvent.click(trigger());
    await tick();
    expect(document.getElementById(SCREEN_VIEWPORT_ID)!.contains(screen.getByRole('dialog'))).toBe(true);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await tick();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('a press outside closes it and focus returns to the "?"', async () => {
    render(
      <>
        <HelpPopover help={HELP} humanLabel="Tempo" />
        <p>elsewhere</p>
      </>,
    );
    act(() => trigger().focus());
    fireEvent.click(trigger());
    await tick();

    fireEvent.pointerDown(screen.getByText('elsewhere'));
    await tick();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('pressing the "?" again closes it', () => {
    render(<HelpPopover help={HELP} humanLabel="Tempo" />);
    const button = trigger();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens in ScreenViewport itself — out of the panel it sits in, so no later panel paints over it', () => {
    render(
      <div id="screen-viewport">
        <div data-testid="panel">
          <HelpPopover help={HELP} humanLabel="Tempo" />
        </div>
      </div>,
    );
    fireEvent.click(trigger());
    const dialog = screen.getByRole('dialog');
    expect(document.getElementById('screen-viewport')?.contains(dialog)).toBe(true);
    expect(screen.getByTestId('panel').contains(dialog)).toBe(false);
  });

  it("keeps to the screen's edges: the screen is its collision boundary, not the window", () => {
    render(
      <div id="screen-viewport">
        <HelpPopover help={HELP} humanLabel="Tempo" />
      </div>,
    );
    fireEvent.click(trigger());
    expect(seen.collisionBoundary).toBe(document.getElementById('screen-viewport'));
  });

  it('never leaves ScreenViewport for document.body (the UI Shell guardrail): with no screen it opens in place', () => {
    const { container } = render(<HelpPopover help={HELP} humanLabel="Tempo" />);
    fireEvent.click(trigger());
    expect(container.contains(screen.getByRole('dialog'))).toBe(true);
  });

  it('the well is no cabinet: no CabinetBox inside it', () => {
    render(<HelpPopover help={HELP} humanLabel="Tempo" loreLabel="Ping Rate" />);
    const button = trigger();
    fireEvent.click(button);
    expect(screen.getByRole('dialog').querySelector('.sc-cabinet-box')).toBeNull();
    expect(button.querySelector('.sc-cabinet-box')).toBeNull();
  });

  it('is a React.memo-wrapped component', () => {
    expect((HelpPopover as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});
