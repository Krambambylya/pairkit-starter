import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';
import { contract } from '@pairkit/core/api';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../app';

type Rpc = RouterContractClient<typeof contract>;

const requireDb = async (skip: (reason?: string) => void) => {
  const ready = await request(app).get('/ready');
  if (ready.status !== 200) {
    skip('Postgres is not ready (pnpm dev:backend)');
  }
};

const rpcClient = async () => {
  const server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  let accessToken: string | null = null;
  const client: Rpc = createORPCClient(
    new RPCLink({
      origin: `http://127.0.0.1:${port}`,
      url: '/rpc',
      headers: () => (accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    }),
  );
  return {
    client,
    setAccessToken: (token: string) => {
      accessToken = token;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      }),
  };
};

describe('workspace + items RPC (postgres)', () => {
  it('creates a workspace and lists items for that access token', async ({ skip }) => {
    await requireDb(skip);
    const rpc = await rpcClient();
    try {
      const created = await rpc.client.workspace.create({ deviceName: 'web' });
      rpc.setAccessToken(created.accessToken);

      const item = {
        id: `pk_test_${Date.now().toString(16)}`,
        title: 'Hello',
        body: 'from integration test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await rpc.client.items.upsert(item);
      const listed = await rpc.client.items.list();
      expect(listed.items.some(row => row.id === item.id)).toBe(true);
    } finally {
      await rpc.close();
    }
  });

  it('only one concurrent join succeeds for a pairing code', async ({ skip }) => {
    await requireDb(skip);
    const rpc = await rpcClient();
    try {
      const created = await rpc.client.workspace.create({ deviceName: 'web' });
      const joined = await Promise.allSettled([
        rpc.client.workspace.join({ pairingCode: created.pairingCode, deviceName: 'phone-a' }),
        rpc.client.workspace.join({ pairingCode: created.pairingCode, deviceName: 'phone-b' }),
      ]);
      expect(joined.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(joined.filter(result => result.status === 'rejected')).toHaveLength(1);
    } finally {
      await rpc.close();
    }
  });

  it('rotates a refresh token and rejects replay', async ({ skip }) => {
    await requireDb(skip);
    const rpc = await rpcClient();
    try {
      const created = await rpc.client.workspace.create({ deviceName: 'web' });
      const rotated = await rpc.client.workspace.refresh({ refreshToken: created.refreshToken });
      expect(rotated.accessToken).toEqual(expect.any(String));

      await expect(
        rpc.client.workspace.refresh({ refreshToken: created.refreshToken }),
      ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
      await expect(
        rpc.client.workspace.refresh({ refreshToken: rotated.refreshToken }),
      ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    } finally {
      await rpc.close();
    }
  });

  it('create → join → item is visible on the second device', async ({ skip }) => {
    await requireDb(skip);
    const web = await rpcClient();
    const phone = await rpcClient();
    try {
      const created = await web.client.workspace.create({ deviceName: 'web' });
      web.setAccessToken(created.accessToken);
      const joined = await phone.client.workspace.join({
        pairingCode: created.pairingCode,
        deviceName: 'phone',
      });
      phone.setAccessToken(joined.accessToken);

      const item = {
        id: `pk_pair_${Date.now().toString(16)}`,
        title: 'Paired note',
        body: 'visible on both devices',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await web.client.items.upsert(item);
      const listed = await phone.client.items.list();
      expect(listed.items.some(row => row.id === item.id)).toBe(true);
    } finally {
      await web.close();
      await phone.close();
    }
  });
});
