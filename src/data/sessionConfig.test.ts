import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  SESSION_NAME_INPUT_SCHEMA, SAVE_SESSION_SCHEMA, SHARE_SESSION_SCHEMA, LOAD_SESSION_SCHEMA, DELETE_SESSION_SCHEMA, CLEAR_STORAGE_SCHEMA,
} from './sessionConfig';
import { CONTENT } from '@/content';

describe('sessionConfig reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 8)', () => {
  it('carries no copy literal of its own', () => {
    const src = readFileSync(resolve(__dirname, 'sessionConfig.ts'), 'utf8');
    expect(src).not.toMatch(/(loreLabel|humanLabel|unit|placeholder)\s*:\s*['"`]/);
  });
  it('every schema label equals its concept\'s CONTENT entry', () => {
    expect([SESSION_NAME_INPUT_SCHEMA.humanLabel, SESSION_NAME_INPUT_SCHEMA.loreLabel, SESSION_NAME_INPUT_SCHEMA.placeholder])
      .toEqual([CONTENT['session.name'].human, CONTENT['session.name'].lore, CONTENT['session.name'].placeholder]);
    expect(SAVE_SESSION_SCHEMA.humanLabel).toBe(CONTENT['session.save'].human);
    expect(SHARE_SESSION_SCHEMA.humanLabel).toBe(CONTENT['session.share'].human);
    expect(LOAD_SESSION_SCHEMA.loreLabel).toBe(CONTENT['session.load'].lore);
    expect(DELETE_SESSION_SCHEMA.loreLabel).toBe(CONTENT['session.delete'].lore);
    expect(CLEAR_STORAGE_SCHEMA.humanLabel).toBe(CONTENT['session.clearStorage'].human);
  });
  it('ids are unique and session-prefixed', () => {
    const ids = [SESSION_NAME_INPUT_SCHEMA, SAVE_SESSION_SCHEMA, SHARE_SESSION_SCHEMA, LOAD_SESSION_SCHEMA, DELETE_SESSION_SCHEMA, CLEAR_STORAGE_SCHEMA].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^session\./);
  });
});
