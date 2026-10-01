// ========================================
// IMPORTS
// ========================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  ROBOT_SECTIONS_CONFIG,
  SOURCE_OSCILLATOR_SUBSECTIONS,
  subsectionIds,
  accordionIds,
} from './robotSubsectionConfig';
import { CONTENT, labels } from '@/content';

// ========================================
// TESTS
// ========================================

describe('ROBOT_SECTIONS_CONFIG', () => {
  it('has exactly 4 entries, in volume/melody/envelope/source order', () => {
    expect(ROBOT_SECTIONS_CONFIG.map((s) => s.id)).toEqual(['volume', 'melody', 'envelope', 'source']);
  });

  it('carries no label string of its own — every row and accordion is a content key that exists (docs/specs/CONTENT_LAYER.md, Task 11)', () => {
    const src = readFileSync(resolve(__dirname, 'robotSubsectionConfig.ts'), 'utf8');
    expect(src).not.toMatch(/(loreLabel|humanLabel|navLabel|accordionLabel|ownAccordionLabel)\s*:/);
    for (const section of ROBOT_SECTIONS_CONFIG) {
      expect(CONTENT, section.id).toHaveProperty(section.content);
      if (section.accordion) expect(CONTENT).toHaveProperty(section.accordion);
      for (const sub of section.subsections) {
        expect(CONTENT, sub.id).toHaveProperty(sub.content);
        if (sub.accordion) expect(CONTENT).toHaveProperty(sub.accordion);
      }
    }
  });

  it('gives every section its nav-row concept and trait', () => {
    const byId = Object.fromEntries(ROBOT_SECTIONS_CONFIG.map((s) => [s.id, s]));
    expect(byId.volume).toMatchObject({ content: 'probe.dynamics', trait: 'output' });
    expect(byId.melody).toMatchObject({ content: 'probe.composition', trait: 'composition' });
    expect(byId.envelope).toMatchObject({ content: 'probe.envelope', trait: 'timeSpace' });
    expect(byId.source).toMatchObject({ content: 'probe.source', trait: 'spectral' });
    expect(labels(byId.volume.content).humanLabel).toBe(CONTENT['probe.dynamics'].human);
  });

  it('only "source" wraps its subsections in its own accordion — volume/melody/envelope have none', () => {
    const byId = Object.fromEntries(ROBOT_SECTIONS_CONFIG.map((s) => [s.id, s]));
    expect(byId.volume.accordion).toBeUndefined();
    expect(byId.melody.accordion).toBeUndefined();
    expect(byId.envelope.accordion).toBeUndefined();
    expect(byId.source.accordion).toBe('probe.source');
  });

  it("volume's one subsection is Levels' own accordion, with Level Control as its row concept", () => {
    const volume = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'volume')!;
    expect(volume.subsections).toEqual([{ id: 'audioSettings', content: 'probe.dynamics.levelControl', accordion: 'probe.levels' }]);
    expect(CONTENT['probe.dynamics.levelControl'].human).not.toBe(CONTENT['probe.levels'].human);
  });

  it("melody's rhythm row and its Composition accordion are two distinct concepts", () => {
    const melody = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'melody')!;
    const rhythm = melody.subsections.find((s) => s.id === 'rhythm')!;
    expect(rhythm.content).toBe('probe.composition.rhythm');
    expect(rhythm.accordion).toBe('probe.composition');
    expect(rhythm.mergedInto).toBeUndefined();
    expect(labels(rhythm.content).humanLabel).toBe(CONTENT['probe.composition.rhythm'].human);
    expect(labels(rhythm.accordion!).humanLabel).toBe(CONTENT['probe.composition'].human);
    expect(CONTENT['probe.composition.rhythm'].human).not.toBe(CONTENT['probe.composition'].human);
  });

  it('melody\'s frequency ("Pitches") has no accordion of its own — merged into rhythm', () => {
    const melody = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'melody')!;
    const frequency = melody.subsections.find((s) => s.id === 'frequency')!;
    expect(frequency.content).toBe('probe.composition.pitches');
    expect(frequency.accordion).toBeUndefined();
    expect(frequency.mergedInto).toBe('rhythm');
  });

  it("melody's subsections are ordered rhythm then frequency", () => {
    const melody = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'melody')!;
    expect(melody.subsections.map((s) => s.id)).toEqual(['rhythm', 'frequency']);
  });

  it("envelope's one subsection is Envelope's own accordion, with Contour as its row concept", () => {
    const envelope = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'envelope')!;
    expect(envelope.subsections).toEqual([{ id: 'pingContour', content: 'probe.envelope.contour', accordion: 'probe.envelope' }]);
  });

  it("source's 3 subsections each keep their own accordion (same concept as the row), in oscillator order", () => {
    const source = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'source')!;
    expect(source.subsections).toEqual([
      { id: 'baselineOscillator', content: 'probe.source.core', accordion: 'probe.source.core' },
      { id: 'coaxialOscillator', content: 'probe.source.companion', accordion: 'probe.source.companion' },
      { id: 'harmonicOscillator', content: 'probe.source.accent', accordion: 'probe.source.accent' },
    ]);
  });

  it('every subsection other than frequency has its own accordion and no mergedInto', () => {
    for (const section of ROBOT_SECTIONS_CONFIG) {
      for (const sub of section.subsections) {
        if (sub.id === 'frequency') continue;
        expect(sub.accordion, `${sub.id} should have an accordion`).toBeDefined();
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
