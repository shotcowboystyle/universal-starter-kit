/**
 * MPO-474: markdown code blocks paint the house syntax theme by default.
 * `Markdown` resolved "auto" to github-light / github-dark and `renderMarkdown`
 * defaulted to github-dark, whose inks measured 1.14 to 2.38:1 on the light
 * code surface.
 */

import { createDefaultThemeConfig } from '@repo/theme';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TamaguiProvider } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Markdown } from './Markdown';
import { parseMarkdown } from './parser';
import { renderMarkdown } from './renderer';
import * as rendererStories from './Renderer.stories';

afterEach(cleanup);

const houseConfig = createDefaultThemeConfig();
// Tamagui keeps a token's first 11 characters in its atomic class and hashes the rest.
const inkClass = (token: string) => new RegExp(`_col-${token.slice(0, 11)}`);
const fence = '```typescript\nconst greeting = 1;\n```';

function houseRender(ui: ReactElement, scheme: 'light' | 'dark' = 'light') {
  return render(
    <TamaguiProvider
      config={houseConfig.tamagui}
      defaultTheme={scheme}
      disableInjectCSS>
      {ui}
    </TamaguiProvider>,
  );
}

function tokenSpan(container: HTMLElement, text: string) {
  const matches = [...container.querySelectorAll('span')].filter((span) => span.textContent === text);
  return matches.find((span) => !matches.some((other) => other !== span && span.contains(other)));
}

async function keywordClass(container: HTMLElement) {
  await waitFor(
    () => {
      expect(tokenSpan(container, 'const')?.className).toMatch(/_col-/);
    },
    {
      timeout: 30_000,
    },
  );
  return tokenSpan(container, 'const')!.className;
}

describe('MPO-474: markdown code ink follows the theme', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: <Markdown> paints $syntaxPurple, not a GitHub hex`, async () => {
      const { container } = houseRender(<Markdown>{fence}</Markdown>, scheme);
      await expect(keywordClass(container)).resolves.toMatch(inkClass('syntaxPurple'));
    }, 35_000);
  }

  it("renderMarkdown's default code theme is the house theme, not github-dark", async () => {
    const { container } = houseRender(<>{renderMarkdown(parseMarkdown(fence))}</>);
    await expect(keywordClass(container)).resolves.toMatch(inkClass('syntaxPurple'));
  }, 35_000);

  it('the Renderer story shows the house theme by default', () => {
    const args = rendererStories.Main.args as { codeTheme?: string } | undefined;
    expect(args?.codeTheme).toBe('auto');
  });
});
