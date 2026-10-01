# Phase Spec: Content Layer

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/content-layer.md](../intent/content-layer.md) (confirmed via a six-question interview, 2026-09-30). Prior art: the `ROBOT_SECTIONS_CONFIG` consolidation (`src/data/robotSubsectionConfig.ts`, spec archived) — one shared table replacing three hand-typed copies, consumers supplying only their own wiring. This phase does for every user-facing string what that pass did for section ids. The rules for *what the words say* stay in [docs/reference/copy-tone-guide.md](../reference/copy-tone-guide.md); this spec only decides *where they live and how they're reached*.

Survey basis (2026-09-30, against the current tree): ~230 copy-bearing fields across the 8 `src/data/*Config.ts` files that carry any; ~60 inline `loreLabel`/`humanLabel` literals plus 11 intro blocks (`IntroContent`) and 5 HTML `humanDescription` bodies in `src/components`; a dozen strings inside primitives (`Lfo.tsx`'s shape names, `Stepper.tsx`'s `Increment/Decrement` templates, `PowerRockerSwitch.tsx`'s `Power on/off`, `useLfoTargetGroup.ts`'s `'Mutation'` fallback); the home screen's HTML in `ContentPane.tsx`; 40 label strings defined in two or more files; 6 `[c]` placeholders; two label vocabularies (`humanLabel` on schemas, `label` on radio options and sector presets).

ASSUMPTIONS I'm making, beyond what the intent doc already resolved (correct now or I'll proceed with these):
1. **Key scheme is area-first dotted camelCase** with a closed list of top-level areas (§1.2). Keys describe the concept, never the surface ("`fleet.pacing.tempo`", not "`navTempoRow`").
2. **The content module is split by area** into `src/content/copy/*.ts`, merged into one typed `CONTENT` object in `src/content/index.ts` — one file per area is what "easy to find" means in practice; one 400-line file is not.
3. **`human` is the one required field on every entry**; `lore` is optional. Every concept has a plain-English name; not every concept has in-universe copy yet.
4. **Radio options become `options` on the concept entry**, keyed by their value, each with its own `human`/`lore` pair. This is also where the `label` → `humanLabel` rename lands, and it is the **one deliberate exception** to "primitives untouched": `RadioButtonSchema`'s option type (`src/types/controls.ts`) and `RadioButton.tsx`'s one `option.label` read change to `humanLabel`. (Sector preset *names* are values, not options — see §1.4.)
5. **Dynamic strings are templates in content** with `{name}`-style slots, filled by a tiny `fill()` helper — the template is content, the value is data.
6. **The guard is two-layered:** an ESLint `no-restricted-syntax` rule (property literals and JSX text under `src/components` + `src/data`) catches a new hardcoded string at lint time; a Vitest test asserts every `ContentKey` is referenced from source and that no entry still carries `[c]` or an empty `human`.
7. **The hardcoded-string inventory is a review document**, `docs/reference/content-inventory.md`, produced by a one-off script and deleted once every row has approved copy — it is a gate artifact, not a permanent doc.
8. **`unit` strings move into content** per the intent ("unit suffixes count as text"); the schema's `unit` field is spread in from the entry like the labels.
9. **The nav tree's `docId` stub is removed** — an unbuilt feature this phase supersedes (the content entry *is* the per-node copy store).
10. **Existing approved wording is transcribed verbatim** (the 2026-09-29 copy pass); only the placeholder/heading rows go through the review gate for new words.

---

## 1. Overview & Claude Explanation

Today a user-facing string can be defined in a data config, a nav-tree node, a content component's own table, a primitive, or a Markdown reference doc, and the same concept ("Tempo", "Low-Pass Filter", "Mute") is typed out in up to three of those at once with nothing but a code comment keeping them aligned. This phase moves every string a user can see or hear into one typed module, `src/content/`, keyed by concept, and makes every consumer read from it. Primitives keep their existing `loreLabel`/`humanLabel` contract; the config files and components stop *typing* the strings and *spread them in* instead. A lint rule plus a test keep literal copy from creeping back. The hand-maintained reference table is retired, and the six `[c]` placeholders and the ALL CAPS legacy headings get real copy through a review gate.

### 1.1 Entry shape — one entry per concept, surfaces as fields

```typescript
// src/content/types.ts
export interface ContentOption {
  human: string;
  lore?: string;
}

export interface ContentIntro {
  lore: string;             // the IntroPanel's own headline (today's IntroContent.loreLabel)
  loreDescription: string;  // limited HTML allowed — IntroPanel sanitises (DOMPurify), unchanged
  humanDescription: string; // same
}

export interface ContentEntry {
  /** Plain-English name — the one required field. Feeds `humanLabel`. */
  human: string;
  /** In-universe name (copy-tone-guide.md "Lore"). Feeds `loreLabel`. Absent = no lore surface. */
  lore?: string;
  /** A panel/accordion heading that differs from the nav-row name (§1.6). Resolved by
   *  `labels(key, { surface: 'heading' })` as `heading ?? lore`; absent = heading reads `lore`. */
  heading?: string;
  /** Section/group-level IntroPanel copy. Present only on concepts that render one. */
  intro?: ContentIntro;
  /** Text input hint. */
  placeholder?: string;
  /** Value suffix a slider renders (`'Hz'`, `'dB'`, `' measures'`). */
  unit?: string;
  /** Per-value copy for radio groups, presets, enum badges — keyed by the stored value. */
  options?: Record<string, ContentOption>;
}
```

The nav row, the control's label and the accordion heading for "Tempo" all read `CONTENT['fleet.pacing.tempo']`. A concept gets exactly one entry; a surface never gets its own.

### 1.2 Key scheme — clean, area-first, concept-named

Dotted camelCase, 2–4 segments, first segment from a closed area list. Keys are content-owned: they are **not** nav ids (`fleetParams.pacing.tempo`), **not** schema ids (`audioRig.tempo`), and are never parsed to derive app state. Where a nav node or schema meets a concept it carries a `content: ContentKey` reference (nav) or spreads the entry in (schemas).

| Area | Covers | Example keys |
|---|---|---|
| `home` | the Deck/home view | `home.intro` |
| `header` | top bar | `header.mute`, `header.volume` |
| `nav` | nav chrome only — the toggle button, breadcrumb, root labels that are not a concept elsewhere | `nav.toggle`, `nav.breadcrumb` |
| `fleet` | Fleet Params and the whole global chain | `fleet.intro`, `fleet.pacing`, `fleet.pacing.tempo`, `fleet.eq.low`, `fleet.lpf.cutoff`, `fleet.lpf.resonance`, `fleet.drift.environmental`, `fleet.reverb.length`, `fleet.output.decayMode` |
| `probe` | a robot's own sections, status/value labels, selection card | `probe.intro`, `probe.levels.volume`, `probe.composition.density`, `probe.source.layer0.type`, `probe.status.docking`, `probe.status.audibility`, `probe.job` |
| `company` | companies branch and CRUD | `company.intro`, `company.assign`, `company.create`, `company.rename`, `company.delete` |
| `settings` | Settings branch | `settings.intro`, `settings.quality`, `settings.quality.robotLoad` |
| `session` | save/load/share | `session.name`, `session.save`, `session.load`, `session.delete` |
| `sector` | Sector Settings / seeds — the controls, not the preset *names* (§1.4) | `sector.attenuationStyle`, `sector.coords`, `sector.random` |
| `ui` | strings owned by a shared control or primitive, not one feature — including the shared LFO control (not a special area; confirmed 2026-09-30) | `ui.cancel`, `ui.stepper.increment`, `ui.stepper.decrement`, `ui.power.on`, `ui.power.off`, `ui.lfo.shape`, `ui.lfo.rate`, `ui.lfo.depth`, `ui.lfo.fallbackName` |

Rules:
- A concept that exists in two areas is a bug in the key, not a reason for two entries (e.g. the EQ sliders are `fleet.eq.*` whether reached from the nav, the accordion or the slider).
- Shared control words that genuinely recur across different concepts (`Cutoff`, `Resonance` on both filters) are **separate concepts** (`fleet.lpf.cutoff`, `fleet.hpf.cutoff`) — the strings may match today, the concepts don't.
- `ContentKey = keyof typeof CONTENT`; a misspelt key is a compile error.

### 1.3 Helpers — how consumers read it

```typescript
// src/content/index.ts
export const CONTENT = { ...home, ...header, ...fleet, ...probe, /* … */ } as const satisfies Record<string, ContentEntry>;
export type ContentKey = keyof typeof CONTENT;

/** Spread into a ControlSchema: { loreLabel?, humanLabel, placeholder?, unit? } — only the fields the entry has.
 *  `surface: 'heading'` resolves loreLabel as `heading ?? lore` (§1.6); the default resolves `lore` alone. */
export function labels(key: ContentKey, opts?: { surface?: 'row' | 'heading' }): Pick<ControlSchemaBase, 'loreLabel' | 'humanLabel'> & { placeholder?: string; unit?: string };
/** The entry's options, as a RadioButton option list, in the order given. */
export function options(key: ContentKey): Array<{ value: string; humanLabel: string; loreLabel?: string }>;
/** The same options as a value-keyed record of { loreLabel, humanLabel } — the shape robotSelectionConfig's
 *  value-label maps (ValueLabel) already expose, so those maps become one-line wrappers (§1.4). */
export function optionsRecord(key: ContentKey): Record<string, { loreLabel?: string; humanLabel: string }>;
/** The entry's intro block, typed; throws at module load if the concept has none (a content bug, not a runtime state). */
export function intro(key: ContentKey): ContentIntro;
/** Fill a template's {slots}. `fill('ui.stepper.increment', { name })` → 'Increment Volume'. */
export function fill(key: ContentKey, vars: Record<string, string>): string;
```

Consumer patterns (the only three shapes that should appear outside `src/content/`):

```typescript
// 1. A schema in src/data — bounds stay, copy is spread in.
export const BPM_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.tempo', type: 'sliderLinear', ...labels('fleet.pacing.tempo'),
  min: 20, max: 200, step: 1, orientation: 'horizontal',
};

// 2. A radio — options come from the same entry.
export const AUDIO_SETTING_SCHEMA: RadioButtonSchema = {
  id: 'robotOptions.audioSetting', type: 'radio', ...labels('probe.monitorMode'),
  options: options('probe.monitorMode'),
};

// 3. A nav node — references the concept; the tree derives its row labels.
{ id: 'fleetParams.pacing.tempo', content: 'fleet.pacing.tempo' }
```

`NavTreeNodeSchema` loses `loreLabel`/`humanLabel`/`docId` and gains `content: ContentKey`; `useNavTree` resolves the row's pair via `labels()`. `RobotSectionEntry`/`RobotSubsectionEntry` (`robotSubsectionConfig.ts`) likewise replace `loreLabel`/`navLabel`/`accordionLabel`/`ownAccordionLabel` with `content` keys — the "nav label differs from accordion label" case (`rhythm` → "Rhythm" vs "Composition") is modelled as two concepts (`probe.composition` for the accordion, `probe.composition.rhythm` for the row), not as two fields.

### 1.4 What moves, by source

| Today | After |
|---|---|
| `src/data/*Config.ts` label/placeholder/unit literals (~230) | `...labels(key)` / `options(key)`; bounds, ids, traits, orientation stay |
| `navTreeConfig.ts` lore/human pairs (42) | `content` keys; labels derived |
| `robotSubsectionConfig.ts` 4 label fields | `content` keys |
| `robotSelectionConfig.ts` value-label maps (`JOB_TYPE_LABELS`, `DOCKING_STATE_LABELS`, `AUDIO_MODE_LABELS`, `AUDIBILITY_LABELS`, `UNASSIGNED_JOB_LABEL`) | `options` on `probe.job`, `probe.status.docking`, `probe.status.monitorMode`, `probe.status.audibility`; **the maps stay as thin copy-free wrappers** (`JOB_TYPE_LABELS = optionsRecord('probe.job')`, confirmed 2026-09-30) so their consumers are untouched |
| `FleetParamsContent.tsx` / `SettingsContent.tsx` / `ProbesContent.tsx` / `CompaniesContent.tsx` / `RobotSectionAccordionStack.tsx` intro tables + their own accordion `humanLabel`s | `intro(key)` and `labels(key)`; components keep only wiring |
| `FleetParamsContent.tsx` leaf-level `humanLabel`s (its own copy of the nav labels) | the same `content` keys the nav uses |
| `ContentPane.tsx`'s `HOME_HTML` | `home.intro` |
| `Header.tsx`, `SectorSettingsDrawer.tsx`, `CompanyCrudControls.tsx`, `CoordsInput.tsx`, `SessionListItem.tsx`, `SessionsPanel.tsx`, `RobotOptionsTab.tsx` inline schemas/strings | content keys; dynamic labels via `fill()` |
| `Lfo.tsx` shape maps, `useLfoTargetGroup.ts` `'Mutation'`, `Stepper.tsx` templates, `PowerRockerSwitch.tsx` aria labels, every `Cancel`, `Robot not found` | `ui.*` keys |
| `docs/reference/text-content-tables.md` | `docs/reference/archive/` |

Out of content, deliberately: **names are data, not copy** — robot names, company names, attenuation-style names, and the Sector Settings preset names (`sectorSettingsConfig.ts`'s `SectorPreset.label` values such as `Glaxos`; confirmed 2026-09-30). The preset *buttons'* chrome (their lore caption, the Random buttons) is content; the preset name each one fills in is a value. `SectorPreset.label` is renamed `name` to make that explicit, and it is exempt from the guard. Also excluded: `devWarn`/`console` messages (not user-facing); test fixtures; CSS; `schema.id` strings (identifiers — `resolveAccessibleName`'s last-resort fallback to `schema.id` stays as is).

### 1.5 The inventory and the review gate

Before any migration task, a one-off script walks `src/components`, `src/data` and `src/types` and emits `docs/reference/content-inventory.md`: one row per string that is **not already** a `loreLabel`/`humanLabel`/`label`/`placeholder`/`unit`/intro field — JSX text nodes, `aria-label`/`title` attributes, template strings with words, string maps like `SHAPE_LORE_LABELS`. Columns: file:line · current text · surface it appears on · proposed key · **copy (blank)**. The six `[c]` placeholders and every ALL CAPS legacy heading are appended as their own section with the same columns. Crawford fills the copy column (per the tone guide); nothing in that table is migrated with its current wording until he has. Rows already carrying approved copy from the 2026-09-29 pass are *not* in this table — they migrate verbatim.

### 1.6 Where one concept has had two lore phrases

The 2026-09-29 pass gave some concepts a nav-row lore name ("Trace Metrics" for EQ) while the panel heading kept an ALL CAPS placeholder and the intro got a third phrase. After this phase: the intro headline is `intro.lore` (a sentence, a different thing from a name — not a conflict); the nav row reads `lore`; a panel/accordion heading reads `heading ?? lore`. **`heading` is a real, supported field (confirmed 2026-09-30)**, set only where the review gate assigns a heading that should differ from the row name — it is still one entry per concept, with the heading as a surface variant. Consumers that render a heading (`AudioRigEffectPanel`, `DirectionalPanel`'s panel schemas, accordion `humanLabel`s built from a concept) get it through `labels(key, { surface: 'heading' })`, which resolves `heading ?? lore` for `loreLabel`; the default `labels(key)` resolves `lore` alone, so a row never picks up a heading by accident.

### 1.7 The guard

- **ESLint** (`eslint.config.js`): a `no-restricted-syntax` block scoped to `src/components/**` and `src/data/**` forbidding (a) `Property[key.name=/^(loreLabel|humanLabel|label|placeholder|unit|loreDescription|humanDescription)$/] > Literal` / `TemplateLiteral` values, (b) `JSXText[value=/[A-Za-z]{3,}/]`, (c) `JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] > Literal`. Message: "User-facing text belongs in src/content — see docs/CONTENT_LAYER.md." `src/content/**` and `*.test.*` are exempt.
- **Vitest** (`src/content/content.test.ts`): every `ContentKey` string appears at least once in `src/` outside `src/content/` (read with `fs`, a sorted list of unreferenced keys as the failure message); no entry's text contains `[c]`; every `human` is non-empty; every key matches `/^[a-z]+(\.[a-zA-Z0-9]+){1,3}$/` and starts with an area from the closed list; no two entries share identical `human`+`lore` pairs *within the same area* (a duplicate-concept smell, reported not forbidden across areas).

### 1.8 Retiring the reference table

`docs/reference/text-content-tables.md` moves to `docs/reference/archive/text-content-tables.md` with a two-line header stating it was superseded by `src/content/` on the merge date and is historical. `copy-tone-guide.md` stays and gains one line pointing at `src/content/` as where copy lives. A new short guide, `docs/CONTENT_LAYER.md`, documents the entry shape, the key rules, the helpers, the guard, and the one-concept-one-entry rule; `CLAUDE.md`'s reference-docs list gains a pointer and its TL;DR gains "User-facing text lives in `src/content/`; never write a display string in a component or config."

---

## 2. Target File Structure

```text
src/
├── content/                              # NEW
│   ├── types.ts                          #   ContentEntry / ContentOption / ContentIntro (§1.1)
│   ├── index.ts                          #   CONTENT merge, ContentKey, labels/options/intro/fill (§1.3)
│   ├── index.test.ts                     #   helper behaviour (spread shape, options order, fill slots, intro throws)
│   ├── content.test.ts                   #   the guard assertions (§1.7, Vitest half)
│   └── copy/                             #   one file per area, each `export const <area> = {...} as const satisfies Record<string, ContentEntry>`
│       ├── home.ts  header.ts  nav.ts  fleet.ts  probe.ts  company.ts  settings.ts  session.ts  sector.ts  ui.ts
├── types/
│   └── controls.ts                       # MODIFIED — RadioButtonSchema option `label` → `humanLabel` (assumption 4)
├── data/
│   ├── audioRigConfig.ts                 # MODIFIED — copy spread in; bounds/ids/traits unchanged
│   ├── robotOptionsConfig.ts             # MODIFIED — same
│   ├── robotSelectionConfig.ts           # MODIFIED — value-label maps → options() reads
│   ├── robotSubsectionConfig.ts          # MODIFIED — label fields → content keys
│   ├── navTreeConfig.ts                  # MODIFIED — lore/human/docId → content key
│   ├── sectorSettingsConfig.ts           # MODIFIED — control copy spread in; SectorPreset.label → .name (a value, not content)
│   ├── companyConfig.ts  sessionConfig.ts  # MODIFIED — copy spread in
│   └── *.test.ts for each               # MODIFIED — assertions read expected strings from CONTENT, not literals
├── components/
│   ├── ui/controls/
│   │   ├── RadioButton.tsx               # MODIFIED — option.humanLabel (the one primitive touch)
│   │   ├── Lfo.tsx                       # MODIFIED — shape maps → options('ui.lfo.shape')
│   │   ├── useLfoTargetGroup.ts          # MODIFIED — 'Mutation' → CONTENT['ui.lfo.fallbackName'].lore
│   │   ├── Stepper.tsx                   # MODIFIED — fill('ui.stepper.increment', …)
│   │   ├── IntroPanel.tsx                # MODIFIED — IntroContent type re-exported from src/content/types (or removed in favour of ContentIntro)
│   │   └── CoordsInput.tsx               # MODIFIED — X/Y schemas from content
│   ├── ui/physical/PowerRockerSwitch.tsx # MODIFIED — aria labels from ui.power.*
│   ├── panels/screen/Header.tsx          # MODIFIED
│   ├── panels/screen/console/
│   │   ├── ContentPane.tsx  SectorSettingsDrawer.tsx  SessionListItem.tsx  SessionsPanel.tsx  RobotOptionsTab.tsx  # MODIFIED
│   ├── panels/screen/nav/
│   │   ├── useNavTree.ts                 # MODIFIED — resolves row labels via labels(node.content)
│   │   ├── RobotSectionAccordionStack.tsx  # MODIFIED — intro tables removed
│   │   └── content/FleetParamsContent.tsx  SettingsContent.tsx  ProbesContent.tsx  CompaniesContent.tsx  # MODIFIED — intro tables + own label copies removed
│   └── company/CompanyCrudControls.tsx   # MODIFIED — dynamic labels via fill()
├── (every colocated *.test.tsx for the files above)  # MODIFIED where they assert literal strings
eslint.config.js                          # MODIFIED — the §1.7 no-restricted-syntax block
scripts/
└── content/inventory.mjs                 # NEW, one-off — emits docs/reference/content-inventory.md; deleted with the inventory at the end
docs/
├── CONTENT_LAYER.md                      # NEW — the guide (§1.8)
├── reference/content-inventory.md        # NEW, temporary — the review gate (§1.5); deleted once every row has copy
├── reference/archive/text-content-tables.md  # MOVED from docs/reference/
├── reference/copy-tone-guide.md          # MODIFIED — one pointer line
├── COMPONENT_LIBRARY.md  UI_SHELL.md     # MODIFIED — citations of per-file label tables updated to the content module
└── CLAUDE.md                             # MODIFIED — reference-docs pointer + one TL;DR line
```

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise. A new string discovered mid-migration goes in the inventory, not silently into content.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Primitives keep their contract.** `DualLabel` and every control still read `loreLabel`/`humanLabel` off a schema (`docs/COMPONENT_LIBRARY.md`). The single exception is the `label` → `humanLabel` rename on radio options (assumption 4). No primitive imports `CONTENT` for a *feature's* words — only for its own (`ui.*`, `lfo.*`).
* **No wording changes to approved copy.** Every string from the 2026-09-29 pass is transcribed byte-for-byte; the inventory's review rows are the only place new words enter, and only after Crawford fills them.
* **One entry per concept, no surface entries.** A key named for a surface (`...Row`, `...Heading`, `...Accordion`) is a spec violation. If two surfaces need different text for one concept, that is `heading` (§1.6) or a review question — never a second key.
* **Keys are not ids.** Nav ids, schema ids, `sectionRefs` anchors and `accordionSync` keys are untouched. Nothing parses a content key.
* **Casing stays in the strings** (`COMPONENT_LIBRARY.md`'s rule) — no `text-transform` is introduced to tidy the ALL CAPS headings; the review gate rewrites them.
* **Intro HTML keeps its current format**; `IntroPanel`'s DOMPurify path is unchanged.
* **No i18n machinery.** One language. No locale switching, no message IDs beyond the key, no pluralisation library.
* **`as const satisfies`, never a widened `Record<string, ContentEntry>` export** — the typed key union is the whole point.
* **Tests assert against `CONTENT`, not literals**, wherever they check rendered copy (`screen.getByText(CONTENT['fleet.pacing.tempo'].human)`), so a copy edit never breaks a test that wasn't about the words.
* **Ask first:** any change to `IntroPanel`'s render shape; adding a dependency; any proposal to make the content module JSON/MDX instead of TS.

---

## 4. Code Style & Architecture Conventions

**`src/content/copy/fleet.ts`** (excerpt):

```typescript
import type { ContentEntry } from '../types';

/** Fleet Params — the global chain. One entry per concept; the nav row, the slider label and the
 *  accordion heading for a concept all read the same key (docs/specs/CONTENT_LAYER.md §1.1). */
export const fleet = {
  'fleet.intro': {
    human: 'Fleet Params',
    lore: 'Environment',
    intro: {
      lore: 'Fleet Params — your key to mesh-wide performance.',
      loreDescription: 'Fleets of probes stay synchronized through Meridia Comms Group’s Undersea Mesh Network, broadcasting the same audio signature settings to every unit at once.',
      humanDescription: 'This screen holds every control that shapes the sound of your whole fleet at once — pacing, EQ and filtering, drift, spatial effects, and output. Changes here apply to every probe simultaneously; to adjust one probe at a time, use the Probes screen instead.',
    },
  },
  'fleet.pacing': {
    human: 'Pacing',
    lore: 'Trace Timing',
    intro: { /* … */ },
  },
  'fleet.pacing.tempo': { human: 'Tempo', lore: 'Ping Rate', unit: 'BPM' },
  'fleet.lpf.cutoff': { human: 'Cutoff', lore: 'Extraction Floor', unit: 'Hz' },
  'fleet.output.decayMode': {
    human: 'Decay Mode',
    lore: 'Dissipation Protocol',
    options: {
      natural: { human: 'Natural Decay', lore: 'Dissipation' },
      controlled: { human: 'Controlled Decay', lore: 'Clamped' },
    },
  },
} as const satisfies Record<string, ContentEntry>;
```

**`src/content/index.ts`** (the helpers):

```typescript
export function labels(key: ContentKey) {
  const e: ContentEntry = CONTENT[key];
  return {
    humanLabel: e.human,
    ...(e.lore !== undefined && { loreLabel: e.lore }),
    ...(e.placeholder !== undefined && { placeholder: e.placeholder }),
    ...(e.unit !== undefined && { unit: e.unit }),
  };
}

export function options(key: ContentKey) {
  const e: ContentEntry = CONTENT[key];
  if (!e.options) throw new Error(`[content] ${key} has no options`);
  return Object.entries(e.options).map(([value, o]) => ({
    value, humanLabel: o.human, ...(o.lore !== undefined && { loreLabel: o.lore }),
  }));
}

export function fill(key: ContentKey, vars: Record<string, string>): string {
  return CONTENT[key].human.replace(/\{(\w+)\}/g, (_, slot) => {
    if (!(slot in vars)) throw new Error(`[content] ${key}: no value for {${slot}}`);
    return vars[slot];
  });
}
```

**A migrated schema** (`src/data/audioRigConfig.ts`, before → after):

```typescript
// before
{ field: 'frequency', schema: { id: 'filterLPF.frequency', type: 'sliderLog', loreLabel: 'Extraction Floor', humanLabel: 'Cutoff', min: 20, max: 20000, unit: 'Hz', orientation: 'vertical', verticalHeight: 256 } },
// after
{ field: 'frequency', schema: { id: 'filterLPF.frequency', type: 'sliderLog', ...labels('fleet.lpf.cutoff'), min: 20, max: 20000, orientation: 'vertical', verticalHeight: 256 } },
```

**A migrated nav node** (`src/data/navTreeConfig.ts`):

```typescript
{ id: 'fleetParams.pacing', content: 'fleet.pacing', trait: 'composition', children: [
  { id: 'fleetParams.pacing.tempo', content: 'fleet.pacing.tempo' },
] }
```

**A migrated dynamic label** (`CompanyCrudControls.tsx`):

```typescript
// content: 'company.delete': { human: 'Delete {company}', lore: 'Dissolve Unit' }
const deleteSchema: ButtonSchema = { ...DELETE_COMPANY_SCHEMA, humanLabel: fill('company.delete', { company: selectedCompany.name }) };
```

* **Naming:** keys lowercase area + camelCase segments; copy files named after their area; helpers are verbs (`labels`, `options`, `intro`, `fill`).
* **Formatting:** one entry per line for leaf concepts, multi-line only for entries with `intro` or `options`; keep the file in the same order as the UI reads top-to-bottom so a reviewer can scan it like the screen.
* **Comments in copy files are for *why a concept exists*, never for restating the string.**

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest (+ React Testing Library for component tests). Colocated, matching §2.
* **`src/content/index.test.ts` (new):**
  1. `labels()` returns exactly the fields the entry has — `humanLabel` always; `loreLabel`/`placeholder`/`unit` only when present (an `undefined`-valued key is a failure, since it would override a schema default on spread).
  2. `options()` preserves declaration order, maps `human`→`humanLabel`/`lore`→`loreLabel`, and throws for an entry without options.
  3. `intro()` returns the typed block and throws for an entry without one.
  4. `fill()` substitutes every slot and throws on a missing var; a template with no slots returns unchanged.
* **`src/content/content.test.ts` (new, the guard — §1.7):** every key referenced from `src/` outside `src/content/`; no `[c]`; non-empty `human`; key grammar + closed area list; same-area duplicate `human`+`lore` pair reported as a failure listing both keys.
* **ESLint (modified):** a fixture-style assertion is not practical; verify by (a) `npm run lint` passing on the finished tree and (b) a deliberate temporary `humanLabel: 'X'` in a component producing the rule's message during the guard task, recorded in the task's verify step (the "reintroduce the bug the metric should catch" convention from `docs/PERFORMANCE.md`).
* **`src/data/*.test.ts` (modified):** wherever a test asserts a literal label, it asserts `CONTENT[key].human`/`.lore` instead; structural assertions (ids unique, bounds, option counts) unchanged. `robotSelectionConfig.test.ts`'s value-label coverage becomes `options('probe.status.docking')` coverage, etc.
* **`navTreeConfig.test.ts` / `useNavTree.test.ts` (modified):** every node has a `content` key that exists in `CONTENT`; the resolved row label equals `CONTENT[node.content].human`; no node carries `loreLabel`/`humanLabel`/`docId` fields.
* **`robotSubsectionConfig.test.ts` (modified):** each section/subsection resolves to a content key; the `rhythm` row vs "Composition" accordion case resolves to two distinct keys with the expected `human` values.
* **Content components (modified `*.test.tsx`):** `FleetParamsContent`, `SettingsContent`, `ProbesContent`, `CompaniesContent`, `RobotSectionAccordionStack` render the intro headline/body from `intro(key)` — assert with `CONTENT`, not literals; accordion headings equal `CONTENT[key].human`.
* **`RadioButton.test.tsx` (modified):** options render `humanLabel` (and `loreLabel` where present); a `label`-shaped option is a type error, not a runtime fallback.
* **`Lfo.test.tsx`, `Stepper.test.tsx`, `PowerRockerSwitch.test.tsx`, `CompanyCrudControls.test.tsx` (modified):** their strings come from `CONTENT`/`fill()`.
* **Verification Steps:**
  1. `npm run build:types` — zero errors (surfaces every stale `label` option field and every removed nav/subsection label field).
  2. `npm run lint` — zero errors (the new rule is the proof the migration is complete: it must pass with the rule on).
  3. `npm test` — all pass, including the two new content suites.
  4. `npm run build` — production bundle builds.
  5. `docs/reference/content-inventory.md` no longer exists (every row consumed) and `scripts/content/inventory.mjs` is deleted with it.
* **Manual check (not automated):** walk every view (Deck, Fleet Params, Probes incl. All Probes and one robot, Companies incl. one company, Settings incl. Sessions and Seeds) at desktop and phone width and confirm no label reads as a key, `undefined`, or `[c]`; confirm the six former placeholders and the rewritten headings show their approved copy; confirm screen-reader names on a stepper and the power switch (browser accessibility tree) read the filled templates.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** TBD at Tasks time (suggest `feature/content-layer`).
* **Commit Pattern:** Short, imperative sentences. Suggested grouping, each independently reviewable and each leaving the suite green:
  1. `src/content/` types + helpers + their tests, with the `fleet` area populated verbatim from today's strings — nothing consumes it yet.
  2. The inventory script + `docs/reference/content-inventory.md` — **gate: Crawford fills the copy column before anything in step 6 lands.**
  3. Remaining copy areas populated verbatim (approved strings only).
  4. `src/data/*Config.ts` migrated to `labels()`/`options()` + the `label`→`humanLabel` rename (`controls.ts`, `RadioButton.tsx`, `sectorSettingsConfig.ts`) + their tests.
  5. Nav tree + `robotSubsectionConfig` + `useNavTree` migrated; `docId` removed.
  6. Content components' intro tables and inline schemas migrated; primitives' own strings migrated; **the reviewed copy from step 2 lands here**.
  7. ESLint rule + `content.test.ts` guard — must pass on first try if 4–6 were complete; if it doesn't, that is a missed string, fixed here.
  8. Docs: `docs/CONTENT_LAYER.md`, archive the reference table, `COMPONENT_LIBRARY.md`/`UI_SHELL.md`/`CLAUDE.md`/`copy-tone-guide.md` pointers; delete the inventory and its script.

---

## 7. Open Questions & Risks

Resolved during Specify (against the intent doc, not left open):

- ~~TS or JSON?~~ **TS** — only Crawford edits it; typed keys win.
- ~~One entry per concept or per surface?~~ **Per concept**, surfaces as fields; nav lore is the concept's `lore`.
- ~~Scope of "text"?~~ **Anything a user can see or hear**, incl. units, placeholders, aria templates; seeded/typed names and dev logs excluded.
- ~~Clean keys or reuse ids?~~ **Clean scheme** (§1.2), ids untouched.
- ~~Reference table?~~ **Retired** to the archive folder; tone guide stays.
- ~~Placeholders?~~ **Cleaned up in this pass** via the review gate, per the tone guide.

Resolved at spec review (2026-09-30), nothing left open:

- ~~Is `lfo` its own area?~~ **No** — the shared LFO control's words live under `ui.lfo.*`; `ui` is the home for every shared control's own copy.
- ~~`heading` field?~~ **Yes, supported** — `labels(key, { surface: 'heading' })` resolves `heading ?? lore`; a row never reads it (§1.6).
- ~~Sector preset names content?~~ **No** — names are data: preset names, company names, probe names, attenuation-style names all stay out; `SectorPreset.label` → `.name` and is guard-exempt (§1.4).
- ~~Value-label maps?~~ **Thin wrappers** via `optionsRecord()`; consumers untouched (§1.3/§1.4).

Risks:

- **The inventory is bigger than the survey suggests.** The regexes used for the survey miss strings built by concatenation or ternaries (`isPoweredOn ? 'Power on' : 'Power off'`). Mitigation: the ESLint rule in step 7 is the real completeness check; expect one round of stragglers.
- **Spread-in `undefined` overriding schema defaults.** `labels()` must omit absent fields rather than emit `undefined` (tested, §5.1), or `unit: undefined` would silently clear a slider's suffix.
- **Test churn.** Many tests assert literal labels today; converting them is mechanical but wide. Mitigation: commit-per-area so each diff stays reviewable; never "fix" a failing literal assertion by changing content.
- **`JSXText` lint rule false positives** on symbol-only or punctuation text (`—`, `:`). The `[A-Za-z]{3,}` guard handles the common cases; anything legitimate (an em dash between two content reads) is written as `{' — '}`, not exempted from the rule.
- **Transcription errors** while moving ~350 strings. Mitigation: copy files are populated by reading the current literals, and the data/config tests compare rendered output against `CONTENT` *after* the move — a mistyped string would surface as a diff in the manual walk, so that walk is not optional.
