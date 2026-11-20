/**
 * `mpo adopt` — bring an EXISTING, never-scaffolded project under `mpo
 * update` management. Projects like this hand-copied one or more delivery
 * targets (webext, tauri, …) from templates/pieces and consume
 * `@repo/*` from npm, but have no .mpo.json provenance, so
 * `mpo update` refuses to run. A project that wants the whole monorepo
 * scaffold instead runs `mpo init --into`.
 *
 * Adoption writes provenance ONLY (template "none" + the chosen pieces +
 * the current CLI version) and seeds .updateignore — it never rewrites a
 * project file. The FIRST `mpo update` afterwards reconciles the piece
 * files against the piece templates from an empty merge base, so real
 * diffs (and conflicts) against hand-copied files are expected there;
 * every later update is an ordinary three-way merge.
 */

import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import inquirer from 'inquirer';

import { git, gitOrRefuse } from './merge';
import { INIT_APP_PIECES, availablePieces, normalizePieces, pieceDescription } from './pieces';
import type { InitAppPiece } from './pieces';
import {
  PROVENANCE_FILE,
  cliVersion,
  packageJsonName,
  rawPackageJsonName,
  validateName,
  writeProvenance,
} from './provenance';

export interface AdoptAppOptions {
  /** Pieces the project hand-adopted (at least one is required). */
  pieces?: InitAppPiece[];
  /** Project name (default: package.json name, scope stripped). */
  name?: string;
  /** Non-interactive: never prompt (pieces must come from flags). */
  yes?: boolean;
}

const UPDATEIGNORE_FILE = '.updateignore';
const UPDATEIGNORE_SEED = `# .updateignore — \`mpo update\` never rewrites paths listed here.
# One git pathspec per line; matching paths stay pinned to YOUR version
# during template updates. Lines starting with "#" are comments.
`;

/**
 * The universal-starter-kit monorepo (and its forks) is the home of the
 * templates themselves — adopting it into consumer-project update
 * management would be circular. It is identified by the CLI package
 * living at packages/cli.
 */
const isMpoMonorepo = (projectDir: string): boolean =>
  rawPackageJsonName(path.join(projectDir, 'packages/cli')) === '@repo/cli';

const resolveAdoptPieces = async (options: AdoptAppOptions): Promise<InitAppPiece[]> => {
  if (options.pieces !== undefined && options.pieces.length > 0) {
    return normalizePieces(options.pieces);
  }
  if (!options.yes && process.stdout.isTTY) {
    const result = await inquirer.prompt<{ pieces: string[] }>([
      {
        message: 'Which pieces did this project adopt? (space to toggle, enter to confirm)',
        name: 'pieces',
        type: 'checkbox',
        choices: availablePieces().map((piece) => ({
          name: `${piece} — ${pieceDescription(piece)}`,
          value: piece,
          checked: false,
        })),
        validate: (selection: readonly string[]) =>
          selection.length > 0 || 'Select at least one piece — adopting nothing is meaningless',
      },
    ]);
    return normalizePieces(result.pieces);
  }
  const flags = INIT_APP_PIECES.map((piece) => `--${piece}`).join(', ');
  throw new Error(`mpo adopt needs at least one piece (${flags}) — adopting nothing is meaningless`);
};

export const adoptApp = async (options: AdoptAppOptions = {}): Promise<void> => {
  const projectDir = await gitOrRefuse(
    process.cwd(),
    ['rev-parse', '--show-toplevel'],
    'mpo adopt must run inside a git repository',
  );

  if (isMpoMonorepo(projectDir)) {
    throw new Error(
      'mpo adopt cannot run inside the universal-starter-kit monorepo (or a fork of it) — ' +
        'it is for consumer projects that use @repo/* from npm',
    );
  }
  if (existsSync(path.join(projectDir, PROVENANCE_FILE))) {
    throw new Error(
      `${PROVENANCE_FILE} already exists — this project already has scaffold provenance. ` +
        'Run `mpo update` directly.',
    );
  }
  await gitOrRefuse(
    projectDir,
    ['rev-parse', 'HEAD'],
    'mpo adopt requires at least one commit — commit your project first',
  );
  // Clean tree required — adoption lands as its own commit, and the next
  // step (`mpo update`) needs a clean tree anyway.
  await gitOrRefuse(
    projectDir,
    ['diff', '--quiet'],
    'mpo adopt requires a clean working tree (unstaged changes present)',
  );
  await gitOrRefuse(
    projectDir,
    ['diff', '--cached', '--quiet'],
    'mpo adopt requires a clean working tree (staged changes present)',
  );

  const rawName = options.name ?? packageJsonName(projectDir);
  if (rawName === undefined || rawName === '') {
    throw new Error('Could not derive a project name from package.json — pass one with --name <name>');
  }
  let name: string;
  try {
    name = validateName(rawName);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} The name renders piece file paths (apps/<name>/…), ` +
        'so pick the one matching your app directory: --name <name>.',
      { cause: error },
    );
  }

  const pieces = await resolveAdoptPieces(options);
  const currentVersion = cliVersion() ?? '0.0.0';

  writeProvenance(projectDir, {
    template: 'none',
    cliVersion: currentVersion,
    name,
    mpoVersion: `^${currentVersion}`,
    apps: [],
    services: [],
    pieces,
    reconciled: false,
  });
  const files = [PROVENANCE_FILE];
  if (!existsSync(path.join(projectDir, UPDATEIGNORE_FILE))) {
    writeFileSync(path.join(projectDir, UPDATEIGNORE_FILE), UPDATEIGNORE_SEED);
    files.push(UPDATEIGNORE_FILE);
  }
  await git(projectDir, ['add', '--', ...files]);
  let committed = true;
  try {
    await git(projectDir, ['commit', '--quiet', '-m', 'chore: adopt universal-starter-kit tooling (mpo adopt)']);
  } catch {
    // Safe to continue: provenance stays staged and the owner commits it.
    console.warn('⚠️  git commit failed (missing git identity?) — provenance left staged.');
    committed = false;
  }

  console.log(`\n✅ adopted ${name} (pieces: ${pieces.join(', ')}, cli ${currentVersion})`);
  console.log(`   ${files.join(' + ')} ${committed ? 'committed' : 'written'} — NO project files`);
  console.log('   were changed by adoption itself.\n');
  console.log('Next: run `mpo update` to reconcile the piece files.');
  console.log('   THE FIRST UPDATE SURFACES REAL DIFFS: your hand-copied piece files');
  console.log('   are merged against the piece templates from scratch, so conflicts');
  console.log('   there are expected — resolve the markers and commit. Later updates');
  console.log('   are ordinary three-way merges, and re-running `mpo update` right');
  console.log('   after a successful update makes zero changes.');
  console.log(`Pin anything the updater must never touch in ${UPDATEIGNORE_FILE}.`);
};
