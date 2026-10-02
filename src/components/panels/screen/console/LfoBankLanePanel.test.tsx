import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';

// The LFO Bank engine (docs/tasks/LFO_BANK.md Task 7/14) — setLfoBank (audioStore.ts) calls this
// module's setBankShape/setBankRate/setBankRateDrift/setBankDepthDrift directly; mocked for the
// same reason AudioRigEffectPanel.test.tsx already mocks it: the real module constructs a Tone
// node on first call, which throws without a real AudioContext.
vi.mock('../../../../engine/lfoEngine', () => ({
  lfoEngine: {
    primeLfoBank: vi.fn(),
    setBankShape: vi.fn(),
    setBankRate: vi.fn(),
    setBankRateDrift: vi.fn(),
    setBankDepthDrift: vi.fn(),
    getBankSettings: vi.fn(),
    linkTarget: vi.fn(() => true),
    unlinkTarget: vi.fn(),
    disposeRobotLinks: vi.fn(),
    setDriftEnabled: vi.fn(),
    setFilterLinksEnabled: vi.fn(),
  },
}));

import { LfoBankLanePanel } from './LfoBankLanePanel';
import { lfoEngine } from '../../../../engine/lfoEngine';
import { useAudioStore } from '@/stores/audioStore';
import { DEFAULT_BANK_LFO } from '@/data/lfoConfig';
import { CONTENT } from '@/content';
import { noteValueEquals, noteValueHz, type NoteDivision, type NoteModifier, type NoteValue } from '@/data/noteValues';
import { allowedLaneNoteValues } from '@/utils/tempoSync';
import { formatNoteValue } from '@/utils/formatNoteValue';
import { facadeCurrentLabels } from '@/testUtils/toggleFacade';
import { LFO_LANE_IDS, type BankLfoSettings, type LfoLaneId } from '@/types/lfo';

const nv = (division: NoteDivision, modifier: NoteModifier = 'straight'): NoteValue => ({ division, modifier });
const TOGGLE_NAME = CONTENT['ui.tempoSync'].human;
// The toggle's content is the current mode's label pair: Float over Free, or Anchored over Sync.
const FREE = { lore: CONTENT['ui.tempoSync'].options.free.lore, human: CONTENT['ui.tempoSync'].options.free.human };
const SYNC = { lore: CONTENT['ui.tempoSync'].options.sync.lore, human: CONTENT['ui.tempoSync'].options.sync.human };
const setLane = (lane: LfoLaneId, patch: Partial<BankLfoSettings>) =>
  useAudioStore.setState((s) => ({ lfoBank: { ...s.lfoBank, [lane]: { ...DEFAULT_BANK_LFO, ...patch } } }));
const rateThumb = () => screen.getByRole('slider', { name: 'Rate' });
const tempoToggle = () => screen.getByRole('switch', { name: TOGGLE_NAME });

/**
 * LfoBankLanePanel (docs/tasks/LFO_BANK.md Task 15) — one lane's own Shape + Rate + Rate
 * Drift/Depth Drift pair, reading/writing audioStore.lfoBank[lane] directly (a rig-wide control,
 * not scoped to anything selected) — structurally mirrors FleetDriftPanel/RobotDriftPanel's own
 * test coverage (render, onChange, driftHeldOff), bound to lane 'b' throughout per the plan's own
 * acceptance criteria.
 */
describe('LfoBankLanePanel', () => {
  beforeEach(() => {
    useAudioStore.setState((s) => ({
      lfoBank: { ...s.lfoBank, b: { ...DEFAULT_BANK_LFO } },
      driftHeldOff: false,
    }));
  });

  it("shows lfoBank.b's current shape/rate, and rateDrift/depthDrift as -100..100 percent, not the internal -1..1 fraction", () => {
    useAudioStore.setState((s) => ({
      lfoBank: { ...s.lfoBank, b: { shape: 'square', rate: 3, rateDrift: -0.2, depthDrift: 0.9 } },
    }));
    render(<LfoBankLanePanel lane="b" />);
    expect(screen.getByRole('radio', { name: 'Square', checked: true })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('aria-valuenow')).toBe('3');
    expect(screen.getByRole('slider', { name: 'Rate Drift' }).getAttribute('aria-valuenow')).toBe('-20');
    expect(screen.getByRole('slider', { name: 'Depth Drift' }).getAttribute('aria-valuenow')).toBe('90');
  });

  it("choosing a shape calls setLfoBank('b', { shape })", () => {
    render(<LfoBankLanePanel lane="b" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sawtooth' }));
    expect(useAudioStore.getState().lfoBank.b.shape).toBe('sawtooth');
  });

  it("dragging Rate calls setLfoBank('b', { rate }) with the real Hz value, not divided", () => {
    useAudioStore.setState((s) => ({ lfoBank: { ...s.lfoBank, b: { ...s.lfoBank.b, rate: 1 } } }));
    render(<LfoBankLanePanel lane="b" />);
    const rateSlider = screen.getByRole('slider', { name: 'Rate' });
    rateSlider.focus();
    fireEvent.keyDown(rateSlider, { key: 'ArrowRight' });

    const newRate = Number(rateSlider.getAttribute('aria-valuenow'));
    expect(newRate).not.toBe(1);
    expect(useAudioStore.getState().lfoBank.b.rate).toBeCloseTo(newRate);
  });

  it("dragging Rate Drift calls setLfoBank('b', { rateDrift }) with the dragged percent divided by 100, leaving depthDrift untouched", () => {
    useAudioStore.setState((s) => ({ lfoBank: { ...s.lfoBank, b: { ...s.lfoBank.b, rateDrift: 0, depthDrift: 0.5 } } }));
    render(<LfoBankLanePanel lane="b" />);
    const rateDriftSlider = screen.getByRole('slider', { name: 'Rate Drift' });
    rateDriftSlider.focus();
    fireEvent.keyDown(rateDriftSlider, { key: 'ArrowRight' });

    const newPercent = Number(rateDriftSlider.getAttribute('aria-valuenow'));
    expect(newPercent).not.toBe(0);
    expect(useAudioStore.getState().lfoBank.b.rateDrift).toBeCloseTo(newPercent / 100);
    expect(useAudioStore.getState().lfoBank.b.depthDrift).toBe(0.5);
  });

  it("dragging Depth Drift calls setLfoBank('b', { depthDrift }) with the dragged percent divided by 100, leaving rateDrift untouched", () => {
    useAudioStore.setState((s) => ({ lfoBank: { ...s.lfoBank, b: { ...s.lfoBank.b, rateDrift: 0.5, depthDrift: 0 } } }));
    render(<LfoBankLanePanel lane="b" />);
    const depthDriftSlider = screen.getByRole('slider', { name: 'Depth Drift' });
    depthDriftSlider.focus();
    fireEvent.keyDown(depthDriftSlider, { key: 'ArrowRight' });

    const newPercent = Number(depthDriftSlider.getAttribute('aria-valuenow'));
    expect(newPercent).not.toBe(0);
    expect(useAudioStore.getState().lfoBank.b.depthDrift).toBeCloseTo(newPercent / 100);
    expect(useAudioStore.getState().lfoBank.b.rateDrift).toBe(0.5);
  });

  it('Shape and Rate render enabled, never greyed, regardless of driftHeldOff', () => {
    useAudioStore.setState({ driftHeldOff: true });
    render(<LfoBankLanePanel lane="b" />);
    const shapeGroup = screen.getByRole('group', { name: 'Shape' });
    expect(shapeGroup.getAttribute('data-disabled')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('data-disabled')).toBeNull();
  });

  it('both sliders render enabled when the drift tier is not held off', () => {
    render(<LfoBankLanePanel lane="b" />);
    for (const slider of [screen.getByRole('slider', { name: 'Rate Drift' }), screen.getByRole('slider', { name: 'Depth Drift' })]) {
      expect(slider.getAttribute('data-disabled')).toBeNull();
    }
  });

  it('greys out only the two drift sliders, with a label, while the drift tier is off — shows 0 not the real stored value — and restores them', async () => {
    useAudioStore.setState((s) => ({
      lfoBank: { ...s.lfoBank, b: { ...s.lfoBank.b, rateDrift: 0.4, depthDrift: -0.25 } },
      driftHeldOff: true,
    }));
    render(<LfoBankLanePanel lane="b" />);
    const rateDriftSlider = screen.getByRole('slider', { name: 'Rate Drift' });
    const depthDriftSlider = screen.getByRole('slider', { name: 'Depth Drift' });
    expect(rateDriftSlider.getAttribute('data-disabled')).not.toBeNull();
    expect(depthDriftSlider.getAttribute('data-disabled')).not.toBeNull();
    expect(rateDriftSlider.getAttribute('aria-valuenow')).toBe('0');
    expect(depthDriftSlider.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('Held off by Audio Load')).toBeTruthy();
    expect(rateDriftSlider.closest('.audio-rig-drawer__param-row')?.classList.contains('sc-held-off')).toBe(true);

    act(() => useAudioStore.setState({ driftHeldOff: false }));
    // SliderCenteredZero eases a non-drag value change over 250ms (Crawford's own request) — the
    // shared gsap mock (vitest.setup.ts) settles the tween's onComplete on the next microtask.
    await act(async () => { await Promise.resolve(); });

    const restoredRateDrift = screen.getByRole('slider', { name: 'Rate Drift' });
    const restoredDepthDrift = screen.getByRole('slider', { name: 'Depth Drift' });
    expect(restoredRateDrift.getAttribute('aria-valuenow')).toBe('40');
    expect(restoredDepthDrift.getAttribute('aria-valuenow')).toBe('-25');
    expect(restoredRateDrift.closest('.audio-rig-drawer__param-row')?.classList.contains('sc-held-off')).toBe(false);
    expect(screen.queryByText('Held off by Audio Load')).toBeNull();
  });

  it("uses lane b's own panel label from LFO_BANK_LANE_SCHEMAS (fleet.lfoBank.laneB — 'Companion LFO')", () => {
    const { container } = render(<LfoBankLanePanel lane="b" />);
    expect(within(container).getByText('Companion LFO')).toBeTruthy();
  });

  it('renders a different lane\'s own stored values for lane "d"', () => {
    useAudioStore.setState((s) => ({ lfoBank: { ...s.lfoBank, d: { shape: 'triangle', rate: 7, rateDrift: 0, depthDrift: 0 } } }));
    const { container } = render(<LfoBankLanePanel lane="d" />);
    expect(within(container).getByText('Overtone LFO')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('aria-valuenow')).toBe('7');
  });
});

/**
 * Free | Sync on the lane's Rate (docs/specs/FREE_SYNC_TOGGLE.md §1.4, Task 10): Rate renders through
 * TempoSyncSlider, whose toggle goes through the store's setLfoBankLaneSyncMode and whose two value
 * callbacks write `rate` (Free) or `sync` (Sync) through setLfoBank. Asserted against the real store
 * with only the Tone-backed lfoEngine mocked, so a wrong wiring shows up as the wrong state.
 */
describe('LfoBankLanePanel — Free | Sync on Rate', () => {
  beforeEach(() => {
    useAudioStore.setState({
      bpm: 60,
      driftHeldOff: false,
      lfoBank: Object.fromEntries(LFO_LANE_IDS.map((l) => [l, { ...DEFAULT_BANK_LFO }])) as Record<LfoLaneId, BankLfoSettings>,
    });
    vi.mocked(lfoEngine.setBankRate).mockClear();
  });

  describe('Free (no sync stored)', () => {
    it('shows an unchecked Tempo Sync switch with the Float facade beside the unchanged Free Rate slider', () => {
      setLane('b', { rate: 3 });
      render(<LfoBankLanePanel lane="b" />);
      expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
      expect(facadeCurrentLabels(tempoToggle())).toEqual(FREE);
      expect(rateThumb().getAttribute('aria-valuenow')).toBe('3');
      expect(rateThumb().hasAttribute('aria-valuetext')).toBe(false);
    });

    it('a Free edit writes `rate` and leaves the lane without a `sync` key', () => {
      setLane('b', { rate: 1 });
      render(<LfoBankLanePanel lane="b" />);
      rateThumb().focus();
      fireEvent.keyDown(rateThumb(), { key: 'ArrowRight' });
      const lane = useAudioStore.getState().lfoBank.b;
      expect(lane.rate).not.toBe(1);
      expect('sync' in lane).toBe(false);
    });
  });

  describe('Sync (a note stored)', () => {
    it('shows a checked switch with the Anchored facade and the note\'s index on the Rate thumb, announced by name', () => {
      setLane('b', { rate: 19, sync: nv('1/8', 'dotted') });
      render(<LfoBankLanePanel lane="b" />);
      const list = allowedLaneNoteValues(60);
      expect(tempoToggle().getAttribute('aria-checked')).toBe('true');
      expect(facadeCurrentLabels(tempoToggle())).toEqual(SYNC);
      expect(rateThumb().getAttribute('aria-valuenow')).toBe(String(list.findIndex((n) => noteValueEquals(n, nv('1/8', 'dotted')))));
      expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/8', 'dotted')));
      expect(rateThumb().getAttribute('aria-valuemax')).toBe(String(list.length - 1));
    });

    it('ignores the stored Free rate while synced — it never moves the Sync thumb', () => {
      setLane('b', { rate: 0, sync: nv('1/4') });
      render(<LfoBankLanePanel lane="b" />);
      expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/4')));
    });

    it('a step writes `sync` with the next note, keeps the Free `rate`, and pushes that note\'s Hz to the engine', () => {
      setLane('b', { rate: 1.25, sync: nv('1/4') });
      render(<LfoBankLanePanel lane="b" />);
      const list = allowedLaneNoteValues(60);
      const next = list[list.findIndex((n) => noteValueEquals(n, nv('1/4'))) + 1];
      rateThumb().focus();
      fireEvent.keyDown(rateThumb(), { key: 'ArrowRight' });
      const lane = useAudioStore.getState().lfoBank.b;
      expect(lane.sync).toEqual(next);
      expect(lane.rate).toBe(1.25);
      expect(lfoEngine.setBankRate).toHaveBeenLastCalledWith('b', noteValueHz(next, 60));
    });

    it('a step never writes `rate` — the Free value underneath stays exactly as stored', () => {
      setLane('b', { rate: 7.5, sync: nv('1/2') });
      render(<LfoBankLanePanel lane="b" />);
      rateThumb().focus();
      fireEvent.keyDown(rateThumb(), { key: 'ArrowLeft' });
      expect(useAudioStore.getState().lfoBank.b.rate).toBe(7.5);
    });

    it('a stored fast note is clamped to the fastest stop at a tempo that pushes it past 20 Hz, and restores when the tempo comes back', async () => {
      // 1/32 triplet is 12 Hz at 60 BPM (in range) and 40 Hz at 200 BPM (past the cap).
      setLane('b', { sync: nv('1/32', 'triplet') });
      render(<LfoBankLanePanel lane="b" />);
      expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/32', 'triplet')));

      act(() => useAudioStore.setState({ bpm: 200 }));
      await act(async () => { await Promise.resolve(); }); // the slider eases a non-drag change
      const fast = allowedLaneNoteValues(200);
      expect(rateThumb().getAttribute('aria-valuemax')).toBe(String(fast.length - 1));
      expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(fast[fast.length - 1]));
      expect(useAudioStore.getState().lfoBank.b.sync).toEqual(nv('1/32', 'triplet')); // display-only: nothing written

      act(() => useAudioStore.setState({ bpm: 60 }));
      await act(async () => { await Promise.resolve(); });
      expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/32', 'triplet')));
    });

    it('an unrecognised stored `sync` reads as Free, matching what the resolvers do to the audio', () => {
      setLane('b', { rate: 3, sync: { division: '1/3', modifier: 'straight' } as unknown as NoteValue });
      render(<LfoBankLanePanel lane="b" />);
      expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
      expect(rateThumb().getAttribute('aria-valuenow')).toBe('3');
      expect(rateThumb().hasAttribute('aria-valuetext')).toBe(false);
    });
  });

  describe('the toggle', () => {
    it('Float -> Anchored writes the nearest note at the current tempo, via setLfoBankLaneSyncMode', () => {
      setLane('b', { rate: 1 }); // 1 Hz at 60 BPM is exactly a quarter note
      render(<LfoBankLanePanel lane="b" />);
      fireEvent.click(tempoToggle());
      expect(useAudioStore.getState().lfoBank.b.sync).toEqual(nv('1/4'));
      expect(tempoToggle().getAttribute('aria-checked')).toBe('true');
    });

    it('Float -> Anchored at a different tempo snaps to that tempo\'s nearest note', () => {
      useAudioStore.setState({ bpm: 120 });
      setLane('b', { rate: 1 }); // 1 Hz at 120 BPM is two beats: a half note
      render(<LfoBankLanePanel lane="b" />);
      fireEvent.click(tempoToggle());
      expect(useAudioStore.getState().lfoBank.b.sync).toEqual(nv('1/2'));
    });

    it('Anchored -> Float removes the `sync` key entirely and keeps what was heard', () => {
      setLane('b', { rate: 19, sync: nv('1/8', 'dotted') }); // 0.75 s at 60 BPM = 1.333 Hz
      render(<LfoBankLanePanel lane="b" />);
      fireEvent.click(tempoToggle());
      const lane = useAudioStore.getState().lfoBank.b;
      expect('sync' in lane).toBe(false);
      expect(lane.rate).toBeCloseTo(1.35, 10); // quantised to the slider's 0.05 step
      expect(tempoToggle().getAttribute('aria-checked')).toBe('false');
    });

    it('a Float -> Anchored -> Float round trip leaves no `sync` key', () => {
      setLane('b', { rate: 2 });
      render(<LfoBankLanePanel lane="b" />);
      fireEvent.click(tempoToggle());
      expect('sync' in useAudioStore.getState().lfoBank.b).toBe(true);
      fireEvent.click(tempoToggle());
      expect('sync' in useAudioStore.getState().lfoBank.b).toBe(false);
    });

    it('flipping to Anchored leaves the lane\'s shape and drifts alone', () => {
      setLane('b', { shape: 'square', rateDrift: 0.3, depthDrift: -0.4, rate: 2 });
      render(<LfoBankLanePanel lane="b" />);
      fireEvent.click(tempoToggle());
      const lane = useAudioStore.getState().lfoBank.b;
      expect(lane.shape).toBe('square');
      expect(lane.rateDrift).toBe(0.3);
      expect(lane.depthDrift).toBe(-0.4);
    });

    it('only this lane changes — the other three lanes keep their Free rates and gain no `sync`', () => {
      setLane('c', { rate: 4 });
      render(<LfoBankLanePanel lane="b" />);
      fireEvent.click(tempoToggle());
      for (const other of ['a', 'c', 'd'] as const) expect('sync' in useAudioStore.getState().lfoBank[other]).toBe(false);
      expect(useAudioStore.getState().lfoBank.c.rate).toBe(4);
    });

    it('stays a working, enabled control while Audio Load holds the drift tier off', () => {
      useAudioStore.setState({ driftHeldOff: true });
      render(<LfoBankLanePanel lane="b" />);
      expect(tempoToggle().hasAttribute('disabled')).toBe(false);
      expect(rateThumb().getAttribute('data-disabled')).toBeNull();
      fireEvent.click(tempoToggle());
      expect('sync' in useAudioStore.getState().lfoBank.b).toBe(true);
    });
  });

  // The toggle sits in its own row UNDER the Rate slider it affects (Crawford, 2026-10-03), inside
  // Rate's own param-row; the Shape (Mutation Type) row is untouched.
  describe('where the toggle lives', () => {
    it('is in the Rate row, after the Rate slider', () => {
      render(<LfoBankLanePanel lane="b" />);
      const rateRow = rateThumb().closest('.audio-rig-drawer__param-row');
      expect(rateRow).not.toBeNull();
      expect(rateRow!.contains(tempoToggle())).toBe(true);
      expect(rateThumb().compareDocumentPosition(tempoToggle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('is not in the Shape (Mutation Type) row, which holds only the shape options', () => {
      render(<LfoBankLanePanel lane="b" />);
      const shapeRow = screen.getByRole('group', { name: 'Shape' }).closest('.audio-rig-drawer__param-row');
      expect(shapeRow).not.toBeNull();
      expect(shapeRow!.contains(tempoToggle())).toBe(false);
      expect(shapeRow!.querySelector('[role="switch"]')).toBeNull();
    });

    it('is not in either drift row', () => {
      render(<LfoBankLanePanel lane="b" />);
      for (const name of ['Rate Drift', 'Depth Drift']) {
        const row = screen.getByRole('slider', { name }).closest('.audio-rig-drawer__param-row');
        expect(row!.querySelector('[role="switch"]'), name).toBeNull();
      }
    });

    it('leaves the panel with exactly four param-rows: Shape, Rate (slider + toggle), Rate Drift, Depth Drift', () => {
      const { container } = render(<LfoBankLanePanel lane="b" />);
      expect(container.querySelectorAll('.audio-rig-drawer__param-row')).toHaveLength(4);
    });
  });

  describe('every lane renders the composition', () => {
    it.each(LFO_LANE_IDS)('lane %s has a Tempo Sync switch and a Rate slider, and flips independently', (lane) => {
      render(<LfoBankLanePanel lane={lane} />);
      expect(tempoToggle()).toBeTruthy();
      expect(rateThumb()).toBeTruthy();
      fireEvent.click(tempoToggle());
      expect('sync' in useAudioStore.getState().lfoBank[lane]).toBe(true);
      for (const other of LFO_LANE_IDS.filter((l) => l !== lane)) {
        expect('sync' in useAudioStore.getState().lfoBank[other]).toBe(false);
      }
    });
  });

  describe('the rest of the panel is unchanged', () => {
    it('still renders Shape, Rate Drift and Depth Drift beside the new Rate row', () => {
      render(<LfoBankLanePanel lane="b" />);
      expect(screen.getByRole('group', { name: 'Shape' })).toBeTruthy();
      expect(screen.getByRole('slider', { name: 'Rate Drift' })).toBeTruthy();
      expect(screen.getByRole('slider', { name: 'Depth Drift' })).toBeTruthy();
      expect(screen.getAllByRole('slider')).toHaveLength(3);
      expect(screen.getAllByRole('switch')).toHaveLength(1);
    });

    it('drift held-off behaviour is as before: drift greyed and shown as 0, Rate row untouched, held-off note shown', () => {
      setLane('b', { rateDrift: 0.4, depthDrift: -0.25, sync: nv('1/4') });
      useAudioStore.setState({ driftHeldOff: true });
      render(<LfoBankLanePanel lane="b" />);
      expect(screen.getByRole('slider', { name: 'Rate Drift' }).getAttribute('data-disabled')).not.toBeNull();
      expect(screen.getByRole('slider', { name: 'Rate Drift' }).getAttribute('aria-valuenow')).toBe('0');
      expect(rateThumb().getAttribute('data-disabled')).toBeNull();
      expect(rateThumb().getAttribute('aria-valuetext')).toBe(formatNoteValue(nv('1/4')));
      expect(screen.getByText('Held off by Audio Load')).toBeTruthy();
    });
  });
});
