# Sources, authority and competitor check

Checked 2026-11-16 local / 2026-11-17 UTC. Exact document links and locators below.
Historical incidents establish mechanisms, not current Arc deployments or loss rates.
No claims below imply that the researcher independently replayed historical mainnet
transactions. First-party accounts remain accounts, not conclusive causal proofs.

| Source | Publication / locator | What it supports; limit |
|---|---|---|
| [Euler Foundation: Special Announcement](https://forum.euler.finance/t/special-announcement/900) | 2023-04-04, opening and recovery paragraphs | March 13 code exploit; recoverable assets returned. Does not establish an individual claimant's eventual uncompensated loss. |
| [Chaos Labs: CAPO postmortem](https://governance.aave.com/t/post-mortem-exchange-rate-misallignment-on-wsteth-core-and-prime-instances/24269) | 2026-03-10, Summary, What happened, Impact, Recovery | Configuration mismatch caused erroneous liquidations; recovery offsets matter. Responsible risk provider's explanation; classification is not an independent adjudication. Report sections differ in aggregate extraction figures; do not use them as a claimant loss oracle. |
| [TokenLogic reimbursement proposal](https://governance.aave.com/t/direct-to-aip-wsteth-capo-oracle-incident-user-reimbursement/24275) | 2026-03-11, Summary and Motivation | Proposed user reimbursement after recoveries; a proposal is not proof that each user was paid. |
| [CoW execution failures discussion](https://forum.cow.fi/t/move-solver-rewards-mechanism-from-theory-to-practice/1850) | 2023-08-01 opening post; November replies | Specific auctions, changing execution feasibility and disputed attribution. Participant reports; not a customer SLA loss adjudication. |
| [CoW CIP-55 GlueX](https://forum.cow.fi/t/cip-55-slashing-of-the-gluex-solver/2649) | 2024-11-21 forum post; incident 2024-11-07; Incident Summary, Harm caused | Protocol fee losses and reimbursement/bond procedure; expressly no user funds at risk. Not a missed-deadline payout. |
| [CoW CIP-52 EBBO](https://forum.cow.fi/t/cip-52-ebbo-fairness-specifications-reimbursement-procedures-and-escalation-mechanisms/2579) | 2024-09, II and III; UPDATED DEFINITION OF CERTIFICATE | Reimbursement, challenge and governance bond slashing; use updated text, not struck-out all-block certificate. Rules are not evidence of a particular paid incident. |
| [CoW competition rules](https://docs.cow.fi/cow-protocol/reference/core/auctions/competition-rules) | Current read, opening rule classes | Onchain, offchain and social enforcement are different. Does not establish Arc deployment. |
| [Freysa history](https://build.freysa.ai/acts) | Undated current read, Act I | Deliberately adversarial prize pool was won by jailbreak. No independently reconstructed theft amount, commercial victim or indirect-injection causation claimed. |
| [Anthropic browser prompt-injection research](https://www.anthropic.com/research/prompt-injection-defenses) | Current read, evaluation/limitations | Controlled attack evidence and continuing vulnerability. Neither a financial-loss incident register nor independent claim adjudication. |
| [Jonathan Levin congressional testimony](https://docs.house.gov/meetings/BA/BA10/20220920/115144/HHRG-117-BA10-Wstate-LevinJ-20220920.pdf) | 2022-09-20, Ronin discussion, paragraph beginning “In fact” | Investigator describes validator compromise and March 2022 withdrawals of 173,600 ETH and 25.5m USDC. Not a generic delivery timeout or present-day bridge endorsement. |
| [Arc connect documentation](https://docs.arc.io/arc/references/connect-to-arc) | Current read, Network details | Arc Testnet 5042002, USDC, official RPC/explorer. Verify individual deployments separately. |
| [QuickNode Streams network matrix](https://www.quicknode.com/docs/streams/supported-chains) | Current read, Arc Testnet row | Documents Arc Testnet datasets; support listing does not provision a stream or establish account access. |
| [QuickNode Streams webhook destination](https://www.quicknode.com/docs/streams/destinations/webhooks) | Current read, HMAC verification | Authenticated delivery; shared provider credentials remain trusted. No truth-of-loss guarantee. |
| [QuickNode backfill](https://www.quicknode.com/docs/streams/backfilling) | Page updated 2026-11-11, ranges/real-time transition | Historical range retrieval; completeness must still be checked against canonical chain. |
| [QuickNode archive/network policies](https://www.quicknode.com/docs/platform/supported-chains-node-types) | Current read, Arc Testnet row | Documents archive support. Does not prove transaction-index replay is available for a chosen RPC plan. |

## Competitor check

| Provider / mechanism | Verified scope | Consequence for Arcuex |
|---|---|---|
| Nexus Mutual | Its [current wording index](https://docs.nexusmutual.io/overview/cover-products/cover-wordings/) links [Single/Multi Protocol wording](https://api.nexusmutual.io/v2/ipfs/QmQQ88vaZkgEY9qXKPtq7Se6caSjB2RTqF1GAnBLW1k8EY): Part B §2 includes code, oracle and liquidation failures; definitions specify oracle error thresholds and configurations. Exclusions address market moves and deliberate claim protocols. | Neither proposed peril is new. Do not imply Nexus promises fully automatic parametric payment; inspect the buyer's exact annex and claims process. |
| OpenCover | [Live site](https://opencover.com/) distributes protection from underwriters and currently links an MCP entry. [Nexus Transaction Cover provided to OpenCover](https://api.nexusmutual.io/v2/ipfs/QmWRir4JSeSv3oKbHyDRz1xFKXh1d8wgew5Rr4koCMeYYu), §1, §5, definitions pp6–9: specified protocol/bridge failures and malicious interactions, warranty period/annex limits, reimbursement deductions, claims-assessor vote. | Agent access alone is weak differentiation. Transaction warranties can be backed by another cover arrangement. Do not infer that this wording covers arbitrary prompts, all transactions, or Arc. Public MCP page could not be fetched, so no tool behavior/integration was tested. |
| Chainproof | [Current products page](https://www.chainproof.co/products) describes institutional deposit protection for approved protocol smart-contract exploits, bespoke underwriting and first-loss structure. Public product description, not a policy contract or a regulator verification. | Established deposit-cover competition. No instant claim, premium, Arc availability, or exact exclusions verified. |
| Sherlock | [Historical signed-form coverage example, June 23 2023](https://api.nexusmutual.io/ipfs/QmSZ8pTHUGE4HjCSbG5DvyvM4axYKwcUwQ3nbdHrKLdU3b), glossary/coverage definitions: scoped code commits, protocol claims and deductible. [Current Sherlock homepage](https://sherlock.xyz/) focuses on security lifecycle services and says services do not guarantee all losses. | An audit-linked historical cover arrangement is not evidence of universally available current insurance. Availability/terms must be confirmed directly. Do not label an audit an insurance policy. |
| CoW solver bonds | [CIP-55](https://forum.cow.fi/t/cip-55-slashing-of-the-gluex-solver/2649) and [CIP-52](https://forum.cow.fi/t/cip-52-ebbo-fairness-specifications-reimbursement-procedures-and-escalation-mechanisms/2579) show provider accountability and reimbursement/escalation. | A strong substitute for execution-service guarantees; trust/governance still exists. Bond collateral and payer differ from pooled third-party risk capital. |

**Directory cross-check:** public GraphQL at `https://beta.node.thegrid.id/graphql`
returned OpenCover and Nexus Mutual records marked `live` (read 2026-11-17 UTC).
Nexus substring search also returned unrelated projects; those were discarded.
An exact-name follow-up returned Nexus Mutual; no Sherlock/Chainproof product matches
in that bounded query. Absence is not evidence of closure. Provider pages above,
not directory descriptions, support consequential product claims. No private Copilot
account data was needed or transmitted.

**Access gaps:** original Aave and CoW March 2026 swap postmortems on X returned 403.
Wormhole's original Medium report was inaccessible; Ronin's old community-alert URL
returned 404; an old Maker report redirected to the current Sky homepage. These are
not cited as read incident evidence. A CoW grant proposal is an author-submitted
proposal, not a primary incident investigation; its linked originals were attempted.
No paid EBBO claim or commercial prompt-injection loss with complete public evidence
was independently verified. Further incident collection could improve lower-ranked
candidates, but does not solve their manufactured-claim problems.

## Insurance, warranty and bond boundary

These are economic design distinctions, not a jurisdiction-specific legal opinion.
Third-party insurance transfers contingent covered losses to an underwriter/risk pool
for premium. A performance bond secures a named principal's obligation with collateral
or a guarantor; that principal can default deliberately. A warranty is a provider's
contractual remedy and may itself have insurance backing, as the OpenCover wording
illustrates. Renaming a pool a “bond” does not settle its legal status.

Before any real issuance: identify policyholder/insurable interest, contracting entity,
governing jurisdiction, permitted distribution, capital and recovery rights with qualified
counsel/underwriter. This research supplies no launch authorization or actuarial price.
