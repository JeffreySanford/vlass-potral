import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  User,
  Post,
  Revision,
  Comment,
  Snapshot,
  ViewerState,
  ViewerSnapshot,
  AuditLog,
  VlassTileCache,
} from './entities';

function readEnvFile(): Record<string, string> {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env.local'),
    resolve(process.cwd(), '../../.env'),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    return {};
  }

  const map: Record<string, string> = {};
  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    map[key] = value;
  }
  return map;
}

const envFileValues = readEnvFile();
const isProduction = process.env.NODE_ENV === 'production';
const envValue = (key: string, fallback: string): string => {
  if (!isProduction && envFileValues[key] !== undefined) {
    return envFileValues[key];
  }
  return process.env[key] || fallback;
};
const envFlag = (key: string, fallback: boolean): boolean => {
  const raw = envValue(key, fallback ? 'true' : 'false').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};
const requiredEnv = (key: string, fallback: string): string => {
  const value = envValue(key, fallback).trim();
  if (value.length > 0) {
    return value;
  }
  if (process.env.NODE_ENV === 'test') {
    return fallback;
  }
  throw new Error(`${key} is required for database configuration.`);
};
const loggingEnabled = envFlag('DB_LOGGING', false);
const allowSensitiveDbLogging = envFlag('DB_ALLOW_SENSITIVE_LOGGING', false);

if (isProduction && loggingEnabled && !allowSensitiveDbLogging) {
  throw new Error(
    'DB_LOGGING is disabled in production by default to prevent sensitive data exposure. Set DB_ALLOW_SENSITIVE_LOGGING=true to override intentionally.',
  );
}

export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: envValue('DB_HOST', 'localhost'),
  port: parseInt(envValue('DB_PORT', '15432'), 10),
  username: envValue('DB_USER', 'cosmic_horizons_user'),
  password: requiredEnv('DB_PASSWORD', 'cosmic_horizons_password_dev'),
  database: envValue('DB_NAME', 'cosmic_horizons'),
  entities: [User, Post, Revision, Comment, Snapshot, ViewerState, ViewerSnapshot, AuditLog, VlassTileCache],
  synchronize: false,
  logging: loggingEnabled,
  ssl: process.env.DB_SSL === 'true'
    ? {
        rejectUnauthorized: envFlag('DB_SSL_REJECT_UNAUTHORIZED', true),
      }
    : false,
  extra: {
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
});
