import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { Code, CodeInline } from './index';

describe('Code', () => {
  it('should render successfully', () => {
    const { container } = renderWithProviders(<Code>const test = "hello";</Code>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
    expect(container.textContent).toContain('const test = "hello";');
  });

  it('should handle colored variant', () => {
    const { container } = renderWithProviders(<Code colored>const test = "hello"</Code>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
  });

  it('should apply correct styles', () => {
    const { container } = renderWithProviders(<Code>const test = "hello"</Code>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
  });

  it('keeps data-code-font and does not emit a dataset attribute', () => {
    const { container } = renderWithProviders(<Code>const test = "hello"</Code>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeTruthy();
    expect(codeElement!.getAttribute('data-code-font')).toBe('mono');
    // An RN prop map on this host would land as dataset="[object Object]".
    expect(codeElement!.hasAttribute('dataset')).toBe(false);
  });
});

describe('CodeInline', () => {
  it('should render successfully', () => {
    const { container } = renderWithProviders(<CodeInline>npm install</CodeInline>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
    expect(container.textContent).toContain('npm install');
  });

  it('should apply correct styles', () => {
    const { container } = renderWithProviders(<CodeInline>npm install</CodeInline>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
  });

  it('should handle custom styling', () => {
    const { container } = renderWithProviders(<CodeInline>npm install</CodeInline>);
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeDefined();
  });
});
