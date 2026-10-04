# Active Skills Manifest
These engineering workflows are provided by globally-installed skills, not files in this repo. Ingest and execute them as system-level execution rules before modifying any code:
- SPEC_DRIVEN_DEVELOPMENT // skill: spec-driven-development
- TEST_DRIVEN_DEVELOPMENT // skill: test-driven-development
- CODE_QUALITY_REVIEW    // skill: code-review-and-quality

# Trace Atlas — Concise Copilot Instructions

Purpose: a compact operating guide for agents and contributors. This file captures the repository’s non-negotiable architecture constraints and the default workflow expectations. Implementation details and examples live in the linked docs; keep this file concise and action-oriented.

Authority and precedence
- Local skill workflows in ./.github/skills/ are mandatory execution rules.
- Repository-specific conventions in this file apply when they do not conflict with a higher-priority skill workflow.
- If a repo rule and a skill workflow conflict, follow the skill workflow and document the exception in the task plan.

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
- Visual Mapping: "Robot visuals (shape/color) must map strictly to audio attributes (synth/ADSR/phase/detune) as defined in ROBOT_DESIGN.md — with one documented non-audio identity layer: `Robot.identityColor` on the window glass and lamp only (ROBOT_DESIGN.md 'Identity layer'), the same class of exception as the day/night and battery brightness overlays."
- Strict Separation: "GSAP timelines must only trigger semantic state changes, never call AudioEngine directly."
- UI Shell: "All interactive UI (transport, navigation, controls) lives inside GlassViewport only — never in the decorative SleeveContainer."

Reference docs (read these)
- Animation patterns: docs/ANIMATION_SYSTEM.md
- Audio architecture & scheduling: docs/AUDIO_SYSTEM.md
- Beat clock & scheduling: docs/BEAT_CLOCK.md
- Melody & harmony rules: docs/MELODY_SYSTEM.md, docs/HARMONY_SYSTEM.md
- Polyphony & voice management: docs/POLYPHONY_GUIDE.md
- Factory & placement: docs/BUILDING_DESIGN.md

Quick checklist for PRs
- [ ] No synths created in components
- [ ] No timelines or refs stored in Zustand or component state
- [ ] All scheduling is beat-based (BeatClock/Transport) with `MIN_LEAD` applied for audio
- [ ] Timelines are killed on unmount and registered in `timelineMap`
- [ ] State remains JSON-serialisable

Recommended repo expectations
- **CI:** Ensure continuous integration is set up for automated testing and linting.
- **Lint:** Use ESLint with the recommended configuration for code quality.
- **Testing:** Write unit and integration tests for all components and utilities.
- **TS rules:** Follow TypeScript best practices and ensure type safety across the codebase.
- **PR process:** All PRs should be reviewed by at least one other contributor before merging.
- **Examples:** Provide clear examples in the documentation for common use cases.
- **Accessibility & performance:** For audio, avoid autoplay without user intent; provide UI mute/volume controls. For animations, prefer GSAP for performant transforms and avoid large layout thrashing. Add basic a11y checks to PRs (focus/keyboard navigation, reduced-motion preference).

Minimal commands
```bash
npm install
npm run dev
npm test
```

See also (short pointers)
- `docs/AUDIO_SYSTEM.md`: AudioEngine architecture, MIN_LEAD, polyphony rules, and scheduling examples.
- `docs/BEAT_CLOCK.md`: How to initialize and use the BeatClock/Transport for measure-based scheduling.
- `docs/MELODY_SYSTEM.md`: Melody generation rules and step/registry semantics for robot melodies.
- `docs/HARMONY_SYSTEM.md`: Harmony progression rules and chord selection used by the systems.
- `docs/POLYPHONY_GUIDE.md`: Voice management, polyphony budget, and voice-stealing policies.
- `docs/ANIMATION_SYSTEM.md`: GSAP timeline patterns, `timelineMap` lifecycle, and ref registry usage.
- `docs/BUILDING_DESIGN.md`: Factory and placement rules, production cooldowns, and placement algorithms.
- `docs/ROBOT_DESIGN.md`: Robot visual design, audio→visual attribute mapping (synth/ADSR/phase/detune), and SVG generation rules.
- `docs/CONTRIBUTION_GUIDE.md`: PR process, testing expectations, and where to record exceptions.
- `docs/poc_guides/UI_GUIDES/UI_ISSUE_OVERVIEW.md`: Sleeve & Glass UI architecture, store responsibilities, and milestone issue breakdown.
