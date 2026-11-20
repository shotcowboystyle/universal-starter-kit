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
import path from 'node:path';

import spawn, { SubprocessError } from 'nano-spawn';

import { isJsonObject, parseJson } from './pieces';
import type { JsonObject, JsonValue } from './pieces';

export const git = async (projectDir: string, args: string[], env?: Record<string, string>) =>
  await spawn('git', args, {
    cwd: projectDir,
    env: env ? { ...process.env, ...env } : undefined,
  });

export const gitOut = async (projectDir: string, args: string[], env?: Record<string, string>) => {
  const result = await git(projectDir, args, env);
  return result.stdout.trim();
};

/** Runs git where a non-zero exit is the refusal: any failure becomes `message`. */
export const gitOrRefuse = async (projectDir: string, args: string[], message: string): Promise<string> => {
  try {
    return await gitOut(projectDir, args);
  } catch (error) {
    throw new Error(message, { cause: error });
  }
};

export const projectRootOf = async (command: string): Promise<string> =>
  await gitOrRefuse(process.cwd(), ['rev-parse', '--show-toplevel'], `${command} must run inside a git repository`);

/** The merge lands in the worktree, so nothing else may be in flight there. */
export const requireCleanTree = async (projectDir: string, command: string): Promise<void> => {
  await gitOrRefuse(projectDir, ['rev-parse', 'HEAD'], `${command} requires at least one commit`);
  await gitOrRefuse(
    projectDir,
    ['diff', '--quiet'],
    `${command} requires a clean working tree (unstaged changes present)`,
  );
  await gitOrRefuse(
    projectDir,
    ['diff', '--cached', '--quiet'],
    `${command} requires a clean working tree (staged changes present)`,
  );
};

const UPDATE_INDEX = 'update-index';

const writeTree = async (projectDir: string, env: Record<string, string>): Promise<string> =>
  await gitOut(projectDir, ['write-tree'], env);

const commitTree = async (projectDir: string, tree: string, message: string, parent?: string): Promise<string> =>
  await gitOut(
    projectDir,
    parent === undefined ? ['commit-tree', tree, '-m', message] : ['commit-tree', tree, '-p', parent, '-m', message],
  );

/** Non-empty output lines of a git command; a failing listing (e.g. a path absent from the tree) lists nothing. */
const gitLines = async (projectDir: string, args: string[], env?: Record<string, string>): Promise<string[]> => {
  try {
    const out = await gitOut(projectDir, args, env);
    return out.split('\n').filter((line) => line !== '');
  } catch {
    // ls-tree of a pin the tree does not hold fails; for a pin that means "no paths".
    return [];
  }
};

/** Import a directory tree into the project's object database as a
 *  commit (temp index; the worktree is never touched). The directory's own
 *  .gitignore applies, so a generated .env never enters the tree. */
const commitTreeFromDir = async (
  projectDir: string,
  dir: string,
  message: string,
  parent?: string,
): Promise<string> => {
  const indexFile = path.join(mkdtempSync(path.join(tmpdir(), 'mpo-index-')), 'index');
  const env = { GIT_INDEX_FILE: indexFile, GIT_WORK_TREE: dir };
  await git(projectDir, ['add', '-A', '--', '.'], env);
  const tree = await writeTree(projectDir, env);
  const commit = await commitTree(projectDir, tree, message, parent);
  rmSync(indexFile, { force: true });
  return commit;
};

const emptyCommit = async (projectDir: string, message: string): Promise<string> => {
  const indexFile = path.join(mkdtempSync(path.join(tmpdir(), 'mpo-index-')), 'index');
  const env = { GIT_INDEX_FILE: indexFile };
  await git(projectDir, ['read-tree', '--empty'], env);
  const tree = await writeTree(projectDir, env);
  rmSync(indexFile, { force: true });
  return await commitTree(projectDir, tree, message);
};

/** "<mode> blob <oid>\t<path>" from `git ls-tree -r`. */
const LS_TREE_ENTRY = /^(?<mode>\d+) \S+ (?<oid>[0-9a-f]+)\t(?<file>.+)$/u;

/** `--cacheinfo <mode>,<oid>,<path>` arguments for ls-tree lines. */
const cacheinfoArgs = (lines: string[]): string[] =>
  lines.flatMap((line) => {
    const entry = LS_TREE_ENTRY.exec(line)?.groups;
    return entry ? ['--cacheinfo', `${entry.mode},${entry.oid},${entry.file}`] : [];
  });

/** A tree derived from `tree` where every path under `pins` is replaced by
 *  its content in `headCommit` (removed when absent there). */
const pinPathsToHead = async (
  projectDir: string,
  tree: string,
  headCommit: string,
  pins: string[],
): Promise<string> => {
  const indexFile = path.join(mkdtempSync(path.join(tmpdir(), 'mpo-pin-')), 'index');
  const env = { GIT_INDEX_FILE: indexFile };
  const [inTree, headEntries] = await Promise.all([
    Promise.all(pins.map(async (pin) => await gitLines(projectDir, ['ls-tree', '-r', '--name-only', tree, '--', pin]))),
    Promise.all(pins.map(async (pin) => await gitLines(projectDir, ['ls-tree', '-r', headCommit, '--', pin]))),
  ]);
  await git(projectDir, ['read-tree', tree], env);
  // One temp index, so the index writes run in order: drop every pinned path, then restore HEAD's entries.
  const removals = inTree.flat();
  if (removals.length > 0) {
    await git(projectDir, [UPDATE_INDEX, '--force-remove', '--', ...removals], env);
  }
  const additions = cacheinfoArgs(headEntries.flat());
  if (additions.length > 0) {
    await git(projectDir, [UPDATE_INDEX, '--add', ...additions], env);
  }
  const pinned = await writeTree(projectDir, env);
  rmSync(indexFile, { force: true });
  return pinned;
};

/**
 * Pins: pnpm-lock.yaml plus every .updateignore entry. Entries are exact
 * files or directory prefixes (`git ls-tree -- <path>` semantics); the one
 * natural glob spelling (`dir/**`, `dir/*`) normalizes to its directory and
 * any other glob shape is refused, because a silently dead ignore rule is
 * the worst failure mode.
 */
export const readPins = (projectDir: string): string[] => {
  const pins = ['pnpm-lock.yaml'];
  const updateignore = path.join(projectDir, '.updateignore');
  if (!existsSync(updateignore)) {
    return pins;
  }
  for (const line of readFileSync(updateignore, 'utf-8').split('\n')) {
    const pattern = line.trim();
    if (!pattern || pattern.startsWith('#')) {
      continue;
    }
    let pin = pattern.replace(/\/\*{1,2}$/u, '');
    if (/[*?[\]]/u.test(pin)) {
      throw new Error(
        `.updateignore: "${pattern}" looks like a glob, but entries are ` +
          'exact files or directory prefixes (a glob here would silently ' +
          'pin nothing). List the file or directory instead.',
      );
    }
    while (pin.endsWith('/')) {
      pin = pin.slice(0, -1);
    }
    pins.push(pin);
  }
  return pins;
};

// ── package.json conflict auto-resolution ─────────────────────────
//
// The dominant conflict class in real updates is dependency-range drift:
// the project bumped a range (ours ^6.4.2) while the scaffold moved too
// (theirs ^6.4.3). Both sides changed the same JSON entry, so textual merge
// punts, but the resolution is mechanical: the newer minimum wins.

const UNRESOLVED = Symbol('unresolved');
const ABSENT = Symbol('absent');

/** A JSON node of one side; undefined = the key is missing there. */
type Side = JsonValue | undefined;
type Merged = JsonValue | typeof UNRESOLVED | typeof ABSENT;

const DEP_MAP_KEYS = new Set([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'overrides',
  'resolutions',
]);

const SEMVER_RANGE = /^[\^~]?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-[\w.]+)?$/u;

const rangeMinimum = (range: Side): [number, number, number] | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- range is already parsed JSON (JsonValue); typeof is how that closed union is discriminated
  if (typeof range !== 'string') {
    return undefined;
  }
  const version = SEMVER_RANGE.exec(range)?.groups;
  if (!version) {
    return undefined;
  }
  return [Number(version.major), Number(version.minor), Number(version.patch)];
};

const jsonEqual = (a: Side, b: Side): boolean => JSON.stringify(a) === JSON.stringify(b);

const present = (value: Side): JsonValue | typeof ABSENT => (value === undefined ? ABSENT : value);

/** Both sides set a dependency range: the newer minimum wins; unparseable ranges stay unresolved. */
const newerRange = (ours: Side, theirs: Side): Merged => {
  const oursMin = rangeMinimum(ours);
  const theirsMin = rangeMinimum(theirs);
  if (!oursMin || !theirsMin || ours === undefined || theirs === undefined) {
    return UNRESOLVED;
  }
  for (let i = 0; i < 3; i += 1) {
    if (oursMin[i] > theirsMin[i]) {
      return ours;
    }
    if (oursMin[i] < theirsMin[i]) {
      return theirs;
    }
  }
  // Equal minimums, different spelling: the scaffold wins.
  return theirs;
};

const mergeObjects = (base: Side, ours: JsonObject, theirs: JsonObject, inDepMap: boolean): Merged => {
  const baseObject = isJsonObject(base) ? base : {};
  const merged = new Map<string, JsonValue>();
  const keys = [...Object.keys(ours), ...Object.keys(theirs).filter((key) => !(key in ours))];
  for (const key of keys) {
    // oxlint-disable-next-line eslint/no-use-before-define -- mergeNode and mergeObjects recurse into each other
    const child = mergeNode(baseObject[key], ours[key], theirs[key], inDepMap || DEP_MAP_KEYS.has(key));
    if (child === UNRESOLVED) {
      return UNRESOLVED;
    }
    if (child !== ABSENT) {
      merged.set(key, child);
    }
  }
  return Object.fromEntries(merged);
};

const mergeNode = (base: Side, ours: Side, theirs: Side, inDepMap: boolean): Merged => {
  if (jsonEqual(ours, theirs) || jsonEqual(theirs, base)) {
    return present(ours);
  }
  if (jsonEqual(ours, base)) {
    return present(theirs);
  }
  if (isJsonObject(ours) && isJsonObject(theirs)) {
    return mergeObjects(base, ours, theirs, inDepMap);
  }
  return inDepMap ? newerRange(ours, theirs) : UNRESOLVED;
};

/** Structural three-way merge of package.json content, or undefined when a
 *  divergence cannot be auto-resolved (the textual markers then stay). */
export const threeWayMergePackageJson = (
  base: string | undefined,
  ours: string,
  theirs: string,
): JsonObject | undefined => {
  let baseJson: JsonValue;
  let oursJson: JsonValue;
  let theirsJson: JsonValue;
  try {
    baseJson = base === undefined ? {} : parseJson(base);
    oursJson = parseJson(ours);
    theirsJson = parseJson(theirs);
  } catch {
    // Unparseable package.json: leave the textual conflict for a human.
    return undefined;
  }
  if (!isJsonObject(oursJson) || !isJsonObject(theirsJson)) {
    return undefined;
  }
  const merged = mergeNode(baseJson, oursJson, theirsJson, false);
  if (merged === UNRESOLVED || merged === ABSENT || !isJsonObject(merged)) {
    return undefined;
  }
  return merged;
};

/** A file's content at a commit, or undefined when the commit lacks it. */
const showFile = async (projectDir: string, commit: string, file: string): Promise<string | undefined> => {
  try {
    return await gitOut(projectDir, ['show', `${commit}:${file}`]);
  } catch {
    // Absent on that side (added or deleted there).
    return undefined;
  }
};

interface AutoResolution {
  tree: string;
  conflicts: string[];
  resolved: string[];
}

interface ResolvedBlob {
  path: string;
  oid: string;
}

/** The auto-merged package.json written as a blob, or undefined when it cannot be resolved. */
const resolvePackageJson = async (
  projectDir: string,
  file: string,
  blobFile: string,
  commits: { base: string; head: string; next: string },
): Promise<ResolvedBlob | undefined> => {
  const [base, ours, theirs] = await Promise.all([
    showFile(projectDir, commits.base, file),
    showFile(projectDir, commits.head, file),
    showFile(projectDir, commits.next, file),
  ]);
  if (ours === undefined || theirs === undefined) {
    return undefined;
  }
  const merged = threeWayMergePackageJson(base, ours, theirs);
  if (!merged) {
    return undefined;
  }
  writeFileSync(blobFile, `${JSON.stringify(merged, null, 2)}\n`);
  const oid = await gitOut(projectDir, ['hash-object', '-w', '--', blobFile]);
  return { path: file, oid };
};

const autoResolveDependencyConflicts = async (
  projectDir: string,
  mergedTree: string,
  conflicts: string[],
  commits: { base: string; head: string; next: string },
): Promise<AutoResolution> => {
  const candidates = conflicts.filter((file) => path.basename(file) === 'package.json');
  if (!candidates.length) {
    return { tree: mergedTree, conflicts, resolved: [] };
  }

  const scratch = mkdtempSync(path.join(tmpdir(), 'mpo-resolve-'));
  try {
    const blobs = await Promise.all(
      candidates.map(
        async (file, index) =>
          await resolvePackageJson(projectDir, file, path.join(scratch, `blob-${index}.json`), commits),
      ),
    );
    const resolved = blobs.filter((blob) => blob !== undefined);
    if (!resolved.length) {
      return { tree: mergedTree, conflicts, resolved: [] };
    }

    const env = { GIT_INDEX_FILE: path.join(scratch, 'index') };
    await git(projectDir, ['read-tree', mergedTree], env);
    await git(
      projectDir,
      [UPDATE_INDEX, '--add', ...resolved.flatMap((entry) => ['--cacheinfo', `100644,${entry.oid},${entry.path}`])],
      env,
    );
    const tree = await writeTree(projectDir, env);
    const resolvedPaths = new Set(resolved.map((entry) => entry.path));
    return {
      tree,
      conflicts: conflicts.filter((file) => !resolvedPaths.has(file)),
      resolved: [...resolvedPaths],
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

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
export const mergeScaffolds = async (request: MergeRequest): Promise<MergeOutcome> => {
  const { projectDir, baseDir } = request;
  const head = await gitOut(projectDir, ['rev-parse', 'HEAD']);
  const baseCommit =
    baseDir === undefined || baseDir === ''
      ? await emptyCommit(projectDir, request.baseLabel)
      : await commitTreeFromDir(projectDir, baseDir, request.baseLabel);
  // merge-tree reads --merge-base only from git 2.40, and Debian bookworm
  // ships 2.39. HEAD's tree on a commit parented by the base hands it the
  // same base through history instead.
  const [nextCommit, oursCommit] = await Promise.all([
    commitTreeFromDir(projectDir, request.theirsDir, request.theirsLabel, baseCommit),
    commitTree(projectDir, `${head}^{tree}`, 'HEAD', baseCommit),
  ]);

  let mergedTree: string;
  let conflicts: string[] = [];
  try {
    const out = await gitOut(projectDir, ['merge-tree', '--write-tree', '--name-only', oursCommit, nextCommit]);
    mergedTree = out.split('\n')[0].trim();
  } catch (error) {
    // Exit code 1 = conflicts: <tree>\n<conflicted paths>\n\n<messages>.
    const stdout = error instanceof SubprocessError ? error.stdout : '';
    const lines = stdout.split('\n');
    mergedTree = lines[0].trim();
    if (mergedTree === '') {
      throw error;
    }
    const blank = lines.indexOf('', 1);
    conflicts = lines
      .slice(1, blank === -1 ? undefined : blank)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const pins = readPins(projectDir);
  mergedTree = await pinPathsToHead(projectDir, mergedTree, head, pins);
  conflicts = conflicts.filter((file) => !pins.some((pin) => file === pin || file.startsWith(`${pin}/`)));

  const [autoResolved, headTree] = await Promise.all([
    autoResolveDependencyConflicts(projectDir, mergedTree, conflicts, {
      base: baseCommit,
      head,
      next: nextCommit,
    }),
    gitOut(projectDir, ['rev-parse', `${head}^{tree}`]),
  ]);
  return {
    mergedTree: autoResolved.tree,
    changed: autoResolved.tree !== headTree,
    conflicts: autoResolved.conflicts,
    resolved: autoResolved.resolved,
  };
};

/** Land a tree in the index and worktree. The tree was clean before, so
 *  every difference is the merge; nothing is committed. */
export const landTree = async (projectDir: string, tree: string): Promise<void> => {
  await git(projectDir, ['read-tree', '-u', '--reset', tree]);
};

/** Print the outcome and the commit line; run pnpm install on a clean merge. */
export const finishMerge = async (
  projectDir: string,
  outcome: MergeOutcome,
  commitMessage: string,
  options: { skipInstall?: boolean } = {},
): Promise<void> => {
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
};
