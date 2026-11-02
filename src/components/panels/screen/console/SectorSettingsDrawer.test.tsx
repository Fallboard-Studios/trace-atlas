// ========================================
// MOCKS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const retransmitWorldMock = vi.fn();
// The retransmit itself is stubbed; the no-op rule the drawer asks first is the real one (review R16), so these cases
// pin the drawer to retransmitWorld's own rule rather than to a copy.
vi.mock('@/systems/worldTransition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/systems/worldTransition')>()),
  retransmitWorld: (input: unknown) => retransmitWorldMock(input),
}));

// Copy link (docs/specs/SHORT_WORLD_LINK.md assumption 9): the button shares the LIVE payload. Both modules keep
// their real exports; only the two calls the button makes are stubbed.
const fakePayload = { marker: 'live-payload' };
vi.mock('@/utils/sessionDiff', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/sessionDiff')>()),
  buildSessionPayload: vi.fn(() => fakePayload),
}));
vi.mock('@/utils/sessionShareUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/sessionShareUtils')>()),
  copySessionLink: vi.fn(),
}));

// ========================================
// IMPORTS
// ========================================
import { SectorSettingsDrawer } from './SectorSettingsDrawer';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '@/stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import * as sectorSettingsConfig from '@/data/sectorSettingsConfig';
import { buildSessionPayload } from '@/utils/sessionDiff';
import { copySessionLink } from '@/utils/sessionShareUtils';
import { describeWorld } from '@/utils/describeWorld';
import { useLoadingStore } from '@/stores/loadingStore';
import { useUIStore } from '@/stores/uiStore';
import { attachSceneWash } from '@/systems/worldChange';
import { useSessionStore } from '@/stores/sessionStore';
import { CONTENT, labels } from '@/content';

// ========================================
// TESTS
// ========================================

describe('SectorSettingsDrawer', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({
      attenuationStyles: [{ ...DEFAULT_PELAGOS, name: 'Pelagos' }],
      currentAttenuationStyleId: DEFAULT_PELAGOS.id,
    });
    useLocaleStore.setState({
      locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, coordinates: { x: 5, y: 9 } } },
    });
    retransmitWorldMock.mockClear();
  });

  // docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.6 (Seeds): Retransmit is aligned left; the DOM test pins that the
  // button really sits inside the wrapper that rule styles.
  describe('Retransmit alignment (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.6)', () => {
    it('the Retransmit button is a child of that wrapper, after both seed sections', () => {
      const { container } = render(<SectorSettingsDrawer />);
      const wrapper = container.querySelector('.sector-settings-drawer__retransmit')!;
      expect(wrapper).not.toBeNull();
      const button = screen.getByRole('button', { name: /retransmit/i });
      expect(wrapper.contains(button)).toBe(true);
      const sections = container.querySelectorAll('.sector-settings-drawer__section');
      expect(sections).toHaveLength(2);
      expect(sections[1].compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('pre-populates the Attenuation Style name field with the current Attenuation Style name', () => {
    render(<SectorSettingsDrawer />);
    const textInputs = screen.getAllByRole('textbox');
    const attenuationStyleInput = textInputs.find((el) => (el as HTMLInputElement).value === 'Pelagos');
    expect(attenuationStyleInput).toBeTruthy();
  });

  it('pre-populates the coordinate fields with the current locale coordinates', () => {
    render(<SectorSettingsDrawer />);
    const spinbuttons = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(spinbuttons.map((el) => el.value)).toEqual(['5', '9']);
  });

  it('renders the status header reflecting the current Attenuation Style and coordinates', () => {
    render(<SectorSettingsDrawer />);
    expect(screen.getByText(/Pelagos/)).toBeTruthy();
  });

  // docs/tasks/OFF_SCREEN.md Task 33 (spec assumption 19): the status line is describeWorld(identity) - one helper, three
  // readers (the off screen's Current row, its readout, this line) agree byte for byte.
  describe('the status line through describeWorld (docs/tasks/OFF_SCREEN.md Task 33)', () => {
    const line = (container: HTMLElement) => container.querySelector('.sector-settings-drawer__status-line')!.textContent;
    const identity = () => {
      const { theme, aspects } = useLoadingStore.getState();
      return { attenuationStyleName: 'Pelagos', coordinates: { x: 5, y: 9 }, theme, aspects };
    };

    beforeEach(() => useLoadingStore.setState({ theme: 'classic', aspects: {} }));

    it('for a Classic world it is `AS · (x, y)`, as today', () => {
      const { container } = render(<SectorSettingsDrawer />);
      expect(line(container)).toBe('Pelagos · (5, 9)');
      expect(line(container)).toBe(describeWorld(identity()));
    });

    it('for a Calm world with one pick it carries ` · Calm · Hypnotic`', () => {
      useLoadingStore.setState({ theme: 'calm', aspects: { melody: ['hypnotic'] } });
      const { container } = render(<SectorSettingsDrawer />);
      expect(line(container)).toBe('Pelagos · (5, 9) · Calm · Hypnotic');
      expect(line(container)).toBe(describeWorld(identity()));
    });

    it('follows the loading store and the plot live', () => {
      const { container } = render(<SectorSettingsDrawer />);
      act(() => useLoadingStore.setState({ theme: 'perilous', aspects: { melody: ['wandering'] } }));
      expect(line(container)).toBe('Pelagos · (5, 9) · Perilous · Wandering');
      act(() =>
        useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, coordinates: { x: -3, y: 12 } } } }),
      );
      expect(line(container)).toBe('Pelagos · (-3, 12) · Perilous · Wandering');
    });

    it('an empty Melody list adds no tail (every robot as theme; docs/tasks/OFF_SCREEN_REVISIONS.md Task 6)', () => {
      useLoadingStore.setState({ theme: 'classic', aspects: { melody: [] } });
      const { container } = render(<SectorSettingsDrawer />);
      expect(line(container)).toBe('Pelagos · (5, 9)');
    });
  });

  // docs/tasks/OFF_SCREEN.md Task 12 (spec assumption 13): the shortcut rows are gone — the off screen's presets are
  // where a curated world lives now. The AS input, the coordinates, their Random buttons and Retransmit stay.
  describe('no shortcut buttons (docs/specs/OFF_SCREEN.md assumption 13)', () => {
    it('renders exactly the two Random buttons, Retransmit and Copy link — no button named after a preset', () => {
      const { container } = render(<SectorSettingsDrawer />);
      // The Button controls only — the labels' help "?" buttons are not actions.
      const names = Array.from(container.querySelectorAll('.sc-button')).map((b) => b.getAttribute('aria-label')).sort();
      expect(names).toEqual(
        [
          labels('sector.copyLink').humanLabel,
          labels('sector.random.attenuationStyle').humanLabel,
          labels('sector.random.coords').humanLabel,
          labels('sector.retransmit').humanLabel,
        ].sort(),
      );
    });

    it('the config exports no preset arrays any more', () => {
      expect('ATTENUATION_STYLE_PRESETS' in sectorSettingsConfig).toBe(false);
      expect('COORDINATE_PRESETS' in sectorSettingsConfig).toBe(false);
    });

    it('the Random buttons still fill their own field and never retransmit', () => {
      render(<SectorSettingsDrawer />);
      // Both Random buttons share the human label; the first sits in the Attenuation Style section, the second in Location.
      const [randomStyle, randomCoords] = screen.getAllByRole('button', { name: labels('sector.random.attenuationStyle').humanLabel });
      fireEvent.click(randomStyle);
      const textInputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      expect(textInputs.some((el) => el.value !== 'Pelagos' && el.value.length > 0)).toBe(true);
      fireEvent.click(randomCoords);
      const spinbuttons = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      expect(spinbuttons.every((el) => Number.isInteger(Number(el.value)))).toBe(true);
      expect(retransmitWorldMock).not.toHaveBeenCalled();
    });
  });

  it('clicking Retransmit with only the Attenuation Style name edited passes just attenuationStyleName', () => {
    render(<SectorSettingsDrawer />);
    const textInputs = screen.getAllByRole('textbox');
    const attenuationStyleInput = textInputs.find((el) => (el as HTMLInputElement).value === 'Pelagos')!;
    fireEvent.change(attenuationStyleInput, { target: { value: 'Kryndara' } });

    fireEvent.click(screen.getByText('Retransmit'));

    expect(retransmitWorldMock).toHaveBeenCalledWith({ attenuationStyleName: 'Kryndara' });
  });

  it('clicking Retransmit with only coordinates edited passes just coordinates', () => {
    render(<SectorSettingsDrawer />);
    const [xInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(xInput, { target: { value: '42' } });

    fireEvent.click(screen.getByText('Retransmit'));

    expect(retransmitWorldMock).toHaveBeenCalledWith({ coordinates: { x: 42, y: 9 } });
  });

  // Found at Checkpoint D of docs/tasks/OFF_SCREEN_REVISIONS.md: with nothing edited retransmitWorld does nothing (its
  // no-op branch), so the drawer asks for nothing - no retransmit, and no wash fading over an unchanged world. Letting go
  // of the wash runs whatever was waiting, so the empty mock after detach shows nothing was queued either.
  it('clicking Retransmit with neither field edited asks for no world change: no wash, no retransmit', () => {
    useUIStore.setState({ sceneWash: 'clear' });
    const detach = attachSceneWash();
    try {
      render(<SectorSettingsDrawer />);
      fireEvent.click(screen.getByText('Retransmit'));
      expect(useUIStore.getState().sceneWash).toBe('clear');
    } finally {
      detach();
    }
    expect(retransmitWorldMock).not.toHaveBeenCalled();
  });

  it('an emptied Attenuation Style name alone is no world change either (retransmitWorld reads it as absent)', () => {
    useUIStore.setState({ sceneWash: 'clear' });
    const detach = attachSceneWash();
    try {
      render(<SectorSettingsDrawer />);
      const attenuationStyleInput = screen.getAllByRole('textbox').find((el) => (el as HTMLInputElement).value === 'Pelagos')!;
      fireEvent.change(attenuationStyleInput, { target: { value: '' } });
      fireEvent.click(screen.getByText('Retransmit'));
      expect(useUIStore.getState().sceneWash).toBe('clear');
    } finally {
      detach();
    }
    expect(retransmitWorldMock).not.toHaveBeenCalled();
  });

  // docs/tasks/OFF_SCREEN_REVISIONS.md Task 13 (Crawford's note 7): Retransmit is a user-gesture world change, so it waits
  // under the scene wash; a wash is attached by hand and the test lands the cover through the store.
  it('Retransmit goes through the world change request: it waits for the cover, then retransmits once', async () => {
    useUIStore.setState({ sceneWash: 'clear' });
    const detach = attachSceneWash();
    try {
      render(<SectorSettingsDrawer />);
      const [xInput] = screen.getAllByRole('spinbutton');
      fireEvent.change(xInput, { target: { value: '42' } });
      fireEvent.click(screen.getByText('Retransmit'));
      expect(useUIStore.getState().sceneWash).toBe('covering');
      expect(retransmitWorldMock).not.toHaveBeenCalled();
      // The change runs just after the call that lands the cover (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R12).
      await act(async () => {
        useUIStore.getState().setSceneWash('covered');
      });
      expect(retransmitWorldMock).toHaveBeenCalledTimes(1);
      expect(retransmitWorldMock).toHaveBeenCalledWith({ coordinates: { x: 42, y: 9 } });
    } finally {
      detach();
    }
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R7: a Retransmit that reaches the request always moves the name or the plot,
  // so the world is no longer the loaded save's. It lets the save go when the change runs, as the off screen's Roll does,
  // so Current stops naming it and Keep writes a new row.
  describe('Retransmit detaches the loaded save (review R7)', () => {
    beforeEach(() => {
      localStorage.clear();
      useUIStore.setState({ sceneWash: 'clear' });
    });

    it('with a save loaded, a Retransmit to new coordinates lets it go once the cover lands, the session renamed', async () => {
      useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run', currentSessionName: 'Dusk Run' });
      const detach = attachSceneWash();
      try {
        render(<SectorSettingsDrawer />);
        const [xInput] = screen.getAllByRole('spinbutton');
        fireEvent.change(xInput, { target: { value: '42' } });
        fireEvent.click(screen.getByText('Retransmit'));
        expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run'); // it waits with the world
        await act(async () => {
          useUIStore.getState().setSceneWash('covered');
        });
        expect(retransmitWorldMock).toHaveBeenCalledTimes(1);
        expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
        expect(useSessionStore.getState().currentSessionName).not.toBe('Dusk Run');
      } finally {
        detach();
      }
    });

    it('a new Attenuation Style name lets the loaded save go too', () => {
      useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run', currentSessionName: 'Dusk Run' });
      render(<SectorSettingsDrawer />);
      const attenuationStyleInput = screen.getAllByRole('textbox').find((el) => (el as HTMLInputElement).value === 'Pelagos')!;
      fireEvent.change(attenuationStyleInput, { target: { value: 'Brinemouth' } });
      fireEvent.click(screen.getByText('Retransmit'));
      expect(retransmitWorldMock).toHaveBeenCalledWith({ attenuationStyleName: 'Brinemouth' });
      expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    });

    it('with nothing loaded, nothing changes: the session keeps the name it carries', () => {
      useSessionStore.setState({ currentLoadedSessionName: null, currentSessionName: 'My Own Name' });
      render(<SectorSettingsDrawer />);
      const [xInput] = screen.getAllByRole('spinbutton');
      fireEvent.change(xInput, { target: { value: '42' } });
      fireEvent.click(screen.getByText('Retransmit'));
      expect(retransmitWorldMock).toHaveBeenCalledTimes(1);
      expect(useSessionStore.getState()).toMatchObject({ currentLoadedSessionName: null, currentSessionName: 'My Own Name' });
    });
  });

  it('no longer renders the old "Enable automatic effects" toggle — relocated and reshaped into the Audio Rig drawer\'s Ping Variance Automation slider (docs/tasks/archive/PING-VARIANCE-AUTOMATION.md Task 7)', () => {
    render(<SectorSettingsDrawer />);
    expect(screen.queryByRole('switch', { name: 'Enable automatic effects' })).toBeNull();
  });

  // Roadmap Phase 14 (docs/specs/archive/COLOR_SCHEME_TRAIT_THEMING.md §1.5, Task 14) — the Seed trait's
  // own colors (rosewood/dustyRose, since the 2026-09-12 rebalance replaced the too-intense
  // tangerine/yellow pairing) on the drawer's own root.
  it("scopes its root to the Seed trait's colors (rosewood/dustyRose)", () => {
    const { container } = render(<SectorSettingsDrawer />);
    const root = container.querySelector('.sector-settings-drawer') as HTMLElement;
    expect(root.style.getPropertyValue('--color-accent-a')).toBe('#914652');
    expect(root.style.getPropertyValue('--color-accent-b')).toBe('#b67288');
  });

  // docs/specs/SHORT_WORLD_LINK.md assumption 9 (Task 9): Copy link shares the live world from the Seeds drawer,
  // through the same useShareStatus as the Sessions panel's Share live.
  describe('Copy link (docs/specs/SHORT_WORLD_LINK.md assumption 9)', () => {
    const copyLinkName = labels('sector.copyLink').humanLabel;
    const linkCopied = CONTENT['session.status.linkCopied'].human;
    const copyFailed = CONTENT['session.status.copyFailed'].human;

    beforeEach(() => {
      vi.mocked(buildSessionPayload).mockClear();
      vi.mocked(copySessionLink).mockReset();
    });

    async function clickCopyLink() {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: copyLinkName }));
      });
    }

    it('renders inside the status block, after the status line and before the first section', () => {
      const { container } = render(<SectorSettingsDrawer />);
      const status = container.querySelector('.sector-settings-drawer__status')!;
      const button = screen.getByRole('button', { name: copyLinkName });
      expect(status.contains(button)).toBe(true);
      const line = container.querySelector('.sector-settings-drawer__status-line')!;
      expect(line.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const firstSection = container.querySelector('.sector-settings-drawer__section')!;
      expect(button.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows no note before it is clicked, and copies nothing on render', () => {
      render(<SectorSettingsDrawer />);
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(copySessionLink).not.toHaveBeenCalled();
    });

    it('copies the live payload once and shows the Link copied status note', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SectorSettingsDrawer />);
      await clickCopyLink();

      expect(buildSessionPayload).toHaveBeenCalledTimes(1);
      expect(copySessionLink).toHaveBeenCalledTimes(1);
      expect(copySessionLink).toHaveBeenCalledWith(fakePayload);
      expect(screen.getByRole('status').textContent).toBe(linkCopied);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows the Unable to copy alert, and no status note, when the copy fails', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(false);
      render(<SectorSettingsDrawer />);
      await clickCopyLink();

      expect(screen.getByRole('alert').textContent).toBe(copyFailed);
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('a failure after a success replaces the note: only one is ever visible', async () => {
      vi.mocked(copySessionLink).mockResolvedValue(true);
      render(<SectorSettingsDrawer />);
      await clickCopyLink();
      expect(screen.getByRole('status')).toBeTruthy();

      vi.mocked(copySessionLink).mockResolvedValue(false);
      await clickCopyLink();
      expect(screen.getByRole('alert').textContent).toBe(copyFailed);
      expect(screen.queryByRole('status')).toBeNull();
      expect(buildSessionPayload).toHaveBeenCalledTimes(2);
    });
  });
});
