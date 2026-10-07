/**
 * Main Markdown component
 * Cross-platform markdown renderer with Shiki syntax highlighting
 */
import { useMemo } from 'react';
import { View } from 'tamagui';
import type { ViewProps } from 'tamagui';

import { parseMarkdown } from './parser';
import { renderMarkdown } from './renderer';
import type { MarkdownProps } from './types';

export interface MarkdownComponentProps extends MarkdownProps, Omit<ViewProps, 'children'> {}

/**
 * Render markdown string as cross-platform React components
 *
 * @example
 * ```tsx
 * <Markdown>
 *   # Hello World
 *
 *   This is **bold** and _italic_ text.
 *
 *   ```javascript
 *   const x = 1;
 *   ```
 * </Markdown>
 * ```
 */
export function Markdown({ children, components, codeTheme = 'auto', ...viewProps }: MarkdownComponentProps) {
  const rendered = useMemo(() => {
    if (!children || typeof children !== 'string') {
      return null;
    }

    try {
      const ast = parseMarkdown(children);
      return renderMarkdown(ast, { components, codeTheme });
    } catch (error) {
      console.error('Markdown parsing error:', error);
      return null;
    }
  }, [children, components, codeTheme]);

  return <View {...viewProps}>{rendered}</View>;
}
