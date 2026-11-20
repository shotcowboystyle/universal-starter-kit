// GNOME-target shim for @repo/forms.
//
// The real barrel reaches the whole field library, and with it phosphor
// icons, lucide and the expo surface (camera for the barcode field, the
// linear-gradient for the color picker). None of those resolve under
// GJS.
//
// Re-export the fields the starter ContactForm uses, through deep
// `…/src/*` paths — the bare package name is aliased to this file.
// Adding a field is one line here plus, usually, one granular @tamagui/*
// export in ../tamagui-barrel.ts.

export { Button } from '@repo/forms/src/Button';
export type { ButtonProps } from '@repo/forms/src/Button';
export { Input } from '@repo/forms/src/fields/Input';
export { TextArea } from '@repo/forms/src/fields/TextArea';
export { Spinner } from '@repo/forms/src/Spinner';
export { zIndex } from '@repo/forms/src/shared/zIndex';

// The first components real screens reach for — status chips, loading
// skeletons, a search field. Chip and Skeleton LIVE here in forms
// (components re-exports them), and the components package's own
// Chip/Skeleton modules import the bare package name — which is aliased
// to this file — so these exports serve both the screens' direct imports
// and those internal re-export hops.
export { Chip, ChipFrame, ChipText, chipIconSize } from '@repo/forms/src/Chip';
export type { ChipColor, ChipFrameProps, ChipProps, ChipSize, ChipVariant } from '@repo/forms/src/Chip';
export { SearchInput } from '@repo/forms/src/fields/SearchInput';
export { Skeleton, SkeletonCircle, SkeletonText } from '@repo/forms/src/Skeleton';
export type { SkeletonFrameProps, SkeletonProps, SkeletonVariant } from '@repo/forms/src/Skeleton';

// Select stays inside the core + stacks subgraph on the native path.
export { Select } from '@repo/forms/src/fields/Select';
export type { SelectOption, SelectProps } from '@repo/forms/src/fields/Select';
