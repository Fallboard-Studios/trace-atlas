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
import { home } from './home';
import { header } from './header';
import { nav } from './nav';
import { settings } from './settings';
import { session } from './session';
import { sector } from './sector';
import { ui } from './ui';
import { makeHelpers } from '../index';
import { NAV_TREE_SCHEMA, type NavTreeNodeSchema } from '@/data/navTreeConfig';
import {
  SESSION_NAME_INPUT_SCHEMA, SAVE_SESSION_SCHEMA, SHARE_SESSION_SCHEMA, LOAD_SESSION_SCHEMA, DELETE_SESSION_SCHEMA, CLEAR_STORAGE_SCHEMA,
} from '@/data/sessionConfig';
import { ATTENUATION_STYLE_SCHEMA, COORDS_SCHEMA, RETRANSMIT_SCHEMA, STATUS_HEADER_SCHEMA } from '@/data/sectorSettingsConfig';
import { LFO_SHAPES } from '@/types/lfo';

// Source files are CRLF on this machine; the content strings are LF.
const read = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf8').replace(/\r\n/g, '\n');
const pair = (e: { human: string; lore?: string; unit?: string; placeholder?: string }) => [e.human, e.lore, e.unit, e.placeholder];
const schemaPair = (s: { humanLabel?: string; loreLabel?: string; unit?: string; placeholder?: string }) => [s.humanLabel, s.loreLabel, s.unit, s.placeholder];

function findNode(id: string, nodes: NavTreeNodeSchema[] = NAV_TREE_SCHEMA): NavTreeNodeSchema | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children && findNode(id, n.children);
    if (hit) return hit;
  }
  return undefined;
}

describe('home', () => {
  it('HOME_HTML fragments are in ContentPane verbatim', () => {
    const src = read('components/panels/screen/console/ContentPane.tsx').replace(/'\s*\n\s*\+\s*'/g, '');
    const { lore, loreDescription, humanDescription } = home['home.root'].intro;
    expect(src).toContain(`<h2>${lore}</h2>`);
    expect(src).toContain(loreDescription);
    expect(src).toContain(humanDescription);
  });
});

describe('header', () => {
  const src = read('components/panels/screen/Header.tsx');
  it('mute + volume', () => {
    expect(src).toContain(`loreLabel: '${header['header.mute'].lore}', humanLabel: '${header['header.mute'].human}'`);
    expect(src).toContain(`loreLabel: '${header['header.volume'].lore}',\n  humanLabel: '${header['header.volume'].human}'`);
  });
});

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

describe('settings', () => {
  it.each([
    ['settings', 'settings.root'], ['settings.quality', 'settings.quality'],
    ['settings.quality.robotLoad', 'settings.quality.robotLoad'], ['settings.quality.effectsLoad', 'settings.quality.effectsLoad'],
    ['settings.sectorSettings', 'settings.seeds'], ['settings.sessions', 'settings.sessions'],
  ] as const)('nav %s ↔ %s', (navId, key) => {
    const n = findNode(navId)!;
    expect([settings[key].human, (settings[key] as { lore?: string }).lore]).toEqual([n.humanLabel, n.loreLabel]);
  });
  it.each(['settings.root', 'settings.quality', 'settings.seeds', 'settings.sessions'] as const)('%s intro in SettingsContent', (k) => {
    const src = read('components/panels/screen/nav/content/SettingsContent.tsx');
    const { lore, loreDescription, humanDescription } = settings[k].intro;
    for (const s of [lore, loreDescription, humanDescription]) expect(src).toContain(s);
  });
});

describe('session', () => {
  it('config schemas', () => {
    expect(pair(session['session.name'])).toEqual(schemaPair(SESSION_NAME_INPUT_SCHEMA));
    expect(pair(session['session.save'])).toEqual(schemaPair(SAVE_SESSION_SCHEMA));
    expect(pair(session['session.share'])).toEqual(schemaPair(SHARE_SESSION_SCHEMA));
    expect(pair(session['session.load'])).toEqual(schemaPair(LOAD_SESSION_SCHEMA));
    expect(pair(session['session.delete'])).toEqual(schemaPair(DELETE_SESSION_SCHEMA));
    expect(pair(session['session.clearStorage'])).toEqual(schemaPair(CLEAR_STORAGE_SCHEMA));
  });
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

describe('sector', () => {
  it('nav rows win the two conflicts; inputs keep placeholder', () => {
    expect([sector['sector.attenuationStyle'].human, sector['sector.attenuationStyle'].lore]).toEqual([findNode('settings.sectorSettings.attenuationStyle')!.humanLabel, findNode('settings.sectorSettings.attenuationStyle')!.loreLabel]);
    expect(sector['sector.attenuationStyle'].placeholder).toBe(ATTENUATION_STYLE_SCHEMA.placeholder);
    expect([sector['sector.coords'].human, sector['sector.coords'].lore]).toEqual([findNode('settings.sectorSettings.coordinates')!.humanLabel, findNode('settings.sectorSettings.coordinates')!.loreLabel]);
    expect(COORDS_SCHEMA.humanLabel).toBe('Coordinates'); // the control's old text, recorded as a conflict row
  });
  it('retransmit + status header', () => {
    expect(pair(sector['sector.retransmit'])).toEqual(schemaPair(RETRANSMIT_SCHEMA));
    expect(pair(sector['sector.status'])).toEqual(schemaPair(STATUS_HEADER_SCHEMA));
  });
  it('drawer + coords input inline schemas', () => {
    const drawer = read('components/panels/screen/console/SectorSettingsDrawer.tsx');
    expect(drawer).toContain(`loreLabel: '${sector['sector.random.attenuationStyle'].lore}', humanLabel: '${sector['sector.random.attenuationStyle'].human}'`);
    expect(drawer).toContain(`loreLabel: '${sector['sector.random.coords'].lore}', humanLabel: '${sector['sector.random.coords'].human}'`);
    expect(drawer).toContain(`'${sector['sector.preset.attenuationStyle'].lore}'`);
    expect(drawer).toContain(`'${sector['sector.preset.coords'].lore}'`);
    const coords = read('components/ui/controls/CoordsInput.tsx');
    expect(coords).toContain(`loreLabel: '${sector['sector.coords.x'].lore}', humanLabel: '${sector['sector.coords.x'].human}'`);
    expect(coords).toContain(`loreLabel: '${sector['sector.coords.y'].lore}', humanLabel: '${sector['sector.coords.y'].human}'`);
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
