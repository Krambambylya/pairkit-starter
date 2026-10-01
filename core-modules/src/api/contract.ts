import { oc } from '@orpc/contract';

import { contractErrorBodies, rateLimitErrors } from './errors';
import {
  bootstrapItemsPayloadSchema,
  bootstrapItemsSchema,
  listItemsPayloadSchema,
  manifestDiffSchema,
  manifestItemsSchema,
  pullItemsPayloadSchema,
  pullItemsSchema,
  pushItemsPayloadSchema,
  pushItemsSchema,
  upsertItemPayloadSchema,
  upsertItemSchema,
} from './items-sync';
import {
  createWorkspaceResultSchema,
  createWorkspaceSchema,
  joinWorkspaceSchema,
  pairingCodePayloadSchema,
  recoverWorkspaceSchema,
  refreshWorkspaceSchema,
  tokenPairSchema,
} from './workspace';

const limited = oc.errors(rateLimitErrors);

const itemConflict = {
  ACCESS_FORBIDDEN: contractErrorBodies.ACCESS_FORBIDDEN,
  ITEM_LIMIT_EXCEEDED: contractErrorBodies.ITEM_LIMIT_EXCEEDED,
} as const;

export const contract = {
  workspace: {
    create: limited.input(createWorkspaceSchema).output(createWorkspaceResultSchema),
    join: limited
      .input(joinWorkspaceSchema)
      .output(tokenPairSchema)
      .errors({ INVALID_PAIRING_CODE: contractErrorBodies.INVALID_PAIRING_CODE }),
    recover: limited
      .input(recoverWorkspaceSchema)
      .output(tokenPairSchema)
      .errors({ INVALID_RECOVERY_KEY: contractErrorBodies.INVALID_RECOVERY_KEY }),
    refresh: limited
      .input(refreshWorkspaceSchema)
      .output(tokenPairSchema)
      .errors({ INVALID_REFRESH_TOKEN: contractErrorBodies.INVALID_REFRESH_TOKEN }),
    issuePairingCode: limited.output(pairingCodePayloadSchema),
  },
  items: {
    list: limited.output(listItemsPayloadSchema),
    upsert: limited.input(upsertItemSchema).output(upsertItemPayloadSchema).errors(itemConflict),
    bootstrap: limited
      .input(bootstrapItemsSchema)
      .output(bootstrapItemsPayloadSchema)
      .errors(itemConflict),
    manifest: limited.input(manifestItemsSchema).output(manifestDiffSchema),
    pull: limited.input(pullItemsSchema).output(pullItemsPayloadSchema),
    push: limited.input(pushItemsSchema).output(pushItemsPayloadSchema).errors(itemConflict),
  },
};
