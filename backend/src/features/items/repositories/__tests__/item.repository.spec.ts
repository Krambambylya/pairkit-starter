import { describe, expect, it, vi } from 'vitest';

import { ItemRepository } from '../item.repository';

const item = {
  id: 'item-1',
  title: 'Hello',
  body: 'World',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  deletedAt: null,
};

const currentWhere = {
  id: 'item-1',
  workspaceId: 'ws-1',
  updatedAt: { lte: new Date('2024-01-02T00:00:00.000Z') },
};

describe('ItemRepository.saveIfCurrent', () => {
  const repository = new ItemRepository({} as never);

  it('updates a row that is not newer than the client', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn();

    await expect(
      repository.saveIfCurrent('ws-1', item, { item: { updateMany, create } } as never),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: currentWhere,
      data: {
        title: 'Hello',
        body: 'World',
        deletedAt: null,
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('inserts when no current row matched', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const create = vi.fn().mockResolvedValue({});

    await expect(
      repository.saveIfCurrent('ws-1', item, { item: { updateMany, create } } as never),
    ).resolves.toBe(true);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'item-1', workspaceId: 'ws-1', title: 'Hello' }),
    });
  });

  it('leaves a newer row in place when insert hits the existing id', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });

    await expect(
      repository.saveIfCurrent('ws-1', item, { item: { updateMany, create } } as never),
    ).resolves.toBe(false);

    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});
