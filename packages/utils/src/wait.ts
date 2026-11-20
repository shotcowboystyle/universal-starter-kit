import axios from 'axios';
import { Client } from 'pg';

const envOr = (key: string, fallback: string): string => {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
};

const sleep = async (ms: number): Promise<void> => {
  // oxlint-disable-next-line promise/avoid-new -- setTimeout has no promise form that works with vitest fake timers
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const pollUntil = async (isReady: () => Promise<boolean>, interval: number): Promise<void> => {
  if (await isReady()) {
    return;
  }
  await sleep(interval);
  await pollUntil(isReady, interval);
};

const isPingOk = async (url: string): Promise<boolean> => {
  try {
    const res = await axios.get(url);
    return res.status > 0 && res.status < 300;
  } catch {
    // Not reachable yet: report not-ready so the caller keeps polling
    return false;
  }
};

const canExecute = async <T>(execute: () => Promise<T>): Promise<boolean> => {
  try {
    await execute();
    return true;
  } catch {
    // Not accepting queries yet: report not-ready so the caller keeps polling
    return false;
  }
};

export const waitForPostgres = async (interval: number): Promise<void> => {
  const client = new Client({
    database: envOr('POSTGRES_DATABASE', 'postgres'),
    host: envOr('POSTGRES_HOSTNAME', 'localhost'),
    password: envOr('POSTGRES_PASSWORD', 'postgres'),
    port: Math.trunc(Number(envOr('POSTGRES_PORT', '5432'))),
    user: envOr('POSTGRES_USERNAME', 'postgres'),
  });
  try {
    await client.connect();
    await pollUntil(async () => await canExecute(async () => await client.query('SELECT 1')), interval);
  } finally {
    await client.end();
  }
};

export const waitForKeycloak = async (interval: number): Promise<void> => {
  await pollUntil(
    async () =>
      await isPingOk(
        `${envOr('BASE_URL', 'http://localhost:8000')}/auth/realms/master/.well-known/openid-configuration`,
      ),
    interval,
  );
};

export const formatServiceList = (services: readonly string[]): string => {
  if (services.length === 1) {
    return services[0];
  }
  if (services.length === 2) {
    return `${services[0]} and ${services[1]}`;
  }
  return `${services.slice(0, -1).join(', ')} and ${services.at(-1)}`;
};

export const waitServices = ['postgres', 'keycloak'] as const;

export type WaitService = (typeof waitServices)[number];
