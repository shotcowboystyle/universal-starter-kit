import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { createServer as createTcpServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  checkSourceAccess,
  classifySourceFailure,
  isGitUrl,
  monorepoCheckout,
  resolveSource,
  SourceAccessError,
} from './source';

const monorepo = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '');

describe(resolveSource, () => {
  it('flags win, with HEAD for a path and main for a url', () => {
    expect(resolveSource({ source: '/tmp/mpo' })).toEqual({
      source: '/tmp/mpo',
      ref: 'HEAD',
      origin: 'flag',
    });
    expect(resolveSource({ source: 'https://example.com/mpo.git' })).toEqual({
      source: 'https://example.com/mpo.git',
      ref: 'main',
      origin: 'flag',
    });
    expect(resolveSource({ source: '/tmp/mpo', checkout: 'v7.11.0' }).ref).toBe('v7.11.0');
  });

  it("a CLI running inside the monorepo scaffolds from that checkout's HEAD", () => {
    expect(monorepoCheckout()).toBe(monorepo);
    expect(existsSync(join(monorepo, 'apps/one/package.json'))).toBe(true);
    const spec = resolveSource();
    expect(spec).toEqual({ source: monorepo, ref: 'HEAD', origin: 'monorepo' });
    expect(resolveSource({ checkout: 'main' }).ref).toBe('main');
  });

  it('recognizes git urls', () => {
    for (const url of [
      'https://github.com/shotcowboystyle/universal-starter-kit-kit/mpo.git',
      'ssh://git@host/repo.git',
      'git@github.com:org/repo.git',
      'file:///tmp/repo',
    ]) {
      expect(isGitUrl(url), url).toBe(true);
    }
    for (const path of ['/tmp/repo', '../repo', 'repo']) {
      expect(isGitUrl(path), path).toBe(false);
    }
  });
});

async function listen(server: Server | ReturnType<typeof createTcpServer>): Promise<number> {
  return await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

async function close(server: Server | ReturnType<typeof createTcpServer>): Promise<void> {
  return await new Promise((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
}

/**
 * Sources the CLI cannot read: a server that answers every request the way
 * GitLab answers an anonymous clone of a private project, a port nothing
 * listens on, and a server that accepts and never answers. Git runs with no
 * credential helper, no global or system config, and an askpass program that
 * never answers, so any prompt it reaches hangs the run.
 */
describe('a source the CLI cannot read', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'mpo-source-access-'));
  const home = join(sandbox, 'home');
  const prompt = join(sandbox, 'prompt.sh');
  const sockets = new Set<Socket>();
  const denying = createServer((_request, response) => {
    response.writeHead(401, {
      'Content-Type': 'text/plain',
      'WWW-Authenticate': 'Basic realm="GitLab"',
    });
    response.end('HTTP Basic: Access denied\n');
  });
  const silent = createTcpServer((socket) => {
    sockets.add(socket);
  });
  let deniedUrl = '';
  let refusedUrl = '';
  let silentUrl = '';
  const env: Record<string, string> = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_ASKPASS: prompt,
    SSH_ASKPASS: prompt,
    no_proxy: '*',
    NO_PROXY: '*',
  };

  beforeAll(async () => {
    mkdirSync(home, { recursive: true });
    writeFileSync(prompt, '#!/bin/sh\nsleep 300\n');
    chmodSync(prompt, 0o755);
    for (const [name, value] of Object.entries(env)) {
      vi.stubEnv(name, value);
    }
    deniedUrl = `http://127.0.0.1:${await listen(denying)}/universal-starter-kit/mpo.git`;
    silentUrl = `http://127.0.0.1:${await listen(silent)}/universal-starter-kit/mpo.git`;
    const closed = createTcpServer();
    const refusedPort = await listen(closed);
    await close(closed);
    refusedUrl = `http://127.0.0.1:${refusedPort}/universal-starter-kit/mpo.git`;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    for (const socket of sockets) {
      socket.destroy();
    }
    await Promise.all([close(denying), close(silent)]);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('an unauthorized source is an access error naming the url, without waiting on a prompt', async () => {
    const started = Date.now();
    const error = await checkSourceAccess(deniedUrl).catch((error: unknown) => error);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(error).toBeInstanceOf(SourceAccessError);
    const { kind, url, message } = error as SourceAccessError;
    expect(kind).toBe('auth');
    expect(url).toBe(deniedUrl);
    expect(message).toContain(deniedUrl);
    expect(message).toMatch(/needs read access/);
    expect(message).toContain('--source <path|url>');
  }, 20_000);

  it('an unreachable source is a network error naming the url', async () => {
    const error = await checkSourceAccess(refusedUrl).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(SourceAccessError);
    expect((error as SourceAccessError).kind).toBe('network');
    expect((error as SourceAccessError).message).toContain(refusedUrl);
    expect((error as SourceAccessError).message).toMatch(/cannot reach/i);
  }, 20_000);

  it('a source that never answers gives up at the timeout', async () => {
    const started = Date.now();
    const error = await checkSourceAccess(silentUrl, { timeoutMs: 1000 }).catch((error: unknown) => error);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(error).toBeInstanceOf(SourceAccessError);
    expect((error as SourceAccessError).kind).toBe('network');
    expect((error as SourceAccessError).message).toContain(silentUrl);
    expect((error as SourceAccessError).message).toMatch(/no answer within 1s/);
  }, 20_000);

  it('a readable url and a local path pass', async () => {
    const bare = join(sandbox, 'empty.git');
    spawnSync('git', ['init', '--quiet', '--bare', bare]);
    await expect(checkSourceAccess(`file://${bare}`)).resolves.toBeUndefined();
    await expect(checkSourceAccess(join(sandbox, 'no-such-clone'))).resolves.toBeUndefined();
  }, 20_000);

  it('mpo init exits nonzero with the message and creates nothing', async () => {
    const cli = fileURLToPath(new URL('..', import.meta.url));
    const tsx = createRequire(import.meta.url).resolve('tsx');
    const child = spawn(
      process.execPath,
      [
        '--import',
        tsx,
        join(cli, 'src/bin/multiplatformOne.ts'),
        'init',
        'my-app',
        '--source',
        deniedUrl,
        '--yes',
        '--skip-install',
        '--skip-git',
      ],
      {
        cwd: sandbox,
        env: { ...process.env, ...env, TSX_TSCONFIG_PATH: join(cli, 'tsconfig.json') },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout.resume();
    const timer = setTimeout(() => child.kill('SIGKILL'), 45_000);
    const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) =>
      child.on('close', (exitCode, exitSignal) => {
        resolve([exitCode, exitSignal]);
      }),
    );
    clearTimeout(timer);
    expect(signal, stderr).toBeNull();
    expect(code, stderr).toBe(1);
    expect(stderr).toContain(deniedUrl);
    expect(stderr).toMatch(/needs read access/);
    expect(existsSync(join(sandbox, 'my-app'))).toBe(false);
  }, 60_000);
});

describe(classifySourceFailure, () => {
  it('tells access failures from network failures', () => {
    for (const text of [
      'remote: HTTP Basic: Access denied. If a password was provided for Git authentication, the password was incorrect',
      "fatal: Authentication failed for 'https://github.com/shotcowboystyle/universal-starter-kit-kit/mpo.git/'",
      "fatal: could not read Username for 'https://github.com/shotcowboystyle'universal-starter-kit disabled",
      'git@github.com/shotcowboystyle:universal-starter-kitpublickey).\nfatal: Could not read from remote repository.',
      "remote: The project you were looking for could not be found or you don't have permission to view it.",
      'remote: Repository not found.',
      "fatal: unable to access 'https://host/repo.git/': The requested URL returned error: 403",
      'Host key verification failed.\nfatal: Could not read from remote repository.',
    ]) {
      expect(classifySourceFailure(text), text).toBe('auth');
    }
    for (const text of [
      "fatal: unable to access 'https://git.corp.bitspur.com/x.git/': Could not resolve host: git.corp.bitspur.com",
      'ssh: Could not resolve hostname git.corp.bitspur.com: nodename nor servname provided\nfatal: Could not read from remote repository.',
      "fatal: unable to access 'http://127.0.0.1:9/x.git/': Failed to connect to 127.0.0.1 port 9 after 0 ms: Couldn't connect to server",
      'ssh: connect to host git.corp.bitspur.com port 22: Connection refused',
      'ssh: connect to host git.corp.bitspur.com port 22: Operation timed out',
      "fatal: unable to access 'https://host/x.git/': SSL certificate problem: unable to get local issuer certificate",
    ]) {
      expect(classifySourceFailure(text), text).toBe('network');
    }
    expect(classifySourceFailure('fatal: something else went wrong')).toBe('unknown');
  });
});
