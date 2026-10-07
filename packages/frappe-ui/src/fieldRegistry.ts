/**
 * Field type renderer registry for schema-driven forms.
 *
 * Maps field type strings to React components that conform to
 * the standardized `FieldRenderProps` interface. Registers the 18
 * generic field components from @repo/forms by default.
 */

import { Button, CheckboxGroup, Combobox, ImageField, Skeleton } from '@repo/forms';
import { useDocTypeMeta } from '@repo/frappe';
import type { FrappeFieldType } from '@repo/frappe';
import { ChildTable } from '@repo/table';
import type { ChildCellHidden, DataTableCellRenderContext, DataTableField } from '@repo/table';
import React, { useMemo } from 'react';
import type { ComponentType } from 'react';

import { compileDependsOn } from './dependsOn';
import type { DependsDoc, DependsEvaluator } from './dependsOn';
import { Barcode } from './fields/Barcode';
import { Check } from './fields/Check';
import type { CheckProps } from './fields/Check';
import { CodeEditorField, frappeCodeLanguage } from './fields/CodeEditor';
import { Color } from './fields/Color';
import { Data } from './fields/Data';
import { Date as DateComponent } from './fields/Date';
import { DateRangeField } from './fields/DateRange';
import { Duration } from './fields/Duration';
import { DynamicLink } from './fields/DynamicLink';
import { FileUploadField } from './fields/FileUploadField';
import { Geolocation } from './fields/Geolocation';
import { Heading } from './fields/Heading';
import { Html } from './fields/HTML';
import { Icon } from './fields/Icon';
import { Link } from './fields/Link';
import { LongText } from './fields/LongText';
import { MarkdownEditorField } from './fields/MarkdownEditor';
import { MentionInputField } from './fields/MentionInput';
import { Numeric } from './fields/Numeric';
import { OTPInputField } from './fields/OTPInput';
import { Password } from './fields/Password';
import { Phone } from './fields/Phone';
import { ProgressField } from './fields/Progress';
import { RadioGroupField } from './fields/RadioGroup';
import { Rating } from './fields/Rating';
import { ReadOnly } from './fields/ReadOnly';
import { Select as SelectComponent } from './fields/Select';
import { Signature } from './fields/Signature';
import { SliderField } from './fields/Slider';
import { SmallText } from './fields/SmallText';
import { SwitchField } from './fields/Switch';
import { TableMultiSelect } from './fields/TableMultiSelect';
import { TimePicker } from './fields/TimePicker';
import { ToggleGroupField } from './fields/ToggleGroup';
import { useFrappeConfig } from './FrappeProvider';
import { parseChoiceOptions, resolveChoiceControl } from './resolveControl';
import type { ChoiceControl, CommitMode } from './resolveControl';

const LazyTextEditor = React.lazy(
  async () =>
    await import('./fields/TextEditor').then((mod) => ({
      default: mod.TextEditor,
    })),
);

// ---------------------------------------------------------------------------
// FieldRenderProps
// ---------------------------------------------------------------------------

/** Minimal field schema definition (generic, not tied to any framework). */
export interface FieldSchema {
  type: string;
  name: string;
  label?: string;
  options?: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  readOnly?: boolean;
  precision?: number;
  /** Max character length for text entry (Frappe df.length). */
  maxLength?: number;
  depends_on?: string;
  /** Multi-select choice field (Select-like). */
  multiple?: boolean;
  /** Commit semantics for boolean control heuristics (DG-CTRL-02). */
  commit?: CommitMode;
  /** Explicit control eject hatch (DG-CTRL-06). */
  control?: ChoiceControl;
  [key: string]: unknown;
}

/** Standard props that every field component receives when rendered by the schema form. */
export interface FieldRenderProps {
  label?: string;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  /** Render the field as a read-only (focusable, immutable) representation. */
  readOnly?: boolean;
  /** Render a skeleton placeholder instead of the live field. */
  skeleton?: boolean;
  /** Use compact sizing. */
  compact?: boolean;
  /** Helper / description text (falls back to fieldMeta.description in adapters). */
  helperText?: string;
  required?: boolean;
  error?: string;
  fieldMeta?: FieldSchema;
  /** For Link-like fields: target entity type */
  doctype?: string;
  /** For Select fields: newline-separated options string or other config */
  options?: string;
  /** For Table fields: the form doc child `depends_on` reads as `parent`. */
  parentDoc?: Record<string, unknown>;
  /** Allow pass-through props */
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, ComponentType<FieldRenderProps>>();

/**
 * Register a fieldtype in the MODULE-GLOBAL default table.
 *
 * This is the seam for adding new fieldtypes app-wide. It is DEPRECATED as an
 * override channel: writing it per provider instance clobbers every other
 * provider on the page (last render wins, silently). Per-subtree overrides
 * belong on `FieldOverridesProvider` (fieldOverrides.tsx), which SchemaForm
 * consults before this table. Only a `FrappeFieldType` registers: the union
 * is the authority on what a fieldtype may be (MPO-15).
 */
export function registerField(fieldtype: FrappeFieldType, component: ComponentType<FieldRenderProps>): void {
  registry.set(fieldtype, component);
}

export function getFieldComponent(fieldtype: string): ComponentType<FieldRenderProps> | undefined {
  return registry.get(fieldtype);
}

// ---------------------------------------------------------------------------
// Adapter components — existing field types
// ---------------------------------------------------------------------------

/**
 * Thin-adapter contract props shared by every field wrapper: forwards
 * readOnly / skeleton / compact plus helper text (df `description` fallback).
 */
function passthroughProps(props: FieldRenderProps) {
  return {
    helperText: props.helperText ?? props.fieldMeta?.description,
    readOnly: props.readOnly,
    skeleton: props.skeleton,
    compact: props.compact,
  };
}

/**
 * DOM-level input block for disabled text-entry fields. Tamagui's web
 * `<input>` consumes the `disabled` prop as aria-disabled only, so a disabled
 * field would still accept keystrokes; `readOnly`/`tabIndex` do reach the DOM,
 * so use them to actually block typing and keyboard focus.
 */
function disabledInputBlock(props: FieldRenderProps) {
  return props.disabled ? { inputProps: { readOnly: true, tabIndex: -1 } } : undefined;
}

function disabledTextAreaBlock(props: FieldRenderProps) {
  return props.disabled ? { textAreaProps: { readOnly: true, tabIndex: -1 } } : undefined;
}

function DataAdapter(props: FieldRenderProps) {
  return React.createElement(Data, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    // Frappe df.length caps text entry (Data default 140 lives in the field).
    maxLength: props.fieldMeta?.maxLength,
    ...passthroughProps(props),
    ...disabledInputBlock(props),
    type: props.type,
  });
}

/**
 * Frappe `Autocomplete`: a searchable combobox over the static df.options
 * list. Free text stays allowed (stock autocomplete suggests, never
 * restricts), so the combobox is creatable and an off-list value still
 * displays itself in the trigger.
 */
function AutocompleteAdapter(props: FieldRenderProps) {
  const rawOptions = props.fieldMeta?.options ?? props.options ?? '';
  const options = parseChoiceOptions(rawOptions);
  const value =
    typeof props.value === 'string'
      ? props.value
      : props.value !== null && props.value !== undefined
        ? String(props.value)
        : '';
  return React.createElement(Combobox, {
    label: props.label,
    value,
    onChange: props.onChange,
    options,
    placeholder: props.placeholder,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    creatable: true,
    onCreate: (next: string) => ({ label: next, value: next }),
    valueLabel: value || undefined,
    ...passthroughProps(props),
  });
}

function NumericAdapter(type: 'Int' | 'Float' | 'Currency' | 'Percent') {
  return function NumericAdapter(props: FieldRenderProps) {
    return React.createElement(Numeric, {
      label: props.label,
      value: typeof props.value === 'number' ? props.value : props.value == null ? undefined : Number(props.value),
      onChange: props.onChange,
      type,
      disabled: props.disabled,
      required: props.required,
      error: props.error,
      ...passthroughProps(props),
      ...disabledInputBlock(props),
      precision: props.fieldMeta?.precision,
    });
  };
}

function choiceControlFromProps(props: FieldRenderProps): ChoiceControl | undefined {
  const raw = props.control ?? props.fieldMeta?.control;
  return typeof raw === 'string' ? (raw as ChoiceControl) : undefined;
}

function commitModeFromProps(props: FieldRenderProps, fallback: CommitMode = 'deferred'): CommitMode {
  const raw = props.commit ?? props.fieldMeta?.commit;
  return raw === 'immediate' || raw === 'deferred' ? raw : fallback;
}

function SelectAdapter(props: FieldRenderProps) {
  const rawOptions = props.fieldMeta?.options ?? props.options ?? '';
  const options = parseChoiceOptions(rawOptions);
  const multiple = !!(props.multiple ?? props.fieldMeta?.multiple);
  const kind = resolveChoiceControl({
    options,
    multiple,
    commit: commitModeFromProps(props),
    control: choiceControlFromProps(props),
  });

  const shared = {
    label: props.label,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  };

  if (kind === 'radio') {
    return React.createElement(RadioGroupField, {
      ...shared,
      value: props.value ?? '',
      onChange: props.onChange,
      options,
    });
  }

  if (kind === 'combobox') {
    const value = multiple
      ? Array.isArray(props.value)
        ? props.value.map(String)
        : props.value != null && props.value !== ''
          ? [String(props.value)]
          : []
      : (props.value ?? '');
    return React.createElement(Combobox, {
      ...shared,
      value,
      onChange: props.onChange,
      options,
      multiple,
      placeholder: props.placeholder,
    });
  }

  if (kind === 'checkboxGroup') {
    const value = Array.isArray(props.value)
      ? props.value.map(String)
      : props.value != null && props.value !== ''
        ? [String(props.value)]
        : [];
    return React.createElement(CheckboxGroup, {
      ...shared,
      value,
      onChange: props.onChange,
      options,
    });
  }

  if (kind === 'toggle') {
    return React.createElement(ToggleGroupField, {
      ...shared,
      value: props.value ?? '',
      onChange: props.onChange,
      options,
    });
  }

  if (kind === 'switch') {
    return React.createElement(SwitchField, {
      ...shared,
      value: !!props.value,
      onChange: ((val: boolean) => {
        props.onChange(val ? 1 : 0);
      }) as any,
    });
  }

  if (kind === 'checkbox') {
    return React.createElement(Check, {
      ...shared,
      value: !!props.value,
      onChange: (val: boolean) => {
        props.onChange(val ? 1 : 0);
      },
    } as CheckProps);
  }

  return React.createElement(SelectComponent, {
    ...shared,
    value: props.value ?? '',
    onChange: props.onChange,
    options: options.map((o) => o.value),
    placeholder: props.placeholder,
  });
}

function CheckAdapter(props: FieldRenderProps) {
  const kind = resolveChoiceControl({
    boolean: true,
    commit: commitModeFromProps(props, 'deferred'),
    control: choiceControlFromProps(props),
  });

  if (kind === 'switch') {
    return SwitchAdapter(props);
  }

  return React.createElement(Check, {
    label: props.label,
    value: !!props.value,
    onChange: (val: boolean) => {
      props.onChange(val ? 1 : 0);
    },
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  } as CheckProps);
}

function DateAdapter(type: 'date' | 'datetime' | 'time') {
  return function DateAdapter(props: FieldRenderProps) {
    return React.createElement(DateComponent, {
      label: props.label,
      value: props.value ?? '',
      onChange: props.onChange,
      type,
      disabled: props.disabled,
      required: props.required,
      error: props.error,
      ...passthroughProps(props),
      ...disabledInputBlock(props),
    });
  };
}

function ColorAdapter(props: FieldRenderProps) {
  return React.createElement(Color, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

function IconAdapter(props: FieldRenderProps) {
  const rawOptions = props.fieldMeta?.options ?? props.options ?? '';
  return React.createElement(Icon, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    options: typeof rawOptions === 'string' ? rawOptions : undefined,
    ...passthroughProps(props),
  });
}

function SmallTextAdapter(props: FieldRenderProps) {
  return React.createElement(SmallText, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
    ...disabledTextAreaBlock(props),
  });
}

function LongTextAdapter(props: FieldRenderProps) {
  return React.createElement(LongText, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
    ...disabledTextAreaBlock(props),
  });
}

function TextEditorAdapter(props: FieldRenderProps) {
  return React.createElement(
    React.Suspense,
    {
      fallback: React.createElement(Skeleton, {
        width: '100%',
        height: 160,
        'aria-label': 'Loading editor',
      }),
    },
    React.createElement(LazyTextEditor, {
      label: props.label,
      value: props.value ?? '',
      onChange: props.onChange,
      disabled: props.disabled,
      required: props.required,
      error: props.error,
      ...passthroughProps(props),
    }),
  );
}

function MarkdownEditorAdapter(props: FieldRenderProps) {
  return React.createElement(MarkdownEditorField, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    placeholder: props.placeholder,
    ...passthroughProps(props),
  });
}

/**
 * Frappe `Code`: df.options names the language (stock ControlCode
 * language_map — Javascript, JS, Python, Py, PythonExpression, HTML, CSS,
 * Markdown, SCSS, JSON, Golang, Go, Jinja).
 */
function CodeEditorAdapter(props: FieldRenderProps) {
  const rawOptions =
    typeof props.fieldMeta?.options === 'string'
      ? props.fieldMeta.options
      : typeof props.options === 'string'
        ? props.options
        : undefined;
  return React.createElement(CodeEditorField, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    placeholder: props.placeholder,
    language: frappeCodeLanguage(rawOptions),
    ...passthroughProps(props),
  });
}

/** Frappe `JSON`: language pinned to json regardless of df.options. */
function JsonEditorAdapter(props: FieldRenderProps) {
  return React.createElement(CodeEditorField, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    placeholder: props.placeholder,
    language: 'json',
    ...passthroughProps(props),
  });
}

function HtmlAdapter(props: FieldRenderProps) {
  return React.createElement(Html, {
    label: props.label,
    value: props.value ?? '',
    error: props.error,
    disabled: props.disabled,
    required: props.required,
    ...passthroughProps(props),
  });
}

/**
 * Frappe `Image` is a display-only widget: it previews the image whose URL
 * lives in the field named by df.options (SchemaForm resolves that value).
 * The field itself holds no editable data, so it always renders read-only.
 */
function ImageAdapter(props: FieldRenderProps) {
  return React.createElement(ImageField, {
    label: props.label,
    value: typeof props.value === 'string' && props.value ? props.value : null,
    error: props.error,
    ...passthroughProps(props),
    readOnly: true,
  });
}

function PasswordAdapter(props: FieldRenderProps) {
  return React.createElement(Password, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
    ...disabledInputBlock(props),
  });
}

function ReadOnlyAdapter(props: FieldRenderProps) {
  return React.createElement(ReadOnly, {
    label: props.label,
    value: props.value,
    type: props.type,
    emptyText: props.emptyText,
    precision: props.precision,
    currencySymbol: props.currencySymbol,
    dateFormat: props.dateFormat,
    datetimeFormat: props.datetimeFormat,
    timeFormat: props.timeFormat,
    linkHref: props.linkHref,
    onLinkPress: props.onLinkPress,
    ...passthroughProps(props),
  });
}

/** Stock Frappe: a Rating's star count is `cint(df.options) || 5`. */
function ratingStarsFromOptions(options: unknown): number | undefined {
  const parsed = Number.parseInt(typeof options === 'string' ? options : '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function RatingAdapter(props: FieldRenderProps) {
  return React.createElement(Rating, {
    label: props.label,
    value: typeof props.value === 'number' ? props.value : 0,
    onChange: props.onChange,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    maxStars: ratingStarsFromOptions(props.fieldMeta?.options ?? props.options),
    ...passthroughProps(props),
  });
}

function BarcodeAdapter(props: FieldRenderProps) {
  return React.createElement(Barcode, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

function SignatureAdapter(props: FieldRenderProps) {
  return React.createElement(Signature, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  });
}

function GeolocationAdapter(props: FieldRenderProps) {
  return React.createElement(Geolocation, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

function DurationAdapter(props: FieldRenderProps) {
  return React.createElement(Duration, {
    label: props.label,
    value: typeof props.value === 'number' ? props.value : 0,
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

function TimePickerAdapter(props: FieldRenderProps) {
  return React.createElement(TimePicker, {
    label: props.label,
    value: typeof props.value === 'string' ? props.value : '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

function HeadingAdapter(props: FieldRenderProps) {
  return React.createElement(Heading, {
    label: props.label ?? '',
    description: props.description ?? props.helperText ?? props.fieldMeta?.description,
    level: props.level,
    collapsible: props.collapsible,
    defaultCollapsed: props.defaultCollapsed,
    showSeparator: props.showSeparator,
    children: props.children,
    onCollapseChange: props.onCollapseChange,
    ...passthroughProps(props),
  });
}

/**
 * Frappe `Button` is an ACTION field: it carries no stored value, so it is
 * not a layout break and must not be swallowed by schemaForm. The house
 * Button is the renderer slot; label copy is the DocField author's
 * (DG-ACT-02) and the adapter never sets `accent`, so a form's own submit
 * keeps the one primary (DG-ACT-01).
 *
 * LC-14: `onChange` is the canonical channel for fields that hold a VALUE.
 * A Button holds none, so the adapter never fires it — a press would
 * otherwise write a doc field that does not exist. Press wiring arrives on
 * `onPress` through a field override (DG-CTRL-06, the eject hatch); with no
 * override the button renders inert rather than inventing a doc write.
 *
 * Restored after the MPO-60 fieldRegistry rewrite (035867446) merged over
 * the MPO-51 registration (a8f8f52bd, gitlab.com !77) and silently dropped
 * it — CI runs only `turbo run build` (MPO-78), so the red spec never
 * surfaced.
 */
function ButtonAdapter(props: FieldRenderProps) {
  const disabled = Boolean(props.disabled ?? props.readOnly);
  const reason =
    (typeof props.disabledReason === 'string' && props.disabledReason.trim()) ||
    props.helperText ||
    (typeof props.fieldMeta?.description === 'string' ? props.fieldMeta.description : undefined) ||
    (props.readOnly ? 'Read only' : undefined);
  return React.createElement(Button, {
    disabled,
    disabledReason: disabled ? String(reason ?? 'Unavailable') : undefined,
    skeleton: props.skeleton,
    compact: props.compact,
    onPress: disabled ? undefined : props.onPress,
    children: props.label,
  });
}

// ---------------------------------------------------------------------------
// Adapter components — new field types (forms integration)
// ---------------------------------------------------------------------------

function PhoneAdapter(props: FieldRenderProps) {
  return React.createElement(Phone, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
    defaultCountry: props.fieldMeta?.options ?? undefined,
  });
}

function SwitchAdapter(props: FieldRenderProps) {
  return React.createElement(SwitchField, {
    label: props.label,
    value: !!props.value,
    onChange: ((val: boolean) => {
      props.onChange(val ? 1 : 0);
    }) as any,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  });
}

function RadioGroupAdapter(props: FieldRenderProps) {
  const optionsStr = props.fieldMeta?.options ?? props.options ?? '';
  const options = (typeof optionsStr === 'string' ? optionsStr : String(optionsStr))
    .split('\n')
    .map((o: string) => o.trim())
    .filter(Boolean)
    .map((o: string) => ({ label: o, value: o }));

  return React.createElement(RadioGroupField, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    options,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

function SliderAdapter(props: FieldRenderProps) {
  return React.createElement(SliderField, {
    label: props.label,
    value: typeof props.value === 'number' ? props.value : 0,
    onChange: props.onChange,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  });
}

function ToggleGroupAdapter(props: FieldRenderProps) {
  const optionsStr = props.fieldMeta?.options ?? props.options ?? '';
  const options = (typeof optionsStr === 'string' ? optionsStr : String(optionsStr))
    .split('\n')
    .map((o: string) => o.trim())
    .filter(Boolean)
    .map((o: string) => ({ label: o, value: o }));

  return React.createElement(ToggleGroupField, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    options,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  });
}

function ProgressAdapter(props: FieldRenderProps) {
  return React.createElement(ProgressField, {
    label: props.label,
    value: typeof props.value === 'number' ? props.value : 0,
    error: props.error,
    ...passthroughProps(props),
  });
}

function OTPAdapter(props: FieldRenderProps) {
  return React.createElement(OTPInputField, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

function MentionAdapter(props: FieldRenderProps) {
  return React.createElement(MentionInputField, {
    label: props.label,
    value: props.value,
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
    mentions: [],
  });
}

function DateRangeAdapter(props: FieldRenderProps) {
  return React.createElement(DateRangeField, {
    label: props.label,
    value: props.value,
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

function FileUploadAdapter(props: FieldRenderProps) {
  return React.createElement(FileUploadField, {
    label: props.label,
    value: props.value,
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    // Attach's choose-from-library tab (FileBrowser, MPO-53 AC-11). The feed
    // rides the registry so schema-driven Attach fields reach the library.
    library: props.library !== false,
    libraryFiles: props.libraryFiles,
    libraryFolder: props.libraryFolder,
    ...passthroughProps(props),
  });
}

function FileUploadImageAdapter(props: FieldRenderProps) {
  return React.createElement(FileUploadField, {
    label: props.label,
    value: props.value,
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    library: props.library !== false,
    libraryFiles: props.libraryFiles,
    libraryFolder: props.libraryFolder,
    ...passthroughProps(props),
    isImage: true,
  });
}

function LinkAdapter(props: FieldRenderProps) {
  const doctype =
    (props.doctype ?? (typeof props.fieldMeta?.options === 'string' ? props.fieldMeta.options : '')) ||
    (typeof props.options === 'string' ? props.options : '') ||
    '';

  return React.createElement(Link, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    doctype,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

function DynamicLinkAdapter(props: FieldRenderProps) {
  return React.createElement(DynamicLink, {
    label: props.label,
    value: props.value ?? '',
    onChange: props.onChange,
    doctypeFieldValue: props.doctype ?? props.doctypeFieldValue ?? '',
    onDoctypeChange: props.onDoctypeChange,
    doctypes: Array.isArray(props.doctypes) ? props.doctypes : undefined,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

function TableMultiSelectAdapter(props: FieldRenderProps) {
  const doctype =
    (props.doctype ?? (typeof props.fieldMeta?.options === 'string' ? props.fieldMeta.options : '')) ||
    (typeof props.options === 'string' ? props.options : '') ||
    '';
  const value = Array.isArray(props.value)
    ? props.value.map(String)
    : props.value != null && props.value !== ''
      ? [String(props.value)]
      : [];

  return React.createElement(TableMultiSelect, {
    label: props.label,
    value,
    onChange: props.onChange,
    doctype,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
}

/**
 * Layout / no-data fieldtypes that never render as child-table columns.
 * `Image` is a display-of-another-field widget (df.options points at the
 * source field) — the referenced Attach Image column renders the actual
 * image cell, so an Image column would only echo an empty text input.
 */
const TABLE_LAYOUT_TYPES = new Set([
  'Section Break',
  'Column Break',
  'Tab Break',
  'Fold',
  'Heading',
  'HTML',
  'Button',
  'Image',
]);

const TABLE_BOOKKEEPING_KEYS = new Set([
  'name',
  'doctype',
  'idx',
  'parent',
  'parenttype',
  'parentfield',
  'owner',
  'creation',
  'modified',
  'modified_by',
  'docstatus',
]);

/** Minimal child-table field descriptor (DocTypeField-compatible). */
export interface ChildTableFieldDef {
  fieldname: string;
  fieldtype: string;
  label?: string;
  options?: string;
  in_list_view?: boolean | number;
  read_only?: boolean | number;
  hidden?: boolean | number;
  precision?: number;
  default?: string;
  /** Per-row visibility, evaluated against the row with the parent doc in scope. */
  depends_on?: string;
}

interface TableColumnDef {
  id: string;
  header: string;
  accessorKey: string;
  field: DataTableField;
  fieldProps?: Record<string, unknown>;
  readOnly?: boolean;
}

function parseSelectOptions(options?: string): { label: string; value: string }[] | undefined {
  if (!options || typeof options !== 'string') {
    return undefined;
  }
  const parsed = options
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => ({ label: o, value: o }));
  return parsed.length ? parsed : undefined;
}

/** Map a Frappe fieldtype to a ChildTable / DataTableCell editable field. */
export function fieldtypeToTableField(
  fieldtype: string,
  options?: string,
): {
  field: DataTableField;
  fieldProps?: Record<string, unknown>;
} {
  switch (fieldtype) {
    case 'Int': {
      return { field: 'stepper', fieldProps: { step: 1 } };
    }
    case 'Float':
    case 'Currency':
    case 'Percent': {
      return { field: 'stepper', fieldProps: { step: 0.01 } };
    }
    case 'Check': {
      return { field: 'checkbox' };
    }
    case 'Select': {
      const selectOptions = parseSelectOptions(options);
      return {
        field: 'select',
        fieldProps: selectOptions ? { options: selectOptions } : undefined,
      };
    }
    case 'Date': {
      return { field: 'datepicker' };
    }
    case 'Datetime': {
      return { field: 'datetimepicker' };
    }
    case 'Time': {
      return { field: 'timepicker' };
    }
    case 'Color': {
      return { field: 'colorpicker' };
    }
    case 'Icon': {
      return {
        field: 'custom',
        fieldProps: {
          render: (
            value: unknown,
            _rowData: unknown,
            onCellChange: (v: unknown) => void,
            context?: DataTableCellRenderContext,
          ) =>
            React.createElement(Icon, {
              value: value === null || value === undefined ? '' : String(value),
              onChange: onCellChange,
              compact: true,
              readOnly: context?.readOnly,
              disabled: context?.disabled,
            }),
        },
      };
    }
    case 'Rating': {
      // Frappe stores Rating as a 0–1 fraction of the star count (df.options,
      // default 5). The generic rating cell treats values as star counts, so
      // mount the frappe-ui Rating field (fraction contract, same as the form
      // path) chromeless through the custom escape hatch.
      const maxStars = ratingStarsFromOptions(options);
      return {
        field: 'custom',
        fieldProps: {
          render: (
            value: unknown,
            _rowData: unknown,
            onCellChange: (v: unknown) => void,
            context?: DataTableCellRenderContext,
          ) =>
            React.createElement(Rating, {
              value: typeof value === 'number' ? value : Number(value) || 0,
              onChange: onCellChange,
              maxStars,
              compact: true,
              // D-18.4: read-only cells block commits, so the stars must not
              // look pressable.
              readOnly: context?.readOnly,
              disabled: context?.disabled,
            }),
        },
      };
    }
    case 'Phone': {
      return { field: 'phoneinput', fieldProps: options ? { defaultCountry: options } : undefined };
    }
    case 'Duration': {
      return { field: 'duration' };
    }
    case 'Small Text':
    case 'Long Text':
    case 'Text': {
      return { field: 'textarea' };
    }
    case 'Code':
    case 'JSON': {
      // Dedicated modal editor (LC-06) with a code-aware read-only display —
      // never a bare inline textarea.
      return { field: 'codeeditor' };
    }
    case 'Markdown Editor': {
      return { field: 'markdowneditor' };
    }
    case 'Text Editor':
    case 'HTML Editor': {
      return { field: 'richtexteditor' };
    }
    case 'Attach': {
      return { field: 'fileupload' };
    }
    case 'Attach Image': {
      return { field: 'image' };
    }
    case 'Barcode': {
      return { field: 'barcode' };
    }
    case 'Signature': {
      return { field: 'signature' };
    }
    case 'Geolocation': {
      return { field: 'geolocation' };
    }
    case 'Link': {
      // Frappe-aware cell through the custom escape hatch (the table package
      // stays Frappe-free): a chromeless Link combobox searching the backend
      // (search_link) per keystroke. Picking a value commits immediately —
      // single-value picker semantics, editor opens as popover (LC-06).
      const linkDoctype = options ?? '';
      return {
        field: 'custom',
        fieldProps: {
          doctype: linkDoctype,
          render: (
            value: unknown,
            _rowData: unknown,
            onCellChange: (v: unknown) => void,
            context?: DataTableCellRenderContext,
          ) =>
            React.createElement(Link, {
              value: value === null || value === undefined ? '' : String(value),
              onChange: onCellChange,
              doctype: linkDoctype,
              compact: true,
              // D-18.4: read-only cells block commits, so the combobox must
              // render its non-interactive representation.
              readOnly: context?.readOnly,
              disabled: context?.disabled,
              'aria-label': linkDoctype ? `Link: ${linkDoctype}` : 'Link',
            }),
        },
      };
    }
    case 'Read Only': {
      return { field: 'input', fieldProps: { readOnly: true } };
    }
    case 'Autocomplete': {
      // Searchable combobox over the static df.options list; free text stays
      // allowed (stock autocomplete suggests, never restricts). Picking an
      // option commits the row immediately (single-value picker semantics).
      const choices = parseSelectOptions(options);
      return {
        field: 'combobox',
        fieldProps: {
          ...(choices ? { options: choices } : {}),
          creatable: true,
          onCreate: (value: string) => ({ label: value, value }),
        },
      };
    }
    case 'Password': {
      // Masked entry (react-native-web maps secureTextEntry → type="password")
      // — a Password cell must never echo keystrokes in cleartext.
      return { field: 'input', fieldProps: { secureTextEntry: true } };
    }
    case 'Dynamic Link': {
      // df.options names the sibling column that holds the target DocType —
      // the same resolution SchemaForm applies on the form path. The cell
      // mounts the backend-searching Link combobox against that row's
      // doctype (chromeless, popover editor per LC-06, pick commits the
      // row). Until the sibling field is set there is nothing to search, so
      // the control stays disabled (stock behavior).
      const doctypeField = options ?? '';
      return {
        field: 'custom',
        fieldProps: {
          doctypeField,
          render: (
            value: unknown,
            rowData: unknown,
            onCellChange: (v: unknown) => void,
            context?: DataTableCellRenderContext,
          ) => {
            const rowDoctype =
              doctypeField && rowData && typeof rowData === 'object'
                ? String((rowData as Record<string, unknown>)[doctypeField] ?? '')
                : '';
            return React.createElement(Link, {
              value: value === null || value === undefined ? '' : String(value),
              onChange: onCellChange,
              doctype: rowDoctype,
              compact: true,
              disabled: Boolean(!rowDoctype || context?.disabled),
              // D-18.4: read-only cells block commits, so the combobox must
              // render its non-interactive representation.
              readOnly: context?.readOnly,
              placeholder: rowDoctype ? undefined : doctypeField ? `Set ${doctypeField} first` : 'Dynamic Link',
              'aria-label': rowDoctype ? `Dynamic Link: ${rowDoctype}` : 'Dynamic Link',
            });
          },
        },
      };
    }
    case 'Data': {
      return { field: 'input' };
    }
    default: {
      // D-18.5: an unknown/unmapped fieldtype must never render an editable
      // input by accident (the Link-in-cell trap class) — default to the
      // read-only display until a real mapping exists.
      return { field: 'input', fieldProps: { readOnly: true } };
    }
  }
}

function isVisibleChildField(f: ChildTableFieldDef): boolean {
  return !f.hidden && !TABLE_LAYOUT_TYPES.has(f.fieldtype) && !f.fieldtype.startsWith('Table');
}

function fieldToColumn(f: ChildTableFieldDef): TableColumnDef {
  const mapped = fieldtypeToTableField(f.fieldtype, f.options);
  return {
    id: f.fieldname,
    header: f.label ?? f.fieldname,
    accessorKey: f.fieldname,
    field: mapped.field,
    fieldProps: mapped.fieldProps,
    readOnly: !!f.read_only,
  };
}

/** Build editable ChildTable columns from child DocType field defs. */
export function childFieldsToColumns(fields: ChildTableFieldDef[]): TableColumnDef[] {
  const visible = fields.filter(isVisibleChildField);
  const flagged = visible.filter((f) => !!f.in_list_view);
  const source = flagged.length > 0 ? flagged : visible.slice(0, 8);
  return source.map(fieldToColumn);
}

/** Every editable child field, for the row detail editor (desk's row form). */
export function childFieldsToDetailColumns(fields: ChildTableFieldDef[]): TableColumnDef[] {
  return fields.filter(isVisibleChildField).map(fieldToColumn);
}

/**
 * Per-row cell visibility from child `depends_on`: the row is `doc`, the
 * parent form doc is `parent`. Undefined when no child field declares one.
 */
export function childCellHidden(fields: ChildTableFieldDef[], parent?: DependsDoc): ChildCellHidden | undefined {
  const evaluators = new Map<string, DependsEvaluator>();
  for (const f of fields) {
    const evaluator = compileDependsOn(f.depends_on, true);
    if (evaluator) {
      evaluators.set(f.fieldname, evaluator);
    }
  }
  if (evaluators.size === 0) {
    return undefined;
  }
  return (row, columnId) => {
    const evaluator = evaluators.get(columnId);
    return evaluator ? !evaluator(row, parent) : false;
  };
}

function defaultRowFromFields(fields: ChildTableFieldDef[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of fields.filter(isVisibleChildField)) {
    if (f.default != null && f.default !== '') {
      row[f.fieldname] = f.default;
      continue;
    }
    switch (f.fieldtype) {
      case 'Int':
      case 'Float':
      case 'Currency':
      case 'Percent':
      case 'Rating':
      case 'Duration': {
        row[f.fieldname] = 0;
        break;
      }
      case 'Check': {
        row[f.fieldname] = 0;
        break;
      }
      default: {
        row[f.fieldname] = '';
      }
    }
  }
  return row;
}

/**
 * Resolve ChildTable columns from:
 * 1. explicit `fieldMeta.columns`
 * 2. static `fieldMeta.fields` / `fieldMeta.childFields` (child df)
 * 3. live child DocType meta via `options` + `useDocTypeMeta`
 * 4. first row keys (fixture / offline fallback)
 */
function TableAdapter(props: FieldRenderProps) {
  const config = useFrappeConfig();
  const childDoctype =
    (typeof props.fieldMeta?.options === 'string' && props.fieldMeta.options) ||
    (typeof props.options === 'string' && props.options) ||
    '';
  const connectionConfig = config?.baseURL
    ? {
        baseURL: config.baseURL,
        socketPort: config.socketPort,
        siteName: config.siteName,
        socketBaseURL: config.socketBaseURL,
        auth: config.auth,
        syncOptions: config.syncOptions,
        realtime: config.realtime,
        fixtures: config.fixtures,
      }
    : undefined;
  const { meta } = useDocTypeMeta(childDoctype ? connectionConfig : undefined, childDoctype);

  const staticFields = useMemo(() => {
    const fm = props.fieldMeta as { fields?: ChildTableFieldDef[]; childFields?: ChildTableFieldDef[] } | undefined;
    const fromMeta = fm?.fields ?? fm?.childFields;
    return Array.isArray(fromMeta) && fromMeta.length > 0 ? fromMeta : undefined;
  }, [props.fieldMeta]);

  const resolvedFields = staticFields ?? meta?.fields;

  const columns = useMemo<TableColumnDef[]>(() => {
    const explicit = (props.fieldMeta as { columns?: unknown } | undefined)?.columns;
    if (Array.isArray(explicit) && explicit.length > 0) {
      return explicit as TableColumnDef[];
    }

    if (resolvedFields?.length) {
      const cols = childFieldsToColumns(resolvedFields as ChildTableFieldDef[]);
      if (cols.length > 0) {
        return cols;
      }
    }

    const rows = Array.isArray(props.value) ? props.value : [];
    const sample = rows.find((row) => row && typeof row === 'object') as Record<string, unknown> | undefined;
    if (sample) {
      return Object.keys(sample)
        .filter((key) => !TABLE_BOOKKEEPING_KEYS.has(key))
        .slice(0, 8)
        .map((key) => ({
          id: key,
          header: key,
          accessorKey: key,
          field: 'input',
        }));
    }

    return [{ id: 'name', header: 'Name', accessorKey: 'name', field: 'input' }];
  }, [resolvedFields, props.fieldMeta, props.value]);

  const defaultRow = useMemo(() => {
    if (resolvedFields?.length) {
      return defaultRowFromFields(resolvedFields as ChildTableFieldDef[]);
    }
    return;
  }, [resolvedFields]);

  const detailColumns = useMemo(
    () => (resolvedFields?.length ? childFieldsToDetailColumns(resolvedFields as ChildTableFieldDef[]) : undefined),
    [resolvedFields],
  );

  const { parentDoc } = props;
  const isCellHidden = useMemo(
    () => (resolvedFields?.length ? childCellHidden(resolvedFields as ChildTableFieldDef[], parentDoc) : undefined),
    [resolvedFields, parentDoc],
  );

  return React.createElement(ChildTable, {
    label: props.label,
    value: Array.isArray(props.value) ? props.value : [],
    onChange: props.onChange,
    columns,
    detailColumns: detailColumns?.length ? detailColumns : undefined,
    rowDetail: true,
    isCellHidden,
    defaultRow,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  });
}

// ---------------------------------------------------------------------------
// Default registration
// ---------------------------------------------------------------------------

export function initDefaultRegistry(): void {
  // Data types
  registerField('Data', DataAdapter);

  // Autocomplete (searchable combobox over static options, free text allowed)
  registerField('Autocomplete', AutocompleteAdapter);

  // Phone (backed by forms PhoneInput)
  registerField('Phone', PhoneAdapter);

  // Numeric types
  registerField('Int', NumericAdapter('Int'));
  registerField('Float', NumericAdapter('Float'));
  registerField('Currency', NumericAdapter('Currency'));
  registerField('Percent', NumericAdapter('Percent'));

  // Select
  registerField('Select', SelectAdapter);

  // Check
  registerField('Check', CheckAdapter);

  // Date/Time types ("Time" is registered once below, to TimePickerAdapter —
  // registering DateAdapter("time") here too was the double-registration trap:
  // the registry is last-write-wins, so the earlier entry was dead code).
  registerField('Date', DateAdapter('date'));
  registerField('Datetime', DateAdapter('datetime'));

  // Color
  registerField('Color', ColorAdapter);

  // Icon — picker over the DG-IDN-06 drawn set (MPO-51). MPO-22's Icon
  // line points here instead of restating the gap. Registration was first
  // landed by 3b0cf9902 and silently reverted by 035867446 (MPO-60), whose
  // registry rewrite was cut from a pre-MPO-51 base; this restores it.
  registerField('Icon', IconAdapter);

  // Text types
  registerField('Small Text', SmallTextAdapter);
  registerField('Long Text', LongTextAdapter);
  registerField('Text', LongTextAdapter);

  // Code / JSON / Markdown Editor — dedicated editor fields. These are the
  // single canonical registrations for the three fieldtypes; never
  // re-register them further down (the registry is last-write-wins, so a
  // second registerField call would silently shadow these — the "Time"
  // double-registration trap).
  registerField('Code', CodeEditorAdapter);
  registerField('JSON', JsonEditorAdapter);
  registerField('Markdown Editor', MarkdownEditorAdapter);

  // Rich text
  registerField('Text Editor', TextEditorAdapter);
  registerField('HTML Editor', TextEditorAdapter);

  // HTML (read-only display)
  registerField('HTML', HtmlAdapter);

  // Image (display-only preview of the image referenced by df.options)
  registerField('Image', ImageAdapter);

  // Password
  registerField('Password', PasswordAdapter);

  // Read Only
  registerField('Read Only', ReadOnlyAdapter);

  // Heading
  registerField('Heading', HeadingAdapter);

  // Button — desk action field (MPO-51). Not a layout break; not a value.
  registerField('Button', ButtonAdapter);

  // Rating
  registerField('Rating', RatingAdapter);

  // Barcode
  registerField('Barcode', BarcodeAdapter);

  // Signature
  registerField('Signature', SignatureAdapter);

  // Geolocation
  registerField('Geolocation', GeolocationAdapter);

  // Duration
  registerField('Duration', DurationAdapter);

  // Time — single canonical registration (see the Date/Time note above).
  registerField('Time', TimePickerAdapter);

  // --- Custom field types (forms integration) ---

  // Switch (boolean toggle, 1/0 conversion like Check)
  registerField('Switch', SwitchAdapter);

  // Radio (option selection via radio buttons)
  registerField('Radio', RadioGroupAdapter);

  // Slider (numeric range input)
  registerField('Slider', SliderAdapter);

  // Toggle Group (single/multi-select button group)
  registerField('Toggle Group', ToggleGroupAdapter);

  // Progress (read-only progress bar)
  registerField('Progress', ProgressAdapter);

  // OTP (one-time password input)
  registerField('OTP', OTPAdapter);

  // Mention (text with @mention support)
  registerField('Mention', MentionAdapter);

  // Date Range (date range picker)
  registerField('Date Range', DateRangeAdapter);

  // Attach / Attach Image (file upload backed by forms FileUpload)
  registerField('Attach', FileUploadAdapter);
  registerField('Attach Image', FileUploadImageAdapter);

  // Link / Dynamic Link / Table MultiSelect (Frappe-specific)
  registerField('Link', LinkAdapter);
  registerField('Dynamic Link', DynamicLinkAdapter);
  registerField('Table MultiSelect', TableMultiSelectAdapter);

  // Table (child table backed by forms ChildTable)
  registerField('Table', TableAdapter);
}

// Initialize default registry at module load
initDefaultRegistry();
