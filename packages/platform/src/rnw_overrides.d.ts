/**
 * React Native Web type augmentations for PressableStateCallbackType, ViewStyle,
 * TextProps, ViewProps. Include via tsconfig types: "@repo/platform/rnw-overrides"
 */

import type { MouseEvent } from 'react';

declare module 'react-native' {
  interface PressableStateCallbackType {
    hovered?: boolean;
    focused?: boolean;
  }
  interface ViewStyle {
    transitionProperty?: string;
    transitionDuration?: string;
  }
  interface TextProps {
    accessibilityComponentType?: never;
    accessibilityTraits?: never;
    href?: string;
    hrefAttrs?: {
      rel: 'noreferrer';
      target?: '_blank';
    };
  }
  interface ViewProps {
    accessibilityRole?: string;
    href?: string;
    hrefAttrs?: {
      rel: 'noreferrer';
      target?: '_blank';
    };
    onClick?: (e: MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
  }
}
