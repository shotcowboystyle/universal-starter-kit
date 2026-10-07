/**
 * Frappe Text Editor — thin adapter over the house RichTextEditor.
 * Design-law lives here: do not fork TipTap toolbar chrome. Native keeps its
 * own module so TipTap/ProseMirror stay off the Hermes graph.
 */
import { RichTextEditor } from '@repo/rich-text';
import { YStack } from 'tamagui';

import type { TextEditorProps } from './types';

export type { TextEditorProps } from './types';

export function TextEditor({
  label,
  value,
  onChange,
  disabled,
  required,
  error,
  helperText,
  readOnly,
  skeleton,
  compact,
  placeholder,
  minHeight = 200,
  ...rest
}: TextEditorProps) {
  const resolvedMinHeight = minHeight ?? (compact ? 100 : 200);
  return (
    <YStack {...rest}>
      <RichTextEditor
        label={label}
        value={value}
        onChange={(html) => {
          onChange(html);
        }}
        disabled={disabled}
        required={required}
        error={error}
        helperText={helperText}
        readOnly={readOnly}
        skeleton={skeleton}
        compact={compact}
        placeholder={placeholder}
        minHeight={resolvedMinHeight}
      />
    </YStack>
  );
}
