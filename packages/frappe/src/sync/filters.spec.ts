import { describe, expect, it } from 'vitest';

import { FilterOperator, matchesFilters } from './filters';

describe(matchesFilters, () => {
  const testDoc = {
    name: 'TEST-001',
    doctype: 'Task',
    status: 'Open',
    priority: 5,
    tags: ['urgent', 'customer'],
    assignee: 'john@example.com',
    created: '2024-01-01',
    amount: 1000,
    description: 'Test document for filter testing',
    parent: 'PARENT-001',
  } as any;

  describe('array-style filters', () => {
    it('should handle equals operator', () => {
      expect(matchesFilters(testDoc, [['status', '=', 'Open']])).toBe(true);
      expect(matchesFilters(testDoc, [['status', '=', 'Closed']])).toBe(false);
    });

    it('should handle not equals operator', () => {
      expect(matchesFilters(testDoc, [['status', '!=', 'Closed']])).toBe(true);
      expect(matchesFilters(testDoc, [['status', '!=', 'Open']])).toBe(false);
    });

    it('should handle greater than operators', () => {
      expect(matchesFilters(testDoc, [['priority', '>', 3]])).toBe(true);
      expect(matchesFilters(testDoc, [['priority', '>', 5]])).toBe(false);
      expect(matchesFilters(testDoc, [['priority', '>=', 5]])).toBe(true);
      expect(matchesFilters(testDoc, [['priority', '>=', 6]])).toBe(false);
    });

    it('should handle less than operators', () => {
      expect(matchesFilters(testDoc, [['priority', '<', 10]])).toBe(true);
      expect(matchesFilters(testDoc, [['priority', '<', 5]])).toBe(false);
      expect(matchesFilters(testDoc, [['priority', '<=', 5]])).toBe(true);
      expect(matchesFilters(testDoc, [['priority', '<=', 4]])).toBe(false);
    });

    it("should handle 'in' operator", () => {
      expect(matchesFilters(testDoc, [['status', 'in', ['Open', 'Closed']]])).toBe(true);
      expect(matchesFilters(testDoc, [['status', 'in', ['Closed', 'Cancelled']]])).toBe(false);
    });

    it("should handle 'not in' operator", () => {
      expect(matchesFilters(testDoc, [['status', 'not in', ['Closed', 'Cancelled']]])).toBe(true);
      expect(matchesFilters(testDoc, [['status', 'not in', ['Open', 'Closed']]])).toBe(false);
    });

    it("should handle 'like' operator", () => {
      expect(matchesFilters(testDoc, [['assignee', 'like', '%john%']])).toBe(true);
      expect(matchesFilters(testDoc, [['assignee', 'like', '%jane%']])).toBe(false);
      expect(matchesFilters(testDoc, [['description', 'like', '%filter%']])).toBe(true);
    });

    it("should handle 'not like' operator", () => {
      expect(matchesFilters(testDoc, [['assignee', 'not like', '%jane%']])).toBe(true);
      expect(matchesFilters(testDoc, [['assignee', 'not like', '%john%']])).toBe(false);
    });

    it("should handle 'between' operator", () => {
      expect(matchesFilters(testDoc, [['priority', 'between', [1, 10]]])).toBe(true);
      expect(matchesFilters(testDoc, [['priority', 'between', [6, 10]]])).toBe(false);
      expect(matchesFilters(testDoc, [['amount', 'between', [500, 1500]]])).toBe(true);
    });

    it('should handle multiple filters (AND logic)', () => {
      expect(
        matchesFilters(testDoc, [
          ['status', '=', 'Open'],
          ['priority', '>', 3],
        ]),
      ).toBe(true);

      expect(
        matchesFilters(testDoc, [
          ['status', '=', 'Open'],
          ['priority', '>', 10],
        ]),
      ).toBe(false);
    });

    it('should handle FilterOperator enum values', () => {
      expect(matchesFilters(testDoc, [['status', FilterOperator.Equals, 'Open']])).toBe(true);
      expect(matchesFilters(testDoc, [['priority', FilterOperator.GreaterThan, 3]])).toBe(true);
      expect(matchesFilters(testDoc, [['assignee', FilterOperator.Like, '%john%']])).toBe(true);
    });

    it("should handle 'is' operator for null/not null", () => {
      const docWithNull = {
        ...testDoc,
        nullField: null,
        notNullField: 'value',
      };

      // The 'is' operator might not be fully implemented for these cases
      // Testing basic behavior
      expect(matchesFilters(docWithNull, [['nullField', 'is', null]])).toBe(true);
      expect(matchesFilters(docWithNull, [['notNullField', 'is', null]])).toBe(false);
    });

    it("should handle 'ancestors of' operator", () => {
      // This operator typically requires backend support
      // Testing basic string matching fallback
      expect(matchesFilters(testDoc, [['parent', 'ancestors of', 'PARENT-001']])).toBe(false); // Falls back to string equality which fails
    });

    it('should return false for unsupported operators', () => {
      expect(matchesFilters(testDoc, [['status', 'unknown-operator' as any, 'Open']])).toBe(false);
    });
  });

  describe('object-style filters', () => {
    it('should handle simple equality filters', () => {
      expect(matchesFilters(testDoc, { status: 'Open' })).toBe(true);
      expect(matchesFilters(testDoc, { status: 'Closed' })).toBe(false);
    });

    it('should handle multiple fields (AND logic)', () => {
      expect(
        matchesFilters(testDoc, {
          status: 'Open',
          priority: 5,
        }),
      ).toBe(true);

      expect(
        matchesFilters(testDoc, {
          status: 'Open',
          priority: 10,
        }),
      ).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty filters', () => {
      expect(matchesFilters(testDoc, [])).toBe(true);
      expect(matchesFilters(testDoc, {})).toBe(true);
      expect(matchesFilters(testDoc, null as any)).toBe(true);
      expect(matchesFilters(testDoc, undefined as any)).toBe(true);
    });

    it('should handle missing fields in document', () => {
      expect(matchesFilters(testDoc, [['nonExistentField', '=', 'value']])).toBe(false);
      expect(matchesFilters(testDoc, [['nonExistentField', '!=', 'value']])).toBe(true);
    });

    it('should handle array fields in documents', () => {
      expect(matchesFilters(testDoc, [['tags', 'in', ['urgent']]])).toBe(false); // Array doesn't match 'in' directly

      // For array contains, would need a specific operator
      const docWithArrayCheck = { ...testDoc, singleTag: 'urgent' };
      expect(matchesFilters(docWithArrayCheck, [['singleTag', 'in', ['urgent', 'low']]])).toBe(true);
    });

    it('should handle case sensitivity', () => {
      // Operators are case-insensitive
      expect(matchesFilters(testDoc, [['status', 'LIKE', '%Open%']])).toBe(true);
      expect(matchesFilters(testDoc, [['priority', 'BETWEEN', [1, 10]]])).toBe(true);

      // Values are case-sensitive
      expect(matchesFilters(testDoc, [['status', '=', 'open']])).toBe(false);
      expect(matchesFilters(testDoc, [['status', '=', 'Open']])).toBe(true);
    });

    it('should handle type coercion in comparisons', () => {
      const docWithStringNumber = { ...testDoc, stringPriority: '5' };

      // String to number comparison
      expect(matchesFilters(docWithStringNumber, [['stringPriority', '>', 3]])).toBe(true);
      expect(matchesFilters(docWithStringNumber, [['stringPriority', '<', 10]])).toBe(true);
    });

    it('should handle date comparisons', () => {
      // Test exact match which should work
      expect(matchesFilters(testDoc, [['created', '=', '2024-01-01']])).toBe(true);
      expect(matchesFilters(testDoc, [['created', '!=', '2024-01-02']])).toBe(true);
    });

    it('should handle complex nested documents', () => {
      const nestedDoc = {
        name: 'NESTED-001',
        doctype: 'NestedDoc',
        data: {
          level1: {
            level2: {
              value: 'deep-value',
            },
          },
        },
      } as any;

      // Nested field access typically requires dotted notation
      // which may not be directly supported
      expect(matchesFilters(nestedDoc, [['data.level1.level2.value', '=', 'deep-value']])).toBe(false); // Dotted paths not supported directly
    });
  });

  describe('performance considerations', () => {
    it('should handle large filter arrays efficiently', () => {
      const largeFilterArray = Array.from({ length: 100 }, (_, i) => ['status', '!=', `status-${i}`]);

      const start = Date.now();
      const result = matchesFilters(testDoc, largeFilterArray as any);
      const duration = Date.now() - start;

      expect(result).toBe(true);
      expect(duration).toBeLessThan(100); // Should complete quickly
    });
  });
});
