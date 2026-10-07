import {
  GroupPositionContext,
  ensureCompositeFocusRing,
  ensureFocusVisibleRing,
  getGroupPosition,
  hairline,
  useResolvedKnobs,
} from '@repo/theme';
import { Children, isValidElement, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { SizableText, View, isWeb, styled } from 'tamagui';
import type { GetProps, SizeTokens } from 'tamagui';

import { FocusContext, getInputFrameTransitionProps, InputContext } from '../InputParts';
import { formCommonColors, formControlColors, formInputColors } from '../shared/color-ramps';
import { ControlGroupCtx } from '../shared/group-context';
import { useIsInTableCell } from '../shared/table-cell-context';
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
      ':number': () => ({}),
    },
    size: {
      '...size': (val: SizeTokens) => ({
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

const ensureControlGroupRing = () => {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.querySelector(`#${CONTROL_GROUP_RING_ID}`)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = CONTROL_GROUP_RING_ID;
  tag.textContent = controlGroupRingCss;
  document.head.append(tag);
};

// oxlint-disable-next-line react/no-react-children -- toArray flattens fragments/arrays, drops nullish children and assigns the stable keys the group relies on
const groupItems = (children: ReactNode): ReactElement[] => Children.toArray(children).filter(isValidElement);

// ---------------------------------------------------------------------------
// ControlGroup.Addon — Bootstrap input-group-text / Polaris connected slot
// ---------------------------------------------------------------------------

export type ControlGroupAddonProps = Omit<GetProps<typeof View>, 'children'> & {
  children?: ReactNode;
};

const ControlGroupAddonImpl = ({ children, ...props }: ControlGroupAddonProps) => {
  const { knobProps } = useResolvedKnobs();
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode children; only plain text/number needs the label wrapper
  const isPlainText = typeof children === 'string' || typeof children === 'number';
  const text = isPlainText ? (
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
};

export const ControlGroupAddon = Object.assign(ControlGroupAddonImpl, {
  isControlGroupAddon: true as const,
});

const isControlGroupAddon = (child: ReactElement): boolean => {
  const { type } = child;
  if (type === ControlGroupAddon) {
    return true;
  }
  return type instanceof Object && 'isControlGroupAddon' in type && type.isControlGroupAddon === true;
};

// ---------------------------------------------------------------------------
// ControlGroup
// ---------------------------------------------------------------------------

export interface ControlGroupProps extends GetProps<typeof ControlGroupFrame> {
  children: ReactNode;
  /** Layout direction. Default "horizontal". */
  orientation?: 'horizontal' | 'vertical';
  /** Web only: merged after the composite-ring classes. */
  className?: string;
}

const ControlGroupImpl = ({ children, orientation = 'horizontal', ...props }: ControlGroupProps) => {
  const [focused, setFocused] = useState(false);
  const { knobProps, control, elevation } = useResolvedKnobs();
  const inTableCell = useIsInTableCell();
  if (isWeb) {
    ensureCompositeFocusRing();
    ensureControlGroupRing();
  }
  const elevationWrapperProps = useMemo(() => getElevationWrapperProps(knobProps, elevation), [knobProps, elevation]);
  const isVertical = orientation === 'vertical';
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- transition is a name or a config object at runtime; only names feed the frame
  const transitionName = typeof knobProps.transition === 'string' ? knobProps.transition : undefined;
  const items = groupItems(children);

  const renderItems = (seams: boolean) => {
    const count = items.length;
    const nodes: ReactNode[] = [];
    for (let index = 0; index < count; index += 1) {
      const child = items[index];
      const position = getGroupPosition(index, count);
      const isMiddle = position === 'middle';
      // Native: a lone child (Stepper showButtons={false} renders just
      // the input) must fill the frame — RN TextInput has no intrinsic
      // width, so a content-sized wrapper measures 0pt wide and iOS
      // culls the zero-rect subtree from the a11y tree. Web keeps the
      // content-sized wrapper (CSS inputs have intrinsic width).
      // Polaris Connected: the primary field flexes; addons stay content-sized.
      const isLoneNativeChild = !isWeb && count === 1;
      const needsFlex = !isControlGroupAddon(child) && (isMiddle || count === 2 || isLoneNativeChild);
      const flexProps = needsFlex
        ? { flex: 1, ...(isVertical ? { minHeight: 0 } : { minWidth: 0 }) }
        : { flexGrow: 0, flexShrink: 0 };
      nodes.push(
        <GroupPositionContext.Provider
          key={child.key ?? index}
          value={position}>
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
        <FocusContext.Provider
          focused={focused}
          setFocused={setFocused}>
          <ControlGroupFrame
            {...knobProps.body}
            flexDirection={isVertical ? 'column' : 'row'}
            borderWidth={0}
            borderRadius={0}
            backgroundColor="transparent"
            data-mp-control-group=""
            data-orientation={orientation}
            {...props}>
            {items.map((child) => (
              <View
                key={child.key}
                flex={1}
                minWidth={0}
                borderRadius={0}>
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
      <FocusContext.Provider
        focused={focused}
        setFocused={setFocused}>
        <ControlGroupFrame
          {...knobProps.body}
          {...(isVertical ? undefined : { size: knobProps.sizeToken })}
          flexDirection={isVertical ? 'column' : 'row'}
          backgroundColor={knobProps.outlined ? 'transparent' : formInputColors.background.base}
          {...knobProps.inputSurface}
          {...knobProps.borderRadius}
          {...elevationWrapperProps}
          {...getInputFrameTransitionProps(transitionName)}
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
                className: ['mp-control-group', 'mp-composite-ring', 'mp-composite-ring-deep', props.className]
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
};

export const ControlGroup = Object.assign(ControlGroupImpl, {
  Addon: ControlGroupAddon,
});
