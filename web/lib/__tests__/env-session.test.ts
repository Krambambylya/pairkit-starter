import { afterEach, describe, expect, it, vi } from 'vitest';

import { unwrapEnvelope } from '@pairkit/core/api';
import { defaultWorkspaceSession } from '@pairkit/core/client';

import { envSchema } from '../env';
import {
  getServerWorkspaceSessionSnapshot,
  writeWorkspaceSession,
} from '../workspace-sync/session';

describe('envSchema', () => {
  it('rejects example.com in production', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://example.com',
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
    });
    expect(result.success).toBe(false);
  });

  it('allows a real production site URL', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://pairkit.example',
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
    });
    expect(result.success).toBe(true);
  });
});

describe('unwrapEnvelope', () => {
  it('returns data when success is true', () => {
    expect(unwrapEnvelope({ success: true, message: 'ok', data: { id: '1' } })).toEqual({
      id: '1',
    });
  });

  it('throws the envelope message when unsuccessful', () => {
    expect(() => unwrapEnvelope({ success: false, message: 'nope' })).toThrow('nope');
  });
});

describe('useWorkspaceSession SSR snapshot', () => {
  it('returns a stable reference for getServerSnapshot', () => {
    expect(getServerWorkspaceSessionSnapshot()).toBe(getServerWorkspaceSessionSnapshot());
  });
});

describe('writeWorkspaceSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('propagates localStorage quota errors', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
      },
    });

    await expect(
      writeWorkspaceSession({
        ...defaultWorkspaceSession(),
        workspaceId: 'ws-1',
        accessToken: 'a',
        refreshToken: 'b',
        syncState: 'ready',
      }),
    ).rejects.toThrow('quota');
  });
});
