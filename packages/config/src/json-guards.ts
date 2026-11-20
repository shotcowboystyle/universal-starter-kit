/**
 * Narrowing for values read from JSON files. `JSON.parse` gives no static
 * type, so these two guards are the single place such values are inspected;
 * everything downstream works with the narrowed types.
 */

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;
