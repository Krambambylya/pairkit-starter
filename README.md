# Pairkit

A **pnpm monorepo** starter: **Next.js 16** web, **Expo 55** mobile, **Express + Prisma** API, and
**`@pairkit/core`** (Zod contracts + a small sync client).

The stack is the product. Workspace pairing and a thin `Item` record are a **demo slice** so every
layer has a real path to follow (schema → API → storage → UI). Replace that slice with your domain;
keep the contracts package.

Rename the product with the checklist in [RENAME.md](./RENAME.md) — a search for `Pairkit` is not
enough (bundle id, scheme, `@pairkit/core`).

## Quick start

Prerequisites: Node `22.21.1` (see `.node-version`), [pnpm 11](https://pnpm.io/), Docker.

```bash
pnpm install
pnpm setup
pnpm dev:backend
pnpm dev:web
pnpm dev:mobile
```

`pnpm setup` creates gitignored env files from the examples: `backend/.env.dev`, `web/.env.local`,
and `mobile/.env`. It writes a random `JWT_SECRET` into `backend/.env.dev`. That value stays on your
machine. The API refuses to start outside tests if `JWT_SECRET` is empty or one of the strings
published in the repo (`backend/src/config/public-jwt-secrets.ts`).

`pnpm dev:backend` starts Postgres via Docker Compose, applies pending Prisma migrations, then runs
the API. Migrations are additive: running them again does not wipe existing rows. Stop with Ctrl+C;
Postgres keeps running until `docker compose down`.

The local database password in Compose is `pairkit`. Postgres listens on `127.0.0.1` only, so other
machines on the network cannot connect to it. `docker compose --profile api` is that same local API
inside a container: it reads `backend/.env.dev` and does not switch the process to production. A
real deploy sets `JWT_SECRET` on the host. Run `pnpm setup` before the Compose API profile too.

API defaults to `http://localhost:4000`. Web defaults to `http://localhost:3000`.

On a physical phone set `EXPO_PUBLIC_API_URL` to a host the device can reach, not `localhost`. Run
`./scripts/print-lan-api-url.sh` and put that value in `mobile/.env` (Android emulator:
`http://10.0.2.2:4000`). EAS development builds need `expo-dev-client` (already in `mobile/`). After
`eas init`, add the EAS `projectId` — the template leaves it empty.

To run only the API in Docker: `docker compose --profile api up --build`. Postgres still starts with
plain `docker compose up -d`. Codespaces / VS Code Dev Containers: `.devcontainer/`.

To walk the demo slice: create a workspace on `/sync`, join from the phone with the 6-digit code,
add an item. That loop is a teaching path, not a feature you have to keep.

## Structure

```
core-modules/   @pairkit/core — Zod API contracts, sync-engine, `@pairkit/core/client`
backend/        Express + Prisma
web/            Next.js (`/`, `/sync`, `/items`)
mobile/         Expo (Home / Sync / Settings + Items)
```

Web and mobile never import each other. Both talk to the API through `@pairkit/core`. Backend
validates the same Zod schemas. Envelope is `{ success, message, data }`. Auth is Bearer tokens in
JSON (SecureStore on mobile, localStorage on web — **XSS on the web origin can read those tokens**).

## Drop a platform

Deleting a folder is not enough, but a client **is** optional.

To drop **web** or **mobile**:

1. Delete `web/` or `mobile/`.
2. Remove it from `pnpm-workspace.yaml`.
3. Remove the matching `dev:*` / `build:*` scripts in the root `package.json`.
4. Remove CI steps that name it (today `pnpm build:web` and the Expo doctor step).

Root `pnpm typecheck`, `pnpm test`, and `pnpm lint` already use `--if-present`, so they keep
working. Husky only runs a package's lint-staged when that tree has staged files.

Do not delete `backend/` and expect the remaining client to sync: it needs this API. `core-modules/`
stays as long as any app or the API still imports `@pairkit/core`.

## Example slice (optional)

Pairing is how the starter proves types and auth across packages. Endpoints:

| Method | Path                                       | Notes                                          |
| ------ | ------------------------------------------ | ---------------------------------------------- |
| POST   | `/v1/workspaces/create`                    | Recovery key, pairing code, token pair         |
| POST   | `/v1/workspaces/join`                      | 6-digit code (single-use, transactional claim) |
| POST   | `/v1/workspaces/recover`                   | Long-lived recovery key                        |
| POST   | `/v1/workspaces/refresh`                   | Rotate refresh; reuse revokes the device       |
| POST   | `/v1/workspaces/pairing-code`              | Auth required                                  |
| GET    | `/v1/items`                                | Auth required                                  |
| POST   | `/v1/items`                                | Upsert one item                                |
| POST   | `/v1/items/{bootstrap,manifest,pull,push}` | Sync-engine protocol                           |

Probes: `GET /live` (process up), `GET /ready` and `/health` (Prisma ping). Responses include
`X-Request-Id`.

Behind a reverse proxy set `TRUST_PROXY` to the hop count (for example `1` on Render). Optional
traces: `OTEL_EXPORTER_OTLP_ENDPOINT`. Production web CSP is a per-request nonce + `strict-dynamic`
in `web/proxy.ts`. Set `NEXT_PUBLIC_SITE_URL` to the real origin before a production web build.

`@pairkit/core` is source for Next, Expo, and `tsx`. Production Node loads `dist` after
`pnpm --filter @pairkit/core build`. HTTP, item storage, and engine wiring live in
`@pairkit/core/client`; each app supplies KV, session persistence, device name, and API base URL.

## After you use this template

GitHub does not copy branch rulesets. In the new repo:

```bash
./scripts/protect-main.sh
```

That blocks direct pushes to `main` until a PR has green `verify` and `secrets` jobs.

## Intentionally not included

- Maps, GPX, sqlite, MapLibre, routing
- tRPC, Turbo, required shadcn, Better Auth
- Product analytics, SMTP, store SDKs, EAS `projectId`
- Renaming packages into `apps/` / `packages/`
- Cookie sessions (Bearer + CSP instead)

## License

[MIT-0](./LICENSE)
