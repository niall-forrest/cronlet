# Release Checklist

Use this checklist before tagging a release.

## 1. Verify local state

- Ensure you are on the intended branch (usually `main`).
- Ensure your working tree only includes intended changes.
- Ensure package versions/changelog notes are updated as needed.

## 2. Run release gate checks

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

`pnpm release:check` runs:

1. `pnpm build`
2. `pnpm test`
3. `pnpm typecheck`
4. `pnpm test:fixtures` (CLI fixture smoke tests)
5. `pnpm docs:smoke` (docs build + required route outputs + canonical sitemap domain)

## 3. Manual sanity checks (recommended)

- Run `pnpm cronlet -- list --dir ./examples` to verify CLI still works in a real project.
- Confirm docs preview reflects dashboard-aligned theme and updated docs IA.

## 4. Publish

1. Merge to `main`.
2. Create and push a tag: `vX.Y.Z`.
3. Confirm the GitHub `Release` workflow completes:
   - release gate checks pass
   - `cronlet` and `cronlet-cli` publish to npm
   - GitHub release notes are generated
