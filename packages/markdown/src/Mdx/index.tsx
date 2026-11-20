import { useMDXComponents } from '@mdx-js/react';
import { ErrorBoundary } from '@repo/ui';
import type { DebugProp } from '@tamagui/web';
import type { MDXComponents } from 'mdx/types';

import { useCompileAndEvaluateMdx } from '../hooks/use-compile-and-evaluate-mdx';
import { mdxComponents } from '../mdx-components';

export interface MDXProps {
  children: string;
  components?: MDXComponents;
  debug?: DebugProp;
}

const logger = console;

export const MDX = ({ children, debug, ...props }: MDXProps) => {
  const components = useMDXComponents();
  const { Component, code, frontmatter } = useCompileAndEvaluateMdx(children);
  if (!Component) {
    return null;
  }
  if (debug !== undefined && debug !== false) {
    logger.debug('MDX', { frontmatter });
    logger.debug(code);
  }
  return (
    // contain runtime render errors (e.g. missing component mappings) so
    // sibling content outside the MDX renderer survives
    <ErrorBoundary>
      <Component
        components={{
          ...mdxComponents,
          ...components,
          ...props.components,
        }}
      />
    </ErrorBoundary>
  );
};
