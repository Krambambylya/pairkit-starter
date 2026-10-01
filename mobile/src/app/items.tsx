import { AppTheme } from '@/constants/theme';
import {
  client,
  getWorkspaceSession,
  runSyncExclusive,
  scheduleSyncAfterLocalChange,
  upsertLocalItem,
} from '@/features/workspace-sync';
import { ThemedText } from '@/shared/ui/themed-text';
import type { Item } from '@pairkit/core/api';
import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

const newItemId = () => `pk_${Date.now().toString(16)}`;

export default function ItemsScreen() {
  const [signedIn, setSignedIn] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await getWorkspaceSession();
      const active = session.syncState !== 'off' && Boolean(session.accessToken);
      setSignedIn(active);
      if (!active) {
        setItems([]);
        return;
      }
      await runSyncExclusive();
      const remote = await client.items.list();
      setItems(remote.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load items');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    if (!title.trim()) return;
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
      await client.items.upsert(item);
      scheduleSyncAfterLocalChange();
      setTitle('');
      setBody('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save item');
    }
  };

  if (!signedIn) {
    return (
      <View style={styles.screen}>
        <ThemedText>Pair a workspace on the Sync tab first.</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
        placeholderTextColor={AppTheme.mutedForeground}
        style={styles.input}
        accessibilityLabel="Item title"
        testID="item-title"
      />
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Body"
        placeholderTextColor={AppTheme.mutedForeground}
        style={[styles.input, styles.multiline]}
        multiline
        accessibilityLabel="Item body"
        testID="item-body"
      />
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <Pressable
        style={styles.primary}
        onPress={() => void onSave()}
        accessibilityRole="button"
        accessibilityLabel="Save item"
        testID="item-save"
      >
        <ThemedText style={styles.primaryLabel}>Save item</ThemedText>
      </Pressable>
      <FlashList
        data={items}
        style={styles.list}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>{item.title}</ThemedText>
            {item.body ? <ThemedText style={styles.muted}>{item.body}</ThemedText> : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppTheme.background, padding: 16, gap: 10 },
  list: { flex: 1 },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.border,
    backgroundColor: AppTheme.inputBackground,
    color: AppTheme.foreground,
    paddingHorizontal: 12,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  error: { color: AppTheme.errorSoft },
  primary: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: AppTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: AppTheme.primaryForeground, fontWeight: '600' },
  card: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppTheme.border,
    backgroundColor: AppTheme.card,
    padding: 14,
    gap: 6,
  },
  cardTitle: { fontWeight: '600' },
  muted: { color: AppTheme.mutedForeground },
});
