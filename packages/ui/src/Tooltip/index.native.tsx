/**
 * Tooltip (native) — same bubble API as web, opened by long-press.
 *
 * Tamagui Tooltip is hover+delay; there is no hover on device. This twin
 * opens after a ~500ms press-in (or `onLongPress`) and closes on press-out
 * or tap outside. The trigger stays the caller's press target. The
 * bubble stays nested-scale — never a Sheet, never the 44px press floor.
 */

import { zIndex } from '@repo/forms';
import { OVERLAY_ANCHOR_GAP, useResolvedKnobs, warnTooltipOnDisabled } from '@repo/theme';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import {
  Tooltip as TamaguiTooltip,
  TooltipGroup as TamaguiTooltipGroup,
  Portal,
  useTheme,
  type GetProps,
} from 'tamagui';

import { TOOLTIP_NATIVE_LONG_PRESS_MS, createNativeTooltipPressHandlers } from './nativePress';
import {
  TooltipArrow,
  TooltipContent,
  TooltipText,
  noteTooltipClosed,
  preventTooltipFocus,
  resolveThemeColor,
  resolveTooltipPadRecipe,
  resolveTooltipSizeRecipe,
  wrapTooltipContent,
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

type PressHandler = ((event: unknown) => void) | undefined;

export function Tooltip({
  children,
  content,
  placement = 'top',
  delay = TOOLTIP_NATIVE_LONG_PRESS_MS,
  disabled = false,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: TooltipProps) {
  const { knobProps } = useResolvedKnobs({ component: 'Tooltip' });
  const theme = useTheme();
  const surfaceFill = resolveThemeColor(theme.color1, '$color1');
  const pad = resolveTooltipPadRecipe(knobProps.space);
  const sizeRecipe = resolveTooltipSizeRecipe(knobProps.size);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const [outsideArmed, setOutsideArmed] = React.useState(false);

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

  const press = React.useMemo(() => createNativeTooltipPressHandlers(setOpen, delay), [setOpen, delay]);
  React.useEffect(
    () => () => {
      press.dispose();
    },
    [press],
  );

  React.useEffect(() => {
    if (!open) {
      setOutsideArmed(false);
      return;
    }
    const arm = setTimeout(() => {
      setOutsideArmed(true);
    }, 50);
    return () => {
      clearTimeout(arm);
    };
  }, [open]);

  if (React.isValidElement(children)) {
    const childProps = (children as React.ReactElement<Record<string, unknown>>).props;
    const childDisabled =
      childProps.disabled === true || childProps['aria-disabled'] === true || childProps['aria-disabled'] === 'true';
    warnTooltipOnDisabled({
      component: 'Tooltip',
      childDisabled,
    });
  }

  const trigger = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        delayLongPress: delay,
        onPressIn: (event: unknown) => {
          (children.props as { onPressIn?: PressHandler }).onPressIn?.(event);
          press.pressIn();
        },
        onPressOut: (event: unknown) => {
          (children.props as { onPressOut?: PressHandler }).onPressOut?.(event);
          press.pressOut();
        },
        onLongPress: (event: unknown) => {
          (children.props as { onLongPress?: PressHandler }).onLongPress?.(event);
          press.longPress();
        },
      })
    : children;

  if (disabled) {
    return <>{children}</>;
  }

  const elevated = knobProps.elevatedSurface;

  return (
    <>
      {open ? (
        <Portal>
          <Pressable
            accessibilityLabel="Dismiss tooltip"
            disabled={!outsideArmed}
            onPress={() => {
              if (outsideArmed) {
                press.tapOutside();
              }
            }}
            style={[StyleSheet.absoluteFill, { zIndex: zIndex.dropdown - 1 }]}
          />
        </Portal>
      ) : null}
      <TamaguiTooltip
        placement={placement}
        delay={0}
        restMs={0}
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
          pointerEvents="none"
          onOpenAutoFocus={preventTooltipFocus}
          onCloseAutoFocus={preventTooltipFocus}>
          <TooltipArrow
            backgroundColor={surfaceFill}
            borderColor={surfaceFill}
            style={{ backgroundColor: surfaceFill, borderColor: surfaceFill }}
          />
          {wrapTooltipContent(content, {
            ...knobProps.body,
            ...knobProps.label,
            color: '$color12',
            lineHeight: knobProps.label.fontSize,
          })}
        </TooltipContent>
      </TamaguiTooltip>
    </>
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
