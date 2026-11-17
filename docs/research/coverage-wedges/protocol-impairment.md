# Fallback: external protocol deposit impairment

Status: experimental `protocol-impairment-v1`. Pooled indemnity for a pre-listed
independent protocol's exploit, not a blanket vault-value guarantee.
The [Euler recovery announcement](https://forum.euler.finance/t/special-announcement/900)
is the reason recoveries and surviving rights must precede final loss calculation.

## Exact trigger

1. Bind specific chain/pool/code/admin configuration, USDC asset, registered holder,
   continuous share lot and beneficiary before a 24-hour wait. Eligible shares are
   bounded by registration shares and the minimum continuously held balance; new
   shares do not inherit old cover. Re-entered/transferred shares are excluded.
2. Event is in the covered half-open time window. A pre-approved independent incident
   reviewer qualifies a code exploit, with extraction transactions and reproducible
   causal analysis. Claimant/operator relationship is screened. Self-operated pools,
   fake loss logs and privileged owner withdrawals are excluded.
3. Code/configuration match listed scope; unapproved upgrades suspend eligibility.
   The qualified loss is allocated to the registered lot using that pool's documented
   share-accounting rules and full flow history. No actual pre-event principal stake,
   no cover. Ordinary credit losses/economic speculation are outside v1.
4. Settlement occurs no earlier than 30 days after the event. This is a review window,
   not proof of irreversibility. Surviving shares/rights must be realized, assigned at
   a documented enforceable valuation, or conservatively reserved at full contested
   value. Unknown recovery or contested asset ownership → REVIEW indefinitely until
   resolved through the claims authority; do not convert illiquidity into total loss.
5. Remaining irrecoverable covered principal loss exceeds deductible. Independent
   insolvency/recovery accounting and exclusion review are complete.

Pre-listing prevents a claimant from deploying a broken vault and insuring its own
drain. Hidden affiliations, insider knowledge and attacker collusion cannot be ruled
out by onchain receipts alone. These are residual trust risks, not solved properties.

## Evidence schema and evaluator

Common envelope: [Codex A handoff](decision-brief.md#interface-handoff-for-codex-a).

| Field group | Required evidence |
|---|---|
| Registration | immutable pool/code/asset scope, owner/beneficiary and share lot; pre-event deposits and continuous transfer history |
| Incident | code hash at exploit, qualified type, extraction receipts and traces, independent replay/postmortem digests, reviewer/conflict record |
| Entitlement | registered share cap, minimum held shares, pre-event net principal allocation excluding yield, position ledger and all withdrawals/transfers |
| Resolution | event time, evaluation time, recovery process status, proceeds already received, residual share/recovery-right value, rights assignment and legal claims |
| Capacity | policy/exposure/event remaining and reservation ID; same-loss allocation across policies/providers |
| Provenance | finalized chain refs, raw payload archive digests, independent read comparison and verifier identity |

Evaluator order: validate/common gates → listed code/exploit qualification → continuous
exposure and principal allocation → review-window/resolution gates → net-loss formula.
“Exploit qualified” is an authenticated external adjudication input; the deterministic
evaluator cannot infer unintended code use from a token transfer. The fixture tests
the transition using explicit synthetic trust inputs and never verifies a real exploit.

## Payout formula

`B = min(registeredNetPrincipal, verifiedPrincipalOfContinuouslyHeldLot)`

`N = max(0, B - proceedsAlreadyReceived - residualRightsValue - thirdPartyRecoveries)`

`P = min(policyRemaining, exposureRemaining, reservedEventRemaining,
         floor(max(0, N - deductible) * 8000 / 10000))`

All inputs integer USDC micros. Components are disjoint: principal previously withdrawn
reduces B; redemption/sale after impairment is proceeds; surviving share value is
residual; compensation is third-party recovery. Never subtract the same receipt twice.
Unresolved rights do not get a zero value merely because withdrawal fails. Lock or
assign surviving rights where required to prevent claimant selling them after indemnity
and keeping both. Enforce future recovery rights; pure code cannot enforce that contract.

Example: B=10,000; proceeds=2,000; residual rights=3,000; recoveries=1,000;
N=4,000; deductible=100; 80% share=3,120; 1,000 policy cap → 1,000 USDC.
An event reserve of 10,000 cannot support unlimited policies. Reserve limits when
binding and reduce atomically when paying; do not prorate silently after a loss.

## Scenarios and adversarial tests

| Scenario | Result |
|---|---|
| Independent qualified exploit, final loss above example, rights accounted | COVERED; 1,000 USDC capped |
| Full recovery of principal, no remaining loss | REJECTED; zero |
| Fake pool, related operator or logged “loss” with no entitlement | REJECTED |
| Ordinary market decline or credit default | REJECTED |
| Pool paused; no resolution or contested receivable value | REVIEW; zero |
| Only 10 days elapsed | REVIEW, never automatic total-loss claim |
| Post-event acquisition or balance dipped below claimed lot | REJECTED |
| Exploit qualification unsigned/unapproved reviewer | REVIEW |
| Conflicting code hash, forged contract/chain reference | REJECTED |
| Duplicate event-position claim under another ID | REJECTED |

Future verifier adversarial tests: malicious ERC-4626 donation/share-price inflation,
rebasing shares, protocol insolvency versus market depeg, dust transfer re-entry,
related-party sale of surviving claims, unreported restitution and multisystem double
insurance. V1 excludes unsupported share mechanics; no generic vault adapter is
implemented. [Synthetic demo and events](demo-and-verification.md) are separate from
a real mainnet event reconstruction and from production solvency controls.
