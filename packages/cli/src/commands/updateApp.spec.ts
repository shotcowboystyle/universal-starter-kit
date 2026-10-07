import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import spawn from 'nano-spawn';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { addApp } from './addApp';
import { adoptApp } from './adoptApp';
import { init } from './init';
import { piecesRoot, scaffoldPieces } from './pieces';
import { cliVersion, readProvenance } from './provenance';
import { updateApp } from './updateApp';

// Every scaffold below reads THIS checkout at HEAD (resolveSource finds the
// monorepo around public/cli), so the suite exercises the real scaffold.sh
// against the real tree. Scaffolds take a few seconds each.
const monorepo = fileURLToPath(new URL('../../../..', import.meta.url));
const heavy = 300_000;
const json = (value: unknown) => JSON.stringify(value, null, 2);
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));

async function gitOut(cwd: string, args: string[]): Promise<string> {
  const result = await spawn('git', args, { cwd });
  return result.stdout.trim();
}

async function identity(dir: string): Promise<void> {
  await spawn('git', ['config', 'user.email', 'spec@example.com'], { cwd: dir });
  await spawn('git', ['config', 'user.name', 'Spec'], { cwd: dir });
}

async function commitAll(dir: string, message: string): Promise<string> {
  await spawn('git', ['add', '-A'], { cwd: dir });
  await spawn('git', ['commit', '--quiet', '-m', message], { cwd: dir });
  return await gitOut(dir, ['rev-parse', 'HEAD']);
}

async function initRepo(dir: string): Promise<string> {
  await spawn('git', ['init', '--quiet'], { cwd: dir });
  await identity(dir);
  return await commitAll(dir, 'chore: fixture');
}

function writeFiles(dir: string, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
}

function replaceFirstLine(file: string, line: string): void {
  const rest = readFileSync(file, 'utf-8').split('\n').slice(1).join('\n');
  writeFileSync(file, `${line}\n${rest}`);
}

describe('clone-derived project: init → update → add-app', () => {
  let sandbox: string;
  let previousCwd: string;
  let project: string;
  /** A second clone of the monorepo that moves ahead of the recorded commit. */
  let source: string;

  beforeAll(async () => {
    sandbox = mkdtempSync(join(tmpdir(), 'mpo-update-spec-'));
    previousCwd = process.cwd();
    process.chdir(sandbox);
    await init('shop', {
      apps: ['admin'],
      services: [],
      skipInstall: true,
      skipGit: true,
      yes: true,
    });
    project = join(sandbox, 'shop');
    await initRepo(project);

    source = join(sandbox, 'source');
    const head = await gitOut(monorepo, ['rev-parse', 'HEAD']);
    await spawn('git', ['clone', '--quiet', '--shared', '--no-checkout', monorepo, source]);
    await spawn('git', ['checkout', '--quiet', head], { cwd: source });
    await identity(source);
  }, heavy);

  afterEach(() => {
    process.chdir(previousCwd);
  });

  afterAll(() => {
    process.chdir(previousCwd);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it(
    'merges a One-app change into every product app, commits nothing, then goes quiet',
    async () => {
      // The monorepo moves: apps/one gains a file and a README line.
      writeFileSync(join(source, 'apps/one/hello.txt'), 'hello from one\n');
      writeFileSync(
        join(source, 'apps/one/README.md'),
        `${readFileSync(join(source, 'apps/one/README.md'), 'utf-8')}\nAdded upstream.\n`,
      );
      const upstream = await commitAll(source, 'feat: hello');

      process.chdir(project);
      const headBefore = await gitOut(project, ['rev-parse', 'HEAD']);
      await updateApp({ source, skipInstall: true });

      // Nothing committed: HEAD stands, the merge sits in index + worktree.
      await expect(gitOut(project, ['rev-parse', 'HEAD'])).resolves.toBe(headBefore);
      await expect(gitOut(project, ['status', '--porcelain'])).resolves.not.toBe('');
      const staged = await gitOut(project, ['diff', '--cached', '--name-only']);
      expect(staged).toContain('apps/shop/hello.txt');
      expect(staged).toContain('apps/admin/hello.txt');
      for (const app of ['shop', 'admin']) {
        expect(readFileSync(join(project, `apps/${app}/hello.txt`), 'utf-8')).toBe('hello from one\n');
        expect(readFileSync(join(project, `apps/${app}/README.md`), 'utf-8')).toContain('Added upstream.');
      }
      expect(existsSync(join(project, 'public'))).toBe(false);
      const provenance = readProvenance(project);
      expect(provenance?.source?.sha).toBe(upstream);
      expect(provenance?.apps).toEqual(['shop', 'admin']);

      // Commit as instructed; an immediate re-run changes nothing.
      const committed = await commitAll(project, 'chore: mpo update');
      await updateApp({ source, skipInstall: true });
      await expect(gitOut(project, ['rev-parse', 'HEAD'])).resolves.toBe(committed);
      await expect(gitOut(project, ['status', '--porcelain'])).resolves.toBe('');
    },
    heavy,
  );

  it('refuses a dirty tree before touching anything', async () => {
    process.chdir(project);
    const readme = join(project, 'README.md');
    const original = readFileSync(readme, 'utf-8');
    writeFileSync(readme, `${original}dirty\n`);
    await expect(updateApp({ source, skipInstall: true })).rejects.toThrow(
      /clean working tree \(unstaged changes present\)/,
    );
    writeFileSync(readme, original);
    await spawn('git', ['add', '-A'], { cwd: project });
    writeFileSync(readme, `${original}staged\n`);
    await spawn('git', ['add', '--', 'README.md'], { cwd: project });
    await expect(updateApp({ source, skipInstall: true })).rejects.toThrow(/staged changes present/);
    writeFileSync(readme, original);
    await spawn('git', ['add', '--', 'README.md'], { cwd: project });
    await expect(gitOut(project, ['status', '--porcelain'])).resolves.toBe('');
  });

  it(
    'a two-sided change shows conflict markers; .updateignore pins hold',
    async () => {
      process.chdir(project);
      // The project rewrites the first README line of one app and pins the other.
      replaceFirstLine(join(project, 'apps/shop/README.md'), '# shop, customized');
      writeFileSync(join(project, '.updateignore'), 'apps/admin/README.md\n');
      await commitAll(project, 'feat: customize shop');
      const pinned = readFileSync(join(project, 'apps/admin/README.md'), 'utf-8');
      // The monorepo rewrites the same line.
      replaceFirstLine(join(source, 'apps/one/README.md'), '# one, changed upstream');
      const upstream = await commitAll(source, 'docs: retitle');

      const headBefore = await gitOut(project, ['rev-parse', 'HEAD']);
      await updateApp({ source, skipInstall: true });
      await expect(gitOut(project, ['rev-parse', 'HEAD'])).resolves.toBe(headBefore);
      const conflicted = readFileSync(join(project, 'apps/shop/README.md'), 'utf-8');
      expect(conflicted).toContain('<<<<<<<');
      expect(conflicted).toContain('# shop, customized');
      expect(conflicted).toContain('# one, changed upstream');
      expect(conflicted).toContain('>>>>>>>');
      // The pinned app took nothing: HEAD's bytes, no markers.
      expect(readFileSync(join(project, 'apps/admin/README.md'), 'utf-8')).toBe(pinned);
      expect(readProvenance(project)?.source?.sha).toBe(upstream);

      // Resolve, commit, and the next run is a no-op.
      replaceFirstLine(join(project, 'apps/shop/README.md'), '# shop, resolved');
      writeFileSync(
        join(project, 'apps/shop/README.md'),
        readFileSync(join(project, 'apps/shop/README.md'), 'utf-8').replace(
          /<<<<<<<[^\n]*\n[\s\S]*?>>>>>>>[^\n]*\n/,
          '',
        ),
      );
      const committed = await commitAll(project, 'chore: mpo update (resolved)');
      await updateApp({ source, skipInstall: true });
      await expect(gitOut(project, ['rev-parse', 'HEAD'])).resolves.toBe(committed);
      await expect(gitOut(project, ['status', '--porcelain'])).resolves.toBe('');
    },
    heavy,
  );

  it(
    'add-app lands one more product app at the recorded commit, uncommitted',
    async () => {
      process.chdir(project);
      const headBefore = await gitOut(project, ['rev-parse', 'HEAD']);
      const shopReadme = readFileSync(join(project, 'apps/shop/README.md'), 'utf-8');
      await addApp('kiosk', { skipInstall: true });

      await expect(gitOut(project, ['rev-parse', 'HEAD'])).resolves.toBe(headBefore);
      await expect(gitOut(project, ['status', '--porcelain'])).resolves.not.toBe('');
      expect(readJson(join(project, 'apps/kiosk/package.json')).name).toBe('@app/kiosk');
      expect(existsSync(join(project, 'features/kiosk/screen.tsx'))).toBe(true);
      expect(readFileSync(join(project, 'Makefile'), 'utf-8')).toContain('kiosk/%: configure FORCE');
      expect(readJson(join(project, 'package.json')).scripts['dev:kiosk']).toBe('pnpm --filter @app/kiosk dev');
      // The project's own edits are not part of the diff.
      expect(readFileSync(join(project, 'apps/shop/README.md'), 'utf-8')).toBe(shopReadme);
      expect(readProvenance(project)?.apps).toEqual(['shop', 'admin', 'kiosk']);

      await commitAll(project, 'feat: add app kiosk');
      await expect(addApp('kiosk', { skipInstall: true })).rejects.toThrow(/already a product app/);
    },
    heavy,
  );
});

describe('template-era project', () => {
  let sandbox: string;
  let previousCwd: string;

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'mpo-update-legacy-spec-'));
    previousCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(previousCwd);
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it(
    'reconciles from an empty base and becomes clone-derived',
    async () => {
      const dir = join(sandbox, 'legacy');
      writeFiles(dir, {
        'package.json': json({ name: 'legacy', private: true, scripts: { custom: 'echo custom' } }),
        'README.md': '# legacy\n',
        'apps/legacy/package.json': json({ name: '@app/legacy', private: true }),
        '.mpo.json': json({
          template: 'universal',
          cliVersion: '7.7.1',
          name: 'legacy',
          mpoVersion: '^7.7.1',
          pieces: [],
        }),
      });
      const head = await initRepo(dir);
      process.chdir(dir);

      await updateApp({ skipInstall: true });
      await expect(gitOut(dir, ['rev-parse', 'HEAD'])).resolves.toBe(head);
      // The One app landed under the project's name…
      expect(existsSync(join(dir, 'apps/legacy/app.config.js'))).toBe(true);
      expect(existsSync(join(dir, 'features/legacy/screen.tsx'))).toBe(true);
      // …shared files that both sides wrote carry markers…
      expect(readFileSync(join(dir, 'README.md'), 'utf-8')).toContain('<<<<<<<');
      // …package.json resolved structurally (custom script kept, scaffold scripts added).
      const pkg = readJson(join(dir, 'package.json'));
      expect(pkg.scripts.custom).toBe('echo custom');
      expect(pkg.scripts.dev).toBe('pnpm --filter @app/legacy dev');
      const provenance = readProvenance(dir);
      expect(provenance?.template).toBeUndefined();
      expect(provenance?.source?.sha).toBe(await gitOut(monorepo, ['rev-parse', 'HEAD']));
      expect(provenance?.apps).toEqual(['legacy']);
    },
    heavy,
  );
});

describe('project scaffolded while the scaffold mapped @repo to Pulp (MPO-289)', () => {
  let sandbox: string;
  let previousCwd: string;
  // The .pnpmfile.cjs that MPO-343 shipped, byte for byte.
  const pulpPnpmfile = `// A project's .pnpmfile.cjs. @repo/* is published to Pulp, not
// npmjs. The scope is mapped here because pnpm drops the whole .npmrc when a
// variable it names (NPM_AUTH_TOKEN) is unset, and pnpm-workspace.yaml cannot
// map a scope. A mapping an .npmrc does carry wins.
module.exports = {
  hooks: {
    updateConfig(config) {
      config.registries["@repo"] ??=
        "https://artifacts.peanutbutterporkchop.com/pulp/content/universal-starter-kit/";
      return config;
    },
  },
};\n`;

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'mpo-update-pnpmfile-spec-'));
    previousCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(previousCwd);
  });

  afterAll(() => {
    process.chdir(previousCwd);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it(
    'loses .pnpmfile.cjs and its lockfile checksum on update to this checkout, both staged',
    async () => {
      const source = join(sandbox, 'source');
      const head = await gitOut(monorepo, ['rev-parse', 'HEAD']);
      await spawn('git', ['clone', '--quiet', '--shared', '--no-checkout', monorepo, source]);
      await spawn('git', ['checkout', '--quiet', head], { cwd: source });
      await identity(source);
      writeFileSync(join(source, 'public/cli/templates/pnpmfile.cjs'), pulpPnpmfile);
      await spawn('git', ['add', '-A'], { cwd: source });
      await spawn('git', ['commit', '--quiet', '--allow-empty', '-m', 'chore: the Pulp pnpmfile'], {
        cwd: source,
      });
      const pulpEra = await gitOut(source, ['rev-parse', 'HEAD']);

      process.chdir(sandbox);
      await init('pulp', {
        source,
        checkout: pulpEra,
        skipInstall: true,
        skipGit: true,
        yes: true,
      });
      const project = join(sandbox, 'pulp');
      await initRepo(project);
      expect(readFileSync(join(project, '.pnpmfile.cjs'), 'utf-8')).toBe(pulpPnpmfile);
      expect(readFileSync(join(project, 'pnpm-lock.yaml'), 'utf-8')).toMatch(/^pnpmfileChecksum: /m);

      // The monorepo moves on to exactly this checkout's tree.
      const tree = await gitOut(source, ['rev-parse', `${head}^{tree}`]);
      const next = await gitOut(source, ['commit-tree', tree, '-p', pulpEra, '-m', 'chore: npmjs']);
      await spawn('git', ['checkout', '--quiet', next], { cwd: source });
      process.chdir(project);
      await updateApp({ source, skipInstall: true });
      expect(existsSync(join(project, '.pnpmfile.cjs'))).toBe(false);
      expect(readFileSync(join(project, 'pnpm-lock.yaml'), 'utf-8')).not.toMatch(/^pnpmfileChecksum:/m);
      const staged = (await gitOut(project, ['diff', '--cached', '--name-status'])).split('\n');
      expect(staged).toContain('D\t.pnpmfile.cjs');
      expect(staged).toContain('M\tpnpm-lock.yaml');
    },
    heavy,
  );
});

describe('adopted project (pieces)', () => {
  const currentVersion = cliVersion()!;
  const currentRange = `^${currentVersion}`;
  let sandbox: string;
  let previousCwd: string;
  let canonical: string;

  /** The pieces-only tree an adopted webext project is reconciled against. */
  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'mpo-update-adopted-spec-'));
    previousCwd = process.cwd();
    canonical = join(sandbox, 'canonical');
    scaffoldPieces(canonical, { name: 'fake-ext', mpoVersion: currentRange, pieces: ['webext'] });
  });

  afterEach(() => {
    process.chdir(previousCwd);
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it(
    'first update reconciles from an empty base without committing; the next run is a no-op',
    async () => {
      const dir = join(sandbox, 'adopted-clean', 'fake-ext');
      writeFiles(dir, {
        'package.json': json({
          name: '@fake/fake-ext',
          private: true,
          scripts: { custom: 'echo custom' },
        }),
        'src/index.ts': 'export const custom = true;\n',
        'apps/fake-ext/webext/manifest.ts': readFileSync(join(canonical, 'apps/fake-ext/webext/manifest.ts'), 'utf-8'),
      });
      await initRepo(dir);
      process.chdir(dir);

      await adoptApp({ pieces: ['webext'], yes: true });
      expect(readProvenance(dir)?.reconciled).toBe(false);
      const head = await gitOut(dir, ['rev-parse', 'HEAD']);

      await updateApp({ skipInstall: true });

      for (const file of [
        'apps/fake-ext/vite.config.webext.ts',
        'apps/fake-ext/vite.config.webext-background.ts',
        'apps/fake-ext/webext/background/main.ts',
        'apps/fake-ext/webext/views/popup/main.tsx',
        'apps/fake-ext/package.json',
      ]) {
        expect(existsSync(join(dir, file)), `missing ${file}`).toBe(true);
      }
      expect(readFileSync(join(dir, 'apps/fake-ext/webext/manifest.ts'), 'utf-8')).toBe(
        readFileSync(join(canonical, 'apps/fake-ext/webext/manifest.ts'), 'utf-8'),
      );
      expect(readFileSync(join(dir, 'src/index.ts'), 'utf-8')).toBe('export const custom = true;\n');
      const rootPkg = readJson(join(dir, 'package.json'));
      expect(rootPkg.scripts.custom).toBe('echo custom');
      expect(rootPkg.scripts['build:webext']).toBe('pnpm --filter @app/fake-ext build:webext');

      // Landed, not committed; the flag is cleared for the commit the user makes.
      await expect(gitOut(dir, ['rev-parse', 'HEAD'])).resolves.toBe(head);
      await expect(gitOut(dir, ['status', '--porcelain'])).resolves.not.toBe('');
      expect(readProvenance(dir)?.reconciled).toBeUndefined();
      expect(readProvenance(dir)?.cliVersion).toBe(currentVersion);

      const committed = await commitAll(dir, 'chore: mpo update');
      await updateApp({ skipInstall: true });
      await expect(gitOut(dir, ['rev-parse', 'HEAD'])).resolves.toBe(committed);
      await expect(gitOut(dir, ['status', '--porcelain'])).resolves.toBe('');
    },
    heavy,
  );

  it(
    'divergent hand-copied files surface conflict markers, then updates go quiet',
    async () => {
      const dir = join(sandbox, 'adopted-divergent', 'fake-ext');
      writeFiles(dir, {
        'package.json': json({ name: 'fake-ext', private: true }),
        'apps/fake-ext/webext/manifest.ts': '// hand-rolled manifest, diverged\n',
      });
      await initRepo(dir);
      process.chdir(dir);

      await adoptApp({ pieces: ['webext'], yes: true });
      await updateApp({ skipInstall: true });

      const manifest = readFileSync(join(dir, 'apps/fake-ext/webext/manifest.ts'), 'utf-8');
      expect(manifest).toContain('<<<<<<<');
      expect(manifest).toContain('>>>>>>>');
      expect(readProvenance(dir)?.reconciled).toBeUndefined();

      writeFileSync(
        join(dir, 'apps/fake-ext/webext/manifest.ts'),
        readFileSync(join(canonical, 'apps/fake-ext/webext/manifest.ts'), 'utf-8'),
      );
      const committed = await commitAll(dir, 'chore: mpo update (resolved)');
      await updateApp({ skipInstall: true });
      await expect(gitOut(dir, ['rev-parse', 'HEAD'])).resolves.toBe(committed);
      await expect(gitOut(dir, ['status', '--porcelain'])).resolves.toBe('');
    },
    heavy,
  );

  it(
    '.updateignore: dir/** normalizes to a directory pin; HEAD wins including absence',
    async () => {
      const dir = join(sandbox, 'adopted-pinned', 'fake-ext');
      writeFiles(dir, {
        'package.json': json({ name: 'fake-ext', private: true }),
        'apps/fake-ext/webext/manifest.ts': '// bespoke manifest — never reconcile\n',
        '.updateignore': '# bespoke surface\napps/fake-ext/webext/**\n',
      });
      await initRepo(dir);
      process.chdir(dir);

      await adoptApp({ pieces: ['webext'], yes: true });
      await updateApp({ skipInstall: true });

      expect(readFileSync(join(dir, 'apps/fake-ext/webext/manifest.ts'), 'utf-8')).toBe(
        '// bespoke manifest — never reconcile\n',
      );
      expect(existsSync(join(dir, 'apps/fake-ext/webext/views/popup/main.tsx'))).toBe(false);
      expect(existsSync(join(dir, 'apps/fake-ext/vite.config.webext.ts'))).toBe(true);

      const committed = await commitAll(dir, 'chore: mpo update');
      await updateApp({ skipInstall: true });
      await expect(gitOut(dir, ['rev-parse', 'HEAD'])).resolves.toBe(committed);
      await expect(gitOut(dir, ['status', '--porcelain'])).resolves.toBe('');
    },
    heavy,
  );

  it(
    '.updateignore: a genuinely glob-shaped entry is refused loudly',
    async () => {
      const dir = join(sandbox, 'adopted-badglob', 'fake-ext');
      writeFiles(dir, {
        'package.json': json({ name: 'fake-ext', private: true }),
        '.updateignore': 'apps/*.config.ts\n',
      });
      await initRepo(dir);
      process.chdir(dir);

      await adoptApp({ pieces: ['webext'], yes: true });
      await expect(updateApp({ skipInstall: true })).rejects.toThrow(/looks like a glob/);
    },
    heavy,
  );

  it(
    'a Frappe client adoption updates cleanly and never gains a bench (MPO-241)',
    async () => {
      const dir = join(sandbox, 'adopted-frappe-client', 'shop');
      writeFiles(dir, { 'package.json': json({ name: 'shop', private: true }) });
      await initRepo(dir);
      process.chdir(dir);

      await adoptApp({ pieces: ['frappe'], yes: true });
      await updateApp({ skipInstall: true });
      expect(readFileSync(join(dir, 'apps/shop/src/app.ts'), 'utf-8')).toContain('FRAPPE_URL');
      expect(existsSync(join(dir, 'docker'))).toBe(false);

      const committed = await commitAll(dir, 'chore: mpo update');
      await updateApp({ skipInstall: true });
      await expect(gitOut(dir, ['rev-parse', 'HEAD'])).resolves.toBe(committed);
      await expect(gitOut(dir, ['status', '--porcelain'])).resolves.toBe('');
      expect(readProvenance(dir)?.pieces).toEqual(['frappe']);
    },
    heavy,
  );

  it(
    'an adoption recorded when frappe carried the bench keeps the bench (MPO-241)',
    async () => {
      // v0.0.1 of a stand-in monorepo, whose frappe piece still bundles the bench.
      const oldSource = join(sandbox, 'pre-split-source');
      const oldPieces = join(oldSource, 'public/cli/templates/pieces');
      cpSync(join(piecesRoot(), 'frappe'), join(oldPieces, 'frappe'), { recursive: true });
      cpSync(join(piecesRoot(), 'frappe-bench/universal/docker'), join(oldPieces, 'frappe/universal/docker'), {
        recursive: true,
      });
      await initRepo(oldSource);
      await spawn('git', ['tag', 'v0.0.1'], { cwd: oldSource });

      const dir = join(sandbox, 'adopted-pre-split', 'shop');
      scaffoldPieces(dir, {
        name: 'shop',
        mpoVersion: '^0.0.1',
        pieces: ['frappe'],
        root: oldPieces,
      });
      writeFiles(dir, {
        'package.json': json({ name: 'shop', private: true }),
        '.mpo.json': json({
          template: 'none',
          cliVersion: '0.0.1',
          name: 'shop',
          mpoVersion: '^0.0.1',
          apps: [],
          services: [],
          pieces: ['frappe'],
        }),
      });
      const compose = readFileSync(join(dir, 'docker/compose.frappe.yaml'), 'utf-8');
      await initRepo(dir);
      process.chdir(dir);

      await updateApp({ source: oldSource, skipInstall: true });
      expect(readFileSync(join(dir, 'docker/compose.frappe.yaml'), 'utf-8')).toBe(compose);
      expect(readFileSync(join(dir, 'README.md'), 'utf-8')).toContain('bench start');
      expect(readProvenance(dir)?.pieces).toEqual(['frappe', 'frappe-bench']);

      const committed = await commitAll(dir, 'chore: mpo update');
      await updateApp({ skipInstall: true });
      await expect(gitOut(dir, ['rev-parse', 'HEAD'])).resolves.toBe(committed);
      await expect(gitOut(dir, ['status', '--porcelain'])).resolves.toBe('');
    },
    heavy,
  );
});
