import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { availablePieces, scaffoldPieces } from './pieces';

describe('pieces scaffold', () => {
  let sandbox: string;

  beforeAll(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'mpo-pieces-spec-'));
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('ships exactly the supported pieces', () => {
    expect(availablePieces()).toStrictEqual(['keycloak', 'tauri', 'webext']);
  });

  it.each(['frappe', 'frappe-bench', 'gnome', 'vscode'])('rejects the removed %s piece', (piece) => {
    expect(() => {
      // SAFETY: deliberately passing a piece name the type no longer allows
      scaffoldPieces(path.join(sandbox, piece), { name: 'shop', mpoVersion: '^7.0.0', pieces: [piece as never] });
    }).toThrow(`Unknown piece "${piece}"`);
  });

  it('keycloak writes an app.ts with only the keycloak provider', () => {
    const dir = path.join(sandbox, 'keycloak');
    scaffoldPieces(dir, { name: 'shop', mpoVersion: '^7.0.0', pieces: ['keycloak'] });

    const appTs = readFileSync(path.join(dir, 'apps/shop/src/app.ts'), 'utf-8');
    expect(appTs).toContain('keycloak: { baseUrl: config.get("KEYCLOAK_BASE_URL") }');
    expect(appTs).not.toContain('frappe');
  });
});
