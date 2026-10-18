import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

interface ServiceConfig {
  image: string;
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  command?: string[];
  depends_on?: string[];
  restart?: string;
  privileged?: boolean;
  healthcheck?: Record<string, unknown>;
}

function sessionFileName(portOffset: number): string {
  return `.e2e-session-${portOffset}.json`;
}

const defaultPorts: Record<string, { host: number; container: number }[]> = {
  mailpit: [
    { host: 8025, container: 8025 },
    { host: 1025, container: 1025 },
  ],
  keycloak: [{ host: 8080, container: 8080 }],
  'redis-cache': [{ host: 6379, container: 6379 }],
  'redis-queue': [{ host: 6380, container: 6379 }],
  postgres: [{ host: 5432, container: 5432 }],
  mariadb: [{ host: 3306, container: 3306 }],
};

async function getPresentAppNames(projectRoot: string): Promise<string[]> {
  const appsDir = path.join(projectRoot, 'apps');
  try {
    const entries = (await fs.readdir(appsDir, { withFileTypes: true })).filter((e) => e.isDirectory());
    const names: string[] = [];
    for (const e of entries) {
      try {
        await fs.access(path.join(appsDir, e.name, 'package.json'));
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

/** Discover app that has Playwright config (for E2E test cwd). Returns app name (e.g. "one") or null. */
export async function discoverE2EApp(projectRoot: string): Promise<string | null> {
  const names = await getPresentAppNames(projectRoot);
  for (const name of names) {
    const appPath = path.join(projectRoot, 'apps', name);
    for (const config of ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs']) {
      try {
        await fs.access(path.join(appPath, config));
        return name;
      } catch {
        // continue
      }
    }
  }
  return null;
}

export async function detectServices(projectRoot: string): Promise<string[]> {
  const services: string[] = [];

  // Always include base infrastructure
  services.push('mailpit');

  // Frappe needs MariaDB + Redis
  if (await dirExists(path.join(projectRoot, 'apps', 'frappe'))) {
    services.push('mariadb', 'redis-cache', 'redis-queue');
  }

  // Keycloak needs Postgres (discover from present apps)
  const presentApps = await getPresentAppNames(projectRoot);
  if (presentApps.includes('keycloak')) {
    services.push('keycloak', 'postgres');
  }

  return services;
}

export function generateCompose(services: string[], portOffset: number, projectRoot: string): string {
  const compose: {
    services: Record<string, ServiceConfig>;
    volumes: Record<string, Record<string, never>>;
  } = {
    services: {},
    volumes: {},
  };

  for (const service of services) {
    const cfg = buildServiceConfig(service, portOffset, projectRoot);
    if (cfg) {
      compose.services[service] = cfg.service;
      if (cfg.volumes) {
        for (const vol of cfg.volumes) {
          compose.volumes[vol] = {};
        }
      }
    }
  }

  return YAML.stringify(compose);
}

function buildServiceConfig(
  service: string,
  portOffset: number,
  _projectRoot: string,
): { service: ServiceConfig; volumes?: string[] } | null {
  switch (service) {
    case 'mailpit': {
      return {
        service: {
          image: 'axllent/mailpit',
          restart: 'unless-stopped',
          ports: offsetPorts('mailpit', portOffset),
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
          restart: 'unless-stopped',
          ports: offsetPorts('keycloak', portOffset),
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
          restart: 'unless-stopped',
          ports: offsetPorts('postgres', portOffset),
          environment: {
            POSTGRES_DB: 'keycloak',
            POSTGRES_USER: 'keycloak',
            POSTGRES_PASSWORD: 'keycloak',
          },
        },
        volumes: ['postgres'],
      };
    }

    case 'redis-cache': {
      return {
        service: {
          image: 'docker.io/redis:alpine',
          restart: 'unless-stopped',
          ports: offsetPorts('redis-cache', portOffset),
        },
      };
    }

    case 'redis-queue': {
      return {
        service: {
          image: 'docker.io/redis:alpine',
          restart: 'unless-stopped',
          ports: offsetPorts('redis-queue', portOffset),
        },
      };
    }

    case 'mariadb': {
      return {
        service: {
          image: 'mariadb:10.6',
          restart: 'unless-stopped',
          ports: offsetPorts('mariadb', portOffset),
          environment: {
            MARIADB_DATABASE: 'frappe',
            MARIADB_ROOT_PASSWORD: 'root',
            MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: 'no',
          },
          healthcheck: {
            test: ['CMD', 'mariadb-admin', 'ping', '-h', '127.0.0.1', '-uroot', '-proot'],
            interval: '5s',
            timeout: '5s',
            retries: 10,
          },
        },
        volumes: ['mariadb'],
      };
    }

    default: {
      return null;
    }
  }
}

function offsetPorts(service: string, offset: number): string[] {
  const portDefs = defaultPorts[service];
  if (!portDefs) {
    return [];
  }
  return portDefs.map((p) => `${p.host + offset}:${p.container}`);
}

export async function runE2ESession(projectRoot: string, options: E2EOptions): Promise<void> {
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
  for (const [name, url] of Object.entries(urls)) {
    console.log(`  ${name}: ${url}`);
  }
  console.log('\nTo tear down: mpo test e2e --down\n');

  // If --up-only, stop here
  if (options.upOnly) {
    return;
  }

  // Run Playwright tests (discover app that has playwright.config)
  const e2eApp = await discoverE2EApp(projectRoot);
  if (!e2eApp) {
    console.error('No E2E app found: no app under apps/ has playwright.config.ts or playwright.config.js.');
    await tearDown(projectRoot, sessionFilePath);
    process.exit(1);
  }

  try {
    const playwrightArgs = ['playwright', 'test'];
    if (options.filter) {
      playwrightArgs.push(options.filter);
    }

    const baseUrl = `http://localhost:${3000 + portOffset}`;
    const frappeUrl = `http://localhost:${8000 + portOffset}`;
    const e2eCwd = path.join(projectRoot, 'apps', e2eApp);

    await spawn('pnpm', playwrightArgs, {
      stdio: 'inherit',
      cwd: e2eCwd,
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        FRAPPE_URL: frappeUrl,
        FRAPPE_SOCKETIO_PORT: String(9000 + portOffset),
        MARIADB_PORT: String(3306 + portOffset),
        REDIS_CACHE_PORT: String(6379 + portOffset),
        REDIS_QUEUE_PORT: String(6380 + portOffset),
        E2E_PORT_OFFSET: String(portOffset),
      },
    });
  } finally {
    // Always tear down after running tests
    await tearDown(projectRoot, sessionFilePath);
  }
}

async function tearDown(projectRoot: string, sessionFilePath: string): Promise<void> {
  const spinner = yoctoSpinner({ text: 'Tearing down test environment...' }).start();
  try {
    const sessionData = JSON.parse(await fs.readFile(sessionFilePath, 'utf-8'));
    const { projectName, composeFile, tmpDir } = sessionData;

    await spawn('docker', ['compose', '-f', composeFile, '-p', projectName, 'down', '-v', '--remove-orphans'], {
      stdio: 'pipe',
      cwd: projectRoot,
    });

    // Clean up temp files
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.rm(sessionFilePath, { force: true });

    spinner.success('Test environment torn down');
  } catch {
    spinner.error('Failed to tear down (session may not exist)');
    // Clean up session file even on failure
    await fs.rm(sessionFilePath, { force: true }).catch(() => {});
  }
}

function getServiceUrls(services: string[], portOffset: number): Record<string, string> {
  const urls: Record<string, string> = {};

  urls.Frontend = `http://localhost:${3000 + portOffset}`;

  if (services.includes('keycloak')) {
    urls.Keycloak = `http://localhost:${8080 + portOffset}/auth`;
  }
  if (services.includes('mailpit')) {
    urls.Mailpit = `http://localhost:${8025 + portOffset}`;
  }
  if (services.includes('mariadb')) {
    urls['Frappe (MariaDB)'] = `localhost:${3306 + portOffset}`;
  }
  if (services.includes('redis-cache')) {
    urls['Redis Cache'] = `localhost:${6379 + portOffset}`;
  }
  if (services.includes('postgres')) {
    urls.Postgres = `localhost:${5432 + portOffset}`;
  }

  return urls;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll services for readiness instead of relying on a fixed sleep.
 * Checks TCP connectivity for MariaDB, Redis, Postgres, and HTTP for Mailpit/Keycloak.
 */
async function waitForServices(services: string[], portOffset: number): Promise<void> {
  const maxRetries = 30;
  const retryInterval = 2000;

  const checks: { name: string; check: () => Promise<boolean> }[] = [];

  for (const service of services) {
    const ports = defaultPorts[service];
    if (!ports) {
      continue;
    }

    for (const portDef of ports) {
      const hostPort = portDef.host + portOffset;

      if (service === 'mailpit' && portDef.container === 8025) {
        checks.push({
          name: `${service}:${hostPort}`,
          check: async () => await checkHttp(`http://localhost:${hostPort}/api/v1/info`),
        });
      } else if (service === 'keycloak') {
        checks.push({
          name: `${service}:${hostPort}`,
          check: async () => await checkHttp(`http://localhost:${hostPort}/auth/realms/master`),
        });
      } else {
        checks.push({
          name: `${service}:${hostPort}`,
          check: async () => await checkTcp('localhost', hostPort),
        });
      }
    }
  }

  for (const { name, check } of checks) {
    let ready = false;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        ready = await check();
        if (ready) {
          break;
        }
      } catch {
        // not ready yet
      }
      await sleep(retryInterval);
    }
    if (!ready) {
      console.warn(`Warning: ${name} did not become ready within ${(maxRetries * retryInterval) / 1000}s`);
    }
  }
}

async function checkTcp(host: string, port: number): Promise<boolean> {
  const net = await import('node:net');
  return await new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function checkHttp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}
