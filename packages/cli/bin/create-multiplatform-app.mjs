#!/usr/bin/env node

/**
 * create-multiplatform-app: the npm create / npx entry. Same command as
 * `mpo init` (the monorepo at one commit, pruned into a project).
 *
 *   npx --package=@repo/cli create-multiplatform-app my-app
 *   npx --package=@repo/cli create-multiplatform-app my-app --service frappe
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ init: (name: string | undefined, options: Record<string, unknown>) => Promise<void> }} InitModule
 */

const here = import.meta.dirname;
const VALUED_FLAGS = new Set(['--app', '--service', '--source', '--checkout', '--mpo-version']);

/**
 * Every value given for a repeatable `--flag <value>`.
 * @param {string[]} argv the command line arguments
 * @param {string} name the flag
 * @returns {string[]} the values, in order
 */
const flagValues = (argv, name) =>
  argv.flatMap((arg, index) => {
    const value = argv[index + 1];
    return arg === name && value !== undefined ? [value] : [];
  });

/**
 * The first argument that is neither a flag nor a flag's value.
 * @param {string[]} argv the command line arguments
 * @returns {string | undefined} the project name, when given
 */
const firstPositional = (argv) =>
  argv.find((arg, index) => !arg.startsWith('-') && !VALUED_FLAGS.has(argv[index - 1] ?? ''));

/** @returns {Promise<InitModule>} the built init command */
const loadInit = async () => {
  const libPath = path.resolve(here, '../lib/commands/init.mjs');
  try {
    // SAFETY: lib/commands/init.mjs is the built src/commands/init.ts, which exports init(name, options)
    // oxlint-disable-next-line eslint/no-inline-comments, typescript/no-unsafe-type-assertion -- a JSDoc cast is an inline comment; import() of a path returns any, see SAFETY above
    return /** @type {InitModule} */ (await import(pathToFileURL(libPath).href));
  } catch {
    // The only way this import fails for a user is an unbuilt checkout; say how to fix that.
    throw new Error('Could not load init. Build @repo/cli first (pnpm --filter @repo/cli build).');
  }
};

/** @returns {string} the CLI's own version */
const cliVersion = () => {
  const manifest = readFileSync(path.resolve(here, '../package.json'), 'utf-8');
  // SAFETY: the CLI's own package.json always declares a version
  // oxlint-disable-next-line eslint/no-inline-comments, typescript/no-unsafe-type-assertion -- a JSDoc cast is an inline comment; JSON.parse returns any, see SAFETY above
  const pkg = /** @type {{ version: string }} */ (JSON.parse(manifest));
  return pkg.version;
};

const main = async () => {
  const argv = process.argv.slice(2);
  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log(`create-multiplatform-app [name] [--app <name>]... [--service <name>]... [--into]
                        [--source <path|url>] [--checkout <ref>] [--mpo-version <range>]
                        [--skip-install] [--skip-git] [--yes]

Scaffold a project: the universal-starter-kit monorepo at one commit, pruned.
Same as: mpo init [name] ...
`);
    return;
  }
  if (argv[0] === '--version' || argv[0] === '-V') {
    console.log(cliVersion());
    return;
  }
  const { init } = await loadInit();
  const services = flagValues(argv, '--service');
  const yes = argv.includes('--yes') || argv.includes('-y');
  await init(firstPositional(argv), {
    apps: flagValues(argv, '--app'),
    services: services.length > 0 || yes ? services : undefined,
    source: flagValues(argv, '--source')[0],
    checkout: flagValues(argv, '--checkout')[0],
    mpoVersion: flagValues(argv, '--mpo-version')[0],
    skipInstall: argv.includes('--skip-install'),
    skipGit: argv.includes('--skip-git'),
    into: argv.includes('--into'),
    yes,
  });
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
