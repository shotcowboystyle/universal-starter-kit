import type { DocTypeMeta } from '@repo/frappe';

/**
 * A doctype whose rows point at one record of another doctype through a Link
 * field: the desk's Connections, one DocType Link row (`link_doctype` +
 * `link_fieldname`). Pokemon's types, abilities and moves are three of them,
 * each a standalone doctype with a `pokemon` Link, not a child table.
 */
export interface FrappeConnection {
  /** The linked doctype (DocType Link `link_doctype`). */
  doctype: string;
  /** Its Link field naming the record (DocType Link `link_fieldname`). */
  fieldname: string;
  /** Columns to read from the linked rows; the link field is always read. */
  fields?: readonly string[];
  /** Section heading; defaults to the linked doctype. */
  label?: string;
  /** DocType Link `group`, for desk parity. */
  group?: string;
  /** Row ceiling per record; 0 (the default) reads every linked row. */
  limit?: number;
}

/**
 * `meta.links` as connections. Hidden rows and links that resolve through a
 * child table (`is_child_table`) are left out: neither names the record by a
 * Link field on the linked doctype itself.
 */
export const connectionsFromMeta = (meta: Pick<DocTypeMeta, 'links'> | null | undefined): FrappeConnection[] => {
  const connections: FrappeConnection[] = [];
  for (const link of meta?.links ?? []) {
    const shown = link.hidden !== 1 && link.is_child_table !== 1;
    if (shown && link.link_doctype !== '' && link.link_fieldname !== '') {
      const connection: FrappeConnection = { doctype: link.link_doctype, fieldname: link.link_fieldname };
      if (link.group !== undefined && link.group !== null && link.group !== '') {
        connection.group = link.group;
      }
      connections.push(connection);
    }
  }
  return connections;
};

/**
 * The fields a connection read asks for: `name`, the link field, then its
 * own; every field (`*`) when it names none, as a meta.links row does.
 */
export const connectionFields = (connection: FrappeConnection): string[] => {
  if (connection.fields === undefined || connection.fields.length === 0) {
    return ['*'];
  }
  return [...new Set(['name', connection.fieldname, ...connection.fields])];
};
