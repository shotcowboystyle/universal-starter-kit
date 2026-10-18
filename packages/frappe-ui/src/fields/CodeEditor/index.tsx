/**
 * CodeEditorField — dedicated renderer for the Frappe `Code` / `JSON`
 * fieldtypes: a monospace source pane plus a shiki-highlighted preview
 * (the unified components Highlighter, LC-16). Side-by-side at container
 * widths ≥ the house md breakpoint, Code/Preview tabs below it.
 *
 * The language follows the stock Frappe convention: the doctype field's
 * `df.options` names the language (Javascript, JS, Python, Py,
 * PythonExpression, HTML, CSS, Markdown, SCSS, JSON, Golang, Go, Jinja —
 * see frappe/public/js/frappe/form/controls/code.js). Map it with
 * `frappeCodeLanguage()` before passing the `language` prop.
 *
 * Full field contract: three-branch render (skeleton → standalone →
 * form-integrated), canonical `onChange(value)` (LC-14), FieldLayout slot
 * order, chromeless inside table cells (useIsInTableCell).
 */

import {
  Field,
  FieldLayout,
  Skeleton,
  TextArea,
  formCommonColors,
  getFieldError,
  mergeFieldHandler,
  useFormField,
  useIsInTableCell,
  useResolvedValidators,
} from '@repo/forms';
import type { AnyFormApi } from '@repo/forms';
import { sizeRecipeForToken, useResolvedKnobs } from '@repo/theme';
import { HighlightedCode, useShikiTokens } from '@repo/ui';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { FontSizeTokens, LabelProps, SizeTokens } from 'tamagui';
import { Paragraph, YStack } from 'tamagui';

import { EditorPreviewPanes, PreviewSurface } from '../shared/EditorPreviewPanes';

// ---------------------------------------------------------------------------
// Frappe df.options → shiki language
// ---------------------------------------------------------------------------

/**
 * Stock Frappe language options for the `Code` fieldtype (ControlCode
 * language_map keys), mapped to shiki language ids. Lookup is
 * case-insensitive; unknown/empty options fall back to plain text — the
 * Highlighter itself also degrades unknown languages to plain tokens.
 */
const FRAPPE_CODE_LANGUAGES: Record<string, string> = {
  javascript: 'javascript',
  js: 'javascript',
  python: 'python',
  py: 'python',
  pythonexpression: 'python',
  html: 'html',
  css: 'css',
  markdown: 'markdown',
  scss: 'scss',
  json: 'json',
  golang: 'go',
  go: 'go',
  jinja: 'jinja',
};

export function frappeCodeLanguage(options?: string | null): string {
  if (!options || typeof options !== 'string') {
    return 'text';
  }
  return FRAPPE_CODE_LANGUAGES[options.trim().toLowerCase()] ?? 'text';
}

// ---------------------------------------------------------------------------
// Preview (shiki tokens via the unified components Highlighter)
// ---------------------------------------------------------------------------

interface CodePreviewProps {
  value: string;
  language: string;
  compact?: boolean;
}

function CodePreview({ value, language, compact }: CodePreviewProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact });
  const tokens = useShikiTokens(value, language);
  const lineCount = value ? value.split('\n').length : 0;
  // Content type scale follows the size knob (same idiom as CodeBlock).
  const textSize = knobProps.sizeToken as FontSizeTokens;

  return (
    <PreviewSurface
      compact={compact}
      horizontalScroll>
      {value ? (
        <HighlightedCode
          tokens={tokens}
          showLineNumbers={lineCount > 10}>
          {/* Plain-text fallback while shiki loads (or if unavailable). */}
          <Paragraph
            size={textSize}
            fontFamily="$mono"
            whiteSpace="pre">
            {value}
          </Paragraph>
        </HighlightedCode>
      ) : (
        <Paragraph
          color={formCommonColors.muted}
          size={textSize}>
          {t('Nothing to preview')}
        </Paragraph>
      )}
    </PreviewSurface>
  );
}

// ---------------------------------------------------------------------------
// CodeEditorField
// ---------------------------------------------------------------------------

export interface CodeEditorFieldProps {
  name?: string;
  form?: AnyFormApi;
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
  /** Canonical change contract (LC-14): emits the code source string. */
  onChange?: (value: string) => void;
  onBlur?: (...args: any[]) => void;
  placeholder?: string;
  /**
   * Shiki language id (e.g. "python", "json"). Map a Frappe `df.options`
   * value with {@link frappeCodeLanguage}. Defaults to plain text.
   */
  language?: string;
  /** Minimum visible source rows (default 6). */
  minRows?: number;
  /** Maximum source rows before the textarea scrolls (default 16). */
  maxRows?: number;
  'aria-label'?: string;
}

export function CodeEditorField({
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
  language = 'text',
  minRows = 6,
  maxRows = 16,
  'aria-label': ariaLabel,
}: CodeEditorFieldProps) {
  const { t } = useTranslation();
  const { resolvedForm, knobProps, id } = useFormField({ form: formProp, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const inTableCell = useIsInTableCell();

  // Standalone/uncontrolled mirror so the highlighted preview always has the
  // current source (the form branch reads field state instead).
  const [internalValue, setInternalValue] = useState(value ?? defaultValue ?? '');
  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const accessibleName = ariaLabel ?? (typeof label === 'string' ? label : undefined) ?? placeholder;

  if (skeleton) {
    return (
      <YStack
        {...knobProps.gap}
        width="100%">
        {label && (
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

  const renderSource = (textValue: string, handleChange?: (text: string) => void, hasError?: boolean) => (
    <TextArea
      id={id}
      value={textValue}
      onChangeText={(text) => {
        if (disabled || readOnly) {
          return;
        }
        handleChange?.(text);
        onChange?.(text);
      }}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      error={hasError ? true : undefined}
      compact={compact}
      size={size}
      minRows={minRows}
      maxRows={maxRows}
      textAreaProps={{
        fontFamily: '$mono',
        // F14: TextArea's inner <textarea> takes radius from `size` unless
        // containerRadius lands after the size recipe. FieldLayout already
        // gets knobProps; the measured source surface must too.
        ...knobProps.containerRadius,
        autoCapitalize: 'none',
        autoCorrect: false,
        spellCheck: false,
        ...(accessibleName ? { 'aria-label': accessibleName } : {}),
      }}
    />
  );

  // Table cells get the chromeless source pane only (no tabs/preview chrome);
  // InputParts inside the forms TextArea detects the cell context itself.
  const renderControl = (textValue: string, handleChange?: (text: string) => void, hasError?: boolean) => {
    if (inTableCell) {
      return renderSource(textValue, handleChange, hasError);
    }
    return (
      <EditorPreviewPanes
        editor={renderSource(textValue, handleChange, hasError)}
        preview={
          <CodePreview
            value={textValue}
            language={language}
            compact={compact}
          />
        }
        editTabLabel={t('Code')}
        previewTabLabel={t('Preview')}
        compact={compact}
        defaultPreview={!!readOnly}
      />
    );
  };

  if (!resolvedForm || !name) {
    if (inTableCell) {
      return renderControl(internalValue, setInternalValue, !!error);
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
        {renderControl(internalValue, setInternalValue, !!error)}
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
        const fieldValue = typeof field.state.value === 'string' ? field.state.value : '';
        const handleChange = (text: string) => {
          field.handleChange(text as any);
        };
        if (inTableCell) {
          return renderControl(fieldValue, handleChange, !!resolvedError);
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
            {renderControl(fieldValue, handleChange, !!resolvedError)}
          </FieldLayout>
        );
      }}
    </Field>
  );
}
