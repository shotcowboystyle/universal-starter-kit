/**
 * MarkdownEditorField — dedicated renderer for the Frappe `Markdown Editor`
 * fieldtype: the canonical house rich text editor constrained to markdown
 * capabilities (LC-52 MARKDOWN-EXPRESSIBLE-EDITING). WYSIWYG editing whose
 * surface is exactly what GFM can express — no highlight, underline, text
 * color, or alignment — with `value`/`onChange` staying markdown strings
 * (Frappe stores markdown text for this fieldtype).
 *
 * Full field contract: three-branch render (skeleton → standalone →
 * form-integrated), canonical `onChange(value)` (LC-14), FieldLayout slot
 * order, chromeless inside table cells (useIsInTableCell).
 *
 * Native renders the markdown source + preview fallback (see
 * `index.native.tsx`) — 10Tap cannot honestly express the capability
 * constraint, and a lookalike would violate the honest-gating posture.
 */

import {
  Field,
  FieldLayout,
  Skeleton,
  getFieldError,
  mergeFieldHandler,
  useFormField,
  useIsInTableCell,
  useResolvedValidators,
} from '@repo/forms';
import type { AnyFormApi } from '@repo/forms';
import { RichEditor } from '@repo/rich-text';
import type { RichEditorRef } from '@repo/rich-text';
import { sizeRecipeForToken } from '@repo/theme';
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { YStack } from 'tamagui';

/** Approximate source-row height used to map the row props onto the editor */
const ROW_HEIGHT = 24;

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

export interface MarkdownEditorFieldProps {
  name?: string;
  form?: AnyFormApi;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors the forms FieldValidators shape; validator keys are TanStack's
  validators?: Record<string, unknown>;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  skeleton?: boolean;
  compact?: boolean;
  size?: SizeTokens;
  id?: string;
  value?: string;
  defaultValue?: string;
  /** Canonical change contract (LC-14): emits the markdown source string. */
  onChange?: (value: string) => void;
  onBlur?: ComponentProps<typeof FieldLayout>['onBlur'];
  placeholder?: string;
  /** Minimum visible content rows (default 6). */
  minRows?: number;
  /** Maximum content rows before the editor scrolls (default 16). */
  maxRows?: number;
  'aria-label'?: string;
}

export const MarkdownEditorField = ({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  disabled,
  readOnly,
  skeleton,
  compact,
  size,
  id: idProp,
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder,
  minRows = 6,
  maxRows = 16,
  'aria-label': ariaLabel,
}: MarkdownEditorFieldProps) => {
  const { resolvedForm, knobProps, id } = useFormField({ form: formProp, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const inTableCell = useIsInTableCell();

  const editorRef = useRef<RichEditorRef>(null);
  // Last markdown the editor emitted (or was seeded with) — distinguishes
  // echo renders from real external value changes so programmatic sync
  // never clobbers the caret.
  const lastEmittedRef = useRef<string>(value ?? defaultValue ?? '');
  const [internalValue, setInternalValue] = useState(value ?? defaultValue ?? '');

  // External (controlled) value change: push into the editor without
  // emitting onChange back (setMarkdown is emitUpdate: false).
  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- semi-controlled: typed markdown stays visible until the parent pushes a new value
  useEffect(() => {
    if (value === undefined) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-derived-state -- adopts the controlled `value` prop into display state
    setInternalValue(value);
    if (value !== lastEmittedRef.current) {
      lastEmittedRef.current = value;
      editorRef.current?.setMarkdown(value);
    }
  }, [value]);

  if (skeleton) {
    return (
      <YStack
        {...knobProps.gap}
        width="100%">
        {Boolean(label) && (
          <Skeleton
            variant="text"
            width="30%"
            height={sizeRecipeForToken(knobProps.sizeToken).fontSize}
          />
        )}
        <Skeleton
          variant="rounded"
          width="100%"
          height={compact ? 120 : 200}
        />
      </YStack>
    );
  }

  const renderControl = (
    markdownValue: string,
    handleChange?: (markdown: string) => void,
    handleFieldBlur?: () => void,
    hasError = false,
  ) => (
    <RichEditor
      ref={editorRef}
      capabilities="markdown"
      initialContent={markdownValue}
      onChange={(markdown) => {
        if (disabled || readOnly) {
          return;
        }
        lastEmittedRef.current = markdown;
        handleChange?.(markdown);
        onChange?.(markdown);
      }}
      onBlur={handleFieldBlur}
      placeholder={placeholder}
      editable={!disabled && !readOnly}
      minHeight={minRows * ROW_HEIGHT}
      maxHeight={maxRows * ROW_HEIGHT}
      hasError={hasError}
      size={size}
      compact={compact ?? inTableCell}
      // Table cells stay chromeless: no fixed toolbar, bubble on selection.
      showToolbar={!inTableCell}
      showBubbleToolbar={inTableCell}
    />
  );

  if (!resolvedForm || name === undefined || name === '') {
    const standaloneControl = renderControl(internalValue, setInternalValue, onBlur, hasErrorValue(error));
    if (inTableCell) {
      return standaloneControl;
    }
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={error}
        helperText={helperText}
        required={required}
        disabled={disabled}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        aria-label={ariaLabel}
        placeholder={placeholder}>
        {standaloneControl}
      </FieldLayout>
    );
  }

  return (
    <Field
      form={resolvedForm}
      name={name}
      defaultValue={defaultValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the form value is untyped; only a string is editor source
        const fieldValue = typeof field.state.value === 'string' ? field.state.value : '';
        const handleChange = (markdown: string) => {
          field.handleChange(markdown);
        };
        const formControl = renderControl(
          fieldValue,
          handleChange,
          () => {
            field.handleBlur();
          },
          hasErrorValue(resolvedError),
        );
        if (inTableCell) {
          return formControl;
        }
        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError}
            helperText={helperText}
            required={required}
            disabled={disabled}
            size={size}
            knobProps={knobProps}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
            aria-label={ariaLabel}
            placeholder={placeholder}>
            {formControl}
          </FieldLayout>
        );
      }}
    </Field>
  );
};
