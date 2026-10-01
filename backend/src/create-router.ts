import { MemoryRateLimiter } from '@orpc/ratelimit/memory';

import { PrismaService } from '@/config/prisma.config';
import { RATE_LIMIT } from '@/constants/config.constants';
import { itemProcedures } from '@/features/items/item.procedures';
import { ItemRepository } from '@/features/items/repositories/item.repository';
import { ItemSyncService } from '@/features/items/services/item-sync.service';
import { DeviceRepository } from '@/features/user/repositories/device.repository';
import { PairingCodeRepository } from '@/features/user/repositories/pairing-code.repository';
import { RefreshTokenRepository } from '@/features/user/repositories/refresh-token.repository';
import { WorkspaceRepository } from '@/features/user/repositories/workspace.repository';
import { WorkspaceService } from '@/features/user/services/workspace.service';
import { workspaceProcedures } from '@/features/user/workspace.procedures';
import type { PrismaClient } from '@/generated/prisma/client';
import { authenticateAccessToken } from '@/middleware/auth.middleware';

import { createImplementer } from './rpc-builder';
import type { AuthenticateAccessToken, RouterDeps } from './rpc-context';

export type AppRouterDeps = RouterDeps & {
  workspaceService: WorkspaceService;
  itemSyncService: ItemSyncService;
};

export const createRouter = (deps: AppRouterDeps) => {
  const builder = createImplementer(deps);
  return builder.os.router({
    workspace: workspaceProcedures(builder, deps.workspaceService),
    items: itemProcedures(builder, deps.itemSyncService),
  });
};

export const createAppRouter = (prisma: PrismaClient = PrismaService.getInstance().client) => {
  const workspaceRepository = new WorkspaceRepository(prisma);
  const workspaceService = new WorkspaceService(
    prisma,
    workspaceRepository,
    new PairingCodeRepository(prisma),
    new DeviceRepository(prisma),
    new RefreshTokenRepository(prisma),
  );
  const itemSyncService = new ItemSyncService(new ItemRepository(prisma), workspaceRepository);
  const authenticate: AuthenticateAccessToken = authenticateAccessToken;

  return createRouter({
    workspaceService,
    itemSyncService,
    authenticate,
    globalLimiter: new MemoryRateLimiter({
      maxRequests: RATE_LIMIT.GLOBAL_MAX,
      window: RATE_LIMIT.GLOBAL_WINDOW_MS,
    }),
    authLimiter: new MemoryRateLimiter({
      maxRequests: RATE_LIMIT.AUTH_MAX,
      window: RATE_LIMIT.AUTH_WINDOW_MS,
    }),
  });
};
