# Trace Atlas — Concise Agent Instructions

Purpose: a compact operating guide for agents and contributors. This file captures the repository's non-negotiable architecture constraints and default workflow expectations. Implementation details and examples live in the linked docs; keep this file concise and action-oriented.

Tech stack
- React 19, TypeScript 5.9, Vite 7, Zustand 5
- GSAP 3 (`@gsap/react`) for animation, Tone.js 15 for audio
- Radix UI primitives for accessible components
- Vitest + Testing Library for tests, ESLint + Prettier for linting/formatting

Authority and precedence
- The architecture constraints and guardrails in this file are non-negotiable. No workflow skill — imported or otherwise — overrides them.
- Skill workflows (installed globally, not in this repo) govern *process* (how to plan, test, and review changes), not architecture. Follow them for their intended phase of work.
- If a skill workflow's process conflicts with a repo constraint below, the repo constraint wins. Document the conflict in the task plan rather than relaxing the constraint.

Skill workflows (invoked by name — provided by globally-installed skills, not files in this repo)
- SPEC_DRIVEN_DEVELOPMENT — skill: spec-driven-development
- TEST_DRIVEN_DEVELOPMENT — skill: test-driven-development
- CODE_QUALITY_REVIEW — skill: code-review-and-quality

Key terms
- AudioEngine: the singleton audio controller for scheduling, voice management, and composite voices.
- BeatClock: the measure-based scheduler used with the transport for musical timing.
- timelineMap: the shared registry for GSAP timelines.
- setRef/getRef: the helper registry for top-level SVG refs.

TL;DR (core constraints)
- Musical audio scheduling and synthesis must go through AudioEngine and the transport/BeatClock path; do not create Tone synths in components or use timers including `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask` for musical timing.
- Animation must use GSAP timelines and keep timelines in timelineMap rather than in React or Zustand state.
- State must stay in Zustand and remain JSON-serializable; keep runtime-only objects such as timelines, refs, and synth instances outside state.
- Polyphony defaults to MAX_POLYPHONY = 16.
- Apply MIN_LEAD ≈ 50–100ms when scheduling audio.

Absolutely forbidden (quick list)
- Creating Tone synths in React components.
- Storing GSAP timelines, DOM refs, or synth instances in state.
- Using requestAnimationFrame loops for game timing or animation when GSAP or the transport can handle the work.
- Calling audio scheduling inside GSAP timeline callbacks; use semantic callbacks instead.

Critical architecture rules (short)
- Audio: `AudioEngine` owns composite voices, scheduling, and voice management. Use `AudioEngine.scheduleNote()` and voice reservation APIs.
- Timing: Initialize `BeatClock` with a transport-like instance via `initBeatClock(transport)` (AudioEngine provides this). Prefer `Transport.scheduleRepeat` / `scheduleOnce` and apply `MIN_LEAD` when scheduling.
- Animation: Use `useGSAP` in components and store references in `timelineMap` (`setTimeline`, `killTimeline`, `killAllTimelines`). Register top-level SVG refs with `setRef(key, el)` and read them from animation modules with `getRef(key)`.
- State: Keep only serialisable primitives/objects/arrays in Zustand. Derived values and complex objects belong in helpers or modules (e.g., timelines, synths, DOM refs).

Guardrails (must not be relaxed)
- Melody Logic: "Melodies must store note indices (0..7), never literal pitch strings; 96 measures = 1 day cycle."
- Visual Mapping: "Robot visuals (shape/color) must map strictly to audio attributes (synth/ADSR/phase/detune) as defined in ROBOT_DESIGN.md."
- Strict Separation: "GSAP timelines must only trigger semantic state changes, never call AudioEngine directly."
- UI Shell: "All interactive UI (transport, navigation, controls) lives inside ScreenViewport only — never in the decorative SleeveContainer."

Reference docs
- `docs/AUDIO_SYSTEM.md`: AudioEngine architecture, MIN_LEAD, polyphony rules, scheduling examples, and the Audio Load Budget (the dial that caps sounding robots, polyphony and LFOs).
- `docs/BEAT_CLOCK.md`: How to initialize and use the BeatClock/Transport for measure-based scheduling.
- `docs/MELODY_SYSTEM.md`: Melody generation rules and step/registry semantics for robot melodies.
- `docs/HARMONY_SYSTEM.md`: Harmony progression rules and chord selection used by the systems.
- `docs/POLYPHONY_GUIDE.md`: Voice management, polyphony budget, and voice-stealing policies.
- `docs/ANIMATION_SYSTEM.md`: GSAP timeline patterns, `timelineMap` lifecycle, and ref registry usage.
- `docs/BUILDING_DESIGN.md`: Factory and placement rules, production cooldowns, and placement algorithms.
- `docs/ROBOT_DESIGN.md`: Robot visual design, audio→visual attribute mapping (synth/ADSR/phase/detune), and SVG generation rules.
- `docs/COMPONENT_LIBRARY.md`: The 14 stateless UI primitives in `src/components/ui/controls/` and the `ControlSchema` contract they consume — the Design System foundation later drawer phases build on.
- `docs/CONTRIBUTION_GUIDE.md`: PR process, testing expectations, and where to record exceptions.
- `docs/UI_SHELL.md`: Sleeve & Glass UI architecture, console navigation, and `uiStore` responsibilities.
- `docs/PROCEDURAL_GENERATION.md`: Seeded/deterministic world generation — noise-map registry, `getSeededVal`, and dataId conventions.
- `docs/ROBOT_LIFECYCLE.md`: Battery/Docking/Job state machines — the fixed 12-robot roster, battery drain/recharge, the Docking transition hold, pitch drift, and job affinity scoring.
- `docs/COMPANIES.md`: Company grouping — the `Company`/`CompanyOptionsSnapshot` shape, seeded spawn-time generation, and the broadcast-not-link bulk-edit semantics. Roadmap Phase 10.
- `docs/SESSION_STORAGE.md`: App-wide persistence design — save/load hierarchy, URL state compression, and the robot-override diff model. Design doc for roadmap Phase 20 — not yet implemented.
- `docs/PERFORMANCE.md`: Main-thread profiling — the `npm run perf` harness (`scripts/perf/profile.mjs`), its method and caveats, and the running baseline table (long tasks vs Tone's 100 ms lookahead) that roadmap 17.2.2–17.2.5 are verified against.
- `docs/CONSOLE_THEMING.md`: Seed-driven console chrome theming — built, wired up, evaluated, then cut (roadmap Phase 11 marked cut). Records why (a structural tension between WCAG-safety-for-every-seed and visual variety, not a bug) and what replaced it (a hand-picked static palette in `src/index.css`).

Quick checklist for PRs
- [ ] No synths created in components
- [ ] No timelines or refs stored in Zustand or component state
- [ ] All scheduling is beat-based (BeatClock/Transport) with `MIN_LEAD` applied for audio
- [ ] Timelines are killed on unmount and registered in `timelineMap`
- [ ] State remains JSON-serialisable

Repo expectations
- **PR process:** All PRs should be reviewed by at least one other contributor before merging. There is no CI workflow configured yet — run lint, type-check, and tests locally before opening a PR.
- **Accessibility & performance:** For audio, avoid autoplay without user intent; provide UI mute/volume controls. For animations, prefer GSAP for performant transforms and avoid large layout thrashing. Add basic a11y checks to PRs (focus/keyboard navigation, reduced-motion preference).

Boundaries
- Never commit secrets or `.env` files.
- Ask before adding a new dependency or changing the audio/animation architecture described above.
- Don't relax an "Absolutely forbidden" or "Guardrails" rule to make a task easier — surface the conflict instead (see Authority and precedence).

Commands
```bash
npm install
npm run dev          # start Vite dev server
npm test             # run Vitest
npm run test:coverage
npm run lint         # ESLint
npm run build:types  # tsc --noEmit
npm run format       # Prettier write
```
