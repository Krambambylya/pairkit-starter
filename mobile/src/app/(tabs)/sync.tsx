import { AppTheme } from '@/constants/theme';
import {
  disableSyncLocally,
  enableSyncByCreate,
  enableSyncByJoin,
  enableSyncByRecover,
  getWorkspaceSession,
  refreshPairingCode,
  runSyncExclusive,
} from '@/features/workspace-sync';
import { isMobileSyncEnabled } from '@/shared/config/feature-flags';
import { ThemedText } from '@/shared/ui/themed-text';
import { ThemedView } from '@/shared/ui/themed-view';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

export default function SyncScreen() {
  const enabled = isMobileSyncEnabled();
  const [code, setCode] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);

  const reload = useCallback(async () => {
    try {
      const session = await getWorkspaceSession();
      setActive(session.syncState !== 'off');
      setCode(session.pendingPairingCode ?? null);
      setRecoveryKey(session.pendingRecoveryKey ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read saved workspace');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await enableSyncByCreate();
      await runSyncExclusive(p => setStatus(p.message));
      await reload();
      setStatus('Save the recovery key.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
    setBusy(false);
  };

  const onJoin = async () => {
    setBusy(true);
    setError(null);
    try {
      await enableSyncByJoin(joinCode);
      await runSyncExclusive(p => setStatus(p.message));
      setJoinCode('');
      await reload();
      setStatus('Device connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Join failed');
    }
    setBusy(false);
  };

  const onRecover = async () => {
    setBusy(true);
    setError(null);
    try {
      await enableSyncByRecover(recoveryInput);
      await runSyncExclusive(p => setStatus(p.message));
      setRecoveryInput('');
      await reload();
      setStatus('Access restored');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    }
    setBusy(false);
  };

  if (!enabled) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText>Sync is disabled for this build.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      style={{ backgroundColor: AppTheme.background }}
    >
      <ThemedText style={styles.title}>Sync</ThemedText>
      {status ? <ThemedText style={styles.muted}>{status}</ThemedText> : null}
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

      {active ? (
        <>
          <ThemedText style={styles.label}>Pairing code</ThemedText>
          <ThemedText style={styles.code}>{code ?? '—'}</ThemedText>
          <Pressable
            style={styles.secondary}
            disabled={busy}
            onPress={() => void refreshPairingCode().then(reload)}
            accessibilityRole="button"
            accessibilityLabel="Refresh pairing code"
            testID="sync-refresh-code"
          >
            <ThemedText>Refresh code</ThemedText>
          </Pressable>
          {recoveryKey ? (
            <>
              <ThemedText style={styles.label}>Recovery key</ThemedText>
              <ThemedText selectable style={styles.mono}>
                {recoveryKey}
              </ThemedText>
            </>
          ) : null}
          <Pressable
            style={styles.secondary}
            disabled={busy}
            onPress={() => void disableSyncLocally().then(reload)}
            accessibilityRole="button"
            accessibilityLabel="Sign out on this device"
            testID="sync-sign-out"
          >
            <ThemedText>Sign out on this device</ThemedText>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            value={joinCode}
            onChangeText={value => setJoinCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            placeholderTextColor={AppTheme.mutedForeground}
            style={styles.input}
            accessibilityLabel="Pairing code"
            testID="sync-join-code"
          />
          <Pressable
            style={styles.primary}
            disabled={busy || joinCode.length !== 6}
            onPress={() => void onJoin()}
            accessibilityRole="button"
            accessibilityLabel="Join with code"
            testID="sync-join"
          >
            <ThemedText style={styles.primaryLabel}>Join with code</ThemedText>
          </Pressable>
          <Pressable
            style={styles.secondary}
            disabled={busy}
            onPress={() => void onCreate()}
            accessibilityRole="button"
            accessibilityLabel="Create workspace"
            testID="sync-create"
          >
            <ThemedText>Create workspace</ThemedText>
          </Pressable>
          <TextInput
            value={recoveryInput}
            onChangeText={setRecoveryInput}
            placeholder="Recovery key"
            placeholderTextColor={AppTheme.mutedForeground}
            autoCapitalize="none"
            style={[styles.input, styles.multiline]}
            multiline
            accessibilityLabel="Recovery key"
            testID="sync-recovery-key"
          />
          <Pressable
            style={styles.secondary}
            disabled={busy || recoveryInput.replace(/\s+/g, '').length < 32}
            onPress={() => void onRecover()}
            accessibilityRole="button"
            accessibilityLabel="Recover access"
            testID="sync-recover"
          >
            <ThemedText>Recover</ThemedText>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '600' },
  muted: { color: AppTheme.mutedForeground },
  error: { color: AppTheme.errorSoft },
  label: { marginTop: 8, color: AppTheme.mutedForeground },
  code: { fontSize: 32, fontVariant: ['tabular-nums'], letterSpacing: 6 },
  mono: { fontFamily: 'Courier', fontSize: 13 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.border,
    backgroundColor: AppTheme.inputBackground,
    color: AppTheme.foreground,
    paddingHorizontal: 12,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  primary: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: AppTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: AppTheme.primaryForeground, fontWeight: '600' },
  secondary: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
