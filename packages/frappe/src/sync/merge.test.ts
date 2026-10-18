import { describe, expect, it } from 'vitest';

import type { ChildTableRow, FrappeDocValue } from '../common/types';

import {
  applyMergeStrategy,
  deepEqual,
  FieldMergeStrategy,
  getFieldMergeStrategy,
  isObject,
  merge,
  mergeChildTable,
  mergeFieldValue,
  MergeStrategy,
} from './merge';
import type { MergeConfig } from './merge';

const createChildRow = (name: string, idx: number, value?: string): ChildTableRow => ({
  name,
  doctype: 'Item',
  idx,
  parent: 'parent',
  parentfield: 'items',
  parenttype: 'Invoice',
  value: value ?? `value-${idx}`,
});

const sumClientAndServer = (_base: FrappeDocValue, client: FrappeDocValue, server: FrappeDocValue) =>
  (client as number) + (server as number);

const sumBaseAndClient = (base: FrappeDocValue, client: FrappeDocValue, _server: FrappeDocValue) =>
  (base as number) + (client as number);

describe(mergeChildTable, () => {
  describe('2-way merge', () => {
    it('should merge child table arrays by name', () => {
      const baseArray = [createChildRow('row-1', 1, 'old'), createChildRow('row-2', 2)];
      const incomingArray = [createChildRow('row-1', 1, 'new'), createChildRow('row-3', 3)];
      const result = mergeChildTable(baseArray, incomingArray);
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ name: 'row-1', value: 'new' });
      expect(result[1]).toMatchObject({ name: 'row-2', value: 'value-2' });
      expect(result[2]).toMatchObject({ name: 'row-3', value: 'value-3' });
    });

    it('should handle empty base array', () => {
      const baseArray: FrappeDocValue[] = [];
      const incomingArray = [createChildRow('row-1', 1), createChildRow('row-2', 2)];
      const result = mergeChildTable(baseArray, incomingArray);
      expect(result).toStrictEqual(incomingArray);
    });

    it('should handle empty incoming array', () => {
      const baseArray = [createChildRow('row-1', 1), createChildRow('row-2', 2)];
      const incomingArray: FrappeDocValue[] = [];
      const result = mergeChildTable(baseArray, incomingArray);
      expect(result).toStrictEqual(baseArray);
    });

    it('should sort child table rows by idx', () => {
      const baseArray = [createChildRow('row-3', 3), createChildRow('row-1', 1)];
      const incomingArray = [createChildRow('row-2', 2)];
      const result = mergeChildTable(baseArray, incomingArray);
      expect(result[0]).toMatchObject({ name: 'row-1', idx: 1 });
      expect(result[1]).toMatchObject({ name: 'row-2', idx: 2 });
      expect(result[2]).toMatchObject({ name: 'row-3', idx: 3 });
    });
  });

  describe('3-way merge', () => {
    it('should handle concurrent updates to different rows', () => {
      const baseArray = [createChildRow('row-1', 1, 'original-1'), createChildRow('row-2', 2, 'original-2')];
      const incomingArray = [createChildRow('row-1', 1, 'client-1'), createChildRow('row-2', 2, 'original-2')];
      const serverArray = [createChildRow('row-1', 1, 'original-1'), createChildRow('row-2', 2, 'server-2')];
      const result = mergeChildTable(baseArray, incomingArray, serverArray);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ name: 'row-1', value: 'client-1' });
      expect(result[1]).toMatchObject({ name: 'row-2', value: 'server-2' });
    });

    it('should handle additions from both client and server', () => {
      const baseArray = [createChildRow('row-1', 1)];
      const incomingArray = [createChildRow('row-1', 1), createChildRow('row-2', 2)];
      const serverArray = [createChildRow('row-1', 1), createChildRow('row-3', 3)];
      const result = mergeChildTable(baseArray, incomingArray, serverArray);
      expect(result).toHaveLength(3);
      expect(result.map((r: any) => r.name)).toContain('row-1');
      expect(result.map((r: any) => r.name)).toContain('row-2');
      expect(result.map((r: any) => r.name)).toContain('row-3');
    });

    it('should handle deletions', () => {
      const baseArray = [createChildRow('row-1', 1), createChildRow('row-2', 2), createChildRow('row-3', 3)];
      const incomingArray = [createChildRow('row-1', 1), createChildRow('row-3', 3)];
      const serverArray = [createChildRow('row-1', 1), createChildRow('row-2', 2)];
      const result = mergeChildTable(baseArray, incomingArray, serverArray);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: 'row-1' });
    });

    it('should prefer server values on conflicts', () => {
      const baseArray = [createChildRow('row-1', 1, 'original')];
      const incomingArray = [createChildRow('row-1', 1, 'client-update')];
      const serverArray = [createChildRow('row-1', 1, 'server-update')];
      const result = mergeChildTable(baseArray, incomingArray, serverArray);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'row-1',
        value: 'server-update',
      });
    });
  });

  describe('non-child-table arrays', () => {
    it('should return incoming array for non-child-table 2-way merge', () => {
      const baseArray = [1, 2, 3];
      const incomingArray = [4, 5, 6];
      const result = mergeChildTable(baseArray, incomingArray);
      expect(result).toStrictEqual(incomingArray);
    });

    it('should return server array for non-child-table 3-way merge', () => {
      const baseArray = [1, 2, 3];
      const incomingArray = [4, 5, 6];
      const serverArray = [7, 8, 9];
      const result = mergeChildTable(baseArray, incomingArray, serverArray);
      expect(result).toStrictEqual(serverArray);
    });

    it('should handle mixed evidence correctly', () => {
      const baseArray: FrappeDocValue[] = [];
      const incomingArray = [createChildRow('row-1', 1)];
      const serverArray = [{ some: 'object' }];
      const result = mergeChildTable(baseArray, incomingArray, serverArray);
      expect(result).toStrictEqual(serverArray);
    });
  });
});

describe(mergeFieldValue, () => {
  it('should handle null and undefined values', () => {
    const base = 'value';
    expect(mergeFieldValue(base, null)).toBeNull();
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
    expect(mergeFieldValue(base, undefined)).toBeUndefined();
  });

  it('should merge objects', () => {
    const base = { d: 3 };
    const incoming = { e: 4 };
    const result = mergeFieldValue(base, incoming);
    expect(result).toStrictEqual({
      d: 3,
      e: 4,
    });
  });

  it('should detect and merge child tables in arrays', () => {
    const base = [
      {
        name: 'row-1',
        doctype: 'Item',
        idx: 1,
        parent: 'p',
        parentfield: 'f',
        parenttype: 't',
        value: 'old',
      },
    ];
    const incoming = [
      {
        name: 'row-1',
        doctype: 'Item',
        idx: 1,
        parent: 'p',
        parentfield: 'f',
        parenttype: 't',
        value: 'new',
      },
    ];
    const result = mergeFieldValue(base, incoming, { isChildTable: true });
    expect(Array.isArray(result)).toBe(true);
    expect((result as any)[0].value).toBe('new');
  });

  it('should return incoming value for primitives', () => {
    expect(mergeFieldValue('old', 'new')).toBe('new');
    expect(mergeFieldValue(1, 2)).toBe(2);
    expect(mergeFieldValue(true, false)).toBe(false);
  });

  it('should return incoming array for non-child-table arrays', () => {
    const base = [1, 2, 3];
    const incoming = [4, 5, 6];
    const result = mergeFieldValue(base, incoming);
    expect(result).toStrictEqual([4, 5, 6]);
  });
});

describe('merge (3-way merge)', () => {
  it('should detect and merge non-conflicting changes', () => {
    const base = {
      doctype: 'TestDoc',
      name: 'doc-1',
      field1: 'original',
      field2: 'original',
    };
    const client = {
      doctype: 'TestDoc',
      name: 'doc-1',
      field1: 'client-update',
      field2: 'original',
    };
    const server = {
      doctype: 'TestDoc',
      name: 'doc-1',
      field1: 'original',
      field2: 'server-update',
    };
    const { merged, conflicts } = merge(base, client, server);
    expect(merged).toStrictEqual({
      doctype: 'TestDoc',
      name: 'doc-1',
      field1: 'client-update',
      field2: 'server-update',
    });
    expect(conflicts).toStrictEqual([]);
  });

  it('should detect conflicts when both modify same field', () => {
    const base = {
      doctype: 'TestDoc',
      name: 'doc-1',
      field1: 'original',
    };
    const client = {
      doctype: 'TestDoc',
      name: 'doc-1',
      field1: 'client-update',
    };
    const server = {
      doctype: 'TestDoc',
      name: 'doc-1',
      field1: 'server-update',
    };
    const { merged, conflicts } = merge(base, client, server);
    expect(merged.field1).toBe('server-update');
    expect(conflicts).toContain('field1');
  });

  it('should handle field additions', () => {
    const base = { doctype: 'TestDoc', name: 'doc-1' };
    const client = { doctype: 'TestDoc', name: 'doc-1', clientField: 'client' };
    const server = { doctype: 'TestDoc', name: 'doc-1', serverField: 'server' };
    const { merged, conflicts } = merge(base, client, server);
    expect(merged).toStrictEqual({
      doctype: 'TestDoc',
      name: 'doc-1',
      clientField: 'client',
      serverField: 'server',
    });
    expect(conflicts).toStrictEqual([]);
  });

  it('should handle field deletions', () => {
    const base = {
      doctype: 'TestDoc',
      name: 'doc-1',
      field1: 'value1',
      field2: 'value2',
    };
    const client = {
      doctype: 'TestDoc',
      name: 'doc-1',
      field2: 'value2',
    } as typeof base;
    const server = {
      doctype: 'TestDoc',
      name: 'doc-1',
      field1: 'value1',
    } as typeof base;
    const { merged, conflicts } = merge(base, client, server);
    expect(merged).toStrictEqual({
      doctype: 'TestDoc',
      name: 'doc-1',
      // A deleted field stays on the merged doc as an explicit undefined key.
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the explicit `field1: undefined` key
      field1: undefined,
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the explicit `field2: undefined` key
      field2: undefined,
    });
    expect(conflicts).toStrictEqual([]);
  });

  it('should intelligently merge child table conflicts', () => {
    const base = {
      doctype: 'TestDoc',
      name: 'doc-1',
      items: [
        {
          name: 'row-1',
          doctype: 'Item',
          idx: 1,
          parent: 'doc-1',
          parentfield: 'items',
          parenttype: 'Doc',
          value: 'original',
        },
      ],
    };
    const client = {
      doctype: 'TestDoc',
      name: 'doc-1',
      items: [
        {
          name: 'row-1',
          doctype: 'Item',
          idx: 1,
          parent: 'doc-1',
          parentfield: 'items',
          parenttype: 'Doc',
          value: 'client',
        },
        {
          name: 'row-2',
          doctype: 'Item',
          idx: 2,
          parent: 'doc-1',
          parentfield: 'items',
          parenttype: 'Doc',
          value: 'new-client',
        },
      ],
    };
    const server = {
      doctype: 'TestDoc',
      name: 'doc-1',
      items: [
        {
          name: 'row-1',
          doctype: 'Item',
          idx: 1,
          parent: 'doc-1',
          parentfield: 'items',
          parenttype: 'Doc',
          value: 'server',
        },
        {
          name: 'row-3',
          doctype: 'Item',
          idx: 3,
          parent: 'doc-1',
          parentfield: 'items',
          parenttype: 'Doc',
          value: 'new-server',
        },
      ],
    };
    const { merged, conflicts } = merge(base, client, server);
    expect(merged.items).toHaveLength(3);
    expect(conflicts).toStrictEqual([]);
  });

  it('should handle array conflicts that are not child tables', () => {
    const base = { doctype: 'TestDoc', name: 'doc-1', tags: ['a', 'b'] };
    const client = { doctype: 'TestDoc', name: 'doc-1', tags: ['a', 'c'] };
    const server = { doctype: 'TestDoc', name: 'doc-1', tags: ['a', 'd'] };
    const { merged, conflicts } = merge(base, client, server);
    expect(merged.tags).toStrictEqual(['a', 'd']);
    expect(conflicts).toContain('tags');
  });
});

describe(deepEqual, () => {
  it('should compare primitive values correctly', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('test', 'test')).toBe(true);
    expect(deepEqual('test', 'other')).toBe(false);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(true, false)).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameters are required; undefined is the case under test
    expect(deepEqual(undefined, undefined)).toBe(true);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('should compare arrays correctly', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(deepEqual([1, 2, 3], [1, 2])).toBe(false);
    expect(deepEqual([], [])).toBe(true);
  });

  it('should compare objects correctly', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({}, {})).toBe(true);
  });

  it('should compare nested structures', () => {
    const obj1 = {
      a: 1,
      b: [2, 3],
      c: { d: 4, e: [5, 6] },
    };
    const obj2 = {
      a: 1,
      b: [2, 3],
      c: { d: 4, e: [5, 6] },
    };
    const obj3 = {
      a: 1,
      b: [2, 3],
      c: { d: 4, e: [5, 7] },
    };
    expect(deepEqual(obj1, obj2)).toBe(true);
    expect(deepEqual(obj1, obj3)).toBe(false);
  });
});

describe(isObject, () => {
  it('should identify objects correctly', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject(null)).toBe(false);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
    expect(isObject(undefined)).toBe(false);
    expect(isObject([])).toBe(false);
    expect(isObject('string')).toBe(false);
    expect(isObject(123)).toBe(false);
    expect(isObject(true)).toBe(false);
  });
});

describe(applyMergeStrategy, () => {
  describe('Sum', () => {
    it('should sum client and server deltas from base', () => {
      const result = applyMergeStrategy('amount', 10, 15, 12, FieldMergeStrategy.Sum);
      expect(result).toStrictEqual({ value: 17, hasConflict: false });
    });

    it('should handle zero base', () => {
      const result = applyMergeStrategy('amount', 0, 5, 3, FieldMergeStrategy.Sum);
      expect(result).toStrictEqual({ value: 8, hasConflict: false });
    });

    it('should handle null base as zero', () => {
      const result = applyMergeStrategy('amount', null, 5, 3, FieldMergeStrategy.Sum);
      expect(result).toStrictEqual({ value: 8, hasConflict: false });
    });

    it('should throw TypeError for non-numeric values', () => {
      expect(() => applyMergeStrategy('amount', 'ten', 15, 12, FieldMergeStrategy.Sum)).toThrow(TypeError);
      expect(() => applyMergeStrategy('amount', 10, 'fifteen', 12, FieldMergeStrategy.Sum)).toThrow(TypeError);
    });
  });

  describe('Max', () => {
    it('should return the largest of base, client, and server', () => {
      const result = applyMergeStrategy('priority', 5, 10, 7, FieldMergeStrategy.Max);
      expect(result).toStrictEqual({ value: 10, hasConflict: false });
    });

    it('should handle server being the max', () => {
      const result = applyMergeStrategy('priority', 5, 7, 10, FieldMergeStrategy.Max);
      expect(result).toStrictEqual({ value: 10, hasConflict: false });
    });

    it('should handle null values as zero', () => {
      const result = applyMergeStrategy('priority', null, 3, null, FieldMergeStrategy.Max);
      expect(result).toStrictEqual({ value: 3, hasConflict: false });
    });

    it('should throw TypeError for non-numeric values', () => {
      expect(() => applyMergeStrategy('priority', 'low', 'high', 'medium', FieldMergeStrategy.Max)).toThrow(TypeError);
    });
  });

  describe('Min', () => {
    it('should return the smallest of base, client, and server', () => {
      const result = applyMergeStrategy('priority', 5, 2, 7, FieldMergeStrategy.Min);
      expect(result).toStrictEqual({ value: 2, hasConflict: false });
    });

    it('should handle server being the min', () => {
      const result = applyMergeStrategy('priority', 5, 7, 1, FieldMergeStrategy.Min);
      expect(result).toStrictEqual({ value: 1, hasConflict: false });
    });

    it('should handle null values as zero', () => {
      const result = applyMergeStrategy('priority', null, 3, 5, FieldMergeStrategy.Min);
      expect(result).toStrictEqual({ value: 0, hasConflict: false });
    });

    it('should throw TypeError for non-numeric values', () => {
      expect(() => applyMergeStrategy('priority', 'a', 'b', 'c', FieldMergeStrategy.Min)).toThrow(TypeError);
    });
  });

  describe('UnionSet', () => {
    it('should return union of client and server arrays with no duplicates', () => {
      const result = applyMergeStrategy(
        'tags',
        ['a', 'b'],
        ['a', 'b', 'c'],
        ['a', 'b', 'd'],
        FieldMergeStrategy.UnionSet,
      );
      expect(result.hasConflict).toBe(false);
      const arr = result.value as string[];
      expect(arr).toContain('a');
      expect(arr).toContain('b');
      expect(arr).toContain('c');
      expect(arr).toContain('d');
      expect(new Set(arr).size).toBe(arr.length);
    });

    it('should only remove items deleted by both sides', () => {
      const result = applyMergeStrategy('tags', ['a', 'b', 'c'], ['a'], ['a'], FieldMergeStrategy.UnionSet);
      const arr = result.value as string[];
      expect(arr).toStrictEqual(['a']);
    });

    it('should keep items removed by only one side', () => {
      const result = applyMergeStrategy('tags', ['a', 'b', 'c'], ['a', 'c'], ['a', 'b'], FieldMergeStrategy.UnionSet);
      const arr = result.value as string[];
      expect(arr).toContain('a');
      expect(arr).toContain('b');
      expect(arr).toContain('c');
    });

    it('should handle null base as empty array', () => {
      const result = applyMergeStrategy('tags', null, ['a', 'b'], ['b', 'c'], FieldMergeStrategy.UnionSet);
      const arr = result.value as string[];
      expect(arr).toContain('a');
      expect(arr).toContain('b');
      expect(arr).toContain('c');
    });

    it('should throw TypeError for non-array values', () => {
      expect(() => applyMergeStrategy('tags', 'not-array', ['a'], ['b'], FieldMergeStrategy.UnionSet)).toThrow(
        TypeError,
      );
      expect(() => applyMergeStrategy('tags', ['a'], 42, ['b'], FieldMergeStrategy.UnionSet)).toThrow(TypeError);
    });
  });

  describe('Custom function', () => {
    it('should invoke the custom function with base, client, server', () => {
      const result = applyMergeStrategy('score', 0, 10, 20, sumClientAndServer);
      expect(result).toStrictEqual({ value: 30, hasConflict: false });
    });

    it('should pass correct arguments to custom function', () => {
      const calls: FrappeDocValue[][] = [];
      const spy = (base: FrappeDocValue, client: FrappeDocValue, server: FrappeDocValue) => {
        calls.push([base, client, server]);
        return server;
      };
      applyMergeStrategy('field', 'base-val', 'client-val', 'server-val', spy);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toStrictEqual(['base-val', 'client-val', 'server-val']);
    });
  });

  describe('ClientWins / ServerWins', () => {
    it('should return client value for ClientWins', () => {
      const result = applyMergeStrategy('f', 'base', 'client', 'server', FieldMergeStrategy.ClientWins);
      expect(result).toStrictEqual({ value: 'client', hasConflict: false });
    });

    it('should return server value for ServerWins', () => {
      const result = applyMergeStrategy('f', 'base', 'client', 'server', FieldMergeStrategy.ServerWins);
      expect(result).toStrictEqual({ value: 'server', hasConflict: false });
    });
  });
});

describe(getFieldMergeStrategy, () => {
  it('should return ServerWins when no config is provided', () => {
    expect(getFieldMergeStrategy('amount')).toBe(FieldMergeStrategy.ServerWins);
  });

  it('should return field-specific strategy when configured', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ServerWins,
      doctypes: {
        Invoice: {
          fields: {
            total: FieldMergeStrategy.Sum,
            priority: FieldMergeStrategy.Max,
          },
        },
      },
    };
    expect(getFieldMergeStrategy('total', config, 'Invoice')).toBe(FieldMergeStrategy.Sum);
    expect(getFieldMergeStrategy('priority', config, 'Invoice')).toBe(FieldMergeStrategy.Max);
  });

  it('should return global default when field is not in config', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ClientWins,
      doctypes: {
        Invoice: {
          fields: { total: FieldMergeStrategy.Sum },
        },
      },
    };
    expect(getFieldMergeStrategy('unknown_field', config, 'Invoice')).toBe(FieldMergeStrategy.ClientWins);
  });

  it('should fall back to doctype default strategy when field not configured', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ServerWins,
      doctypes: {
        Invoice: {
          defaultStrategy: MergeStrategy.ClientWins,
          fields: {},
        },
      },
    };
    expect(getFieldMergeStrategy('some_field', config, 'Invoice')).toBe(FieldMergeStrategy.ClientWins);
  });

  it('should fall back to global default when doctype has no config', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ClientWins,
      doctypes: {
        Invoice: { fields: { total: FieldMergeStrategy.Sum } },
      },
    };
    expect(getFieldMergeStrategy('total', config, 'UnknownDoctype')).toBe(FieldMergeStrategy.ClientWins);
  });

  it('should return a custom function strategy correctly', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ServerWins,
      doctypes: {
        Invoice: { fields: { computed: sumBaseAndClient } },
      },
    };
    const result = getFieldMergeStrategy('computed', config, 'Invoice');
    expect(result).toBe(sumBaseAndClient);
  });

  it('should return ServerWins when config has no doctype and global is ServerWins', () => {
    const config: MergeConfig = { defaultStrategy: MergeStrategy.ServerWins };
    expect(getFieldMergeStrategy('field', config, 'AnyDoctype')).toBe(FieldMergeStrategy.ServerWins);
  });
});

describe('merge with MergeConfig', () => {
  it('should use Max strategy for a numeric field instead of default server-wins', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ServerWins,
      doctypes: {
        TestDoc: {
          fields: { priority: FieldMergeStrategy.Max },
        },
      },
    };
    const base = { doctype: 'TestDoc', name: 'doc-1', priority: 5 };
    const client = { doctype: 'TestDoc', name: 'doc-1', priority: 10 };
    const server = { doctype: 'TestDoc', name: 'doc-1', priority: 7 };
    const { merged, conflicts } = merge(base, client, server, config);
    expect(merged.priority).toBe(10);
    expect(conflicts).not.toContain('priority');
  });

  it('should use Sum strategy to combine concurrent numeric changes', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ServerWins,
      doctypes: {
        TestDoc: {
          fields: { amount: FieldMergeStrategy.Sum },
        },
      },
    };
    const base = { doctype: 'TestDoc', name: 'doc-1', amount: 100 };
    const client = { doctype: 'TestDoc', name: 'doc-1', amount: 150 };
    const server = { doctype: 'TestDoc', name: 'doc-1', amount: 120 };
    const { merged, conflicts } = merge(base, client, server, config);
    expect(merged.amount).toBe(170);
    expect(conflicts).not.toContain('amount');
  });

  it('should use UnionSet strategy for an array field', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ServerWins,
      doctypes: {
        TestDoc: {
          fields: { tags: FieldMergeStrategy.UnionSet },
        },
      },
    };
    const base = { doctype: 'TestDoc', name: 'doc-1', tags: ['a', 'b'] };
    const client = { doctype: 'TestDoc', name: 'doc-1', tags: ['a', 'b', 'c'] };
    const server = { doctype: 'TestDoc', name: 'doc-1', tags: ['a', 'b', 'd'] };
    const { merged, conflicts } = merge(base, client, server, config);
    const { tags } = merged;
    expect(tags).toContain('a');
    expect(tags).toContain('b');
    expect(tags).toContain('c');
    expect(tags).toContain('d');
    expect(conflicts).not.toContain('tags');
  });

  it('should not apply config meant for a different doctype', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ServerWins,
      doctypes: {
        OtherDoc: {
          fields: { priority: FieldMergeStrategy.Max },
        },
      },
    };
    const base = { doctype: 'TestDoc', name: 'doc-1', priority: 5 };
    const client = { doctype: 'TestDoc', name: 'doc-1', priority: 10 };
    const server = { doctype: 'TestDoc', name: 'doc-1', priority: 7 };
    const { merged } = merge(base, client, server, config);
    expect(merged.priority).toBe(7);
  });

  it('should apply custom function strategy through merge', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ServerWins,
      doctypes: {
        TestDoc: {
          fields: {
            score: (_base, client, server) => (client as number) * (server as number),
          },
        },
      },
    };
    const base = { doctype: 'TestDoc', name: 'doc-1', score: 1 };
    const client = { doctype: 'TestDoc', name: 'doc-1', score: 3 };
    const server = { doctype: 'TestDoc', name: 'doc-1', score: 4 };
    const { merged, conflicts } = merge(base, client, server, config);
    expect(merged.score).toBe(12);
    expect(conflicts).not.toContain('score');
  });

  it('should resolve configured fields without conflict while defaulting others to server-wins', () => {
    const config: MergeConfig = {
      defaultStrategy: MergeStrategy.ServerWins,
      doctypes: {
        TestDoc: {
          fields: { amount: FieldMergeStrategy.Sum },
        },
      },
    };
    const base = { doctype: 'TestDoc', name: 'doc-1', amount: 100, status: 'draft' };
    const client = { doctype: 'TestDoc', name: 'doc-1', amount: 150, status: 'submitted' };
    const server = { doctype: 'TestDoc', name: 'doc-1', amount: 120, status: 'cancelled' };
    const { merged, conflicts } = merge(base, client, server, config);
    expect(merged.amount).toBe(170);
    expect(merged.status).toBe('cancelled');
    expect(conflicts).not.toContain('amount');
    expect(conflicts).not.toContain('status');
  });
});
