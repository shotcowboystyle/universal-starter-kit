/**
 * Runtime narrowing for values whose type is only known at run time: token
 * tables, style props and loosely typed adapter input. Branch on these rather
 * than inlining `typeof` checks.
 */

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isNumber = (value: unknown): value is number => typeof value === 'number';

export const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;
