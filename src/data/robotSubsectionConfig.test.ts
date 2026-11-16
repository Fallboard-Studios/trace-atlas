// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  ROBOT_SECTIONS_CONFIG,
  SOURCE_OSCILLATOR_SUBSECTIONS,
  DEFAULT_ROBOT_SECTION,
  activeRobotSection,
  activeRobotSubsection,
} from './robotSubsectionConfig';
import { CONTENT, labels } from '@/content';
import type { RobotSection, RobotSubsection } from '@/stores/uiStore';

// ========================================
// TESTS
// ========================================

describe('ROBOT_SECTIONS_CONFIG', () => {
  it('has exactly 4 entries, in volume/melody/envelope/source order', () => {
    expect(ROBOT_SECTIONS_CONFIG.map((s) => s.id)).toEqual(['volume', 'melody', 'envelope', 'source']);
  });

  it('every section and sub-tab content is a content key that exists (docs/specs/CONTENT_LAYER.md, Task 11)', () => {
    for (const section of ROBOT_SECTIONS_CONFIG) {
      expect(CONTENT, section.id).toHaveProperty(section.content);
      for (const sub of section.subsections) expect(CONTENT, sub.id).toHaveProperty(sub.content);
    }
  });

  // docs/tasks/CONTENT_LAYOUT.md Task 12: a section carries its tab's content key, each subsection its sub-tab's.
  it("every section's content is its tab's name — Levels, Composition, Envelope, Source — in its trait", () => {
    expect(ROBOT_SECTIONS_CONFIG.map((s) => [s.content, s.trait])).toEqual([
      ['probe.levels', 'output'],
      ['probe.composition', 'composition'],
      ['probe.envelope', 'timeSpace'],
      ['probe.source', 'spectral'],
    ]);
  });

  it('no section or subsection carries an accordion or a mergedInto: a section is id, content, trait, subsections; a subsection id and content', () => {
    for (const section of ROBOT_SECTIONS_CONFIG) {
      expect(Object.keys(section).sort(), section.id).toEqual(['content', 'id', 'subsections', 'trait']);
      for (const sub of section.subsections) expect(Object.keys(sub).sort(), sub.id).toEqual(['content', 'id']);
    }
  });

  // docs/tasks/CONTENT_LAYOUT.md Task 16 (spec §1.3): two sub-tabs each for Levels, Composition and Envelope.
  it("each section's sub-tabs, in order, each named by its own content key", () => {
    expect(ROBOT_SECTIONS_CONFIG.map((s) => [s.id, s.subsections])).toEqual([
      ['volume', [{ id: 'mix', content: 'probe.levels.mix' }, { id: 'sends', content: 'probe.levels.sends' }]],
      ['melody', [{ id: 'rhythmMelody', content: 'probe.composition.rhythmMelody' }, { id: 'details', content: 'probe.composition.details' }]],
      ['envelope', [{ id: 'envelopeContour', content: 'probe.envelope.contour' }, { id: 'envelopeCharacter', content: 'probe.envelope.character' }]],
      ['source', ROBOT_SECTIONS_CONFIG[3].subsections],
    ]);
    expect(ROBOT_SECTIONS_CONFIG[3].subsections.map((s) => s.id)).toEqual([...SOURCE_OSCILLATOR_SUBSECTIONS, 'busFilter']);
  });

  it('the new sub-tabs read Mix, Sends, Rhythm & Melody, Details, Contour, Character (spec §1.5)', () => {
    const names = ROBOT_SECTIONS_CONFIG.slice(0, 3).flatMap((s) => s.subsections.map((sub) => labels(sub.content).humanLabel));
    expect(names).toEqual(['Mix', 'Sends', 'Rhythm & Melody', 'Details', 'Contour', 'Character']);
  });

  it('no subsection id appears twice across the sections', () => {
    const ids = ROBOT_SECTIONS_CONFIG.flatMap((s) => s.subsections.map((sub) => sub.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("source's 4 sub-tabs read Core, Companion and Accent Oscillator, then Filter (docs/specs/ROBOT_ARTICULATION.md §1.6)", () => {
    const source = ROBOT_SECTIONS_CONFIG.find((s) => s.id === 'source')!;
    expect(source.subsections).toEqual([
      { id: 'baselineOscillator', content: 'probe.source.core' },
      { id: 'coaxialOscillator', content: 'probe.source.companion' },
      { id: 'harmonicOscillator', content: 'probe.source.accent' },
      { id: 'busFilter', content: 'probe.source.filter' },
    ]);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(ROBOT_SECTIONS_CONFIG)).not.toThrow();
  });
});

describe('SOURCE_OSCILLATOR_SUBSECTIONS', () => {
  it('lists exactly the 3 oscillator layer ids, in layer order — the bus filter is a Source panel but not an oscillator layer', () => {
    expect(SOURCE_OSCILLATOR_SUBSECTIONS).toEqual(['baselineOscillator', 'coaxialOscillator', 'harmonicOscillator']);
    expect(SOURCE_OSCILLATOR_SUBSECTIONS).not.toContain('busFilter');
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 16: the robot screen's tabs, read by RobotScreen and the breadcrumb
// alike, so the two always name the same tab.
describe('the robot screen tabs', () => {
  it('names each tab Levels, Composition, Envelope, Source', () => {
    expect(ROBOT_SECTIONS_CONFIG.map((s) => labels(s.content).humanLabel)).toEqual([
      CONTENT['probe.levels'].human,
      CONTENT['probe.composition'].human,
      CONTENT['probe.envelope'].human,
      CONTENT['probe.source'].human,
    ]);
  });

  it('opens on Source when no section is stored (the plan: Source, Core Oscillator)', () => {
    expect(DEFAULT_ROBOT_SECTION).toBe('source');
    expect(activeRobotSection(null)).toBe('source');
  });

  it.each(['volume', 'melody', 'envelope', 'source'] as const)('a stored section (%s) is the open one', (stored) => {
    expect(activeRobotSection(stored)).toBe(stored);
  });

  it.each<[RobotSection, RobotSubsection | null, RobotSubsection]>([
    ['source', null, 'baselineOscillator'],
    ['source', 'coaxialOscillator', 'coaxialOscillator'],
    ['source', 'harmonicOscillator', 'harmonicOscillator'],
    ['source', 'busFilter', 'busFilter'],
    // Each section's own sub-tabs, stored, are the open one.
    ['volume', 'sends', 'sends'],
    ['melody', 'details', 'details'],
    ['envelope', 'envelopeCharacter', 'envelopeCharacter'],
    // Nothing stored: the section's first.
    ['volume', null, 'mix'],
    ['melody', null, 'rhythmMelody'],
    ['envelope', null, 'envelopeContour'],
    // The filter panel is Source's alone: a stored busFilter on any other section falls back to its first.
    ['envelope', 'busFilter', 'envelopeContour'],
    ['melody', 'busFilter', 'rhythmMelody'],
    ['volume', 'busFilter', 'mix'],
    // Not this section's: its first, as SectionTabs falls back for a stale value.
    ['source', 'details', 'baselineOscillator'],
    ['volume', 'envelopeCharacter', 'mix'],
    ['melody', 'sends', 'rhythmMelody'],
    ['envelope', 'baselineOscillator', 'envelopeContour'],
  ])('on %s with %s stored, the panel shown is %s', (sectionId, stored, expected) => {
    expect(activeRobotSubsection(sectionId, stored)).toBe(expected);
  });
});
