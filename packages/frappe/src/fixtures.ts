import type { FrappeDocData } from './common/types';

export interface FixtureDoc extends FrappeDocData {
  name: string;
  doctype: string;
  [key: string]: any;
}

export interface FixtureData {
  [doctype: string]: FixtureDoc[];
}

export interface FixtureProvider {
  getList<TDoc extends FrappeDocData>(
    doctype: string,
    options?: {
      fields?: readonly string[];
      filters?: Partial<TDoc> | [string, string, any][];
      orderBy?: { field: string; order: string } | { field: string; order: string }[];
      limitStart?: number;
      limit?: number;
    },
  ): Promise<Partial<TDoc>[]>;

  getDoc<TDoc extends FrappeDocData>(
    doctype: string,
    name: string,
    fields?: readonly string[],
  ): Promise<Partial<TDoc> | null>;

  createDoc<TDoc extends FrappeDocData>(doctype: string, doc: Partial<TDoc>): Promise<TDoc>;

  updateDoc<TDoc extends FrappeDocData>(doctype: string, name: string, values: Partial<TDoc>): Promise<TDoc>;

  deleteDoc(doctype: string, name: string): Promise<void>;
}

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
      filters?: Partial<TDoc> | [string, string, any][];
      orderBy?: { field: string; order: string } | { field: string; order: string }[];
      limitStart?: number;
      limit?: number;
    },
  ): Promise<Partial<TDoc>[]> {
    const doctypeMap = this.data.get(doctype);
    if (!doctypeMap) {
      return [];
    }

    let docs = [...doctypeMap.values()] as TDoc[];

    if (options?.filters) {
      docs = this.applyFilters(docs, options.filters);
    }

    if (options?.orderBy) {
      docs = this.applyOrderBy(docs, options.orderBy);
    }

    const start = options?.limitStart ?? 0;
    const end = options?.limit ? start + options.limit : undefined;
    docs = docs.slice(start, end);

    if (options?.fields && options.fields.length > 0) {
      return docs.map((doc) => this.projectFields(doc, options.fields!));
    }

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

    if (fields) {
      return this.projectFields(doc as TDoc, fields);
    }

    return doc as Partial<TDoc>;
  }

  async createDoc<TDoc extends FrappeDocData>(doctype: string, doc: Partial<TDoc>): Promise<TDoc> {
    if (!this.data.has(doctype)) {
      this.data.set(doctype, new Map());
    }

    const doctypeMap = this.data.get(doctype)!;
    const name = (doc.name as string) || `${doctype}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const newDoc: FixtureDoc = {
      ...doc,
      name,
      doctype,
      modified: new Date().toISOString(),
      creation: new Date().toISOString(),
    } as FixtureDoc;

    doctypeMap.set(name, newDoc);
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

  private applyFilters<TDoc extends FrappeDocData>(
    docs: TDoc[],
    filters: Partial<TDoc> | [string, string, any][],
  ): TDoc[] {
    if (Array.isArray(filters)) {
      return docs.filter((doc) =>
        filters.every(([field, operator, value]) => {
          const docValue = (doc as any)[field];
          switch (operator) {
            case '=': {
              return docValue === value;
            }
            case '!=': {
              return docValue !== value;
            }
            case '>': {
              return docValue > value;
            }
            case '<': {
              return docValue < value;
            }
            case '>=': {
              return docValue >= value;
            }
            case '<=': {
              return docValue <= value;
            }
            case 'like': {
              return String(docValue).toLowerCase().includes(String(value).toLowerCase().replace(/%/g, ''));
            }
            case 'in': {
              return Array.isArray(value) && value.includes(docValue);
            }
            case 'not in': {
              return Array.isArray(value) && !value.includes(docValue);
            }
            default: {
              return docValue === value;
            }
          }
        }),
      );
    }

    return docs.filter((doc) => Object.entries(filters).every(([field, value]) => (doc as any)[field] === value));
  }

  private applyOrderBy<TDoc extends FrappeDocData>(
    docs: TDoc[],
    orderBy: { field: string; order: string } | { field: string; order: string }[],
  ): TDoc[] {
    const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];

    return [...docs].sort((a, b) => {
      for (const { field, order } of orderByArray) {
        const aVal = (a as any)[field];
        const bVal = (b as any)[field];

        if (aVal === bVal) {
          continue;
        }

        const comparison = aVal < bVal ? -1 : 1;
        return order === 'desc' ? -comparison : comparison;
      }
      return 0;
    });
  }

  private projectFields<TDoc extends FrappeDocData>(doc: TDoc, fields: readonly string[]): Partial<TDoc> {
    if (fields.includes('*')) {
      return { ...doc };
    }
    const projected: any = {};
    for (const field of fields) {
      if (field in doc) {
        projected[field] = (doc as any)[field];
      }
    }

    if (!fields.includes('name')) {
      projected.name = doc.name;
    }
    if (!fields.includes('doctype')) {
      projected.doctype = doc.doctype;
    }

    return projected;
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
