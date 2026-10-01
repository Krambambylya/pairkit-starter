import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_ITEMS_PER_WORKSPACE } from '@/constants/config.constants';
import { AccessForbiddenError, ItemLimitExceededError } from '@/domain-errors';

import { ItemSyncService } from '../item-sync.service';

const itemRepository = {
  withTransaction: vi.fn(async (fn: (db: unknown) => Promise<unknown>) => fn({})),
  findGlobalByIds: vi.fn(),
  countLive: vi.fn(),
  saveIfCurrent: vi.fn(),
  listManifest: vi.fn(),
  findByIds: vi.fn(),
  listLive: vi.fn(),
  toDto: vi.fn(row => row),
};

const workspaceRepository = {
  touchLastUsedAt: vi.fn(),
};

const item = {
  id: 'item-1',
  title: 'Hello',
  body: 'World',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
};

describe('ItemSyncService', () => {
  let service: ItemSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    itemRepository.findGlobalByIds.mockResolvedValue([]);
    itemRepository.countLive.mockResolvedValue(0);
    itemRepository.saveIfCurrent.mockResolvedValue(true);
    itemRepository.findByIds.mockResolvedValue([]);
    service = new ItemSyncService(itemRepository as never, workspaceRepository as never);
  });

  it('manifest asks the client to pull server-only live rows', async () => {
    itemRepository.listManifest.mockResolvedValue([
      { id: 'a', updatedAt: new Date('2024-02-01T00:00:00.000Z'), deletedAt: null },
    ]);

    const result = await service.manifest('ws-1', { entries: [] });

    expect(result).toEqual({ pull: ['a'], pushNeeded: [], tombstones: [] });
  });

  it('manifest asks the client to push ids the server does not have', async () => {
    itemRepository.listManifest.mockResolvedValue([]);

    const result = await service.manifest('ws-1', {
      entries: [{ id: 'b', updatedAt: '2024-02-01T00:00:00.000Z', deletedAt: null }],
    });

    expect(result).toEqual({ pull: [], pushNeeded: ['b'], tombstones: [] });
  });

  it('rejects an item that belongs to another workspace', async () => {
    itemRepository.findGlobalByIds.mockResolvedValue([
      {
        id: 'item-1',
        workspaceId: 'other',
        updatedAt: new Date(),
        deletedAt: null,
      },
    ]);

    await expect(service.upsert('ws-1', item)).rejects.toBeInstanceOf(AccessForbiddenError);
    expect(itemRepository.saveIfCurrent).not.toHaveBeenCalled();
  });

  it('lists live items and touches the workspace', async () => {
    itemRepository.listLive.mockResolvedValue([item]);

    await expect(service.list('ws-1')).resolves.toEqual({ items: [item] });
    expect(workspaceRepository.touchLastUsedAt).toHaveBeenCalledWith('ws-1');
  });

  it('upserts a new item and returns the saved row', async () => {
    itemRepository.findByIds.mockResolvedValue([item]);

    await expect(service.upsert('ws-1', item)).resolves.toEqual({ item });
    expect(itemRepository.saveIfCurrent).toHaveBeenCalledWith('ws-1', item, expect.anything());
  });

  it('skips a write when the server copy is newer', async () => {
    itemRepository.findGlobalByIds.mockResolvedValue([
      {
        id: 'item-1',
        workspaceId: 'ws-1',
        updatedAt: new Date('2024-06-01T00:00:00.000Z'),
        deletedAt: null,
      },
    ]);

    await expect(service.upsert('ws-1', item)).resolves.toEqual({ item });
    expect(itemRepository.saveIfCurrent).not.toHaveBeenCalled();
  });

  it('refuses to restore a deleted item once the workspace is full', async () => {
    itemRepository.findGlobalByIds.mockResolvedValue([
      {
        id: 'item-1',
        workspaceId: 'ws-1',
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        deletedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);
    itemRepository.countLive.mockResolvedValue(MAX_ITEMS_PER_WORKSPACE);

    await expect(service.upsert('ws-1', item)).rejects.toBeInstanceOf(ItemLimitExceededError);
    expect(itemRepository.saveIfCurrent).not.toHaveBeenCalled();
  });

  it('refuses a new live item once the workspace is full', async () => {
    itemRepository.countLive.mockResolvedValue(MAX_ITEMS_PER_WORKSPACE);

    await expect(service.upsert('ws-1', item)).rejects.toBeInstanceOf(ItemLimitExceededError);
    expect(itemRepository.saveIfCurrent).not.toHaveBeenCalled();
  });

  it('bootstraps accepted ids and echoes the cursor', async () => {
    const cursor = { done: false, sentIds: [] };

    await expect(service.bootstrap('ws-1', { items: [item], cursor })).resolves.toEqual({
      acceptedIds: ['item-1'],
      cursor,
    });
    expect(itemRepository.findGlobalByIds).toHaveBeenCalledTimes(1);
    expect(itemRepository.countLive).toHaveBeenCalledTimes(1);
  });

  it('pulls the requested rows', async () => {
    itemRepository.findByIds.mockResolvedValue([item]);

    await expect(service.pull('ws-1', { ids: ['item-1'] })).resolves.toEqual({ items: [item] });
  });

  it('pushes a batch with one lookup and one live count', async () => {
    const second = { ...item, id: 'item-2' };

    await expect(service.push('ws-1', { items: [item, second] })).resolves.toEqual({
      acceptedIds: ['item-1', 'item-2'],
    });
    expect(itemRepository.findGlobalByIds).toHaveBeenCalledTimes(1);
    expect(itemRepository.findGlobalByIds).toHaveBeenCalledWith(
      ['item-1', 'item-2'],
      expect.anything(),
    );
    expect(itemRepository.countLive).toHaveBeenCalledTimes(1);
    expect(itemRepository.saveIfCurrent).toHaveBeenCalledTimes(2);
  });

  it('skips a stale row in a push batch and writes the newer one', async () => {
    const fresh = { ...item, id: 'item-2', updatedAt: '2024-03-01T00:00:00.000Z' };
    itemRepository.findGlobalByIds.mockResolvedValue([
      {
        id: 'item-1',
        workspaceId: 'ws-1',
        updatedAt: new Date('2024-06-01T00:00:00.000Z'),
        deletedAt: null,
      },
    ]);

    await expect(service.push('ws-1', { items: [item, fresh] })).resolves.toEqual({
      acceptedIds: ['item-2'],
    });
    expect(itemRepository.saveIfCurrent).toHaveBeenCalledTimes(1);
    expect(itemRepository.saveIfCurrent).toHaveBeenCalledWith('ws-1', fresh, expect.anything());
  });

  it('saves the rows that fit, then reports the workspace is full', async () => {
    itemRepository.countLive.mockResolvedValue(MAX_ITEMS_PER_WORKSPACE - 1);
    const second = { ...item, id: 'item-2' };

    await expect(service.push('ws-1', { items: [item, second] })).rejects.toBeInstanceOf(
      ItemLimitExceededError,
    );
    expect(itemRepository.saveIfCurrent).toHaveBeenCalledTimes(1);
    expect(itemRepository.saveIfCurrent).toHaveBeenCalledWith('ws-1', item, expect.anything());
  });

  it('frees a live slot when the batch deletes a row before adding another', async () => {
    const tombstone = {
      ...item,
      deletedAt: '2024-01-03T00:00:00.000Z',
      updatedAt: '2024-01-03T00:00:00.000Z',
    };
    const second = { ...item, id: 'item-2', updatedAt: '2024-01-04T00:00:00.000Z' };
    itemRepository.findGlobalByIds.mockResolvedValue([
      {
        id: 'item-1',
        workspaceId: 'ws-1',
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        deletedAt: null,
      },
    ]);
    itemRepository.countLive.mockResolvedValue(MAX_ITEMS_PER_WORKSPACE);

    await expect(service.push('ws-1', { items: [tombstone, second] })).resolves.toEqual({
      acceptedIds: ['item-1', 'item-2'],
    });
  });

  it('counts a repeated id once toward the live limit', async () => {
    itemRepository.countLive.mockResolvedValue(MAX_ITEMS_PER_WORKSPACE - 1);
    const again = { ...item, title: 'Again', updatedAt: '2024-01-03T00:00:00.000Z' };

    await expect(service.push('ws-1', { items: [item, again] })).resolves.toEqual({
      acceptedIds: ['item-1', 'item-1'],
    });
    expect(itemRepository.saveIfCurrent).toHaveBeenCalledTimes(2);
  });

  it('manifest sends a tombstone when the server deleted a row the client lacks', async () => {
    itemRepository.listManifest.mockResolvedValue([
      {
        id: 'gone',
        updatedAt: new Date('2024-02-01T00:00:00.000Z'),
        deletedAt: new Date('2024-02-02T00:00:00.000Z'),
      },
    ]);

    await expect(service.manifest('ws-1', { entries: [] })).resolves.toEqual({
      pull: [],
      pushNeeded: [],
      tombstones: ['gone'],
    });
  });
});
