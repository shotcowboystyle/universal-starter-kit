import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCompileAndEvaluateMdx } from './useCompileAndEvaluateMdx';
import { useCompileMdx } from './useCompileMdx';

describe('useCompileMdx Hook', () => {
  it('should handle invalid MDX syntax gracefully', async () => {
    const invalidSource = '# Test\n\nSome broken MDX content';
    const { result } = renderHook(() => useCompileMdx(invalidSource));
    await waitFor(() => {
      expect(result.current.code).toBeUndefined();
    });
    expect(result.current.frontmatter).toBeUndefined();
  });
});

describe('useCompileAndEvaluateMdx Hook', () => {
  it('should handle empty source gracefully', async () => {
    const source = '';
    const { result } = renderHook(() => useCompileAndEvaluateMdx(source));
    await waitFor(() => {
      expect(result.current.code).toBeUndefined();
    });
    expect(result.current.Component).toBeUndefined();
    expect(result.current.frontmatter).toBeUndefined();
  });

  it('should return empty if MDX compilation or evaluation fails', async () => {
    const source = '# Invalid MDX Content';
    const { result } = renderHook(() => useCompileAndEvaluateMdx(source));
    await waitFor(() => {
      expect(result.current.code).toBeUndefined();
    });
    expect(result.current.Component).toBeUndefined();
    expect(result.current.frontmatter).toBeUndefined();
  });
});
