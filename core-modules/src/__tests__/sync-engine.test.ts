import { describe, expect, test } from 'vitest';

import type { Item } from '../api/item';
import {
  chunkItems,
  createSyncEngine,
  mergeItemsByUpdatedAt,
  type PairkitContractClient,
  type SyncSession,
} from '../sync-engine';

const item = (id: string, updatedAt: string): Item => ({
  id,
  title: id,
  body: '',
  createdAt: updatedAt,
  updatedAt,
});

describe('chunkItems', () => {
  test('keeps a small payload in one chunk', () => {
    const chunks = chunkItems([item('a', '2024-01-01T00:00:00.000Z')]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(1);
  });

  test('splits when the budget is smaller than two items', () => {
    const first = item('a', '2024-01-01T00:00:00.000Z');
    const second = item('b', '2024-01-02T00:00:00.000Z');
    const chunks = chunkItems([first, second], JSON.stringify(first).length + 4);
    expect(chunks).toHaveLength(2);
  });
});

describe('mergeItemsByUpdatedAt', () => {
  test('keeps the newer incoming copy and ignores deletedAt', () => {
    const local = [item('a', '2024-01-01T00:00:00.000Z')];
    const incoming: Item[] = [
      { ...item('a', '2024-02-01T00:00:00.000Z'), title: 'newer' },
      { ...item('b', '2024-02-01T00:00:00.000Z'), deletedAt: '2024-02-01T00:00:00.000Z' },
    ];
    const merged = mergeItemsByUpdatedAt(local, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('newer');
  });
});

describe('createSyncEngine', () => {
  test('calls contract procedures instead of envelope fields', async () => {
    const bootstrapped: string[][] = [];
    let session: SyncSession = {
      workspaceId: null,
      accessToken: null,
      refreshToken: null,
      syncState: 'off',
    };
    const saved = [item('local', '2024-01-01T00:00:00.000Z')];
    const api = {
      workspace: {
        create: async ({ deviceName }: { deviceName: string }) => ({
          recoveryKey: 'r'.repeat(32),
          pairingCode: '123456',
          accessToken: 'access',
          refreshToken: 'refresh',
          deviceName,
        }),
        issuePairingCode: async () => ({
          pairingCode: '654321',
          expiresAt: '2024-01-01T00:05:00.000Z',
        }),
      },
      items: {
        bootstrap: async ({ items }: { items: Item[] }) => {
          bootstrapped.push(items.map(entry => entry.id));
          return { acceptedIds: items.map(entry => entry.id), cursor: null };
        },
        manifest: async () => ({ pull: [], pushNeeded: [], tombstones: [] }),
        pull: async () => ({ items: [] }),
        push: async () => ({ acceptedIds: [] }),
      },
    } as unknown as PairkitContractClient;

    const engine = createSyncEngine<Item, SyncSession>({
      deviceName: 'phone',
      api,
      storage: {
        getSavedItems: async () => saved,
        writeItems: async () => undefined,
        getSession: async () => session,
        patchSession: async patch => {
          session = { ...session, ...patch };
        },
        clearSession: async () => undefined,
        getTombstones: async () => [],
        addTombstone: async () => undefined,
        removeTombstones: async () => undefined,
        clearAllTombstones: async () => undefined,
      },
    });

    const created = await engine.enableSyncByCreate();
    expect(created.pairingCode).toBe('123456');
    expect(session.pendingRecoveryKey).toHaveLength(32);

    await engine.runIncrementalSync();
    expect(bootstrapped).toEqual([['local']]);

    const refreshed = await engine.refreshPairingCode();
    expect(refreshed.pairingCode).toBe('654321');
    expect(session.pendingPairingCode).toBe('654321');
  });
});
