import type { ProcedureBuilder } from '@/rpc-builder';

import { WorkspaceService } from './services/workspace.service';

export const workspaceProcedures = (
  { os, authLimit, requireSession }: ProcedureBuilder,
  service: WorkspaceService,
) => ({
  create: os.workspace.create
    .use(authLimit)
    .handler(async ({ input }) => service.createWorkspace(input)),
  join: os.workspace.join.use(authLimit).handler(async ({ input }) => service.joinWorkspace(input)),
  recover: os.workspace.recover
    .use(authLimit)
    .handler(async ({ input }) => service.recoverWorkspace(input)),
  refresh: os.workspace.refresh.use(authLimit).handler(async ({ input }) => service.refresh(input)),
  issuePairingCode: os.workspace.issuePairingCode
    .use(requireSession)
    .handler(async ({ context }) => service.issuePairingCode(context.workspaceId)),
});
