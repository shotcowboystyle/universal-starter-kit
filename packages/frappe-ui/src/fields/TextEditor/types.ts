import type { YStackProps } from 'tamagui';

export interface TextEditorProps extends Omit<YStackProps, 'children' | 'onChange'> {
  label?: string;
  /** HTML string value */
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  error?: string;
  helperText?: string;
  placeholder?: string;
  /** Minimum height in pixels (default 200, 100 when compact) */
  minHeight?: number;
  /** When true, renders a skeleton placeholder instead of the editor */
  skeleton?: boolean;
  /** When true, uses compact sizing */
  compact?: boolean;
}
