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
import { OVERLAY_ANCHOR_GAP, useResolvedKnobs } from '@repo/theme';
import React from 'react';
import type { ReactNode } from 'react';
import { Tooltip as TamaguiTooltip, TooltipGroup as TamaguiTooltipGroup, useTheme } from 'tamagui';
import type { GetProps } from 'tamagui';

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
  warnIfTriggerDisabled,
  wrapTooltipContent,
  TOOLTIP_DEFAULT_DELAY_MS,
} from './tooltip-shared';
import type { TooltipProps, TooltipTriggerProps } from './tooltip-shared';

export type { TooltipProps, TooltipSizeRecipe } from './tooltip-shared';
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
} from './tooltip-shared';
export { TOOLTIP_NATIVE_LONG_PRESS_MS, createNativeTooltipPressHandlers } from './native-press';
export type { NativeTooltipPressHandlers } from './native-press';

interface WebTriggerProps extends TooltipTriggerProps {
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
}

// Open on keyboard (focus-visible) focus of the trigger, close on blur —
// attached to the child directly because Trigger asChild does not forward
// focus handlers to the wrapped element. Keyboard warmup is 0 (Spectrum).
const withFocusHandlers = (children: ReactNode, setOpen: (open: boolean) => void): ReactNode => {
  if (!React.isValidElement<WebTriggerProps>(children)) {
    return children;
  }
  // oxlint-disable-next-line react/no-clone-element -- Trigger asChild does not forward focus handlers, so they are layered onto the caller's element while keeping its props, key and ref
  return React.cloneElement(children, {
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      children.props.onFocus?.(e);
      if (e.target?.matches?.(':focus-visible') ?? true) {
        setOpen(true);
      }
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      children.props.onBlur?.(e);
      setOpen(false);
    },
  });
};

export const Tooltip = ({
  children,
  content,
  placement = 'top',
  delay = TOOLTIP_DEFAULT_DELAY_MS,
  disabled = false,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: TooltipProps) => {
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
  warnIfTriggerDisabled(children);

  const closeOnEscape = React.useEffectEvent(() => {
    setOpen(false);
  });

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.stopPropagation();
      closeOnEscape();
    };
    if (open) {
      document.addEventListener('keydown', onKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const trigger = withFocusHandlers(children, setOpen);

  if (disabled) {
    // oxlint-disable-next-line react/jsx-no-useless-fragment -- wraps ReactNode children into an element; returning ReactNode directly would type the component as returning a Promise
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
        paddingHorizontal={pad.paddingHorizontal}
        paddingVertical={pad.paddingVertical}
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
};

Tooltip.Content = TooltipContent;
Tooltip.Arrow = TooltipArrow;
Tooltip.Text = TooltipText;
Tooltip.Trigger = TamaguiTooltip.Trigger;
Tooltip.Group = TamaguiTooltipGroup;

export type TooltipContentProps = GetProps<typeof TooltipContent>;
export type TooltipArrowProps = GetProps<typeof TooltipArrow>;
export type TooltipTextProps = GetProps<typeof TooltipText>;
