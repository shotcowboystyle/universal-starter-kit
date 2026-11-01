/**
 * Choice-control auto-selection (DG-CTRL-01..06).
 *
 * Picks RadioGroup / Select / Combobox / CheckboxGroup / Switch / Checkbox /
 * ToggleGroup from option count, arity, and commit mode. Explicit `control` ejects.
 */

import { warnSelectTooFewOptions } from '@repo/theme';

export type ChoiceControl = 'radio' | 'select' | 'combobox' | 'checkbox' | 'checkboxGroup' | 'switch' | 'toggle';

export type CommitMode = 'immediate' | 'deferred';

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface ResolveChoiceControlArgs {
  /** Known options. Omit (or pass `boolean: true`) for boolean Switch/Checkbox. */
  options?: ChoiceOption[];
  multiple?: boolean;
  commit: CommitMode;
  /** Explicit eject hatch (DG-CTRL-06). */
  control?: ChoiceControl;
  /** Force boolean path even when `options` is present. */
  boolean?: boolean;
}

/** Single-select: ≤5 → radio; 6–15 → select; >15 → combobox. */
export const SINGLE_RADIO_MAX = 5;
export const SINGLE_SELECT_MAX = 15;
/** Multi-select: ≤7 → checkbox group; >7 → combobox. */
export const MULTI_CHECKBOX_MAX = 7;

/**
 * Resolve which choice control to render.
 *
 * Thresholds (DG-CTRL-01, DG-CTRL-03, DG-CTRL-04):
 * - single, 2 non-boolean options → toggle (never switch/select)
 * - single, ≤5 options (≠2) → radio
 * - single, 6–15 options → select
 * - single, >15 options → combobox
 * - multiple, ≤7 options → checkboxGroup
 * - multiple, >7 options → combobox
 * - boolean + immediate → switch; boolean + deferred → checkbox (DG-CTRL-02)
 * - explicit `control` wins (DG-CTRL-06)
 */
export const resolveChoiceControl = (args: ResolveChoiceControlArgs): ChoiceControl => {
  if (args.control) {
    // Explicit Select with a short list — still warn (DG-CTRL-01 eject hatch).
    if (args.control === 'select' && !args.multiple) {
      warnSelectTooFewOptions({
        count: args.options?.length ?? 0,
        component: 'Choice',
      });
    }
    return args.control;
  }

  if (args.multiple) {
    const count = args.options?.length ?? 0;
    return count > MULTI_CHECKBOX_MAX ? 'combobox' : 'checkboxGroup';
  }

  // Inline condition (not an alias) so TS narrows `args.options` below.
  if (args.boolean === true || args.options == null) {
    return args.commit === 'immediate' ? 'switch' : 'checkbox';
  }

  const count = args.options.length;
  // DG-CTRL-04: 2-option non-boolean enum → ToggleGroup, never Switch/Select.
  if (count === 2) {
    return 'toggle';
  }
  if (count <= SINGLE_RADIO_MAX) {
    return 'radio';
  }
  if (count > SINGLE_SELECT_MAX) {
    return 'combobox';
  }
  return 'select';
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this is the boundary parser for one raw options array item from field meta
const parseOptionItem = (item: unknown): ChoiceOption | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- parses the raw options item at the field-meta boundary
  if (typeof item === 'string') {
    const value = item.trim();
    return value ? { label: value, value } : undefined;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- parses the raw options item at the field-meta boundary
  if (item === null || typeof item !== 'object') {
    return undefined;
  }
  const rawValue = 'value' in item ? item.value : undefined;
  const rawLabel = 'label' in item ? item.label : undefined;
  // oxlint-disable-next-line typescript/no-base-to-string -- option values are scalars; String() coerces them as desk does
  const value = rawValue == null ? '' : String(rawValue).trim();
  if (!value) {
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- option labels are scalars; String() coerces them as desk does
  const label = rawLabel == null ? value : String(rawLabel);
  return { label, value };
};

/** Normalize Frappe newline options, string[], or `{label,value}[]` into ChoiceOption[]. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this is the boundary parser: field meta carries options as a newline string or an array
export const parseChoiceOptions = (raw: unknown): ChoiceOption[] => {
  if (raw == null || raw === '') {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw.map((item) => parseOptionItem(item)).filter((option) => option !== undefined);
  }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the newline-separated options string is one of the raw meta shapes parsed here
  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) => ({ label: o, value: o }));
  }

  return [];
};
