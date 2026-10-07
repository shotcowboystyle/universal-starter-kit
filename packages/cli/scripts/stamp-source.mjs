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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const url = process.env.MPO_SOURCE_URL ?? pkg.repository.url.replace(/^git\+/, '');

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function committedVersion(rev) {
  try {
    return JSON.parse(git(['show', `${rev}:./package.json`])).version;
  } catch {
    return;
  }
}

let sha = process.env.MPO_SOURCE_SHA;
let skipped = '';
if (!sha) {
  let head;
  try {
    head = git(['rev-parse', 'HEAD']);
  } catch {
    head = undefined;
  }
  const version = head && committedVersion(head);
  if (version === pkg.version) {
    sha = head;
  } else if (head) {
    skipped = ` (HEAD ${head.slice(0, 12)} carries ${version ?? 'no'} cli version, not ${pkg.version})`;
  }
}
const stamp = { cliVersion: pkg.version, url, ...(sha ? { sha } : {}) };
mkdirSync(join(root, 'lib'), { recursive: true });
writeFileSync(join(root, 'lib/source.json'), `${JSON.stringify(stamp, null, 2)}\n`);
process.stdout.write(`source: ${sha ?? '(no git sha)'}${skipped} ${url}\n`);
