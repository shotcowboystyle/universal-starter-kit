/**
 * Dirty tracking for the desk form engine (R-1 false "Not Saved" fix).
 *
 * The engine diffs the locally edited doc against the last server baseline.
 * A strict `!==` diff falsely armed Save on untouched documents whenever a
 * field's *representation* of a value differed from the wire format (mount
 * emitters have been fixed at the field level — forms contract: initialization
 * must not emit change events — but the engine stays defensive).
 */

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- compares form values of any fieldtype
export const isEmptyValue = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return true;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- whitespace-only text is the empty state; other values are not trimmed
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
};

/**
 * Init-aware value equality. Two representation classes are folded:
 *
 * - empty: null / undefined / "" / [] are one empty state (a field
 *   normalizing null → "" is not an edit)
 * - boolean: Check wires 0/1 but a control may emit true/false
 *
 * Everything else stays strict equality — deliberately shallow and honest
 * (no deep equality): desk parity means an edit reverted to a value that is
 * merely *equivalent* (not identical) may still read dirty, while reverting
 * to the exact original value reads clean.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- compares form values of any fieldtype
export const isSameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }
  if (isEmptyValue(a) && isEmptyValue(b)) {
    return true;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- only a boolean side gets the Check 0/1 folding
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    // A Check wires 0/1; fold a boolean side onto that.
    const an = a === true || a === false ? Number(a) : a;
    const bn = b === true || b === false ? Number(b) : b;
    return an === bn;
  }
  return false;
};

/**
 * Names of fields whose local value differs from the baseline.
 *
 * - Edit mode (baseline defined): normalization-insensitive diff via
 *   `isSameValue` — an untouched doc reads pristine even if a field
 *   re-represented its value during initialization.
 * - Create mode (no baseline): any non-empty value counts, defaults included —
 *   desk parity, a new doc shows "Not Saved".
 *
 * `doctype` / `name` are bookkeeping, never dirty.
 */
export const computeDirtyFields = (
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- doc field values are DocType-defined; keys and types are only known from runtime meta
  localDoc: Record<string, unknown>,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- same doc shape as localDoc
  baseline: Record<string, unknown> | undefined,
): string[] => {
  const dirty: string[] = [];
  for (const key of Object.keys(localDoc)) {
    if (key === 'doctype' || key === 'name') {
      continue;
    }
    if (baseline ? !isSameValue(localDoc[key], baseline[key]) : !isEmptyValue(localDoc[key])) {
      dirty.push(key);
    }
  }
  return dirty;
};
