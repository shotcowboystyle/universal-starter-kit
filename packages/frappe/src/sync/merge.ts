import type { FrappeDoc, FrappeDocData, FrappeDocValue } from '../common/types';

export interface ChildTableRow<_Data extends FrappeDocData = FrappeDocData> {
  name: string;
  idx: number | null;
  parent: string | null;
  parentfield: string | null;
  parenttype: string | null;
  doctype?: string | null;
  [key: string]: FrappeDocValue;
}

export enum MergeStrategy {
  ClientWins = 'client-wins',
  ServerWins = 'server-wins',
}

export enum FieldMergeStrategy {
  ClientWins = 'client-wins',
  ServerWins = 'server-wins',
  Sum = 'sum',
  Max = 'max',
  Min = 'min',
  UnionSet = 'union-set',
}

export type FieldMergeStrategyOrFunction =
  | FieldMergeStrategy
  | ((base: FrappeDocValue, client: FrappeDocValue, server: FrappeDocValue) => FrappeDocValue);

const isString = (value: unknown): value is string => typeof value === 'string';

const isNumber = <T>(value: T): value is T & number => typeof value === 'number';

const isNonEmptyString = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && value !== '';

const isNullish = (value: FrappeDocValue): value is null | undefined => value === null || value === undefined;

export const isObject = (value: FrappeDocValue): value is Record<string, FrappeDocValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A child row that also names its doctype, so it can be merged as a document. */
const isFrappeDoc = (row: ChildTableRow): row is ChildTableRow & FrappeDoc<FrappeDocData> =>
  row.doctype !== null && row.doctype !== undefined;

export interface MergeResult<Data extends FrappeDocData = FrappeDocData> {
  merged: FrappeDoc<Data>;
  conflicts: string[];
  hasConflicts: boolean;
}

export interface ObjectMergeResult {
  merged: Record<string, FrappeDocValue>;
  hasConflicts: boolean;
}

export interface MergeFieldOptions {
  isChildTable?: boolean;
}

export interface DoctypeConfig {
  defaultStrategy?: MergeStrategy;
  fields?: Record<string, FieldMergeStrategyOrFunction>;
}

export interface MergeConfig {
  defaultStrategy: MergeStrategy;
  doctypes?: Record<string, DoctypeConfig>;
}

export const getFieldMergeStrategy = (
  fieldName: string,
  config?: MergeConfig,
  doctype?: string,
): FieldMergeStrategyOrFunction => {
  if (!config) {
    return FieldMergeStrategy.ServerWins;
  }
  const doctypeConfig = isNonEmptyString(doctype) ? config.doctypes?.[doctype] : undefined;
  const fieldStrategy = doctypeConfig?.fields?.[fieldName];
  if (fieldStrategy !== undefined) {
    return fieldStrategy;
  }
  const doctypeDefault = doctypeConfig?.defaultStrategy;
  if (doctypeDefault !== undefined) {
    return doctypeDefault === MergeStrategy.ClientWins ? FieldMergeStrategy.ClientWins : FieldMergeStrategy.ServerWins;
  }
  return config.defaultStrategy === MergeStrategy.ClientWins
    ? FieldMergeStrategy.ClientWins
    : FieldMergeStrategy.ServerWins;
};

export interface MergeStrategyResult {
  value: FrappeDocValue;
  hasConflict: boolean;
}

const toNumber = (value: FrappeDocValue): number => (isNumber(value) ? value : 0);

/** Numeric strategies accept numbers or nullish (treated as 0); anything else is a config error. */
const toNumericOperands = (
  strategyName: string,
  fieldName: string,
  values: [FrappeDocValue, FrappeDocValue, FrappeDocValue],
): [number, number, number] => {
  if (values.some((value) => !isNumber(value) && !isNullish(value))) {
    throw new TypeError(`merge strategy ${strategyName} requires numeric values for field ${fieldName}`);
  }
  const [base, client, server] = values;
  return [toNumber(base), toNumber(client), toNumber(server)];
};

const unionSet = (
  fieldName: string,
  base: FrappeDocValue,
  client: FrappeDocValue,
  server: FrappeDocValue,
): FrappeDocValue[] => {
  if ([base, client, server].some((value) => !Array.isArray(value) && !isNullish(value))) {
    throw new TypeError(`merge strategy union requires array values for field ${fieldName}`);
  }
  const baseArray = Array.isArray(base) ? base : [];
  const baseSet = new Set(baseArray);
  const clientSet = new Set(Array.isArray(client) ? client : []);
  const serverSet = new Set(Array.isArray(server) ? server : []);
  const result = new Set(baseArray);
  for (const item of clientSet) {
    if (!baseSet.has(item)) {
      result.add(item);
    }
  }
  for (const item of serverSet) {
    if (!baseSet.has(item)) {
      result.add(item);
    }
  }
  for (const item of baseArray) {
    if (!clientSet.has(item) && !serverSet.has(item)) {
      result.delete(item);
    }
  }
  return [...result];
};

export const applyMergeStrategy = (
  fieldName: string,
  base: FrappeDocValue,
  client: FrappeDocValue,
  server: FrappeDocValue,
  strategy: FieldMergeStrategyOrFunction,
): MergeStrategyResult => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates the enum | function union
  if (typeof strategy === 'function') {
    return {
      value: strategy(base, client, server),
      hasConflict: false,
    };
  }
  switch (strategy) {
    case FieldMergeStrategy.ClientWins: {
      return { value: client, hasConflict: false };
    }
    case FieldMergeStrategy.ServerWins: {
      return { value: server, hasConflict: false };
    }
    case FieldMergeStrategy.Sum: {
      const [baseNum, clientNum, serverNum] = toNumericOperands('sum', fieldName, [base, client, server]);
      const clientDelta = clientNum - baseNum;
      const serverDelta = serverNum - baseNum;
      return { value: baseNum + clientDelta + serverDelta, hasConflict: false };
    }
    case FieldMergeStrategy.Max: {
      return { value: Math.max(...toNumericOperands('max', fieldName, [base, client, server])), hasConflict: false };
    }
    case FieldMergeStrategy.Min: {
      return { value: Math.min(...toNumericOperands('min', fieldName, [base, client, server])), hasConflict: false };
    }
    case FieldMergeStrategy.UnionSet: {
      return { value: unionSet(fieldName, base, client, server), hasConflict: false };
    }
    default: {
      return { value: server, hasConflict: true };
    }
  }
};

export const deepEqual = (valueA: FrappeDocValue, valueB: FrappeDocValue): boolean => {
  if (valueA === valueB) {
    return true;
  }
  if (valueA == null || valueB == null) {
    return valueA === valueB;
  }
  if (Array.isArray(valueA) && Array.isArray(valueB)) {
    if (valueA.length !== valueB.length) {
      return false;
    }
    return valueA.every((value, index) => deepEqual(value, valueB[index]));
  }
  if (isObject(valueA) && isObject(valueB)) {
    const keysA = Object.keys(valueA);
    const keysB = Object.keys(valueB);
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysA.every((key) => deepEqual(valueA[key], valueB[key]));
  }
  return false;
};

const isNullableString = (value: unknown): value is string | null => value === null || isString(value);

export const isChildTableRow = <Data extends FrappeDocData = FrappeDocData>(
  value: unknown,
): value is ChildTableRow<Data> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('name' in value) || !isString(value.name)) {
    return false;
  }
  if (!('idx' in value) || (value.idx !== null && !isNumber(value.idx))) {
    return false;
  }
  if (!('parent' in value) || !isNullableString(value.parent)) {
    return false;
  }
  if (!('parentfield' in value) || !isNullableString(value.parentfield)) {
    return false;
  }
  if (!('parenttype' in value) || !isNullableString(value.parenttype)) {
    return false;
  }
  return !('doctype' in value) || isNullableString(value.doctype);
};

/** Checks the first, last and middle non-nullish rows; null when there is no row to judge by. */
const sampleIsChildTable = (rows: unknown[]): boolean | null => {
  const validRows = rows.filter((row) => row !== null && row !== undefined);
  if (validRows.length === 0) {
    return null;
  }
  return [validRows[0], validRows.at(-1), validRows[Math.floor(validRows.length / 2)]]
    .filter(Boolean)
    .every((row) => isChildTableRow(row));
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- public overload; the guard inspects arbitrary values
export function isChildTableArray(value1: unknown, value2: unknown, ...values: unknown[]): boolean;
export function isChildTableArray(...values: unknown[]): boolean | null;
export function isChildTableArray(...values: unknown[]): boolean | null {
  if (values.length === 1) {
    const [value] = values;
    return Array.isArray(value) ? sampleIsChildTable(value) : false;
  }
  const validArrays = values.filter((arr): arr is unknown[] => Array.isArray(arr));
  if (validArrays.length === 0) {
    return false;
  }
  let hasChildTableEvidence = false;
  let hasNonChildTableEvidence = false;
  for (const arr of validArrays) {
    const evidence = sampleIsChildTable(arr);
    if (evidence === true) {
      hasChildTableEvidence = true;
    } else if (evidence === false) {
      hasNonChildTableEvidence = true;
    }
  }
  return hasChildTableEvidence && !hasNonChildTableEvidence;
}

const sortChildTableByIdx = (value: FrappeDocValue[]): FrappeDocValue[] => {
  const hasIndexField = value.some((row) => isChildTableRow(row) && row.idx !== null);
  if (hasIndexField) {
    value.sort((a, b) => {
      const indexA = isChildTableRow(a) && a.idx !== null ? a.idx : Number.MAX_SAFE_INTEGER;
      const indexB = isChildTableRow(b) && b.idx !== null ? b.idx : Number.MAX_SAFE_INTEGER;
      return indexA - indexB;
    });
  }
  return value;
};

const rowsByName = (rows: FrappeDocValue[]): Map<string, ChildTableRow> => {
  const map = new Map<string, ChildTableRow>();
  for (const row of rows) {
    if (isChildTableRow(row)) {
      map.set(row.name, row);
    }
  }
  return map;
};

/** Two-way merge (no server copy): client rows overlay base rows by name. */
const overlayChildTable = (baseArray: FrappeDocValue[], clientArray: FrappeDocValue[]): FrappeDocValue[] => {
  const byName = new Map<string, FrappeDocValue>();
  const result: FrappeDocValue[] = [];
  for (const row of baseArray) {
    if (isChildTableRow(row)) {
      byName.set(row.name, { ...row });
      result.push(byName.get(row.name));
    }
  }
  for (const row of clientArray) {
    if (isChildTableRow(row)) {
      const existingRow = byName.get(row.name);
      if (existingRow !== undefined && isObject(existingRow)) {
        Object.assign(existingRow, row);
      } else {
        byName.set(row.name, { ...row });
        result.push(byName.get(row.name));
      }
    }
  }
  return sortChildTableByIdx(result);
};

const mergeAddedRows = (
  clientRow: ChildTableRow | undefined,
  serverRow: ChildTableRow | undefined,
  config?: MergeConfig,
): FrappeDocValue => {
  if (serverRow === undefined) {
    return clientRow !== undefined && isObject(clientRow) ? { ...clientRow } : undefined;
  }
  if (clientRow === undefined) {
    return isObject(serverRow) ? { ...serverRow } : undefined;
  }
  if (!isFrappeDoc(clientRow) || !isFrappeDoc(serverRow)) {
    return undefined;
  }
  const childDoctype = serverRow.doctype || clientRow.doctype;
  // oxlint-disable-next-line eslint/no-use-before-define -- merge and mergeChildTable are mutually recursive
  return childDoctype ? merge(undefined, clientRow, serverRow, config, childDoctype).merged : undefined;
};

/** Resolves one row of a three-way child table merge; undefined drops the row. */
const mergeChildRow = (
  baseRow: ChildTableRow | undefined,
  clientRow: ChildTableRow | undefined,
  serverRow: ChildTableRow | undefined,
  config?: MergeConfig,
): FrappeDocValue => {
  if (baseRow === undefined) {
    return mergeAddedRows(clientRow, serverRow, config);
  }
  // A row deleted on either side stays deleted.
  if (clientRow === undefined || serverRow === undefined) {
    return undefined;
  }
  if (!isFrappeDoc(baseRow) || !isFrappeDoc(clientRow) || !isFrappeDoc(serverRow)) {
    return undefined;
  }
  const childDoctype = serverRow.doctype || clientRow.doctype || baseRow.doctype;
  // oxlint-disable-next-line eslint/no-use-before-define -- merge and mergeChildTable are mutually recursive
  return childDoctype ? merge(baseRow, clientRow, serverRow, config, childDoctype).merged : undefined;
};

export const mergeChildTable = (
  baseArray: FrappeDocValue[],
  clientArray: FrappeDocValue[],
  serverArray?: FrappeDocValue[],
  config?: MergeConfig,
): FrappeDocValue[] => {
  const isChildTable = isChildTableArray(baseArray, clientArray, serverArray);
  if (!isChildTable) {
    return serverArray ?? clientArray;
  }
  if (!serverArray) {
    return overlayChildTable(baseArray, clientArray);
  }
  const baseRows = rowsByName(baseArray);
  const clientRows = rowsByName(clientArray);
  const serverRows = rowsByName(serverArray);
  const allRowNames = new Set([...baseRows.keys(), ...clientRows.keys(), ...serverRows.keys()]);
  const result: FrappeDocValue[] = [];
  for (const rowName of allRowNames) {
    const merged = mergeChildRow(baseRows.get(rowName), clientRows.get(rowName), serverRows.get(rowName), config);
    if (merged !== undefined) {
      result.push(merged);
    }
  }
  return sortChildTableByIdx(result);
};

export const mergeFieldValue = (
  base: FrappeDocValue,
  client: FrappeDocValue,
  options: MergeFieldOptions = {},
): FrappeDocValue => {
  if (Array.isArray(client)) {
    const baseArray = Array.isArray(base) ? base : [];
    if (options.isChildTable === true || isChildTableArray(baseArray, client)) {
      return mergeChildTable(baseArray, client);
    }
    return client;
  }
  if (isObject(client)) {
    return isObject(base) ? { ...base, ...client } : { ...client };
  }
  return client;
};

const mergeObject = (
  base: Record<string, FrappeDocValue>,
  client: Record<string, FrappeDocValue>,
  server: Record<string, FrappeDocValue>,
  config?: MergeConfig,
  doctype?: string,
): ObjectMergeResult => {
  const merged: Record<string, FrappeDocValue> = {};
  const allKeys = new Set([...Object.keys(base), ...Object.keys(client), ...Object.keys(server)]);
  let hasConflicts = false;
  for (const key of allKeys) {
    const baseValue = base[key];
    const clientValue = client[key];
    const serverValue = server[key];
    const clientChanged = !deepEqual(baseValue, clientValue);
    const serverChanged = !deepEqual(baseValue, serverValue);
    if (!clientChanged && !serverChanged) {
      merged[key] = baseValue;
    } else if (clientChanged && !serverChanged) {
      merged[key] = clientValue;
    } else if (!clientChanged && serverChanged) {
      merged[key] = serverValue;
    } else if (deepEqual(clientValue, serverValue)) {
      merged[key] = serverValue;
    } else {
      const strategy = getFieldMergeStrategy(key, config, doctype);
      const result = applyMergeStrategy(key, baseValue, clientValue, serverValue, strategy);
      merged[key] = result.value;
      if (result.hasConflict) {
        hasConflicts = true;
      }
    }
  }
  return { merged, hasConflicts };
};

interface FieldMergeOutcome {
  value: FrappeDocValue;
  hasConflict: boolean;
}

/** Resolves a field both sides changed to different values. */
const resolveConflictingField = (
  key: string,
  baseValue: FrappeDocValue,
  clientValue: FrappeDocValue,
  serverValue: FrappeDocValue,
  config: MergeConfig | undefined,
  doctype: string | undefined,
): FieldMergeOutcome => {
  if (isChildTableArray(baseValue, clientValue, serverValue)) {
    const value = mergeChildTable(
      Array.isArray(baseValue) ? baseValue : [],
      Array.isArray(clientValue) ? clientValue : [],
      Array.isArray(serverValue) ? serverValue : [],
      config,
    );
    return { value, hasConflict: false };
  }
  if (isObject(clientValue) && isObject(serverValue)) {
    const baseObject = isObject(baseValue) ? baseValue : {};
    const objectMergeResult = mergeObject(baseObject, clientValue, serverValue, config, doctype);
    return { value: objectMergeResult.merged, hasConflict: objectMergeResult.hasConflicts };
  }
  const strategy = getFieldMergeStrategy(key, config, doctype);
  const result = applyMergeStrategy(key, baseValue, clientValue, serverValue, strategy);
  return { value: result.value, hasConflict: result.hasConflict || !config || !isNonEmptyString(doctype) };
};

export const merge = <Data extends FrappeDocData = FrappeDocData>(
  base: FrappeDoc<Data> | undefined,
  client: FrappeDoc<Data>,
  server: FrappeDoc<Data>,
  config?: MergeConfig,
  doctype?: string,
): MergeResult<Data> => {
  const resolvedDoctype = (doctype ?? server.doctype) || client.doctype || base?.doctype;
  const merged: Record<string, FrappeDocValue> = {};
  const conflicts: string[] = [];
  const allKeys = new Set<string>([...Object.keys(base ?? {}), ...Object.keys(client), ...Object.keys(server)]);
  for (const key of allKeys) {
    const baseValue = base?.[key];
    const clientValue = client[key];
    const serverValue = server[key];
    const clientChanged = !deepEqual(baseValue, clientValue);
    const serverChanged = !deepEqual(baseValue, serverValue);
    if (!clientChanged && !serverChanged) {
      merged[key] = baseValue;
    } else if (!serverChanged) {
      merged[key] = mergeFieldValue(baseValue, clientValue);
    } else if (!clientChanged) {
      merged[key] = mergeFieldValue(baseValue, serverValue);
    } else if (deepEqual(clientValue, serverValue)) {
      merged[key] = serverValue;
    } else {
      const outcome = resolveConflictingField(key, baseValue, clientValue, serverValue, config, resolvedDoctype);
      merged[key] = outcome.value;
      if (outcome.hasConflict) {
        conflicts.push(key);
      }
    }
  }
  return {
    // SAFETY: every key of base, client and server is copied into merged, so it carries the FrappeDoc<Data> fields.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    merged: merged as FrappeDoc<Data>,
    conflicts,
    hasConflicts: conflicts.length > 0,
  };
};

export const stripNullsFromChildRow = <Data extends FrappeDocData = FrappeDocData>(
  row: ChildTableRow<Data>,
): Partial<ChildTableRow<Data>> => {
  const cleaned: Partial<ChildTableRow<Data>> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null) {
      cleaned[key] = value;
    }
  }
  return cleaned;
};
