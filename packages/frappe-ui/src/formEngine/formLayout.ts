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

import { evaluateDependsOn } from '../dependsOn';
import type { FieldSchema } from '../fieldRegistry';
import type { FormSchema, FormSection } from '../schemaForm';

import type { DocFieldMeta } from './doctypeMeta';
import { isFetchLocked } from './fetchFrom';
import { canReadLevel, canWriteLevel } from './fieldPermissions';
import type { PermLevelMatrix } from './fieldPermissions';

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

function splitIntoTabs(fields: DocFieldMeta[]): LayoutTab[] {
  const tabs: LayoutTab[] = [];
  let currentTab: LayoutTab = { key: '__details', sections: [] };
  let currentSection: LayoutSection = { columns: [{ fields: [] }] };
  currentTab.sections.push(currentSection);
  tabs.push(currentTab);

  for (const field of fields) {
    switch (field.fieldtype) {
      case 'Tab Break': {
        currentTab = { key: field.fieldname, label: field.label, sections: [] };
        currentSection = { columns: [{ fields: [] }] };
        currentTab.sections.push(currentSection);
        tabs.push(currentTab);
        break;
      }
      case 'Section Break': {
        currentSection = { breakField: field, columns: [{ fields: [] }] };
        currentTab.sections.push(currentSection);
        break;
      }
      case 'Column Break': {
        currentSection.columns.push({ fields: [] });
        break;
      }
      default: {
        currentSection.columns.at(-1)!.fields.push(field);
        break;
      }
    }
  }
  return tabs;
}

// ---------------------------------------------------------------------------
// Doc-dependent resolution
// ---------------------------------------------------------------------------

export interface BuildTabsOptions {
  fields: DocFieldMeta[];
  doc: Record<string, unknown>;
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

function isFieldVisible(field: DocFieldMeta, doc: Record<string, unknown>, permLevels?: PermLevelMatrix): boolean {
  if (field.hidden) {
    return false;
  }
  // Desk hides fields whose permlevel the user cannot read (perm.js:209-215).
  if (!canReadLevel(permLevels, field.permlevel ?? 0)) {
    return false;
  }
  // Visibility fallback = true: an unparseable expression shows the field.
  return evaluateDependsOn(field.depends_on, doc, true);
}

function toFieldSchema(field: DocFieldMeta, doc: Record<string, unknown>, options: BuildTabsOptions): FieldSchema {
  const required =
    !!field.required || (!!field.mandatory_depends_on && evaluateDependsOn(field.mandatory_depends_on, doc, false));

  let readOnly =
    !!field.read_only ||
    (!!field.read_only_depends_on && evaluateDependsOn(field.read_only_depends_on, doc, false)) ||
    !canWriteLevel(options.permLevels, field.permlevel ?? 0);
  // set_only_once: editable only while the doc is unsaved (perm.js:261-263).
  if (field.set_only_once && !options.isCreate) {
    readOnly = true;
  }
  // fetch_from without fetch_if_empty locks the target while its source link
  // holds a value (desk read_only_because_of_fetch_from).
  if (!readOnly && isFetchLocked(field, doc)) {
    readOnly = true;
  }
  if (options.docstatus === 1 && !field.allow_on_submit) {
    readOnly = true;
  }
  if (options.docstatus === 2) {
    readOnly = true;
  }
  if (options.formReadOnly) {
    readOnly = true;
  }

  return {
    type: field.fieldtype,
    name: field.fieldname,
    label: field.label,
    options: field.options,
    description: field.description,
    required,
    readOnly,
    precision:
      field.precision !== undefined && field.precision !== null && field.precision !== ''
        ? Number(field.precision)
        : undefined,
    maxLength:
      field.length !== undefined && field.length !== null && Number(field.length) > 0
        ? Number(field.length)
        : undefined,
    // depends_on intentionally NOT forwarded — visibility resolved here.
    fieldtype: field.fieldtype,
    fieldname: field.fieldname,
    in_list_view: field.in_list_view,
    in_standard_filter: field.in_standard_filter,
  };
}

/**
 * Desk's refresh_section_collapse (layout.js:463-483): a collapsible section
 * starts collapsed unless its `collapsible_depends_on` evaluates truthy, and
 * a section with a missing mandatory value is forced open. Recomputed per
 * doc change — SchemaForm treats it as the live default while manual toggles
 * survive between recomputes.
 */
function resolveSectionCollapsed(
  breakField: DocFieldMeta | undefined,
  sectionFields: DocFieldMeta[],
  doc: Record<string, unknown>,
): boolean | undefined {
  if (!breakField?.collapsible) {
    return undefined;
  }
  let collapsed = true;
  if (breakField.collapsible_depends_on) {
    // Unparseable expression → expanded (never hide content silently).
    collapsed = !evaluateDependsOn(breakField.collapsible_depends_on, doc, true);
  }
  if (collapsed && sectionHasMissingMandatory(sectionFields, doc)) {
    collapsed = false;
  }
  return collapsed;
}

/** Desk section.has_missing_mandatory: `required && value == null` (section.js:146-156). */
function sectionHasMissingMandatory(fields: DocFieldMeta[], doc: Record<string, unknown>): boolean {
  return fields.some((field) => !!field.required && doc[field.fieldname] == null);
}

/**
 * Build the desk tab list for the current doc state. Recomputed whenever
 * the doc changes so depends_on chains re-resolve; the work is O(fields).
 */
export function buildFormTabs(options: BuildTabsOptions): FormTab[] {
  const { fields, doc, detailsLabel, permLevels } = options;
  const hiddenFieldSet = new Set(options.hiddenFields ?? []);
  const hiddenSectionSet = new Set(options.hiddenSections ?? []);
  const sectionHidden = (breakField: DocFieldMeta | undefined, label?: string): boolean => {
    if (hiddenSectionSet.size === 0) {
      return false;
    }
    if (breakField && hiddenSectionSet.has(breakField.fieldname)) {
      return true;
    }
    const resolvedLabel = breakField?.label ?? label;
    return !!resolvedLabel && hiddenSectionSet.has(resolvedLabel);
  };
  const layoutTabs = splitIntoTabs(fields);
  const tabs: FormTab[] = [];

  for (const layoutTab of layoutTabs) {
    // Tab Break fields support depends_on + permlevel gating too (tab.js:38-43).
    const tabBreak = fields.find((field) => field.fieldtype === 'Tab Break' && field.fieldname === layoutTab.key);
    if (tabBreak && !isFieldVisible(tabBreak, doc, permLevels)) {
      continue;
    }
    // Host hiddenSections also match tabs (fieldname or label).
    if (sectionHidden(tabBreak, layoutTab.label)) {
      continue;
    }

    const sections: FormSection[] = [];
    const flatFields: FieldSchema[] = [];

    for (const section of layoutTab.sections) {
      // Section Breaks are not permlevel-gated in desk (sections aren't
      // controls; they only auto-hide when all their fields hide) — so the
      // permlevel matrix is deliberately not passed here.
      if (section.breakField && !isFieldVisible(section.breakField, doc)) {
        continue;
      }
      if (sectionHidden(section.breakField)) {
        continue;
      }

      const columns = section.columns
        .map((column) => ({
          fields: column.fields
            .filter((field) => !hiddenFieldSet.has(field.fieldname) && isFieldVisible(field, doc, permLevels))
            .map((field) => toFieldSchema(field, doc, options)),
        }))
        .filter((column) => column.fields.length > 0);
      if (columns.length === 0) {
        continue;
      }

      for (const column of columns) {
        flatFields.push(...column.fields);
      }
      const sectionFields = section.columns.flatMap((column) => column.fields);
      sections.push({
        label: section.breakField?.label,
        description: section.breakField?.description,
        collapsible: !!section.breakField?.collapsible,
        collapsed: resolveSectionCollapsed(section.breakField, sectionFields, doc),
        hideBorder: !!section.breakField?.hide_border,
        columns,
      });
    }

    if (sections.length === 0) {
      continue;
    }
    tabs.push({
      key: layoutTab.key,
      label: layoutTab.label ?? detailsLabel,
      schema: { sections, fields: flatFields },
    });
  }

  return tabs;
}

// ---------------------------------------------------------------------------
// Create-mode defaults
// ---------------------------------------------------------------------------

const LAYOUT_TYPES = new Set(['Section Break', 'Column Break', 'Tab Break', 'Fold']);
const NUMERIC_TYPES = new Set(['Int', 'Float', 'Currency', 'Percent', 'Check', 'Rating']);

const todayISO = () => formatCalendarDate(new Date());
const nowTime = () => formatCalendarDate(new Date(), 'time');

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
export function buildCreateDefaults(fields: DocFieldMeta[], currentUser?: string): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const field of fields) {
    if (LAYOUT_TYPES.has(field.fieldtype)) {
      continue;
    }
    const raw = field.default;
    if (raw === undefined || raw === null || raw === '') {
      // Desk seeds the first Select option when no default resolves.
      if (
        field.fieldtype === 'Select' &&
        typeof field.options === 'string' &&
        field.options &&
        !['[Select]', 'Loading...'].includes(field.options)
      ) {
        doc[field.fieldname] = field.options.split('\n')[0];
      }
      continue;
    }
    if (raw === 'Today') {
      doc[field.fieldname] = todayISO();
      continue;
    }
    if (raw.toLowerCase() === 'now') {
      doc[field.fieldname] = field.fieldtype === 'Time' ? nowTime() : `${todayISO()} ${nowTime()}`;
      continue;
    }
    if (
      raw === '__user' ||
      (raw.toLowerCase() === 'user' && (field.fieldtype === 'Link' || field.fieldtype === 'Data'))
    ) {
      if (currentUser) {
        doc[field.fieldname] = currentUser;
      }
      continue;
    }
    if (raw === 'user_fullname') {
      continue;
    } // session fullname not mirrored client-side
    if (raw.startsWith(':') || raw.startsWith('frappe.')) {
      continue;
    } // server-resolved
    doc[field.fieldname] = NUMERIC_TYPES.has(field.fieldtype) ? Number(raw) || 0 : raw;
  }
  return doc;
}

/**
 * Copyable field values for Duplicate / Amend: strips standard bookkeeping
 * fields, `no_copy` fields, layout breaks, and empty values.
 */
export function buildCopyValues(fields: DocFieldMeta[], doc: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const field of fields) {
    if (LAYOUT_TYPES.has(field.fieldtype)) {
      continue;
    }
    if (field.no_copy) {
      continue;
    }
    if (field.fieldtype === 'Attach' || field.fieldtype === 'Attach Image') {
      continue;
    }
    const value = doc[field.fieldname];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (field.fieldtype === 'Table' || field.fieldtype === 'Table MultiSelect') {
      if (Array.isArray(value)) {
        copy[field.fieldname] = value.map((row) => {
          const {
            name: _name,
            parent: _parent,
            parentfield: _parentfield,
            parenttype: _parenttype,
            creation: _creation,
            modified: _modified,
            ...rest
          } = (row ?? {}) as Record<string, unknown>;
          return rest;
        });
      }
      continue;
    }
    copy[field.fieldname] = value;
  }
  return copy;
}

/** True when the doctype names docs by user prompt (show a name input). */
export function isPromptNamed(autoname?: string, namingRule?: string): boolean {
  if (namingRule === 'By "Prompt"') {
    return true;
  }
  return (autoname ?? '').toLowerCase() === 'prompt';
}
