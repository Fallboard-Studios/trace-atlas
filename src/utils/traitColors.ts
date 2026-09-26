import type { CSSProperties } from 'react';

import { ACCENT_COLORS } from '@/constants/accentColors';
import type { Trait } from '@/types/traits';

/**
 * One 2-color pair per trait, hand-picked from ACCENT_COLORS — analogous hues only (see
 * docs/intent/color-scheme-trait-theming.md), so both the color-mix() midpoint (--color-accent)
 * and the literal linear-gradient (--color-accent-gradient) stay clean rather than muddy. Header's
 * pair doubles as src/index.css's app-wide ambient default (see that file's own :root block) —
 * kept here too so it isn't a value declared in two places, just referenced from one call site.
 * ACCENT_COLORS.beige is deliberately unused by any pair — reserved for later, not an oversight
 * (see docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.3).
 *
 * Rebalanced (2026-09-12, Crawford's own request) when emerald/indigo were added: Header's
 * original pairing of the two new hues sat 96° apart on the hue wheel — the only pair in the
 * palette breaking the ≤60° analogous-hue rule every other pair follows, and it looked it.
 * Splitting them into 2 different pairs instead of retuning strict hue-sorted neighbors (which
 * would have produced 2 pairs tighter than 14°, e.g. plum+indigo at 10°) took some hand-rebalancing:
 * Spectral gives up teal for indigo (cyan+indigo, 52°) and Composition gives up green for emerald
 * (emerald+lime, 46°); Header inherits both leftovers as its own new pair (teal+green, 24°).
 * Time/Space, Output, Company, and Seed are untouched. See docs/intent/
 * color-scheme-trait-theming.md's own amendment note for the full hue-wheel reasoning.
 *
 * Rebalanced again (2026-09-12, Crawford's own request), for two separate reasons:
 *
 * 1. Seed's own tangerine+yellow pair turned out too intense once actually seen in the app — both
 *    sat 70%+/light 60%+, only 16° apart, with nothing tempering either one. Two new, calmer hues
 *    replace it: rosewood/dustyRose (sat 32-35%, 10° apart) — freeing tangerine and yellow, unused
 *    by any pair for now. A second new hue, burntOrange (sat 65, light 36), brackets the existing
 *    orange (sat 78 — the single most saturated hue in the palette) from below; paired directly
 *    with it, replacing red as Output's own second color — freeing red as well.
 * 2. Output, Composition, Spectral, and Time/Space are the only 4 traits Audio Rig and Robot
 *    Options ever show together, and 2 of the 4 (Spectral's cyan/indigo, Time/Space's own former
 *    blue/plum) sat in the same blue family — the app read one-note on exactly the pages seen most.
 *    Time/Space and Company swap their (otherwise unrelated) pairs: Time/Space takes Company's old
 *    purple+pink (48° apart, a clean break from Spectral's blue), Company takes Time/Space's old
 *    blue+plum. No new hue needed for this half of the rebalance — the 4 audio-page traits now read
 *    as 4 distinct families (orange, green, blue, purple/magenta) instead of 3 of 4 clustering.
 *
 * Composition, Spectral, and Header are untouched by this pass.
 */
export const TRAIT_COLORS: Record<Trait, [string, string]> = {
  spectral: [ACCENT_COLORS.cyan, ACCENT_COLORS.indigo],
  timeSpace: [ACCENT_COLORS.purple, ACCENT_COLORS.pink],
  output: [ACCENT_COLORS.burntOrange, ACCENT_COLORS.orange],
  composition: [ACCENT_COLORS.emerald, ACCENT_COLORS.lime],
  company: [ACCENT_COLORS.blue, ACCENT_COLORS.plum],
  seed: [ACCENT_COLORS.rosewood, ACCENT_COLORS.dustyRose],
  header: [ACCENT_COLORS.teal, ACCENT_COLORS.green],
};

/** The 4 custom properties buildAccentStyle below always sets, typed explicitly (rather than a
 *  blanket `as CSSProperties` cast) so a typo'd property name fails to compile instead of
 *  silently producing a dead custom property. */
type AccentCSSProperties = CSSProperties &
  Record<'--color-accent-a' | '--color-accent-b' | '--color-accent' | '--color-accent-gradient', string>;

/**
 * Builds all 4 accent custom properties from 2 literal colors. Bug fix, found live via browser
 * DevTools (jsdom never resolves real CSS cascade/color-mix(), so this was invisible to every test
 * in this file until it was rewritten): --color-accent/--color-accent-gradient must NEVER be
 * expressed as a nested var()-derivation of --color-accent-a/-b (e.g.
 * `linear-gradient(var(--color-accent-a), var(--color-accent-b))`, declared once at :root). That
 * pattern does not correctly re-substitute using a descendant's own overridden -a/-b — confirmed
 * directly in DevTools: -a/-b themselves cascade correctly to an overridden subtree, but a
 * DIFFERENT custom property whose specified value nests var() references to them stays pinned to
 * whatever they resolved to wherever that outer property was first read, not the local override.
 * The fix computes --color-accent/--color-accent-gradient with the 2 literal colors baked directly
 * into the color-mix()/linear-gradient() calls, right here — no second layer of custom-property
 * indirection left for a browser to get wrong. See docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.2's
 * amendment.
 */
function buildAccentStyle(a: string, b: string): AccentCSSProperties {
  return {
    '--color-accent-a': a,
    '--color-accent-b': b,
    '--color-accent': `color-mix(in srgb, ${a} 50%, ${b} 50%)`,
    '--color-accent-gradient': `linear-gradient(135deg, ${a}, ${b})`,
  };
}

/**
 * Inline-style object a component spreads onto whichever DOM element should root that trait's
 * color scope — every descendant CabinetBox/outline/fill inherits all 4 accent properties via
 * plain CSS cascade, no other wiring needed.
 */
export function getTraitColorStyle(trait: Trait): CSSProperties {
  const [a, b] = TRAIT_COLORS[trait];
  return buildAccentStyle(a, b);
}

function srgbChannelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a `#rrggbb` hex color, in [0, 1] — used below to find the darker of
 *  a trait's own two tones without hand-picking one per trait. */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

/** Reduces a `#rrggbb` hex color's HSL saturation by `reduction` (0-1 — 0.5 halves it), hue and
 *  lightness unchanged. Used by getDisabledTraitColorStyle to mute a trait's own 2 tones rather
 *  than replace them with a flat neutral. */
export function desaturateHex(hex: string, reduction: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(h, s * (1 - reduction), l);
  return rgbToHex(nr, ng, nb);
}

/**
 * The trait's own 2 tones, desaturated rather than replaced — used in place of getTraitColorStyle
 * wherever a section is functionally disabled (2026-09-13, Crawford's own request):
 * CompanyOptionsSection's 4 accordions render with full trait color even with no company/robots
 * selected and every control inside showing a placeholder value, reading as "live" when nothing in
 * the section is actually editable. First tried white + the trait's darker tone; Crawford preferred
 * keeping both of the trait's own tones, muted, over introducing white as a third color. The
 * lighter tone's saturation drops by 80%, the darker tone's by 60% — an initial 50%/25% cut read
 * as not different enough from the active state; this pass keeps the darker tone's own cut smaller
 * than the lighter tone's (rather than equal) since it's already less saturated on average and an
 * equal cut there read as losing the trait's identity entirely. Which tone is "lighter"/"darker" is
 * resolved by WCAG relative luminance, not hue-picked — Spectral's darker tone is indigo, not
 * cyan, despite cyan's lower raw HSL lightness.
 */
export function getDisabledTraitColorStyle(trait: Trait): CSSProperties {
  const [a, b] = TRAIT_COLORS[trait];
  const [lighter, darker] = relativeLuminance(a) >= relativeLuminance(b) ? [a, b] : [b, a];
  return buildAccentStyle(desaturateHex(lighter, 0.8), desaturateHex(darker, 0.6));
}

/** The app's own default light text color (index.css's `--color-text-primary`) and its dark
 *  background color (`--color-bg`), reused here as the 2 candidate text colors below — not new
 *  values invented for this. */
const LIGHT_TEXT_COLOR = 'rgba(255, 255, 255, 0.87)';
const DARK_TEXT_COLOR = '#12161a';

/**
 * A robot's own identity color reuses the identical mechanism with both slots set to the same
 * value — color-mix()-ing a color with itself returns itself, and a 2-stop gradient of identical
 * stops renders as a solid fill, so every existing consumer (outline, backing, front-face gradient)
 * already does the right thing with no special-casing.
 *
 * Also overrides `--color-text-primary` (docs/reference/layout-updates.md — Probes section
 * bugfix): CabinetBox's front face always reads that variable for its own label text, but an
 * identityColor is drawn from a much wider range than the hand-picked, contrast-checked
 * ACCENT_COLORS trait pairs — a light identityColor becoming the front face's own background
 * (RadioButton.css's selected-state tint, CabinetBox.css's rest-state hint) made the label
 * disappear against the app's fixed light-text default. Resolved by WCAG relative luminance, the
 * same helper getDisabledTraitColorStyle already uses for its own lighter/darker resolution —
 * light identityColor gets dark text, dark identityColor keeps the default light text.
 */
export function getRobotColorStyle(identityColor: string): CSSProperties {
  // Guarded, not trusted: real Robot.identityColor is a required field, but plenty of existing
  // test fixtures build a Robot via `as unknown as Robot` and omit it — relativeLuminance() parses
  // its argument as a #rrggbb hex string, which would throw on undefined/malformed input where the
  // old plain pass-through (buildAccentStyle never parses its arguments) never did. Falls back to
  // the default light text rather than skip the accent properties entirely.
  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(identityColor ?? '');
  return {
    ...buildAccentStyle(identityColor, identityColor),
    '--color-text-primary': isValidHex && relativeLuminance(identityColor) > 0.5 ? DARK_TEXT_COLOR : LIGHT_TEXT_COLOR,
  } as CSSProperties;
}
