import { useMDXComponents } from '@mdx-js/react';
import { ErrorBoundary } from '@repo/ui';
import type { DebugProp } from '@tamagui/web';
import type { MDXComponents } from 'mdx/types';

import { useCompileAndEvaluateMdx } from '../hooks';
import { mdxComponents } from '../mdxComponents';

export interface MDXProps {
  children: string;
  components?: MDXComponents;
  debug?: DebugProp;
}

const logger = console;

export function MDX({ children, debug, ...props }: MDXProps) {
  const components = useMDXComponents();
  const { Component, code, frontmatter } = useCompileAndEvaluateMdx(children);
  if (!Component) {
    return <>{}</>;
  }
  if (debug) {
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
}
