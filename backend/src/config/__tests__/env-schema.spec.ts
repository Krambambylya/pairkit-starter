import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { envSchema } from '../env-schema';
import { PUBLIC_JWT_SECRETS } from '../public-jwt-secrets';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: randomBytes(32).toString('base64url'),
  WHITE_LIST_URLS: 'https://example.com,https://app.example.com',
};

describe('envSchema', () => {
  it('accepts a minimal valid config and applies defaults', () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(4000);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.JWT_EXPIRES_IN).toBe('15m');
      expect(result.data.JWT_REFRESH_EXPIRES_IN).toBe('30d');
      expect(result.data.WHITE_LIST_URLS).toEqual([
        'https://example.com',
        'https://app.example.com',
      ]);
    }
  });

  it('does not require SHADOW_DATABASE_URL', () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
  });

  it('rejects a JWT_SECRET that repeats one character', () => {
    const result = envSchema.safeParse({ ...validEnv, JWT_SECRET: 'a'.repeat(32) });

    expect(result.success).toBe(false);
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    const result = envSchema.safeParse({ ...validEnv, JWT_SECRET: 'too-short' });

    expect(result.success).toBe(false);
  });

  it('rejects repository JWT stand-ins outside test and allows them in test', () => {
    for (const secret of PUBLIC_JWT_SECRETS) {
      expect(envSchema.safeParse({ ...validEnv, JWT_SECRET: secret }).success).toBe(false);
      expect(
        envSchema.safeParse({ ...validEnv, NODE_ENV: 'production', JWT_SECRET: secret }).success,
      ).toBe(false);
      expect(
        envSchema.safeParse({ ...validEnv, NODE_ENV: 'test', JWT_SECRET: secret }).success,
      ).toBe(true);
    }
  });

  it('rejects a non-URL DATABASE_URL', () => {
    const result = envSchema.safeParse({ ...validEnv, DATABASE_URL: 'not-a-url' });

    expect(result.success).toBe(false);
  });
});
