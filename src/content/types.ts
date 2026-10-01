/**
 * The shape of one content entry — one per *concept*, never per surface
 * (docs/specs/CONTENT_LAYER.md §1.1). The nav row, the control's label and the
 * accordion heading for "Tempo" all read the same entry; a surface that needs
 * different text gets a field here (`heading`), never a second key.
 */

export interface ContentOption {
  human: string;
  lore?: string;
}

export interface ContentIntro {
  /** The IntroPanel's own headline (a sentence, not a name). */
  lore: string;
  /** Limited HTML allowed — IntroPanel sanitises via DOMPurify, unchanged. */
  loreDescription: string;
  /** Same. */
  humanDescription: string;
}

export interface ContentEntry {
  /** Plain-English name — the one required field. Feeds `humanLabel`. */
  human: string;
  /** In-universe name (docs/reference/copy-tone-guide.md "Lore"). Feeds `loreLabel`. Absent = no lore surface. */
  lore?: string;
  /** A panel/accordion heading that differs from the nav-row name (spec §1.6). Resolved by
   *  `labels(key, { surface: 'heading' })` as `heading ?? lore`; absent = the heading reads `lore`. */
  heading?: string;
  /** Section/group-level IntroPanel copy. Present only on concepts that render one. */
  intro?: ContentIntro;
  /** Text input hint. */
  placeholder?: string;
  /** Value suffix a slider renders (`'Hz'`, `'dB'`, `' measures'`). */
  unit?: string;
  /** Per-value copy for radio groups and enum badges — keyed by the stored value. */
  options?: Record<string, ContentOption>;
}

/** The closed list of top-level key areas (spec §1.2). A key's first segment must be one of these. */
export const CONTENT_AREAS = ['home', 'header', 'nav', 'fleet', 'probe', 'company', 'settings', 'session', 'sector', 'ui'] as const;
export type ContentArea = (typeof CONTENT_AREAS)[number];

export type LabelSurface = 'row' | 'heading';

/** What `labels()` spreads into a ControlSchema — only the fields the entry actually has. */
export interface SchemaLabels {
  humanLabel: string;
  loreLabel?: string;
  placeholder?: string;
  unit?: string;
}

export interface SchemaOption {
  value: string;
  humanLabel: string;
  loreLabel?: string;
}

/** The value-keyed shape robotSelectionConfig's ValueLabel maps already expose. */
export interface ValueLabelPair {
  humanLabel: string;
  loreLabel?: string;
}
