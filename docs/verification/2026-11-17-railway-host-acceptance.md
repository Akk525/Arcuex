# Railway private host acceptance

Verified packaging date: **2026-11-17**.

## Exact RC vs acceptance deploy

Requested exact RC: `8d70296d4e89f053a882a9fa48945aa481b35efd`.

That commit has **no application-level acceptance gate**. A Railway HTTPS service domain is publicly reachable, which trips the stop condition “Unexpected public access” if deployed as-is for host smoke.

**Resolution:** deploy a gated successor on `release/nov20-arc-testnet-beta` that requires `ARCUEX_ACCEPTANCE_GATE_TOKEN` for all routes except `/api/health/live`. Live probe remains ungated for Railway healthchecks.

## Railway project (dedicated)

| Field | Value |
| --- | --- |
| Workspace | Aditya Kuniyil Kattil's Projects |
| Project | `arcuex-nov20-beta` |
| Project ID | `03848637-de2d-497f-8308-f8f3ccf06f07` |
| Environment | `production` (`6dca510e-fe00-4478-8d8d-ef65fd5bc4d7`) |

Do not deploy Arcuex into unrelated projects (`founderos`, `CHITTA`, etc.).

## Decision placeholder

Filled after deploy + host checks in the same session.
