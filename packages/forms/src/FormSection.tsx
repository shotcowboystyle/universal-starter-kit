import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { Text, YStack, isWeb } from 'tamagui';

import { formReadableMaxWidth } from './formSpacing';

export interface FormSectionProps {
  /** Section heading / legend. */
  label?: string;
  children: ReactNode;
  /**
   * Cap readable width. Pass `"fluid"` to opt out.
   * Default: {@link formReadableMaxWidth} (560).
   */
  maxWidth?: number | 'fluid';
  /**
   * Gap between fields inside the section. Defaults to the semantic
   * within-group gap (`knobProps.gap`) so the space knob
   * restyles form rhythm; explicit values eject.
   */
  gap?: number | string;
  /** Extra props forwarded to the outer stack (e.g. test ids). */
  testID?: string;
  /**
   * When true (default), render semantic `<fieldset>` + `<legend>` on web
   * so assistive tech groups the fields. Native keeps a heading label.
   */
  fieldset?: boolean;
  /** Nested scale. Omit to inherit the nearest Preset density. */
  compact?: boolean;
}

/**
 * Labeled form section with semantic gap rhythm.
 *
 * Field gap defaults to the within-group semantic gap (`knobProps.gap`);
 * stack multiple sections with {@link FormSectionStack}, whose gap defaults
 * to the between-groups gap (`knobProps.gapLg`) — always one step larger, so
 * section rhythm stays larger than field rhythm at every space knob value.
 * Gallery **Fieldset** is this component (also
 * exported as {@link Fieldset}).
 */
export function FormSection({
  label,
  children,
  maxWidth = formReadableMaxWidth,
  gap,
  testID,
  fieldset = true,
  compact,
}: FormSectionProps) {
  const useFieldset = fieldset && isWeb;
  const { knobProps } = useResolvedKnobs(compact === undefined ? undefined : { compact });
  const resolvedGap = gap ?? knobProps.gap.gap;

  return (
    <YStack
      {...(useFieldset ? { render: 'fieldset' as const } : {})}
      data-mpo-form-section=""
      data-mpo-fieldset={useFieldset ? '' : undefined}
      data-field-gap={String(resolvedGap)}
      data-density={knobProps.density}
      data-size={knobProps.size}
      data-testid={testID}
      gap={resolvedGap as never}
      width="100%"
      maxWidth={maxWidth === 'fluid' ? undefined : maxWidth}
      alignSelf={maxWidth === 'fluid' ? undefined : 'flex-start'}
      // Reset browser fieldset chrome; we own spacing via tokens.
      {...(useFieldset
        ? {
            style: {
              borderWidth: 0,
              margin: 0,
              minWidth: 0,
              padding: 0,
            } as Record<string, unknown>,
          }
        : {})}>
      {label ? (
        useFieldset ? (
          <Text
            render="legend"
            data-mpo-legend=""
            {...knobProps.label}
            fontWeight="400"
            color={knobProps.textAccentColor}
            // legend is inline by default; stretch to a full heading row
            style={{ padding: 0, marginBottom: 0, float: 'left', width: '100%' } as never}>
            {label}
          </Text>
        ) : (
          <Text {...knobProps.label} fontWeight="400" color={knobProps.textAccentColor} role="heading" aria-level={3}>
            {label}
          </Text>
        )
      ) : null}
      {children}
    </YStack>
  );
}

/**
 * Gallery Fieldset — semantic fieldset/legend grouping.
 * Named export of {@link FormSection} (same API, form-section rhythm tokens).
 */
export function Fieldset(props: FormSectionProps) {
  return <FormSection {...props} />;
}
export type FieldsetProps = FormSectionProps;

export interface FormSectionStackProps {
  children: ReactNode;
  /**
   * Gap between sections. Defaults to the semantic between-groups gap
   * (`knobProps.gapLg`) — one step above the field gap at every space
   * knob value. Explicit values eject.
   */
  gap?: number | string;
}

/** Stacks FormSections with section > field spacing. */
export function FormSectionStack({ children, gap }: FormSectionStackProps) {
  const { knobProps } = useResolvedKnobs();
  const resolvedGap = gap ?? knobProps.gapLg.gap;
  return (
    <YStack
      data-mpo-form-section-stack=""
      data-section-gap={String(resolvedGap)}
      data-density={knobProps.density}
      data-size={knobProps.size}
      gap={resolvedGap as never}
      width="100%">
      {children}
    </YStack>
  );
}

export { formFieldGap, formReadableMaxWidth, formSectionGap } from './formSpacing';
