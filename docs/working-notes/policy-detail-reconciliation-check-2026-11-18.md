# Policy-detail reconciliation check — 2026-11-18

Production was inspected over Railway SSH using Python sqlite3 with explicit `mode=ro`. Only non-secret metadata and SELECT results were retrieved. No database writes, deployments, gate changes, or transactions occurred.

Configured running source SHA: `f8365a85f0c4a6298f713be7e799cb7538ca1fc7`. This differs from the older local deployment branch used in earlier source inspection. The configured SHA is not independent binary attestation.

Read at Unix `1795025492` (2026-11-18T18:11:32Z):

- Scope: `5042002:0x6657974eedf488380251bdd95a7fffb0d456e49e`.
- Checkpoint: healthy `1`, checked_at `1795025438`, age **54 seconds**.
- Through block: `72889861`, hash `0x25b6c7010714b5290ad4d8e63710a0fae89418abdc51f64b972dec98ca2049b4`.
- Acceptance policy: on-chain ID `0xb14dc8320d5cfb14c379443b1905d1abe277d4827f29b3f4f36f9d71b5b9d638`, local UUID `cc5fcf8f-d09c-4db9-8520-76d276c2358b`, status **VERIFIED_LINKED**, canonical `1`.
- Its indexed bind is block `72889182`, hash `0x22f5a6719a4c672665ae306fdedc2a2e5b539e7a8a1191466e949c35de57be89`, matching the independently verified receipt.
- Separate historical row: on-chain ID `0x709b9ba707bc439385d46a013efde14b58160bf9d4583f60aa8b932d25ac4f74`, local UUID null, status **ONCHAIN_UNLINKED**, canonical `1`, block `72712560`.

The warning panel in PoliciesPanel displays all owner-visible incomplete reconciliation rows, even on a single policy's detail page. Its historical warning therefore does not identify the new policy as unlinked. Both policies have the same wallet among their visible roles, which explains why the unrelated row is displayed.

The new policy's own pending status in the user-provided view cannot be explained conclusively without its earlier lifecycle response. The current DB observation proves a healthy fresh checkpoint and verified link, so that earlier view no longer matches current backend state. Do not claim a lost linkage or ID mismatch for this new policy. Refresh my policies fetches current projections. Frontend freshness is limited to 300 seconds; the read API independently requires a healthy checkpoint at most 300 seconds old.

The older handoff documentation says the scheduler was not installed in that sprint. The configured running SHA actually includes `deploy/railway/reconciliation-worker.cjs` and `deploy/railway/supervisor.cjs`; the supervisor has a stale-checkpoint watchdog. Do not apply the older deployment blocker unqualified to the current deployment.

The successful bind and exact terms remain verified in [receipt evidence](binding-receipt-8e8309a8-2026-11-18.json). Scheduled effective window: November 18, 2026, 1:11:20 PM Eastern through November 19, 2026, 1:11:20 PM Eastern. No claims were opened, and no settlement was authorized. A refreshed browser lifecycle view was not observed in this check.
