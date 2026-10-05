/**
 * Every shiki surface (CodeBlock, MDXCodeBlock, markdown CodeBlock,
 * CodeEditorField) tokenizes through useShikiTokens and paints through
 * HighlightedCode. By default the ink is a theme token in either scheme, so
 * Tamagui emits the token's class (`_col-syntaxPurpl…`), not a hex class
 * (`_col-D73A4935`) that no scheme or knob can reach.
 */

import { createDefaultThemeConfig } from '@repo/theme';
import { cleanup, render, waitFor } from '@testing-library/react';
import { TamaguiProvider } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { HighlightedCode } from './HighlightedCode';
import { useShikiTokens } from './Highlighter';

afterEach(cleanup);

const houseConfig = createDefaultThemeConfig();
// Tamagui keeps a token's first 11 characters in its atomic class and hashes the rest.
const inkClass = (token: string) => new RegExp(`_col-${token.slice(0, 11)}`);

function Probe({ code, language, theme }: { code: string; language: string; theme?: string }) {
  const tokens = useShikiTokens(code, language, theme);
  return <HighlightedCode tokens={tokens}>{code}</HighlightedCode>;
}

function tokenSpan(container: HTMLElement, text: string) {
  const matches = Array.from(container.querySelectorAll('span')).filter((span) => span.textContent === text);
  return matches.find((span) => !matches.some((other) => other !== span && span.contains(other)));
}

describe('shiki ink is a theme token in both schemes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: keyword, string and comment take the held tokens`, async () => {
      const { container } = render(
        <TamaguiProvider config={houseConfig.tamagui} defaultTheme={scheme} disableInjectCSS>
          <Probe code={'// note\nconst greeting = "hi";'} language="typescript" />
        </TamaguiProvider>,
      );
      await waitFor(
        () => {
          expect(tokenSpan(container, 'const')?.className).toMatch(inkClass('syntaxPurple'));
        },
        {
          timeout: 30000,
        },
      );
      expect(tokenSpan(container, '"hi"')?.className).toMatch(inkClass('syntaxGreen'));
      expect(tokenSpan(container, '// note')?.className).toMatch(inkClass('color11'));
    }, 35000);
  }
});
