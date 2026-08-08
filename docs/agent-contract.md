# Agent Contract

> `agentContractVersion: 0.2.0`
> Status: approved stage 3 restoration-proposal repair
> DRI: Codex（technical consistency）
> Final approver: project owner
> Compatibility: breaking for Agent/PlainSemantic Candidate and Validated Bundle consumers
> Approval: project owner, 2026-08-08

## 1. Authority and scope

This Contract owns the nine logical Agent capabilities, their provider-neutral
interfaces, Candidate and Validated Result boundaries, deterministic services,
Mock behavior, bundle transport, safety validation, typed failures, and
ordinary-capability fallback semantics.

It is an additive stage 3 Contract. It does not modify or widen the approved
Domain, Runtime, Provenance, Finalization, Content, or `ContentGateEvaluation`
Contracts. Domain values remain governed by their existing strict Schemas.
Stage 3 Candidate types are untrusted service payloads and are never Domain
entities or persisted Session state.

This stage does not contain a real model provider, production Prompt, public
Agent route, model network request, FSM, reducer, or persistence implementation.

## 2. Dependency direction

```text
server composition root
  -> passed ContentGateEvaluation plus gated ContentAccess
  -> application orchestration
  -> deterministic service or provider-neutral Agent adapter
  -> untrusted Candidate Schema
  -> binding and post-safety validation
  -> capability-owned Validated Result
  -> complete validated application bundle plus execution receipts
  -> future stage 4 atomic transition
```

Domain does not import Agent, Final Review, application, Runtime, Provenance, or
provider code. Deterministic Domain services do not import or receive
`RequestContext`, `ActiveOperation`, `CapabilityExecutionReceipt`, timestamps,
or other execution metadata. Agent and application code cannot read raw content
JSON or private content-layer internals; content enters only through a gated
public access interface.

## 3. Version ownership

The Agent Contract owner version is `0.2.0`. Every concrete Candidate,
Validated Result, and bundle has an explicitly owned version constant. Version
axes remain separate even when their values are equal.

- Candidates carry a capability-specific `candidateSchemaVersion`.
- Validated Results carry a capability-specific `resultSchemaVersion`.
- Candidate and Validated bundles carry a bundle-specific
  `bundleSchemaVersion`.
- Agent-derived execution receipts set `agentContractVersion=0.2.0` and map
  their concrete validated result or bundle version to the existing receipt
  `resultSchemaVersion` field.

No ownerless `schemaVersion`, `agentToolContractVersion`, or additional field in
`ContractVersionVector` is permitted.

## 4. Capability inventory

The complete nine-capability inventory is:

| capability | capabilityKind | trusted validated value |
| --- | --- | --- |
| `retrieveVerifiedEvidence` | `deterministic_domain_service` | approved Domain `VerifiedFact[]` |
| `buildInitialPortraitRecord` | `deterministic_domain_service` | Domain `InitialPortraitRecord` |
| `extractUserPrinciple` | `llm_assisted_service` | Domain `UserPrinciple` projection |
| `detectTension` | `llm_assisted_service` | transient validated tension analysis |
| `generateCharlieResponse` | `llm_assisted_service` | Domain `CharliePosition` and `CharlieResponse` projections |
| `proposeDocumentDiff` | `llm_assisted_service` | Domain `DiffProposalResult` |
| `compareSemanticDrift` | `llm_assisted_service` | bound plain draft, Domain `SemanticDrift`, `SemanticFragment[]`, and per-fragment restoration outcomes |
| `buildDissentRecord` | `deterministic_domain_service` | Domain `DissentRecord` |
| `summarizePortraitShift` | `llm_assisted_service` | factual bound summary |

`computePortraitShift` remains the existing deterministic Domain function and
is not a tenth Agent capability. `FinalReviewService.reviewCharlieSignature` is
an independent service governed by the Final Review Contract.

Every executed logical capability receives its own
`CapabilityExecutionReceipt`, even when a single provider-neutral transport
request returns several Candidates. Application bundle operation identifiers
are transport/orchestration identifiers and are not extra Agent capabilities or
required capability receipts.

## 5. Capability rules

### 5.1 retrieveVerifiedEvidence

Input binds the verified content bundle and identifies an evidence card and the
allowed fact IDs. The service accepts only a Stage 2 `GatedContentAccess` with a
passed evaluation and a verified access branch, verifies the evaluation/access/
input binding and references, and returns only the human-approved Domain facts
exposed by that access object. Placeholder, failed-gate, missing, unapproved, or
mismatched content returns a typed error. Placeholder records are never
projected as `VerifiedFact`.

### 5.2 buildInitialPortraitRecord

Input is a previously validated prelude submission containing the three frozen
descriptor groups, selected stage, and the user's reason. Output is the existing
Domain `InitialPortraitRecord`. The function does not score, evaluate, add
runtime metadata, or modify state.

### 5.3 extractUserPrinciple

Only this capability is required to receive the current complete
`untrustedUserText`. The Candidate may transiently separate claim, reasoning,
qualifiers, exceptions, and minimal source spans. Post-validation projects only
the existing strict Domain `UserPrinciple`; reasoning and raw source spans are
not added to Domain or persisted. The result cannot contain personality labels.

### 5.4 detectTension

Input is minimized structured context: current and prior principles, relevant
Charlie positions, portrait facts, and precise/plain revision bindings. Output
is an Agent-owned transient analysis, not a competing persisted Domain entity.
It may classify the four approved relationship categories. Every item also
carries the non-scoring assessment `development` or `tension`; `contradiction`
is not an allowed value. This keeps ordinary development distinct from an
actual tension without making a judgment about the user.

### 5.5 generateCharlieResponse

Input uses the validated principle, tension analysis, current round and
manuscript binding, plus only the allowed evidence IDs. A richer Candidate may
separate position, acknowledgement, reservation, and question. The trusted
projection is the existing Domain `CharliePosition` and `CharlieResponse`.
Exactly one answerable question is required. No evidence outside the allowlist,
final verdict, state transition, simulated cognitive impairment, or unverified
book fact is allowed.

### 5.6 proposeDocumentDiff

The Candidate proposes either one local operation or `no_change`. A trusted
projection supplies the derived ID, time, `status=proposed`, and
`confirmedAt=null`; a model cannot supply trusted metadata. Every operation
binds `documentTarget`, current `baseRevisionId`, and a valid stable anchor.
Replace and delete require exact current old text; annotate does not modify text.
Stale binding returns `stale_revision`. Proposed text changes require later user
confirmation.

### 5.7 compareSemanticDrift

The `PlainSemanticReviewCandidateBundle` owns a `plainTextCandidate` transport
slot, the semantic comparison Candidate, and restoration outcomes. It is one
logical `compareSemanticDrift` capability, not a plain-rewrite or restoration
tenth capability. The result binds precise and not-yet-committed plain revision
IDs and projects the plain draft, existing Domain `SemanticDrift`, and existing
Domain `SemanticFragment[]`.

Every fragment has exactly one bundle-owned restoration outcome: either a
frozen, post-validated Domain `SemanticRestorationProposal`, or a typed
`unavailable` reason. The Candidate proposal binds a
trusted-projection-matched `fragmentId`, both baseline revisions, target plain
revision, source-text hash, stable plain-text anchor, replacement text,
`previewText.before/after`, `proposalHash`, and owned proposal/Candidate
versions. The validator independently resolves the anchor against the
just-produced plain draft, recomputes source and proposal hashes, reconstructs
the preview, applies text safety, then supplies trusted proposal ID, timestamp,
and `status=proposed`. Candidate self-report is never a validation result.

The frozen Domain lifecycle still allows `SemanticFragment.restorationProposalId`
only after the user-confirmed proposal has actually been applied. Stage 3
therefore binds the concrete trusted proposal to its unresolved fragment through
the atomic outcome's `fragmentId` and carries the proposal separately; it does
not use the old unconditional-null behavior to discard a safely producible
proposal. Stage 4 must set the Domain fragment link only through the frozen
confirmation/application path.

The Candidate `previewText.before/after` pair maps without loss to the frozen
Domain proposal's existing `beforePreview/afterPreview` fields; the Domain
Schema is unchanged. These values become committable only together in a
complete validated bundle. The plain draft is non-blank and passes the same
post-safety policy as other generated text. Every projected semantic-fragment
phrase must be a continuous NFC-normalized span of the bound precise revision;
invented source fragments are rejected. A safe proposal carries a concrete
trusted proposal ID; an unavailable outcome carries no fabricated proposal.

### 5.8 buildDissentRecord

Input contains an already validated Charlie position, User principle, focus,
and requested open/resolved status. Trusted application projection supplies the
record ID derived from the operation ID and the active safety policy; callers
cannot inject a persistent entity ID through business input. Output is the
existing Domain `DissentRecord`. The function does not score, infer personality,
create runtime metadata, or modify state.

### 5.9 summarizePortraitShift

Input includes the exact existing `PortraitShiftComparison` and allowed evidence
and revision identifiers. The capability may only summarize those deterministic
facts. It cannot recompute the comparison, introduce new facts, diagnose the
user, or describe a change as moral or psychological improvement.

## 6. Candidate to Validated Result

All LLM-assisted and Mock payloads follow the same trust pipeline:

```text
unknown response
  -> strict Candidate Schema
  -> request, revision, content, and evidence binding validation
  -> deterministic post-safety validation
  -> trusted metadata projection
  -> capability-owned Validated Result
```

Candidates cannot self-attest through `validationResult`,
`prohibitedClaimCheck`, or similar fields. Unknown keys are rejected. Validation
must reject at least:

- evidence outside the allowed set;
- prohibited claims or inferences;
- unauthorized quotations or any `internalExcerpt`;
- scoring, personality diagnosis, final judgment, or simulated impairment;
- stale or mismatched content and revision bindings;
- an invalid Diff target, anchor, old text, or more than one operation;
- a Charlie response without exactly one answerable question;
- invalid lengths, enum values, references, IDs, or version fields;
- a missing/duplicate fragment restoration outcome, stale proposal revision,
  invalid anchor/source hash/preview, or mismatched `proposalHash`.

A rejected Candidate is not a partial result, Session value, application event,
or receipt with a successful outcome.

## 7. Atomic bundles

`RoundAnalysisCandidateBundle` transports the principle, tension, Charlie
response, and Diff Candidates from one logical execution source. Each slot is
validated and may explicitly fall back independently. The application layer may
produce `ValidatedRoundAnalysisBundle` only when all required slots have a safe
Validated Result. No successful slot is exposed early.

The Round evidence boundary is shared across all four slots. In verified mode,
the extract/tension/Diff allowlists must be subsets of the human-verified facts
carried by the verified evidence context. In placeholder mode those committable
allowlists are empty; placeholder cards may guide deterministic Mock wording but
their IDs cannot be persisted as verified evidence references.

`PlainSemanticReviewCandidateBundle` transports the plain draft, semantic
comparison, and one restoration outcome per fragment.
`ValidatedPlainSemanticBundle` atomically contains the new plain revision
draft, bound `SemanticDrift`, `SemanticFragment[]`, all frozen proposal or typed
unavailable outcomes, and the applicable receipt. A partial plain revision,
fragment set, or proposal inventory is never exposed.

Bundle operation contexts bind the single future FSM operation. Child logical
capability contexts retain their own capability identifiers, fingerprints, and
receipts even when transport is shared.

## 8. IDs, determinism, and Mock rules

Trusted application code allocates entity IDs before projection. Stage 3 does
not expand Runtime `PersistentIdKind`. An entity ID is deterministically derived
from a trusted operation ID using:

```text
stage3:v1:<entityKind>:<zero-based ordinal>:<encodeURIComponent(operationId)>
```

Entity kinds are owned by Agent/application code. Candidate identities must
equal independently derived trusted projections; they cannot select or
override persisted IDs.

Mock semantic output is a pure function of validated business input, a frozen
Fixture, the Mock adapter version, and explicitly supplied trusted IDs. Ambient
time, randomness, request ID, session ID, and runtime attempt count do not
change text, Diff semantics, fragments, or other business results. Placeholder
Mock context remains explicitly placeholder and never claims an original-book
fact.

## 9. Error and fallback semantics

The exact common discriminated error vocabulary is:

- retryable: `timeout`, `rate_limited`, `network_error`, `invalid_output`,
  `schema_validation_failed`;
- terminal validation/binding: `safety_validation_failed`, `stale_revision`,
  `content_gate_not_passed`, `content_not_found`,
  `content_mode_not_verified`, `content_version_mismatch`,
  `evidence_not_allowed`, `idempotency_conflict`;
- terminal execution policy: `budget_exhausted`, `fallback_unavailable`.

`network_error` means an adapter call actually failed or returned that typed
technical error. A route that was never called and has no permitted fallback
uses `fallback_unavailable`; it is never mislabeled as a network failure.

Deterministic services either succeed deterministically or return a typed error.
Ordinary LLM-assisted slots may use an explicitly configured Mock or static
template fallback after a live technical or Candidate-validation failure. The
receipt preserves requested mode, actual resolved mode, outcome, and a required
fallback reason. Stale revision, content-binding, evidence-allowlist, and
idempotency failures are not hidden through role fallback. If a required slot
has no safe fallback, the complete bundle fails.

Final Review fallback is intentionally stricter and is defined only by the
Final Review Contract.

Every provider-neutral Agent call returns a discriminated `candidate` or
`error` execution envelope. Both branches carry the same trusted observation
shape: retry/repair counts, input/output tokens, latency, estimated cost, and
optional provider/model identity. Mock and no-call paths use the frozen zero
observation. Application code evaluates the actual observation after a call;
absolute excess fails, while base excess prevents the primary Candidate from
being committed and requires an explicit safe fallback.

## 10. Idempotency and state boundary

Within an available application idempotency record, equal request ID and input
fingerprint replays the same business commit; equal request ID with another
fingerprint returns `idempotency_conflict`. The approved deployment baseline has
no persistent server-side idempotency, so stage 3 does not claim cross-instance
provider exactly-once execution.

Agent services and adapters return suggestions and structured results only.
They cannot mutate `SessionState`, apply a Diff, send an FSM transition, or call
finalization. Future stage 4 consumes only complete Validated Results, bundle
outcomes, typed errors, and receipts frozen here.

## 11. Security and data minimization

`untrustedUserText` is an explicit field and is never executable instruction.
Only `extractUserPrinciple` receives the complete current submission. Other
capabilities use structured principles or an explicitly minimized excerpt when
strictly necessary. Stage 3 code does not log raw user text, private content,
Candidate payloads, prompts, or `internalExcerpt`.

No real provider SDK, provider secret, production Prompt, network model call,
MCP integration, `/api/agent`, UI, or deployment is part of this Contract.

## 12. Version 0.2.0 compatibility and recovery

This repair is **breaking** for Agent/PlainSemantic producers and consumers:
`agentContractVersion`, `compareSemanticDrift` Candidate/Result versions, the
Plain/Semantic Candidate Bundle version, and the Validated Plain/Semantic Bundle
version are `0.2.0`; restoration outcomes are required. The unchanged
bundle-owned plain-text Candidate remains independently versioned `0.1.0`. No
generic `schemaVersion` was added.

There is no persisted Stage 3 production Session data to migrate because Stage
4 persistence does not exist yet. Future editable recovery bound to Agent
Contract `0.1.0`, or a pre-repair in-flight Plain/Semantic operation, must be
rejected/interrupted and re-executed under `0.2.0`; code must not synthesize
missing outcomes or null proposal identities. Any future legacy COMPLETE
snapshot may only use the already-frozen explicit read-only compatibility path.
Candidate/event fingerprints include the owned versions, so late `0.1.0`
results are rejected rather than committed under `0.2.0`.
