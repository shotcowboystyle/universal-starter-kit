/**
 * The three-way merge behind `mpo update` and `mpo add-app`:
 *
 *   base   = the scaffold the project started from (recorded in .mpo.json)
 *   ours   = the project's HEAD (every commit the project made)
 *   theirs = the scaffold it is moving to
 *
 * `git merge-tree --write-tree` (git 2.38+) merges the scaffold's
 * evolution with the project's history; the result lands in the index and
 * worktree, never in a commit, so the project commits when it is happy.
 * `.updateignore` entries (exact files or directory prefixes, not globs) and
 * pnpm-lock.yaml stay pinned to HEAD.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import spawn from 'nano-spawn';

export async function git(projectDir: string, args: string[], env?: Record<string, string>) {
  return await spawn('git', args, {
    cwd: projectDir,
    env: env ? { ...process.env, ...env } : undefined,
  });
}

export async function gitOut(projectDir: string, args: string[], env?: Record<string, string>) {
  const result = await git(projectDir, args, env);
  return result.stdout.trim();
}

export async function projectRootOf(command: string): Promise<string> {
  return await gitOut(process.cwd(), ['rev-parse', '--show-toplevel']).catch(() => {
    throw new Error(`${command} must run inside a git repository`);
  });
}

/** The merge lands in the worktree, so nothing else may be in flight there. */
export async function requireCleanTree(projectDir: string, command: string): Promise<void> {
  await git(projectDir, ['rev-parse', 'HEAD']).catch(() => {
    throw new Error(`${command} requires at least one commit`);
  });
  await git(projectDir, ['diff', '--quiet']).catch(() => {
    throw new Error(`${command} requires a clean working tree (unstaged changes present)`);
  });
  await git(projectDir, ['diff', '--cached', '--quiet']).catch(() => {
    throw new Error(`${command} requires a clean working tree (staged changes present)`);
  });
}

/** Import a directory tree into the project's object database as a
 *  commit (temp index; the worktree is never touched). The directory's own
 *  .gitignore applies, so a generated .env never enters the tree. */
async function commitTreeFromDir(projectDir: string, dir: string, message: string, parent?: string): Promise<string> {
  const indexFile = join(mkdtempSync(join(tmpdir(), 'mpo-index-')), 'index');
  const env = { GIT_INDEX_FILE: indexFile, GIT_WORK_TREE: dir };
  await git(projectDir, ['add', '-A', '--', '.'], env);
  const tree = await gitOut(projectDir, ['write-tree'], env);
  const commitArgs = parent ? ['commit-tree', tree, '-p', parent, '-m', message] : ['commit-tree', tree, '-m', message];
  const commit = await gitOut(projectDir, commitArgs);
  rmSync(indexFile, { force: true });
  return commit;
}

async function emptyCommit(projectDir: string, message: string): Promise<string> {
  const indexFile = join(mkdtempSync(join(tmpdir(), 'mpo-index-')), 'index');
  const env = { GIT_INDEX_FILE: indexFile };
  await git(projectDir, ['read-tree', '--empty'], env);
  const tree = await gitOut(projectDir, ['write-tree'], env);
  rmSync(indexFile, { force: true });
  return await gitOut(projectDir, ['commit-tree', tree, '-m', message]);
}

/** A tree derived from `tree` where every path under `pins` is replaced by
 *  its content in `headCommit` (removed when absent there). */
async function pinPathsToHead(projectDir: string, tree: string, headCommit: string, pins: string[]): Promise<string> {
  const indexFile = join(mkdtempSync(join(tmpdir(), 'mpo-pin-')), 'index');
  const env = { GIT_INDEX_FILE: indexFile };
  await git(projectDir, ['read-tree', tree], env);
  for (const pin of pins) {
    const inTree = await gitOut(projectDir, ['ls-tree', '-r', '--name-only', tree, '--', pin], env)
      .then((out) => out.split('\n').filter(Boolean))
      .catch(() => [] as string[]);
    for (const path of inTree) {
      await git(projectDir, ['update-index', '--force-remove', '--', path], env).catch(() => {});
    }
    const headEntries = await gitOut(projectDir, ['ls-tree', '-r', headCommit, '--', pin], env).catch(() => '');
    for (const line of headEntries.split('\n').filter(Boolean)) {
      // "<mode> blob <oid>\t<path>"
      const match = /^(\d+) \S+ ([0-9a-f]+)\t(.+)$/.exec(line);
      if (!match) {
        continue;
      }
      await git(projectDir, ['update-index', '--add', '--cacheinfo', `${match[1]},${match[2]},${match[3]}`], env).catch(
        () => {},
      );
    }
  }
  const pinned = await gitOut(projectDir, ['write-tree'], env);
  rmSync(indexFile, { force: true });
  return pinned;
}

/**
 * Pins: pnpm-lock.yaml plus every .updateignore entry. Entries are exact
 * files or directory prefixes (`git ls-tree -- <path>` semantics); the one
 * natural glob spelling (`dir/**`, `dir/*`) normalizes to its directory and
 * any other glob shape is refused, because a silently dead ignore rule is
 * the worst failure mode.
 */
export function readPins(projectDir: string): string[] {
  const pins = ['pnpm-lock.yaml'];
  const updateignore = join(projectDir, '.updateignore');
  if (!existsSync(updateignore)) {
    return pins;
  }
  for (const line of readFileSync(updateignore, 'utf-8').split('\n')) {
    const pattern = line.trim();
    if (!pattern || pattern.startsWith('#')) {
      continue;
    }
    const normalized = pattern.replace(/\/\*{1,2}$/, '');
    if (/[*?[\]]/.test(normalized)) {
      throw new Error(
        `.updateignore: "${pattern}" looks like a glob, but entries are ` +
          'exact files or directory prefixes (a glob here would silently ' +
          'pin nothing). List the file or directory instead.',
      );
    }
    pins.push(normalized.replace(/\/+$/, ''));
  }
  return pins;
}

// ── package.json conflict auto-resolution ─────────────────────────
//
// The dominant conflict class in real updates is dependency-range drift:
// the project bumped a range (ours ^6.4.2) while the scaffold moved too
// (theirs ^6.4.3). Both sides changed the same JSON entry, so textual merge
// punts, but the resolution is mechanical: the newer minimum wins.

const UNRESOLVED = Symbol('unresolved');
const ABSENT = Symbol('absent');

const DEP_MAP_KEYS = new Set([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'overrides',
  'resolutions',
]);

function rangeMinimum(range: unknown): [number, number, number] | undefined {
  if (typeof range !== 'string') {
    return undefined;
  }
  const match = /^[\^~]?(\d+)\.(\d+)\.(\d+)(?:-[\w.]+)?$/.exec(range);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeNode(
  base: unknown,
  ours: unknown,
  theirs: unknown,
  inDepMap: boolean,
): unknown | typeof UNRESOLVED | typeof ABSENT {
  if (jsonEqual(ours, theirs)) {
    return ours === undefined ? ABSENT : ours;
  }
  if (jsonEqual(theirs, base)) {
    return ours === undefined ? ABSENT : ours;
  }
  if (jsonEqual(ours, base)) {
    return theirs === undefined ? ABSENT : theirs;
  }
  if (isPlainObject(ours) && isPlainObject(theirs)) {
    const baseObject = isPlainObject(base) ? base : {};
    const merged: Record<string, unknown> = {};
    const keys = [...Object.keys(ours), ...Object.keys(theirs).filter((key) => !(key in ours))];
    for (const key of keys) {
      const child = mergeNode(baseObject[key], ours[key], theirs[key], inDepMap || DEP_MAP_KEYS.has(key));
      if (child === UNRESOLVED) {
        return UNRESOLVED;
      }
      if (child !== ABSENT) {
        merged[key] = child;
      }
    }
    return merged;
  }
  if (inDepMap) {
    const oursMin = rangeMinimum(ours);
    const theirsMin = rangeMinimum(theirs);
    if (oursMin && theirsMin) {
      for (let i = 0; i < 3; i++) {
        if (oursMin[i] > theirsMin[i]) {
          return ours;
        }
        if (oursMin[i] < theirsMin[i]) {
          return theirs;
        }
      }
      return theirs; // equal minimums, different spelling: the scaffold wins
    }
  }
  return UNRESOLVED;
}

/** Structural three-way merge of package.json content, or undefined when a
 *  divergence cannot be auto-resolved (the textual markers then stay). */
export function threeWayMergePackageJson(
  base: string | undefined,
  ours: string,
  theirs: string,
): Record<string, unknown> | undefined {
  let baseJson: unknown;
  let oursJson: unknown;
  let theirsJson: unknown;
  try {
    baseJson = base === undefined ? {} : JSON.parse(base);
    oursJson = JSON.parse(ours);
    theirsJson = JSON.parse(theirs);
  } catch {
    return undefined;
  }
  if (!isPlainObject(oursJson) || !isPlainObject(theirsJson)) {
    return undefined;
  }
  const merged = mergeNode(baseJson, oursJson, theirsJson, false);
  if (merged === UNRESOLVED || merged === ABSENT || !isPlainObject(merged)) {
    return undefined;
  }
  return merged;
}

async function autoResolveDependencyConflicts(
  projectDir: string,
  mergedTree: string,
  conflicts: string[],
  baseCommit: string,
  headCommit: string,
  nextCommit: string,
): Promise<{ tree: string; conflicts: string[]; resolved: string[] }> {
  const candidates = conflicts.filter((file) => basename(file) === 'package.json');
  if (!candidates.length) {
    return { tree: mergedTree, conflicts, resolved: [] };
  }

  const scratch = mkdtempSync(join(tmpdir(), 'mpo-resolve-'));
  const resolved: { path: string; oid: string }[] = [];
  try {
    for (const file of candidates) {
      const show = async (commit: string) => await gitOut(projectDir, ['show', `${commit}:${file}`]).catch(() => undefined);
      const [base, ours, theirs] = await Promise.all([show(baseCommit), show(headCommit), show(nextCommit)]);
      if (ours === undefined || theirs === undefined) {
        continue;
      }
      const merged = threeWayMergePackageJson(base, ours, theirs);
      if (!merged) {
        continue;
      }
      const blobFile = join(scratch, 'blob.json');
      writeFileSync(blobFile, `${JSON.stringify(merged, null, 2)}\n`);
      const oid = await gitOut(projectDir, ['hash-object', '-w', '--', blobFile]);
      resolved.push({ path: file, oid });
    }
    if (!resolved.length) {
      return { tree: mergedTree, conflicts, resolved: [] };
    }

    const indexFile = join(scratch, 'index');
    const env = { GIT_INDEX_FILE: indexFile };
    await git(projectDir, ['read-tree', mergedTree], env);
    for (const entry of resolved) {
      await git(projectDir, ['update-index', '--add', '--cacheinfo', `100644,${entry.oid},${entry.path}`], env);
    }
    const tree = await gitOut(projectDir, ['write-tree'], env);
    const resolvedPaths = new Set(resolved.map((entry) => entry.path));
    return {
      tree,
      conflicts: conflicts.filter((file) => !resolvedPaths.has(file)),
      resolved: [...resolvedPaths],
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export interface MergeRequest {
  projectDir: string;
  /** The scaffold the project started from; undefined = the empty tree. */
  baseDir?: string;
  theirsDir: string;
  baseLabel: string;
  theirsLabel: string;
}

export interface MergeOutcome {
  mergedTree: string;
  /** false when the merged tree is HEAD's tree already. */
  changed: boolean;
  conflicts: string[];
  resolved: string[];
}

/** Compute the merged tree. Pure object-database work; nothing is written to the worktree. */
export async function mergeScaffolds(request: MergeRequest): Promise<MergeOutcome> {
  const { projectDir } = request;
  const head = await gitOut(projectDir, ['rev-parse', 'HEAD']);
  const baseCommit = request.baseDir
    ? await commitTreeFromDir(projectDir, request.baseDir, request.baseLabel)
    : await emptyCommit(projectDir, request.baseLabel);
  const nextCommit = await commitTreeFromDir(projectDir, request.theirsDir, request.theirsLabel, baseCommit);
  // merge-tree reads --merge-base only from git 2.40, and Debian bookworm
  // ships 2.39. HEAD's tree on a commit parented by the base hands it the
  // same base through history instead.
  const oursCommit = await gitOut(projectDir, ['commit-tree', `${head}^{tree}`, '-p', baseCommit, '-m', 'HEAD']);

  let mergedTree: string;
  let conflicts: string[] = [];
  try {
    const out = await gitOut(projectDir, ['merge-tree', '--write-tree', '--name-only', oursCommit, nextCommit]);
    mergedTree = out.split('\n')[0].trim();
  } catch (error) {
    // Exit code 1 = conflicts: <tree>\n<conflicted paths>\n\n<messages>.
    const stdout = (error as { stdout?: string }).stdout ?? '';
    const lines = stdout.split('\n');
    if (!lines[0]?.trim()) {
      throw error;
    }
    mergedTree = lines[0].trim();
    const blank = lines.indexOf('', 1);
    conflicts = lines
      .slice(1, blank === -1 ? undefined : blank)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const pins = readPins(projectDir);
  mergedTree = await pinPathsToHead(projectDir, mergedTree, head, pins);
  conflicts = conflicts.filter((file) => !pins.some((pin) => file === pin || file.startsWith(`${pin}/`)));

  const autoResolved = await autoResolveDependencyConflicts(
    projectDir,
    mergedTree,
    conflicts,
    baseCommit,
    head,
    nextCommit,
  );
  const headTree = await gitOut(projectDir, ['rev-parse', `${head}^{tree}`]);
  return {
    mergedTree: autoResolved.tree,
    changed: autoResolved.tree !== headTree,
    conflicts: autoResolved.conflicts,
    resolved: autoResolved.resolved,
  };
}

/** Land a tree in the index and worktree. The tree was clean before, so
 *  every difference is the merge; nothing is committed. */
export async function landTree(projectDir: string, tree: string): Promise<void> {
  await git(projectDir, ['read-tree', '-u', '--reset', tree]);
}

/** Print the outcome and the commit line; run pnpm install on a clean merge. */
export async function finishMerge(
  projectDir: string,
  outcome: MergeOutcome,
  commitMessage: string,
  options: { skipInstall?: boolean } = {},
): Promise<void> {
  for (const file of outcome.resolved) {
    console.log(`   auto-resolved: ${file} (dependency ranges)`);
  }
  if (outcome.conflicts.length) {
    console.log('\n⚠️  merge conflicts — resolve the markers, then commit:');
    for (const file of outcome.conflicts) {
      console.log(`   ${file}`);
    }
  } else {
    console.log('\n✅ merged cleanly into the index and worktree (nothing committed)');
  }
  if (outcome.conflicts.length) {
    if (!options.skipInstall) {
      console.log('\nSkipping pnpm install until the conflicts are resolved (then run: pnpm install).');
    }
  } else if (!options.skipInstall) {
    console.log('\nInstalling dependencies...');
    await spawn('pnpm', ['install'], { cwd: projectDir, stdio: 'inherit' });
  }
  console.log(`\nReview with git status / git diff, then:\n   git add -A && git commit -m "${commitMessage}"`);
}
