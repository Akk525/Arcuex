# Agent, examiner and human claims investigation

Implemented on `feat/claims-investigation`, based on exact candidate
`34cc5906bbc3203dd9be4b2e0edea6fa8ec4c835`. This integration was verified locally in a disposable
fixture app. Nothing is deployed or pushed.

## Workflow and authority

An insured agent authenticates by the existing signed nonce and httpOnly session. The claims SDK
adds `x-arcuex-agent-id`; the server verifies the authenticated wallet against the registered signer
and the policy's immutable agent/owner association. An agent cannot nominate an arbitrary identity,
access another agent's policy, become a reviewer or authorize a payment. The policyholder retains
access to that same case through their own wallet session.

The existing `/claims/:id` screen now contains the shared investigation thread. Agents/policyholders
submit proof and messages. Reviewers request additional proof, adopt examiner proposals, respond to
linked submissions, resolve requests with a rationale, escalate to REVIEW, and use the existing
contractual approval/denial tools. Escalation clears payable/settlement authority through the existing
REVIEW semantics. A reviewer can close a stalled examiner request explicitly and request another
assessment within the six-attempt limit.

Proof requests, submissions, resolutions and AI reports are separate append-only records. Earlier
proof or findings are never replaced. Open requests block approval. Adding proof changes the verifier
context: an old successful verification cannot authorize adjudication of a newer dossier. Requests
and resolutions also make prior AI assessments stale. A fresh AI report cannot override missing,
contradictory or unsupported verifier findings, contractual conditions, reviewer confirmation or
fixture restrictions. Denial and approval remain human actions; AI is never a decision principal.

**APPROVED means adjudicated, not reimbursed.** The fixture source still cannot prepare settlement,
confirm payment, bind policies, start reconciliation or make live RPC calls. Synthetic fixture evidence
never becomes independently authenticated chain/event/loss proof.

## Evidence and journal

Migration **012** adds only `claim_investigation_entries` after unchanged migration 011. It preserves
existing claims, manifests, verification and accounting rows. Each entry has a server-assigned ID,
per-case sequence, timestamp, authenticated actor, idempotency key, payload, previous hash and record
hash. SQLite rejects UPDATE/DELETE. Reading validates the chain; submissions recompute the content
hash. Hashes demonstrate recorded bytes and attribution, **not truth or independent authentication**;
they are not an external signed attestation against an operator who controls the entire database.

Attachments support **UTF-8 text/JSON up to 16,000 bytes**. The UI accepts a file or pasted content;
invalid UTF-8 and oversized content are rejected. No arbitrary URL fetch or binary/document parser is
introduced. The original decoded UTF-8 bytes, filename, SHA-256, declared source, submitter wallet/agent,
request association and initial `unverified` status are retained. The filename is metadata, never a
filesystem path. Repeat bytes on different requests remain separate submissions; exact retries are
idempotent and changed retries fail.

Classification is server-derived: exact supported catalog bytes on a synthetic case are
`synthetic_fixture`; other claimant material is `claimant_assertion`, and reviewer material is
`reviewer_observation`. A submitter cannot assert independent verification. Arbitrary extra evidence
keeps the existing unsupported-evidence REVIEW gate. The UI separately projects current persisted
fixture consistency while preserving the immutable initial submission status. Human acceptance of a
response closes a request; it does not authenticate external facts.

## OpenAI examiner and cost limits

The **separate worker** receives a server-built dossier of immutable coverage and exclusions,
the incident and recorded policy/exposure link, case chronology, submitted and accepted proof,
outstanding requests, current and historical verifier results, and the limitations of loss and
recovery figures. The authority projection compares the recorded authenticated intake with the
registered agent or owner. Procurement delegation is shown separately, scoped to acceptance and
its recorded expiry and revocation. Missing or inconsistent authority is surfaced for human review.
These records establish the stated application roles and their limits. They provide no active-session
attestation, reimbursement authority or independent proof of loss.

The server compares the incident's recorded observation with the immutable policy start and expiry
at millisecond precision. Both boundaries are inclusive. Procurement terms use Unix seconds and
legacy terms use their original ISO timestamps. Incident timestamps must carry a known explicit
offset or UTC marker and use at most millisecond precision. The chronology carries the raw values,
source identifiers and normalized instants. Missing, conflicting or invalid timing sources require
review. A timestamp inside the interval establishes only the recorded temporal relationship.
Waiting periods, coverage applicability, exclusions, causation and economic loss are separate checks.

`claims-dossier-v3` restricts the model's structured chronology to the server relation. References
to verified findings must be cited IDs from current sufficient verifier records. The server
recomputes the dossier and rejects a conflicting relation, free-text policy-timing claims recognized
by the validation guard, and invented or stale references. Human review still treats other model
commentary as unverified and reads the server chronology directly. Free-form semantic validation
is limited. Earlier reports remain available as historical advisory output. Every proposed proof request includes a question and at least one
dossier citation. The provider schema enumerates the allowed case, policy, incident, chronology,
proof, manifest and verification IDs. The app validates those IDs again before persisting a report
and rejects stale results. Human adoption preserves the report ID and cited records on the new
request. An adopted request remains evidence to review, and a human must resolve it.

Earlier examiner records are excluded from the model input. The model gets no repository access,
credentials, tools or executor. Reports record the dossier hash, model, prompt version, response ID,
token usage, output hash and worker attribution. The UI distinguishes `LIVE OPENAI · advisory only`
and `TEST DOUBLE · no live AI inference`.

The worker uses the fixed `https://api.openai.com/v1/responses` endpoint, **`gpt-6.1-terra`**,
`reasoning.effort=none`, `store=false`, strict structured output, a 45-second timeout and no redirects
or retries. There is no automatic model fallback. Input is capped at **24,000 UTF-8 bytes of dossier**,
output at **1,500 tokens**, with **six examiner requests total per claim**, including failed/cancelled
requests. At most one request is pending and each is reserved transactionally for one provider attempt.
The worker watches only the explicitly specified case for at most five minutes/six attempts.

As verified November 19, 2026, standard model prices are **$1/M input and $5/M output tokens**.
For example, 5,000 input + 500 output tokens costs approximately **$0.0075** before account-specific
adjustments. Six such calls are approximately $0.045. Token/byte bounds are technical controls, not a
provider invoice guarantee or an account-wide spending limit; actual usage is retained per report.
[Official model/pricing](https://developers.openai.com/api/docs/models/gpt-6.1-terra),
[Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
Model access requires the separately configured worker key. Review each live result against the actual dossier and current verifier records.

## Worker configuration

Keep **`OPENAI_API_KEY` outside the fixture application's environment**. The existing strict fixture
configuration still rejects that key. No credential allowlist, acceptance gate, RPC or settlement
restriction was loosened. The worker is a separately authorized claims client outside the isolated
app; it exchanges dossier data with OpenAI, not live chain state. The app itself has no external
inference dependency or egress exception. This is not a claim of hosted worker/network isolation.

Create a private, gitignored `.env.examiner.local` for the worker with:

- `OPENAI_API_KEY`: dedicated operator-provided OpenAI API credential.
- `CLAIMS_SYSTEM_API_TOKEN`: fresh candidate-only system role token, matching the optional token
  provisioned separately in that candidate app. It is not a reviewer, authority or financial signer.
- `ARCUEX_ACCEPTANCE_GATE_TOKEN`: candidate-only gate credential when the app requires it.

Never copy Plan A credentials or pass the model key to `pnpm dev`, `next start`, app containers or builds.
With Node 22+, run from the repo root:

```sh
pnpm --filter @arcuex/onchain exec node \
  --env-file=/absolute/private/path/.env.examiner.local --import tsx \
  ../../apps/web/scripts/claims-examiner-worker.mts \
  http://localhost:3000 CASE_ID
```

This watches that claim for UI-requested assessments. Add `REQUEST_ID` after `CASE_ID` to process
exactly one queued request. It refuses the known Plan A hostname and insecure nonlocal origins.
On missing key/provider failure, no recommendation or financial state is established. If a worker
crashes after reserving a call, a reviewer explicitly closes the stalled request before a new one;
there is no automatic replay that could silently spend twice.

## Agent SDK

`ClaimsApiClient` uses external message signing; signing keys never enter the client. Its methods are
`authenticate`, `submitClaim`, `submitProof`, `message`, `investigation` and `requestExamination`.
Proof hashing is local and checked again by the server. All calls keep the existing origin, session,
acceptance and role boundaries. There are no transaction or settlement methods.

```ts
const claims = new ClaimsApiClient({ baseUrl, agentId });
await claims.authenticate(agentAddress, message => externalWallet.signMessage({ message }));
const { case: claim } = await claims.submitClaim({
  policyId, exposureId: agentId, idempotencyKey, observedEventRef, observedAt,
});
const investigation = await claims.investigation(claim.id);
await claims.submitProof(claim.id, {
  requestKey: crypto.randomUUID(), requestId: investigation.outstandingRequests[0] ?? null,
  filename: 'replay.json', content: fixtureJson, declaredSource: 'synthetic fixture catalog',
});
```

GET/POST `/api/claims/cases/:id/investigation` supports role-scoped messages, proof, requests,
resolutions, escalation and examination requests. Only the authenticated system worker may reserve,
finish or fail an examiner run. Existing `/verification` and adjudication endpoints remain the
verification/decision authority, respectively.

## Reproduce acceptance and recovery

```sh
pnpm test
pnpm test:contracts
pnpm lint
pnpm typecheck
pnpm build
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/claims-investigation-acceptance.mts
```

Default browser acceptance uses real production/local-test fixture app, authenticated distinct agent
and owner wallets, HTTP, SQLite, verifier and human UI, with **only OpenAI transport doubled**. Every
mocked report is prominently labeled `TEST DOUBLE · no live AI inference`. No paid inference call
is made. Existing evidence paths refuse overwrite; archive earlier runs first.

After configuring the worker key, an explicit two-assessment live smoke can use:

```sh
ARCUEX_ACCEPTANCE_LIVE_OPENAI=1 \
ARCUEX_WORKER_SECRET_SOURCE=/absolute/private/path/.env.examiner.local \
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  pnpm --filter @arcuex/onchain exec node --import tsx \
  ../../apps/web/scripts/claims-investigation-acceptance.mts
```

The runner loads only the provider key from the specified file, uses two calls at most and caps
acceptance dossiers at 16,000 UTF-8 bytes, with 1,500 output tokens per call and a $0.06 estimated
cost limit at documented standard rates. Set `ARCUEX_ACCEPTANCE_LIVE_STAGE=reassessment` for a
labeled test-double initial request and a single live reassessment. The fixture app and browser run
with allowlisted environments. Live results default to `browser-live/`, with an optional explicit
`ARCUEX_BROWSER_EVIDENCE_DIR`. Missing keys fail before startup. Provider refusals, invalid
citations and schema errors fail the run and the worker records the failure.

Back up only the candidate SQLite through the existing checkpoint/backup procedures before migration.
Restore only that candidate's matching source/storage/session identity and keep recovery hold until
reviewed; do not restore Plan A. Rollback across 012 must retain the database/journal and use reviewed
compatible code; do not delete append-only tables or findings. Normal restart preserves entries and
never renews the unchanged five-minute fixture lease. An expired rehearsal requires a new explicit
fixture identity and empty database. The acceptance harness removes its app, browser and disposable
storage after retaining synthetic evidence.
