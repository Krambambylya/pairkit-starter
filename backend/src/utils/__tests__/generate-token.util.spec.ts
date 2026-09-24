import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';

const { JWT_SECRET } = vi.hoisted(() => ({
  JWT_SECRET: 'for_tests_only_not_a_real_secret',
}));

vi.mock('../../config/env-config', () => ({
  env: {
    JWT_SECRET,
    JWT_EXPIRES_IN: '2h',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}));

import {
  generateAccessToken,
  generateRefreshTokenValue,
  getRefreshTokenExpiryDate,
  hashPairingCode,
  hashRefreshToken,
} from '../generate-token.util';

describe('generateAccessToken', () => {
  it('signs a token containing workspaceId and deviceId, honoring JWT_EXPIRES_IN', () => {
    const token = generateAccessToken({ workspaceId: 'ws-1', deviceId: 'dev-1' });

    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    expect(decoded.workspaceId).toBe('ws-1');
    expect(decoded.deviceId).toBe('dev-1');
    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
    expect((decoded.exp as number) - (decoded.iat as number)).toBe(2 * 60 * 60);
  });
});

describe('refresh token helpers', () => {
  it('generates opaque refresh tokens and stable hashes', () => {
    const token = generateRefreshTokenValue();
    expect(token).toHaveLength(64);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
  });

  it('HMACs pairing codes instead of using raw SHA-256', () => {
    const a = hashPairingCode('123456');
    const b = hashPairingCode('123456');
    expect(a).toBe(b);
    expect(a).not.toBe(hashRefreshToken('123456'));
    expect(a).toHaveLength(64);
  });

  it('parses JWT_REFRESH_EXPIRES_IN into a future date', () => {
    const expiresAt = getRefreshTokenExpiryDate('7d');
    const deltaMs = expiresAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(deltaMs).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
  });
});
