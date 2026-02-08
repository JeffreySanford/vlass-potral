import { getJwtSecret, getSessionSecret } from './security.config';

describe('security.config', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalJwt = process.env['JWT_SECRET'];
  const originalSession = process.env['SESSION_SECRET'];

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
    if (originalJwt === undefined) {
      delete process.env['JWT_SECRET'];
    } else {
      process.env['JWT_SECRET'] = originalJwt;
    }
    if (originalSession === undefined) {
      delete process.env['SESSION_SECRET'];
    } else {
      process.env['SESSION_SECRET'] = originalSession;
    }
  });

  it('returns configured secrets when present', () => {
    process.env['NODE_ENV'] = 'development';
    process.env['JWT_SECRET'] = 'jwt-live-secret';
    process.env['SESSION_SECRET'] = 'session-live-secret';

    expect(getJwtSecret()).toBe('jwt-live-secret');
    expect(getSessionSecret()).toBe('session-live-secret');
  });

  it('uses deterministic test fallbacks in test env', () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['JWT_SECRET'];
    delete process.env['SESSION_SECRET'];

    expect(getJwtSecret()).toBe('test-jwt-secret');
    expect(getSessionSecret()).toBe('test-session-secret');
  });

  it('throws when required secrets are missing outside test env', () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['JWT_SECRET'];
    delete process.env['SESSION_SECRET'];

    expect(() => getJwtSecret()).toThrow('JWT_SECRET is required');
    expect(() => getSessionSecret()).toThrow('SESSION_SECRET is required');
  });
});
