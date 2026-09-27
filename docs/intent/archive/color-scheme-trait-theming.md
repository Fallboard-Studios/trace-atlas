# Intent: Visual Identity — Color Scheme & Trait-Based Theming

Confirmed via `/interview-me` on 2026-09-12. Implements
[Phase 14](../todo/roadmap.md#14-visual-identity-color-scheme--trait-based-theming), and resolves that
phase's own open "still being worked out" trait-theming question into a concrete design. Deliberately
static, not seed-driven — a reversal of the cut Phase 11 approach
([docs/CONSOLE_THEMING.md](../CONSOLE_THEMING.md)), whose WCAG-safety-for-every-seed guarantee is what
forced that attempt's colors into an unsatisfying band. Source palette:
[docs/reference/accent-colors.css](../reference/accent-colors.css) — 13 named hues (orange, red, pink,
purple, plum, blue, cyan, teal, green, lime, yellow, tangerine, beige) plus black/white/dark-gray.

## Outcome

- **7 traits**, each covering a fixed set of existing drawers/accordions/blocks app-wide (not scoped to
  the Audio Rig alone):

  | Trait | Colors | Covers |
  |---|---|---|
  | Spectral | Cyan `#428d95` + Teal `#41ad9f` | Audio Rig: EQ3, Low-Pass Filter, High-Pass Filter. Robot Options: `SignatureArrayDrawer` |
  | Time/Space | Blue `#4f6d7a` + Plum `#65617f` | Audio Rig: Delay, Reverb. Robot Options: `PingContourDrawer` (ADSR) |
  | Output | Red `#cd5e57` + Orange `#da7e1b` | Audio Rig: Compressor, Limiter. Robot Options: Volume + its LFO, `AudioSettingSection` |
  | Composition | Green `#68cb97` + Lime `#a9e583` | Audio Rig: "Transport & Composition" accordion (Tempo, Automatic Effects). Robot Options: `PingControlsDrawer` |
  | Company | Purple `#7a5484` + Pink `#ae5378` | `CompanyManager`'s own button row + CRUD controls only — see amendment below on its bulk-edit panel's own 4 accordions |
  | Seed | Tangerine `#e2b149` + Yellow `#e9e377` | `SectorSettingsDrawer` (Attenuation Style + Plot Tuning) |
  | Header | White `#fff` + Dark-gray `#211e1b` | `Header` bar (nav `RadioButton`, Mute `Toggle`, Volume `SliderLinear`) |

  Beige `#f7f5d3` is deliberately unused/spare — reserved for a future trait or adjustment, not an
  oversight. Pairs are chosen to be analogous (hue difference roughly ≤60°) rather than
  near-complementary, specifically to avoid a muddy gray midpoint when the two colors are blended into a
  gradient (Cyan/Teal ~14° apart, Blue/Plum ~48°, Red/Orange ~29°, Green/Lime ~56°, Purple/Pink ~55°,
  Tangerine/Yellow ~25°; Header's White/Dark-gray is a deliberately achromatic pair, not part of the
  hue-wheel reasoning).

- **Each trait's 2 colors feed a two-tone gradient**, not a surface/accent split — the fill/glow/active
  color for every accordion, slider, etc. belonging to that trait is a gradient between its 2 colors.
  `--color-bg`, `--color-surface`, `--color-border`, `--color-text-primary`, `--color-text-muted` stay a
  single shared neutral base across the entire app, unaffected by trait — only the accent/fill role
  varies per trait. This keeps the "swap a few values, nothing else to migrate" property
  `docs/CONSOLE_THEMING.md` specifically praised about the current Ballast setup: reassigning a trait's
  colors later is a small, localized edit, not an architecture change.

- **Nested LFO controls inherit their host's trait color** — both the per-target LFO frames nested
  inside a parameter's own accordion (e.g. Filter Frequency's LFO, inside the Spectral-themed Filter
  block) and the global LFO Drift accordion's per-effect groups (EQ3/LPF/HPF drift inherit Spectral).
  The Drift accordion's 4th group, "robots" — a single shared control spanning LFOs across both
  Signature Array (Spectral) and Volume (Output) — can't cleanly inherit one trait this way; its color
  source is left as an implementation detail for the spec pass, not resolved here.

- **Each of the 12 robots gets its own individual identity color** — a single flat color (no gradient),
  deterministically seeded from the robot's own ID/seed (the same `getSeededVal` pattern every other
  generated robot attribute already uses, per `docs/PROCEDURAL_GENERATION.md`), drawn from the same
  13-swatch list traits use. This is strictly UI chrome — `RobotSelectionCard`'s background/border/glow
  and `RobotDisplaySection`'s header accent — and never touches the robot's own SVG body rendering,
  which stays exactly as `docs/ROBOT_DESIGN.md` already governs (HSL derived from `adsr`/`waveform`,
  no static palette). This is not a relaxation of that guardrail: the new identity color is a distinct,
  additional piece of UI chrome around the robot, not a change to the robot's own rendered shape/color.

- **Trait color overrides robot color wherever both could apply.** On a robot's own detail screen
  (`RobotOptionsTab`), the robot's individual color applies only to the parts of `RobotDisplaySection`
  and `RobotSelectionCard` that aren't inside a trait-themed accordion/section — the read-only Name/Job/
  Battery/Docking display, and the card's own background/border/glow. Every accordion
  (`PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`) and the Audio Setting/Volume
  section render in their trait's colors (Output, per the table above), not the robot's.

- **Company is a trait, not a per-instance color** — individual companies do not each get their own
  identity color the way robots do; `CompanyManager` as a whole is Company-trait-themed, uniformly
  across every company. See amendment below on how this now excludes its own bulk-edit panel's 4
  reused accordions.

**Amendment (2026-09-12, Crawford's own request):** the Robots tile's Company bulk-edit panel
(`CompanyOptionsSection`, reusing `AudioSettingSection`/`PingControlsDrawer`/`PingContourDrawer`/
`SignatureArrayDrawer`) was never explicitly addressed by the original design pass above — only
`CompanyManager`'s own outer root was. Crawford's own instruction after shipping: those 4
accordions should match the individual robot detail page control-for-control, not read as
uniformly Company-purple/pink. Each of the 4 now gets the identical trait style RobotOptionsTab
passes it (Output/Composition/Time-Space/Spectral) at its `CompanyOptionsSection` call site too —
same mechanism, same trait per component, whether it's editing one robot or a company's bulk
baseline. `CompanyManager`'s own Company trait now scopes only its own chrome (the button row and
CRUD controls) — the bulk-edit panel's 4 accordions override it locally via the same style-prop
cascade `RobotOptionsTab`'s own robot-color root already relies on for its 4 children.

**Amendment (2026-09-12, Crawford's own request):** the emerald/indigo Header pairing (added when
those 2 colors joined the palette — see `docs/specs/COLOR_SCHEME_TRAIT_THEMING.md` §1.3's own
amendment) put Header's 2 colors 96° apart on the hue wheel, the only pair in the palette breaking
the ≤60° analogous-hue rule every other pair follows — Crawford's own read: "I don't think indigo
and emerald work well together." A visual proof-of-concept comparing every candidate pair as its
real rendered gradient was reviewed before deciding. Splitting emerald and indigo into 2 different
pairs required hand-rebalancing 3 traits at once (a strict hue-sorted resort was tried first and
rejected — it "fixes" Header but produces 2 different pairs tighter than 14°, worse than the
problem being solved): **Spectral** trades teal for indigo (Cyan/Indigo, 52°), **Composition**
trades green for emerald (Emerald/Lime, 46°), and **Header** inherits both leftovers — teal and
green — as a pair that never existed before (24°). Time/Space, Output, Company, and Seed are
untouched. This is the current, final state of `TRAIT_COLORS` — the original table at the top of
this doc's Outcome section, and the emerald/indigo amendment above, both predate it.

## User

Crawford (solo dev) — "can't ship with what we've got" on the current placeholder "Ballast" palette.

## Why now

Phase 14 is upstream of Phases 15-17 (Robot Cards, Company CRUD, Robot Detail redesigns), which are
meant to be designed against the real palette rather than being redone once it lands.

## Success

- Every accordion/slider/control in the app that belongs to one of the 7 traits renders using that
  trait's 2-color gradient for its fill/glow/active states.
- Every one of the 12 robots shows a distinct, seed-deterministic identity color on its
  `RobotSelectionCard` and `RobotDisplaySection` header chrome, unrelated to and non-overriding of the
  robot's own ADSR/waveform-derived SVG body color.
- `--color-bg`/`--color-surface`/`--color-border`/text colors are unchanged app-wide regardless of
  which trait or robot is on screen.
- Reassigning a trait's 2 colors, or the robot-color source list, is a small, localized edit (per the
  "simple swap" requirement) — verified by actually doing it once during review, not just asserted.
- `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.

## Constraint

- Static/hand-picked colors, not seed-driven — consistent with `docs/CONSOLE_THEMING.md`'s decision to
  cut the seed-driven approach over its WCAG-safety-vs-visual-variety tension.
- WCAG/contrast verification is explicitly **out of scope for this phase** — deferred to
  [Phase 18](../todo/roadmap.md#18-cabinetry-verification-accessibility--performance), which already
  names Phase 14's color scheme as something it needs to check. This phase should not block on or
  attempt its own contrast proof.
- `docs/ROBOT_DESIGN.md`'s "no static palette" guardrail continues to govern the robot's own SVG body
  color untouched — the new per-robot identity color is additive UI chrome, not a change to that system.
- Reuse the existing Cabinetry `color-mix()` / CSS-custom-property mechanism
  (`docs/CONSOLE_THEMING.md`'s face-shading section) for deriving any needed light/dark shades from the
  gradient endpoints, rather than inventing a new theming mechanism.

## Design discussion (2026-09-12, via `/interview-me`)

- **Scope escalation:** Started as "swap the static palette," escalated twice during the interview —
  first to trait-based theming being in scope now (not parked for later), then to that theming being
  system-wide across every drawer in the app (not Audio-Rig-only), including non-audio areas explicitly
  named as traits in their own right (Company, Seed/Sector-Settings).
- **Trait list:** Not fully specified up front — confirmed as "more than the 2 the roadmap named," then
  drafted by the agent from the actual current inventory (`audioRigConfig.ts`'s accordion groups,
  `robotOptionsConfig.ts`'s drawers, `UI_SHELL.md`'s tile list) and confirmed as correct, including the
  Header-as-its-own-trait and Audio-Setting-is-trait-themed clarifications.
- **LFO inheritance:** Both the per-target nested LFO frames and the global Drift accordion's per-effect
  groups inherit their host's trait color rather than getting their own — confirmed explicitly, with the
  Drift accordion's mixed-trait "robots" group flagged as the one case this rule doesn't cleanly resolve
  (parked for spec time).
- **Robot color mechanism:** Confirmed seeded/deterministic (matching every other generated robot
  attribute), not manually pickable — explicitly rejected a "first player-editable visual choice"
  framing as a bigger, separate feature than what's being described here.
- **Gradient vs. surface/accent split:** The agent's first guess (one color → surface, one color →
  accent, mirroring today's Ballast pair) was corrected — Crawford wants both colors used together as a
  two-tone gradient for the accent/fill role, with surface/background staying globally neutral. This is
  what surfaced the gray-mush constraint on pair selection.
- **Trait color picks:** Crawford asked the agent to pick concrete swatch pairs now rather than defer
  the choice, explicitly because reassigning them later is meant to be a "simple swap" — the system's
  design, not the specific color choices, is the part that needs to be right on the first pass.

## Out of scope

- WCAG/contrast validation of any trait pair, gradient, or robot color (Phase 18).
- WorldView/terrain/sky, `SleeveContainer`, and `PowerRockerSwitch` styling — unchanged from Phase 11's
  original exclusion, still not part of this system.
- Per-company individual colors — Company is one uniform trait, not a per-instance color scheme like
  robots get.
- The Drift accordion's mixed-trait "robots" group's exact color source — left to the spec pass.
- Any change to the robot's own SVG body rendering (`robotVisualHelpers.ts`/`robotVisualMapper.ts`) —
  fully untouched by this phase.
- Any visual redesign beyond wiring up the new colors — Phases 15-17's own redesigns are separate,
  downstream work that depends on this phase landing first, not part of it.
- Final say on whether Beige stays unused — noted as spare/reserved, not a decision this phase needs to
  revisit.

## Downstream

Hand this confirmed intent to `spec-driven-development` to produce the written spec (the exact CSS
custom property/gradient mechanism, how a drawer's root gets its trait scoped to it, the robot-color
seeding function's signature, and the Drift-accordion "robots" group resolution), then
`planning-and-task-breakdown` for the task list — one combined pass, following the same process every
other item in `docs/specs/`/`docs/tasks/` used.
