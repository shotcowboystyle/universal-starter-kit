import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InitAppPiece } from './pieces';

export const PROVENANCE_FILE = '.mpo.json';

/**
 * What `mpo update` needs to rebuild the merge base of a project.
 *
 * A project from `mpo init` records the monorepo commit it was pruned from
 * and the selection made at that time; the scaffold at that commit with
 * that selection IS the merge base. An adopted project (`mpo adopt`,
 * template "none") records only the pieces it hand-copied. A project from
 * the retired template scaffolder (template "universal" / "app") has no
 * reproducible base left; its next update reconciles from an empty tree.
 */
export interface MpoProvenance {
  cliVersion: string;
  /** The monorepo commit the project was scaffolded from. */
  source?: { sha: string; url?: string };
  /** Product apps derived from apps/one. */
  apps: string[];
  /** Singleton apps kept under apps/ (frappe, keycloak, storybook, ...). */
  services: string[];
  /** Pieces overlaid for adopted projects (sorted). */
  pieces: InitAppPiece[];
  /** "none" = adopted; "universal" / "app" = template-era. Absent on clone-derived projects. */
  template?: 'none' | 'universal' | 'app';
  /** Adopted and template-era projects: the name that renders piece paths (apps/<name>/...). */
  name?: string;
  mpoVersion?: string;
  /**
   * false = adopted but never reconciled: `mpo adopt` wrote provenance
   * without touching a project file, so the first update merges the piece
   * baseline from an EMPTY base and then clears the flag.
   */
  reconciled?: boolean;
}

export function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Project name is required');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(trimmed)) {
    throw new Error(`Invalid project name "${trimmed}". Use lowercase letters, numbers, and hyphens (e.g. my-app).`);
  }
  return trimmed;
}

/** Root package.json name with any @scope/ prefix stripped (adopt derives the project name from it). */
export function packageJsonName(projectDir: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8')) as {
      name?: string;
    };
    return pkg.name?.replace(/^@[^/]+\//u, '');
  } catch {
    return undefined;
  }
}

export function cliRoot(): string {
  return resolve(import.meta.dirname, '../..');
}

export function cliVersion(): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(cliRoot(), 'package.json'), 'utf-8')) as {
      version?: string;
    };
    return pkg.version;
  } catch {
    return undefined;
  }
}

/** `^x.y.z` for a bare version; explicit ranges pass through. */
export function mpoRange(explicit: string | undefined, fallbackVersion = cliVersion()): string {
  if (explicit) {
    return explicit.startsWith('^') || explicit.startsWith('~') || explicit === '*' ? explicit : `^${explicit}`;
  }
  return fallbackVersion ? `^${fallbackVersion}` : '^0.0.0';
}

export function writeProvenance(targetDir: string, provenance: MpoProvenance): void {
  const pieces = [...provenance.pieces].sort();
  const record: Record<string, unknown> = provenance.source
    ? {
        cliVersion: provenance.cliVersion,
        source: provenance.source,
        apps: provenance.apps,
        services: [...provenance.services].sort(),
        pieces,
      }
    : {
        template: provenance.template ?? 'none',
        cliVersion: provenance.cliVersion,
        name: provenance.name,
        mpoVersion: provenance.mpoVersion ?? `^${provenance.cliVersion}`,
        pieces,
        ...(provenance.reconciled === false ? { reconciled: false } : {}),
      };
  writeFileSync(join(targetDir, PROVENANCE_FILE), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Reads both shapes: the clone-derived record ({cliVersion, source, apps,
 * services, pieces}) and the older {template, name} record written by
 * `mpo adopt` and the retired template scaffolder.
 */
export function readProvenance(projectDir: string): MpoProvenance | undefined {
  const file = join(projectDir, PROVENANCE_FILE);
  if (!existsSync(file)) {
    return undefined;
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (typeof raw.cliVersion !== 'string') {
    return undefined;
  }
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const pieces = strings(raw.pieces).sort() as InitAppPiece[];
  const source = raw.source as { sha?: unknown; url?: unknown } | undefined;
  if (source && typeof source.sha === 'string') {
    return {
      cliVersion: raw.cliVersion,
      source: {
        sha: source.sha,
        ...(typeof source.url === 'string' ? { url: source.url } : {}),
      },
      apps: strings(raw.apps),
      services: strings(raw.services).sort(),
      pieces,
    };
  }
  const { template } = raw;
  if (template !== 'none' && template !== 'universal' && template !== 'app') {
    // A clone-derived record without a sha cannot be rebuilt.
    if (Array.isArray(raw.apps)) {
      return {
        cliVersion: raw.cliVersion,
        apps: strings(raw.apps),
        services: strings(raw.services).sort(),
        pieces,
        template: 'universal',
        name: strings(raw.apps)[0],
      };
    }
    return undefined;
  }
  if (typeof raw.name !== 'string') {
    return undefined;
  }
  return {
    cliVersion: raw.cliVersion,
    apps: template === 'none' ? [] : [raw.name],
    services: [],
    pieces,
    template,
    name: raw.name,
    mpoVersion: typeof raw.mpoVersion === 'string' ? raw.mpoVersion : `^${raw.cliVersion}`,
    ...(raw.reconciled === false ? { reconciled: false } : {}),
  };
}
