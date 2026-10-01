import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeldOffNote } from './HeldOffNote';
import { CONTENT } from '@/content';

describe('HeldOffNote', () => {
  it('renders the held-off note text from content, as a note landmark', () => {
    render(<HeldOffNote />);
    expect(screen.getByRole('note').textContent).toBe(CONTENT['ui.heldOff'].human);
  });

  it('carries no copy literal of its own (docs/specs/CONTENT_LAYER.md, Task 16)', () => {
    const source = readFileSync(resolve(__dirname, 'HeldOffNote.tsx'), 'utf8');
    expect(source).not.toMatch(/Held off by Audio Load/);
  });
});
