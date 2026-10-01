import { ORPCError, safe } from '@orpc/client';
import { describe, expect, test } from 'vitest';

import { createPairkitRpc } from '../orpc';
import { isRateLimitError, rateLimitRetryAfterSec } from '../errors';
import { defaultWorkspaceSession, type WorkspaceSession } from '../session';

const rpcResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify({ json: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const rpcError = (code: string, message: string, status: number, data?: unknown) =>
  rpcResponse(
    {
      defined: false,
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
    status,
  );

describe('createPairkitRpc', () => {
  test('shares one refresh across parallel unauthorized calls', async () => {
    let session: WorkspaceSession = {
      ...defaultWorkspaceSession(),
      accessToken: 'expired',
      refreshToken: 'refresh-1',
      syncState: 'ready',
    };
    let refreshes = 0;

    const rpc = createPairkitRpc({
      getBaseUrl: () => 'http://api.test',
      getSession: async () => session,
      patchSession: async patch => {
        session = { ...session, ...patch };
      },
      fetch: async (input, init) => {
        const url = String(input);
        const auth = new Headers(init?.headers).get('authorization');
        if (url.endsWith('/rpc/workspace/refresh')) {
          refreshes += 1;
          return rpcResponse({ accessToken: 'next-access', refreshToken: 'next-refresh' });
        }
        if (url.endsWith('/rpc/items/list')) {
          if (auth !== 'Bearer next-access') {
            return rpcError('UNAUTHORIZED', 'Unauthorized', 401);
          }
          return rpcResponse({ items: [] });
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    const listed = await Promise.all([rpc.items.list(), rpc.items.list(), rpc.items.list()]);
    expect(listed.map(page => page.items)).toEqual([[], [], []]);
    expect(refreshes).toBe(1);
    expect(session.accessToken).toBe('next-access');
  });

  test('does not refresh again when workspace.refresh fails', async () => {
    let refreshes = 0;
    const rpc = createPairkitRpc({
      getBaseUrl: () => 'http://api.test',
      getSession: async () => ({
        ...defaultWorkspaceSession(),
        accessToken: 'expired',
        refreshToken: 'refresh-1',
      }),
      patchSession: async () => undefined,
      fetch: async input => {
        const url = String(input);
        if (url.endsWith('/rpc/workspace/refresh')) {
          refreshes += 1;
          return rpcError('INVALID_REFRESH_TOKEN', 'Invalid refresh token', 401);
        }
        if (url.endsWith('/rpc/items/list')) {
          return rpcError('UNAUTHORIZED', 'Unauthorized', 401);
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    await expect(rpc.items.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(refreshes).toBe(1);
  });

  test('reads TOO_MANY_REQUESTS retryAfter', async () => {
    const rpc = createPairkitRpc({
      getBaseUrl: () => 'http://api.test',
      getSession: async () => defaultWorkspaceSession(),
      patchSession: async () => undefined,
      fetch: async () =>
        rpcError('TOO_MANY_REQUESTS', 'Too many attempts, please try again later', 429, {
          retryAfter: 30,
        }),
    });

    const [error, data] = await safe(rpc.workspace.create({ deviceName: 'web' }));
    expect(data).toBeUndefined();
    expect(isRateLimitError(error)).toBe(true);
    expect(rateLimitRetryAfterSec(error)).toBe(30);
    expect(error).toBeInstanceOf(ORPCError);
  });

  test('rejects an empty API base URL before fetching', async () => {
    const rpc = createPairkitRpc({
      getBaseUrl: () => '',
      getSession: async () => defaultWorkspaceSession(),
      patchSession: async () => undefined,
      fetch: async () => {
        throw new Error('fetch should not run');
      },
    });

    await expect(rpc.workspace.create({ deviceName: 'web' })).rejects.toThrow(
      'API URL is not configured',
    );
  });
});
