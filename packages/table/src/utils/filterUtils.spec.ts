import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FilterValue, TableFilter } from '../types';

import { applyFilterToValue, deserializeFilters, generateFilterId, serializeFilters } from './filterUtils';

describe('filterUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe(generateFilterId, () => {
    it('should generate unique filter IDs', () => {
      const id1 = generateFilterId();
      const id2 = generateFilterId();

      expect(id1).toMatch(/^filter-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^filter-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it("should start with 'filter-'", () => {
      const id = generateFilterId();
      expect(id).toMatch(/^filter-/);
    });
  });

  describe(serializeFilters, () => {
    it('should serialize empty filter array', () => {
      const result = serializeFilters([]);
      expect(result).toBe('[]');
    });

    it('should serialize single filter', () => {
      const filters: TableFilter[] = [
        {
          id: 'filter-1',
          columnId: 'name',
          value: { operator: 'contains', value: 'test' },
        },
      ];
      const result = serializeFilters(filters);
      expect(result).toContain('filter-1');
      expect(result).toContain('name');
      expect(result).toContain('contains');
      expect(result).toContain('test');
    });

    it('should serialize multiple filters', () => {
      const filters: TableFilter[] = [
        {
          id: 'filter-1',
          columnId: 'name',
          value: { operator: 'contains', value: 'test' },
        },
        {
          id: 'filter-2',
          columnId: 'age',
          value: { operator: 'isGreaterThan', value: 18 },
        },
      ];
      const result = serializeFilters(filters);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
    });

    it('should handle serialization errors gracefully', () => {
      const circularRef: any = { a: 1 };
      circularRef.self = circularRef;

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = serializeFilters([circularRef]);
      expect(result).toBe('[]');
      expect(consoleSpy).toHaveBeenCalledWith();
      consoleSpy.mockRestore();
    });
  });

  describe(deserializeFilters, () => {
    it('should deserialize empty array string', () => {
      const result = deserializeFilters('[]');
      expect(result).toEqual([]);
    });

    it('should deserialize single filter', () => {
      const filterString = JSON.stringify([
        {
          id: 'filter-1',
          columnId: 'name',
          value: { operator: 'contains', value: 'test' },
        },
      ]);
      const result = deserializeFilters(filterString);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('filter-1');
      expect(result[0].columnId).toBe('name');
    });

    it('should handle invalid JSON', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = deserializeFilters('invalid json');
      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith();
      consoleSpy.mockRestore();
    });

    it('should handle non-array JSON', () => {
      const result = deserializeFilters('{"key":"value"}');
      expect(result).toEqual([]);
    });
  });

  describe(applyFilterToValue, () => {
    describe('text filters', () => {
      it("should apply 'contains' operator", () => {
        const filterValue: FilterValue = {
          operator: 'contains',
          value: 'test',
        };
        expect(applyFilterToValue('this is a test', filterValue)).toBe(true);
        expect(applyFilterToValue('no match', filterValue)).toBe(false);
        expect(applyFilterToValue('TEST uppercase', filterValue)).toBe(true);
      });

      it("should apply 'doesNotContain' operator", () => {
        const filterValue: FilterValue = {
          operator: 'doesNotContain',
          value: 'test',
        };
        expect(applyFilterToValue('no match', filterValue)).toBe(true);
        expect(applyFilterToValue('this is a test', filterValue)).toBe(false);
      });

      it("should apply 'startsWith' operator", () => {
        const filterValue: FilterValue = {
          operator: 'startsWith',
          value: 'hello',
        };
        expect(applyFilterToValue('hello world', filterValue)).toBe(true);
        expect(applyFilterToValue('world hello', filterValue)).toBe(false);
        expect(applyFilterToValue('HELLO WORLD', filterValue)).toBe(true);
      });

      it("should apply 'endsWith' operator", () => {
        const filterValue: FilterValue = {
          operator: 'endsWith',
          value: 'world',
        };
        expect(applyFilterToValue('hello world', filterValue)).toBe(true);
        expect(applyFilterToValue('world hello', filterValue)).toBe(false);
      });

      it("should apply 'isEmpty' operator", () => {
        const filterValue: FilterValue = { operator: 'isEmpty', value: '' };
        expect(applyFilterToValue('', filterValue)).toBe(true);
        expect(applyFilterToValue(null, filterValue)).toBe(true);
        expect(applyFilterToValue(undefined, filterValue)).toBe(true);
        expect(applyFilterToValue('text', filterValue)).toBe(false);
      });

      it("should apply 'isNotEmpty' operator", () => {
        const filterValue: FilterValue = { operator: 'isNotEmpty', value: '' };
        expect(applyFilterToValue('text', filterValue)).toBe(true);
        expect(applyFilterToValue('', filterValue)).toBe(false);
        expect(applyFilterToValue(null, filterValue)).toBe(false);
      });
    });

    describe('equality operators', () => {
      it("should apply 'is' operator for text", () => {
        const filterValue: FilterValue = { operator: 'is', value: 'test' };
        expect(applyFilterToValue('test', filterValue, 'text')).toBe(true);
        expect(applyFilterToValue('TEST', filterValue, 'text')).toBe(true);
        expect(applyFilterToValue('other', filterValue, 'text')).toBe(false);
      });

      it("should apply 'is' operator for numbers", () => {
        const filterValue: FilterValue = { operator: 'is', value: 42 };
        expect(applyFilterToValue(42, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue('42', filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(43, filterValue, 'number')).toBe(false);
      });

      it("should apply 'is' operator for boolean", () => {
        const filterValue: FilterValue = { operator: 'is', value: true };
        expect(applyFilterToValue(true, filterValue, 'boolean')).toBe(true);
        expect(applyFilterToValue(false, filterValue, 'boolean')).toBe(false);
      });

      it("should apply 'isNot' operator for text", () => {
        const filterValue: FilterValue = { operator: 'isNot', value: 'test' };
        expect(applyFilterToValue('other', filterValue, 'text')).toBe(true);
        expect(applyFilterToValue('test', filterValue, 'text')).toBe(false);
      });

      it("should apply 'isNot' operator for numbers", () => {
        const filterValue: FilterValue = { operator: 'isNot', value: 42 };
        expect(applyFilterToValue(43, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(42, filterValue, 'number')).toBe(false);
      });
    });

    describe('null/undefined handling', () => {
      it('should handle null values', () => {
        const containsFilter: FilterValue = {
          operator: 'contains',
          value: 'test',
        };
        expect(applyFilterToValue(null, containsFilter)).toBe(false);

        const emptyFilter: FilterValue = { operator: 'isEmpty', value: '' };
        expect(applyFilterToValue(null, emptyFilter)).toBe(true);
      });

      it('should handle undefined values', () => {
        const containsFilter: FilterValue = {
          operator: 'contains',
          value: 'test',
        };
        expect(applyFilterToValue(undefined, containsFilter)).toBe(false);

        const emptyFilter: FilterValue = { operator: 'isEmpty', value: '' };
        expect(applyFilterToValue(undefined, emptyFilter)).toBe(true);
      });
    });

    describe('number filters', () => {
      it("should apply 'isLessThan' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isLessThan',
          value: 100,
        };
        expect(applyFilterToValue(50, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(100, filterValue, 'number')).toBe(false);
        expect(applyFilterToValue(150, filterValue, 'number')).toBe(false);
      });

      it("should apply 'isGreaterThan' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isGreaterThan',
          value: 100,
        };
        expect(applyFilterToValue(150, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(100, filterValue, 'number')).toBe(false);
        expect(applyFilterToValue(50, filterValue, 'number')).toBe(false);
      });

      it("should apply 'isLessThanOrEqual' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isLessThanOrEqual',
          value: 100,
        };
        expect(applyFilterToValue(50, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(100, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(150, filterValue, 'number')).toBe(false);
      });

      it("should apply 'isGreaterThanOrEqual' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isGreaterThanOrEqual',
          value: 100,
        };
        expect(applyFilterToValue(150, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(100, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(50, filterValue, 'number')).toBe(false);
      });

      it("should apply 'isBetween' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isBetween',
          value: 50,
          values: [50, 150],
        };
        expect(applyFilterToValue(100, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(50, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(150, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(25, filterValue, 'number')).toBe(false);
        expect(applyFilterToValue(200, filterValue, 'number')).toBe(false);
      });

      it("should apply 'isNotBetween' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isNotBetween',
          value: 50,
          values: [50, 150],
        };
        expect(applyFilterToValue(25, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(200, filterValue, 'number')).toBe(true);
        expect(applyFilterToValue(100, filterValue, 'number')).toBe(false);
      });
    });

    describe('date filters', () => {
      const testDate = new Date('2024-06-15').getTime();
      const earlierDate = new Date('2024-01-01').getTime();
      const laterDate = new Date('2024-12-31').getTime();

      it("should apply 'isBefore' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isBefore',
          value: testDate,
        };
        expect(applyFilterToValue(earlierDate, filterValue, 'date')).toBe(true);
        expect(applyFilterToValue(laterDate, filterValue, 'date')).toBe(false);
      });

      it("should apply 'isAfter' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isAfter',
          value: testDate,
        };
        expect(applyFilterToValue(laterDate, filterValue, 'date')).toBe(true);
        expect(applyFilterToValue(earlierDate, filterValue, 'date')).toBe(false);
      });

      it("should apply 'isOnOrBefore' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isOnOrBefore',
          value: testDate,
        };
        expect(applyFilterToValue(earlierDate, filterValue, 'date')).toBe(true);
        expect(applyFilterToValue(testDate, filterValue, 'date')).toBe(true);
        expect(applyFilterToValue(laterDate, filterValue, 'date')).toBe(false);
      });

      it("should apply 'isOnOrAfter' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isOnOrAfter',
          value: testDate,
        };
        expect(applyFilterToValue(laterDate, filterValue, 'date')).toBe(true);
        expect(applyFilterToValue(testDate, filterValue, 'date')).toBe(true);
        expect(applyFilterToValue(earlierDate, filterValue, 'date')).toBe(false);
      });
    });

    describe('option filters', () => {
      it("should apply 'isAnyOf' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isAnyOf',
          value: '',
          values: ['red', 'blue', 'green'],
        };
        expect(applyFilterToValue('red', filterValue)).toBe(true);
        expect(applyFilterToValue('blue', filterValue)).toBe(true);
        expect(applyFilterToValue('yellow', filterValue)).toBe(false);
      });

      it("should apply 'isNoneOf' operator", () => {
        const filterValue: FilterValue = {
          operator: 'isNoneOf',
          value: '',
          values: ['red', 'blue', 'green'],
        };
        expect(applyFilterToValue('yellow', filterValue)).toBe(true);
        expect(applyFilterToValue('red', filterValue)).toBe(false);
      });
    });
  });
});
