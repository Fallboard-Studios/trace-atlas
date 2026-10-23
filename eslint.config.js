import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  // Ignore build output and miscellaneous standalone scripts
  { ignores: ['dist', 'docs/sketches/tools/*.cjs'] },

  // Base recommended configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Standalone Node scripts (scripts/perf/) — Node globals (console, process, fetch, WebSocket), not the browser's.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, WebSocket: 'readonly' },
    },
  },

  // React-specific rules
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'import': importPlugin,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // React Hooks rules
      ...reactHooks.configs.recommended.rules,

      // React Refresh rules
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // TypeScript rules (from Phase 0)
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],

      // Import ordering (from Phase 0)
      'import/order': ['error', {
        'groups': [
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling', 'index']
        ],
        'newlines-between': 'ignore',
      }],

      // Console rules (from Phase 0)
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
    },
  },

  // Content layer guard (docs/specs/CONTENT_LAYER.md §1.7): user-facing text lives in src/content,
  // never as a literal in a component or data config. Tests and src/content itself are exempt.
  // A legitimate punctuation-only text node (e.g. an em dash between two content reads) is written
  // as `{' — '}`, never exempted from the rule.
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/data/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name=/^(loreLabel|humanLabel|label|placeholder|unit|loreDescription|humanDescription)$/] > :matches(Literal, TemplateLiteral)",
          message: 'User-facing text belongs in src/content — spread labels()/options() from a content key instead (docs/CONTENT_LAYER.md).',
        },
        {
          selector: 'JSXText[value=/[A-Za-z]{3,}/]',
          message: 'User-facing text belongs in src/content — read CONTENT[key] or fill(key, vars) instead (docs/CONTENT_LAYER.md).',
        },
        {
          selector: "JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] > Literal",
          message: 'User-facing text belongs in src/content — read CONTENT[key].human instead (docs/CONTENT_LAYER.md).',
        },
      ],
    },
  },

  // Tests exercise code, not text (CLAUDE.md, Repo expectations): a test imports or renders what it checks and never
  // reads a source, CSS or doc file to assert on it. Each way a test can get a file's text is an error here: node:fs,
  // a ?raw or ?inline import, and import.meta.glob with a raw query. The exceptions are named here, never suppressed
  // inline: content.test.ts is the one text guard, and OceanScene.clicks applies the real stylesheet to the document
  // so it can check the rendered pointer-events, not the CSS text.
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.mjs'],
    ignores: ['src/content/content.test.ts', 'src/components/panels/screen/worldView/OceanScene.clicks.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: ':matches(ImportDeclaration, ImportExpression)[source.value=/^(node:)?fs(\\W|$)/]',
          message: 'Tests exercise code, not text: import or render what you check instead of reading a file (CLAUDE.md).',
        },
        {
          selector: "CallExpression[callee.name='require'][arguments.0.value=/^(node:)?fs(\\W|$)/]",
          message: 'Tests exercise code, not text: import or render what you check instead of reading a file (CLAUDE.md).',
        },
        {
          selector: ':matches(ImportDeclaration, ImportExpression)[source.value=/[?&](raw|inline)\\b/]',
          message: 'Tests exercise code, not text: import the module, not its source text (CLAUDE.md).',
        },
        {
          selector: 'Property[key.name=/^(query|as)$/][value.value=/raw|inline/]',
          message: 'Tests exercise code, not text: import.meta.glob the modules, not their source text (CLAUDE.md).',
        },
      ],
    },
  },
];