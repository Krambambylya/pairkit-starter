import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { JWT_SECRET, findFirst } = vi.hoisted(() => ({
  JWT_SECRET: 'for_tests_only_not_a_real_secret',
  findFirst: vi.fn(),
}));

vi.mock('../../config/env-config', () => ({
  env: { JWT_SECRET },
}));

vi.mock('../../config/prisma.config', () => ({
  PrismaService: {
    getInstance: () => ({
      client: {
        device: { findFirst },
      },
    }),
  },
}));

import { auth } from '../auth.middleware';

describe('auth middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
    findFirst.mockReset();
    findFirst.mockResolvedValue({ id: 'dev-1' });
  });

  describe('auth', () => {
    it('rejects requests with no token', async () => {
      await auth(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects an invalid token', async () => {
      req.headers = { authorization: 'Bearer not-a-real-token' };

      await auth(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects tokens without workspace claims', async () => {
      const token = jwt.sign({ userId: 'user-1' }, JWT_SECRET, { algorithm: 'HS256' });
      req.headers = { authorization: `Bearer ${token}` };

      await auth(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('attaches workspaceId/deviceId and calls next for a valid bearer token', async () => {
      const token = jwt.sign({ workspaceId: 'ws-1', deviceId: 'dev-1' }, JWT_SECRET, {
        algorithm: 'HS256',
      });
      req.headers = { authorization: `Bearer ${token}` };

      await auth(req as Request, res as Response, next);

      expect(req.workspaceId).toBe('ws-1');
      expect(req.deviceId).toBe('dev-1');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects a valid jwt whose device has been revoked', async () => {
      findFirst.mockResolvedValue(null);
      const token = jwt.sign({ workspaceId: 'ws-1', deviceId: 'dev-1' }, JWT_SECRET, {
        algorithm: 'HS256',
      });
      req.headers = { authorization: `Bearer ${token}` };

      await auth(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('does not accept tokens from cookies', async () => {
      const token = jwt.sign({ workspaceId: 'ws-2', deviceId: 'dev-2' }, JWT_SECRET, {
        algorithm: 'HS256',
      });
      req.headers = {};
      (req as { cookies?: { accessToken: string } }).cookies = { accessToken: token };

      await auth(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
