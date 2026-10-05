/**
 * Theme name constants for type-safe theme switching.
 */
export const THEME_NAME = {
  NEOBRUTALISM: 'neobrutalism',
  NEOMORPHISM: 'neomorphism',
  GLASSMORPHISM: 'glassmorphism',
  DARKMODE: 'darkmode',
  LIQUIDGLASS: 'liquidglass',
} as const;

/**
 * Union type of all available theme names.
 */
export type ThemeName = (typeof THEME_NAME)[keyof typeof THEME_NAME];
