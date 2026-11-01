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

import { compileDependsOn } from './depends-on';
import type { DependsDoc, DependsEvaluator } from './depends-on';
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
import { parseChoiceOptions, resolveChoiceControl } from './resolve-control';
import type { ChoiceControl, CommitMode } from './resolve-control';

const LazyTextEditor = React.lazy(async () => {
  const mod = await import('./fields/TextEditor');
  return { default: mod.TextEditor };
});

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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Frappe df keys pass through untouched; adapters read the ones they know
  [key: string]: unknown;
}

/** Standard props that every field component receives when rendered by the schema form. */
export interface FieldRenderProps {
  label?: string;
  // oxlint-disable-next-line typescript/no-explicit-any -- public contract: each field component narrows its own value type
  value: any;
  // oxlint-disable-next-line typescript/no-explicit-any -- public contract: each field component emits its own value type
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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the parent form doc, read by fieldname in child depends_on
  parentDoc?: Record<string, unknown>;
  /** Allow pass-through props */
  // oxlint-disable-next-line typescript/no-explicit-any, anti-slop/no-unsafe-dictionary-type -- public contract: field-specific props pass through to the components that type them
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
export const registerField = (fieldtype: FrappeFieldType, component: ComponentType<FieldRenderProps>): void => {
  registry.set(fieldtype, component);
};

export const getFieldComponent = (fieldtype: string): ComponentType<FieldRenderProps> | undefined =>
  registry.get(fieldtype);

// ---------------------------------------------------------------------------
// Adapter components — existing field types
// ---------------------------------------------------------------------------

/**
 * Thin-adapter contract props shared by every field wrapper: forwards
 * readOnly / skeleton / compact plus helper text (df `description` fallback).
 */
const passthroughProps = (props: FieldRenderProps) => ({
  helperText: props.helperText ?? props.fieldMeta?.description,
  readOnly: props.readOnly,
  skeleton: props.skeleton,
  compact: props.compact,
});

/**
 * DOM-level input block for disabled text-entry fields. Tamagui's web
 * `<input>` consumes the `disabled` prop as aria-disabled only, so a disabled
 * field would still accept keystrokes; `readOnly`/`tabIndex` do reach the DOM,
 * so use them to actually block typing and keyboard focus.
 */
const disabledInputBlock = (props: FieldRenderProps) =>
  props.disabled ? { inputProps: { readOnly: true, tabIndex: -1 } } : undefined;

const disabledTextAreaBlock = (props: FieldRenderProps) =>
  props.disabled ? { textAreaProps: { readOnly: true, tabIndex: -1 } } : undefined;

/** A field value as text; unset reads as "". */
const valueText = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- field and cell values are untyped by the FieldRenderProps / cell-render contracts
  value: unknown,
): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- strings pass through untouched; every other scalar is stringified below
  if (typeof value === 'string') {
    return value;
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- field values are scalars, stringified as the desk does
  return value === null || value === undefined ? '' : String(value);
};

/** A field value as a number; unset reads as undefined. */
const valueNumber = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- field values are untyped by the FieldRenderProps contract
  value: unknown,
): number | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- numbers pass through untouched; other scalars are coerced below
  if (typeof value === 'number') {
    return value;
  }
  return value === null || value === undefined ? undefined : Number(value);
};

/** A multi-value field value as strings: an array as-is, a lone value as one entry. */
const valueList = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- field values are untyped by the FieldRenderProps contract
  value: unknown,
): string[] => {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- a lone field value is a scalar
  return value !== null && value !== undefined && value !== '' ? [String(value)] : [];
};

/** A Link-like field's target doctype: the explicit prop, then df.options, then `options`. */
const linkDoctype = (props: FieldRenderProps): string => {
  const primary = props.doctype ?? props.fieldMeta?.options ?? '';
  return primary === '' ? (props.options ?? '') : primary;
};

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const DataAdapter = (props: FieldRenderProps) =>
  React.createElement(Data, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    // Frappe df.length caps text entry (Data default 140 lives in the field).
    maxLength: props.fieldMeta?.maxLength,
    ...passthroughProps(props),
    ...disabledInputBlock(props),
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    type: props.type,
  });

/**
 * Frappe `Autocomplete`: a searchable combobox over the static df.options
 * list. Free text stays allowed (stock autocomplete suggests, never
 * restricts), so the combobox is creatable and an off-list value still
 * displays itself in the trigger.
 */
// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const AutocompleteAdapter = (props: FieldRenderProps) => {
  const rawOptions = props.fieldMeta?.options ?? props.options ?? '';
  const options = parseChoiceOptions(rawOptions);
  const value = valueText(props.value);
  return React.createElement(Combobox, {
    label: props.label,
    value,
    onChange: props.onChange,
    options,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    placeholder: props.placeholder,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    creatable: true,
    onCreate: (next: string) => ({ label: next, value: next }),
    valueLabel: value || undefined,
    ...passthroughProps(props),
  });
};

/** A boolean toggle handler that writes the Check's 0/1. */
const checkValueHandler =
  // oxlint-disable-next-line typescript/no-explicit-any -- SwitchField types onChange through its generic form-field props, which this untyped adapter cannot name
  (onChange: FieldRenderProps['onChange']): any =>
    (val: boolean) => {
      onChange(val ? 1 : 0);
    };

// oxlint-disable-next-line sonarjs/max-union-size -- the four numeric Frappe fieldtypes
const numericAdapter = (type: 'Int' | 'Float' | 'Currency' | 'Percent') =>
  function NumericAdapter(props: FieldRenderProps) {
    return React.createElement(Numeric, {
      label: props.label,
      value: valueNumber(props.value),
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

const choiceControlFromProps = (props: FieldRenderProps): ChoiceControl | undefined => {
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
  const raw = props.control ?? props.fieldMeta?.control;
  // SAFETY: a string `control` is the df's ChoiceControl eject-hatch name; the pass-through index signature only drops its declared type
  // oxlint-disable-next-line anti-slop/no-runtime-typeof, typescript/no-unsafe-type-assertion -- see SAFETY above
  return typeof raw === 'string' ? (raw as ChoiceControl) : undefined;
};

const commitModeFromProps = (props: FieldRenderProps, fallback: CommitMode = 'deferred'): CommitMode => {
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
  const raw = props.commit ?? props.fieldMeta?.commit;
  if (raw === 'immediate' || raw === 'deferred') {
    return raw === 'immediate' ? 'immediate' : 'deferred';
  }
  return fallback;
};

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const SelectAdapter = (props: FieldRenderProps) => {
  const rawOptions = props.fieldMeta?.options ?? props.options ?? '';
  const options = parseChoiceOptions(rawOptions);
  const multiple = Boolean(props.multiple ?? props.fieldMeta?.multiple);
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
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      value: props.value ?? '',
      onChange: props.onChange,
      options,
    });
  }

  if (kind === 'combobox') {
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    const value = multiple ? valueList(props.value) : (props.value ?? '');
    return React.createElement(Combobox, {
      ...shared,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      value,
      onChange: props.onChange,
      options,
      multiple,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      placeholder: props.placeholder,
    });
  }

  if (kind === 'checkboxGroup') {
    const value = valueList(props.value);
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
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      value: props.value ?? '',
      onChange: props.onChange,
      options,
    });
  }

  if (kind === 'switch') {
    return React.createElement(SwitchField, {
      ...shared,
      value: Boolean(props.value),
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      onChange: checkValueHandler(props.onChange),
    });
  }

  if (kind === 'checkbox') {
    // SAFETY: the object carries every CheckProps key Check reads; the spread pass-through props widen its inferred type
    return React.createElement(Check, {
      ...shared,
      value: Boolean(props.value),
      onChange: (val: boolean) => {
        props.onChange(val ? 1 : 0);
      },
    } as CheckProps);
  }

  return React.createElement(SelectComponent, {
    ...shared,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    options: options.map((o) => o.value),
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    placeholder: props.placeholder,
  });
};

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const SwitchAdapter = (props: FieldRenderProps) =>
  React.createElement(SwitchField, {
    label: props.label,
    value: Boolean(props.value),
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    onChange: checkValueHandler(props.onChange),
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const CheckAdapter = (props: FieldRenderProps) => {
  const kind = resolveChoiceControl({
    boolean: true,
    commit: commitModeFromProps(props, 'deferred'),
    control: choiceControlFromProps(props),
  });

  if (kind === 'switch') {
    // oxlint-disable-next-line react-doctor/no-call-component-as-function -- SwitchAdapter is hook-free; inlining keeps the Check slot's element tree unchanged
    return SwitchAdapter(props);
  }

  // SAFETY: the object carries every CheckProps key Check reads; the spread pass-through props widen its inferred type

  return React.createElement(Check, {
    label: props.label,
    value: Boolean(props.value),
    onChange: (val: boolean) => {
      props.onChange(val ? 1 : 0);
    },
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  } as CheckProps);
};

const dateAdapter = (type: 'date' | 'datetime' | 'time') =>
  function DateAdapter(props: FieldRenderProps) {
    return React.createElement(DateComponent, {
      label: props.label,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
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

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const ColorAdapter = (props: FieldRenderProps) =>
  React.createElement(Color, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const IconAdapter = (props: FieldRenderProps) => {
  const rawOptions = props.fieldMeta?.options ?? props.options ?? '';
  return React.createElement(Icon, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    options: rawOptions,
    ...passthroughProps(props),
  });
};

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const SmallTextAdapter = (props: FieldRenderProps) =>
  React.createElement(SmallText, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
    ...disabledTextAreaBlock(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const LongTextAdapter = (props: FieldRenderProps) =>
  React.createElement(LongText, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
    ...disabledTextAreaBlock(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const TextEditorAdapter = (props: FieldRenderProps) =>
  React.createElement(
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
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      value: props.value ?? '',
      onChange: props.onChange,
      disabled: props.disabled,
      required: props.required,
      error: props.error,
      ...passthroughProps(props),
    }),
  );

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const MarkdownEditorAdapter = (props: FieldRenderProps) =>
  React.createElement(MarkdownEditorField, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    placeholder: props.placeholder,
    ...passthroughProps(props),
  });

/**
 * Frappe `Code`: df.options names the language (stock ControlCode
 * language_map — Javascript, JS, Python, Py, PythonExpression, HTML, CSS,
 * Markdown, SCSS, JSON, Golang, Go, Jinja).
 */
// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const CodeEditorAdapter = (props: FieldRenderProps) => {
  const rawOptions = props.fieldMeta?.options ?? props.options;
  return React.createElement(CodeEditorField, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    placeholder: props.placeholder,
    language: frappeCodeLanguage(rawOptions),
    ...passthroughProps(props),
  });
};

/** Frappe `JSON`: language pinned to json regardless of df.options. */
// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const JsonEditorAdapter = (props: FieldRenderProps) =>
  React.createElement(CodeEditorField, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    placeholder: props.placeholder,
    language: 'json',
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const HtmlAdapter = (props: FieldRenderProps) =>
  React.createElement(Html, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    error: props.error,
    disabled: props.disabled,
    required: props.required,
    ...passthroughProps(props),
  });

/**
 * Frappe `Image` is a display-only widget: it previews the image whose URL
 * lives in the field named by df.options (SchemaForm resolves that value).
 * The field itself holds no editable data, so it always renders read-only.
 */
// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const ImageAdapter = (props: FieldRenderProps) =>
  React.createElement(ImageField, {
    label: props.label,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- FieldRenderProps carries the value untyped; the field narrows it to the type it renders
    value: typeof props.value === 'string' && props.value ? props.value : null,
    error: props.error,
    ...passthroughProps(props),
    readOnly: true,
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const PasswordAdapter = (props: FieldRenderProps) =>
  React.createElement(Password, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
    ...disabledInputBlock(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const ReadOnlyAdapter = (props: FieldRenderProps) =>
  React.createElement(ReadOnly, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    type: props.type,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    emptyText: props.emptyText,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    precision: props.precision,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    currencySymbol: props.currencySymbol,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    dateFormat: props.dateFormat,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    datetimeFormat: props.datetimeFormat,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    timeFormat: props.timeFormat,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    linkHref: props.linkHref,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    onLinkPress: props.onLinkPress,
    ...passthroughProps(props),
  });

/** Stock Frappe: a Rating's star count is `cint(df.options) || 5`. */
const ratingStarsFromOptions = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- df.options arrives untyped through the pass-through props
  options: unknown,
): number | undefined => {
  // oxlint-disable-next-line unicorn/prefer-number-coercion, anti-slop/no-runtime-typeof -- parseInt reads a leading integer like desk's cint; Number() would reject "5 stars"
  const parsed = Number.parseInt(typeof options === 'string' ? options : '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const RatingAdapter = (props: FieldRenderProps) =>
  React.createElement(Rating, {
    label: props.label,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- FieldRenderProps carries the value untyped; the field narrows it to the type it renders
    value: typeof props.value === 'number' ? props.value : 0,
    onChange: props.onChange,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    maxStars: ratingStarsFromOptions(props.fieldMeta?.options ?? props.options),
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const BarcodeAdapter = (props: FieldRenderProps) =>
  React.createElement(Barcode, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const SignatureAdapter = (props: FieldRenderProps) =>
  React.createElement(Signature, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const GeolocationAdapter = (props: FieldRenderProps) =>
  React.createElement(Geolocation, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const DurationAdapter = (props: FieldRenderProps) =>
  React.createElement(Duration, {
    label: props.label,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- FieldRenderProps carries the value untyped; the field narrows it to the type it renders
    value: typeof props.value === 'number' ? props.value : 0,
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const TimePickerAdapter = (props: FieldRenderProps) =>
  React.createElement(TimePicker, {
    label: props.label,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- FieldRenderProps carries the value untyped; the field narrows it to the type it renders
    value: typeof props.value === 'string' ? props.value : '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const HeadingAdapter = (props: FieldRenderProps) =>
  React.createElement(
    Heading,
    {
      label: props.label ?? '',
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      description: props.description ?? props.helperText ?? props.fieldMeta?.description,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      level: props.level,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      collapsible: props.collapsible,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      defaultCollapsed: props.defaultCollapsed,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      showSeparator: props.showSeparator,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      onCollapseChange: props.onCollapseChange,
      ...passthroughProps(props),
    },
    // oxlint-disable-next-line typescript/no-unsafe-argument -- FieldRenderProps carries values as any by its public contract
    props.children,
  );

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
/** Why a Button is disabled: its own reason, the helper text, the df description, then read-only. */
const buttonDisabledReason = (props: FieldRenderProps): string | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- disabledReason arrives through the untyped pass-through props
  const own = typeof props.disabledReason === 'string' ? props.disabledReason.trim() : '';
  if (own !== '') {
    return own;
  }
  if (props.helperText !== undefined && props.helperText !== '') {
    return props.helperText;
  }
  const description = props.fieldMeta?.description;
  if (description !== undefined && description !== '') {
    return description;
  }
  return props.readOnly ? 'Read only' : undefined;
};

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const ButtonAdapter = (props: FieldRenderProps) => {
  const disabled = Boolean(props.disabled ?? props.readOnly);
  const reason = buttonDisabledReason(props);
  return React.createElement(
    Button,
    {
      disabled,
      disabledReason: disabled ? (reason ?? 'Unavailable') : undefined,
      skeleton: props.skeleton,
      compact: props.compact,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
      onPress: disabled ? undefined : props.onPress,
    },
    props.label,
  );
};

// ---------------------------------------------------------------------------
// Adapter components — new field types (forms integration)
// ---------------------------------------------------------------------------

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const PhoneAdapter = (props: FieldRenderProps) =>
  React.createElement(Phone, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
    defaultCountry: props.fieldMeta?.options ?? undefined,
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const RadioGroupAdapter = (props: FieldRenderProps) => {
  const optionsStr = props.fieldMeta?.options ?? props.options ?? '';
  const options = optionsStr
    .split('\n')
    .map((o: string) => o.trim())
    .filter(Boolean)
    .map((o: string) => ({ label: o, value: o }));

  return React.createElement(RadioGroupField, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    options,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
};

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const SliderAdapter = (props: FieldRenderProps) =>
  React.createElement(SliderField, {
    label: props.label,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- FieldRenderProps carries the value untyped; the field narrows it to the type it renders
    value: typeof props.value === 'number' ? props.value : 0,
    onChange: props.onChange,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const ToggleGroupAdapter = (props: FieldRenderProps) => {
  const optionsStr = props.fieldMeta?.options ?? props.options ?? '';
  const options = optionsStr
    .split('\n')
    .map((o: string) => o.trim())
    .filter(Boolean)
    .map((o: string) => ({ label: o, value: o }));

  return React.createElement(ToggleGroupField, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    options,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  });
};

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const ProgressAdapter = (props: FieldRenderProps) =>
  React.createElement(ProgressField, {
    label: props.label,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- FieldRenderProps carries the value untyped; the field narrows it to the type it renders
    value: typeof props.value === 'number' ? props.value : 0,
    error: props.error,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const OTPAdapter = (props: FieldRenderProps) =>
  React.createElement(OTPInputField, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const MentionAdapter = (props: FieldRenderProps) =>
  React.createElement(MentionInputField, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value,
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
    mentions: [],
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const DateRangeAdapter = (props: FieldRenderProps) =>
  React.createElement(DateRangeField, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value,
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const FileUploadAdapter = (props: FieldRenderProps) =>
  React.createElement(FileUploadField, {
    label: props.label,
    value: props.value,
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    // Attach's choose-from-library tab (FileBrowser, MPO-53 AC-11). The feed
    // rides the registry so schema-driven Attach fields reach the library.
    library: props.library !== false,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    libraryFiles: props.libraryFiles,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    libraryFolder: props.libraryFolder,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const FileUploadImageAdapter = (props: FieldRenderProps) =>
  React.createElement(FileUploadField, {
    label: props.label,
    value: props.value,
    onChange: props.onChange,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    library: props.library !== false,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    libraryFiles: props.libraryFiles,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    libraryFolder: props.libraryFolder,
    ...passthroughProps(props),
    isImage: true,
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const LinkAdapter = (props: FieldRenderProps) => {
  const doctype = linkDoctype(props);

  return React.createElement(Link, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    doctype,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });
};

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const DynamicLinkAdapter = (props: FieldRenderProps) =>
  React.createElement(DynamicLink, {
    label: props.label,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    value: props.value ?? '',
    onChange: props.onChange,
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    doctypeFieldValue: props.doctype ?? props.doctypeFieldValue ?? '',
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- FieldRenderProps carries values as any by its public contract
    onDoctypeChange: props.onDoctypeChange,
    doctypes: Array.isArray(props.doctypes) ? props.doctypes : undefined,
    disabled: props.disabled,
    required: props.required,
    error: props.error,
    ...passthroughProps(props),
  });

// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const TableMultiSelectAdapter = (props: FieldRenderProps) => {
  const doctype = linkDoctype(props);
  const value = valueList(props.value);

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
};

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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- cell editor props differ per field kind; DataTableCell spreads them onto the editor
  fieldProps?: Record<string, unknown>;
  readOnly?: boolean;
}

/** The target doctype a Dynamic Link cell reads from its row's sibling column ("" when unset). */
const rowDoctypeOf = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- DataTableCell hands the row over untyped
  rowData: unknown,
  doctypeField: string,
): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- only an object row has a sibling column to read
  if (doctypeField === '' || rowData === null || typeof rowData !== 'object') {
    return '';
  }
  // SAFETY: a non-null object row is a child doc keyed by fieldname
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- see SAFETY above
  return valueText((rowData as Record<string, unknown>)[doctypeField]);
};

/** DataTableCell's custom-cell render signature (`fieldProps.render`). */
// oxlint-disable anti-slop/no-unknown-parameters -- DataTableCell hands cells their value and row untyped
type CellRender = (
  value: unknown,
  rowData: unknown,
  onCellChange: (v: unknown) => void,
  context?: DataTableCellRenderContext,
) => React.ReactElement;
// oxlint-enable anti-slop/no-unknown-parameters

/** Types a custom cell's render function against DataTableCell's signature. */
const cellRender = (render: CellRender): CellRender => render;

const dynamicLinkPlaceholder = (rowDoctype: string, doctypeField: string): string | undefined => {
  if (rowDoctype !== '') {
    return undefined;
  }
  // oxlint-disable-next-line sonarjs/no-duplicate-string -- the fieldtype's own name, used as its label and its registry key
  return doctypeField === '' ? 'Dynamic Link' : `Set ${doctypeField} first`;
};

const parseSelectOptions = (options?: string): { label: string; value: string }[] | undefined => {
  if (options === undefined || options === '') {
    return undefined;
  }
  const parsed = options
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => ({ label: o, value: o }));
  return parsed.length ? parsed : undefined;
};

/** A ChildTable / DataTableCell editor: the cell field kind plus its props. */
export interface TableFieldMapping {
  field: DataTableField;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- cell editor props differ per field kind; DataTableCell spreads them onto the editor
  fieldProps?: Record<string, unknown>;
}

/** Map a Frappe fieldtype to a ChildTable / DataTableCell editable field. */
// oxlint-disable-next-line eslint/complexity -- one flat case per Frappe fieldtype; splitting the switch would scatter the mapping table
export const fieldtypeToTableField = (fieldtype: string, options?: string): TableFieldMapping => {
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
          render: cellRender((value, _rowData, onCellChange, context) =>
            React.createElement(Icon, {
              value: valueText(value),
              onChange: onCellChange,
              compact: true,
              readOnly: context?.readOnly,
              disabled: context?.disabled,
            }),
          ),
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
          render: cellRender((value, _rowData, onCellChange, context) =>
            React.createElement(Rating, {
              // oxlint-disable-next-line anti-slop/no-runtime-typeof -- FieldRenderProps carries the value untyped; the field narrows it to the type it renders
              value: typeof value === 'number' ? value : Number(value) || 0,
              onChange: onCellChange,
              maxStars,
              compact: true,
              // D-18.4: read-only cells block commits, so the stars must not
              // look pressable.
              readOnly: context?.readOnly,
              disabled: context?.disabled,
            }),
          ),
        },
      };
    }
    case 'Phone': {
      return {
        field: 'phoneinput',
        fieldProps: options !== undefined && options !== '' ? { defaultCountry: options } : undefined,
      };
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
      const targetDoctype = options ?? '';
      return {
        field: 'custom',
        fieldProps: {
          doctype: targetDoctype,
          render: cellRender((value, _rowData, onCellChange, context) =>
            React.createElement(Link, {
              value: valueText(value),
              onChange: onCellChange,
              doctype: targetDoctype,
              compact: true,
              // D-18.4: read-only cells block commits, so the combobox must
              // render its non-interactive representation.
              readOnly: context?.readOnly,
              disabled: context?.disabled,
              'aria-label': targetDoctype === '' ? 'Link' : `Link: ${targetDoctype}`,
            }),
          ),
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
      const comboboxProps: NonNullable<TableFieldMapping['fieldProps']> = {
        creatable: true,
        onCreate: (value: string) => ({ label: value, value }),
      };
      if (choices) {
        comboboxProps.options = choices;
      }
      return { field: 'combobox', fieldProps: comboboxProps };
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
          render: cellRender((value, rowData, onCellChange, context) => {
            const rowDoctype = rowDoctypeOf(rowData, doctypeField);
            return React.createElement(Link, {
              value: valueText(value),
              onChange: onCellChange,
              doctype: rowDoctype,
              compact: true,
              disabled: Boolean(!rowDoctype || context?.disabled),
              // D-18.4: read-only cells block commits, so the combobox must
              // render its non-interactive representation.
              readOnly: context?.readOnly,
              placeholder: dynamicLinkPlaceholder(rowDoctype, doctypeField),
              'aria-label': rowDoctype ? `Dynamic Link: ${rowDoctype}` : 'Dynamic Link',
            });
          }),
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
};

/** A df 0/1 (or boolean) flag as a boolean. */
const isFlagSet = (flag: boolean | number | undefined): boolean => flag !== undefined && flag !== false && flag !== 0;

const isVisibleChildField = (f: ChildTableFieldDef): boolean =>
  !isFlagSet(f.hidden) && !TABLE_LAYOUT_TYPES.has(f.fieldtype) && !f.fieldtype.startsWith('Table');

const fieldToColumn = (f: ChildTableFieldDef): TableColumnDef => {
  const mapped = fieldtypeToTableField(f.fieldtype, f.options);
  return {
    id: f.fieldname,
    header: f.label ?? f.fieldname,
    accessorKey: f.fieldname,
    field: mapped.field,
    fieldProps: mapped.fieldProps,
    readOnly: isFlagSet(f.read_only),
  };
};

/** Build editable ChildTable columns from child DocType field defs. */
export const childFieldsToColumns = (fields: ChildTableFieldDef[]): TableColumnDef[] => {
  const visible = fields.filter(isVisibleChildField);
  const flagged = visible.filter((f) => isFlagSet(f.in_list_view));
  const source = flagged.length > 0 ? flagged : visible.slice(0, 8);
  return source.map(fieldToColumn);
};

/** Every editable child field, for the row detail editor (desk's row form). */
export const childFieldsToDetailColumns = (fields: ChildTableFieldDef[]): TableColumnDef[] => {
  const columns: TableColumnDef[] = [];
  for (const f of fields) {
    if (isVisibleChildField(f)) {
      columns.push(fieldToColumn(f));
    }
  }
  return columns;
};

/**
 * Per-row cell visibility from child `depends_on`: the row is `doc`, the
 * parent form doc is `parent`. Undefined when no child field declares one.
 */
export const childCellHidden = (fields: ChildTableFieldDef[], parent?: DependsDoc): ChildCellHidden | undefined => {
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
};

const defaultRowFromFields = (fields: ChildTableFieldDef[]): Record<string, string | number> => {
  const row: [string, string | number][] = [];
  for (const f of fields.filter(isVisibleChildField)) {
    if (f.default != null && f.default !== '') {
      row.push([f.fieldname, f.default]);
      continue;
    }
    switch (f.fieldtype) {
      case 'Int':
      case 'Float':
      case 'Currency':
      case 'Percent':
      case 'Rating':
      case 'Duration': {
        row.push([f.fieldname, 0]);
        break;
      }
      case 'Check': {
        row.push([f.fieldname, 0]);
        break;
      }
      default: {
        row.push([f.fieldname, '']);
      }
    }
  }
  return Object.fromEntries(row);
};

/** Non-empty child field defs, or undefined. */
const asChildFields = (fields: readonly object[] | undefined): ChildTableFieldDef[] | undefined => {
  if (fields === undefined || fields.length === 0) {
    return undefined;
  }
  // SAFETY: static defs are ChildTableFieldDefs; live child meta fields are DocTypeFields, a superset of that contract
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  return fields as ChildTableFieldDef[];
};

/**
 * Resolve ChildTable columns from:
 * 1. explicit `fieldMeta.columns`
 * 2. static `fieldMeta.fields` / `fieldMeta.childFields` (child df)
 * 3. live child DocType meta via `options` + `useDocTypeMeta`
 * 4. first row keys (fixture / offline fallback)
 */
// oxlint-disable-next-line sonarjs/function-name -- a React component adapter; components are PascalCase
const TableAdapter = (props: FieldRenderProps) => {
  const config = useFrappeConfig();
  const metaOptions = props.fieldMeta?.options ?? '';
  const childDoctype = metaOptions === '' ? (props.options ?? '') : metaOptions;
  const hasBaseURL = config?.baseURL !== undefined && config.baseURL !== '';
  const connectionConfig = hasBaseURL
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
  const { meta } = useDocTypeMeta(childDoctype === '' ? undefined : connectionConfig, childDoctype);

  const staticFields = useMemo(() => {
    // SAFETY: a Table df carries its child field defs, when static, on `fields` or `childFields`
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const fm = props.fieldMeta as { fields?: ChildTableFieldDef[]; childFields?: ChildTableFieldDef[] } | undefined;
    const fromMeta = fm?.fields ?? fm?.childFields;
    return Array.isArray(fromMeta) && fromMeta.length > 0 ? fromMeta : undefined;
  }, [props.fieldMeta]);

  const resolvedFields = staticFields ?? meta?.fields;
  const childFields = asChildFields(resolvedFields);

  const columns = useMemo<TableColumnDef[]>(() => {
    // SAFETY: explicit columns, when a caller sets them, ride on the df as `columns`
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const explicit = (props.fieldMeta as { columns?: unknown } | undefined)?.columns;
    if (Array.isArray(explicit) && explicit.length > 0) {
      // SAFETY: a caller-supplied `columns` array is the TableColumnDef list by contract
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      return explicit as TableColumnDef[];
    }

    if (childFields) {
      const cols = childFieldsToColumns(childFields);
      if (cols.length > 0) {
        return cols;
      }
    }

    const rows: unknown[] = Array.isArray(props.value) ? props.value : [];
    // SAFETY: the find keeps only non-null object rows, which are child docs keyed by fieldname
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type -- see SAFETY above
    const sample = rows.find((row) => row !== null && typeof row === 'object') as Record<string, unknown> | undefined;
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
  }, [childFields, props.fieldMeta, props.value]);

  const defaultRow = useMemo(
    () => (childFields === undefined ? undefined : defaultRowFromFields(childFields)),
    [childFields],
  );

  const detailColumns = useMemo(
    () => (childFields === undefined ? undefined : childFieldsToDetailColumns(childFields)),
    [childFields],
  );

  const { parentDoc } = props;
  const isCellHidden = useMemo(
    () => (childFields === undefined ? undefined : childCellHidden(childFields, parentDoc)),
    [childFields, parentDoc],
  );

  return React.createElement(ChildTable, {
    label: props.label,
    value: Array.isArray(props.value) ? props.value : [],
    onChange: props.onChange,
    columns,
    detailColumns: detailColumns !== undefined && detailColumns.length > 0 ? detailColumns : undefined,
    rowDetail: true,
    isCellHidden,
    defaultRow,
    disabled: props.disabled,
    error: props.error,
    required: props.required,
    ...passthroughProps(props),
  });
};

// ---------------------------------------------------------------------------
// Default registration
// ---------------------------------------------------------------------------

export const initDefaultRegistry = (): void => {
  // Data types
  registerField('Data', DataAdapter);

  // Autocomplete (searchable combobox over static options, free text allowed)
  registerField('Autocomplete', AutocompleteAdapter);

  // Phone (backed by forms PhoneInput)
  registerField('Phone', PhoneAdapter);

  // Numeric types
  registerField('Int', numericAdapter('Int'));
  registerField('Float', numericAdapter('Float'));
  registerField('Currency', numericAdapter('Currency'));
  registerField('Percent', numericAdapter('Percent'));

  // Select
  registerField('Select', SelectAdapter);

  // Check
  registerField('Check', CheckAdapter);

  // Date/Time types ("Time" is registered once below, to TimePickerAdapter —
  // registering DateAdapter("time") here too was the double-registration trap:
  // the registry is last-write-wins, so the earlier entry was dead code).
  registerField('Date', dateAdapter('date'));
  registerField('Datetime', dateAdapter('datetime'));

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
};

// Initialize default registry at module load
initDefaultRegistry();
