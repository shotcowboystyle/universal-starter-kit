import type { WithLayout } from '@repo/platform';
import { createWithLayout } from '@repo/platform';
import { config } from '@repo/platform';
import { OVERLAY_ANCHOR_GAP, radiusClassProps, useResolvedKnobs } from '@repo/theme';
import type { ComponentType, ReactNode } from 'react';
import { Circle, Popover, XStack, YStack } from 'tamagui';

import { componentColors } from '../../componentColors';
import { PopoverContent } from '../../surfaces';

const pipShape = radiusClassProps('R-PILL', 'debug pip');

export interface DebugLayoutProps<DebugViewProps> {
  children?: ReactNode;
  debugView?: ComponentType<DebugViewProps>;
  debugViewProps?: DebugViewProps;
  /** Visual pip size. Defaults to the size-knob nested-control metric. */
  size?: number;
  /**
   * When set, overrides the `DEBUG=1` env gate. Stories pass `true` so the
   * chrome is actually on screen. Production omits it.
   */
  enabled?: boolean;
}

export function DebugLayout<DebugViewProps>({
  children,
  debugView,
  debugViewProps,
  size,
  enabled,
}: DebugLayoutProps<DebugViewProps>) {
  const { knobProps } = useResolvedKnobs({ component: 'DebugLayout' });
  const DebugView = debugView;
  const show = enabled ?? config.get('DEBUG') === '1';
  const pipSize = size ?? knobProps.nestedControl.px;

  if (!show) {
    return <>{children}</>;
  }

  return (
    <YStack fullscreen pointerEvents="box-none" data-testid="debug-layout-root">
      {children}
      <YStack
        position="absolute"
        top={0}
        insetInlineEnd={0}
        pointerEvents="box-none"
        zIndex={1}
        {...knobProps.panelPadding}>
        <XStack data-testid="debug-container" pointerEvents="auto">
          <Popover placement="bottom" offset={OVERLAY_ANCHOR_GAP}>
            <Popover.Trigger>
              <Circle
                {...pipShape}
                cursor="pointer"
                backgroundColor={componentColors.debug}
                width={pipSize}
                height={pipSize}
                hitSlop={knobProps.nestedControl.hitSlop}
                data-testid="debug-circle"
                transition={knobProps.transition}
              />
            </Popover.Trigger>
            <PopoverContent>
              <YStack {...knobProps.panelPadding} {...knobProps.gap} {...knobProps.body}>
                {DebugView ? <DebugView {...(debugViewProps as any)} /> : null}
              </YStack>
            </PopoverContent>
          </Popover>
        </XStack>
      </YStack>
    </YStack>
  );
}

export function createWithDebugLayout<DebugViewProps>(
  extraLayouts?: WithLayout[],
  debugLayoutProps: CreateWithDebugLayout<DebugViewProps> = {},
) {
  return createWithLayout<DebugLayoutProps<DebugViewProps>>(DebugLayout, extraLayouts, debugLayoutProps);
}

export const withDebugLayout = createWithDebugLayout();

interface CreateWithDebugLayout<DebugViewProps> {
  debugView?: ComponentType<DebugViewProps>;
  debugViewProps?: DebugViewProps;
  enabled?: boolean;
  size?: number;
}
