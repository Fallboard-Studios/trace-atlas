import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// TYPE_SCALE.md Task 9 — the last of the old --font-size-sm/md literal
// references, pure token swaps, no new mechanism. --font-mono (where it's
// actually declared) is untouched; only the size token reference changes.
//
// Correction to this task's own planning-time description, found while
// implementing: only PowerRockerSwitch.css's .power-confirm__title is
// actually --font-mono — .power-confirm__description and .power-confirm__btn
// have no font-family override at all (they inherit the document default,
// --font-sans/Rajdhani). This task still doesn't touch font-family on any of
// the files below — it's a pure size-token migration regardless of which
// family a given line happens to already have.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('PowerRockerSwitch.css confirm dialog', () => {
  const cssSource = readFileSync(
    resolve(repoRoot, 'src/components/ui/physical/PowerRockerSwitch.css'),
    'utf-8',
  );

  it('sizes the dialog title (the largest of the 3, old --font-size-md) with --font-size-label, keeping --font-mono untouched', () => {
    const body = getCssRuleBody(cssSource, '.power-confirm__title');
    expect(body).not.toBeNull();
    expect(body).toContain('font-family: var(--font-mono);');
    expect(body).toContain('font-size: var(--font-size-label);');
    expect(body).not.toContain('var(--font-size-md)');
  });

  it('sizes the description (old --font-size-sm) with --font-size-label-lore, preserving it reading smaller than the title', () => {
    const body = getCssRuleBody(cssSource, '.power-confirm__description');
    expect(body).not.toBeNull();
    expect(body).toContain('font-size: var(--font-size-label-lore);');
    expect(body).not.toContain('var(--font-size-sm)');
    // No font-family here before or after — inherits the document default.
    expect(body).not.toContain('font-family');
  });

  it('sizes the action buttons (old --font-size-sm) with --font-size-label-lore, matching the description', () => {
    const body = getCssRuleBody(cssSource, '.power-confirm__btn');
    expect(body).not.toBeNull();
    expect(body).toContain('font-size: var(--font-size-label-lore);');
    expect(body).not.toContain('var(--font-size-sm)');
    expect(body).not.toContain('font-family');
  });
});

// Header.css's status row (.header .header__row--status) was checked here. The slim header
// (docs/tasks/LAYOUT_REWORK.md Task 6) deleted that rule as dead: no component had rendered the row
// since the time and temperature readout moved out of the header (NavStatusBlock, then MetaBox).

describe('ConsolePanel.css stub (confirmed dead — zero .tsx consumers, migrated anyway per spec §7 item 5)', () => {
  const cssSource = readFileSync(
    resolve(repoRoot, 'src/components/panels/screen/console/ConsolePanel.css'),
    'utf-8',
  );

  it('sizes the stub with --font-size-label instead of the old 14px literal', () => {
    const body = getCssRuleBody(cssSource, '.console-panel__stub');
    expect(body).not.toBeNull();
    expect(body).toContain('font-size: var(--font-size-label);');
    expect(body).not.toContain('14px');
  });
});
