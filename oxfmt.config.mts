import { defineConfig } from 'oxfmt';
import ultracite from 'ultracite/oxfmt';

import { baseIgnorePatterns } from './.config/oxc.ignore.mts';

export default defineConfig({
  arrowParens: 'always',
  bracketSameLine: true,
  bracketSpacing: true,
  embeddedLanguageFormatting: 'auto',
  endOfLine: 'lf',
  experimentalSortImports: {
    ignoreCase: true,
    newlinesBetween: true,
    order: 'asc',
    groups: [
      ['side_effect'],
      ['builtin'],
      ['value-external', 'type-external'],
      ['value-internal', 'type-internal'],
      ['value-parent', 'type-parent'],
      ['value-sibling', 'type-sibling'],
      ['value-index', 'type-index'],
    ],
  },
  experimentalSortPackageJson: {
    sortScripts: true,
  },
  extends: [ultracite],
  ignorePatterns: [
    // packages/db/src/_generated is formatted, not skipped: `gen:types` writes it unformatted.
    ...(ultracite.ignorePatterns ?? []).filter((pattern) => pattern !== '**/_generated'),
    ...(baseIgnorePatterns ?? []),
  ],
  semi: true,
  tabWidth: 2,
  jsxSingleQuote: false,
  quoteProps: 'as-needed',
  printWidth: 120,
  proseWrap: 'preserve',
  useTabs: false,
  singleQuote: true,
  singleAttributePerLine: true,
  trailingComma: 'all',
});
