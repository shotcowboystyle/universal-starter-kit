import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForFrappe, waitForKeycloak, waitForPostgres } from './wait';

// NOTE: waitForMariaDB is intentionally not covered here — it loads its
// driver through a bare `require("mysql2/promise")`, which bypasses vitest
// module mocks, so it cannot be exercised without touching the network.

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

const pgState = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  lastConfig: undefined as Record<string, unknown> | undefined,
}));

vi.mock('pg', () => ({
  default: {
    Client: class {
      constructor(config: Record<string, unknown>) {
        pgState.lastConfig = config;
      }
      connect = pgState.connect;
      query = pgState.query;
      end = pgState.end;
    },
  },
}));

const mockedGet = vi.mocked(axios.get);

const managedEnvKeys = [
  'BASE_URL',
  'POSTGRES_DATABASE',
  'POSTGRES_HOSTNAME',
  'POSTGRES_PASSWORD',
  'POSTGRES_PORT',
  'POSTGRES_USERNAME',
] as const;

describe('wait loops', () => {
  const savedEnv: Partial<Record<(typeof managedEnvKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    for (const key of managedEnvKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    mockedGet.mockReset();
    pgState.connect.mockReset().mockResolvedValue(undefined);
    pgState.query.mockReset().mockResolvedValue({ rows: [] });
    pgState.end.mockReset().mockResolvedValue(undefined);
    pgState.lastConfig = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const key of managedEnvKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe('waitForFrappe', () => {
    it('resolves immediately when the ping endpoint answers with a 2xx', async () => {
      mockedGet.mockResolvedValue({ status: 200 });
      await expect(waitForFrappe(1000)).resolves.toBeUndefined();
      expect(mockedGet).toHaveBeenCalledTimes(1);
      expect(mockedGet).toHaveBeenCalledWith('http://frappe.localhost/api/method/ping');
    });

    it('pings BASE_URL when set', async () => {
      process.env.BASE_URL = 'https://erp.example.com';
      mockedGet.mockResolvedValue({ status: 200 });
      await waitForFrappe(1000);
      expect(mockedGet).toHaveBeenCalledWith('https://erp.example.com/api/method/ping');
    });

    it('retries after the interval when the request throws, then resolves', async () => {
      mockedGet.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue({ status: 200 });
      const done = vi.fn();
      const promise = waitForFrappe(250).then(done);
      await vi.advanceTimersByTimeAsync(249);
      expect(done).not.toHaveBeenCalled();
      expect(mockedGet).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(mockedGet).toHaveBeenCalledTimes(2);
      expect(done).toHaveBeenCalled();
    });

    it('treats a non-2xx response as not ready and keeps polling', async () => {
      mockedGet.mockResolvedValueOnce({ status: 503 }).mockResolvedValue({ status: 200 });
      const promise = waitForFrappe(100);
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(mockedGet).toHaveBeenCalledTimes(2);
    });
  });

  describe('waitForKeycloak', () => {
    it('resolves when the realm discovery document answers with a 2xx', async () => {
      mockedGet.mockResolvedValue({ status: 200 });
      await expect(waitForKeycloak(1000)).resolves.toBeUndefined();
      expect(mockedGet).toHaveBeenCalledWith(
        'http://localhost:8000/auth/realms/master/.well-known/openid-configuration',
      );
    });

    it('honors BASE_URL and retries until the endpoint is reachable', async () => {
      process.env.BASE_URL = 'https://auth.example.com';
      mockedGet.mockRejectedValueOnce(new Error('down')).mockResolvedValue({ status: 200 });
      const promise = waitForKeycloak(500);
      await vi.advanceTimersByTimeAsync(500);
      await promise;
      expect(mockedGet).toHaveBeenCalledTimes(2);
      expect(mockedGet).toHaveBeenLastCalledWith(
        'https://auth.example.com/auth/realms/master/.well-known/openid-configuration',
      );
    });
  });

  describe('waitForPostgres', () => {
    it('connects with defaults, probes SELECT 1, and always closes the client', async () => {
      await expect(waitForPostgres(1000)).resolves.toBeUndefined();
      expect(pgState.lastConfig).toEqual({
        database: 'postgres',
        host: 'localhost',
        password: 'postgres', // gitleaks:allow -- test fixture
        port: 5432,
        user: 'postgres',
      });
      expect(pgState.query).toHaveBeenCalledWith('SELECT 1');
      expect(pgState.end).toHaveBeenCalledTimes(1);
    });

    it('builds the client config from POSTGRES_* env vars', async () => {
      process.env.POSTGRES_DATABASE = 'appdb';
      process.env.POSTGRES_HOSTNAME = 'db.internal';
      process.env.POSTGRES_PASSWORD = 'secret'; // gitleaks:allow -- test fixture
      process.env.POSTGRES_PORT = '6543';
      process.env.POSTGRES_USERNAME = 'svc';
      await waitForPostgres(1000);
      expect(pgState.lastConfig).toEqual({
        database: 'appdb',
        host: 'db.internal',
        password: 'secret', // gitleaks:allow -- test fixture
        port: 6543,
        user: 'svc',
      });
    });

    it('retries the probe query after the interval until it succeeds', async () => {
      pgState.query.mockRejectedValueOnce(new Error('starting up')).mockResolvedValue({ rows: [] });
      const promise = waitForPostgres(200);
      await vi.advanceTimersByTimeAsync(200);
      await promise;
      expect(pgState.query).toHaveBeenCalledTimes(2);
      expect(pgState.end).toHaveBeenCalledTimes(1);
    });

    it('propagates a connection failure (no retry) but still closes the client', async () => {
      pgState.connect.mockRejectedValue(new Error('auth failed'));
      await expect(waitForPostgres(100)).rejects.toThrow('auth failed');
      expect(pgState.query).not.toHaveBeenCalled();
      expect(pgState.end).toHaveBeenCalledTimes(1);
    });
  });
});
