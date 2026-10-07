/**
 * `mpo update`: bring the monorepo's changes into a project as a three-way
 * merge that is NEVER committed.
 *
 *   base   = the scaffold the project started from: the monorepo at the
 *            commit recorded in .mpo.json, pruned with the recorded apps
 *            and services
 *   ours   = the project's HEAD (every commit the project made)
 *   theirs = the same scaffold at the commit the running CLI was built from
 *            (or --source/--checkout)
 *
 * Every product app is a renamed apps/one on both sides, so a change to
 * the One app lands in each of them. The merged tree goes into the index
 * and worktree; the commit line is printed; a dirty tree is refused up
 * front. Adopted projects (`mpo adopt`) merge their piece fragments the
 * same way; projects from the retired template scaffolder reconcile from an
 * empty base once and are clone-derived afterwards.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { isGitUrl, monorepoCheckout, monorepoUrl, resolveSource } from '../source';
import type { SourceSpec } from '../source';

import { finishMerge, git, gitOut, landTree, mergeScaffolds, projectRootOf, requireCleanTree } from './merge';
import { scaffoldPieces, withSplitPieces } from './pieces';
import { PROVENANCE_FILE, cliVersion, mpoRange, packageJsonName, readProvenance, writeProvenance } from './provenance';
import type { MpoProvenance } from './provenance';
import { archiveSubtree, scaffoldToTemp } from './scaffold';
import type { TempScaffold } from './scaffold';

export interface UpdateAppOptions {
  skipInstall?: boolean;
  /** Override the semver range written for @repo/* deps. */
  version?: string;
  /** Path or url to update from (default: the CLI's recorded source). */
  source?: string;
  /** Commit, tag or branch at that source (default: the CLI's source commit). */
  checkout?: string;
  verbose?: boolean;
}

function isSha(ref: string): boolean {
  return /^[0-9a-f]{40}$/.test(ref);
}

/** The commit a source spec names, when it can be known without scaffolding. */
async function resolveSha(spec: SourceSpec): Promise<string | undefined> {
  if (isSha(spec.ref)) {
    return spec.ref;
  }
  if (isGitUrl(spec.source)) {
    return undefined;
  }
  return await gitOut(spec.source, ['rev-parse', '--verify', `${spec.ref}^{commit}`]).catch(() => {});
}

// pnpm-lock.yaml stays pinned to HEAD through the merge, so a merge that
// removes .pnpmfile.cjs leaves its checksum behind, and pnpm re-resolves every
// dependency over the mismatch instead of keeping the lockfile's pins.
async function dropStalePnpmfileChecksum(projectDir: string): Promise<void> {
  const lockfile = join(projectDir, 'pnpm-lock.yaml');
  if (existsSync(join(projectDir, '.pnpmfile.cjs')) || !existsSync(lockfile)) {
    return;
  }
  const lock = readFileSync(lockfile, 'utf-8');
  const stripped = lock.replace(/^pnpmfileChecksum: .*\n\n?/m, '');
  if (stripped === lock) {
    return;
  }
  writeFileSync(lockfile, stripped);
  await git(projectDir, ['add', '--', 'pnpm-lock.yaml']);
}

function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'mpo-update-'));
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * templates/pieces as they were at another CLI version: the monorepo tag
 * v<version>, from the CLI's source (or --source). Falls back to the
 * current templates with a warning, which degrades that merge to two-way.
 */
async function piecesRootAt(
  version: string,
  options: UpdateAppOptions,
): Promise<{ root?: string; cleanup: () => void }> {
  if (version === cliVersion()) {
    return { cleanup: () => {} };
  }
  const scratch = tempDir();
  const source = options.source ?? monorepoCheckout() ?? monorepoUrl;
  try {
    await archiveSubtree(source, `v${version}`, 'public/cli/templates/pieces', scratch.dir);
    return { root: join(scratch.dir, 'public/cli/templates/pieces'), cleanup: scratch.cleanup };
  } catch {
    scratch.cleanup();
    console.warn(
      `⚠️  could not read templates/pieces at v${version} from ${source}; ` +
        "using the current pieces as the merge base (changes since that version won't land).",
    );
    return { cleanup: () => {} };
  }
}

async function updateAdopted(projectDir: string, provenance: MpoProvenance, options: UpdateAppOptions): Promise<void> {
  const currentVersion = cliVersion() ?? '0.0.0';
  const targetRange = mpoRange(options.version, currentVersion);
  const name = provenance.name!;
  const firstReconcile = provenance.reconciled === false;
  console.log(`\nmpo update (adopted): cli ${provenance.cliVersion} → ${currentVersion}`);
  console.log(`  pieces  ${provenance.pieces.join(', ')}`);
  console.log(`  project ${name}\n`);
  if (firstReconcile) {
    console.log('⚠️  FIRST UPDATE AFTER ADOPTION: piece files are reconciled against the');
    console.log('   piece templates from an empty merge base. Diffs and conflicts on');
    console.log('   hand-copied piece files are EXPECTED — resolve the markers and');
    console.log('   commit. Later updates merge three-way and stay quiet.\n');
  }

  const base = tempDir();
  const theirs = tempDir();
  let oldPieces: { root?: string; cleanup: () => void } = { cleanup: () => {} };
  let { pieces } = provenance;
  try {
    if (!firstReconcile) {
      oldPieces = await piecesRootAt(provenance.cliVersion, options);
      scaffoldPieces(base.dir, {
        name,
        mpoVersion: provenance.mpoVersion ?? `^${provenance.cliVersion}`,
        pieces: provenance.pieces,
        root: oldPieces.root,
      });
      pieces = withSplitPieces(provenance.pieces, oldPieces.root);
      if (pieces !== provenance.pieces) {
        console.log('  frappe-bench added: the frappe piece no longer carries the dev bench\n');
      }
    }
    scaffoldPieces(theirs.dir, { name, mpoVersion: targetRange, pieces });

    const outcome = await mergeScaffolds({
      projectDir,
      baseDir: firstReconcile ? undefined : base.dir,
      theirsDir: theirs.dir,
      baseLabel: `mpo pieces ${provenance.cliVersion}`,
      theirsLabel: `mpo pieces ${currentVersion}`,
    });
    const next: MpoProvenance = {
      ...provenance,
      cliVersion: currentVersion,
      mpoVersion: targetRange,
      pieces,
      reconciled: undefined,
    };
    if (!outcome.changed && !outcome.conflicts.length) {
      if (
        provenance.cliVersion !== currentVersion ||
        provenance.mpoVersion !== targetRange ||
        pieces !== provenance.pieces ||
        firstReconcile
      ) {
        writeProvenance(projectDir, next);
        console.log(`\n✅ already up to date; ${PROVENANCE_FILE} refreshed — commit it`);
      } else {
        console.log('\n✅ already up to date');
      }
      return;
    }
    await landTree(projectDir, outcome.mergedTree);
    writeProvenance(projectDir, next);
    await finishMerge(projectDir, outcome, `chore: mpo update ${provenance.cliVersion} → ${currentVersion}`, options);
  } finally {
    base.cleanup();
    theirs.cleanup();
    oldPieces.cleanup();
  }
}

async function updateClone(projectDir: string, provenance: MpoProvenance, options: UpdateAppOptions): Promise<void> {
  const currentVersion = cliVersion() ?? '0.0.0';
  const recorded = provenance.source;
  const templateEra = !recorded;
  const { apps } = provenance;
  if (!apps.length) {
    throw new Error(`${PROVENANCE_FILE} lists no product apps — nothing to update`);
  }

  // theirs: the CLI's source commit unless --source/--checkout say otherwise.
  const nextSpec = resolveSource({ source: options.source, checkout: options.checkout });
  if (nextSpec.warning) {
    console.warn(`⚠️  ${nextSpec.warning}`);
  }
  // base: the recorded commit, read from --source when given (a mirror or a
  // local clone must hold that commit too).
  const baseSource = options.source ?? recorded?.url ?? nextSpec.source;
  const targetRange = options.version ? mpoRange(options.version) : undefined;

  console.log(
    `\nmpo update: ${recorded ? recorded.sha.slice(0, 12) : '(template-era project)'} → ${nextSpec.source} @ ${nextSpec.ref}`,
  );
  console.log(`  apps      ${apps.join(', ')}`);
  console.log(`  services  ${provenance.services.length ? provenance.services.join(', ') : '(none)'}`);
  if (templateEra) {
    console.log('\n⚠️  This project came from the retired template scaffolder, so there is no');
    console.log("   scaffold to use as a merge base. The monorepo's One app is merged in");
    console.log('   from an empty base once: expect additions and conflicts on shared files.');
    console.log('   Pin what is yours in .updateignore first if needed. After this update the');
    console.log(`   project is clone-derived and later updates merge three-way.\n`);
  }

  if (recorded && !options.version) {
    const nextSha = await resolveSha(nextSpec);
    if (nextSha === recorded.sha) {
      console.log('\n✅ already up to date');
      return;
    }
  }

  // Both scaffolds carry the project's own root package name, so the name
  // never reads as a change (an empty base would otherwise conflict on it).
  const name = packageJsonName(projectDir) ?? basename(projectDir);
  const theirs = await scaffoldToTemp({
    source: nextSpec.source,
    ref: nextSpec.ref,
    apps,
    services: provenance.services,
    mpoVersion: targetRange,
    name,
    verbose: options.verbose,
  });
  let base: TempScaffold | undefined;
  try {
    const nextSha = theirs.provenance.source!.sha;
    if (recorded && nextSha === recorded.sha && !options.version) {
      console.log('\n✅ already up to date');
      return;
    }
    if (recorded) {
      base = await scaffoldToTemp({
        source: baseSource,
        ref: recorded.sha,
        apps,
        services: provenance.services,
        mpoVersion: `^${provenance.cliVersion}`,
        name,
        verbose: options.verbose,
      });
    }
    for (const dir of [theirs.dir, base?.dir]) {
      if (dir) {
        rmSync(join(dir, PROVENANCE_FILE), { force: true });
      }
    }
    const outcome = await mergeScaffolds({
      projectDir,
      baseDir: base?.dir,
      theirsDir: theirs.dir,
      baseLabel: recorded ? `mpo scaffold ${recorded.sha}` : 'mpo scaffold (empty base)',
      theirsLabel: `mpo scaffold ${nextSha}`,
    });
    const next: MpoProvenance = {
      cliVersion: theirs.provenance.cliVersion || currentVersion,
      source: { sha: nextSha, url: options.source ?? recorded?.url ?? nextSpec.source },
      apps,
      services: provenance.services,
      pieces: [],
    };
    const label = `${recorded ? recorded.sha.slice(0, 12) : 'template'} → ${nextSha.slice(0, 12)}`;
    if (!outcome.changed && !outcome.conflicts.length) {
      writeProvenance(projectDir, next);
      console.log(`\n✅ already up to date; ${PROVENANCE_FILE} refreshed — commit it`);
      return;
    }
    await landTree(projectDir, outcome.mergedTree);
    await dropStalePnpmfileChecksum(projectDir);
    writeProvenance(projectDir, next);
    await finishMerge(projectDir, outcome, `chore: mpo update ${label}`, options);
  } finally {
    theirs.cleanup();
    base?.cleanup();
  }
}

export async function updateApp(options: UpdateAppOptions = {}): Promise<void> {
  const projectDir = await projectRootOf('mpo update');
  await requireCleanTree(projectDir, 'mpo update');
  const provenance = readProvenance(projectDir);
  if (!provenance) {
    throw new Error(
      `${PROVENANCE_FILE} not found — this project has no scaffold provenance.\n` +
        '  - hand-copied piece files from the templates? bring it under management:\n' +
        '      mpo adopt --<piece> [...]\n' +
        '  - scaffolded from the monorepo before provenance existed? write .mpo.json:\n' +
        '      { "cliVersion": "<cli>", "source": { "sha": "<commit>", "url": "<repo>" },\n' +
        '        "apps": ["<name>"], "services": [], "pieces": [] }',
    );
  }
  if (provenance.template === 'none') {
    await updateAdopted(projectDir, provenance, options);
    return;
  }
  await updateClone(projectDir, provenance, options);
}
