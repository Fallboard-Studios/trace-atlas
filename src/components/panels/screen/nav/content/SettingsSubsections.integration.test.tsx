import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SettingsContent } from './SettingsContent';
import { useUIStore } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '@/stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { installIntersectionObserverStub, approachSection } from '@/testUtils/intersectionObserverStub';
import { clearSectionRef, getSectionRef } from '@/utils/sectionRefs';

vi.mock('@/systems/worldTransition', () => ({ retransmitWorld: vi.fn() }));

/**
 * End-to-end check that Settings -> Quality/Presets' own new 3rd-level children (Robot Load/
 * Effects Load, Attenuation Style/Coordinates) actually register real DOM scroll anchors, and
 * that useSectionObserver picks them up even though they only mount once their own parent leaf's
 * accordion content has lazy-mounted — the anchors live inside AudioLoadPanel/SectorSettingsDrawer
 * themselves (both real, unmocked here, unlike SettingsContent.test.tsx's own stubs), so this is
 * the one place that exercises the whole chain together.
 */
const UI_INITIAL_STATE = useUIStore.getState();
const SECTION_IDS = [
  'settings.quality',
  'settings.sectorSettings',
  'settings.quality.robotLoad',
  'settings.quality.effectsLoad',
  'settings.sectorSettings.attenuationStyle',
  'settings.sectorSettings.coordinates',
];

describe('Settings — Quality/Presets subsection anchors (docs/specs/NAV_LAYOUT_REWRITE.md, additional nav panel changes)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
    useAudioStore.setState({ robotLoad: 1, effectsLoad: 1 });
    useAttenuationStyleStore.setState({
      attenuationStyles: [{ ...DEFAULT_PELAGOS, name: 'Pelagos' }],
      currentAttenuationStyleId: DEFAULT_PELAGOS.id,
    });
    useLocaleStore.setState({
      locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, coordinates: { x: 12, y: 68 } } },
    });
    installIntersectionObserverStub();
    SECTION_IDS.forEach(clearSectionRef);
  });

  it('registers Robot Load/Effects Load anchors once Quality approaches, and their content is real AudioLoadPanel sliders', () => {
    render(<SettingsContent />);

    act(() => approachSection('settings.quality'));

    expect(getSectionRef('settings.quality.robotLoad')).toBeTruthy();
    expect(getSectionRef('settings.quality.effectsLoad')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Robot Load' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Effects Load' })).toBeTruthy();
  });

  it('registers Attenuation Style/Coordinates anchors once Presets approaches', () => {
    render(<SettingsContent />);

    act(() => approachSection('settings.sectorSettings'));

    expect(getSectionRef('settings.sectorSettings.attenuationStyle')).toBeTruthy();
    expect(getSectionRef('settings.sectorSettings.coordinates')).toBeTruthy();
  });

  it('scrolling a subsection into view (scrollspy) updates selectedSettingsLeaf/selectedSettingsSubsection, even though its anchor only existed after the parent leaf itself had already approached', () => {
    render(<SettingsContent />);
    act(() => approachSection('settings.quality'));

    act(() => approachSection('settings.quality.effectsLoad'));

    expect(useUIStore.getState().selectedSettingsLeaf).toBe('quality');
    expect(useUIStore.getState().selectedSettingsSubsection).toBe('effectsLoad');
  });
});
