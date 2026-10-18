import type { FrappeDocData } from './common/types';

export interface FixtureDoc extends FrappeDocData {
  name: string;
  doctype: string;
  // oxlint-disable-next-line typescript/no-explicit-any, anti-slop/no-unsafe-dictionary-type -- fixture docs are hand-authored rows with arbitrary doctype fields that stories and tests read without narrowing
  [key: string]: any;
}

export interface FixtureData {
  [doctype: string]: FixtureDoc[];
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors ListOptions['filters']: field -> value equality over open fixture rows
type FixtureFilters<TDoc> = Partial<TDoc> | Record<string, unknown> | [string, string, unknown][];

type FixtureOrderBy = { field: string; order: string } | { field: string; order: string }[];

export interface FixtureProvider {
  getList: <TDoc extends FrappeDocData>(
    doctype: string,
    options?: {
      fields?: readonly string[];
      filters?: FixtureFilters<TDoc>;
      orderBy?: FixtureOrderBy;
      limitStart?: number;
      limit?: number;
    },
  ) => Promise<Partial<TDoc>[]>;

  getDoc: <TDoc extends FrappeDocData>(
    doctype: string,
    name: string,
    fields?: readonly string[],
  ) => Promise<Partial<TDoc> | null>;

  createDoc: <TDoc extends FrappeDocData>(doctype: string, doc: Partial<TDoc>) => Promise<TDoc>;

  updateDoc: <TDoc extends FrappeDocData>(doctype: string, name: string, values: Partial<TDoc>) => Promise<TDoc>;

  deleteDoc: (doctype: string, name: string) => Promise<void>;
}

type FixtureScalar = number | string;

// SAFETY: fixture fields and filter operands are hand-authored JSON scalars; `<`/`>` only order them, and any
// other operand coerces exactly as the untyped comparison did.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unknown-parameters -- see SAFETY above
const asScalar = (value: unknown) => value as FixtureScalar;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- fixture fields and filter operands are arbitrary hand-authored values
const matchesFilter = (docValue: unknown, operator: string, value: unknown): boolean => {
  switch (operator) {
    case '!=': {
      return docValue !== value;
    }
    case '>': {
      return asScalar(docValue) > asScalar(value);
    }
    case '<': {
      return asScalar(docValue) < asScalar(value);
    }
    case '>=': {
      return asScalar(docValue) >= asScalar(value);
    }
    case '<=': {
      return asScalar(docValue) <= asScalar(value);
    }
    case 'like': {
      return String(docValue).toLowerCase().includes(String(value).toLowerCase().replaceAll('%', ''));
    }
    case 'in': {
      return Array.isArray(value) && value.includes(docValue);
    }
    case 'not in': {
      return Array.isArray(value) && !value.includes(docValue);
    }
    default: {
      // '=' and unknown operators compare for equality.
      return docValue === value;
    }
  }
};

const applyFilters = (docs: FixtureDoc[], filters: FixtureFilters<FixtureDoc>): FixtureDoc[] => {
  if (Array.isArray(filters)) {
    return docs.filter((doc) =>
      filters.every(([field, operator, value]) => matchesFilter(doc[field], operator, value)),
    );
  }

  return docs.filter((doc) => Object.entries(filters).every(([field, value]) => doc[field] === value));
};

const applyOrderBy = (docs: FixtureDoc[], orderBy: FixtureOrderBy): FixtureDoc[] => {
  const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];

  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array; toSorted is not guaranteed on every Hermes runtime this ships to
  return [...docs].sort((a, b) => {
    for (const { field, order } of orderByArray) {
      const aVal = asScalar(a[field]);
      const bVal = asScalar(b[field]);

      if (aVal === bVal) {
        continue;
      }

      const comparison = aVal < bVal ? -1 : 1;
      return order === 'desc' ? -comparison : comparison;
    }
    return 0;
  });
};

const projectFields = (doc: FixtureDoc, fields: readonly string[]): FixtureDoc => {
  if (fields.includes('*')) {
    return { ...doc };
  }
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a projection of an open fixture row; keys are the requested fields
  const projected: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in doc) {
      projected[field] = doc[field];
    }
  }

  return { ...projected, name: doc.name, doctype: doc.doctype };
};

export class InMemoryFixtureProvider implements FixtureProvider {
  private readonly data: Map<string, Map<string, FixtureDoc>>;

  constructor(fixtureData: FixtureData = {}) {
    this.data = new Map();
    for (const [doctype, docs] of Object.entries(fixtureData)) {
      const doctypeMap = new Map<string, FixtureDoc>();
      for (const doc of docs) {
        doctypeMap.set(doc.name, { ...doc, doctype });
      }
      this.data.set(doctype, doctypeMap);
    }
  }

  async getList<TDoc extends FrappeDocData>(
    doctype: string,
    options?: {
      fields?: readonly string[];
      filters?: FixtureFilters<TDoc>;
      orderBy?: FixtureOrderBy;
      limitStart?: number;
      limit?: number;
    },
  ): Promise<Partial<TDoc>[]> {
    const doctypeMap = this.data.get(doctype);
    if (!doctypeMap) {
      return [];
    }

    let docs = [...doctypeMap.values()];

    if (options?.filters) {
      docs = applyFilters(docs, options.filters);
    }

    if (options?.orderBy) {
      docs = applyOrderBy(docs, options.orderBy);
    }

    const start = options?.limitStart ?? 0;
    const end = options?.limit === undefined || options.limit === 0 ? undefined : start + options.limit;
    docs = docs.slice(start, end);

    const fields = options?.fields;
    if (fields && fields.length > 0) {
      docs = docs.map((doc) => projectFields(doc, fields));
    }

    // SAFETY: the provider stores rows untyped; TDoc is the caller's claim about the doctype's shape.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return docs as Partial<TDoc>[];
  }

  async getDoc<TDoc extends FrappeDocData>(
    doctype: string,
    name: string,
    fields?: readonly string[],
  ): Promise<Partial<TDoc> | null> {
    const doctypeMap = this.data.get(doctype);
    if (!doctypeMap) {
      return null;
    }

    const doc = doctypeMap.get(name);
    if (!doc) {
      return null;
    }

    // SAFETY: the provider stores rows untyped; TDoc is the caller's claim about the doctype's shape.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return (fields ? projectFields(doc, fields) : doc) as Partial<TDoc>;
  }

  async createDoc<TDoc extends FrappeDocData>(doctype: string, doc: Partial<TDoc>): Promise<TDoc> {
    let doctypeMap = this.data.get(doctype);
    if (!doctypeMap) {
      doctypeMap = new Map();
      this.data.set(doctype, doctypeMap);
    }

    const name =
      doc.name !== undefined && doc.name !== ''
        ? doc.name
        : // oxlint-disable-next-line sonarjs/pseudo-random -- fixture names only need in-memory uniqueness, not unpredictability
          `${doctype}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const newDoc: FixtureDoc = {
      ...doc,
      name,
      doctype,
      modified: new Date().toISOString(),
      creation: new Date().toISOString(),
    };

    doctypeMap.set(name, newDoc);
    // SAFETY: the stored row is the caller's TDoc input plus the server-managed fields every doc carries.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return newDoc as TDoc;
  }

  async updateDoc<TDoc extends FrappeDocData>(doctype: string, name: string, values: Partial<TDoc>): Promise<TDoc> {
    const doctypeMap = this.data.get(doctype);
    if (!doctypeMap) {
      throw new Error(`DocType ${doctype} not found`);
    }

    const doc = doctypeMap.get(name);
    if (!doc) {
      throw new Error(`Document ${doctype}/${name} not found`);
    }

    const updatedDoc: FixtureDoc = {
      ...doc,
      ...values,
      name,
      doctype,
      modified: new Date().toISOString(),
    };

    doctypeMap.set(name, updatedDoc);
    // SAFETY: the provider stores rows untyped; TDoc is the caller's claim about the doctype's shape.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return updatedDoc as TDoc;
  }

  async deleteDoc(doctype: string, name: string): Promise<void> {
    const doctypeMap = this.data.get(doctype);
    if (!doctypeMap) {
      throw new Error(`DocType ${doctype} not found`);
    }

    if (!doctypeMap.has(name)) {
      throw new Error(`Document ${doctype}/${name} not found`);
    }

    doctypeMap.delete(name);
  }

  reset(fixtureData: FixtureData = {}) {
    this.data.clear();
    for (const [doctype, docs] of Object.entries(fixtureData)) {
      const doctypeMap = new Map<string, FixtureDoc>();
      for (const doc of docs) {
        doctypeMap.set(doc.name, { ...doc, doctype });
      }
      this.data.set(doctype, doctypeMap);
    }
  }

  getData(): FixtureData {
    const result: FixtureData = {};
    for (const [doctype, doctypeMap] of this.data.entries()) {
      result[doctype] = [...doctypeMap.values()];
    }
    return result;
  }
}
