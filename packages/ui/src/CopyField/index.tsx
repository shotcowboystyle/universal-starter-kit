/**
 * CopyField — declared copy on a read-only Input.
 *
 * Second consumer of the reveal toggle's Input.Button end-cap.
 * Confirm is notify() success → toast "Copied to clipboard." Failure is
 * field-scoped "Copy failed." — an inline alert, never a toast.
 *
 * An earlier change removed the copy/onCopyResult pass while the forms half was
 * missing; the forms cap is implemented again (Input `copy` +
 * Input.Button `glyphRing`), so the pass is back.
 */
import { Input, type InputProps } from '@repo/forms';
import { YStack } from 'tamagui';

import { useCopyFeedback } from '../feedback/copy';
import { NotifyRegion } from '../feedback/NotifyHost';

export type CopyFieldProps = Omit<InputProps, 'copy' | 'onCopyResult' | 'secureTextEntry'>;

export function CopyField(props: CopyFieldProps) {
  const { region, report } = useCopyFeedback();
  return (
    <YStack width="100%">
      <Input {...props} readOnly copy onCopyResult={report} />
      <NotifyRegion scope="field" region={region} compact />
    </YStack>
  );
}
