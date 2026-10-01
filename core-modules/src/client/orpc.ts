import { createORPCClient, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';

import { contract } from '../api/contract';
import type { SyncSession } from '../sync-engine';

export type PairkitRpc = RouterContractClient<typeof contract>;

export type PairkitRpcDeps = {
  getBaseUrl: () => string;
  getSession: () => Promise<Pick<SyncSession, 'accessToken' | 'refreshToken'>>;
  patchSession: (patch: Partial<SyncSession>) => Promise<unknown>;
  fetch?: typeof fetch;
};

const refreshPath = (path: readonly string[]) => path[0] === 'workspace' && path[1] === 'refresh';

export const createPairkitRpc = (deps: PairkitRpcDeps): PairkitRpc => {
  let rpc: PairkitRpc | undefined;
  let refreshInFlight: Promise<boolean> | null = null;

  const refreshOnce = (): Promise<boolean> => {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const session = await deps.getSession();
        if (!session.refreshToken || !rpc) return false;
        try {
          const pair = await rpc.workspace.refresh({ refreshToken: session.refreshToken });
          await deps.patchSession({
            accessToken: pair.accessToken,
            refreshToken: pair.refreshToken,
          });
          return true;
        } catch {
          return false;
        }
      })().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  };

  const link = new RPCLink({
    origin: () => {
      const base = deps.getBaseUrl().replace(/\/$/, '');
      if (!base) {
        throw new Error('API URL is not configured');
      }
      return base;
    },
    url: '/rpc',
    headers: async () => {
      const session = await deps.getSession();
      if (!session.accessToken) return {};
      return { authorization: `Bearer ${session.accessToken}` };
    },
    // Window.fetch throws if it is called without the window as `this`.
    fetch: deps.fetch ? (url, init) => deps.fetch!.call(globalThis, url, init) : undefined,
    interceptors: [
      async ({ path, next }) => {
        if (refreshPath(path)) {
          return next();
        }
        try {
          return await next();
        } catch (error) {
          if (!(error instanceof ORPCError) || error.code !== 'UNAUTHORIZED') {
            throw error;
          }
          const refreshed = await refreshOnce();
          if (!refreshed) {
            throw error;
          }
          return next();
        }
      },
    ],
  });

  const created = createORPCClient<PairkitRpc>(link);
  rpc = created;
  return created;
};
