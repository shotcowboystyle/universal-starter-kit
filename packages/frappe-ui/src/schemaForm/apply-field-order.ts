import type { FieldSchema } from '../field-registry';

// Structural minimum this module needs. Deliberately NO `[key: string]:
// unknown` catch-all: FormSchema's sections are an `interface`, and TypeScript
// gives interfaces no implicit index signature, so an index signature here
// makes the real FormSchema unassignable (TS2345 at the SchemaForm call site).
// Extra section keys (label, collapsible, hideBorder, ...) still survive at
// runtime because applyOrderToSchema spreads `...section`.
interface SchemaLike {
  fields: FieldSchema[];
  sections: {
    columns: { fields: FieldSchema[] }[];
  }[];
}

/**
 * R2: reorder listed fields among the slots they already occupy.
 * Unlisted fields keep their meta positions. Unknown / duplicate names
 * in `order` are ignored. Empty or missing `order` is identity.
 *
 * Doctrine (`08` §2.3 / §4.2, `00` L4 test 1): reordering three fields
 * must not cost a whole `sections` tree.
 */
export const applyFieldOrder = <T extends { name: string }>(fields: readonly T[], order?: readonly string[]): T[] => {
  if (order === undefined || order.length === 0) {
    return [...fields];
  }
  const byName = new Map<string, T>();
  for (const field of fields) {
    if (!byName.has(field.name)) {
      byName.set(field.name, field);
    }
  }
  const listed: T[] = [];
  const listedSet = new Set<string>();
  for (const name of order) {
    const field = byName.get(name);
    if (field !== undefined && !listedSet.has(name)) {
      listed.push(field);
      listedSet.add(name);
    }
  }
  if (listed.length === 0) {
    return [...fields];
  }
  let next = 0;
  return fields.map((field) => {
    if (!listedSet.has(field.name)) {
      return field;
    }
    const replacement = listed[next];
    next += 1;
    return replacement;
  });
};

/**
 * Apply `order` inside the existing section/column tree. Listed fields may
 * move across sections; the tree shape (section count, column counts) does
 * not change.
 */
export const applyOrderToSchema = <T extends SchemaLike>(schema: T, order?: readonly string[]): T => {
  if (order === undefined || order.length === 0) {
    return schema;
  }
  const flat: FieldSchema[] = schema.sections.flatMap((section) => section.columns.flatMap((column) => column.fields));
  const reordered = applyFieldOrder(flat, order);
  let next = 0;
  const takeNext = (): FieldSchema => {
    const field = reordered[next];
    next += 1;
    return field;
  };
  const sections = schema.sections.map((section) => ({
    ...section,
    columns: section.columns.map((column) => ({
      ...column,
      fields: column.fields.map(takeNext),
    })),
  }));
  return {
    ...schema,
    sections,
    fields: applyFieldOrder(schema.fields, order),
  };
};
