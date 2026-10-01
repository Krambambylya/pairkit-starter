import type { RateLimiter } from '@orpc/ratelimit';
import { ORPCError } from '@orpc/server';

// Screens read data.retryAfter seconds, declared on every procedure as TOO_MANY_REQUESTS.
// The ratelimit() helper publishes limit, remaining, and reset instead.
const TOO_MANY_ATTEMPTS = 'Too many attempts, please try again later';

export const enforceRateLimit = async (limiter: RateLimiter, key: string): Promise<void> => {
  const result = await limiter.limit(key);
  if (result.success) return;
  const resetMs = result.reset ?? Date.now() + 1000;
  const retryAfter = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
  throw new ORPCError('TOO_MANY_REQUESTS', {
    message: TOO_MANY_ATTEMPTS,
    data: { retryAfter },
  });
};
