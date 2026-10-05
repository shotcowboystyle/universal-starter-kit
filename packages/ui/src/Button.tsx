/**
 * House Button for the components catalog — closes the KNOB-TOTALITY
 * hole where `./tamagui.ts` re-exported `Button` STRAIGHT from tamagui, so
 * every `import { Button } from "@repo/ui"` consumer
 * (app header actions, shell chrome, wallet/auth CTAs)
 * rendered the raw primitive: no knob fragments (radius stuck at the size
 * variant's 9px/7px under `borderRadius: "none"`), no press-floor
 * channel, no icon-slot discipline.
 *
 * ARCHITECTURE (decided from the dependency graph, not copied styling):
 * `@repo/ui` already depends on `@repo/forms`
 * (package.json dependency, consumed by Pagination, toolbar, ConfirmDialog,
 * and the `Fieldset` shadow in index.ts) while forms does NOT depend on
 * components — so re-exporting the knob-correct forms Button is legal and
 * cycle-free. A second local knob-consuming implementation would duplicate
 * the forms Button against SINGLE-IMPLEMENTATION; a bare re-export
 * would silently drop the raw-tamagui `variant="outlined"` API that ~10
 * consumer sites pass. This module is therefore the thinnest legal shape: a
 * prop-compat shim that maps tamagui's `variant="outlined"` onto the house
 * `outlined` prop and forwards everything else (STD-EJECT-LAST is the forms
 * Button's own contract; knob fragments land there).
 *
 * Raw tamagui Button stays reachable as `TamaguiButton` (./tamagui.ts escape
 * hatch, same precedent as TamaguiCheckbox/TamaguiToast).
 */
import { Button as FormsButton, type ButtonProps as FormsButtonProps } from '@repo/forms';

/**
 * House Button API — the forms Button contract, plus the raw-tamagui `variant`
 * this shim exists to translate.
 *
 * The forms Button now OMITS `variant`, because it never read it and an
 * inherited-but-ignored prop is how 75 call sites rendered filled while asking
 * for outlined. So the prop is declared HERE, where something actually
 * consumes it, instead of being inherited from a component that drops it.
 */
export type ButtonProps = FormsButtonProps & { variant?: 'outlined' };

export function Button({ variant, outlined, ...props }: ButtonProps) {
  // Raw-tamagui prop-compat: `variant="outlined"` is tamagui Button API that
  // pre-shadow consumers pass; the house channel is the `outlined` boolean.
  // An explicit `outlined` wins; with neither, the knob decides downstream.
  return <FormsButton outlined={outlined ?? (variant === 'outlined' || undefined)} {...props} />;
}

Button.Text = FormsButton.Text;
Button.Icon = FormsButton.Icon;
