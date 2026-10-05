// ========================================
// IMPORTS
// ========================================
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import * as helpers from './robotVisualHelpers';

// Phase 39 Tasks 10–11 (docs/tasks/GEM_POLYGON_ROBOTS.md): the hand-drawn robots are gone. This
// guards against a renderer or a dead helper quietly coming back, and pins what stays live.

const here = dirname(fileURLToPath(import.meta.url));

describe('Task 10 — the hand-drawn shapes, layer sockets and their helpers are deleted', () => {
  it.each([
    'RobotSleek.tsx',
    'RobotAngular.tsx',
    'RobotOrganic.tsx',
    'RobotIndustrial.tsx',
    'RobotLayerSockets.tsx',
    'RobotLayerSockets.test.tsx',
    'robotShapeVariants.test.tsx',
  ])('%s no longer exists', (file) => {
    expect(existsSync(resolve(here, file))).toBe(false);
  });

  it.each([
    'selectRobotShape',
    'generateColors',
    'hueOffset',
    'toSaturation',
    'toLuminance',
    'shapeParamsFromAudio',
    'applyLightnessMultiplier',
    'identityGlass',
    'SOCKET_DARK',
    'SOCKET_MIN',
    'SOCKET_GAIN_MAX',
    'socketLitOpacity',
  ])('robotVisualHelpers no longer exports %s', (name) => {
    expect(name in helpers).toBe(false);
  });

  it.each([
    'bodyShapeFromAdsr',
    'BODY_NORMALISER',
    'calculateBodyScale',
    'calculateScale', // calculateBodyScale's register step — live, despite the spec's removal list
    'BODY_SCALE_MIN',
    'LAMP_MIN',
    'calculateLampIntensity',
    'computeBatteryDimOpacity',
    'layerLitLevel',
    'MID_DARK_LEVEL',
    'MID_LIT_MIN',
    'MID_GAIN_MAX',
  ])('robotVisualHelpers still exports the live %s', (name) => {
    expect(name in helpers).toBe(true);
  });
});
