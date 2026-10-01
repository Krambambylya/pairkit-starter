import { PrismaClient } from '@/generated/prisma/client';
import type { DbClient } from '@/types/db-client';

export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    data: {
      tokenHash: string;
      workspaceId: string;
      deviceId: string;
      expiresAt: Date;
    },
    db: DbClient = this.prisma,
  ) {
    return db.refreshToken.create({ data });
  }

  async findById(id: string, db: DbClient = this.prisma) {
    return db.refreshToken.findUnique({
      where: { id },
      select: { id: true, revokedAt: true, expiresAt: true, deviceId: true },
    });
  }

  async findByHash(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        workspaceId: true,
        deviceId: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
  }

  /** Returns 1 if this still-valid token was claimed (revoked) in this call. */
  async claimValidById(id: string, db: DbClient = this.prisma): Promise<number> {
    const result = await db.refreshToken.updateMany({
      where: {
        id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeAllForDevice(deviceId: string, db: DbClient = this.prisma): Promise<void> {
    await db.refreshToken.updateMany({
      where: { deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async deleteExpired(now = new Date(), db: DbClient = this.prisma): Promise<number> {
    const result = await db.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }],
      },
    });
    return result.count;
  }
}
