import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { piecesRoot, scaffoldPieces, withSplitPieces } from './pieces';

describe('the frappe client and bench pieces (MPO-241)', () => {
  let sandbox: string;

  beforeAll(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'mpo-pieces-spec-'));
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('frappe alone is the client: env keys and provider, and nothing names a bench', () => {
    const dir = path.join(sandbox, 'client');
    scaffoldPieces(dir, { name: 'shop', mpoVersion: '^7.0.0', pieces: ['frappe'] });

    expect(existsSync(path.join(dir, 'docker'))).toBe(false);
    const env = readFileSync(path.join(dir, '.env.example'), 'utf-8');
    expect(env).toContain('FRAPPE_ENABLED=1');
    expect(env).toContain('FRAPPE_URL=http://localhost:8000');
    const appTs = readFileSync(path.join(dir, 'apps/shop/src/app.ts'), 'utf-8');
    expect(appTs).toContain('frappe: { baseURL: config.get("FRAPPE_URL") }');
    const readme = readFileSync(path.join(dir, 'README.md'), 'utf-8');
    expect(readme).toContain('no server');
    for (const text of [env, appTs, readme]) {
      expect(text).not.toMatch(/compose|bench (?:init|start)|a dev bench/u);
    }
  });

  it('frappe-bench adds the compose bench, its README section and the app.ts note', () => {
    const dir = path.join(sandbox, 'bench');
    scaffoldPieces(dir, { name: 'shop', mpoVersion: '^7.0.0', pieces: ['frappe', 'frappe-bench'] });

    expect(existsSync(path.join(dir, 'docker/compose.frappe.yaml'))).toBe(true);
    expect(readFileSync(path.join(dir, 'README.md'), 'utf-8')).toContain(
      'docker compose -f docker/compose.frappe.yaml up -d',
    );
    expect(readFileSync(path.join(dir, 'apps/shop/src/app.ts'), 'utf-8')).toContain(
      'docker/compose.frappe.yaml runs a dev bench',
    );
  });

  it('an adoption recorded when frappe carried the bench keeps it, as frappe-bench', () => {
    const recorded = path.join(sandbox, 'recorded-pieces');
    mkdirSync(path.join(recorded, 'frappe/universal/docker'), { recursive: true });
    writeFileSync(path.join(recorded, 'frappe/universal/docker/compose.frappe.yaml'), 'services: {}\n');

    expect(withSplitPieces(['frappe', 'webext'], recorded)).toStrictEqual(['frappe', 'frappe-bench', 'webext']);
    expect(withSplitPieces(['frappe'], piecesRoot())).toStrictEqual(['frappe']);
    expect(withSplitPieces(['frappe'])).toStrictEqual(['frappe']);
    expect(withSplitPieces(['webext'], recorded)).toStrictEqual(['webext']);
  });
});
