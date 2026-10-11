import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// TYPE_SCALE.md Task 8 — the 3 files rendering a standalone <DualLabel>
// directly (not composed inside one of the 11 leaf ControlSchema
// primitives) each get font-family: var(--font-controls)/font-weight:
// var(--font-weight-control) on the element wrapping their DualLabel usage,
// per spec §1.5 (no container-type — that's explicitly out of scope,
// §1.4's own scope decision).
//
// RobotSelectionCard and its stylesheet were deleted with the Probes list (docs/tasks/LAYOUT_REWORK.md
// Task 21); the roster tile that replaced it renders no standalone DualLabel.
//
// RobotDisplaySection.tsx (Roadmap 15.3 update: restructured from a single
// .robot-display-section__row wrapper class into a centered-avatar grid,
// .robot-display-section__field/__field--*) still targets its shared root
// (.robot-display-section) here, for the same "one rule, not
// per-field-class-coupled" consistency — not because it's strictly required
// there. SectorSettingsDrawer.tsx's DualLabel has only one real wrapper
// (.sector-settings-drawer__status, not the whole drawer), so THAT stays
// scoped narrowly, matching the original plan — the drawer also renders
// other controls (TextInput, Button) with their own explicit font-family,
// so a drawer-root rule would be a bigger blast radius than this task needs.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// RobotDisplaySection was deleted by docs/tasks/LAYOUT_REWORK.md Task 16; its standalone DualLabels (the
// meta captions) moved into RobotScreen's avatar column, which carries the same host rules.
describe('RobotScreen.css standalone DualLabel host (the avatar column, from RobotDisplaySection.css)', () => {
  const cssSource = readFileSync(
    resolve(repoRoot, 'src/components/panels/screen/screens/RobotScreen.css'),
    'utf-8',
  );

  it('sets font-family/font-weight on the column (.robot-screen__avatar-column)', () => {
    const body = getCssRuleBody(cssSource, '.robot-screen__avatar-column');
    expect(body).not.toBeNull();
    expect(body).toContain('font-family: var(--font-controls);');
    expect(body).toContain('font-weight: var(--font-weight-control);');
  });

  it('gains no container-type/container-name (out of scope per spec §1.4)', () => {
    expect(cssSource).not.toContain('container-type');
    expect(cssSource).not.toContain('container-name');
  });

  it('tokenizes the meta value\'s font-weight to --font-weight-medium (same 600 value, not renumbered)', () => {
    const body = getCssRuleBody(cssSource, '.robot-screen__meta-value');
    expect(body).not.toBeNull();
    expect(body).toContain('font-weight: var(--font-weight-medium);');
    expect(body).not.toContain('font-weight: 600;');
  });
});

describe('SectorSettingsDrawer.css standalone DualLabel host', () => {
  const cssSource = readFileSync(
    resolve(repoRoot, 'src/components/panels/screen/console/SectorSettingsDrawer.css'),
    'utf-8',
  );

  it("sets font-family/font-weight scoped to the DualLabel's real wrapper (.sector-settings-drawer__status), not the whole drawer", () => {
    const statusBody = getCssRuleBody(cssSource, '.sector-settings-drawer__status');
    expect(statusBody).not.toBeNull();
    expect(statusBody).toContain('font-family: var(--font-controls);');
    expect(statusBody).toContain('font-weight: var(--font-weight-control);');

    // Regression guard: must not have been added at the drawer root instead,
    // which would also affect TextInput/Button's own already-correct fonts.
    const rootBody = getCssRuleBody(cssSource, '.sector-settings-drawer');
    expect(rootBody).not.toContain('font-family');
  });

  it('gains no container-type/container-name (out of scope per spec §1.4)', () => {
    expect(cssSource).not.toContain('container-type');
    expect(cssSource).not.toContain('container-name');
  });

  it('migrates .__status-line off the old 0.95em literal onto --font-size-label', () => {
    const body = getCssRuleBody(cssSource, '.sector-settings-drawer__status-line');
    expect(body).not.toBeNull();
    expect(body).toContain('font-size: var(--font-size-label);');
    expect(body).not.toContain('0.95em');
  });
});
