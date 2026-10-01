import { z } from 'zod';

export const rateLimitErrorDataSchema = z.object({
  retryAfter: z.number().int().positive(),
});

export type RateLimitErrorData = z.infer<typeof rateLimitErrorDataSchema>;

export const rateLimitErrors = {
  TOO_MANY_REQUESTS: { data: rateLimitErrorDataSchema },
} as const;

/** HTTP status for each custom contract error. Procedure `.errors()` must use these codes. */
export const contractErrorStatus = {
  INVALID_PAIRING_CODE: 400,
  INVALID_RECOVERY_KEY: 400,
  INVALID_REFRESH_TOKEN: 401,
  ACCESS_FORBIDDEN: 403,
  ITEM_LIMIT_EXCEEDED: 409,
} as const;

export type ContractErrorCode = keyof typeof contractErrorStatus;

export const contractErrorBodies = {
  INVALID_PAIRING_CODE: {},
  INVALID_RECOVERY_KEY: {},
  INVALID_REFRESH_TOKEN: {},
  ACCESS_FORBIDDEN: {},
  ITEM_LIMIT_EXCEEDED: {},
} as const satisfies Record<ContractErrorCode, Record<string, never>>;
