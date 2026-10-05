/**
 * HighlightedCode contract specs — the token renderer under CodeBlock /
 * MDXCodeBlock. Locks down: plain-children fallback while tokens load,
 * token color/style mapping (shiki fontStyle bitmask → italic/bold),
 * optional line numbers, and highlight-line marking.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import { HighlightedCode } from './HighlightedCode';
import type { HighlightLine } from './Highlighter';

const tokens: HighlightLine[] = [
  [
    { content: 'const', color: '#ff0000', fontStyle: 2 },
    { content: ' x = 1;', color: '#00ff00' },
  ],
  [{ content: 'return x;', color: '#0000ff', fontStyle: 1 }],
];

describe('HighlightedCode', () => {
  it('renders the raw children as fallback while tokens are loading', () => {
    const { container } = renderWithProviders(<HighlightedCode tokens={null}>plain fallback</HighlightedCode>);
    expect(container.textContent).toContain('plain fallback');
  });

  it('renders every token line once tokens arrive (children replaced)', () => {
    const { container } = renderWithProviders(
      <HighlightedCode tokens={tokens}>fallback should vanish</HighlightedCode>,
    );
    expect(container.textContent).toContain('const x = 1;');
    expect(container.textContent).toContain('return x;');
    expect(container.textContent).not.toContain('fallback should vanish');
  });

  it('styles bold/italic tokens differently from plain tokens (fontStyle bitmask applied)', () => {
    // Tamagui compiles style props to atomic classes, so the observable
    // contract is: tokens with a fontStyle bit render with different styling
    // than plain tokens of the same line.
    const { container } = renderWithProviders(
      <HighlightedCode
        tokens={[
          [
            { content: 'boldtok', color: '#ff0000', fontStyle: 2 },
            { content: 'plaintok', color: '#ff0000' },
            { content: 'italictok', color: '#ff0000', fontStyle: 1 },
          ],
        ]}
      />,
    );
    const spans = Array.from(container.querySelectorAll('span'));
    const bold = spans.find((el) => el.textContent === 'boldtok');
    const plain = spans.find((el) => el.textContent === 'plaintok');
    const italic = spans.find((el) => el.textContent === 'italictok');
    expect(bold).toBeTruthy();
    expect(plain).toBeTruthy();
    expect(italic).toBeTruthy();
    expect(bold!.className).not.toBe(plain!.className);
    expect(italic!.className).not.toBe(plain!.className);
    expect(bold!.className).not.toBe(italic!.className);
  });

  it('shows 1-based line numbers only when asked', () => {
    const withNumbers = renderWithProviders(<HighlightedCode tokens={tokens} showLineNumbers />);
    expect(withNumbers.container.textContent).toContain('1');
    expect(withNumbers.container.textContent).toContain('2');

    const withoutNumbers = renderWithProviders(<HighlightedCode tokens={[[{ content: 'x' }]]} />);
    expect(withoutNumbers.container.textContent).not.toContain('1');
  });

  it('styles requested highlight lines differently from plain lines', () => {
    const twin: HighlightLine[] = [[{ content: 'line one' }], [{ content: 'line two' }]];
    const { container } = renderWithProviders(<HighlightedCode tokens={twin} highlightLines={[2]} />);

    // The line wrapper span carries the token content plus the trailing
    // newline. Theme wrappers (display: contents) share the same text, so
    // take the DEEPEST matching span — the styled line element itself.
    function lineWrapper(text: string): HTMLElement {
      const matches = Array.from(container.querySelectorAll('span')).filter((el) => el.textContent === `${text}\n`);
      const deepest = matches.filter((el) => !matches.some((other) => other !== el && el.contains(other)));
      expect(deepest).toHaveLength(1);
      return deepest[0] as HTMLElement;
    }

    // Same token shape, only line 2 highlighted → wrappers must differ in styling.
    expect(lineWrapper('line one').className).not.toBe(lineWrapper('line two').className);
  });

  it('scales the line-number gutter with the size knob', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ size: 'large' }}>
        <HighlightedCode tokens={tokens} showLineNumbers />
      </Preset>,
    );
    const gutter = container.querySelector('[data-line-number]') as HTMLElement | null;
    expect(gutter).toBeTruthy();
    expect(gutter?.textContent).toMatch(/1/);
    const width = Number.parseFloat(getComputedStyle(gutter!).width);
    expect(width).toBeGreaterThanOrEqual(40);
  });

  it('keeps mono tracking when font knobs change', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ bodyFont: 'serif', fontWeight: 'bold' }}>
        <HighlightedCode tokens={tokens} />
      </Preset>,
    );
    // querySelector("span") used to land on renderWithProviders' Theme
    // wrapper (`t_light _dsp_contents`), never the code line, so this guard
    // asserted null and had been red on main. Select the line itself.
    const line = container.querySelector('[data-code-font]') as HTMLElement | null;
    expect(line).toBeTruthy();
    expect(container.textContent).toContain('const');
    expect(line!.getAttribute('data-code-font')).toBe('mono');
    // The actual pin: bodyFont serif / fontWeight bold must not reach
    // code text, so the line keeps the mono family class.
    expect(line!.className).toContain('font_mono');
    // React does not recognise the RN prop map; leaving it on the line logged
    // an unknown-prop error and wrote dataset="[object Object]" on every node.
    expect(container.querySelectorAll('[dataset]')).toHaveLength(0);
  });
});
