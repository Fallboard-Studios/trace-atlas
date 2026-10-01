import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsContent } from './SettingsContent';
import { CONTENT } from '@/content';
import { useUIStore } from '@/stores/uiStore';
import { installIntersectionObserverStub, approachSection } from '@/testUtils/intersectionObserverStub';
import { clearSectionRef } from '@/utils/sectionRefs';
import { openAccordionFromNav, clearPendingNavTarget } from '@/utils/accordionSync';

vi.mock('@/utils/sectionRefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/sectionRefs')>();
  return { ...actual, scrollToSection: vi.fn() };
});

// SectorSettingsDrawer/AudioLoadPanel each have their own full test suite
// (SectorSettingsDrawer.test.tsx, AudioLoadPanel.test.tsx) — this file is about
// SettingsContent's own leaf-routing, not re-testing their content. Also avoids pulling in real
// Tone.js/AudioEngine paths that throw in this jsdom env, same boundary ConsolePanel.test.tsx
// already draws.
vi.mock('../../console/SectorSettingsDrawer', () => ({
  SectorSettingsDrawer: () => <div data-testid="sector-settings-drawer-stub" />,
  default: () => <div data-testid="sector-settings-drawer-stub" />,
}));
vi.mock('../../console/AudioLoadPanel', () => ({
  AudioLoadPanel: () => <div data-testid="audio-load-panel-stub" />,
  default: () => <div data-testid="audio-load-panel-stub" />,
}));
// SessionsPanel has its own full test suite (SessionsPanel.test.tsx) and pulls in
// sessionDiff.ts -> worldTransition.ts -> AudioEngine, the same real-Tone.js path
// SectorSettingsDrawer/AudioLoadPanel are already stubbed out above to avoid.
vi.mock('../../console/SessionsPanel', () => ({
  SessionsPanel: () => <div data-testid="sessions-panel-stub" />,
  default: () => <div data-testid="sessions-panel-stub" />,
}));

const UI_INITIAL_STATE = useUIStore.getState();
const SECTION_IDS = ['settings.quality', 'settings.sectorSettings', 'settings.sessions'];

function openAndApproach(leaf: 'quality' | 'sectorSettings' | 'sessions') {
  // Lazy-mount is driven purely by approach now — an accordion's own open/closed state (manual,
  // independent per accordion) has no bearing on whether its content is in the DOM.
  act(() => approachSection(`settings.${leaf}`));
}

describe('SettingsContent — stacked view (docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 7)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    useUIStore.getState().setPowerOn();
    installIntersectionObserverStub();
    SECTION_IDS.forEach(clearSectionRef);
  });

  describe('view-fade-in on arrival from a different view', () => {
    afterEach(() => {
      clearPendingNavTarget();
    });

    it('renders normally (no opacity override) when no nav click was mid-flight', () => {
      const { container } = render(<SettingsContent />);

      const root = container.querySelector('.settings-content') as HTMLElement;
      expect(root.style.opacity).toBe('');
    });

    it('starts at opacity 0 when a nav click was already queued for one of this view\'s accordions', () => {
      openAccordionFromNav('settings.sectorSettings', { closeSiblings: false });

      const { container } = render(<SettingsContent />);

      const root = container.querySelector('.settings-content') as HTMLElement;
      expect(root.style.opacity).toBe('0');
    });
  });

  it('renders all three sections as accordion trigger shells, regardless of which (if any) is open', () => {
    render(<SettingsContent />);

    expect(screen.getByRole('button', { name: 'Audio Quality' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Seeds' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save & Share' })).toBeTruthy();
  });

  it('renders Sessions as the third and last accordion, after Audio Quality and Seeds', () => {
    render(<SettingsContent />);

    // textContent includes the accordion's own expand/collapse indicator glyph (+/−) ahead of the
    // DualLabel text — stripped here since only the label order matters for this assertion.
    const labels = screen.getAllByRole('button').map((btn) => btn.textContent?.replace(/^[+−]/, '').trim());
    expect(labels).toEqual([CONTENT['settings.quality'].human, CONTENT['settings.seeds'].human, CONTENT['settings.sessions'].human]);
  });

  it('Sessions accordion starts closed by default, independent of Audio Quality\'s default-open state', () => {
    render(<SettingsContent />);

    expect(screen.getByRole('button', { name: 'Save & Share' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('opens Performance\'s accordion by default when no Settings leaf is selected yet (bare "Settings" click) — the view/accordion model always has exactly one section open', () => {
    render(<SettingsContent />);

    expect(screen.getByRole('button', { name: 'Audio Quality' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Seeds' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('selecting a leaf via the nav tree (selectedSettingsLeaf) does not open or close any accordion — nav selection only drives tree highlighting now', () => {
    useUIStore.getState().setSelectedSettingsLeaf('sectorSettings');
    render(<SettingsContent />);

    // Performance still opens by default — selecting Presets in the tree has no bearing on which
    // accordion is open (Crawford's own follow-up call, 2026-09-24).
    expect(screen.getByRole('button', { name: 'Audio Quality' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Seeds' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('a section\'s real content is not in the DOM until its anchor has been approached (lazy-mount gate)', () => {
    render(<SettingsContent />);
    // Performance is the open one by default, but has NOT been scrolled-near yet in this test.
    expect(screen.queryByTestId('audio-load-panel-stub')).toBeNull();
  });

  it('mounts a section\'s real content once its anchor is approached', () => {
    render(<SettingsContent />);

    act(() => approachSection('settings.quality'));

    expect(screen.getByTestId('audio-load-panel-stub')).toBeTruthy();
  });

  it('clicking an accordion trigger opens it directly, without touching selectedSettingsLeaf or closing any other open accordion', () => {
    render(<SettingsContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Seeds' }));

    expect(screen.getByRole('button', { name: 'Seeds' }).getAttribute('aria-expanded')).toBe('true');
    // Performance (the default-open one) stays open too — multiple accordions can be open at once.
    expect(screen.getByRole('button', { name: 'Audio Quality' }).getAttribute('aria-expanded')).toBe('true');
    expect(useUIStore.getState().selectedSettingsLeaf).toBeNull();
  });

  it('clicking an already-open accordion closes it, leaving "all closed" as a legal state', () => {
    render(<SettingsContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Audio Quality' }));

    expect(screen.getByRole('button', { name: 'Audio Quality' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('manually scrolling a section into view (scrollspy) updates selectedSettingsLeaf for tree highlighting, without ever calling scrollToSection or touching any accordion\'s open state', async () => {
    const { scrollToSection } = await import('@/utils/sectionRefs');
    render(<SettingsContent />);

    act(() => approachSection('settings.sectorSettings'));

    expect(useUIStore.getState().selectedSettingsLeaf).toBe('sectorSettings');
    expect(scrollToSection).not.toHaveBeenCalled();
    // Scrollspy never opens/closes an accordion — Performance (default-open) is unaffected, and
    // Presets stays closed despite now being the "selected" (highlighted) leaf.
    expect(screen.getByRole('button', { name: 'Audio Quality' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Seeds' }).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('SettingsContent — Performance leaf content (docs/tasks/NAV_LAYOUT_REWRITE.md Task 13)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    installIntersectionObserverStub();
    SECTION_IDS.forEach(clearSectionRef);
  });

  it('shows AudioLoadPanel once Performance is open and approached', () => {
    render(<SettingsContent />);
    openAndApproach('quality');
    expect(screen.getByTestId('audio-load-panel-stub')).toBeTruthy();
  });

  it('shows only AudioLoadPanel — no SectorSettingsDrawer content mounted alongside it', () => {
    render(<SettingsContent />);
    openAndApproach('quality');
    expect(screen.queryByTestId('sector-settings-drawer-stub')).toBeNull();
  });
});

describe('SettingsContent — Presets leaf content', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    installIntersectionObserverStub();
    SECTION_IDS.forEach(clearSectionRef);
  });

  it('shows SectorSettingsDrawer once Presets is open and approached', () => {
    render(<SettingsContent />);
    openAndApproach('sectorSettings');
    expect(screen.getByTestId('sector-settings-drawer-stub')).toBeTruthy();
  });
});

describe('SettingsContent — Sessions leaf content (Roadmap Phase 20, Task 10)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    installIntersectionObserverStub();
    SECTION_IDS.forEach(clearSectionRef);
  });

  it('does not mount SessionsPanel until its accordion is opened and approached', () => {
    render(<SettingsContent />);
    expect(screen.queryByTestId('sessions-panel-stub')).toBeNull();
  });

  it('shows SessionsPanel once Sessions is open and approached', () => {
    render(<SettingsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Save & Share' }));
    openAndApproach('sessions');
    expect(screen.getByTestId('sessions-panel-stub')).toBeTruthy();
  });

  it('opening Sessions does not close Audio Quality (the default-open accordion) — independent per-accordion state', () => {
    render(<SettingsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Save & Share' }));
    expect(screen.getByRole('button', { name: 'Audio Quality' }).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('SettingsContent reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 12)', () => {
  it('carries no copy literal of its own — intros and accordion headings come from CONTENT', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, 'SettingsContent.tsx'), 'utf8');
    expect(src).not.toMatch(/(loreLabel|humanLabel|loreDescription|humanDescription)\s*:\s*['"`]/);
  });
});
