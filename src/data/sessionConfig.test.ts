import { describe, it, expect } from 'vitest';
import { CLEAR_STORAGE_SCHEMA } from './sessionConfig';
import { CONTENT } from '@/content';

describe('sessionConfig reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 8)', () => {
  // Task 17 follow-up: the button reads the action; the label row over it is session.clearStorage.
  it('Factory Reset\'s button reads the action\'s CONTENT entry', () => {
    expect(CLEAR_STORAGE_SCHEMA.humanLabel).toBe(CONTENT['session.clearStorage.action'].human);
  });

  it('its id is session-prefixed', () => {
    expect(CLEAR_STORAGE_SCHEMA.id).toMatch(/^session\./);
  });
});
