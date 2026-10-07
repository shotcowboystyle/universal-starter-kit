import {
  Field,
  FieldLayout,
  Skeleton,
  getFieldError,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '@repo/forms';
import type { FormFieldProps, FieldComponentProps, Validator } from '@repo/forms';
/**
 * RichTextEditor with form integration
 *
 * Three-branch architecture following field architecture standard:
 * - Branch 1: Skeleton loading state
 * - Branch 2: Standalone (no form context)
 * - Branch 3: Form-integrated (with TanStack Form)
 *
 * Wraps RichEditor compound component with FieldLayout and validation.
 * Uses custom empty check for '<p></p>' which is Tiptap's empty state.
 */
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import type { RefObject } from 'react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { isWeb } from 'tamagui';

import { RichEditor } from '../RichEditor';
import { t } from '../shared/t';
import type { EditorCapabilities, RichEditorRef, RichTextMentionOptions, ToolbarSection } from '../types';

// ---------------------------------------------------------------------------
// Custom empty check for rich text
// ---------------------------------------------------------------------------

/**
 * Rich text empty check: treats null, undefined, empty string, and
 * Tiptap's default empty paragraph as empty values.
 */
export function richTextIsEmpty(v: unknown): boolean {
  return !v || v === '<p></p>' || v === '';
}

function applyExternalContent(editor: RichEditorRef | null, next: string, capabilities?: EditorCapabilities) {
  if (!editor) {
    return;
  }
  if (capabilities === 'markdown') {
    if (isWeb && editor.getMarkdown() === next) {
      return;
    }
    editor.setMarkdown(next);
    return;
  }
  if (isWeb && editor.getHTML() === next) {
    return;
  }
  editor.setHTML(next);
}

/**
 * Mirrors a host value (controlled `value` or TanStack field state) into the
 * editor after mount. Display-only: never emits onChange (LC-14).
 */
function RichTextExternalValueSync({
  value,
  editorRef,
  capabilities,
}: {
  value: string;
  editorRef: RefObject<RichEditorRef | null>;
  capabilities?: EditorCapabilities;
}) {
  const isFirst = useRef(true);
  const lastPushed = useRef(value);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      lastPushed.current = value;
      return;
    }
    if (value === lastPushed.current) {
      return;
    }
    lastPushed.current = value;
    applyExternalContent(editorRef.current, value, capabilities);
  }, [value, editorRef, capabilities]);
  return null;
}

function EditorFocusTarget({ id, editorRef }: { id: string; editorRef: RefObject<RichEditorRef | null> }) {
  if (!isWeb) {
    return null;
  }
  return (
    <textarea
      id={id}
      tabIndex={-1}
      aria-hidden
      readOnly
      value=""
      onFocus={(event) => {
        event.currentTarget.blur();
        editorRef.current?.focus();
      }}
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: 0,
        border: 0,
        opacity: 0,
        overflow: 'hidden',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RichTextEditorProps<
  TParentData = any,
  TName extends DeepKeys<TParentData> = any,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  'children' | 'field' | 'onChange'
> &
  Partial<
    Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children' | 'onChange'>
  > & {
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    onBlur?: (...args: any[]) => void;
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    minHeight?: number;
    maxHeight?: number;
    label?: React.ReactNode;
    labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
    helperText?: string;
    error?: string | boolean;
    required?: boolean;
    size?: SizeTokens;
    id?: string;
    /** Show the formatting toolbar (default: true) */
    showToolbar?: boolean;
    /** Use compact sizing for toolbar (default: false) */
    compact?: boolean;
    /** Show the bubble toolbar on text selection (default: false, web only) */
    showBubbleToolbar?: boolean;
    /** Toolbar sections to display (shows all when omitted) */
    sections?: ToolbarSection[];
    /**
     * Capability surface (default "full"). "markdown" constrains the editor
     * to markdown-expressible features and makes value/onChange markdown
     * strings instead of HTML.
     */
    capabilities?: EditorCapabilities;
    /** When true, renders a skeleton placeholder instead of the editor */
    skeleton?: boolean;
    /** Controlled fullscreen state (web; uncontrolled when omitted) */
    fullscreen?: boolean;
    /** Initial fullscreen state when uncontrolled (default: false) */
    defaultFullscreen?: boolean;
    /** Called when the fullscreen state changes */
    onFullscreenChange?: (fullscreen: boolean) => void;
    /**
     * Native only: render the embedded inline editor instead of the
     * preview + fullscreen edit modal (ignored on web)
     */
    inlineEditing?: boolean;
    /**
     * Uploads a pasted/dropped image and resolves its URL (web). Without it,
     * images are inlined as base64 data URIs.
     */
    onImageUpload?: (file: File) => Promise<string>;
    /**
     * Uploads a pasted/dropped non-image file and resolves its URL (web).
     * Inserts an attachment chip link; without it, non-image files are ignored.
     */
    onFileUpload?: (file: File) => Promise<{ url: string; name?: string }>;
    /** Enables the @ mention suggestion popup (web) */
    mentions?: RichTextMentionOptions;
  };

// ---------------------------------------------------------------------------
// RichTextEditor Component
// ---------------------------------------------------------------------------

export function RichTextEditor<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: RichTextEditorProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const {
    defaultValue = '',
    form,
    placeholder: placeholderProp,
    disabled,
    readOnly,
    minHeight = 150,
    maxHeight,
    mode,
    name,
    preserveValue,
    validators,
    label,
    labelProps,
    error: errorProp,
    helperText,
    required,
    size,
    id: idProp,
    value: controlledValue,
    onChange,
    onBlur,
    showToolbar = true,
    compact = false,
    showBubbleToolbar = false,
    sections,
    capabilities,
    skeleton,
    fullscreen,
    defaultFullscreen,
    onFullscreenChange,
    inlineEditing,
    onImageUpload,
    onFileUpload,
    mentions,
  } = props;

  const placeholder = placeholderProp ?? t('Write something...');
  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name, richTextIsEmpty);
  const editorRef = useRef<RichEditorRef>(null);
  const [internalValue, setInternalValue] = useState(controlledValue ?? defaultValue);

  const value = controlledValue ?? internalValue;

  const handleChange = useCallback(
    (html: string) => {
      setInternalValue(html);
      onChange?.(html);
    },
    [onChange],
  );

  const layoutBind = {
    id,
    label,
    labelProps,
    helperText,
    required,
    size,
    knobProps,
    disabled,
    purpose: 'description' as const,
    placeholder,
  };

  // ── Branch 1: Skeleton ──────────────────────────────────────────
  // LC-20: FieldLayout keeps live label/helper anatomy; only the control
  // chrome is the skeleton, sized to the editor's minHeight.
  if (skeleton) {
    return (
      <FieldLayout
        {...layoutBind}
        error={errorProp}>
        <Skeleton
          variant="rounded"
          width="100%"
          height={minHeight}
        />
      </FieldLayout>
    );
  }

  // ── Shared editor renderer ──────────────────────────────────────
  const renderEditor = (
    currentValue: string,
    onValueChange: (v: string) => void,
    handleBlur?: () => void,
    hasError?: boolean,
  ) => (
    <>
      <RichTextExternalValueSync
        value={currentValue}
        editorRef={editorRef}
        capabilities={capabilities}
      />
      <EditorFocusTarget
        id={id}
        editorRef={editorRef}
      />
      <RichEditor
        ref={editorRef}
        initialContent={currentValue}
        onChange={(html) => {
          onValueChange(html);
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        editable={!disabled && !readOnly}
        minHeight={minHeight}
        maxHeight={maxHeight}
        showToolbar={showToolbar}
        showBubbleToolbar={showBubbleToolbar}
        sections={sections}
        capabilities={capabilities}
        hasError={hasError}
        size={size}
        compact={compact}
        fullscreen={fullscreen}
        defaultFullscreen={defaultFullscreen}
        onFullscreenChange={onFullscreenChange}
        inlineEditing={inlineEditing}
        onImageUpload={onImageUpload}
        onFileUpload={onFileUpload}
        mentions={mentions}
      />
    </>
  );

  // ── Branch 2: Standalone (no form context) ──────────────────────
  if (!resolvedForm || !name) {
    return (
      <FieldLayout
        {...layoutBind}
        error={errorProp}
        onBlur={onBlur}>
        {renderEditor(value, handleChange, onBlur as any, !!errorProp)}
      </FieldLayout>
    );
  }

  // ── Branch 3: Form-integrated ───────────────────────────────────
  return (
    <Field
      defaultValue={defaultValue}
      form={resolvedForm}
      mode={mode}
      name={name}
      preserveValue={preserveValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, errorProp);
        const fieldValue = (field.state.value as string) ?? '';

        return (
          <FieldLayout
            {...layoutBind}
            error={resolvedError}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}>
            {renderEditor(
              fieldValue,
              (v) => {
                field.handleChange(v as any);
              },
              () => {
                field.handleBlur();
              },
              !!resolvedError,
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
}
