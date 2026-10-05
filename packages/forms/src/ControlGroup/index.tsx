import {
  GroupPositionContext,
  ensureCompositeFocusRing,
  ensureFocusVisibleRing,
  getGroupPosition,
  hairline,
  useResolvedKnobs,
} from '@repo/theme';
import { Children, isValidElement, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { SizableText, View, isWeb, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

import { FocusContext, getInputFrameTransitionProps, InputContext } from '../InputParts';
import { formCommonColors, formControlColors, formInputColors } from '../shared/colorRamps';
import { ControlGroupCtx } from '../shared/groupContext';
import { useIsInTableCell } from '../shared/tableCellContext';
import { getElevationWrapperProps } from '../shared/utils';

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

const ControlGroupFrame = styled(View, {
  context: InputContext,
  alignItems: 'stretch',
  overflow: 'hidden',
  minWidth: 0,
  flexWrap: 'nowrap',
  // Border width + color come from `inputSurface` / form ramps at the
  // call site (R-OUTER). Do not bake a 1px edge or a size-token radius
  // here — those fight the knobs and turn fused inners into pills.

  ...(isWeb ? { tabIndex: -1 } : { focusable: false }),

  variants: {
    scaleIcon: {
      ':number': {} as any,
    },
    size: {
      '...size': (val: any) => ({
        height: val,
      }),
    },
  } as const,
});

const CONTROL_GROUP_RING_ID = 'mp-control-group-ring';
const controlGroupRingCss = `/* LC-71: ring lives on the outer ControlGroup; descendants keep none. */
.mp-control-group.mp-composite-ring-deep :is(button, [role="button"], input, textarea, [contenteditable], a):focus,
.mp-control-group.mp-composite-ring-deep :is(button, [role="button"], input, textarea, [contenteditable], a):focus-visible {
  outline: none !important;
  box-shadow: none !important;
}`;

function ensureControlGroupRing() {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(CONTROL_GROUP_RING_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = CONTROL_GROUP_RING_ID;
  tag.textContent = controlGroupRingCss;
  document.head.appendChild(tag);
}

function isControlGroupAddon(child: ReactElement): boolean {
  const type = child.type as { isControlGroupAddon?: boolean };
  return type === ControlGroupAddon || type.isControlGroupAddon === true;
}

function groupItems(children: ReactNode): ReactElement[] {
  return Children.toArray(children).filter(isValidElement);
}

// ---------------------------------------------------------------------------
// ControlGroup.Addon — Bootstrap input-group-text / Polaris connected slot
// ---------------------------------------------------------------------------

export type ControlGroupAddonProps = GetProps<typeof View> & {
  children?: ReactNode;
};

function ControlGroupAddonImpl({ children, ...props }: ControlGroupAddonProps) {
  const { knobProps } = useResolvedKnobs();
  const text =
    typeof children === 'string' || typeof children === 'number' ? (
      <SizableText
        {...knobProps.label}
        fontWeight="400"
        color={formCommonColors.muted}
        userSelect="none"
        numberOfLines={1}>
        {children}
      </SizableText>
    ) : (
      children
    );
  return (
    <View
      data-mp-control-group-addon="true"
      justifyContent="center"
      alignItems="center"
      alignSelf="stretch"
      backgroundColor={formControlColors.background}
      {...knobProps.control}
      borderRadius={0}
      flexGrow={0}
      flexShrink={0}
      {...props}>
      {text}
    </View>
  );
}

export const ControlGroupAddon = Object.assign(ControlGroupAddonImpl, {
  isControlGroupAddon: true as const,
});

// ---------------------------------------------------------------------------
// ControlGroup
// ---------------------------------------------------------------------------

export interface ControlGroupProps extends GetProps<typeof ControlGroupFrame> {
  children: ReactNode;
  /** Layout direction. Default "horizontal". */
  orientation?: 'horizontal' | 'vertical';
}

function ControlGroupImpl({ children, orientation = 'horizontal', ...props }: ControlGroupProps) {
  const [focused, setFocused] = useState(false);
  const { knobProps, control, elevation } = useResolvedKnobs();
  const inTableCell = useIsInTableCell();
  if (isWeb) {
    ensureCompositeFocusRing();
    ensureControlGroupRing();
  }
  const elevationWrapperProps = useMemo(() => getElevationWrapperProps(knobProps, elevation), [knobProps, elevation]);
  const isVertical = orientation === 'vertical';
  const items = groupItems(children);

  const renderItems = (seams: boolean) => {
    const count = items.length;
    const nodes: ReactNode[] = [];
    for (let index = 0; index < count; index++) {
      const child = items[index];
      const position = getGroupPosition(index, count);
      const isMiddle = position === 'middle';
      // Native: a lone child (Stepper showButtons={false} renders just
      // the input) must fill the frame — RN TextInput has no intrinsic
      // width, so a content-sized wrapper measures 0pt wide and iOS
      // culls the zero-rect subtree from the a11y tree. Web keeps the
      // content-sized wrapper (CSS inputs have intrinsic width).
      // Polaris Connected: the primary field flexes; addons stay content-sized.
      const needsFlex = !isControlGroupAddon(child) && (isMiddle || count === 2 || (!isWeb && count === 1));
      const flexProps = needsFlex
        ? { flex: 1, ...(isVertical ? { minHeight: 0 } : { minWidth: 0 }) }
        : { flexGrow: 0, flexShrink: 0 };
      nodes.push(
        <GroupPositionContext.Provider key={child.key ?? index} value={position}>
          <View
            {...flexProps}
            borderRadius={0}
            overflow="hidden"
            data-mp-group-position={position}
            data-mp-inner-radius="0">
            {child}
          </View>
        </GroupPositionContext.Provider>,
      );
      if (seams && index < count - 1) {
        nodes.push(
          <View
            key={`seam-${index}`}
            {...(isVertical ? hairline.line : hairline.vline)}
            backgroundColor={formInputColors.border.base}
            flexGrow={0}
            flexShrink={0}
            alignSelf="stretch"
            aria-hidden
          />,
        );
      }
    }
    return nodes;
  };

  // Chromeless rendering inside table cells
  if (inTableCell) {
    return (
      <ControlGroupCtx.Provider value={true}>
        <FocusContext.Provider focused={focused} setFocused={setFocused}>
          <ControlGroupFrame
            {...knobProps.body}
            flexDirection={isVertical ? 'column' : 'row'}
            borderWidth={0}
            borderRadius={0}
            backgroundColor="transparent"
            data-mp-control-group=""
            data-orientation={orientation}
            {...props}>
            {Children.map(items, (child) => (
              <View flex={1} minWidth={0} borderRadius={0}>
                {child}
              </View>
            ))}
          </ControlGroupFrame>
        </FocusContext.Provider>
      </ControlGroupCtx.Provider>
    );
  }

  return (
    <ControlGroupCtx.Provider value={true}>
      <FocusContext.Provider focused={focused} setFocused={setFocused}>
        <ControlGroupFrame
          {...knobProps.body}
          {...(!isVertical ? { size: knobProps.sizeToken } : undefined)}
          flexDirection={isVertical ? 'column' : 'row'}
          backgroundColor={knobProps.outlined ? 'transparent' : formInputColors.background.base}
          {...knobProps.inputSurface}
          {...knobProps.borderRadius}
          {...elevationWrapperProps}
          {...getInputFrameTransitionProps(typeof knobProps.transition === 'string' ? knobProps.transition : undefined)}
          {...(control.focusKnobProps
            ? {
                focusStyle: {
                  borderColor: formInputColors.border.focus,
                  backgroundColor: knobProps.outlined ? 'transparent' : formInputColors.background.focus,
                  ...control.focusKnobProps,
                },
              }
            : undefined)}
          {...(control.focusVisibleKnobProps
            ? {
                focusVisibleStyle: {
                  borderColor: formInputColors.border.focus,
                  backgroundColor: knobProps.outlined ? 'transparent' : formInputColors.background.focus,
                  ...ensureFocusVisibleRing({
                    ...control.focusVisibleKnobProps,
                    outlineOffset: -2,
                  }),
                },
              }
            : {
                focusVisibleStyle: {
                  borderColor: formInputColors.border.focus,
                  ...ensureFocusVisibleRing({ outlineOffset: -2 }),
                },
              })}
          {...props}
          {...(isWeb
            ? {
                className: [
                  'mp-control-group',
                  'mp-composite-ring',
                  'mp-composite-ring-deep',
                  (props as { className?: string }).className,
                ]
                  .filter(Boolean)
                  .join(' '),
              }
            : undefined)}
          {...(focused
            ? {
                borderColor: formInputColors.border.focus,
                backgroundColor: knobProps.outlined ? 'transparent' : formInputColors.background.focus,
                ...control.focusKnobProps,
                ...ensureFocusVisibleRing({ outlineOffset: -2 }),
              }
            : undefined)}
          overflow="hidden"
          data-mp-control-group=""
          data-orientation={orientation}>
          {renderItems(true)}
        </ControlGroupFrame>
      </FocusContext.Provider>
    </ControlGroupCtx.Provider>
  );
}

export const ControlGroup = Object.assign(ControlGroupImpl, {
  Addon: ControlGroupAddon,
});
