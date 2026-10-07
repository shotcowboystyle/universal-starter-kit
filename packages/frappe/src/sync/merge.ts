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

export function isObject(value: FrappeDocValue): value is Record<string, FrappeDocValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFrappeDoc(value: unknown): value is FrappeDoc<FrappeDocData> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'doctype' in value &&
    typeof (value as any).name === 'string' &&
    typeof (value as any).doctype === 'string'
  );
}

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

export function getFieldMergeStrategy(
  fieldName: string,
  config?: MergeConfig,
  doctype?: string,
): FieldMergeStrategyOrFunction {
  if (!config) {
    return FieldMergeStrategy.ServerWins;
  }
  const fieldStrategy = doctype ? config.doctypes?.[doctype]?.fields?.[fieldName] : undefined;
  if (fieldStrategy) {
    return fieldStrategy;
  }
  const doctypeDefault = doctype ? config.doctypes?.[doctype]?.defaultStrategy : undefined;
  if (doctypeDefault) {
    return doctypeDefault === MergeStrategy.ClientWins ? FieldMergeStrategy.ClientWins : FieldMergeStrategy.ServerWins;
  }
  return config.defaultStrategy === MergeStrategy.ClientWins
    ? FieldMergeStrategy.ClientWins
    : FieldMergeStrategy.ServerWins;
}

export interface MergeStrategyResult {
  value: FrappeDocValue;
  hasConflict: boolean;
}

export function applyMergeStrategy(
  fieldName: string,
  base: FrappeDocValue,
  client: FrappeDocValue,
  server: FrappeDocValue,
  strategy: FieldMergeStrategyOrFunction,
): MergeStrategyResult {
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
      if (
        (typeof base !== 'number' && base !== null && base !== undefined) ||
        (typeof client !== 'number' && client !== null && client !== undefined) ||
        (typeof server !== 'number' && server !== null && server !== undefined)
      ) {
        throw new TypeError(`merge strategy sum requires numeric values for field ${fieldName}`);
      }
      const baseNum = typeof base === 'number' ? base : 0;
      const clientNum = typeof client === 'number' ? client : 0;
      const serverNum = typeof server === 'number' ? server : 0;
      const clientDelta = clientNum - baseNum;
      const serverDelta = serverNum - baseNum;
      return {
        value: (baseNum + clientDelta + serverDelta) as FrappeDocValue,
        hasConflict: false,
      };
    }
    case FieldMergeStrategy.Max: {
      if (
        (typeof base !== 'number' && base !== null && base !== undefined) ||
        (typeof client !== 'number' && client !== null && client !== undefined) ||
        (typeof server !== 'number' && server !== null && server !== undefined)
      ) {
        throw new TypeError(`merge strategy max requires numeric values for field ${fieldName}`);
      }
      const baseNum = typeof base === 'number' ? base : 0;
      const clientNum = typeof client === 'number' ? client : 0;
      const serverNum = typeof server === 'number' ? server : 0;
      return {
        value: Math.max(baseNum, clientNum, serverNum) as FrappeDocValue,
        hasConflict: false,
      };
    }
    case FieldMergeStrategy.Min: {
      if (
        (typeof base !== 'number' && base !== null && base !== undefined) ||
        (typeof client !== 'number' && client !== null && client !== undefined) ||
        (typeof server !== 'number' && server !== null && server !== undefined)
      ) {
        throw new TypeError(`merge strategy min requires numeric values for field ${fieldName}`);
      }
      const baseNum = typeof base === 'number' ? base : 0;
      const clientNum = typeof client === 'number' ? client : 0;
      const serverNum = typeof server === 'number' ? server : 0;
      return {
        value: Math.min(baseNum, clientNum, serverNum) as FrappeDocValue,
        hasConflict: false,
      };
    }
    case FieldMergeStrategy.UnionSet: {
      if (
        (!Array.isArray(base) && base !== null && base !== undefined) ||
        (!Array.isArray(client) && client !== null && client !== undefined) ||
        (!Array.isArray(server) && server !== null && server !== undefined)
      ) {
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
      return {
        value: [...result] as FrappeDocValue,
        hasConflict: false,
      };
    }
    default: {
      return { value: server, hasConflict: true };
    }
  }
}

export function mergeFieldValue(
  base: FrappeDocValue,
  client: FrappeDocValue,
  options: MergeFieldOptions = {},
): FrappeDocValue {
  if (client === null || client === undefined) {
    return client;
  }
  if (Array.isArray(client)) {
    const baseArray = Array.isArray(base) ? base : [];
    if (options.isChildTable || isChildTableArray(baseArray, client)) {
      return mergeChildTable(baseArray, client);
    }
    return client;
  }
  if (typeof client === 'object' && client !== null) {
    return {
      ...(typeof base === 'object' && base !== null && !Array.isArray(base) ? base : {}),
      ...client,
    };
  }
  return client;
}

export function merge<Data extends FrappeDocData = FrappeDocData>(
  base: FrappeDoc<Data> | undefined,
  client: FrappeDoc<Data>,
  server: FrappeDoc<Data>,
  config?: MergeConfig,
  doctype?: string,
): MergeResult<Data> {
  doctype = (doctype ?? server.doctype) || client.doctype || base?.doctype;
  const merged = {} as FrappeDoc<Data>;
  const conflicts: string[] = [];
  const allKeys = new Set<string>();
  if (base) {
    Object.keys(base).forEach((key) => allKeys.add(key));
  }
  Object.keys(client).forEach((key) => allKeys.add(key));
  Object.keys(server).forEach((key) => allKeys.add(key));
  for (const key of allKeys) {
    const baseValue = base?.[key];
    const clientValue = client[key];
    const serverValue = server[key];
    const clientChanged = !deepEqual(baseValue, clientValue);
    const serverChanged = !deepEqual(baseValue, serverValue);
    if (!clientChanged && !serverChanged) {
      (merged as any)[key] = baseValue;
    } else if (clientChanged && !serverChanged) {
      (merged as any)[key] = mergeFieldValue(baseValue, clientValue);
    } else if (!clientChanged && serverChanged) {
      (merged as any)[key] = mergeFieldValue(baseValue, serverValue);
    } else {
      if (deepEqual(clientValue, serverValue)) {
        (merged as any)[key] = serverValue;
      } else {
        if (isChildTableArray(baseValue, clientValue, serverValue)) {
          (merged as any)[key] = mergeChildTable(
            Array.isArray(baseValue) ? baseValue : [],
            Array.isArray(clientValue) ? clientValue : [],
            Array.isArray(serverValue) ? serverValue : [],
            config,
          );
        } else if (isObject(clientValue) && isObject(serverValue)) {
          const baseObject = isObject(baseValue) ? baseValue : {};
          const objectMergeResult = mergeObject(baseObject, clientValue, serverValue, config, doctype);
          (merged as any)[key] = objectMergeResult.merged;
          if (objectMergeResult.hasConflicts) {
            conflicts.push(key);
          }
        } else {
          const strategy = getFieldMergeStrategy(key, config, doctype);
          const result = applyMergeStrategy(key, baseValue, clientValue, serverValue, strategy);
          (merged as any)[key] = result.value;
          if (result.hasConflict || !config || !doctype) {
            conflicts.push(key);
          }
        }
      }
    }
  }
  return {
    merged,
    conflicts,
    hasConflicts: conflicts.length > 0,
  };
}

function mergeObject(
  base: Record<string, FrappeDocValue>,
  client: Record<string, FrappeDocValue>,
  server: Record<string, FrappeDocValue>,
  config?: MergeConfig,
  doctype?: string,
): ObjectMergeResult {
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
}

export function mergeChildTable(
  baseArray: FrappeDocValue[],
  clientArray: FrappeDocValue[],
  serverArray?: FrappeDocValue[],
  config?: MergeConfig,
): FrappeDocValue[] {
  const isChildTable = isChildTableArray(baseArray, clientArray, serverArray);
  if (!isChildTable) {
    return serverArray ?? clientArray;
  }
  if (!serverArray) {
    const rowsByName = new Map<string, FrappeDocValue>();
    const result: FrappeDocValue[] = [];
    for (const row of baseArray) {
      if (isChildTableRow(row)) {
        rowsByName.set(row.name, { ...row });
        result.push(rowsByName.get(row.name));
      }
    }
    for (const row of clientArray) {
      if (isChildTableRow(row)) {
        const existingRow = rowsByName.get(row.name);
        if (existingRow && isObject(existingRow)) {
          Object.assign(existingRow, row);
        } else {
          rowsByName.set(row.name, { ...row });
          result.push(rowsByName.get(row.name));
        }
      }
    }
    return sortChildTableByIdx(result);
  }
  const result: FrappeDocValue[] = [];
  const baseRowsByName = new Map<string, FrappeDocValue>();
  const clientRowsByName = new Map<string, FrappeDocValue>();
  const serverRowsByName = new Map<string, FrappeDocValue>();
  for (const row of baseArray) {
    if (isChildTableRow(row)) {
      baseRowsByName.set(row.name, row);
    }
  }
  for (const row of clientArray) {
    if (isChildTableRow(row)) {
      clientRowsByName.set(row.name, row);
    }
  }
  for (const row of serverArray) {
    if (isChildTableRow(row)) {
      serverRowsByName.set(row.name, row);
    }
  }
  const allRowNames = new Set([...baseRowsByName.keys(), ...clientRowsByName.keys(), ...serverRowsByName.keys()]);
  for (const rowName of allRowNames) {
    const baseRow = baseRowsByName.get(rowName);
    const clientRow = clientRowsByName.get(rowName);
    const serverRow = serverRowsByName.get(rowName);
    const clientDeleted = baseRow && !clientRow;
    const serverDeleted = baseRow && !serverRow;
    const clientAdded = !baseRow && clientRow;
    const serverAdded = !baseRow && serverRow;
    if ((clientDeleted && serverDeleted) || (clientDeleted && !serverDeleted) || (!clientDeleted && serverDeleted)) {
      continue;
    }
    if (clientAdded && !serverAdded) {
      if (clientRow && isObject(clientRow)) {
        result.push({ ...clientRow });
      }
    } else if (!clientAdded && serverAdded) {
      if (serverRow && isObject(serverRow)) {
        result.push({ ...serverRow });
      }
    } else if (clientAdded && serverAdded) {
      if (isFrappeDoc(clientRow) && isFrappeDoc(serverRow)) {
        const childDoctype = serverRow.doctype || clientRow.doctype;
        if (childDoctype) {
          const merged = merge(undefined, clientRow, serverRow, config, childDoctype);
          result.push(merged.merged);
        }
      }
    } else if (baseRow && clientRow && serverRow) {
      if (isFrappeDoc(baseRow) && isFrappeDoc(clientRow) && isFrappeDoc(serverRow)) {
        const childDoctype = serverRow.doctype || clientRow.doctype || baseRow.doctype;
        if (childDoctype) {
          const merged = merge(baseRow, clientRow, serverRow, config, childDoctype);
          result.push(merged.merged);
        }
      }
    }
  }
  return sortChildTableByIdx(result);
}

function sortChildTableByIdx(value: FrappeDocValue[]): FrappeDocValue[] {
  const hasIndexField = value.some((row) => isChildTableRow(row) && row.idx !== null && typeof row.idx === 'number');
  if (hasIndexField) {
    value.sort((a, b) => {
      const indexA = isChildTableRow(a) && typeof a.idx === 'number' ? a.idx : Number.MAX_SAFE_INTEGER;
      const indexB = isChildTableRow(b) && typeof b.idx === 'number' ? b.idx : Number.MAX_SAFE_INTEGER;
      return indexA - indexB;
    });
  }
  return value;
}

export function deepEqual(valueA: FrappeDocValue, valueB: FrappeDocValue): boolean {
  if (valueA === valueB) {
    return true;
  }
  if (valueA == null || valueB == null) {
    return valueA === valueB;
  }
  if (typeof valueA !== typeof valueB) {
    return false;
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
}

export function isChildTableRow<Data extends FrappeDocData = FrappeDocData>(
  value: unknown,
): value is ChildTableRow<Data> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as any;
  if (typeof row.name !== 'string') {
    return false;
  }
  if (!('idx' in row) || (row.idx !== null && typeof row.idx !== 'number')) {
    return false;
  }
  if (!('parent' in row) || (row.parent !== null && typeof row.parent !== 'string')) {
    return false;
  }
  if (!('parentfield' in row) || (row.parentfield !== null && typeof row.parentfield !== 'string')) {
    return false;
  }
  if (!('parenttype' in row) || (row.parenttype !== null && typeof row.parenttype !== 'string')) {
    return false;
  }
  if ('doctype' in row && row.doctype !== null && typeof row.doctype !== 'string') {
    return false;
  }
  return true;
}

export function isChildTableArray(value1: unknown, value2: unknown, ...values: unknown[]): boolean;
export function isChildTableArray(...values: unknown[]): boolean | null;
export function isChildTableArray(...values: unknown[]): boolean | null {
  if (values.length === 1) {
    const value = values[0];
    if (!Array.isArray(value)) {
      return false;
    }
    if (value.length === 0) {
      return null;
    }
    const validRows = value.filter((row) => row !== null && row !== undefined);
    if (validRows.length === 0) {
      return null;
    }
    return [validRows[0], validRows.at(-1), validRows[Math.floor(validRows.length / 2)]]
      .filter(Boolean)
      .every((row) => isChildTableRow(row));
  }
  const validArrays = values.filter((arr) => Array.isArray(arr));
  if (validArrays.length === 0) {
    return false;
  }
  let hasChildTableEvidence = false;
  let hasNonChildTableEvidence = false;
  for (const arr of validArrays) {
    if (!Array.isArray(arr)) {
      return false;
    }
    if (arr.length === 0) {
      continue;
    }
    const validRows = arr.filter((row: any) => row !== null && row !== undefined);
    if (validRows.length === 0) {
      continue;
    }
    if (
      [
        validRows[0],
        validRows.length >= 2 ? validRows.at(-1) : null,
        validRows.length >= 3 ? validRows[Math.floor(validRows.length / 2)] : null,
      ]
        .filter(Boolean)
        .every((row) => isChildTableRow(row))
    ) {
      hasChildTableEvidence = true;
    } else {
      hasNonChildTableEvidence = true;
    }
  }
  return hasChildTableEvidence && !hasNonChildTableEvidence;
}

export function stripNullsFromChildRow<Data extends FrappeDocData = FrappeDocData>(
  row: ChildTableRow<Data>,
): Partial<ChildTableRow<Data>> {
  const cleaned: Partial<ChildTableRow<Data>> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null) {
      cleaned[key as keyof ChildTableRow<Data>] = value;
    }
  }
  return cleaned;
}
