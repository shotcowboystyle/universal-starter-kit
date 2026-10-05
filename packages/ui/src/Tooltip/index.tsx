/**
 * Tooltip — compact, non-interactive overlay (Radix / Primer / Polaris / Spectrum).
 *
 * Web: opens on hover (with warmup) and keyboard focus; closes on leave, blur,
 * Escape, and trigger activation. Native twin (`index.native.tsx`) opens on
 * long-press (~500ms) and closes on press-out or tap outside.
 *
 * Content is hoverable (WCAG 1.4.13) but never a tab stop — the trigger keeps
 * the keyboard ring. Size drives type and max-width; space/density drive inset.
 * The bubble stays nested-scale (below the 44px press floor); the trigger is
 * the caller's contract.
 */

import { zIndex } from '@repo/forms';
import { OVERLAY_ANCHOR_GAP, useResolvedKnobs, warnTooltipOnDisabled } from '@repo/theme';
import React from 'react';
import { Tooltip as TamaguiTooltip, TooltipGroup as TamaguiTooltipGroup, useTheme, type GetProps } from 'tamagui';

import {
  TooltipArrow,
  TooltipContent,
  TooltipText,
  noteTooltipClosed,
  preventTooltipFocus,
  resolveThemeColor,
  resolveTooltipPadRecipe,
  resolveTooltipSizeRecipe,
  useTooltipSkipDelay,
  wrapTooltipContent,
  TOOLTIP_DEFAULT_DELAY_MS,
  type TooltipProps,
} from './tooltipShared';

export type { TooltipProps, TooltipSizeRecipe } from './tooltipShared';
export {
  tooltipSizeRecipes,
  tooltipPadRecipes,
  TOOLTIP_COLLISION_PADDING_PX,
  TOOLTIP_SKIP_DELAY_MS,
  TOOLTIP_DEFAULT_DELAY_MS,
  noteTooltipClosed,
  resolveTooltipDelay,
  resolveTooltipSizeRecipe,
  resolveTooltipPadRecipe,
  __resetTooltipSkipForTests,
  wrapTooltipContent,
  TooltipContent,
  TooltipArrow,
  TooltipText,
} from './tooltipShared';
export { TOOLTIP_NATIVE_LONG_PRESS_MS, createNativeTooltipPressHandlers } from './nativePress';
export type { NativeTooltipPressHandlers } from './nativePress';

export function Tooltip({
  children,
  content,
  placement = 'top',
  delay = TOOLTIP_DEFAULT_DELAY_MS,
  disabled = false,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: TooltipProps) {
  const { knobProps } = useResolvedKnobs({ component: 'Tooltip' });
  const theme = useTheme();
  const surfaceFill = resolveThemeColor(theme.color1, '$color1');
  const pad = resolveTooltipPadRecipe(knobProps.space);
  const sizeRecipe = resolveTooltipSizeRecipe(knobProps.size);
  const delayMs = useTooltipSkipDelay(delay);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChangeProp?.(next);
      if (!next) {
        noteTooltipClosed();
      }
    },
    [isControlled, onOpenChangeProp],
  );

  // Tooltips on disabled triggers are not keyboard-reachable.
  if (React.isValidElement(children)) {
    const childProps = (children as React.ReactElement<Record<string, unknown>>).props;
    const childDisabled =
      childProps.disabled === true || childProps['aria-disabled'] === true || childProps['aria-disabled'] === 'true';
    warnTooltipOnDisabled({
      component: 'Tooltip',
      childDisabled,
    });
  }

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setOpen]);

  // Open on keyboard (focus-visible) focus of the trigger, close on blur —
  // attached to the child directly because Trigger asChild does not forward
  // focus handlers to the wrapped element. Keyboard warmup is 0 (Spectrum).
  const trigger = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        onFocus: (e: React.FocusEvent<HTMLElement>) => {
          (
            (children as React.ReactElement<Record<string, unknown>>).props.onFocus as
              | ((e: React.FocusEvent<HTMLElement>) => void)
              | undefined
          )?.(e);
          if (typeof e.target?.matches !== 'function' || e.target.matches(':focus-visible')) {
            setOpen(true);
          }
        },
        onBlur: (e: React.FocusEvent<HTMLElement>) => {
          (
            (children as React.ReactElement<Record<string, unknown>>).props.onBlur as
              | ((e: React.FocusEvent<HTMLElement>) => void)
              | undefined
          )?.(e);
          setOpen(false);
        },
      })
    : children;

  if (disabled) {
    return <>{children}</>;
  }

  const elevated = knobProps.elevatedSurface;

  return (
    <TamaguiTooltip
      placement={placement}
      delay={{ open: delayMs, close: 0 }}
      restMs={100}
      offset={OVERLAY_ANCHOR_GAP}
      zIndex={zIndex.dropdown}
      open={open}
      onOpenChange={setOpen}>
      <TamaguiTooltip.Trigger asChild>{trigger}</TamaguiTooltip.Trigger>
      <TooltipContent
        {...elevated}
        paddingHorizontal={pad.paddingHorizontal as never}
        paddingVertical={pad.paddingVertical as never}
        maxWidth={sizeRecipe.maxWidth}
        transition={knobProps.transition}
        role="tooltip"
        data-tooltip="content"
        data-tooltip-size={knobProps.size}
        data-tooltip-space={knobProps.space}
        data-tooltip-density={knobProps.density}
        data-tooltip-fill={surfaceFill}
        onOpenAutoFocus={preventTooltipFocus}
        onCloseAutoFocus={preventTooltipFocus}>
        <TooltipArrow
          backgroundColor={surfaceFill}
          borderColor={surfaceFill}
          style={{ backgroundColor: surfaceFill, borderColor: surfaceFill }}
        />
        {/* Nested type: label (size) + body family/weight. $color12 clears AA at caption size. */}
        {wrapTooltipContent(content, {
          ...knobProps.body,
          ...knobProps.label,
          color: '$color12',
          lineHeight: knobProps.label.fontSize,
        })}
      </TooltipContent>
    </TamaguiTooltip>
  );
}

Tooltip.Content = TooltipContent;
Tooltip.Arrow = TooltipArrow;
Tooltip.Text = TooltipText;
Tooltip.Trigger = TamaguiTooltip.Trigger;
Tooltip.Group = TamaguiTooltipGroup;

export type TooltipContentProps = GetProps<typeof TooltipContent>;
export type TooltipArrowProps = GetProps<typeof TooltipArrow>;
export type TooltipTextProps = GetProps<typeof TooltipText>;
