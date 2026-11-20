import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { cliRoot, cliVersion } from './commands/provenance';

export const monorepoUrl = 'https://github.com/shotcowboystyle/universal-starter-kit.git';

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
  // oxlint-disable-next-line sonarjs/max-union-size -- closed set of origins documented above; an alias would only move it
  origin: 'flag' | 'monorepo' | 'stamp' | 'tag';
  warning?: string;
}

export interface SourceStamp {
  cliVersion?: string;
  sha?: string;
  url?: string;
}

const URL_SCHEME = /^(?:https?|ssh|git|file):\/\//u;
const SCP_LIKE = /^[\w.-]+@[\w.-]+:/u;

export const isGitUrl = (source: string): boolean => URL_SCHEME.test(source) || SCP_LIKE.test(source);

const nonEmpty = (value: string | undefined): value is string => value !== undefined && value !== '';

/** The monorepo checkout this CLI runs from, if any (src via tsx, or the workspace link). */
export const monorepoCheckout = (): string | undefined => {
  const root = path.resolve(cliRoot(), '../..');

  if (
    existsSync(path.join(root, 'apps/one/package.json')) &&
    existsSync(path.join(root, 'packages/cli/package.json'))
  ) {
    return root;
  }

  return undefined;
};

export const readSourceStamp = (): SourceStamp | undefined => {
  try {
    // SAFETY: lib/source.json is written by scripts/stamp-source.mjs as {cliVersion, url, sha?}; every field is optional here
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse returns any; see SAFETY above
    return JSON.parse(readFileSync(path.join(cliRoot(), 'lib/source.json'), 'utf-8')) as SourceStamp;
  } catch {
    // No stamp (dev build or unbuilt checkout): resolveSource falls back to the release tag.
    return undefined;
  }
};

/**
 * Where `mpo init` clones from. Flags win; a CLI running inside the monorepo
 * uses that checkout's HEAD; a published CLI uses the commit stamped at build
 * time; a build without a stamp falls back to the release tag of its own
 * version, and `init` retries `main` when that tag is missing.
 */
export const resolveSource = (flags: { source?: string; checkout?: string } = {}): SourceSpec => {
  if (nonEmpty(flags.source)) {
    return {
      source: flags.source,
      ref: flags.checkout ?? (isGitUrl(flags.source) ? 'main' : 'HEAD'),
      origin: 'flag',
    };
  }

  const checkout = monorepoCheckout();

  if (nonEmpty(checkout)) {
    return { source: checkout, ref: flags.checkout ?? 'HEAD', origin: 'monorepo' };
  }

  const stamp = readSourceStamp();
  const url = stamp?.url ?? monorepoUrl;

  if (nonEmpty(flags.checkout)) {
    return { source: url, ref: flags.checkout, origin: 'flag' };
  }

  if (nonEmpty(stamp?.sha)) {
    return { source: url, ref: stamp.sha, origin: 'stamp' };
  }

  const version = cliVersion();
  const ref = nonEmpty(version) ? `v${version}` : 'main';

  return {
    source: url,
    ref,
    origin: 'tag',
    warning: `this build of @repo/cli carries no source commit (lib/source.json); scaffolding from ${ref} instead`,
  };
};

export type SourceFailure = 'auth' | 'network' | 'unknown';

const authFailures = [
  /access denied/iu,
  /authentication failed/iu,
  /could not read (?:username|password)/iu,
  /terminal prompts disabled/iu,
  /permission denied \(/iu,
  /host key verification failed/iu,
  /returned error: 40[13]/iu,
  /repository not found/iu,
  /you don't have permission/iu,
];

const networkFailures = [
  /could not resolve (?:host|hostname|proxy)/iu,
  /failed to connect/iu,
  /couldn't connect/iu,
  /connection (?:refused|reset|timed out|closed)/iu,
  /operation timed out/iu,
  /network is unreachable/iu,
  /no route to host/iu,
  /ssl|certificate/iu,
];

/** What a failed `git ls-remote` says about why the source is unreadable. */
export const classifySourceFailure = (stderr: string): SourceFailure => {
  if (authFailures.some((pattern) => pattern.test(stderr))) {
    return 'auth';
  }
  if (networkFailures.some((pattern) => pattern.test(stderr))) {
    return 'network';
  }
  return 'unknown';
};

const URL_HOST = /^[a-z]+:\/\/(?:[^@/]*@)?(?<host>[^/:]+)/iu;

/** Host of a scheme url (`https://host/…`) or an scp-like one (`git@host:org/repo`). */
const hostOf = (url: string): string | undefined => {
  const fromUrl = URL_HOST.exec(url)?.groups?.host;
  if (fromUrl !== undefined) {
    return fromUrl;
  }
  const at = url.indexOf('@');
  const colon = at === -1 ? -1 : url.indexOf(':', at + 1);
  return colon > at + 1 ? url.slice(at + 1, colon) : undefined;
};

const failureLines = (url: string, kind: SourceFailure, reason: string | undefined): string[] => {
  if (kind === 'network') {
    const because = nonEmpty(reason) ? `: ${reason}` : '';
    return [
      `Cannot reach the source repository ${url}${because}.`,
      `The CLI scaffolds from this git repository, so it needs a network path to ${hostOf(url) ?? 'its host'} (check the connection, proxy or VPN).`,
    ];
  }
  const denied = kind === 'auth' ? ': access denied' : '';
  return [
    `Cannot read the source repository ${url}${denied}.`,
    'The CLI scaffolds from this git repository, so it needs read access to it: an account that can clone it, and a credential git uses without asking (a token in a git credential helper for https, an SSH key for ssh).',
  ];
};

export class SourceAccessError extends Error {
  readonly url: string;
  readonly kind: SourceFailure;
  readonly gitOutput: string;
  constructor(url: string, kind: SourceFailure, gitOutput: string, reason?: string) {
    const lines = failureLines(url, kind, reason);
    lines.push(`Check with: git ls-remote ${url}`, 'Or scaffold from a copy you can read: --source <path|url>');
    const detail = gitOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .slice(-4);
    if (detail.length > 0) {
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
export const checkSourceAccess = async (
  source: string,
  { timeoutMs = 30_000 }: { timeoutMs?: number } = {},
): Promise<void> => {
  if (!isGitUrl(source) || readableSources.has(source)) {
    return;
  }

  const detached = process.platform !== 'win32';

  // oxlint-disable-next-line sonarjs/no-os-command-from-path -- the user's own git, with their credential helpers, is the point of the probe
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
      if (detached && child.pid !== undefined) {
        process.kill(-child.pid, 'SIGKILL');
      } else {
        child.kill('SIGKILL');
      }
    } catch {
      // The process already exited between the timeout firing and the kill; nothing to stop.
    }
  }, timeoutMs);

  let code: number | null;

  try {
    // SAFETY: a ChildProcess 'close' event is emitted with (code: number | null, signal)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- events.once returns any[]; see SAFETY above
    [code] = (await once(child, 'close')) as [number | null];
  } catch (error) {
    throw error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? new Error(`git is required to scaffold from ${source}`)
      : error;
  } finally {
    clearTimeout(timer);
  }

  if (timedOut) {
    throw new SourceAccessError(source, 'network', stderr, `no answer within ${Math.round(timeoutMs / 1000)}s`);
  }

  if (code !== 0) {
    throw new SourceAccessError(source, classifySourceFailure(stderr), stderr);
  }

  readableSources.add(source);
};
