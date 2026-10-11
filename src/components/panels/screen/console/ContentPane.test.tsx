import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import ContentPane from './ContentPane';
import { CONTENT } from '@/content';
import { useUIStore } from '@/stores/uiStore';

// This test is about ContentPane's own blank-state/active-tile dispatch (spec §7 Q6 —
// repurposed from Console.tsx, docs/tasks/NAV_LAYOUT_REWRITE.md Task 8), not about ConsolePanel's
// content — same boundary ConsolePanel.test.tsx already draws around
// RobotsTab/RobotOptionsTab/AudioRigDrawer/SectorSettingsDrawer. Its former close button now
// lives in NavPanel as "Home" — see NavPanel.test.tsx.
vi.mock('./ConsolePanel', () => ({
  ConsolePanel: () => <div data-testid="console-panel-stub" />,
  default: () => <div data-testid="console-panel-stub" />,
}));

const UI_INITIAL_STATE = useUIStore.getState();

describe('ContentPane — blank/landing state renders a sized-to-content home card, not a full-bleed pane', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it('renders .content-pane__home with a welcome accordion when activeHubTile is null, not .content-pane', () => {
    const { container } = render(<ContentPane />);
    expect(container.querySelector('.content-pane__home')).toBeTruthy();
    expect(container.querySelector('.content-pane')).toBeNull();
    expect(screen.getByText(CONTENT['home.root'].human)).toBeTruthy();
    expect(screen.getByRole('heading', { name: CONTENT['home.root'].intro.lore })).toBeTruthy();
  });

  it('starts the welcome accordion open, and collapses it on trigger click', () => {
    render(<ContentPane />);
    const trigger = screen.getByText(CONTENT['home.root'].human).closest('button')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not render ConsolePanel in the blank/landing state', () => {
    render(<ContentPane />);
    expect(screen.queryByTestId('console-panel-stub')).toBeNull();
  });

  it('renders .content-pane wrapping ConsolePanel when a tile is active', () => {
    useUIStore.getState().setActiveHubTile('audioRig');
    const { container, getByTestId } = render(<ContentPane />);
    expect(container.querySelector('.content-pane')).toBeTruthy();
    expect(getByTestId('console-panel-stub')).toBeTruthy();
  });

  it('renders .content-pane when the robots tile is active', () => {
    useUIStore.getState().setActiveHubTile('robots');
    const { container } = render(<ContentPane />);
    expect(container.querySelector('.content-pane')).toBeTruthy();
  });
});

describe('ContentPane — ConsolePanel back-button behavior is unaffected (Task 8 AC3)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it('renders ConsolePanel unchanged — this task does not touch its own dispatch logic', () => {
    useUIStore.getState().setActiveHubTile('robots');
    useUIStore.getState().selectRobot('r1');
    render(<ContentPane />);
    expect(screen.getByTestId('console-panel-stub')).toBeTruthy();
  });
});

describe('ContentPane reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 13)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'ContentPane.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|loreDescription|humanDescription)\s*:\s*['"`]/);
    expect(source).not.toMatch(/<h2>[A-Za-z]|>Robot not found</);
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 7 (spec §1.3): with a branch open the content is an opaque surface
// over the dimmed world, filling the band between the top bar (Header.css's --top-bar-bottom) and the
// bottom — the sleeve strip on the desk, PhoneBar's top on the phone (--phone-bar-clearance, Task 5) —
// right of the nav panel on the desk (NavPanel.css's --nav-panel-width) and edge to edge on the phone.
// The shell reaches CSS as ScreenViewport's data-shell, useShell()'s value.
describe('ContentPane.css — the opaque content surface', () => {
  const PHONE_RULE = "#screen-viewport[data-shell='phone'] .content-pane";

  async function readCss(relativePath: string): Promise<string> {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    return readFileSync(resolve(__dirname, relativePath), 'utf8');
  }

  async function ruleBody(relativePath: string, selector: string): Promise<string> {
    const { getCssRuleBody } = await import('@/testUtils/cssRuleBody');
    const body = getCssRuleBody(await readCss(relativePath), selector);
    expect(body, `${selector} in ${relativePath}`).not.toBeNull();
    return body!;
  }

  it('paints --content-surface, a solid colour (no alpha) declared once in index.css', async () => {
    expect(await ruleBody('ContentPane.css', '.content-pane')).toContain('background-color: var(--content-surface);');
    const root = await ruleBody('../../../../index.css', ':root');
    const declarations = root.match(/--content-surface:\s*([^;]+);/g) ?? [];
    expect(declarations).toHaveLength(1);
    expect(declarations[0]!.replace(/--content-surface:\s*|;/g, '').trim()).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('is no longer glass: nothing in the content re-tints --color-surface translucent', async () => {
    expect(await ruleBody('ContentPane.css', '.content-pane')).not.toContain('--color-surface');
    expect(await readCss('ConsolePanel.css')).not.toMatch(/--color-surface\s*:/);
  });

  it('starts at the top bar’s lower edge on either shell', async () => {
    expect(await ruleBody('ContentPane.css', '.content-pane')).toContain('top: var(--top-bar-bottom);');
    expect(await ruleBody('ContentPane.css', PHONE_RULE)).not.toMatch(/(^|\s)top:/);
  });

  it('on the desk its left edge follows the nav panel, and it stops above the bottom sleeve strip', async () => {
    const body = await ruleBody('ContentPane.css', '.content-pane');
    expect(body).toMatch(/left: calc\(var\(--nav-panel-width\) \+ [^;]+\);/);
    expect(body).toMatch(/bottom: calc\(var\(--spacing-2xl\) \+ [^;]+\);/);
    expect(body).not.toMatch(/(^|\s)height:/);
  });

  it('on the phone it runs edge to edge and stops at the bottom bar, never under it', async () => {
    const body = await ruleBody('ContentPane.css', PHONE_RULE);
    expect(body).toContain('left: 0;');
    expect(body).toContain('right: 0;');
    expect(body).toContain('bottom: var(--phone-bar-clearance);');
  });

  it('the Deck’s home card is not a surface: the world stays bright around it', async () => {
    expect(await ruleBody('ContentPane.css', '.content-pane__home')).not.toContain('--content-surface');
  });

  it('ConsolePanel.css carries none of the old header / nav / edge clearances or their breakpoints', async () => {
    const css = await readCss('ConsolePanel.css');
    expect(css).not.toMatch(/--console-(header|nav-panel|edge)-clearance/);
    expect(css).not.toMatch(/@media/);
  });

  // Found in Chrome: a popped facade's front face sits frontFaceOffsetX right of its box, so a
  // full-width accordion overflowed the scroller by 4 px and drew a horizontal scrollbar once the old
  // 32 px edge clearance was gone. The scroller's right padding holds that offset.
  it('the scroller keeps room on the right for a popped facade’s front-face offset', async () => {
    const { computeCabinetFrontFaceOffset } = await import('@/utils/cabinetGeometry');
    const body = await ruleBody('ConsolePanel.css', '.console-panel__content');
    const padding = body.match(/(?:^|\s)padding:\s*([^;]+);/)?.[1].trim().split(/\s+/) ?? [];
    expect(padding).toHaveLength(4);
    const root = await ruleBody('../../../../index.css', ':root');
    const px = (value: string) => {
      const token = value.match(/^var\((--[\w-]+)\)$/)?.[1];
      const resolved = token ? root.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1].trim() : value;
      return resolved === '0' ? 0 : Number(resolved?.replace(/px$/, ''));
    };
    expect(px(padding[1])).toBeGreaterThanOrEqual(computeCabinetFrontFaceOffset(1).frontFaceOffsetX);
  });

  it('no stylesheet still reads a clearance that is gone (an undefined var() would void its declaration)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { resolve, join } = await import('node:path');
    const srcRoot = resolve(__dirname, '../../../..');
    const readers = (readdirSync(srcRoot, { recursive: true }) as string[])
      .filter((file) => file.endsWith('.css'))
      .filter((file) => /--console-(header|nav-panel|edge)-clearance/.test(readFileSync(join(srcRoot, file), 'utf8')));
    expect(readers).toEqual([]);
  });
});
