# Contributing

Thanks for improving Pairkit as a starting point (clearer defaults, tests, docs).

## Setup

1. Fork and clone.
2. `pnpm install`
3. `pnpm setup` (gitignored env files and a local `JWT_SECRET`).
4. `pnpm dev:backend` (Postgres, migrations, API). Docker must be installed and running.
5. In another terminal: `pnpm typecheck && pnpm test`

`pnpm test` enforces 70% coverage on workspace auth (`features/user/services`), item sync
(`features/items/services`), middleware, and token hashing.

## Checks

| When           | What                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit         | Husky `lint-staged`: Prettier on docs/config, ESLint+Prettier on staged package files                                                                                 |
| Push           | Husky `pnpm typecheck && pnpm test`                                                                                                                                   |
| PR into `main` | Jobs `verify` (typecheck, Expo doctor, tests, lint, boundaries, knip, format, builds, sync smoke) and `secrets` must be green. A GitHub ruleset blocks direct pushes. |

Tests that need Postgres skip if Compose is not up; CI still runs the full suite including those
HTTP specs. Lint, format, and builds stay in Actions, not in `git commit` or `pnpm build`. pnpm 11
refuses lockfile entries younger than 24 hours (`minimumReleaseAge`). Weekly Dependabot npm version
PRs are off (Expo SDK pins); security alerts stay on. GitHub Actions get a monthly bump.

Work on a branch, open a PR, wait for `verify` and `secrets`, then merge. A solo maintainer can
merge without a second reviewer; the required checks are CI, not a human approval.

If this repo was created with **Use this template**, run `./scripts/protect-main.sh` once so `main`
cannot be updated except through a green PR.

## Conventions

Invariants and the definition of done are in [AGENTS.md](./AGENTS.md). Before handing work off, run
`pnpm verify:changed` (typecheck, lint, and tests for packages touched in the working tree). For a
local sync smoke with API and web already running: `pnpm smoke:sync`.

Do not commit secrets. `Pairkit` is the only brand token — keep it searchable.
