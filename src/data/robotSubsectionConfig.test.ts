// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  ROBOT_SECTIONS_CONFIG,
  FIRST_SUBSECTION_OF,
  SOURCE_OSCILLATOR_SUBSECTIONS,
  OSCILLATOR_LABELS,
} from './robotSubsectionConfig';

// ========================================
// TESTS
// ========================================

describe('ROBOT_SECTIONS_CONFIG', () => {
  it('has exactly 4 entries, in volume/melody/envelope/source order', () => {
    expect(ROBOT_SECTIONS_CONFIG.map((s) => s.id)).toEqual(['volume', 'melody', 'envelope', 'source']);
  });

  it('gives every section its current nav-tree label and trait', () => {
    const byId = Object.fromEntries(ROBOT_SECTIONS_CONFIG.map((s) => [s.id, s]));
    expect(byId.volume).toMatchObject({ navLabel: 'Levels', trait: 'output' });
    expect(byId.melody).toMatchObject({ navLabel: 'Composition', trait: 'composition' });
    expect(byId.envelope).toMatchObject({ navLabel: 'Envelope', trait: 'timeSpace' });
    expect(byId.source).toMatchObject({ navLabel: 'Source', trait: 'spectral' });
  });

  it('only "source" wraps its subsections in its own accordion — volume/melody/envelope have none', () => {
    const byId = Object.fromEntries(ROBOT_SECTIONS_CONFIG.map((s) => [s.id, s]));
    expect(byId.volume.ownAccordionLabel).toBeUndefined();
    expect(byId.melody.ownAccordionLabel).toBeUndefined();
    expect(byId.envelope.ownAccordionLabel).toBeUndefined();
    expect(byId.source.ownAccordionLabel).toBe('Source');
  });

  it("volume's one subsection is Levels' own accordion (Dynamics as its nav label)", () => {
    const volume = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'volume')!;
    expect(volume.subsections).toEqual([
      { id: 'audioSettings', navLabel: 'Dynamics', accordionLabel: 'Levels' },
    ]);
  });

  it("melody's rhythm subsection keeps its Composition accordion label, distinct from its Rhythm nav label", () => {
    const melody = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'melody')!;
    const rhythm = melody.subsections.find((s) => s.id === 'rhythm')!;
    expect(rhythm.navLabel).toBe('Rhythm');
    expect(rhythm.accordionLabel).toBe('Composition');
    expect(rhythm.mergedInto).toBeUndefined();
  });

  it('melody\'s frequency ("Pitches") has no accordion of its own — merged into rhythm', () => {
    const melody = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'melody')!;
    const frequency = melody.subsections.find((s) => s.id === 'frequency')!;
    expect(frequency.navLabel).toBe('Pitches');
    expect(frequency.accordionLabel).toBeUndefined();
    expect(frequency.mergedInto).toBe('rhythm');
  });

  it("melody's subsections are ordered rhythm then frequency", () => {
    const melody = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'melody')!;
    expect(melody.subsections.map((s) => s.id)).toEqual(['rhythm', 'frequency']);
  });

  it("envelope's one subsection is Envelope's own accordion (Contour as its nav label)", () => {
    const envelope = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'envelope')!;
    expect(envelope.subsections).toEqual([
      { id: 'pingContour', navLabel: 'Contour', accordionLabel: 'Envelope' },
    ]);
  });

  it("source's 4 subsections each keep their own accordion, in oscillator-then-drift order", () => {
    const source = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'source')!;
    expect(source.subsections).toEqual([
      { id: 'baselineOscillator', navLabel: 'Baseline Oscillator', accordionLabel: 'Baseline Oscillator' },
      { id: 'coaxialOscillator', navLabel: 'Coaxial Oscillator', accordionLabel: 'Coaxial Oscillator' },
      { id: 'harmonicOscillator', navLabel: 'Harmonic Oscillator', accordionLabel: 'Harmonic Oscillator' },
      { id: 'probeDrift', navLabel: 'Probe Drift', accordionLabel: 'Probe Drift' },
    ]);
  });

  it('every subsection other than frequency has its own accordionLabel and no mergedInto', () => {
    for (const section of ROBOT_SECTIONS_CONFIG) {
      for (const sub of section.subsections) {
        if (sub.id === 'frequency') continue;
        expect(sub.accordionLabel, `${sub.id} should have an accordionLabel`).toBeDefined();
        expect(sub.mergedInto, `${sub.id} should have no mergedInto`).toBeUndefined();
      }
    }
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(ROBOT_SECTIONS_CONFIG)).not.toThrow();
  });
});

describe('FIRST_SUBSECTION_OF (derived from ROBOT_SECTIONS_CONFIG)', () => {
  it('maps every RobotSection to its own first subsection id, unchanged from before this table existed', () => {
    expect(FIRST_SUBSECTION_OF).toEqual({
      volume: 'audioSettings',
      melody: 'rhythm',
      envelope: 'pingContour',
      source: 'baselineOscillator',
    });
  });
});

describe('SOURCE_OSCILLATOR_SUBSECTIONS / OSCILLATOR_LABELS (derived from ROBOT_SECTIONS_CONFIG)', () => {
  it('lists exactly the 3 oscillator layer ids, in layer order, excluding probeDrift', () => {
    expect(SOURCE_OSCILLATOR_SUBSECTIONS).toEqual(['baselineOscillator', 'coaxialOscillator', 'harmonicOscillator']);
  });

  it('gives every oscillator subsection its accordion label, unchanged from before this table existed', () => {
    expect(OSCILLATOR_LABELS).toEqual({
      baselineOscillator: 'Baseline Oscillator',
      coaxialOscillator: 'Coaxial Oscillator',
      harmonicOscillator: 'Harmonic Oscillator',
    });
  });

  it("OSCILLATOR_LABELS' values come from ROBOT_SECTIONS_CONFIG itself, not a second independently-typed copy", () => {
    const source = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'source')!;
    for (const id of SOURCE_OSCILLATOR_SUBSECTIONS) {
      const sub = source.subsections.find((s) => s.id === id)!;
      expect(OSCILLATOR_LABELS[id]).toBe(sub.accordionLabel);
    }
  });
});
