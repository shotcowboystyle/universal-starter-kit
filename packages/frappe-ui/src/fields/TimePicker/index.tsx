import type { TimePickerProps as FormsTimePickerProps } from '@repo/forms';
import { TimePicker as FormsTimePicker } from '@repo/forms';
import { ClockIcon } from '@phosphor-icons/react';
import { useProps } from 'tamagui';

export type TimePickerProps = FormsTimePickerProps;

/** Thin adapter — forwards helperText / readOnly / skeleton / compact via props spread. */
export function TimePicker(props: TimePickerProps) {
  const { helperText, readOnly, skeleton, compact, ...resolvedProps } = useProps(props) as TimePickerProps;
  return (
    <FormsTimePicker
      clockIcon={<ClockIcon size={16} />}
      helperText={helperText}
      readOnly={readOnly}
      skeleton={skeleton}
      compact={compact}
      {...resolvedProps}
    />
  );
}
