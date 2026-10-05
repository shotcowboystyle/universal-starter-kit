export * from './Alert';
export {
  SortableList,
  SortableHandle,
  SortableHandleWell,
  SortableSessionProvider,
  useSortableRows,
} from './SortableList';
export type { SortableListProps, SortableDisabledStyle, SortableSession, UseSortableRowsOptions } from './SortableList';
export * from './Badge';
export * from './Carousel';
export * from './Chip';
export * from './CopyField';
export * from './DotIndicator';
export * from './DropdownMenu';
export * from './ContextMenu';
export * from './Meter';
export * from './ProgressSteps';
export * from './TreeSelect';
export * from './Quote';
export * from './ThemePlayground';
export * from './Skeleton';
export * from './SkipLink';
export * from './Toast';
export * from './Video';
export * from './feedback';
export * from './actions';
export * from './Wheel';
export * from './ErrorBoundary/index';
export * from './code/index';
// Forms are now in @repo/forms package
// Table components live outside this package (out of scope)
export * from './hooks/index';
export * from './icons/index';
export * from './images/index';
export * from './layouts/index';
// MDX components live outside this package (out of scope)
export * from './surfaces';
export * from './views/index';
// Wizard is house-only: nothing in the curated ./tamagui surface shadows these
// names, so without an explicit export the component is unreachable from the
// package; consumers import all four names.
export { Wizard } from './Wizard';
export type { WizardFormLike, WizardProps, WizardStatus, WizardStep } from './Wizard';
export { unwrapText } from './utils/unwrapText';
export { Pagination, getPaginationItems } from './Pagination';
export type { PaginationProps, PaginationItem } from './Pagination';
export { Accordion, useAccordionTriggerInk } from './Accordion';
export type {
  AccordionProps,
  AccordionVariant,
  AccordionType,
  AccordionSingleModeProps,
  AccordionMultipleModeProps,
  AccordionItemProps,
  AccordionTriggerProps,
  AccordionContentProps,
} from './Accordion';
export { AnimateHeight, settleMs } from './AnimateHeight';
export type { AnimateHeightProps } from './AnimateHeight';
// Explicit named export wins over the `export * from "tamagui"` star export
// (same pattern as Tooltip) so house Tabs shadows the tamagui primitive.
export { Tabs } from './Tabs';
export type { TabsProps, TabsItem, TabsVariant, TabsSize, TabsTriggerProps } from './Tabs';
export { Tooltip } from './Tooltip';
export type { TooltipProps, TooltipContentProps, TooltipArrowProps, TooltipTextProps } from './Tooltip';
// Explicit named exports win over the `export * from "tamagui"` star export
// (same pattern as Tabs/Tooltip) so the house knob-aware surfaces shadow the
// raw tamagui primitives (Card, CardHeader, CardFooter, DialogContent,
// PopoverContent). The unthemed originals stay reachable via `tamagui`.
export { Card, CardFooter, CardHeader } from './Card';
export type { CardFooterProps, CardHeaderProps, CardProps, SurfaceTier } from './Card';
export {
  DialogContent,
  DialogOverlay,
  AlertDialogContent,
  AlertDialogOverlay,
  PopoverContent,
  SheetFrame,
  Panel,
} from './surfaces';
// Curated tamagui surface — replaces the old `export * from "tamagui"` star
// export that leaked raw interactive primitives (Checkbox, Switch, Select, …)
// under the house package name. See ./tamagui.ts for the allowlist rules and
// tamagui.test.ts for the guardrail locking it.
export * from './tamagui';

// The local Toast module (star-exported above) must win over any toast names;
// re-export it explicitly so the bare `Toast` name is unambiguous.
export { Toast, ToastViewport, useToast } from './Toast';
export type { ToastProps, ToastViewportProps } from './Toast';

// lucide hamburger icon — alias bare `Menu` explicitly. Tamagui Menu /
// create-menu are unused leftovers and stay off the house barrel.
export { MenuIcon as Menu, MenuIcon } from './icons/lucide';

// Raw @tamagui/toast primitives for consumers that need the imperative
// controller/state API or the unshadowed Toast compound (house Toast above
// wins for the bare `Toast` name). Prefer useToast() for new code.
export { Toast as TamaguiToast, useToastController, useToastState } from '@tamagui/toast';

// Shadow tamagui Avatar / Fieldset with house gallery components.
export { Avatar, getInitials } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';
export { Fieldset } from '@repo/forms';
export type { FieldsetProps } from '@repo/forms';
export { ContextualSaveBar, clientKnownIdentity, commitImmediateField } from '@repo/forms';
export type { ContextualSaveBarProps, NavigationBlocker, UseNavigationBlocker } from '@repo/forms';

// Shadow tamagui Spinner with the knob-consuming forms Spinner (census
// 2026-08-13): raw Spinner keeps spinning at animation "none" /
// prefers-reduced-motion and ignores the size knob; the forms house version
// gates its motion on knobProps.transition, maps the size knob's top step to
// "large", and carries role="status" a11y. The curated ./tamagui surface no
// longer exports the bare name; raw stays reachable as TamaguiSpinner.
export { Spinner } from '@repo/forms';
export type { SpinnerProps } from '@repo/forms';

// Shadow tamagui Button with the house wrapper over the forms Button
// (knob fragments + press floor + icon slot, plus the raw
// `variant="outlined"` prop-compat). The curated ./tamagui surface no
// longer exports the bare name; raw stays reachable as TamaguiButton.
export { Button } from './Button';
export type { ButtonProps } from './Button';

// Shadow tamagui Text and Heading with the house versions. ./tamagui.ts says
// so in its own words -- "Bare Text/SizableText/Paragraph/Anchor are the house
// shadows in ./Text.tsx and bare Heading/H1-H6 the house shadows in
// ./Heading.tsx" -- and exports only the Tamagui*-prefixed escape hatches.
// An earlier commit removed these lines from this barrel, which left the bare names
// exported by NOBODY: consumers that import them
// stopped building, and tamagui.test.ts's "keeps house shadows as the
// house versions" guardrail started failing. Raw stays reachable as
// TamaguiText / TamaguiHeading / TamaguiH1.
export { Anchor, Paragraph, SizableText, Text } from './Text';
export type { AnchorProps, ParagraphProps, SizableTextProps, TextProps } from './Text';
export { H1, H2, H3, H4, H5, H6, Heading } from './Heading';
export type { HeadingProps } from './Heading';

// Shadow tamagui Separator with the house Separator. Two reasons,
// both measured: a bare name a house barrel exports is a
// catalog part, and this one resolved to a raw primitive; and
// the raw primitive is a `flex: 1` item, so the rule can absorb free space.
// The house rule is a painted 1px line in $borderColor (measured law:
// 1px never 0.5px; quiet = opacity 0.5, never a lighter colour) that cannot
// flex-grow. The curated ./tamagui surface no longer exports the bare name;
// raw stays reachable as TamaguiSeparator.
//
// Correction 2026-09-01: the ticket's "96 of 96 paint nothing" was a probe
// artefact, not a defect — see ./Separator/index.tsx for the measurement.
export { Separator } from './Separator';
export type { SeparatorProps } from './Separator';

export type { ImageProps } from './images/Image';
export { Image } from './images/Image';

// The semantic colour tiers and the section-heading metrics the catalog
// paints with. Named exports, not a star, so the curated surface stays
// explicit — these are token maps, not catalog parts: they render
// nothing and a consumer spreads them onto its own frames exactly as the
// catalog does. They were reachable only through the `./src/*` deep-path
// hatch before, which is why a consumer that wanted the SURFACE tier
// (`$color2` / `$color6`) rather than the CONTROL tier restated the two
// tokens by hand instead of importing the layer that defines them.
// A semantic layer whose own header says "use these instead of hardcoding $color3, $color10" has
// to be importable by a stable name.
export { componentColors, sectionHeading } from './componentColors';

// ---------------------------------------------------------------------------
// Tamagui shorthand type augmentation
//
// Adds shorthand prop types (bg, ai, jc, p, m, etc.) to all Tamagui
// components for every consumer of @repo/ui.
//
// We intentionally augment with ONLY the shorthands rather than a full
// createTamagui config to avoid triggering TamaDefer resolution changes
// that break styled() component types across workspace boundaries.
// ---------------------------------------------------------------------------
import type { shorthands as _shorthands } from '@tamagui/shorthands';
declare module '@tamagui/web' {
  interface TamaguiCustomConfig {
    shorthands: typeof _shorthands;
  }
}
