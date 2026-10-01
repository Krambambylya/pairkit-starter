import { COMMON_ERROR_STATUS_MAP, ORPCError } from '@orpc/server';
import { contractErrorStatus } from '@pairkit/core/api';
import type { Logger } from 'pino';

import { ERROR } from './constants/messages';
import { DomainError } from './domain-errors';

const CLIENT_SAFE_COMMON_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'TOO_MANY_REQUESTS',
] as const satisfies readonly (keyof typeof COMMON_ERROR_STATUS_MAP)[];

const CLIENT_ERROR_CODES = new Set<string>([
  ...CLIENT_SAFE_COMMON_CODES,
  ...Object.keys(contractErrorStatus),
]);

export const mapDomainError = (error: unknown): unknown => {
  if (error instanceof DomainError) {
    return new ORPCError(error.code, { message: error.message });
  }
  return error;
};

export const sanitizeClientError = (error: unknown, log: Logger, requestId: string): never => {
  const mapped = mapDomainError(error);
  if (mapped instanceof ORPCError && CLIENT_ERROR_CODES.has(mapped.code)) {
    throw mapped;
  }
  log.error({ err: error, requestId }, 'rpc procedure failed');
  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: ERROR.INTERNAL_SERVER_ERROR,
  });
};
