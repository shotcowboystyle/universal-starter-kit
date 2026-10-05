// Curated tamagui re-export surface for @repo/ui.
//
// This module replaces the old `export * from "tamagui"` star export, which
// leaked every raw tamagui primitive under the house package name. That leak
// let consumers grab interactive primitives (Checkbox, Switch, Select, …)
// that have house equivalents in @repo/forms — raw compounds
// render broken without composed children (see the todos Checkbox incident),
// while still passing the "no raw tamagui outside public/" lint rule.
//
// Rules for this file:
// - Re-export ONLY benign building blocks: layout, text, styling/theme
//   utilities, and overlay composition roots that house surfaces
//   (DialogContent, PopoverContent, SheetFrame) are designed to compose with.
// - NEVER re-export a bare interactive primitive that has a house equivalent
//   in @repo/forms (Button, Checkbox, Switch, RadioGroup,
//   Select, Slider, ToggleGroup, Input, TextArea, Label, Form, Progress).
//   Bare `Button` is the house shadow (./Button.tsx wrapping the forms
//   Button) so knob fragments and the press floor reach every
//   components-imported Button.
// - Deliberate raw usage goes through the explicit `Tamagui*`-prefixed
//   escape hatches below (same precedent as TamaguiToast in index.ts) so the
//   rawness is visible and greppable at the import site.
// - The curation is locked by tamagui.test.ts — update both together.

// Layout primitives (no house replacement).
// Separator left this list 2026-08-28: a bare catalog name may not
// resolve to a raw primitive, and the raw one is a `flex: 1`
// item that can absorb free space. The bare name is the house
// Separator re-exported via index.ts (1px painted line in $borderColor,
// quiet = opacity 0.5). Raw stays reachable as TamaguiSeparator below.
export {
  Circle,
  Group,
  ListItem,
  Spacer,
  Square,
  Unspaced,
  View,
  VisuallyHidden,
  XGroup,
  XStack,
  YGroup,
  YStack,
} from 'tamagui';

// Raw tamagui on web. On native ./ScrollView/index.native.tsx hands onScroll
// to the RN ScrollView, which tamagui's own styled scroller drops.
export { ScrollView } from './ScrollView';

// LinearGradient is NOT on the main tamagui barrel — it lives
// on the `tamagui/linear-gradient` subpath.
export { LinearGradient } from 'tamagui/linear-gradient';
export type { LinearGradientProps } from 'tamagui/linear-gradient';

// Text primitives: NONE re-exported raw anymore. The former
// "typography substrate" registry rows were the single biggest knob hole in
// the catalog: FontKnobStyles rescues family/leading/tracking on WEB ONLY,
// fontWeight/textAccent/pageTitleScale reached the raw primitives on NO
// platform, and on native nothing did. Bare Text/SizableText/Paragraph/
// Anchor are the house shadows in ./Text.tsx and bare Heading/H1–H6 the
// house shadows in ./Heading.tsx, spreading knobProps.body / .heading /
// .pageTitle (and textAccent ink) as PROPS so the knobs reach the text node
// on every platform. Raw stays reachable via the Tamagui* hatches below.

// Actions / feedback primitives: NONE re-exported raw anymore.
// Button is a house shadow (./Button.tsx over the forms Button).
// Spinner followed in the export
// census 2026-08-13: the raw primitive ignores the animation knob (spins at
// animation "none" / prefers-reduced-motion) and the size knob; the bare name
// is the knob-consuming forms Spinner re-exported via index.ts. Raw stays
// reachable as TamaguiButton / TamaguiSpinner below.

// Overlay composition roots — the house DialogContent / PopoverContent /
// SheetFrame surfaces are designed to compose inside these raw roots.
//
// Adapt is off this list. Compact vs regular overlays use the
// 860 pivot: useViewportGtSm / AdaptivePopup / FloatingPanel (Dialog or
// Sheet, one shared child tree). Tamagui Menu / create-menu stay off this
// list. Tamagui Link stays off this list — house Text/Heading owns
// link chrome.
export { Popover, Portal, PortalProvider, Sheet } from 'tamagui';
// Dialog and AlertDialog are the tamagui roots with house close parts: raw
// Close names every button it wraps "Dialog Close" (./Dialog.tsx).
export { AlertDialog, Dialog } from './Dialog';

// Providers / theme / animation
export { AnimatePresence, TamaguiProvider, Theme } from 'tamagui';

// Hooks
export {
  useControllableState,
  useDidFinishSSR,
  useEvent,
  useMedia,
  usePropsAndStyle,
  useTheme,
  useThemeName,
} from 'tamagui';

// Styling utilities
export {
  createStyledContext,
  getToken,
  getTokens,
  getTokenValue,
  isClient,
  isWeb,
  styled,
  withStaticProperties,
} from 'tamagui';

// Types for the allowlisted surface. Typography Props types (TextProps,
// HeadingProps, …) ride the house modules (./Text.tsx, ./Heading.tsx) so the
// bare type names track the house components, same as ButtonProps.
export type {
  CircleProps,
  ColorTokens,
  DialogProps,
  FontSizeTokens,
  GetProps,
  GetRef,
  GroupProps,
  ListItemProps,
  PopoverProps,
  RadiusTokens,
  ScrollViewProps,
  SheetProps,
  SizeTokens,
  SpaceTokens,
  SquareProps,
  TamaguiConfig,
  TamaguiElement,
  TamaguiProviderProps,
  TamaguiTextElement,
  ThemeName,
  ThemeProps,
  ViewProps,
  XStackProps,
  YStackProps,
} from 'tamagui';

// Explicit raw escape hatches (TamaguiToast precedent): these primitives are
// EXCLUDED under their bare names because a house version owns the name —
// @repo/forms for the fields, ./Separator for the rule.
// Deliberate, correctly-composed raw usage (playground showcases, settings
// toggles that compose Thumb/Indicator themselves) imports the prefixed name
// so the choice is explicit at the call site. Prefer the house part for new
// code.
export {
  Button as TamaguiButton,
  Checkbox as TamaguiCheckbox,
  Input as TamaguiInput,
  Label as TamaguiLabel,
  Progress as TamaguiProgress,
  RadioGroup as TamaguiRadioGroup,
  Select as TamaguiSelect,
  Separator as TamaguiSeparator,
  Slider as TamaguiSlider,
  Spinner as TamaguiSpinner,
  Switch as TamaguiSwitch,
  TextArea as TamaguiTextArea,
  ToggleGroup as TamaguiToggleGroup,
} from 'tamagui';

// Typography escape hatches: the bare names are the knob-consuming
// house shadows (./Text.tsx, ./Heading.tsx). Deliberate raw usage — styled()
// bases, specimens, code that must not consume the knob channel — imports
// the prefixed name so the rawness is visible at the import site. App text
// NEVER rides these (mpo-conventions/no-raw-typography lints it).
export {
  Anchor as TamaguiAnchor,
  H1 as TamaguiH1,
  H2 as TamaguiH2,
  H3 as TamaguiH3,
  H4 as TamaguiH4,
  H5 as TamaguiH5,
  H6 as TamaguiH6,
  Heading as TamaguiHeading,
  Paragraph as TamaguiParagraph,
  SizableText as TamaguiSizableText,
  Text as TamaguiText,
} from 'tamagui';

// Safe disclosure button defaults around the unpainted compound.
export { Collapsible } from './Collapsible';
