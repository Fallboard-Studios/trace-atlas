import { describe, it, expect } from 'vitest';
import {
  PAN_DISPLAY_SCALE,
  SEND_MIN,
  SEND_MAX,
  SEND_DISPLAY_SCALE,
  SEND_STEP_PERCENT,
  SEND_DELAY_QUIET_THRESHOLD,
} from './index';

// Robot Sends T1 (docs/specs/ROBOT_SENDS.md section 1.1).
describe('Robot Send constants', () => {
  it('stores a send as a 0..1 fraction', () => {
    expect(SEND_MIN).toBe(0);
    expect(SEND_MAX).toBe(1);
  });

  it('shows a send as 0..100 percent in 1 percent steps, the Volume split', () => {
    expect(SEND_DISPLAY_SCALE).toBe(100);
    expect(SEND_STEP_PERCENT).toBe(1);
    expect(SEND_MAX * SEND_DISPLAY_SCALE).toBe(100);
    expect(SEND_DISPLAY_SCALE).toBe(PAN_DISPLAY_SCALE);
  });

  it('keeps the quiet-delay chance at the 0.25 the global Delay roll used', () => {
    expect(SEND_DELAY_QUIET_THRESHOLD).toBe(0.25);
  });
});
