/**
 * The doctrine greps (spec 09 §9.2), shipped as spec tests — a rule nobody
 * runs is a wish.
 *
 * DK-2: Desk contains no data wiring. Every byte it displays is fetched by
 * a component it renders or an exported hook.
 * DK-3: Desk contains no visual values — no color literal, no pixel literal.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const DESK_DIR = import.meta.dirname;

const deskSources = (extensions: readonly string[]): { file: string; source: string }[] =>
  readdirSync(DESK_DIR)
    .filter(
      (file) =>
        extensions.some((extension) => file.endsWith(extension)) &&
        !file.includes('.test.') &&
        !file.includes('.stories.'),
    )
    .map((file) => ({ file, source: readFileSync(path.join(DESK_DIR, file), 'utf-8') }));

/** Match lines, reporting file:line so a failure names its violation. */
const violations = (sources: { file: string; source: string }[], pattern: RegExp): string[] => {
  const found: string[] = [];
  for (const { file, source } of sources) {
    for (const [index, line] of source.split('\n').entries()) {
      if (pattern.test(line)) {
        found.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    }
  }
  return found;
};

describe('desk doctrine (spec 09 §9.2)', () => {
  it('DK-2: no data wiring anywhere in src/desk', () => {
    const pattern = /HttpClient|useFrappeCollection|useLiveQuery|\bfetch\(|axios|\/api\/(?:resource|method)/u;
    expect(violations(deskSources(['.ts', '.tsx']), pattern)).toStrictEqual([]);
  });

  it('DK-3: no color or pixel literals anywhere in src/desk', () => {
    const pattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(|\b(?:width|height|padding|margin|fontSize)=\{[0-9]/u;
    expect(violations(deskSources(['.tsx']), pattern)).toStrictEqual([]);
  });
});
