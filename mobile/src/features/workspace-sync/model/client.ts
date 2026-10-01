import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';
import { createPairkitClient, type JsonKvStore } from '@pairkit/core/client';
import { Platform } from 'react-native';

import { getApiBaseUrl } from '@/shared/config/feature-flags';

import {
  clearWorkspaceSession,
  getWorkspaceSession,
  patchWorkspaceSession,
} from './session-storage';

const kv: JsonKvStore = {
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};

const deviceName = Platform.select({
  ios: 'Pairkit iOS',
  android: 'Pairkit Android',
  default: 'Pairkit Mobile',
}) as string;

const pairkit = createPairkitClient({
  deviceName,
  getBaseUrl: getApiBaseUrl,
  kv,
  fetch,
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
