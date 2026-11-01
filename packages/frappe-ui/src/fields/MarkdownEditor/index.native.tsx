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
import type { ComponentProps, ComponentType, ReactNode } from 'react';
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
const loadMarkdownRenderer = async (): Promise<MarkdownComponent> => {
  const mod = await import('@repo/markdown');
  // SAFETY: Markdown renders its markdown source from a string `children`, which is all the preview passes it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  markdownRendererCache = mod.Markdown as MarkdownComponent;
  return markdownRendererCache;
};

const useMarkdownRenderer = (enabled: boolean): MarkdownComponent | null => {
  const [renderer, setRenderer] = useState<MarkdownComponent | null>(markdownRendererCache);

  useEffect(() => {
    if (!enabled || renderer) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const loaded = await loadMarkdownRenderer();
        if (!cancelled) {
          setRenderer(() => loaded);
        }
      } catch {
        // Safe to continue: renderer unavailable — the plain-text fallback below stays up.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, renderer]);

  return renderer;
};

interface MarkdownPreviewProps {
  value: string;
  compact?: boolean;
}

const MarkdownPreview = ({ value, compact }: MarkdownPreviewProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact });
  const Renderer = useMarkdownRenderer(value !== '');
  // Content type scale follows the size knob (same idiom as CodeBlock).
  // SAFETY: the size knob resolves to a `$n` size token, and tamagui's font scale defines the same `$n` keys.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const textSize = knobProps.sizeToken as FontSizeTokens;

  let content: ReactNode;
  if (value === '') {
    content = (
      <Paragraph
        color={formCommonColors.muted}
        size={textSize}>
        {t('Nothing to preview')}
      </Paragraph>
    );
  } else if (Renderer) {
    // oxlint-disable-next-line react/static-components -- Renderer is the module-cached lazy import; its identity never changes after load
    content = <Renderer>{value}</Renderer>;
  } else {
    // Loading / renderer unavailable: honest plain-text fallback.
    content = (
      <Paragraph
        size={textSize}
        whiteSpace="pre-wrap">
        {value}
      </Paragraph>
    );
  }

  return <PreviewSurface compact={compact}>{content}</PreviewSurface>;
};

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

// ---------------------------------------------------------------------------
// MarkdownEditorField
// ---------------------------------------------------------------------------

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
  /** Minimum visible source rows (default 6). */
  minRows?: number;
  /** Maximum source rows before the textarea scrolls (default 16). */
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
  const { t } = useTranslation();
  const { resolvedForm, knobProps, id } = useFormField({ form: formProp, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const inTableCell = useIsInTableCell();

  // Standalone/uncontrolled mirror so the live preview always has the current
  // source (the form branch reads field state instead).
  const [internalValue, setInternalValue] = useState(value ?? defaultValue ?? '');
  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- semi-controlled: typed text stays visible until the parent pushes a new value
  useEffect(() => {
    if (value !== undefined) {
      // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-derived-state -- adopts the controlled `value` prop into display state
      setInternalValue(value);
    }
  }, [value]);

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode has no discriminant; only a string label is usable as an accessible name
  const accessibleName = ariaLabel ?? (typeof label === 'string' ? label : undefined) ?? placeholder;

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

  const textAreaProps: ComponentProps<typeof TextArea>['textAreaProps'] = {
    fontFamily: '$mono',
    autoCapitalize: 'none',
    autoCorrect: false,
    spellCheck: false,
  };
  if (accessibleName !== undefined && accessibleName !== '') {
    textAreaProps['aria-label'] = accessibleName;
  }

  const renderSource = (textValue: string, handleChange?: (text: string) => void, hasError = false) => (
    <TextArea
      id={id}
      value={textValue}
      onChange={(text) => {
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
      textAreaProps={textAreaProps}
    />
  );

  // Table cells get the chromeless source pane only (no tabs/preview chrome);
  // InputParts inside the forms TextArea detects the cell context itself.
  const renderControl = (textValue: string, handleChange?: (text: string) => void, hasError = false) => {
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

  if (!resolvedForm || name === undefined || name === '') {
    if (inTableCell) {
      return renderControl(internalValue, setInternalValue, hasErrorValue(error));
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
        {renderControl(internalValue, setInternalValue, hasErrorValue(error))}
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
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the form value is untyped; only a string is markdown source
        const fieldValue = typeof field.state.value === 'string' ? field.state.value : '';
        const handleChange = (text: string) => {
          field.handleChange(text);
        };
        if (inTableCell) {
          return renderControl(fieldValue, handleChange, hasErrorValue(resolvedError));
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
            {renderControl(fieldValue, handleChange, hasErrorValue(resolvedError))}
          </FieldLayout>
        );
      }}
    </Field>
  );
};
