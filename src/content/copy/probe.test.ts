/**
 * Parity test (docs/tasks/CONTENT_LAYER.md Task 4): the probe area is a byte-for-byte copy of
 * the literals it replaces. Deleted piecewise as each source migrates (robotOptions/selection
 * configs → Tasks 8/9, subsection config → Task 11, intros → Task 13).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { probe } from './probe';
import { NAV_TREE_SCHEMA } from '@/data/navTreeConfig';
import { ROBOT_SECTIONS_CONFIG } from '@/data/robotSubsectionConfig';
import {
  AUDIO_SETTING_SCHEMA, VOLUME_SCHEMA, PHRASING_PANEL_SCHEMA, RHYTHM_PANEL_SCHEMA, FREQUENCY_PANEL_SCHEMA,
  CLICK_TRACK_SCHEMA, DENSITY_SCHEMA, MOTIF_LENGTH_SCHEMA, PITCH_REPEAT_SCHEMA, OCTAVE_RANGE_MIN_SCHEMA,
  OCTAVE_RANGE_MAX_SCHEMA, NOTE_VARIANCE_SCHEMA, PING_CONTOUR_PANEL_SCHEMA, ATTACK_SCHEMA, DECAY_SCHEMA,
  SUSTAIN_SCHEMA, RELEASE_SCHEMA, SIGNATURE_ARRAY_CONFIG,
} from '@/data/robotOptionsConfig';
import {
  ROBOT_SELECTION_ROW_SCHEMAS, BATTERY_READOUT_SCHEMA, JOB_TYPE_LABELS, UNASSIGNED_JOB_LABEL,
  DOCKING_STATE_LABELS, AUDIO_MODE_LABELS, AUDIBILITY_LABELS,
} from '@/data/robotSelectionConfig';
import type { ControlSchema } from '@/types/controls';

type ProbeKey = keyof typeof probe;
type Entry = { human: string; lore?: string; heading?: string; unit?: string; options?: Record<string, { human: string; lore?: string }> };
const e = (k: ProbeKey) => probe[k] as Entry;
const src = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf8').replace(/'\s*\n\s*\+\s*'/g, '');

describe('probe content parity — nav tree', () => {
  it('probes / probes.all', () => {
    const probes = NAV_TREE_SCHEMA.find((n) => n.id === 'probes')!;
    expect([e('probe.root').human, e('probe.root').lore]).toEqual([probes.humanLabel, probes.loreLabel]);
    const all = probes.children!.find((n) => n.id === 'probes.all')!;
    expect(e('probe.all').human).toBe(all.humanLabel);
    expect(e('probe.all').lore).toBe(all.loreLabel);
  });
});

describe('probe content parity — robotSubsectionConfig', () => {
  const SECTION: Record<string, ProbeKey> = { volume: 'probe.dynamics', melody: 'probe.composition', envelope: 'probe.envelope', source: 'probe.source' };
  const ROW: Record<string, ProbeKey> = {
    audioSettings: 'probe.dynamics.levelControl', rhythm: 'probe.composition.rhythm', frequency: 'probe.composition.pitches',
    pingContour: 'probe.envelope.contour', baselineOscillator: 'probe.source.core', coaxialOscillator: 'probe.source.companion', harmonicOscillator: 'probe.source.accent',
  };
  const ACCORDION: Record<string, ProbeKey> = {
    audioSettings: 'probe.levels', rhythm: 'probe.composition', pingContour: 'probe.envelope',
    baselineOscillator: 'probe.source.core', coaxialOscillator: 'probe.source.companion', harmonicOscillator: 'probe.source.accent',
  };

  it.each(ROBOT_SECTIONS_CONFIG.map((s) => [s.id, s] as const))('section %s row', (id, s) => {
    expect([e(SECTION[id]).human, e(SECTION[id]).lore]).toEqual([s.navLabel, s.loreLabel]);
    if (s.ownAccordionLabel) expect(e(SECTION[id]).human).toBe(s.ownAccordionLabel);
  });

  it.each(ROBOT_SECTIONS_CONFIG.flatMap((s) => s.subsections.map((sub) => [sub.id, sub] as const)))('subsection %s row + accordion', (id, sub) => {
    expect([e(ROW[id]).human, e(ROW[id]).lore]).toEqual([sub.navLabel, sub.loreLabel]);
    if (sub.accordionLabel) expect(e(ACCORDION[id]).human).toBe(sub.accordionLabel);
    else expect(ACCORDION[id]).toBeUndefined();
  });
});

describe('probe content parity — robotOptionsConfig', () => {
  const LABELS: Array<[ControlSchema & { unit?: string }, ProbeKey]> = [
    [AUDIO_SETTING_SCHEMA, 'probe.monitorMode'], [VOLUME_SCHEMA, 'probe.volume'], [CLICK_TRACK_SCHEMA, 'probe.composition.clickTrack'],
    [DENSITY_SCHEMA, 'probe.composition.noteDensity'], [MOTIF_LENGTH_SCHEMA, 'probe.composition.phraseLength'],
    [PITCH_REPEAT_SCHEMA, 'probe.composition.pitchRepeat'], [OCTAVE_RANGE_MIN_SCHEMA, 'probe.composition.lowestOctave'],
    [OCTAVE_RANGE_MAX_SCHEMA, 'probe.composition.highestOctave'], [NOTE_VARIANCE_SCHEMA, 'probe.composition.noteVariance'],
    [PING_CONTOUR_PANEL_SCHEMA, 'probe.envelope.contour'], [ATTACK_SCHEMA, 'probe.envelope.attack'], [DECAY_SCHEMA, 'probe.envelope.decay'],
    [SUSTAIN_SCHEMA, 'probe.envelope.sustain'], [RELEASE_SCHEMA, 'probe.envelope.release'],
  ];
  it.each(LABELS.map(([s, k]) => [s.id, s, k] as const))('%s ↔ %s', (_id, s, k) => {
    expect([e(k).human, e(k).lore, e(k).unit]).toEqual([s.humanLabel, s.loreLabel, s.unit]);
  });

  it.each([
    [PHRASING_PANEL_SCHEMA, 'probe.composition.phrasing'], [RHYTHM_PANEL_SCHEMA, 'probe.composition.rhythm'], [FREQUENCY_PANEL_SCHEMA, 'probe.composition.pitches'],
  ] as const)('panel %s: lore → heading', (s, k) => {
    expect(e(k).human).toBe(s.humanLabel);
    expect(e(k).heading).toBe(s.loreLabel);
  });

  it('monitor mode options', () => {
    expect(AUDIO_SETTING_SCHEMA.options.map((o) => [o.value, o.label, o.loreLabel])).toEqual(
      Object.entries(e('probe.monitorMode').options!).map(([v, o]) => [v, o.human, o.lore]),
    );
  });

  it.each(SIGNATURE_ARRAY_CONFIG.map((b) => [b.key, b] as const))('signature array %s', (key, block) => {
    const layer = ({ layer0: 'core', layer1: 'companion', layer2: 'accent' } as const)[key];
    const root = e(`probe.source.${layer}` as ProbeKey);
    expect(root.lore).toBe(block.loreLabel);
    expect(root.human.startsWith(block.humanLabel)).toBe(true); // 'Core Oscillator' vs panel 'Core' — inventory conflict row
    const FIELD = { type: 'type', gain: 'gain', detune: 'detune', phase: 'phase', pulseWidth: 'interval' } as const;
    for (const p of block.params) {
      const k = `probe.source.${layer}.${FIELD[p.field]}` as ProbeKey;
      const s = p.schema as ControlSchema & { unit?: string; options?: { value: string; label: string; loreLabel?: string }[] };
      expect([e(k).human, e(k).lore, e(k).unit], k).toEqual([s.humanLabel, s.loreLabel, s.unit]);
      if (s.options) expect(s.options.map((o) => [o.value, o.label, o.loreLabel])).toEqual(Object.entries(e(k).options!).map(([v, o]) => [v, o.human, o.lore]));
    }
  });
});

describe('probe content parity — robotSelectionConfig', () => {
  it('row schemas + battery', () => {
    const rows = ROBOT_SELECTION_ROW_SCHEMAS;
    expect([e('probe.name').human, e('probe.name').lore]).toEqual([rows.name.humanLabel, rows.name.loreLabel]);
    expect([e('probe.job').human, e('probe.job').lore]).toEqual([rows.job.humanLabel, rows.job.loreLabel]);
    expect([e('probe.status.docking').human, e('probe.status.docking').lore]).toEqual([rows.docking.humanLabel, rows.docking.loreLabel]);
    expect([e('probe.status').human, e('probe.status').lore]).toEqual([rows.status.humanLabel, rows.status.loreLabel]);
    expect([e('probe.battery').human, e('probe.battery').lore, e('probe.battery').unit]).toEqual([BATTERY_READOUT_SCHEMA.humanLabel, BATTERY_READOUT_SCHEMA.loreLabel, BATTERY_READOUT_SCHEMA.unit]);
  });

  const asPairs = (m: Record<string, { humanLabel: string; loreLabel: string }>) => Object.entries(m).map(([v, l]) => [v, l.humanLabel, l.loreLabel]);
  const asOpts = (k: ProbeKey) => Object.entries(e(k).options!).map(([v, o]) => [v, o.human, o.lore]);

  it('value-label maps ↔ options', () => {
    expect(asOpts('probe.job')).toEqual(asPairs(JOB_TYPE_LABELS));
    expect([e('probe.job.unassigned').human, e('probe.job.unassigned').lore]).toEqual([UNASSIGNED_JOB_LABEL.humanLabel, UNASSIGNED_JOB_LABEL.loreLabel]);
    expect(asOpts('probe.status.docking')).toEqual(asPairs(DOCKING_STATE_LABELS));
    expect(asOpts('probe.status.monitorMode')).toEqual(asPairs(AUDIO_MODE_LABELS));
    expect(asOpts('probe.status')).toEqual(asPairs(AUDIBILITY_LABELS));
  });
});

describe('probe content parity — component source text', () => {
  const probes = src('components/panels/screen/nav/content/ProbesContent.tsx');
  const stack = src('components/panels/screen/nav/RobotSectionAccordionStack.tsx');
  const tab = src('components/panels/screen/console/RobotOptionsTab.tsx');

  it.each(['probe.root', 'probe.all'] as const)('%s intro in ProbesContent', (k) => {
    const { lore, loreDescription, humanDescription } = probe[k].intro;
    for (const s of [lore, loreDescription, humanDescription]) expect(probes).toContain(s);
  });
  it.each(['probe.levels', 'probe.composition', 'probe.envelope', 'probe.source'] as const)('%s intro in RobotSectionAccordionStack', (k) => {
    const { lore, loreDescription, humanDescription } = probe[k].intro;
    for (const s of [lore, loreDescription, humanDescription]) expect(stack).toContain(s);
  });
  it('Robot not found', () => {
    expect(tab).toContain(`>${e('probe.notFound').human}<`);
  });
});
