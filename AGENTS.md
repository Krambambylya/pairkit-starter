# Agent contract

Invariants for this monorepo. Setup and CI live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Where code goes

- New API feature: Zod schema in `@pairkit/core` (`core-modules/src/api`), handler in
  `backend/src/features/<name>/`. Clients call the API only through the public exports `.`, `./api`,
  and `./client`.
- `web`, `mobile`, and `backend` do not import each other. `core-modules` does not import any of
  them.
- New env var: `backend/src/config/env-schema.ts` and `backend/.env.example` in the same change.
  Runtime code reads `env` from `backend/src/config/env-config.ts`, not `process.env`.
- Workspace HTTP responses use the envelope `{ success, message, data }`.

`features/items` may import `WorkspaceRepository` from `features/user`. Do not add new cross-feature
imports, and do not refactor that one in passing.

## Done

- New behavior ships with a test in the same change. Full-repo coverage is not required. Backend
  HTTP specs skip when Postgres is down; that skip is fine locally.
- The task is not done while `pnpm verify:changed` is red. It typechecks, lints, and tests only the
  packages touched by the working tree. A `core-modules` change also runs `backend`, `web`, and
  `mobile`.
- UI changes (layout, routing, client state, rendered data) are exercised in the browser before the
  task is called done.

React and React Native performance guides are skills. Open them when the change is in `web/` or
`mobile/`. They are not part of every task.
