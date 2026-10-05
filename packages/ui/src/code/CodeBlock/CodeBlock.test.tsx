import { renderWithProviders } from '@repo/test-utils';
import { MIN_PRESS_TARGET } from '@repo/theme';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Code } from '../Code';
import { Pre } from '../Pre';

import { CodeBlock } from './index';

vi.mock('../Highlighter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Highlighter')>();
  return {
    ...actual,
    useShikiTokens: (code: string) => code.split('\n').map((line) => [{ content: line }]),
  };
});

// Test the rendering components directly (Code + Pre) rather than the full
// CodeBlock which requires heavy dependencies (shiki, linear-gradient, etc.)
// that are difficult to mock in the test environment.
describe('CodeBlock rendering', () => {
  it('should render Pre + Code combination successfully', () => {
    const { container } = renderWithProviders(
      <Pre>
        <Code>const test = "hello";</Code>
      </Pre>,
    );
    const preElement = container.querySelector('pre');
    const codeElement = container.querySelector('code');
    expect(preElement).toBeDefined();
    expect(codeElement).toBeDefined();
    expect(container.textContent).toContain('const test = "hello"');
  });

  it('should render with language-specific class', () => {
    const { container } = renderWithProviders(
      <Pre>
        <Code className="language-typescript">const greeting: string = "hello"</Code>
      </Pre>,
    );
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
    expect(container.textContent).toContain('const greeting: string = "hello"');
  });

  it('should update content when changed', () => {
    const { container, rerender } = renderWithProviders(
      <Pre>
        <Code>const initial = "hello";</Code>
      </Pre>,
    );
    rerender(
      <Pre>
        <Code>const updated = "world";</Code>
      </Pre>,
    );
    expect(container.textContent).toContain('const updated = "world";');
  });

  it('should handle empty content', () => {
    const { container } = renderWithProviders(
      <Pre>
        <Code />
      </Pre>,
    );
    const preElement = container.querySelector('pre');
    expect(preElement).toBeDefined();
  });

  it('should handle whitespace and multiline code', () => {
    const { container } = renderWithProviders(
      <Pre>
        <Code>
          {`const test = true;
function greet() {
  return "hello";
}`}
        </Code>
      </Pre>,
    );
    expect(container.textContent).toContain('const test = true');
    expect(container.textContent).toContain('function greet()');
  });
});

describe('CodeBlock', () => {
  it('keeps the copy action reachable at the 44px press floor', () => {
    renderWithProviders(<CodeBlock>const x = 1;</CodeBlock>);
    const button = screen.getByLabelText('Copy to clipboard');
    expect(button).toBeTruthy();
    expect(button.getAttribute('data-press-min')).toBe(String(MIN_PRESS_TARGET));
    // Default knob: the glyph-ring end-cap square itself meets the floor
    // (44). Smaller size steps keep the floor by spilling hitSlop instead
    // (CodeBlock.copy.spec covers the 36/52 cap geometry).
    expect(Number(button.getAttribute('data-end-cap'))).toBeGreaterThanOrEqual(MIN_PRESS_TARGET);
    const style = getComputedStyle(button);
    expect(style.display).not.toBe('none');
  });

  it('hides the copy action only when disableCopy is set', () => {
    renderWithProviders(<CodeBlock disableCopy>const x = 1;</CodeBlock>);
    expect(screen.queryByLabelText('Copy to clipboard')).toBeNull();
  });
});
