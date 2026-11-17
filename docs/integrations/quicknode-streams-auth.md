# QuickNode Streams webhook authentication (verified sources)

**Checked:** 2026-11-17  
**Live Streams delivery:** blocked (no `QUICKNODE_STREAMS_WEBHOOK_SECRET`, no public HTTPS host)

## Documented mechanism

QuickNode Streams webhook authentication uses **HMAC-SHA256**, not a proprietary
non-HMAC scheme. Independent corroboration:

1. Official sample: [quiknode-labs/streams-webhook-validate-signature](https://github.com/quiknode-labs/streams-webhook-validate-signature) — states verification matches “How to Validate Incoming Streams Webhook Messages” and uses HMAC-SHA256 over `nonce + timestamp + payload` with the Stream **security token**.
2. [quiknode-labs/qn-guide-examples](https://github.com/quiknode-labs/qn-guide-examples) `verifyWebhookSignature` — same concatenation + HMAC-SHA256 hex.
3. Terraform provider docs for `destination.webhook.security_token` — token used to sign each request for receiver verification.

Headers: `X-QN-Nonce`, `X-QN-Timestamp`, `X-QN-Signature` (lowercase hex).  
Gzip: signature covers **uncompressed** JSON.

Our implementation: `packages/quicknode/src/streams.ts` +  
`POST /api/webhooks/quicknode-streams`.

## What this does / does not mean

| Claim | Status |
| --- | --- |
| Receiver implements documented HMAC | **Yes** (unit tested) |
| Live authenticated Stream delivery received | **No** |
| Streams bounty complete | **No** — RPC ≠ Streams |
| Webhook auth authorizes payouts | **Never** |

## Setup when credentials exist

1. Create Arc Testnet Stream filtered to `InsurancePool`
2. Webhook URL → `https://<public-host>/api/webhooks/quicknode-streams`
3. Set `QUICKNODE_STREAMS_WEBHOOK_SECRET` to Stream security token
4. Confirm inbox row with `signatureOk=true` on Integrations page
