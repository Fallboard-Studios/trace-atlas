# Implementation Plan: [Phase Name]

Source spec: [docs/specs/[PHASE_NAME].md](../specs/[PHASE_NAME].md). Source intent: [docs/intent/[phase-slug].md](../intent/[phase-slug].md). [Roadmap slot, if any: docs/todo/roadmap.md § [N].]

## Overview

[One paragraph: what's being built, the key modules/files involved, and how the task list below is broken into phases/groups — e.g. "N independent foundation pieces, M pieces of core wiring that depend on the foundations, one integration task, and docs last."]

## Architecture Decisions

- **[Decision, tied to a spec open question if one exists — e.g. "Resolves spec §7 open question 1: ..."]** [The decision itself, and why — cite existing code/precedent being reused rather than inventing something new where possible.]
- [Repeat per decision. Include task-ordering/dependency rationale here too if it isn't obvious from the Dependency Graph alone — e.g. "Task 3 depends on Task 1 and Task 2 because ...".]

## Dependency Graph

```
Task 1 (...)          Task 2 (...)
        │                     │
        └──────────┬──────────┘
                    │
         Task 3 (... — needs 1 + 2)
                    │
         Task 4 (docs)
```

## Task List

[Every task names its **Proof**, decided here so the build never has to: **RED test** for a task that changes behaviour (a test that imports or renders the code and fails first); **Look** for a CSS-only or visual task (what to see in the browser); **Read** for a docs-only, copy-only or deletion task (a human review). Only a RED-test task lists a `*.test.ts` in its Files. If the only way to make a test fail first is to read a file's text, the proof is a Look or a Read (CLAUDE.md, "Tests exercise code, not text"; `npm run lint` rejects such a test). Plans written before 2026-10-23 list docs guards and source scans as steps; don't copy them.]

### Phase 1: [Foundation/group name]

- [ ] **Task 1: [File/module — short description]**

  **Description:** [What this task builds or changes, naming the exact file(s), and how it fits the Architecture Decisions above. Note whether it has a real caller yet or ships as independently testable new code.]

  **Proof:** RED test — `src/[path/File.test.ts]`: [the behaviour the test checks, which fails before the change].

  **Acceptance criteria:**
  - [ ] [A specific, testable behavior — phrased as "X does Y", not "X should do Y".]
  - [ ] [Cover the happy path, at least one edge case, and any explicit no-op/miss contract.]
  - [ ] [If this task is a refactor of existing behavior, an explicit criterion that pre-existing tests still pass unmodified, proving behavior parity.]

  **Verification:**
  - [ ] `npx vitest run [path/to/File.test.ts]` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None. / Task [N].

  **Files:** `src/[path/File.ts]`, `src/[path/File.test.ts]`

  **Estimated scope:** XS / S / M / L ([one-line justification — file count and nature of the change])

### Checkpoint: [Phase 1 name]
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] [What this checkpoint proves is true so far, stated concretely.]
- [ ] Reviewed with human before proceeding to Phase 2.

---

### Phase 2: [Core wiring / next group name]

- [ ] **Task 2: [File/module — short description]**

  **Description:** [...]

  **Proof:** RED test — `src/[path/File.test.ts]`: [...].

  **Acceptance criteria:**
  - [ ] [...]

  **Verification:**
  - [ ] `npx vitest run [path]` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] [Manual check (live browser), only if the change is visual/interactive and can't be fully proven by automated tests — state exactly what to click and what to look for.]

  **Dependencies:** Task 1.

  **Files:** `src/[path]`

  **Estimated scope:** [XS / S / M / L]

- [ ] **Task [M]: [stylesheet or markup] — [the visual change] (the CSS-only / visual task shape)**

  **Description:** [What changes on screen, naming the exact stylesheet or markup. If the task also changes behaviour (a handler, a store write, a computed value), that part is a RED-test task; split it out when the two can land apart.]

  **Proof:** Look — [the world, view and state to open, and what to see there; phone width and desktop where it matters].

  **Acceptance criteria:**
  - [ ] [What the look shows, stated concretely — e.g. "the three Output sub-tabs sit on one row at 360 px".]

  **Verification:**
  - [ ] The Look above, done in a live browser and recorded in the commit, or flagged at the checkpoint if not done this session. No test file: the test environment loads no stylesheet, so a test could only read the CSS text.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** [Task numbers, or None.]

  **Files:** `src/[path/File.css]` (no `*.test.ts`)

  **Estimated scope:** XS / S

### Checkpoint: [Phase 2 name]
- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean (full suite — note any pre-existing, unrelated failures explicitly so new failures are distinguishable).
- [ ] `npm run build` clean (production bundle) — required at the last integration checkpoint before docs, not necessarily every checkpoint.
- [ ] Reviewed with human before proceeding.

---

### Phase [N]: Docs

- [ ] **Task [N]: [doc file] — document the shipped behavior**

  **Description:** [What section(s) to add/update, and the instruction to spot-check every named identifier against the final shipped source rather than the plan.]

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] [Named APIs/behaviors documented exactly matching shipped source.]

  **Verification:**
  - [ ] Manual review — every documented name/behavior spot-checked directly against the final shipped code.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** [All prior tasks.]

  **Files:** `docs/[DOC].md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across all tasks are met.
- [ ] Docs reflect the shipped API — every documented name spot-checked against source.
- [ ] Any outstanding manual/live-browser checks explicitly flagged here if not performed in this session — never silently skipped.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| [A concrete failure mode — a footgun in the chosen approach, a subtle behavior change, a scoping assumption that could be violated later] | High / Medium / Low | [What in the task list above (an acceptance criterion, a checkpoint) catches this, or why it's structurally prevented rather than just tested around] |

## Open Questions

[Carry forward any spec open questions here, resolved or still open:]

1. [Question.] **Resolved** (Architecture Decisions above): [answer]. / **Open** — [what's blocking a decision, and who needs to make it].
