# Workflow

- Branch from `main` for each change (`feat/…`, `fix/…`, `docs/…`).
- `main` is the sole canonical integration and eventual deployment branch. Archive tags preserve
  previous feature/integration history; do not resume development on obsolete release branches.
- Conventional commits; keep commits small and green.
- Prefer `pnpm test && pnpm typecheck` before pushing.
- Never force-push `main` or commit secrets.
- Document blocked provider work in `docs/integrations/` and issues.
- Deployment is a separately approved action. Keep Plan A and the persistent volume unchanged
  while reviewing consolidated source. Follow [deployment and recovery](../deployments/main-and-plan-a.md).
