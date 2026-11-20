import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCompileAndEvaluateMdx } from './use-compile-and-evaluate-mdx';
import { parseFrontmatter, useCompileMdx } from './use-compile-mdx';

const INVALID_MDX = '# Test\n\n<Unclosed';

describe(parseFrontmatter, () => {
  it('parses scalar values and strips the frontmatter block', () => {
    const source = "---\ntitle: 'Hello'\ncount: 3\ndraft: false\nempty: null\n---\nBody";

    expect(parseFrontmatter(source)).toStrictEqual({
      content: 'Body',
      data: { count: 3, draft: false, empty: null, title: 'Hello' },
    });
  });

  it('returns the source untouched without frontmatter', () => {
    expect(parseFrontmatter('Body')).toStrictEqual({ content: 'Body', data: {} });
  });
});

describe('useCompileMdx Hook', () => {
  it('should handle invalid MDX syntax gracefully', async () => {
    const { result } = renderHook(() => useCompileMdx(INVALID_MDX));
    await waitFor(() => {
      expect(result.current.code).toBeUndefined();
    });

    expect(result.current.frontmatter).toBeUndefined();
  });
});

describe('useCompileAndEvaluateMdx Hook', () => {
  it('should handle empty source gracefully', async () => {
    const { result } = renderHook(() => useCompileAndEvaluateMdx(''));
    await waitFor(() => {
      expect(result.current.code).toBeUndefined();
    });

    expect(result.current.Component).toBeUndefined();
    expect(result.current.frontmatter).toBeUndefined();
  });

  it('should return empty if MDX compilation fails', async () => {
    const { result } = renderHook(() => useCompileAndEvaluateMdx(INVALID_MDX));
    await waitFor(() => {
      expect(result.current.code).toBeUndefined();
    });

    expect(result.current.Component).toBeUndefined();
    expect(result.current.frontmatter).toBeUndefined();
  });

  it('compiles and evaluates valid MDX into a renderable component', async () => {
    const { result } = renderHook(() => useCompileAndEvaluateMdx('# Hello MDX'));
    await waitFor(() => {
      expect(result.current.Component).toBeDefined();
    });
    const { Component } = result.current;
    if (!Component) {
      throw new Error('expected an evaluated MDX component');
    }
    render(<Component />);

    expect(screen.getByRole('heading', { name: 'Hello MDX' })).toBeDefined();
  });
});
