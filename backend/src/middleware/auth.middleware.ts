import jwt, { Secret } from 'jsonwebtoken';

import { env } from '../config/env-config';
import { PrismaService } from '../config/prisma.config';
import type { AccessPrincipal } from '../rpc-context';

const secret: Secret = env.JWT_SECRET as string;

interface AuthPayload {
  workspaceId: string;
  deviceId: string;
}

const verifyAccessToken = (token: string): AuthPayload | null => {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as AuthPayload;
    if (!decoded.workspaceId || !decoded.deviceId) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

const findActiveDevice = async (workspaceId: string, deviceId: string): Promise<boolean> => {
  const device = await PrismaService.getInstance().client.device.findFirst({
    where: { id: deviceId, workspaceId, revokedAt: null },
    select: { id: true },
  });
  return Boolean(device);
};

export const authenticateAccessToken = async (
  authorizationHeader: string | undefined,
): Promise<AccessPrincipal | null> => {
  const token = authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length)
    : undefined;
  if (!token) return null;

  const decoded = verifyAccessToken(token);
  if (!decoded) return null;

  const active = await findActiveDevice(decoded.workspaceId, decoded.deviceId);
  if (!active) return null;

  return { workspaceId: decoded.workspaceId, deviceId: decoded.deviceId };
};
