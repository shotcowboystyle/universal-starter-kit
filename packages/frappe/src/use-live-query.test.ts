import { readFileSync } from 'node:fs';
import path from 'node:path';

import { useLiveQuery as upstreamUseLiveQuery } from '@tanstack/react-db';
import { describe, expect, it } from 'vitest';

import { useLiveQuery } from './use-live-query';

/**
 * MPO-204 / MPO-192. `import.meta` is a PARSE-time SyntaxError in a classic
 * script, and two bundles execute mpo as one: the vxrn/rolldown native bundle
 * for Hermes, and any Metro bundle for platform=web — which is what an Expo
 * DOM component (`'use dom'`) is. A try/catch cannot help, because the file
 * never parses. So the token must be absent from the source, not merely
 * guarded, and that is a property of the FILE, which is what this reads.
 */
describe('useLiveQuery carries no import.meta (MPO-204)', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/use-live-query.ts'), 'utf-8').replaceAll(
    /\/\*[\s\S]*?\*\//gu,
    '',
  );

  it('contains no import.meta token', () => {
    expect(source).not.toMatch(/import\.meta/u);
  });

  it('preserves the upstream hook and its server snapshot lifecycle', () => {
    expect(useLiveQuery).toBe(upstreamUseLiveQuery);
  });

  it('has no platform twin — a .web twin replaced the bake once already (MPO-192)', () => {
    expect(source).toBeTruthy();
    for (const twin of ['use-live-query.web.ts', 'use-live-query.native.ts']) {
      expect(() => readFileSync(path.resolve(process.cwd(), 'src', twin), 'utf-8')).toThrow('ENOENT');
    }
  });
});
