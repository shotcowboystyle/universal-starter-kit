import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { cliRoot, cliVersion } from './commands/provenance';

export const monorepoUrl = 'https://github.com/shotcowboystyle/universal-starter-kit/mpo.git';

export interface SourceSpec {
  /** Path to a local clone, or a git URL. */
  source: string;
  /** Commit, tag or branch to scaffold from. */
  ref: string;
  /**
   * flag     = --source / --checkout
   * monorepo = the CLI runs from inside a monorepo checkout (dev, `make`)
   * stamp    = lib/source.json written by the build
   * tag      = no stamp: the release tag of this CLI version
   */
  origin: 'flag' | 'monorepo' | 'stamp' | 'tag';
  warning?: string;
}

export interface SourceStamp {
  cliVersion?: string;
  sha?: string;
  url?: string;
}

export function isGitUrl(source: string): boolean {
  return /^(https?|ssh|git|file):\/\//.test(source) || /^[\w.-]+@[\w.-]+:/.test(source);
}

/** The monorepo checkout this CLI runs from, if any (src via tsx, or the workspace link). */
export function monorepoCheckout(): string | undefined {
  const root = resolve(cliRoot(), '../..');
  if (existsSync(join(root, 'apps/one/package.json')) && existsSync(join(root, 'public/cli/package.json'))) {
    return root;
  }
  return undefined;
}

export function readSourceStamp(): SourceStamp | undefined {
  try {
    return JSON.parse(readFileSync(join(cliRoot(), 'lib/source.json'), 'utf-8')) as SourceStamp;
  } catch {
    return undefined;
  }
}

/**
 * Where `mpo init` clones from. Flags win; a CLI running inside the monorepo
 * uses that checkout's HEAD; a published CLI uses the commit stamped at build
 * time; a build without a stamp falls back to the release tag of its own
 * version, and `init` retries `main` when that tag is missing.
 */
export function resolveSource(flags: { source?: string; checkout?: string } = {}): SourceSpec {
  if (flags.source) {
    return {
      source: flags.source,
      ref: flags.checkout ?? (isGitUrl(flags.source) ? 'main' : 'HEAD'),
      origin: 'flag',
    };
  }
  const checkout = monorepoCheckout();
  if (checkout) {
    return { source: checkout, ref: flags.checkout ?? 'HEAD', origin: 'monorepo' };
  }
  const stamp = readSourceStamp();
  const url = stamp?.url ?? monorepoUrl;
  if (flags.checkout) {
    return { source: url, ref: flags.checkout, origin: 'flag' };
  }
  if (stamp?.sha) {
    return { source: url, ref: stamp.sha, origin: 'stamp' };
  }
  const version = cliVersion();
  const ref = version ? `v${version}` : 'main';
  return {
    source: url,
    ref,
    origin: 'tag',
    warning:
      `this build of @repo/cli carries no source commit (lib/source.json); ` +
      `scaffolding from ${ref} instead`,
  };
}

export type SourceFailure = 'auth' | 'network' | 'unknown';

const authFailures = [
  /access denied/i,
  /authentication failed/i,
  /could not read (username|password)/i,
  /terminal prompts disabled/i,
  /permission denied \(/i,
  /host key verification failed/i,
  /returned error: 40[13]/i,
  /repository not found/i,
  /you don't have permission/i,
];

const networkFailures = [
  /could not resolve (host|hostname|proxy)/i,
  /failed to connect/i,
  /couldn't connect/i,
  /connection (refused|reset|timed out|closed)/i,
  /operation timed out/i,
  /network is unreachable/i,
  /no route to host/i,
  /ssl|certificate/i,
];

/** What a failed `git ls-remote` says about why the source is unreadable. */
export function classifySourceFailure(stderr: string): SourceFailure {
  if (authFailures.some((pattern) => pattern.test(stderr))) {
    return 'auth';
  }
  if (networkFailures.some((pattern) => pattern.test(stderr))) {
    return 'network';
  }
  return 'unknown';
}

export class SourceAccessError extends Error {
  readonly url: string;
  readonly kind: SourceFailure;
  readonly gitOutput: string;
  constructor(url: string, kind: SourceFailure, gitOutput: string, reason?: string) {
    const host = /^[a-z]+:\/\/(?:[^@/]*@)?([^/:]+)/i.exec(url)?.[1] ?? /@([^:]+):/.exec(url)?.[1];
    const lines =
      kind === 'network'
        ? [
            `Cannot reach the source repository ${url}${reason ? `: ${reason}` : ''}.`,
            `The CLI scaffolds from this git repository, so it needs a network path to ${host ?? 'its host'} (check the connection, proxy or VPN).`,
          ]
        : [
            `Cannot read the source repository ${url}${kind === 'auth' ? ': access denied' : ''}.`,
            'The CLI scaffolds from this git repository, so it needs read access to it: an account that can clone it, and a credential git uses without asking (a token in a git credential helper for https, an SSH key for ssh).',
          ];
    lines.push(`Check with: git ls-remote ${url}`, 'Or scaffold from a copy you can read: --source <path|url>');
    const detail = gitOutput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-4);
    if (detail.length) {
      lines.push('git said:', ...detail.map((line) => `  ${line}`));
    }
    super(lines.join('\n'));
    this.name = 'SourceAccessError';
    this.url = url;
    this.kind = kind;
    this.gitOutput = gitOutput;
  }
}

const readableSources = new Set<string>();

/**
 * Fail before cloning when a git url source cannot be read. The probe runs
 * with every prompt off and, on POSIX, in its own session with no terminal,
 * so a missing credential is an answer instead of a password prompt. The
 * timeout kills the whole process group: git's transport helper holds stderr
 * open after git itself exits.
 */
export async function checkSourceAccess(
  source: string,
  { timeoutMs = 30_000 }: { timeoutMs?: number } = {},
): Promise<void> {
  if (!isGitUrl(source) || readableSources.has(source)) {
    return;
  }
  const detached = process.platform !== 'win32';
  const child = spawn('git', ['ls-remote', source, 'HEAD'], {
    detached,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
      SSH_ASKPASS_REQUIRE: 'never',
      GCM_INTERACTIVE: 'never',
      LC_ALL: 'C',
    },
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      if (detached && child.pid) {
        process.kill(-child.pid, 'SIGKILL');
      } else {
        child.kill('SIGKILL');
      }
    } catch {}
  }, timeoutMs);
  const code = await new Promise<number | null>((resolveExit, reject) => {
    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(err.code === 'ENOENT' ? new Error(`git is required to scaffold from ${source}`) : err);
    });
    child.on('close', resolveExit);
  }).finally(() => {
    clearTimeout(timer);
  });
  if (timedOut) {
    throw new SourceAccessError(source, 'network', stderr, `no answer within ${Math.round(timeoutMs / 1000)}s`);
  }
  if (code !== 0) {
    throw new SourceAccessError(source, classifySourceFailure(stderr), stderr);
  }
  readableSources.add(source);
}
