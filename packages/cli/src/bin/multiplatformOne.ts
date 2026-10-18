import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatServiceList,
  lookupProjectRoot,
  waitForFrappe,
  waitForKeycloak,
  waitForPostgres,
  waitServices,
} from '@repo/utils/dev';
import { Command } from 'commander';
import dotenv from 'dotenv';
import spawn from 'nano-spawn';
import YAML from 'yaml';
import yoctoSpinner from 'yocto-spinner';

import { addApp } from '../commands/addApp';
import { adoptApp } from '../commands/adoptApp';
import { generateDoctypeTypes, typesDrift } from '../commands/doctypeTypes';
import { discoverE2EApp, runE2ESession } from '../commands/e2e';
import { SINGLETON_APPS, init } from '../commands/init';
import { INIT_APP_PIECES } from '../commands/pieces';
import { updateApp } from '../commands/updateApp';

const projectRoot = lookupProjectRoot();
const availableServices = ['api', 'frappe', 'solana', 'ethereum', 'sui'];

/** Map a service name to its relative directory from the project root. */
function serviceDir(name: string): string {
  return `apps/${name}`;
}
const defaultDotenvPath = path.resolve(projectRoot, '.env');

/** Apps that exist under apps/ and have package.json (discovered from filesystem). */
async function getPresentApps(root: string): Promise<string[]> {
  const appsDir = path.join(root, 'apps');
  try {
    const entries = await fs.readdir(appsDir, { withFileTypes: true });
    const names: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) {
        continue;
      }
      const pkgPath = path.join(appsDir, e.name, 'package.json');
      try {
        await fs.access(pkgPath);
        names.push(e.name);
      } catch {
        // no package.json
      }
    }
    return names;
  } catch {
    return [];
  }
}

/** Root-level services that exist and have package.json (discovered from filesystem). */
async function getPresentServices(root: string): Promise<string[]> {
  const names: string[] = [];
  for (const name of availableServices) {
    const dir = path.join(root, serviceDir(name));
    const pkgPath = path.join(dir, 'package.json');
    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) {
        continue;
      }
      await fs.access(pkgPath);
      names.push(name);
    } catch {
      // dir or package.json missing
    }
  }
  return names;
}

/** Turbo --filter args to exclude root-level workspaces that are not present (so turbo only runs where they exist).
 *  Only generates exclude filters for directories that exist on disk (turbo errors on non-existent filter paths). */
async function getTurboExcludeFiltersForMissing(root: string): Promise<string[]> {
  const present = await getPresentServices(root);
  const filters: string[] = [];
  for (const s of availableServices) {
    if (present.includes(s)) {
      continue;
    }
    const dir = serviceDir(s);
    try {
      const stat = await fs.stat(path.join(root, dir));
      if (stat.isDirectory()) {
        filters.push(`!./${dir}`);
      }
    } catch {
      // directory doesn't exist; turbo won't find it, no filter needed
    }
  }
  return filters;
}

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

async function getStorybookVisualWorkspaces(root: string): Promise<StorybookVisualWorkspace[]> {
  const out: StorybookVisualWorkspace[] = [];
  const searchDirs = [
    { base: path.join(root, 'apps'), prefix: 'apps/' },
    { base: path.join(root, 'packages'), prefix: 'packages/' },
  ];
  for (const { base, prefix: _prefix } of searchDirs) {
    let entries: { name: string }[];
    try {
      entries = (await fs.readdir(base, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => ({ name: e.name }));
    } catch {
      continue;
    }
    for (const { name } of entries) {
      const dirPath = path.join(base, name);
      const storybookDir = path.join(dirPath, '.storybook');
      try {
        const stat = await fs.stat(storybookDir);
        if (!stat.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }
      const pkgPath = path.join(dirPath, 'package.json');
      let pkg: {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      } | null = null;
      try {
        pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      } catch {
        // no package.json or invalid
      }
      const hasLostPixel = pkg && (pkg.dependencies?.['lost-pixel'] || pkg.devDependencies?.['lost-pixel']);
      const scripts = pkg?.scripts ?? {};
      const testVisualScript = scripts['test:visual'] ?? scripts['test/visual'] ?? scripts['test:visual:ci'];
      const makefilePath = path.join(dirPath, 'Makefile');
      let makefileHasTestVisual = false;
      try {
        const makefile = await fs.readFile(makefilePath, 'utf-8');
        makefileHasTestVisual = /test\/visual[\s:]/.test(makefile);
      } catch {
        // no Makefile
      }
      if (makefileHasTestVisual) {
        out.push({ dirName: name, absolutePath: dirPath, runVisual: 'make' });
      } else if (testVisualScript) {
        const scriptName = scripts['test:visual']
          ? 'test:visual'
          : scripts['test/visual']
            ? 'test/visual'
            : 'test:visual:ci';
        out.push({
          dirName: name,
          absolutePath: dirPath,
          runVisual: 'pnpm',
          pnpmScript: scriptName,
        });
      } else if (hasLostPixel) {
        out.push({
          dirName: name,
          absolutePath: dirPath,
          runVisual: 'pnpm',
          pnpmScript: undefined,
          runLostPixelAfterBuild: true,
        });
      }
    }
  }
  return out;
}

/** Discover frappe apps from frappe.yaml that have local source paths.
 *  Supports both string entries (`- ./apps/core`) and object entries (`- name: core\n  source: ./apps/core`). */
async function getFrappeApps(root: string): Promise<{ name: string; absolutePath: string }[]> {
  const frappeDir = path.join(root, 'apps', 'frappe');
  const frappeYamlPath = path.join(frappeDir, 'frappe.yaml');
  if (!fsSync.existsSync(frappeYamlPath)) {
    return [];
  }
  const raw = await fs.readFile(frappeYamlPath, 'utf-8');
  const config = YAML.parse(raw) as { apps?: (string | { name?: string; source?: string })[] };
  const out: { name: string; absolutePath: string }[] = [];
  for (const app of config?.apps ?? []) {
    let src: string;
    let name: string;
    if (typeof app === 'string') {
      src = app;
      name = path.basename(app);
    } else {
      if (!app.source || !app.name) {
        continue;
      }
      src = app.source;
      name = app.name;
    }
    src = src.startsWith('file://') ? src.slice(7) : src;
    if (!src.startsWith('./') && !src.startsWith('../') && !src.startsWith('/')) {
      continue;
    }
    const absPath = path.isAbsolute(src) ? src : path.resolve(frappeDir, src);
    if (!fsSync.existsSync(absPath)) {
      continue;
    }
    out.push({ name, absolutePath: absPath });
  }
  return out;
}

const program = new Command();
program.name('mpo');
program.version(
  JSON.parse(fsSync.readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf-8'))?.version,
);

const collect = (value: string, previous: string[]) => [...previous, value];

program
  .command('init')
  .argument('[name]', 'the project (and product app) name; with --into, the directory')
  .option('--app <name>', 'one more product app derived from apps/one (repeatable)', collect, [])
  .option('--service <name>', `singleton app to keep (repeatable): ${SINGLETON_APPS.join(', ')}`, collect, [])
  .option('--frappe', 'same as --service frappe')
  .option('--keycloak', 'same as --service keycloak')
  .option(
    '--into',
    'scaffold into an existing directory (the argument, default .); paths already there are kept and pinned in .updateignore',
  )
  .option('--source <path|url>', 'monorepo to scaffold from (default: the commit this CLI was built from)')
  .option('-c, --checkout <ref>', 'commit, tag or branch at the source')
  .option('--mpo-version <range>', 'semver range for @repo/* (default: ^<cli version at the source>)')
  .option('--skip-install', 'skip pnpm install after scaffolding')
  .option('--skip-git', 'skip git init + scaffold commit')
  .option('-y, --yes', 'non-interactive: no prompts, no services unless passed')
  .option('--verbose', 'show what the scaffold removes and skips')
  .description(
    'scaffold a project: the universal-starter-kit monorepo at one commit, pruned (no public/, only the services asked for, apps/one renamed to the product app, @repo/* at semver ranges)',
  )
  .action(async (name: string | undefined, options) => {
    const services: string[] = [...options.service];
    if (options.frappe) {
      services.push('frappe');
    }
    if (options.keycloak) {
      services.push('keycloak');
    }
    await init(name, {
      apps: options.app,
      services: services.length || options.yes || !process.stdout.isTTY ? services : undefined,
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

program
  .command('add-app')
  .argument('<name>', 'the new product app (apps/<name> + features/<name>)')
  .option('--source <path|url>', 'monorepo holding the recorded source commit (default: the recorded url)')
  .option('--skip-install', 'skip pnpm install after the merge')
  .option('--verbose', "show the scaffold's progress")
  .description(
    "add another product app from apps/one at the project's recorded source commit; the result is left uncommitted like mpo update",
  )
  .action(async (name: string, options) => {
    await addApp(name, {
      source: options.source,
      skipInstall: Boolean(options.skipInstall),
      verbose: Boolean(options.verbose),
    });
  });

program
  .command('adopt')
  .option('--frappe', 'the project adopted the Frappe client piece (env keys, provider)')
  .option('--frappe-bench', 'the project adopted the Frappe dev bench piece (docker compose)')
  .option('--keycloak', 'the project adopted the Keycloak auth piece')
  .option('--gnome', 'the project adopted the GNOME desktop target piece')
  .option('--tauri', 'the project adopted the Tauri desktop target piece')
  .option('--vscode', 'the project adopted the VS Code extension target piece')
  .option('--webext', 'the project adopted the browser extension target piece')
  .option(
    '--name <name>',
    'project name recorded in provenance (default: package.json name, scope stripped) — it renders piece paths (apps/<name>/…), so match your app directory',
  )
  .option('-y, --yes', 'non-interactive: never prompt (pieces must come from flags)')
  .description(
    'bring an existing, never-scaffolded project that hand-copied piece files under `mpo update` management: writes .mpo.json provenance (and seeds .updateignore) without changing any project file — the FIRST `mpo update` afterwards reconciles piece files (real diffs expected). For the whole monorepo scaffold use `mpo init --into`',
  )
  .action(async (options) => {
    const pieces = INIT_APP_PIECES.filter((piece) =>
      Boolean(options[piece.replaceAll(/-(\w)/gu, (_, letter: string) => letter.toUpperCase())]),
    );
    await adoptApp({
      pieces: pieces.length ? pieces : undefined,
      name: options.name,
      yes: Boolean(options.yes),
    });
  });

program
  .command('update')
  .option('--source <path|url>', 'monorepo to update from (default: the commit this CLI was built from)')
  .option('-c, --checkout <ref>', 'commit, tag or branch at the source')
  .option('--skip-install', 'skip pnpm install after the merge')
  .option('--mpo-version <range>', 'semver range for @repo/* (default: ^<cli version at the source>)')
  .option('--verbose', "show the scaffold's progress")
  .description(
    "three-way merge the monorepo's changes into this project (base = the scaffold at the recorded source commit, ours = HEAD, theirs = the scaffold at the current commit); lands in the index and worktree, never commits; refuses a dirty tree",
  )
  .action(async (options) => {
    await updateApp({
      source: options.source,
      checkout: options.checkout,
      skipInstall: Boolean(options.skipInstall),
      version: options.mpoVersion,
      verbose: Boolean(options.verbose),
    });
  });

program
  .command('wait')
  .description('wait for a service to be ready')
  .option('-i, --interval <interval>', 'interval to wait for', '1000')
  .option('-t, --timeout <timeout>', 'timeout to wait for', '600000')
  .option('-e, --dotenv <dotenv>', 'dotenv file path', '.env')
  .argument('<services>', `the services to wait for (${waitServices.join(', ')})`)
  .action(async (servicesString, options) => {
    dotenv.config({ path: options.dotenv ?? defaultDotenvPath });
    const interval = Number.parseInt(options.interval);
    const timeout = Number.parseInt(options.timeout);
    const services: string[] = servicesString.split(',');
    try {
      await waitWithSpinner(services, { interval, timeout });
    } catch {
      process.exit(1);
    }
  });

const frappe = program
  .command('frappe')
  .description('manage frappe development environment')
  .option('-e, --dotenv <dotenv>', 'dotenv file path', '.env');

frappe
  .command('bootstrap')
  .description('bootstrap frappe development environment')
  .option('-u, --update', 'update dependencies')
  .action(async (options) => {
    const parentOptions = frappe.opts();
    dotenv.config({ path: parentOptions.dotenv ?? defaultDotenvPath });
    await spawn(
      'sh',
      [
        path.resolve(import.meta.dirname, '../../scripts/frappe.sh'),
        'bootstrap',
        ...(options.update ? ['--update'] : []),
      ],
      {
        stdio: 'inherit',
        shell: true,
        cwd: projectRoot,
      },
    );
  });

frappe
  .command('clean')
  .description('clean frappe bench artifacts')
  .option('--cache', 'also remove frappe cache')
  .action(async (options) => {
    await spawn(
      'sh',
      [path.resolve(import.meta.dirname, '../../scripts/frappe.sh'), 'clean', ...(options.cache ? ['--cache'] : [])],
      {
        stdio: 'inherit',
        shell: true,
        cwd: projectRoot,
      },
    );
  });

frappe
  .command('dev')
  .description('start frappe development server')
  .action(async () => {
    const parentOptions = frappe.opts();
    dotenv.config({ path: parentOptions.dotenv ?? defaultDotenvPath });
    await spawn('sh', [path.resolve(import.meta.dirname, '../../scripts/frappe.sh'), 'dev'], {
      stdio: 'inherit',
      shell: true,
      cwd: projectRoot,
    });
  });

frappe
  .command('bench')
  .description('run bench command')
  .action(async () => {
    const parentOptions = frappe.opts();
    dotenv.config({ path: parentOptions.dotenv ?? defaultDotenvPath });
    await spawn('sh', [path.resolve(import.meta.dirname, '../../scripts/frappe.sh'), 'bench'], {
      stdio: 'inherit',
      shell: true,
      cwd: projectRoot,
    });
  });

frappe
  .command('types')
  .description('generate TypeScript types for doctypes from getdoctype (auth: $FRAPPE_API_KEY, $FRAPPE_API_SECRET)')
  .argument('<doctypes...>', 'doctype names; child tables come along')
  .option('-o, --out <file>', 'write the module here instead of stdout')
  .option('--check', 'exit 1 and print the diff when --out differs from the server')
  .option('--url <url>', 'frappe base URL (default $FRAPPE_URL or http://localhost:8000)')
  .action(async (doctypes: string[], options) => {
    const parentOptions = frappe.opts();
    dotenv.config({ path: parentOptions.dotenv ?? defaultDotenvPath, quiet: true });
    if (options.check && !options.out) {
      console.error('--check needs --out <file>');
      process.exit(2);
    }
    const generated = await generateDoctypeTypes(doctypes, {
      baseURL: options.url ?? process.env.FRAPPE_URL ?? 'http://localhost:8000',
      apiKey: process.env.FRAPPE_API_KEY,
      apiSecret: process.env.FRAPPE_API_SECRET,
    });
    if (!options.out) {
      process.stdout.write(generated);
      return;
    }
    const out = path.resolve(process.cwd(), options.out);
    if (options.check) {
      const committed = fsSync.existsSync(out) ? await fs.readFile(out, 'utf-8') : '';
      const drift = typesDrift(committed, generated);
      if (drift.length > 0) {
        console.error(`${options.out} drifted from the server:\n${drift.join('\n')}`);
        process.exit(1);
      }
      return;
    }
    await fs.writeFile(out, generated);
  });

program
  .command('build')
  .argument('[args...]', `build to run: ${[...availableServices, 'packages'].join(', ')} (default: all)`)
  .description('run build command')
  .action(async (args: string[]) => {
    const parsed = args.flatMap((arg) => arg.split(','));
    const packages = parsed.includes('packages');
    const projects = parsed.filter((arg) => arg !== 'packages');
    const presentApps = await getPresentApps(projectRoot);
    const presentServices = await getPresentServices(projectRoot);
    if ((!projects.length && !packages) || packages) {
      await spawn(
        'pnpm',
        [
          'turbo',
          'run',
          'build',
          '--filter',
          "'!./apps/*'",
          ...presentServices.flatMap((s) => ['--filter', `'!./${serviceDir(s)}'`]),
        ],
        {
          stdio: 'inherit',
          shell: true,
          cwd: projectRoot,
        },
      );
    }
    for (const platform of presentApps) {
      if ((!projects.length && !packages) || projects.includes(platform)) {
        const hasBuild = await fs
          .access(path.join(projectRoot, 'apps', platform, 'package.json'))
          .then(
            () =>
              JSON.parse(fsSync.readFileSync(path.join(projectRoot, 'apps', platform, 'package.json'), 'utf-8')).scripts
                ?.build,
          )
          .catch(() => false);
        if (hasBuild) {
          await spawn('pnpm', ['turbo', 'run', 'build', `--filter=./apps/${platform}`], {
            stdio: 'inherit',
            shell: true,
            cwd: projectRoot,
          });
        }
      }
    }
    for (const service of presentServices) {
      if ((!projects.length && !packages) || projects.includes(service)) {
        const dir = serviceDir(service);
        const hasBuild = await fs
          .access(path.join(projectRoot, dir, 'package.json'))
          .then(
            () => JSON.parse(fsSync.readFileSync(path.join(projectRoot, dir, 'package.json'), 'utf-8')).scripts?.build,
          )
          .catch(() => false);
        if (hasBuild) {
          await spawn('pnpm', ['turbo', 'run', 'build', `--filter=./${dir}`], {
            stdio: 'inherit',
            shell: true,
            cwd: projectRoot,
          });
        }
      }
    }
  });

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
  .action(async (args: string[], options) => {
    const parsed = args.flatMap((arg) => arg.split(','));

    // Handle unit tests (turbo test with dynamic excludes: missing services + E2E app, plus frappe app unit tests)
    if (parsed.includes('unit')) {
      const excludeFilters = await getTurboExcludeFiltersForMissing(projectRoot);
      const e2eApp = await discoverE2EApp(projectRoot);
      const filters = [
        ...excludeFilters.flatMap((f) => ['--filter', f]),
        ...(e2eApp ? ['--filter', `'!./apps/${e2eApp}'`] : []),
      ];
      await spawn('pnpm', ['turbo', 'run', 'test', ...filters], {
        stdio: 'inherit',
        shell: true,
        cwd: projectRoot,
      });

      // Run frappe app unit tests (exclude integration-marked tests)
      const frappeApps = await getFrappeApps(projectRoot);
      for (const app of frappeApps) {
        const hasPytest = await fs
          .access(path.join(app.absolutePath, 'pyproject.toml'))
          .then(() => true)
          .catch(() => false);
        if (hasPytest) {
          try {
            await spawn('bench', ['run-tests', '--app', app.name, '--', '-m', 'not integration'], {
              stdio: 'inherit',
              cwd: path.join(projectRoot, 'apps', 'frappe'),
            });
          } catch {
            console.warn(`frappe app ${app.name} unit tests failed (bench may not be available)`);
          }
        }
      }

      if (parsed.length === 1) {
        return;
      }
    }

    // Handle integration tests (turbo test + frappe app integration tests)
    if (parsed.includes('integration')) {
      const excludeFilters = await getTurboExcludeFiltersForMissing(projectRoot);
      const e2eApp = await discoverE2EApp(projectRoot);
      const filters = [
        ...excludeFilters.flatMap((f) => ['--filter', f]),
        ...(e2eApp ? ['--filter', `'!./apps/${e2eApp}'`] : []),
      ];
      await spawn('pnpm', ['turbo', 'run', 'test', ...filters], {
        stdio: 'inherit',
        shell: true,
        cwd: projectRoot,
      });

      // Run frappe app integration tests (only integration-marked tests)
      const frappeApps = await getFrappeApps(projectRoot);
      for (const app of frappeApps) {
        const hasPytest = await fs
          .access(path.join(app.absolutePath, 'pyproject.toml'))
          .then(() => true)
          .catch(() => false);
        if (hasPytest) {
          try {
            await spawn('bench', ['run-tests', '--app', app.name, '--', '-m', 'integration'], {
              stdio: 'inherit',
              cwd: path.join(projectRoot, 'apps', 'frappe'),
            });
          } catch {
            console.warn(`frappe app ${app.name} integration tests failed (bench may not be available)`);
          }
        }
      }

      if (parsed.length === 1) {
        return;
      }
    }

    // Handle E2E test sessions
    if (parsed.includes('e2e')) {
      const teardownHandler = () => {
        runE2ESession(projectRoot, { down: true }).then(() => process.exit(130));
      };
      if (!options.down) {
        process.on('SIGINT', teardownHandler);
        process.on('SIGTERM', teardownHandler);
      }
      await runE2ESession(projectRoot, {
        upOnly: options.upOnly,
        down: options.down,
        portOffset: Number.parseInt(options.portOffset),
        project: options.project,
        noBuild: options.build === false,
        filter: options.filter,
      });
      return;
    }

    // Handle visual regression tests (discovered dynamically from storybook + lost-pixel)
    if (parsed.includes('visual')) {
      const workspaces = await getStorybookVisualWorkspaces(projectRoot);
      if (!workspaces.length) {
        console.warn(
          'No visual regression workspaces found (.storybook + Makefile test/visual, test:visual script, or lost-pixel).',
        );
        return;
      }
      for (const w of workspaces) {
        if (w.runVisual === 'make') {
          await spawn('make', ['-C', w.absolutePath, 'test/visual'], {
            stdio: 'inherit',
            cwd: projectRoot,
          });
        } else if (w.runLostPixelAfterBuild) {
          await spawn('pnpm', ['run', 'build'], {
            stdio: 'inherit',
            cwd: w.absolutePath,
          });
          await spawn('pnpm', ['exec', 'lost-pixel'], {
            stdio: 'inherit',
            cwd: w.absolutePath,
          });
        } else if (w.pnpmScript) {
          await spawn('pnpm', ['run', w.pnpmScript], {
            stdio: 'inherit',
            cwd: w.absolutePath,
          });
        }
      }
      return;
    }
  });

/**
 * Run ruff format or check on the Frappe Python apps (if present).
 * Returns true if the ruff step failed.
 */
async function ruffStep(mode: 'format' | 'check'): Promise<boolean> {
  const frappeApps = path.join(projectRoot, 'apps', 'frappe', 'apps');
  if (!fsSync.existsSync(frappeApps)) {
    return false;
  }
  const label = mode === 'format' ? 'ruff format' : 'ruff check';
  console.log(`\n── ${label} (Python) ──`);
  try {
    await spawn('ruff', [mode, frappeApps], {
      stdio: 'inherit',
      cwd: projectRoot,
    });
    return false;
  } catch {
    return true;
  }
}

program
  .command('format')
  .description('format all supported files (TS, Python, etc.) via turbo')
  .action(async () => {
    await spawn('turbo', ['run', 'format', '--filter=//'], {
      stdio: 'inherit',
      cwd: projectRoot,
    });
    await ruffStep('format');
  });

program
  .command('lint')
  .description('lint and typecheck all supported files (TS, Python, etc.) via turbo')
  .action(async () => {
    const excludeFilters = await getTurboExcludeFiltersForMissing(projectRoot);
    let turboFailed = false;
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
          ...excludeFilters.flatMap((f) => ['--filter', f]),
        ],
        { stdio: 'inherit', cwd: projectRoot },
      );
    } catch {
      turboFailed = true;
    }
    const ruffFailed = await ruffStep('check');
    if (turboFailed || ruffFailed) {
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
    await spawn('pnpm', ['turbo', 'run', 'generate'], {
      stdio: 'inherit',
      shell: true,
      cwd: projectRoot,
    });
  });

// One-line errors instead of raw stack traces (matches the
// create-multiplatform-app bin). Stacks stay available via MPO_DEBUG=1.
program.parseAsync(process.argv).catch((caught: unknown) => {
  const error = caught as Error;
  if (process.env.MPO_DEBUG) console.error(error);
  else console.error(`✖ ${error.message ?? String(error)}`);
  process.exit(1);
});

async function waitWithSpinner(services: string[], options: { interval?: number; timeout?: number } = {}) {
  const { interval = 1000, timeout = 600_000 } = options;
  const waitFunctions = {
    frappe: waitForFrappe,
    postgres: waitForPostgres,
    keycloak: waitForKeycloak,
  };
  const unreadyServices = [...services];
  const spinner = yoctoSpinner({
    text: `waiting for ${formatServiceList(unreadyServices)}`,
  }).start();
  function updateSpinner(readyService: string) {
    unreadyServices.splice(unreadyServices.indexOf(readyService), 1);
    spinner.success(`${readyService} is ready`);
    if (unreadyServices.length) {
      spinner.start(`waiting for ${formatServiceList(unreadyServices)}`);
    }
  }
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.all(
        services.map(async (service) => {
          const waitFn = waitFunctions[service];
          if (!waitFn) {
            throw new Error(`Unknown service: ${service}`);
          }
          await waitFn(interval);
          updateSpinner(service);
        }),
      ),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Timeout'));
        }, timeout);
      }),
    ]);
  } catch (caught) {
    const error = caught as Error;
    if (error.message === 'Timeout') {
      spinner.error(`${formatServiceList(unreadyServices)} timed out after ${timeout}ms`);
    } else {
      spinner.error(error.message);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
