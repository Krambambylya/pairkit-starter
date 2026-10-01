import { PrismaClient } from '@/generated/prisma/client';
import type { DbClient } from '@/types/db-client';

export class PairingCodeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Atomically mark an unused, unexpired code as used. Returns null if already claimed. */
  async claimUnusedByHash(
    pairingCodeHash: string,
    db: DbClient = this.prisma,
  ): Promise<{ id: string; workspaceId: string } | null> {
    const now = new Date();
    const pairingCode = await db.pairingCode.findUnique({
      where: { codeHash: pairingCodeHash },
    });

    if (!pairingCode || pairingCode.usedAt || pairingCode.expiresAt <= now) {
      return null;
    }

    const claimed = await db.pairingCode.updateMany({
      where: {
        id: pairingCode.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (claimed.count !== 1) {
      return null;
    }

    return { id: pairingCode.id, workspaceId: pairingCode.workspaceId };
  }

  /** Expire unused codes so only the freshly issued one can be joined. */
  async invalidateUnusedForWorkspace(
    workspaceId: string,
    db: DbClient = this.prisma,
  ): Promise<void> {
    await db.pairingCode.updateMany({
      where: {
        workspaceId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt: new Date() },
    });
  }

  async create(
    data: { workspaceId: string; codeHash: string; expiresAt: Date },
    db: DbClient = this.prisma,
  ): Promise<void> {
    await db.pairingCode.create({ data });
  }
}
