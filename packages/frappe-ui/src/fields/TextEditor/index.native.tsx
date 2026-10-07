import { RichTextEditor } from '@repo/rich-text';
import { YStack } from 'tamagui';

import type { TextEditorProps } from './types';

export type { TextEditorProps } from './types';

/**
 * Native TextEditor.
 *
 * Routes through the `@repo/rich-text` wrapper, whose native build
 * renders the `@10play/tentap-editor` WebView editor. This keeps `@tiptap` +
 * `prosemirror` (web-only DOM) out of the Hermes bundle while preserving the
 * same HTML `value` / `onChange(html)` contract as the web `TextEditor`.
 */
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
        onChange={(v: any) => {
          onChange(v);
        }}
        disabled={disabled ?? readOnly}
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
