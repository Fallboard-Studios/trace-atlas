import { describe, it, expect } from 'vitest';

import {
  CABINET_BREAKPOINT_MOBILE_MAX,
  CABINET_BREAKPOINT_TABLET_MAX,
  CABINET_BOX_HEIGHT,
  CABINET_VOXEL_GAP,
} from './cabinetBreakpoints';

describe('cabinetBreakpoints', () => {
  it('orders the mobile breakpoint below the tablet breakpoint', () => {
    expect(CABINET_BREAKPOINT_MOBILE_MAX).toBeLessThan(CABINET_BREAKPOINT_TABLET_MAX);
  });

  it('mobile breakpoint is 639px', () => {
    expect(CABINET_BREAKPOINT_MOBILE_MAX).toBe(639);
  });

  it('tablet breakpoint is 1023px', () => {
    expect(CABINET_BREAKPOINT_TABLET_MAX).toBe(1023);
  });

  it('orders box heights mobile < tablet < desktop', () => {
    expect(CABINET_BOX_HEIGHT.mobile).toBeLessThan(CABINET_BOX_HEIGHT.tablet);
    expect(CABINET_BOX_HEIGHT.tablet).toBeLessThan(CABINET_BOX_HEIGHT.desktop);
  });

  it('box heights are exactly 32/40/48px', () => {
    expect(CABINET_BOX_HEIGHT).toEqual({ mobile: 32, tablet: 40, desktop: 48 });
  });

  it('orders voxel-track gaps mobile < tablet < desktop', () => {
    expect(CABINET_VOXEL_GAP.mobile).toBeLessThan(CABINET_VOXEL_GAP.tablet);
    expect(CABINET_VOXEL_GAP.tablet).toBeLessThan(CABINET_VOXEL_GAP.desktop);
  });

  it('voxel-track gaps are exactly 8/10/12px', () => {
    expect(CABINET_VOXEL_GAP).toEqual({ mobile: 8, tablet: 10, desktop: 12 });
  });
});
