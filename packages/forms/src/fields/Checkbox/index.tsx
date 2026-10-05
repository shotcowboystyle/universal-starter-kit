import { CheckIcon as CheckRegular } from '@phosphor-icons/react';
import { useReadableTextOn, useResolvedKnobs, wasKeyboardFocus } from '@repo/theme';
import type { RovingFocusGroupProps, RovingFocusItemProps } from '@tamagui/roving-focus';
import { RovingFocusGroup } from '@tamagui/roving-focus';
import type { ElementRef, KeyboardEvent, PropsWithChildren } from 'react';
import { forwardRef, useState } from 'react';
import type { CheckedState, YStackProps } from 'tamagui';
import {
  Checkbox as TamaguiCheckbox,
  Group,
  H2,
  Label,
  View,
  createStyledContext,
  isWeb,
  styled,
  withStaticProperties,
} from 'tamagui';

import { formSelectedColors } from '../../shared/colorRamps';

import {
  CheckboxGlyphBox,
  clampCheckboxGlyphRadius,
  checkboxKbFocusHandlers,
  checkboxTargetFrameProps,
  getCheckboxBoxBorderWidth,
  getCheckboxGlyphSize,
  getCheckboxIconSize,
} from './CheckboxBox';
import {
  CheckboxCardContent,
  CheckboxCardDescription,
  CheckboxCardFrame,
  CheckboxCardLabel,
  getCardDescriptionSize,
  getCheckboxCardLayout,
} from './CheckboxCard';
import { CheckboxFieldFrame } from './CheckboxFieldFrame';

// ─── Checkboxes Compound Component ────────────────────────────────────────────

const CheckboxesContext = createStyledContext<{
  values: Record<string, boolean>;
  onValuesChange: (values: Record<string, boolean>) => void;
}>({
  values: {},
  onValuesChange: () => {},
});

const FocusGroup = forwardRef<ElementRef<typeof View>, RovingFocusGroupProps>((props, ref) => {
  const { knobProps } = useResolvedKnobs();
  return <RovingFocusGroup gap={knobProps.gap.gap} focusable outlineWidth={0} {...props} ref={ref} />;
});

const FocusItemContext = createStyledContext({
  value: '',
  kbFocus: false,
});

const FocusGroupItem = forwardRef<any, RovingFocusItemProps & { value: string }>((itemProps, ref) => {
  const { value, ...props } = itemProps;
  const { values, onValuesChange } = CheckboxesContext.useStyledContext();
  const [kbFocus, setKbFocus] = useState(false);

  const combinedProps = {
    focusable: true,
    flexShrink: 1,
    ...(isWeb && {
      onFocus: () => {
        if (wasKeyboardFocus()) {
          setKbFocus(true);
        }
      },
      onBlur: () => {
        setKbFocus(false);
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          onValuesChange({ ...values, [value]: !values[value] });
        }
      },
    }),
    onPress: () => {
      onValuesChange({ ...values, [value]: !values[value] });
    },
    ...props,
    outlineWidth: 0,
    focusStyle: { zIndex: 1, outlineWidth: 0 },
    focusVisibleStyle: { outlineWidth: 0 },
    'data-checkbox-focus-item': 'true',
  };

  return (
    <FocusItemContext.Provider value={value} kbFocus={kbFocus}>
      <RovingFocusGroup.Item ref={ref} {...combinedProps} />
    </FocusItemContext.Provider>
  );
});

const RadiusGroup = styled(Group, {
  orientation: 'vertical',
  gap: '$2',
});

const CheckboxesTitle = styled(H2, {
  size: '$8',
});

export type CheckboxesProps<K extends string> = {
  values: Record<K, boolean>;
  onValuesChange: (values: Record<K, boolean>) => void;
} & YStackProps;

const CheckboxesImp = <K extends string>(checkboxesProps: PropsWithChildren<CheckboxesProps<K>>) => {
  const { values, onValuesChange, ...props } = checkboxesProps;
  return (
    <CheckboxesContext.Provider values={values} onValuesChange={onValuesChange}>
      <View {...props} />
    </CheckboxesContext.Provider>
  );
};

const CheckboxesCheckbox = TamaguiCheckbox.styleable((checkboxProps, ref) => {
  const { checked: _userChecked, onCheckedChange: onCheckedChangeProp, children, ...props } = checkboxProps;
  const { values, onValuesChange } = CheckboxesContext.useStyledContext();
  const { value: focusItemValue, kbFocus: itemKbFocus } = FocusItemContext.useStyledContext();
  const { knobProps } = useResolvedKnobs();
  const [kbFocus, setKbFocus] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isMarked = Boolean(values[focusItemValue]);
  const radiusToken = knobProps.borderRadius.borderRadius;
  const cappedRadius = clampCheckboxGlyphRadius(radiusToken, { pointy: knobProps.pointy });
  const glyphSize = getCheckboxGlyphSize(knobProps.sizeToken);
  const boxBorderWidth = getCheckboxBoxBorderWidth(knobProps.borderRadius.borderWidth);
  const inFocusGroup = Boolean(focusItemValue);
  const ringFocus = kbFocus || !!itemKbFocus;
  const hasName =
    (props as Record<string, unknown>)['aria-label'] || (props as Record<string, unknown>)['aria-labelledby'];
  const fallbackName = focusItemValue
    ? focusItemValue.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    : undefined;
  const combinedProps = {
    ...(!hasName && fallbackName ? { 'aria-label': fallbackName } : undefined),
    ...props,
    checked: values[focusItemValue],
    onCheckedChange: (checked: CheckedState) => {
      onCheckedChangeProp?.(checked);
      onValuesChange({
        ...values,
        [focusItemValue]: typeof checked === 'boolean' ? checked : !values[focusItemValue],
      });
    },
  };

  return (
    <CheckboxFieldFrame
      ref={ref}
      value={focusItemValue}
      size={knobProps.sizeToken}
      transition={knobProps.transition}
      {...combinedProps}
      {...checkboxTargetFrameProps}
      {...checkboxKbFocusHandlers(setKbFocus, setHovered, {
        onFocus: (combinedProps as { onFocus?: (...args: any[]) => void }).onFocus,
        onBlur: (combinedProps as { onBlur?: (...args: any[]) => void }).onBlur,
      })}
      {...(inFocusGroup ? { tabIndex: -1 } : undefined)}>
      <CheckboxGlyphBox
        glyphSize={glyphSize}
        isMarked={isMarked}
        kbFocus={ringFocus}
        hovered={hovered}
        borderWidth={boxBorderWidth}
        borderRadius={cappedRadius === 0 ? 0 : cappedRadius}
        transition={knobProps.transition}>
        {children}
      </CheckboxGlyphBox>
    </CheckboxFieldFrame>
  );
});

const CheckboxCard = CheckboxCardFrame.styleable<{ unstyled?: boolean; active?: boolean }>((cardProps, ref) => {
  const { values } = CheckboxesContext.useStyledContext();
  const { value } = FocusItemContext.useStyledContext();
  const { knobProps } = useResolvedKnobs();
  const selected = values[value];
  const layout = getCheckboxCardLayout(knobProps.space);

  return (
    <CheckboxCardFrame
      ref={ref}
      active={cardProps.active ?? selected}
      {...layout}
      borderRadius={knobProps.borderRadius.borderRadius}
      {...cardProps}
    />
  );
});

const CheckboxCardDescriptionSized = CheckboxCardDescription.styleable((props, ref) => {
  const { knobProps } = useResolvedKnobs();
  return <CheckboxCardDescription ref={ref} size={getCardDescriptionSize(knobProps.sizeToken)} {...props} />;
});

const CheckboxesIndicator = TamaguiCheckbox.Indicator.styleable((indicatorProps, ref) => {
  const { children, ...props } = indicatorProps;
  const onMark = useReadableTextOn(formSelectedColors.mark);
  const { knobProps } = useResolvedKnobs();
  const iconSize = getCheckboxIconSize(getCheckboxGlyphSize(knobProps.sizeToken));
  return (
    <TamaguiCheckbox.Indicator ref={ref} {...props} pointerEvents="none">
      {children ?? <CheckRegular size={iconSize} pointerEvents="none" {...(onMark ? { color: onMark } : undefined)} />}
    </TamaguiCheckbox.Indicator>
  );
});

export const Checkboxes = withStaticProperties(CheckboxesImp, {
  Group: withStaticProperties(RadiusGroup, {
    Item: Group.Item,
  }),
  FocusGroup: withStaticProperties(FocusGroup, {
    Item: FocusGroupItem,
  }),
  Title: CheckboxesTitle,
  Checkbox: withStaticProperties(CheckboxesCheckbox, {
    Indicator: CheckboxesIndicator,
    Label,
  }),
  Card: withStaticProperties(CheckboxCard, {
    Content: CheckboxCardContent,
    Label: CheckboxCardLabel,
    Description: CheckboxCardDescriptionSized,
  }),
});

export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';
export { CheckboxGroup } from './CheckboxGroup';
export type { CheckboxGroupProps, CheckboxGroupOption } from './CheckboxGroup';
export {
  CHECKBOX_GLYPH_MAX_RADIUS_TOKEN,
  CHECKBOX_TARGET_PX,
  clampCheckboxGlyphRadius,
  isCircularCheckboxRadius,
} from './CheckboxBox';
