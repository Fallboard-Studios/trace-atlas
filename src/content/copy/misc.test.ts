/**
 * Parity test (docs/tasks/CONTENT_LAYER.md Task 5) for the home/header/nav/settings/session/
 * sector/ui areas: each is a byte-for-byte copy of the literals it replaces. Deleted piecewise as
 * each source migrates (configs → Task 8, nav → Task 10, components → Tasks 12–16).
 *
 * Settings/sector concepts whose nav row and control disagree today are compared against the
 * nav (the 2026-09-29 copy pass's value); the control's old text is a conflict row in
 * docs/reference/content-inventory.md.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { nav } from './nav';
import { session } from './session';
import { ui } from './ui';
import { makeHelpers } from '../index';
import { SHARE_SESSION_SCHEMA, LOAD_SESSION_SCHEMA, DELETE_SESSION_SCHEMA } from '@/data/sessionConfig';
import { LFO_SHAPES } from '@/types/lfo';

// Source files are CRLF on this machine; the content strings are LF.
const read = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf8').replace(/\r\n/g, '\n');




describe('nav chrome', () => {
  it('home / toggle / breadcrumb', () => {
    expect(read('components/panels/screen/nav/NavPanel.tsx')).toContain(`loreLabel: '${nav['nav.home'].lore}', humanLabel: '${nav['nav.home'].human}'`);
    expect(read('components/panels/screen/nav/NavToggleButton.tsx')).toContain(`humanLabel: '${nav['nav.toggle'].human}'`);
    expect(read('components/panels/screen/nav/NavBreadcrumb.tsx')).toContain(`aria-label="${nav['nav.breadcrumb'].human}"`);
  });
  it('status block rows', () => {
    const src = read('components/panels/screen/nav/NavStatusBlock.tsx');
    expect(src).toContain(`?? '${nav['nav.status.unknownName'].human}'`);
    expect(src).toContain(`: '${nav['nav.status.noTemperature'].human}'`);
    const { fill } = makeHelpers(nav);
    expect(src).toContain('{emittingCount} of {maxAudibleRobots} Probes active.');
    expect(fill('nav.status.probesActive', { emitting: '3', max: '12' })).toBe('3 of 12 Probes active.');
    expect(src).toContain('Viewing {styleName} @ ({x}, {y}).');
    expect(fill('nav.status.viewing', { name: 'Glaxos', x: '1', y: '2' })).toBe('Viewing Glaxos @ (1, 2).');
  });
});


describe('session', () => {
  it('row templates reproduce SessionListItem\'s own concatenations', () => {
    const { fill } = makeHelpers(session);
    expect(fill('session.load', { session: 'Dusk' })).toBe(`${LOAD_SESSION_SCHEMA.humanLabel} Dusk`);
    expect(fill('session.share', { session: 'Dusk' })).toBe(`${SHARE_SESSION_SCHEMA.humanLabel} Dusk`);
    expect(fill('session.delete', { session: 'Dusk' })).toBe(`${DELETE_SESSION_SCHEMA.humanLabel} Dusk`);
  });
  it('status lines', () => {
    const item = read('components/panels/screen/console/SessionListItem.tsx');
    const panel = read('components/panels/screen/console/SessionsPanel.tsx');
    expect(item).toContain(session['session.status.linkCopied'].human);
    expect(item).toContain(session['session.status.copyFailed'].human);
    expect(panel).toContain('`Saved ${saveStatus.name} at ${saveStatus.savedAt}`');
    expect(panel).toContain('`${saveStatus.name} failed to save.`');
    const { fill } = makeHelpers(session);
    expect(fill('session.status.saved', { name: 'Dusk', time: '10:00' })).toBe('Saved Dusk at 10:00');
    expect(fill('session.status.saveFailed', { name: 'Dusk' })).toBe('Dusk failed to save.');
  });
});


describe('ui', () => {
  it('LFO control words + shape options in LFO_SHAPES order', () => {
    const lfo = read('components/ui/controls/Lfo.tsx');
    expect(lfo).toContain(`loreLabel: '${ui['ui.lfo.shape'].lore}', humanLabel: '${ui['ui.lfo.shape'].human}'`);
    expect(lfo).toContain(`loreLabel: '${ui['ui.lfo.rate'].lore}', humanLabel: '${ui['ui.lfo.rate'].human}'`);
    expect(lfo).toContain(`loreLabel: '${ui['ui.lfo.depth'].lore}', humanLabel: '${ui['ui.lfo.depth'].human}'`);
    expect(Object.keys(ui['ui.lfo.shape'].options)).toEqual([...LFO_SHAPES]);
    for (const [shape, o] of Object.entries(ui['ui.lfo.shape'].options)) {
      expect(lfo).toContain(`${shape}: '${o.human}'`);
      expect(lfo).toContain(`${shape}: '${o.lore}'`);
    }
    expect(read('components/ui/controls/useLfoTargetGroup.ts')).toContain(`?? '${ui['ui.lfo'].lore}'`);
  });
  it('stepper, power switch, held-off note, console panel, cancel', () => {
    const { fill } = makeHelpers(ui);
    const stepper = read('components/ui/controls/Stepper.tsx');
    expect(stepper).toContain('`Decrement ${accessibleName}`');
    expect(stepper).toContain('`Increment ${accessibleName}`');
    expect(fill('ui.stepper.increment', { name: 'Volume' })).toBe('Increment Volume');
    const power = read('components/ui/physical/PowerRockerSwitch.tsx');
    expect(power).toContain(`aria-label="${ui['ui.power.controls'].human}"`);
    expect(power).toContain(`'${ui['ui.power.on'].human}' : '${ui['ui.power.off'].human}'`);
    expect(power).toContain(`>${ui['ui.power.confirmTitle'].human}<`);
    expect(power).toContain(ui['ui.power.confirmBody'].human);
    expect(read('components/ui/controls/HeldOffNote.tsx')).toContain(ui['ui.heldOff'].human);
    expect(read('components/panels/screen/console/ConsolePanel.tsx')).toContain(`aria-label="${ui['ui.consolePanel'].human}"`);
    for (const f of ['components/company/CompanyCrudControls.tsx', 'components/panels/screen/console/SessionListItem.tsx', 'components/panels/screen/console/SessionsPanel.tsx']) {
      expect(read(f)).toContain(`>${ui['ui.cancel'].human}</AlertDialog.Cancel>`);
    }
  });
});
