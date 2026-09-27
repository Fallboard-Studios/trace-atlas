# Phase Spec: Console Theming (Roadmap Phase 11)

> **Status: cut.** This spec was fully implemented, then reverted at Crawford's call after evaluating
> it against the real running app — not a bug, an aesthetic call (the WCAG-safety-for-every-seed
> guarantee this spec derives in §1.1 squeezed visual variety out of the exact tiers that needed it).
> See [docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md) for the full reasoning and what replaced it.
> Kept as a historical record of the derivation (bounds, variety technique, the `Console.css` fix) —
> not current or planned behavior.

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/console-theming.md](../intent/console-theming.md) (confirmed via `/interview-me`, 2026-09-03). Source of scope: [docs/todo/roadmap.md § 11](../todo/roadmap.md#11-console-theming) (theming-only, after the Phase 11/11.1 split this intent doc itself performed). Design doc: [docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md) — this spec resolves that doc's open items (exact HSL bounds, the variety-generation technique, the `Console.css` conflict) and supersedes its "not yet implemented" framing once shipped. Prior art: [docs/PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md) (the `getSeededVal(noiseMap, dataId, offset, min, max)` sampling convention and dot-namespaced `dataId` rule this phase follows exactly), [docs/ROBOT_DESIGN.md](../ROBOT_DESIGN.md) (the bounded-HSL, no-static-palette precedent this design deliberately narrows), [docs/specs/ATTENUATION_STYLE_RENAME.md](ATTENUATION_STYLE_RENAME.md) (why every identifier below reads `AttenuationStyle`, not `Planet` — that rename is fully shipped on `main`, confirmed directly against `attenuationStyleStore.ts`/`AttenuationStyleView.tsx`).

---

## 1. Overview & Claude Explanation

The intent doc leaves four things deliberately open for this spec to resolve: the exact bounded HSL ranges, the WCAG validation approach, the seed variety-generation technique, and the `Console.css` `.console` local-override conflict. All four are resolved below with real math, not eyeballed — per `docs/CONSOLE_THEMING.md`'s own instruction ("this is the property to test, not eyeball").

### 1.1 The bounded HSL ranges, derived and verified

`docs/CONSOLE_THEMING.md` requires bounds "tighter than [ROBOT_DESIGN.md](../ROBOT_DESIGN.md)'s robot precedent" (saturation 30–100%, luminance 20–72%) that guarantee WCAG AA (4.5:1 normal text, 3:1 large text/UI components) **for every possible seed, not just typical ones**. Because `--color-text-primary`/`--color-text-muted` stay fixed (intent doc Constraint) and every other pairing (`--color-bg` vs `--color-accent`, `--color-surface` vs `--color-border`, etc.) is what actually needs proving, the bounds were derived numerically — sweeping the full 360° hue range at 1° steps against every combination of the proposed saturation/lightness extremes, computing real WCAG relative-luminance contrast ratios — rather than picked by feel. The worst case across that entire sweep, for the final bounds below, is:

| Pairing | Requirement | Worst case found | Margin |
|---|---|---|---|
| text-primary (`rgba(255,255,255,0.87)`) vs surface | ≥ 4.5:1 | 8.771:1 | wide |
| text-muted (`rgba(255,255,255,0.6)`) vs surface | ≥ 4.5:1 | 5.117:1 | ~14% |
| accent vs bg/surface (non-text UI, 1.4.11) | ≥ 3:1 | 3.960:1 | ~32% |
| border vs bg/surface | ≥ 3:1 | 4.094:1 | ~36% |

(Text is checked against `surface`, not `bg`, because surface is always the lighter of the two — the harder case for a light-on-dark pairing.) The worst case for every pairing lands at hue 240° (blue) at the extremes of the relevant ranges — blue's low weight in the luminance formula (`0.0722` vs green's `0.7152`) makes it the universal hardest hue for a light-foreground/dark-background pairing, which is why the search swept hue exhaustively rather than sampling a few "representative" ones.

**Final bounds:**

```typescript
// AS-tier (structural) — --color-bg / --color-surface
const BG_HUE_RANGE: [number, number] = [0, 360];
const BG_SATURATION_RANGE: [number, number] = [10, 35];
const BG_LIGHTNESS_RANGE: [number, number] = [5, 14];
const SURFACE_LIGHTNESS_OFFSET = 4; // surface = bg lightness + 4pp
const SURFACE_LIGHTNESS_MAX = 18;   // clamp, so offset can't push surface out of "dark UI" territory

// Locale-tier (accent) — --color-accent / --color-border
const ACCENT_HUE_RANGE: [number, number] = [0, 360];
const ACCENT_SATURATION_RANGE: [number, number] = [55, 90];
const ACCENT_LIGHTNESS_RANGE: [number, number] = [72, 88];
const BORDER_SATURATION_RANGE: [number, number] = [20, 40];
const BORDER_LIGHTNESS_RANGE: [number, number] = [65, 80];
```

Every span here is narrower than `ROBOT_DESIGN.md`'s 70pp saturation / 52pp luminance robot precedent (bg/surface: 25pp sat / 9pp+offset light; accent: 35pp sat / 16pp light; border: 20pp sat / 15pp light) — satisfying "tighter," per the intent doc's Constraint, by span rather than by being a nested subset. Accent/border's lightness sits in a visibly *higher* absolute range than the robot precedent's — a deliberate deviation, not an oversight: robots aren't required to clear a fixed-dark-background contrast bar the way this interactive chrome is, so their bounds had no reason to skew light. `docs/ROBOT_DESIGN.md` itself is intentionally not modified by this phase — it documents a different, already-shipped subject.

Surface is **derived** from bg (same hue/saturation, `+4pp` lightness, clamped), not independently seeded — mirroring the actual relationship today's static `#121212`/`#1a1a1a` pair already has (≈+3pp), and halving the number of AS dataIds needed for the structural tier. Border reuses accent's own seeded hue rather than sampling a fifth, independent hue — it reads as a desaturated, dimmer sibling of accent (same hue family, own saturation/lightness), not an unrelated color.

### 1.2 The variety-generation technique

`docs/CONSOLE_THEMING.md`'s own illustrative (non-binding) direction was "hue as the primary differentiator, with a secondary seed-derived value (e.g. a gradient stop or a saturation/lightness offset)." This spec adopts exactly that, literally: hue is sampled across the full 0–360° range independently for the AS tier and the locale tier (two entirely separate `NoiseFunction2D`s — `getAttenuationStyleNoiseMap`/`getLocaleNoiseMap` are unrelated noise fields by construction, per `noiseMaps.ts`), and saturation is sampled as its own independent value within each tier's bounded range. No additional bucketing/anti-collision scheme is layered on top — with two fully-independent continuous hue channels (structural vs. accent) each crossed with their own independently-seeded saturation/lightness, and locale coordinates varying per plot even under a held-constant AS, the combinatorial space is large enough that no extra mechanism is needed to avoid a "single hue rotation" reading as same-y. This is a concrete decision, not a default left for Tasks — it directly resolves the doc's own open question.

### 1.3 The `Console.css` conflict — resolved with `color-mix()`, no new coupling

`docs/CONSOLE_THEMING.md` flagged that `Console.css`'s `.console` rule ([src/components/panels/screen/console/Console.css:27](../../src/components/panels/screen/console/Console.css#L27)) hardcodes `--color-surface: rgba(26, 26, 26, 0.75)` for the hub's "glass" translucency, which will always win over a seed-derived value applied further up the tree (`.tablet`/`:root`) since custom-property inheritance resolves to the nearest declaring ancestor. The doc offered two options: apply the seed-derived value directly at `.console`, or re-derive the translucent variant from the same seed value. This spec takes the second, using a CSS-only self-referential `color-mix()`:

```css
.console {
  --color-surface: color-mix(in srgb, var(--color-surface) 75%, transparent);
}
```

This is valid, well-supported CSS custom-property behavior (not a cycle): the `var(--color-surface)` on the right-hand side resolves against the **inherited** value cascading down from `.tablet`/`:root` — i.e. the seed-derived opaque surface color — before this declaration's own redefinition takes effect for `.console` and its descendants. The result is byte-for-byte the same 75%-opacity relationship the static `rgba(26, 26, 26, 0.75)` already expressed, now automatically re-derived from whatever the seed actually produced, with zero JS coupling between `consoleTheme.ts` and `Console.tsx`/`Console.css`. `color-mix()` is broadly supported in evergreen browsers (Chromium 111+, Firefox 113+, Safari 16.4+) — this app has no polyfill layer and already assumes evergreen browsers elsewhere (GSAP/Tone.js/Radix), so this isn't a new platform-support constraint.

### 1.4 Where the theme is computed and applied

Following `App.tsx`'s own existing precedent for exactly this shape of problem — `generateRealWorldGradients()` computed once and applied as inline `style` custom properties (`--real-world-gradient-before`/`-after`) on a wrapping div, via an `as CSSProperties` cast ([src/App.tsx:20-24](../../src/App.tsx#L20-L24)) — this phase computes the console theme with `useMemo` (not `useState`'s one-time lazy initializer, since this *does* need to recompute on retransmit) keyed on the active Attenuation Style's `id`/`name` and the active Locale's `id`/`coordinates.x`/`coordinates.y`, and applies it as an inline `style` prop on `Tablet.tsx`'s own `.tablet` root div — matching `docs/CONSOLE_THEMING.md`'s own suggested application point exactly. No new store field, no `worldTransition.ts` change, no `useEffect`/DOM-ref imperative wiring: `useMemo`'s dependency array already guarantees "computed once per AS/locale activation, not on every render" for free, and reading `currentAttenuationStyleId`/`currentLocaleId` reactively means every retransmit branch (`retransmitAttenuationStyleOnly`, `retransmitCoordsOnly`, `retransmitBoth`) triggers a correct recompute automatically, without any of the three needing to know this feature exists.

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── contrastRatio.ts        # NEW — WCAG relative luminance / contrast ratio math (hslToRgb,
│   │                             #   relativeLuminance, contrastRatio, blendOverBackground). Pure,
│   │                             #   general-purpose — used by consoleTheme.test.ts to PROVE the
│   │                             #   §1.1 bounds, not by consoleTheme.ts itself at runtime (the
│   │                             #   bounds are the guarantee; no runtime contrast check needed).
│   ├── contrastRatio.test.ts   # NEW — sanity-checks the formula against known reference pairs
│   │                             #   (black/white = 21:1, same color = 1:1, etc.)
│   ├── consoleTheme.ts         # NEW — computeStructuralTheme/computeAccentTheme/computeConsoleTheme/
│   │                             #   consoleThemeToCSSProperties, alongside seedUtils.ts/getSeededVal.ts,
│   │                             #   per docs/CONSOLE_THEMING.md's own proposed location
│   └── consoleTheme.test.ts    # NEW — bounds coverage, determinism, non-degeneracy, and the
│                                 #   exhaustive contrast sweep that proves §1.1's table
├── components/tablet/
│   ├── Tablet.tsx               # MODIFIED — computes the theme via useMemo, applies it as the
│   │                             #   .tablet div's inline style (§1.4)
│   └── Tablet.test.tsx          # MODIFIED — new coverage asserting the 4 custom properties are
│                                 #   present on .tablet's inline style; existing tests unaffected
│                                 #   (they don't mock attenuationStyleStore/localeStore today —
│                                 #   real defaults populate fine)
└── components/panels/screen/console/
    └── Console.css               # MODIFIED — .console's hardcoded --color-surface becomes the
                                    #   color-mix() re-derivation (§1.3)
docs/
├── CONSOLE_THEMING.md   # MODIFIED — "not yet implemented" banner resolved; final bounds/technique/
│                          #   Console.css resolution folded in from this spec
└── PROCEDURAL_GENERATION.md  # MODIFIED — one new row in the "Call Sites" table for consoleTheme.ts,
                                #   per that doc's own existing convention
```

`src/index.css` is also modified but not new/renamed — see §4.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 (plus `src/index.css`, §4) unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`--color-text-primary`/`--color-text-muted` are never touched.** Per the intent doc's Constraint — legibility for body/label text wins over full-palette variety. `consoleThemeToCSSProperties` must not emit either key, and no file in §2 changes their fixed values in `src/index.css`.
* **The §1.1 bound constants are fixed, derived values — not seeded, not configurable, not re-derived at runtime.** They are the mathematical guarantee this phase's contrast requirement rests on; changing any one of them without re-running the §1.1 sweep (and updating `consoleTheme.test.ts`'s exhaustive coverage accordingly) silently reopens the exact risk this spec closes.
* **No static/fixed color palette or lookup table anywhere** — every color is `getSeededVal(...)`-sampled, per `docs/CONSOLE_THEMING.md`'s explicit Forbidden Patterns and the `ROBOT_DESIGN.md` precedent it follows. A bounded numeric *range* is not a palette; a fixed table of actual color values would be.
* **`consoleTheme.ts` computes theme values only — it does not apply them to the DOM.** `Tablet.tsx` owns application (via its own inline `style` prop), keeping the pure-function/component boundary consoleTheme.ts's own file-header comment should state explicitly.
* **No changes to `worldTransition.ts`, any store, or any retransmit branch.** Reactivity comes entirely from `Tablet.tsx`'s own `useMemo` dependency array reading already-existing store fields (`currentAttenuationStyleId`/`currentLocaleId`/locale `coordinates`) — see §1.4. This is a deliberate scope reduction versus the original (pre-split) Phase 11 draft, which didn't specify a wiring mechanism at all.
* **Out of scope, per the intent doc:** Oblique Cabinetry (Phase 11.1, not yet interviewed/specced), `WorldView`/terrain/sky, robot visuals, `SleeveContainer`, the power rocker switch. None of §2's files touch any of these.
* **`color-mix()` is the one new CSS feature this phase introduces** (§1.3) — flagged explicitly, not hidden; no polyfill added, matching this app's existing evergreen-browser assumption.
* **The global color-transition rule (§4) is intentionally broad** (`*, *::before, *::after`) rather than added file-by-file to every component that happens to consume these 4 tokens — auditing every consumer individually would balloon this phase far past "theming only." It is lower-specificity than any existing per-component `transition` declaration (e.g. `button`'s own in `index.css`), so it only affects elements that don't already declare their own transition — not a behavior change for anything that does.

---

## 4. Code Style & Architecture Conventions

**`src/utils/contrastRatio.ts`** (new, full file):

```typescript
/**
 * WCAG 2.x relative luminance / contrast ratio math. Pure, general-purpose —
 * no dependency on consoleTheme.ts's own bound constants. Used by
 * consoleTheme.test.ts to PROVE the chosen HSL bounds clear AA for every
 * possible seed (docs/specs/CONSOLE_THEMING.md §1.1: "this is the property
 * to test, not eyeball").
 */
export type RGB = [number, number, number]; // 0-255 each

export function hslToRgb(hue: number, saturation: number, lightness: number): RGB {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((hue % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = [0, 0, 0];
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function linearize(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two colors: 1 (identical) to 21 (black/white). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Alpha-composite a foreground color (0-1 alpha) over an OPAQUE background —
 *  resolves --color-text-primary/--color-text-muted's actual rendered color
 *  (both rgba() with alpha < 1) before measuring contrast against whatever
 *  seed-driven --color-surface it's painted on. */
export function blendOverBackground(fg: RGB, alpha: number, bg: RGB): RGB {
  return [
    alpha * fg[0] + (1 - alpha) * bg[0],
    alpha * fg[1] + (1 - alpha) * bg[1],
    alpha * fg[2] + (1 - alpha) * bg[2],
  ];
}
```

**`src/utils/consoleTheme.ts`** (new, full file):

```typescript
import { getSeededVal } from './getSeededVal';
import { getAttenuationStyleNoiseMap, getLocaleNoiseMap } from './noiseMaps';

export interface ConsoleTheme {
  bg: string;
  surface: string;
  accent: string;
  border: string;
}

// AS-tier (structural) bounds — tighter than ROBOT_DESIGN.md's robot
// precedent (sat 30-100%, lum 20-72%); verified via consoleTheme.test.ts's
// exhaustive hue sweep to clear WCAG AA against the app's FIXED text colors.
// See docs/specs/CONSOLE_THEMING.md §1.1 for the derivation.
const BG_HUE_RANGE: [number, number] = [0, 360];
const BG_SATURATION_RANGE: [number, number] = [10, 35];
const BG_LIGHTNESS_RANGE: [number, number] = [5, 14];
/** Surface reads as the same structural color, subtly raised — the same
 *  relationship today's static #121212 -> #1a1a1a pair already has (~+3pp) —
 *  rather than an independent seeded roll. */
const SURFACE_LIGHTNESS_OFFSET = 4;
const SURFACE_LIGHTNESS_MAX = 18;

// Locale-tier (accent) bounds — deliberately light/vivid so a 3:1 non-text
// UI-component contrast (WCAG 1.4.11) against the dark AS-tier bg/surface
// holds for every hue. See docs/specs/CONSOLE_THEMING.md §1.1.
const ACCENT_HUE_RANGE: [number, number] = [0, 360];
const ACCENT_SATURATION_RANGE: [number, number] = [55, 90];
const ACCENT_LIGHTNESS_RANGE: [number, number] = [72, 88];

// Border reuses accent's own seeded hue (below) — a desaturated, dimmer
// sibling of accent, not an independent color family. Only saturation and
// lightness are sampled separately.
const BORDER_SATURATION_RANGE: [number, number] = [20, 40];
const BORDER_LIGHTNESS_RANGE: [number, number] = [65, 80];

function hsl(hue: number, saturation: number, lightness: number): string {
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

/**
 * Structural (AS-tier) half of the theme — --color-bg/--color-surface.
 * Sampled from the active Attenuation Style's own noise map, per
 * PROCEDURAL_GENERATION.md's getSeededVal(noiseMap, dataId, offset, min, max)
 * convention (offset 0 — each field gets its own dataId, not an index).
 */
function computeStructuralTheme(
  attenuationStyleId: string,
  attenuationStyleName: string,
): { bg: string; surface: string } {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const hue = getSeededVal(noiseMap, 'ui.theme.background.hue', 0, ...BG_HUE_RANGE);
  const saturation = getSeededVal(noiseMap, 'ui.theme.background.saturation', 0, ...BG_SATURATION_RANGE);
  const bgLightness = getSeededVal(noiseMap, 'ui.theme.background.lightness', 0, ...BG_LIGHTNESS_RANGE);
  const surfaceLightness = Math.min(bgLightness + SURFACE_LIGHTNESS_OFFSET, SURFACE_LIGHTNESS_MAX);
  return {
    bg: hsl(hue, saturation, bgLightness),
    surface: hsl(hue, saturation, surfaceLightness),
  };
}

/**
 * Accent (locale-tier) half of the theme — --color-accent/--color-border.
 * Sampled from the active locale's own coordinate noise map — decorrelated
 * from the AS-tier hue by construction (a wholly separate NoiseFunction2D,
 * per noiseMaps.ts). This is the concrete resolution of
 * docs/CONSOLE_THEMING.md's open "Generating Enough Variety" question: hue
 * as the primary differentiator (full 0-360°, independently seeded per
 * tier) plus an independently-seeded saturation — see
 * docs/specs/CONSOLE_THEMING.md §1.2.
 */
function computeAccentTheme(localeId: string, x: number, y: number): { accent: string; border: string } {
  const noiseMap = getLocaleNoiseMap(localeId, x, y);
  const hue = getSeededVal(noiseMap, 'ui.theme.accent.hue', 0, ...ACCENT_HUE_RANGE);
  const accentSaturation = getSeededVal(noiseMap, 'ui.theme.accent.saturation', 0, ...ACCENT_SATURATION_RANGE);
  const accentLightness = getSeededVal(noiseMap, 'ui.theme.accent.lightness', 0, ...ACCENT_LIGHTNESS_RANGE);
  const borderSaturation = getSeededVal(noiseMap, 'ui.theme.border.saturation', 0, ...BORDER_SATURATION_RANGE);
  const borderLightness = getSeededVal(noiseMap, 'ui.theme.border.lightness', 0, ...BORDER_LIGHTNESS_RANGE);
  return {
    accent: hsl(hue, accentSaturation, accentLightness),
    border: hsl(hue, borderSaturation, borderLightness), // same hue as accent, own sat/lightness
  };
}

/**
 * Full theme for the active Attenuation Style + Locale pair — the single
 * entry point Tablet.tsx calls. Pure function of its 5 inputs; safe to
 * useMemo on them (see docs/specs/CONSOLE_THEMING.md §1.4). Computes
 * values only — does NOT touch the DOM; the caller applies them.
 */
export function computeConsoleTheme(
  attenuationStyleId: string,
  attenuationStyleName: string,
  localeId: string,
  x: number,
  y: number,
): ConsoleTheme {
  return {
    ...computeStructuralTheme(attenuationStyleId, attenuationStyleName),
    ...computeAccentTheme(localeId, x, y),
  };
}

/**
 * Maps a ConsoleTheme onto the 4 seed-driven CSS custom properties, for use
 * as a React inline `style` prop — same `as CSSProperties` cast pattern
 * App.tsx's own realWorldStyle already uses for --real-world-gradient-*.
 * --color-text-primary/--color-text-muted are deliberately NOT included —
 * they stay fixed (docs/specs/CONSOLE_THEMING.md §3).
 */
export function consoleThemeToCSSProperties(theme: ConsoleTheme): Record<string, string> {
  return {
    '--color-bg': theme.bg,
    '--color-surface': theme.surface,
    '--color-accent': theme.accent,
    '--color-border': theme.border,
  };
}
```

**`src/components/tablet/Tablet.tsx`** (full replacement):

```typescript
import { useMemo } from 'react';
import type { CSSProperties } from 'react';

import SleeveContainer from '@/components/panels/physical/SleeveContainer';
import ScreenViewport from '@/components/panels/physical/ScreenViewport';

import { useUIStore } from '@/stores/uiStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useLocaleStore } from '@/stores/localeStore';
import { computeConsoleTheme, consoleThemeToCSSProperties } from '@/utils/consoleTheme';

import './Tablet.css'

function Tablet() {
  const isPoweredOn = useUIStore((s) => s.isPoweredOn);

  const attenuationStyle = useAttenuationStyleStore(selectCurrentAttenuationStyle);
  const localeId = attenuationStyle?.currentLocaleId;
  const locale = useLocaleStore((s) => (localeId ? s.locales[localeId] : undefined));

  // Computed once per AS/locale activation (useMemo's own guarantee, per its
  // dependency array) — not recomputed on every render, per
  // docs/CONSOLE_THEMING.md's Forbidden Patterns.
  const consoleThemeStyle = useMemo(() => {
    if (!attenuationStyle || !locale) return undefined;
    const theme = computeConsoleTheme(
      attenuationStyle.id,
      attenuationStyle.name,
      locale.id,
      locale.coordinates.x,
      locale.coordinates.y,
    );
    return consoleThemeToCSSProperties(theme) as CSSProperties;
  }, [attenuationStyle?.id, attenuationStyle?.name, locale?.id, locale?.coordinates.x, locale?.coordinates.y]);

  return (
    <div className="tablet" style={consoleThemeStyle}>
      <div className="sleeve-container__top-strip" aria-hidden="true" />
      <SleeveContainer hasPowerSwitch={true} />
      <ScreenViewport isPoweredOn={isPoweredOn} />
      <SleeveContainer />
    </div>
  );
}

export default Tablet;
```

**`src/components/panels/screen/console/Console.css`** (diff — one property, §1.3):

```css
.console {
  /* ...unchanged comment/position/inset/margin-top/z-index... */

  /* Every descendant surface (accordion triggers, buttons, effect blocks,
     text inputs, ...) paints its background from var(--color-surface) —
     overriding it here cascades a "glass" translucency through all of them
     at once, letting the robot world read through the hub's own chrome.
     Re-derived from whatever --color-surface the seed-driven theme
     (consoleTheme.ts) actually produced, via a self-referential color-mix()
     — the var() on the right resolves against the INHERITED value from
     .tablet before this declaration overrides it for .console and below.
     Not a cycle; not a new coupling to consoleTheme.ts. See
     docs/specs/CONSOLE_THEMING.md §1.3. Same 75% opacity the old static
     rgba(26, 26, 26, 0.75) already expressed. */
  --color-surface: color-mix(in srgb, var(--color-surface) 75%, transparent);
}
```

**`src/index.css`** (diff — the token comment block, plus the retransmit crossfade):

```css
:root {
  /* ... */

  /* Color tokens. --color-bg/--color-surface/--color-accent/--color-border
     are seed-driven at runtime (src/utils/consoleTheme.ts, applied as an
     inline style on Tablet.tsx's .tablet root — see
     docs/specs/CONSOLE_THEMING.md) — the values below are the pre-theme
     fallback, visible only before the first computeConsoleTheme() result
     lands. --color-text-primary/--color-text-muted are NOT seed-driven and
     never change — legibility for body/label text wins over full-palette
     variety (docs/specs/CONSOLE_THEMING.md §3). */
  --color-bg: #121212;
  --color-surface: #1a1a1a;
  --color-border: rgba(255, 255, 255, 0.08);
  --color-accent: #646cff;
  --color-text-primary: rgba(255, 255, 255, 0.87);
  --color-text-muted: rgba(255, 255, 255, 0.6);

  /* ... */
}

/* Retransmitting a seed (Sector Settings) crossfades the theme rather than
   snapping — a plain CSS transition, not GSAP/timeline-worthy on its own
   (docs/CONSOLE_THEMING.md). Intentionally broad (every element, not one
   component at a time — see docs/specs/CONSOLE_THEMING.md §3) but LOWER
   specificity than any element's own transition declaration (e.g. button's
   below), so it only applies where nothing more specific already does. */
*, *::before, *::after {
  transition: background-color 250ms ease, border-color 250ms ease, color 250ms ease;
}

@media (prefers-reduced-motion: reduce) {
  /* Same pattern PowerRockerSwitch.css already uses for its own
     reduced-motion handling: cancel outright, don't just shorten. */
  *, *::before, *::after {
    transition: none;
  }
}
```

* **Naming Conventions:** `consoleTheme.ts`/`contrastRatio.ts` follow `seedUtils.ts`/`getSeededVal.ts`'s existing flat-function, no-class convention. `dataId` strings (`'ui.theme.background.hue'`, `'ui.theme.accent.saturation'`, etc.) match `docs/CONSOLE_THEMING.md`'s own proposed examples exactly and follow `PROCEDURAL_GENERATION.md`'s dot-namespaced convention.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest (+ React Testing Library for `Tablet.test.tsx`).
* **Test File Location:** Colocate, matching every file in §2.
* **`contrastRatio.test.ts` (new):**
  1. `contrastRatio(black, white)` (`[0,0,0]` vs `[255,255,255]`) equals `21` (within floating-point tolerance).
  2. `contrastRatio(c, c)` equals `1` for any color.
  3. `hslToRgb(0, 0, 0)` is black; `hslToRgb(0, 0, 100)` is white; `hslToRgb` round-trips a few known reference colors (e.g. pure red `hsl(0, 100%, 50%)` → `[255, 0, 0]`).
  4. `blendOverBackground(white, 1, anything)` equals white (full opacity); `blendOverBackground(fg, 0, bg)` equals `bg` (fully transparent).
* **`consoleTheme.test.ts` (new) — this is the phase's core verification, not incidental coverage:**
  1. **Bounds coverage:** for at least 50 distinct Attenuation Style `(id, name)` pairs, `computeStructuralTheme`'s parsed hue/saturation/lightness fall within `BG_HUE_RANGE`/`BG_SATURATION_RANGE`/`BG_LIGHTNESS_RANGE`, and surface's lightness equals `min(bgLightness + 4, 18)` exactly. Same shape for `computeAccentTheme` across 50 distinct `(localeId, x, y)` triples against the accent/border ranges.
  2. **Determinism:** calling `computeConsoleTheme` twice with identical inputs returns byte-identical `hsl(...)` strings.
  3. **Non-degeneracy:** across the same 50 AS samples, at least a handful of distinct `bg` hue values appear (not every seed collapsing to the same color) — the direct regression test for "no static palette."
  4. **The exhaustive contrast sweep (§1.1's table, as permanent regression coverage):** iterate hue `0..360` at a fine step (≤5°) crossed with every combination of `BG_SATURATION_RANGE`/`BG_LIGHTNESS_RANGE`'s two extremes (surface lightness derived per the real offset/clamp formula), and assert, using `contrastRatio`/`blendOverBackground` from `contrastRatio.ts`:
     - `blendOverBackground([255,255,255], 0.87, surfaceRgb)` vs `surfaceRgb` ≥ `4.5`
     - `blendOverBackground([255,255,255], 0.6, surfaceRgb)` vs `surfaceRgb` ≥ `4.5`
     For every combination of `ACCENT_SATURATION_RANGE`/`ACCENT_LIGHTNESS_RANGE`'s extremes against every `bg`/`surface` extreme combination above (same hue sweep): `contrastRatio(accentRgb, bgRgb)` ≥ `3` AND `contrastRatio(accentRgb, surfaceRgb)` ≥ `3`. Same shape for `BORDER_SATURATION_RANGE`/`BORDER_LIGHTNESS_RANGE`. This test is the literal proof behind §1.1's table — if it ever fails, the bounds (or the fixed text-color alphas) changed without re-deriving the guarantee, and that is a real regression, not a flaky test to loosen.
  5. **`consoleThemeToCSSProperties`** returns exactly the 4 keys (`--color-bg`/`--color-surface`/`--color-accent`/`--color-border`) — explicitly asserting `--color-text-primary`/`--color-text-muted` are absent (the Constraint in §3, directly tested, not just implied).
* **`Tablet.test.tsx` (modified):** one new test rendering `<Tablet />` with the real (default) `attenuationStyleStore`/`localeStore` state (unmocked, same as today) and asserting `container.querySelector('.tablet')`'s inline `style` carries non-empty `--color-bg`/`--color-surface`/`--color-accent`/`--color-border` values matching the `hsl(...)` format. Existing two tests are unaffected — they assert unrelated structure (`sleeve-container__top-strip`, the mocked child stubs) and don't inspect `.tablet`'s style today.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including the exhaustive contrast sweep (expect this to be the slowest single test in the new files given its combinatorial size — still well within Vitest's default timeout given it's pure arithmetic, no DOM/async work).
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** load the app fresh and confirm the console chrome (hub tiles, drawer backgrounds, buttons, borders) reads as a coherent, legible dark theme rather than the old static indigo-on-near-black; retransmit a new Attenuation Style (name only) in Sector Settings and confirm `--color-bg`/`--color-surface` visibly recolor while `--color-accent`/`--color-border` do not (same locale, same coordinates); retransmit new coordinates only and confirm the reverse (accent/border recolor, bg/surface unchanged); confirm the recolor crossfades smoothly under normal settings and snaps instantly with "reduce motion" enabled (OS-level setting or browser devtools emulation); confirm the hub's "glass" translucency over `WorldView` is still visually present and still reads as translucent (the `Console.css` fix, §1.3) rather than opaque or transparent.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/theme-and-boxes` (already the active branch).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `contrastRatio.ts` + test (the general-purpose math, no dependency on anything else in this phase), (2) `consoleTheme.ts` + test (the seeded theme generation, including the exhaustive sweep — likely the largest single commit here), (3) `Tablet.tsx` + test (wiring), (4) `Console.css`'s `color-mix()` fix, (5) `index.css`'s comment update + global transition rule, (6) `docs/CONSOLE_THEMING.md` + `docs/PROCEDURAL_GENERATION.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and code, not left open):

- ~~What are the exact bounded HSL ranges?~~ **Resolved: §1.1**, derived via an exhaustive numeric sweep against real WCAG contrast math, not picked by feel.
- ~~What's the WCAG validation approach?~~ **Resolved:** a permanent exhaustive-sweep test in `consoleTheme.test.ts` (§5.4), not a one-time manual check — the bounds are provable, and the proof ships as regression coverage.
- ~~What's the seed variety-generation technique?~~ **Resolved: §1.2** — hue as primary differentiator (independently seeded per tier), saturation as the secondary differentiator, exactly the design doc's own illustrative direction, no extra mechanism.
- ~~How does the `Console.css` `.console` override conflict get resolved?~~ **Resolved: §1.3** — a self-referential `color-mix()`, zero new coupling.

Still open — flag for Tasks/implementation, not blocking this spec:

1. **The global `*, *::before, *::after` transition rule (§4/index.css) is a first-pass default**, not exhaustively cross-checked against every existing component's own `transition`/`animation` declaration for interaction effects. Confirm during the manual check (§5) that no existing hover/focus/press animation reads as newly sluggish or double-animated; narrow the selector or exclude specific components if one does.
2. **`SURFACE_LIGHTNESS_OFFSET`/`SURFACE_LIGHTNESS_MAX` (4pp / 18%) and the overall AS-tier lightness band (5–14%) are tuned to match today's static `#121212`/`#1a1a1a` relationship closely, not re-derived from any other source.** If a manual pass finds the structural background reading too uniformly dark across most seeds (little visible variety at the "large/structural" scale), revisit this band specifically — it was optimized for contrast-safety margin, not for maximizing perceptible bg-to-bg variety, and those two goals were not exhaustively balanced against each other.
3. **This phase does not touch `docs/ROBOT_DESIGN.md`, `docs/BUILDING_DESIGN.md`, or any other bounded-HSL precedent** — confirmed deliberately out of scope (§3), noted only so a future reader doesn't assume this spec's bounds apply anywhere beyond console chrome.
