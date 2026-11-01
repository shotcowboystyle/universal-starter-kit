import { readFileSync } from 'node:fs';
import path from 'node:path';

import { isServer } from '@repo/platform';
import { describe, expect, it } from 'vitest';

/**
 * MPO-204 / MPO-192. `import.meta` is a PARSE-time SyntaxError in a classic
 * script, and two bundles execute mpo as one: the vxrn/rolldown native bundle
 * for Hermes, and any Metro bundle for platform=web — which is what an Expo
 * DOM component (`'use dom'`) is. A try/catch never runs, because the file
 * never parses, so the token has to be ABSENT rather than guarded. Both files
 * below are reachable from a DOM component through the frappe-ui surface.
 */
const src = (name: string) =>
  readFileSync(path.resolve(process.cwd(), 'src', name), 'utf-8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

describe('frappeStoryTarget carries no import.meta (MPO-204)', () => {
  const source = src('frappe-story-target.tsx');

  it('contains no import.meta token', () => {
    expect(source).not.toMatch(/import\.meta/u);
  });

  it('reads both Storybook keys as static process.env member expressions, the only spelling bundlers inline', () => {
    expect(source).toMatch(/process\.env\.STORYBOOK_FRAPPE_LIVE\b/u);
    expect(source).toMatch(/process\.env\.STORYBOOK_FRAPPE_URL\b/u);
    // A computed read is never inlined, so it would always resolve undefined.
    expect(source).not.toMatch(/process\.env\[/u);
  });
});

describe('FrappeImageView carries no import.meta (MPO-204)', () => {
  const source = src('FrappeImageView.tsx');

  it('contains no import.meta token', () => {
    expect(source).not.toMatch(/import\.meta/u);
  });

  it('takes its SSR answer from the platform package, which is split by FILE and not by a bundler define', () => {
    expect(source).toMatch(/import \{ isServer \} from "@multiplatform\.one\/platform";/u);
    expect(source).toMatch(/const IS_SSR: boolean = isServer;/u);
  });

  it('resolves isServer false in a browser-like environment, so the client branch renders', () => {
    expect(isServer).toBe(false);
  });
});
