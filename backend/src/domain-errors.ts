import type { ContractErrorCode } from '@pairkit/core/api';

import { ERROR } from './constants/messages';

export type DomainErrorCode = ContractErrorCode;

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidPairingCodeError extends DomainError {
  constructor() {
    super('INVALID_PAIRING_CODE', ERROR.INVALID_PAIRING_CODE);
  }
}

export class InvalidRecoveryKeyError extends DomainError {
  constructor() {
    super('INVALID_RECOVERY_KEY', ERROR.INVALID_RECOVERY_KEY);
  }
}

export class InvalidRefreshTokenError extends DomainError {
  constructor() {
    super('INVALID_REFRESH_TOKEN', ERROR.INVALID_REFRESH_TOKEN);
  }
}

export class AccessForbiddenError extends DomainError {
  constructor() {
    super('ACCESS_FORBIDDEN', ERROR.ACCESS_FORBIDDEN);
  }
}

export class ItemLimitExceededError extends DomainError {
  constructor() {
    super('ITEM_LIMIT_EXCEEDED', ERROR.ITEM_LIMIT_EXCEEDED);
  }
}
