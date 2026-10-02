import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCssRuleBody } from '@/testUtils/cssRuleBody';

// TYPE_SCALE.md Tasks 4-6 — every one of the 10 leaf ControlSchema
// primitives' own root CSS selector gets font-family/font-weight
// (--font-sans/--font-weight-control — moved off --font-controls,
// styling/header, 2026-09-17), and MOST of them also
// establish the shared sc-control size-container context DualLabel.css's own
// compact fallback (Task 3) queries.
//
// BUG FOUND IN A REAL BROWSER (post-Task-6, not caught by the original
// content-only tests): `container-type: inline-size` applies CSS size
// containment, which collapses an element to zero width if that element's
// own size normally comes from shrink-to-fit/content-based sizing rather
// than an explicit or externally-imposed width (confirmed via MDN's
// container-type docs). Two places hit this:
//   - `.sc-button` is ALWAYS `display: inline-flex; width: fit-content` by
//     design ("never larger than its own content") — every Button in the
//     app rendered invisible (zero width) once container-type landed on it.
//   - The 3 sliders' [data-orientation='vertical'] variant deliberately
//     overrides to `display: inline-flex` ("so several can sit side by side
//     ... without a parent grid/flex rework") — same collapse; this is what
//     the user's screenshot showed as "vertical sliders completely missing".
// The other 8 controls (and the sliders' own [data-orientation='horizontal']
// variant) are all block-level `display: flex` roots, which get a
// contextual width from their parent regardless of content and are
// unaffected. Fix: Button never establishes sc-control at all (it always
// fits its own content by construction, so it structurally can never be
// "cramped" — there's nothing for a compact fallback to solve there). The 3
// sliders establish sc-control ONLY on their [data-orientation='horizontal']
// variant, not the bare/unqualified root — vertical sliders lose the
// compact-fallback mechanism for now (spec §7/Risks: flagged as a real,
// not-yet-solved gap, likely item 13's own problem to redesign around,
// since a shrink-to-fit box fundamentally cannot host size containment on
// itself without an explicit width or a wrapper-element split).

const controlsDir = dirname(fileURLToPath(import.meta.url));

const LEAF_CONTROLS = [
  // Button never establishes sc-control — see the file-level comment above.
  { file: 'Button.css', selector: '.sc-button', containerSelector: null },
  { file: 'CoordsInput.css', selector: '.sc-coords-input', containerSelector: '.sc-coords-input' },
  { file: 'TextInput.css', selector: '.sc-text-input', containerSelector: '.sc-text-input' },
  { file: 'Toggle.css', selector: '.sc-toggle', containerSelector: '.sc-toggle' },
  { file: 'RadioButton.css', selector: '.sc-radio-button', containerSelector: '.sc-radio-button' },
  { file: 'Stepper.css', selector: '.sc-stepper', containerSelector: '.sc-stepper' },
  { file: 'StepperWithToggle.css', selector: '.sc-stepper-toggle', containerSelector: '.sc-stepper-toggle' },
  // Sliders: container-type/name moved onto the horizontal-only variant —
  // the bare/unqualified selector must NOT carry them (that's what broke).
  {
    file: 'SliderLinear.css',
    selector: '.sc-slider-linear',
    containerSelector: ".sc-slider-linear[data-orientation='horizontal']",
  },
  {
    file: 'SliderLog.css',
    selector: '.sc-slider-log',
    containerSelector: ".sc-slider-log[data-orientation='horizontal']",
  },
  {
    file: 'SliderCenteredZero.css',
    selector: '.sc-slider-centered-zero',
    containerSelector: ".sc-slider-centered-zero[data-orientation='horizontal']",
  },
];

describe.each(LEAF_CONTROLS)('$file root selector ($selector)', ({ file, selector, containerSelector }) => {
  const cssSource = readFileSync(resolve(controlsDir, file), 'utf-8');
  const body = getCssRuleBody(cssSource, selector);

  it('is a real rule in the file', () => {
    expect(body).not.toBeNull();
  });

  it('sets font-family to --font-sans', () => {
    expect(body).toContain('font-family: var(--font-sans);');
  });

  it('sets font-weight to --font-weight-control', () => {
    expect(body).toContain('font-weight: var(--font-weight-control);');
  });

  if (containerSelector) {
    it('establishes the shared sc-control size container on the correct (non-collapsing) selector', () => {
      const containerBody = getCssRuleBody(cssSource, containerSelector);
      expect(containerBody).not.toBeNull();
      expect(containerBody).toContain('container-type: inline-size;');
      expect(containerBody).toContain('container-name: sc-control;');
    });

    it('does NOT also declare container-type/container-name on the bare, unqualified root selector', () => {
      // Regression guard for the exact bug found: only relevant when
      // containerSelector differs from the bare selector (the slider trio).
      if (containerSelector !== selector) {
        expect(body).not.toContain('container-type');
        expect(body).not.toContain('container-name');
      }
    });
  } else {
    it('never establishes a size container on its own root (it always fits its own content by design — CSS size containment would collapse it, see file-level comment)', () => {
      expect(body).not.toContain('container-type');
      expect(body).not.toContain('container-name');
    });
  }
});
