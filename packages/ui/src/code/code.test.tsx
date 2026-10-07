import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import { Code, CodeInline } from './Code/index';

describe('Code Component', () => {
  it('should render successfully', () => {
    const { container } = renderWithProviders(<Code>const x = 10</Code>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
    expect(container.textContent).toContain('const x = 10');
  });

  it('should apply default styles', () => {
    const { container } = renderWithProviders(<Code>const x = 10</Code>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
  });

  it('should render inline code properly', () => {
    const { container } = renderWithProviders(<CodeInline>inline code</CodeInline>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
    expect(container.textContent).toContain('inline code');
  });

  it('should allow custom props', () => {
    const { container } = renderWithProviders(<Code style={{ fontSize: '20px' }}>custom size</Code>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
  });

  it('stays mono with zero tracking under bodyFont/fontWeight knobs', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ bodyFont: 'serif', headingFont: 'serif', fontWeight: 'bold' }}>
        <Code>const x = 10</Code>
        <CodeInline>inline</CodeInline>
      </Preset>,
    );
    const nodes = [...container.querySelectorAll('code')];
    expect(nodes).toHaveLength(2);
    expect(container.textContent).toContain('const x = 10');
    expect(container.textContent).toContain('inline');
    // Tamagui compiles letterSpacing/fontFamily to atomic classes; happy-dom
    // computed style is often "". The pin is the class contract + no throw.
    for (const node of nodes) {
      expect(node.dataset.codeFont).toBe('mono');
    }
  });
});

describe('code barrel', () => {
  it('exports the code family as named exports', async () => {
    const CodeExports = await import('./index');
    for (const name of ['Code', 'CodeInline', 'CodeBlock', 'HighlightedCode', 'Pre', 'highlightCode']) {
      expect(CodeExports).toHaveProperty(name);
    }
  });
});
