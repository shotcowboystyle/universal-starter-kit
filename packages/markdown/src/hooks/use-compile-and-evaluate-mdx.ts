import type { CompileOptions, RunOptions } from '@mdx-js/mdx';
import type { MDXContent } from 'mdx/types';

import type { ParsedFrontmatter } from './use-compile-mdx';
import { useCompileMdx } from './use-compile-mdx';
import { useEvaluateMdx } from './use-evaluate-mdx';

export interface CompileAndEvaluateMdxResult {
  Component?: MDXContent;
  code?: string;
  frontmatter?: ParsedFrontmatter;
}

export const useCompileAndEvaluateMdx = (
  source: string,
  compileOptions?: CompileOptions,
  evaluateOptions?: Partial<RunOptions>,
): CompileAndEvaluateMdxResult => {
  const { code, frontmatter } = useCompileMdx(source, compileOptions);
  const Component = useEvaluateMdx(code, evaluateOptions);
  if (code === undefined || code === '' || !frontmatter || !Component) {
    return {};
  }
  return { Component, code, frontmatter };
};
