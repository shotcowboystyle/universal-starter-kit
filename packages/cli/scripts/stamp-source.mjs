#!/usr/bin/env node
// Writes lib/source.json: the monorepo commit this build of the CLI came
// from, so a published `mpo init` clones the exact tree its templates and
// packages were cut from. Runs as the last step of `pnpm build`, and again
// from `package-train.mjs pack`, because a release builds before its version
// commit exists. A commit whose package.json carries another version is never
// stamped: scaffold.sh reads the @repo range from that file at the
// stamped commit (MPO-346).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ version: string, repository: { url: string } }} CliPackage */

/**
 * @param {string} text the contents of a CLI package.json
 * @returns {CliPackage} the parsed manifest
 */
const parsePackage = (text) =>
  // SAFETY: the CLI's package.json always declares version and repository.url
  // oxlint-disable-next-line eslint/no-inline-comments, typescript/no-unsafe-type-assertion -- a JSDoc cast is an inline comment; JSON.parse returns any, see SAFETY above
  /** @type {CliPackage} */ (JSON.parse(text));

const root = path.resolve(import.meta.dirname, '..');
const pkg = parsePackage(readFileSync(path.join(root, 'package.json'), 'utf-8'));
const url = process.env.MPO_SOURCE_URL ?? pkg.repository.url.replace(/^git\+/u, '');

/**
 * @param {string[]} args git arguments
 * @returns {string} git's trimmed stdout
 */
const git = (args) =>
  // oxlint-disable-next-line sonarjs/no-os-command-from-path -- build-time script; the developer's git reads this checkout
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

/**
 * @param {string} rev a commit
 * @returns {string | undefined} the CLI version package.json carries at that commit, if any
 */
const committedVersion = (rev) => {
  let version;
  try {
    ({ version } = parsePackage(git(['show', `${rev}:./package.json`])));
  } catch {
    // No package.json at that commit: it carries no CLI version.
  }
  return version;
};

/** @returns {string | undefined} the HEAD commit, when this is a git checkout */
const headCommit = () => {
  let head;
  try {
    head = git(['rev-parse', 'HEAD']);
  } catch {
    // Not a git checkout (e.g. a tarball build): nothing to stamp.
  }
  return head;
};

let sha = process.env.MPO_SOURCE_SHA ?? '';
let skipped = '';
if (sha === '') {
  const head = headCommit();
  if (head !== undefined) {
    const version = committedVersion(head);
    if (version === pkg.version) {
      sha = head;
    } else {
      skipped = ` (HEAD ${head.slice(0, 12)} carries ${version ?? 'no'} cli version, not ${pkg.version})`;
    }
  }
}
const stamp = sha === '' ? { cliVersion: pkg.version, url } : { cliVersion: pkg.version, url, sha };
mkdirSync(path.join(root, 'lib'), { recursive: true });
writeFileSync(path.join(root, 'lib/source.json'), `${JSON.stringify(stamp, null, 2)}\n`);
process.stdout.write(`source: ${sha === '' ? '(no git sha)' : sha}${skipped} ${url}\n`);
