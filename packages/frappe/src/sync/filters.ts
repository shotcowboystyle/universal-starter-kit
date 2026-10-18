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

// oxlint-disable-next-line anti-slop/no-unknown-type-aliases, sonarjs/redundant-type-aliases -- public alias: filter operands are arbitrary wire values (Frappe accepts any JSON)
export type FilterValue = unknown;

export type FilterTuple = [string, FilterOperator | string, FilterValue];

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- public API: `{ field: value }` equality filters over arbitrary wire values
export type FilterObject = Record<string, FilterValue>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- see FilterObject
export type Filters = FilterTuple[] | FilterObject | null | undefined;

const normalizeOperator = (operator: FilterOperator | string): string => operator.toLowerCase();

const isOperator = (operator: string, ...enumValues: FilterOperator[]): boolean =>
  enumValues.some((enumValue) => enumValue.toLowerCase() === operator.toLowerCase());

const isComparable = (value: FilterValue): value is number | string =>
  typeof value === 'number' || typeof value === 'string';

const compareAsNumbers = (a: FilterValue, b: FilterValue, comparison: (a: number, b: number) => boolean): boolean => {
  if (!isComparable(a) || !isComparable(b)) {
    return false;
  }
  const numberA = Number(a);
  const numberB = Number(b);
  if (Number.isNaN(numberA) || Number.isNaN(numberB)) {
    return false;
  }
  return comparison(numberA, numberB);
};

const evaluateLikePattern = (documentValue: FilterValue, pattern: FilterValue): boolean => {
  // oxlint-disable-next-line typescript/no-base-to-string -- LIKE coerces any operand to text, as the server does
  const patternStr = String(pattern ?? '').toLowerCase();
  // oxlint-disable-next-line typescript/no-base-to-string -- LIKE coerces any operand to text, as the server does
  const valueStr = String(documentValue ?? '').toLowerCase();
  if (patternStr.startsWith('%') && patternStr.endsWith('%')) {
    return valueStr.includes(patternStr.slice(1, -1));
  }
  if (patternStr.startsWith('%')) {
    return valueStr.endsWith(patternStr.slice(1));
  }
  if (patternStr.endsWith('%')) {
    return valueStr.startsWith(patternStr.slice(0, -1));
  }
  return valueStr.includes(patternStr);
};

const isOperandList = (value: FilterValue): value is FilterValue[] => Array.isArray(value);

const isNullOperand = (expectedValue: FilterValue): boolean => expectedValue === null || expectedValue === 'null';

const isEqual = (documentValue: FilterValue, expectedValue: FilterValue): boolean => documentValue === expectedValue;
const isNotEqual = (documentValue: FilterValue, expectedValue: FilterValue): boolean => documentValue !== expectedValue;

type ConditionEvaluator = (documentValue: FilterValue, expectedValue: FilterValue) => boolean;

/** Client-side evaluators keyed by lower-cased operator; operators missing here never match. */
const CONDITION_EVALUATORS = new Map<string, ConditionEvaluator>([
  [FilterOperator.Equals, isEqual],
  [FilterOperator.DoubleEquals, isEqual],
  [FilterOperator.NotEquals, isNotEqual],
  [FilterOperator.NotEqualsAngle, isNotEqual],
  [FilterOperator.LessThan, (doc, expected) => compareAsNumbers(doc, expected, (a, b) => a < b)],
  [FilterOperator.LessThanOrEqual, (doc, expected) => compareAsNumbers(doc, expected, (a, b) => a <= b)],
  [FilterOperator.GreaterThan, (doc, expected) => compareAsNumbers(doc, expected, (a, b) => a > b)],
  [FilterOperator.GreaterThanOrEqual, (doc, expected) => compareAsNumbers(doc, expected, (a, b) => a >= b)],
  [FilterOperator.In, (doc, expected) => isOperandList(expected) && expected.includes(doc)],
  [FilterOperator.NotIn, (doc, expected) => !isOperandList(expected) || !expected.includes(doc)],
  [FilterOperator.Like, evaluateLikePattern],
  [FilterOperator.NotLike, (doc, expected) => !evaluateLikePattern(doc, expected)],
  [FilterOperator.Is, (doc, expected) => isNullOperand(expected) && (doc === null || doc === undefined)],
  [FilterOperator.IsNot, (doc, expected) => isNullOperand(expected) && doc !== null && doc !== undefined],
  [
    FilterOperator.Between,
    (doc, expected) => {
      if (!isOperandList(expected) || expected.length !== 2) {
        return false;
      }
      const [min, max] = expected;
      return compareAsNumbers(doc, min, (a, b) => a >= b) && compareAsNumbers(doc, max, (a, b) => a <= b);
    },
  ],
]);

const evaluateFilterCondition = (documentValue: FilterValue, operator: string, expectedValue: FilterValue): boolean =>
  CONDITION_EVALUATORS.get(operator)?.(documentValue, expectedValue) ?? false;

export const matchesFilters = <Data extends FrappeDocData>(doc: FrappeDoc<Data>, filters: Filters): boolean => {
  if (!filters) {
    return true;
  }
  if (Array.isArray(filters)) {
    return filters.every(([fieldName, operatorRaw, expectedValue]) =>
      evaluateFilterCondition(doc?.[fieldName], normalizeOperator(operatorRaw), expectedValue),
    );
  }
  return Object.entries(filters).every(([fieldName, expectedValue]) => doc?.[fieldName] === expectedValue);
};

// this is used to determine if the query can use getDoc instead of getAll
export const extractSingleName = (filters: Filters): string | undefined => {
  if (!filters) {
    return undefined;
  }
  if (Array.isArray(filters)) {
    if (filters.length !== 1) {
      return undefined;
    }
    const [[fieldName, operatorRaw, value]] = filters;
    const normalizedOperator = normalizeOperator(operatorRaw);
    if (fieldName === 'name' && isOperator(normalizedOperator, FilterOperator.Equals, FilterOperator.DoubleEquals)) {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- filter operands are unparsed wire values; only a string is a doc name
      return typeof value === 'string' ? value : undefined;
    }
    return undefined;
  }
  const { name } = filters;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- filter operands are unparsed wire values; only a non-empty string is a doc name
  return typeof name === 'string' && name !== '' ? name : undefined;
};

/**
 * Validation error for filter fields
 */
export interface FilterValidationError {
  field: string;
  message: string;
  // oxlint-disable-next-line sonarjs/max-union-size -- closed set of public error codes
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

interface ValidationSink {
  errors: FilterValidationError[];
  warnings: string[];
  strict: boolean;
}

const reportUnknownField = (fieldName: string, sink: ValidationSink): void => {
  if (sink.strict) {
    sink.errors.push({
      field: fieldName,
      message: `Unknown field "${fieldName}" in doctype schema`,
      code: 'unknown_field',
    });
  } else {
    sink.warnings.push(`Field "${fieldName}" not found in schema - may be a virtual or custom field`);
  }
};

const validateOperandForField = (
  [fieldName, operator, value]: FilterTuple,
  fieldType: string,
  sink: ValidationSink,
): void => {
  // Check if LIKE operator makes sense for field type
  if (isOperator(operator, FilterOperator.Like, FilterOperator.NotLike) && !TEXT_FIELD_TYPES.has(fieldType)) {
    sink.warnings.push(`LIKE operator on non-text field "${fieldName}" (${fieldType}) may not work as expected`);
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
    sink.warnings.push(
      `Comparison operator on non-numeric/date field "${fieldName}" (${fieldType}) may not work as expected`,
    );
  }

  // Validate value types
  if (isOperator(operator, FilterOperator.In, FilterOperator.NotIn) && !Array.isArray(value)) {
    sink.errors.push({
      field: fieldName,
      message: `IN/NOT IN operator requires an array value for field "${fieldName}"`,
      code: 'invalid_value',
    });
  }

  if (isOperator(operator, FilterOperator.Between) && (!Array.isArray(value) || value.length !== 2)) {
    sink.errors.push({
      field: fieldName,
      message: `BETWEEN operator requires an array of exactly 2 values for field "${fieldName}"`,
      code: 'invalid_value',
    });
  }
};

const validateFilterTuple = (
  [fieldName, operatorRaw, value]: FilterTuple,
  fieldMap: ReadonlyMap<string, SchemaField>,
  sink: ValidationSink,
): void => {
  const schemaField = fieldMap.get(fieldName);
  const operator = normalizeOperator(operatorRaw);

  // Check if field exists
  if (!schemaField && !STANDARD_FIELDS.has(fieldName)) {
    reportUnknownField(fieldName, sink);
    return;
  }

  // Validate operator is valid
  if (!VALID_OPERATORS.has(operator)) {
    sink.errors.push({
      field: fieldName,
      message: `Invalid operator "${operatorRaw}" for field "${fieldName}"`,
      code: 'invalid_operator',
    });
    return;
  }

  // Type-specific validations
  if (schemaField) {
    validateOperandForField([fieldName, operator, value], schemaField.fieldtype, sink);
  }
};

/**
 * Validate filter fields against doctype schema
 */
export const validateFilters = (
  filters: Filters,
  schema: SchemaField[],
  options: { strict?: boolean } = {},
): FilterValidationResult => {
  const sink: ValidationSink = { errors: [], warnings: [], strict: options.strict ?? false };

  if (!filters) {
    return { valid: true, errors: sink.errors, warnings: sink.warnings };
  }

  const fieldMap = new Map(schema.map((f) => [f.fieldname, f]));

  if (Array.isArray(filters)) {
    for (const filterTuple of filters) {
      validateFilterTuple(filterTuple, fieldMap, sink);
    }
  } else {
    // Object format - simple equality checks
    for (const fieldName of Object.keys(filters)) {
      if (!fieldMap.has(fieldName) && !STANDARD_FIELDS.has(fieldName)) {
        reportUnknownField(fieldName, sink);
      }
    }
  }

  return {
    valid: sink.errors.length === 0,
    errors: sink.errors,
    warnings: sink.warnings,
  };
};

/**
 * Normalize filters to array format
 */
export const normalizeFilters = (filters: Filters): FilterTuple[] => {
  if (!filters) {
    return [];
  }

  if (Array.isArray(filters)) {
    return filters;
  }

  // Object format -> array of [field, "=", value]
  return Object.entries(filters).map(([field, value]): FilterTuple => [field, FilterOperator.Equals, value]);
};

/**
 * Extract field names from filters for field selection optimization
 */
export const extractFilterFields = (filters: Filters): string[] => {
  if (!filters) {
    return [];
  }

  const normalized = normalizeFilters(filters);
  return [...new Set(normalized.map((c) => c[0]))];
};

/**
 * Build a filter string for display purposes
 */
const formatFilterValue = (value: FilterValue): string => {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (isOperandList(value)) {
    return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- display formatting of an unparsed wire value; strings are quoted
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- display only; non-string scalars stringify as-is
  return String(value);
};

export const formatFilter = (condition: FilterTuple): string => {
  const [field, operator, value] = condition;
  return `${field} ${operator} ${formatFilterValue(value)}`;
};

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
export const hasServerOnlyOperators = (filters: Filters): boolean => {
  if (!filters) {
    return false;
  }

  const normalized = normalizeFilters(filters);
  return normalized.some(([, operator]) => SERVER_ONLY_OPERATORS.has(normalizeOperator(operator)));
};

/**
 * Check if filters can be evaluated client-side.
 * Returns false if filters contain tree operators or other server-only operators.
 */
export const canEvaluateClientSide = (filters: Filters): boolean => !hasServerOnlyOperators(filters);

/**
 * Check if an operator is a tree-related operator.
 * Tree operators are: "ancestors of", "descendants of", "not ancestors of", "not descendants of"
 */
export const isTreeOperator = (operator: FilterOperator | string): boolean =>
  SERVER_ONLY_OPERATORS.has(normalizeOperator(operator));

/**
 * Get human-readable description of why filters can't be evaluated client-side.
 */
export const getClientEvaluationBlockers = (filters: Filters): string[] => {
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
};
