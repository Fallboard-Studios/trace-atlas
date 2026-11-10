import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
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
 * then the saves (the presets that followed went at docs/tasks/OFF_SCREEN_CONSOLE.md's Checkpoint A). The readout names
 * the pick through the same helper.
 */
// The live world Save saves and the dirty test compares against (docs/tasks/OFF_SCREEN.md Task 14) — a marker
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
import { decodeWorldLink } from '@/utils/worldLink';
import { THEME_IDS } from '@/data/bands/themes';
import { STORAGE_KEY, listSessions, loadSession, saveNamedSession } from '@/utils/sessionStorageEngine';
import * as sessionStorageEngine from '@/utils/sessionStorageEngine';
import * as sessionShareUtils from '@/utils/sessionShareUtils';
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
/** Three worlds to pick besides Current, as saves: the presets were these (names and links) until they went at
 *  docs/tasks/OFF_SCREEN_CONSOLE.md's Checkpoint A, and the cases that picked a preset pick one of these. seedWorlds()
 *  stores them in order, oldest first, so the list shows them newest first. */
const WORLDS = [
  { name: 'Kryndara', link: '?seed=kr1nd4ra&x=12&y=68' },
  { name: 'Vessport Null', link: '?seed=qb9mezm3&x=-84&y=131' },
  { name: 'Halcyon Drift', link: '?seed=h4lcy0n&x=143&y=-57' },
];
const worldName = (i: number) => WORLDS[i].name;
const worldPayload = (i: number): SessionPayload => decodeWorldLink(WORLDS[i].link)!;
const seedWorlds = () => WORLDS.forEach((world, i) => saveNamedSession(world.name, worldPayload(i)));
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
/** A radio by what fronts its accessible name: the whole name (Current, a theme), a save's name with its
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
/** The action row under the list (console Task 7): Save, Rename and Delete, each named after the selected row ("Save
 *  Dusk Run"). The list must be open. */
const actionsRow = () => document.querySelector('.off-screen__actions') as HTMLElement;
const actionButton = (key: 'home.off.save' | 'home.off.rename' | 'home.off.delete' | 'home.off.share') =>
  within(actionsRow()).getByRole('button', { name: (name) => name.startsWith(`${human(key)} `) }) as HTMLButtonElement;
const saveButton = () => actionButton('home.off.save');
/** Which of the three are enabled, as offScreenActions' matrix reads them. */
const enabledActions = () => ({
  save: !actionButton('home.off.save').disabled,
  rename: !actionButton('home.off.rename').disabled,
  delete: !actionButton('home.off.delete').disabled,
});
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
/** A save's label: the name fronting the world (Task 6b). */
const savedLabel = (name: string) => describeWorld(loadSession(name)!, name);
const scanButton = () => screen.getByRole('button', { name: human('home.off.scan') });

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
const savedPayload = (style: string): SessionPayload => ({ ...worldPayload(0), attenuationStyleName: style });

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
  // Save and no eyebrow to light, so it builds none, even with a save loaded.
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

    // On the Transmissions header while the list was collapsible (console Task 2 to Checkpoint A).
    it('a power-off still lands the focus on the selected row (R25)', () => {
      markHeardWorld();
      setWorldState('paused');
      render(<OffScreen />);
      expect(document.activeElement).toBe(row(currentName()));
    });
  });

  it('runs on a returning visit too, over the chooser', () => {
    markHeardWorld();
    render(<OffScreen />);
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
    seedWorlds();
    render(<OffScreen />);
    fireEvent.click(row(worldName(1)));
    expect(row(worldName(1)).getAttribute('aria-checked')).toBe('true');
    // The real retransmitWorld writes the loading store first (band-table T25); once, so it outlives nothing.
    vi.mocked(retransmitWorld).mockImplementationOnce((input) => useLoadingStore.getState().setLoading({ theme: input.theme!, aspects: {} }));
    fireEvent.click(themeRadio('anchor'));
    expect(row(worldName(1)).getAttribute('aria-checked')).toBe('true');
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
    fireEvent.click(themeRadio('float'));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
    expect(currentRowName()).toBe(currentName('Dusk Run'));
  });

  it('recomputes dirty after a theme pick: Save lights and Current reads unsaved once the world differs from its save', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(saveButton().disabled).toBe(true);
    expect(currentEyebrow()).toBe(human('home.off.current'));
    live.payload = live.marker('themed'); // what the retransmit does to the live world
    fireEvent.click(themeRadio('float'));
    expect(saveButton().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
  });

  it('follows the loading store for the loaded world: the row, the Current row and the readout take the store theme', () => {
    render(<OffScreen />);
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
    fireEvent.click(row('Dusk Run'));
    expect(readout().textContent).toBe(describeWorld(save, 'Dusk Run'));
    expect(readout().textContent).toContain(human('home.off.melody.hypnotic') + ' + ' + human('home.off.melody.wandering'));
  });

  it('a save pick sets the row from its payload: these worlds (decoded links) carry no theme, so Classic', () => {
    seedWorlds();
    saveNamedSession('Dusk Run', calmSave());
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
    expect(checked('float')).toBe('true');
    fireEvent.click(row(worldName(0)));
    expect(checked('classic')).toBe('true');
    expect(checked('float')).toBe('false');
  });

  it('a theme the app does not know in a save reads as Classic, as loadingOf reads it', () => {
    saveNamedSession('Dusk Run', { ...savedPayload('dusk'), theme: 'frantic' } as unknown as SessionPayload);
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
    expect(checked('classic')).toBe('true');
  });

  it('shows the shown theme sentence under the row: Classic for a Classic world, the save theme after a save pick, then the live store theme', () => {
    saveNamedSession('Dusk Run', calmSave());
    render(<OffScreen />);
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

  it('lays the two axes in one container, Transmission (with Scan and the action row) first and Loading second, the readout after both', () => {
    const { container } = render(<OffScreen />);
    const axes = container.querySelector('.off-screen__axes')!;
    const columns = Array.from(axes.children) as HTMLElement[];
    expect(columns).toHaveLength(2);
    expect(columns.every((c) => c.classList.contains('off-screen__axis'))).toBe(true);
    expect(within(columns[0]).getByRole('group', { name: human('home.off.transmission') })).toBeTruthy();
    expect(within(columns[0]).getByRole('button', { name: human('home.off.scan') })).toBeTruthy();
    expect(columns[0].contains(saveButton())).toBe(true);
    expect(within(columns[1]).getByRole('group', { name: human('home.off.loading') })).toBeTruthy();
    expect(within(columns[1]).getByText(human('home.off.themeDescription.classic'))).toBeTruthy();
    // The readout stands alone again: Share moved into the action row at Checkpoint A.
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
    seedWorlds();
    retransmitSetsStore();
    render(<OffScreen />);
    fireEvent.click(row(worldName(1)));
    expect(row(worldName(1)).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(option(NAME.hypnotic));
    expect(row(worldName(1)).getAttribute('aria-checked')).toBe('true');
    expect(currentRadio().getAttribute('aria-checked')).toBe('false');
    expect(pressed(NAME.hypnotic)).toBe('true');
  });

  it('a change reads dirty again and keeps the loaded save attached: Save lights, Current reads unsaved', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(saveButton().disabled).toBe(true);
    live.payload = live.marker('dealt');
    fireEvent.click(option(NAME.mechanical));
    expect(saveButton().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
  });

  it('a save with a set selects it: the picks pressed, the rest not, and the readout tails them', () => {
    const save: SessionPayload = { ...savedPayload('dusk'), aspects: { melody: ['mechanical', 'wandering'] } };
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
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
    fireEvent.click(row('Dusk Run'));
    expect(melodyNames().filter((n) => pressed(n!) === 'true')).toEqual([NAME.wandering]);
    expect(readout().textContent!.endsWith(' · ' + NAME.wandering)).toBe(true);
    expect(melodyDescription()?.textContent).toBe(sentence('wandering'));
  });

  it('a save with a pick the app does not know keeps the known ones, as loadingOf reads it', () => {
    saveNamedSession('Dusk Run', { ...savedPayload('dusk'), aspects: { melody: ['frantic', 'mechanical'] } } as unknown as SessionPayload);
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
    expect(melodyNames().filter((n) => pressed(n!) === 'true')).toEqual([NAME.mechanical]);
  });

  it('follows the loading store for Current: the row and the readout tail take the store picks', () => {
    render(<OffScreen />);
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

  // Current's eyebrow follows Current (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6): the toggle edits
  // the other save's world, not Current, which is still its save. Save acts on that save since console Task 7, and the
  // toggle made it differ, so it is lit.
  it('a family change keeps the picked world row selected; Current reads plain, as it is still kept', () => {
    seedWorlds();
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    fireEvent.click(row(worldName(1)));
    live.payload = live.marker('dealt');
    fireEvent.click(option('envelope', name('envelope', 'held')));
    expect(row(worldName(1)).getAttribute('aria-checked')).toBe('true');
    expect(currentRadio().getAttribute('aria-checked')).toBe('false');
    expect(currentEyebrow()).toBe(human('home.off.current'));
    expect(saveButton().disabled).toBe(false);
  });

  it('a save with Distance halfHeard selects Half-heard, and the readout tail joins the families in family order', () => {
    const save: SessionPayload = {
      ...savedPayload('dusk'),
      aspects: { melody: ['hypnotic'], envelope: ['plucked', 'held'], distance: ['halfHeard'] },
    };
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
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
    fireEvent.click(row('Calm Run'));
    fireEvent.click(screen.getByRole('button', { name: human('home.off.melody.wandering') }));
    expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { melody: ['hypnotic', 'wandering'] } });
    expect(row('Calm Run').getAttribute('aria-checked')).toBe('true');
    expect(currentRadio().getAttribute('aria-checked')).toBe('false');
    expect(pressed('home.off.melody.hypnotic')).toBe('true');
    expect(pressed('home.off.melody.wandering')).toBe('true');
  });

  it('two clicks on a landed save keep its row: a theme, then a toggle on top of it', () => {
    seedWorlds();
    render(<OffScreen />);
    fireEvent.click(row(worldName(2)));
    fireEvent.click(row(theme('shatter')));
    fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
    expect(retransmitWorld).toHaveBeenLastCalledWith({ aspects: { ...loadingOf(worldPayload(2)).aspects, envelope: ['held'] } });
    expect(row(worldName(2)).getAttribute('aria-checked')).toBe('true');
    expect(checked(theme('shatter'))).toBe('true');
    expect(pressed('home.off.envelope.held')).toBe('true');
  });

  it('after a pick lands, the Loading rows follow the live loading store, not the pick stored identity', () => {
    saveNamedSession('Calm Run', calmRun());
    render(<OffScreen />);
    fireEvent.click(row('Calm Run'));
    act(() => useLoadingStore.getState().setLoading({ theme: 'undertow', aspects: { voice: ['woody'] } }));
    expect(checked(theme('undertow'))).toBe('true');
    expect(pressed('home.off.voice.woody')).toBe('true');
    expect(pressed('home.off.melody.hypnotic')).toBe('false');
  });

  it('a theme click on Current keeps Current selected, as it always has', () => {
    render(<OffScreen />);
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
    fireEvent.click(row('Dusk Run'));
    expect(checked('Dusk Run')).toBe('true');
    expect(labelOf('Dusk Run')).toBe(describeWorld(dusk(), 'Dusk Run'));
    expect(readout().textContent).toBe(describeWorld({ ...dusk(), ...loadingOf(dusk()) }, 'Dusk Run'));
  });

  it('a save lands, then Calm: the row reads "<save> · <world> · Calm", and the readout names the save under Calm', () => {
    saveNamedSession('Dusk Run', dusk());
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
    fireEvent.click(row(theme('float')));
    expect(checked('Dusk Run')).toBe('true');
    expect(labelOf('Dusk Run')).toBe(`${head(dusk(), 'Dusk Run')} · ${theme('float')}`);
    expect(readout().textContent).toBe(describeWorld({ ...dusk(), ...loadingOf(dusk()), theme: 'float' }, 'Dusk Run'));
  });

  it('a Calm save, then Classic: the row names Classic in place of Calm, as it differs from the save own theme', () => {
    saveNamedSession('Calm Run', calmRun());
    render(<OffScreen />);
    fireEvent.click(row('Calm Run'));
    expect(labelOf('Calm Run')).toBe(describeWorld(calmRun(), 'Calm Run')); // as stored, Calm in it
    fireEvent.click(row(theme('classic')));
    expect(checked('Calm Run')).toBe('true');
    expect(labelOf('Calm Run')).toBe(`${head(calmRun(), 'Calm Run')} · ${theme('classic')}`);
  });

  it('a toggle on a Calm save names the save own theme and the aspect; toggled back, it reads as stored', () => {
    saveNamedSession('Calm Run', calmRun());
    render(<OffScreen />);
    fireEvent.click(row('Calm Run'));
    const hypnotic = () => screen.getByRole('button', { name: human('home.off.melody.hypnotic') });
    fireEvent.click(hypnotic());
    expect(labelOf('Calm Run')).toBe(`${head(calmRun(), 'Calm Run')} · ${theme('float')} · ${human('home.off.melody.hypnotic')}`);
    fireEvent.click(hypnotic());
    expect(labelOf('Calm Run')).toBe(describeWorld(calmRun(), 'Calm Run'));
  });

  it('a second save carries the live loading as the first does', () => {
    seedWorlds();
    const preset = worldPayload(1);
    render(<OffScreen />);
    fireEvent.click(row(worldName(1)));
    fireEvent.click(row(theme('anchor')));
    expect(checked(worldName(1))).toBe('true');
    expect(labelOf(worldName(1))).toBe(`${head(preset, worldName(1))} · ${theme('anchor')}`);
  });

  it('leaving an edited save and picking it again: it reads as stored, and the save reloads as stored', () => {
    seedWorlds();
    saveNamedSession('Dusk Run', dusk());
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
    fireEvent.click(row(theme('float')));
    fireEvent.click(row(worldName(0)));
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
    const current = row(currentName());
    expect(currentRowName()).toBe(currentName());
    // No save matches the world here, so the eyebrow says so (console Task 6).
    expect(within(current).getByText(human('home.off.unsavedEyebrow'))).toBeTruthy();
  });

  it("is named after the loaded save when one is loaded: '<save> · AS (x, y)'", () => {
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(currentRowName()).toBe(currentName('Dusk Run'));
    expect(currentLabel('Dusk Run').startsWith('Dusk Run · ')).toBe(true);
  });

  // With no snapshot (nothing picked yet), Current is the live world (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md
  // §1.3).
  it('with nothing picked, follows the loaded world: a change of Attenuation Style renames the row and the readout', () => {
    render(<OffScreen />);
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

  // docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.1: with no wash mounted the pick lands at the click, so
  // picking Current after it restores the world left (it used to apply nothing, Current being the picked world).
  it('picking Current after a landed pick restores the world left, named as before the pick', () => {
    seedWorlds();
    const prePick = structuredClone(live.payload);
    render(<OffScreen />);
    fireEvent.click(row(worldName(0)));
    fireEvent.click(row(currentName()));
    expect(applySessionPayload).toHaveBeenCalledTimes(2);
    expect(vi.mocked(applySessionPayload).mock.lastCall?.[0]).toEqual(prePick);
    expect(row(currentName()).getAttribute('aria-checked')).toBe('true');
    expect(row(worldName(0)).getAttribute('aria-checked')).toBe('false');
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

  it('on open the editor shows the live world, no row is New Transmission, Current is checked', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    expect(editorShows()).toEqual(liveIdentity());
    expect(editorSelected()).toBe(false);
    expect(readout().textContent).toBe(currentLabel());
    expect(radioNames()).toEqual([currentName(), savedLabel('Dusk Run')]);
    expect(currentRadio().getAttribute('aria-checked')).toBe('true');
  });

  it('draws nothing on mount: the seed helpers wait for Scan', () => {
    render(<OffScreen />);
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
    seedWorlds();
    render(<OffScreen />);
    fireEvent.click(scanButton());
    fireEvent.click(row(worldName(1)));
    expect(editorSelected()).toBe(false);
    expect(checked(worldName(1))).toBe('true');
  });

  it('a theme click with the editor selected keeps it selected, and the readout names the drawn world under the theme', () => {
    vi.mocked(retransmitWorld).mockImplementation(landsInStores);
    render(<OffScreen />);
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
      seedWorlds();
      vi.mocked(applySessionPayload).mockImplementation((payload) =>
        landsInStores({ attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates, ...loadingOf(payload) }),
      );
      render(<OffScreen />);
      const left = liveIdentity();
      fireEvent.click(row(worldName(0)));
      await act(async () => useUIStore.getState().setSceneWash('covered'));
      act(() => useUIStore.getState().setSceneWash('clear'));
      const { attenuationStyleName, coordinates } = worldPayload(0);
      expect(editorShows()).toEqual({ attenuationStyleName, coordinates });
      fireEvent.click(currentRadio());
      expect(liveIdentity()).toEqual({ attenuationStyleName, coordinates });
      expect(editorShows()).toEqual(left);
    });

    it('a save picked while the Scan waits replaces it in the editor too: it shows the save’s world', () => {
      seedWorlds();
      render(<OffScreen />);
      fireEvent.click(scanButton());
      fireEvent.click(row(worldName(0)));
      const { attenuationStyleName, coordinates } = worldPayload(0);
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

  // Found at the "editor" checkpoint: a coordinate field may be emptied, and a commit draws the blank axis.
  it('a blank X commits a drawn X with the typed Y, and the editor shows the world that landed', () => {
    const draw = vi.spyOn(seedUtils, 'randomCoordinate').mockReturnValue(88);
    vi.mocked(retransmitWorld).mockImplementation(landsInStores);
    render(<OffScreen />);
    const { attenuationStyleName } = liveIdentity();
    const [x, y] = within(editor()).getAllByRole('spinbutton');
    fireEvent.change(x, { target: { value: '' } });
    fireEvent.change(y, { target: { value: '-3' } });
    fireEvent.keyDown(y, { key: 'Enter' });
    expect(retransmitWorld).toHaveBeenCalledWith({ attenuationStyleName, coordinates: { x: 88, y: -3 }, theme: 'classic', aspects: {} });
    expect(draw).toHaveBeenCalledTimes(1);
    expect(editorShows()).toEqual({ attenuationStyleName, coordinates: { x: 88, y: -3 } });
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
      fireEvent.click(row('Dusk Run'));
      const dusk = seedAndPlot(loadSession('Dusk Run')!);
      expect(editorShows()).toEqual(dusk);
      typeName('typed-over');
      enter();
      expect(editorSelected()).toBe(true);
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

  it('Current’s eyebrow reads unsaved while no save matches it, and plain Current after a Save', () => {
    render(<OffScreen />);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    fireEvent.click(saveButton());
    expect(currentEyebrow()).toBe(human('home.off.current'));
  });

  it('a loaded save that matches the world reads plain Current from the start', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
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

  describe('a refused Save', () => {
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
      fireEvent.click(saveButton());
      expect(within(statusSlot()).getByRole('alert').textContent).toBe(saveFailedLine('Dusk Run'));
    });

    // Save acts on the selected row since console Task 7: on a save, it names that save, which it tried to overwrite.
    // It used to name Current's snapshot's save, which Keep saved from any row.
    it('names the selected save when Save tried to overwrite it', () => {
      saveNamedSession('Old Run', live.marker('older'));
      refuseStorage();
      render(<OffScreen />);
      fireEvent.click(row('Old Run'));
      fireEvent.click(saveButton());
      expect(within(statusSlot()).getByRole('alert').textContent).toBe(saveFailedLine('Old Run'));
    });

    it('a later Save that succeeds empties the slot', () => {
      refuseStorage();
      render(<OffScreen />);
      fireEvent.click(saveButton());
      expect(statusSlot().textContent).not.toBe('');
      setItem!.mockRestore();
      fireEvent.click(saveButton());
      expect(statusSlot().textContent).toBe('');
      expect(currentEyebrow()).toBe(human('home.off.current'));
    });
  });
});

describe('OffScreen — Save on Current (spec assumption 14; Keep until console Task 7)', () => {
  beforeEach(() => markHeardWorld());

  it('is lit, Current reading unsaved, when the loaded world is not kept (no save loaded)', () => {
    const { container } = render(<OffScreen />);
    expect(saveButton().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    expect(container.querySelector('.sc-button--muted')).not.toBeNull(); // flat, like Scan: nothing pops
  });

  it('is dim, Current reading plain, when the loaded save equals the live world', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(saveButton().disabled).toBe(true);
    expect(currentEyebrow()).toBe(human('home.off.current'));
  });

  it('is lit when the loaded save differs from the live world', () => {
    saveNamedSession('Dusk Run', live.marker('older'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(saveButton().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R20: a Save the storage refuses (a full quota) is a line under the
  // chooser, not a throw into the click; the screen stays up and Save stays lit, to try again. The line is the status
  // slot's since console Task 6, naming the save it tried, and Current's eyebrow still says unsaved.
  describe('a Save the storage refuses (review R20)', () => {
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

    it('shows the failure line in the slot, naming the save it tried, logs the error, and leaves the screen up with Save lit', () => {
      render(<OffScreen />);
      expect(failed()).toBeNull();
      fireEvent.click(saveButton());
      expect(failed()!.textContent).toBe(saveFailedLine('Quiet Harbour'));
      expect(statusSlot().textContent).toBe(saveFailedLine('Quiet Harbour'));
      expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
      expect(logged).toHaveBeenCalled();
      expect(saveButton().disabled).toBe(false);
      expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
      expect(row(currentName()).getAttribute('aria-checked')).toBe('true');
    });

    it('goes when a later Save succeeds', () => {
      render(<OffScreen />);
      fireEvent.click(saveButton());
      expect(failed()).not.toBeNull();
      setItem.mockRestore();
      fireEvent.click(saveButton());
      expect(failed()).toBeNull();
      expect(useSessionStore.getState().currentLoadedSessionName).toBe('Quiet Harbour');
    });

    it('goes when the world changes, since the world it names is no longer shown: a family toggle', () => {
      render(<OffScreen />);
      fireEvent.click(saveButton());
      expect(failed()).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
      expect(failed()).toBeNull();
      expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    });

    // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F14: the second review's surviving mutant, onThemeChange's setKeepFailed(false).
    it('goes when the world changes: a theme pick, applied at the click', () => {
      render(<OffScreen />);
      fireEvent.click(saveButton());
      expect(failed()).not.toBeNull();
      fireEvent.click(row(human('home.off.theme.float')));
      expect(failed()).toBeNull();
      expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    });

    // A preset pick until the presets went (Checkpoint A); the storage refuses every write here, so no save can be
    // seeded to pick, and a Scan is the world change.
    it('goes when the world changes: a Scan, realised at once with no wash mounted', () => {
      render(<OffScreen />);
      fireEvent.click(saveButton());
      expect(failed()).not.toBeNull();
      fireEvent.click(scanButton());
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(failed()).toBeNull();
    });
  });

  it('clicking Save saves under the suggested name, lists the new row at once, names Current after it, and dims', () => {
    render(<OffScreen />);
    fireEvent.click(saveButton());
    expect(listSessions().map((s) => s.name)).toEqual(['Quiet Harbour']);
    expect(row('Quiet Harbour')).toBeTruthy();
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Quiet Harbour');
    expect(currentRowName()).toBe(currentName('Quiet Harbour'));
    expect(row(currentName('Quiet Harbour')).getAttribute('aria-checked')).toBe('true');
    expect(saveButton().disabled).toBe(true);
    expect(currentEyebrow()).toBe(human('home.off.current'));
  });

  it('keeps under the loaded name, overwriting that row rather than adding one', () => {
    saveNamedSession('Dusk Run', live.marker('older'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    fireEvent.click(saveButton());
    expect(listSessions().map((s) => s.name)).toEqual(['Dusk Run']);
    expect(radioNames().filter((n) => n === savedLabel('Dusk Run'))).toHaveLength(1);
    expect(saveButton().disabled).toBe(true);
  });

  // What re-lights Save on Current is a change to Current itself, an in-place theme pick, and saving then overwrites
  // Current's own row.
  it('re-lights after a change to Current itself, and dims again after saving — overwriting the row it saved', () => {
    vi.mocked(retransmitWorld).mockImplementationOnce(() => {
      live.payload = live.marker('themed');
    });
    render(<OffScreen />);
    fireEvent.click(saveButton());
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(row(human('home.off.theme.float')));
    expect(saveButton().disabled).toBe(false);
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    fireEvent.click(saveButton());
    expect(saveButton().disabled).toBe(true);
    expect(listSessions().map((s) => s.name)).toEqual(['Quiet Harbour']);
    expect(loadSession('Quiet Harbour')).toEqual(live.marker('themed'));
  });

  it('recomputes dirty after a pick, not on every render', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    saveNamedSession('Other', live.marker('other'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(saveButton().disabled).toBe(true);
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
    // A pick does: it takes Current's snapshot, and reads both dirty flags again. Current's eyebrow follows Current, still
    // Dusk Run as saved; Save follows the row, Other, which the live world (this double applies nothing) differs from.
    fireEvent.click(row('Other'));
    expect(vi.mocked(buildSessionPayload).mock.calls.length).toBeGreaterThan(onMount);
    expect(currentEyebrow()).toBe(human('home.off.current'));
    expect(saveButton().disabled).toBe(false);
  });

  // A world that is no longer a save must not keep the save's name, or a Save from the Sessions panel would overwrite the
  // save with a different world. Current keeps the name of the world left (docs/specs/
  // OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.3); it used to be renamed by its identity alone once the save was
  // detached. Current's eyebrow follows Current, still Dusk Run as saved; Save acts on New Transmission since console Task 7, so
  // it is lit, and nothing is written until it is clicked.
  // A preset pick detached the save too, until the presets went (Checkpoint A); another save's pick loads that save.
  it('a Scan clears the loaded save name; Current keeps the name of the world left and reads plain', () => {
    seedWorlds();
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(currentRowName()).toBe(currentName('Dusk Run'));

    fireEvent.click(row(worldName(0)));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe(worldName(0));
    expect(currentRowName()).toBe(currentName('Dusk Run'));

    fireEvent.click(row('Dusk Run'));
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
    expect(useSessionStore.getState().currentSessionName).toBe('Dusk Run'); // the save pick names the session, as a Load does
    fireEvent.click(scanButton());
    expect(useSessionStore.getState().currentLoadedSessionName).toBeNull();
    // The name input no longer names the save, so a Save from the Sessions panel writes a new row.
    expect(useSessionStore.getState().currentSessionName).not.toBe('Dusk Run');
    expect(currentRowName()).toBe(currentName('Dusk Run'));
    expect(currentEyebrow()).toBe(human('home.off.current'));
    expect(saveButton().disabled).toBe(false);
    expect(listSessions().map((s) => s.name).sort()).toEqual(['Dusk Run', ...WORLDS.map((w) => w.name)].sort());
  });

  it('never starts the AudioEngine', () => {
    render(<OffScreen />);
    fireEvent.click(saveButton());
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });
});

// docs/tasks/OFF_SCREEN_CONSOLE.md Task 7 (spec §1.5, §5 cases 7 and 8): Save, Rename and Delete replace Keep, each
// acting on the selected row, dimmed in place where inert (offScreenActions.ts). Save on Current saves the live world,
// as Keep did; on a save it overwrites that save with the live world; on New Transmission it writes the
// live world under a fresh name and the selection moves to the new row. Current's eyebrow still reads Current's own
// dirty read, while Save reads the selected row's. Keep used to save Current's snapshot from any row (docs/tasks/
// OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6); those cases are rewritten here. No wash is mounted unless a case
// attaches one, so a pick lands at the click.
describe('OffScreen — the action row (console Task 7)', () => {
  beforeEach(() => markHeardWorld());
  afterEach(() => vi.mocked(retransmitWorld).mockReset());
  const failed = () => within(statusSlot()).queryByRole('alert');
  const session = () => useSessionStore.getState();
  const NONE = { save: false, rename: false, delete: false };
  const SAVE_ONLY = { save: true, rename: false, delete: false };
  /** A pick lands as itself: what buildSessionPayload builds from then on is the applied payload, as in the app. */
  const landsAsItself = () =>
    vi.mocked(applySessionPayload).mockImplementation((payload) => {
      useLoadingStore.getState().setLoading(loadingOf(payload));
      live.payload = structuredClone(payload);
    });
  /** An in-place theme pick moves the live world's theme, and the loading store's, as the real retransmit does. */
  const themeMovesLive = () =>
    vi.mocked(retransmitWorld).mockImplementation((input) => {
      if (input.theme) live.payload = { ...live.payload, theme: input.theme };
      landsInStores(input);
    });
  const asStored = (payload: SessionPayload) => JSON.parse(JSON.stringify(payload)) as SessionPayload;
  const named = (key: 'home.off.save' | 'home.off.rename' | 'home.off.delete', name: string) =>
    actionButton(key).getAttribute('aria-label') === fill(key, { name });

  it('the three are muted, flat like the list', () => {
    render(<OffScreen />);
    expect(within(actionsRow()).getAllByRole('button').every((b) => b.classList.contains('sc-button--muted'))).toBe(true);
  });

  describe('the dim matrix (spec §5 case 7)', () => {
    it('a clean Current: all three dimmed, each named after Current', () => {
      saveNamedSession('Dusk Run', structuredClone(live.payload));
      useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
      render(<OffScreen />);
      expect(enabledActions()).toEqual(NONE);
      const current = human('home.off.current');
      expect([named('home.off.save', current), named('home.off.rename', current), named('home.off.delete', current)]).toEqual([
        true,
        true,
        true,
      ]);
    });

    it('an unsaved Current: Save alone', () => {
      render(<OffScreen />);
      expect(enabledActions()).toEqual(SAVE_ONLY);
    });

    it('a save: Rename and Delete, named after it, and Save once the live world differs from it', () => {
      saveNamedSession('Dusk Run', savedPayload('dusk'));
      landsAsItself();
      themeMovesLive();
      render(<OffScreen />);
      fireEvent.click(row('Dusk Run'));
      expect(enabledActions()).toEqual({ save: false, rename: true, delete: true });
      expect([named('home.off.save', 'Dusk Run'), named('home.off.rename', 'Dusk Run'), named('home.off.delete', 'Dusk Run')]).toEqual([
        true,
        true,
        true,
      ]);
      fireEvent.click(row(human('home.off.theme.anchor')));
      expect(enabledActions()).toEqual({ save: true, rename: true, delete: true });
    });

    it('New Transmission (a Scan): Save alone, always, named after New Transmission', () => {
      render(<OffScreen />);
      fireEvent.click(scanButton());
      expect(enabledActions()).toEqual(SAVE_ONLY);
      expect(named('home.off.save', newTransmission())).toBe(true);
    });

    describe('while a change waits under the wash', () => {
      let detach: () => void;
      beforeEach(() => {
        useUIStore.setState({ sceneWash: 'clear' });
        detach = attachSceneWash();
      });
      afterEach(() => detach());
      const land = () =>
        act(async () => {
          useUIStore.getState().setSceneWash('covered');
        });

      it('all three are dimmed, whatever the row, and follow the row once it lands', async () => {
        saveNamedSession('Dusk Run', savedPayload('dusk'));
        landsAsItself();
        render(<OffScreen />);
        expect(enabledActions()).toEqual(SAVE_ONLY); // precondition: the unsaved Current lights Save
        fireEvent.click(row('Dusk Run'));
        expect(enabledActions()).toEqual(NONE);
        await land();
        expect(enabledActions()).toEqual({ save: false, rename: true, delete: true });
        fireEvent.click(scanButton());
        expect(enabledActions()).toEqual(NONE);
      });
    });
  });

  describe('Save (spec §5 case 8)', () => {
    it('an edited save: overwritten with the live world, no new row, the row checked under its name with no tail, and Save dims', () => {
      saveNamedSession('Dusk Run', { ...savedPayload('dusk'), theme: 'float' });
      landsAsItself();
      themeMovesLive();
      render(<OffScreen />);
      fireEvent.click(row('Dusk Run'));
      fireEvent.click(row(human('home.off.theme.classic')));
      const editedLabel = radioNames()[1];
      expect(editedLabel).not.toBe(savedLabel('Dusk Run')); // the row names the live loading in place of its own
      fireEvent.click(saveButton());
      expect(listSessions().map((s) => s.name)).toEqual(['Dusk Run']);
      expect(loadSession('Dusk Run')).toEqual(asStored(live.payload));
      expect(loadSession('Dusk Run')!.theme).toBe('classic');
      expect(row('Dusk Run').getAttribute('aria-checked')).toBe('true');
      expect(radioNames()[1]).toBe(savedLabel('Dusk Run'));
      expect(session().currentLoadedSessionName).toBe('Dusk Run');
      expect(enabledActions()).toEqual({ save: false, rename: true, delete: true });
      // Current is the world left, never saved: its eyebrow is its own, untouched by a Save on another row.
      expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    });

    it('New Transmission: the typed world, not Current’s snapshot, and the selection moves off the editor to the new row', () => {
      vi.mocked(retransmitWorld).mockImplementation((input) => {
        if (input.attenuationStyleName !== undefined) live.payload = live.marker('scanned');
        landsInStores(input);
      });
      render(<OffScreen />);
      fireEvent.click(scanButton());
      expect(editorSelected()).toBe(true);
      fireEvent.click(saveButton());
      expect(listSessions()).toHaveLength(1);
      const added = listSessions()[0].name;
      expect(loadSession(added)).toEqual(live.marker('scanned'));
      expect(editorSelected()).toBe(false);
      expect(row(added).getAttribute('aria-checked')).toBe('true');
      expect(session().currentLoadedSessionName).toBe(added);
    });

    // On a preset until the presets went (Checkpoint A): New Transmission is the other row a Save writes a fresh name from.
    it('a Save the storage refuses on New Transmission: the failure line names the name it tried; no row, the editor still selected', () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<OffScreen />);
      fireEvent.click(scanButton());
      const tried = session().currentSessionName;
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      fireEvent.click(saveButton());
      setItem.mockRestore();
      logged.mockRestore();
      expect(failed()!.textContent).toBe(saveFailedLine(tried));
      expect(listSessions()).toHaveLength(0);
      expect(editorSelected()).toBe(true);
      expect(enabledActions()).toEqual(SAVE_ONLY);
    });

    it('Current saved, then left, then restored: the restore attaches the saved name, and Save dims', () => {
      seedWorlds();
      landsAsItself();
      render(<OffScreen />);
      fireEvent.click(saveButton());
      const kept = session().currentLoadedSessionName!;
      fireEvent.click(row(worldName(0)));
      expect(currentRowName()).toBe(currentName(kept));
      fireEvent.click(currentRadio());
      expect(session()).toMatchObject({ currentLoadedSessionName: kept, currentSessionName: kept });
      expect(currentRadio().getAttribute('aria-checked')).toBe('true');
      expect(enabledActions()).toEqual(NONE);
    });
  });

  // Current's eyebrow reads Current (its snapshot once left); Save reads the selected row. The two differ once Current
  // is left.
  describe('the eyebrow and Save read different worlds', () => {
    it('a clean Current, then an edited save: Current reads plain, Save on the save lights', () => {
      saveNamedSession('Dusk Run', structuredClone(live.payload));
      saveNamedSession('Other', savedPayload('other'));
      useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run', currentSessionName: 'Dusk Run' });
      landsAsItself();
      themeMovesLive();
      render(<OffScreen />);
      fireEvent.click(row('Other'));
      expect(enabledActions().save).toBe(false);
      fireEvent.click(row(human('home.off.theme.anchor')));
      expect(enabledActions().save).toBe(true);
      expect(currentEyebrow()).toBe(human('home.off.current'));
    });

    it('an unsaved Current, then a clean save: Current reads unsaved, Save on the save is dim', () => {
      saveNamedSession('Dusk Run', savedPayload('dusk'));
      landsAsItself();
      render(<OffScreen />);
      fireEvent.click(row('Dusk Run'));
      expect(enabledActions().save).toBe(false);
      expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    });

    it('a saved Current, then a Scan: Current stays saved and named after its save, Save on New Transmission lights, nothing written', () => {
      render(<OffScreen />);
      fireEvent.click(saveButton());
      const kept = listSessions()[0].name;
      fireEvent.click(scanButton());
      expect(currentEyebrow()).toBe(human('home.off.current'));
      expect(currentRowName()).toBe(currentName(kept));
      expect(enabledActions()).toEqual(SAVE_ONLY);
      expect(listSessions()).toHaveLength(1);
    });
  });
});

// docs/tasks/OFF_SCREEN_CONSOLE.md Task 8 (spec §1.5, assumption 3, §5 case 9): Rename turns the selected save's
// trailing slot into an input, prefilled, focused and selected. Enter or a blur out of it commits through
// renameNamedSession; Escape, a blank or an unchanged name revert with no engine call; a name another save has is
// refused, the slot saying so. The loaded name and Current's snapshot name follow, and the row stays selected under its
// new name.
describe('OffScreen — Rename (console Task 8)', () => {
  beforeEach(() => {
    markHeardWorld();
    // A pick lands as itself, so a landed save reads clean, as in the app.
    vi.mocked(applySessionPayload).mockImplementation((payload) => {
      useLoadingStore.getState().setLoading(loadingOf(payload));
      live.payload = structuredClone(payload);
    });
  });
  const session = () => useSessionStore.getState();
  const renameInput = () => screen.queryByRole('textbox', { name: human('home.off.rename') }) as HTMLInputElement | null;
  const startRename = () => fireEvent.click(actionButton('home.off.rename'));
  const typeName = (name: string) => fireEvent.change(renameInput()!, { target: { value: name } });
  const enter = () => fireEvent.keyDown(renameInput()!, { key: 'Enter' });
  const refusal = () => within(statusSlot()).queryByRole('alert');
  /** Dusk Run saved and picked, landed: the row Rename acts on. */
  const pickDuskRun = () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
  };

  // Crawford, Checkpoint A: the input sits in the row bare, with no cabinet box of its own.
  it('the input draws no cabinet box: a bare field in the row', () => {
    pickDuskRun();
    startRename();
    const field = renameInput()!.closest('.off-screen__rename')!;
    expect(field.querySelector('.sc-cabinet-box')).toBeNull();
    expect(field.querySelector('.sc-text-input-facade')).toBeNull();
  });

  it('turns the selected save’s trailing slot into an input, prefilled, focused and selected, the radio still checked', () => {
    pickDuskRun();
    expect(renameInput()).toBeNull();
    startRename();
    const input = renameInput()!;
    expect(input.value).toBe('Dusk Run');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Dusk Run'.length]);
    // In the save's own row, beside its radio (RadioButton's trailing slot, outside the radio: review R8).
    const slots = document.querySelectorAll('.sc-radio-button__trailing');
    expect(slots).toHaveLength(1);
    expect(slots[0].contains(input)).toBe(true);
    expect((slots[0] as HTMLElement).style.gridRow).toBe((row('Dusk Run').closest('.sc-radio-button__row') as HTMLElement).style.gridRow);
    expect(row('Dusk Run').contains(input)).toBe(false);
    expect(row('Dusk Run').getAttribute('aria-checked')).toBe('true');
  });

  it('Enter re-keys the save, its savedAt and payload kept; the row stays checked under the new name', () => {
    pickDuskRun();
    const before = listSessions()[0];
    startRename();
    typeName('Dawn Run');
    enter();
    expect(listSessions()).toEqual([{ ...before, name: 'Dawn Run' }]);
    expect(renameInput()).toBeNull();
    expect(row('Dawn Run').getAttribute('aria-checked')).toBe('true');
    expect(enabledActions()).toEqual({ save: false, rename: true, delete: true });
  });

  it('the loaded save’s name follows, the session name with it, so a later Save overwrites the renamed row', () => {
    pickDuskRun();
    expect(session().currentLoadedSessionName).toBe('Dusk Run');
    startRename();
    typeName('Dawn Run');
    enter();
    expect(session()).toMatchObject({ currentLoadedSessionName: 'Dawn Run', currentSessionName: 'Dawn Run' });
    fireEvent.click(row(human('home.off.theme.anchor')));
    fireEvent.click(saveButton());
    expect(listSessions().map((s) => s.name)).toEqual(['Dawn Run']);
  });

  it('the session names are left alone when the renamed save is not the loaded one', () => {
    pickDuskRun();
    act(() => useSessionStore.setState({ currentLoadedSessionName: 'Other', currentSessionName: 'Typed Since' }));
    startRename();
    typeName('Dawn Run');
    enter();
    expect(session()).toMatchObject({ currentLoadedSessionName: 'Other', currentSessionName: 'Typed Since' });
  });

  it('Current’s snapshot follows: Current, left from the save, is named after the new name, and a restore attaches it', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run', currentSessionName: 'Dusk Run' });
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
    startRename();
    typeName('Dawn Run');
    enter();
    expect(currentRowName()).toBe(currentName('Dawn Run'));
    expect(currentEyebrow()).toBe(human('home.off.current'));
    fireEvent.click(currentRadio());
    expect(session()).toMatchObject({ currentLoadedSessionName: 'Dawn Run', currentSessionName: 'Dawn Run' });
  });

  it('a blur out of the input commits, as Enter does', () => {
    pickDuskRun();
    startRename();
    typeName('Dawn Run');
    fireEvent.blur(renameInput()!, { relatedTarget: document.body });
    expect(listSessions().map((s) => s.name)).toEqual(['Dawn Run']);
    expect(renameInput()).toBeNull();
  });

  // A browser may blur the input as the commit removes it: that blur is no second commit, which would find the old name
  // gone and read as a refusal.
  it('Enter and a blur in the same tick commit once: no refusal', () => {
    pickDuskRun();
    startRename();
    typeName('Dawn Run');
    const input = renameInput()!;
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    });
    expect(listSessions().map((s) => s.name)).toEqual(['Dawn Run']);
    expect(refusal()).toBeNull();
  });

  it('a name is trimmed: the spaces round it are not part of the save’s name', () => {
    pickDuskRun();
    startRename();
    typeName('  Dawn Run  ');
    enter();
    expect(listSessions().map((s) => s.name)).toEqual(['Dawn Run']);
  });

  describe('reverting, with no engine call', () => {
    let rename: MockInstance<typeof sessionStorageEngine.renameNamedSession>;
    beforeEach(() => {
      rename = vi.spyOn(sessionStorageEngine, 'renameNamedSession');
    });
    afterEach(() => rename.mockRestore());
    const reverted = () => {
      expect(rename).not.toHaveBeenCalled();
      expect(renameInput()).toBeNull();
      expect(listSessions().map((s) => s.name)).toEqual(['Dusk Run']);
      expect(row('Dusk Run').getAttribute('aria-checked')).toBe('true');
    };

    it('Escape', () => {
      pickDuskRun();
      startRename();
      typeName('Dawn Run');
      fireEvent.keyDown(renameInput()!, { key: 'Escape' });
      reverted();
    });

    it('a blank name', () => {
      pickDuskRun();
      startRename();
      typeName('   ');
      enter();
      reverted();
    });

    it('an unchanged name, by Enter or by blur', () => {
      pickDuskRun();
      startRename();
      enter();
      reverted();
      startRename();
      fireEvent.blur(renameInput()!, { relatedTarget: null });
      reverted();
    });
  });

  it('a name another save has is refused: the input reverts and the slot says so, as an alert, until a Rename succeeds', () => {
    saveNamedSession('Low Tide', savedPayload('tide'));
    pickDuskRun();
    startRename();
    typeName('Low Tide');
    enter();
    expect(listSessions().map((s) => s.name).sort()).toEqual(['Dusk Run', 'Low Tide']);
    expect(loadSession('Low Tide')).toEqual(savedPayload('tide'));
    expect(renameInput()).toBeNull();
    expect(row('Dusk Run').getAttribute('aria-checked')).toBe('true');
    expect(refusal()!.textContent).toBe(human('home.off.renameTaken'));
    expect(session().currentLoadedSessionName).toBe('Dusk Run');
    startRename();
    typeName('Dawn Run');
    enter();
    expect(refusal()).toBeNull();
    expect(statusSlot().textContent).toBe('');
  });

  it('the refusal goes with a successful Save, or a world change', () => {
    saveNamedSession('Low Tide', savedPayload('tide'));
    pickDuskRun();
    startRename();
    typeName('Low Tide');
    enter();
    // The theme pick moves the live world, so Save on the save is lit afterwards.
    vi.mocked(retransmitWorld).mockImplementationOnce(() => {
      live.payload = live.marker('themed');
    });
    fireEvent.click(row(human('home.off.theme.anchor')));
    expect(refusal()).toBeNull();
    startRename();
    typeName('Low Tide');
    enter();
    expect(refusal()).not.toBeNull();
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    expect(refusal()).toBeNull();
  });
});

// docs/tasks/OFF_SCREEN_CONSOLE.md Task 9 (spec §1.5, assumption 2, §5 case 10): Delete removes the selected save once
// confirmed — a modal confirm since Checkpoint A (Crawford; it was at once, with none). The live world stands: no world
// change, no wash. The loaded save detaches and Current's snapshot forgets the name; the selection, matching no row,
// falls to New Transmission holding the live identity whole, so the editor reads as the deleted save's world, selected,
// and the readout names it with no tail.
describe('OffScreen — Delete (console Task 9)', () => {
  beforeEach(() => {
    markHeardWorld();
    // A pick lands as itself, so a landed save reads clean, as in the app.
    vi.mocked(applySessionPayload).mockImplementation((payload) => {
      useLoadingStore.getState().setLoading(loadingOf(payload));
      live.payload = structuredClone(payload);
    });
  });
  const session = () => useSessionStore.getState();
  const deleteButton = () => actionButton('home.off.delete');
  const dialog = () => screen.queryByRole('alertdialog');
  /** Delete, then the confirm's Delete. */
  const deleteSave = () => {
    fireEvent.click(deleteButton());
    fireEvent.click(within(dialog()!).getByRole('button', { name: human('home.off.delete') }));
  };
  /** Dusk Run, under Float, saved and picked, landed: the row Delete acts on. */
  const pickDuskRun = () => {
    saveNamedSession('Dusk Run', { ...savedPayload('dusk'), theme: 'float' });
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
  };
  /** Nothing deleted: the save stored and listed, still selected and loaded. */
  const untouched = () => {
    expect(listSessions().map((s) => s.name)).toEqual(['Dusk Run']);
    expect(row('Dusk Run').getAttribute('aria-checked')).toBe('true');
    expect(session().currentLoadedSessionName).toBe('Dusk Run');
  };

  describe('the confirm (Checkpoint A)', () => {
    afterEach(() => document.getElementById('screen-viewport')?.remove());
    const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

    it('Delete opens a modal confirm naming the save, and deletes nothing yet', () => {
      pickDuskRun();
      fireEvent.click(deleteButton());
      expect(dialog()).not.toBeNull();
      expect(dialog()!.textContent).toContain(fill('session.delete.confirmTitle', { session: 'Dusk Run' }));
      expect(dialog()!.textContent).toContain(human('session.delete.confirmBody'));
      // The modal hides the screen behind it from the accessibility tree, so the rows are read once it closes.
      expect(listSessions().map((s) => s.name)).toEqual(['Dusk Run']);
      expect(session().currentLoadedSessionName).toBe('Dusk Run');
    });

    it('Cancel closes it, deletes nothing, and gives the focus back to Delete', async () => {
      pickDuskRun();
      act(() => deleteButton().focus());
      fireEvent.click(deleteButton());
      await flush();
      fireEvent.click(within(dialog()!).getByRole('button', { name: human('ui.cancel') }));
      await flush();
      expect(dialog()).toBeNull();
      untouched();
      expect(document.activeElement).toBe(deleteButton());
    });

    it('Escape closes it and deletes nothing', async () => {
      pickDuskRun();
      fireEvent.click(deleteButton());
      await flush();
      fireEvent.keyDown(dialog()!, { key: 'Escape' });
      await flush();
      expect(dialog()).toBeNull();
      untouched();
    });

    // On the Transmissions header while there was one (until Checkpoint A dropped the toggle).
    it('confirmed, the dialog closes and the focus lands on Save beside it, Delete being dimmed now', async () => {
      pickDuskRun();
      act(() => deleteButton().focus());
      deleteSave();
      await flush();
      expect(dialog()).toBeNull();
      expect(deleteButton().disabled).toBe(true);
      expect(document.activeElement).toBe(saveButton());
    });

    it('portals into #screen-viewport when the screen exists', () => {
      const viewport = document.createElement('div');
      viewport.id = 'screen-viewport';
      document.body.appendChild(viewport);
      pickDuskRun();
      fireEvent.click(deleteButton());
      expect(viewport.contains(dialog())).toBe(true);
    });
  });

  it('confirmed, removes the save from storage and from the list', () => {
    pickDuskRun();
    deleteSave();
    expect(listSessions()).toEqual([]);
    expect(radioNames().some((name) => name.startsWith('Dusk Run'))).toBe(false);
  });

  it('falls to New Transmission holding the live world: the editor selected, no row checked, the readout with no tail', () => {
    pickDuskRun();
    deleteSave();
    expect(editorSelected()).toBe(true);
    expect(editorShows()).toEqual(liveIdentity());
    expect(within(picker()).getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    // The live loading is the save's own (Float), so it is the world's, not a tail on it.
    expect(readout().textContent).toBe(describeWorld({ ...liveIdentity(), theme: 'float', aspects: {} }));
    expect(enabledActions()).toEqual({ save: true, rename: false, delete: false });
    expect(actionButton('home.off.save').getAttribute('aria-label')).toBe(fill('home.off.save', { name: newTransmission() }));
  });

  it('is no world change: nothing requested, applied or retransmitted, and the Loading rows stay', () => {
    const request = vi.spyOn(worldChange, 'requestWorldChange');
    pickDuskRun();
    const applied = vi.mocked(applySessionPayload).mock.calls.length;
    request.mockClear();
    deleteSave();
    expect(request).not.toHaveBeenCalled();
    expect(applySessionPayload).toHaveBeenCalledTimes(applied);
    expect(retransmitWorld).not.toHaveBeenCalled();
    expect(useLoadingStore.getState().theme).toBe('float');
    request.mockRestore();
  });

  it('the loaded save detaches, the session name suggested afresh', () => {
    pickDuskRun();
    expect(session().currentLoadedSessionName).toBe('Dusk Run');
    deleteSave();
    expect(session().currentLoadedSessionName).toBeNull();
    expect(session().currentSessionName).not.toBe('Dusk Run');
  });

  it('a save that is not the loaded one leaves the loaded name alone', () => {
    pickDuskRun();
    act(() => useSessionStore.setState({ currentLoadedSessionName: 'Other', currentSessionName: 'Other' }));
    deleteSave();
    expect(session()).toMatchObject({ currentLoadedSessionName: 'Other', currentSessionName: 'Other' });
  });

  it('Current’s snapshot forgets the name: Current, left from the save, reads unsaved and unnamed, and a restore detaches', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run', currentSessionName: 'Dusk Run' });
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
    expect(currentEyebrow()).toBe(human('home.off.current'));
    deleteSave();
    expect(currentEyebrow()).toBe(human('home.off.unsavedEyebrow'));
    expect(currentRowName()).toBe(currentName());
    fireEvent.click(currentRadio());
    expect(session().currentLoadedSessionName).toBeNull();
  });

  it('Save from there writes the deleted world back under a fresh name, and the selection moves to it', () => {
    pickDuskRun();
    const world = structuredClone(live.payload);
    deleteSave();
    fireEvent.click(saveButton());
    expect(listSessions()).toHaveLength(1);
    const added = listSessions()[0].name;
    expect(added).not.toBe('Dusk Run');
    expect(loadSession(added)).toEqual(JSON.parse(JSON.stringify(world)));
    expect(row(added).getAttribute('aria-checked')).toBe('true');
    expect(editorSelected()).toBe(false);
  });
});

// docs/tasks/OFF_SCREEN_CONSOLE.md Task 10 (spec §1.6, §5 case 11): Share sits beside the readout and copies the link for
// what the readout names, through useShareStatus and copySessionLink: the live world (Current is shown only with no
// snapshot, as Task 7 found, so that is every case). "Copied" shows in the status slot until the hook's dismiss, a failed
// copy as an alert; the slot holds one line, the latest event's. Dimmed while a change waits.
describe('OffScreen — Share on the readout (console Task 10)', () => {
  let copy: MockInstance<typeof sessionShareUtils.copySessionLink>;
  beforeEach(() => {
    markHeardWorld();
    copy = vi.spyOn(sessionShareUtils, 'copySessionLink').mockResolvedValue(true);
    // A pick lands as itself, so the live world is what was picked, as in the app.
    vi.mocked(applySessionPayload).mockImplementation((payload) => {
      useLoadingStore.getState().setLoading(loadingOf(payload));
      live.payload = structuredClone(payload);
    });
  });
  let detachWash: (() => void) | undefined;
  afterEach(() => {
    copy.mockRestore();
    vi.useRealTimers();
    detachWash?.();
    detachWash = undefined;
  });
  /** Share, in the action row since Checkpoint A: the Transmissions section is opened to reach it. */
  const shareButton = () => {
    return actionButton('home.off.share');
  };
  /** A click on Share, its copy resolved. The button is found (and the section opened) before the act. */
  const share = async () => {
    const button = shareButton();
    await act(async () => {
      fireEvent.click(button);
    });
  };
  const copiedLine = () => within(statusSlot()).queryByRole('status');
  const failedLine = () => within(statusSlot()).queryByRole('alert');

  // Beside the readout until Checkpoint A (Crawford): now last in the action row, after Delete.
  it('sits last in the action row, flat, named after the shown row; the readout stands alone', () => {
    render(<OffScreen />);
    const button = shareButton();
    expect(within(actionsRow()).getAllByRole('button').at(-1)).toBe(button);
    expect(shareButton().classList.contains('sc-button--muted')).toBe(true);
    expect(shareButton().getAttribute('aria-label')).toBe(fill('home.off.share', { name: human('home.off.current') }));
    expect(readout().parentElement!.classList.contains('off-screen__picker')).toBe(true);
  });

  it('on Current, copies the live world', async () => {
    render(<OffScreen />);
    await share();
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledWith(live.marker('live'));
  });

  it('on a save, a second save and New Transmission, copies the live world: what landed, with any edit since', async () => {
    seedWorlds();
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    vi.mocked(retransmitWorld).mockImplementation((input) => {
      live.payload = input.attenuationStyleName !== undefined ? live.marker('scanned') : { ...live.payload, theme: input.theme };
      landsInStores(input);
    });
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
    fireEvent.click(row(human('home.off.theme.anchor')));
    await share();
    expect(copy).toHaveBeenLastCalledWith({ ...savedPayload('dusk'), theme: 'anchor' });
    fireEvent.click(row(worldName(1)));
    await share();
    expect(copy).toHaveBeenLastCalledWith(worldPayload(1));
    fireEvent.click(scanButton());
    await share();
    expect(copy).toHaveBeenLastCalledWith(live.marker('scanned'));
    vi.mocked(retransmitWorld).mockReset();
  });

  it('“copied” shows in the slot as a status, and is gone after the dismiss', async () => {
    vi.useFakeTimers();
    render(<OffScreen />);
    await share();
    expect(copiedLine()!.textContent).toBe(human('session.status.linkCopied'));
    expect(failedLine()).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(statusSlot().textContent).toBe('');
  });

  it('a failed copy shows the failure as an alert', async () => {
    copy.mockResolvedValue(false);
    render(<OffScreen />);
    await share();
    expect(failedLine()!.textContent).toBe(human('session.status.copyFailed'));
    expect(copiedLine()).toBeNull();
  });

  it('is dimmed while a change waits, and lit once it lands', async () => {
    seedWorlds();
    useUIStore.setState({ sceneWash: 'clear' });
    detachWash = attachSceneWash();
    render(<OffScreen />);
    expect(shareButton().disabled).toBe(false);
    fireEvent.click(row(worldName(0)));
    expect(shareButton().disabled).toBe(true);
    await act(async () => {
      useUIStore.getState().setSceneWash('covered');
    });
    expect(shareButton().disabled).toBe(false);
  });

  describe('one line at a time, the latest event’s', () => {
    let logged: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => logged.mockRestore());
    const refuseSave = () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      fireEvent.click(saveButton());
      setItem.mockRestore();
    };

    it('a refused Save after a copy replaces “copied”', async () => {
      render(<OffScreen />);
      await share();
      refuseSave();
      expect(copiedLine()).toBeNull();
      expect(statusSlot().textContent).toBe(saveFailedLine('Quiet Harbour'));
    });

    it('a copy after a refused Save replaces the failure, and the dismiss leaves the slot empty', async () => {
      vi.useFakeTimers();
      render(<OffScreen />);
      refuseSave();
      await share();
      expect(statusSlot().textContent).toBe(human('session.status.linkCopied'));
      act(() => vi.advanceTimersByTime(5000));
      expect(statusSlot().textContent).toBe('');
    });

    it('a second copy after a refused Save shows “copied” again', async () => {
      render(<OffScreen />);
      await share();
      refuseSave();
      await share();
      expect(statusSlot().textContent).toBe(human('session.status.linkCopied'));
    });

    it('the dismiss of an earlier copy leaves a later failure standing', async () => {
      vi.useFakeTimers();
      render(<OffScreen />);
      await share();
      refuseSave();
      act(() => vi.advanceTimersByTime(5000));
      expect(statusSlot().textContent).toBe(saveFailedLine('Quiet Harbour'));
    });
  });
});

// docs/tasks/OFF_SCREEN_REVISIONS.md Task 4 (Crawford's notes 1 and 2, 2026-10-31): the Transmission row is a list —
// New Transmission, Current, the saves with when they were saved (a rule and the presets until Checkpoint A) — and
// Scan rides on New Transmission's row, beside its radio, so what Scan does is plain (docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md
// Task 5; Roll rode on Current's before). The action row stays under the list (console Task 7; Keep before).
// docs/tasks/OFF_SCREEN_CONSOLE.md Task 2 (spec §1.4) put the list and its action row in a section that started collapsed
// under a header naming the selected row and the count of saves. Checkpoint A (Crawford, 2026-11-09: "we no longer need
// to show/hide the sessions") dropped the toggle: the list, its action row and Factory Reset show on every mount, with
// no header over them; the list's own label and the checked row say what is selected.
describe('OffScreen — the list is always shown (Checkpoint A: no toggle)', () => {
  beforeEach(() => markHeardWorld());
  const list = () => screen.queryByRole('group', { name: human('home.off.transmission') });

  // Scan stays out of it, in the editor's title row (console Task 4).
  it('on open, with no click, the list, its action row and Factory Reset are shown, Current checked', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    expect(list()).not.toBeNull();
    expect(radioNames()).toEqual([currentName(), savedLabel('Dusk Run')]);
    expect(currentRadio().getAttribute('aria-checked')).toBe('true');
    expect(actionsRow()).not.toBeNull();
    expect(actionsRow().contains(scanButton())).toBe(false);
    expect(screen.queryByRole('button', { name: human('session.clearStorage.action') })).not.toBeNull();
  });

  it('there is no Transmissions header and nothing collapses', () => {
    const { container } = render(<OffScreen />);
    // The header was the section's expander; the help icons' popovers are the only ones left.
    expect(container.querySelector('[aria-expanded]:not(.sc-help__trigger)')).toBeNull();
  });
});

// docs/tasks/OFF_SCREEN_CONSOLE.md Task 3 (spec §1.4, assumption 4, §5 case 13): Factory Reset, behind its confirm.
// Confirming clears every key, detaches the loaded save, and the screen gives way to the first-visit view at once: the
// device flag went with the rest of storage. It sat in its own Device section until Checkpoint A (Crawford: nothing
// else would go there, and it deletes the saves), so now it is with the saves, at the foot of the Transmissions section.
describe('OffScreen — Factory Reset, with the saves (console Task 3; Checkpoint A)', () => {
  beforeEach(() => markHeardWorld());
  afterEach(() => document.getElementById('screen-viewport')?.remove());
  const reset = () => screen.queryByRole('button', { name: human('session.clearStorage.action') });
  const dialog = () => screen.queryByRole('alertdialog');
  const confirm = () => fireEvent.click(within(dialog()!).getByRole('button', { name: human('session.clearStorage') }));
  const cancel = () => fireEvent.click(within(dialog()!).getByRole('button', { name: human('ui.cancel') }));
  const stored = () => [localStorage.getItem(STORAGE_KEY), localStorage.getItem(DEVICE_FLAGS_KEY)];

  // Hidden while the Transmissions section was collapsed, until Checkpoint A dropped the toggle.
  it('Reset sits in the Transmissions section, after the action row, under its label row', () => {
    render(<OffScreen />);
    expect(reset()!.closest('.off-screen__transmissions')).toBe(actionsRow().closest('.off-screen__transmissions'));
    expect(actionsRow().compareDocumentPosition(reset()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const label = reset()!.closest('.off-screen__reset')!.querySelector('.sc-dual-label')!;
    expect(label.textContent).toContain(CONTENT['session.clearStorage'].lore);
    expect(label.textContent).toContain(human('session.clearStorage'));
  });

  it('Reset opens the confirm and clears nothing', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    const before = stored();
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
    fireEvent.click(reset()!);
    cancel();
    expect(dialog()).toBeNull();
    expect(stored()).toEqual(before);
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
    expect(reset()).not.toBeNull();
  });

  it('the confirm portals into #screen-viewport when the screen exists', () => {
    const viewport = document.createElement('div');
    viewport.id = 'screen-viewport';
    document.body.appendChild(viewport);
    render(<OffScreen />);
    fireEvent.click(reset()!);
    expect(viewport.contains(dialog())).toBe(true);
  });

  it('with no screen the confirm opens in place, never as a child of <body>', () => {
    const { container } = render(<OffScreen />);
    fireEvent.click(reset()!);
    expect(container.contains(dialog())).toBe(true);
  });

  it('Escape closes the confirm and gives focus back to Reset', async () => {
    render(<OffScreen />);
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
    const root = picker().closest('.sc-radio-button')!;
    expect(root.classList.contains('sc-radio-button--list')).toBe(true);
    expect(root.classList.contains('sc-radio-button--muted')).toBe(false);
    expect(root.querySelectorAll('.sc-radio-button__row')).toHaveLength(2); // Current and Dusk Run: no presets since Checkpoint A
    expect(root.querySelector('[class*="sc-cabinet-box"]')).toBeNull();
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R8 kept Scan outside the radio group's roving focus from the trailing slot;
  // in the editor's title row (console Task 4) it is outside the list altogether, and the slot is unused.
  it('the list holds no button and no row carries a trailing action: Scan is in the editor', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    const { container } = render(<OffScreen />);
    expect(within(picker()).queryAllByRole('button')).toEqual([]);
    expect(container.querySelectorAll('.sc-radio-button__trailing')).toHaveLength(0);
    expect(editor().contains(scan())).toBe(true);
  });

  // Roll was never a pick; Scan is not a radio either, but it does select New Transmission, which no row carries.
  it('a click on Scan is one retransmit, nothing applied, and selects the editor, leaving no row checked', () => {
    render(<OffScreen />);
    fireEvent.click(scan());
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(editorSelected()).toBe(true);
    expect(within(picker()).getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).not.toContain('true');
  });

  it('shows each save with when it was saved, newest first; Current carries no meta', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(Date.UTC(2026, 9, 28, 14, 14)).mockReturnValueOnce(Date.UTC(2026, 9, 30, 9, 5));
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    saveNamedSession('Night Run', savedPayload('night'));
    now.mockRestore();
    const { container } = render(<OffScreen />);
    const metas = Array.from(container.querySelectorAll('.sc-radio-button__meta')).map((m) => m.textContent);
    expect(metas).toEqual([savedMeta('Night Run'), savedMeta('Dusk Run')]);
    expect(within(row('Night Run')).getByText(savedMeta('Night Run'))).toBeTruthy();
    expect(row(currentName()).querySelector('.sc-radio-button__meta')).toBeNull();
  });

  it("the meta reads 'saved' and the time the Sessions list shows for the same save", () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    const entry = listSessions()[0];
    const meta = row('Dusk Run').querySelector('.sc-radio-button__meta')!;
    expect(meta.textContent).toBe(fill('home.off.savedAt', { time: formatSessionTimestamp(entry.savedAt) }));
    expect(meta.textContent).toContain(formatSessionTimestamp(entry.savedAt));
  });

  it('a save kept from this screen appears with its meta at once', () => {
    render(<OffScreen />);
    fireEvent.click(saveButton());
    const kept = useSessionStore.getState().currentLoadedSessionName!;
    expect(row(kept).querySelector('.sc-radio-button__meta')?.textContent).toBe(savedMeta(kept));
  });

  // Keep, alone, until console Task 7 (spec §1.5): now Save, Rename and Delete, each named after the selected row.
  it('holds Save, Rename, Delete and Share in the actions row under the list, each named after the selected row', () => {
    render(<OffScreen />);
    const current = human('home.off.current');
    expect(within(actionsRow()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      fill('home.off.save', { name: current }),
      fill('home.off.rename', { name: current }),
      fill('home.off.delete', { name: current }),
      fill('home.off.share', { name: current }),
    ]);
    expect(within(actionsRow()).getAllByRole('button').map((b) => b.textContent)).toEqual([
      human('home.off.save'),
      human('home.off.rename'),
      human('home.off.delete'),
      human('home.off.share'),
    ]);
    expect(picker().closest('.sc-radio-button')!.nextElementSibling).toBe(actionsRow());
  });
});

describe('OffScreen — the Transmission row', () => {
  beforeEach(() => markHeardWorld());

  // New Transmission left the list for the editor (console Task 4): Current is first.
  // The presets followed the saves, under their own title and a rule, until Checkpoint A (Crawford: "we don't need
  // them" for now).
  it('with no saves, lists Current alone, under the Transmission label: no presets, no title, no divider', () => {
    const { container } = render(<OffScreen />);
    expect(radioNames()).toEqual([currentName()]);
    expect(container.querySelector('.sc-radio-button__divider')).toBeNull();
    expect(container.querySelector('.sc-radio-button__heading')).toBeNull();
  });

  it("lists the user's saves after Current, newest first, and nothing after them: no divider", () => {
    // Two saves in one millisecond would tie on savedAt; give the second a later clock so "newest first" is testable.
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    saveNamedSession('Night, all freelance', savedPayload('night'));
    now.mockRestore();
    const { container } = render(<OffScreen />);
    const names = radioNames();
    expect(names[0]).toBe(currentName());
    expect(names.slice(1)).toEqual([savedLabel('Night, all freelance'), savedLabel('Dusk Run')]);
    expect(container.querySelector('.sc-radio-button__divider')).toBeNull();
  });

  it('has Current selected before a pick, and nothing else in the world row', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    // Scoped to the Transmission group: the Loading axis (Task 30) is a second radio group with its own selection.
    for (const radio of within(picker()).getAllByRole('radio')) {
      expect(radio.getAttribute('aria-checked')).toBe(plainEyebrow(radio.getAttribute('aria-label')!) === currentName() ? 'true' : 'false');
    }
  });

  // With no New Transmission row (console Task 4), a save of that name is the only radio so named, and picking it is a
  // save pick: the editor is not selected by it.
  it('keeps a save named New Transmission apart from the editor: picking the save applies the save, and draws nothing', () => {
    const save = savedPayload('new-name');
    saveNamedSession(newTransmission(), save);
    render(<OffScreen />);
    const radios = screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-label')!.startsWith(newTransmission()));
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([describeWorld(save, newTransmission())]);
    fireEvent.click(radios[0]);
    expect(applySessionPayload).toHaveBeenCalledWith(save);
    expect(retransmitWorld).not.toHaveBeenCalled();
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(editorSelected()).toBe(false);
  });

});

describe('OffScreen — picking', () => {
  beforeEach(() => markHeardWorld());

  it("applies the saved session's payload on picking a save", () => {
    const save = savedPayload('dusk');
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(save);
  });

  // Code review 2026-10-11: the Sessions list names the loaded save so a later Save overwrites it; the
  // off screen's pick must too, or powering on and pressing Save writes a second entry.
  it('picking a save names the session after it, as loading it from the Sessions list does', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    fireEvent.click(row('Dusk Run'));
    expect(useSessionStore.getState().currentSessionName).toBe('Dusk Run');
    expect(useSessionStore.getState().currentLoadedSessionName).toBe('Dusk Run');
  });

  it('never starts the AudioEngine: only the power switch starts sound', () => {
    seedWorlds();
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    fireEvent.click(row(worldName(0)));
    fireEvent.click(row('Dusk Run'));
    fireEvent.click(currentRadio());
    expect(AudioEngine.start).not.toHaveBeenCalled();
  });

  it('marks the picked option selected, and only it — Current included', () => {
    seedWorlds();
    render(<OffScreen />);
    fireEvent.click(row(worldName(2)));
    expect(row(worldName(2)).getAttribute('aria-checked')).toBe('true');
    expect(row(worldName(0)).getAttribute('aria-checked')).toBe('false');
    expect(row(currentName()).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(row(worldName(0)));
    expect(row(worldName(2)).getAttribute('aria-checked')).toBe('false');
    expect(applySessionPayload).toHaveBeenCalledTimes(2);
  });

  it('re-clicking the picked option does not retransmit', () => {
    seedWorlds();
    render(<OffScreen />);
    fireEvent.click(row(worldName(0)));
    fireEvent.click(row(worldName(0)));
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(row(worldName(0)).getAttribute('aria-checked')).toBe('true');
  });

  it('a save deleted since the screen mounted applies nothing and does not claim the pick', () => {
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
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

  it("names a save by its own name and its world: '<save> · AS (x, y)'", () => {
    const save = savedPayload('dusk');
    saveNamedSession('Dusk Run', save);
    render(<OffScreen />);
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
// From docs/tasks/OFF_SCREEN_CONSOLE.md Task 2 to Checkpoint A the list started collapsed and the Transmissions header
// took the focus; with the toggle gone the selected row takes it again.
describe('OffScreen — focus on the selected row after a power-off (review R25)', () => {
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

  it('mounted with the world paused, the selected row has focus: Current, named as Current', () => {
    markHeardWorld();
    setWorldState('paused');
    render(<OffScreen />);
    const current = row(currentName());
    expect(document.activeElement).toBe(current);
    expect(current.getAttribute('aria-checked')).toBe('true');
    expect(within(picker()).getAllByRole('radio')).toContain(current);
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
  it('a save pick applies its payload only once the wash has covered the world, and the pick shows at the click', async () => {
    seedWorlds();
    render(<OffScreen />);
    fireEvent.click(row(worldName(1)));
    expect(wash()).toBe('covering');
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(checked(worldName(1))).toBe('true');
    await land();
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(worldPayload(1));
    expect(checked(worldName(1))).toBe('true');
    expect(wash()).toBe('uncovering');
  });

  it('two picks before the cover lands: only the last is applied', async () => {
    seedWorlds();
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    fireEvent.click(row(worldName(0)));
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
    seedWorlds();
    render(<OffScreen />);
    fireEvent.click(row(worldName(2)));
    await land();
    act(() => useUIStore.getState().setSceneWash('clear'));
    fireEvent.click(scanButton());
    expect(retransmitWorld).not.toHaveBeenCalled();
    expect(editorSelected()).toBe(true);
    expect(checked(worldName(2))).toBe('false');
    await land();
    expect(retransmitWorld).toHaveBeenCalledTimes(1);
    expect(retransmitWorld).toHaveBeenCalledWith(expect.objectContaining({ theme: 'classic', aspects: {} }));
    expect(editorSelected()).toBe(true);
  });

  // A New Transmission pick is a Scan since console Task 4 (the row is gone).
  it('a Scan waiting, then Current: the change is cancelled and nothing is drawn into the world', async () => {
    const cancel = vi.spyOn(worldChange, 'cancelWorldChange');
    render(<OffScreen />);
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

    it('a save, a theme pick, then a toggle: one request at the cover carrying both, and no retransmit before it', async () => {
      seedWorlds();
      const preset = worldPayload(0);
      render(<OffScreen />);
      fireEvent.click(row(worldName(0)));
      fireEvent.click(row(human('home.off.theme.float')));
      fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
      expect(retransmitWorld).not.toHaveBeenCalled();
      await land();
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).toHaveBeenCalledWith({ theme: 'float', aspects: { ...loadingOf(preset).aspects, envelope: ['held'] } });
    });

    it('a save then Current applies nothing: the cover lands and lifts with no change, and Current stays picked', async () => {
      seedWorlds();
      const cancel = vi.spyOn(worldChange, 'cancelWorldChange');
      render(<OffScreen />);
      fireEvent.click(row(worldName(1)));
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

    it("a save then a toggle leaves the save's world with the toggle: the apply, then one aspects retransmit", async () => {
      seedWorlds();
      const preset = worldPayload(0);
      render(<OffScreen />);
      fireEvent.click(row(worldName(0)));
      fireEvent.click(screen.getByRole('button', { name: human('home.off.envelope.held') }));
      expect(applySessionPayload).not.toHaveBeenCalled();
      expect(retransmitWorld).not.toHaveBeenCalled();
      await land();
      expect(applySessionPayload).toHaveBeenCalledTimes(1);
      expect(applySessionPayload).toHaveBeenCalledWith(preset);
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).toHaveBeenCalledWith({ aspects: { ...loadingOf(preset).aspects, envelope: ['held'] } });
      expect(order(vi.mocked(applySessionPayload))).toBeLessThan(order(vi.mocked(retransmitWorld)));
      expect(checked(worldName(0))).toBe('true'); // the toggle laid over the save keeps its row (spec §1.5)
    });

    it("a save then a theme pick leaves the save's world under that theme: the apply, then one theme retransmit", async () => {
      seedWorlds();
      render(<OffScreen />);
      fireEvent.click(row(worldName(0)));
      fireEvent.click(row(human('home.off.theme.float')));
      await land();
      expect(applySessionPayload).toHaveBeenCalledTimes(1);
      expect(applySessionPayload).toHaveBeenCalledWith(worldPayload(0));
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
      expect(retransmitWorld).toHaveBeenCalledWith({ theme: 'float' });
      expect(order(vi.mocked(applySessionPayload))).toBeLessThan(order(vi.mocked(retransmitWorld)));
    });

    // Roll's case rewritten for Scan (Task 5): Roll kept the loading, so the save's was laid over the rolled world;
    // Scan's world brings its own loading, Classic with no aspects, replacing the save's as a pick's own loading does.
    it('a save then Scan: the scan wins, its world under Classic with no aspects, and nothing is laid over it', async () => {
      saveNamedSession('Dusk Run', { ...savedPayload('dusk'), theme: 'float' });
      render(<OffScreen />);
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
      seedWorlds();
      const preset = worldPayload(1);
      render(<OffScreen />);
      fireEvent.click(row(worldName(1)));
      expect(checked(worldName(1))).toBe('true');
      expect(readout().textContent).toBe(describeWorld({ ...preset, ...loadingOf(preset) }, worldName(1)));
      fireEvent.click(row(human('home.off.theme.float')));
      // A theme pick while the save waits keeps the save's row (final fixes F12); the readout names the world to come.
      expect(row(worldName(1)).getAttribute('aria-checked')).toBe('true');
      expect(checked(human('home.off.theme.float'))).toBe('true');
      expect(document.querySelector('.off-screen__description--theme')?.textContent).toBe(human('home.off.themeDescription.float'));
      expect(readout().textContent).toBe(describeWorld({ ...preset, ...loadingOf(preset), theme: 'float' }, worldName(1)));
      expect(applySessionPayload).not.toHaveBeenCalled();
    });

    it('dims Save between a click and the cover landing: it would save a world the rows no longer show', async () => {
      seedWorlds();
      render(<OffScreen />);
      expect(saveButton().disabled).toBe(false); // precondition: the unsaved live world lights it
      fireEvent.click(row(worldName(0)));
      expect(saveButton().disabled).toBe(true);
      await land();
      expect(saveButton().disabled).toBe(false);
    });

    it("a theme pick then a save: the theme applies at the click, then the save's own loading wins, so nothing is laid over it", async () => {
      seedWorlds();
      render(<OffScreen />);
      fireEvent.click(row(human('home.off.theme.float')));
      expect(retransmitWorld).toHaveBeenCalledTimes(1); // the theme, at once (F8)
      fireEvent.click(row(worldName(0)));
      expect(checked(human('home.off.theme.classic'))).toBe('true'); // the save's own theme, shown at the click
      await land();
      expect(applySessionPayload).toHaveBeenCalledWith(worldPayload(0));
      expect(retransmitWorld).toHaveBeenCalledTimes(1);
    });

    it('a save that carries its own loading applies alone: its loading is the one intended, so nothing is laid over it', async () => {
      const calmRun = { ...savedPayload('calm-run'), theme: 'float', aspects: { melody: ['hypnotic'] } } as SessionPayload;
      saveNamedSession('Calm Run', calmRun);
      render(<OffScreen />);
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
      seedWorlds();
      saveNamedSession('Dusk Run', savedPayload('dusk'));
      render(<OffScreen />);
      fireEvent.click(row(worldName(0)));
      expect(checked(worldName(0))).toBe('true');
      fireEvent.click(row('Dusk Run'));
      expect(checked('Dusk Run')).toBe('true');
      expect(checked(worldName(0))).toBe('false');
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

  // Save dims while the change waits and lights again once it lands: New Transmission is always savable (console Task 7).
  it('Save dims while a Scan waits and lights once the cover has landed', async () => {
    render(<OffScreen />);
    expect(saveButton().disabled).toBe(false);
    vi.mocked(retransmitWorld).mockImplementation(() => {
      live.payload = live.marker('scanned');
    });
    fireEvent.click(scanButton());
    expect(saveButton().disabled).toBe(true);
    await land();
    expect(saveButton().disabled).toBe(false);
  });

  // Current's eyebrow follows Current; Save follows the row, New Transmission, which is always savable (console Task 7).
  it('a kept Current stays kept through a Scan landing: Current reads plain at the cover, and Save lights', async () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(saveButton().disabled).toBe(true);
    vi.mocked(retransmitWorld).mockImplementation(() => {
      live.payload = live.marker('scanned');
    });
    fireEvent.click(scanButton());
    await land();
    expect(currentEyebrow()).toBe(human('home.off.current'));
    expect(saveButton().disabled).toBe(false);
  });

  it('a theme pick reads dirty at the click: no cover to wait for, so Save lights at once (final fixes F8)', () => {
    saveNamedSession('Dusk Run', structuredClone(live.payload));
    useSessionStore.setState({ currentLoadedSessionName: 'Dusk Run' });
    render(<OffScreen />);
    expect(saveButton().disabled).toBe(true);
    vi.mocked(retransmitWorld).mockImplementation(() => {
      live.payload = live.marker('themed');
    });
    fireEvent.click(row(human('home.off.theme.anchor')));
    expect(saveButton().disabled).toBe(false);
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
      fireEvent.click(row(human('home.off.theme.float')));
      fireEvent.click(row('Dusk Run'));
      await land();
      clear();
      fireEvent.click(currentRadio());
      await land();
      expect(lastApplied()).toMatchObject({ theme: 'float' });
    });

    it('a save lands, Current waits, then another save: only that one lands, Current still names the snapshot, and Current then restores it', async () => {
      seedWorlds();
      saveNamedSession('Calm Run', calmRun());
      const prePick = structuredClone(live.payload);
      render(<OffScreen />);
      const name = currentRowName();
      fireEvent.click(row('Calm Run'));
      await land();
      clear();
      fireEvent.click(currentRadio());
      fireEvent.click(row(worldName(1)));
      await land();
      expect(applySessionPayload).toHaveBeenCalledTimes(2);
      expect(lastApplied()).toEqual(worldPayload(1));
      expect(checked(worldName(1))).toBe('true');
      expect(currentRowName()).toBe(name);
      clear();
      fireEvent.click(currentRadio());
      await land();
      expect(lastApplied()).toEqual(prePick);
    });

    it('a theme clicked while a restore waits is laid over the restored world, and Current stays checked', async () => {
      saveNamedSession('Calm Run', calmRun());
      render(<OffScreen />);
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
      seedWorlds();
      saveNamedSession('Calm Run', calmRun());
      render(<OffScreen />);
      fireEvent.click(row('Calm Run'));
      await land();
      clear();
      fireEvent.click(currentRadio());
      await land();
      clear();
      live.payload = live.marker('after-restore');
      fireEvent.click(row(worldName(0)));
      await land();
      clear();
      fireEvent.click(currentRadio());
      await land();
      expect(lastApplied()).toEqual(live.marker('after-restore'));
    });
  });

  it('Save and picking Current are not world changes: no cover, at once', () => {
    render(<OffScreen />);
    fireEvent.click(saveButton());
    expect(wash()).toBe('clear');
    expect(listSessions()).toHaveLength(1);
    fireEvent.click(row(currentName(listSessions()[0].name)));
    expect(wash()).toBe('clear');
  });
});

// docs/tasks/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md Task 6c (Crawford, 2026-11-02): the list's saves (and the presets, until Checkpoint A) sit
// under titles, and the Loading column's two parts are titled, each with how many it takes.
describe('OffScreen — the section titles (Current and New Transmission, Task 6c)', () => {
  beforeEach(() => markHeardWorld());
  const titles = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.sc-radio-button__heading')).map((h) => h.textContent);
  const rowEl = (name: string) => row(name).closest('.sc-radio-button__row');

  // The presets had their own title, under a rule, until Checkpoint A.
  it('with no saves, there is no title', () => {
    const { container } = render(<OffScreen />);
    expect(titles(container)).toEqual([]);
  });

  it('with saves, titles them over the newest, and nothing else: no rule', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    saveNamedSession('Night Run', savedPayload('night'));
    now.mockRestore();
    const { container } = render(<OffScreen />);
    expect(titles(container)).toEqual([human('home.off.savedTransmissions')]);
    expect(container.querySelector('.sc-radio-button__heading')!.nextElementSibling).toBe(rowEl('Night Run'));
    expect(container.querySelector('.sc-radio-button__divider')).toBeNull();
  });

  it('titles a save kept from this screen at once, the first save', () => {
    const { container } = render(<OffScreen />);
    fireEvent.click(saveButton());
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
// on the off screen stays flat — the Transmission list, the theme row, Scan (Roll's place) and the action row (Keep's place, his answer 5).
describe('OffScreen — only the aspect rows come off the plate', () => {
  beforeEach(() => markHeardWorld());

  it('the Transmission list, the theme row, Scan and the action row carry no cabinet box, wall or popped class, picked or not', () => {
    seedWorlds();
    saveNamedSession('Dusk Run', savedPayload('dusk'));
    render(<OffScreen />);
    fireEvent.click(row(worldName(0)));
    const flat = [
      picker().closest('.sc-radio-button')!,
      screen.getByRole('group', { name: human('home.off.loading') }).closest('.sc-radio-button')!,
      scanButton(),
      actionsRow(),
    ];
    for (const part of flat) {
      expect(part.querySelector('[class*="sc-cabinet-box"]')).toBeNull();
      expect(part.querySelector('[class*="popped"]')).toBeNull();
    }
  });

  // The editor's three inputs (console Task 4) share one static panel facade since Checkpoint A (each drew its own
  // before). Factory Reset's button keeps its cabinet face, and shows on mount since the list's toggle went (Checkpoint
  // A); those two are the only boxes besides the aspect rows'.
  it('every cabinet box on the screen belongs to an aspect row, the editor’s one panel or Factory Reset', () => {
    const { container } = render(<OffScreen />);
    const boxes = Array.from(container.querySelectorAll('.sc-cabinet-box'));
    const aspectBoxes = ASPECT_FAMILY_IDS.reduce((n, family) => n + ASPECT_IDS_BY_FAMILY[family].length, 0);
    expect(boxes.length).toBe(aspectBoxes + 2);
    const familyRoots = ASPECT_FAMILY_IDS.map((family) =>
      screen.getByRole('group', { name: human(`home.off.${family}`) }).closest('.sc-radio-button'),
    );
    const panel = editor().querySelector('.transmission-editor__panel');
    const reset = container.querySelector('.off-screen__reset');
    for (const box of boxes) {
      if (panel?.contains(box) || reset?.contains(box)) continue;
      expect(familyRoots).toContain(box.closest('.sc-radio-button'));
    }
    expect(boxes.filter((box) => panel?.contains(box))).toHaveLength(1);
    expect(boxes.filter((box) => reset?.contains(box))).toHaveLength(1);
  });
});

describe('OffScreen — on the phone shell (Task 28)', () => {
  beforeEach(() => markHeardWorld());

  // jsdom computes no layout, so "no horizontal overflow" is not checked here; the phone shell's DOM is: ScreenViewport marks
  // itself with data-shell, and Current and a save with the longest legal name are still in the picker.
  const renderOnPhone = () =>
    render(
      <main id="screen-viewport" data-shell="phone">
        <OffScreen />
      </main>,
    );

  it('renders the editor with Scan, and Current in the picker', () => {
    renderOnPhone();
    expect(editorShows()).toEqual(liveIdentity());
    expect(editor().contains(scanButton())).toBe(true);
    expect(radioNames()).toEqual([currentName()]);
  });

  it('keeps a 128-character save name whole in its accessible name, drawn in the single-line label that ends in an ellipsis', () => {
    const longName = 'N'.repeat(128);
    saveNamedSession(longName, savedPayload('long'));
    renderOnPhone();
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
    fireEvent.click(row(longName));
    expect(screen.getByTestId('off-screen-readout').textContent).toBe(describeWorld(save, longName));
  });
});
