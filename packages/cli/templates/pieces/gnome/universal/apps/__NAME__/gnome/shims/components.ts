// GNOME-target shim for @repo/ui.
//
// The real barrel re-exports the whole library, including modules that
// pull expo-asset, @shopify/flash-list, @tanstack/react-virtual and
// @phosphor-icons/react. Under GJS those fail at resolve or module-init
// time — before a single widget is constructed.
//
// The scaffolded screens consume the page shell (Screen, EmptyState,
// PageHeader, PageSection) plus the layout and text primitives the real
// barrel gets from its trailing `export * from "tamagui"`. Re-export
// exactly that. Add modules as your screens grow; a missing export is a
// build error naming the symbol, which is the cheapest possible signal.
//
// Deep `…/src/*` paths rather than the bare package name: the bare name
// is aliased to THIS file, so importing it here would loop.

export * from '@repo/ui/src/layouts/page';

// Async list/table chrome — the wrapper real screens put around their
// fetches. Its skeleton + error icons stay unrendered until used; the
// module graph (forms Button/Skeleton via the shims, three tree-shaken
// phosphor icons) is GJS-inert at init.
export * from '@repo/ui/src/layouts/AsyncBoundary';

// Chip lives in the FORMS package — the real components barrel re-exports
// it. Deep-import the forms source directly (the same module instance the
// forms shim exports) rather than bouncing through the aliased bare name.
export { Chip, ChipFrame, ChipText, chipIconSize } from '@repo/forms/src/Chip';
export type { ChipColor, ChipFrameProps, ChipProps, ChipSize, ChipVariant } from '@repo/forms/src/Chip';

export {
  Button,
  Card,
  H1,
  H2,
  H3,
  H4,
  Image,
  Paragraph,
  ScrollView,
  Separator,
  SizableText,
  Spinner,
  Text,
  XStack,
  YStack,
  isWeb,
} from '../tamagui-barrel';

// The confirm dialog and the row overflow menu. ConfirmDialog rides
// Dialog/AnimatePresence; DropdownMenu rides Popover + phosphor's
// CheckIcon — Popover/Dialog resolve through the gnome tamagui-barrel
// with vite-plugin-gnome's portal/sheet patches, and phosphor resolves to
// the SvgXml glyph shim.
export * from '@repo/ui/src/feedback/ConfirmDialog';
export * from '@repo/ui/src/DropdownMenu';
