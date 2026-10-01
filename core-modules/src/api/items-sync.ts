import { z } from 'zod';

import { isoDateTime, itemSchema } from './item';

export const bootstrapItemsSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
  cursor: z
    .object({
      done: z.boolean().optional(),
      sentIds: z.array(z.string()).optional(),
    })
    .optional(),
});

export const itemManifestEntrySchema = z.object({
  id: z.string().trim().min(1).max(128),
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.nullable().optional(),
});

export const manifestItemsSchema = z.object({
  entries: z.array(itemManifestEntrySchema).max(500),
});

export const pullItemsSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(128)).min(1).max(100),
});

export const pushItemsSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
});

export const upsertItemSchema = itemSchema;

export const upsertItemPayloadSchema = z.object({
  item: itemSchema,
});

export const manifestDiffSchema = z.object({
  pull: z.array(z.string()),
  pushNeeded: z.array(z.string()),
  tombstones: z.array(z.string()),
});

export const bootstrapItemsPayloadSchema = z.object({
  acceptedIds: z.array(z.string()),
  cursor: bootstrapItemsSchema.shape.cursor.nullable(),
});

export const pullItemsPayloadSchema = z.object({
  items: z.array(itemSchema),
});

export const listItemsPayloadSchema = z.object({
  items: z.array(itemSchema),
});

export const pushItemsPayloadSchema = z.object({
  acceptedIds: z.array(z.string()),
});

export type BootstrapItemsInput = z.infer<typeof bootstrapItemsSchema>;
export type ManifestItemsInput = z.infer<typeof manifestItemsSchema>;
export type PullItemsInput = z.infer<typeof pullItemsSchema>;
export type PushItemsInput = z.infer<typeof pushItemsSchema>;
export type ItemManifestEntry = z.infer<typeof itemManifestEntrySchema>;

export type ManifestDiff = z.infer<typeof manifestDiffSchema>;
export type BootstrapItemsPayload = z.infer<typeof bootstrapItemsPayloadSchema>;
export type PullItemsPayload = z.infer<typeof pullItemsPayloadSchema>;
export type ListItemsPayload = z.infer<typeof listItemsPayloadSchema>;
export type PushItemsPayload = z.infer<typeof pushItemsPayloadSchema>;
export type UpsertItemPayload = z.infer<typeof upsertItemPayloadSchema>;
