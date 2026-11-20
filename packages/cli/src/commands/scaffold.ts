import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import spawn, { SubprocessError } from 'nano-spawn';

import { checkSourceAccess } from '../source';

import { cliRoot, readProvenance } from './provenance';
import type { MpoProvenance } from './provenance';

/** The scaffold itself: POSIX sh, runs standalone. The TS commands only call it. */
export const scaffoldScript = (): string => path.join(cliRoot(), 'scripts/scaffold.sh');

export interface ScaffoldRequest {
  /** Path to a local clone or a git URL. */
  source: string;
  /** Commit, tag or branch. */
  ref: string;
  target: string;
  /** Product apps derived from apps/one. */
  apps: string[];
  /** Singleton apps kept under apps/. */
  services: string[];
  /** Range written for @repo/* (default: ^<cli version at the ref>). */
  mpoVersion?: string;
  /** Scaffold into a non-empty directory; existing paths are skipped and pinned. */
  into?: boolean;
  /** Url recorded in .mpo.json instead of the source path. */
  sourceUrl?: string;
  /** Root package.json name (default: the target's basename). */
  name?: string;
  /** Show the script's progress (removed: ... lines). */
  verbose?: boolean;
}

export class ScaffoldError extends Error {
  readonly request: ScaffoldRequest;
  constructor(message: string, request: ScaffoldRequest) {
    super(message);
    this.name = 'ScaffoldError';
    this.request = request;
  }
}

/** --into keeps every path the target already had; name them, since mpo update will not touch them. */
const reportKept = (stdout: string): void => {
  const prefix = 'skipped (exists): ';
  const kept = stdout
    .split('\n')
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length));
  if (!kept.length) {
    return;
  }
  console.log(`\nKept ${kept.length} path(s) already here, pinned in .updateignore:`);
  for (const keptPath of kept) {
    console.log(`  ${keptPath}`);
  }
};

/** Run scaffold.sh and return the provenance it wrote. */
/** Provenance of a fresh scaffold: it always records the source commit. */
export type ScaffoldProvenance = MpoProvenance & { source: NonNullable<MpoProvenance['source']> };

export const runScaffold = async (request: ScaffoldRequest): Promise<ScaffoldProvenance> => {
  await checkSourceAccess(request.source);
  const args = [scaffoldScript()];
  for (const app of request.apps) {
    args.push('--app', app);
  }
  for (const service of request.services) {
    args.push('--service', service);
  }
  if (request.mpoVersion !== undefined && request.mpoVersion !== '') {
    args.push('--mpo-version', request.mpoVersion);
  }
  if (request.into) {
    args.push('--into');
  }
  if (request.sourceUrl !== undefined && request.sourceUrl !== '') {
    args.push('--source-url', request.sourceUrl);
  }
  if (request.name !== undefined && request.name !== '') {
    args.push('--name', request.name);
  }
  args.push('--', request.source, request.ref, request.target);
  let stdout = '';
  try {
    const result = await spawn('sh', args, {
      stdio: request.verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    ({ stdout } = result);
  } catch (error) {
    const stderr = error instanceof SubprocessError ? error.stderr.trim() : '';
    const message = error instanceof Error ? error.message : String(error);
    const detail = stderr.split('\n').findLast((line) => line !== '') ?? message;
    throw new ScaffoldError(detail.replace(/^scaffold: /u, ''), request);
  }
  if (request.into && !request.verbose) {
    reportKept(stdout);
  }
  const provenance = readProvenance(request.target);
  if (!provenance?.source) {
    throw new ScaffoldError(`scaffold.sh wrote no provenance into ${request.target}`, request);
  }
  return { ...provenance, source: provenance.source };
};

export interface TempScaffold {
  dir: string;
  provenance: ScaffoldProvenance;
  cleanup: () => void;
}

/** A scaffold in a temp dir (merge baselines). */
export const scaffoldToTemp = async (request: Omit<ScaffoldRequest, 'target' | 'into'>): Promise<TempScaffold> => {
  const parent = mkdtempSync(path.join(tmpdir(), 'mpo-scaffold-'));
  const dir = path.join(parent, 'project');
  const cleanup = () => {
    rmSync(parent, { recursive: true, force: true });
  };
  try {
    const provenance = await runScaffold({ ...request, target: dir });
    return { dir, provenance, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
};

/**
 * One subtree of the monorepo at a ref, extracted into `dest` (the piece
 * templates of an older CLI version, for adopted-project merge bases).
 */
export const archiveSubtree = async (source: string, ref: string, subtree: string, dest: string): Promise<void> => {
  await checkSourceAccess(source);
  const script = [
    'set -eu',
    'SOURCE="$1"; REF="$2"; SUBTREE="$3"; DEST="$4"',
    'if [ -d "$SOURCE" ]; then REPO="$SOURCE"; else',
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- shell parameter expansion, not a JS template
    '  REPO="$(mktemp -d "${TMPDIR:-/tmp}/mpo-archive.XXXXXX")"',
    '  trap \'rm -rf "$REPO"\' EXIT',
    '  git clone -q --depth 1 --no-checkout --branch "$REF" "$SOURCE" "$REPO"',
    '  REF=HEAD',
    'fi',
    'mkdir -p "$DEST"',
    'git -C "$REPO" archive --format=tar "$REF" "$SUBTREE" | tar -xf - -C "$DEST"',
  ].join('\n');
  await spawn('sh', ['-c', script, 'sh', source, ref, subtree, dest], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
};
