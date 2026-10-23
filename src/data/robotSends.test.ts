// ========================================
// IMPORTS
// ========================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  ROBOT_SENDS,
  ROBOT_SEND_BY_FIELD,
  ROBOT_SEND_FIELDS,
  engineKeyOf,
  robotSendLevels,
  type RobotSendField,
  type SendEngineKey,
  type SendRoomKey,
} from './robotSends';
// Namespace import so a removed export can be asserted absent at runtime (robotOptionsActions.test.ts's pattern).
import * as robotSendsModule from './robotSends';

// ========================================
// TESTS
// ========================================

// Robot Send Table T2 (docs/specs/ROBOT_SEND_TABLE.md §1.1): the one wiring table for the five robot sends.
describe('ROBOT_SENDS', () => {
  it('is the five rows of spec §1.1, in the load-bearing order (assumption 2)', () => {
    expect(ROBOT_SENDS).toEqual([
      { field: 'reverbSend', engineKey: 'reverb', shareCode: 'rs', contentKey: 'probe.reverbSend' },
      { field: 'delaySend', engineKey: 'delay', shareCode: 'ds', contentKey: 'probe.delaySend' },
      { field: 'gritSend', engineKey: 'grit', shareCode: 'gr', contentKey: 'probe.gritSend' },
      {
        field: 'shimmerSend',
        engineKey: 'shimmer',
        shareCode: 'sm',
        contentKey: 'probe.shimmerSend',
      },
      { field: 'doubleSend', engineKey: 'double', shareCode: 'db', contentKey: 'probe.doubleSend' },
    ]);
  });

  it('derives ROBOT_SEND_FIELDS from the table, so the two cannot drift', () => {
    expect(ROBOT_SEND_FIELDS).toEqual(ROBOT_SENDS.map((s) => s.field));
    expect(ROBOT_SEND_FIELDS).toEqual([
      'reverbSend',
      'delaySend',
      'gritSend',
      'shimmerSend',
      'doubleSend',
    ]);
  });

  it('has no duplicate field, engine key, share code or content key', () => {
    for (const column of ['field', 'engineKey', 'shareCode', 'contentKey'] as const) {
      expect(new Set(ROBOT_SENDS.map((s) => s[column])).size, column).toBe(ROBOT_SENDS.length);
    }
  });

  it('indexes every row by field, each lookup giving the row itself', () => {
    expect(Object.keys(ROBOT_SEND_BY_FIELD)).toEqual(ROBOT_SEND_FIELDS);
    for (const spec of ROBOT_SENDS) expect(ROBOT_SEND_BY_FIELD[spec.field]).toBe(spec);
  });

  it('writes each contentKey as a quoted literal in source (the content guard finds a key by its quoted text)', () => {
    const src = readFileSync(resolve(__dirname, 'robotSends.ts'), 'utf8');
    for (const spec of ROBOT_SENDS) {
      expect(src, spec.contentKey).toMatch(
        new RegExp(`contentKey: '${spec.contentKey.replace('.', '\\.')}'`)
      );
    }
  });

  // Review follow-up (2026-10-22): the wiring table owns the room keys too, so the tuning module (the bands) depends on
  // it and never the other way round; a type-only cycle between the two is gone.
  it('imports nothing from robotSendLoadingRanges.ts (the bands depend on the table, not the reverse)', () => {
    const src = readFileSync(resolve(__dirname, 'robotSends.ts'), 'utf8');
    expect(src).not.toMatch(/from\s+['"][^'"]*robotSendLoadingRanges['"]/);
    const bands = readFileSync(resolve(__dirname, 'robotSendLoadingRanges.ts'), 'utf8');
    expect(bands).toMatch(/import type \{[^}]*\bSendRoomKey\b[^}]*\} from '\.\/robotSends';/);
  });

  it('names the three effect-room keys, each an engine key', () => {
    const rooms: SendRoomKey[] = ['grit', 'shimmer', 'double'];
    const keys: SendEngineKey[] = rooms;
    expect(keys.every((key) => ROBOT_SENDS.some((spec) => spec.engineKey === key))).toBe(true);
    // @ts-expect-error - Reverb is a fixed room, not an effect room
    const notARoom: SendRoomKey = 'reverb';
    expect(notARoom).toBe('reverb');
  });

  it('types a field and an engine key, so an unknown one is a compile error', () => {
    const field: RobotSendField = 'gritSend';
    const key: SendEngineKey = 'shimmer';
    expect(engineKeyOf(field)).toBe('grit');
    expect(ROBOT_SENDS.some((spec) => spec.engineKey === key)).toBe(true);
    // @ts-expect-error - 'volumeSend' is not a send field
    const notAField: RobotSendField = 'volumeSend';
    // @ts-expect-error - 'chorus' is not a send engine key (the room is 'double')
    const notAKey: SendEngineKey = 'chorus';
    expect([notAField, notAKey]).toEqual(['volumeSend', 'chorus']);
  });
});

describe('engineKeyOf', () => {
  it('maps the five fields to the five engine keys', () => {
    expect(ROBOT_SEND_FIELDS.map(engineKeyOf)).toEqual([
      'reverb',
      'delay',
      'grit',
      'shimmer',
      'double',
    ]);
  });

  // Review follow-up (2026-10-22): the engine-key-to-field direction had no production caller, so it went with its index.
  it.each(['sendFieldOf', 'ROBOT_SEND_BY_ENGINE_KEY'])('%s is not exported (nothing maps an engine key back to a field)', (name) => {
    expect(name in robotSendsModule).toBe(false);
  });

  it('engineKeyOf is exported (the absence check reads the real module)', () => {
    expect('engineKeyOf' in robotSendsModule).toBe(true);
  });
});

describe('robotSendLevels', () => {
  it('reads the five sends straight off the robot, keyed by engine key, in table order', () => {
    const levels = robotSendLevels({
      reverbSend: 0.31,
      delaySend: 0.12,
      gritSend: 0.57,
      shimmerSend: 0.24,
      doubleSend: 0.43,
    });
    expect(levels).toStrictEqual({
      reverb: 0.31,
      delay: 0.12,
      grit: 0.57,
      shimmer: 0.24,
      double: 0.43,
    });
    expect(Object.keys(levels)).toEqual(['reverb', 'delay', 'grit', 'shimmer', 'double']);
  });

  it('neither clamps nor rounds nor drops (the engine clamps; a NaN is the engine to skip)', () => {
    const levels = robotSendLevels({
      reverbSend: 0.31,
      delaySend: 0,
      gritSend: 7,
      shimmerSend: NaN,
      doubleSend: -1,
    });
    expect(levels).toStrictEqual({ reverb: 0.31, delay: 0, grit: 7, shimmer: NaN, double: -1 });
  });

  it('keys by insertion in table order even when the robot lists its fields in another order', () => {
    const levels = robotSendLevels({
      doubleSend: 0.5,
      shimmerSend: 0.4,
      gritSend: 0.3,
      delaySend: 0.2,
      reverbSend: 0.1,
    });
    expect(JSON.stringify(levels)).toBe(
      '{"reverb":0.1,"delay":0.2,"grit":0.3,"shimmer":0.4,"double":0.5}'
    );
  });

  it('returns a fresh object every call (a caller may keep it)', () => {
    const robot = {
      reverbSend: 0.1,
      delaySend: 0.2,
      gritSend: 0.3,
      shimmerSend: 0.4,
      doubleSend: 0.5,
    };
    expect(robotSendLevels(robot)).not.toBe(robotSendLevels(robot));
  });
});
