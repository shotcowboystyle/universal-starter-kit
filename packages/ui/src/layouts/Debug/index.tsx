import type { WithLayout } from '@repo/platform';
import { createWithLayout, config } from '@repo/platform';
import { OVERLAY_ANCHOR_GAP, radiusClassProps, useResolvedKnobs } from '@repo/theme';
import type { Attributes, ComponentType, ReactNode } from 'react';
import { Circle, Popover, XStack, YStack } from 'tamagui';

import { componentColors } from '../../component-colors';
import { PopoverContent } from '../../surfaces';

const pipRadius = radiusClassProps('R-PILL', 'debug pip');

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

export const DebugLayout = <DebugViewProps,>({
  children,
  debugView,
  debugViewProps,
  size,
  enabled,
}: DebugLayoutProps<DebugViewProps>) => {
  const { knobProps } = useResolvedKnobs({ component: 'DebugLayout' });
  const DebugView = debugView;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: debugViewProps is optional on DebugLayoutProps; spreading undefined adds no props, so callers that own required props pass them (an unconstrained generic cannot be spread into its own component without the cast)
  const viewProps = debugViewProps as DebugViewProps & Attributes;
  const show = enabled ?? config.get('DEBUG') === '1';
  const pipSize = size ?? knobProps.nestedControl.px;

  if (!show) {
    // oxlint-disable-next-line react/jsx-no-useless-fragment -- wraps the ReactNode into an element; returning `children` directly widens the component's return type to include Promise
    return <>{children}</>;
  }

  return (
    <YStack
      fullscreen
      pointerEvents="box-none"
      data-testid="debug-layout-root">
      {children}
      <YStack
        position="absolute"
        top={0}
        insetInlineEnd={0}
        pointerEvents="box-none"
        zIndex={1}
        {...knobProps.panelPadding}>
        <XStack
          data-testid="debug-container"
          pointerEvents="auto">
          <Popover
            placement="bottom"
            offset={OVERLAY_ANCHOR_GAP}>
            <Popover.Trigger>
              <Circle
                {...pipRadius}
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
              <YStack
                {...knobProps.panelPadding}
                {...knobProps.gap}
                {...knobProps.body}>
                {DebugView ? <DebugView {...viewProps} /> : null}
              </YStack>
            </PopoverContent>
          </Popover>
        </XStack>
      </YStack>
    </YStack>
  );
};

// oxlint-disable-next-line react-doctor/only-export-components -- HOC factory exported next to the component; it is the public API and moving it would change the module surface
export const createWithDebugLayout = <DebugViewProps,>(
  extraLayouts?: WithLayout[],
  debugLayoutProps: CreateWithDebugLayout<DebugViewProps> = {},
) => createWithLayout<DebugLayoutProps<DebugViewProps>>(DebugLayout, extraLayouts, debugLayoutProps);

// oxlint-disable-next-line react-doctor/only-export-components -- HOC factory exported next to the component; it is the public API and moving it would change the module surface
export const withDebugLayout = createWithDebugLayout();

interface CreateWithDebugLayout<DebugViewProps> {
  debugView?: ComponentType<DebugViewProps>;
  debugViewProps?: DebugViewProps;
  enabled?: boolean;
  size?: number;
}
