/**
 * The fieldtypes `src/field-registry.ts` registers, read from its source text
 * rather than from the runtime registry, so a registration the runtime would
 * accept but the FrappeFieldType union does not name still shows up.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const registerCallPattern = /registerField\(\s*'(?<fieldtype>[^']+)'/gu;

export const registeredFieldtypesFromSource = (): Set<string> => {
  const source = readFileSync(path.resolve(import.meta.dirname, '../src/field-registry.ts'), 'utf-8');
  return new Set(Array.from(source.matchAll(registerCallPattern), (match) => match.groups?.fieldtype ?? ''));
};
