/**
 * `mpo init`: a consumer project is the universal-starter-kit monorepo at one
 * commit, pruned. scripts/scaffold.sh does the work (clone or archive at
 * the ref, drop public/ and the singleton apps not asked for, rename
 * apps/one to each product app, rewrite workspace: ranges to semver); this
 * command picks the commit, asks what to keep, and finishes the repo.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import inquirer from 'inquirer';
import spawn from 'nano-spawn';

import { resolveSource } from '../source';
import type { SourceSpec } from '../source';

import { mpoRange, validateName } from './provenance';
import { runScaffold, ScaffoldError } from './scaffold';
import type { ScaffoldProvenance, ScaffoldRequest } from './scaffold';

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

const unique = (values: string[]): string[] => [...new Set(values)];

const isSingletonApp = (service: string): service is SingletonApp => SINGLETON_APPS.some((known) => known === service);

export const validateServices = (services: string[]): SingletonApp[] =>
  unique(services)
    .toSorted()
    .map((service) => {
      if (!isSingletonApp(service)) {
        throw new Error(`Unknown service "${service}". Services are the singleton apps: ${SINGLETON_APPS.join(', ')}`);
      }
      return service;
    });

const promptServices = async (): Promise<SingletonApp[]> => {
  const result = await inquirer.prompt<{ services: string[] }>([
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
  return validateServices(result.services);
};

const insideGitRepo = async (dir: string): Promise<boolean> => {
  try {
    await spawn('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir });
    return true;
  } catch {
    // git exits non-zero outside a work tree; that is the answer, not a failure.
    return false;
  }
};

const scaffoldWithFallback = async (spec: SourceSpec, request: ScaffoldRequest): Promise<ScaffoldProvenance> => {
  try {
    return await runScaffold({ ...request, source: spec.source, ref: spec.ref });
  } catch (error) {
    if (spec.origin !== 'tag' || !(error instanceof ScaffoldError)) {
      throw error;
    }
    console.warn(`⚠️  ${error.message}; retrying from main`);
    return await runScaffold({ ...request, source: spec.source, ref: 'main' });
  }
};

/** --into: the argument is the directory; the product app is named after it. */
const resolveTarget = async (
  nameArg: string | undefined,
  options: InitOptions,
  interactive: boolean,
): Promise<{ targetDir: string; name: string }> => {
  if (options.into) {
    const targetDir = path.resolve(nameArg ?? '.');
    return { targetDir, name: validateName(options.apps?.[0] ?? path.basename(targetDir)) };
  }
  let projectName = nameArg ?? '';
  if (projectName === '' && interactive) {
    const answers = await inquirer.prompt<{ name: string }>([
      { message: 'What is the app name?', name: 'name', type: 'input', default: 'my-app' },
    ]);
    projectName = answers.name;
  } else if (projectName === '') {
    projectName = 'my-app';
  }
  const name = validateName(projectName);
  return { targetDir: path.resolve(name), name };
};

const resolveServices = async (options: InitOptions, interactive: boolean): Promise<SingletonApp[]> => {
  if (options.services) {
    return validateServices(options.services);
  }
  return interactive ? await promptServices() : [];
};

/** A fresh project gets its scaffold commit; returns whether it was made. */
const commitScaffold = async (targetDir: string, sha: string): Promise<boolean> => {
  await spawn('git', ['init', '--quiet'], { cwd: targetDir });
  await spawn('git', ['add', '-A'], { cwd: targetDir });
  try {
    await spawn(
      'git',
      ['commit', '--quiet', '-m', `feat: scaffold from universal-starter-kit ${sha.slice(0, 12)} (mpo init)`],
      { cwd: targetDir },
    );
    return true;
  } catch {
    // Safe to continue: the scaffold stays staged and the owner commits it.
    console.warn('⚠️  git commit failed (missing git identity?) — repo left staged.');
    return false;
  }
};

const installDependencies = async (targetDir: string, scaffoldCommitted: boolean): Promise<void> => {
  console.log('\nInstalling dependencies...');
  await spawn('pnpm', ['install'], { cwd: targetDir, stdio: 'inherit' });
  if (!scaffoldCommitted) {
    return;
  }
  // The lockfile belongs to the scaffold commit so a fresh init is clean.
  try {
    await spawn('git', ['add', '--', 'pnpm-lock.yaml'], { cwd: targetDir });
    await spawn('git', ['commit', '--amend', '--no-edit', '--quiet'], { cwd: targetDir });
  } catch {
    // Safe to continue: the lockfile is left for the owner to commit.
  }
};

const printNextSteps = (targetDir: string, options: InitOptions, services: SingletonApp[]): void => {
  console.log(`\n✅ Project created at ${targetDir}`);
  console.log('\nNext steps:');
  if (!options.into) {
    console.log(`  cd ${path.basename(targetDir)}`);
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
};

export const init = async (nameArg: string | undefined, options: InitOptions = {}): Promise<void> => {
  const interactive = !options.yes && process.stdout.isTTY;
  const { targetDir, name } = await resolveTarget(nameArg, options, interactive);
  const apps = unique([name, ...(options.apps ?? []).map(validateName)]);
  const services = await resolveServices(options, interactive);

  if (existsSync(targetDir) && readdirSync(targetDir).length > 0 && !options.into) {
    throw new Error(
      `Directory "${targetDir}" already exists and is not empty. ` +
        'Pass --into to scaffold into it (paths that already exist are kept and pinned in ' +
        '.updateignore), or pick another name.',
    );
  }

  const spec = resolveSource({ source: options.source, checkout: options.checkout });
  if (spec.warning !== undefined && spec.warning !== '') {
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
    mpoVersion:
      options.mpoVersion === undefined || options.mpoVersion === '' ? undefined : mpoRange(options.mpoVersion),
    into: options.into,
    verbose: options.verbose,
  });
  const { sha } = provenance.source;
  console.log(`  source    ${sha}`);

  // A directory already inside a repository (--into, or nested in another
  // project) is left for the owner to commit.
  const scaffoldCommitted =
    !options.skipGit && !(await insideGitRepo(targetDir)) ? await commitScaffold(targetDir, sha) : false;

  if (options.skipInstall) {
    console.log('Skipped pnpm install (--skip-install).');
  } else {
    await installDependencies(targetDir, scaffoldCommitted);
  }

  printNextSteps(targetDir, options, services);
};
