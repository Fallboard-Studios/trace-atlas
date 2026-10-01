#!/usr/bin/env node
/**
 * Content inventory (docs/tasks/CONTENT_LAYER.md Task 2, spec §1.5) — ONE-OFF, deleted with its
 * output once every row has approved copy (Task 19).
 *
 * Walks src/components, src/data and src/types (excluding tests) and writes
 * docs/reference/content-inventory.md with:
 *   1. Hardcoded strings — user-facing text that is NOT already a loreLabel/humanLabel/label/
 *      placeholder/unit/loreDescription/humanDescription property: JSX text, aria-label/title/
 *      placeholder/alt attributes, template literals with words, ternary string pairs, and
 *      string-valued map entries. Crawford fills the "copy" column; nothing here is migrated
 *      with its current wording until he has.
 *   2. Placeholders — every `[c]` string and every ALL CAPS loreLabel (legacy headings).
 *   3. Conflicts — concepts whose nav row and control disagree today (hand-listed below).
 *
 * Usage: node scripts/content/inventory.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src/components', 'src/data', 'src/types'];
const OUT = 'docs/reference/content-inventory.md';

/** A line that already carries a copy field anywhere (inline schema objects included), or is a
 *  `+ '…'` continuation of a multi-line copy string — approved copy, migrates verbatim, not section 1. */
const COPY_LINE = /\b(loreLabel|humanLabel|label|placeholder|unit|loreDescription|humanDescription)\s*:|^\s*\+\s*'/;
const SKIP_LINE = /(^\s*(\/\/|\*|\/\*))|devWarn|devLog|console\.|throw new|new Error\(|import |data-testid|from '|aria-labelledby|key=\{/;
const ALL_CAPS = /^[A-Z0-9 &/'’.[\]-]+$/;
const HAS_WORD = /[A-Z]{3,}/;

/** Hand-listed: concepts where the nav row (2026-09-29 copy pass) and the control disagree. The
 *  content entry takes the copy pass's text (docs/specs/CONTENT_LAYER.md §1.6 rationale); listed so
 *  Crawford can veto. */
const CONFLICTS = [
  ['settings.quality.robotLoad', 'nav: Fleet Size / Voice Limit', 'slider (audioRigConfig AUDIO_ROBOT_LOAD_SCHEMA): ACOUSTIC LOAD CEILING / Robot Load', 'entry = Voice Limit / Fleet Size'],
  ['settings.quality.effectsLoad', 'nav: Trace Budget / Effects Limit', 'slider (AUDIO_EFFECTS_LOAD_SCHEMA): MODULATION LOAD CEILING / Effects Load', 'entry = Effects Limit / Trace Budget'],
  ['sector.attenuationStyle', 'nav: Attenuation Style / Atmosphere', 'text input (ATTENUATION_STYLE_SCHEMA): ATTENUATION SEED / Attenuation Style', 'entry = Atmosphere / Attenuation Style'],
  ['sector.coords', 'nav: Atlas Vector / Location', 'coords input (COORDS_SCHEMA): PLOT VECTOR / Coordinates', 'entry = Location / Atlas Vector'],
  ['settings.quality (intro prose)', '—', 'SettingsContent humanDescription still says "Robot Load" / "Effects Load"', 'prose left verbatim; reword if the labels above change'],
  ['probe.source.core / .companion / .accent', 'nav + accordion: Core Oscillator / Companion Oscillator / Accent Oscillator', 'layer panel heading (robotOptionsConfig SIGNATURE_ARRAY_CONFIG): Core / Companion / Accent', 'entry = the long form; the panel reads it too'],
  ['probe.monitorMode vs probe.status.monitorMode', 'radio (AUDIO_SETTING_SCHEMA) lore: Freeform / Standby / Featured / Elevated', 'badge map (AUDIO_MODE_LABELS) lore: OFFLINE / SILENCED / ISOLATED / PRIORITIZED — same values, same human words', 'kept as two entries for now (verbatim); merge into probe.monitorMode once the badge lore is decided'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

function surfaceOf(file) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const base = rel.split('/').pop().replace(/\.(ts|tsx)$/, '');
  return `${base} (${rel.split('/').slice(1, -1).join('/')})`;
}

const hardcoded = [];
const placeholders = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    let inBlockComment = false;
    lines.forEach((line, i) => {
      const loc = `${rel}:${i + 1}`;
      // Block comments (incl. JSX `{/* … */}`) can span lines — nothing inside is user-facing.
      if (inBlockComment) { if (line.includes('*/')) inBlockComment = false; return; }
      if (/\/\*(?!.*\*\/)/.test(line)) { inBlockComment = true; return; }
      const push = (kind, text) => hardcoded.push({ loc, kind, text: text.trim(), surface: surfaceOf(file) });

      if (SKIP_LINE.test(line)) return;

      // Section 2 — every `[c]` string and every ALL CAPS literal (legacy headings), wherever it
      // sits: a named copy field, an inline schema object, or a positional argument
      // (audioRigConfig's panelSchema(key, 'SPECTRAL FREQUENCY EQUALIZER', …)).
      const isCopyLine = COPY_LINE.test(line);
      for (const m of line.matchAll(/'([^']*)'/g)) {
        const text = m[1];
        if (text.includes('[c]')) placeholders.push({ loc, field: 'literal', text, why: '[c] placeholder' });
        // Multi-word ALL CAPS anywhere; a single ALL CAPS word only on a copy line (so enum
        // members like 'FACTORY' in src/types stay out, while 'DOCKED' as a loreLabel is in).
        else if (ALL_CAPS.test(text) && HAS_WORD.test(text) && (text.includes(' ') || (isCopyLine && text.length >= 4))) {
          placeholders.push({ loc, field: isCopyLine ? 'copy field' : 'literal', text, why: 'ALL CAPS legacy heading' });
        }
      }
      // Approved copy fields (and their continuation lines) migrate verbatim — not section 1.
      if (COPY_LINE.test(line)) return;

      // JSX text node on one line: >Some words<  (never code: no =>, (, ;, =)
      for (const m of line.matchAll(/(?<![=-])>\s*([^<>{}]*[A-Za-z]{3,}[^<>{}]*?)\s*</g)) {
        const t = m[1].trim();
        if (!/^[A-Za-z]/.test(t) || /=>|[();=]/.test(t)) continue;
        push('jsx-text', t);
      }
      // Bare JSX text line (multi-line children): starts with a capital, no code punctuation.
      if (/\.tsx$/.test(file) && /^\s+[A-Z][A-Za-z’'.,—\- ]{10,}$/.test(line)) push('jsx-text', line);
      // Attributes
      for (const m of line.matchAll(/(aria-label|title|placeholder|alt)=["']([^"']+)["']/g)) push(`attr:${m[1]}`, m[2]);
      // Template literals with words (two words, or a capitalised word followed by a ${slot}),
      // ignoring class-name templates.
      for (const m of line.matchAll(/`([^`]*)`/g)) {
        const t = m[1];
        if (/sc-|__|--|^\s*$/.test(t)) continue;
        if (/[A-Za-z]{3,} [A-Za-z]{3,}/.test(t) || /^[A-Z][a-z]+ \$\{/.test(t)) push('template', t);
      }
      // Ternary string pairs
      for (const m of line.matchAll(/\?\s*'([A-Z][^']*)'\s*:\s*'([A-Z][^']*)'/g)) push('ternary', `${m[1]} | ${m[2]}`);
      // String-valued map entries: `  key: 'Capitalised words',` (not field/type/kind selectors, not enums)
      const map = /^\s+(?!field|type|kind|id)[a-zA-Z0-9_]+\s*:\s*'([A-Z][a-z][^']*)',?\s*$/.exec(line);
      if (map) push('map-entry', map[1]);
      // Quoted capitalised phrases in assignments/returns (?? 'Mutation', return 'Off', = 'Robot not found'),
      // never comparisons (=== 'Enter') or type unions (= 'Monolith' | …).
      for (const m of line.matchAll(/(?:\?\?|(?<![=!<>])=(?!=)|return)\s*'([A-Z][a-z][^']*)'(?!\s*\|)/g)) push('literal', m[1]);
    });
  }
}

const esc = (s) => s.replace(/\|/g, '\\|');
const section1 = hardcoded.map((r) => `| ${r.loc} | ${r.kind} | ${esc(r.text)} | ${esc(r.surface)} |  |  |`).join('\n');
const section2 = placeholders.map((r) => `| ${r.loc} | ${r.field} | ${esc(r.text)} | ${r.why} |  |  |`).join('\n');
const section3 = CONFLICTS.map((c) => `| ${c[0]} | ${esc(c[1])} | ${esc(c[2])} | ${esc(c[3])} |  |`).join('\n');

const doc = `# Content inventory — review gate (TEMPORARY)

Generated by \`node scripts/content/inventory.mjs\` for docs/tasks/CONTENT_LAYER.md Task 2 (spec §1.5).
**Delete this file and the script in Task 19** once every row below has approved copy.

How to fill it in: write the final text in the **copy** column (per docs/reference/copy-tone-guide.md),
or write \`keep\` to keep the current text, or \`data\` with a one-line reason if the string is a
value rather than copy. Leave **proposed key** for the implementer unless you have a preference.
Rows already carrying approved copy from the 2026-09-29 pass are *not* here — they migrate verbatim.

## 1. Hardcoded strings (${hardcoded.length})

| file:line | kind | current text | surface | proposed key | copy |
|---|---|---|---|---|---|
${section1}

## 2. Placeholders and ALL CAPS legacy headings (${placeholders.length})

| file:line | field | current text | why | proposed key | copy |
|---|---|---|---|---|---|
${section2}

## 3. Nav-row vs control conflicts (${CONFLICTS.length})

One concept, two texts today. The content entry takes the 2026-09-29 copy-pass value (the nav's)
because that table records the control's text as the *old* value; veto in the last column.

| concept | nav today | control today | decision | override |
|---|---|---|---|---|
${section3}
`;

writeFileSync(join(ROOT, OUT), doc);
console.log(`wrote ${OUT}: ${hardcoded.length} hardcoded, ${placeholders.length} placeholders, ${CONFLICTS.length} conflicts`);
