import type { FrappeDoc, FrappeDocData } from '../common/types';

export enum FilterOperator {
  AncestorsOf = 'ancestors of',
  Between = 'between',
  DescendantsOf = 'descendants of',
  DoubleEquals = '==',
  Equals = '=',
  GreaterThan = '>',
  GreaterThanOrEqual = '>=',
  In = 'in',
  Is = 'is',
  IsNot = 'is not',
  LessThan = '<',
  LessThanOrEqual = '<=',
  Like = 'like',
  NotAncestorsOf = 'not ancestors of',
  NotDescendantsOf = 'not descendants of',
  NotEquals = '!=',
  NotEqualsAngle = '<>',
  NotIn = 'not in',
  NotLike = 'not like',
}

export type FilterValue = boolean | null | number | string | undefined | unknown | unknown[];

export type FilterTuple = [string, FilterOperator | string, unknown];

export type FilterObject = Record<string, unknown>;

export type Filters = FilterTuple[] | FilterObject | null | undefined;

function normalizeOperator(operator: FilterOperator | string): string {
  return String(operator).toLowerCase();
}

export function matchesFilters<Data extends FrappeDocData>(doc: FrappeDoc<Data>, filters: Filters): boolean {
  if (!filters) {
    return true;
  }
  if (Array.isArray(filters)) {
    for (const filterTuple of filters) {
      const [fieldName, operatorRaw, expectedValue] = filterTuple;
      const documentValue = doc?.[fieldName];
      const operator = normalizeOperator(operatorRaw);
      if (!evaluateFilterCondition(documentValue, operator, expectedValue)) {
        return false;
      }
    }
    return true;
  }
  if (typeof filters === 'object') {
    for (const [fieldName, expectedValue] of Object.entries(filters)) {
      if (doc?.[fieldName] !== expectedValue) {
        return false;
      }
    }
    return true;
  }
  return true;
}

function isOperator(operator: string, ...enumValues: FilterOperator[]): boolean {
  return enumValues.some((enumValue) => enumValue.toLowerCase() === operator.toLowerCase());
}

function areComparableValues(a: unknown, b: unknown): boolean {
  return (
    a != null &&
    b != null &&
    (typeof a === 'number' || typeof a === 'string') &&
    (typeof b === 'number' || typeof b === 'string')
  );
}

function compareAsNumbers(a: unknown, b: unknown, comparison: (a: number, b: number) => boolean): boolean {
  if (!areComparableValues(a, b)) {
    return false;
  }
  const numberA = Number(a);
  const numberB = Number(b);
  if (Number.isNaN(numberA) || Number.isNaN(numberB)) {
    return false;
  }
  return comparison(numberA, numberB);
}

function evaluateFilterCondition(documentValue: unknown, operator: string, expectedValue: FilterValue): boolean {
  if (isOperator(operator, FilterOperator.Equals, FilterOperator.DoubleEquals)) {
    return documentValue === expectedValue;
  }
  if (isOperator(operator, FilterOperator.NotEquals, FilterOperator.NotEqualsAngle)) {
    return documentValue !== expectedValue;
  }
  if (isOperator(operator, FilterOperator.LessThan)) {
    return compareAsNumbers(documentValue, expectedValue, (a, b) => a < b);
  }
  if (isOperator(operator, FilterOperator.LessThanOrEqual)) {
    return compareAsNumbers(documentValue, expectedValue, (a, b) => a <= b);
  }
  if (isOperator(operator, FilterOperator.GreaterThan)) {
    return compareAsNumbers(documentValue, expectedValue, (a, b) => a > b);
  }
  if (isOperator(operator, FilterOperator.GreaterThanOrEqual)) {
    return compareAsNumbers(documentValue, expectedValue, (a, b) => a >= b);
  }
  if (isOperator(operator, FilterOperator.In)) {
    return Array.isArray(expectedValue) && expectedValue.includes(documentValue);
  }
  if (isOperator(operator, FilterOperator.NotIn)) {
    return !Array.isArray(expectedValue) || !expectedValue.includes(documentValue);
  }
  if (isOperator(operator, FilterOperator.Like)) {
    return evaluateLikePattern(documentValue, expectedValue, false);
  }
  if (isOperator(operator, FilterOperator.NotLike)) {
    return !evaluateLikePattern(documentValue, expectedValue, false);
  }
  if (isOperator(operator, FilterOperator.Is) && (expectedValue === null || expectedValue === 'null')) {
    return documentValue === null || documentValue === undefined;
  }
  if (isOperator(operator, FilterOperator.IsNot) && (expectedValue === null || expectedValue === 'null')) {
    return documentValue !== null && documentValue !== undefined;
  }
  if (isOperator(operator, FilterOperator.Between) && Array.isArray(expectedValue) && expectedValue.length === 2) {
    const [min, max] = expectedValue;
    return (
      compareAsNumbers(documentValue, min, (a, b) => a >= b) && compareAsNumbers(documentValue, max, (a, b) => a <= b)
    );
  }
  return false;
}

function evaluateLikePattern(documentValue: unknown, pattern: FilterValue, negate: boolean): boolean {
  const patternStr = String(pattern ?? '').toLowerCase();
  const valueStr = String(documentValue ?? '').toLowerCase();
  let matches = false;
  if (patternStr.startsWith('%') && patternStr.endsWith('%')) {
    matches = valueStr.includes(patternStr.slice(1, -1));
  } else if (patternStr.startsWith('%')) {
    matches = valueStr.endsWith(patternStr.slice(1));
  } else if (patternStr.endsWith('%')) {
    matches = valueStr.startsWith(patternStr.slice(0, -1));
  } else {
    matches = valueStr.includes(patternStr);
  }
  return negate ? !matches : matches;
}

// this is used to determine if the query can use getDoc instead of getAll
export function extractSingleName(filters: Filters): string | undefined {
  if (!filters) {
    return undefined;
  }
  if (Array.isArray(filters)) {
    if (filters.length === 1) {
      const [fieldName, operatorRaw, value] = filters[0];
      const normalizedOperator = normalizeOperator(operatorRaw);
      if (fieldName === 'name' && isOperator(normalizedOperator, FilterOperator.Equals, FilterOperator.DoubleEquals)) {
        return typeof value === 'string' ? value : undefined;
      }
    }
    return;
  }
  if (typeof filters === 'object' && filters.name && typeof filters.name === 'string') {
    return filters.name;
  }
}

/**
 * Validation error for filter fields
 */
export interface FilterValidationError {
  field: string;
  message: string;
  code: 'unknown_field' | 'invalid_operator' | 'type_mismatch' | 'invalid_value';
}

/**
 * Validation result
 */
export interface FilterValidationResult {
  valid: boolean;
  errors: FilterValidationError[];
  warnings: string[];
}

/**
 * Schema field type (minimal interface for validation)
 */
interface SchemaField {
  fieldname: string;
  fieldtype: string;
}

// Standard fields always available on all doctypes
const STANDARD_FIELDS = new Set([
  'name',
  'creation',
  'modified',
  'modified_by',
  'owner',
  'docstatus',
  'idx',
  'doctype',
  '_user_tags',
  '_comments',
  '_assign',
  '_liked_by',
]);

// Text-like field types that support LIKE operator
const TEXT_FIELD_TYPES = new Set([
  'Data',
  'Text',
  'Small Text',
  'Long Text',
  'Link',
  'Select',
  'Dynamic Link',
  'Text Editor',
  'Code',
  'HTML Editor',
  'Markdown Editor',
  'Password',
  'Read Only',
]);

// Numeric/date field types that support comparison operators
const COMPARABLE_FIELD_TYPES = new Set([
  'Int',
  'Float',
  'Currency',
  'Percent',
  'Date',
  'Datetime',
  'Time',
  'Duration',
  'Rating',
]);

// Valid filter operators
const VALID_OPERATORS = new Set(Object.values(FilterOperator).map((v) => v.toLowerCase()));

/**
 * Validate filter fields against doctype schema
 */
export function validateFilters(
  filters: Filters,
  schema: SchemaField[],
  options: { strict?: boolean } = {},
): FilterValidationResult {
  const errors: FilterValidationError[] = [];
  const warnings: string[] = [];
  const { strict = false } = options;

  if (!filters) {
    return { valid: true, errors, warnings };
  }

  const fieldMap = new Map(schema.map((f) => [f.fieldname, f]));

  if (Array.isArray(filters)) {
    for (const filterTuple of filters) {
      const [fieldName, operatorRaw, value] = filterTuple;
      const schemaField = fieldMap.get(fieldName);
      const operator = normalizeOperator(operatorRaw);

      // Check if field exists
      if (!schemaField && !STANDARD_FIELDS.has(fieldName)) {
        if (strict) {
          errors.push({
            field: fieldName,
            message: `Unknown field "${fieldName}" in doctype schema`,
            code: 'unknown_field',
          });
        } else {
          warnings.push(`Field "${fieldName}" not found in schema - may be a virtual or custom field`);
        }
        continue;
      }

      // Validate operator is valid
      if (!VALID_OPERATORS.has(operator)) {
        errors.push({
          field: fieldName,
          message: `Invalid operator "${operatorRaw}" for field "${fieldName}"`,
          code: 'invalid_operator',
        });
        continue;
      }

      // Type-specific validations
      if (schemaField) {
        const fieldType = schemaField.fieldtype;

        // Check if LIKE operator makes sense for field type
        if (isOperator(operator, FilterOperator.Like, FilterOperator.NotLike) && !TEXT_FIELD_TYPES.has(fieldType)) {
          warnings.push(`LIKE operator on non-text field "${fieldName}" (${fieldType}) may not work as expected`);
        }

        // Check if comparison operators make sense for field type
        if (
          isOperator(
            operator,
            FilterOperator.GreaterThan,
            FilterOperator.LessThan,
            FilterOperator.GreaterThanOrEqual,
            FilterOperator.LessThanOrEqual,
            FilterOperator.Between,
          ) &&
          !COMPARABLE_FIELD_TYPES.has(fieldType)
        ) {
          warnings.push(
            `Comparison operator on non-numeric/date field "${fieldName}" (${fieldType}) may not work as expected`,
          );
        }

        // Validate value types
        if (isOperator(operator, FilterOperator.In, FilterOperator.NotIn) && !Array.isArray(value)) {
          errors.push({
            field: fieldName,
            message: `IN/NOT IN operator requires an array value for field "${fieldName}"`,
            code: 'invalid_value',
          });
        }

        if (isOperator(operator, FilterOperator.Between)) {
          if (!Array.isArray(value) || value.length !== 2) {
            errors.push({
              field: fieldName,
              message: `BETWEEN operator requires an array of exactly 2 values for field "${fieldName}"`,
              code: 'invalid_value',
            });
          }
        }
      }
    }
  } else if (typeof filters === 'object') {
    // Object format - simple equality checks
    for (const fieldName of Object.keys(filters)) {
      const schemaField = fieldMap.get(fieldName);
      if (!schemaField && !STANDARD_FIELDS.has(fieldName)) {
        if (strict) {
          errors.push({
            field: fieldName,
            message: `Unknown field "${fieldName}" in doctype schema`,
            code: 'unknown_field',
          });
        } else {
          warnings.push(`Field "${fieldName}" not found in schema - may be a virtual or custom field`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Normalize filters to array format
 */
export function normalizeFilters(filters: Filters): FilterTuple[] {
  if (!filters) {
    return [];
  }

  if (Array.isArray(filters)) {
    return filters as FilterTuple[];
  }

  // Object format -> array of [field, "=", value]
  return Object.entries(filters).map(([field, value]) => [field, FilterOperator.Equals, value] as FilterTuple);
}

/**
 * Extract field names from filters for field selection optimization
 */
export function extractFilterFields(filters: Filters): string[] {
  if (!filters) {
    return [];
  }

  const normalized = normalizeFilters(filters);
  return [...new Set(normalized.map((c) => c[0]))];
}

/**
 * Build a filter string for display purposes
 */
export function formatFilter(condition: FilterTuple): string {
  const [field, operator, value] = condition;

  let displayValue: string;
  if (value === null || value === undefined) {
    displayValue = 'null';
  } else if (Array.isArray(value)) {
    displayValue = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
  } else if (typeof value === 'string') {
    displayValue = JSON.stringify(value);
  } else {
    displayValue = String(value);
  }

  return `${field} ${operator} ${displayValue}`;
}

// ---------------------------------------------------------------------------
// Tree Operator Support
// ---------------------------------------------------------------------------

/**
 * Operators that can only be evaluated server-side.
 * These operators require database traversal and cannot be evaluated client-side.
 */
const SERVER_ONLY_OPERATORS = new Set([
  FilterOperator.AncestorsOf.toLowerCase(),
  FilterOperator.DescendantsOf.toLowerCase(),
  FilterOperator.NotAncestorsOf.toLowerCase(),
  FilterOperator.NotDescendantsOf.toLowerCase(),
]);

/**
 * Check if filters contain any server-only operators (like tree operators).
 * Use this to determine if client-side filtering can be used.
 *
 * @example
 * ```ts
 * if (hasServerOnlyOperators(filters)) {
 *   // Cannot evaluate client-side, must fetch from server
 *   return await db.getDocList(doctype, { filters });
 * } else {
 *   // Can filter client-side with matchesFilters
 *   return docs.filter(doc => matchesFilters(doc, filters));
 * }
 * ```
 */
export function hasServerOnlyOperators(filters: Filters): boolean {
  if (!filters) {
    return false;
  }

  const normalized = normalizeFilters(filters);
  return normalized.some(([, operator]) => SERVER_ONLY_OPERATORS.has(normalizeOperator(operator)));
}

/**
 * Check if filters can be evaluated client-side.
 * Returns false if filters contain tree operators or other server-only operators.
 */
export function canEvaluateClientSide(filters: Filters): boolean {
  return !hasServerOnlyOperators(filters);
}

/**
 * Check if an operator is a tree-related operator.
 * Tree operators are: "ancestors of", "descendants of", "not ancestors of", "not descendants of"
 */
export function isTreeOperator(operator: FilterOperator | string): boolean {
  return SERVER_ONLY_OPERATORS.has(normalizeOperator(operator));
}

/**
 * Get human-readable description of why filters can't be evaluated client-side.
 */
export function getClientEvaluationBlockers(filters: Filters): string[] {
  if (!filters) {
    return [];
  }

  const blockers: string[] = [];
  const normalized = normalizeFilters(filters);

  for (const [field, operator] of normalized) {
    const normalizedOp = normalizeOperator(operator);
    if (SERVER_ONLY_OPERATORS.has(normalizedOp)) {
      blockers.push(`Field "${field}" uses tree operator "${operator}" which requires server-side evaluation`);
    }
  }

  return blockers;
}
