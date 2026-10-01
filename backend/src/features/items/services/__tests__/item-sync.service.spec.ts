import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_ITEMS_PER_WORKSPACE } from '@/constants/config.constants';
import { AccessForbiddenError, ItemLimitExceededError } from '@/domain-errors';

import { ItemSyncService } from '../item-sync.service';

const itemRepository = {
  findGlobalById: vi.fn(),
  countLive: vi.fn(),
  upsertSavedItem: vi.fn(),
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
    itemRepository.findGlobalById.mockResolvedValue({
      id: 'item-1',
      workspaceId: 'other',
      updatedAt: new Date(),
      deletedAt: null,
    });

    await expect(service.upsert('ws-1', item)).rejects.toBeInstanceOf(AccessForbiddenError);
  });

  it('lists live items and touches the workspace', async () => {
    itemRepository.listLive.mockResolvedValue([item]);

    await expect(service.list('ws-1')).resolves.toEqual({ items: [item] });
    expect(workspaceRepository.touchLastUsedAt).toHaveBeenCalledWith('ws-1');
  });

  it('upserts a new item and returns the saved row', async () => {
    itemRepository.findGlobalById.mockResolvedValue(null);
    itemRepository.countLive.mockResolvedValue(0);
    itemRepository.findByIds.mockResolvedValue([item]);

    await expect(service.upsert('ws-1', item)).resolves.toEqual({ item });
    expect(itemRepository.upsertSavedItem).toHaveBeenCalledWith('ws-1', item);
  });

  it('skips a write when the server copy is newer', async () => {
    itemRepository.findGlobalById.mockResolvedValue({
      id: 'item-1',
      workspaceId: 'ws-1',
      updatedAt: new Date('2024-06-01T00:00:00.000Z'),
      deletedAt: null,
    });

    await expect(service.upsert('ws-1', item)).resolves.toEqual({ item });
    expect(itemRepository.upsertSavedItem).not.toHaveBeenCalled();
  });

  it('refuses a new live item once the workspace is full', async () => {
    itemRepository.findGlobalById.mockResolvedValue(null);
    itemRepository.countLive.mockResolvedValue(MAX_ITEMS_PER_WORKSPACE);

    await expect(service.upsert('ws-1', item)).rejects.toBeInstanceOf(ItemLimitExceededError);
  });

  it('bootstraps accepted ids and echoes the cursor', async () => {
    itemRepository.findGlobalById.mockResolvedValue(null);
    itemRepository.countLive.mockResolvedValue(0);
    const cursor = { done: false, sentIds: [] };

    await expect(service.bootstrap('ws-1', { items: [item], cursor })).resolves.toEqual({
      acceptedIds: ['item-1'],
      cursor,
    });
  });

  it('pulls the requested rows', async () => {
    itemRepository.findByIds.mockResolvedValue([item]);

    await expect(service.pull('ws-1', { ids: ['item-1'] })).resolves.toEqual({ items: [item] });
  });

  it('pushes accepted ids', async () => {
    itemRepository.findGlobalById.mockResolvedValue(null);
    itemRepository.countLive.mockResolvedValue(0);

    await expect(service.push('ws-1', { items: [item] })).resolves.toEqual({
      acceptedIds: ['item-1'],
    });
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
