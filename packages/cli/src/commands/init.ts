/**
 * `mpo init`: a consumer project is the universal-starter-kit monorepo at one
 * commit, pruned. scripts/scaffold.sh does the work (clone or archive at
 * the ref, drop public/ and the singleton apps not asked for, rename
 * apps/one to each product app, rewrite workspace: ranges to semver); this
 * command picks the commit, asks what to keep, and finishes the repo.
 */

import { existsSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import inquirer from 'inquirer';
import spawn from 'nano-spawn';

import { resolveSource } from '../source';
import type { SourceSpec } from '../source';

import { mpoRange, validateName } from './provenance';
import { runScaffold, ScaffoldError } from './scaffold';

/** The apps that exist once per project; everything else under apps/ is a product app. */
export const SINGLETON_APPS = [
  'ethereum',
  'frappe',
  'keycloak',
  'solana',
  'storybook',
  'storybook-expo',
  'sui',
  'uxpin',
  'vocs',
] as const;
export type SingletonApp = (typeof SINGLETON_APPS)[number];

const SINGLETON_DESCRIPTIONS: Record<SingletonApp, string> = {
  ethereum: 'Hardhat chain + contracts',
  frappe: 'Frappe bench (backend, docker compose)',
  keycloak: 'Keycloak theme + realm (auth, docker compose)',
  solana: 'Anchor programs + localnet',
  storybook: 'Storybook (web)',
  'storybook-expo': 'Storybook (native)',
  sui: 'Move packages + localnet',
  uxpin: 'UXPin Merge library',
  vocs: 'Docs site',
};

export interface InitOptions {
  /** Product apps besides the project name (each is a renamed apps/one). */
  apps?: string[];
  /** Singleton apps to keep. */
  services?: string[];
  /** Path or url to scaffold from instead of the CLI's recorded source. */
  source?: string;
  /** Commit, tag or branch at that source. */
  checkout?: string;
  /** Range for @repo/* (default: ^<cli version at the source>). */
  mpoVersion?: string;
  skipInstall?: boolean;
  skipGit?: boolean;
  /** Non-interactive: no prompts, no services unless passed. */
  yes?: boolean;
  /** Scaffold into an existing (non-empty) directory. */
  into?: boolean;
  /** Show the scaffold's per-path progress. */
  verbose?: boolean;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function validateServices(services: string[]): SingletonApp[] {
  const known = new Set<string>(SINGLETON_APPS);
  for (const service of services) {
    if (!known.has(service)) {
      throw new Error(`Unknown service "${service}". Services are the singleton apps: ${SINGLETON_APPS.join(', ')}`);
    }
  }
  return unique(services).sort() as SingletonApp[];
}

async function promptServices(): Promise<SingletonApp[]> {
  const result = await inquirer.prompt([
    {
      message: 'Which singleton apps should the project keep? (space to toggle, enter to confirm)',
      name: 'services',
      type: 'checkbox',
      choices: SINGLETON_APPS.map((service) => ({
        name: `${service} — ${SINGLETON_DESCRIPTIONS[service]}`,
        value: service,
        checked: false,
      })),
    },
  ]);
  return validateServices(result.services as string[]);
}

async function insideGitRepo(dir: string): Promise<boolean> {
  return await spawn('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir }).then(
    () => true,
    () => false,
  );
}

async function scaffoldWithFallback(
  spec: SourceSpec,
  request: Parameters<typeof runScaffold>[0],
): Promise<Awaited<ReturnType<typeof runScaffold>>> {
  try {
    return await runScaffold({ ...request, source: spec.source, ref: spec.ref });
  } catch (error) {
    if (spec.origin !== 'tag' || !(error instanceof ScaffoldError)) {
      throw error;
    }
    console.warn(`⚠️  ${error.message}; retrying from main`);
    return await runScaffold({ ...request, source: spec.source, ref: 'main' });
  }
}

export async function init(nameArg: string | undefined, options: InitOptions = {}): Promise<void> {
  const interactive = !options.yes && process.stdout.isTTY;

  // --into: the argument is the directory; the product app is named after it.
  let targetDir: string;
  let name: string;
  if (options.into) {
    targetDir = resolve(nameArg ?? '.');
    name = validateName(options.apps?.[0] ?? basename(targetDir));
  } else {
    let projectName = nameArg;
    if (!projectName) {
      if (interactive) {
        const result = await inquirer.prompt([
          { message: 'What is the app name?', name: 'name', type: 'input', default: 'my-app' },
        ]);
        projectName = result.name as string;
      } else {
        projectName = 'my-app';
      }
    }
    name = validateName(projectName);
    targetDir = resolve(name);
  }
  const apps = unique([name, ...(options.apps ?? []).map(validateName)]);

  let services: SingletonApp[];
  if (options.services) {
    services = validateServices(options.services);
  } else if (interactive) {
    services = await promptServices();
  } else {
    services = [];
  }

  if (existsSync(targetDir) && readdirSync(targetDir).length > 0 && !options.into) {
    throw new Error(
      `Directory "${targetDir}" already exists and is not empty. ` +
        'Pass --into to scaffold into it (paths that already exist are kept and pinned in ' +
        '.updateignore), or pick another name.',
    );
  }

  const spec = resolveSource({ source: options.source, checkout: options.checkout });
  if (spec.warning) {
    console.warn(`⚠️  ${spec.warning}`);
  }

  console.log(`\nScaffolding ${targetDir} from ${spec.source} @ ${spec.ref}`);
  console.log(`  apps      ${apps.join(', ')}`);
  console.log(`  services  ${services.length ? services.join(', ') : '(none)'}`);

  const provenance = await scaffoldWithFallback(spec, {
    source: spec.source,
    ref: spec.ref,
    target: targetDir,
    apps,
    services,
    mpoVersion: options.mpoVersion ? mpoRange(options.mpoVersion) : undefined,
    into: options.into,
    verbose: options.verbose,
  });
  const { sha } = provenance.source!;
  console.log(`  source    ${sha}`);

  // A fresh project gets its scaffold commit; a directory already inside a
  // repository (--into, or nested in another project) is left for the
  // owner to commit.
  let scaffoldCommitted = false;
  if (!options.skipGit && !(await insideGitRepo(targetDir))) {
    await spawn('git', ['init', '--quiet'], { cwd: targetDir });
    await spawn('git', ['add', '-A'], { cwd: targetDir });
    scaffoldCommitted = await spawn(
      'git',
      ['commit', '--quiet', '-m', `feat: scaffold from universal-starter-kit ${sha.slice(0, 12)} (mpo init)`],
      { cwd: targetDir },
    ).then(
      () => true,
      () => {
        console.warn('⚠️  git commit failed (missing git identity?) — repo left staged.');
        return false;
      },
    );
  }

  if (options.skipInstall) {
    console.log('Skipped pnpm install (--skip-install).');
  } else {
    console.log('\nInstalling dependencies...');
    await spawn('pnpm', ['install'], { cwd: targetDir, stdio: 'inherit' });
    if (scaffoldCommitted) {
      // The lockfile belongs to the scaffold commit so a fresh init is clean.
      await spawn('git', ['add', '--', 'pnpm-lock.yaml'], { cwd: targetDir })
        .then(async () => await spawn('git', ['commit', '--amend', '--no-edit', '--quiet'], { cwd: targetDir }))
        .catch(() => {});
    }
  }

  console.log(`\n✅ Project created at ${targetDir}`);
  console.log('\nNext steps:');
  if (!options.into) {
    console.log(`  cd ${basename(targetDir)}`);
  }
  if (options.skipInstall) {
    console.log('  pnpm install');
  }
  if (options.into || options.skipGit) {
    console.log('  git add -A && git commit -m "feat: scaffold from universal-starter-kit (mpo init)"');
  }
  console.log('  pnpm dev        # web + native dev server');
  if (services.includes('frappe')) {
    console.log('  make frappe/dev # Frappe bench (see apps/frappe)');
  }
  console.log('\nLater: `mpo update` merges monorepo changes into the project without committing;');
  console.log('`mpo add-app <name>` adds another product app.');
}
