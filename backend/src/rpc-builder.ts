import { implement, ORPCError } from '@orpc/server';
import { contract } from '@pairkit/core/api';

import { ERROR } from '@/constants/messages';

import { enforceRateLimit } from './rate-limit';
import type { RouterDeps, RpcContext } from './rpc-context';
import { mapDomainError } from './rpc-error';

export const createImplementer = (deps: RouterDeps) => {
  const os = implement(contract)
    .$context<RpcContext>()
    .use(async ({ next }) => {
      try {
        return await next();
      } catch (error) {
        throw mapDomainError(error);
      }
    })
    .use(async ({ context, next }) => {
      await enforceRateLimit(deps.globalLimiter, context.clientIp);
      return next();
    });

  const authLimit = os.middleware(async ({ context, next }) => {
    await enforceRateLimit(deps.authLimiter, context.clientIp);
    return next();
  });

  const requireSession = os.middleware(async ({ context, next }) => {
    const principal = await deps.authenticate(
      context.reqHeaders?.get('authorization') ?? undefined,
    );
    if (!principal) {
      throw new ORPCError('UNAUTHORIZED', { message: ERROR.UNAUTHORIZED });
    }
    return next({
      context: {
        workspaceId: principal.workspaceId,
        deviceId: principal.deviceId,
      },
    });
  });

  return { os, authLimit, requireSession };
};

export type ProcedureBuilder = ReturnType<typeof createImplementer>;
