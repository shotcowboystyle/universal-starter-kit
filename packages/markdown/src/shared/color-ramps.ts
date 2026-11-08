/**
 * Color ramps for markdown components.
 * Uses Tamagui color tokens for consistent theming.
 */

export const markdownCodeColors = {
  background: {
    base: '$color3',
  },
  border: {
    base: '$color6',
  },
  text: {
    base: '$color12',
    muted: '$color11',
  },
} as const;

export const markdownBlockquoteColors = {
  background: {
    base: '$color2',
  },
  border: {
    base: '$color8',
  },
  text: {
    base: '$color11',
  },
} as const;

export const markdownLinkColors = {
  text: {
    base: '$blue10',
    hover: '$blue11',
  },
} as const;

export const markdownCommonColors = {
  text: '$color12',
  muted: '$color11',
  divider: '$color6',
} as const;
