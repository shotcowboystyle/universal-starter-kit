import type { CodeProps } from '@repo/ui';
import type { ReactNode } from 'react';
import { createContext } from 'react';
import type { SizeTokens } from 'tamagui';

export interface MDXCodeBlockContextValue extends Partial<Omit<CodeProps, 'size'>> {
  children?: ReactNode;
  disableCopy?: boolean;
  isCollapsible?: boolean;
  isHighlightingLines?: boolean;
  showLineNumbers?: boolean;
  size?: SizeTokens | string;
}

export const MDXCodeBlockContext = createContext<MDXCodeBlockContextValue>({});
