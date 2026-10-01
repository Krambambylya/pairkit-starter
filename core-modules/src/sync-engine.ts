import type { RouterContractClient } from '@orpc/contract';

import type { contract } from './api/contract';
import type { ManifestDiff } from './api/items-sync';
import type { Item } from './api/item';
import type { CreateWorkspaceResult, TokenPair } from './api/workspace';

export type PairkitContractClient = RouterContractClient<typeof contract>;

export type { CreateWorkspaceResult, ManifestDiff, TokenPair, Item };

/** Soft budget per bootstrap/push HTTP body (uncompressed JSON). */
export const SYNC_CHUNK_BUDGET_BYTES = 450_000;
export const SYNC_PULL_BATCH_SIZE = 40;

/** Matches backend `PAIRING_CODE_EXPIRES_IN` (`5m`). */
export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;

export type SyncProgress = {
  phase: 'idle' | 'bootstrap' | 'sync' | 'error';
  message: string;
  done?: number;
  total?: number;
};

export type ItemTombstone = {
  id: string;
  deletedAt: string;
  updatedAt: string;
};

export type SyncState = 'off' | 'needsBootstrap' | 'ready';

export type SyncSession = {
  workspaceId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  syncState: SyncState;
  pendingPairingCode?: string | null;
  pendingPairingExpiresAt?: string | null;
  pendingRecoveryKey?: string | null;
  lastSyncedAt?: string | null;
};

export type SyncStorage<TItem extends Item, TSession extends SyncSession> = {
  getSavedItems: () => Promise<TItem[]>;
  writeItems: (items: TItem[]) => Promise<void>;
  getSession: () => Promise<TSession>;
  patchSession: (patch: Partial<TSession>) => Promise<unknown>;
  clearSession: () => Promise<void>;
  getTombstones: () => Promise<ItemTombstone[]>;
  addTombstone: (id: string) => Promise<void>;
  removeTombstones: (ids: string[]) => Promise<void>;
  clearAllTombstones: () => Promise<void>;
};

export type SyncEngineConfig<TItem extends Item, TSession extends SyncSession> = {
  deviceName: string;
  api: PairkitContractClient;
  storage: SyncStorage<TItem, TSession>;
};

export const sizeOf = (value: unknown): number => JSON.stringify(value).length;

export const chunkItems = <TItem>(
  items: TItem[],
  budgetBytes = SYNC_CHUNK_BUDGET_BYTES,
): TItem[][] => {
  const chunks: TItem[][] = [];
  let current: TItem[] = [];
  let currentSize = 2;

  for (const item of items) {
    const piece = sizeOf(item) + 1;
    if (current.length > 0 && currentSize + piece > budgetBytes) {
      chunks.push(current);
      current = [];
      currentSize = 2;
    }
    current.push(item);
    currentSize += piece;
  }
  if (current.length) chunks.push(current);
  return chunks;
};

const deletedItemStub = <TItem extends Item>(tombstone: ItemTombstone): TItem =>
  ({
    id: tombstone.id,
    title: 'deleted',
    body: '',
    createdAt: tombstone.deletedAt,
    updatedAt: tombstone.updatedAt,
    deletedAt: tombstone.deletedAt,
  }) as TItem;

export const mergeItemsByUpdatedAt = <TItem extends Item>(
  local: TItem[],
  incoming: TItem[],
): TItem[] => {
  if (!incoming.length) return local;
  const byId = new Map(local.map(item => [item.id, item]));
  for (const item of incoming) {
    if (item.deletedAt) continue;
    const existing = byId.get(item.id);
    if (!existing || new Date(item.updatedAt) >= new Date(existing.updatedAt)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
};

export function createSyncEngine<TItem extends Item, TSession extends SyncSession>(
  config: SyncEngineConfig<TItem, TSession>,
) {
  const { deviceName, api, storage } = config;
  let syncInFlight: Promise<void> | null = null;
  let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const enableSyncByCreate = async (): Promise<{
    pairingCode: string;
    recoveryKey: string;
  }> => {
    const created = await api.workspace.create({ deviceName });
    await storage.patchSession({
      accessToken: created.accessToken,
      refreshToken: created.refreshToken,
      workspaceId: 'active',
      syncState: 'needsBootstrap',
      pendingPairingCode: created.pairingCode,
      pendingPairingExpiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString(),
      pendingRecoveryKey: created.recoveryKey,
    } as Partial<TSession>);
    return { pairingCode: created.pairingCode, recoveryKey: created.recoveryKey };
  };

  const enableSyncByJoin = async (pairingCode: string): Promise<void> => {
    const joined = await api.workspace.join({
      pairingCode: pairingCode.trim(),
      deviceName,
    });
    await storage.patchSession({
      accessToken: joined.accessToken,
      refreshToken: joined.refreshToken,
      workspaceId: 'active',
      syncState: 'needsBootstrap',
      pendingPairingCode: null,
      pendingRecoveryKey: null,
    } as Partial<TSession>);
  };

  const enableSyncByRecover = async (recoveryKey: string): Promise<void> => {
    const key = recoveryKey.replace(/\s+/g, '').trim();
    if (key.length < 32) {
      throw new Error('Recovery key is too short');
    }
    const recovered = await api.workspace.recover({ recoveryKey: key, deviceName });
    await storage.patchSession({
      accessToken: recovered.accessToken,
      refreshToken: recovered.refreshToken,
      workspaceId: 'active',
      syncState: 'needsBootstrap',
      pendingPairingCode: null,
      pendingRecoveryKey: key,
    } as Partial<TSession>);
  };

  const disableSyncLocally = async (): Promise<void> => {
    await storage.clearSession();
  };

  const refreshPairingCode = async (): Promise<{ pairingCode: string; expiresAt: string }> => {
    const session = await storage.getSession();
    if (session.syncState === 'off' || !session.accessToken) {
      throw new Error('Sync is off');
    }
    const issued = await api.workspace.issuePairingCode();
    if (!issued.pairingCode) {
      throw new Error('Could not refresh pairing code');
    }
    await storage.patchSession({
      pendingPairingCode: issued.pairingCode,
      pendingPairingExpiresAt: issued.expiresAt,
    } as Partial<TSession>);
    return issued;
  };

  const recordLocalItemDeleted = async (id: string): Promise<void> => {
    const session = await storage.getSession();
    if (session.syncState === 'off') return;
    await storage.addTombstone(id);
  };

  const mergePulledItems = async (incoming: TItem[]): Promise<void> => {
    if (!incoming.length) return;
    const local = await storage.getSavedItems();
    await storage.writeItems(mergeItemsByUpdatedAt(local, incoming));
  };

  const applyRemoteTombstones = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const local = await storage.getSavedItems();
    const idSet = new Set(ids);
    await storage.writeItems(local.filter(item => !idSet.has(item.id)));
    await storage.removeTombstones(ids);
  };

  const runBootstrap = async (onProgress?: (progress: SyncProgress) => void): Promise<void> => {
    const items = await storage.getSavedItems();
    const chunks = chunkItems(items.filter(item => !item.id.startsWith('fake_')));
    const total = items.length;
    let done = 0;
    const sentIds: string[] = [];

    if (chunks.length === 0) {
      await storage.patchSession({
        syncState: 'ready',
        lastSyncedAt: new Date().toISOString(),
      } as Partial<TSession>);
      onProgress?.({ phase: 'bootstrap', message: 'No local items', done: 0, total: 0 });
      return;
    }

    for (const chunk of chunks) {
      onProgress?.({
        phase: 'bootstrap',
        message: 'Uploading…',
        done,
        total: total || chunks.length,
      });
      await api.items.bootstrap({
        items: chunk,
        cursor: { done: false, sentIds },
      });
      sentIds.push(...chunk.map(item => item.id));
      done += chunk.length;
    }

    await storage.patchSession({
      syncState: 'ready',
      lastSyncedAt: new Date().toISOString(),
    } as Partial<TSession>);
    onProgress?.({ phase: 'bootstrap', message: 'Done', done, total: done });
  };

  const runIncrementalSync = async (
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<void> => {
    const session = await storage.getSession();
    if (session.syncState === 'off') return;

    if (session.syncState === 'needsBootstrap') {
      await runBootstrap(onProgress);
    }

    onProgress?.({ phase: 'sync', message: 'Syncing…' });

    const [items, tombstones] = await Promise.all([
      storage.getSavedItems(),
      storage.getTombstones(),
    ]);
    const entries = [
      ...items.map(item => ({
        id: item.id,
        updatedAt: item.updatedAt,
        deletedAt: null as string | null,
      })),
      ...tombstones.map(tombstone => ({
        id: tombstone.id,
        updatedAt: tombstone.updatedAt,
        deletedAt: tombstone.deletedAt,
      })),
    ];

    const diff = await api.items.manifest({ entries });

    if (diff.tombstones.length) {
      await applyRemoteTombstones(diff.tombstones);
    }

    if (diff.pull.length) {
      const slices: string[][] = [];
      for (let i = 0; i < diff.pull.length; i += SYNC_PULL_BATCH_SIZE) {
        slices.push(diff.pull.slice(i, i + SYNC_PULL_BATCH_SIZE));
      }
      const pulled = await Promise.all(slices.map(ids => api.items.pull({ ids })));
      const incoming = pulled.flatMap(payload => payload.items) as TItem[];
      await mergePulledItems(incoming);
    }

    if (diff.pushNeeded.length) {
      const idSet = new Set(diff.pushNeeded);
      const toPushLive = items.filter(item => idSet.has(item.id));
      const toPushDeleted = tombstones
        .filter(tombstone => idSet.has(tombstone.id))
        .map(tombstone => deletedItemStub<TItem>(tombstone));
      const pushChunks = chunkItems([...toPushLive, ...toPushDeleted]);
      for (const chunk of pushChunks) {
        await api.items.push({ items: chunk });
      }
    }

    await storage.patchSession({
      lastSyncedAt: new Date().toISOString(),
      syncState: 'ready',
    } as Partial<TSession>);
    onProgress?.({ phase: 'idle', message: 'Synced' });
  };

  const runSyncExclusive = async (onProgress?: (progress: SyncProgress) => void): Promise<void> => {
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      try {
        await runIncrementalSync(onProgress);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync failed';
        onProgress?.({ phase: 'error', message });
        throw error;
      } finally {
        syncInFlight = null;
      }
    })();
    return syncInFlight;
  };

  const scheduleSyncAfterLocalChange = (): void => {
    if (syncInFlight) return;
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      void (async () => {
        const session = await storage.getSession();
        if (session.syncState === 'off') return;
        try {
          await runSyncExclusive();
        } catch {
          // best-effort background sync
        }
      })();
    }, 2500);
  };

  return {
    enableSyncByCreate,
    enableSyncByJoin,
    enableSyncByRecover,
    disableSyncLocally,
    refreshPairingCode,
    recordLocalItemDeleted,
    runBootstrap,
    runIncrementalSync,
    runSyncExclusive,
    scheduleSyncAfterLocalChange,
  };
}
