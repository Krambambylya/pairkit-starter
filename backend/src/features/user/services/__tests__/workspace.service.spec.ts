import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/generate-token.util', () => ({
  generateRecoveryKey: () => 'recovery-key-value-that-is-long-enough',
  generatePairingCode: () => '123456',
  generateRefreshTokenValue: () => 'refresh-token-value-32b-hex-placeholder',
  generateAccessToken: () => 'access.jwt.token',
  hashSecret: (value: string) => `hash:${value}`,
  hashPairingCode: (value: string) => `hmac:${value}`,
  durationToMs: () => 60_000,
}));

import { InvalidPairingCodeError, InvalidRefreshTokenError } from '@/domain-errors';

import { WorkspaceService } from '../workspace.service';

const prisma = {
  $transaction: vi.fn(async (fn: (tx: Record<string, never>) => unknown) => fn({})),
};

const workspaceRepository = {
  createWorkspace: vi.fn(),
  touchLastUsedAt: vi.fn(),
  findIdByRecoveryKeyHash: vi.fn(),
};

const pairingCodeRepository = {
  findByPairingCodeHash: vi.fn(),
  claimUnusedByHash: vi.fn(),
  markUsed: vi.fn(),
  invalidateUnusedForWorkspace: vi.fn(),
  create: vi.fn(),
};

const deviceRepository = {
  joinDevice: vi.fn(),
  findActive: vi.fn(),
  revoke: vi.fn(),
};

const refreshTokenRepository = {
  create: vi.fn(),
  findByHash: vi.fn(),
  findById: vi.fn(),
  findValidByHash: vi.fn(),
  claimValidById: vi.fn(),
  revokeById: vi.fn(),
  revokeAllForDevice: vi.fn(),
};

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async fn => fn({}));
    service = new WorkspaceService(
      prisma as never,
      workspaceRepository as never,
      pairingCodeRepository as never,
      deviceRepository as never,
      refreshTokenRepository as never,
    );
  });

  it('createWorkspace returns pairing secrets', async () => {
    workspaceRepository.createWorkspace.mockResolvedValue({
      workspaceId: 'ws-1',
      deviceId: 'dev-1',
    });

    const result = await service.createWorkspace({ deviceName: 'web' });

    expect(result).toEqual({
      recoveryKey: 'recovery-key-value-that-is-long-enough',
      pairingCode: '123456',
      accessToken: 'access.jwt.token',
      refreshToken: 'refresh-token-value-32b-hex-placeholder',
    });
  });

  it('joinWorkspace throws for an unknown pairing code', async () => {
    pairingCodeRepository.claimUnusedByHash.mockResolvedValue(null);

    await expect(
      service.joinWorkspace({ pairingCode: '000000', deviceName: 'phone' }),
    ).rejects.toBeInstanceOf(InvalidPairingCodeError);
  });

  it('joinWorkspace issues a token pair', async () => {
    pairingCodeRepository.claimUnusedByHash.mockResolvedValue({
      id: 'code-1',
      workspaceId: 'ws-1',
    });
    deviceRepository.joinDevice.mockResolvedValue({ deviceId: 'dev-2' });

    const result = await service.joinWorkspace({ pairingCode: '123456', deviceName: 'phone' });

    expect(result).toEqual({
      accessToken: 'access.jwt.token',
      refreshToken: 'refresh-token-value-32b-hex-placeholder',
    });
    expect(pairingCodeRepository.claimUnusedByHash).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('only one of two parallel join claims succeeds', async () => {
    let claims = 0;
    pairingCodeRepository.claimUnusedByHash.mockImplementation(async () => {
      claims += 1;
      if (claims === 1) {
        return { id: 'code-1', workspaceId: 'ws-1' };
      }
      return null;
    });
    deviceRepository.joinDevice.mockResolvedValue({ deviceId: 'dev-2' });

    const settled = await Promise.allSettled([
      service.joinWorkspace({ pairingCode: '123456', deviceName: 'phone-a' }),
      service.joinWorkspace({ pairingCode: '123456', deviceName: 'phone-b' }),
    ]);

    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter(result => result.status === 'rejected')).toHaveLength(1);
  });

  it('recoverWorkspace throws for an unknown recovery key', async () => {
    workspaceRepository.findIdByRecoveryKeyHash.mockResolvedValue(null);

    await expect(
      service.recoverWorkspace({
        recoveryKey: 'a'.repeat(32),
        deviceName: 'web',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RECOVERY_KEY' });
  });

  it('refresh throws for an invalid token', async () => {
    refreshTokenRepository.findByHash.mockResolvedValue(null);

    await expect(service.refresh({ refreshToken: 'not-valid-refresh' })).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('refresh rotates a valid token', async () => {
    refreshTokenRepository.findByHash.mockResolvedValue({
      id: 'rt-1',
      workspaceId: 'ws-1',
      deviceId: 'dev-1',
      revokedAt: null,
    });
    refreshTokenRepository.claimValidById.mockResolvedValue(1);
    deviceRepository.findActive.mockResolvedValue({ id: 'dev-1' });

    const result = await service.refresh({ refreshToken: 'valid-refresh' });

    expect(result).toEqual({
      accessToken: 'access.jwt.token',
      refreshToken: 'refresh-token-value-32b-hex-placeholder',
    });
    expect(refreshTokenRepository.create).toHaveBeenCalled();
  });

  it('refresh replay of a rotated token revokes the device', async () => {
    refreshTokenRepository.findByHash.mockResolvedValue({
      id: 'rt-1',
      workspaceId: 'ws-1',
      deviceId: 'dev-1',
      revokedAt: new Date(),
    });
    refreshTokenRepository.claimValidById.mockResolvedValue(0);
    refreshTokenRepository.findById.mockResolvedValue({
      id: 'rt-1',
      revokedAt: new Date(),
      deviceId: 'dev-1',
    });
    prisma.$transaction.mockImplementation(async fn => {
      try {
        return await fn({});
      } catch (error) {
        deviceRepository.revoke.mockClear();
        refreshTokenRepository.revokeAllForDevice.mockClear();
        throw error;
      }
    });

    await expect(service.refresh({ refreshToken: 'already-rotated' })).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    expect(deviceRepository.revoke).toHaveBeenCalledWith('dev-1', expect.anything());
    expect(refreshTokenRepository.revokeAllForDevice).toHaveBeenCalledWith(
      'dev-1',
      expect.anything(),
    );
  });

  it('refresh claim race still revokes the device after re-reading revokedAt', async () => {
    refreshTokenRepository.findByHash.mockResolvedValue({
      id: 'rt-1',
      workspaceId: 'ws-1',
      deviceId: 'dev-1',
      revokedAt: null,
    });
    refreshTokenRepository.claimValidById.mockResolvedValue(0);
    refreshTokenRepository.findById.mockResolvedValue({
      id: 'rt-1',
      revokedAt: new Date(),
      deviceId: 'dev-1',
    });

    await expect(service.refresh({ refreshToken: 'raced-refresh' })).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    expect(deviceRepository.revoke).toHaveBeenCalledWith('dev-1', expect.anything());
  });
});
