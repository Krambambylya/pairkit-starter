import { MemoryRateLimiter } from '@orpc/ratelimit/memory';
import { call, ORPCError } from '@orpc/server';
import type { Item } from '@pairkit/core/api';
import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRouter } from '@/create-router';
import { InvalidPairingCodeError } from '@/domain-errors';
import type { AuthenticateAccessToken, RpcContext } from '@/rpc-context';
import { sanitizeClientError } from '@/rpc-error';

const item: Item = {
  id: 'item-1',
  title: 'Hello',
  body: '',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
};

const log = pino({ level: 'silent' });

const context = (headers?: Headers): RpcContext => ({
  requestId: 'req-1',
  clientIp: '203.0.113.8',
  log,
  reqHeaders: headers,
});

const routerWith = (
  overrides: {
    createWorkspace?: ReturnType<typeof vi.fn>;
    list?: ReturnType<typeof vi.fn>;
    authenticate?: AuthenticateAccessToken;
    authMax?: number;
  } = {},
) =>
  createRouter({
    workspaceService: {
      createWorkspace: overrides.createWorkspace ?? vi.fn(),
      joinWorkspace: vi.fn(),
      recoverWorkspace: vi.fn(),
      refresh: vi.fn(),
      issuePairingCode: vi.fn(),
    } as never,
    itemSyncService: {
      list: overrides.list ?? vi.fn(async () => ({ items: [] })),
      upsert: vi.fn(),
      bootstrap: vi.fn(),
      manifest: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
    } as never,
    authenticate:
      overrides.authenticate ?? (async () => ({ workspaceId: 'ws-1', deviceId: 'dev-1' })),
    globalLimiter: new MemoryRateLimiter({ maxRequests: 100, window: 60_000 }),
    authLimiter: new MemoryRateLimiter({ maxRequests: overrides.authMax ?? 10, window: 60_000 }),
  });

describe('router procedures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create returns the service payload', async () => {
    const payload = {
      recoveryKey: 'r'.repeat(32),
      pairingCode: '123456',
      accessToken: 'access',
      refreshToken: 'refresh',
    };
    const router = routerWith({
      createWorkspace: vi.fn(async () => payload),
    });

    await expect(
      call(router.workspace.create, { deviceName: 'web' }, { context: context() }),
    ).resolves.toEqual(payload);
  });

  it('maps an invalid pairing code to its contract error', async () => {
    const joinRouter = createRouter({
      workspaceService: {
        createWorkspace: vi.fn(),
        joinWorkspace: vi.fn(async () => {
          throw new InvalidPairingCodeError();
        }),
        recoverWorkspace: vi.fn(),
        refresh: vi.fn(),
        issuePairingCode: vi.fn(),
      } as never,
      itemSyncService: {
        list: vi.fn(),
        upsert: vi.fn(),
        bootstrap: vi.fn(),
        manifest: vi.fn(),
        pull: vi.fn(),
        push: vi.fn(),
      } as never,
      authenticate: async () => null,
      globalLimiter: new MemoryRateLimiter({ maxRequests: 100, window: 60_000 }),
      authLimiter: new MemoryRateLimiter({ maxRequests: 10, window: 60_000 }),
    });

    await expect(
      call(
        joinRouter.workspace.join,
        { pairingCode: '000000', deviceName: 'phone' },
        { context: context() },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PAIRING_CODE' });
  });

  it('requires a user for items.list', async () => {
    const router = routerWith({ authenticate: async () => null });

    await expect(call(router.items.list, undefined, { context: context() })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('lists items for an authenticated workspace', async () => {
    const list = vi.fn(async () => ({ items: [item] }));
    const router = routerWith({ list });

    await expect(
      call(router.items.list, undefined, {
        context: context(new Headers({ authorization: 'Bearer token' })),
      }),
    ).resolves.toEqual({ items: [item] });
    expect(list).toHaveBeenCalledWith('ws-1');
  });

  it('rejects the auth procedures with retryAfter after the limit', async () => {
    const router = routerWith({
      authMax: 1,
      createWorkspace: vi.fn(async () => ({
        recoveryKey: 'r'.repeat(32),
        pairingCode: '123456',
        accessToken: 'access',
        refreshToken: 'refresh',
      })),
    });
    const input = { deviceName: 'web' };
    await call(router.workspace.create, input, { context: context() });

    const error = await call(router.workspace.create, input, { context: context() }).then(
      () => null,
      err => err,
    );
    expect(error).toBeInstanceOf(ORPCError);
    expect(error.code).toBe('TOO_MANY_REQUESTS');
    expect(error.data.retryAfter).toBeGreaterThan(0);
  });
});

describe('sanitizeClientError', () => {
  it('hides output validation and unknown failures', () => {
    const spy = pino({ level: 'silent' });
    const errorLog = vi.spyOn(spy, 'error');
    const leaked = new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Output validation failed',
      cause: new Error('schema issue on secret_column'),
    });

    expect(() => sanitizeClientError(leaked, spy, 'req-9')).toThrow(ORPCError);
    try {
      sanitizeClientError(leaked, spy, 'req-9');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
      expect(String((error as Error).message)).not.toContain('secret_column');
    }
    expect(errorLog).toHaveBeenCalled();

    expect(() => sanitizeClientError(new Error('prisma detail'), spy, 'req-9')).toThrow(
      'Internal server error',
    );

    expect(() =>
      sanitizeClientError(
        new ORPCError('INVALID_PAIRING_CODE', { message: 'bad code' }),
        spy,
        'req-9',
      ),
    ).toThrow('bad code');
    expect(() =>
      sanitizeClientError(new ORPCError('MADE_UP', { message: 'secret_column' }), spy, 'req-9'),
    ).toThrow('Internal server error');
  });
});
