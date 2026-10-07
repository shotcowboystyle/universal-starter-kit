/**
 * LC-16 wrapper specs — the markdown package renders code blocks and inline
 * code through the canonical `@repo/ui` implementations
 * (census items #9 / #12); these tests pin the wrappers to that anatomy.
 * Doc tabs live in Tabs/MDXTabs.spec.tsx (MPO-177).
 */

import { renderWithProviders } from '@repo/test-utils';
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CodeBlock } from './CodeBlock';
import { InlineCode } from './InlineCode';

describe('markdown CodeBlock (canonical code family)', () => {
  it('renders code content inside a real <code> element', async () => {
    const { container } = renderWithProviders(<CodeBlock lang="typescript">const x = 1;</CodeBlock>);
    expect(container.querySelector('code')).toBeTruthy();
    expect(container.textContent).toContain('const x = 1;');
  });

  it('tokenizes through the shared shiki stack (colored tokens appear)', async () => {
    const { container } = renderWithProviders(<CodeBlock lang="typescript">const x = 1;</CodeBlock>);
    await waitFor(
      () => {
        const colored = [...container.querySelectorAll('span')].some((el) => el.style.color !== '');
        expect(colored).toBe(true);
      },
      { timeout: 30_000 },
    );
    expect(container.textContent).toContain('const x = 1;');
  }, 35_000);

  it('falls back to plain text for unknown languages', async () => {
    const { container } = renderWithProviders(<CodeBlock lang="not-a-real-language">plain fallback</CodeBlock>);
    await waitFor(() => {
      expect(container.textContent).toContain('plain fallback');
    });
  });
});

describe('markdown InlineCode (canonical CodeInline)', () => {
  it('renders a real <code> element with the content', () => {
    const { container } = renderWithProviders(<InlineCode>npm install</InlineCode>);
    const code = container.querySelector('code');
    expect(code).toBeTruthy();
    expect(code!.textContent).toBe('npm install');
  });
});
