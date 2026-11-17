# Candidate comparison

All proposed thresholds, limits and waiting periods below are research design choices,
not market quotes or actuarial estimates. Primary sources checked 2026-11-16 local /
2026-11-17 UTC; [source register](sources.md) identifies gaps and authority limits.

## Ranking

Points are judgment, not measured demand. Need = financial severity and credible buyer;
residual = loss remaining after sensible prevention; verifiability = reproducible facts
and causation; hazard = resistance to manufactured claims; demo = honest Arc demonstration;
differentiation = advantage over existing cover and service guarantees. Demo scores
discount the absence of verified live Arc lending/vault deployments. No score overrides
the disqualification gate. A two-point lead is not statistically meaningful.

| Rank | Candidate | Need /20 | Residual /20 | Verify /20 | Hazard /15 | Demo /15 | Different /10 | /100 | Decision |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Canonical exchange-rate adapter error → liquidation | 17 | 18 | 18 | 12 | 12 | 6 | 83 | Conditional go; narrow top wedge |
| 2 | External protocol exploit → deposit impairment | 19 | 19 | 16 | 11 | 11 | 4 | 80 | Strongest fallback; expert event qualification |
| 3 | Cross-chain infrastructure principal loss | 18 | 19 | 13 | 9 | 7 | 4 | 70 | Defer; delivery timeout variant disqualified |
| — | Signed execution-service failure | 14 | 10 | 12 | 5 | 13 | 3 | 57 | Disqualify pooled missed-deadline cover |
| — | Bounded drift / off-market execution | 16 | 7 | 10 | 4 | 13 | 3 | 53 | Disqualify unrestricted adverse-price cover |
| — | Prompt-injection financial loss | 16 | 12 | 3 | 2 | 10 | 7 | 50 | Disqualify claimant-log trigger |

Sensitivity: remove a usable independent reference and oracle verifiability falls from
18 to at most 8: the fallback wins. A verifiable reference is a launch gate, not an
optional enhancement. Confirm willingness to pay with agent treasury operators; incident
severity alone does not establish demand or a profitable premium.

## 1. External DeFi protocol exploit or failure

**Trigger:** a pre-listed, independently operated USDC vault loses backing through a
qualified code exploit; pre-registered shares acquire an irreversible net principal
shortfall. Mere pause, falling token price, or failed withdrawal is insufficient.
The narrower [specification](protocol-impairment.md) excludes ordinary credit defaults.

**Parties and harm:** the agent's treasury owner is insured and beneficiary, bound to
its registered payout account; that owner or a disclosed platform sponsor pays premium.
Loss is the registered share entitlement less remaining recovery value, actual proceeds
and third-party compensation. No anticipated yield or entire TVL payment.

**Residual risk:** spend limits cap new outflows, but do not protect money already
deposited. Slippage checks cannot restore stolen vault backing. Exposure limits and
diversification remain required rather than replaced by cover.

**Incident:** Euler Foundation reports the March 13, 2023 code exploit and later return
of recoverable funds. This proves recovery accounting matters: an exploit alert is not
a lasting loss amount. [Euler announcement, April 4, 2023](https://forum.euler.finance/t/special-announcement/900).

**Evidence/authority:** canonical deposits, transfers, balances and redemption rights;
archive state and deterministic share accounting; independent security report plus
protocol postmortem to qualify the exploit. An underwriter-appointed reviewer must resolve
intent, code versions and recovery rights. RPC providers establish state, not intent.

**Fraud/hazard:** a claimant-created vault can emit convincing logs and drain itself.
Reject claimant-controlled protocols, self-dealing, post-event deposits and transferred
claims. Pre-list protocol/code/admin keys, register exposure before a 24-hour waiting
period, cap eligible shares at their minimum held since registration, retain 20% loss
and screen related parties. Hidden collusion remains a human underwriting dependency.

**Attestation limits/exclusions/limits:** a signed exploit report can be wrong, captured
or incomplete. Conflicts or unavailable historical state → review, never default payout.
Exclude keys, phishing, privileged rug pulls, market/depeg losses, yield, normal fees and
unapproved upgrades. Proposed cap: 1,000 synthetic USDC per policy, 100 deductible,
80% net-loss participation and a 10,000 event capacity reserved before binding.

**Streams/Arc:** observe transactions, receipts, share transfers, deposits/redemptions
and suspicious outflows; reconstruct entitlements through archive reads. Cannot observe
legal recovery rights or prove an exploit from a transfer alone. Arc mock/replay feasible;
no real Arc vault, exploit or live Streams workflow verified. Compare with Nexus,
Chainproof and Sherlock below: low peril novelty, useful automated evidence servicing.
This is third-party loss indemnity, not a promise by the vault operator to perform.

## 2. Oracle malfunction causing covered position loss

**Trigger:** a listed lending adapter materially understates a wrapper/base conversion
rate relative to an independent canonical redemption ratio, and a registered position
is liquidated even though replay using the canonical ratio would have been healthy.
Only the liquidation penalty/value extraction is covered. [Full spec](oracle-liquidation.md).

**Parties/harm/residual:** owner of the borrowed position is insured and beneficiary;
owner or disclosed agent platform pays. Wallet controls cannot correct a protocol's
oracle after collateral is deposited. Conservative leverage reduces frequency but
does not guarantee protection against an erroneous oracle.

**Incident:** Chaos Labs' March 10, 2026 postmortem describes CAPO parameter misalignment
and erroneous wstETH liquidations. Liquidation volume is not the same as user loss;
the report separately discusses extraction and proposed compensation.
[Aave primary postmortem](https://governance.aave.com/t/post-mortem-exchange-rate-misallignment-on-wsteth-core-and-prime-instances/24269).

**Evidence/authority:** ordered liquidation receipt, complete pre-transaction position,
protocol risk configuration, actual oracle read, canonical wrapper read and independently
reproduced counterfactual. Protocol/provider statements help diagnosis; no provider
alone determines claims. Canonical wrapper exchange rate is a reference for this
specific asset relationship, not proof of a general asset's executable market price.

**Fraud/hazard:** exclude claimant-controlled oracle updates, wrapper manipulation,
liquidator/counterparty related parties, additions to debt and collateral withdrawals
after registration, and accounts already unhealthy under the reference. Hidden
liquidator rebates require investigation. Multiple RPCs of the same chain are not
independent price sources. A contaminated reference or failed replay → review.

**Exclusions/limits:** no actual market liquidation, wrapper depeg, principal theft,
missed profits, deliberate unsafe leverage, ordinary funding interest or duplicate
reimbursement. Proposed 1,000 USDC policy cap, 10 deductible, 80% participation;
10,000 event capacity with aggregate admission controls. These are fixture parameters.

**Streams/Arc/comparison:** receipts/logs expose oracle configuration and liquidations;
archive calls supply exact ordered state and balances. Streams cannot infer causation,
related-party ownership or truth of a price. Synthetic Arc demo feasible, actual lending
deployment unverified. Nexus already covers specified oracle failures; differentiation
is a reproducible narrow evaluator and agent exposure registration, not a new peril.
External loss indemnity; no service principal is guaranteeing its own uptime.

## 3. Execution-service failure against a signed commitment

**Proposed trigger:** independent service signs chain, account, nonce, action hash,
deadline, output floor, prerequisites and remedy before accepting a job; no qualifying
receipt by deadline despite independently proven prerequisites. Insured/beneficiary
would be the agent owner; owner pays cover or service funds a warranty/bond.

**Actual harm:** only receipted replacement execution costs or directly caused
liquidation loss; missing a deadline itself has no demonstrated financial loss.
Lost trading profit is a disputed counterfactual. Spending limits do not make a service
available; an onchain output floor prevents a bad fill but does not guarantee inclusion.

**Incidents:** a solver's August 2023 CoW forum report identifies auctions 7000251,
7000269 and 6987617, with inclusion lag, reverts and disputed penalties. It is participant
testimony, not proof of a breached bilateral signed SLA or a quantified customer loss.
[Primary execution failure discussion](https://forum.cow.fi/t/move-solver-rewards-mechanism-from-theory-to-practice/1850).
Separately GlueX's November 7, 2024 incident caused protocol fee losses, already refunded;
it did not lose user assets and was not a missed-deadline case.
[CoW CIP-55](https://forum.cow.fi/t/cip-55-slashing-of-the-gluex-solver/2649).

**Evidence/trust:** verify both signatures, acceptance registry, funded balance,
allowance and cancellation history, complete blocks through deadline, chain liveness
and service logs. A missing log is not proof that the service could execute. An
attester of service readiness is a trust dependency, especially for offchain jobs.

**Attack/gate:** owner and service collude to accept an impossible/uneconomic job, then
manufacture a timeout; owner can revoke allowance, consume nonce or starve gas.
DISQUALIFIED as pooled timeout insurance. A service-funded bond locked at acceptance,
beneficiary-independent challenge and capped remedy is a feasible separate product.
Even a signed commitment doesn't prove independence or eliminate intentional default.

**Exclusions/limits/Streams/demo:** exclude revoked prerequisites, chain halts, owner
cancellation, price gaps and missed profit. Cap experimental bond remedy at posted
collateral and receipted net replacement costs; no risk-pool payout. Streams observes
acceptance/fulfilment/cancel logs and finalized intervals, not service readiness.
Arc synthetic signed-message demo easy; no live SLA or real remedy verified.
CoW bonding is a direct substitute, not validation of insurance demand.

## 4. Bounded execution drift / off-market execution

**Proposed trigger:** executed registered order receives less than a pre-committed,
size-aware executable reference output minus a fixed bps allowance; output remains
within the user's looser signed floor. Owner is insured and beneficiary, owner or
execution platform pays. Harm = reference-realizable output minus net actual output,
after fees, refunds and related-party gains, not mark-to-market notional.

**Residual/prevention test:** an onchain reference-price floor can prevent many such
fills. Insurance must identify a residual (e.g. committed quote liability after a
trusted execution service fails); a self-selected loose minOut is not that residual.

**Precedent and gap:** CoW CIP-52 specifies EBBO certificates, challenges,
reimbursement and bond escalation, showing an existing remedy for worse execution.
It is a rule, not a documented paid incident.
[CIP-52, updated certificate definition, section III](https://forum.cow.fi/t/cip-52-ebbo-fairness-specifications-reimbursement-procedures-and-escalation-mechanisms/2579).
The widely reported March 12, 2026 Aave/CoW swap has original reports on
[Aave X](https://x.com/aave/status/2032959512244518962) and
[CoW X](https://x.com/CoWSwap/status/2032959076502581623); both returned 403 in this
research. Their loss figures and causal accounts are NOT treated as verified primary
evidence here. No fully verified paid EBBO incident was established in this pass.

**Evidence/authority:** signed order, quote and reference route; archive state at
transaction index; token deltas, MEV recipients and size-aware route simulation.
CoW's rules distinguish contract enforcement from social/governance enforcement.
[Competition rules](https://docs.cow.fi/cow-protocol/reference/core/auctions/competition-rules).
A price feed/TWAP is not proof that the entire order could fill there; simulations
depend on ordering and available liquidity. Attestation cannot fix that counterfactual.

**Fraud/gate:** owner trades into its own thin pool, takes value as LP/MEV, then claims
the difference. DISQUALIFY unrestricted cover. An independently underwritten solver
warranty with bond, route allowlist, size limit and related-party screening is a
different proposal. Exclude self-routing, stale feeds, voluntary price impact and
unregistered routes; remedy capped by independently proved net harm and posted bond.
Streams sees swap/order/transfer receipts, not best attainable execution. Synthetic
Arc replay is easy but demonstrates arithmetic, not this unresolved loss proof.

## 5. Prompt-injection-induced agent financial loss

**Proposed trigger:** registered agent consumes malicious third-party content, then
executes a transfer contrary to a prior mandate. Owner is insured and beneficiary;
owner/platform pays. Harm would be unrecovered unauthorized outflow minus returned
value, not an LLM's textual admission that it was compromised.

**Incident quality:** Freysa's own Act I history says a jailbreak won the prize pool.
That was an intentional adversarial game, not an innocent commercial customer's
insured loss; it does not establish accidental prompt-injection claim frequency.
[Freysa Act I](https://build.freysa.ai/acts).
Anthropic reports controlled browser-injection evaluations, not an audited series of
financial insurance claims. [Primary security research](https://www.anthropic.com/research/prompt-injection-defenses).
No independently verified commercial agent financial-loss incident with complete
causal evidence was established here.

**Residual/evidence:** wallet allowlists and spend limits constrain exposure but cannot
fully validate business intent inside otherwise permitted actions. Proposed evidence
requires pre-committed mandate, independently recorded input/tool history, model/tool
versions, key custody and transfer receipts. Claimant-generated logs, screenshots or
model consensus cannot distinguish an injection from the owner intentionally giving
bad instructions. Even signed logs establish origin/integrity, not intent or causation.

**Fraud/gate:** owner sends funds to a controlled account and fabricates a malicious
page or conversation. DISQUALIFIED for trivial manufactured claims. Exclude games,
deliberate instructions, keys, insider losses and unlogged runtimes; these exclusions
remain difficult to adjudicate. A future provider-funded runtime warranty would need
independent control and a capped provider remedy; no pooled limit recommended now.
Streams sees outflow, not prompts, intent or beneficial ownership. Arc synthetic demo
is possible but is especially misleading if called a verified injection loss.
Transaction warranties already address some malicious interactions without proving
an AI-specific cause; see [competitor comparison](sources.md#competitor-check).

## 6. Cross-chain infrastructure or delivery failure

**Trigger split:** (a) qualified bridge exploit permanently impairs pre-registered
principal; (b) valid source commitment has no destination credit/refund by deadline.
Only (a) survives; a source burn and absence of a mint alone are insufficient for (b).
Owner of the transfer is insured and beneficiary; owner or bridge partner pays premium.

**Harm/residual:** unrecovered principal or receipted replacement funding costs.
Temporarily missing destination liquidity and entire transfer principal are different
losses. Wallet limits/slippage cannot make validators honest or deliver a message,
though transfer caps and safer routes reduce exposure.

**Incident:** investigator Jonathan Levin's September 20, 2022 congressional testimony
describes compromised validator keys and two unauthorized Ronin withdrawals in March
2022. This is a documented infrastructure theft, not proof of a generic late-delivery
claim. [Primary testimony, Ronin discussion](https://docs.house.gov/meetings/BA/BA10/20220920/115144/HHRG-117-BA10-Wstate-LevinJ-20220920.pdf).

**Evidence/authority:** source receipt/message ID, source and destination finality,
destination execution status, refund routes, custody backing and all recoveries.
Bridge validators/attesters are part of the failed trust boundary; do not make the
same compromised quorum the only claim authority. Cross-chain absence requires a
complete independently verified interval and knowledge of protocol state, not a
webhook timeout. Ordinary RPC outage and chain halt are ambiguous, not loss proof.

**Fraud/gate:** user never relays an available message, chooses unusable recipient,
withholds destination gas, claims, then completes mint. Reject generic delay payouts;
require independent destination executor and irreversible refund/mint nullification
before principal indemnity. Collusion with bridge operators remains material.
Exclude claimant-controlled bridge, recipient errors, voluntary failure to relay,
sanctions freezes, pending refund and mere delay. Proposed future limit: lower of
registered principal, net loss and remaining event capacity; no live pricing assumed.

**Streams/Arc/demo/comparison:** streams on BOTH supported networks can index messages,
credits and refunds, not offchain attestation truth. No Circle adapter or bridge is
implemented by this research. Two-chain testnet demo requires real supported route,
funded accounts and provider access; Arc-only fixtures cannot demonstrate delivery.
OpenCover's linked Transaction wording includes specified bridge code failures;
generic bridging therefore has limited novelty. Bridge loss cover is indemnity;
a relayer's deadline/refund promise backed by its own stake is a performance bond.
