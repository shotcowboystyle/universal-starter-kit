import { defineConfig } from 'oxlint';
import antiSlop from 'ultracite/oxlint/anti-slop';
import core from 'ultracite/oxlint/core';
import { jsPluginSettings, selectJsPlugins } from 'ultracite/oxlint/js-plugins';
import nestjs from 'ultracite/oxlint/nestjs';
import next from 'ultracite/oxlint/next';
import nextJsPlugins from 'ultracite/oxlint/next/js-plugins';
import react from 'ultracite/oxlint/react';
import tanstack from 'ultracite/oxlint/tanstack';
import tanstackJsPlugins from 'ultracite/oxlint/tanstack/js-plugins';
import vitest from 'ultracite/oxlint/vitest';

import { baseIgnorePatterns } from './.config/oxc.ignore.mts';

const jsPlugins = selectJsPlugins(['github', 'react-doctor', 'sonarjs']);

const TEST_FILES = [
  '**/*.{test,spec}.{ts,tsx}',
  '**/__tests__/**',
  '**/e2e/**',
  '**/*.stories.{ts,tsx}',
  '**/vitest.setup.ts',
  'packages/test-utils/**',
];

// The vitest preset sets its rules inside a test-file override, which outranks this file's
// own overrides, so vitest rule changes are patched into the preset itself.
const vitestPreset = {
  ...vitest,
  overrides: vitest.overrides?.map((override) => ({
    ...override,
    rules: {
      ...override.rules,
      // Contract-style tests assert many facets of one render; splitting them adds setup noise.
      'vitest/max-expects': 'off',
      // `toBe(true)` -> `toBeTruthy()` weakens the assertion.
      'vitest/prefer-to-be-falsy': 'off',
      'vitest/prefer-to-be-truthy': 'off',
    },
  })),
} satisfies typeof vitest;

export default defineConfig({
  extends: [core, vitestPreset, nestjs, react, tanstack, next, nextJsPlugins, tanstackJsPlugins, antiSlop, jsPlugins],
  ignorePatterns: [...(core.ignorePatterns ?? []), ...(baseIgnorePatterns ?? [])],
  jsPlugins: jsPlugins.jsPlugins,
  options: {
    reportUnusedDisableDirectives: 'error',
    respectEslintDisableDirectives: true,
    typeAware: true,
    typeCheck: true,
  },
  settings: jsPluginSettings,
  rules: {
    // Keeps the `x == null` idiom; the `=== null` autofix silently drops the undefined check.
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'no-eq-null': 'off',
    // Named function expressions are deliberate: forwardRef/memo display names, stack traces,
    // and `new`-able mocks. The autofix strips the name, so only anonymous callbacks are flagged.
    'prefer-arrow-callback': ['error', { allowNamedFunctions: true }],
    // Duplicates unicorn/filename-case, and its regex rejects NestJS names like `users.repository.test.ts`.
    'github/filenames-match-regex': 'off',
    'unicorn/filename-case': ['error', { case: 'kebabCase' }],
    // Never autofix this rule: `||` -> `??` changes behavior for '', 0 and false.
    // Mixed `&&`/`||` chains are skipped because the rewrite produces invalid syntax.
    'typescript/prefer-nullish-coalescing': ['error', { ignoreMixedLogicalExpressions: true }],
    // `undefined` and `false` mean the same thing for optional boolean flags.
    'typescript/strict-boolean-expressions': ['error', { allowNullableBoolean: true }],
  },
  overrides: [
    {
      // React components are PascalCase. Lint can't tell a component from a .tsx helper,
      // so .tsx files (and .ts tests/stories of components) may be either case.
      files: ['**/*.tsx', '**/*.{test,spec,stories}.ts'],
      rules: { 'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }] },
    },
    {
      // Next.js App Router special files are kebab-case: page, layout, not-found, global-error, route.
      files: ['apps/web/src/app/**'],
      rules: { 'unicorn/filename-case': ['error', { case: 'kebabCase' }] },
    },
    {
      // Expo Router filenames: _layout, +not-found, [taskId], (group).
      files: ['apps/mobile/app/**'],
      rules: { 'unicorn/filename-case': 'off' },
    },
    {
      // NestJS idioms: constructor-injected `private readonly` deps, decorator-only @Module
      // classes, and handler/pipe methods that implement framework interfaces (can't be static).
      files: ['apps/api/**'],
      rules: {
        'eslint/class-methods-use-this': 'off',
        'typescript/no-extraneous-class': ['error', { allowWithDecorator: true }],
        'typescript/parameter-properties': 'off',
      },
    },
    {
      // Expo / React Native app: Next.js- and SSR-specific react-doctor rules don't apply.
      files: ['apps/mobile/**'],
      rules: {
        'react-doctor/nextjs-error-boundary-missing-use-client': 'off',
        'react-doctor/nextjs-no-client-side-redirect': 'off',
        'react-doctor/rendering-hydration-no-flicker': 'off',
      },
    },
    {
      // Tests mock modules and poke at loosely typed fixtures; type-escape rules stay on in source.
      files: TEST_FILES,
      rules: {
        'anti-slop/no-chained-type-assertions': 'off',
        'anti-slop/no-module-mocking': 'off',
        'anti-slop/require-safety-comment-for-type-assertion': 'off',
        'typescript/no-explicit-any': 'off',
        'typescript/no-non-null-assertion': 'off',
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/no-unsafe-type-assertion': 'off',
        // Spies and Storybook `action()` handlers are passed where void callbacks are expected.
        'typescript/strict-void-return': 'off',
      },
    },
  ],
});
