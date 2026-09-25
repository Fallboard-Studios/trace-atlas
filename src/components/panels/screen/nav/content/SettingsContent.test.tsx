import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsContent } from './SettingsContent';
import { useUIStore } from '@/stores/uiStore';
import { installIntersectionObserverStub, approachSection } from '@/testUtils/intersectionObserverStub';
import { clearSectionRef } from '@/utils/sectionRefs';

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

const UI_INITIAL_STATE = useUIStore.getState();
const SECTION_IDS = ['settings.quality', 'settings.sectorSettings'];

function openAndApproach(leaf: 'quality' | 'sectorSettings') {
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

  it('renders both sections as accordion trigger shells, regardless of which (if any) is open', () => {
    render(<SettingsContent />);

    expect(screen.getByRole('button', { name: 'Performance' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Presets' })).toBeTruthy();
  });

  it('opens Performance\'s accordion by default when no Settings leaf is selected yet (bare "Settings" click) — the view/accordion model always has exactly one section open', () => {
    render(<SettingsContent />);

    expect(screen.getByRole('button', { name: 'Performance' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Presets' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('selecting a leaf via the nav tree (selectedSettingsLeaf) does not open or close any accordion — nav selection only drives tree highlighting now', () => {
    useUIStore.getState().setSelectedSettingsLeaf('sectorSettings');
    render(<SettingsContent />);

    // Performance still opens by default — selecting Presets in the tree has no bearing on which
    // accordion is open (Crawford's own follow-up call, 2026-09-24).
    expect(screen.getByRole('button', { name: 'Performance' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Presets' }).getAttribute('aria-expanded')).toBe('false');
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

    fireEvent.click(screen.getByRole('button', { name: 'Presets' }));

    expect(screen.getByRole('button', { name: 'Presets' }).getAttribute('aria-expanded')).toBe('true');
    // Performance (the default-open one) stays open too — multiple accordions can be open at once.
    expect(screen.getByRole('button', { name: 'Performance' }).getAttribute('aria-expanded')).toBe('true');
    expect(useUIStore.getState().selectedSettingsLeaf).toBeNull();
  });

  it('clicking an already-open accordion closes it, leaving "all closed" as a legal state', () => {
    render(<SettingsContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));

    expect(screen.getByRole('button', { name: 'Performance' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('manually scrolling a section into view (scrollspy) updates selectedSettingsLeaf for tree highlighting, without ever calling scrollToSection or touching any accordion\'s open state', async () => {
    const { scrollToSection } = await import('@/utils/sectionRefs');
    render(<SettingsContent />);

    act(() => approachSection('settings.sectorSettings'));

    expect(useUIStore.getState().selectedSettingsLeaf).toBe('sectorSettings');
    expect(scrollToSection).not.toHaveBeenCalled();
    // Scrollspy never opens/closes an accordion — Performance (default-open) is unaffected, and
    // Presets stays closed despite now being the "selected" (highlighted) leaf.
    expect(screen.getByRole('button', { name: 'Performance' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Presets' }).getAttribute('aria-expanded')).toBe('false');
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
