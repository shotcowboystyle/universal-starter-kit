import { useResolvedKnobs } from '@repo/theme';
import { createElement } from 'react';
import type { FontSizeTokens, LabelProps as TamaguiLabelProps, SizeTokens } from 'tamagui';
import { isWeb, Label as TamaguiLabel, YStack } from 'tamagui';

import {
  formatRequiredMarkSuffix,
  mapHouseRequiredMarking,
  useRequiredMarking,
  type RequiredMarkMode,
} from '../requiredMarking';
import { formCommonColors } from '../shared/colorRamps';

export interface LabelProps extends Omit<TamaguiLabelProps, 'size'> {
  /** Type step. Do not pass a control-height `sizeToken`. */
  size?: SizeTokens;
  required?: boolean;
  requiredMarking?: RequiredMarkMode;
  /**
   * Polaris `labelAccessibilityVisibility="exclusive"` / GOV.UK visually hidden:
   * stays in the a11y tree and keeps `htmlFor`, takes no layout.
   */
  hidden?: boolean;
  /** GOV.UK label-as-page-heading: type from the heading recipe, wrapped in `h1`. */
  asPageHeading?: boolean;
  error?: boolean;
  disabled?: boolean;
}

const visuallyHidden = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden' as const,
  ...(isWeb ? { whiteSpace: 'nowrap' as const, borderWidth: 0 } : { opacity: 0 }),
};

export function Label({
  size,
  required,
  requiredMarking: requiredMarkingProp,
  hidden,
  asPageHeading,
  error,
  disabled,
  htmlFor,
  children,
  ...props
}: LabelProps) {
  const { knobProps, disabledState } = useResolvedKnobs();
  const markingCtx = useRequiredMarking();
  const markMode: RequiredMarkMode =
    requiredMarkingProp ?? markingCtx?.mode ?? mapHouseRequiredMarking(knobProps.requiredMarking);
  const suffix = formatRequiredMarkSuffix(required, markMode);
  const keepLabelReadable = Boolean(disabled) && disabledState.style !== 'dimWhole';
  const typeSize = (size as FontSizeTokens | undefined) ?? knobProps.label.fontSize;
  const color = error ? formCommonColors.error : knobProps.textAccentColor;
  const type = asPageHeading
    ? {
        ...knobProps.heading,
        fontSize: knobProps.pageTitle.size,
        lineHeight: knobProps.pageTitle.size,
      }
    : { fontSize: typeSize, lineHeight: typeSize };

  const node = (
    <TamaguiLabel
      htmlFor={htmlFor}
      // T-LABEL: body metrics + label type fragment + textAccentColor.
      // Never pass sizeToken as Tamagui `size` — that variant runs
      // getButtonSized and inflates line-height to control height.
      {...knobProps.body}
      {...knobProps.label}
      {...type}
      fontWeight="400"
      color={color}
      cursor={disabled ? 'not-allowed' : htmlFor ? 'pointer' : 'default'}
      display="flex"
      alignItems="flex-start"
      flexWrap="wrap"
      opacity={keepLabelReadable ? 1 : undefined}
      {...(disabled && !keepLabelReadable ? disabledState.assemblyKnobProps : undefined)}
      {...(hidden ? visuallyHidden : undefined)}
      pressStyle={{ color }}
      hoverStyle={{ color }}
      focusStyle={{ color }}
      {...props}>
      {children}
      {suffix}
    </TamaguiLabel>
  );

  if (asPageHeading && !hidden) {
    // Real <h1> wherever a DOM exists (web + happy-dom). Tamagui `tag`
    // leaks as an attribute on RN-web. Native uses header role.
    if (typeof document !== 'undefined') {
      return createElement('h1', { style: { margin: 0, padding: 0 } }, node);
    }
    return (
      <YStack accessibilityRole="header" margin={0} padding={0}>
        {node}
      </YStack>
    );
  }
  return node;
}
