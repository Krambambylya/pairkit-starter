import { useSyncExternalStore } from 'react';

import type { SyncState } from '@pairkit/core';
import {
  STORAGE_KEYS,
  createSessionStore,
  defaultWorkspaceSession,
  type WorkspaceSession,
} from '@pairkit/core/client';

export type { SyncState, WorkspaceSession };

const isBrowser = () => typeof window !== 'undefined';

const store = createSessionStore({
  read: () => {
    if (!isBrowser()) return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.session);
      return raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  },
  write: session => {
    if (!isBrowser()) return;
    window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  },
});

export const getWorkspaceSessionSnapshot = store.getSnapshot;
export const getWorkspaceSession = store.get;
export const writeWorkspaceSession = store.write;
export const patchWorkspaceSession = store.patch;
export const clearWorkspaceSession = store.clear;

/** Stable SSR snapshot — React requires getServerSnapshot to return the same reference. */
const serverWorkspaceSessionSnapshot = defaultWorkspaceSession();

export const getServerWorkspaceSessionSnapshot = (): WorkspaceSession =>
  serverWorkspaceSessionSnapshot;

export const useWorkspaceSession = (): WorkspaceSession =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, getServerWorkspaceSessionSnapshot);
