#!/usr/bin/env node

/**
 * create-multiplatform-app: the npm create / npx entry. Same command as
 * `mpo init` (the monorepo at one commit, pruned into a project).
 *
 *   npx --package=@repo/cli create-multiplatform-app my-app
 *   npx --package=@repo/cli create-multiplatform-app my-app --service frappe
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = import.meta.dirname;
const require = createRequire(import.meta.url);

function flagValues(argv, name) {
  const values = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && argv[i + 1] !== undefined) {
      values.push(argv[++i]);
    }
  }
  return values;
}

async function main() {
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
    console.log(require('../package.json').version);
    return;
  }
  const valued = new Set(['--app', '--service', '--source', '--checkout', '--mpo-version']);
  let name;
  for (let i = 0; i < argv.length; i++) {
    if (valued.has(argv[i])) {
      i++;
    } else if (!argv[i].startsWith('-')) {
      name = argv[i];
      break;
    }
  }

  const libPath = resolve(here, '../lib/commands/init.mjs');
  let init;
  try {
    ({ init } = await import(pathToFileURL(libPath).href));
  } catch {
    throw new Error('Could not load init. Build @repo/cli first (pnpm --filter @repo/cli build).');
  }
  const services = flagValues(argv, '--service');
  const yes = argv.includes('--yes') || argv.includes('-y');
  await init(name, {
    apps: flagValues(argv, '--app'),
    services: services.length || yes ? services : undefined,
    source: flagValues(argv, '--source')[0],
    checkout: flagValues(argv, '--checkout')[0],
    mpoVersion: flagValues(argv, '--mpo-version')[0],
    skipInstall: argv.includes('--skip-install'),
    skipGit: argv.includes('--skip-git'),
    into: argv.includes('--into'),
    yes,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
