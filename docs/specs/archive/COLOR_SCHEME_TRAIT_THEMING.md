# Phase Spec: Visual Identity — Color Scheme & Trait-Based Theming (Roadmap Phase 14)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/color-scheme-trait-theming.md](../intent/color-scheme-trait-theming.md)
(confirmed via `/interview-me`, 2026-09-12). Source of scope:
[docs/todo/roadmap.md § 14](../todo/roadmap.md#14-visual-identity-color-scheme--trait-based-theming).
Prior art: [docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md) (the cut seed-driven attempt this phase
deliberately does not repeat) and its own face-shading `color-mix()` technique, reused unchanged here;
[docs/PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md) (`getSeededVal`/`precomputeDataX`
conventions the robot-color seeding follows); `src/utils/statusLightColors.ts` (the existing
"semantic id → concrete color via a small static lookup" precedent this phase's trait lookup mirrors).

This spec resolves the 3 mechanisms the intent doc explicitly left open: the CSS custom-property/
gradient mechanism, the drawer→trait scoping wiring, and the robot-color seeding function — all
verified directly against the current codebase, not assumed.

---

## 1. Overview & Claude Explanation

### 1.1 The color sources

Two new small, static modules — no dependency added, following `statusLightColors.ts`'s existing
"resolve a semantic id to a concrete color via a plain lookup object" shape:

- **`src/constants/accentColors.ts`** — a one-time TypeScript transcription of
  [docs/reference/accent-colors.css](../reference/accent-colors.css)'s 13 named hues (+ black/white/
  dark-gray), the same relationship `src/data/globalAudioSeedRanges.ts` already has to
  `docs/reference/GLOBAL_CHAIN_GRID.md` (a human-authored reference table transcribed once into the
  real TS source; the `.md`/`.css` file stays the design record, not something the app imports at
  runtime). This is the **only** place these 16 hex values are ever hardcoded — every other consumer
  (trait pairs, robot seeding) imports from here, so the duplicate-value failure mode
  `docs/DUPLICATE_VALUE_AUDIT.md` tracks never has a second copy to drift from.
- **`src/utils/traitColors.ts`** — the 7-trait lookup table (below), plus the small helper functions
  that turn a trait or a robot's own color into the `CSSProperties` object a component applies inline.

### 1.2 The CSS mechanism: 4 custom properties in, existing consumers untouched

**Amended post-implementation (found live, via browser DevTools, not caught by any unit test — see
the note at the end of this section).** Every current `--color-accent` consumer (`CabinetBox.css`'s
backing/top-face/left-face/glow, every leaf control's focus outline, `Button`/`RadioButton`'s filled
background, `voxelTrackMath.ts`'s fill gradient — the full list was enumerated directly against `src/`
before writing this spec) reads exactly one CSS custom property today, defined once in
`src/index.css`'s `:root` block. This phase does not touch any of those consumer files. Instead,
`--color-accent` itself changes from a literal hex value to a derived color, and 3 more properties join
it — but critically, all 4 are **literal-valued wherever they're declared**, never nested `var()`
indirection:

```css
/* src/index.css — replaces the single literal --color-accent line */
--color-accent-a: #41ad9f;   /* Header trait's own pair (teal/green), reused as the ambient
--color-accent-b: #68cb97;      app-wide default — amended post-implementation twice, see §1.3 */
--color-accent: color-mix(in srgb, #41ad9f 50%, #68cb97 50%);
--color-accent-gradient: linear-gradient(135deg, #41ad9f, #68cb97);
```

Overriding a subtree means overriding **all 4** properties together, computed from the same 2 colors
— `src/utils/traitColors.ts`'s `getTraitColorStyle`/`getRobotColorStyle` do this in one small shared
function, so no call site ever writes fewer than 4 or gets the formula wrong. Every existing
`--color-accent`/`--color-accent-gradient` consumer (`color-mix()`, `drop-shadow()`, `background`, plain
`var()`) needs zero changes either way — they still just read the same 2 property names.

**Why not `linear-gradient(var(--color-accent-a), var(--color-accent-b))` declared once at `:root`,
letting a descendant's override of just `-a`/`-b` cascade through?** That was this spec's original
design, and it does not work. Confirmed live in a real browser (not a theoretical concern): `-a`/`-b`
themselves cascade correctly to an overridden subtree — DevTools' own "Inherited from" breakdown for
the overriding ancestor shows the right values reaching a descendant. But a *different* custom
property (`--color-accent-gradient`) whose own specified value nests `var()` references to `-a`/`-b`
does **not** re-substitute those references using the descendant's overridden values — it stays pinned
to whatever `-a`/`-b` resolved to wherever `--color-accent-gradient` was first read (in practice,
`:root`'s own ambient default), regardless of any closer override. This is a real, specific CSS
custom-property indirection limitation, not the "var() resolves lazily wherever it's used" behavior a
naive reading of the spec suggests. The fix removes the indirection entirely: every property a
component might read is computed with **literal** colors at the exact point it's scoped, so there's no
second layer left for a browser to get wrong. `jsdom` (this project's test environment) never resolves
real CSS cascade or `color-mix()`, so every unit test written against the original 2-property design
passed while the actual rendered app was visibly broken (every Audio Rig accordion showed the
white/dark-gray ambient default instead of its trait's colors) — a real gap between what automated
tests could catch and what a live browser check would have caught immediately. Tests written after this
fix (`traitColors.test.ts`, `index.css.test.ts`, `AudioRigDrawer.test.tsx`) assert the full 4-property,
literal-valued output specifically so this exact regression class can't silently recur.

**Why the derived `--color-accent` (a solid midpoint), not the gradient, feeds most consumers.**
`color-mix()`'s and `drop-shadow()`'s color argument, and `border-color`/`outline-color`, all require a
single `<color>` — a `linear-gradient()` is an `<image>`, not a valid value there. So contexts already
requiring one solid color (focus-ring outlines everywhere, `CabinetBox`'s top/left-face `color-mix()`
tinting, its walls' glow `drop-shadow()`, `Stepper`'s `border-color`) keep using `--color-accent`,
which is now a `color-mix()` **midpoint** of the trait's own 2 colors rather than a single hand-picked
value. This is also mechanically *why* the interview's "avoid muddy gradients" constraint matters:
an analogous-hue pair's 50/50 `color-mix()` midpoint lands on a clean intermediate hue; a
near-complementary pair's midpoint desaturates toward gray. The trait pairs chosen in §1.6 are picked
specifically so this midpoint stays vivid, not just so a literal rendered gradient looks clean.

**Where a genuine 2-tone gradient renders.** The few flat-rectangle fill contexts that use
`background-color` (not a stricter `<color>`-only property) switch to `background: var(--color-accent-
gradient)`: `CabinetBox.css`'s `.sc-cabinet-box__backing`, `Button.css`'s filled front face, and
`RadioButton.css`'s selected-segment fill. `voxelTrackMath.ts`'s `computeVoxelFillBackground` — already
building its own hard-stop `linear-gradient()` between `--color-accent` and `--color-surface` for a
slider's *partially*-filled straddling box — keeps that exact function unchanged: a **fully**-filled
box switches from `'var(--color-accent)'` to `'var(--color-accent-gradient)'`, but the straddling box's
own partial-fill segment stays the existing flat `--color-accent` midpoint rather than nesting a
gradient inside a gradient. This is a deliberate scope-narrowing to keep `voxelTrackMath.ts`'s math
unchanged — flagged explicitly in §7, not silently decided.

### 1.3 The 7 traits

**Amended post-implementation (Crawford's own request, 2026-09-12):** 2 more accent colors,
`emerald` (`#4fc27a`) and `indigo` (`#5a5c9e`), were added to `ACCENT_COLORS` to fill the 2 biggest
hue-wheel gaps in the original 13 (computed via HSL, not eyeballed: `lime`→`green` is a ~51° gap,
`blue`→`plum` a ~50° gap, the single largest on the wheel — each new color matches its neighboring
cluster's saturation/lightness band rather than popping out as more vivid). Both were added to
`ROBOT_IDENTITY_COLOR_NAMES` (15 entries now), and the Header trait's pair below changed from
`white`/`darkGray` to `emerald`/`indigo` — `white`/`darkGray` remain in `ACCENT_COLORS` (still part
of the design reference) but are now fully unused, the same status `black` already had.

**Amended again, same day (Crawford's own request):** pairing emerald with indigo put Header's own
2 colors 96° apart on the hue wheel — the only pair in the whole palette breaking the ≤60°
analogous-hue rule every other pair follows, and it read like it (an unrelated-feeling combination,
not a clean split of complements either). Rather than retune emerald/indigo to their strict
hue-sorted neighbors (which produces 2 *different* pairs tighter than 14° — plum+indigo at 10°,
blue+cyan at 12°, both worse than the problem being fixed), the fix hand-rebalances 3 pairs at
once: Spectral trades teal for indigo (`cyan`+`indigo`, 52°), Composition trades green for emerald
(`emerald`+`lime`, 46°), and Header inherits both leftovers — teal and green — as a brand-new pair
(24°) that never existed before. Time/Space, Output, Company, and Seed are untouched. The table
below (and `TRAIT_COLORS` itself) reflect this final state, not the emerald/indigo pairing above.

**Amended again (2026-09-12, Crawford's own request), for two separate reasons — see
`traitColors.ts`'s own updated header comment for the full derivation:**

1. Seed's own tangerine+yellow pairing read too intense once actually seen live — both sat 70%+/
   light 60%+, only 16° apart, nothing tempering either one. Three new hues were added to
   `ACCENT_COLORS`: `rosewood`/`dustyRose` (sat 32-35%, replacing tangerine/yellow as Seed's pair)
   and `burntOrange` (sat 65, light 36 — a second, deeper orange), paired directly with the
   existing `orange`, replacing `red` as Output's own second color. `tangerine`, `yellow`, and
   `red` are now unused by any trait pair (still valid `ACCENT_COLORS`/robot-identity values).
2. Output, Composition, Spectral, and Time/Space are the only 4 traits Audio Rig and Robot Options
   ever show together, and 2 of the 4 (Spectral's cyan/indigo, Time/Space's own former blue/plum)
   sat in the same blue family. Time/Space and Company swap their pairs — no new hue needed for
   this half — so the 4 audio-page traits now read as 4 distinct families (orange, green, blue,
   purple/magenta) instead of 3 of 4 clustering.

Composition, Spectral, and Header are untouched by this pass. The table below still reflects the
pairing from the previous amendment, not this one — see `traitColors.ts` for the current, correct
assignment.

```typescript
// src/types/traits.ts (new)
export type Trait = 'spectral' | 'timeSpace' | 'output' | 'composition' | 'company' | 'seed' | 'header';
export const TRAIT_IDS: readonly Trait[] = ['spectral', 'timeSpace', 'output', 'composition', 'company', 'seed', 'header'];
```

```typescript
// src/utils/traitColors.ts (new)
import { ACCENT_COLORS } from '@/constants/accentColors';
import type { Trait } from '@/types/traits';
import type { CSSProperties } from 'react';

/** One 2-color pair per trait, hand-picked from ACCENT_COLORS — analogous hues only (see
 *  docs/intent/color-scheme-trait-theming.md), so both the color-mix() midpoint (--color-accent)
 *  and the literal linear-gradient (--color-accent-gradient) stay clean rather than muddy. Header's
 *  pair doubles as src/index.css's app-wide ambient default (see that file's own :root block) —
 *  kept here too so it isn't a value declared in two places, just referenced from one call site. */
export const TRAIT_COLORS: Record<Trait, [string, string]> = {
  spectral: [ACCENT_COLORS.cyan, ACCENT_COLORS.indigo],
  timeSpace: [ACCENT_COLORS.blue, ACCENT_COLORS.plum],
  output: [ACCENT_COLORS.red, ACCENT_COLORS.orange],
  composition: [ACCENT_COLORS.emerald, ACCENT_COLORS.lime],
  company: [ACCENT_COLORS.purple, ACCENT_COLORS.pink],
  seed: [ACCENT_COLORS.tangerine, ACCENT_COLORS.yellow],
  header: [ACCENT_COLORS.teal, ACCENT_COLORS.green],
};

/** Builds all 4 accent custom properties from 2 literal colors, with color-mix()/linear-gradient()
 *  computed directly here — see §1.2's amendment for why this can never be a nested var()
 *  reference to --color-accent-a/-b declared once elsewhere (found live, does not work). */
function buildAccentStyle(a: string, b: string): CSSProperties {
  return {
    '--color-accent-a': a,
    '--color-accent-b': b,
    '--color-accent': `color-mix(in srgb, ${a} 50%, ${b} 50%)`,
    '--color-accent-gradient': `linear-gradient(135deg, ${a}, ${b})`,
  } as CSSProperties;
}

/** Inline-style object a component spreads onto whichever DOM element should root that trait's
 *  color scope — every descendant CabinetBox/outline/fill inherits all 4 accent properties via
 *  plain CSS cascade, no other wiring needed. */
export function getTraitColorStyle(trait: Trait): CSSProperties {
  const [a, b] = TRAIT_COLORS[trait];
  return buildAccentStyle(a, b);
}

/** A robot's own identity color reuses the identical mechanism with both slots set to the same
 *  value — color-mix()-ing a color with itself returns itself, and a 2-stop gradient of identical
 *  stops renders as a solid fill, so every existing consumer (outline, backing, front-face gradient)
 *  already does the right thing with no special-casing. */
export function getRobotColorStyle(identityColor: string): CSSProperties {
  return buildAccentStyle(identityColor, identityColor);
}
```

Beige (`ACCENT_COLORS.beige`) is deliberately unused by any trait pair — reserved, per the intent doc,
not an oversight (`traitColors.test.ts` asserts this explicitly, §5, so a future edit that *does* start
using it is a deliberate test update, not a silent gap).

### 1.4 Robot identity color

Follows `generateRobotName`'s exact existing shape in `src/systems/spawnSystem.ts` (private helper,
`getSeededVal` against the locale noise map, the robot's own `spawnCount` as the offset — the same
per-robot counter every other seeded robot field already uses, which also sidesteps the `offset=0`
value-collapse gotcha `docs/PROCEDURAL_GENERATION.md` documents, since `spawnCount` varies 0–11 across
the fixed 12-robot roster):

```typescript
// src/systems/spawnSystem.ts — new private helper, alongside generateRobotName
import { ROBOT_IDENTITY_COLOR_NAMES, ACCENT_COLORS } from '@/constants/accentColors';

function generateRobotIdentityColor(noiseMap: NoiseFunction2D, offset: number): string {
  const name = ROBOT_IDENTITY_COLOR_NAMES[Math.floor(getSeededVal(noiseMap, 'robot.identityColor', offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length))];
  return ACCENT_COLORS[name];
}
```

`ROBOT_IDENTITY_COLOR_NAMES` (`accentColors.ts`) is the 13 hue keys only — explicitly excluding
`black`/`white`/`darkGray`, which would render a robot's own card/detail chrome as a colorless outline
against the app's already-dark neutral base, an obviously-bad identity color rather than a real design
option.

`Robot.identityColor: string` (new required field, `src/types/Robot.ts`, alongside `name`) is set once
at spawn, following the file's exact existing ternary pattern for every other noise-map-derived field:

```typescript
// src/systems/spawnSystem.ts — inside the `robot: Robot = { ... }` literal (spawnInitialRoster)
identityColor: noiseMap
  ? generateRobotIdentityColor(noiseMap, spawnCount)
  : generateRobotIdentityColor((_x: number, _y: number) => 0 as number, spawnCount),
```

Stored on `Robot` (not recomputed at render time) for the same reason `name`/`audioAttributes` already
are: it needs to survive re-renders and, later, Session Storage's override-diff model unchanged. This
is **not** a relaxation of `docs/ROBOT_DESIGN.md`'s "no static palette" guardrail — that rule governs
`robotVisualHelpers.ts`'s ADSR/waveform-derived SVG body HSL specifically, which this field never
touches, reads, or is read by.

### 1.5 Wiring: where each trait/robot color gets scoped

Every insertion point already has an existing root element or an existing shared primitive one small
optional prop away — confirmed directly against each file below, not assumed. No new wrapper `<div>`
is introduced where an existing root already serves.

| Region | Trait/color | Where the style is applied |
|---|---|---|
| Audio Rig: EQ3/LPF/HPF group | Spectral | New wrapper `<div>` around that `AUDIO_RIG_ACCORDION_GROUPS` entry's `<AccordionContainer>` in `AudioRigDrawer.tsx` (no existing wrapper there today — see diff, §4) |
| Audio Rig: Delay/Reverb group | Time/Space | Same pattern, `timeSpace` group |
| Audio Rig: Compressor/Limiter group | Output | Same pattern, `output` group |
| Audio Rig: Transport & Composition accordion | Composition | New wrapper `<div>` around `<AccordionContainer schema={TRANSPORT_COMPOSITION_ACCORDION_SCHEMA}>` |
| Audio Rig: per-effect LFO Drift controls (eq3/filterLPF/filterHPF) | Spectral, Time/Space, or Output — whichever the host effect already has | **No new wiring** — see §1.6 |
| Robot Drift (`globalAudio.lfoDrift.robots`) | Spectral | **No new wiring** — already rendered inside `SignatureArrayDrawer`, see §1.6 |
| Robot Options: `AudioSettingSection` | Output | `AccordionContainer`'s new `style` prop (§1.5.1), passed at this call site in `RobotOptionsTab.tsx` |
| Robot Options: `PingControlsDrawer` | Composition | Same, `AccordionContainer`'s `style` prop |
| Robot Options: `PingContourDrawer` | Time/Space | Same |
| Robot Options: `SignatureArrayDrawer` | Spectral | Same |
| Robot Options: everything else (`RobotDisplaySection`'s Name/Job/Battery/Docking chrome) | Robot's own `identityColor` | `style` added to `RobotOptionsTab.tsx`'s existing `<div className="robot-options">` root — the 4 trait-scoped children above override it locally for free via cascade |
| `RobotSelectionCard` (list view) | Robot's own `identityColor` | `style` added to its existing `<li className="robot-selection-card">` root |
| `CompanyManager`'s own button row + CRUD chrome | Company | `style` added to its existing `<div className="company-manager">` root |
| `CompanyOptionsSection`'s `AudioSettingSection`/`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer` | Output/Composition/Time-Space/Spectral respectively — **not** Company | **Amendment (Crawford's own request, post-ship):** identical `style` passed at each of these 4 call sites as at their `RobotOptionsTab` call sites, so the Robots tile's company bulk-edit panel matches the robot detail page control-for-control. Overrides `CompanyManager`'s own Company-trait root locally via the same style-prop cascade the robot-color root above already relies on. |
| `SectorSettingsDrawer` | Seed | `style` added to its existing `<div className="sector-settings-drawer">` root |
| `Header` | Header | `style` added to its existing `<header className="header">` root — in practice a no-op today, since Header's pair equals `index.css`'s own ambient default (§1.2), but applied explicitly so the two can diverge later without this call site needing a second look |

#### 1.5.1 `AccordionContainer` gains one optional prop

`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer`/`AudioSettingSection` each return
`<AccordionContainer schema={...}>` directly as their own root today — no existing wrapper element to
attach a style to. Rather than add a wrapper `<div>` at 4 call sites (inconsistent with the "small,
localized edit" success criterion, and the only reason those 4 components exist as separate files at
all is to each own one `AccordionContainer`), `AccordionContainerProps` gains one new optional field:

```typescript
// src/components/ui/controls/AccordionContainer.tsx
interface AccordionContainerProps {
  schema: AccordionSchema;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Optional inline style applied to the outer Accordion.Root — this phase's only consumer is
   *  trait-color scoping (getTraitColorStyle/getRobotColorStyle, src/utils/traitColors.ts), but the
   *  prop itself is generic, matching CabinetBox's own precedent of small, purpose-documented
   *  optional additions rather than a theming-specific prop name. */
  style?: CSSProperties;
}
```

```tsx
<Accordion.Root type="single" collapsible className={withActiveClass('sc-accordion', open)}
  value={open ? schema.id : ''} onValueChange={handleValueChange} style={style}>
```

Every existing `AccordionContainer` consumer that doesn't pass `style` is completely unaffected —
Radix's `Accordion.Root` already forwards arbitrary DOM props, so this is additive only.

#### 1.5.2 `DirectionalPanel` is deliberately NOT touched

`DirectionalPanel.tsx`'s own comment is explicit: it accepts no `className`/`style` prop *by design*,
specifically so a consumer needing to target one instance from outside uses its existing
`data-panel-id` attribute instead. This phase respects that constraint rather than relaxing it
(CLAUDE.md's Boundaries: don't relax an existing decision to make a task easier). Every
`DirectionalPanel` this phase's colors need to reach — `SPEED_AUTOMATION_PANEL_SCHEMA` inside Transport
& Composition, each effect block's own `block.panel` inside `renderBlock()` (§1.6) — already sits nested
inside one of the group-level wrapper `<div>`s §1.5's table adds, so the trait color reaches it purely
via CSS inheritance with no direct prop on `DirectionalPanel` itself required.

### 1.6 The "robots" Drift group — turned out not to be a mixed-trait problem at all

Flagged as unresolved in the intent doc, on the assumption (drawn from the now-superseded
`docs/specs/LFO_DRIFT.md`) that all 4 `LFO_DRIFT_GROUPS` entries render together inside one shared
"Drift" accordion in `AudioRigDrawer.tsx`. **Direct inspection of the current code shows that accordion
no longer exists.** Per `LFO_DRIFT_GROUPS`' own shipped shape (`src/data/audioRigConfig.ts`) and
`AudioRigDrawer.tsx`'s `renderBlock()`:

- The `eq3`/`filterLPF`/`filterHPF` drift entries are each looked up by `LFO_DRIFT_GROUPS.find((g) =>
  g.group === block.key)` and rendered **inside that same effect block's own `DirectionalPanel`** —
  i.e. already inside whichever `AUDIO_RIG_ACCORDION_GROUPS` wrapper that effect belongs to (EQ3/LPF/
  HPF all fall under `eqFilters` → `spectral`). They inherit their host's trait color automatically,
  the same "nested LFO inherits host trait" rule already covering per-target LFO frames — no code
  needed beyond the group wrappers §1.5 already adds.
- The `'robots'` entry **doesn't render in `AudioRigDrawer.tsx` at all** — a code comment there
  explicitly records that it "moved to `SignatureArrayDrawer`'s own Source accordion," and
  `SignatureArrayDrawer.tsx` confirms it: `const ROBOTS_DRIFT_GROUP = LFO_DRIFT_GROUPS.find((g) =>
  g.group === 'robots')!`, rendered as part of that component's own content. Since `SignatureArrayDrawer`
  is already `spectral`-scoped (§1.5's table), Robot Drift inherits `spectral` the same way — not
  because it's conceptually "about" Signature Array specifically, but because that's where the roadmap's
  own Directional Panel Wiring work already chose to render it, and this phase's "nested controls
  inherit their host" rule applies regardless of *why* a control ended up in a given host.

Net effect: **no LFO-Drift-specific code exists anywhere in this spec.** The mixed-trait concern the
intent doc raised was real for the *design the intent doc had in mind* (one shared Drift accordion); it
doesn't apply to the app as actually built. This is exactly the kind of thing spec-time code
verification exists to catch, rather than building unneeded plumbing for a control layout that no
longer exists.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── traits.ts                    # NEW — Trait union + TRAIT_IDS
│   ├── traits.test.ts               # NEW
│   └── Robot.ts                     # MODIFIED — gains identityColor: string
├── constants/
│   ├── accentColors.ts              # NEW — ACCENT_COLORS (16 hex, transcribed from
│   │                                  #   docs/reference/accent-colors.css), ROBOT_IDENTITY_COLOR_NAMES
│   └── accentColors.test.ts         # NEW
├── utils/
│   ├── traitColors.ts               # NEW — TRAIT_COLORS, getTraitColorStyle, getRobotColorStyle
│   └── traitColors.test.ts          # NEW
├── systems/
│   ├── spawnSystem.ts               # MODIFIED — generateRobotIdentityColor() + one new field
│   │                                  #   in the robot: Robot = {...} literal (spawnInitialRoster)
│   └── spawnSystem.test.ts          # MODIFIED
├── components/
│   ├── ui/controls/
│   │   ├── AccordionContainer.tsx   # MODIFIED — new optional `style` prop (§1.5.1)
│   │   └── AccordionContainer.test.tsx # MODIFIED
│   ├── panels/screen/
│   │   ├── Header.tsx               # MODIFIED — style={getTraitColorStyle('header')} on existing root
│   │   └── console/
│   │       ├── AudioRigDrawer.tsx   # MODIFIED — wrapper <div>s around 4 accordions only (§1.5); no
│   │       │                         #   drift-specific change needed (§1.6)
│   │       ├── AudioRigDrawer.test.tsx # MODIFIED
│   │       ├── SectorSettingsDrawer.tsx # MODIFIED — style on existing root
│   │       └── RobotOptionsTab.tsx  # MODIFIED — style on existing "robot-options" root
│   ├── company/
│   │   └── CompanyManager.tsx       # MODIFIED — style on existing root
│   ├── selection/
│   │   └── RobotSelectionCard.tsx   # MODIFIED — style on existing "li" root
│   └── robot/
│       ├── AudioSettingSection.tsx  # MODIFIED — style prop passed to its own AccordionContainer
│       ├── PingControlsDrawer.tsx   # MODIFIED — same
│       ├── PingContourDrawer.tsx    # MODIFIED — same
│       └── SignatureArrayDrawer.tsx # MODIFIED — same
├── index.css                        # MODIFIED — §1.2's 4-line color-token change; --color-bg/
│                                      #   --color-surface/--color-border/text tokens UNCHANGED
├── components/ui/controls/
│   ├── CabinetBox.css                # MODIFIED — .sc-cabinet-box__backing: background-color →
│   │                                  #   background: var(--color-accent-gradient)
│   ├── Button.css                    # MODIFIED — same swap, its own accent-filled front face
│   └── RadioButton.css               # MODIFIED — same swap, its own selected-segment fill
└── utils/
    └── voxelTrackMath.ts             # MODIFIED — computeVoxelFillBackground's 100%-filled branch
                                       #   returns 'var(--color-accent-gradient)' instead of
                                       #   'var(--color-accent)'; the partial-fill branch is UNCHANGED
                                       #   (§1.2) — voxelTrackMath.test.ts's existing 100% assertions
                                       #   updated to match, partial-fill assertions untouched

docs/
├── CONSOLE_THEMING.md   # MODIFIED — new section recording the shipped trait system, superseding
│                          #   the "Ballast" static-palette section this phase replaces
└── reference/
    └── accent-colors.css # UNCHANGED — stays the human-authored design source accentColors.ts
                           #   transcribes from, same relationship GLOBAL_CHAIN_GRID.md already has
                           #   to globalAudioSeedRanges.ts
```

**Explicitly not touched, and why:** `CabinetBox.tsx`/`.css`'s top-face/left-face/glow rules (still
correctly read `--color-accent`'s new derived midpoint, no code change needed); `DirectionalPanel.tsx`
(§1.5.2); every other `AccordionContainer` consumer not listed above (Audio Rig's per-effect-block
accordions inside each group already inherit their group's trait via cascade — they render `schema`
only, no `style`, and don't need one); `robotVisualHelpers.ts`/`robotVisualMapper.ts` (the SVG body
color pipeline, untouched per §1.4); `assets/color-theme.json` (empty, unrelated — the stale
`src/index.css` comment referencing it predates this phase and is deleted as part of the `index.css`
edit, not left dangling).

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`--color-bg`/`--color-surface`/`--color-border`/`--color-text-primary`/`--color-text-muted` are
  unchanged app-wide** — only the accent/fill role varies per trait, per the confirmed intent. No file
  in §2 touches any of these 5 tokens' own values.
* **`ACCENT_COLORS` (`src/constants/accentColors.ts`) is the single hardcoded source of these 16 hex
  values.** `traitColors.ts` and `spawnSystem.ts` both import from it; neither re-states a hex literal.
* **`DirectionalPanel` gains no new prop.** Every `DirectionalPanel` this phase's colors need to reach
  already sits nested inside one of §1.5's group-level wrapper `<div>`s and inherits from there (§1.5.2,
  §1.6) — never a change to that component's own `{ schema, children }` contract, which is an explicit,
  documented design decision in that file, not an oversight to "fix."
* **The robot's own SVG body rendering is untouched.** `robotVisualHelpers.ts`/`robotVisualMapper.ts`
  are not in §2's file list and this spec makes no change to either.
* **No Tone.js/audio-engine files are touched** — this is a pure CSS/React-presentation and
  procedural-generation (`spawnSystem.ts`) change; nothing here schedules audio or creates a Tone node,
  so CLAUDE.md's audio-architecture guardrails don't apply to any file in §2.
* **State stays JSON-serializable.** `Robot.identityColor` is a plain hex string — no new non-
  serializable field is added to `Robot`, `localeStore`, or any other Zustand-held state.
* **No new GSAP timeline.** Trait/robot color scoping is a static inline `style` object computed once
  per render from a plain lookup — nothing here animates, so `timelineMap` is not involved.
* **`voxelTrackMath.ts`'s partial-fill (straddling-box) gradient branch is unchanged** — only the
  100%-filled branch's return value changes (§1.2). Do not generalize the straddling-box fill into a
  3-stop or nested gradient as part of this phase.

---

## 4. Code Style & Architecture Conventions

**`src/constants/accentColors.ts`** (new):

```typescript
/**
 * Single source of truth for the app's static accent palette — transcribed once from
 * docs/reference/accent-colors.css (Crawford's own design reference; that file is not imported at
 * runtime). See docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.1. Renaming a key here is a breaking
 * change to traitColors.ts and spawnSystem.ts's robot-color seeding — treat it the same caution
 * class as a getSeededVal dataId rename (docs/PROCEDURAL_GENERATION.md).
 */
export const ACCENT_COLORS = {
  orange: '#da7e1b', red: '#cd5e57', pink: '#ae5378', purple: '#7a5484',
  plum: '#65617f', blue: '#4f6d7a', cyan: '#428d95', teal: '#41ad9f',
  green: '#68cb97', lime: '#a9e583', yellow: '#e9e377', tangerine: '#e2b149',
  beige: '#f7f5d3',
  black: '#120a03', white: '#fff', darkGray: '#211e1b',
} as const;

export type AccentColorName = keyof typeof ACCENT_COLORS;

/** The 13 hue keys only — excludes black/white/darkGray, which would render a robot's card/detail
 *  identity color as colorless against the app's own dark neutral base. Order is stable (object
 *  insertion order) since spawnSystem.ts indexes into it via a seeded float — reordering this array
 *  changes which color every already-generated robot on a given seed gets, the same
 *  breaking-change caution as a dataId rename. */
export const ROBOT_IDENTITY_COLOR_NAMES: AccentColorName[] = [
  'orange', 'red', 'pink', 'purple', 'plum', 'blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'tangerine', 'beige',
];
```

**`src/types/traits.ts`** (new) and **`src/utils/traitColors.ts`** (new): as shown in §1.3.

**`src/types/Robot.ts`** (diff):

```typescript
export interface Robot {
  id: string;
  name?: string;
  /** Deterministic per-robot identity color (one of ACCENT_COLORS' 13 hues, seeded at spawn) —
   *  UI chrome only (RobotSelectionCard/RobotDisplaySection), never the SVG body's own ADSR/
   *  waveform-derived HSL fill (docs/ROBOT_DESIGN.md, unaffected). See
   *  docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.4. */
  identityColor: string;
  state: RobotState;
  // ...unchanged...
}
```

**`src/systems/spawnSystem.ts`** (diff, alongside `generateRobotName`): as shown in §1.4.

**`src/components/panels/screen/console/AudioRigDrawer.tsx`** (diff — the 3 accordion groups):

```tsx
import { getTraitColorStyle } from '@/utils/traitColors';

const AUDIO_RIG_GROUP_TRAIT: Record<AudioRigAccordionGroupKey, Trait> = {
  eqFilters: 'spectral', timeSpace: 'timeSpace', output: 'output',
};

// ...
{AUDIO_RIG_ACCORDION_GROUPS.map((group) => (
  <div key={group.accordion.id} style={getTraitColorStyle(AUDIO_RIG_GROUP_TRAIT[group.key])}>
    <AccordionContainer schema={group.accordion}>
      {/* ...unchanged PanelGroup content... */}
    </AccordionContainer>
  </div>
))}

<div style={getTraitColorStyle('composition')}>
  <AccordionContainer schema={TRANSPORT_COMPOSITION_ACCORDION_SCHEMA}>
    {/* ...unchanged... */}
  </AccordionContainer>
</div>
```

No diff needed for `LFO_DRIFT_GROUPS`/`renderBlock()`'s own drift rendering, or for
`SignatureArrayDrawer.tsx`'s `ROBOTS_DRIFT_GROUP` — both inherit their already-wrapped host's trait
color automatically, per §1.6.

**`src/components/panels/screen/console/RobotOptionsTab.tsx`** (diff):

```tsx
import { getRobotColorStyle } from '@/utils/traitColors';

return (
  <div className="robot-options" style={getRobotColorStyle(robot.identityColor)}>
    <RobotDisplaySection robot={robot} />
    <AudioSettingSection style={getTraitColorStyle('output')} /* ...unchanged props... */ />
    <PingControlsDrawer style={getTraitColorStyle('composition')} /* ... */ />
    <PingContourDrawer style={getTraitColorStyle('timeSpace')} /* ... */ />
    <SignatureArrayDrawer style={getTraitColorStyle('spectral')} /* ... */ />
  </div>
);
```

Each of `AudioSettingSection`/`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer` gains one
new optional `style?: CSSProperties` prop, forwarded straight to its own `<AccordionContainer
schema={...} style={style}>` — the identical, additive change §1.5.1 makes to `AccordionContainer`
itself, one level up.

**`RobotSelectionCard.tsx`** / **`CompanyManager.tsx`** / **`SectorSettingsDrawer.tsx`** /
**`Header.tsx`** (diff, same shape in all 4 — shown once):

```tsx
// RobotSelectionCard.tsx
<li className="robot-selection-card" style={getRobotColorStyle(robot.identityColor)} /* ...unchanged... */>
```
```tsx
// CompanyManager.tsx / SectorSettingsDrawer.tsx / Header.tsx
<div className="company-manager" style={getTraitColorStyle('company')}>          {/* CompanyManager */}
<div className="sector-settings-drawer" style={getTraitColorStyle('seed')}>      {/* SectorSettingsDrawer */}
<header ref={headerRef} className="header" style={getTraitColorStyle('header')}> {/* Header.tsx */}
```

**`src/index.css`** (diff): as shown in §1.2.

**`CabinetBox.css`/`Button.css`/`RadioButton.css`** (diff, same one-line shape in all 3):

```css
/* CabinetBox.css .sc-cabinet-box__backing — was background-color: var(--color-accent); */
background: var(--color-accent-gradient);
```

**`voxelTrackMath.ts`** (diff, `computeVoxelFillBackground`):

```typescript
if (fillPercent >= 100) return 'var(--color-accent-gradient)'; // was 'var(--color-accent)'
if (fillPercent <= 0) return 'var(--color-surface)';           // unchanged
return `linear-gradient(${direction}, var(--color-accent) 0%, var(--color-accent) ${fillPercent}%, var(--color-surface) ${fillPercent}%, var(--color-surface) 100%)`; // unchanged — still the flat midpoint, see §1.2
```

* **Naming Conventions:** `getTraitColorStyle`/`getRobotColorStyle` (verb-first, matching
  `getStatusLightColor`'s existing shape in `statusLightColors.ts`); `TRAIT_COLORS`/`ACCENT_COLORS`
  (SCREAMING_SNAKE constants, matching every other static lookup table in `src/constants`/`src/data`).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the
  lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`accentColors.test.ts` (new):** `ACCENT_COLORS` has exactly 16 keys, each a valid 3/4/6/8-digit
  hex or `#fff` literal; `ROBOT_IDENTITY_COLOR_NAMES` has exactly 13 entries and excludes `black`/
  `white`/`darkGray`.
* **`traitColors.test.ts` (new):** `TRAIT_COLORS` has exactly one entry per `TRAIT_IDS` member, each a
  2-tuple of distinct `ACCENT_COLORS` values; `ACCENT_COLORS.beige` does not appear in any trait pair
  (asserts the "deliberately reserved" decision, §1.3); `getTraitColorStyle('output')` returns
  `{ '--color-accent-a': ACCENT_COLORS.red, '--color-accent-b': ACCENT_COLORS.orange }`;
  `getRobotColorStyle('#abc123')` returns both properties set to `'#abc123'`.
* **`spawnSystem.test.ts` (modified):** every spawned robot has an `identityColor` that's a member of
  `ROBOT_IDENTITY_COLOR_NAMES`'s resolved hex values; identical `(seed, spawnCount)` produces the same
  `identityColor` on repeated calls (determinism, matching every other seeded field's existing coverage
  pattern in this file); at least 2 of the 12 spawned robots in a fixed-seed roster have different
  `identityColor` values (not a constant collapse).
* **`AccordionContainer.test.tsx` (modified):** passing `style` applies it to the rendered
  `Accordion.Root` element (e.g. asserts a custom property is present in its computed inline style);
  omitting `style` is unaffected — existing tests continue to pass unmodified.
* **`AudioRigDrawer.test.tsx` (modified):** each of the 3 `AUDIO_RIG_ACCORDION_GROUPS` wrapper `<div>`s
  carries its expected trait's `--color-accent-a`/`-b`; a `renderBlock('eq3')` render's nested Drift
  `DirectionalPanel` resolves `--color-accent` to `spectral`'s midpoint via inherited context (no
  drift-specific assertion needed beyond confirming the *group* wrapper's own style reaches that deep —
  proves §1.6's "no extra code" claim rather than merely asserting it in prose).
* **`SignatureArrayDrawer.test.tsx` (modified):** its own root's `spectral` style (passed via the new
  `AccordionContainer` `style` prop, §1.5.1) is present, confirming `ROBOTS_DRIFT_GROUP`'s rendered
  controls inherit it the same way.
* **`voxelTrackMath.test.ts` (modified):** the existing 100%-filled assertions
  (`computeVoxelFillBackground(100, ...)` / `(150, ...)`) updated to expect
  `'var(--color-accent-gradient)'`; every partial-fill assertion is unchanged, verifying §1.2's
  "straddling box stays flat" scope-narrowing wasn't silently widened.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including every currently-passing `CabinetBox`/
     `Button`/`RadioButton`/`AccordionContainer` test unmodified by this phase.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** load the app and visually confirm each of the 7 regions in §1.5's
  table renders in its own distinct trait color; open a robot's Options screen and confirm its card/
  header chrome shows one flat identity color while its 4 drawers each show their own trait's colors,
  not the robot's; confirm two different robots show two different identity colors; confirm reassigning
  one trait's pair in `traitColors.ts` (a throwaway local edit, reverted after) changes only that
  trait's regions, verifying the "simple swap" success criterion directly rather than only asserting it
  in a unit test.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** TBD at Tasks time — likely `feature/color-themes` (already the active branch
  per this session's git status) or a more specific `feature/trait-theming`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences. Suggested grouping, each independently reviewable: (1) `accentColors.ts`/`traits.ts` +
  tests (the color/type source), (2) `traitColors.ts` + test (the lookup + style helpers), (3)
  `spawnSystem.ts`/`Robot.ts` + tests (robot identity color), (4) `index.css` + the 3 CSS
  `background-color`→`background` swaps + `voxelTrackMath.ts` (the gradient mechanism itself), (5)
  `AccordionContainer.tsx` + test (the new `style` prop), (6) every wrapper-application call site
  (`AudioRigDrawer.tsx`, `RobotOptionsTab.tsx`, the 4 Robot Options drawer components, `RobotSelection
  Card.tsx`, `CompanyManager.tsx`, `SectorSettingsDrawer.tsx`, `Header.tsx`) + their tests, (7)
  `docs/CONSOLE_THEMING.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and code, not left open):

- ~~What CSS mechanism carries a trait's 2 colors?~~ **Resolved: `--color-accent-a`/`-b` custom
  properties, re-declared per subtree; `--color-accent`/`--color-accent-gradient` derived from them
  once at `:root`** — §1.2.
- ~~How does "trait overrides robot color" actually get implemented?~~ **Resolved: it isn't
  implemented at all as explicit logic — it falls out of plain CSS custom-property cascade once the
  robot's color is scoped at an outer root and each trait re-declares its own pair on an inner one** —
  §1.5.
- ~~How does a robot get its color?~~ **Resolved: seeded at spawn, `generateRobotIdentityColor`,
  identical shape to `generateRobotName`** — §1.4.
- ~~What does the Drift accordion's mixed-trait `'robots'` group do?~~ **Resolved: the premise was
  stale — there is no shared Drift accordion in the current code. `eq3`/`filterLPF`/`filterHPF` drift
  renders inside each effect's own already-trait-wrapped block, and `'robots'` drift renders inside
  `SignatureArrayDrawer` (itself `spectral`-scoped). Both inherit via cascade; no dedicated code** —
  §1.6.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **`voxelTrackMath.ts`'s straddling-box fill staying a flat `--color-accent` midpoint rather than a
   genuine 2-tone gradient (§1.2) is this spec's own scope-narrowing, not something the intent doc
   explicitly decided.** If a real visual pass finds the flat midpoint reads inconsistently next to a
   fully-filled box's actual gradient within the same slider row, revisit — but don't gold-plate this
   pre-emptively without seeing it rendered.
2. **The Header trait doubling as `index.css`'s own ambient/default pair (§1.2) means Header's own
   rendered chrome and "nothing else's assigned trait" currently look identical.** Confirmed
   intentional in this spec (§1.5's table), but worth a real visual check that this doesn't read as
   "Header forgot to get themed" rather than "Header's theme IS the base."
3. **`docs/COMPONENT_LIBRARY.md`'s own `AccordionContainer` section should get a one-line addition for
   the new optional `style` prop** once this ships — not listed in §2's Docs list above since the
   intent doc's own "Downstream" note left doc updates to be enumerated at Plan/Tasks time; flagging
   here so it isn't missed.
4. **A future 8th trait (using the reserved `beige`) or a Company-per-instance color scheme are both
   explicitly out of scope (per the intent doc) but the mechanism built here (`TRAIT_COLORS`,
   `getTraitColorStyle`) accommodates either with no structural change** — worth noting at Plan time so
   a future phase doesn't re-derive this same wiring from scratch.
