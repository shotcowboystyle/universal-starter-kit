/**
 * `mpo add-app <name>`: one more product app from apps/one, merged in at the
 * commit the project was scaffolded from.
 *
 *   base   = scaffold(recorded sha, recorded apps)
 *   theirs = scaffold(recorded sha, recorded apps + name)
 *   ours   = HEAD
 *
 * Same commit on both sides, so the diff is exactly the new app and the
 * root wiring that names it; the project's own changes are untouched. The
 * result stays uncommitted like `mpo update`.
 */

import { rmSync } from 'node:fs';
import path from 'node:path';

import { finishMerge, landTree, mergeScaffolds, projectRootOf, requireCleanTree } from './merge';
import {
  PROVENANCE_FILE,
  cliVersion,
  packageJsonName,
  readProvenance,
  validateName,
  writeProvenance,
} from './provenance';
import { scaffoldToTemp } from './scaffold';
import type { TempScaffold } from './scaffold';

export interface AddAppOptions {
  /** Path or url holding the recorded source commit (default: the recorded url). */
  source?: string;
  skipInstall?: boolean;
  verbose?: boolean;
}

export const addApp = async (nameArg: string, options: AddAppOptions = {}): Promise<void> => {
  const name = validateName(nameArg);
  const projectDir = await projectRootOf('mpo add-app');
  await requireCleanTree(projectDir, 'mpo add-app');

  const provenance = readProvenance(projectDir);
  if (!provenance) {
    throw new Error(`${PROVENANCE_FILE} not found — mpo add-app needs a project from mpo init`);
  }
  if (!provenance.source) {
    throw new Error(
      'mpo add-app needs a project scaffolded from the monorepo (a source commit in ' +
        `${PROVENANCE_FILE}); adopted and template-era projects run mpo update first`,
    );
  }
  if (provenance.apps.includes(name)) {
    throw new Error(`apps/${name} is already a product app of this project`);
  }
  const source = options.source ?? provenance.source.url;
  if (source === undefined || source === '') {
    throw new Error(`${PROVENANCE_FILE} records no source url — pass --source <path or url>`);
  }
  const { sha } = provenance.source;
  const common = {
    source,
    ref: sha,
    services: provenance.services,
    mpoVersion: `^${provenance.cliVersion}`,
    name: packageJsonName(projectDir) ?? path.basename(projectDir),
    verbose: options.verbose,
  };

  console.log(`\nmpo add-app ${name}: ${provenance.apps.join(', ')} + ${name} @ ${sha.slice(0, 12)}`);
  const base = await scaffoldToTemp({ ...common, apps: provenance.apps });
  let theirs: TempScaffold;
  try {
    theirs = await scaffoldToTemp({ ...common, apps: [...provenance.apps, name] });
  } catch (error) {
    base.cleanup();
    throw error;
  }
  try {
    for (const dir of [base.dir, theirs.dir]) {
      rmSync(path.join(dir, PROVENANCE_FILE), { force: true });
    }
    const outcome = await mergeScaffolds({
      projectDir,
      baseDir: base.dir,
      theirsDir: theirs.dir,
      baseLabel: `mpo scaffold ${sha} (${provenance.apps.join(',')})`,
      theirsLabel: `mpo scaffold ${sha} (${[...provenance.apps, name].join(',')})`,
    });
    if (!outcome.changed && !outcome.conflicts.length) {
      console.log('\n✅ nothing to add (the project already carries this app)');
      return;
    }
    await landTree(projectDir, outcome.mergedTree);
    writeProvenance(projectDir, {
      ...provenance,
      cliVersion: cliVersion() ?? provenance.cliVersion,
      apps: [...provenance.apps, name],
    });
    await finishMerge(projectDir, outcome, `feat: add app ${name} (mpo add-app)`, options);
  } finally {
    base.cleanup();
    theirs.cleanup();
  }
};
