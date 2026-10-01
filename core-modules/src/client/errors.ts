import { ORPCError } from '@orpc/client';

import { rateLimitErrorDataSchema } from '../api/errors';

const RATE_LIMIT_FALLBACK_SEC = 15 * 60;

const retryAfterFrom = (error: ORPCError<string, unknown>): number | null => {
  const parsed = rateLimitErrorDataSchema.safeParse(error.data);
  return parsed.success ? parsed.data.retryAfter : null;
};

export const isRateLimitError = (err: unknown): boolean =>
  err instanceof ORPCError && err.code === 'TOO_MANY_REQUESTS';

export const rateLimitRetryAfterSec = (err: unknown): number => {
  if (err instanceof ORPCError && err.code === 'TOO_MANY_REQUESTS') {
    return retryAfterFrom(err) ?? RATE_LIMIT_FALLBACK_SEC;
  }
  return RATE_LIMIT_FALLBACK_SEC;
};
