import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mpoRange, readProvenance, writeProvenance } from './provenance';

describe('provenance', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mpo-provenance-spec-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips the clone-derived record', () => {
    writeProvenance(dir, {
      cliVersion: '7.11.0',
      source: { sha: 'a'.repeat(40), url: 'https://example.com/mpo.git' },
      apps: ['shop', 'admin'],
      services: ['keycloak', 'ethereum'],
      pieces: [],
    });
    expect(JSON.parse(readFileSync(path.join(dir, '.mpo.json'), 'utf-8'))).toStrictEqual({
      cliVersion: '7.11.0',
      source: { sha: 'a'.repeat(40), url: 'https://example.com/mpo.git' },
      apps: ['shop', 'admin'],
      services: ['ethereum', 'keycloak'],
      pieces: [],
    });
    expect(readProvenance(dir)).toStrictEqual({
      cliVersion: '7.11.0',
      source: { sha: 'a'.repeat(40), url: 'https://example.com/mpo.git' },
      apps: ['shop', 'admin'],
      services: ['ethereum', 'keycloak'],
      pieces: [],
    });
  });

  it('reads the template-era {template, name} record as one product app with no base', () => {
    writeFileSync(
      path.join(dir, '.mpo.json'),
      JSON.stringify({ template: 'universal', cliVersion: '7.7.1', name: 'wealthflow' }),
    );
    expect(readProvenance(dir)).toStrictEqual({
      cliVersion: '7.7.1',
      apps: ['wealthflow'],
      services: [],
      pieces: [],
      template: 'universal',
      name: 'wealthflow',
      mpoVersion: '^7.7.1',
    });
  });

  it('reads an adopted record with its pieces sorted and the reconciled flag', () => {
    writeFileSync(
      path.join(dir, '.mpo.json'),
      JSON.stringify({
        template: 'none',
        cliVersion: '7.9.0',
        name: 'easel',
        mpoVersion: '^7.9.0',
        pieces: ['webext', 'tauri'],
        reconciled: false,
      }),
    );
    expect(readProvenance(dir)).toStrictEqual({
      cliVersion: '7.9.0',
      apps: [],
      services: [],
      pieces: ['tauri', 'webext'],
      template: 'none',
      name: 'easel',
      mpoVersion: '^7.9.0',
      reconciled: false,
    });
  });

  it('returns undefined for records it cannot use', () => {
    writeFileSync(path.join(dir, '.mpo.json'), JSON.stringify({ template: 'universal' }));
    expect(readProvenance(dir)).toBeUndefined();
    writeFileSync(path.join(dir, '.mpo.json'), 'not json');
    expect(readProvenance(dir)).toBeUndefined();
  });

  it('mpoRange carets a bare version and passes ranges through', () => {
    expect(mpoRange('7.11.0')).toBe('^7.11.0');
    expect(mpoRange('~7.11.0')).toBe('~7.11.0');
    expect(mpoRange(undefined, '7.11.0')).toBe('^7.11.0');
  });
});
