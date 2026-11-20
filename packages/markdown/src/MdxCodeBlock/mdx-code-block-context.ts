import type { CodeProps } from '@repo/ui';
import type { ReactNode } from 'react';
import { createContext } from 'react';

export interface MDXCodeBlockContextValue extends Partial<Omit<CodeProps, 'size'>> {
  children?: ReactNode;
  disableCopy?: boolean;
  isCollapsible?: boolean;
  isHighlightingLines?: boolean;
  showLineNumbers?: boolean;
  size?: CodeProps['size'];
}

export const MDXCodeBlockContext = createContext<MDXCodeBlockContextValue>({});
