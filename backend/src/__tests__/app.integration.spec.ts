import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createORPCClient, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';
import { contract } from '@pairkit/core/api';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../app';

type Rpc = RouterContractClient<typeof contract>;

const startRpc = async () => {
  const server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  const client: Rpc = createORPCClient(
    new RPCLink({
      origin: `http://127.0.0.1:${port}`,
      url: '/rpc',
    }),
  );
  return {
    client,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      }),
  };
};

describe('app (integration)', () => {
  it('GET / returns a plain ok status', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /live is process liveness without a db field', async () => {
    const res = await request(app).get('/live');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /health returns readiness JSON', async () => {
    const res = await request(app).get('/health');

    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('db');
  });

  it('returns 404 for an unmatched route', async () => {
    const res = await request(app).get('/this-route-does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.message).toBeTruthy();
    expect(res.body).not.toHaveProperty('success');
  });

  it('rejects a disallowed CORS origin', async () => {
    const res = await request(app).get('/').set('Origin', 'https://not-allowed.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows a whitelisted CORS origin', async () => {
    const res = await request(app).get('/').set('Origin', 'https://example.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://example.com');
  });

  it('POST /rpc/workspace/create rejects an empty device name', async () => {
    const rpc = await startRpc();
    try {
      await expect(rpc.client.workspace.create({ deviceName: '' })).rejects.toBeInstanceOf(
        ORPCError,
      );
    } finally {
      await rpc.close();
    }
  });
});
