
# Trace Atlas

![deploy](https://img.shields.io/badge/deploy-github%20pages-brightgreen) ![tests](https://img.shields.io/badge/tests-vitest-blue) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

**Interactive ambient robot symphony generator**

_A browser-based musical experience where autonomous robots swim through a post-apocalyptic underwater world, creating evolving compositions through their movements and interactions._

**Status:** Feature-complete core, live on GitHub Pages ([fallboard-studios.github.io/trace-atlas](https://fallboard-studios.github.io/trace-atlas/)) — ongoing UI polish and performance work. See [docs/todo/roadmap.md](docs/todo/roadmap.md) for exactly what's shipped vs. still open.

---

## Table of Contents

- [What it does](#what-it-does)
- [Tech Stack](#tech-stack)
- [Architecture Highlights](#architecture-highlights)
- [Key Features](#key-features)
- [Local Development](#local-development)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Development Workflow](#development-workflow)
- [Roadmap](#roadmap)
- [Testing](#testing)
- [License](#license)
- [About Fallboard Studios](#about-fallboard-studios)

---

## What it does

Trace Atlas is a generative music system centered on a fixed roster of 12 autonomous robots exploring a procedurally-generated ocean-floor locale. Each robot carries a seeded, deterministic melody, a 3-layer oscillator "Signature Array," and its own battery/docking/job lifecycle; factories dot the sea floor as seeded set-dressing. Every robot looks and sounds unique — synth type, ADSR envelope, and pitch range drive both its visual shape and its sonic character. All audio and animation are locked to a shared musical beat clock (`Tone.Transport` + `BeatClock`), so the scene always sounds intentional.

A tablet-styled console UI — navigated through a schema-driven nav tree (Settings, Fleet Params, Probes, Companies) — lets users retune the world (re-seed the "Attenuation Style" and jump to new plot coordinates), shape the global Audio Rig (EQ, filters, delay, reverb, compressor, limiter, plus stacked LFO modulation), and edit individual robots or whole user-defined **Companies** of robots at once.

---

## Tech Stack

- **React 19** + **TypeScript 5.9** (strict mode)
- **Vite 7** — build tooling
- **Zustand 5** — serializable application state
- **Tone.js 15** — Web Audio synthesis, scheduling, and the beat-clock transport
- **GSAP 3** (`@gsap/react`) — all animation and motion (no `requestAnimationFrame` for musical timing)
- **Radix UI** — accessible primitives underlying the Design System's 14 stateless UI controls
- **Vitest** + **Testing Library** — unit/component tests
- **ESLint** + **Prettier** — linting and formatting

---

## Architecture Highlights

- **Single global `AudioEngine`** — one synth pool shared across all robots; no per-robot Tone.js instances, polyphony capped at `MAX_POLYPHONY = 16`
- **`timelineMap` pattern** — every GSAP timeline lives in a shared registry (`setTimeline`/`killTimeline`), never in React or Zustand state
- **`Tone.Transport` + `BeatClock` as the only clock** — scheduling goes through `AudioEngine.scheduleNote()`/`Transport.scheduleRepeat`/`scheduleOnce` with a short lookahead (`MIN_LEAD` ≈ 50–100ms); no `setTimeout`/`requestAnimationFrame`/`queueMicrotask` for musical timing
- **Strict separation** — GSAP timelines only trigger semantic state changes; they never call `AudioEngine` directly
- **Audio → Visual mapping** — synth type/ADSR/phase/detune drive robot body shape and color, locked to the audio attributes that generated them (never the reverse)
- **An "Audio Load Budget"** dial trades audible-robot count, polyphony, and LFO tiers against render headroom on weaker devices (phones), since the whole scene runs on one shared audio thread

See [CLAUDE.md](CLAUDE.md) for the full list of non-negotiable architecture constraints, and its own Reference Docs section for the doc covering each subsystem in depth.

---

## Key Features

- Seeded, deterministic world generation — an "Attenuation Style" (world seed) plus plot coordinates fully determine the locale, its 12 robots, factories, and companies; no `Math.random()` in generation
- Per-robot melody/rhythm engine (density, motif length, note variance, octave range), a shared per-robot ADSR envelope, and a 3-layer (Baseline/Coaxial/Harmonic) oscillator "Signature Array" with per-target LFO modulation
- Robot lifecycle: Battery drain/recharge, a Docking state machine, and Job assignment — the roster is fixed at spawn, nothing dynamically spawns or despawns afterward
- **Companies** — user-created groups of robots; every editable Robot Options field can be broadcast-edited across a whole company at once
- Global Audio Rig: 3-Band EQ, Low-/High-Pass Filter, Delay, Reverb, Compressor, Limiter, all seeded per world, plus stacked/grouped LFO "drift" for organic, non-repeating modulation
- A schema-driven, hand-rolled ARIA nav tree (Settings / Fleet Params / Probes / Companies) with a shared "Oblique Cabinetry" tactile UI language (2.5D popping boxes) across all 14 Design System primitives
- Deployed automatically to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`)

**Not yet built** (see [docs/todo/roadmap.md](docs/todo/roadmap.md) Phases 19–21, 30 for specifics): backfilled unit coverage for a handful of older modules, Session Storage / URL-based save-and-share, and a few UI restructuring gaps (e.g. group-level intro panels on some Robot Options accordions).

---

## Local Development

```bash
git clone https://github.com/fallboard-studios/trace-atlas.git
cd trace-atlas
npm install
npm run dev
```

Open http://localhost:5173

```bash
npm test            # run unit tests (Vitest)
npm run build       # production build (tsc --noEmit + vite build)
npm run preview     # preview production build locally
```

---

## Project Structure

```
src/
├── animation/      # GSAP timelines, timelineMap, swimAnimation
├── engine/         # AudioEngine, BeatClock, lfoEngine/lfoDrift, harmonySystem, melodyGenerator
├── components/
│   ├── ui/controls/   # The 14 stateless Design System primitives (ControlSchema-driven)
│   ├── panels/screen/nav/   # Nav tree, per-branch content views, Oblique Cabinetry rows
│   ├── panels/screen/console/  # Audio Rig, Sector Settings, Robot Options drawers
│   ├── actors/     # Factory, BubbleStream (world-view set dressing)
│   ├── robot/      # Robot SVG variants and per-robot audio/options drawers
│   ├── company/    # Company CRUD + bulk-edit sections
│   ├── selection/  # Robot Selection cards
│   └── debug/      # Dev-only overlays (?debug query param)
├── stores/         # Zustand stores (localeStore, attenuationStyleStore, audioStore, uiStore)
├── systems/        # Deterministic game logic (spawn, robot lifecycle, audio swells, factory placement)
├── data/           # Typed ControlSchema config files (one per drawer/nav content area)
├── types/          # TypeScript interfaces
├── utils/          # Seeded RNG (getSeededVal), refs registry, misc helpers
└── constants/      # App-wide constants
```

---

## Documentation

- [CLAUDE.md](CLAUDE.md) — architecture constraints and guardrails (start here)
- [Audio System](docs/AUDIO_SYSTEM.md) · [Beat Clock](docs/BEAT_CLOCK.md) · [Polyphony Guide](docs/POLYPHONY_GUIDE.md)
- [Melody System](docs/MELODY_SYSTEM.md) · [Harmony System](docs/HARMONY_SYSTEM.md)
- [Robot Design](docs/ROBOT_DESIGN.md) · [Robot Lifecycle](docs/ROBOT_LIFECYCLE.md) · [Companies](docs/COMPANIES.md)
- [Animation System](docs/ANIMATION_SYSTEM.md) · [Component Library](docs/COMPONENT_LIBRARY.md) · [UI Shell](docs/UI_SHELL.md)
- [Building Design](docs/BUILDING_DESIGN.md) · [Procedural Generation](docs/PROCEDURAL_GENERATION.md)
- [Performance](docs/PERFORMANCE.md) · [Session Storage (design doc, not yet implemented)](docs/SESSION_STORAGE.md)
- [Contribution Guide](docs/CONTRIBUTION_GUIDE.md) — coding standards and PR process
- [Roadmap](docs/todo/roadmap.md) and [Backlog](docs/todo/backlog.md) — what's shipped, what's open, phase by phase

---

## Development Workflow

1. Branch off `main` (naming follows the work, e.g. `feature/…`, `bug/…`, `docs/…` — see recent branches for convention)
2. Implement changes following [CLAUDE.md](CLAUDE.md)'s architecture constraints
3. Run locally before opening a PR — there is no test/lint CI configured yet: `npm run lint && npm run build:types && npm test`
4. Open a PR; at least one other contributor reviews before merging (see [docs/CONTRIBUTION_GUIDE.md](docs/CONTRIBUTION_GUIDE.md))
5. Merging to `main` auto-deploys to GitHub Pages

---

## Roadmap

There's no fixed milestone list — `docs/todo/roadmap.md` tracks ~30 numbered phases (world generation, audio engine, the Design System, Companies, the nav rewrite, performance work, and ongoing UI polish), most already shipped and merged to `main`. `docs/todo/backlog.md` tracks smaller review-found fixes and cleanup that don't warrant their own phase. Both are kept current against actual git/merge state — check them rather than this section for what's actually done.

---

## Testing

```bash
npm test               # run unit tests (Vitest)
npm run test:coverage  # run unit tests with coverage
npm run lint           # ESLint
npm run build:types    # tsc --noEmit
npm run format         # Prettier write
npm run build           # production build
npm run perf             # main-thread view-switch profiling harness (scripts/perf/profile.mjs)
npm run perf:audio     # audio render-capacity measurement
```

---

## License

MIT — see [LICENSE](LICENSE)

---

## About Fallboard Studios

Fallboard Studios creates interactive musical experiences at the intersection of code and creativity.

**GitHub Org:** [fallboard-studios](https://github.com/fallboard-studios)

---

## Acknowledgments

Inspired by generative music systems, procedural generation, and the ambient genre.

Built with love for interactive audio experiences.
