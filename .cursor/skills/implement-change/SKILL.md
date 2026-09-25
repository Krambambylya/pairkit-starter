---
name: implement-change
description: >-
  Implements a Pairkit feature or bugfix against the repo contract. Use when
  implementing a feature, fixing a bug, or changing backend, web, mobile, or
  core-modules behavior.
---

# Implement a change

1. Read `AGENTS.md`. Match the invariant for this change (API feature, env, client, UI).
2. Write the code in the package the contract names.
3. Add a test for the new behavior in the same change. Skip a test only when the change has no observable behavior (docs, rules, formatting).
4. Run `pnpm verify:changed`. If it fails, fix the failure and run it again.
5. For UI, layout, routing, client state, or rendered data, exercise the flow in the browser before finishing.
6. If the change touches `web/` or `mobile/`, run `npx react-doctor@latest --verbose --scope changed` and fix any new errors before finishing. Do not add react-doctor to CI.

React or React Native performance work: open `.cursor/skills/vercel-react-best-practices/SKILL.md` or `.cursor/skills/vercel-react-native-skills/SKILL.md` and the matching rule files. The compiled guides are `guide.md` in those folders.
