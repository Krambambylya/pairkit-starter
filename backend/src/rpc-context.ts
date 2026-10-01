import type { RateLimiter } from '@orpc/ratelimit';
import type { RequestHeadersHandlerPluginContext } from '@orpc/server/plugins';
import type { Logger } from 'pino';

export type AccessPrincipal = {
  workspaceId: string;
  deviceId: string;
};

export type AuthenticateAccessToken = (
  authorizationHeader: string | undefined,
) => Promise<AccessPrincipal | null>;

export type RpcContext = RequestHeadersHandlerPluginContext & {
  requestId: string;
  clientIp: string;
  log: Logger;
};

export type RouterDeps = {
  globalLimiter: RateLimiter;
  authLimiter: RateLimiter;
  authenticate: AuthenticateAccessToken;
};
