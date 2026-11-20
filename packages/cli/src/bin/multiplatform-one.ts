import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { formatServiceList, lookupProjectRoot, waitForKeycloak, waitForPostgres, waitServices } from '@repo/utils/dev';
import { Command } from 'commander';
import dotenv from 'dotenv';
import spawn from 'nano-spawn';
import yoctoSpinner from 'yocto-spinner';

import { addApp } from '../commands/add-app';
import { adoptApp } from '../commands/adopt-app';
import { discoverE2EApp, runE2ESession } from '../commands/e2e';
import { SINGLETON_APPS, init } from '../commands/init';
import { INIT_APP_PIECES } from '../commands/pieces';
import { updateApp } from '../commands/update-app';

const PACKAGE_JSON = 'package.json';
const SOURCE_OPTION = '--source <path|url>';
const SKIP_INSTALL_OPTION = '--skip-install';
const MPO_VERSION_OPTION = '--mpo-version <range>';
const MPO_VERSION_HELP = 'semver range for @repo/* (default: ^<cli version at the source>)';
const DECIMAL = 10;

const projectRoot = lookupProjectRoot();
const availableServices = ['api', 'solana', 'ethereum', 'sui'];
const defaultDotenvPath = path.resolve(projectRoot, '.env');

interface PackageJson {
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const parsePackageJson = (text: string): PackageJson =>
  // SAFETY: package.json is always a JSON object; every field read from it is optional
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse returns any; see SAFETY above
  JSON.parse(text) as PackageJson;

const readPackageJson = async (dir: string): Promise<PackageJson | undefined> => {
  try {
    return parsePackageJson(await fs.readFile(path.join(dir, PACKAGE_JSON), 'utf-8'));
  } catch {
    // A missing or invalid package.json means "no workspace here", which callers handle.
    return undefined;
  }
};

const isDirectory = async (dir: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    // Missing path: not a directory.
    return false;
  }
};

const exists = async (file: string): Promise<boolean> => {
  try {
    await fs.access(file);
    return true;
  } catch {
    // Inaccessible path counts as absent.
    return false;
  }
};

/** Map a service name to its relative directory from the project root. */
const serviceDir = (name: string): string => `apps/${name}`;

const keepWhere = async (names: string[], test: (name: string) => Promise<boolean>): Promise<string[]> => {
  const kept = await Promise.all(names.map(test));
  return names.filter((_, index) => kept[index]);
};

/** Apps that exist under apps/ and have package.json (discovered from filesystem). */
const getPresentApps = async (root: string): Promise<string[]> => {
  const appsDir = path.join(root, 'apps');
  try {
    const entries = await fs.readdir(appsDir, { withFileTypes: true });
    const dirs = entries.flatMap((entry) => (entry.isDirectory() ? [entry.name] : []));
    return await keepWhere(dirs, async (name) => await exists(path.join(appsDir, name, PACKAGE_JSON)));
  } catch {
    // No apps/ directory: no apps.
    return [];
  }
};

/** Root-level services that exist and have package.json (discovered from filesystem). */
const getPresentServices = async (root: string): Promise<string[]> =>
  await keepWhere(availableServices, async (name) => {
    const dir = path.join(root, serviceDir(name));
    return (await isDirectory(dir)) && (await exists(path.join(dir, PACKAGE_JSON)));
  });

/** Turbo --filter args to exclude root-level workspaces that are not present (so turbo only runs where they exist).
 *  Only generates exclude filters for directories that exist on disk (turbo errors on non-existent filter paths). */
const getTurboExcludeFiltersForMissing = async (root: string): Promise<string[]> => {
  const present = new Set(await getPresentServices(root));
  const missing = availableServices.filter((service) => !present.has(service));
  const onDisk = await keepWhere(missing, async (service) => await isDirectory(path.join(root, serviceDir(service))));
  return onDisk.map((service) => `!./${serviceDir(service)}`);
};

/** Workspaces that have Storybook and can run visual regression (discovered from filesystem + package.json). */
export interface StorybookVisualWorkspace {
  dirName: string;
  absolutePath: string;
  /** How to run visual test: run `make test/visual` in absolutePath, or run pnpm script by name. */
  runVisual: 'make' | 'pnpm';
  pnpmScript?: string;
  /** If true, run `pnpm run build` then `pnpm exec lost-pixel` in workspace (no named script). */
  runLostPixelAfterBuild?: boolean;
}

const VISUAL_SCRIPTS = ['test:visual', 'test/visual', 'test:visual:ci'] as const;
const MAKE_TEST_VISUAL = /test\/visual[\s:]/u;

const makefileHasTestVisual = async (dirPath: string): Promise<boolean> => {
  try {
    return MAKE_TEST_VISUAL.test(await fs.readFile(path.join(dirPath, 'Makefile'), 'utf-8'));
  } catch {
    // No Makefile.
    return false;
  }
};

const visualWorkspaceFor = async (
  dirName: string,
  absolutePath: string,
): Promise<StorybookVisualWorkspace | undefined> => {
  if (!(await isDirectory(path.join(absolutePath, '.storybook')))) {
    return undefined;
  }
  if (await makefileHasTestVisual(absolutePath)) {
    return { dirName, absolutePath, runVisual: 'make' };
  }
  const pkg = await readPackageJson(absolutePath);
  const scripts = pkg?.scripts ?? {};
  const pnpmScript = VISUAL_SCRIPTS.find((script) => (scripts[script] ?? '') !== '');
  if (pnpmScript !== undefined) {
    return { dirName, absolutePath, runVisual: 'pnpm', pnpmScript };
  }
  const hasLostPixel = Boolean(pkg?.dependencies?.['lost-pixel'] ?? pkg?.devDependencies?.['lost-pixel']);
  return hasLostPixel ? { dirName, absolutePath, runVisual: 'pnpm', runLostPixelAfterBuild: true } : undefined;
};

const getStorybookVisualWorkspaces = async (root: string): Promise<StorybookVisualWorkspace[]> => {
  const found = await Promise.all(
    ['apps', 'packages'].map(async (group) => {
      const base = path.join(root, group);
      try {
        const entries = await fs.readdir(base, { withFileTypes: true });
        return await Promise.all(
          entries.flatMap((entry) =>
            entry.isDirectory() ? [visualWorkspaceFor(entry.name, path.join(base, entry.name))] : [],
          ),
        );
      } catch {
        // Missing apps/ or packages/: nothing to discover there.
        return [];
      }
    }),
  );
  return found.flat().filter((workspace) => workspace !== undefined);
};

const waitFunctions = new Map<string, (interval: number) => Promise<void>>([
  ['postgres', waitForPostgres],
  ['keycloak', waitForKeycloak],
]);

const timeoutAfter = async (ms: number, signal: AbortSignal): Promise<never> => {
  await sleep(ms, undefined, { signal });
  throw new Error('Timeout');
};

const waitWithSpinner = async (
  services: string[],
  options: { interval?: number; timeout?: number } = {},
): Promise<void> => {
  const { interval = 1000, timeout = 600_000 } = options;
  const unreadyServices = [...services];
  const spinner = yoctoSpinner({
    text: `waiting for ${formatServiceList(unreadyServices)}`,
  }).start();
  const updateSpinner = (readyService: string) => {
    unreadyServices.splice(unreadyServices.indexOf(readyService), 1);
    spinner.success(`${readyService} is ready`);
    if (unreadyServices.length > 0) {
      spinner.start(`waiting for ${formatServiceList(unreadyServices)}`);
    }
  };
  const timer = new AbortController();
  try {
    await Promise.race([
      Promise.all(
        services.map(async (service) => {
          const waitFn = waitFunctions.get(service);
          if (!waitFn) {
            throw new Error(`Unknown service: ${service}`);
          }
          await waitFn(interval);
          updateSpinner(service);
        }),
      ),
      timeoutAfter(timeout, timer.signal),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.error(
      message === 'Timeout' ? `${formatServiceList(unreadyServices)} timed out after ${timeout}ms` : message,
    );
    throw error;
  } finally {
    timer.abort();
  }
};

const runPnpmTurbo = async (args: string[]): Promise<void> => {
  await spawn('pnpm', ['turbo', 'run', ...args], { stdio: 'inherit', shell: true, cwd: projectRoot });
};

const loadDotenv = (dotenvPath: string | undefined): void => {
  dotenv.config({ path: dotenvPath ?? defaultDotenvPath });
};

const cliPackage = parsePackageJson(
  fsSync.readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf-8'),
);

const program = new Command();
program.name('mpo');
program.version(cliPackage.version ?? '0.0.0');

const collect = (value: string, previous: string[]) => [...previous, value];

interface InitCliOptions {
  app: string[];
  service: string[];
  keycloak?: boolean;
  into?: boolean;
  source?: string;
  checkout?: string;
  mpoVersion?: string;
  skipInstall?: boolean;
  skipGit?: boolean;
  yes?: boolean;
  verbose?: boolean;
}

program
  .command('init')
  .argument('[name]', 'the project (and product app) name; with --into, the directory')
  .option('--app <name>', 'one more product app derived from apps/one (repeatable)', collect, [])
  .option('--service <name>', `singleton app to keep (repeatable): ${SINGLETON_APPS.join(', ')}`, collect, [])
  .option('--keycloak', 'same as --service keycloak')
  .option(
    '--into',
    'scaffold into an existing directory (the argument, default .); paths already there are kept and pinned in .updateignore',
  )
  .option(SOURCE_OPTION, 'monorepo to scaffold from (default: the commit this CLI was built from)')
  .option('-c, --checkout <ref>', 'commit, tag or branch at the source')
  .option(MPO_VERSION_OPTION, MPO_VERSION_HELP)
  .option(SKIP_INSTALL_OPTION, 'skip pnpm install after scaffolding')
  .option('--skip-git', 'skip git init + scaffold commit')
  .option('-y, --yes', 'non-interactive: no prompts, no services unless passed')
  .option('--verbose', 'show what the scaffold removes and skips')
  .description(
    'scaffold a project: the universal-starter-kit monorepo at one commit, pruned (no public/, only the services asked for, apps/one renamed to the product app, @repo/* at semver ranges)',
  )
  .action(async (name: string | undefined, options: InitCliOptions) => {
    const services = [...options.service];
    if (options.keycloak) {
      services.push('keycloak');
    }
    const servicesChosen = services.length > 0 || options.yes === true || !process.stdout.isTTY;
    await init(name, {
      apps: options.app,
      services: servicesChosen ? services : undefined,
      source: options.source,
      checkout: options.checkout,
      mpoVersion: options.mpoVersion,
      skipInstall: Boolean(options.skipInstall),
      skipGit: Boolean(options.skipGit),
      yes: Boolean(options.yes),
      into: Boolean(options.into),
      verbose: Boolean(options.verbose),
    });
  });

interface AddAppCliOptions {
  source?: string;
  skipInstall?: boolean;
  verbose?: boolean;
}

program
  .command('add-app')
  .argument('<name>', 'the new product app (apps/<name> + features/<name>)')
  .option(SOURCE_OPTION, 'monorepo holding the recorded source commit (default: the recorded url)')
  .option(SKIP_INSTALL_OPTION, 'skip pnpm install after the merge')
  .option('--verbose', "show the scaffold's progress")
  .description(
    "add another product app from apps/one at the project's recorded source commit; the result is left uncommitted like mpo update",
  )
  .action(async (name: string, options: AddAppCliOptions) => {
    await addApp(name, {
      source: options.source,
      skipInstall: Boolean(options.skipInstall),
      verbose: Boolean(options.verbose),
    });
  });

type AdoptCliOptions = Partial<Record<string, boolean | string>> & { name?: string; yes?: boolean };

const KEBAB_LETTER = /-(?<letter>\w)/gu;
const camelCase = (kebab: string): string =>
  kebab.replaceAll(KEBAB_LETTER, (_, letter: string) => letter.toUpperCase());

program
  .command('adopt')
  .option('--keycloak', 'the project adopted the Keycloak auth piece')
  .option('--tauri', 'the project adopted the Tauri desktop target piece')
  .option('--webext', 'the project adopted the browser extension target piece')
  .option(
    '--name <name>',
    'project name recorded in provenance (default: package.json name, scope stripped) — it renders piece paths (apps/<name>/…), so match your app directory',
  )
  .option('-y, --yes', 'non-interactive: never prompt (pieces must come from flags)')
  .description(
    'bring an existing, never-scaffolded project that hand-copied piece files under `mpo update` management: writes .mpo.json provenance (and seeds .updateignore) without changing any project file — the FIRST `mpo update` afterwards reconciles piece files (real diffs expected). For the whole monorepo scaffold use `mpo init --into`',
  )
  .action(async (options: AdoptCliOptions) => {
    const pieces = INIT_APP_PIECES.filter((piece) => options[camelCase(piece)] === true);
    await adoptApp({
      pieces: pieces.length > 0 ? pieces : undefined,
      name: options.name,
      yes: Boolean(options.yes),
    });
  });

interface UpdateCliOptions {
  source?: string;
  checkout?: string;
  skipInstall?: boolean;
  mpoVersion?: string;
  verbose?: boolean;
}

program
  .command('update')
  .option(SOURCE_OPTION, 'monorepo to update from (default: the commit this CLI was built from)')
  .option('-c, --checkout <ref>', 'commit, tag or branch at the source')
  .option(SKIP_INSTALL_OPTION, 'skip pnpm install after the merge')
  .option(MPO_VERSION_OPTION, MPO_VERSION_HELP)
  .option('--verbose', "show the scaffold's progress")
  .description(
    "three-way merge the monorepo's changes into this project (base = the scaffold at the recorded source commit, ours = HEAD, theirs = the scaffold at the current commit); lands in the index and worktree, never commits; refuses a dirty tree",
  )
  .action(async (options: UpdateCliOptions) => {
    await updateApp({
      source: options.source,
      checkout: options.checkout,
      skipInstall: Boolean(options.skipInstall),
      version: options.mpoVersion,
      verbose: Boolean(options.verbose),
    });
  });

interface WaitCliOptions {
  interval: string;
  timeout: string;
  dotenv?: string;
}

program
  .command('wait')
  .description('wait for a service to be ready')
  .option('-i, --interval <interval>', 'interval to wait for', '1000')
  .option('-t, --timeout <timeout>', 'timeout to wait for', '600000')
  .option('-e, --dotenv <dotenv>', 'dotenv file path', '.env')
  .argument('<services>', `the services to wait for (${waitServices.join(', ')})`)
  .action(async (servicesString: string, options: WaitCliOptions) => {
    loadDotenv(options.dotenv);
    const interval = Number.parseInt(options.interval, DECIMAL);
    const timeout = Number.parseInt(options.timeout, DECIMAL);
    try {
      await waitWithSpinner(servicesString.split(','), { interval, timeout });
    } catch {
      // waitWithSpinner already reported the failure on the spinner.
      process.exit(1);
    }
  });

const hasBuildScript = async (dir: string): Promise<boolean> => {
  const pkg = await readPackageJson(path.join(projectRoot, dir));
  return pkg?.scripts?.build !== undefined;
};

/** Run `turbo build` for each workspace dir that has a build script, one at a time. */
const buildWorkspaces = async (dirs: string[]): Promise<void> => {
  const buildable = await keepWhere(dirs, hasBuildScript);
  for (const dir of buildable) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- builds run one at a time so their output stays readable
    await runPnpmTurbo(['build', `--filter=./${dir}`]);
  }
};

program
  .command('build')
  .argument('[args...]', `build to run: ${[...availableServices, 'packages'].join(', ')} (default: all)`)
  .description('run build command')
  .action(async (args: string[]) => {
    const parsed = args.flatMap((arg) => arg.split(','));
    const packages = parsed.includes('packages');
    const projects = new Set(parsed.filter((arg) => arg !== 'packages'));
    const buildAll = projects.size === 0 && !packages;
    const wanted = (name: string) => buildAll || projects.has(name);
    const [presentApps, presentServices] = await Promise.all([
      getPresentApps(projectRoot),
      getPresentServices(projectRoot),
    ]);
    if (buildAll || packages) {
      await runPnpmTurbo([
        'build',
        '--filter',
        "'!./apps/*'",
        ...presentServices.flatMap((service) => ['--filter', `'!./${serviceDir(service)}'`]),
      ]);
    }
    await buildWorkspaces(presentApps.flatMap((app) => (wanted(app) ? [`apps/${app}`] : [])));
    await buildWorkspaces(presentServices.flatMap((service) => (wanted(service) ? [serviceDir(service)] : [])));
  });

/** turbo test, excluding missing services and the E2E app. */
const runTurboTests = async (): Promise<void> => {
  const [excludeFilters, e2eApp] = await Promise.all([
    getTurboExcludeFiltersForMissing(projectRoot),
    discoverE2EApp(projectRoot),
  ]);
  const filters = [
    ...excludeFilters.flatMap((filter) => ['--filter', filter]),
    ...(e2eApp == null ? [] : ['--filter', `'!./apps/${e2eApp}'`]),
  ];
  await runPnpmTurbo(['test', ...filters]);
};

const runVisualWorkspace = async (workspace: StorybookVisualWorkspace): Promise<void> => {
  const inWorkspace = { stdio: 'inherit', cwd: workspace.absolutePath } as const;
  if (workspace.runVisual === 'make') {
    await spawn('make', ['-C', workspace.absolutePath, 'test/visual'], { stdio: 'inherit', cwd: projectRoot });
  } else if (workspace.runLostPixelAfterBuild) {
    await spawn('pnpm', ['run', 'build'], inWorkspace);
    await spawn('pnpm', ['exec', 'lost-pixel'], inWorkspace);
  } else if (workspace.pnpmScript !== undefined) {
    await spawn('pnpm', ['run', workspace.pnpmScript], inWorkspace);
  }
};

const runVisualTests = async (): Promise<void> => {
  const workspaces = await getStorybookVisualWorkspaces(projectRoot);
  if (workspaces.length === 0) {
    console.warn(
      'No visual regression workspaces found (.storybook + Makefile test/visual, test:visual script, or lost-pixel).',
    );
    return;
  }
  for (const workspace of workspaces) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- visual suites run one at a time so their output stays readable
    await runVisualWorkspace(workspace);
  }
};

interface TestCliOptions {
  upOnly?: boolean;
  down?: boolean;
  portOffset: string;
  project?: string;
  build: boolean;
  filter?: string;
}

const runE2E = async (options: TestCliOptions): Promise<void> => {
  const teardown = async () => {
    await runE2ESession(projectRoot, { down: true });
    process.exit(130);
  };
  const teardownHandler = () => {
    void teardown();
  };
  if (!options.down) {
    process.on('SIGINT', teardownHandler);
    process.on('SIGTERM', teardownHandler);
  }
  await runE2ESession(projectRoot, {
    upOnly: options.upOnly,
    down: options.down,
    portOffset: Number.parseInt(options.portOffset, DECIMAL),
    project: options.project,
    noBuild: !options.build,
    filter: options.filter,
  });
};

program
  .command('test')
  .argument('[args...]', 'test to run: unit, integration, e2e, visual (default: unit)')
  .option('--up-only', 'start E2E environment and exit (for agent/manual testing)')
  .option('--down', 'tear down E2E test environment')
  .option('--port-offset <number>', 'port offset from defaults', '1000')
  .option('--project <name>', 'Docker project name for E2E')
  .option('--no-build', 'skip image builds for E2E')
  .option('--filter <pattern>', 'run specific Playwright test files')
  .description('run test command')
  .action(async (args: string[], options: TestCliOptions) => {
    const parsed = args.flatMap((arg) => arg.split(','));
    const only = parsed.length === 1;

    if (parsed.includes('unit')) {
      await runTurboTests();
      if (only) {
        return;
      }
    }

    if (parsed.includes('integration')) {
      await runTurboTests();
      if (only) {
        return;
      }
    }

    if (parsed.includes('e2e')) {
      await runE2E(options);
      return;
    }

    if (parsed.includes('visual')) {
      await runVisualTests();
    }
  });

program
  .command('format')
  .description('format all supported files via turbo')
  .action(async () => {
    await spawn('turbo', ['run', 'format', '--filter=//'], {
      stdio: 'inherit',
      cwd: projectRoot,
    });
  });

program
  .command('lint')
  .description('lint and typecheck all supported files via turbo')
  .action(async () => {
    const excludeFilters = await getTurboExcludeFiltersForMissing(projectRoot);
    try {
      await spawn(
        'turbo',
        [
          'run',
          'lint',
          'typecheck',
          '--filter=//',
          '--continue',
          '--filter',
          '!@package/features',
          ...excludeFilters.flatMap((filter) => ['--filter', filter]),
        ],
        { stdio: 'inherit', cwd: projectRoot },
      );
    } catch {
      // turbo already printed the failures; exit non-zero without a second error line.
      process.exit(1);
    }
  });

program
  .command('count')
  .description('count lines of code')
  .action(async () => {
    await spawn('cloc', ["`git ls-files | grep -E '(html)|(s?css)|(md)|(json)|(yaml)|([jt]sx?)$'`"], {
      stdio: 'inherit',
      shell: true,
      cwd: projectRoot,
    });
  });

program
  .command('generate')
  .description('run generate command')
  .action(async () => {
    await runPnpmTurbo(['generate']);
  });

// One-line errors instead of raw stack traces (matches the
// create-multiplatform-app bin). Stacks stay available via MPO_DEBUG=1.
try {
  await program.parseAsync(process.argv);
} catch (error) {
  if ((process.env.MPO_DEBUG ?? '') === '') {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  } else {
    console.error(error);
  }
  process.exit(1);
}
