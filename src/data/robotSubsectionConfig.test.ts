// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  ROBOT_SECTIONS_CONFIG,
  SOURCE_OSCILLATOR_SUBSECTIONS,
  DEFAULT_ROBOT_SECTION,
  sectionSubTabs,
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

  it("each section's subsections, in order: one each for Levels, Composition and Envelope (Pitches' 'frequency' is gone), Source's four", () => {
    const idsOf = (sectionId: RobotSection) => ROBOT_SECTIONS_CONFIG.find((s) => s.id === sectionId)!.subsections.map((s) => s.id);
    expect(idsOf('volume')).toEqual(['audioSettings']);
    expect(idsOf('melody')).toEqual(['rhythm']);
    expect(idsOf('envelope')).toEqual(['pingContour']);
    expect(idsOf('source')).toEqual([...SOURCE_OSCILLATOR_SUBSECTIONS, 'busFilter']);
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
  const section = (id: RobotSection) => ROBOT_SECTIONS_CONFIG.find((s) => s.id === id)!;

  it('names each tab Levels, Composition, Envelope, Source', () => {
    expect(ROBOT_SECTIONS_CONFIG.map((s) => labels(s.content).humanLabel)).toEqual([
      CONTENT['probe.levels'].human,
      CONTENT['probe.composition'].human,
      CONTENT['probe.envelope'].human,
      CONTENT['probe.source'].human,
    ]);
  });

  it('gives only Source a sub-tab row (its three oscillators, then Filter); a section with one panel has none', () => {
    expect(sectionSubTabs(section('source')).map((sub) => sub.id)).toEqual([...SOURCE_OSCILLATOR_SUBSECTIONS, 'busFilter']);
    expect(sectionSubTabs(section('volume'))).toEqual([]);
    expect(sectionSubTabs(section('melody'))).toEqual([]);
    expect(sectionSubTabs(section('envelope'))).toEqual([]);
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
    // The filter panel is Source's alone: a stored busFilter on any other section falls back to its first.
    ['envelope', 'busFilter', 'pingContour'],
    ['melody', 'busFilter', 'rhythm'],
    ['volume', 'busFilter', 'audioSettings'],
    // Not this section's: its first, as SectionTabs falls back for a stale value.
    ['source', 'rhythm', 'baselineOscillator'],
    // A section with one panel shows that panel, whatever is stored.
    ['volume', null, 'audioSettings'],
    ['volume', 'coaxialOscillator', 'audioSettings'],
    ['melody', null, 'rhythm'],
    ['envelope', 'baselineOscillator', 'pingContour'],
  ])('on %s with %s stored, the panel shown is %s', (sectionId, stored, expected) => {
    expect(activeRobotSubsection(sectionId, stored)).toBe(expected);
  });
});
