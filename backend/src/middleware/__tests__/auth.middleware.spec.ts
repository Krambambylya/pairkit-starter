import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { JWT_SECRET, findFirst } = vi.hoisted(() => ({
  JWT_SECRET: 'for_tests_only_not_a_real_secret',
  findFirst: vi.fn(),
}));

vi.mock('../../config/env-config', () => ({
  env: { JWT_SECRET },
}));

vi.mock('../../config/prisma.config', () => ({
  PrismaService: {
    getInstance: () => ({
      client: {
        device: { findFirst },
      },
    }),
  },
}));

import { authenticateAccessToken } from '../auth.middleware';

describe('authenticateAccessToken', () => {
  beforeEach(() => {
    findFirst.mockReset();
    findFirst.mockResolvedValue({ id: 'dev-1' });
  });

  it('rejects a missing token', async () => {
    await expect(authenticateAccessToken(undefined)).resolves.toBeNull();
  });

  it('rejects an invalid token', async () => {
    await expect(authenticateAccessToken('Bearer not-a-real-token')).resolves.toBeNull();
  });

  it('rejects tokens without workspace claims', async () => {
    const token = jwt.sign({ userId: 'user-1' }, JWT_SECRET, { algorithm: 'HS256' });
    await expect(authenticateAccessToken(`Bearer ${token}`)).resolves.toBeNull();
  });

  it('returns workspaceId and deviceId for a valid bearer token', async () => {
    const token = jwt.sign({ workspaceId: 'ws-1', deviceId: 'dev-1' }, JWT_SECRET, {
      algorithm: 'HS256',
    });

    await expect(authenticateAccessToken(`Bearer ${token}`)).resolves.toEqual({
      workspaceId: 'ws-1',
      deviceId: 'dev-1',
    });
  });

  it('rejects a valid jwt whose device has been revoked', async () => {
    findFirst.mockResolvedValue(null);
    const token = jwt.sign({ workspaceId: 'ws-1', deviceId: 'dev-1' }, JWT_SECRET, {
      algorithm: 'HS256',
    });

    await expect(authenticateAccessToken(`Bearer ${token}`)).resolves.toBeNull();
  });

  it('does not read a token that is not a bearer header', async () => {
    const token = jwt.sign({ workspaceId: 'ws-2', deviceId: 'dev-2' }, JWT_SECRET, {
      algorithm: 'HS256',
    });

    await expect(authenticateAccessToken(token)).resolves.toBeNull();
  });
});
