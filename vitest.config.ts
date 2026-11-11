import { fileURLToPath, URL } from 'node:url';
import { defaultExclude, defineConfig } from 'vitest/config';

// The folders whose tests never touch the DOM (checked 2026-11-07, docs/tasks/TEST_SUITE_RUN_TIME.md Task 2). They
// run in the Node environment and skip the jsdom boot every other file pays. A file in a mixed folder joins them with a
// `// @vitest-environment node` docblock (Task 3); a file inside these folders that does need the DOM opts back out
// with `// @vitest-environment jsdom` (src/engine/audioContextSetup.test.ts). `include` lives on the projects, not the
// root: with `extends: true` the arrays would be concatenated, and the node project would collect every file.
const NODE_GLOBS = [
  'src/data/**/*.{test,spec}.{ts,tsx}',
  'src/constants/**/*.{test,spec}.{ts,tsx}',
  'src/types/**/*.{test,spec}.{ts,tsx}',
  'src/content/**/*.{test,spec}.{ts,tsx}',
  'src/testUtils/**/*.{test,spec}.{ts,tsx}',
  'src/engine/**/*.{test,spec}.{ts,tsx}',
  'scripts/**/*.{test,spec}.mjs',
];

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    setupFiles: 'vitest.setup.ts',
    // Eight workers, not one per core (backlog 66, 2026-11-10). At sixteen the heaviest files all load at once and
    // the main process, which serves every worker's transforms, falls more than a minute behind answering one
    // worker's progress report; Vitest reports that as an unhandled "Timeout calling onTaskUpdate" and exits 1 with
    // every test passing. Measured on an idle 16-core machine: 16 and 12 workers error on every run, 10 ran clean
    // once, 8 ran clean twice; the cost is about 20 s on a 3.5-minute run. Eight keeps two workers of margin for a
    // busy machine.
    maxWorkers: 8,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: NODE_GLOBS,
          exclude: [...defaultExclude],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          exclude: [...defaultExclude, ...NODE_GLOBS],
        },
      },
    ],
  },
});
