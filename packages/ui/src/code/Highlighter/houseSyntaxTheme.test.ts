/**
 * The shiki stack paints theme tokens, not GitHub hex. github-light
 * measured 3.13 to 4.35:1 on the house code surfaces and github-dark's comment
 * 3.77:1, and neither palette follows the scheme or the knobs.
 */

import { bundledThemes } from 'shiki';
import { describe, expect, it } from 'vitest';

import { highlightCode, houseSyntaxTheme } from './index';

const houseInk = /^\$(color11|color12|syntax(Purple|Green|Blue|Orange|Red))$/;

const sample = `// Greets a user
export function greet(user: User, retries = 3): string {
  const label = \`Hello, \${user.name}\`;
  console.log(label, true, null);
  return label;
}`;

async function inkOf(code: string, language: string, content: string, theme?: string) {
  const lines = await highlightCode(code, language, theme);
  const token = lines.flat().find((candidate) => candidate.content.trim() === content);
  expect(token, `no token ${JSON.stringify(content)}`).toBeTruthy();
  return token!.color;
}

describe('the default highlighter theme paints the held syntax tokens', () => {
  it('every token of a TypeScript sample takes a house ink', { timeout: 30000 }, async () => {
    const lines = await highlightCode(sample, 'typescript');
    const inks = new Set(lines.flat().map((token) => token.color));
    expect(inks.size).toBeGreaterThan(4);
    for (const color of inks) {
      expect(color).toMatch(houseInk);
    }
  });

  it.each([
    ['// Greets a user', '$color11'],
    ['export', '$syntaxPurple'],
    ['function', '$syntaxPurple'],
    ['greet', '$syntaxBlue'],
    ['User', '$syntaxBlue'],
    ['3', '$syntaxBlue'],
    ['true', '$syntaxBlue'],
    ['string', '$syntaxOrange'],
    ['retries', '$syntaxOrange'],
    ['`Hello, ${', '$syntaxGreen'],
  ])('%s paints %s', { timeout: 30000 }, async (content, ink) => {
    expect(await inkOf(sample, 'typescript', content)).toBe(ink);
  });

  it('diff lines paint the red and green the washes are held for', { timeout: 30000 }, async () => {
    const diff = '- const retries = 1;\n+ const retries = 3;';
    expect(await inkOf(diff, 'diff', '- const retries = 1;')).toBe('$syntaxRed');
    expect(await inkOf(diff, 'diff', '+ const retries = 3;')).toBe('$syntaxGreen');
  });

  it("markup tags paint green like the editor's", { timeout: 30000 }, async () => {
    expect(await inkOf('<a href="/x">hi</a>', 'html', 'a')).toBe('$syntaxGreen');
  });

  it('an explicit theme still ejects to its literal palette', { timeout: 30000 }, async () => {
    expect((await inkOf(sample, 'typescript', 'export', 'github-light'))?.toLowerCase()).toBe('#d73a49');
  });

  it("keeps github-light's scope rules one for one, painted only in house ink", async () => {
    const githubLight = (await bundledThemes['github-light']()).default;
    const scopesOf = (settings: { scope?: string | string[] }[]) =>
      settings.map((setting) => [setting.scope ?? []].flat().join(',')).filter(Boolean);
    expect(scopesOf(houseSyntaxTheme.settings)).toEqual(
      scopesOf(githubLight.tokenColors ?? githubLight.settings ?? []),
    );
    for (const setting of houseSyntaxTheme.settings) {
      if (setting.settings.foreground) {
        expect(setting.settings.foreground).toMatch(houseInk);
      }
    }
  });
});
