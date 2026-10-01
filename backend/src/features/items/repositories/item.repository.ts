import type { Item } from '@pairkit/core/api';

import { PrismaClient } from '@/generated/prisma/client';
import type { DbClient } from '@/types/db-client';

const isUniqueConflict = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code: unknown }).code === 'P2002';

type ItemRow = {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class ItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  toDto(row: ItemRow): Item {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    };
  }

  async withTransaction<T>(fn: (db: DbClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(tx => fn(tx));
  }

  async countLive(workspaceId: string, db: DbClient = this.prisma): Promise<number> {
    return db.item.count({
      where: { workspaceId, deletedAt: null },
    });
  }

  async findByIds(workspaceId: string, ids: string[]) {
    return this.prisma.item.findMany({
      where: { workspaceId, id: { in: ids } },
    });
  }

  async findGlobalByIds(ids: string[], db: DbClient = this.prisma) {
    if (ids.length === 0) return [];
    return db.item.findMany({
      where: { id: { in: ids } },
      select: { id: true, workspaceId: true, updatedAt: true, deletedAt: true },
    });
  }

  async listLive(workspaceId: string) {
    return this.prisma.item.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listManifest(workspaceId: string) {
    return this.prisma.item.findMany({
      where: { workspaceId },
      select: {
        id: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
  }

  /**
   * Writes the client row when the server copy is missing or not newer.
   * Returns false when a newer server row won the race.
   */
  async saveIfCurrent(
    workspaceId: string,
    item: Item,
    db: DbClient = this.prisma,
  ): Promise<boolean> {
    const createdAt = new Date(item.createdAt);
    const updatedAt = new Date(item.updatedAt);
    const deletedAt = item.deletedAt ? new Date(item.deletedAt) : null;
    const fields = {
      title: item.title,
      body: item.body,
      deletedAt,
      updatedAt,
    };
    const current = {
      id: item.id,
      workspaceId,
      updatedAt: { lte: updatedAt },
    };

    const updated = await db.item.updateMany({ where: current, data: fields });
    if (updated.count > 0) return true;

    try {
      await db.item.create({
        data: {
          id: item.id,
          workspaceId,
          ...fields,
          createdAt,
        },
      });
      return true;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }

    const raced = await db.item.updateMany({ where: current, data: fields });
    return raced.count > 0;
  }
}
