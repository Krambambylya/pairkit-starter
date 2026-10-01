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

  /**
   * One transaction for the whole batch: lock the workspace, read every id once,
   * count live rows once, then write only the rows that still pass.
   */
  private async applyClientItems(workspaceId: string, items: Item[]): Promise<string[]> {
    const { acceptedIds, limitExceeded } = await this.itemRepository.withTransaction(async db => {
      await this.workspaceRepository.touchLastUsedAt(workspaceId, db);

      const existingRows = await this.itemRepository.findGlobalByIds(
        items.map(item => item.id),
        db,
      );
      const existingById = new Map(existingRows.map(row => [row.id, row]));

      for (const item of items) {
        const existing = existingById.get(item.id);
        if (existing && existing.workspaceId !== workspaceId) {
          throw new AccessForbiddenError();
        }
      }

      const liveCount = await this.itemRepository.countLive(workspaceId, db);
      let addedLive = 0;
      const toWrite: Item[] = [];
      let limitExceeded = false;

      for (const item of items) {
        const existing = existingById.get(item.id);
        const clientUpdated = toTime(item.updatedAt);

        if (existing && clientUpdated < existing.updatedAt.getTime()) continue;

        const wasLive = existing ? existing.deletedAt === null : false;
        const willBeLive = !item.deletedAt;
        if (!wasLive && willBeLive) {
          if (liveCount + addedLive >= MAX_ITEMS_PER_WORKSPACE) {
            limitExceeded = true;
            break;
          }
          addedLive += 1;
        } else if (wasLive && !willBeLive) {
          addedLive -= 1;
        }

        toWrite.push(item);
        existingById.set(item.id, {
          id: item.id,
          workspaceId,
          updatedAt: new Date(item.updatedAt),
          deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
        });
      }

      const acceptedIds: string[] = [];
      for (const item of toWrite) {
        const written = await this.itemRepository.saveIfCurrent(workspaceId, item, db);
        if (written) acceptedIds.push(item.id);
      }

      return { acceptedIds, limitExceeded };
    });

    if (limitExceeded) throw new ItemLimitExceededError();
    return acceptedIds;
  }

  async list(workspaceId: string): Promise<ListItemsPayload> {
    await this.touch(workspaceId);
    const rows = await this.itemRepository.listLive(workspaceId);
    return {
      items: rows.map(row => this.itemRepository.toDto(row)),
    };
  }

  async upsert(workspaceId: string, item: Item): Promise<UpsertItemPayload> {
    await this.applyClientItems(workspaceId, [item]);
    const rows = await this.itemRepository.findByIds(workspaceId, [item.id]);
    const saved = rows[0] ? this.itemRepository.toDto(rows[0]) : item;
    return { item: saved };
  }

  async bootstrap(workspaceId: string, input: BootstrapItemsInput): Promise<BootstrapItemsPayload> {
    const acceptedIds = await this.applyClientItems(workspaceId, input.items);
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
    const acceptedIds = await this.applyClientItems(workspaceId, input.items);
    return { acceptedIds };
  }
}
