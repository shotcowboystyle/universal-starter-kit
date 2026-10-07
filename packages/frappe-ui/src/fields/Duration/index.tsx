import type { DurationProps as FormsDurationProps } from '@repo/forms';
import { Duration as FormsDuration } from '@repo/forms';
import { ClockIcon } from '@phosphor-icons/react';
import { useProps } from 'tamagui';

export type DurationProps = FormsDurationProps;

/** Thin adapter — forwards helperText / readOnly / skeleton / compact via props spread. */
export function Duration(props: DurationProps) {
  const { helperText, readOnly, skeleton, compact, ...resolvedProps } = useProps(props) as DurationProps;
  return (
    <FormsDuration
      clockIcon={<ClockIcon size={16} />}
      helperText={helperText}
      readOnly={readOnly}
      skeleton={skeleton}
      compact={compact}
      {...resolvedProps}
    />
  );
}
