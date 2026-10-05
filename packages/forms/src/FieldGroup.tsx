import { Preset, useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { Text, YStack, isWeb } from 'tamagui';

import { FormGrid, type FormGridColumns } from './FormGrid';

export interface FieldGroupProps {
  /** Visible legend / group label (required — fieldset grouping). */
  legend: string;
  children: ReactNode;
  /**
   * Multi-field horizontal group. Defaults to 1; use 2 for side-by-side pairs
   * that collapse on narrow containers via FormGrid.
   */
  columns?: FormGridColumns;
  /**
   * Gap between fields. Defaults to the space recipe (`knobProps.gap`).
   * Density/space, never `sizeToken`.
   */
  gap?: number | string;
  /** Nested scale. Omit to inherit the nearest Preset density. */
  compact?: boolean;
}

/**
 * Groups related fields with a legend (fieldset on web).
 *
 * Polaris FormLayout.Group / GOV.UK fieldset: related short fields only
 * (name, city/postcode). Field gap follows the space knob; nest inside
 * {@link FormSection} so section spacing stays larger than field spacing.
 * `compact` wraps descendants in a compact density Preset so nested
 * fields inherit the same gaps without a per-field prop.
 */
export function FieldGroup({ legend, children, columns = 1, gap, compact }: FieldGroupProps) {
  const { knobProps } = useResolvedKnobs(compact === undefined ? undefined : { compact });
  const resolvedGap = gap ?? knobProps.gap.gap;
  const useFieldset = isWeb;
  const body =
    columns > 1 ? (
      <FormGrid columns={columns} gap={resolvedGap} compact={compact}>
        {children}
      </FormGrid>
    ) : (
      children
    );

  const group = (
    <YStack
      {...(useFieldset ? { render: 'fieldset' as const } : {})}
      data-mpo-field-group=""
      data-columns={columns}
      data-field-gap={String(resolvedGap)}
      data-density={knobProps.density}
      data-size={knobProps.size}
      gap={resolvedGap as never}
      width="100%"
      minWidth={0}
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
      {useFieldset ? (
        <Text
          render="legend"
          data-mpo-legend=""
          {...knobProps.label}
          fontWeight="400"
          color={knobProps.textAccentColor}
          style={{ padding: 0, marginBottom: 0, float: 'left', width: '100%' } as never}>
          {legend}
        </Text>
      ) : (
        <Text
          data-mpo-legend=""
          {...knobProps.label}
          fontWeight="400"
          color={knobProps.textAccentColor}
          role="heading"
          aria-level={3}>
          {legend}
        </Text>
      )}
      {body}
    </YStack>
  );

  return compact ? <Preset overrides={{ density: 'compact' }}>{group}</Preset> : group;
}
