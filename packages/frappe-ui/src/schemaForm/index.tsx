/**
 * Schema-driven form layout renderer.
 *
 * Renders a complete form from a generic schema definition —
 * iterating over sections, columns, and fields.  Supports conditional
 * visibility via `depends_on` expressions, field overrides, hidden
 * fields, and read-only fields.
 *
 * This component is framework-agnostic: it accepts a generic
 * `FormSchema` (sections → columns → fields) and resolves field
 * renderers via the `fieldRegistry`.
 */

import { RequiredMarkingContext, computeRequiredMarkMode } from '@repo/forms';
import type { RequiredMarkStrategy } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { Card } from '@repo/ui';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack, YStack } from 'tamagui';

import { compileDependsOn } from '../depends-on';
import type { DependsEvaluator } from '../depends-on';
import { useFieldResolver } from '../field-overrides';
import type { FieldRenderProps, FieldSchema } from '../field-registry';
import { Heading } from '../fields/Heading';
import type { HeadingLevel } from '../fields/Heading';

import { applyOrderToSchema } from './apply-field-order';

export { applyFieldOrder, applyOrderToSchema } from './apply-field-order';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A column within a form section — contains an array of fields. */
export interface FormColumn {
  fields: FieldSchema[];
}

/** A section within a form — contains heading info and columns. */
export interface FormSection {
  label?: string;
  /** Section help text rendered under the heading (Frappe df.description). */
  description?: string;
  collapsible?: boolean;
  /**
   * Computed collapse state (Frappe: collapsible sections start collapsed
   * unless collapsible_depends_on / a missing mandatory value forces them
   * open). Recomputed by the schema builder per doc change; manual toggles
   * survive until the computed value itself changes.
   */
  collapsed?: boolean;
  /** Render without the card border / heading separator (df.hide_border). */
  hideBorder?: boolean;
  columns: FormColumn[];
}

/** Top-level form schema definition. */
export interface FormSchema {
  sections: FormSection[];
  /** Flat list of all fields (for depends_on pre-compilation). */
  fields: FieldSchema[];
}

/** Override for a specific field in the schema form. */
export type FieldOverride =
  | ((props: FieldRenderProps) => React.ReactNode)
  | { component: React.ComponentType<FieldRenderProps> }
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- extra props are forwarded verbatim to the resolved field component
  | { props: Record<string, unknown> };

export interface SchemaFormProps {
  /** The form schema (sections, columns, fields). */
  schema: FormSchema;
  /** Current document / record values keyed by field name. */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- field values are schema-defined; their types are only known per fieldtype at runtime
  doc: Record<string, unknown>;
  /** Callback to set a single field value. */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the value's type depends on the field's runtime fieldtype
  setValue: (field: string, value: unknown) => void;
  /** Per-field error messages keyed by field name. */
  errors?: Record<string, string>;
  /** Disable all fields. */
  disabled?: boolean;
  /** Per-field overrides keyed by field name. */
  overrides?: Record<string, FieldOverride>;
  /** Field names to hide. */
  hideFields?: string[];
  /** Field names to force read-only. */
  readOnlyFields?: string[];
  /**
   * Required/optional marking strategy (DG-FORM-05). Default `"auto"` marks
   * the minority computed from schema `required` flags.
   */
  requiredMarking?: RequiredMarkStrategy;
  /**
   * Semantic level for section headings (DG-A11Y-02). Default 2 — the form's
   * sections sit one step below the page h1. Pass 3 when the form is nested
   * under an h2 so heading levels step without skips.
   */
  sectionHeadingLevel?: HeadingLevel;
  /**
   * Wrap every rendered field node (registry defaults, overrides, and the
   * unsupported-type fallback alike). This is the bridge for host-level
   * per-field chrome — e.g. per-field error containment — without
   * re-implementing the registry render path. Fields that render nothing
   * (layout breaks, hidden, failing depends_on) never reach the wrapper.
   */
  renderFieldWrapper?: (rendered: React.ReactNode, field: FieldSchema) => React.ReactNode;
  /**
   * R2: reorder fields inside the existing layout. Listed names permute
   * among the slots they already occupy; unlisted fields keep their meta
   * positions. Unknown names are ignored. Cheaper than replacing `sections`.
   */
  order?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Layout / no-input field types that are never rendered as form inputs.
 * `Fold` is a structural collapse marker holding no data. `Button` is an
 * action field and renders through the registry — it is not a layout break.
 */
const layoutFieldTypes = new Set(['Section Break', 'Column Break', 'Tab Break', 'Fold']);

const NO_ERRORS: Record<string, string> = {};
const NO_OVERRIDES: Record<string, FieldOverride> = {};
const NO_FIELD_NAMES: string[] = [];

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

const isOverrideFunction = (override: FieldOverride): override is (props: FieldRenderProps) => React.ReactNode =>
  typeof override === 'function';

const isOverrideComponent = (
  override: FieldOverride,
): override is { component: React.ComponentType<FieldRenderProps> } =>
  typeof override === 'object' && 'component' in override;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors FieldOverride's forwarded props
const isOverrideProps = (override: FieldOverride): override is { props: Record<string, unknown> } =>
  typeof override === 'object' && 'props' in override;

interface LinkProps {
  doctype?: string;
  onDoctypeChange?: (doctype: string) => void;
}

/**
 * Link: options is the target DocType. Dynamic Link: options is the sibling
 * field that holds the DocType name. Table MultiSelect: options is the doctype.
 */
const resolveLinkProps = (
  field: FieldSchema,
  doc: SchemaFormProps['doc'],
  setSibling: ((fieldname: string, next: string) => void) | undefined,
): LinkProps => {
  const optionsStr = field.options ?? '';
  if (field.type === 'Link' || field.type === 'Table MultiSelect') {
    return { doctype: optionsStr || undefined };
  }
  if (field.type !== 'Dynamic Link' || optionsStr === '') {
    return {};
  }
  return {
    // oxlint-disable-next-line typescript/no-base-to-string -- the sibling field holds a DocType name string
    doctype: String(doc[optionsStr] ?? ''),
    onDoctypeChange: (next: string) => {
      setSibling?.(optionsStr, next);
    },
  };
};

const renderUnsupported = (field: FieldSchema, message: string, suffix?: string): React.ReactNode => (
  <Text
    key={field.name}
    color="$color10"
    fontSize="$2">
    {message}
    {suffix}
  </Text>
);

// ---------------------------------------------------------------------------
// Section card (collapse state lives here)
// ---------------------------------------------------------------------------

interface SchemaFormSectionCardProps {
  section: FormSection;
  headingLevel: HeadingLevel;
  renderField: (field: FieldSchema) => React.ReactNode;
}

/**
 * One form section as a card. Collapsible sections follow Frappe semantics:
 * the schema builder computes `section.collapsed` (collapsed by default,
 * expanded when collapsible_depends_on is truthy or a mandatory value is
 * missing) and recomputes it as the doc changes; the user's manual toggle
 * wins until the computed value itself changes.
 */
const SchemaFormSectionCard = ({ section, headingLevel, renderField }: SchemaFormSectionCardProps) => {
  const { knobProps } = useResolvedKnobs();
  const collapsible = Boolean(section.collapsible) && hasText(section.label);
  const [collapsed, setCollapsed] = React.useState(collapsible ? (section.collapsed ?? true) : false);
  React.useEffect(() => {
    if (collapsible && section.collapsed !== undefined) {
      // oxlint-disable-next-line react/set-state-in-effect -- the manual toggle must win until the computed value changes; this effect is keyed on that change
      setCollapsed(section.collapsed);
    }
  }, [collapsible, section.collapsed]);
  const hideBorder = Boolean(section.hideBorder);
  const effectiveCollapsed = collapsible && collapsed;

  return (
    <Card
      data-mpo-schema-form-card=""
      data-mpo-schema-form-borderless={hideBorder ? '' : undefined}
      {...(hideBorder ? { borderWidth: 0, backgroundColor: 'transparent' } : {})}>
      {(hasText(section.label) || hasText(section.description)) && (
        <Card.Header>
          {hasText(section.label) ? (
            <Heading
              label={section.label}
              description={section.description}
              level={headingLevel}
              collapsible={collapsible}
              collapsed={effectiveCollapsed}
              onCollapseChange={setCollapsed}
              showSeparator={!hideBorder}
            />
          ) : (
            <Text
              fontSize="$3"
              color="$color10">
              {section.description}
            </Text>
          )}
        </Card.Header>
      )}
      {/* Kept mounted while collapsed (display none) so field state and the
          collapse target survive toggles — matches desk's CSS hide. */}
      <Card.Footer
        display={effectiveCollapsed ? 'none' : undefined}
        aria-hidden={effectiveCollapsed || undefined}>
        <YStack
          {...knobProps.gap}
          width="100%"
          data-mpo-schema-form-section="">
          {Array.from({ length: Math.max(...section.columns.map((c) => c.fields.length), 0) }, (_, rowIndex) => (
            // flexWrap + minWidth: columns stack when the container is narrower
            // than ~250px × N (DG-FORM-09). Keep row-major DOM order for tab.
            <XStack
              key={rowIndex}
              {...knobProps.gapLg}
              width="100%"
              flexWrap="wrap"
              alignItems="flex-start"
              data-mpo-schema-form-row="">
              {section.columns.map((column, colIndex) => (
                <YStack
                  key={colIndex}
                  flex={1}
                  flexBasis={250}
                  minWidth={250}
                  maxWidth="100%"
                  data-mpo-schema-form-col="">
                  {rowIndex < column.fields.length ? renderField(column.fields[rowIndex]) : null}
                </YStack>
              ))}
            </XStack>
          ))}
        </YStack>
      </Card.Footer>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SchemaForm = ({
  schema,
  doc,
  setValue,
  errors = NO_ERRORS,
  disabled = false,
  overrides = NO_OVERRIDES,
  hideFields = NO_FIELD_NAMES,
  readOnlyFields = NO_FIELD_NAMES,
  requiredMarking = 'auto',
  sectionHeadingLevel = 2,
  renderFieldWrapper,
  order,
}: SchemaFormProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  // Context-scoped overrides first, module-global registry as fallback
  // (GL-4: two providers with different overrides must not interfere).
  const resolveFieldComponent = useFieldResolver();

  const orderedSchema = useMemo(() => applyOrderToSchema(schema, order), [schema, order]);

  // Pre-compile depends_on evaluators for all fields (safe recursive-descent
  // parser — no string eval, works under Hermes/GJS/CSP; unparseable
  // expressions fall back to visible).
  const dependsOnMap = useMemo(() => {
    const map = new Map<string, DependsEvaluator>();
    for (const field of orderedSchema.fields) {
      if (hasText(field.depends_on)) {
        const evaluator = compileDependsOn(field.depends_on, true);
        if (evaluator) {
          map.set(field.name, evaluator);
        }
      }
    }
    return map;
  }, [orderedSchema.fields]);

  const hiddenSet = useMemo(() => new Set(hideFields), [hideFields]);
  const readOnlySet = useMemo(() => new Set(readOnlyFields), [readOnlyFields]);

  const requiredMarkMode = useMemo(() => {
    const flags: boolean[] = [];
    for (const f of orderedSchema.fields) {
      if (!layoutFieldTypes.has(f.type) && !f.hidden && !hiddenSet.has(f.name)) {
        flags.push(Boolean(f.required));
      }
    }
    return computeRequiredMarkMode(flags, requiredMarking);
  }, [orderedSchema.fields, requiredMarking, hiddenSet]);
  const requiredMarkingValue = useMemo(() => ({ mode: requiredMarkMode }), [requiredMarkMode]);

  const isFieldShown = (field: FieldSchema): boolean => {
    // Skip layout break fields — structural, not rendered as inputs; then
    // hideFields.
    if (layoutFieldTypes.has(field.type) || field.hidden === true || hiddenSet.has(field.name)) {
      return false;
    }
    // Check depends_on
    const evaluator = dependsOnMap.get(field.name);
    return !evaluator || evaluator(doc);
  };

  const buildBaseProps = (field: FieldSchema): FieldRenderProps => {
    const fieldReadOnly = readOnlySet.has(field.name) || Boolean(field.readOnly);
    // Belt-and-braces: a disabled or read-only field must never mutate the doc,
    // even if a field renderer fails to block input at the DOM level.
    const canEdit = !disabled && !fieldReadOnly;
    const { doctype, onDoctypeChange } = resolveLinkProps(field, doc, canEdit ? setValue : undefined);
    // Image: display-only preview of the image whose URL lives in the field
    // named by df.options (falls back to the Image field's own value).
    const optionsStr = field.options ?? '';
    const fieldValue = field.type === 'Image' && optionsStr ? (doc[optionsStr] ?? doc[field.name]) : doc[field.name];

    return {
      label: field.label,
      value: fieldValue,
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the value's type depends on the field's runtime fieldtype
      onChange: (v: unknown) => {
        if (canEdit) {
          setValue(field.name, v);
        }
      },
      disabled,
      readOnly: fieldReadOnly,
      required: Boolean(field.required),
      error: errors[field.name],
      fieldMeta: field,
      options: field.options,
      doctype,
      onDoctypeChange,
      // Choice heuristics (DG-CTRL-*): option count comes from parsed `options`;
      // commit/control/multiple are first-class so adapters need not dig fieldMeta.
      multiple: field.multiple,
      commit: field.commit,
      control: field.control,
      ...(field.type === 'Table' ? { parentDoc: doc } : null),
    };
  };

  const renderOverride = (
    field: FieldSchema,
    override: FieldOverride,
    baseProps: FieldRenderProps,
  ): React.ReactNode | undefined => {
    if (isOverrideFunction(override)) {
      return <React.Fragment key={field.name}>{override(baseProps)}</React.Fragment>;
    }
    if (isOverrideComponent(override)) {
      const OverrideComponent = override.component;
      return (
        <OverrideComponent
          key={field.name}
          {...baseProps}
        />
      );
    }
    if (!isOverrideProps(override)) {
      return undefined;
    }
    const mergedProps = { ...baseProps, ...override.props };
    const Component = resolveFieldComponent(field.type);
    if (!Component) {
      return renderUnsupported(field, t('Unsupported field type: {{fieldtype}}', { fieldtype: field.type }));
    }
    return (
      <Component
        key={field.name}
        {...mergedProps}
      />
    );
  };

  const renderField = (field: FieldSchema): React.ReactNode => {
    if (!isFieldShown(field)) {
      return null;
    }
    const baseProps = buildBaseProps(field);

    // Check overrides
    const override: FieldOverride | undefined = overrides[field.name];
    const overridden = override === undefined ? undefined : renderOverride(field, override, baseProps);
    if (overridden !== undefined) {
      return overridden;
    }

    // Default: use registry
    const Component = resolveFieldComponent(field.type);
    if (!Component) {
      return renderUnsupported(
        field,
        t('Unsupported field type: {{fieldtype}}', { fieldtype: field.type }),
        ` (${field.name})`,
      );
    }

    return (
      <Component
        key={field.name}
        {...baseProps}
      />
    );
  };

  // The wrapper interposes on every field that actually renders; a null
  // result (layout break / hidden / depends_on-hidden) stays null so wrapper
  // chrome can never resurrect an intentionally absent field.
  const renderWrappedField = (field: FieldSchema): React.ReactNode => {
    const rendered = renderField(field);
    if (rendered === null || rendered === undefined || !renderFieldWrapper) {
      return rendered;
    }
    return <React.Fragment key={field.name}>{renderFieldWrapper(rendered, field)}</React.Fragment>;
  };

  return (
    <RequiredMarkingContext.Provider value={requiredMarkingValue}>
      <YStack {...knobProps.gapLg}>
        {orderedSchema.sections.map((section, sectionIndex) => {
          const sectionKey = hasText(section.label) ? `section-${section.label}` : `section-${sectionIndex}`;
          return (
            <SchemaFormSectionCard
              key={sectionKey}
              section={section}
              headingLevel={sectionHeadingLevel}
              renderField={renderWrappedField}
            />
          );
        })}
      </YStack>
    </RequiredMarkingContext.Provider>
  );
};
