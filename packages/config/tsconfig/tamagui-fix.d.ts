/**
 * Type augmentation for Tamagui v2 RC children type issue.
 *
 * Tamagui v2 RC 11 component types resolve to a structure where `children`
 * is omitted from the JSX element props, causing thousands of type errors like:
 *   Type '{ children: Element[]; }' is not assignable to type 'WithShorthands<...>'
 *
 * This augmentation fixes the issue by extending the base prop types to accept
 * children. Remove once Tamagui v2 stable resolves this.
 */

import type { ReactNode } from 'react';

declare module '@tamagui/web' {
  interface TamaguiComponentPropsBaseBase {
    children?: ReactNode;
  }
}

declare module '@tamagui/core' {
  interface TamaguiComponentPropsBaseBase {
    children?: ReactNode;
  }
}

// Re-export from tamagui/web which is an internal entry point without type declarations
declare module 'tamagui/web' {
  export * from '@tamagui/web';
}
