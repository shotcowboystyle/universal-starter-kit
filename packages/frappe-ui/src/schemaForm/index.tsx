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

import { Card } from '@repo/ui';
import { RequiredMarkingContext, computeRequiredMarkMode } from '@repo/forms';
import type { RequiredMarkStrategy } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack, YStack } from 'tamagui';

import { compileDependsOn } from '../dependsOn';
import { useFieldResolver } from '../fieldOverrides';
import type { FieldRenderProps, FieldSchema } from '../fieldRegistry';
import { Heading } from '../fields/Heading';
import type { HeadingLevel } from '../fields/Heading';

import { applyOrderToSchema } from './applyFieldOrder';

export { applyFieldOrder, applyOrderToSchema } from './applyFieldOrder';

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
  | { props: Record<string, any> };

export interface SchemaFormProps {
  /** The form schema (sections, columns, fields). */
  schema: FormSchema;
  /** Current document / record values keyed by field name. */
  doc: Record<string, any>;
  /** Callback to set a single field value. */
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

function isOverrideFunction(override: FieldOverride): override is (props: FieldRenderProps) => React.ReactNode {
  return typeof override === 'function';
}

function isOverrideComponent(
  override: FieldOverride,
): override is { component: React.ComponentType<FieldRenderProps> } {
  return typeof override === 'object' && 'component' in override;
}

function isOverrideProps(override: FieldOverride): override is { props: Record<string, any> } {
  return typeof override === 'object' && 'props' in override;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SchemaForm({
  schema,
  doc,
  setValue,
  errors = {},
  disabled = false,
  overrides = {},
  hideFields = [],
  readOnlyFields = [],
  requiredMarking = 'auto',
  sectionHeadingLevel = 2,
  renderFieldWrapper,
  order,
}: SchemaFormProps) {
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
    const map = new Map<string, (doc: Record<string, unknown>) => boolean>();
    for (const field of orderedSchema.fields) {
      if (field.depends_on) {
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
    const flags = orderedSchema.fields
      .filter((f) => !layoutFieldTypes.has(f.type) && !f.hidden && !hiddenSet.has(f.name))
      .map((f) => !!f.required);
    return computeRequiredMarkMode(flags, requiredMarking);
  }, [orderedSchema.fields, requiredMarking, hiddenSet]);

  function renderField(field: FieldSchema) {
    // Skip layout break fields — structural, not rendered as inputs
    if (layoutFieldTypes.has(field.type)) {
      return null;
    }

    // Check hideFields
    if (field.hidden || hiddenSet.has(field.name)) {
      return null;
    }

    // Check depends_on
    const evaluator = dependsOnMap.get(field.name);
    if (evaluator && !evaluator(doc)) {
      return null;
    }

    const fieldReadOnly = readOnlySet.has(field.name) || !!field.readOnly;

    // Link: options is the target DocType. Dynamic Link: options is the sibling
    // field that holds the DocType name. Table MultiSelect: options is the doctype.
    const optionsStr = typeof field.options === 'string' ? field.options : '';
    let doctype: string | undefined;
    let onDoctypeChange: ((doctype: string) => void) | undefined;
    if (field.type === 'Link' || field.type === 'Table MultiSelect') {
      doctype = optionsStr || undefined;
    } else if (field.type === 'Dynamic Link') {
      doctype = optionsStr ? String(doc[optionsStr] ?? '') : undefined;
      if (optionsStr) {
        onDoctypeChange = (next: string) => {
          if (disabled || fieldReadOnly) {
            return;
          }
          setValue(optionsStr, next);
        };
      }
    }

    // Image: display-only preview of the image whose URL lives in the field
    // named by df.options (falls back to the Image field's own value).
    const fieldValue = field.type === 'Image' && optionsStr ? (doc[optionsStr] ?? doc[field.name]) : doc[field.name];

    const baseProps: FieldRenderProps = {
      label: field.label,
      value: fieldValue,
      onChange: (v: unknown) => {
        // Belt-and-braces: a disabled or read-only field must never mutate the doc,
        // even if a field renderer fails to block input at the DOM level.
        if (disabled || fieldReadOnly) {
          return;
        }
        setValue(field.name, v);
      },
      disabled,
      readOnly: fieldReadOnly,
      required: !!field.required,
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

    // Check overrides
    const override = overrides[field.name];
    if (override) {
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

      if (isOverrideProps(override)) {
        const mergedProps = { ...baseProps, ...override.props };
        const Component = resolveFieldComponent(field.type);
        if (!Component) {
          return (
            <Text
              key={field.name}
              color="$color10"
              fontSize="$2">
              {t('Unsupported field type: {{fieldtype}}', { fieldtype: field.type })}
            </Text>
          );
        }
        return (
          <Component
            key={field.name}
            {...mergedProps}
          />
        );
      }
    }

    // Default: use registry
    const Component = resolveFieldComponent(field.type);
    if (!Component) {
      return (
        <Text
          key={field.name}
          color="$color10"
          fontSize="$2">
          {t('Unsupported field type: {{fieldtype}}', { fieldtype: field.type })} ({field.name})
        </Text>
      );
    }

    return (
      <Component
        key={field.name}
        {...baseProps}
      />
    );
  }

  // The wrapper interposes on every field that actually renders; a null
  // result (layout break / hidden / depends_on-hidden) stays null so wrapper
  // chrome can never resurrect an intentionally absent field.
  function renderWrappedField(field: FieldSchema) {
    const rendered = renderField(field);
    if (rendered === null || rendered === undefined || !renderFieldWrapper) {
      return rendered;
    }
    return <React.Fragment key={field.name}>{renderFieldWrapper(rendered, field)}</React.Fragment>;
  }

  return (
    <RequiredMarkingContext.Provider value={{ mode: requiredMarkMode }}>
      <YStack {...knobProps.gapLg}>
        {orderedSchema.sections.map((section, sectionIndex) => {
          const sectionKey = section.label ? `section-${section.label}` : `section-${sectionIndex}`;
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
}

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
function SchemaFormSectionCard({ section, headingLevel, renderField }: SchemaFormSectionCardProps) {
  const { knobProps } = useResolvedKnobs();
  const collapsible = !!section.collapsible && !!section.label;
  const [collapsed, setCollapsed] = React.useState(collapsible ? (section.collapsed ?? true) : false);
  React.useEffect(() => {
    if (collapsible && section.collapsed !== undefined) {
      setCollapsed(section.collapsed);
    }
  }, [collapsible, section.collapsed]);
  const hideBorder = !!section.hideBorder;
  const effectiveCollapsed = collapsible && collapsed;

  return (
    <Card
      data-mpo-schema-form-card=""
      data-mpo-schema-form-borderless={hideBorder ? '' : undefined}
      {...(hideBorder ? { borderWidth: 0, backgroundColor: 'transparent' } : {})}>
      {(section.label || section.description) && (
        <Card.Header>
          {section.label ? (
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
                  {column.fields[rowIndex] ? renderField(column.fields[rowIndex]) : null}
                </YStack>
              ))}
            </XStack>
          ))}
        </YStack>
      </Card.Footer>
    </Card>
  );
}
