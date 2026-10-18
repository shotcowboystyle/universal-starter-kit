import type { FieldSchema } from '../fieldRegistry';

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
export function applyFieldOrder<T extends { name: string }>(fields: readonly T[], order?: readonly string[]): T[] {
  if (!order?.length) {
    return [...fields];
  }
  const byName = new Map<string, T>();
  for (const field of fields) {
    if (!byName.has(field.name)) {
      byName.set(field.name, field);
    }
  }
  const listed: string[] = [];
  const listedSet = new Set<string>();
  for (const name of order) {
    if (!byName.has(name) || listedSet.has(name)) {
      continue;
    }
    listed.push(name);
    listedSet.add(name);
  }
  if (listed.length === 0) {
    return [...fields];
  }
  let i = 0;
  return fields.map((field) => (listedSet.has(field.name) ? byName.get(listed[i++])! : field));
}

/**
 * Apply `order` inside the existing section/column tree. Listed fields may
 * move across sections; the tree shape (section count, column counts) does
 * not change.
 */
export function applyOrderToSchema<T extends SchemaLike>(schema: T, order?: readonly string[]): T {
  if (!order?.length) {
    return schema;
  }
  const flat: FieldSchema[] = schema.sections.flatMap((section) => section.columns.flatMap((column) => column.fields));
  const reordered = applyFieldOrder(flat, order);
  let i = 0;
  const sections = schema.sections.map((section) => ({
    ...section,
    columns: section.columns.map((column) => ({
      ...column,
      fields: column.fields.map(() => reordered[i++]),
    })),
  }));
  return {
    ...schema,
    sections,
    fields: applyFieldOrder(schema.fields, order),
  };
}
