import crypto from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import spawn from 'nano-spawn';
import YAML from 'yaml';
import yoctoSpinner from 'yocto-spinner';

export interface E2EOptions {
  upOnly?: boolean;
  down?: boolean;
  portOffset?: number;
  project?: string;
  noBuild?: boolean;
  filter?: string;
}

interface Healthcheck {
  test: string[];
  interval: string;
  timeout: string;
  retries: number;
}

interface ServiceConfig {
  image: string;
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  command?: string[];
  depends_on?: string[];
  restart?: string;
  privileged?: boolean;
  healthcheck?: Healthcheck;
}

/** A compose service plus the named volumes it needs. */
interface ServiceSpec {
  service: ServiceConfig;
  volumes?: string[];
}

/** What `mpo test e2e --down` needs to find the running stack again. */
interface E2ESession {
  projectName: string;
  composeFile: string;
  tmpDir: string;
  portOffset: number;
}

interface ServiceUrl {
  name: string;
  url: string;
}

const RESTART_POLICY = 'unless-stopped';

const sessionFileName = (portOffset: number): string => `.e2e-session-${portOffset}.json`;

const defaultPorts = new Map([
  [
    'mailpit',
    [
      { host: 8025, container: 8025 },
      { host: 1025, container: 1025 },
    ],
  ],
  ['keycloak', [{ host: 8080, container: 8080 }]],
  ['postgres', [{ host: 5432, container: 5432 }]],
]);

const fileExists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    // Missing or unreadable: absent for our purposes.
    return false;
  }
};

const getPresentAppNames = async (projectRoot: string): Promise<string[]> => {
  const appsDir = path.join(projectRoot, 'apps');
  let entries: string[];
  try {
    const dirents = await fs.readdir(appsDir, { withFileTypes: true });
    entries = dirents.flatMap((entry) => (entry.isDirectory() ? [entry.name] : []));
  } catch {
    // No apps/ directory: no apps.
    return [];
  }
  const withPackageJson = await Promise.all(
    entries.map(async (name) => ((await fileExists(path.join(appsDir, name, 'package.json'))) ? name : undefined)),
  );
  return withPackageJson.filter((name) => name !== undefined);
};

const PLAYWRIGHT_CONFIGS = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'];

const hasPlaywrightConfig = async (appPath: string): Promise<boolean> => {
  const found = await Promise.all(
    PLAYWRIGHT_CONFIGS.map(async (config) => await fileExists(path.join(appPath, config))),
  );
  return found.includes(true);
};

/** Discover app that has Playwright config (for E2E test cwd). Returns app name (e.g. "one") or null. */
export const discoverE2EApp = async (projectRoot: string): Promise<string | null> => {
  const names = await getPresentAppNames(projectRoot);
  const configured = await Promise.all(
    names.map(async (name) => await hasPlaywrightConfig(path.join(projectRoot, 'apps', name))),
  );
  const index = configured.indexOf(true);
  return index === -1 ? null : names[index];
};

export const detectServices = async (projectRoot: string): Promise<string[]> => {
  // Always include base infrastructure
  const services: string[] = ['mailpit'];

  // Keycloak needs Postgres (discover from present apps)
  const presentApps = await getPresentAppNames(projectRoot);
  if (presentApps.includes('keycloak')) {
    services.push('keycloak', 'postgres');
  }

  return services;
};

const offsetPorts = (service: string, offset: number): string[] =>
  (defaultPorts.get(service) ?? []).map((port) => `${port.host + offset}:${port.container}`);

const buildServiceConfig = (service: string, portOffset: number): ServiceSpec | null => {
  const ports = offsetPorts(service, portOffset);
  switch (service) {
    case 'mailpit': {
      return {
        service: {
          image: 'axllent/mailpit',
          restart: RESTART_POLICY,
          ports,
          environment: {
            MP_MAX_MESSAGES: '5000',
            MP_SMTP_AUTH_ACCEPT_ANY: '1',
            MP_SMTP_AUTH_ALLOW_INSECURE: '1',
          },
        },
        volumes: ['mailpit'],
      };
    }

    case 'keycloak': {
      return {
        service: {
          image: 'quay.io/keycloak/keycloak:latest',
          restart: RESTART_POLICY,
          ports,
          command: [
            'start-dev',
            '--http-relative-path=/auth',
            `--hostname=http://localhost:${8080 + portOffset}`,
            '--hostname-strict=false',
            '--db=postgres',
            '--db-url-host=postgres',
            '--db-url-database=keycloak',
            '--db-username=keycloak',
            '--db-password=keycloak',
          ],
          environment: {
            KEYCLOAK_ADMIN: 'admin',
            KEYCLOAK_ADMIN_PASSWORD: 'admin',
          },
          depends_on: ['postgres'],
        },
      };
    }

    case 'postgres': {
      return {
        service: {
          image: 'postgres:16.10-alpine',
          restart: RESTART_POLICY,
          ports,
          environment: {
            POSTGRES_DB: 'keycloak',
            POSTGRES_USER: 'keycloak',
            POSTGRES_PASSWORD: 'keycloak',
          },
        },
        volumes: ['postgres'],
      };
    }

    default: {
      return null;
    }
  }
};

export const generateCompose = (services: string[], portOffset: number, _projectRoot: string): string => {
  const specs = services.flatMap((name) => {
    const spec = buildServiceConfig(name, portOffset);
    return spec ? [{ name, spec }] : [];
  });
  return YAML.stringify({
    services: Object.fromEntries(specs.map(({ name, spec }) => [name, spec.service])),
    volumes: Object.fromEntries(specs.flatMap(({ spec }) => (spec.volumes ?? []).map((volume) => [volume, {}]))),
  });
};

const readSession = async (sessionFilePath: string): Promise<E2ESession> =>
  // SAFETY: the file is the E2ESession runE2ESession wrote; a corrupt one fails at the docker call below
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse is untyped; this is the session file's parse boundary
  JSON.parse(await fs.readFile(sessionFilePath, 'utf-8')) as E2ESession;

const tearDown = async (projectRoot: string, sessionFilePath: string): Promise<void> => {
  const spinner = yoctoSpinner({ text: 'Tearing down test environment...' }).start();
  try {
    const { projectName, composeFile, tmpDir } = await readSession(sessionFilePath);

    await spawn('docker', ['compose', '-f', composeFile, '-p', projectName, 'down', '-v', '--remove-orphans'], {
      stdio: 'pipe',
      cwd: projectRoot,
    });

    // Clean up temp files
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.rm(sessionFilePath, { force: true });

    spinner.success('Test environment torn down');
  } catch {
    // Reported via the spinner; the session file goes either way so the next run starts clean.
    spinner.error('Failed to tear down (session may not exist)');
    await fs.rm(sessionFilePath, { force: true });
  }
};

const getServiceUrls = (services: string[], portOffset: number): ServiceUrl[] => {
  const urls: ServiceUrl[] = [{ name: 'Frontend', url: `http://localhost:${3000 + portOffset}` }];
  if (services.includes('keycloak')) {
    urls.push({ name: 'Keycloak', url: `http://localhost:${8080 + portOffset}/auth` });
  }
  if (services.includes('mailpit')) {
    urls.push({ name: 'Mailpit', url: `http://localhost:${8025 + portOffset}` });
  }
  if (services.includes('postgres')) {
    urls.push({ name: 'Postgres', url: `localhost:${5432 + portOffset}` });
  }
  return urls;
};

const CHECK_TIMEOUT_MS = 2000;

const checkTcp = async (host: string, port: number): Promise<boolean> => {
  const socket = new Socket();
  socket.connect(port, host);
  try {
    await once(socket, 'connect', { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    return true;
  } catch {
    // Refused, unreachable or timed out: not ready yet.
    return false;
  } finally {
    socket.destroy();
  }
};

const checkHttp = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    return response.ok;
  } catch {
    // Not listening yet or timed out: not ready yet.
    return false;
  }
};

interface ReadinessCheck {
  name: string;
  check: () => Promise<boolean>;
}

const readinessChecks = (services: string[], portOffset: number): ReadinessCheck[] =>
  services.flatMap((service) =>
    (defaultPorts.get(service) ?? []).map((port): ReadinessCheck => {
      const hostPort = port.host + portOffset;
      const name = `${service}:${hostPort}`;
      if (service === 'mailpit' && port.container === 8025) {
        return { name, check: async () => await checkHttp(`http://localhost:${hostPort}/api/v1/info`) };
      }
      if (service === 'keycloak') {
        return { name, check: async () => await checkHttp(`http://localhost:${hostPort}/auth/realms/master`) };
      }
      return { name, check: async () => await checkTcp('localhost', hostPort) };
    }),
  );

const MAX_RETRIES = 30;
const RETRY_INTERVAL_MS = 2000;

/** Polls one check until it passes or the attempts run out. */
const pollUntilReady = async (check: () => Promise<boolean>, attemptsLeft: number): Promise<boolean> => {
  if (await check()) {
    return true;
  }
  if (attemptsLeft <= 1) {
    return false;
  }
  await delay(RETRY_INTERVAL_MS);
  return await pollUntilReady(check, attemptsLeft - 1);
};

/**
 * Poll services for readiness instead of relying on a fixed sleep.
 * Checks TCP connectivity for Postgres, and HTTP for Mailpit/Keycloak.
 */
const waitForServices = async (services: string[], portOffset: number): Promise<void> => {
  const checks = readinessChecks(services, portOffset);
  const ready = await Promise.all(checks.map(async ({ check }) => await pollUntilReady(check, MAX_RETRIES)));
  for (const [index, { name }] of checks.entries()) {
    if (!ready[index]) {
      console.warn(`Warning: ${name} did not become ready within ${(MAX_RETRIES * RETRY_INTERVAL_MS) / 1000}s`);
    }
  }
};

export const runE2ESession = async (projectRoot: string, options: E2EOptions): Promise<void> => {
  const portOffset = options.portOffset ?? 1000;
  const projectName = options.project ?? `mp1-test-${crypto.randomBytes(3).toString('hex')}`;
  const sessionFilePath = path.join(projectRoot, sessionFileName(portOffset));

  // Handle --down: tear down existing session
  if (options.down) {
    if (await fileExists(sessionFilePath)) {
      await tearDown(projectRoot, sessionFilePath);
    } else {
      console.log('No active e2e session found.');
    }
    return;
  }

  // Detect services
  const spinner = yoctoSpinner({ text: 'Detecting services...' }).start();
  const services = await detectServices(projectRoot);
  spinner.success(`Detected services: ${services.join(', ')}`);

  // Generate compose
  const composeContent = generateCompose(services, portOffset, projectRoot);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mp1-e2e-'));
  const composeFile = path.join(tmpDir, 'docker-compose.yaml');
  await fs.writeFile(composeFile, composeContent);

  // Save session info
  const sessionInfo = { projectName, composeFile, tmpDir, portOffset };
  await fs.writeFile(sessionFilePath, JSON.stringify(sessionInfo, null, 2));

  // Build images if needed
  if (!options.noBuild) {
    const buildSpinner = yoctoSpinner({ text: 'Building images...' }).start();
    try {
      await spawn('docker', ['compose', '-f', composeFile, '-p', projectName, 'build'], {
        stdio: 'pipe',
        cwd: projectRoot,
      });
      buildSpinner.success('Images built');
    } catch {
      buildSpinner.info('No custom images to build');
    }
  }

  // Start services
  const startSpinner = yoctoSpinner({ text: 'Starting test environment...' }).start();
  try {
    await spawn('docker', ['compose', '-f', composeFile, '-p', projectName, 'up', '-d'], {
      stdio: 'pipe',
      cwd: projectRoot,
    });
    startSpinner.success('Test environment started');
  } catch (error) {
    startSpinner.error('Failed to start test environment');
    throw error;
  }

  // Wait for services to be ready with health checks
  const waitSpinner = yoctoSpinner({ text: 'Waiting for services to be ready...' }).start();
  await waitForServices(services, portOffset);
  waitSpinner.success('Services ready');

  // Print URLs
  const urls = getServiceUrls(services, portOffset);
  console.log('\nTest environment is ready!\n');
  for (const { name, url } of urls) {
    console.log(`  ${name}: ${url}`);
  }
  console.log('\nTo tear down: mpo test e2e --down\n');

  // If --up-only, stop here
  if (options.upOnly) {
    return;
  }

  // Run Playwright tests (discover app that has playwright.config)
  const e2eApp = await discoverE2EApp(projectRoot);
  if (e2eApp === null) {
    console.error('No E2E app found: no app under apps/ has playwright.config.ts or playwright.config.js.');
    await tearDown(projectRoot, sessionFilePath);
    process.exit(1);
  }

  try {
    const playwrightArgs = ['playwright', 'test'];
    if (options.filter !== undefined && options.filter !== '') {
      playwrightArgs.push(options.filter);
    }

    const baseUrl = `http://localhost:${3000 + portOffset}`;
    const e2eCwd = path.join(projectRoot, 'apps', e2eApp);

    await spawn('pnpm', playwrightArgs, {
      stdio: 'inherit',
      cwd: e2eCwd,
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        E2E_PORT_OFFSET: String(portOffset),
      },
    });
  } finally {
    // Always tear down after running tests
    await tearDown(projectRoot, sessionFilePath);
  }
};
