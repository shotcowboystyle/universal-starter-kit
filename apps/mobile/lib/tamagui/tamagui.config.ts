import { createAnimations } from "@tamagui/animations-react-native";
import { defaultConfig } from "@tamagui/config/v4";
import { createTamagui, createTokens } from "@tamagui/core";

const tokens = createTokens({
  color: {
    // Light
    background: "hsl(180, 35%, 100%)",
    foreground: "hsl(180, 45%, 5%)",
    muted: "hsl(180, 25%, 95%)",
    mutedForeground: "hsl(180, 45%, 25%)",
    primary: "hsl(180, 75%, 35%)",
    primaryForeground: "hsl(180, 10%, 98%)",
    secondary: "hsl(180, 20%, 92%)",
    secondaryForeground: "hsl(180, 45%, 30%)",
    accent: "hsl(180, 75%, 35%)",
    accentForeground: "hsl(180, 10%, 98%)",
    destructive: "hsl(0, 85%, 45%)",
    destructiveForeground: "hsl(0, 10%, 98%)",
    border: "hsl(180, 20%, 92%)",
    input: "hsl(180, 20%, 92%)",
    ring: "hsl(180, 75%, 35%)",
    card: "hsl(180, 35%, 98%)",
    cardForeground: "hsl(180, 45%, 10%)",
    primaryAlpha10: "hsla(180, 75%, 35%, 0.1)",
    secondaryAlpha50: "hsla(180, 20%, 92%, 0.5)",
    destructiveAlpha10: "hsla(0, 85%, 45%, 0.1)",
    // Dark
    backgroundDark: "hsl(180, 35%, 5%)",
    foregroundDark: "hsl(180, 20%, 100%)",
    mutedDark: "hsl(180, 30%, 12%)",
    mutedForegroundDark: "hsl(180, 25%, 85%)",
    primaryDark: "hsl(180, 75%, 45%)",
    primaryForegroundDark: "hsl(180, 10%, 98%)",
    secondaryDark: "hsl(180, 20%, 18%)",
    secondaryForegroundDark: "hsl(180, 20%, 70%)",
    accentDark: "hsl(180, 75%, 45%)",
    accentForegroundDark: "hsl(180, 10%, 98%)",
    destructiveDark: "hsl(0, 85%, 60%)",
    destructiveForegroundDark: "hsl(0, 10%, 98%)",
    borderDark: "hsl(180, 20%, 18%)",
    inputDark: "hsl(180, 20%, 18%)",
    ringDark: "hsl(180, 75%, 45%)",
    cardDark: "hsl(180, 35%, 8%)",
    cardForegroundDark: "hsl(180, 20%, 98%)",
    primaryAlpha10Dark: "hsla(180, 75%, 45%, 0.1)",
    secondaryAlpha50Dark: "hsla(180, 20%, 18%, 0.5)",
    destructiveAlpha10Dark: "hsla(0, 85%, 60%, 0.1)",
    // Utility
    gray500: "hsl(0, 0%, 45%)",
    blue500: "hsl(217, 91%, 60%)",
    green500: "hsl(142, 71%, 45%)",
    white: "#fff",
    black: "#000",
    transparent: "transparent"
  },
  space: { ...defaultConfig.tokens.space },
  size: { ...defaultConfig.tokens.size },
  radius: { 0: 0, sm: 4, md: 6, lg: 8, xl: 12, "2xl": 16, full: 9999 },
  zIndex: { 0: 0, 1: 100, 2: 200 }
});

const sharedColors = {
  gray500: tokens.color.gray500,
  blue500: tokens.color.blue500,
  green500: tokens.color.green500,
  white: tokens.color.white,
  black: tokens.color.black,
  transparent: tokens.color.transparent
};

const lightTheme = {
  ...sharedColors,
  background: tokens.color.background,
  color: tokens.color.foreground,
  borderColor: tokens.color.border,
  muted: tokens.color.muted,
  mutedForeground: tokens.color.mutedForeground,
  primary: tokens.color.primary,
  primaryForeground: tokens.color.primaryForeground,
  secondary: tokens.color.secondary,
  secondaryForeground: tokens.color.secondaryForeground,
  accent: tokens.color.accent,
  accentForeground: tokens.color.accentForeground,
  destructive: tokens.color.destructive,
  destructiveForeground: tokens.color.destructiveForeground,
  input: tokens.color.input,
  ring: tokens.color.ring,
  card: tokens.color.card,
  cardForeground: tokens.color.cardForeground,
  primaryAlpha10: tokens.color.primaryAlpha10,
  secondaryAlpha50: tokens.color.secondaryAlpha50,
  destructiveAlpha10: tokens.color.destructiveAlpha10
};

const darkTheme = {
  ...sharedColors,
  background: tokens.color.backgroundDark,
  color: tokens.color.foregroundDark,
  borderColor: tokens.color.borderDark,
  muted: tokens.color.mutedDark,
  mutedForeground: tokens.color.mutedForegroundDark,
  primary: tokens.color.primaryDark,
  primaryForeground: tokens.color.primaryForegroundDark,
  secondary: tokens.color.secondaryDark,
  secondaryForeground: tokens.color.secondaryForegroundDark,
  accent: tokens.color.accentDark,
  accentForeground: tokens.color.accentForegroundDark,
  destructive: tokens.color.destructiveDark,
  destructiveForeground: tokens.color.destructiveForegroundDark,
  input: tokens.color.inputDark,
  ring: tokens.color.ringDark,
  card: tokens.color.cardDark,
  cardForeground: tokens.color.cardForegroundDark,
  primaryAlpha10: tokens.color.primaryAlpha10Dark,
  secondaryAlpha50: tokens.color.secondaryAlpha50Dark,
  destructiveAlpha10: tokens.color.destructiveAlpha10Dark
};

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  tokens,
  themes: { light: lightTheme, dark: darkTheme },
  animations: createAnimations({
    fast: { type: "spring", damping: 20, mass: 1.2, stiffness: 250 },
    medium: { type: "spring", damping: 15, mass: 0.9, stiffness: 150 },
    slow: { type: "spring", damping: 20, stiffness: 60 }
  }),
  settings: {
    ...defaultConfig.settings,
    onlyAllowShorthands: false,
    allowedStyleValues: false
  }
});

export default tamaguiConfig;

export type AppConfig = typeof tamaguiConfig;
declare module "@tamagui/core" {
  // eslint-disable-next-line -- Required by Tamagui for type augmentation
  interface TamaguiCustomConfig extends AppConfig {}
}
