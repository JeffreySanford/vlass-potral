const TEST_FALLBACKS = {
  JWT_SECRET: 'test-jwt-secret',
  SESSION_SECRET: 'test-session-secret',
} as const;

function readSecret(name: keyof typeof TEST_FALLBACKS): string {
  const raw = process.env[name];
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }

  if (process.env['NODE_ENV'] === 'test') {
    return TEST_FALLBACKS[name];
  }

  throw new Error(
    `${name} is required. Set it in your environment before starting the API.`,
  );
}

export function getJwtSecret(): string {
  return readSecret('JWT_SECRET');
}

export function getSessionSecret(): string {
  return readSecret('SESSION_SECRET');
}
