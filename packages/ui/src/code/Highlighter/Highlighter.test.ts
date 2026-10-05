/**
 * Canonical shiki stack — the single highlighter
 * every code surface consumes (components code family, markdown CodeBlock).
 * Uses the pure-JS regex engine so tokens also resolve on native/Expo Go.
 */

import { describe, expect, it } from 'vitest';

import { highlightCode } from './index';

const joined = (lines: { content: string }[][]) =>
  lines.map((line) => line.map((token) => token.content).join('')).join('\n');

describe('highlightCode (canonical shiki stack)', () => {
  it('returns colored tokens for a known language', { timeout: 30000 }, async () => {
    const lines = await highlightCode('const x = 1;', 'typescript');
    expect(lines).toHaveLength(1);
    // Real syntax highlighting: more than one token, at least one colored.
    expect(lines[0].length).toBeGreaterThan(1);
    expect(lines[0].some((token) => token.color)).toBe(true);
    expect(joined(lines)).toBe('const x = 1;');
  });

  it('preserves content across lines', { timeout: 30000 }, async () => {
    const code = 'function greet() {\n  return "hello";\n}';
    const lines = await highlightCode(code, 'javascript');
    expect(lines).toHaveLength(3);
    expect(joined(lines)).toBe(code);
  });

  it('falls back to plain text for unknown languages', { timeout: 30000 }, async () => {
    const code = 'just some words';
    const lines = await highlightCode(code, 'not-a-real-language');
    expect(joined(lines)).toBe(code);
  });
});
