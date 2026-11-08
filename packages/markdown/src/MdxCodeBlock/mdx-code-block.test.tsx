import { renderWithProviders } from '@repo/test-utils';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { MDXCodeBlock } from './index';

describe(MDXCodeBlock, () => {
  it('should render code content', () => {
    const codeContent = <span className="token keyword">const</span>;

    const { container } = renderWithProviders(<MDXCodeBlock>{codeContent}</MDXCodeBlock>);

    expect(container.textContent).toContain('const');
  });

  it('should handle collapsible code blocks', () => {
    const codeContent = <span>Test code</span>;

    const { getByText, queryByText } = renderWithProviders(<MDXCodeBlock isCollapsible>{codeContent}</MDXCodeBlock>);

    const toggleButton = getByText('Show code');
    expect(toggleButton).toBeDefined();
    expect(queryByText('Test code')).toBeNull();
  });

  it('should show line numbers for long code blocks', () => {
    const longCode = Array.from({ length: 15 }, (_, i) => <span key={i}>{`Line ${i + 1}\n`}</span>);

    const { container } = renderWithProviders(<MDXCodeBlock>{longCode}</MDXCodeBlock>);

    const pre = container.querySelector('pre');
    expect(pre).toBeDefined();
    expect(pre?.dataset.lineNumbers).toBe('true');
  });

  it('should not show line numbers for short code blocks', () => {
    const shortCode = Array.from({ length: 5 }, (_, i) => <span key={i}>{`Line ${i + 1}\n`}</span>);

    const { container } = renderWithProviders(<MDXCodeBlock>{shortCode}</MDXCodeBlock>);

    const pre = container.querySelector('pre');
    expect(pre).toBeDefined();
    expect(pre?.dataset.lineNumbers).toBe('false');
  });

  it('should handle copy functionality when not disabled', () => {
    const codeContent = <span>Copy this code</span>;

    const { container } = renderWithProviders(<MDXCodeBlock>{codeContent}</MDXCodeBlock>);

    const copyButton = container.querySelector('[aria-label="Copy code to clipboard"]');
    expect(copyButton).toBeDefined();
  });

  it('should not show copy button when disabled', () => {
    const codeContent = <span>Cannot copy this</span>;

    const { container } = renderWithProviders(<MDXCodeBlock disableCopy>{codeContent}</MDXCodeBlock>);

    const copyButton = container.querySelector('[aria-label="Copy code to clipboard"]');
    expect(copyButton).toBeNull();
  });
});
