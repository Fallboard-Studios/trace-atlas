import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeldOffNote } from './HeldOffNote';
import { CONTENT } from '@/content';

describe('HeldOffNote', () => {
  it('renders the held-off note text from content, as a note landmark', () => {
    render(<HeldOffNote />);
    expect(screen.getByRole('note').textContent).toBe(CONTENT['ui.heldOff'].human);
  });
});
