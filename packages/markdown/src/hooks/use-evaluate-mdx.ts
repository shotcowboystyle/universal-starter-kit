import { runSync } from '@mdx-js/mdx';
import type { RunOptions } from '@mdx-js/mdx';
import type { MDXContent } from 'mdx/types';
import { useMemo } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

const logger = console;

const evaluateMdx = (code: string, options?: Partial<RunOptions>): MDXContent | null => {
  if (code === '') {
    return null;
  }
  try {
    return runSync(code, { Fragment, jsx, jsxs, ...options }).default;
  } catch (error) {
    logger.error('useEvaluateMdx: failed to evaluate compiled MDX', error);
    return null;
  }
};

export const useEvaluateMdx = (code?: string, options?: Partial<RunOptions>): MDXContent | undefined =>
  useMemo(() => (code === undefined ? undefined : (evaluateMdx(code, options) ?? undefined)), [code, options]);
