import type {
  BootstrapItemsInput,
  BootstrapItemsPayload,
  Item,
  ItemManifestEntry,
  ListItemsPayload,
  ManifestDiff,
  ManifestItemsInput,
  PullItemsInput,
  PullItemsPayload,
  PushItemsInput,
  PushItemsPayload,
  UpsertItemPayload,
} from '@pairkit/core/api';

import { MAX_ITEMS_PER_WORKSPACE } from '@/constants/config.constants';
import { AccessForbiddenError, ItemLimitExceededError } from '@/domain-errors';
import { WorkspaceRepository } from '@/features/user/repositories/workspace.repository';

import { ItemRepository } from '../repositories/item.repository';

const toTime = (iso: string) => new Date(iso).getTime();

export class ItemSyncService {
  constructor(
    private readonly itemRepository: ItemRepository,
    private readonly workspaceRepository: WorkspaceRepository,
  ) {}

  private async touch(workspaceId: string) {
    await this.workspaceRepository.touchLastUsedAt(workspaceId);
  }

  private async applyClientItem(workspaceId: string, item: Item): Promise<boolean> {
    const existing = await this.itemRepository.findGlobalById(item.id);

    if (existing && existing.workspaceId !== workspaceId) {
      throw new AccessForbiddenError();
    }

    const clientUpdated = toTime(item.updatedAt);

    if (existing) {
      if (clientUpdated < existing.updatedAt.getTime()) {
        return false;
      }
    } else if (!item.deletedAt) {
      const liveCount = await this.itemRepository.countLive(workspaceId);
      if (liveCount >= MAX_ITEMS_PER_WORKSPACE) {
        throw new ItemLimitExceededError();
      }
    }

    await this.itemRepository.upsertSavedItem(workspaceId, item);
    return true;
  }

  async list(workspaceId: string): Promise<ListItemsPayload> {
    await this.touch(workspaceId);
    const rows = await this.itemRepository.listLive(workspaceId);
    return {
      items: rows.map(row => this.itemRepository.toDto(row)),
    };
  }

  async upsert(workspaceId: string, item: Item): Promise<UpsertItemPayload> {
    await this.applyClientItem(workspaceId, item);
    await this.touch(workspaceId);
    const rows = await this.itemRepository.findByIds(workspaceId, [item.id]);
    const saved = rows[0] ? this.itemRepository.toDto(rows[0]) : item;
    return { item: saved };
  }

  async bootstrap(workspaceId: string, input: BootstrapItemsInput): Promise<BootstrapItemsPayload> {
    const acceptedIds: string[] = [];
    for (const item of input.items) {
      const written = await this.applyClientItem(workspaceId, item);
      if (written) acceptedIds.push(item.id);
    }
    await this.touch(workspaceId);
    return {
      acceptedIds,
      cursor: input.cursor ?? null,
    };
  }

  async manifest(workspaceId: string, input: ManifestItemsInput): Promise<ManifestDiff> {
    await this.touch(workspaceId);
    const serverRows = await this.itemRepository.listManifest(workspaceId);
    const serverById = new Map(serverRows.map(r => [r.id, r] as const));
    const clientById = new Map<string, ItemManifestEntry>();
    for (const entry of input.entries) {
      clientById.set(entry.id, entry);
    }

    const pull: string[] = [];
    const pushNeeded: string[] = [];
    const tombstones: string[] = [];

    for (const [id, server] of serverById) {
      const client = clientById.get(id);
      if (!client) {
        if (server.deletedAt) {
          tombstones.push(id);
        } else {
          pull.push(id);
        }
        continue;
      }

      const clientUpdated = toTime(client.updatedAt);
      const serverUpdated = server.updatedAt.getTime();

      if (server.deletedAt && (!client.deletedAt || clientUpdated < serverUpdated)) {
        tombstones.push(id);
      } else if (!server.deletedAt && clientUpdated < serverUpdated) {
        pull.push(id);
      } else if (clientUpdated > serverUpdated) {
        pushNeeded.push(id);
      }
    }

    for (const id of clientById.keys()) {
      if (!serverById.has(id)) {
        pushNeeded.push(id);
      }
    }

    return {
      pull,
      pushNeeded,
      tombstones,
    };
  }

  async pull(workspaceId: string, input: PullItemsInput): Promise<PullItemsPayload> {
    await this.touch(workspaceId);
    const rows = await this.itemRepository.findByIds(workspaceId, input.ids);
    const items = rows.map(row => this.itemRepository.toDto(row));
    return { items };
  }

  async push(workspaceId: string, input: PushItemsInput): Promise<PushItemsPayload> {
    const acceptedIds: string[] = [];
    for (const item of input.items) {
      const written = await this.applyClientItem(workspaceId, item);
      if (written) acceptedIds.push(item.id);
    }
    await this.touch(workspaceId);
    return { acceptedIds };
  }
}
