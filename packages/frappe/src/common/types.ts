export type PrimitiveValue = string | number | boolean | null | undefined;

export type FrappeDocValue = ChildTableRow[] | FrappeDocValue[] | PrimitiveValue | { [key: string]: FrappeDocValue };

export interface ChildTableRow {
  name: string;
  doctype: string | null;
  idx: number | null;
  parent: string | null;
  parentfield: string | null;
  parenttype: string | null;
  [key: string]: FrappeDocValue;
}

export interface FrappeDocBase {
  creation?: string;
  docstatus?: number;
  doctype: string;
  idx?: number;
  modified?: string;
  modified_by?: string;
  name: string;
  owner?: string;
}

/** Minimal constraint for document types - any object with name/doctype (e.g. FrappeTag, FrappeFile) */
export type FrappeDocDataConstraint = object & { name: string; doctype: string };

/** Data can be any object with name/doctype; index signature relaxed for UI types like FrappeFile */
export type FrappeDocData<
  Data extends FrappeDocDataConstraint = Record<string, FrappeDocValue> & {
    name: string;
    doctype: string;
  },
> = Data & FrappeDocBase;

export type FrappeDoc<Data extends FrappeDocData> = Data & FrappeDocBase;
