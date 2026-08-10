# Final Review Contract 0.1.0

This document freezes the Stage 3 Final Review service boundary. The executable
source of truth is `src/final-review/` and its contract tests.

## Ownership and dependency direction

`FinalReviewService.reviewCharlieSignature` is an independent
`final_review_service`. It is outside the nine general Agent capabilities and
must never reuse `generateCharlieResponse` as its operation. The dependency
direction is:

```text
Domain signature types + Runtime RequestContext + Provenance receipt
  -> Final Review schemas, validation, ports, and projections
  -> application/orchestration
```

Domain, Runtime, Provenance, Finalization, Content, and Agent contracts do not
depend on Final Review. Final Review never writes `SessionState`.

## Version and payload boundary

The owned `finalReviewSchemaVersion` is `0.1.0`. It versions the business input,
Candidate, Validated Result, and Error contract. No generic `schemaVersion` is
introduced. Every signed/declined Candidate carries the exact
`finalReviewSchemaVersion`; a versionless Candidate is invalid.

`CharlieSignatureReviewInput` contains only current precise/plain revision IDs
and texts, allowed evidence IDs, open dissents, public content bundle identity,
and `finalReviewSchemaVersion`. Request metadata stays exclusively in the
separate Runtime `RequestContext`: requested mode, request/operation IDs,
prompt/adapter versions, stage identity, input fingerprint, attempt, and
revision/content bindings.

The 0.1.0 resource caps are executable constants: Candidate/Result/Error reason
or summary text is at most 2,000 UTF-16 code units; each precise/plain input text
is at most 12,000; every Final Review-owned array is at most 64 items; an
explicitly allowed quotation is at most 200 code units. These limits apply
before provider or fixture output can enter the validated pipeline.

The input carries evidence identifiers only. It cannot carry evidence prose,
verified facts, or `internalExcerpt`. `FinalReviewEvidenceResolver` resolves
those identifiers server-side. The production-shaped resolver accepts only a
Stage 2 `GatedContentAccess`: verified mode projects public `EvidenceCard`,
`VerifiedFact`, and curatorial interpretation Domain values from
`VerifiedContentAccess`; placeholder mode returns an explicit placeholder
context with no `VerifiedFact` field. Neither path imports or parses raw content
JSON.

Application parses the resolver projection and safety policy once and passes
that same pair as `FinalReviewTrustedExecutionInput` to
`reviewCharlieSignature(input, context, trustedExecution)`. The identical
values drive semantic fingerprinting, service execution, and result
revalidation. Resolver evidence IDs must exactly equal the ordered business
allowlist. A service or Mock must not resolve a second evidence projection or
substitute a constructor-owned safety policy.

Before hashing, application deep-clones and deep-freezes the parsed business
input, serializable review context, evidence context, and safety policy. The
service and post-validator receive that same immutable semantic snapshot;
`AbortSignal`, when present, remains separate from cloned business metadata.

## Trust boundary

A provider or fixture may produce only a `CharlieSignatureReviewCandidate` with
`status`, `reason`, and `evidenceIds`. Its strict schema rejects self-attested
validation or safety fields. The local post-validator independently checks:

- current revision and public content identity bindings;
- evidence IDs against the allowed set;
- prohibited claims and inferences;
- scoring, personality diagnosis, cognitive-impairment simulation, final
  rulings, `internalExcerpt`, and unauthorized quotations.

The validator rejects a complete source of at least 32 code units or any
continuous span longer than 200 code units copied without authorization from
the precise manuscript, plain manuscript, explicitly protected source text, or
allowed-quotation source. A quotation is accepted only when it exactly matches
an entry in `allowedQuotedText` and remains within the 200-unit cap. ASCII and
Chinese quotation marks, Markdown backticks, and Markdown blockquote lines are
all explicit quotation syntax under this rule. Candidate
evidence IDs must be a subset of both the business input's
allowed set and the resolver-produced trusted set; the two source sets must
agree before a Result can be constructed.

Only a passing Candidate becomes a `CharlieSignatureReviewResult` with a
validator-created `validationResult`. Only that Validated Result may project to
the existing Domain reviewed `SignatureReviewSnapshot`. Application code must
also call the pure `validateCharlieSignatureReviewResultBinding` boundary when
accepting a service result; it independently compares input, request context,
revision, content, version, and allowed evidence bindings and never treats the
Result's own `validationResult` flags as proof.

## Execution and degradation

The deterministic Mock service accepts fixed fixtures plus the caller's
single-source trusted execution input and can return either `signed` or
`declined`. Every service exposes a trusted read-only
`executionMode` and `adapterVersion`; the deterministic Mock service fixes them
to `mock` and `0.1.0`. Application preflight requires the operation and review
RequestContexts to bind that actual service adapter version, as well as requiring
route mode and actual service mode to agree. Candidate-producing provider ports
expose the same trusted adapter identity. The Mock service refuses a live
request. A live technical failure
produces the `unavailable` service outcome and may project only to the Domain
unavailable snapshot; it must never fall through to a Mock role decision.

Every attempt projects one `CapabilityExecutionReceipt`. Final Review receipts
omit `agentContractVersion` and set `resultSchemaVersion` to the exact
`finalReviewSchemaVersion`. The application layer must supply the actual
`resolvedMode`; a reviewed result requires `mock -> mock` or `live -> live`,
while an unavailable outcome requires `resolvedMode=unavailable`. The helper
rejects a live request mislabeled as a reviewed Mock execution. The application
layer supplies timestamps, while provider/token details come only from the
service outcome's trusted observation. The Final Review service itself owns no
clock, state, retry loop, idempotency record, or persistence.

Every provider port and service outcome carries a strict trusted execution
observation: network retries, structured repairs, input/output tokens, latency,
estimated cost in integer USD micros, and optional provider/model identifiers.
The deterministic Mock and any route that made no provider call use the frozen
all-zero observation. Receipt token usage, provider, model, and duration are
derived directly from the service outcome observation; callers cannot replace
them with planned-call estimates.

The error union includes the ten guide-mandated error codes plus terminal
`budget_exhausted` and `execution_unavailable`. Budget exhaustion is an explicit
non-retryable preflight or post-observation actual-budget failure and must never
be disguised as provider rate limiting or invalid output. A trusted route or
service that is unavailable before any network attempt, including an unknown
service throw without a structured outcome, uses non-retryable
`execution_unavailable`; only a structured service outcome may claim retryable
`network_error`.

## Stage 3 non-goals

There is no live provider implementation, model SDK, network call, production
prompt, `/api/agent`, FSM transition, persistence, UI, deployment, or Stage 4
work in this contract.
