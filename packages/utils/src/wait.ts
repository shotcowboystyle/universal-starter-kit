import axios from 'axios';
import pg from 'pg';

export async function waitForFrappe(interval: number) {
  try {
    const res = await axios.get(`${process.env.BASE_URL || 'http://frappe.localhost'}/api/method/ping`);
    if ((res?.status || 500) < 300) {
      return;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, interval));
  return waitForFrappe(interval);
}

export async function waitForPostgres(interval: number) {
  const client = new pg.Client({
    database: process.env.POSTGRES_DATABASE || 'postgres',
    host: process.env.POSTGRES_HOSTNAME || 'localhost',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    port: Number.parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USERNAME || 'postgres',
  });
  try {
    await client.connect();
    while (true) {
      try {
        await client.query('SELECT 1');
        return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  } finally {
    await client.end();
  }
}

export async function waitForMariaDB(interval: number) {
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.MARIADB_HOSTNAME || 'localhost',
    port: Number.parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USERNAME || 'root',
    password: process.env.MARIADB_PASSWORD || 'root',
    database: process.env.MARIADB_DATABASE || 'frappe',
  });
  try {
    while (true) {
      try {
        await connection.execute('SELECT 1');
        return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  } finally {
    await connection.end();
  }
}

export async function waitForKeycloak(interval: number) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:8000';
  try {
    const res = await axios.get(`${baseUrl}/auth/realms/master/.well-known/openid-configuration`);
    if ((res?.status || 500) < 300) {
      return;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, interval));
  return waitForKeycloak(interval);
}

export function formatServiceList(services: readonly string[]): string {
  if (services.length === 1) {
    return services[0];
  }
  if (services.length === 2) {
    return `${services[0]} and ${services[1]}`;
  }
  return `${services.slice(0, -1).join(', ')} and ${services[services.length - 1]}`;
}

export const waitServices = ['frappe', 'postgres', 'mariadb', 'keycloak'] as const;

export type WaitService = (typeof waitServices)[number];
