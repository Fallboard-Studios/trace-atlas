import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// The theme and aspect sketch's harness (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T10): the suite's config with the
// harness alone as its include, run by `npm run sketch:bands`. `npm test` reads vitest.config.ts, whose include never
// matches a *.harness.ts, so the harness never runs with the suite. It measures; it asserts nothing.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['scripts/sketch/**/*.harness.ts'],
    // Fourteen themes, each with 300 worlds of 12 robots and 300 styles, and every option dealt under each theme.
    testTimeout: 60 * 60 * 1000,
  },
});
