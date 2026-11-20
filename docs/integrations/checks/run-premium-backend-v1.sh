#!/usr/bin/env bash
set -euo pipefail

# Read-only Git export of a candidate commit or staged Git tree. Writes are confined to a disposable snapshot.
checks="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$checks" rev-parse --show-toplevel)"
frontend="$(git -C "$root" rev-parse --verify "${1:-ui/premium-product-redesign}")"
git -C "$root" rev-parse --verify "$frontend^{tree}" >/dev/null
backend_tag=backend-integration/2026-11-19-v1
backend="$(git -C "$root" rev-parse "$backend_tag^{commit}")"
[[ "$backend" == fa462049cd4d87afce6ac9a3df9ef8dd2f55a7fc ]] || {
  printf 'Frozen backend tag mismatch\n' >&2
  exit 1
}

snapshot="$(mktemp -d "${TMPDIR:-/tmp}/arcuex-premium-compat.XXXXXX")"
trap 'rm -rf -- "$snapshot"' EXIT
printf 'Frontend %s\nBackend  %s\n' "$frontend" "$backend"
git -C "$root" archive "$frontend" | tar -x -C "$snapshot"
if [[ "${ARCUEX_COMPAT_APPLY_PATCH:-0}" == 1 ]]; then
  patch="$checks/../patches/premium-backend-v1.patch"
  git -C "$snapshot" apply --check "$patch"
  git -C "$snapshot" apply "$patch"
  printf 'Applied the compatibility patch to the disposable export.\n'
fi
export ARCUEX_COMPAT_SNAPSHOT="$snapshot"
test_dir="$snapshot/apps/web/src/integration-checks"
mkdir -p "$test_dir"
cp "$checks/premium-backend-v1.test.ts" "$test_dir/"
test_paths=(src/integration-checks/premium-backend-v1.test.ts)
if [[ -f "$snapshot/apps/web/src/lib/procurement/checkout-recovery.ts" ]]; then
  cp "$checks/checkout-recovery-v1.test.ts" "$test_dir/"
  test_paths+=(src/integration-checks/checkout-recovery-v1.test.ts)
fi
if [[ "${ARCUEX_COMPAT_APPLY_PATCH:-0}" == 1 ]]; then
  test_paths+=(
    src/lib/claims/claims-client-response.test.ts
    src/lib/claims/settlement-presentation.test.ts
    src/lib/procurement/checkout-presentation.test.ts
    src/lib/procurement/policy-timeline.test.ts
  )
  if [[ -f "$snapshot/apps/web/src/lib/claims/claim-presentation.test.ts" ]]; then
    test_paths+=(src/lib/claims/claim-presentation.test.ts)
  fi
fi
git -C "$root" show "$backend:docs/integrations/backend-integration-v1.json" > "$test_dir/contract.json"
git -C "$root" show "$backend:apps/web/src/lib/server/claims-settlement-projection.ts" > "$test_dir/frozen-projection.txt"

if [[ -n "${ARCUEX_COMPAT_INSTALLED_WORKSPACE:-}" ]]; then
  # The focused tests exercise pure UI modules. Reuse matching dependencies read-only.
  installed="$(cd "$ARCUEX_COMPAT_INSTALLED_WORKSPACE" && pwd)"
  cmp "$snapshot/pnpm-lock.yaml" "$installed/pnpm-lock.yaml"
  [[ -d "$installed/node_modules" && -d "$installed/apps/web/node_modules" ]]
  # Link only the imports used by these checks. Keep all runner caches in the snapshot.
  mkdir -p "$snapshot/apps/web/node_modules"
  ln -s "$installed/node_modules/vitest" "$snapshot/apps/web/node_modules/vitest"
  ln -s "$installed/apps/web/node_modules/viem" "$snapshot/apps/web/node_modules/viem"
  cd "$snapshot/apps/web"
  node "$installed/node_modules/vitest/vitest.mjs" run "${test_paths[@]}" "${@:2}"
  exit
else
  install_flags=(--offline --frozen-lockfile)
  if [[ -n "${ARCUEX_COMPAT_PNPM_STORE:-}" ]]; then
    install_flags+=(--store-dir "$ARCUEX_COMPAT_PNPM_STORE")
  fi
  pnpm --dir "$snapshot" install "${install_flags[@]}"
fi
cd "$snapshot"
pnpm --filter @arcuex/web exec vitest run "${test_paths[@]}" "${@:2}"
