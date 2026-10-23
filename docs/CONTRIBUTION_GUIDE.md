# Contribution Guide

**Related references:** see the root [CLAUDE.md](../CLAUDE.md) for architecture guardrails, commands, and PR process — this guide covers code-level conventions that support those rules.

## Import Ordering

Enforced by `eslint.config.js`'s `import/order` rule — three groups, in this order, with no required blank lines between them:

1. `builtin` (Node built-ins)
2. `external` (npm packages — React, GSAP, Tone, etc.)
3. `internal` / `parent` / `sibling` / `index` (project-relative imports)

Prefer `import type { Foo } from '...'` for type-only imports (used consistently across the engine, e.g. `AudioEngine.ts`), but this isn't lint-enforced.

## Logging & Error Handling

- **Gate debug logging with `DEV_TUNING`**, but do it through the shared `devLog()` / `devWarn()` helpers (`src/utils/helpers.ts`) rather than inlining `if (DEV_TUNING) console.log(...)` at each call site:

```ts
// ✅ Good
import { devLog } from '../utils/helpers';
devLog('[AudioEngine] voice reserved', robotId);

// ❌ Avoid — repeats the DEV_TUNING check inline at every call site
if (DEV_TUNING) console.log('[AudioEngine] voice reserved', robotId);
```

  `AudioEngine.ts`, `beatClock.ts`, and `harmonySystem.ts` all use these; prefer them over module-local reimplementations or raw gated `console.*` calls.
- **`swallow(err, ctx?)`** (`src/utils/helpers.ts`) is a legacy catch-block logger, largely superseded by `devWarn()`. Unlike `devLog`/`devWarn`, it does **not** check `DEV_TUNING` itself — it always logs, prefixed `[swallow] ...` rather than the calling module's own tag, so callers historically wrapped it in `if (DEV_TUNING) swallow(err, ctx)`. Prefer `devWarn('[ModuleName] ...', err)` in new code for a consistent per-module log prefix.
- Avoid empty `catch` blocks unless the ignore is intentional and commented.

## State: Store Structure

All app state lives in Zustand stores under `src/stores/`:

- `localeStore` — per-locale simulation state (robots, actors, companies, settings), keyed by locale ID.
- `attenuationStyleStore` — Attenuation-Style-level state (`currentLocaleId`, Attenuation Style list). Use `getActiveLocaleId()` from `utils/localeHelpers` in non-component modules; use a reactive `useAttenuationStyleStore` selector in components.
- `audioStore` — global audio settings (FX, BPM, etc.).
- `uiStore` — UI-only state (active view, `isPoweredOn`, `selectedRobotId`, etc.).
- `sessionStore` — transient session data.
- `settingsStore` — user-configurable settings.
- `notificationStore` — in-app notifications.

Only serializable data belongs in stores — no synths, timelines, or DOM refs (see CLAUDE.md's "Absolutely forbidden" list).

## Testing

Vitest + Testing Library. Tests are colocated with source (`beatClock.ts` → `beatClock.test.ts`).

**Focus tests on:** utility functions, core engine logic (BeatClock, harmony system), store actions, and algorithmic code (melody generation, collision detection). Skip exhaustive component/GSAP/Tone.js integration tests — those are covered manually.

```bash
npm test               # run once
npm run test:coverage  # coverage report
npm test -- --watch    # watch mode
npm test beatClock.test.ts   # single file
```

**Resetting module-scoped state:** engine modules like `beatClock` and `harmonySystem` use module-scoped variables that a plain `beforeEach` can't reset. Use `vi.resetModules()` + a dynamic `await import()` for a fresh module instance per test:

```typescript
let initBeatClock: () => void;
let getCurrentBeat: () => number;

beforeEach(async () => {
  vi.resetModules();
  ({ initBeatClock, getCurrentBeat } = await import('./beatClock'));
});
```

**Mocking:** keep mocks simple — mock the scheduling/cleanup surface (`Transport.scheduleRepeat`, `killTimeline`) rather than actual audio output or GSAP rendering:

```typescript
vi.mock('tone', () => ({ getTransport: () => mockTransport }));
vi.mock('../animation/timelineMap', () => ({ killTimeline: vi.fn() }));
```

## Commits & Branches

There's no enforced conventional-commit format in this repo — commit messages are short, imperative, descriptive sentences (e.g. `"Dedup active-locale robot lookups in AudioEngine"`). Branches are typically prefixed by category and merged via PR (e.g. `docs/audio`, `fix/timeline-leak`, `review/audio-engine`).

## Before Committing

- [ ] `npm run lint` passes
- [ ] `npm run build:types` passes
- [ ] `npm test` passes
- [ ] No architecture-guardrail violations (see CLAUDE.md checklist)
