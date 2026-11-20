import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const PROVENANCE_FILE = '.mpo.json';

/**
 * Pieces: additive fragment trees under templates/pieces/<piece>/ that an
 * ADOPTED project (`mpo adopt`) hand-copied and wants `mpo update` to keep
 * reconciling. A project from `mpo init` never needs them: apps/one already
 * ships gnome/, tauri/, vscode/ and webext/, and frappe / keycloak are
 * `--service` selections of the real apps. Keep sorted: pieces are recorded
 * sorted in provenance and overlaid in this order.
 */
export const INIT_APP_PIECES = ['frappe', 'frappe-bench', 'gnome', 'keycloak', 'tauri', 'vscode', 'webext'] as const;
export type InitAppPiece = (typeof INIT_APP_PIECES)[number];

export const isInitAppPiece = (piece: string): piece is InitAppPiece =>
  INIT_APP_PIECES.some((known) => known === piece);

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

export const validateName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Project name is required');
  }
  if (!/^[a-z][a-z0-9-]*$/u.test(trimmed)) {
    throw new Error(`Invalid project name "${trimmed}". Use lowercase letters, numbers, and hyphens (e.g. my-app).`);
  }
  return trimmed;
};

/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- the JSON parse boundary for package.json and .mpo.json: untyped file contents are narrowed into typed values here and nowhere else */
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf-8'));

/** An own field of a parsed JSON object (undefined for non-objects). */
const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;

const stringField = (value: unknown, key: string): string | undefined => {
  const fieldValue = field(value, key);
  return typeof fieldValue === 'string' ? fieldValue : undefined;
};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
/* oxlint-enable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns */

/** The `name` of `<dir>/package.json` as written (undefined when unreadable). */
export const rawPackageJsonName = (dir: string): string | undefined => {
  try {
    return stringField(readJson(path.join(dir, 'package.json')), 'name');
  } catch {
    // Missing or malformed JSON reads as absent; callers treat that as "not recorded".
    return undefined;
  }
};

/** Root package.json name with any @scope/ prefix stripped (adopt derives the project name from it). */
export const packageJsonName = (projectDir: string): string | undefined =>
  rawPackageJsonName(projectDir)?.replace(/^@[^/]+\//u, '');

export const cliRoot = (): string => path.resolve(import.meta.dirname, '../..');

export const cliVersion = (): string | undefined => {
  try {
    return stringField(readJson(path.join(cliRoot(), 'package.json')), 'version');
  } catch {
    // Missing or malformed JSON reads as absent; callers treat that as "not recorded".
    return undefined;
  }
};

/** `^x.y.z` for a bare version; explicit ranges pass through. */
export const mpoRange = (explicit: string | undefined, fallbackVersion = cliVersion()): string => {
  if (explicit !== undefined && explicit !== '') {
    return explicit.startsWith('^') || explicit.startsWith('~') || explicit === '*' ? explicit : `^${explicit}`;
  }
  return fallbackVersion === undefined || fallbackVersion === '' ? '^0.0.0' : `^${fallbackVersion}`;
};

/** The JSON written to .mpo.json: a clone-derived record or an adopted / template-era one. */
type ProvenanceRecord =
  | Pick<MpoProvenance, 'cliVersion' | 'source' | 'apps' | 'services' | 'pieces'>
  | (Pick<MpoProvenance, 'template' | 'cliVersion' | 'name' | 'mpoVersion' | 'pieces'> & { reconciled?: false });

export const writeProvenance = (targetDir: string, provenance: MpoProvenance): void => {
  const pieces = provenance.pieces.toSorted();
  let record: ProvenanceRecord;
  if (provenance.source) {
    record = {
      cliVersion: provenance.cliVersion,
      source: provenance.source,
      apps: provenance.apps,
      services: provenance.services.toSorted(),
      pieces,
    };
  } else {
    record = {
      template: provenance.template ?? 'none',
      cliVersion: provenance.cliVersion,
      name: provenance.name,
      mpoVersion: provenance.mpoVersion ?? `^${provenance.cliVersion}`,
      pieces,
    };
    if (provenance.reconciled === false) {
      record.reconciled = false;
    }
  }
  writeFileSync(path.join(targetDir, PROVENANCE_FILE), `${JSON.stringify(record, null, 2)}\n`);
};

/** Recorded pieces, sorted; a name this cli does not know fails loudly, as it would when rendered. */
const recordedPieces = (names: string[]): InitAppPiece[] =>
  names.toSorted().map((piece) => {
    if (!isInitAppPiece(piece)) {
      throw new Error(`Unknown piece "${piece}" recorded in ${PROVENANCE_FILE}`);
    }
    return piece;
  });

/**
 * Reads both shapes: the clone-derived record ({cliVersion, source, apps,
 * services, pieces}) and the older {template, name} record written by
 * `mpo adopt` and the retired template scaffolder.
 */
export const readProvenance = (projectDir: string): MpoProvenance | undefined => {
  const file = path.join(projectDir, PROVENANCE_FILE);
  if (!existsSync(file)) {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = readJson(file);
  } catch {
    // Missing or malformed JSON reads as absent; callers treat that as "not recorded".
    return undefined;
  }
  const recordedCliVersion = stringField(raw, 'cliVersion');
  if (recordedCliVersion === undefined) {
    return undefined;
  }
  const pieces = recordedPieces(strings(field(raw, 'pieces')));
  const source = field(raw, 'source');
  const sha = stringField(source, 'sha');
  if (sha !== undefined) {
    const url = stringField(source, 'url');
    return {
      cliVersion: recordedCliVersion,
      source: url === undefined ? { sha } : { sha, url },
      apps: strings(field(raw, 'apps')),
      services: strings(field(raw, 'services')).toSorted(),
      pieces,
    };
  }
  const template = field(raw, 'template');
  if (template !== 'none' && template !== 'universal' && template !== 'app') {
    // A clone-derived record without a sha cannot be rebuilt.
    const apps = field(raw, 'apps');
    if (Array.isArray(apps)) {
      return {
        cliVersion: recordedCliVersion,
        apps: strings(apps),
        services: strings(field(raw, 'services')).toSorted(),
        pieces,
        template: 'universal',
        name: strings(apps)[0],
      };
    }
    return undefined;
  }
  const name = stringField(raw, 'name');
  if (name === undefined) {
    return undefined;
  }
  const provenance: MpoProvenance = {
    cliVersion: recordedCliVersion,
    apps: template === 'none' ? [] : [name],
    services: [],
    pieces,
    template,
    name,
    mpoVersion: stringField(raw, 'mpoVersion') ?? `^${recordedCliVersion}`,
  };
  if (field(raw, 'reconciled') === false) {
    provenance.reconciled = false;
  }
  return provenance;
};
