import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  deviceName: z.string().trim().min(1).max(120),
});

export const joinWorkspaceSchema = z.object({
  pairingCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Pairing code must be 6 digits'),
  deviceName: z.string().trim().min(1).max(120),
});

export const refreshWorkspaceSchema = z.object({
  refreshToken: z.string().trim().min(16),
});

export const recoverWorkspaceSchema = z.object({
  recoveryKey: z
    .string()
    .trim()
    .min(32, 'Recovery key is too short')
    .max(128, 'Recovery key is too long'),
  deviceName: z.string().trim().min(1).max(120),
});

export const createWorkspaceResultSchema = z.object({
  recoveryKey: z.string(),
  pairingCode: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const pairingCodePayloadSchema = z.object({
  pairingCode: z.string(),
  expiresAt: z.string(),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type JoinWorkspaceInput = z.infer<typeof joinWorkspaceSchema>;
export type RefreshWorkspaceInput = z.infer<typeof refreshWorkspaceSchema>;
export type RecoverWorkspaceInput = z.infer<typeof recoverWorkspaceSchema>;

export type CreateWorkspaceResult = z.infer<typeof createWorkspaceResultSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
export type PairingCodePayload = z.infer<typeof pairingCodePayloadSchema>;
