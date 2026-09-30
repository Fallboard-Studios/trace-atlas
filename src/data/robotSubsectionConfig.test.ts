// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  ROBOT_SECTIONS_CONFIG,
  SOURCE_OSCILLATOR_SUBSECTIONS,
  subsectionIds,
  accordionIds,
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
    expect(byId.volume).toMatchObject({ loreLabel: 'Output', navLabel: 'Dynamics', trait: 'output' });
    expect(byId.melody).toMatchObject({ loreLabel: 'Payload Registrar', navLabel: 'Composition', trait: 'composition' });
    expect(byId.envelope).toMatchObject({ loreLabel: 'Ping Shell', navLabel: 'Envelope', trait: 'timeSpace' });
    expect(byId.source).toMatchObject({ loreLabel: 'Telemetry', navLabel: 'Source', trait: 'spectral' });
  });

  it('only "source" wraps its subsections in its own accordion — volume/melody/envelope have none', () => {
    const byId = Object.fromEntries(ROBOT_SECTIONS_CONFIG.map((s) => [s.id, s]));
    expect(byId.volume.ownAccordionLabel).toBeUndefined();
    expect(byId.melody.ownAccordionLabel).toBeUndefined();
    expect(byId.envelope.ownAccordionLabel).toBeUndefined();
    expect(byId.source.ownAccordionLabel).toBe('Source');
  });

  it("volume's one subsection is Levels' own accordion (Level Control as its nav label)", () => {
    const volume = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'volume')!;
    expect(volume.subsections).toEqual([
      { id: 'audioSettings', loreLabel: 'Ops Clarity', navLabel: 'Level Control', accordionLabel: 'Levels' },
    ]);
  });

  it("melody's rhythm subsection keeps its Composition accordion label, distinct from its Rhythm nav label", () => {
    const melody = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'melody')!;
    const rhythm = melody.subsections.find((s) => s.id === 'rhythm')!;
    expect(rhythm.loreLabel).toBe('Payload Map');
    expect(rhythm.navLabel).toBe('Rhythm');
    expect(rhythm.accordionLabel).toBe('Composition');
    expect(rhythm.mergedInto).toBeUndefined();
  });

  it('melody\'s frequency ("Pitches") has no accordion of its own — merged into rhythm', () => {
    const melody = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'melody')!;
    const frequency = melody.subsections.find((s) => s.id === 'frequency')!;
    expect(frequency.loreLabel).toBe('Payload Allocation');
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
      { id: 'pingContour', loreLabel: 'Ping Profile', navLabel: 'Contour', accordionLabel: 'Envelope' },
    ]);
  });

  it("source's 3 subsections each keep their own accordion, in oscillator order", () => {
    const source = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'source')!;
    expect(source.subsections).toEqual([
      { id: 'baselineOscillator', loreLabel: 'Baseline Feed', navLabel: 'Core Oscillator', accordionLabel: 'Core Oscillator' },
      { id: 'coaxialOscillator', loreLabel: 'Coaxial Effect', navLabel: 'Companion Oscillator', accordionLabel: 'Companion Oscillator' },
      { id: 'harmonicOscillator', loreLabel: 'Offset Matrix', navLabel: 'Accent Oscillator', accordionLabel: 'Accent Oscillator' },
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

describe('SOURCE_OSCILLATOR_SUBSECTIONS', () => {
  it('lists exactly the 3 oscillator layer ids, in layer order', () => {
    expect(SOURCE_OSCILLATOR_SUBSECTIONS).toEqual(['baselineOscillator', 'coaxialOscillator', 'harmonicOscillator']);
  });
});

describe('subsectionIds', () => {
  it('lists exactly the 6 accordion-bearing subsection ids, in tree order, excluding frequency', () => {
    expect(subsectionIds('probes.r1')).toEqual([
      'probes.r1.volume.audioSettings',
      'probes.r1.melody.rhythm',
      'probes.r1.envelope.pingContour',
      'probes.r1.source.baselineOscillator',
      'probes.r1.source.coaxialOscillator',
      'probes.r1.source.harmonicOscillator',
    ]);
  });

  it('reflects whatever prefix is given — company/All-Probes mode included', () => {
    expect(subsectionIds('companies.c1')[0]).toBe('companies.c1.volume.audioSettings');
  });
});

describe('accordionIds', () => {
  it("lists the 6 subsection ids plus source's own wrapping accordion id, in order", () => {
    expect(accordionIds('probes.r1')).toEqual([
      'probes.r1.volume.audioSettings',
      'probes.r1.melody.rhythm',
      'probes.r1.envelope.pingContour',
      'probes.r1.source.baselineOscillator',
      'probes.r1.source.coaxialOscillator',
      'probes.r1.source.harmonicOscillator',
      'probes.r1.source',
    ]);
  });
});
