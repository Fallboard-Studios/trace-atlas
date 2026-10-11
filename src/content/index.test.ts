import { describe, it, expect } from 'vitest';
import { CONTENT, labels, makeHelpers, CONTENT_AREAS, type ContentKey } from './index';
import type { ContentEntry } from './types';

// ----------------------------------------
// FIXTURE
// ----------------------------------------
// The helpers are tested against a local fixture, not the live CONTENT, so a copy edit can never
// break a helper test. CONTENT itself is covered by content.test.ts (the guard, Task 18).

const FIXTURE = {
  'fleet.pacing.tempo': { human: 'Tempo', lore: 'Ping Rate', unit: 'BPM' },
  'fleet.eq': { human: '3-Band EQ', lore: 'Trace Metrics', heading: 'TRACE METRICS ARRAY' },
  'probe.name': { human: 'Robot Name', placeholder: 'Enter a name…' },
  'ui.cancel': { human: 'Cancel' },
  'fleet.output.decayMode': {
    human: 'Decay Mode',
    options: {
      natural: { human: 'Natural Decay', lore: 'Dissipation' },
      controlled: { human: 'Controlled Decay' },
    },
  },
  'fleet.intro': {
    human: 'Fleet Params',
    intro: { lore: 'Fleet Params — headline.', loreDescription: '<p>lore</p>', humanDescription: '<p>human</p>' },
  },
  'company.delete': { human: 'Delete', lore: 'Dissolve Unit', template: 'Delete {company}' },
  'ui.stepper.increment': { human: 'Increment {name}' },
  'fleet.eq.bass': { human: 'Bass', lore: 'Sub-Band', unit: 'dB', help: { human: 'Boosts or cuts the low end.', lore: 'The lowest band of the trace.' } },
  'fleet.hpf': { human: 'High-Pass Filter', lore: 'Top Extraction', heading: 'LOW-FREQUENCY MASK', help: { human: 'Cuts the bass.' } },
  'fleet.lfoBank.laneA': { human: 'Core LFO', lore: 'Apex Signature', short: 'LFO A' },
  'ui.lfoLane': { human: 'Lane', options: { off: { human: 'Off' }, a: { human: 'Core LFO', lore: 'Apex Signature', short: 'A' } } },
} as const satisfies Record<string, ContentEntry>;

const { labels: L, options, optionsRecord, intro, introProps, fill } = makeHelpers(FIXTURE);

// ----------------------------------------
// TESTS
// ----------------------------------------

describe('content helpers', () => {
  describe('labels()', () => {
    it('always returns humanLabel', () => {
      expect(L('ui.cancel')).toEqual({ humanLabel: 'Cancel' });
    });

    it('includes loreLabel, unit and placeholder only when the entry has them — absent, not undefined', () => {
      const tempo = L('fleet.pacing.tempo');
      expect(tempo).toEqual({ humanLabel: 'Tempo', loreLabel: 'Ping Rate', unit: 'BPM' });
      expect(tempo).not.toHaveProperty('placeholder');

      const name = L('probe.name');
      expect(name).toEqual({ humanLabel: 'Robot Name', placeholder: 'Enter a name…' });
      expect(name).not.toHaveProperty('loreLabel');
      expect(name).not.toHaveProperty('unit');

      // Spreading { unit: undefined } into a schema would silently clear a slider suffix.
      expect(Object.keys(L('ui.cancel'))).toEqual(['humanLabel']);
    });

    it('default surface never reads heading', () => {
      expect(L('fleet.eq').loreLabel).toBe('Trace Metrics');
    });

    it("surface 'heading' resolves loreLabel as heading ?? lore", () => {
      expect(L('fleet.eq', { surface: 'heading' }).loreLabel).toBe('TRACE METRICS ARRAY');
      expect(L('fleet.pacing.tempo', { surface: 'heading' }).loreLabel).toBe('Ping Rate');
    });

    it('never returns heading as its own property', () => {
      expect(L('fleet.eq', { surface: 'heading' })).not.toHaveProperty('heading');
    });

    // docs/tasks/LAYOUT_REWORK.md Task 10 — a control's help travels with its labels into the schema.
    it('includes help when the entry has it, both halves, on either surface', () => {
      expect(L('fleet.eq.bass')).toEqual({
        humanLabel: 'Bass',
        loreLabel: 'Sub-Band',
        unit: 'dB',
        help: { human: 'Boosts or cuts the low end.', lore: 'The lowest band of the trace.' },
      });
      expect(L('fleet.hpf', { surface: 'heading' }).help).toEqual({ human: 'Cuts the bass.' });
    });

    it('a help without lore stays without lore — no lore: undefined', () => {
      expect(L('fleet.hpf').help).not.toHaveProperty('lore');
    });

    it('omits help rather than emitting undefined when the entry has none', () => {
      expect(L('fleet.pacing.tempo')).not.toHaveProperty('help');
      expect(L('ui.cancel')).not.toHaveProperty('help');
    });

    it('never returns short as its own property — a compact form is read by its own helper', () => {
      expect(L('fleet.lfoBank.laneA')).toEqual({ humanLabel: 'Core LFO', loreLabel: 'Apex Signature' });
    });
  });

  describe('options()', () => {
    it('preserves declaration order and maps human→humanLabel, lore→loreLabel', () => {
      expect(options('fleet.output.decayMode')).toEqual([
        { value: 'natural', humanLabel: 'Natural Decay', loreLabel: 'Dissipation' },
        { value: 'controlled', humanLabel: 'Controlled Decay' },
      ]);
    });

    it('omits loreLabel rather than emitting undefined', () => {
      const [, controlled] = options('fleet.output.decayMode');
      expect(controlled).not.toHaveProperty('loreLabel');
    });

    it('throws for an entry without options', () => {
      expect(() => options('ui.cancel')).toThrow(/ui\.cancel.*no options/);
    });

    it('never returns an option\'s short — a compact face is read by its own consumer (LfoLink\'s lane row)', () => {
      expect(options('ui.lfoLane')).toEqual([
        { value: 'off', humanLabel: 'Off' },
        { value: 'a', humanLabel: 'Core LFO', loreLabel: 'Apex Signature' },
      ]);
      expect(optionsRecord('ui.lfoLane').a).toEqual({ humanLabel: 'Core LFO', loreLabel: 'Apex Signature' });
    });
  });

  describe('optionsRecord()', () => {
    it('returns the value-keyed { humanLabel, loreLabel? } record robotSelectionConfig\'s maps expose', () => {
      expect(optionsRecord('fleet.output.decayMode')).toEqual({
        natural: { humanLabel: 'Natural Decay', loreLabel: 'Dissipation' },
        controlled: { humanLabel: 'Controlled Decay' },
      });
    });

    it('throws for an entry without options', () => {
      expect(() => optionsRecord('probe.name')).toThrow(/probe\.name.*no options/);
    });
  });

  describe('intro()', () => {
    it('returns the typed intro block', () => {
      expect(intro('fleet.intro')).toEqual({
        lore: 'Fleet Params — headline.',
        loreDescription: '<p>lore</p>',
        humanDescription: '<p>human</p>',
      });
    });

    it('introProps() reshapes the block to IntroPanel props (lore → loreLabel)', () => {
      expect(introProps('fleet.intro')).toEqual({ loreLabel: 'Fleet Params — headline.', loreDescription: '<p>lore</p>', humanDescription: '<p>human</p>' });
      expect(() => introProps('ui.cancel')).toThrow(/no intro/);
    });

    it('throws for an entry without an intro — a content bug, not a legal "no intro" state', () => {
      expect(() => intro('ui.cancel')).toThrow(/ui\.cancel.*no intro/);
    });
  });

  describe('fill()', () => {
    it('substitutes every {slot} in the human template', () => {
      expect(fill('company.delete', { company: 'Acme' })).toBe('Delete Acme');
      expect(fill('ui.stepper.increment', { name: 'Volume' })).toBe('Increment Volume');
    });

    it('throws on a missing var', () => {
      expect(() => fill('company.delete', {})).toThrow(/company\.delete.*\{company\}/);
    });

    it('falls back to human when there is no template (slotless, extra vars ignored)', () => {
      expect(fill('ui.cancel', { anything: 'x' })).toBe('Cancel');
    });
  });
});

describe('CONTENT', () => {
  it('is a typed record whose keys form a string-literal union', () => {
    const key: ContentKey = 'ui.cancel';
    expect(CONTENT[key].human).toBe('Cancel');
    // @ts-expect-error — a misspelt key is a compile error, not a runtime undefined
    const bad: ContentKey = 'ui.cancle';
    expect(bad).toBe('ui.cancle');
  });

  it('exposes the closed area list', () => {
    expect(CONTENT_AREAS).toEqual(['home', 'header', 'nav', 'fleet', 'probe', 'company', 'settings', 'session', 'sector', 'ui']);
  });

  it('the live helpers read CONTENT when no record is passed', () => {
    expect(labels('ui.cancel')).toEqual({ humanLabel: 'Cancel' });
  });

  it("labels('fleet.lfoBank.rateDrift').help is the entry's help; an entry without help yields undefined", () => {
    const help = labels('fleet.lfoBank.rateDrift').help;
    expect(help).toBeDefined();
    expect(help).toBe(CONTENT['fleet.lfoBank.rateDrift'].help);
    expect(help?.human.trim()).toBeTruthy();
    expect(labels('ui.cancel').help).toBeUndefined();
  });
});
