import { createPairkitClient, type JsonKvStore } from '@pairkit/core/client';

import { env } from '@/lib/env';

import { clearWorkspaceSession, getWorkspaceSession, patchWorkspaceSession } from './session';

const createWebKv = (): JsonKvStore => ({
  getItem: key => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
});

const pairkit = createPairkitClient({
  deviceName: 'Pairkit Web',
  getBaseUrl: () => env.NEXT_PUBLIC_API_URL.replace(/\/$/, ''),
  kv: createWebKv(),
  fetch: globalThis.fetch,
  session: {
    getSession: getWorkspaceSession,
    patchSession: patchWorkspaceSession,
    clearSession: clearWorkspaceSession,
  },
});

export const client = pairkit.client;

export const enableSyncByCreate = pairkit.enableSyncByCreate;
export const enableSyncByJoin = pairkit.enableSyncByJoin;
export const enableSyncByRecover = pairkit.enableSyncByRecover;
export const disableSyncLocally = pairkit.disableSyncLocally;
export const refreshPairingCode = pairkit.refreshPairingCode;
export const recordLocalItemDeleted = pairkit.recordLocalItemDeleted;
export const runBootstrap = pairkit.runBootstrap;
export const runIncrementalSync = pairkit.runIncrementalSync;
export const runSyncExclusive = pairkit.runSyncExclusive;
export const scheduleSyncAfterLocalChange = pairkit.scheduleSyncAfterLocalChange;
export const getSavedItems = pairkit.getSavedItems;
export const upsertLocalItem = pairkit.upsertLocalItem;
