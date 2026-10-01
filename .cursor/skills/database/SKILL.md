---
name: database
description: >-
  Pairkit Postgres access through Prisma. Use when writing or changing queries,
  repositories, transactions, migrations, the Prisma schema, batch sync writes,
  refresh tokens, or pairing codes. Stops per-row query loops, check-then-write
  races, and domain errors thrown inside a transaction that must commit.
---

# Database

Open this skill before changing `backend/prisma/`, a repository, or a service method that awaits a query. The short rule is `.cursor/rules/database.mdc`.

## Before writing a query

1. Read the model in `backend/prisma/schema.prisma` and the repository the service will call.
2. If the input is a list, implement a batch. A loop that awaits `findUnique`, `count`, or `upsert` per element does not land, even under `MAX_ITEMS_PER_WORKSPACE`.
3. Repository methods take `DbClient` and default to `this.prisma`. The service opens `withTransaction` and passes `tx`. A repository method that already accepts `db` does not open its own `$transaction`.

## Batch write

Item `bootstrap`, `push`, and single `upsert` share this path.

1. One transaction.
2. Lock the workspace first with `touchLastUsedAt(workspaceId, tx)`. The row lock keeps the live count stable until commit.
3. `findGlobalByIds` for every id in the batch, then one `countLive`.
4. In memory: another workspace throws `AccessForbiddenError` before any write; a client `updatedAt` older than the server row is skipped. A new live row and a restore of a tombstone both count toward `MAX_ITEMS_PER_WORKSPACE`. A delete in the same batch frees a slot for a later row. The same id repeated in the batch counts once. A new tombstone does not count.
5. When a later new live row does not fit, write the rows that fit, let the transaction commit, then throw `ItemLimitExceededError`. Throwing inside the callback rolls back the rows that fit, and the client retries the same chunk forever.
6. `saveIfCurrent`: `updateMany` where `id`, `workspaceId`, and `updatedAt <= clientUpdated`. If `count` is 0, `create`. On unique conflict (`P2002`), run that conditional update once more. `false` means a newer row won; leave that id out of `acceptedIds`.

## One-time claim

Refresh tokens and pairing codes.

- `updateMany` with the predicate (`revokedAt: null` or `usedAt: null`, and unexpired). `count === 1` is the winner. Claim only through `claimValidById` or `claimUnusedByHash`.
- Issuing a pairing code locks the workspace first (`touchLastUsedAt`), then expires unused codes, then inserts the new one.
- After `count === 0`, re-read the row before treating it as a replay.
- Revoke and other security writes stay inside the transaction. Return `null` from the callback, then throw `InvalidRefreshTokenError` after `$transaction` resolves. An exception inside the callback undoes the revoke.

## Schema

- Change `schema.prisma` and add a migration in the same change. Leave `src/generated/` untouched.
- Index foreign keys and the columns a list filters or sorts on.
- Refresh tokens, recovery keys, and pairing codes are stored as hashes.

## Tests

- A batch calls `findGlobalByIds` once and `countLive` once.
- A stale row in the batch is not written. A newer row is.
- At the live limit, `saveIfCurrent` runs for the rows that fit, then the call rejects.
- A refresh claim with `count === 0` and `revokedAt` set still revokes the device, and the thrown error does not clear that revoke.
