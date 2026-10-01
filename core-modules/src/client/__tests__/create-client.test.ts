import { describe, expect, test } from 'vitest';

import { createPairkitClient } from '../create-client';
import { createMemoryKv } from '../kv';
import { createSessionStore } from '../session';

describe('createPairkitClient', () => {
  test('stores pairing expiry after create', async () => {
    const session = createSessionStore({
      read: () => null,
      write: () => undefined,
    });
    const client = createPairkitClient({
      deviceName: 'test',
      getBaseUrl: () => 'http://api.test',
      kv: createMemoryKv(),
      session: {
        getSession: session.get,
        patchSession: session.patch,
        clearSession: session.clear,
      },
      fetch: async input => {
        const url = String(input);
        if (url.endsWith('/rpc/workspace/create')) {
          return new Response(
            JSON.stringify({
              json: {
                recoveryKey: 'r'.repeat(32),
                pairingCode: '123456',
                accessToken: 'access',
                refreshToken: 'refresh',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    const created = await client.enableSyncByCreate();
    const stored = await session.get();
    expect(created.pairingCode).toBe('123456');
    expect(stored.syncState).toBe('needsBootstrap');
    expect(stored.pendingPairingCode).toBe('123456');
    expect(stored.pendingPairingExpiresAt).toEqual(expect.any(String));
  });
});
