import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 27 (spec §1.9): the powered-off screen — the etched label and power hint
 * over the dimmed still world, and the Transmission row as a muted RadioButton (nothing comes off the plate
 * while the power is off) with a well naming the pick. Picking retransmits through applySessionPayload and
 * never starts audio; only the rocker starts sound.
 *
 * docs/tasks/OFF_SCREEN.md Task 10 (spec assumptions 7 and 8): the gate — a device that has never heard a world
 * sees the label and the hint only; one that has sees the chooser — and the Current row on top, selected by
 * default and named by describeWorld (the loaded world, fronted by the loaded save's name when there is one),
 * then the saves, a divider, then the presets. The readout names the pick through the same helper.
 */
// The live world Keep saves and the dirty test compares against (docs/tasks/OFF_SCREEN.md Task 14) — a marker
// payload a test can change to make the world dirty, with the identity every real payload carries so a pick of it
// can be described. buildSessionPayload hands out a fresh copy every call. The identity is the stores' world, set in the
// beforeEach, so the off screen's Current snapshot (a built payload) names Current as the live stores do
// (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 3).
const live = vi.hoisted(() => {
  const self = {
    identity: { attenuationStyleName: 'live-as', coordinates: { x: 1, y: 2 } },
    marker: (m: string) => ({ version: 2, marker: m, ...structuredClone(self.identity) }) as unknown as import('@/types/session').SessionPayload,
    payload: undefined as unknown as import('@/types/session').SessionPayload,
  };
  self.payload = self.marker('live');
  return self;
});
vi.mock('@/utils/sessionDiff', () => ({
  applySessionPayload: vi.fn(),
  buildSessionPayload: vi.fn(() => structuredClone(live.payload)),
}));
vi.mock('@/engine/AudioEngine', () => ({
  AudioEngine: { start: vi.fn() },
}));
vi.mock('@/systems/worldTransition', () => ({
  retransmitWorld: vi.fn(),
}));

import { OffScreen } from './OffScreen';
import { applySessionPayload, buildSessionPayload } from '@/utils/sessionDiff';
import { retransmitWorld, type RetransmitInput } from '@/systems/worldTransition';
import * as seedUtils from '@/utils/seedUtils';
import { AudioEngine } from '@/engine/AudioEngine';
import { TRANSMISSION_PRESETS, presetPayload } from '@/data/transmissionPresets';
import { THEME_IDS } from '@/data/bands/themes';
import { STORAGE_KEY, listSessions, loadSession, saveNamedSession } from '@/utils/sessionStorageEngine';
import { DEVICE_FLAGS_KEY, markHeardWorld } from '@/utils/deviceFlags';
import { setWorldState } from '@/systems/worldState';
import { describeWorld } from '@/utils/describeWorld';
import { useSessionStore } from '@/stores/sessionStore';
import { useLoadingStore } from '@/stores/loadingStore';
import { useUIStore } from '@/stores/uiStore';
import { attachSceneWash } from '@/systems/worldChange';
import * as worldChange from '@/systems/worldChange';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getTimeline, getTimelineScope, killAllTimelines } from '@/animation/timelineMap';
import { OFF_SCREEN_FADE_IN_TIMELINE, OFF_SCREEN_FADE_TIMELINE, fadeOffScreen } from '@/animation/offScreenTheatre';
import { getRef } from '@/utils/refs';
import { formatSessionTimestamp } from '@/utils/helpers';
import { CONTENT, fill } from '@/content';
import { ASPECT_FAMILY_IDS, ASPECT_IDS_BY_FAMILY, type AspectFamilyId, type AspectIdOf } from '@/data/bands/aspects';
import { loadingOf, type LoadingIdentity } from '@/data/bands/loadingIdentity';
import type { SessionPayload } from '@/types/session';

const human = (key: keyof typeof CONTENT) => CONTENT[key].human;
const presetName = (i: number) => human(TRANSMISSION_PRESETS[i].nameKey);
const picker = () => screen.getByRole('group', { name: human('home.off.transmission') });
/** An accessible name with Current's eyebrow read as plain "Current" (docs/tasks/OFF_SCREEN_CONSOLE.md Task 6): the
 *  eyebrow reads "Current · unsaved" while Current is dirty, and the cases that name Current pin its label, not that;
 *  the eyebrow's own cases read it from the row (currentEyebrow, below). */
const plainEyebrow = (name: string) => {
  const unsaved = `${human('home.off.unsavedEyebrow')}, `;
  return name.startsWith(unsaved) ? `${human('home.off.current')}, ${name.slice(unsaved.length)}` : name;
};
const radioNames = () => within(picker()).getAllByRole('radio').map((r) => plainEyebrow(r.getAttribute('aria-label')!));
const readout = () => screen.getByTestId('off-screen-readout');
/** A radio by what fronts its accessible name: the whole name (Current, a theme), a save's or preset's name with its
 *  world after it ("Dusk Run · tr3nch-2 (-30, -30) · Calm"), or a lore label over its label ("Current, …")
 *  (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6b: every row names its world). Current's eyebrow is read
 *  plain (plainEyebrow). */
const row = (name: string) =>
  screen.getByRole('radio', {
    name: (accessible) => {
      const plain = plainEyebrow(accessible);
      return plain === name || plain.startsWith(`${name} · `) || plain.startsWith(`${name}, `);
    },
  });
/** Current's row, by place: the first in the list, whatever it is named (New Transmission left the list for the editor,
 *  docs/tasks/OFF_SCREEN_CONSOLE.md Task 4). */
const currentRadio = () => within(picker()).getAllByRole('radio')[0];
/** Current's accessible name, by the same place. */
const currentRowName = () => radioNames()[0];
/** Current's eyebrow, its lore line: "Current" while a save matches it, "Current · unsaved" while none does (console Task
 *  6). The list must be open. */
const currentEyebrow = () => currentRadio().querySelector('.sc-radio-button__lore')?.textContent;
/** The status slot under the readout (console Task 6): always in the DOM, at most one line. */
const statusSlot = () => document.querySelector('.off-screen__status') as HTMLElement;
/** The save failure in the slot, for the name the save tried. */
const saveFailedLine = (name: string) => fill('session.status.saveFailed', { name });
const newTransmission = () => human('home.off.newTransmission');
/** The New Transmission editor (docs/specs/OFF_SCREEN_CONSOLE.md §1.2): a group titled New Transmission. */
const editor = () => screen.getByRole('group', { name: newTransmission() });
/** Is New Transmission the shown pick? The editor wears the list row's selected state then, and no row is checked. */
const editorSelected = () => editor().hasAttribute('data-selected');
/** The identity in the editor's inputs. */
const editorShows = () => {
  const [x, y] = within(editor()).getAllByRole('spinbutton') as HTMLInputElement[];
  const name = within(editor()).getByRole('textbox') as HTMLInputElement;
  return { attenuationStyleName: name.value, coordinates: { x: Number(x.value), y: Number(y.value) } };
};
/** A save's and a preset's label: the name fronting the world (Task 6b). */
const savedLabel = (name: string) => describeWorld(loadSession(name)!, name);
const presetLabel = (i: number) => describeWorld(presetPayload(TRANSMISSION_PRESETS[i])!, presetName(i));
const scanButton = () => screen.getByRole('button', { name: human('home.off.scan') });
/** The Transmissions section's header (docs/tasks/OFF_SCREEN_CONSOLE.md Task 2): its name fronted by the section's. */
const transmissionsHeader = () =>
  screen.getByRole('button', { name: (name) => name.startsWith(`${human('home.off.transmissionsHeader')} · `) });
/** What the header reads with `name` selected and `count` stored worlds. */
const headerText = (name: string, count: number) => fill('home.off.transmissionsHeader', { name, count: String(count) });
/** Opens the Transmissions section if it is closed, so a case can reach the list, Scan and Keep: the section starts
 *  collapsed on every mount (docs/specs/OFF_SCREEN_CONSOLE.md §1.4). */
const openTransmissions = () => {
  if (transmissionsHeader().getAttribute('aria-expanded') !== 'true') fireEvent.click(transmissionsHeader());
};

/** The world the stores hold — what Current names (the stores' module-level defaults, in these tests). */
function liveIdentity() {
  const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
  const locale = useLocaleStore.getState().getLocaleById(style.currentLocaleId!)!;
  return { attenuationStyleName: style.name, coordinates: locale.coordinates };
}
const currentLabel = (loadedName?: string) => describeWorld(liveIdentity(), loadedName);

// The two stores the live identity is read from, as the module left them, so a case that lands a world in them
// (landsInStores, below) leaves the next case the same world.
const STYLES_AT_LOAD = useAttenuationStyleStore.getState().attenuationStyles;
const LOCALES_AT_LOAD = useLocaleStore.getState().locales;
/** A retransmitWorld double that does what the real one leaves behind: the seed and the plot in the stores the live
 *  identity is read from, and the loading in its store (band-table T25). */
function landsInStores(input: RetransmitInput) {
  const styleState = useAttenuationStyleStore.getState();
  const style = selectCurrentAttenuationStyle(styleState)!;
  if (input.attenuationStyleName !== undefined) {
    const name = input.attenuationStyleName;
    useAttenuationStyleStore.setState({ attenuationStyles: styleState.attenuationStyles.map((s) => (s.id === style.id ? { ...s, name } : s)) });
  }
  if (input.coordinates) {
    const { locales } = useLocaleStore.getState();
    const id = style.currentLocaleId!;
    useLocaleStore.setState({ locales: { ...locales, [id]: { ...locales[id], coordinates: input.coordinates } } });
  }
  const { theme, aspects, setLoading } = useLoadingStore.getState();
  setLoading({ theme: input.theme ?? theme, aspects: input.aspects ?? aspects });
}
/** Current's accessible name: its eyebrow, then its label (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R25). */
const asCurrent = (label: string) => `${human('home.off.current')}, ${label}`;
const currentName = (loadedName?: string) => asCurrent(currentLabel(loadedName));

// A save is a plain SessionPayload; the off screen only reads its name and hands the payload on.
const savedPayload = (style: string): SessionPayload => ({ ...presetPayload(TRANSMISSION_PRESETS[0])!, attenuationStyleName: style });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useAttenuationStyleStore.setState({ attenuationStyles: STYLES_AT_LOAD });
  useLocaleStore.setState({ locales: LOCALES_AT_LOAD });
  live.identity = liveIdentity();
  live.payload = live.marker('live');
  useSessionStore.setState({ currentLoadedSessionName: null, currentSessionName: 'Quiet Harbour' });
  // The loaded world's loading (Task 30): Classic, nothing dealt, unless a test moves it.
  useLoadingStore.setState({ theme: 'classic', aspects: {} });
  // The real applySessionPayload hands the payload's loading to retransmitWorld, which writes the loading store first
  // (band-table T25); the Loading rows read that store once a pick has landed (docs/tasks/
  // OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 2), so this double writes it too.
  vi.mocked(applySessionPayload).mockImplementation((payload) => useLoadingStore.getState().setLoading(loadingOf(payload)));
});

describe('OffScreen — the gate (spec assumption 7)', () => {
  it('a device that has never heard a world sees the label, its lore line and the hint, and no chooser', () => {
    render(<OffScreen />);
    expect(screen.getByText(human('home.off.label'))).toBeTruthy();
    expect(screen.getByText(CONTENT['home.off.label'].lore!)).toBeTruthy();
    expect(screen.getByText(human('home.off.powerHint'))).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByTestId('off-screen-readout')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull(); // no Scan either: nothing on a first visit is answerable
  });

  it('a device that has heard a world sees the chooser, with Current selected', () => {
    markHeardWorld();
    render(<OffScreen />);
    openTransmissions();
    expect(screen.getByText(human('home.off.powerHint'))).toBeTruthy();
    const current = row(currentName());
    expect(current.getAttribute('aria-checked')).toBe('true');
  });

  it('reads the flag once, on mount: a flag set after mount does not open the chooser until the next mount', () => {
    render(<OffScreen />);
    act(() => markHeardWorld());
    expect(screen.queryByRole('radio')).toBeNull();
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R27: the dirty check builds the live payload, and a first visit has no
  // Keep and no eyebrow to light, so it builds none, even with a save loaded.
  it('a first visit builds no payload on mount, even with a save loaded', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(buildSessionPayload).not.toHaveBeenCalled();
  });
});

// docs/tasks/OFF_SCREEN.md Task 16a (spec assumption 18): the veil is the screen's own backdrop, under the content, and
// the lore footer is the last thing in the column — on a first visit (under the hint) and on a returning one (under
// the chooser) alike. Presence and order only here; the blur and the dim are Crawford's look.
//
// docs/tasks/OFF_SCREEN_REVISIONS.md Task 2 (Crawford's note 6): the column scrolls on the phone and the veil must not
// scroll with it, so the root holds the veil, the dark layer and a scroll column, and the column holds everything
// else. Structure only (jsdom has no layout); the veil staying put is the Look.
describe('OffScreen — the veil and the lore footer', () => {
  const veil = (container: HTMLElement) => container.querySelector('.off-screen__veil');
  const footer = () => screen.getByText(human('home.off.footer'));
  const column = (container: HTMLElement) => container.querySelector('.off-screen__scroll');

  it('a first visit has the veil as the first child, decorative, and the footer as the last in the column', () => {
    const { container } = render(<OffScreen />);
    const root = container.querySelector('.off-screen')!;
    expect(veil(container)).not.toBeNull();
    expect(veil(container)!.getAttribute('aria-hidden')).toBe('true');
    expect(root.firstElementChild).toBe(veil(container));
    expect(column(container)!.lastElementChild).toBe(footer());
    expect(footer().classList.contains('off-screen__footer')).toBe(true);
  });

  it('a returning visit has both too, the footer after the chooser', () => {
    markHeardWorld();
    const { container } = render(<OffScreen />);
    const root = container.querySelector('.off-screen')!;
    expect(root.firstElementChild).toBe(veil(container));
    expect(column(container)!.lastElementChild).toBe(footer());
    const picker = container.querySelector('.off-screen__picker')!;
    expect(picker.compareDocumentPosition(footer()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ['a first visit', false],
    ['a returning visit', true],
  ])('%s: the root holds the veil, the dark layer and the scroll column, and nothing else', (_, heard) => {
    if (heard) markHeardWorld();
    const { container } = render(<OffScreen />);
    const root = container.querySelector('.off-screen')!;
    const children = Array.from(root.children);
    expect(children).toHaveLength(3);
    expect(children[0]).toBe(veil(container));
    expect(children[1]).toBe(container.querySelector('.off-screen__dark'));
    expect(children[2]).toBe(column(container));
  });

  it('the etch, the chooser and the footer scroll in the column, never beside the veil', () => {
    markHeardWorld();
    const { container } = render(<OffScreen />);
    openTransmissions();
    const scroll = column(container)!;
    expect(scroll.parentElement).toBe(container.querySelector('.off-screen'));
    expect(Array.from(scroll.children).map((c) => c.className)).toEqual([
      'off-screen__etch',
      'off-screen__picker',
      'off-screen__footer',
    ]);
    expect(footer().parentElement).not.toBe(veil(container)!.parentElement);
    expect(scroll.contains(screen.getByRole('group', { name: human('home.off.transmission') }))).toBe(true);
  });

  it('the column carries no aria-hidden: only the veil and the dark layer are decorative', () => {
    const { container } = render(<OffScreen />);
    expect(column(container)!.getAttribute('aria-hidden')).toBeNull();
    expect(container.querySelector('.off-screen__dark')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('the footer is one line of etched text, not a control, and the veil takes no clicks', () => {
    const { container } = render(<OffScreen />);
    expect(footer().tagName).toBe('P');
    expect(footer().closest('button')).toBeNull();
    expect(veil(container)!.querySelector('*')).toBeNull();
  });
});

// docs/tasks/OFF_SCREEN.md Task 16b (spec assumption 18): the boot theatre — a 'ui' timeline, dark then a flicker to
// ready — registered on mount, skipped by a tap on the screen, jumped to ready under reduced motion, killed on unmount;
// the screen registers itself under the ref the controller's fade reads. The look (dark, flicker, the fade on the
// flip) is Crawford's at Checkpoint B.
describe('OffScreen — the boot theatre', () => {
  afterEach(() => {
    killAllTimelines();
    vi.unstubAllGlobals();
  });

  it("registers 'off-screen-boot' in the ui scope on mount, with the dark layer over the content", () => {
    const { container } = render(<OffScreen />);
    expect(getTimeline('off-screen-boot')).toBeDefined();
    expect(getTimelineScope('off-screen-boot')).toBe('ui');
    const dark = container.querySelector('.off-screen__dark');
    expect(dark).not.toBeNull();
    expect(dark!.getAttribute('aria-hidden')).toBe('true');
  });

  it('registers the screen under the off-screen ref, for the power-on fade', () => {
    const { container } = render(<OffScreen />);
    expect(getRef('off-screen')).toBe(container.querySelector('.off-screen'));
  });

  it('a pointerdown anywhere on the screen skips to ready', () => {
    const { container } = render(<OffScreen />);
    expect(getTimeline('off-screen-boot')!.progress()).toBe(0);
    fireEvent.pointerDown(screen.getByText(human('home.off.powerHint')));
    expect(getTimeline('off-screen-boot')!.progress()).toBe(1);
    expect(container.querySelector('.off-screen__dark')).not.toBeNull();
  });

  it('is ready at once under prefers-reduced-motion: reduce', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion: reduce') }));
    render(<OffScreen />);
    expect(getTimeline('off-screen-boot')!.progress()).toBe(1);
  });

  it('kills the theatre and drops the ref on unmount', () => {
    const { unmount } = render(<OffScreen />);
    unmount();
    expect(getTimeline('off-screen-boot')).toBeUndefined();
    expect(getRef('off-screen')).toBeUndefined();
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R27: a power-on fade still running when the screen goes takes the fade
  // with it, so its completion never resolves against a screen that is gone.
  it('an unmount mid-fade kills the fade with the screen', () => {
    const { unmount } = render(<OffScreen />);
    void fadeOffScreen();
    expect(getTimeline(OFF_SCREEN_FADE_TIMELINE)).toBeDefined();
    unmount();
    expect(getTimeline(OFF_SCREEN_FADE_TIMELINE)).toBeUndefined();
  });

  // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F6 (Crawford's answer 2a): the world tells a power-off from a fresh page, as
  // R25's focus does. Paused, the screen fades in over the world just frozen; cold, the boot theatre plays.
  describe('a power-off fades in instead (final fixes F6)', () => {
    afterEach(() => setWorldState('cold'));

    it("mounted with the world paused, no boot theatre runs and the fade-in does, in the ui scope", () => {
      setWorldState('paused');
      render(<OffScreen />);
      expect(getTimeline('off-screen-boot')).toBeUndefined();
      expect(getTimeline(OFF_SCREEN_FADE_IN_TIMELINE)).toBeDefined();
      expect(getTimelineScope(OFF_SCREEN_FADE_IN_TIMELINE)).toBe('ui');
    });

    it('mounted with the world cold (a fresh page), the boot theatre runs and no fade-in', () => {
      render(<OffScreen />);
      expect(getTimeline('off-screen-boot')).toBeDefined();
      expect(getTimeline(OFF_SCREEN_FADE_IN_TIMELINE)).toBeUndefined();
    });

    it('mounted with the world running, the boot theatre runs (only a pause fades in)', () => {
      setWorldState('running');
      render(<OffScreen />);
      expect(getTimeline('off-screen-boot')).toBeDefined();
      expect(getTimeline(OFF_SCREEN_FADE_IN_TIMELINE)).toBeUndefined();
    });

    it('an unmount mid fade-in kills it and drops the ref', () => {
      setWorldState('paused');
      const { unmount } = render(<OffScreen />);
      unmount();
      expect(getTimeline(OFF_SCREEN_FADE_IN_TIMELINE)).toBeUndefined();
      expect(getRef('off-screen')).toBeUndefined();
    });

    it('registers the screen under the off-screen ref, so a power-on can still fade it out', () => {
      setWorldState('paused');
      const { container } = render(<OffScreen />);
      expect(getRef('off-screen')).toBe(container.querySelector('.off-screen'));
    });

    // The selected row until docs/tasks/OFF_SCREEN_CONSOLE.md Task 2; the list now starts collapsed.
    it('a power-off still lands the focus, on the Transmissions header (R25)', () => {
      markHeardWorld();
      setWorldState('paused');
      render(<OffScreen />);
      expect(document.activeElement).toBe(transmissionsHeader());
    });
  });

  it('runs on a returning visit too, over the chooser', () => {
    markHeardWorld();
    render(<OffScreen />);
    openTransmissions();
    expect(getTimelineScope('off-screen-boot')).toBe('ui');
    expect(row(currentName())).toBeTruthy();
  });
});

describe('OffScreen — content', () => {
  beforeEach(() => markHeardWorld());

  it('shows the etched label, its lore line and the power hint', () => {
    render(<OffScreen />);
    expect(screen.getByText(human('home.off.label'))).toBeTruthy();
    expect(screen.getByText(CONTENT['home.off.label'].lore!)).toBeTruthy();
    expect(screen.getByText(human('home.off.powerHint'))).toBeTruthy();
  });
});

describe('OffScreen — the Loading axis: the theme row (docs/tasks/OFF_SCREEN.md Task 30; spec assumptions 9, 17, §1.6)', () => {
  beforeEach(() => markHeardWorld());
  const themeRow = () => screen.getByRole('group', { name: human('home.off.loading') });
  const themeNames = () => within(themeRow()).getAllByRole('radio').map((r) => r.getAttribute('aria-label'));
  const themeRadio = (id: (typeof THEME_IDS)[number]) => within(themeRow()).getByRole('radio', { name: human(`home.off.theme.${id}`) });
  const checked = (id: (typeof THEME_IDS)[number]) => themeRadio(id).getAttribute('aria-checked');
  const description = () => document.querySelector('.off-screen__description');
  const keep = () => screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement;
  const calmSave = (): SessionPayload => ({ ...savedPayload('dusk'), theme: 'float' });

  it('lists the five themes in order under the Loading heading, Classic selected for a Classic world', () => {
    render(<OffScreen />);
    expect(themeNames()).toEqual(THEME_IDS.map((id) => human(`home.off.theme.${id}`)));
    expect(checked('classic')).toBe('true');
    for (const id of ['float', 'anchor', 'undertow', 'shatter'] as const) expect(checked(id)).toBe('false');
  });

  it('is muted: a flat face per theme, no cabinet box (the aspect rows pop, the theme row does not; revisions Task 9)', () => {
    render(<OffScreen />);
    expect(themeRow().closest('.sc-radio-button')?.classList.contains('sc-radio-button--muted')).toBe(true);
    expect(within(themeRow()).getAllByRole('radio').every((r) => r.querySelector('.sc-radio-button__flat'))).toBe(true);
    expect(themeRow().closest('.sc-radio-button')!.querySelector('[class*="sc-cabinet-box"]')).toBeNull();
  });

  // The one retransmit carries the theme alone, so no new world is drawn with it (it was "no roll" before Roll went).
  it('a theme pick is one retransmitWorld with the theme alone: no payload applied, no new world, no sound', () => {
    render(<OffScreen />);
    fireEvent.click(themeRadio('float'));
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith({ theme: 'float' });
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });

  // docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.1: the click re-derives the picked world in place, so the
  // pick stays selected (it used to drop to Current).
  it('a theme pick keeps the picked world row selected, and the theme row shows the theme clicked', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(1)));
    expect(row(presetName(1)).getAttribute('aria-checked')).toBe('true');
    // The real retransmitWorld writes the loading store first (band-table T25); once, so it outlives nothing.
    vi.mocked(retransmitWorld).mockImplementationOnce((input) => useLoadingStore.getState().setLoading({ theme: input.theme!, aspects: {} }));
    fireEvent.click(themeRadio('anchor'));
    expect(row(presetName(1)).getAttribute('aria-checked')).toBe('true');
    expect(currentRadio().getAttribute('aria-checked')).toBe('false');
    expect(checked('anchor')).toBe('true');
  });

  it('re-clicking the selected theme retransmits nothing', () => {
    render(<OffScreen />);
    fireEvent.click(themeRadio('classic'));
    expect(retransmitWorld).not.toHaveBeenCalled();
  });

  it('keeps the loaded save attached through a theme pick: the seed is the save, under another theme', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(themeRadio('float'));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
    expect(currentRowName()).toBe(currentName('Dusk Run'));
  });

  it('recomputes dirty after a theme pick: Keep lights and Current reads unsaved once the world differs from its save', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    expect(keep().disabled).toBe(true);
    expect(currentEyebrow()).toBe(human('home.off.current'));
    live.payload = live.marker('themed'); // what the retransmit does to the live world
    fireEvent.click(themeRadio('float'));
    expect(keep().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
  });

  it('follows the loading store for the loaded world: the row, the Current row and the readout take the store theme', () => {
    render(<OffScreen />);
    openTransmissions();
    act(() => useLoadingStore.setState({ theme: 'anchor' }));
    expect(checked('anchor')).toBe('true');
    expect(checked('classic')).toBe('false');
    const expected = describeWorld({ ...liveIdentity(), theme: 'anchor', aspects: {} });
    expect(expected.endsWith(' · ' + human('home.off.theme.anchor'))).toBe(true);
    expect(readout().textContent).toBe(expected);
    expect(currentRowName()).toBe(asCurrent(expected));
  });

  it('a save pick with a theme selects it in the row, and the readout carries the tail', () => {
    const save = calmSave();
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(checked('float')).toBe('true');
    expect(checked('classic')).toBe('false');
    expect(readout().textContent).toBe(describeWorld(save, 'Dusk Run'));
    expect(readout().textContent!.endsWith(' · ' + human('home.off.theme.float'))).toBe(true);
  });

  it('a save pick with picks shows them in the readout tail too (the Melody row itself is Task 31)', () => {
    const save: SessionPayload = { ...savedPayload('dusk'), theme: 'shatter', aspects: { melody: ['hypnotic', 'wandering'] } };
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(readout().textContent).toBe(describeWorld(save, 'Dusk Run'));
    expect(readout().textContent).toContain(human('home.off.melody.hypnotic') + ' + ' + human('home.off.melody.wandering'));
  });

  it('a preset pick sets the row from its link: the placeholder links carry no theme, so Classic', () => {
    saveNamedSession('Dusk Run', calmSave());
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(checked('float')).toBe('true');
    fireEvent.click(row(presetName(0)));
    expect(checked('classic')).toBe('true');
    expect(checked('float')).toBe('false');
  });

  it('a theme the app does not know in a save reads as Classic, as loadingOf reads it', () => {
    saveNamedSession('Dusk Run', { ...savedPayload('dusk'), theme: 'frantic' } as unknown as SessionPayload);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(checked('classic')).toBe('true');
  });

  it('shows the shown theme sentence under the row: Classic for a Classic world, the save theme after a save pick, then the live store theme', () => {
    saveNamedSession('Dusk Run', calmSave());
    render(<OffScreen />);
    openTransmissions();
    expect(description()?.textContent).toBe(human('home.off.themeDescription.classic'));
    fireEvent.click(row('Dusk Run'));
    expect(description()?.textContent).toBe(human('home.off.themeDescription.float'));
    // Landed, the row follows the live store (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 2).
    act(() => useLoadingStore.setState({ theme: 'shatter' }));
    expect(description()?.textContent).toBe(human('home.off.themeDescription.shatter'));
    // Current restores the world left, under its own Classic (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 3).
    fireEvent.click(currentRadio());
    expect(description()?.textContent).toBe(human('home.off.themeDescription.classic'));
  });

  // The ending of Task 2's cut "picking Current again returns the row to the loaded world theme", true since the restore.
  it('picking Current after a save pick returns the row to the theme of the world left', () => {
    saveNamedSession('Dusk Run', calmSave());
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(checked('float')).toBe('true');
    fireEvent.click(row(currentName()));
    expect(checked('classic')).toBe('true');
  });

  it('the description is one line of text, not a control, and every theme has its own sentence', () => {
    render(<OffScreen />);
    const line = description()!;
    expect(line.tagName).toBe('P');
    expect(line.getAttribute('role')).toBeNull();
    expect(within(line as HTMLElement).queryAllByRole('radio')).toHaveLength(0);
    const sentences = THEME_IDS.map((id) => human(`home.off.themeDescription.${id}`));
    expect(new Set(sentences).size).toBe(THEME_IDS.length);
    expect(sentences.every((s) => s.trim().length > 0)).toBe(true);
  });

  it('lays the two axes in one container, Transmission (with Scan and Keep) first and Loading second, the readout after both', () => {
    const { container } = render(<OffScreen />);
    openTransmissions();
    const axes = container.querySelector('.off-screen__axes')!;
    const columns = Array.from(axes.children) as HTMLElement[];
    expect(columns).toHaveLength(2);
    expect(columns.every((c) => c.classList.contains('off-screen__axis'))).toBe(true);
    expect(within(columns[0]).getByRole('group', { name: human('home.off.transmission') })).toBeTruthy();
    expect(within(columns[0]).getByRole('button', { name: human('home.off.scan') })).toBeTruthy();
    expect(within(columns[0]).getByRole('button', { name: human('home.off.keep') })).toBeTruthy();
    expect(within(columns[1]).getByRole('group', { name: human('home.off.loading') })).toBeTruthy();
    expect(within(columns[1]).getByText(human('home.off.themeDescription.classic'))).toBeTruthy();
    expect(axes.nextElementSibling).toBe(readout());
  });

  it('is behind the gate too: a device that has never heard a world sees no Loading axis', () => {
    localStorage.clear();
    render(<OffScreen />);
    expect(screen.queryByRole('group', { name: human('home.off.loading') })).toBeNull();
    expect(description()).toBeNull();
  });
});

describe('OffScreen — the Loading axis: the Melody row (docs/tasks/OFF_SCREEN.md Task 31; spec assumptions 9, 17, 21)', () => {
  beforeEach(() => markHeardWorld());
  // vi.clearAllMocks (the file's beforeEach) clears calls, not implementations: the store-writing double below must not
  // outlive the test that installed it.
  afterEach(() => vi.mocked(retransmitWorld).mockReset());
  const melodyRow = () => screen.getByRole('group', { name: human('home.off.melody') });
  const melodyNames = () => within(melodyRow()).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
  const option = (name: string) => within(melodyRow()).getByRole('button', { name });
  const pressed = (name: string) => option(name).getAttribute('aria-pressed');
  const NAME = {
    hypnotic: human('home.off.melody.hypnotic'),
    mechanical: human('home.off.melody.mechanical'),
    wandering: human('home.off.melody.wandering'),
    chanting: human('home.off.melody.chanting'),
    tumbling: human('home.off.melody.tumbling'),
    telegraph: human('home.off.melody.telegraph'),
  } as const;
  const melodyDescription = () => document.querySelector('.off-screen__description--melody');
  // An aspect's sentence, or the family's own for a row with nothing on (revisions Task 6: no as-theme member).
  const sentence = (id: AspectIdOf<'melody'> | 'none') => human(`home.off.melodyDescription.${id}`);
  const keep = () => screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement;
  /** The real retransmitWorld writes the loading store before it rebuilds (band-table T25); this double does that half,
   *  so a second toggle sees the first on the row as it does in the app. */
  const retransmitSetsStore = () =>
    vi.mocked(retransmitWorld).mockImplementation((input) => {
      const { theme, aspects, setLoading } = useLoadingStore.getState();
      setLoading({ theme: input.theme ?? theme, aspects: input.aspects ?? aspects });
    });
  const setMelody = (picks: AspectIdOf<'melody'>[]) =>
    act(() => useLoadingStore.getState().setLoading({ theme: 'classic', aspects: { melody: picks } }));

  // docs/tasks/OFF_SCREEN_REVISIONS.md Task 6 (Crawford's note 4): no "As theme" option — the theme's own version may be
  // heard anyway, so an empty row is every robot as theme.
  it('lists the six options in canonical order under the Melody label, no As theme, nothing pressed for a plain world', () => {
    render(<OffScreen />);
    expect(melodyNames()).toEqual([NAME.hypnotic, NAME.mechanical, NAME.wandering, NAME.chanting, NAME.tumbling, NAME.telegraph]);
    for (const name of melodyNames()) expect(pressed(name!)).toBe('false');
    expect(within(melodyRow()).queryAllByRole('radio')).toHaveLength(0);
  });

  // docs/tasks/OFF_SCREEN_REVISIONS.md Task 9 (Crawford's note 5): the aspect rows take the cabinet appearance, so they pop.
  it('is a cabinet multiple RadioButton in the Loading column, under the theme row, before the other families', () => {
    const { container } = render(<OffScreen />);
    const root = melodyRow().closest('.sc-radio-button')!;
    expect(root.classList.contains('sc-radio-button--muted')).toBe(false);
    expect(root.classList.contains('sc-radio-button--multiple')).toBe(true);
    expect(root.querySelectorAll('.sc-cabinet-box')).toHaveLength(6); // T9: six Melody options
    const column = container.querySelectorAll('.off-screen__axis')[1] as HTMLElement;
    expect(column.contains(melodyRow())).toBe(true);
    expect(within(column).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      human('home.off.loading'),
      human('home.off.melody'),
      human('home.off.envelope'),
      human('home.off.distance'),
      human('home.off.voice'), // revisions Task 10: the fifth row of the column, Voice
      human('home.off.motion'), // docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7b: Motion and Performance last
      human('home.off.performance'),
    ]);
  });

  it('toggling two aspects calls retransmitWorld with both, in canonical order whatever the click order', () => {
    retransmitSetsStore();
    render(<OffScreen />);
    fireEvent.click(option(NAME.wandering));
    expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { melody: ['wandering'] } });
    fireEvent.click(option(NAME.hypnotic));
    expect(retransmitWorld).toHaveBeenCalledTimes(2);
    expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { melody: ['hypnotic', 'wandering'] } });
    expect(pressed(NAME.hypnotic)).toBe('true');
    expect(pressed(NAME.wandering)).toBe('true');
    expect(pressed(NAME.mechanical)).toBe('false');
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });

  it('clearing the row sends an empty list', () => {
    setMelody(['hypnotic']);
    render(<OffScreen />);
    expect(pressed(NAME.hypnotic)).toBe('true');
    fireEvent.click(option(NAME.hypnotic));
    expect(retransmitWorld).toHaveBeenCalledWith({ aspects: { melody: [] } });
  });

  it('a change keeps the picked world row selected, and the row shows the toggle', () => {
    retransmitSetsStore();
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(1)));
    expect(row(presetName(1)).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(option(NAME.hypnotic));
    expect(row(presetName(1)).getAttribute('aria-checked')).toBe('true');
    expect(currentRadio().getAttribute('aria-checked')).toBe('false');
    expect(pressed(NAME.hypnotic)).toBe('true');
  });

  it('a change reads dirty again and keeps the loaded save attached: Keep lights, Current reads unsaved', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    expect(keep().disabled).toBe(true);
    live.payload = live.marker('dealt');
    fireEvent.click(option(NAME.mechanical));
    expect(keep().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
  });

  it('a save with a set selects it: the picks pressed, the rest not, and the readout tails them', () => {
    const save: SessionPayload = { ...savedPayload('dusk'), aspects: { melody: ['mechanical', 'wandering'] } };
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(pressed(NAME.mechanical)).toBe('true');
    expect(pressed(NAME.wandering)).toBe('true');
    expect(pressed(NAME.hypnotic)).toBe('false');
    expect(readout().textContent).toBe(describeWorld(save, 'Dusk Run'));
    expect(readout().textContent!.endsWith(' · ' + NAME.mechanical + ' + ' + NAME.wandering)).toBe(true);
  });

  it('a save carrying a stale theme pick shows only its aspects, the stale id dropped as loadingOf drops any unknown one', () => {
    saveNamedSession('Dusk Run', { ...savedPayload('dusk'), aspects: { melody: ['theme', 'wandering'] } } as unknown as SessionPayload);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(melodyNames().filter((n) => pressed(n!) === 'true')).toEqual([NAME.wandering]);
    expect(readout().textContent!.endsWith(' · ' + NAME.wandering)).toBe(true);
    expect(melodyDescription()?.textContent).toBe(sentence('wandering'));
  });

  it('a save with a pick the app does not know keeps the known ones, as loadingOf reads it', () => {
    saveNamedSession('Dusk Run', { ...savedPayload('dusk'), aspects: { melody: ['frantic', 'mechanical'] } } as unknown as SessionPayload);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(melodyNames().filter((n) => pressed(n!) === 'true')).toEqual([NAME.mechanical]);
  });

  it('follows the loading store for Current: the row and the readout tail take the store picks', () => {
    render(<OffScreen />);
    openTransmissions();
    setMelody(['hypnotic', 'wandering']);
    expect(pressed(NAME.hypnotic)).toBe('true');
    expect(pressed(NAME.wandering)).toBe('true');
    expect(pressed(NAME.mechanical)).toBe('false');
    const expected = describeWorld({ ...liveIdentity(), theme: 'classic', aspects: { melody: ['hypnotic', 'wandering'] } });
    expect(expected.endsWith(' · ' + NAME.hypnotic + ' + ' + NAME.wandering)).toBe(true);
    expect(readout().textContent).toBe(expected);
    expect(currentRowName()).toBe(asCurrent(expected));
  });

  // Roll left the loading alone; Scan's world is drawn under Classic with no aspects (docs/specs/
  // OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.1), so the row clears.
  it('Scan loads its world with no aspects: the row clears', () => {
    retransmitSetsStore();
    setMelody(['hypnotic']);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(scanButton());
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith(expect.objectContaining({ theme: 'classic', aspects: {} }));
    expect(pressed(NAME.hypnotic)).toBe('false');
  });

  it("describes the last aspect toggled on under the row; with none on, the family's own sentence", () => {
    retransmitSetsStore();
    render(<OffScreen />);
    expect(melodyDescription()?.textContent).toBe(sentence('none'));
    fireEvent.click(option(NAME.wandering));
    expect(melodyDescription()?.textContent).toBe(sentence('wandering'));
    fireEvent.click(option(NAME.hypnotic));
    expect(melodyDescription()?.textContent).toBe(sentence('hypnotic')); // the last toggled on, not the last in order
    fireEvent.click(option(NAME.hypnotic)); // off again: the one still on
    expect(melodyDescription()?.textContent).toBe(sentence('wandering'));
    fireEvent.click(option(NAME.wandering)); // the row cleared: every robot as theme
    expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { melody: [] } });
    expect(melodyDescription()?.textContent).toBe(sentence('none'));
  });

  it('a save pick describes the last of its picks in canonical order, whatever was toggled before', () => {
    retransmitSetsStore();
    const save: SessionPayload = { ...savedPayload('dusk'), aspects: { melody: ['hypnotic', 'mechanical'] } };
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(option(NAME.hypnotic));
    expect(melodyDescription()?.textContent).toBe(sentence('hypnotic'));
    fireEvent.click(row('Dusk Run'));
    expect(melodyDescription()?.textContent).toBe(sentence('mechanical'));
  });

  it("the description lines are text, one under each row, and the three aspect sentences and the row's own are distinct", () => {
    const { container } = render(<OffScreen />);
    const lines = container.querySelectorAll('.off-screen__description');
    expect(lines).toHaveLength(7); // the theme's, then one per family (revisions Tasks 9 and 10; themes-58 T7b)
    expect(lines[0].classList.contains('off-screen__description--theme')).toBe(true);
    expect(lines[1].classList.contains('off-screen__description--melody')).toBe(true);
    expect(lines[1].tagName).toBe('P');
    expect(melodyRow().closest('.sc-radio-button')!.nextElementSibling).toBe(lines[1]);
    const sentences = (['none', 'hypnotic', 'mechanical', 'wandering'] as const).map(sentence);
    expect(new Set(sentences).size).toBe(4);
    expect(sentences.every((s) => s.trim().length > 0)).toBe(true);
  });

  it('is behind the gate: no Melody row on a first visit', () => {
    localStorage.clear();
    render(<OffScreen />);
    expect(screen.queryByRole('group', { name: human('home.off.melody') })).toBeNull();
    expect(melodyDescription()).toBeNull();
  });
});

// docs/tasks/OFF_SCREEN_REVISIONS.md Task 9 (Crawford's notes 3 and 5): one row per family, from the data, each a cabinet
// multiple RadioButton that pops; each row sends the whole loading with its own list replaced, and keeps its own
// description line by the Melody row's rules.
describe('OffScreen — the family rows (revisions Task 9)', () => {
  beforeEach(() => markHeardWorld());
  afterEach(() => vi.mocked(retransmitWorld).mockReset());
  const familyRow = (family: AspectFamilyId) => screen.getByRole('group', { name: human(`home.off.${family}`) });
  const option = (family: AspectFamilyId, name: string) => within(familyRow(family)).getByRole('button', { name });
  const pressedIn = (family: AspectFamilyId) =>
    within(familyRow(family)).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label'));
  const description = (family: AspectFamilyId) => document.querySelector(`.off-screen__description--${family}`)?.textContent;
  const sentence = (family: AspectFamilyId, id: string) => human(`home.off.${family}Description.${id}` as keyof typeof CONTENT);
  const name = (family: AspectFamilyId, id: string) => human(`home.off.${family}.${id}` as keyof typeof CONTENT);
  const retransmitSetsStore = () =>
    vi.mocked(retransmitWorld).mockImplementation((input) => {
      const { theme, aspects, setLoading } = useLoadingStore.getState();
      setLoading({ theme: input.theme ?? theme, aspects: input.aspects ?? aspects });
    });
  const load = (aspects: LoadingIdentity['aspects']) => act(() => useLoadingStore.getState().setLoading({ theme: 'classic', aspects }));

  it('renders one row per family in ASPECT_FAMILY_IDS order, each a cabinet multiple group of its options, named from content', () => {
    const { container } = render(<OffScreen />);
    const column = container.querySelectorAll('.off-screen__axis')[1] as HTMLElement;
    const familyRows = ASPECT_FAMILY_IDS.map((family) => familyRow(family));
    expect(within(column).getAllByRole('group').slice(1)).toEqual(familyRows);
    for (const family of ASPECT_FAMILY_IDS) {
      const root = familyRow(family).closest('.sc-radio-button')!;
      expect(root.classList.contains('sc-radio-button--multiple')).toBe(true);
      expect(root.classList.contains('sc-radio-button--muted')).toBe(false);
      expect(within(familyRow(family)).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(
        ASPECT_IDS_BY_FAMILY[family].map((id) => name(family, id)),
      );
      expect(root.querySelectorAll('.sc-cabinet-box')).toHaveLength(ASPECT_IDS_BY_FAMILY[family].length);
      expect(pressedIn(family)).toEqual([]);
    }
  });

  it('toggling Plucked sends the whole loading: Envelope with Plucked, Melody and Distance carried as they were', () => {
    load({ melody: ['hypnotic'], distance: ['halfHeard'] });
    render(<OffScreen />);
    fireEvent.click(option('envelope', name('envelope', 'plucked')));
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith({ aspects: { melody: ['hypnotic'], envelope: ['plucked'], distance: ['halfHeard'] } });
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });

  it('a second toggle in a family sends the set in canonical order, and clearing a family sends its empty list, the others kept', () => {
    retransmitSetsStore();
    load({ melody: ['wandering'] });
    render(<OffScreen />);
    fireEvent.click(option('distance', name('distance', 'halfHeard')));
    fireEvent.click(option('distance', name('distance', 'near')));
    expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { melody: ['wandering'], distance: ['near', 'halfHeard'] } });
    expect(pressedIn('distance')).toEqual([name('distance', 'near'), name('distance', 'halfHeard')]);
    fireEvent.click(option('distance', name('distance', 'near')));
    fireEvent.click(option('distance', name('distance', 'halfHeard')));
    expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { melody: ['wandering'], distance: [] } });
    expect(pressedIn('melody')).toEqual([human('home.off.melody.wandering')]);
  });

  // The dirty read follows Current since docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6 (spec §1.4): the
  // toggle edits the preset's world, not Current, which is still its save, so Keep stays dim (it lit before).
  it('a family change keeps the picked world row selected; Keep stays dim, as Current is still kept', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(1)));
    live.payload = live.marker('dealt');
    fireEvent.click(option('envelope', name('envelope', 'held')));
    expect(row(presetName(1)).getAttribute('aria-checked')).toBe('true');
    expect(currentRadio().getAttribute('aria-checked')).toBe('false');
    expect((screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a save with Distance halfHeard selects Half-heard, and the readout tail joins the families in family order', () => {
    const save: SessionPayload = {
      ...savedPayload('dusk'),
      aspects: { melody: ['hypnotic'], envelope: ['plucked', 'held'], distance: ['halfHeard'] },
    };
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(pressedIn('distance')).toEqual([name('distance', 'halfHeard')]);
    expect(pressedIn('envelope')).toEqual([name('envelope', 'plucked'), name('envelope', 'held')]);
    expect(readout().textContent).toBe(describeWorld(save, 'Dusk Run'));
    expect(
      readout().textContent!.endsWith(
        ` · ${human('home.off.melody.hypnotic')} · ${name('envelope', 'plucked')} + ${name('envelope', 'held')} · ${name('distance', 'halfHeard')}`,
      ),
    ).toBe(true);
  });

  it("each family's line follows its own toggles, and a world pick resets them to the set's own", () => {
    retransmitSetsStore();
    const save: SessionPayload = { ...savedPayload('dusk'), aspects: { envelope: ['plucked', 'swelling'] } };
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    openTransmissions();
    for (const family of ASPECT_FAMILY_IDS) expect(description(family)).toBe(sentence(family, 'none'));
    fireEvent.click(option('envelope', name('envelope', 'held')));
    fireEvent.click(option('envelope', name('envelope', 'plucked')));
    expect(description('envelope')).toBe(sentence('envelope', 'plucked')); // the last toggled on, not the last in order
    expect(description('distance')).toBe(sentence('distance', 'none'));
    fireEvent.click(option('distance', name('distance', 'echoing')));
    expect(description('distance')).toBe(sentence('distance', 'echoing'));
    expect(description('envelope')).toBe(sentence('envelope', 'plucked')); // one family's toggle leaves another's line
    fireEvent.click(row('Dusk Run'));
    expect(description('envelope')).toBe(sentence('envelope', 'swelling')); // the save's set, the last in canonical order
    expect(description('distance')).toBe(sentence('distance', 'none'));
  });

  it('toggling Woody sends the Voice set with every other family carried (revisions Task 10)', () => {
    load({ envelope: ['held'], distance: ['echoing'] });
    render(<OffScreen />);
    fireEvent.click(option('voice', name('voice', 'woody')));
    expect(retransmitWorld).toHaveBeenCalledWith({ aspects: { envelope: ['held'], distance: ['echoing'], voice: ['woody'] } });
  });

  it('Scan clears every family: its world has no aspects', () => {
    retransmitSetsStore();
    load({ envelope: ['held'], distance: ['near', 'echoing'] });
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(screen.getByRole('button', { name: human('home.off.scan') }));
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    for (const family of ASPECT_FAMILY_IDS) expect(pressedIn(family)).toEqual([]);
  });

  it('every family sentence and name is its own, and none is blank', () => {
    const words = ASPECT_FAMILY_IDS.flatMap((family) => [
      ...ASPECT_IDS_BY_FAMILY[family].map((id) => sentence(family, id)),
      sentence(family, 'none'),
    ]);
    expect(new Set(words).size).toBe(words.length);
    expect(words.every((w) => w.trim().length > 0)).toBe(true);
  });

  it('is behind the gate: no family row on a first visit', () => {
    localStorage.clear();
    render(<OffScreen />);
    for (const family of ASPECT_FAMILY_IDS) expect(screen.queryByRole('group', { name: human(`home.off.${family}`) })).toBeNull();
  });
});

// docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 2 (spec §1.1 row 6, §1.3's last bullet): a theme or aspect
// click re-derives the live world in place and keeps whichever world row is selected; once a pick has landed, the
// Loading rows show the live loading store, not the pick's stored identity (stale after an in-place edit).
describe('OffScreen — a theme or aspect click keeps the selected row', () => {
  beforeEach(() => {
    markHeardWorld();
    // The real retransmitWorld writes the loading store before it rebuilds (band-table T25).
    vi.mocked(retransmitWorld).mockImplementation((input) => {
      const { theme, aspects, setLoading } = useLoadingStore.getState();
      setLoading({ theme: input.theme ?? theme, aspects: input.aspects ?? aspects });
    });
  });
  afterEach(() => vi.mocked(retransmitWorld).mockReset());
  const checked = (name: string) => row(name).getAttribute('aria-checked');
  const theme = (id: (typeof THEME_IDS)[number]) => human(`home.off.theme.${id}`);
  const pressed = (key: keyof typeof CONTENT) => screen.getByRole('button', { name: human(key) }).getAttribute('aria-pressed');
  const calmRun = (): SessionPayload => ({ ...savedPayload('dusk'), theme: 'float', aspects: { melody: ['hypnotic'] } }) as SessionPayload;

  it('a save lands, then a theme click: the save row stays checked and the theme row shows the theme clicked', () => {
    saveNamedSession('Calm Run', calmRun());
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Calm Run'));
    expect(checked(theme('float'))).toBe('true'); // precondition: the save landed under its own theme
    fireEvent.click(row(theme('anchor')));
    expect(retransmitWorld).toHaveBeenLastCalledWith({ theme: 'anchor' });
    expect(row('Calm Run').getAttribute('aria-checked')).toBe('true');
    expect(currentRadio().getAttribute('aria-checked')).toBe('false');
    expect(checked(theme('anchor'))).toBe('true');
    expect(checked(theme('float'))).toBe('false');
    expect(document.querySelector('.off-screen__description--theme')?.textContent).toBe(human('home.off.themeDescription.anchor'));
  });

  it('a save lands, then a family toggle: the save row stays checked and the family row shows the toggle on the save set', () => {
    saveNamedSession('Calm Run', calmRun());
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Calm Run'));
    fireEvent.click(screen.getByRole('button', { name: human('home.off.melody.wandering') }));
    expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { melody: ['hypnotic', 'wandering'] } });
    expect(row('Calm Run').getAttribute('aria-checked')).toBe('true');
    expect(currentRadio().getAttribute('aria-checked')).toBe('false');
    expect(pressed('home.off.melody.hypnotic')).toBe('true');
    expect(pressed('home.off.melody.wandering')).toBe('true');
  });

  it('two clicks on a landed preset keep its row: a theme, then a toggle on top of it', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(2)));
    fireEvent.click(row(theme('shatter')));
    fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
    expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { ...loadingOf(presetPayload(TRANSMISSION_PRESETS[2])!).aspects, envelope: ['held'] } });
    expect(row(presetName(2)).getAttribute('aria-checked')).toBe('true');
    expect(checked(theme('shatter'))).toBe('true');
    expect(pressed('home.off.envelope.held')).toBe('true');
  });

  it('after a pick lands, the Loading rows follow the live loading store, not the pick stored identity', () => {
    saveNamedSession('Calm Run', calmRun());
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Calm Run'));
    act(() => useLoadingStore.getState().setLoading({ theme: 'undertow', aspects: { voice: ['woody'] } }));
    expect(checked(theme('undertow'))).toBe('true');
    expect(pressed('home.off.voice.woody')).toBe('true');
    expect(pressed('home.off.melody.hypnotic')).toBe('false');
  });

  it('a theme click on Current keeps Current selected, as it always has', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(theme('float')));
    expect(screen.getAllByRole('radio', { checked: true }).map((r) => plainEyebrow(r.getAttribute('aria-label')!))).toContain(
      asCurrent(describeWorld({ ...liveIdentity(), theme: 'float' })),
    );
  });
});

// docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 4 (spec §1.3): an edited pick says so. The selected row,
// when it is not Current and the live loading is not its own, carries describeLoading's tail of the live loading, naming
// the theme whenever it differs from the row's own; the readout names the live world under the row's name once landed.
describe('OffScreen — the selected row tail and the readout of the live world', () => {
  beforeEach(() => {
    markHeardWorld();
    vi.mocked(retransmitWorld).mockImplementation((input) => {
      const { theme, aspects, setLoading } = useLoadingStore.getState();
      setLoading({ theme: input.theme ?? theme, aspects: input.aspects ?? aspects });
    });
  });
  afterEach(() => vi.mocked(retransmitWorld).mockReset());
  const checked = (name: string) => row(name).getAttribute('aria-checked');
  const theme = (id: (typeof THEME_IDS)[number]) => human(`home.off.theme.${id}`);
  const dusk = () => savedPayload('dusk');
  const calmRun = (): SessionPayload => ({ ...savedPayload('calm-run'), theme: 'float' }) as SessionPayload;
  const labelOf = (name: string) => row(name).getAttribute('aria-label');
  /** A row's name fronting its seed and plot, with no loading: what an edited row's live loading follows (Task 6b). */
  const head = (payload: SessionPayload, name: string) =>
    describeWorld({ attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates }, name);

  // The labels name the world since Task 6b: an edited row reads its name, its seed and plot, then the live loading in
  // place of its own (Task 4 appended the tail to the bare name).
  it('an unedited save reads as stored, its world after its name, and the readout names it as stored', () => {
    saveNamedSession('Dusk Run', dusk());
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(checked('Dusk Run')).toBe('true');
    expect(labelOf('Dusk Run')).toBe(describeWorld(dusk(), 'Dusk Run'));
    expect(readout().textContent).toBe(describeWorld({ ...dusk(), ...loadingOf(dusk()) }, 'Dusk Run'));
  });

  it('a save lands, then Calm: the row reads "<save> · <world> · Calm", and the readout names the save under Calm', () => {
    saveNamedSession('Dusk Run', dusk());
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    fireEvent.click(row(theme('float')));
    expect(checked('Dusk Run')).toBe('true');
    expect(labelOf('Dusk Run')).toBe(`${head(dusk(), 'Dusk Run')} · ${theme('float')}`);
    expect(readout().textContent).toBe(describeWorld({ ...dusk(), ...loadingOf(dusk()), theme: 'float' }, 'Dusk Run'));
  });

  it('a Calm save, then Classic: the row names Classic in place of Calm, as it differs from the save own theme', () => {
    saveNamedSession('Calm Run', calmRun());
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Calm Run'));
    expect(labelOf('Calm Run')).toBe(describeWorld(calmRun(), 'Calm Run')); // as stored, Calm in it
    fireEvent.click(row(theme('classic')));
    expect(checked('Calm Run')).toBe('true');
    expect(labelOf('Calm Run')).toBe(`${head(calmRun(), 'Calm Run')} · ${theme('classic')}`);
  });

  it('a toggle on a Calm save names the save own theme and the aspect; toggled back, it reads as stored', () => {
    saveNamedSession('Calm Run', calmRun());
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Calm Run'));
    const hypnotic = () => screen.getByRole('button', { name: human('home.off.melody.hypnotic') });
    fireEvent.click(hypnotic());
    expect(labelOf('Calm Run')).toBe(`${head(calmRun(), 'Calm Run')} · ${theme('float')} · ${human('home.off.melody.hypnotic')}`);
    fireEvent.click(hypnotic());
    expect(labelOf('Calm Run')).toBe(describeWorld(calmRun(), 'Calm Run'));
  });

  it('a preset carries the live loading as a save does', () => {
    const preset = presetPayload(TRANSMISSION_PRESETS[1])!;
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(1)));
    fireEvent.click(row(theme('anchor')));
    expect(checked(presetName(1))).toBe('true');
    expect(labelOf(presetName(1))).toBe(`${head(preset, presetName(1))} · ${theme('anchor')}`);
  });

  it('leaving an edited save and picking it again: it reads as stored, and the save reloads as stored', () => {
    saveNamedSession('Dusk Run', dusk());
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    fireEvent.click(row(theme('float')));
    fireEvent.click(row(presetName(0)));
    expect(row('Dusk Run').getAttribute('aria-checked')).toBe('false');
    expect(labelOf('Dusk Run')).toBe(savedLabel('Dusk Run'));
    fireEvent.click(row('Dusk Run'));
    expect(vi.mocked(applySessionPayload).mock.lastCall?.[0]).toEqual(dusk());
    expect(checked('Dusk Run')).toBe('true');
    expect(labelOf('Dusk Run')).toBe(savedLabel('Dusk Run'));
    expect(checked(theme('classic'))).toBe('true');
    expect(readout().textContent).toBe(describeWorld({ ...dusk(), ...loadingOf(dusk()) }, 'Dusk Run'));
  });

  it('Current never shows a tail: its name already carries its loading', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(theme('float')));
    const label = describeWorld({ ...liveIdentity(), theme: 'float' });
    expect(currentRowName()).toBe(asCurrent(label));
    expect(label.split(theme('float'))).toHaveLength(2); // named once
  });
});

describe('OffScreen — the Current row (spec assumption 8)', () => {
  beforeEach(() => markHeardWorld());

  it('is the first option, named by describeWorld of the loaded world, under the Current eyebrow', () => {
    render(<OffScreen />);
    openTransmissions();
    const current = row(currentName());
    expect(currentRowName()).toBe(currentName());
    // No save matches the world here, so the eyebrow says so (console Task 6).
    expect(within(current).getByText(human('home.off.unsavedEyebrow'))).toBeTruthy();
  });

  it("is named after the loaded save when one is loaded: '<save> · AS (x, y)'", () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    expect(currentRowName()).toBe(currentName('Dusk Run'));
    expect(currentLabel('Dusk Run').startsWith('Dusk Run · ')).toBe(true);
  });

  // With no snapshot (nothing picked yet), Current is the live world (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md
  // §1.3).
  it('with nothing picked, follows the loaded world: a change of Attenuation Style renames the row and the readout', () => {
    render(<OffScreen />);
    openTransmissions();
    const before = currentLabel();
    const { attenuationStyles, currentAttenuationStyleId } = useAttenuationStyleStore.getState();
    act(() => {
      useAttenuationStyleStore.setState({
        attenuationStyles: attenuationStyles.map((s) => (s.id === currentAttenuationStyleId ? { ...s, name: 'rolled-1' } : s)),
      });
    });
    expect(currentLabel()).not.toBe(before);
    expect(currentLabel().startsWith('rolled-1 · ')).toBe(true);
    expect(currentRowName()).toBe(currentName());
    expect(readout().textContent).toBe(currentLabel());
  });

  // docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.1: with no wash mounted the preset lands at the click, so
  // picking Current after it restores the world left (it used to apply nothing, Current being the preset's world).
  it('picking Current after a landed pick restores the world left, named as before the pick', () => {
    const prePick = structuredClone(live.payload);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(0)));
    fireEvent.click(row(currentName()));
    expect(applySessionPayload).toHaveBeenCalledTimes(2);
    expect(vi.mocked(applySessionPayload).mock.lastCall?.[0]).toEqual(prePick);
    expect(row(currentName()).getAttribute('aria-checked')).toBe('true');
    expect(row(presetName(0)).getAttribute('aria-checked')).toBe('false');
    expect(readout().textContent).toBe(currentLabel());
  });
});

// docs/tasks/OFF_SCREEN_CONSOLE.md Task 4 (spec §1.2, §5 cases 1 and 4): the New Transmission editor replaces the row
// that held a world drawn on mount (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 5). It opens on the live
// world and draws nothing; Scan, in its title row, is the draw, landing under Classic with no aspects from any row. The
// draws are pinned: the name counts up and the coordinates count up from 101, so the first Scan is drawn-1 at (101, 102).
describe('OffScreen — the New Transmission editor and Scan (console Task 4)', () => {
  let nameDraw: ReturnType<typeof vi.spyOn>;
  let coordinateDraw: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    markHeardWorld();
    let names = 0;
    let coordinates = 100;
    nameDraw = vi.spyOn(seedUtils, 'generateRandomAttenuationStyleName').mockImplementation(() => `drawn-${++names}`);
    coordinateDraw = vi.spyOn(seedUtils, 'randomCoordinate').mockImplementation(() => ++coordinates);
  });
  afterEach(() => {
    nameDraw.mockRestore();
    coordinateDraw.mockRestore();
    vi.mocked(retransmitWorld).mockReset();
  });
  const drawn = (n: number) => ({ attenuationStyleName: `drawn-${n}`, coordinates: { x: 99 + 2 * n, y: 100 + 2 * n } });
  /** What landing draw n sends: its seed and plot, under Classic with no aspects. */
  const landed = (n: number) => ({ ...drawn(n), theme: 'classic', aspects: {} });
  const checked = (name: string) => row(name).getAttribute('aria-checked');
  const anyRowChecked = () => within(picker()).getAllByRole('radio').some((r) => r.getAttribute('aria-checked') === 'true');

  it('on open the editor shows the live world, no row is New Transmission, Current is checked and the header names Current', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    expect(editorShows()).toEqual(liveIdentity());
    expect(editorSelected()).toBe(false);
    expect(transmissionsHeader().textContent).toBe(headerText(human('home.off.current'), 1 + TRANSMISSION_PRESETS.length));
    expect(readout().textContent).toBe(currentLabel());
    openTransmissions();
    expect(radioNames()).toEqual([currentName(), savedLabel('Dusk Run'), presetLabel(0), presetLabel(1), presetLabel(2)]);
    expect(currentRadio().getAttribute('aria-checked')).toBe('true');
  });

  it('draws nothing on mount: the seed helpers wait for Scan', () => {
    render(<OffScreen />);
    openTransmissions();
    expect(nameDraw).not.toHaveBeenCalled();
    expect(coordinateDraw).not.toHaveBeenCalled();
  });

  it('the editor shows the loaded save’s world on open, as Current names it', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(editorShows()).toEqual(liveIdentity());
  });

  it('Scan sits in the editor’s title row, outside the collapsed section; no row of the list carries a trailing action', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    const { container } = render(<OffScreen />);
    expect(editor().contains(scanButton())).toBe(true);
    openTransmissions();
    expect(picker().contains(scanButton())).toBe(false);
    expect(container.querySelectorAll('.sc-radio-button__trailing')).toHaveLength(0);
  });

  it('Scan from Current draws into both inputs, selects the editor and lands under Classic with no aspects, detaching the save', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run', currentSessionName: 'Dusk Run' });
    useLoadingStore.setState({ theme: 'float', aspects: { melody: ['hypnotic'] } });
    // The payload Current's snapshot is built from carries that loading too, as buildSessionPayload's would.
    live.payload = { ...live.marker('live'), theme: 'float', aspects: { melody: ['hypnotic'] } } as SessionPayload;
    vi.mocked(retransmitWorld).mockImplementation(landsInStores);
    render(<OffScreen />);
    openTransmissions();
    const current = currentRowName();
    fireEvent.click(scanButton());
    expect(nameDraw).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith(landed(1));
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    expect(editorShows()).toEqual(drawn(1));
    expect(editorSelected()).toBe(true);
    expect(anyRowChecked()).toBe(false);
    expect(currentRowName()).toBe(current);
    // The readout names the drawn world with no label.
    expect(readout().textContent).toBe(describeWorld(drawn(1)));
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });

  it('Scan with the editor already selected draws and lands again, each time', () => {
    vi.mocked(retransmitWorld).mockImplementation(landsInStores);
    render(<OffScreen />);
    openTransmissions();
    const current = currentRowName();
    fireEvent.click(scanButton());
    fireEvent.click(scanButton());
    fireEvent.click(scanButton());
    expect(vi.mocked(retransmitWorld).mock.calls.map(([input]) => input)).toEqual([landed(1), landed(2), landed(3)]);
    expect(editorShows()).toEqual(drawn(3));
    expect(editorSelected()).toBe(true);
    expect(currentRowName()).toBe(current);
    expect(readout().textContent).toBe(describeWorld(drawn(3)));
  });

  it('Scan from a save: the save row is left, the save detached, and Current still names the world first left', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    const current = currentRowName();
    fireEvent.click(row('Dusk Run'));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
    expect(editorSelected()).toBe(false);
    fireEvent.click(scanButton());
    expect(retransmitWorld).toHaveBeenLastCalledWith(landed(1));
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    expect(checked('Dusk Run')).toBe('false');
    expect(editorSelected()).toBe(true);
    expect(currentRowName()).toBe(current);
  });

  it('picking a row after a Scan takes the selection back from the editor', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(scanButton());
    fireEvent.click(row(presetName(1)));
    expect(editorSelected()).toBe(false);
    expect(checked(presetName(1))).toBe('true');
  });

  it('a theme click with the editor selected keeps it selected, and the readout names the drawn world under the theme', () => {
    vi.mocked(retransmitWorld).mockImplementation(landsInStores);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(scanButton());
    fireEvent.click(row(human('home.off.theme.float')));
    expect(retransmitWorld).toHaveBeenLastCalledWith({ theme: 'float' });
    expect(editorSelected()).toBe(true);
    expect(anyRowChecked()).toBe(false);
    expect(readout().textContent).toBe(describeWorld({ ...drawn(1), theme: 'float' }));
  });

  describe('while the Scan waits under the wash', () => {
    let detach: () => void;
    beforeEach(() => {
      useUIStore.setState({ sceneWash: 'clear' });
      detach = attachSceneWash();
    });
    afterEach(() => detach());

    it('the editor shows the drawn world at the click, before it has landed', () => {
      render(<OffScreen />);
      fireEvent.click(scanButton());
      expect(retransmitWorld).not.toHaveBeenCalled();
      expect(editorShows()).toEqual(drawn(1));
      expect(editorSelected()).toBe(true);
    });

    it('a Current restore waiting shows the world first left, while the live world is still the pick that landed', async () => {
      vi.mocked(applySessionPayload).mockImplementation((payload) =>
        landsInStores({ attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates, ...loadingOf(payload) }),
      );
      render(<OffScreen />);
      openTransmissions();
      const left = liveIdentity();
      fireEvent.click(row(presetName(0)));
      await act(async () => useUIStore.getState().setSceneWash('covered'));
      act(() => useUIStore.getState().setSceneWash('clear'));
      const { attenuationStyleName, coordinates } = presetPayload(TRANSMISSION_PRESETS[0])!;
      expect(editorShows()).toEqual({ attenuationStyleName, coordinates });
      fireEvent.click(currentRadio());
      expect(liveIdentity()).toEqual({ attenuationStyleName, coordinates });
      expect(editorShows()).toEqual(left);
    });

    it('a preset picked while the Scan waits replaces it in the editor too: it shows the preset’s world', () => {
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(scanButton());
      fireEvent.click(row(presetName(0)));
      const { attenuationStyleName, coordinates } = presetPayload(TRANSMISSION_PRESETS[0])!;
      expect(editorShows()).toEqual({ attenuationStyleName, coordinates });
      expect(editorSelected()).toBe(false);
    });
  });
});

// docs/tasks/OFF_SCREEN_CONSOLE.md Task 5 (spec §1.2, §5 cases 2, 3 and 5): a commit in the editor — Enter, or a blur out
// of it — is a New Transmission pick of the typed world, exactly what picking the row did; an unchanged one is nothing.
// The editor follows the world that lands, unless the listener is mid-edit.
describe('OffScreen — the editor commits a world (console Task 5)', () => {
  beforeEach(() => markHeardWorld());
  afterEach(() => vi.mocked(retransmitWorld).mockReset());
  const presets = TRANSMISSION_PRESETS.length;
  const styleField = () => within(editor()).getByRole('textbox');
  const typeName = (value: string) => fireEvent.change(styleField(), { target: { value } });
  const enter = () => fireEvent.keyDown(styleField(), { key: 'Enter' });
  /** applySessionPayload's double, landing the payload's seed, plot and loading in the stores. */
  const applyLandsInStores = () =>
    vi.mocked(applySessionPayload).mockImplementation((payload) =>
      landsInStores({ attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates, ...loadingOf(payload) }),
    );
  const seedAndPlot = (payload: SessionPayload) => ({ attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates });

  it('a typed name and Enter lands that world under Classic with no aspects, detaches the save and selects the editor', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run', currentSessionName: 'Dusk Run' });
    useLoadingStore.setState({ theme: 'float', aspects: { melody: ['hypnotic'] } });
    live.payload = { ...live.marker('live'), theme: 'float', aspects: { melody: ['hypnotic'] } } as SessionPayload;
    vi.mocked(retransmitWorld).mockImplementation(landsInStores);
    render(<OffScreen />);
    openTransmissions();
    const current = currentRowName();
    const { coordinates } = liveIdentity();
    typeName('typed-world');
    enter();
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith({ attenuationStyleName: 'typed-world', coordinates, theme: 'classic', aspects: {} });
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    expect(editorSelected()).toBe(true);
    expect(within(picker()).getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).not.toContain('true');
    expect(transmissionsHeader().textContent).toBe(headerText(newTransmission(), 1 + presets));
    expect(editorShows()).toEqual({ attenuationStyleName: 'typed-world', coordinates });
    expect(readout().textContent).toBe(describeWorld({ attenuationStyleName: 'typed-world', coordinates }));
    // Current still names the world left: the commit took the snapshot, as any pick does.
    expect(currentRowName()).toBe(current);
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });

  it('typed coordinates commit with the name as it stands', () => {
    render(<OffScreen />);
    const { attenuationStyleName } = liveIdentity();
    const [x, y] = within(editor()).getAllByRole('spinbutton');
    fireEvent.change(x, { target: { value: '-12' } });
    fireEvent.change(y, { target: { value: '34' } });
    fireEvent.keyDown(y, { key: 'Enter' });
    expect(retransmitWorld).toHaveBeenCalledWith({ attenuationStyleName, coordinates: { x: -12, y: 34 }, theme: 'classic', aspects: {} });
  });

  it('an unchanged commit requests no world change: Enter, a blur, and a draft typed back to the world', () => {
    const request = vi.spyOn(worldChange, 'requestWorldChange');
    render(<OffScreen />);
    enter();
    fireEvent.blur(styleField(), { relatedTarget: null });
    typeName('typed');
    typeName(liveIdentity().attenuationStyleName);
    enter();
    expect(request).not.toHaveBeenCalled();
    expect(retransmitWorld).not.toHaveBeenCalled();
    expect(editorSelected()).toBe(false);
    request.mockRestore();
  });

  it('a blur out of the editor commits as Enter does', () => {
    render(<OffScreen />);
    openTransmissions();
    typeName('blurred');
    fireEvent.blur(styleField(), { relatedTarget: currentRadio() });
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith(expect.objectContaining({ attenuationStyleName: 'blurred', theme: 'classic', aspects: {} }));
    expect(editorSelected()).toBe(true);
  });

  it('a blank name commits as blank, as retransmitWorld reads it', () => {
    render(<OffScreen />);
    typeName('');
    enter();
    expect(retransmitWorld).toHaveBeenCalledWith(expect.objectContaining({ attenuationStyleName: '', theme: 'classic', aspects: {} }));
  });

  it('a save pick that lands shows the save’s seed and plot in the editor', () => {
    applyLandsInStores();
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(editorShows()).toEqual(seedAndPlot(loadSession('Dusk Run')!));
    expect(editorSelected()).toBe(false);
  });

  it('mid-edit, a landing pick leaves the draft alone; after a commit, the next landing pick shows', () => {
    applyLandsInStores();
    vi.mocked(retransmitWorld).mockImplementation(landsInStores);
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    saveNamedSession('Low Tide', savedPayload('tide'));
    render(<OffScreen />);
    openTransmissions();
    const { coordinates } = liveIdentity();
    typeName('half-typed');
    fireEvent.click(row('Dusk Run'));
    expect(editorShows()).toEqual({ attenuationStyleName: 'half-typed', coordinates });
    enter();
    expect(retransmitWorld).toHaveBeenLastCalledWith({ attenuationStyleName: 'half-typed', coordinates, theme: 'classic', aspects: {} });
    expect(editorShows()).toEqual({ attenuationStyleName: 'half-typed', coordinates });
    fireEvent.click(row('Low Tide'));
    expect(editorShows()).toEqual(seedAndPlot(loadSession('Low Tide')!));
  });

  it('a theme click after a commit keeps the editor selected and edits the world in place', () => {
    vi.mocked(retransmitWorld).mockImplementation(landsInStores);
    render(<OffScreen />);
    openTransmissions();
    typeName('typed-world');
    enter();
    fireEvent.click(row(human('home.off.theme.float')));
    expect(retransmitWorld).toHaveBeenLastCalledWith({ theme: 'float' });
    expect(editorSelected()).toBe(true);
    expect(readout().textContent).toBe(describeWorld({ ...liveIdentity(), theme: 'float' }));
  });

  describe('while a change waits under the wash', () => {
    let detach: () => void;
    beforeEach(() => {
      useUIStore.setState({ sceneWash: 'clear' });
      detach = attachSceneWash();
    });
    afterEach(() => detach());
    const land = () => act(async () => useUIStore.getState().setSceneWash('covered'));

    it('a commit while a save pick waits replaces it: the editor’s world lands alone, from the save’s plot', async () => {
      saveNamedSession('Dusk Run', savedPayload('dusk'));
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row('Dusk Run'));
      const dusk = seedAndPlot(loadSession('Dusk Run')!);
      expect(editorShows()).toEqual(dusk);
      typeName('typed-over');
      enter();
      expect(editorSelected()).toBe(true);
      expect(transmissionsHeader().textContent).toBe(headerText(newTransmission(), 1 + presets));
      expect(retransmitWorld).not.toHaveBeenCalled();
      await land();
      expect(applySessionPayload).not.toHaveBeenCalled();
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).toHaveBeenCalledWith({ attenuationStyleName: 'typed-over', coordinates: dusk.coordinates, theme: 'classic', aspects: {} });
      expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    });

    it('a save picked while a commit waits replaces it, the last world click winning', async () => {
      saveNamedSession('Dusk Run', savedPayload('dusk'));
      render(<OffScreen />);
      openTransmissions();
      typeName('typed-first');
      enter();
      expect(editorShows().attenuationStyleName).toBe('typed-first');
      fireEvent.click(row('Dusk Run'));
      expect(editorShows()).toEqual(seedAndPlot(loadSession('Dusk Run')!));
      await land();
      expect(retransmitWorld).not.toHaveBeenCalled();
      expect(applySessionPayload).toHaveBeenCalledTimes(1);
      expect(editorSelected()).toBe(false);
    });
  });
});

// docs/tasks/OFF_SCREEN_CONSOLE.md Task 6 (spec §1.3 item 1, §1.6, §5 case 12): Current's eyebrow says unsaved, so the
// standing warning line goes; its place is the status slot, empty but for a failure.
describe('OffScreen — Current’s eyebrow and the status slot (console Task 6)', () => {
  beforeEach(() => markHeardWorld());
  const keep = () => screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement;

  it('Current’s eyebrow reads unsaved while no save matches it, and plain Current after a Keep', () => {
    render(<OffScreen />);
    openTransmissions();
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    fireEvent.click(keep());
    expect(currentEyebrow()).toBe(human('home.off.current'));
  });

  it('a loaded save that matches the world reads plain Current from the start', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    expect(currentEyebrow()).toBe(human('home.off.current'));
  });

  it('the slot is always in the DOM and empty, dirty or clean: there is no standing warning', () => {
    const { unmount } = render(<OffScreen />);
    expect(statusSlot()).not.toBeNull();
    expect(statusSlot().textContent).toBe('');
    unmount();
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(statusSlot()).not.toBeNull();
    expect(statusSlot().textContent).toBe('');
  });

  it('the slot sits under the readout, in the picker', () => {
    render(<OffScreen />);
    expect(readout().nextElementSibling).toBe(statusSlot());
  });

  describe('a refused Keep', () => {
    let setItem: ReturnType<typeof vi.spyOn> | undefined;
    let logged: ReturnType<typeof vi.spyOn>;
    /** From here on the storage refuses every write (a full quota). Called after a case has seeded its saves. */
    const refuseStorage = () => {
      setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
    };
    beforeEach(() => {
      logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      setItem?.mockRestore();
      setItem = undefined;
      logged.mockRestore();
    });

    // The session name differs from the loaded save's (a name typed since), and keepCurrentWorld writes the loaded one.
    it('names the loaded save it tried to overwrite, as an alert', () => {
      saveNamedSession('Dusk Run', live.marker('older'));
      useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run', currentSessionName: 'Typed Since' });
      refuseStorage();
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(keep());
      expect(within(statusSlot()).getByRole('alert').textContent).toBe(saveFailedLine('Dusk Run'));
    });

    it('names the snapshot’s save when Current was left: the save Keep tried', () => {
      saveNamedSession('Old Run', live.marker('older'));
      useSessionStore.setState({ currentLoadedSessionName: 'Old Run', currentSessionName: 'Old Run' });
      refuseStorage();
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row(presetName(1)));
      fireEvent.click(keep());
      expect(within(statusSlot()).getByRole('alert').textContent).toBe(saveFailedLine('Old Run'));
    });

    it('a later Keep that succeeds empties the slot', () => {
      refuseStorage();
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(keep());
      expect(statusSlot().textContent).not.toBe('');
      setItem!.mockRestore();
      fireEvent.click(keep());
      expect(statusSlot().textContent).toBe('');
      expect(currentEyebrow()).toBe(human('home.off.current'));
    });
  });
});

describe('OffScreen — Keep (spec assumption 14)', () => {
  beforeEach(() => markHeardWorld());
  const keep = () => screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement;

  it('is lit, Current reading unsaved, when the loaded world is not kept (no save loaded)', () => {
    const { container } = render(<OffScreen />);
    openTransmissions();
    expect(keep().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    expect(container.querySelector('.sc-button--muted')).not.toBeNull(); // flat, like Scan: nothing pops
  });

  it('is dim, Current reading plain, when the loaded save equals the live world', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    expect(keep().disabled).toBe(true);
    expect(currentEyebrow()).toBe(human('home.off.current'));
  });

  it('is lit when the loaded save differs from the live world', () => {
    saveNamedSession('Dusk Run', live.marker('older'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    expect(keep().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R20: a Keep the storage refuses (a full quota) is a line under the
  // chooser, not a throw into the click; the screen stays up and Keep stays lit, to try again. The line is the status
  // slot's since console Task 6, naming the save it tried, and Current's eyebrow still says unsaved.
  describe('a Keep the storage refuses (review R20)', () => {
    const failed = () => within(statusSlot()).queryByRole('alert');
    let setItem: ReturnType<typeof vi.spyOn>;
    let logged: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
    });
    afterEach(() => {
      setItem.mockRestore();
      logged.mockRestore();
    });

    it('shows the failure line in the slot, naming the save it tried, logs the error, and leaves the screen up with Keep lit', () => {
      render(<OffScreen />);
      openTransmissions();
      expect(failed()).toBeNull();
      fireEvent.click(keep());
      expect(failed()!.textContent).toBe(saveFailedLine('Quiet Harbour'));
      expect(statusSlot().textContent).toBe(saveFailedLine('Quiet Harbour'));
      expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
      expect(logged).toHaveBeenCalled();
      expect(keep().disabled).toBe(false);
      expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
      expect(row(currentName()).getAttribute('aria-checked')).toBe('true');
    });

    it('goes when a later Keep succeeds', () => {
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(keep());
      expect(failed()).not.toBeNull();
      setItem.mockRestore();
      fireEvent.click(keep());
      expect(failed()).toBeNull();
      expect(useSessionStore.getState().currentLoadedSessionName).toBe('Quiet Harbour');
    });

    it('goes when the world changes, since the world it names is no longer shown: a family toggle', () => {
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(keep());
      expect(failed()).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
      expect(failed()).toBeNull();
      expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    });

    // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F14: the second review's surviving mutant, onThemeChange's setKeepFailed(false).
    it('goes when the world changes: a theme pick, applied at the click', () => {
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(keep());
      expect(failed()).not.toBeNull();
      fireEvent.click(row(human('home.off.theme.float')));
      expect(failed()).toBeNull();
      expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    });

    it('goes when the world changes: a preset pick, realised at once with no wash mounted', () => {
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(keep());
      expect(failed()).not.toBeNull();
      fireEvent.click(row(presetName(1)));
      expect(applySessionPayload).toHaveBeenCalledTimes(1);
      expect(failed()).toBeNull();
    });
  });

  it('clicking Keep saves under the suggested name, lists the new row at once, names Current after it, and dims', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(keep());
    expect(listSessions().map((s) => s.name)).toEqual(['Quiet Harbour']);
    expect(row('Quiet Harbour')).toBeTruthy();
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Quiet Harbour');
    expect(currentRowName()).toBe(currentName('Quiet Harbour'));
    expect(row(currentName('Quiet Harbour')).getAttribute('aria-checked')).toBe('true');
    expect(keep().disabled).toBe(true);
    expect(currentEyebrow()).toBe(human('home.off.current'));
  });

  it('keeps under the loaded name, overwriting that row rather than adding one', () => {
    saveNamedSession('Dusk Run', live.marker('older'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(keep());
    expect(listSessions().map((s) => s.name)).toEqual(['Dusk Run']);
    expect(radioNames().filter((n) => n === savedLabel('Dusk Run'))).toHaveLength(1);
    expect(keep().disabled).toBe(true);
  });

  // Keep saves Current since docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6 (spec §1.4), so a Scan (it
  // leaves Current) no longer re-lights it: that is Task 6's "a Scan after a Keep of Current" case. What still re-lights
  // it is a change to Current itself, an in-place theme pick, and keeping then overwrites Current's own row.
  it('re-lights after a change to Current itself, and dims again after keeping — overwriting the row it kept', () => {
    vi.mocked(retransmitWorld).mockImplementationOnce(() => {
      live.payload = live.marker('themed');
    });
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(keep());
    expect(keep().disabled).toBe(true);
    fireEvent.click(row(human('home.off.theme.float')));
    expect(keep().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    fireEvent.click(keep());
    expect(keep().disabled).toBe(true);
    expect(listSessions().map((s) => s.name)).toEqual(['Quiet Harbour']);
    expect(loadSession('Quiet Harbour')).toEqual(live.marker('themed'));
  });

  it('recomputes dirty after a pick, not on every render', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    saveNamedSession('Other', live.marker('other'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    expect(keep().disabled).toBe(true);
    const onMount = vi.mocked(buildSessionPayload).mock.calls.length;
    expect(onMount).toBeGreaterThan(0);
    // A re-render from a store change does not rebuild the payload.
    const { attenuationStyles, currentAttenuationStyleId } = useAttenuationStyleStore.getState();
    act(() => {
      useAttenuationStyleStore.setState({
        attenuationStyles: attenuationStyles.map((s) => (s.id === currentAttenuationStyleId ? { ...s, name: 'renamed-1' } : s)),
      });
    });
    expect(vi.mocked(buildSessionPayload).mock.calls.length).toBe(onMount);
    // A pick does: it takes Current's snapshot. The dirty read then follows Current (docs/tasks/
    // OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6), still Dusk Run as saved, so Keep stays dim; before, it read
    // the live world against Other and lit.
    fireEvent.click(row('Other'));
    expect(vi.mocked(buildSessionPayload).mock.calls.length).toBeGreaterThan(onMount);
    expect(keep().disabled).toBe(true);
  });

  // A world that is no longer a save must not keep the save's name, or a Save from the Sessions panel would overwrite the
  // save with a different world. Current keeps the name of the world left (docs/specs/
  // OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.3); it used to be renamed by its identity alone once the save was
  // detached. And Keep saves Current (Task 6, spec §1.4), still Dusk Run as saved, so it stays dim; it used to light and
  // write the scanned world as a new row.
  it('a preset pick or a Scan clears the loaded save name; Current keeps the name of the world left, and Keep, saving it, stays dim', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    expect(currentRowName()).toBe(currentName('Dusk Run'));

    fireEvent.click(row(presetName(0)));
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    expect(currentRowName()).toBe(currentName('Dusk Run'));

    fireEvent.click(row('Dusk Run'));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
    expect(useSessionStore.getState().currentSessionName).toBe('Dusk Run'); // the save pick names the session, as a Load does
    fireEvent.click(scanButton());
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    // The name input no longer names the save, so a Save from the Sessions panel writes a new row.
    expect(useSessionStore.getState().currentSessionName).not.toBe('Dusk Run');
    expect(currentRowName()).toBe(currentName('Dusk Run'));
    expect(keep().disabled).toBe(true);
    expect(listSessions().map((s) => s.name)).toEqual(['Dusk Run']);
  });

  it('never starts the AudioEngine', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(keep());
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });
});

// docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6 (spec §1.4): once the listener has left Current, Keep saves
// Current's snapshot, not the live world, under the snapshot's save name (or a fresh one), and touches no session field;
// the dirty read that dims Keep and Current's eyebrow describes the snapshot too. No wash is mounted, so a pick lands at
// the click.
describe('OffScreen — Keep follows Current (Current and New Transmission, Task 6)', () => {
  beforeEach(() => markHeardWorld());
  afterEach(() => vi.mocked(retransmitWorld).mockReset());
  const keep = () => screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement;
  const failed = () => within(statusSlot()).queryByRole('alert');
  const session = () => useSessionStore.getState();
  /** A pick lands a different world, what buildSessionPayload builds from then on; a Current restore (a built payload,
   *  carrying a marker) lands as itself, as a Load of it would. */
  const landsAs = (marker: string) =>
    vi.mocked(applySessionPayload).mockImplementation((payload) => {
      useLoadingStore.getState().setLoading(loadingOf(payload));
      live.payload = 'marker' in payload ? structuredClone(payload) : live.marker(marker);
    });

  it('Current unsaved, a save lands, then Keep: a new row holds the pre-pick world, the picked save is untouched and stays loaded, and Keep dims', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    const prePick = structuredClone(live.payload);
    landsAs('dusk-world');
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(session().currentLoadedSessionName).toBe('Dusk Run');
    expect(keep().disabled).toBe(false); // Current was never saved
    fireEvent.click(keep());
    const kept = listSessions().map((s) => s.name).find((n) => n !== 'Dusk Run')!;
    expect(listSessions()).toHaveLength(2);
    expect(loadSession(kept)).toEqual(prePick);
    expect(loadSession('Dusk Run')).toEqual(savedPayload('dusk'));
    expect(session()).toMatchObject({ currentLoadedSessionName: 'Dusk Run', currentSessionName: 'Dusk Run' });
    expect(keep().disabled).toBe(true);
    expect(currentEyebrow()).toBe(human('home.off.current'));
    // Current is named after the save it now is; the new row is listed at once.
    expect(currentRowName()).toBe(currentName(kept));
    expect(row(kept)).toBeTruthy();
    expect(row('Dusk Run').getAttribute('aria-checked')).toBe('true');
  });

  it('Current was a save, then a preset lands, then Keep: that save is overwritten with Current, not the preset world', () => {
    saveNamedSession('Old Run', live.marker('older'));
    useSessionStore.setState({ currentLoadedSessionName: 'Old Run', currentSessionName: 'Old Run' });
    const prePick = structuredClone(live.payload);
    landsAs('preset-world');
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(1)));
    expect(session().currentLoadedSessionName).toBeNull(); // the preset detached the live world
    expect(keep().disabled).toBe(false);
    fireEvent.click(keep());
    expect(listSessions().map((s) => s.name)).toEqual(['Old Run']);
    expect(loadSession('Old Run')).toEqual(prePick);
    expect(session().currentLoadedSessionName).toBeNull();
    expect(keep().disabled).toBe(true);
  });

  it('a clean Current, then a save lands and is edited: Keep stays dim, Current plain, because the dirty read follows Current', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    saveNamedSession('Other', live.marker('other'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run', currentSessionName: 'Dusk Run' });
    landsAs('other');
    vi.mocked(retransmitWorld).mockImplementation(() => {
      live.payload = live.marker('other-edited');
    });
    render(<OffScreen />);
    openTransmissions();
    expect(keep().disabled).toBe(true);
    fireEvent.click(row('Other'));
    expect(keep().disabled).toBe(true);
    fireEvent.click(row(human('home.off.theme.float')));
    expect(keep().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
    expect(keep().disabled).toBe(true);
    expect(currentEyebrow()).toBe(human('home.off.current'));
  });

  it('a dirty Current stays lit through a pick of a clean save', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    landsAs('dusk');
    render(<OffScreen />);
    openTransmissions();
    expect(keep().disabled).toBe(false); // no save loaded: Current is unsaved
    fireEvent.click(row('Dusk Run'));
    expect(keep().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
  });

  it('Current kept, then restored: the restore attaches the kept name, and Keep stays dim', () => {
    landsAs('preset-world');
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(0)));
    fireEvent.click(keep());
    const kept = listSessions()[0].name;
    expect(currentRowName()).toBe(currentName(kept));
    fireEvent.click(currentRadio());
    expect(session()).toMatchObject({ currentLoadedSessionName: kept, currentSessionName: kept });
    expect(currentRadio().getAttribute('aria-checked')).toBe('true');
    expect(keep().disabled).toBe(true);
  });

  it('a Scan after a Keep of Current leaves Current kept: the snapshot stays, Keep stays dim', () => {
    landsAs('preset-world');
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(0)));
    fireEvent.click(keep());
    const kept = listSessions()[0].name;
    fireEvent.click(scanButton());
    expect(keep().disabled).toBe(true);
    expect(currentRowName()).toBe(currentName(kept));
    expect(listSessions()).toHaveLength(1);
  });

  it('a Keep of Current the storage refuses shows the failure line, and leaves Current unsaved and unrenamed', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    landsAs('preset-world');
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(0)));
    const before = currentRowName();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    fireEvent.click(keep());
    setItem.mockRestore();
    logged.mockRestore();
    expect(failed()).not.toBeNull();
    expect(keep().disabled).toBe(false);
    expect(currentRowName()).toBe(before);
    expect(listSessions()).toHaveLength(0);
  });
});

// docs/tasks/OFF_SCREEN_REVISIONS.md Task 4 (Crawford's notes 1 and 2, 2026-10-31): the Transmission row is a list —
// New Transmission, Current, the saves with when they were saved, a rule, the presets — and Scan rides on New
// Transmission's row, beside its radio, so what Scan does is plain (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md
// Task 5; Roll rode on Current's before). Keep stays under the list, alone, as "Save Last World" (review R20).
// docs/tasks/OFF_SCREEN_CONSOLE.md Task 2 (spec §1.4, §5 case 6): the list, Scan and Keep sit in a section that starts
// collapsed on every mount, under a header naming the selected row and the count of stored worlds (saves plus presets).
describe('OffScreen — the Transmissions section (console Task 2)', () => {
  beforeEach(() => markHeardWorld());
  const presets = TRANSMISSION_PRESETS.length;
  const list = () => screen.queryByRole('group', { name: human('home.off.transmission') });
  const keep = () => screen.getByRole('button', { name: human('home.off.keep') });

  it('on open the list is not in the DOM, and the header is collapsed, naming Current and the count', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    saveNamedSession('Low Tide', savedPayload('tide'));
    render(<OffScreen />);
    expect(list()).toBeNull();
    expect(screen.queryByRole('button', { name: human('home.off.keep') })).toBeNull();
    expect(transmissionsHeader().getAttribute('aria-expanded')).toBe('false');
    expect(transmissionsHeader().textContent).toBe(headerText(human('home.off.current'), 2 + presets));
  });

  it('with no saves the count is the presets alone', () => {
    render(<OffScreen />);
    expect(transmissionsHeader().textContent).toBe(headerText(human('home.off.current'), presets));
  });

  // Scan left the body for the editor's title row (console Task 4).
  it('opening reveals the list and Keep in the header’s body, with Current checked', () => {
    render(<OffScreen />);
    openTransmissions();
    expect(transmissionsHeader().getAttribute('aria-expanded')).toBe('true');
    const body = document.getElementById(transmissionsHeader().getAttribute('aria-controls')!)!;
    expect(body.contains(list())).toBe(true);
    expect(body.contains(scanButton())).toBe(false);
    expect(body.contains(keep())).toBe(true);
    expect(currentRadio().getAttribute('aria-checked')).toBe('true');
  });

  it('the header names every pick as it lands: a preset, a save, New Transmission (a Scan), then Current again', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(1)));
    expect(transmissionsHeader().textContent).toBe(headerText(presetName(1), 1 + presets));
    fireEvent.click(row('Dusk Run'));
    expect(transmissionsHeader().textContent).toBe(headerText('Dusk Run', 1 + presets));
    fireEvent.click(scanButton());
    expect(transmissionsHeader().textContent).toBe(headerText(newTransmission(), 1 + presets));
    fireEvent.click(currentRadio());
    expect(transmissionsHeader().textContent).toBe(headerText(human('home.off.current'), 1 + presets));
  });

  it('the header names a Scan’s pick as New Transmission', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(scanButton());
    expect(transmissionsHeader().textContent).toBe(headerText(newTransmission(), presets));
  });

  it('collapsing then opening keeps the pick', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(0)));
    fireEvent.click(transmissionsHeader());
    expect(transmissionsHeader().getAttribute('aria-expanded')).toBe('false');
    expect(list()).toBeNull();
    expect(transmissionsHeader().textContent).toBe(headerText(presetName(0), presets));
    openTransmissions();
    expect(row(presetName(0)).getAttribute('aria-checked')).toBe('true');
  });

  it('the count follows the save list: a Keep adds one, the name stays Current', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(keep());
    expect(transmissionsHeader().textContent).toBe(headerText(human('home.off.current'), 1 + presets));
  });

  it('every mount starts collapsed, whatever the last one left open', () => {
    const { unmount } = render(<OffScreen />);
    openTransmissions();
    unmount();
    render(<OffScreen />);
    expect(transmissionsHeader().getAttribute('aria-expanded')).toBe('false');
    expect(list()).toBeNull();
  });

  describe('while a change waits under the wash', () => {
    let detach: () => void;
    beforeEach(() => {
      useUIStore.setState({ sceneWash: 'clear' });
      detach = attachSceneWash();
    });
    afterEach(() => detach());

    it('the header names the waiting pick at the click, before the world has changed', () => {
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row(presetName(2)));
      expect(applySessionPayload).not.toHaveBeenCalled();
      expect(transmissionsHeader().textContent).toBe(headerText(presetName(2), presets));
    });
  });
});

// docs/tasks/OFF_SCREEN_CONSOLE.md Task 3 (spec §1.4, assumption 4, §5 case 13): Factory Reset, behind its confirm, in
// a Device section under Transmissions. Confirming clears every key, detaches the loaded save, and the screen gives way to
// the first-visit view at once: the device flag went with the rest of storage.
describe('OffScreen — the Device section (console Task 3)', () => {
  beforeEach(() => markHeardWorld());
  afterEach(() => document.getElementById('screen-viewport')?.remove());
  const deviceHeader = () => screen.getByRole('button', { name: human('home.off.device') });
  const openDevice = () => fireEvent.click(deviceHeader());
  const reset = () => screen.queryByRole('button', { name: human('session.clearStorage.action') });
  const dialog = () => screen.queryByRole('alertdialog');
  const confirm = () => fireEvent.click(within(dialog()!).getByRole('button', { name: human('session.clearStorage') }));
  const cancel = () => fireEvent.click(within(dialog()!).getByRole('button', { name: human('ui.cancel') }));
  const stored = () => [localStorage.getItem(STORAGE_KEY), localStorage.getItem(DEVICE_FLAGS_KEY)];

  it('is collapsed on mount, under Transmissions, with no Reset in the DOM', () => {
    render(<OffScreen />);
    expect(deviceHeader().getAttribute('aria-expanded')).toBe('false');
    expect(reset()).toBeNull();
    expect(transmissionsHeader().compareDocumentPosition(deviceHeader()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opening it shows Reset under its label row, Factory Reset over Clear Local Storage', () => {
    render(<OffScreen />);
    openDevice();
    expect(deviceHeader().getAttribute('aria-expanded')).toBe('true');
    const body = document.getElementById(deviceHeader().getAttribute('aria-controls')!)!;
    expect(body.contains(reset())).toBe(true);
    const label = body.querySelector('.sc-dual-label')!;
    expect(label.textContent).toContain(CONTENT['session.clearStorage'].lore);
    expect(label.textContent).toContain(human('session.clearStorage'));
  });

  it('opens on its own: Transmissions stays collapsed, and opening Transmissions leaves Device open', () => {
    render(<OffScreen />);
    openDevice();
    expect(transmissionsHeader().getAttribute('aria-expanded')).toBe('false');
    openTransmissions();
    expect(deviceHeader().getAttribute('aria-expanded')).toBe('true');
  });

  it('Reset opens the confirm and clears nothing', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    const before = stored();
    openDevice();
    fireEvent.click(reset()!);
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain(human('session.clearStorage.confirmTitle'));
    expect(dialog()!.textContent).toContain(human('session.clearStorage.confirmBody'));
    expect(stored()).toEqual(before);
    expect(before.every((v) => v !== null)).toBe(true);
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
  });

  it('confirming clears storage, detaches the loaded save, and shows the first-visit view at once', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    localStorage.setItem('trace-atlas.other', 'kept until now');
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openDevice();
    fireEvent.click(reset()!);
    confirm();
    expect(localStorage.length).toBe(0);
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    expect(dialog()).toBeNull();
    // The first-visit view: the label and the hint, and nothing answerable.
    expect(screen.getByText(human('home.off.powerHint'))).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByTestId('off-screen-readout')).toBeNull();
  });

  it('confirming requests no world change and applies nothing: the paused world stands', () => {
    const request = vi.spyOn(worldChange, 'requestWorldChange');
    render(<OffScreen />);
    openDevice();
    fireEvent.click(reset()!);
    confirm();
    expect(request).not.toHaveBeenCalled();
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(retransmitWorld).not.toHaveBeenCalled();
    request.mockRestore();
  });

  it('cancelling leaves storage, the loaded save and the picker', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    const before = stored();
    openDevice();
    fireEvent.click(reset()!);
    cancel();
    expect(dialog()).toBeNull();
    expect(stored()).toEqual(before);
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
    expect(transmissionsHeader()).toBeTruthy();
    expect(reset()).not.toBeNull();
  });

  it('the confirm portals into #screen-viewport when the screen exists', () => {
    const viewport = document.createElement('div');
    viewport.id = 'screen-viewport';
    document.body.appendChild(viewport);
    render(<OffScreen />);
    openDevice();
    fireEvent.click(reset()!);
    expect(viewport.contains(dialog())).toBe(true);
  });

  it('with no screen the confirm opens in place, never as a child of <body>', () => {
    const { container } = render(<OffScreen />);
    openDevice();
    fireEvent.click(reset()!);
    expect(container.contains(dialog())).toBe(true);
  });

  it('Escape closes the confirm and gives focus back to Reset', async () => {
    render(<OffScreen />);
    openDevice();
    const opener = reset()!;
    act(() => opener.focus());
    fireEvent.click(opener);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    fireEvent.keyDown(dialog()!, { key: 'Escape' });
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(localStorage.getItem(DEVICE_FLAGS_KEY)).not.toBeNull();
  });
});

describe('OffScreen — the Transmission list, and Scan in the editor', () => {
  beforeEach(() => markHeardWorld());
  const scan = scanButton;
  const savedMeta = (name: string) => {
    const entry = listSessions().find((s) => s.name === name)!;
    return fill('home.off.savedAt', { time: formatSessionTimestamp(entry.savedAt) });
  };

  it('draws the Transmission row in the list appearance, every option a row', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    const root = picker().closest('.sc-radio-button')!;
    expect(root.classList.contains('sc-radio-button--list')).toBe(true);
    expect(root.classList.contains('sc-radio-button--muted')).toBe(false);
    expect(root.querySelectorAll('.sc-radio-button__row')).toHaveLength(5);
    expect(root.querySelector('[class*="sc-cabinet-box"]')).toBeNull();
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R8 kept Scan outside the radio group's roving focus from the trailing slot;
  // in the editor's title row (console Task 4) it is outside the list altogether, and the slot is unused.
  it('the list holds no button and no row carries a trailing action: Scan is in the editor', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    const { container } = render(<OffScreen />);
    openTransmissions();
    expect(within(picker()).queryAllByRole('button')).toEqual([]);
    expect(container.querySelectorAll('.sc-radio-button__trailing')).toHaveLength(0);
    expect(editor().contains(scan())).toBe(true);
  });

  // Roll was never a pick; Scan is not a radio either, but it does select New Transmission, which no row carries.
  it('a click on Scan is one retransmit, nothing applied, and selects the editor, leaving no row checked', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(scan());
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(editorSelected()).toBe(true);
    expect(within(picker()).getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).not.toContain('true');
  });

  it('shows each save with when it was saved, newest first; Current and the presets carry no meta', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(Date.UTC(2026, 9, 28, 14, 14)).mockReturnValueOnce(Date.UTC(2026, 9, 30, 9, 5));
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    saveNamedSession('Night Run', savedPayload('night'));
    now.mockRestore();
    const { container } = render(<OffScreen />);
    openTransmissions();
    const metas = Array.from(container.querySelectorAll('.sc-radio-button__meta')).map((m) => m.textContent);
    expect(metas).toEqual([savedMeta('Night Run'), savedMeta('Dusk Run')]);
    expect(within(row('Night Run')).getByText(savedMeta('Night Run'))).toBeTruthy();
    expect(row(currentName()).querySelector('.sc-radio-button__meta')).toBeNull();
    for (const i of [0, 1, 2]) expect(row(presetName(i)).querySelector('.sc-radio-button__meta')).toBeNull();
  });

  it("the meta reads 'saved' and the time the Sessions list shows for the same save", () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    const entry = listSessions()[0];
    const meta = row('Dusk Run').querySelector('.sc-radio-button__meta')!;
    expect(meta.textContent).toBe(fill('home.off.savedAt', { time: formatSessionTimestamp(entry.savedAt) }));
    expect(meta.textContent).toContain(formatSessionTimestamp(entry.savedAt));
  });

  it('a save kept from this screen appears with its meta at once', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(screen.getByRole('button', { name: human('home.off.keep') }));
    const kept = useSessionStore.getState().currentLoadedSessionName!;
    expect(row(kept).querySelector('.sc-radio-button__meta')?.textContent).toBe(savedMeta(kept));
  });

  it('keeps Keep alone in the actions row under the list, as Save Last World', () => {
    const { container } = render(<OffScreen />);
    openTransmissions();
    const actions = container.querySelector('.off-screen__actions')!;
    expect(within(actions as HTMLElement).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      human('home.off.keep'),
    ]);
    // Crawford's answer to the review's Open Question 6 (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R20).
    expect(human('home.off.keep')).toBe('Save Last World');
    expect(picker().closest('.sc-radio-button')!.nextElementSibling).toBe(actions);
  });
});

describe('OffScreen — the Transmission row', () => {
  beforeEach(() => markHeardWorld());

  // New Transmission left the list for the editor (console Task 4): Current is first.
  it('lists Current, then the three presets in order, under the Transmission label, with no divider when there are no saves', () => {
    const { container } = render(<OffScreen />);
    openTransmissions();
    expect(radioNames()).toEqual([currentName(), presetLabel(0), presetLabel(1), presetLabel(2)]);
    expect(container.querySelector('.sc-radio-button__divider')).toBeNull();
  });

  it("lists the user's saves between Current and the presets, newest first, with exactly one divider ahead of the presets", () => {
    // Two saves in one millisecond would tie on savedAt; give the second a later clock so "newest first" is testable.
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    saveNamedSession('Night, all freelance', savedPayload('night'));
    now.mockRestore();
    const { container } = render(<OffScreen />);
    openTransmissions();
    const names = radioNames();
    expect(names[0]).toBe(currentName());
    expect(names.slice(1, 3)).toEqual([savedLabel('Night, all freelance'), savedLabel('Dusk Run')]);
    expect(names.slice(3)).toEqual([presetLabel(0), presetLabel(1), presetLabel(2)]);
    const dividers = container.querySelectorAll('.sc-radio-button__divider');
    expect(dividers).toHaveLength(1);
    // The list (revisions Task 4) draws each option in a row, so the rule sits ahead of the first preset's row, with the
    // presets' title between them since Task 6c.
    const presetTitle = dividers[0].nextElementSibling!;
    expect(presetTitle.textContent).toBe(human('home.off.presetTransmissions'));
    expect(presetTitle.nextElementSibling).toBe(row(presetName(0)).closest('.sc-radio-button__row'));
  });

  it('has Current selected before a pick, and nothing else in the world row', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    // Scoped to the Transmission group: the Loading axis (Task 30) is a second radio group with its own selection.
    for (const radio of within(picker()).getAllByRole('radio')) {
      expect(radio.getAttribute('aria-checked')).toBe(plainEyebrow(radio.getAttribute('aria-label')!) === currentName() ? 'true' : 'false');
    }
  });

  it("keeps a save that shares a preset's name apart from it: both render, and picking the save applies the save", () => {
    const save = savedPayload('same-name');
    saveNamedSession(presetName(0), save);
    render(<OffScreen />);
    openTransmissions();
    const radios = screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-label')!.startsWith(`${presetName(0)} · `));
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([describeWorld(save, presetName(0)), presetLabel(0)]);
    fireEvent.click(radios[0]); // the save sits ahead of the presets now
    expect(applySessionPayload).toHaveBeenCalledWith(save);
  });

  // With no New Transmission row (console Task 4), a save of that name is the only radio so named, and picking it is a
  // save pick: the editor is not selected by it.
  it('keeps a save named New Transmission apart from the editor: picking the save applies the save, and draws nothing', () => {
    const save = savedPayload('new-name');
    saveNamedSession(newTransmission(), save);
    render(<OffScreen />);
    openTransmissions();
    const radios = screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-label')!.startsWith(newTransmission()));
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([describeWorld(save, newTransmission())]);
    fireEvent.click(radios[0]);
    expect(applySessionPayload).toHaveBeenCalledWith(save);
    expect(retransmitWorld).not.toHaveBeenCalled();
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(editorSelected()).toBe(false);
  });

  it('keeps a save named like a preset id apart from the preset', () => {
    const save = savedPayload('id-clash');
    saveNamedSession(TRANSMISSION_PRESETS[0].id, save);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(TRANSMISSION_PRESETS[0].id));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(save);
  });
});

describe('OffScreen — picking', () => {
  beforeEach(() => markHeardWorld());

  // docs/tasks/OFF_SCREEN.md Task 11 (spec assumption 13): a preset is a link; the pick applies what it decodes to.
  it("applies the payload the preset's link decodes to, once, on picking a preset", () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(1)));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(presetPayload(TRANSMISSION_PRESETS[1]));
  });

  it("applies the saved session's payload on picking a save", () => {
    const save = savedPayload('dusk');
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(save);
  });

  // Code review 2026-10-11: the Sessions list names the loaded save so a later Save overwrites it; the
  // off screen's pick must too, or powering on and pressing Save writes a second entry.
  it('picking a save names the session after it, as loading it from the Sessions list does', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(useSessionStore.getState().currentSessionName).toBe('Dusk Run');
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
  });

  it('picking a preset leaves the session name alone: a preset is not a save to overwrite', () => {
    const before = useSessionStore.getState().currentSessionName;
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(0)));
    expect(useSessionStore.getState().currentSessionName).toBe(before);
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
  });

  it('never starts the AudioEngine: only the power switch starts sound', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(0)));
    fireEvent.click(row('Dusk Run'));
    fireEvent.click(currentRadio());
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });

  it('marks the picked option selected, and only it — Current included', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(2)));
    expect(row(presetName(2)).getAttribute('aria-checked')).toBe('true');
    expect(row(presetName(0)).getAttribute('aria-checked')).toBe('false');
    expect(row(currentName()).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(row(presetName(0)));
    expect(row(presetName(2)).getAttribute('aria-checked')).toBe('false');
    expect(applySessionPayload).toHaveBeenCalledTimes(2);
  });

  it('re-clicking the picked option does not retransmit', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(0)));
    fireEvent.click(row(presetName(0)));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(row(presetName(0)).getAttribute('aria-checked')).toBe('true');
  });

  it('a save deleted since the screen mounted applies nothing and does not claim the pick', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    localStorage.clear();
    fireEvent.click(row('Dusk Run'));
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(row('Dusk Run').getAttribute('aria-checked')).toBe('false');
    expect(row(currentName()).getAttribute('aria-checked')).toBe('true');
  });
});

describe('OffScreen — the well naming the pick', () => {
  beforeEach(() => markHeardWorld());

  it('names Current before a pick, the same string as the Current row', () => {
    render(<OffScreen />);
    expect(readout().textContent).toBe(currentLabel());
  });

  it('names the loaded save before a pick, as the Current row does', () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(readout().textContent).toBe(currentLabel('Dusk Run'));
  });

  it("names a preset by its copy and its world: '<name> · AS (x, y)'", () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(1)));
    expect(readout().textContent).toBe(describeWorld(presetPayload(TRANSMISSION_PRESETS[1])!, presetName(1)));
  });

  it("names a save by its own name and its world: '<save> · AS (x, y)'", () => {
    const save = savedPayload('dusk');
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(readout().textContent).toBe(describeWorld(save, 'Dusk Run'));
    expect(readout().textContent!.startsWith('Dusk Run · dusk (')).toBe(true);
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R30: a save edited by hand reaches the pick unchecked. One with no plot is
  // named by its seed alone, and the screen stays up.
  it('names a save with no coordinates by its name and seed, without a crash', () => {
    const save: Partial<SessionPayload> = savedPayload('dusk');
    delete save.coordinates;
    saveNamedSession('Dusk Run', save as SessionPayload);
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    expect(readout().textContent!.startsWith('Dusk Run · dusk')).toBe(true);
    expect(readout().textContent).not.toContain('(');
    expect(row('Dusk Run').getAttribute('aria-checked')).toBe('true');
  });

  it('is labelled for assistive tech and announced politely', () => {
    render(<OffScreen />);
    expect(readout().getAttribute('role')).toBe('status');
    expect(readout().getAttribute('aria-label')).toBe(human('home.off.readout'));
  });
});

// docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R25 (Crawford: the selected row, Open Question 5): the readout mounts already
// filled, so nothing announces the chooser. After a power-off - the world 'paused', written in the same call that flips
// the power flag, before this screen mounts - focus moves to the Transmission list's selected row, which is named with
// its eyebrow. A fresh page ('cold') and a first visit (the hint only, no rows) move no focus.
// The selected row took the focus until docs/tasks/OFF_SCREEN_CONSOLE.md Task 2: the list now starts collapsed, so the
// row is not in the DOM on mount and the Transmissions header takes it instead (spec §1.4).
describe('OffScreen — focus on the Transmissions header after a power-off (review R25)', () => {
  let outside: HTMLButtonElement;
  beforeEach(() => {
    outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
  });
  afterEach(() => {
    outside.remove();
    setWorldState('cold');
  });

  it('mounted with the world paused, the collapsed Transmissions header has focus, naming Current', () => {
    markHeardWorld();
    setWorldState('paused');
    render(<OffScreen />);
    const header = transmissionsHeader();
    expect(document.activeElement).toBe(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.textContent).toBe(headerText(human('home.off.current'), TRANSMISSION_PRESETS.length));
  });

  it('mounted with the world cold (a fresh page), focus stays where it was', () => {
    markHeardWorld();
    render(<OffScreen />);
    expect(document.activeElement).toBe(outside);
  });

  it('a first visit moves no focus, even paused: there are no rows to take it', () => {
    setWorldState('paused');
    render(<OffScreen />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it('the readout keeps its status role for the changes after the mount', () => {
    markHeardWorld();
    setWorldState('paused');
    render(<OffScreen />);
    expect(readout().getAttribute('role')).toBe('status');
  });
});

// docs/tasks/OFF_SCREEN_REVISIONS.md Task 13 (Crawford's note 7): every world change the screen makes waits under the
// scene wash. A wash is attached here by hand (WorldView, which mounts the real one, is not rendered); the store stands in
// for its timelines: the test sets 'covered' where the fade-in would land. The pick, the dirty read and the description
// lines move with the world, after the change.
describe('OffScreen — world changes wait under the scene wash (revisions Task 13)', () => {
  let detach: () => void;
  beforeEach(() => {
    markHeardWorld();
    useUIStore.setState({ sceneWash: 'clear' });
    detach = attachSceneWash();
  });
  afterEach(() => {
    detach();
    vi.mocked(retransmitWorld).mockReset();
  });
  const wash = () => useUIStore.getState().sceneWash;
  // The change runs just after the call that lands the cover (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R12), so the
  // act is awaited.
  const land = () =>
    act(async () => {
      useUIStore.getState().setSceneWash('covered');
    });
  const checked = (name: string) => row(name).getAttribute('aria-checked');

  // The pick shows at the click since docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R3 (the rows draw from the intent).
  it('a preset pick applies its payload only once the wash has covered the world, and the pick shows at the click', async () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(1)));
    expect(wash()).toBe('covering');
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(checked(presetName(1))).toBe('true');
    await land();
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(presetPayload(TRANSMISSION_PRESETS[1]));
    expect(checked(presetName(1))).toBe('true');
    expect(wash()).toBe('uncovering');
  });

  it('two picks before the cover lands: only the last is applied', async () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(0)));
    fireEvent.click(row('Dusk Run'));
    await land();
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(savedPayload('dusk'));
    expect(checked('Dusk Run')).toBe('true');
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
  });

  // Roll's case rewritten for Scan (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 5): Scan's world lands
  // once covered, and New Transmission is selected at the click.
  it('Scan lands its world once covered; New Transmission is selected at the click (R3)', async () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(2)));
    await land();
    act(() => useUIStore.getState().setSceneWash('clear'));
    fireEvent.click(scanButton());
    expect(retransmitWorld).not.toHaveBeenCalled();
    expect(editorSelected()).toBe(true);
    expect(checked(presetName(2))).toBe('false');
    await land();
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith(expect.objectContaining({ theme: 'classic', aspects: {} }));
    expect(editorSelected()).toBe(true);
  });

  // A New Transmission pick is a Scan since console Task 4 (the row is gone).
  it('a Scan waiting, then Current: the change is cancelled and nothing is drawn into the world', async () => {
    const cancel = vi.spyOn(worldChange, 'cancelWorldChange');
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(scanButton());
    fireEvent.click(currentRadio());
    expect(cancel).toHaveBeenCalledTimes(1);
    await land();
    expect(retransmitWorld).not.toHaveBeenCalled();
    expect(currentRadio().getAttribute('aria-checked')).toBe('true');
    cancel.mockRestore();
  });

  // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F8 (Crawford, answer 2b): a theme re-derives the world in place (F7), so it is
  // no world change either: it applies at the click with no cover, as a family toggle does since R33.
  it('a theme pick raises no wash and retransmits at once', () => {
    render(<OffScreen />);
    fireEvent.click(row(human('home.off.theme.float')));
    expect(wash()).toBe('clear');
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith({ theme: 'float' });
  });

  it('a theme pick while a save waits joins it: the one change lands the save, then the theme over it, and nothing before', async () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    fireEvent.click(row(human('home.off.theme.float')));
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(retransmitWorld).not.toHaveBeenCalled();
    expect(checked(human('home.off.theme.float'))).toBe('true'); // the click shows at once
    await land();
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(savedPayload('dusk'));
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith({ theme: 'float' });
    expect(vi.mocked(applySessionPayload).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(retransmitWorld).mock.invocationCallOrder[0]);
  });

  it('a save, then Current, then a theme pick: Current cancels the save, and the theme then applies at once, joining nothing', async () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row('Dusk Run'));
    fireEvent.click(row(currentName()));
    fireEvent.click(row(human('home.off.theme.float')));
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith({ theme: 'float' });
    await land();
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(checked(currentName())).toBe('true');
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R3: while a change waits under the wash, the screen holds what the clicks
  // since have asked for, and the one request realises all of it at the cover: the world part, then the loading where
  // it differs from the world's own.
  describe('every click made while a change waits counts (review R3)', () => {
    const order = (mock: { mock: { invocationCallOrder: number[] } }) => mock.mock.invocationCallOrder[0];

    it('a preset, a theme pick, then a toggle: one request at the cover carrying both, and no retransmit before it', async () => {
      const preset = presetPayload(TRANSMISSION_PRESETS[0])!;
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row(presetName(0)));
      fireEvent.click(row(human('home.off.theme.float')));
      fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
      expect(retransmitWorld).not.toHaveBeenCalled();
      await land();
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).toHaveBeenCalledWith({ theme: 'float', aspects: { ...loadingOf(preset).aspects, envelope: ['held'] } });
    });

    it('a preset then Current applies nothing: the cover lands and lifts with no change, and Current stays picked', async () => {
      const cancel = vi.spyOn(worldChange, 'cancelWorldChange');
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row(presetName(1)));
      expect(cancel).not.toHaveBeenCalled();
      fireEvent.click(row(currentName()));
      expect(cancel).toHaveBeenCalledTimes(1); // the waiting change is dropped, not left to run as a no-op
      expect(checked(currentName())).toBe('true');
      await land();
      expect(applySessionPayload).not.toHaveBeenCalled();
      expect(retransmitWorld).not.toHaveBeenCalled();
      expect(wash()).toBe('uncovering');
      expect(checked(currentName())).toBe('true');
      cancel.mockRestore();
    });

    it("a preset then a toggle leaves the preset's world with the toggle: the apply, then one aspects retransmit", async () => {
      const preset = presetPayload(TRANSMISSION_PRESETS[0])!;
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row(presetName(0)));
      fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
      expect(applySessionPayload).not.toHaveBeenCalled();
      expect(retransmitWorld).not.toHaveBeenCalled();
      await land();
      expect(applySessionPayload).toHaveBeenCalledTimes(1);
      expect(applySessionPayload).toHaveBeenCalledWith(preset);
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).toHaveBeenCalledWith({ aspects: { ...loadingOf(preset).aspects, envelope: ['held'] } });
      expect(order(vi.mocked(applySessionPayload))).toBeLessThan(order(vi.mocked(retransmitWorld)));
      expect(checked(presetName(0))).toBe('true'); // the toggle laid over the preset keeps its row (spec §1.5)
    });

    it("a preset then a theme pick leaves the preset's world under that theme: the apply, then one theme retransmit", async () => {
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row(presetName(0)));
      fireEvent.click(row(human('home.off.theme.float')));
      await land();
      expect(applySessionPayload).toHaveBeenCalledTimes(1);
      expect(applySessionPayload).toHaveBeenCalledWith(presetPayload(TRANSMISSION_PRESETS[0]));
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).toHaveBeenCalledWith({ theme: 'float' });
      expect(order(vi.mocked(applySessionPayload))).toBeLessThan(order(vi.mocked(retransmitWorld)));
    });

    // Roll's case rewritten for Scan (Task 5): Roll kept the loading, so the save's was laid over the rolled world;
    // Scan's world brings its own loading, Classic with no aspects, replacing the save's as a pick's own loading does.
    it('a save then Scan: the scan wins, its world under Classic with no aspects, and nothing is laid over it', async () => {
      saveNamedSession('Dusk Run', { ...savedPayload('dusk'), theme: 'float' });
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row('Dusk Run'));
      fireEvent.click(scanButton());
      await land();
      expect(applySessionPayload).not.toHaveBeenCalled();
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).toHaveBeenCalledWith(expect.objectContaining({ theme: 'classic', aspects: {} }));
      expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
      expect(editorSelected()).toBe(true);
    });

    it('a Scan then a theme pick: the scanned world lands, then the theme is laid over it, and the row keeps it', async () => {
      vi.mocked(retransmitWorld).mockImplementation((input) => {
        const { theme, aspects, setLoading } = useLoadingStore.getState();
        setLoading({ theme: input.theme ?? theme, aspects: input.aspects ?? aspects });
      });
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(scanButton());
      fireEvent.click(row(human('home.off.theme.float')));
      await land();
      expect(retransmitWorld).toHaveBeenCalledTimes(2);
      expect(vi.mocked(retransmitWorld).mock.calls[0][0]).toMatchObject({ theme: 'classic', aspects: {} });
      expect(vi.mocked(retransmitWorld).mock.calls[1][0]).toEqual({ theme: 'float' });
      expect(editorSelected()).toBe(true);
      expect(readout().textContent!.endsWith(` · ${human('home.off.theme.float')}`)).toBe(true);
    });

    it('shows each click at once: the picked row, the theme row, its line and the readout follow the click, not the world', () => {
      const preset = presetPayload(TRANSMISSION_PRESETS[1])!;
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row(presetName(1)));
      expect(checked(presetName(1))).toBe('true');
      expect(readout().textContent).toBe(describeWorld({ ...preset, ...loadingOf(preset) }, presetName(1)));
      fireEvent.click(row(human('home.off.theme.float')));
      // A theme pick while the preset waits keeps the preset's row (final fixes F12); the readout names the world to come.
      expect(row(presetName(1)).getAttribute('aria-checked')).toBe('true');
      expect(checked(human('home.off.theme.float'))).toBe('true');
      expect(document.querySelector('.off-screen__description--theme')?.textContent).toBe(human('home.off.themeDescription.float'));
      expect(readout().textContent).toBe(describeWorld({ ...preset, ...loadingOf(preset), theme: 'float' }, presetName(1)));
      expect(applySessionPayload).not.toHaveBeenCalled();
    });

    it('dims Keep between a click and the cover landing: it would save a world the rows no longer show', async () => {
      render(<OffScreen />);
      openTransmissions();
      const keep = () => screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement;
      expect(keep().disabled).toBe(false); // precondition: the unsaved live world lights it
      fireEvent.click(row(presetName(0)));
      expect(keep().disabled).toBe(true);
      await land();
      expect(keep().disabled).toBe(false);
    });

    it("a theme pick then a preset: the theme applies at the click, then the preset's own loading wins, so nothing is laid over it", async () => {
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row(human('home.off.theme.float')));
      expect(retransmitWorld).toHaveBeenCalledTimes(1); // the theme, at once (F8)
      fireEvent.click(row(presetName(0)));
      expect(checked(human('home.off.theme.classic'))).toBe('true'); // the preset's own theme, shown at the click
      await land();
      expect(applySessionPayload).toHaveBeenCalledWith(presetPayload(TRANSMISSION_PRESETS[0]));
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
    });

    it('a save that carries its own loading applies alone: its loading is the one intended, so nothing is laid over it', async () => {
      const calmRun = { ...savedPayload('calm-run'), theme: 'float', aspects: { melody: ['hypnotic'] } } as SessionPayload;
      saveNamedSession('Calm Run', calmRun);
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row('Calm Run'));
      await land();
      expect(applySessionPayload).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).not.toHaveBeenCalled();
    });

    // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F12 (second review, finding 3): a theme or family click while a pick waits
    // keeps that pick's row selected, so Current stays unselected and picking it cancels the change.
    describe('a click while a pick waits keeps the pick shown (final fixes F12)', () => {
      const dusk = () => savedPayload('dusk');
      const duskIdentity = () => ({ attenuationStyleName: dusk().attenuationStyleName, coordinates: dusk().coordinates, ...loadingOf(dusk()) });

      it("a theme while a save waits: the save's row stays checked, and the readout names the save under the new theme", () => {
        saveNamedSession('Dusk Run', dusk());
        render(<OffScreen />);
        openTransmissions();
        fireEvent.click(row('Dusk Run'));
        fireEvent.click(row(human('home.off.theme.float')));
        expect(row('Dusk Run').getAttribute('aria-checked')).toBe('true');
        expect(checked(currentName())).toBe('false');
        expect(readout().textContent).toBe(describeWorld({ ...duskIdentity(), theme: 'float' }, 'Dusk Run'));
      });

      it('then Current cancels the change: nothing runs at the cover, and the theme row shows the loaded theme again', async () => {
        const cancel = vi.spyOn(worldChange, 'cancelWorldChange');
        saveNamedSession('Dusk Run', dusk());
        render(<OffScreen />);
        openTransmissions();
        fireEvent.click(row('Dusk Run'));
        fireEvent.click(row(human('home.off.theme.float')));
        fireEvent.click(row(currentName()));
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(checked(currentName())).toBe('true');
        expect(checked(human('home.off.theme.classic'))).toBe('true');
        await land();
        expect(applySessionPayload).not.toHaveBeenCalled();
        expect(retransmitWorld).not.toHaveBeenCalled();
        expect(checked(currentName())).toBe('true');
        cancel.mockRestore();
      });

      it("a family toggle while a save waits: the save's row stays checked, the readout carries the toggle", () => {
        saveNamedSession('Dusk Run', dusk());
        render(<OffScreen />);
        openTransmissions();
        fireEvent.click(row('Dusk Run'));
        fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
        expect(row('Dusk Run').getAttribute('aria-checked')).toBe('true');
        expect(checked(currentName())).toBe('false');
        expect(readout().textContent).toBe(
          describeWorld({ ...duskIdentity(), aspects: { ...loadingOf(dusk()).aspects, envelope: ['held'] } }, 'Dusk Run'),
        );
      });

      it('then Current cancels the toggle with the save: nothing runs at the cover, and the row shows the loaded picks', async () => {
        saveNamedSession('Dusk Run', dusk());
        render(<OffScreen />);
        openTransmissions();
        fireEvent.click(row('Dusk Run'));
        fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
        fireEvent.click(row(currentName()));
        expect(screen.getByRole('button', { name: human('home.off.envelope.held') }).getAttribute('aria-pressed')).toBe('false');
        await land();
        expect(applySessionPayload).not.toHaveBeenCalled();
        expect(retransmitWorld).not.toHaveBeenCalled();
      });

      // docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.5: the row is the intended pick, always (it used to drop
      // to Current once a loading was laid over the pick).
      it('lands the save, then the theme over it; the save row stays checked', async () => {
        saveNamedSession('Dusk Run', dusk());
        render(<OffScreen />);
        openTransmissions();
        fireEvent.click(row('Dusk Run'));
        fireEvent.click(row(human('home.off.theme.float')));
        await land();
        expect(applySessionPayload).toHaveBeenCalledWith(dusk());
        expect(retransmitWorld).toHaveBeenCalledWith({ theme: 'float' });
        expect(checked('Dusk Run')).toBe('true');
        expect(currentRadio().getAttribute('aria-checked')).toBe('false');
      });

      it("a theme clicked away and back to the save's own: nothing is laid over the save, and its row stays picked", async () => {
        saveNamedSession('Dusk Run', dusk());
        render(<OffScreen />);
        openTransmissions();
        fireEvent.click(row('Dusk Run'));
        fireEvent.click(row(human('home.off.theme.float')));
        fireEvent.click(row(human(`home.off.theme.${loadingOf(dusk()).theme}`)));
        await land();
        expect(applySessionPayload).toHaveBeenCalledTimes(1);
        expect(retransmitWorld).not.toHaveBeenCalled();
        expect(checked('Dusk Run')).toBe('true');
      });
    });

    it('two world picks still keep only the last, with the pick shown at each click', async () => {
      saveNamedSession('Dusk Run', savedPayload('dusk'));
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row(presetName(0)));
      expect(checked(presetName(0))).toBe('true');
      fireEvent.click(row('Dusk Run'));
      expect(checked('Dusk Run')).toBe('true');
      expect(checked(presetName(0))).toBe('false');
      await land();
      expect(applySessionPayload).toHaveBeenCalledTimes(1);
      expect(applySessionPayload).toHaveBeenCalledWith(savedPayload('dusk'));
      expect(retransmitWorld).not.toHaveBeenCalled();
    });
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R33: an aspect change is no longer a world change (the deal moves in place),
  // so a family toggle applies at the click, with no cover, and two quick toggles both land.
  describe('a family toggle is no world change (review R33)', () => {
    beforeEach(() => {
      vi.mocked(retransmitWorld).mockImplementation((input) => {
        const { theme, aspects, setLoading } = useLoadingStore.getState();
        setLoading({ theme: input.theme ?? theme, aspects: input.aspects ?? aspects });
      });
    });

    it("applies at once with no cover: the wash stays clear, and the row's line follows at the click", () => {
      render(<OffScreen />);
      fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
      expect(wash()).toBe('clear');
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).toHaveBeenCalledWith({ aspects: { envelope: ['held'] } });
      expect(document.querySelector('.off-screen__description--envelope')?.textContent).toBe(
        human('home.off.envelopeDescription.held'),
      );
    });

    it('two toggles in one family both land, where the second used to replace the first under the cover', () => {
      render(<OffScreen />);
      fireEvent.click(screen.getByRole('button', { name: human('home.off.melody.hypnotic') }));
      fireEvent.click(screen.getByRole('button', { name: human('home.off.melody.wandering') }));
      expect(wash()).toBe('clear');
      expect(useLoadingStore.getState().aspects).toEqual({ melody: ['hypnotic', 'wandering'] });
      expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { melody: ['hypnotic', 'wandering'] } });
    });

    it('toggles in two families both land: Melody then Envelope keeps the Melody pick', () => {
      render(<OffScreen />);
      fireEvent.click(screen.getByRole('button', { name: human('home.off.melody.hypnotic') }));
      fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.plucked') }));
      expect(wash()).toBe('clear');
      expect(useLoadingStore.getState().aspects).toEqual({ melody: ['hypnotic'], envelope: ['plucked'] });
      expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { melody: ['hypnotic'], envelope: ['plucked'] } });
    });
  });

  // The dirty read follows Current since docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6 (spec §1.4), so a
  // Scan from a kept Current no longer lights Keep at the cover (the scanned world is not Current). This case starts on
  // an unsaved Current instead: Keep dims while the change waits and lights again once it lands, Current still unsaved.
  it('dirty is read after the change: Keep dims while it waits and lights once the cover has landed', async () => {
    render(<OffScreen />);
    openTransmissions();
    const keep = () => screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement;
    expect(keep().disabled).toBe(false);
    vi.mocked(retransmitWorld).mockImplementation(() => {
      live.payload = live.marker('scanned');
    });
    fireEvent.click(scanButton());
    expect(keep().disabled).toBe(true);
    await land();
    expect(keep().disabled).toBe(false);
  });

  it('a kept Current stays kept through a Scan landing: Keep stays dim at the cover', async () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    const keep = () => screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement;
    expect(keep().disabled).toBe(true);
    vi.mocked(retransmitWorld).mockImplementation(() => {
      live.payload = live.marker('scanned');
    });
    fireEvent.click(scanButton());
    await land();
    expect(keep().disabled).toBe(true);
  });

  it('a theme pick reads dirty at the click: no cover to wait for, so Keep lights at once (final fixes F8)', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    openTransmissions();
    const keep = () => screen.getByRole('button', { name: human('home.off.keep') }) as HTMLButtonElement;
    expect(keep().disabled).toBe(true);
    vi.mocked(retransmitWorld).mockImplementation(() => {
      live.payload = live.marker('themed');
    });
    fireEvent.click(row(human('home.off.theme.anchor')));
    expect(keep().disabled).toBe(false);
  });

  // docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 3 (spec §1.1, §1.2, §1.5): Current is a snapshot of the
  // world the listener left, taken on the way out. Picked after another world has landed, it restores that world under
  // the wash; picked while the departure still waits, it cancels it.
  describe('Current is the world you left (Current and New Transmission, Task 3)', () => {
    const clear = () => act(() => useUIStore.getState().setSceneWash('clear'));
    const calmRun = (): SessionPayload => ({ ...savedPayload('dusk'), theme: 'float', aspects: { melody: ['hypnotic'] } }) as SessionPayload;
    const lastApplied = () => vi.mocked(applySessionPayload).mock.lastCall?.[0];

    it('keeps its name through a save pick landing, though the live world and its loaded save have moved', async () => {
      saveNamedSession('Calm Run', calmRun());
      render(<OffScreen />);
      openTransmissions();
      const before = currentRowName();
      expect(before).toBe(currentName()); // precondition
      fireEvent.click(row('Calm Run'));
      expect(currentRowName()).toBe(before);
      await land();
      expect(useSessionStore.getState().currentLoadedSessionName).toBe('Calm Run'); // the live world moved
      expect(useLoadingStore.getState().theme).toBe('float');
      expect(currentRowName()).toBe(before);
    });

    it('a save lands, then Current: the pre-pick world is applied at the cover, Current checked, the pre-pick save attached again', async () => {
      saveNamedSession('Old Run', structuredClone(live.payload));
      useSessionStore.setState({ currentLoadedSessionName: 'Old Run', currentSessionName: 'Old Run' });
      saveNamedSession('Calm Run', calmRun());
      const prePick = structuredClone(live.payload);
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row('Calm Run'));
      await land();
      clear();
      expect(useSessionStore.getState().currentLoadedSessionName).toBe('Calm Run');
      fireEvent.click(row(currentName('Old Run')));
      expect(wash()).toBe('covering');
      expect(applySessionPayload).toHaveBeenCalledTimes(1); // only the save so far: the restore waits for the cover
      expect(checked(currentName('Old Run'))).toBe('true');
      await land();
      expect(applySessionPayload).toHaveBeenCalledTimes(2);
      expect(lastApplied()).toEqual(prePick);
      expect(useSessionStore.getState()).toMatchObject({ currentLoadedSessionName: 'Old Run', currentSessionName: 'Old Run' });
      expect(checked(currentName('Old Run'))).toBe('true');
      // The Loading rows are the restored world's again.
      expect(checked(human('home.off.theme.classic'))).toBe('true');
      expect(screen.getByRole('button', { name: human('home.off.melody.hypnotic') }).getAttribute('aria-pressed')).toBe('false');
    });

    it('a restore of a world with no save loaded detaches the save picked since', async () => {
      saveNamedSession('Calm Run', calmRun());
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row('Calm Run'));
      await land();
      clear();
      fireEvent.click(row(currentName()));
      await land();
      expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
      expect(useSessionStore.getState().currentSessionName).not.toBe('Calm Run');
      expect(checked(currentName())).toBe('true');
    });

    it('a save still waiting, then Current: the change is cancelled, nothing runs at the cover, and the snapshot goes', async () => {
      const cancel = vi.spyOn(worldChange, 'cancelWorldChange');
      saveNamedSession('Calm Run', calmRun());
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row('Calm Run'));
      fireEvent.click(row(currentName()));
      expect(cancel).toHaveBeenCalledTimes(1);
      await land();
      expect(applySessionPayload).not.toHaveBeenCalled();
      expect(retransmitWorld).not.toHaveBeenCalled();
      expect(checked(currentName())).toBe('true');
      cancel.mockRestore();
      // The snapshot went with the cancel: the next departure takes a fresh one of the world as it is then.
      clear();
      live.payload = live.marker('moved');
      fireEvent.click(row('Calm Run'));
      await land();
      clear();
      fireEvent.click(row(currentName()));
      await land();
      expect(lastApplied()).toEqual(live.marker('moved'));
    });

    it('a theme on Current, then a save lands, then Current: the restored world carries the theme, as the snapshot followed', async () => {
      // What the retransmit does to the live world: the payload it builds carries the theme from then on.
      vi.mocked(retransmitWorld).mockImplementation((input) => {
        live.payload = { ...live.payload, theme: input.theme } as SessionPayload;
      });
      saveNamedSession('Dusk Run', savedPayload('dusk'));
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row(human('home.off.theme.float')));
      fireEvent.click(row('Dusk Run'));
      await land();
      clear();
      fireEvent.click(currentRadio());
      await land();
      expect(lastApplied()).toMatchObject({ theme: 'float' });
    });

    it('a save lands, Current waits, then a preset: only the preset lands, Current still names the snapshot, and Current then restores it', async () => {
      saveNamedSession('Calm Run', calmRun());
      const prePick = structuredClone(live.payload);
      render(<OffScreen />);
      openTransmissions();
      const name = currentRowName();
      fireEvent.click(row('Calm Run'));
      await land();
      clear();
      fireEvent.click(currentRadio());
      fireEvent.click(row(presetName(1)));
      await land();
      expect(applySessionPayload).toHaveBeenCalledTimes(2);
      expect(lastApplied()).toEqual(presetPayload(TRANSMISSION_PRESETS[1]));
      expect(checked(presetName(1))).toBe('true');
      expect(currentRowName()).toBe(name);
      clear();
      fireEvent.click(currentRadio());
      await land();
      expect(lastApplied()).toEqual(prePick);
    });

    it('a theme clicked while a restore waits is laid over the restored world, and Current stays checked', async () => {
      saveNamedSession('Calm Run', calmRun());
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row('Calm Run'));
      await land();
      clear();
      fireEvent.click(currentRadio());
      fireEvent.click(row(human('home.off.theme.anchor')));
      expect(retransmitWorld).not.toHaveBeenCalled();
      await land();
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).toHaveBeenCalledWith({ theme: 'anchor' });
      expect(vi.mocked(applySessionPayload).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(retransmitWorld).mock.invocationCallOrder[0]);
      expect(currentRadio().getAttribute('aria-checked')).toBe('true');
    });

    it('Current restored is the live world again: a new pick takes a fresh snapshot', async () => {
      saveNamedSession('Calm Run', calmRun());
      render(<OffScreen />);
      openTransmissions();
      fireEvent.click(row('Calm Run'));
      await land();
      clear();
      fireEvent.click(currentRadio());
      await land();
      clear();
      live.payload = live.marker('after-restore');
      fireEvent.click(row(presetName(0)));
      await land();
      clear();
      fireEvent.click(currentRadio());
      await land();
      expect(lastApplied()).toEqual(live.marker('after-restore'));
    });
  });

  it('Keep and picking Current are not world changes: no cover, at once', () => {
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(screen.getByRole('button', { name: human('home.off.keep') }));
    expect(wash()).toBe('clear');
    expect(listSessions()).toHaveLength(1);
    fireEvent.click(row(currentName(listSessions()[0].name)));
    expect(wash()).toBe('clear');
  });
});

// docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6c (Crawford, 2026-11-02): the list's saves and presets sit
// under titles, and the Loading column's two parts are titled, each with how many it takes.
describe('OffScreen — the section titles (Current and New Transmission, Task 6c)', () => {
  beforeEach(() => markHeardWorld());
  const titles = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.sc-radio-button__heading')).map((h) => h.textContent);
  const rowEl = (name: string) => row(name).closest('.sc-radio-button__row');

  it('with no saves, titles the presets only, directly over the first preset', () => {
    const { container } = render(<OffScreen />);
    openTransmissions();
    expect(titles(container)).toEqual([human('home.off.presetTransmissions')]);
    expect(container.querySelector('.sc-radio-button__heading')!.nextElementSibling).toBe(rowEl(presetName(0)));
  });

  it('with saves, titles them over the newest, and the presets under the rule', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    saveNamedSession('Night Run', savedPayload('night'));
    now.mockRestore();
    const { container } = render(<OffScreen />);
    openTransmissions();
    expect(titles(container)).toEqual([human('home.off.savedTransmissions'), human('home.off.presetTransmissions')]);
    const [saved, presets] = Array.from(container.querySelectorAll('.sc-radio-button__heading'));
    expect(saved.nextElementSibling).toBe(rowEl('Night Run'));
    expect(presets.nextElementSibling).toBe(rowEl(presetName(0)));
    expect(presets.previousElementSibling!.classList.contains('sc-radio-button__divider')).toBe(true);
  });

  it('titles a save kept from this screen at once, the first save', () => {
    const { container } = render(<OffScreen />);
    openTransmissions();
    fireEvent.click(screen.getByRole('button', { name: human('home.off.keep') }));
    expect(titles(container)[0]).toBe(human('home.off.savedTransmissions'));
  });

  it('titles the Loading column: Trace Type with "select one" over the themes, then Trace Aspects with "select many" over the families', () => {
    const { container } = render(<OffScreen />);
    const column = container.querySelectorAll('.off-screen__axis')[1] as HTMLElement;
    const themeGroup = screen.getByRole('group', { name: human('home.off.loading') });
    expect(human('home.off.loading')).toBe('Trace Type');
    const themeLabel = themeGroup.closest('.sc-radio-button')!.querySelector('.sc-dual-label')!;
    expect(Array.from(themeLabel.children).map((c) => c.textContent)).toEqual([human('home.off.loading'), human('home.off.loadingHint')]);
    const aspects = column.querySelector('.off-screen__aspects-title')!;
    expect(Array.from(aspects.querySelectorAll('.sc-dual-label > *')).map((c) => c.textContent)).toEqual([
      human('home.off.aspects'),
      human('home.off.aspectsHint'),
    ]);
    // After the theme row and its line, ahead of every family row.
    const firstFamily = screen.getByRole('group', { name: human(`home.off.${ASPECT_FAMILY_IDS[0]}`) }).closest('.sc-radio-button')!;
    expect(aspects.previousElementSibling!.classList.contains('off-screen__description--theme')).toBe(true);
    expect(aspects.nextElementSibling).toBe(firstFamily);
  });
});

// Crawford's note 5 (docs/tasks/OFF_SCREEN_REVISIONS.md Task 9): the aspect rows pop on hover and select; everything else
// on the off screen stays flat — the Transmission list, the theme row, Scan (Roll's place) and Keep (his answer 5).
describe('OffScreen — only the aspect rows come off the plate', () => {
  beforeEach(() => markHeardWorld());

  it('the Transmission list, the theme row, Scan and Keep carry no cabinet box, wall or popped class, picked or not', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    openTransmissions();
    fireEvent.click(row(presetName(0)));
    const flat = [
      picker().closest('.sc-radio-button')!,
      screen.getByRole('group', { name: human('home.off.loading') }).closest('.sc-radio-button')!,
      scanButton(),
      screen.getByRole('button', { name: human('home.off.keep') }),
    ];
    for (const part of flat) {
      expect(part.querySelector('[class*="sc-cabinet-box"]')).toBeNull();
      expect(part.querySelector('[class*="popped"]')).toBeNull();
    }
  });

  // The editor's three inputs (console Task 4) are TextInputs, which carry their own static facade box (spec §3: the
  // controls are used as they are): the only boxes besides the aspect rows'.
  it('every cabinet box on the screen belongs to an aspect row or to one of the editor’s inputs', () => {
    const { container } = render(<OffScreen />);
    const boxes = Array.from(container.querySelectorAll('.sc-cabinet-box'));
    const aspectBoxes = ASPECT_FAMILY_IDS.reduce((n, family) => n + ASPECT_IDS_BY_FAMILY[family].length, 0);
    expect(boxes.length).toBe(aspectBoxes + 3);
    const familyRoots = ASPECT_FAMILY_IDS.map((family) =>
      screen.getByRole('group', { name: human(`home.off.${family}`) }).closest('.sc-radio-button'),
    );
    const inputFacades = Array.from(editor().querySelectorAll('.sc-text-input-facade'));
    expect(inputFacades).toHaveLength(3);
    for (const box of boxes) {
      const facade = box.closest('.sc-text-input-facade');
      if (facade) expect(inputFacades).toContain(facade);
      else expect(familyRoots).toContain(box.closest('.sc-radio-button'));
    }
  });
});

describe('OffScreen — on the phone shell (Task 28)', () => {
  beforeEach(() => markHeardWorld());

  // jsdom computes no layout, so "no horizontal overflow" is not checked here; the phone shell's DOM is: ScreenViewport marks
  // itself with data-shell, and Current, every preset, and a save with the longest legal name, is still in the picker.
  const renderOnPhone = () =>
    render(
      <main id="screen-viewport" data-shell="phone">
        <OffScreen />
      </main>,
    );

  it('renders the editor with Scan, and Current and all three presets in the picker', () => {
    renderOnPhone();
    expect(editorShows()).toEqual(liveIdentity());
    expect(editor().contains(scanButton())).toBe(true);
    openTransmissions();
    expect(radioNames()).toEqual([currentName(), presetLabel(0), presetLabel(1), presetLabel(2)]);
  });

  it('keeps a 128-character save name whole in its accessible name, drawn in the single-line label that ends in an ellipsis', () => {
    const longName = 'N'.repeat(128);
    saveNamedSession(longName, savedPayload('long'));
    renderOnPhone();
    openTransmissions();
    const radio = row(longName);
    const label = radio.querySelector('.sc-radio-button__label');
    expect(label?.textContent).toBe(savedLabel(longName)); // the name, then its world (Task 6b)
    expect(radio.getAttribute('aria-label')).toBe(savedLabel(longName));
    // A list row since revisions Task 4 (the flat face was the muted appearance's).
    expect(radio.classList.contains('sc-radio-button__list-item')).toBe(true);
  });

  it('names a long pick in the readout whole, so the wrapping readout can take a second line', () => {
    const longName = 'N'.repeat(128);
    const save = savedPayload('long');
    saveNamedSession(longName, save);
    renderOnPhone();
    openTransmissions();
    fireEvent.click(row(longName));
    expect(screen.getByTestId('off-screen-readout').textContent).toBe(describeWorld(save, longName));
  });
});
