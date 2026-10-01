import type {
  CreateWorkspaceInput,
  CreateWorkspaceResult,
  JoinWorkspaceInput,
  PairingCodePayload,
  RecoverWorkspaceInput,
  RefreshWorkspaceInput,
  TokenPair,
} from '@pairkit/core/api';

import { PAIRING_CODE_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from '@/constants/config.constants';
import {
  InvalidPairingCodeError,
  InvalidRecoveryKeyError,
  InvalidRefreshTokenError,
} from '@/domain-errors';
import { DeviceRepository } from '@/features/user/repositories/device.repository';
import { PairingCodeRepository } from '@/features/user/repositories/pairing-code.repository';
import { RefreshTokenRepository } from '@/features/user/repositories/refresh-token.repository';
import { WorkspaceRepository } from '@/features/user/repositories/workspace.repository';
import { CreateWorkspaceRepositoryInput } from '@/features/user/types/workspace.types';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  durationToMs,
  generateAccessToken,
  generatePairingCode,
  generateRecoveryKey,
  generateRefreshTokenValue,
  hashPairingCode,
  hashSecret,
} from '@/utils/generate-token.util';

export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly pairingCodeRepository: PairingCodeRepository,
    private readonly deviceRepository: DeviceRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async createWorkspace(input: CreateWorkspaceInput): Promise<CreateWorkspaceResult> {
    const recoveryKey = generateRecoveryKey();
    const pairingCode = generatePairingCode();
    const recoveryKeyHash = hashSecret(recoveryKey);
    const pairingCodeHash = hashPairingCode(pairingCode);
    const pairingCodeExpiresAt = new Date(Date.now() + durationToMs(PAIRING_CODE_EXPIRES_IN));
    const refreshToken = generateRefreshTokenValue();
    const refreshTokenHash = hashSecret(refreshToken);
    const refreshTokenExpiresAt = new Date(Date.now() + durationToMs(REFRESH_TOKEN_EXPIRES_IN));

    const repositoryInput: CreateWorkspaceRepositoryInput = {
      pairingCodeHash,
      pairingCodeExpiresAt,
      recoveryKeyHash,
      deviceName: input.deviceName,
      refreshTokenHash,
      refreshTokenExpiresAt,
    };

    const { workspaceId, deviceId } =
      await this.workspaceRepository.createWorkspace(repositoryInput);
    const accessToken = generateAccessToken({ workspaceId, deviceId });

    return {
      recoveryKey,
      pairingCode,
      accessToken,
      refreshToken,
    };
  }

  async joinWorkspace(input: JoinWorkspaceInput): Promise<TokenPair> {
    const { pairingCode, deviceName } = input;
    const pairingCodeHash = hashPairingCode(pairingCode);

    return this.prisma.$transaction(async tx => {
      const claimed = await this.pairingCodeRepository.claimUnusedByHash(pairingCodeHash, tx);
      if (!claimed) {
        throw new InvalidPairingCodeError();
      }

      const { deviceId } = await this.deviceRepository.joinDevice(
        claimed.workspaceId,
        deviceName,
        tx,
      );
      await this.workspaceRepository.touchLastUsedAt(claimed.workspaceId, tx);

      const refreshToken = generateRefreshTokenValue();
      const refreshTokenHash = hashSecret(refreshToken);
      const refreshTokenExpiresAt = new Date(Date.now() + durationToMs(REFRESH_TOKEN_EXPIRES_IN));

      await this.refreshTokenRepository.create(
        {
          tokenHash: refreshTokenHash,
          workspaceId: claimed.workspaceId,
          deviceId,
          expiresAt: refreshTokenExpiresAt,
        },
        tx,
      );

      const accessToken = generateAccessToken({ workspaceId: claimed.workspaceId, deviceId });

      return { accessToken, refreshToken };
    });
  }

  /**
   * Re-attach a device using the long-lived recovery key shown once at workspace create.
   * Does not revoke existing devices — issues a new device + token pair.
   */
  async recoverWorkspace(input: RecoverWorkspaceInput): Promise<TokenPair> {
    const recoveryKey = input.recoveryKey.replace(/\s+/g, '');
    const recoveryKeyHash = hashSecret(recoveryKey);
    const workspaceId = await this.workspaceRepository.findIdByRecoveryKeyHash(recoveryKeyHash);

    if (!workspaceId) {
      throw new InvalidRecoveryKeyError();
    }

    return this.prisma.$transaction(async tx => {
      const { deviceId } = await this.deviceRepository.joinDevice(
        workspaceId,
        input.deviceName,
        tx,
      );
      await this.workspaceRepository.touchLastUsedAt(workspaceId, tx);

      const accessToken = generateAccessToken({ workspaceId, deviceId });
      const refreshToken = generateRefreshTokenValue();
      const refreshTokenHash = hashSecret(refreshToken);
      const refreshTokenExpiresAt = new Date(Date.now() + durationToMs(REFRESH_TOKEN_EXPIRES_IN));

      await this.refreshTokenRepository.create(
        {
          tokenHash: refreshTokenHash,
          workspaceId,
          deviceId,
          expiresAt: refreshTokenExpiresAt,
        },
        tx,
      );

      return { accessToken, refreshToken };
    });
  }

  async refresh(input: RefreshWorkspaceInput): Promise<TokenPair> {
    const tokenHash = hashSecret(input.refreshToken);
    const stored = await this.refreshTokenRepository.findByHash(tokenHash);

    if (!stored?.deviceId || !stored.workspaceId) {
      throw new InvalidRefreshTokenError();
    }

    return this.prisma.$transaction(async tx => {
      const claimed = await this.refreshTokenRepository.claimValidById(stored.id, tx);
      if (claimed === 0) {
        const latest = await this.refreshTokenRepository.findById(stored.id, tx);
        if (latest?.revokedAt) {
          await this.deviceRepository.revoke(stored.deviceId, tx);
          await this.refreshTokenRepository.revokeAllForDevice(stored.deviceId, tx);
        }
        throw new InvalidRefreshTokenError();
      }

      const device = await this.deviceRepository.findActive(
        stored.workspaceId,
        stored.deviceId,
        tx,
      );
      if (!device) {
        throw new InvalidRefreshTokenError();
      }

      const accessToken = generateAccessToken({
        workspaceId: stored.workspaceId,
        deviceId: stored.deviceId,
      });
      const refreshToken = generateRefreshTokenValue();
      const refreshTokenHash = hashSecret(refreshToken);
      const refreshTokenExpiresAt = new Date(Date.now() + durationToMs(REFRESH_TOKEN_EXPIRES_IN));

      await this.refreshTokenRepository.create(
        {
          tokenHash: refreshTokenHash,
          workspaceId: stored.workspaceId,
          deviceId: stored.deviceId,
          expiresAt: refreshTokenExpiresAt,
        },
        tx,
      );

      await this.workspaceRepository.touchLastUsedAt(stored.workspaceId, tx);

      return { accessToken, refreshToken };
    });
  }

  async issuePairingCode(workspaceId: string): Promise<PairingCodePayload> {
    const pairingCode = generatePairingCode();
    const pairingCodeHash = hashPairingCode(pairingCode);
    const expiresAt = new Date(Date.now() + durationToMs(PAIRING_CODE_EXPIRES_IN));

    await this.prisma.$transaction(async tx => {
      await this.pairingCodeRepository.invalidateUnusedForWorkspace(workspaceId, tx);
      await this.pairingCodeRepository.create(
        {
          workspaceId,
          codeHash: pairingCodeHash,
          expiresAt,
        },
        tx,
      );
      await this.workspaceRepository.touchLastUsedAt(workspaceId, tx);
    });

    return {
      pairingCode,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
