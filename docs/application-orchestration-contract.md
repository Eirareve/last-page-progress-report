# Application Orchestration Contract

Contract version: `0.1.0`

This document freezes the Stage 3 application boundary between trusted
Domain/Runtime/Content inputs, provider-neutral Agent and Final Review ports,
and the future Stage 4 state machine. The implementation lives in
`src/application`. It does not implement a reducer, mutate `SessionState`, or
write persistence.

## Dependency direction

```text
Domain <- Runtime / Provenance <- Agent / Final Review <- Application
Content-gated projections ----------------------------------^
Application event ---------------------------------------> future Stage 4 FSM
```

Application may consume frozen Domain, Runtime, Provenance, Content access,
Agent, and Final Review contracts. None of those layers imports application
orchestration. Orchestrators consume already-authorized business inputs; they
do not import or parse raw files from `/content`. The sole Content
implementation import is the pure `canonical-json` algorithm used by
`semantic-input.ts`; it grants no loader, source, projection, gate, or raw-data
access.

## Operation and capability contexts

Every orchestrator receives an outer application operation `RequestContext`
that matches the current `ActiveOperation`. Bundle operations use the
application-owned capabilities `executeRoundAnalysis`,
`executePlainSemanticReview`, `executePortraitShiftSummary`, and
`executeCharlieSignatureReview`.

Each logical capability also receives its own `RequestContext`. Child contexts
share the outer operation ID, request ID, requested mode, attempt, stage,
stage-instance ID, revision binding, and content binding. Their capability and
input fingerprint are independent. All child fingerprints must be unique and
must differ from the outer bundle fingerprint because capability is part of
the frozen Runtime fingerprint material.

Application recomputes every operation and child fingerprint before a port
call. Canonical semantic material includes business input, content/revision
bindings, safety policy, resolver evidence, and owned Contract versions; it
excludes runtime IDs, attempts, stage metadata, and clocks. Its
RFC 8785/NFC/SHA-256 digest is passed to frozen Runtime
`computeInputFingerprint`.

The operation guard and budget preflight run before any adapter/service call.
A stale operation, mismatched context, repeated budget slot, or invalid budget
returns `preflight_rejected` and does not call a provider port.

## Trusted execution route

`resolveAgentExecutionRoute` deterministically maps requested mode and trusted
availability to `live`, `mock`, or `unavailable`. A live Agent request may use
Mock only when live is unavailable and Mock is explicitly available. The
selected `ProviderNeutralAgentPort.executionMode` must equal the resolved
route; Candidate data cannot select or relabel execution mode.

Final Review uses `resolveFinalReviewExecutionRoute`. A live review that cannot
use a live service resolves to `unavailable`; it never calls Mock to fabricate
a signed or declined role decision. A reviewed result must be recorded as the
same mode requested by its review context, while a technical failure is
recorded as `unavailable`.

## Atomic orchestration boundaries

### Round Analysis

One provider call may transport four logical Candidates:

- `extractUserPrinciple`
- `detectTension`
- `generateCharlieResponse`
- `proposeDocumentDiff`

The application validates the shared round/content/revision envelope, then
validates the four dependent slots in order. Every slot has an explicit
fallback decision: a trusted Mock/static Candidate plus reason, or an explicit
unavailable reason. A fallback is validated by the same Agent validator as a
primary Candidate and binds the current fingerprint, operation bindings,
round where applicable, zero observation, and actual fallback adapter/prompt
identity. It never inherits primary provider/token/identity metadata.

Only a complete `ValidatedRoundAnalysisBundle` produces
`ROUND_ANALYSIS_BUNDLE_RESOLVED`. If any required slot remains unavailable,
the only event is `ROUND_ANALYSIS_BUNDLE_FAILED`; no principle, tension,
Charlie response, or diff partial-success event exists.

### Plain plus Semantic Review

`plain_semantic` is one provider-call budget slot. The plain text is a
bundle-owned transport field, not a tenth Agent capability. Only a complete
`ValidatedPlainSemanticBundle`, containing both the plain revision and its
bound semantic review plus exactly one validated proposal-or-unavailable
outcome per fragment, produces `PLAIN_SEMANTIC_BUNDLE_RESOLVED`. Proposal IDs
and creation time come from trusted deterministic projection; Candidate
revision, anchor, source hash, preview, proposal hash, and safety are validated
before the event exists. Failure produces `PLAIN_SEMANTIC_BUNDLE_FAILED` with
no partial plain revision, semantic review, or proposal payload.

### Portrait summary and Final Review

Portrait summary produces `PORTRAIT_SHIFT_SUMMARY_SUCCEEDED` only with a
validated Agent result. Failure is a typed non-FSM
`portrait_shift_summary_failure` artifact because the frozen event inventory
has no portrait-summary failure event. The deterministic
`computePortraitShift` function remains outside Agent.

Final Review produces `CHARLIE_SIGNATURE_REVIEW_RESOLVED` only for a validated
`signed` or `declined` result. Technical, validation, route, or budget failure
produces `CHARLIE_SIGNATURE_REVIEW_FAILED` with a typed
`CharlieSignatureReviewError`; `unavailable` is never a model role result.

Every application event carries the outer operation ID, request ID,
capability, stage, stage-instance ID, input fingerprint, revision/content
bindings, completion time, and execution receipts. Stage 4 must still run its
normal operation guard and commit the event atomically with Session and
persistence state.

Every resolved/failed return is parsed as a strict `Stage3TerminalArtifact`
carrying Contract version, event (or portrait non-FSM failure), updated budget
usage, and recomputed budget evaluation. Runtime checks bind event ID,
operation/request/content/revisions, receipt inventory and versions, and the
current budget slot.

## Receipts and required inventory

Application records `CapabilityExecutionReceipt`; deterministic Domain
services/functions do not import Runtime or Provenance. Application facades
for `retrieveVerifiedEvidence`, `buildInitialPortraitRecord`,
`buildDissentRecord`, and `computePortraitShift` return `{ result, receipt }`
at one clock boundary. Before execution they recompute the same canonical
semantic fingerprint contract as provider-backed capabilities and reject stale
content/revision bindings. The dissent ID is derived only from the parsed
RequestContext operation ID. Agent-owned deterministic receipts require
`agentContractVersion=0.2.0`; `computePortraitShift` omits Agent version.

Round Analysis always emits one receipt for each of its four logical
capabilities even when they share a provider request. Plain/Semantic emits a
`compareSemanticDrift` receipt, portrait summary emits a
`summarizePortraitShift` receipt, and Final Review emits a
`reviewCharlieSignature` receipt without `agentContractVersion`. Receipt time
covers adapter execution, Candidate validation, and fallback resolution.

The finalization required-receipt inventory is path-aware:

- the seven always-run Agent capabilities plus `computePortraitShift` are
  always required;
- `retrieveVerifiedEvidence` is required only in verified content mode;
- `buildDissentRecord` is required only when the path requires a dissent;
- `reviewCharlieSignature` is required only after a review request.

The inventory never asks callers to fabricate a receipt for a path that did
not execute.

## Budget 0.1.0

There are six unique provider-call slots, each consumable at most once:
`round_1`, `round_2`, `round_3`, `plain_semantic`,
`portrait_shift_summary`, and `signature_review`. Domain round IDs map as
`round1 -> round_1`, `round2 -> round_2`, and `round3 -> round_3`. A network
retry and a structured-output repair are independently limited to one per
logical call and stay inside that slot.

The Agent Contract `0.2.0` restoration repair does not add a budget slot,
logical capability receipt, primary call, retry, repair, token, latency, or
cost allowance. Plain text, semantic comparison, and restoration outcomes
still share the single `plain_semantic` call and one
`compareSemanticDrift` receipt.

| Envelope | Input tokens | Output tokens | Latency | Estimated cost |
| --- | ---: | ---: | ---: | ---: |
| Base | 37,000 | 6,800 | 90 s | USD 0.30 |
| Absolute | 111,000 | 20,400 | 270 s | USD 0.90 |

Preflight reserves one logical call. Trusted post-call observation replaces
that reservation under the same `budgetSlot+logicalCallId` and is evaluated
again. Base excess cannot commit the primary Candidate and may use only an
explicit fallback; absolute/retry/repair excess cannot commit it. The updated
budget sidecar must be persisted and reloaded by Stage 4 atomically with
business state, event, receipts, and idempotency data so refresh cannot reset
consumed slots.

## Identity and idempotency

Stage 3 application/Agent entity IDs use exactly:

```text
stage3:v1:<entityKind>:<zero-based ordinal>:<encodeURIComponent(operationId)>
```

Entity kinds are application/Agent-owned and do not widen Runtime
`PersistentIdKind`. Application event ID uses entity kind `application_event`
and ordinal zero for the single terminal event of an operation.

`runIdempotentApplicationTransition` composes the frozen Runtime idempotency
helpers. A matching applied record returns replay without rerunning business
code; a different fingerprint returns conflict. The wrapper returns pending
and applied records but performs no Session or persistence write. Stage 4 must
atomically persist the business state and applied record; Stage 3 does not
claim cross-instance exactly-once execution.
