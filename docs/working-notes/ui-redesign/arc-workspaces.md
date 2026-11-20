# Arc workspace refresh

November 20, 2026. The refresh follows the ten Arcuex screen references. The homepage and app routes share a deep teal arc treatment. The homepage pairs
a serif headline with a single illustrative policy and claim record. Purchase
and claim forms use the lighter treatment.

Mission Control, the policy portfolio, the claims list, the insurer review queue
and agent management use counts from their existing authenticated records.
Mission Control uses pending reconciliation as its fourth metric. The policy
timeline runs horizontally on wide screens and vertically on smaller screens.
The claims dossier offers direct links to investigation, verification, human
decision and reimbursement. The claim form keeps the selected policy visible
after the selection step. The agent list can select a registered exposure in the
existing delegation form.

Browser acceptance used a production build with disposable SQLite, a synthetic
claim filed through the SDK, a nonce-authenticated applicant and a separate
reviewer session. The checks exercised policy filtering, changing the selected
policy, choosing an agent for delegation and resolving the dossier section
links. All ten reference routes rendered at 1440 and 390 pixels with zero
horizontal overflow and zero uncaught page errors. The web build, lint and 235
web tests passed. Any policy and claim amounts in the captures are synthetic.

The marketing header offers Connect wallet on desktop and mobile. A successful
connection opens Mission Control. Its existing Sign in action requests a wallet
signature before loading wallet-scoped records. Visitors with a connected wallet
can open Mission Control using the Dashboard link in the marketing header.

The homepage refinement was checked in Chrome at 1440, 900, 390 and 320 pixels
with both motion preferences. The heading, wallet entry point and coverage
link were present. The hero columns never overlapped and the page had no
horizontal overflow or uncaught errors.
