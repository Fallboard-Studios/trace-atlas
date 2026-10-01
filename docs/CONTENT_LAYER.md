# Content Layer

Every user-facing string in Trace Atlas lives in one typed module, `src/content/`, keyed by concept. Nothing in `src/components/` or `src/data/` types a display string; it spreads labels in from a content key. This guide is the working reference. The design rationale is in [docs/specs/CONTENT_LAYER.md](specs/CONTENT_LAYER.md); the rules for *what the words say* are in [docs/reference/copy-tone-guide.md](reference/copy-tone-guide.md).

## One entry per concept

```typescript
// src/content/copy/fleet.ts
'fleet.pacing.tempo': { human: 'Tempo', lore: 'Ping Rate', unit: 'BPM' },
```

The nav row, the slider's label and the accordion heading for "Tempo" all read this one entry. A surface never gets its own key: if two surfaces need different text for one concept, that is a field on the entry (`heading`), never a second key. Keys named for a surface (`…Row`, `…Heading`, `…Accordion`, `…Panel`) fail the guard.

Entry shape (`src/content/types.ts`):

| Field | Required | Used for |
|---|---|---|
| `human` | yes | the plain-English name → `humanLabel` |
| `lore` | no | the in-universe name → `loreLabel` |
| `heading` | no | a panel/accordion heading that differs from the row name; `labels(key, { surface: 'heading' })` resolves `heading ?? lore` |
| `intro` | no | `{ lore, loreDescription, humanDescription }` for a section's `IntroPanel` (limited HTML allowed, DOMPurify-sanitised as before) |
| `template` | no | a `{slot}` form of the name for dynamic accessible names (`'Delete {company}'`); `human` stays the slot-free label |
| `placeholder` | no | text-input hint |
| `unit` | no | value suffix a slider renders (`'Hz'`, `' measures'`) |
| `options` | no | per-value copy for radios and enum badges, keyed by the stored value: `{ natural: { human, lore? } }` |

## Keys

Area-first dotted camelCase, two to four segments, first segment from the closed list in `CONTENT_AREAS`: `home`, `header`, `nav`, `fleet`, `probe`, `company`, `settings`, `session`, `sector`, `ui`. Keys are content-owned: they are not nav ids (`fleetParams.pacing.tempo`), not schema ids (`audioRig.tempo`), and nothing parses them. Where a nav node or a config meets a concept it carries the key (`content: 'fleet.pacing.tempo'`) or spreads the entry in.

`ui.*` is for strings a shared control or primitive owns (`ui.cancel`, `ui.stepper.increment`, `ui.lfo.shape`). It is the only area a primitive ever imports.

## Reading content

All from `src/content` (`@/content`):

```typescript
import { CONTENT, labels, options, optionsRecord, intro, introProps, fill } from '@/content';

// 1. A schema — bounds stay, copy is spread in. Only the fields the entry has are emitted
//    (never `unit: undefined`), so a spread can't clear a schema default.
const BPM_SCHEMA: SliderLinearSchema = { id: 'audioRig.tempo', type: 'sliderLinear', ...labels('fleet.pacing.tempo'), min: 20, max: 200, step: 1, orientation: 'horizontal' };

// 2. A heading that may differ from the row name.
panel: { id: 'audioRig.eq3', type: 'directionalPanel', ...labels('fleet.eq', { surface: 'heading' }), orientation: 'row' }

// 3. A radio's options, in declaration order; optionsRecord() gives the value-keyed map
//    robotSelectionConfig's JOB_TYPE_LABELS etc. expose.
options: options('fleet.output.decayMode')

// 4. An IntroPanel — introProps() reshapes intro() to the primitive's own prop names.
<IntroPanel {...introProps('fleet.pacing')} trait="composition" />

// 5. A dynamic accessible name, or any one-off string.
humanLabel: fill('company.delete', { company: selectedCompany.name })
<span>{CONTENT['session.status.linkCopied'].human}</span>
```

Names are data, not copy: robot names, company names, attenuation-style names and the Sector Settings preset names (`SectorPreset.name`) are never content. A preset button's visible label is its name filled into `sector.preset.*`'s `{name}` template; only its lore caption is copy.

## The guard

Two layers keep literal copy out:

- **ESLint** (`eslint.config.js`, the "Content layer guard" block): under `src/components/**` and `src/data/**`, a `loreLabel`/`humanLabel`/`label`/`placeholder`/`unit`/`loreDescription`/`humanDescription` property with a literal value, JSX text with three or more letters, or a literal `aria-label`/`title`/`placeholder`/`alt` is an error pointing here. Tests and `src/content` are exempt. A punctuation-only text node between two content reads is written as `{' — '}`, never exempted.
- **`src/content/content.test.ts`**: every `ContentKey` is referenced from `src/` outside `src/content/` (an unreferenced key is a lost consumer or a key never wired); every `human` is non-empty; keys follow the grammar and the area list; no surface-named keys; no two same-area entries share a `human`+`lore` pair (the two filters' Resonance pair is allowlisted, see the inventory).

Both were mutation-checked when they landed: a planted `humanLabel: 'X'` and `<p>Hello there</p>` produce two lint errors; a planted orphan key fails the test by name.

## Adding a concept

1. Add the entry to the area file under `src/content/copy/` in screen order, following the tone guide for the words.
2. Read it from the consumer with one of the helpers above. The key union is typed, so a misspelt key is a compile error.
3. Run `npm test` — the guard fails if the key is unreferenced, and `npm run lint` fails if any literal slipped into a component or config.

## Review gate (temporary)

`docs/reference/content-inventory.md`, generated by `node scripts/content/inventory.mjs`, lists every `[c]` placeholder and ALL CAPS legacy heading still in `src/content`, plus the concepts whose nav row and control disagreed before the migration. Crawford fills its copy column; Task 17 of [docs/tasks/CONTENT_LAYER.md](tasks/CONTENT_LAYER.md) applies it, after which the inventory and the script are deleted and the guard gains its "no `[c]` anywhere" assertion.

## History

The 2026-09-29 copy pass's hand-maintained table, `docs/reference/archive/text-content-tables.md`, was the authoring source before this module existed and is kept only as a record. Before 2026-09-30, the same label could be typed in a data config, a nav node and a content component at once (forty strings were), with a code comment as the only sync.
