/**
 * Desk form layout engine.
 *
 * Splits the flat DocType field list into desk tabs (Tab Break), sections
 * (Section Break, collapsible honored), and columns (Column Break), and
 * maps them to the generic `FormSchema` consumed by frappe-ui's SchemaForm.
 *
 * Dynamic behavior is computed HERE with the safe depends_on evaluator
 * (dependsOn.ts) — the `depends_on` string is deliberately stripped from the
 * FieldSchema handed to SchemaForm so its string-eval-based evaluator
 * (which cannot run on Hermes/GJS) never engages:
 *
 *   - depends_on            → field omitted from the built schema
 *   - mandatory_depends_on  → `required: true` on the built FieldSchema
 *   - read_only_depends_on  → `readOnly: true` on the built FieldSchema
 *   - permlevel             → hidden without level read, read-only without
 *     level write (role matrix via fieldPermissions.ts; coarse read-only
 *     fallback when roles are unavailable)
 *   - set_only_once         → read-only on saved docs
 *   - fetch_from            → read-only while the source link holds a value
 *     (unless fetch_if_empty)
 *   - docstatus > 0         → everything read-only except allow_on_submit
 *     fields on a submitted (1) doc
 *   - collapsible / collapsible_depends_on / missing-mandatory → per-section
 *     computed collapse state (desk refresh_section_collapse)
 *
 * Sections whose Section Break has a false depends_on hide wholesale; a
 * section with no visible fields is dropped so SchemaForm never renders an
 * empty card.
 */

import { formatCalendarDate } from '@repo/theme';

import { evaluateDependsOn } from '../depends-on';
import type { FieldSchema } from '../field-registry';
import type { FormColumn, FormSchema, FormSection } from '../schemaForm';

import type { DocFieldMeta } from './doctype-meta';
import { isFetchLocked } from './fetch-from';
import { canReadLevel, canWriteLevel } from './field-permissions';
import type { PermLevelMatrix } from './field-permissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormTab {
  /** Stable key (fieldname of the Tab Break or "__details") */
  key: string;
  label: string;
  schema: FormSchema;
}

interface LayoutColumn {
  fields: DocFieldMeta[];
}

interface LayoutSection {
  breakField?: DocFieldMeta;
  columns: LayoutColumn[];
}

interface LayoutTab {
  key: string;
  label?: string;
  sections: LayoutSection[];
}

// ---------------------------------------------------------------------------
// Static structure (from meta, doc-independent)
// ---------------------------------------------------------------------------

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- doc field values are DocType-defined; keys and types are only known from runtime meta
type DocValues = Record<string, unknown>;

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

const emptySection = (breakField?: DocFieldMeta) => {
  const column: LayoutColumn = { fields: [] };
  const section: LayoutSection = breakField ? { breakField, columns: [column] } : { columns: [column] };
  return { section, column };
};

const splitIntoTabs = (fields: DocFieldMeta[]): LayoutTab[] => {
  const tabs: LayoutTab[] = [];
  let currentTab: LayoutTab = { key: '__details', sections: [] };
  let { section: currentSection, column: currentColumn } = emptySection();
  currentTab.sections.push(currentSection);
  tabs.push(currentTab);

  for (const field of fields) {
    if (field.fieldtype === 'Tab Break') {
      currentTab = { key: field.fieldname, label: field.label, sections: [] };
      ({ section: currentSection, column: currentColumn } = emptySection());
      currentTab.sections.push(currentSection);
      tabs.push(currentTab);
    } else if (field.fieldtype === 'Section Break') {
      ({ section: currentSection, column: currentColumn } = emptySection(field));
      currentTab.sections.push(currentSection);
    } else if (field.fieldtype === 'Column Break') {
      currentColumn = { fields: [] };
      currentSection.columns.push(currentColumn);
    } else {
      currentColumn.fields.push(field);
    }
  }
  return tabs;
};

// ---------------------------------------------------------------------------
// Doc-dependent resolution
// ---------------------------------------------------------------------------

export interface BuildTabsOptions {
  fields: DocFieldMeta[];
  doc: DocValues;
  /** docstatus of the loaded doc (0 draft / 1 submitted / 2 cancelled). */
  docstatus: number;
  /** Meta-level read_only or missing write permission. */
  formReadOnly: boolean;
  /** Create mode relaxes read_only_depends_on on unsaved values. */
  isCreate: boolean;
  /** Default label for the implicit first tab. */
  detailsLabel: string;
  /**
   * Role-derived permlevel matrix (fieldPermissions.ts). Desk semantics:
   * fields at a level without read HIDE; read without write → read-only.
   * Undefined (fixtures / roles unavailable) → coarse fallback: any
   * permlevel > 0 renders read-only, never hidden.
   */
  permLevels?: PermLevelMatrix;
  /** Host-hidden fields (fieldnames) — dropped before layout resolution. */
  hiddenFields?: readonly string[];
  /**
   * Host-hidden sections/tabs. Matches a Section Break's or Tab Break's
   * fieldname OR label; the whole section (or tab) is dropped.
   */
  hiddenSections?: readonly string[];
}

const isFieldVisible = (field: DocFieldMeta, doc: DocValues, permLevels?: PermLevelMatrix): boolean => {
  if (field.hidden === 1) {
    return false;
  }
  // Desk hides fields whose permlevel the user cannot read (perm.js:209-215).
  if (!canReadLevel(permLevels, field.permlevel ?? 0)) {
    return false;
  }
  // Visibility fallback = true: an unparseable expression shows the field.
  return evaluateDependsOn(field.depends_on, doc, true);
};

const isFieldReadOnly = (field: DocFieldMeta, doc: DocValues, options: BuildTabsOptions): boolean => {
  if (field.read_only === 1) {
    return true;
  }
  if (hasText(field.read_only_depends_on) && evaluateDependsOn(field.read_only_depends_on, doc, false)) {
    return true;
  }
  if (!canWriteLevel(options.permLevels, field.permlevel ?? 0)) {
    return true;
  }
  // set_only_once: editable only while the doc is unsaved (perm.js:261-263).
  if (field.set_only_once === 1 && !options.isCreate) {
    return true;
  }
  // fetch_from without fetch_if_empty locks the target while its source link
  // holds a value (desk read_only_because_of_fetch_from).
  if (isFetchLocked(field, doc)) {
    return true;
  }
  if (options.docstatus === 1 && field.allow_on_submit !== 1) {
    return true;
  }
  return options.docstatus === 2 || options.formReadOnly;
};

const toFieldSchema = (field: DocFieldMeta, doc: DocValues, options: BuildTabsOptions): FieldSchema => {
  const required =
    field.required === 1 ||
    (hasText(field.mandatory_depends_on) && evaluateDependsOn(field.mandatory_depends_on, doc, false));

  return {
    type: field.fieldtype,
    name: field.fieldname,
    label: field.label,
    options: field.options,
    description: field.description,
    required,
    readOnly: isFieldReadOnly(field, doc, options),
    precision:
      field.precision !== undefined && field.precision !== null && field.precision !== ''
        ? Number(field.precision)
        : undefined,
    maxLength: field.length !== undefined && field.length > 0 ? field.length : undefined,
    // depends_on intentionally NOT forwarded — visibility resolved here.
    fieldtype: field.fieldtype,
    fieldname: field.fieldname,
    in_list_view: field.in_list_view,
    in_standard_filter: field.in_standard_filter,
  };
};

/** Desk section.has_missing_mandatory: `required && value == null` (section.js:146-156). */
const sectionHasMissingMandatory = (fields: DocFieldMeta[], doc: DocValues): boolean =>
  fields.some((field) => field.required === 1 && doc[field.fieldname] == null);

/**
 * Desk's refresh_section_collapse (layout.js:463-483): a collapsible section
 * starts collapsed unless its `collapsible_depends_on` evaluates truthy, and
 * a section with a missing mandatory value is forced open. Recomputed per
 * doc change — SchemaForm treats it as the live default while manual toggles
 * survive between recomputes.
 */
const resolveSectionCollapsed = (
  breakField: DocFieldMeta | undefined,
  sectionFields: DocFieldMeta[],
  doc: DocValues,
): boolean | undefined => {
  if (breakField?.collapsible !== 1) {
    return undefined;
  }
  let collapsed = true;
  if (hasText(breakField.collapsible_depends_on)) {
    // Unparseable expression → expanded (never hide content silently).
    collapsed = !evaluateDependsOn(breakField.collapsible_depends_on, doc, true);
  }
  if (collapsed && sectionHasMissingMandatory(sectionFields, doc)) {
    collapsed = false;
  }
  return collapsed;
};

interface TabContext {
  options: BuildTabsOptions;
  hiddenFields: ReadonlySet<string>;
  hiddenSections: ReadonlySet<string>;
}

const isSectionHidden = (context: TabContext, breakField: DocFieldMeta | undefined, label?: string): boolean => {
  if (context.hiddenSections.size === 0) {
    return false;
  }
  if (breakField && context.hiddenSections.has(breakField.fieldname)) {
    return true;
  }
  const resolvedLabel = breakField?.label ?? label;
  return hasText(resolvedLabel) && context.hiddenSections.has(resolvedLabel);
};

const resolveColumns = (context: TabContext, section: LayoutSection): FormColumn[] => {
  const { doc, permLevels } = context.options;
  const columns: FormColumn[] = [];
  for (const column of section.columns) {
    const fields: FieldSchema[] = [];
    for (const field of column.fields) {
      if (!context.hiddenFields.has(field.fieldname) && isFieldVisible(field, doc, permLevels)) {
        fields.push(toFieldSchema(field, doc, context.options));
      }
    }
    if (fields.length > 0) {
      columns.push({ fields });
    }
  }
  return columns;
};

const buildSection = (context: TabContext, section: LayoutSection): FormSection | undefined => {
  const { doc } = context.options;
  // Section Breaks are not permlevel-gated in desk (sections aren't
  // controls; they only auto-hide when all their fields hide) — so the
  // permlevel matrix is deliberately not passed here.
  if (section.breakField && !isFieldVisible(section.breakField, doc)) {
    return undefined;
  }
  if (isSectionHidden(context, section.breakField)) {
    return undefined;
  }
  const columns = resolveColumns(context, section);
  if (columns.length === 0) {
    return undefined;
  }
  const sectionFields = section.columns.flatMap((column) => column.fields);
  return {
    label: section.breakField?.label,
    description: section.breakField?.description,
    collapsible: section.breakField?.collapsible === 1,
    collapsed: resolveSectionCollapsed(section.breakField, sectionFields, doc),
    hideBorder: Boolean(section.breakField?.hide_border),
    columns,
  };
};

const buildTab = (context: TabContext, layoutTab: LayoutTab): FormTab | undefined => {
  const { fields, doc, permLevels, detailsLabel } = context.options;
  // Tab Break fields support depends_on + permlevel gating too (tab.js:38-43).
  const tabBreak = fields.find((field) => field.fieldtype === 'Tab Break' && field.fieldname === layoutTab.key);
  if (tabBreak && !isFieldVisible(tabBreak, doc, permLevels)) {
    return undefined;
  }
  // Host hiddenSections also match tabs (fieldname or label).
  if (isSectionHidden(context, tabBreak, layoutTab.label)) {
    return undefined;
  }

  const sections: FormSection[] = [];
  const flatFields: FieldSchema[] = [];
  for (const layoutSection of layoutTab.sections) {
    const section = buildSection(context, layoutSection);
    if (section) {
      sections.push(section);
      for (const column of section.columns) {
        flatFields.push(...column.fields);
      }
    }
  }
  if (sections.length === 0) {
    return undefined;
  }
  return {
    key: layoutTab.key,
    label: layoutTab.label ?? detailsLabel,
    schema: { sections, fields: flatFields },
  };
};

/**
 * Build the desk tab list for the current doc state. Recomputed whenever
 * the doc changes so depends_on chains re-resolve; the work is O(fields).
 */
export const buildFormTabs = (options: BuildTabsOptions): FormTab[] => {
  const context: TabContext = {
    options,
    hiddenFields: new Set(options.hiddenFields),
    hiddenSections: new Set(options.hiddenSections),
  };
  const tabs: FormTab[] = [];
  for (const layoutTab of splitIntoTabs(options.fields)) {
    const tab = buildTab(context, layoutTab);
    if (tab) {
      tabs.push(tab);
    }
  }
  return tabs;
};

// ---------------------------------------------------------------------------
// Create-mode defaults
// ---------------------------------------------------------------------------

const LAYOUT_TYPES = new Set(['Section Break', 'Column Break', 'Tab Break', 'Fold']);
const NUMERIC_TYPES = new Set(['Int', 'Float', 'Currency', 'Percent', 'Check', 'Rating']);
const PLACEHOLDER_SELECT_OPTIONS = new Set(['[Select]', 'Loading...']);
const TABLE_TYPES = new Set(['Table', 'Table MultiSelect']);
const ROW_BOOKKEEPING_KEYS = new Set(['name', 'parent', 'parentfield', 'parenttype', 'creation', 'modified']);

const todayISO = () => formatCalendarDate(new Date());
const nowTime = () => formatCalendarDate(new Date(), 'time');

/** Desk seeds the first Select option when no default resolves. */
const firstSelectOption = (field: DocFieldMeta): string | undefined => {
  if (field.fieldtype !== 'Select' || !hasText(field.options) || PLACEHOLDER_SELECT_OPTIONS.has(field.options)) {
    return undefined;
  }
  const [firstOption] = field.options.split('\n');
  return firstOption;
};

/** One field's create-mode default; undefined leaves the field unset. */
const resolveCreateDefault = (field: DocFieldMeta, currentUser?: string): string | number | undefined => {
  const raw = field.default;
  if (raw === undefined || raw === null || raw === '') {
    return firstSelectOption(field);
  }
  if (raw === 'Today') {
    return todayISO();
  }
  const lowered = raw.toLowerCase();
  if (lowered === 'now') {
    return field.fieldtype === 'Time' ? nowTime() : `${todayISO()} ${nowTime()}`;
  }
  if (raw === '__user' || (lowered === 'user' && (field.fieldtype === 'Link' || field.fieldtype === 'Data'))) {
    return hasText(currentUser) ? currentUser : undefined;
  }
  // The session fullname is not mirrored client-side; `:fieldname` and
  // `frappe.*` defaults are server-resolved.
  if (raw === 'user_fullname' || raw.startsWith(':') || raw.startsWith('frappe.')) {
    return undefined;
  }
  return NUMERIC_TYPES.has(field.fieldtype) ? Number(raw) || 0 : raw;
};

/**
 * Seed a create-mode doc from meta field defaults — desk parity with
 * create_new.js get_default_value / set_default_values:
 *
 * - `Today` → today's date; `now` → time (Time) / local datetime (else)
 * - `__user` / `user` (Link/Data only, avoiding Select option collisions)
 *   → session user
 * - Select fields with no default seed their first option
 *   (create_new.js:107-114)
 * - `:fieldname` boot sysdefaults, `frappe.*`, `user_fullname` stay unset —
 *   server-resolved on insert (documented gap)
 */
export const buildCreateDefaults = (fields: DocFieldMeta[], currentUser?: string) => {
  const doc: Record<string, string | number> = {};
  for (const field of fields) {
    const value = LAYOUT_TYPES.has(field.fieldtype) ? undefined : resolveCreateDefault(field, currentUser);
    if (value !== undefined) {
      doc[field.fieldname] = value;
    }
  }
  return doc;
};

const isCopyableField = (field: DocFieldMeta): boolean =>
  !LAYOUT_TYPES.has(field.fieldtype) &&
  field.no_copy !== 1 &&
  field.fieldtype !== 'Attach' &&
  field.fieldtype !== 'Attach Image';

/** A child-table row without the bookkeeping fields the server reissues. */
const stripRowBookkeeping = (row: DocValues | null | undefined): DocValues =>
  Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => !ROW_BOOKKEEPING_KEYS.has(key)));

/**
 * Copyable field values for Duplicate / Amend: strips standard bookkeeping
 * fields, `no_copy` fields, layout breaks, and empty values.
 */
export const buildCopyValues = (fields: DocFieldMeta[], doc: DocValues) => {
  const copy: DocValues = {};
  for (const field of fields) {
    const value = doc[field.fieldname];
    const isEmpty = value === undefined || value === null || value === '';
    if (isCopyableField(field) && !isEmpty) {
      if (!TABLE_TYPES.has(field.fieldtype)) {
        copy[field.fieldname] = value;
      } else if (Array.isArray(value)) {
        copy[field.fieldname] = value.map(stripRowBookkeeping);
      }
    }
  }
  return copy;
};

/** True when the doctype names docs by user prompt (show a name input). */
export const isPromptNamed = (autoname?: string, namingRule?: string): boolean => {
  if (namingRule === 'By "Prompt"') {
    return true;
  }
  return (autoname ?? '').toLowerCase() === 'prompt';
};
