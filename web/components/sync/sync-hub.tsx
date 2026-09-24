'use client';

import { useState } from 'react';

import { isRateLimitError, rateLimitRetryAfterSec } from '@pairkit/core/client';

import { PairingCodeDisplay } from '@/components/sync/pairing-code-display';
import { RecoveryKeyCard } from '@/components/sync/recovery-key-card';
import { SyncGuide } from '@/components/sync/sync-guide';
import { SyncingBanner } from '@/components/sync/syncing-banner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Panel } from '@/components/ui/panel';
import { isSyncWebEnabled } from '@/lib/feature-flags';
import {
  disableSyncLocally,
  enableSyncByCreate,
  enableSyncByJoin,
  enableSyncByRecover,
  refreshPairingCode,
  runSyncExclusive,
} from '@/lib/workspace-sync/client';
import { useWorkspaceSession } from '@/lib/workspace-sync/session';

const toErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const createWorkspace = async (
  setBusy: (busy: boolean) => void,
  setError: (error: string | null) => void,
  setStatus: (status: string) => void,
) => {
  setBusy(true);
  setError(null);
  setStatus('Creating workspace…');
  try {
    await enableSyncByCreate();
    setStatus('Syncing…');
    await runSyncExclusive(p => setStatus(p.message));
    setStatus('Done. Save the recovery key.');
  } catch (err) {
    setError(toErrorMessage(err, 'Error'));
    setStatus('');
  }
  setBusy(false);
};

const joinWorkspace = async (
  joinCode: string,
  setBusy: (busy: boolean) => void,
  setError: (error: string | null) => void,
  setStatus: (status: string) => void,
  setJoinCode: (code: string) => void,
) => {
  setBusy(true);
  setError(null);
  setStatus('Joining…');
  try {
    await enableSyncByJoin(joinCode);
    setStatus('Syncing…');
    await runSyncExclusive(p => setStatus(p.message));
    setJoinCode('');
    setStatus('Device connected');
  } catch (err) {
    setError(toErrorMessage(err, 'Join failed'));
    setStatus('');
  }
  setBusy(false);
};

const recoverWorkspace = async (
  recoveryInput: string,
  setBusy: (busy: boolean) => void,
  setError: (error: string | null) => void,
  setStatus: (status: string) => void,
  setRecoveryInput: (value: string) => void,
) => {
  setBusy(true);
  setError(null);
  setStatus('Recovering…');
  try {
    await enableSyncByRecover(recoveryInput);
    setStatus('Syncing…');
    await runSyncExclusive(p => setStatus(p.message));
    setRecoveryInput('');
    setStatus('Access restored');
  } catch (err) {
    setError(toErrorMessage(err, 'Recovery failed'));
    setStatus('');
  }
  setBusy(false);
};

const refreshCode = async (
  cooldownUntil: number | null,
  setRefreshingCode: (busy: boolean) => void,
  setError: (error: string | null) => void,
  setCooldownUntil: (until: number | null) => void,
) => {
  if (cooldownUntil && cooldownUntil > Date.now()) return;
  setRefreshingCode(true);
  setError(null);
  try {
    await refreshPairingCode();
    setCooldownUntil(null);
  } catch (err) {
    if (isRateLimitError(err)) {
      setCooldownUntil(Date.now() + rateLimitRetryAfterSec(err) * 1000);
    } else {
      setError(toErrorMessage(err, 'Could not refresh code'));
    }
  }
  setRefreshingCode(false);
};

function SyncDisabledPanel() {
  return (
    <Panel className="text-sm leading-relaxed text-muted">
      Sync actions are disabled on this build. Set NEXT_PUBLIC_SYNC_WEB_ENABLED=true.
    </Panel>
  );
}

function SyncFeedback({
  busy,
  status,
  error,
}: {
  busy: boolean;
  status: string;
  error: string | null;
}) {
  return (
    <>
      {busy ? <SyncingBanner message={status || undefined} /> : null}
      {!busy && status ? <p className="text-sm text-accent-soft">{status}</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

const signOutOnDevice = async (
  confirm: ReturnType<typeof useConfirm>['confirm'],
  setStatus: (status: string) => void,
  setError: (error: string | null) => void,
) => {
  const ok = await confirm({
    title: 'Sign out on this device?',
    body: 'This browser leaves the workspace. Local items stay here.',
    confirmLabel: 'Sign out',
  });
  if (!ok) return;
  await disableSyncLocally();
  setStatus('Sync is off on this device');
  setError(null);
};

function ActiveWorkspacePanels({
  code,
  expiresAt,
  recoveryKey,
  busy,
  refreshing,
  cooldownUntil,
  onRefresh,
  onDisable,
}: {
  code: string | null;
  expiresAt: string | null;
  recoveryKey: string | null;
  busy: boolean;
  refreshing: boolean;
  cooldownUntil: number | null;
  onRefresh: () => void;
  onDisable: () => void;
}) {
  return (
    <>
      <PairingCodeDisplay
        code={code}
        expiresAt={expiresAt}
        onRefresh={onRefresh}
        refreshing={refreshing}
        cooldownUntil={cooldownUntil}
      />
      <RecoveryKeyCard recoveryKey={recoveryKey} />
      <Panel>
        <h3 className="font-display text-lg font-semibold text-foreground">This device</h3>
        <Button
          variant="text"
          disabled={busy}
          onClick={onDisable}
          className="mt-4 w-fit text-muted hover:text-foreground"
        >
          Sign out on this device
        </Button>
      </Panel>
    </>
  );
}

function PairWorkspaceForms({
  busy,
  joinCode,
  recoveryInput,
  onJoinCodeChange,
  onRecoveryInputChange,
  onJoin,
  onCreate,
  onRecover,
}: {
  busy: boolean;
  joinCode: string;
  recoveryInput: string;
  onJoinCodeChange: (value: string) => void;
  onRecoveryInputChange: (value: string) => void;
  onJoin: () => void;
  onCreate: () => void;
  onRecover: () => void;
}) {
  return (
    <>
      <Panel className="border-primary/35">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">I have a code</p>
        <form
          onSubmit={event => {
            event.preventDefault();
            onJoin();
          }}
        >
          <label className="mt-4 block" htmlFor="pairing-code">
            <span className="mb-2 block text-sm font-medium text-muted">Pairing code</span>
            <input
              id="pairing-code"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              value={joinCode}
              onChange={e => onJoinCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={busy}
              className="min-h-14 w-full rounded-md border border-border bg-surface px-4 text-center font-mono text-2xl tracking-[0.4em] text-foreground outline-none placeholder:tracking-[0.4em] placeholder:text-muted-2 focus:border-primary focus:ring-2 focus:ring-ring/25"
              aria-label="Pairing code"
            />
          </label>
          <Button
            type="submit"
            disabled={busy || joinCode.length !== 6}
            className="mt-4 w-full sm:w-auto"
          >
            Join
          </Button>
        </form>
      </Panel>

      <Button variant="secondary" disabled={busy} onClick={onCreate} className="w-full sm:w-auto">
        No code — create workspace
      </Button>

      <Panel>
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">Recovery key</p>
        <label className="mt-4 block" htmlFor="recovery-key">
          <span className="mb-2 block text-sm font-medium text-muted">Key</span>
          <textarea
            id="recovery-key"
            rows={4}
            value={recoveryInput}
            onChange={e => onRecoveryInputChange(e.target.value)}
            placeholder="Paste the recovery key"
            disabled={busy}
            className="w-full resize-none rounded-md border border-border bg-surface px-4 py-3 font-mono text-sm tracking-wide text-foreground outline-none placeholder:text-muted-2 focus:border-primary focus:ring-2 focus:ring-ring/25"
            aria-label="Recovery key"
          />
        </label>
        <Button
          variant="secondary"
          disabled={busy || recoveryInput.replace(/\s+/g, '').trim().length < 32}
          onClick={onRecover}
          className="mt-4 w-full sm:w-auto"
        >
          Recover access
        </Button>
      </Panel>
    </>
  );
}

function SyncEnabledHub() {
  const { confirm, dialog } = useConfirm();
  const session = useWorkspaceSession();
  const [busy, setBusy] = useState(false);
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');

  const active = session.syncState !== 'off';

  return (
    <>
      <SyncFeedback busy={busy} status={status} error={error} />
      {active ? (
        <ActiveWorkspacePanels
          code={session.pendingPairingCode ?? null}
          expiresAt={session.pendingPairingExpiresAt ?? null}
          recoveryKey={session.pendingRecoveryKey ?? null}
          busy={busy}
          refreshing={refreshingCode}
          cooldownUntil={cooldownUntil}
          onRefresh={() =>
            void refreshCode(cooldownUntil, setRefreshingCode, setError, setCooldownUntil)
          }
          onDisable={() => void signOutOnDevice(confirm, setStatus, setError)}
        />
      ) : (
        <PairWorkspaceForms
          busy={busy}
          joinCode={joinCode}
          recoveryInput={recoveryInput}
          onJoinCodeChange={setJoinCode}
          onRecoveryInputChange={setRecoveryInput}
          onJoin={() => void joinWorkspace(joinCode, setBusy, setError, setStatus, setJoinCode)}
          onCreate={() => void createWorkspace(setBusy, setError, setStatus)}
          onRecover={() =>
            void recoverWorkspace(recoveryInput, setBusy, setError, setStatus, setRecoveryInput)
          }
        />
      )}
      {dialog}
    </>
  );
}

export function SyncHub() {
  const enabled = isSyncWebEnabled();

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-start">
      <section className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Sync
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted sm:text-base">
            Pair a browser with the Expo app. Items then follow the workspace.
          </p>
        </div>
        {enabled ? <SyncEnabledHub /> : <SyncDisabledPanel />}
      </section>
      <aside>
        <SyncGuide />
      </aside>
    </div>
  );
}
