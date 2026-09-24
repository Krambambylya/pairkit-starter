'use client';

import { FormEvent, Suspense, use, useState } from 'react';

import type { Item } from '@pairkit/core/api';

import { Button, ButtonLink } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import {
  listItems,
  runSyncExclusive,
  scheduleSyncAfterLocalChange,
  upsertItem,
  upsertLocalItem,
} from '@/lib/workspace-sync/client';
import { useWorkspaceSession } from '@/lib/workspace-sync/session';

const newItemId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `pk_${crypto.randomUUID()}`;
  }
  return `pk_${Date.now().toString(16)}`;
};

const itemsPromises = new Map<number, Promise<Item[]>>();

const loadItems = (version: number): Promise<Item[]> => {
  const cached = itemsPromises.get(version);
  if (cached) return cached;
  const pending = (async () => {
    await runSyncExclusive();
    const remote = await listItems();
    return remote.items;
  })();
  itemsPromises.set(version, pending);
  return pending;
};

function SignedInItems({ version, onSaved }: { version: number; onSaved: () => void }) {
  const items = use(loadItems(version));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    const now = new Date().toISOString();
    const item: Item = {
      id: newItemId(),
      title: title.trim(),
      body: body.trim(),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await upsertLocalItem(item);
      await upsertItem(item);
      scheduleSyncAfterLocalChange();
      setTitle('');
      setBody('');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save item');
    }
    setBusy(false);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <form onSubmit={event => void onSubmit(event)}>
        <Panel>
          <h2 className="font-display text-lg font-semibold text-foreground">New item</h2>
          <label className="mt-4 block" htmlFor="item-title">
            <span className="mb-2 block text-sm font-medium text-muted">Title</span>
            <input
              id="item-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="min-h-11 w-full rounded-md border border-border bg-deep px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="mt-4 block" htmlFor="item-body">
            <span className="mb-2 block text-sm font-medium text-muted">Body</span>
            <textarea
              id="item-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-border bg-deep px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          {error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="mt-4">
            {busy ? 'Saving…' : 'Save item'}
          </Button>
        </Panel>
      </form>
      <section className="flex flex-col gap-3">
        {items.length === 0 ? (
          <Panel className="text-sm text-muted">No items yet.</Panel>
        ) : (
          items.map(item => (
            <Panel key={item.id} as="article">
              <h3 className="font-display text-base font-semibold text-foreground">{item.title}</h3>
              {item.body ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {item.body}
                </p>
              ) : null}
              <p className="mt-3 font-mono text-xs text-muted-2">{item.updatedAt}</p>
            </Panel>
          ))
        )}
      </section>
    </div>
  );
}

export function ItemsClient() {
  const session = useWorkspaceSession();
  const signedIn = session.syncState !== 'off' && Boolean(session.accessToken);
  const [version, setVersion] = useState(0);

  if (!signedIn) {
    return (
      <Panel>
        <p className="text-sm leading-relaxed text-muted">
          Pair a workspace first, then items will fetch from /v1/items.
        </p>
        <ButtonLink href="/sync" className="mt-4">
          Open sync hub
        </ButtonLink>
      </Panel>
    );
  }

  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SignedInItems version={version} onSaved={() => setVersion(current => current + 1)} />
    </Suspense>
  );
}
