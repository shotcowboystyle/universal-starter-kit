import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    expect(availablePieces()).toStrictEqual(['frappe-bench', 'keycloak', 'tauri', 'webext']);
  });

  it.each(['frappe', 'gnome', 'vscode'])('rejects the removed %s piece', (piece) => {
    expect(() => {
      // SAFETY: deliberately passing a piece name the type no longer allows
      scaffoldPieces(path.join(sandbox, piece), { name: 'shop', mpoVersion: '^7.0.0', pieces: [piece as never] });
    }).toThrow(`Unknown piece "${piece}"`);
  });

  it('frappe-bench alone ships the compose bench and its README, but no app.ts', () => {
    const dir = path.join(sandbox, 'bench');
    scaffoldPieces(dir, { name: 'shop', mpoVersion: '^7.0.0', pieces: ['frappe-bench'] });

    expect(existsSync(path.join(dir, 'docker/compose.frappe.yaml'))).toBe(true);
    expect(readFileSync(path.join(dir, 'README.md'), 'utf-8')).toContain(
      'docker compose -f docker/compose.frappe.yaml up -d',
    );
    expect(existsSync(path.join(dir, 'apps/shop/src/app.ts'))).toBe(false);
  });

  it('keycloak writes an app.ts with only the keycloak provider', () => {
    const dir = path.join(sandbox, 'keycloak');
    scaffoldPieces(dir, { name: 'shop', mpoVersion: '^7.0.0', pieces: ['keycloak'] });

    const appTs = readFileSync(path.join(dir, 'apps/shop/src/app.ts'), 'utf-8');
    expect(appTs).toContain('keycloak: { baseUrl: config.get("KEYCLOAK_BASE_URL") }');
    expect(appTs).not.toContain('frappe');
  });
});
