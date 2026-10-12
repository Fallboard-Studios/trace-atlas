import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// docs/tasks/DECK_CAMERA_FOLLOW.md Task 12. A docs task has no behaviour to test, so this makes its
// criteria executable: ANIMATION_SYSTEM.md's "Deck camera" section describes the follow loop (not the
// superseded idle-cut model), names only exports, constants and store fields that exist, states the
// who-may-call rule, and the spec names no constant that is neither live nor on the removed list.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) =>
  readFileSync(resolve(repoRoot, relative), 'utf-8').replace(/\r\n/g, '\n');

const ANIMATION_DOC = 'docs/ANIMATION_SYSTEM.md';
const MODULE = 'src/animation/deckCamera.ts';
const CONSTANTS = 'src/constants/deckCamera.ts';

/** The "Deck camera" `###` section of ANIMATION_SYSTEM.md, up to the next `###` or `##` heading. */
function deckCameraSection(): string {
  const text = read(ANIMATION_DOC);
  const start = text.search(/^### Deck camera/m);
  expect(start, `${ANIMATION_DOC} has a "### Deck camera" section`).toBeGreaterThanOrEqual(0);
  const bodyStart = text.indexOf('\n', start) + 1;
  const next = text.slice(bodyStart).search(/^#{2,3} /m);
  return next === -1 ? text.slice(start) : text.slice(start, bodyStart + next);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (s: string) => new RegExp(`\\b${escape(s)}\\b`);
/** A `DECK_CAMERA_*` constant reference; not a prefix of a file name such as DECK_CAMERA_FOLLOW.md. */
const CONSTANT_REFERENCE = /\bDECK_CAMERA_[A-Z_]+(?![A-Z_]|\.md)/g;

describe('ANIMATION_SYSTEM.md describes the follow loop, not the idle-cut model', () => {
  it('names none of the idle-cut symbols or ideas as current', () => {
    const section = deckCameraSection();
    for (const stale of [
      'isDeckCameraIdle',
      'cutDeckCameraTo',
      'noteDeckUserInput',
      'deckCameraTarget',
      'DECK_CAMERA_IDLE_MS',
      'DECK_CAMERA_CUT_COOLDOWN_MS',
      'DECK_CAMERA_STATION_CHANCE',
    ]) {
      expect(section, `section mentions ${stale}`).not.toMatch(word(stale));
    }
  });

  it('describes the follow, cooldown and pick cycle', () => {
    const section = deckCameraSection();
    expect(section).toMatch(/follow/i);
    expect(section).toMatch(/cooldown/i);
    expect(section).toMatch(/\bpick\b/i);
    expect(section).toMatch(/gsap\.ticker/);
  });

  it('describes both edit-return overrides', () => {
    const section = deckCameraSection();
    expect(section).toMatch(/edit-return/i);
    expect(section).toMatch(/robot/i);
    expect(section).toMatch(/company/i);
  });

  it('states that nothing else may call into the module', () => {
    const section = deckCameraSection();
    expect(section).toMatch(
      /nothing else|no other (module|code|component|caller)|only (these|those|the two)/i
    );
    // The two real callers are named, and they exist.
    for (const [name, file] of [
      ['WorldView', 'src/components/panels/screen/worldView/WorldView.tsx'],
      ['FollowedRobotMarker', 'src/components/panels/screen/worldView/FollowedRobotMarker.tsx'],
    ]) {
      expect(existsSync(resolve(repoRoot, file)), `${file} exists`).toBe(true);
      expect(section, `section names ${name}`).toContain(name);
      expect(read(file), `${file} imports the module`).toMatch(/animation\/deckCamera/);
    }
  });

  it('says the camera never touches audio', () => {
    expect(deckCameraSection()).toMatch(/AudioEngine|audio/);
  });
});

/** Every export the section names, and the file it must be exported from. */
const MODULE_EXPORTS = [
  'registerDeckScroller',
  'getFollowedRobotId',
  'subscribeFollowedRobot',
  'undockedRobotIds',
  'pick',
  'moveCameraTo',
  'deckCameraTargetFor',
];
const CONSTANT_NAMES = [
  'DECK_CAMERA_FOLLOW_MS',
  'DECK_CAMERA_COOLDOWN_MS',
  'DECK_CAMERA_MIN_BATTERY_PCT',
  'DECK_CAMERA_PAN_S',
  'DECK_CAMERA_TIMELINE_ID',
];
const STORE_FIELDS = ['selectedRobotId', 'selectedCompanyId', 'activeHubTile'];

describe('the Deck camera section names real code', () => {
  it.each(MODULE_EXPORTS)('names %s, which deckCamera.ts exports', (name) => {
    expect(deckCameraSection(), `section names ${name}`).toMatch(word(name));
    expect(read(MODULE), `${MODULE} exports ${name}`).toMatch(
      new RegExp(`export (async )?(function|const) ${escape(name)}\\b`)
    );
  });

  it.each(CONSTANT_NAMES)('names %s, which constants/deckCamera.ts exports', (name) => {
    expect(deckCameraSection(), `section names ${name}`).toMatch(word(name));
    expect(read(CONSTANTS), `${CONSTANTS} exports ${name}`).toMatch(
      new RegExp(`export const ${name}\\b`)
    );
  });

  it.each(STORE_FIELDS)('names the uiStore field %s, which uiStore.ts defines', (name) => {
    expect(deckCameraSection(), `section names ${name}`).toMatch(word(name));
    expect(read('src/stores/uiStore.ts'), `uiStore.ts defines ${name}`).toMatch(word(name));
  });

  it('names no DECK_CAMERA_ constant or deckCamera export that does not exist', () => {
    const section = deckCameraSection();
    const constants = read(CONSTANTS);
    for (const [name] of section.matchAll(CONSTANT_REFERENCE)) {
      expect(constants, `section names ${name}`).toMatch(new RegExp(`export const ${name}\\b`));
    }
  });

  it('names no src/ path that does not exist', () => {
    const section = deckCameraSection();
    for (const [path] of section.matchAll(/src\/[A-Za-z0-9_./-]+\.(?:ts|tsx|css)/g)) {
      expect(existsSync(resolve(repoRoot, path)), `${path} exists`).toBe(true);
    }
  });
});

describe('the spec and plan name only live deck-camera constants, or ones they say were removed', () => {
  // The shipped idle-cut model's constants; the spec and plan mention them as what this phase deletes.
  const removed = [
    'DECK_CAMERA_IDLE_MS',
    'DECK_CAMERA_CUT_COOLDOWN_MS',
    'DECK_CAMERA_STATION_CHANCE',
  ];

  it.each(['docs/specs/DECK_CAMERA_FOLLOW.md', 'docs/tasks/DECK_CAMERA_FOLLOW.md'])('%s', (doc) => {
    const constants = read(CONSTANTS);
    for (const [name] of read(doc).matchAll(CONSTANT_REFERENCE)) {
      if (removed.includes(name)) continue;
      expect(constants, `${doc} names ${name}`).toMatch(new RegExp(`export const ${name}\\b`));
    }
  });
});

describe('CLAUDE.md', () => {
  it('describes ANIMATION_SYSTEM.md as covering the deck camera follow loop, not the idle cut', () => {
    const line = read('CLAUDE.md')
      .split('\n')
      .find((l) => l.includes('docs/ANIMATION_SYSTEM.md'));
    expect(line, 'CLAUDE.md has a reference line for ANIMATION_SYSTEM.md').toBeDefined();
    expect(line).toMatch(/deck camera/i);
    expect(line).toMatch(/follow/i);
    expect(line).not.toMatch(/idle[- ]cut/i);
  });
});
