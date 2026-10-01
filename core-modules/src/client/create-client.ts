import type { Item } from '../api/item';
import { createSyncEngine, type SyncSession } from '../sync-engine';

import { createItemsStorage } from './items-storage';
import type { JsonKvStore } from './kv';
import { createPairkitRpc, type PairkitRpcDeps } from './orpc';
import { createTombstoneStorage } from './tombstones';

export type PairkitClientDeps<TSession extends SyncSession = SyncSession> = {
  deviceName: string;
  kv: JsonKvStore;
  session: {
    getSession: () => Promise<TSession>;
    patchSession: (patch: Partial<TSession>) => Promise<unknown>;
    clearSession: () => Promise<void>;
  };
  getBaseUrl: () => string;
  fetch?: PairkitRpcDeps['fetch'];
};

export const createPairkitClient = <TSession extends SyncSession = SyncSession>(
  deps: PairkitClientDeps<TSession>,
) => {
  const items = createItemsStorage(deps.kv);
  const tombstones = createTombstoneStorage(deps.kv);
  const client = createPairkitRpc({
    getBaseUrl: deps.getBaseUrl,
    getSession: deps.session.getSession,
    patchSession: patch => deps.session.patchSession(patch as Partial<TSession>),
    fetch: deps.fetch,
  });

  const engine = createSyncEngine<Item, TSession>({
    deviceName: deps.deviceName,
    api: client,
    storage: {
      getSavedItems: items.getSavedItems,
      writeItems: items.writeItems,
      getSession: deps.session.getSession,
      patchSession: deps.session.patchSession,
      clearSession: deps.session.clearSession,
      getTombstones: tombstones.getTombstones,
      addTombstone: tombstones.addTombstone,
      removeTombstones: tombstones.removeTombstones,
      clearAllTombstones: tombstones.clearAllTombstones,
    },
  });

  return {
    client,
    ...engine,
    getSavedItems: items.getSavedItems,
    upsertLocalItem: items.upsertLocalItem,
  };
};
