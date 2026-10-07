// Resolution target for the `tamagui` meta-package on the GNOME target.
//
// vite.config.gnome.ts aliases `tamagui` here. The full meta-barrel drags
// web-only components into the GJS bundle, so re-export only the granular
// @tamagui/* packages this app's graph actually reaches.
//
// KEEP THIS MINIMAL, AND EXTEND DELIBERATELY. Every extra granular
// package widens the module graph, and some widen it off a cliff:
// @tamagui/popover pulls @tamagui/portal, which requires
// react-native/Libraries/* — real RN's Flow sources, which the bundler
// cannot parse. When a screen needs a component, add it here and rebuild;
// a missing export fails loudly at build time, which is the point.

export {
  createFont,
  createStyledContext,
  createTamagui,
  getConfig,
  getTokenValue,
  getTokens,
  getVariable,
  getVariableValue,
  isWeb,
  styled,
  TamaguiProvider,
  Text,
  Theme,
  useDidFinishSSR,
  useEvent,
  useMedia,
  useProps,
  useStyle,
  useTheme,
  useThemeName,
  View,
  withStaticProperties,
} from '@tamagui/core';
export { H1, H2, H3, H4, H5, H6, Paragraph, SizableText } from '@tamagui/text';
export { ThemeableStack, XStack, YStack, ZStack } from '@tamagui/stacks';
export { ScrollView } from '@tamagui/scroll-view';
export { Separator } from '@tamagui/separator';
export { Spacer } from '@tamagui/spacer';
export { Spinner } from '@tamagui/spinner';
export { Card } from '@tamagui/card';
export { Image } from '@tamagui/image';

// Starter form (features/__NAME__/src/ContactForm.tsx). Each stays inside
// the core + stacks + helpers subgraph — verified free of
// react-native/Libraries deep imports.
export { Button } from '@tamagui/button';
export { Form } from '@tamagui/form';
export { Input, TextArea } from '@tamagui/input';
export { Label } from '@tamagui/label';
export { getFontSize } from '@tamagui/font-size';
export { useComposedRefs } from '@tamagui/compose-refs';
export { useControllableState } from '@tamagui/use-controllable-state';
export { useWindowDimensions } from '@tamagui/use-window-dimensions';

// The forms InputParts/ErrorSummary subgraph (pulled in by the shims'
// Chip + SearchInput) reaches these. group and helpers-tamagui stay
// inside the safe core + stacks subgraph; Anchor lives in the tamagui
// META package (no granular home, src unexported), so it's replicated in
// ./anchor.tsx.
export { Anchor } from './anchor';
export type { AnchorProps } from './anchor';
export { XGroup, YGroup } from '@tamagui/group';
export { useGetThemedIcon } from '@tamagui/helpers-tamagui';

// Type-only names referenced by `import type { … } from "tamagui"` across
// the workspace. Erased at build time; listed for tsc and editors.
export type {
  ColorTokens,
  CreateTamaguiProps,
  FontSizeTokens,
  GenericFont,
  GetProps,
  ScrollViewProps,
  SizeTokens,
  TamaguiElement,
  TextProps,
  ThemeName,
  ViewProps,
} from '@tamagui/core';
export type { StackProps, XStackProps, YStackProps } from '@tamagui/stacks';
export type { ButtonProps } from '@tamagui/button';
export type { InputProps } from '@tamagui/input';
export type { LabelProps } from '@tamagui/label';

// Dialog/popover chrome: ConfirmDialog (components shim) rides Dialog +
// AnimatePresence; DropdownMenu rides Popover. Both native builds stay
// GJS-safe through @repo/vite-plugin-gnome's portal/sheet
// patches (portal repropagation, sheet relative-position) — that is the
// header's popover cliff, handled.
export { Dialog } from '@tamagui/dialog';
export { Popover } from '@tamagui/popover';
export { AnimatePresence } from '@tamagui/animate-presence';
export type { PopoverContentProps, PopoverProps } from '@tamagui/popover';
export { Sheet } from '@tamagui/sheet';
