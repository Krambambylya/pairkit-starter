import { describe, expect, it } from 'vitest';

import { jwtSecretHasEnoughVariety, PUBLIC_JWT_SECRETS } from '../public-jwt-secrets';

describe('public-jwt-secrets', () => {
  it('loads stand-in secrets from the adjacent text file', () => {
    expect(PUBLIC_JWT_SECRETS.length).toBeGreaterThan(0);
    for (const secret of PUBLIC_JWT_SECRETS) {
      expect(secret.length).toBeGreaterThanOrEqual(32);
    }
  });

  it('rejects low-variety secrets', () => {
    expect(jwtSecretHasEnoughVariety('a'.repeat(32))).toBe(false);
    expect(jwtSecretHasEnoughVariety('abcdefghijklmnopqrstuvwxyz012345')).toBe(true);
  });
});
