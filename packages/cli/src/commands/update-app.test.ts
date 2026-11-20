import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import spawn from 'nano-spawn';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { addApp } from './add-app';
import { adoptApp } from './adopt-app';
import { init } from './init';
import { scaffoldPieces } from './pieces';
import type { JsonValue } from './pieces';
import { cliVersion, readProvenance } from './provenance';
import { updateApp } from './update-app';

// Every scaffold below reads THIS checkout at HEAD (resolveSource finds the
// monorepo around packages/cli), so the suite exercises the real scaffold.sh
// against the real tree. Scaffolds take a few seconds each.
const monorepo = fileURLToPath(new URL('../../../..', import.meta.url));
const heavy = 300_000;
const json = (value: JsonValue) => JSON.stringify(value, null, 2);
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf-8'));

const gitOut = async (cwd: string, args: string[]): Promise<string> => {
  const result = await spawn('git', args, { cwd });
  return result.stdout.trim();
};

const identity = async (dir: string): Promise<void> => {
  await spawn('git', ['config', 'user.email', 'spec@example.com'], { cwd: dir });
  await spawn('git', ['config', 'user.name', 'Spec'], { cwd: dir });
};

const commitAll = async (dir: string, message: string): Promise<string> => {
  await spawn('git', ['add', '-A'], { cwd: dir });
  await spawn('git', ['commit', '--quiet', '-m', message], { cwd: dir });
  return await gitOut(dir, ['rev-parse', 'HEAD']);
};

const initRepo = async (dir: string): Promise<string> => {
  await spawn('git', ['init', '--quiet'], { cwd: dir });
  await identity(dir);
  return await commitAll(dir, 'chore: fixture');
};

const writeFiles = (dir: string, files: Record<string, string>): void => {
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
};

const replaceFirstLine = (file: string, line: string): void => {
  const rest = readFileSync(file, 'utf-8').split('\n').slice(1).join('\n');
  writeFileSync(file, `${line}\n${rest}`);
};

describe('clone-derived project: init → update → add-app', () => {
  let sandbox: string;
  let previousCwd: string;
  let project: string;
  /** A second clone of the monorepo that moves ahead of the recorded commit. */
  let source: string;

  beforeAll(async () => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'mpo-update-spec-'));
    previousCwd = process.cwd();
    process.chdir(sandbox);
    await init('shop', {
      apps: ['admin'],
      services: [],
      skipInstall: true,
      skipGit: true,
      yes: true,
    });
    project = path.join(sandbox, 'shop');
    await initRepo(project);

    source = path.join(sandbox, 'source');
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
      writeFileSync(path.join(source, 'apps/one/hello.txt'), 'hello from one\n');
      writeFileSync(
        path.join(source, 'apps/one/README.md'),
        `${readFileSync(path.join(source, 'apps/one/README.md'), 'utf-8')}\nAdded upstream.\n`,
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
        expect(readFileSync(path.join(project, `apps/${app}/hello.txt`), 'utf-8')).toBe('hello from one\n');
        expect(readFileSync(path.join(project, `apps/${app}/README.md`), 'utf-8')).toContain('Added upstream.');
      }
      expect(existsSync(path.join(project, 'public'))).toBe(false);
      const provenance = readProvenance(project);
      expect(provenance?.source?.sha).toBe(upstream);
      expect(provenance?.apps).toStrictEqual(['shop', 'admin']);

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
    const readme = path.join(project, 'README.md');
    const original = readFileSync(readme, 'utf-8');
    writeFileSync(readme, `${original}dirty\n`);
    await expect(updateApp({ source, skipInstall: true })).rejects.toThrow(
      /clean working tree \(unstaged changes present\)/u,
    );
    writeFileSync(readme, original);
    await spawn('git', ['add', '-A'], { cwd: project });
    writeFileSync(readme, `${original}staged\n`);
    await spawn('git', ['add', '--', 'README.md'], { cwd: project });
    await expect(updateApp({ source, skipInstall: true })).rejects.toThrow(/staged changes present/u);
    writeFileSync(readme, original);
    await spawn('git', ['add', '--', 'README.md'], { cwd: project });
    await expect(gitOut(project, ['status', '--porcelain'])).resolves.toBe('');
  });

  it(
    'a two-sided change shows conflict markers; .updateignore pins hold',
    async () => {
      process.chdir(project);
      // The project rewrites the first README line of one app and pins the other.
      replaceFirstLine(path.join(project, 'apps/shop/README.md'), '# shop, customized');
      writeFileSync(path.join(project, '.updateignore'), 'apps/admin/README.md\n');
      await commitAll(project, 'feat: customize shop');
      const pinned = readFileSync(path.join(project, 'apps/admin/README.md'), 'utf-8');
      // The monorepo rewrites the same line.
      replaceFirstLine(path.join(source, 'apps/one/README.md'), '# one, changed upstream');
      const upstream = await commitAll(source, 'docs: retitle');

      const headBefore = await gitOut(project, ['rev-parse', 'HEAD']);
      await updateApp({ source, skipInstall: true });
      await expect(gitOut(project, ['rev-parse', 'HEAD'])).resolves.toBe(headBefore);
      const conflicted = readFileSync(path.join(project, 'apps/shop/README.md'), 'utf-8');
      expect(conflicted).toContain('<<<<<<<');
      expect(conflicted).toContain('# shop, customized');
      expect(conflicted).toContain('# one, changed upstream');
      expect(conflicted).toContain('>>>>>>>');
      // The pinned app took nothing: HEAD's bytes, no markers.
      expect(readFileSync(path.join(project, 'apps/admin/README.md'), 'utf-8')).toBe(pinned);
      expect(readProvenance(project)?.source?.sha).toBe(upstream);

      // Resolve, commit, and the next run is a no-op.
      replaceFirstLine(path.join(project, 'apps/shop/README.md'), '# shop, resolved');
      writeFileSync(
        path.join(project, 'apps/shop/README.md'),
        readFileSync(path.join(project, 'apps/shop/README.md'), 'utf-8').replace(/^<{7}.*\n(?:.*\n)*?>{7}.*\n/mu, ''),
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
      const shopReadme = readFileSync(path.join(project, 'apps/shop/README.md'), 'utf-8');
      await addApp('kiosk', { skipInstall: true });

      await expect(gitOut(project, ['rev-parse', 'HEAD'])).resolves.toBe(headBefore);
      await expect(gitOut(project, ['status', '--porcelain'])).resolves.not.toBe('');
      expect(readJson(path.join(project, 'apps/kiosk/package.json')).name).toBe('@app/kiosk');
      expect(existsSync(path.join(project, 'features/kiosk/screen.tsx'))).toBe(true);
      expect(readFileSync(path.join(project, 'Makefile'), 'utf-8')).toContain('kiosk/%: configure FORCE');
      expect(readJson(path.join(project, 'package.json')).scripts['dev:kiosk']).toBe('pnpm --filter @app/kiosk dev');
      // The project's own edits are not part of the diff.
      expect(readFileSync(path.join(project, 'apps/shop/README.md'), 'utf-8')).toBe(shopReadme);
      expect(readProvenance(project)?.apps).toStrictEqual(['shop', 'admin', 'kiosk']);

      await commitAll(project, 'feat: add app kiosk');
      await expect(addApp('kiosk', { skipInstall: true })).rejects.toThrow(/already a product app/u);
    },
    heavy,
  );
});

describe('template-era project', () => {
  let sandbox: string;
  let previousCwd: string;

  beforeAll(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'mpo-update-legacy-spec-'));
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
      const dir = path.join(sandbox, 'legacy');
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
      expect(existsSync(path.join(dir, 'apps/legacy/app.config.js'))).toBe(true);
      expect(existsSync(path.join(dir, 'features/legacy/screen.tsx'))).toBe(true);
      // …shared files that both sides wrote carry markers…
      expect(readFileSync(path.join(dir, 'README.md'), 'utf-8')).toContain('<<<<<<<');
      // …package.json resolved structurally (custom script kept, scaffold scripts added).
      const pkg = readJson(path.join(dir, 'package.json'));
      expect(pkg.scripts.custom).toBe('echo custom');
      expect(pkg.scripts.dev).toBe('pnpm --filter @app/legacy dev');
      const provenance = readProvenance(dir);
      expect(provenance?.template).toBeUndefined();
      expect(provenance?.source?.sha).toBe(await gitOut(monorepo, ['rev-parse', 'HEAD']));
      expect(provenance?.apps).toStrictEqual(['legacy']);
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
    sandbox = mkdtempSync(path.join(tmpdir(), 'mpo-update-pnpmfile-spec-'));
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
      const source = path.join(sandbox, 'source');
      const head = await gitOut(monorepo, ['rev-parse', 'HEAD']);
      await spawn('git', ['clone', '--quiet', '--shared', '--no-checkout', monorepo, source]);
      await spawn('git', ['checkout', '--quiet', head], { cwd: source });
      await identity(source);
      writeFileSync(path.join(source, 'packages/cli/templates/pnpmfile.cjs'), pulpPnpmfile);
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
      const project = path.join(sandbox, 'pulp');
      await initRepo(project);
      expect(readFileSync(path.join(project, '.pnpmfile.cjs'), 'utf-8')).toBe(pulpPnpmfile);
      expect(readFileSync(path.join(project, 'pnpm-lock.yaml'), 'utf-8')).toMatch(/^pnpmfileChecksum: /mu);

      // The monorepo moves on to exactly this checkout's tree.
      const tree = await gitOut(source, ['rev-parse', `${head}^{tree}`]);
      const next = await gitOut(source, ['commit-tree', tree, '-p', pulpEra, '-m', 'chore: npmjs']);
      await spawn('git', ['checkout', '--quiet', next], { cwd: source });
      process.chdir(project);
      await updateApp({ source, skipInstall: true });
      expect(existsSync(path.join(project, '.pnpmfile.cjs'))).toBe(false);
      expect(readFileSync(path.join(project, 'pnpm-lock.yaml'), 'utf-8')).not.toMatch(/^pnpmfileChecksum:/mu);
      const stagedOutput = await gitOut(project, ['diff', '--cached', '--name-status']);
      const staged = stagedOutput.split('\n');
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
    sandbox = mkdtempSync(path.join(tmpdir(), 'mpo-update-adopted-spec-'));
    previousCwd = process.cwd();
    canonical = path.join(sandbox, 'canonical');
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
      const dir = path.join(sandbox, 'adopted-clean', 'fake-ext');
      writeFiles(dir, {
        'package.json': json({
          name: '@fake/fake-ext',
          private: true,
          scripts: { custom: 'echo custom' },
        }),
        'src/index.ts': 'export const custom = true;\n',
        'apps/fake-ext/webext/manifest.ts': readFileSync(
          path.join(canonical, 'apps/fake-ext/webext/manifest.ts'),
          'utf-8',
        ),
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
        expect(existsSync(path.join(dir, file)), `missing ${file}`).toBe(true);
      }
      expect(readFileSync(path.join(dir, 'apps/fake-ext/webext/manifest.ts'), 'utf-8')).toBe(
        readFileSync(path.join(canonical, 'apps/fake-ext/webext/manifest.ts'), 'utf-8'),
      );
      expect(readFileSync(path.join(dir, 'src/index.ts'), 'utf-8')).toBe('export const custom = true;\n');
      const rootPkg = readJson(path.join(dir, 'package.json'));
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
      const dir = path.join(sandbox, 'adopted-divergent', 'fake-ext');
      writeFiles(dir, {
        'package.json': json({ name: 'fake-ext', private: true }),
        'apps/fake-ext/webext/manifest.ts': '// hand-rolled manifest, diverged\n',
      });
      await initRepo(dir);
      process.chdir(dir);

      await adoptApp({ pieces: ['webext'], yes: true });
      await updateApp({ skipInstall: true });

      const manifest = readFileSync(path.join(dir, 'apps/fake-ext/webext/manifest.ts'), 'utf-8');
      expect(manifest).toContain('<<<<<<<');
      expect(manifest).toContain('>>>>>>>');
      expect(readProvenance(dir)?.reconciled).toBeUndefined();

      writeFileSync(
        path.join(dir, 'apps/fake-ext/webext/manifest.ts'),
        readFileSync(path.join(canonical, 'apps/fake-ext/webext/manifest.ts'), 'utf-8'),
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
      const dir = path.join(sandbox, 'adopted-pinned', 'fake-ext');
      writeFiles(dir, {
        'package.json': json({ name: 'fake-ext', private: true }),
        'apps/fake-ext/webext/manifest.ts': '// bespoke manifest — never reconcile\n',
        '.updateignore': '# bespoke surface\napps/fake-ext/webext/**\n',
      });
      await initRepo(dir);
      process.chdir(dir);

      await adoptApp({ pieces: ['webext'], yes: true });
      await updateApp({ skipInstall: true });

      expect(readFileSync(path.join(dir, 'apps/fake-ext/webext/manifest.ts'), 'utf-8')).toBe(
        '// bespoke manifest — never reconcile\n',
      );
      expect(existsSync(path.join(dir, 'apps/fake-ext/webext/views/popup/main.tsx'))).toBe(false);
      expect(existsSync(path.join(dir, 'apps/fake-ext/vite.config.webext.ts'))).toBe(true);

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
      const dir = path.join(sandbox, 'adopted-badglob', 'fake-ext');
      writeFiles(dir, {
        'package.json': json({ name: 'fake-ext', private: true }),
        '.updateignore': 'apps/*.config.ts\n',
      });
      await initRepo(dir);
      process.chdir(dir);

      await adoptApp({ pieces: ['webext'], yes: true });
      await expect(updateApp({ skipInstall: true })).rejects.toThrow(/looks like a glob/u);
    },
    heavy,
  );
});
