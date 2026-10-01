import type { ProcedureBuilder } from '@/rpc-builder';

import { ItemSyncService } from './services/item-sync.service';

export const itemProcedures = (
  { os, requireSession }: ProcedureBuilder,
  service: ItemSyncService,
) => ({
  list: os.items.list
    .use(requireSession)
    .handler(async ({ context }) => service.list(context.workspaceId)),
  upsert: os.items.upsert
    .use(requireSession)
    .handler(async ({ input, context }) => service.upsert(context.workspaceId, input)),
  bootstrap: os.items.bootstrap
    .use(requireSession)
    .handler(async ({ input, context }) => service.bootstrap(context.workspaceId, input)),
  manifest: os.items.manifest
    .use(requireSession)
    .handler(async ({ input, context }) => service.manifest(context.workspaceId, input)),
  pull: os.items.pull
    .use(requireSession)
    .handler(async ({ input, context }) => service.pull(context.workspaceId, input)),
  push: os.items.push
    .use(requireSession)
    .handler(async ({ input, context }) => service.push(context.workspaceId, input)),
});
