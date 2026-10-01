/**
 * The content layer — every user-facing string, one entry per concept, keyed by a clean
 * area-first scheme (docs/specs/CONTENT_LAYER.md). Consumers never type a display string;
 * they spread `labels(key)` into a schema, read `options(key)`, `intro(key)`, or `fill(key, vars)`.
 *
 * `makeHelpers(record)` builds the five helpers over any record — the live exports below are
 * bound to CONTENT; tests bind them to a fixture so a copy edit can never break a helper test.
 */
import type { ContentEntry, ContentIntro, LabelSurface, SchemaLabels, SchemaOption, ValueLabelPair } from './types';
import { ui } from './copy/ui';

export { CONTENT_AREAS } from './types';
export type { ContentEntry, ContentIntro, ContentOption, ContentArea, LabelSurface, SchemaLabels, SchemaOption, ValueLabelPair } from './types';

// ========================================
// THE RECORD
// ========================================

export const CONTENT = {
  ...ui,
} as const satisfies Record<string, ContentEntry>;

export type ContentKey = keyof typeof CONTENT;

// ========================================
// HELPERS
// ========================================

export function makeHelpers<R extends Record<string, ContentEntry>>(record: R) {
  type K = keyof R & string;

  function labels(key: K, opts?: { surface?: LabelSurface }): SchemaLabels {
    const e: ContentEntry = record[key];
    const lore = opts?.surface === 'heading' ? (e.heading ?? e.lore) : e.lore;
    const out: SchemaLabels = { humanLabel: e.human };
    if (lore !== undefined) out.loreLabel = lore;
    if (e.placeholder !== undefined) out.placeholder = e.placeholder;
    if (e.unit !== undefined) out.unit = e.unit;
    return out;
  }

  function requireOptions(key: K): NonNullable<ContentEntry['options']> {
    const e: ContentEntry = record[key];
    if (!e.options) throw new Error(`[content] ${key} has no options`);
    return e.options;
  }

  function options(key: K): SchemaOption[] {
    return Object.entries(requireOptions(key)).map(([value, o]) => {
      const out: SchemaOption = { value, humanLabel: o.human };
      if (o.lore !== undefined) out.loreLabel = o.lore;
      return out;
    });
  }

  function optionsRecord(key: K): Record<string, ValueLabelPair> {
    const out: Record<string, ValueLabelPair> = {};
    for (const [value, o] of Object.entries(requireOptions(key))) {
      out[value] = o.lore !== undefined ? { humanLabel: o.human, loreLabel: o.lore } : { humanLabel: o.human };
    }
    return out;
  }

  function intro(key: K): ContentIntro {
    const e: ContentEntry = record[key];
    if (!e.intro) throw new Error(`[content] ${key} has no intro`);
    return e.intro;
  }

  function fill(key: K, vars: Record<string, string>): string {
    const e: ContentEntry = record[key];
    return e.human.replace(/\{(\w+)\}/g, (_, slot: string) => {
      if (!(slot in vars)) throw new Error(`[content] ${key}: no value for {${slot}}`);
      return vars[slot];
    });
  }

  return { labels, options, optionsRecord, intro, fill };
}

const live = makeHelpers(CONTENT);

/** Spread into a ControlSchema: `{ humanLabel, loreLabel?, placeholder?, unit? }` — only the fields the
 *  entry has. `{ surface: 'heading' }` resolves loreLabel as `heading ?? lore` (spec §1.6). */
export const labels: (key: ContentKey, opts?: { surface?: LabelSurface }) => SchemaLabels = live.labels;
/** The entry's options as a RadioButton option list, in declaration order. */
export const options: (key: ContentKey) => SchemaOption[] = live.options;
/** The same options as a value-keyed `{ humanLabel, loreLabel? }` record. */
export const optionsRecord: (key: ContentKey) => Record<string, ValueLabelPair> = live.optionsRecord;
/** The entry's intro block; throws if the concept has none. */
export const intro: (key: ContentKey) => ContentIntro = live.intro;
/** Fill a template's `{slots}`: `fill('ui.stepper.increment', { name })` → `'Increment Volume'`. */
export const fill: (key: ContentKey, vars: Record<string, string>) => string = live.fill;
