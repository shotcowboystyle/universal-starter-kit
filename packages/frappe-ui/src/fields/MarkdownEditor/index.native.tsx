/**
 * MarkdownEditorField (NATIVE fallback) — markdown source pane with a live
 * rendered preview (house `@repo/markdown` renderer).
 *
 * The web tier renders the canonical rich text editor constrained to
 * markdown capabilities (LC-52 MARKDOWN-EXPRESSIBLE-EDITING). On native the
 * 10Tap WebView cannot express that constraint honestly tonight (extension
 * gating + markdown serialization live in the web bundle), so this tier
 * keeps plain markdown source editing — documented fallback, not a parallel
 * WYSIWYG implementation.
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
import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { FontSizeTokens, LabelProps, SizeTokens } from 'tamagui';
import { Paragraph, YStack } from 'tamagui';

import { EditorPreviewPanes, PreviewSurface } from '../shared/EditorPreviewPanes';

// ---------------------------------------------------------------------------
// Preview (lazy house Markdown renderer)
// ---------------------------------------------------------------------------

type MarkdownComponent = ComponentType<{ children?: string }>;

// Module-level cache so the renderer loads once per session, not per field.
let markdownRendererCache: MarkdownComponent | null = null;

/**
 * The house Markdown renderer loads on demand the first time a preview pane
 * renders (same optional-dependency pattern as the components shiki
 * Highlighter): `@repo/markdown` reaches consumers transitively
 * via `@repo/rich-text`, and a failed import degrades to a
 * plain-text preview instead of crashing the field.
 */
function useMarkdownRenderer(enabled: boolean): MarkdownComponent | null {
  const [renderer, setRenderer] = useState<MarkdownComponent | null>(markdownRendererCache);

  useEffect(() => {
    if (!enabled || renderer) {
      return;
    }
    let cancelled = false;
    import('@repo/markdown')
      .then((mod) => {
        markdownRendererCache = mod.Markdown as MarkdownComponent;
        if (!cancelled) {
          setRenderer(() => markdownRendererCache);
        }
      })
      .catch(() => {
        // Renderer unavailable — the plain-text fallback below stays up.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, renderer]);

  return renderer;
}

interface MarkdownPreviewProps {
  value: string;
  compact?: boolean;
}

function MarkdownPreview({ value, compact }: MarkdownPreviewProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact });
  const Renderer = useMarkdownRenderer(!!value);
  // Content type scale follows the size knob (same idiom as CodeBlock).
  const textSize = knobProps.sizeToken as FontSizeTokens;

  return (
    <PreviewSurface compact={compact}>
      {value ? (
        Renderer ? (
          <Renderer>{value}</Renderer>
        ) : (
          // Loading / renderer unavailable: honest plain-text fallback.
          <Paragraph
            size={textSize}
            whiteSpace="pre-wrap">
            {value}
          </Paragraph>
        )
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
// MarkdownEditorField
// ---------------------------------------------------------------------------

export interface MarkdownEditorFieldProps {
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
  /** Canonical change contract (LC-14): emits the markdown source string. */
  onChange?: (value: string) => void;
  onBlur?: (...args: any[]) => void;
  placeholder?: string;
  /** Minimum visible source rows (default 6). */
  minRows?: number;
  /** Maximum source rows before the textarea scrolls (default 16). */
  maxRows?: number;
  'aria-label'?: string;
}

export function MarkdownEditorField({
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
}: MarkdownEditorFieldProps) {
  const { t } = useTranslation();
  const { resolvedForm, knobProps, id } = useFormField({ form: formProp, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const inTableCell = useIsInTableCell();

  // Standalone/uncontrolled mirror so the live preview always has the current
  // source (the form branch reads field state instead).
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
          <MarkdownPreview
            value={textValue}
            compact={compact}
          />
        }
        editTabLabel={t('Write')}
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
