# Domain Contract

> `domainContractVersion: 0.2.0`
> Status: draft for final human approval
> DRI: Codex（技术一致性）
> Final approver: 项目负责人

## 1. Authority and dependency boundary

Product meaning comes from [`scope-freeze.md`](./scope-freeze.md). This document is the sole home for pure domain entities and invariants. Domain code must not import UI, Next.js, model SDKs, Agent adapters, supplier responses, `FinalReviewService`, application orchestration, or the FSM implementation.

Runtime and provenance may compose Domain values. Domain does not depend on their concrete implementations; `SessionState` exposes typed composition slots for configuration, runtime state, provenance, and the generated envelope.

### 1.1 Executable type inventory

The runtime Schema files below are the executable source of truth; this document owns their product meaning and invariants.

| Surface | Required stage 1 types | Canonical Schema / type source |
|---|---|---|
| Experience | `ExperienceStage`, `StageKind`, `CharlieStage`, `ExperienceEvent`, `UserExperienceEvent`, and `ApplicationOperationResultEvent` | [`experience.schema.ts`](../src/domain/schemas/experience.schema.ts), [`experience.ts`](../src/domain/contracts/experience.ts) |
| Portrait | `PortraitPrelude`, `InitialPortraitChoice`, `FinalPortraitChoice`, `PortraitDescriptor`, `PortraitShiftComparison`, `InitialPortraitRecord` | [`portrait.schema.ts`](../src/domain/schemas/portrait.schema.ts), [`portrait.ts`](../src/domain/contracts/portrait.ts) |
| Manuscript | `ManuscriptState`, `ManuscriptRevisionIntent`, `RevisionEntry`, `DocumentDiff`, `DiffProposalResult`, `DocumentTarget` | [`manuscript.schema.ts`](../src/domain/schemas/manuscript.schema.ts), [`manuscript.ts`](../src/domain/contracts/manuscript.ts) |
| Evidence/content semantics | `EvidenceCard`, `VerifiedFact`, `CuratorialInterpretation`, `OriginalInteraction`, `UserPrinciple`, `CharliePosition`, `CharlieResponse`, `DissentRecord` | [`evidence.schema.ts`](../src/domain/schemas/evidence.schema.ts), [`evidence.ts`](../src/domain/contracts/evidence.ts) |
| Semantic review | `SemanticDrift`, `SemanticFragment`, `SemanticFragmentPlacement`, `SemanticPlacementBatch`, `SemanticRestorationProposal`, `BouquetEntry` | [`semantic.schema.ts`](../src/domain/schemas/semantic.schema.ts), [`semantic.ts`](../src/domain/contracts/semantic.ts) |
| Text anchor | `StableTextAnchor` | [`stable-text-anchor.schema.ts`](../src/domain/text/stable-text-anchor.schema.ts), [`stable-text-anchor.ts`](../src/domain/text/stable-text-anchor.ts) |
| Signature/disposition | `CurrentCharlieSignatureStatus`, `SignatureReviewSnapshot`, `SignatureReviewAttemptState`, `SignatureReviewCheckpoint`, `FutureCharlieSignatureStatus`, `FinalDisposition` | [`signature.schema.ts`](../src/domain/schemas/signature.schema.ts), [`signature.ts`](../src/domain/contracts/signature.ts) |
| Aggregate/snapshot | `SessionState`, `FinalEnvelope` | [`session.schema.ts`](../src/domain/schemas/session.schema.ts), [`session.ts`](../src/domain/contracts/session.ts), [`final-envelope.schema.ts`](../src/domain/schemas/final-envelope.schema.ts), [`final-envelope.ts`](../src/domain/contracts/final-envelope.ts) |

The Domain aggregate uses generic composition slots. The application layer binds them to concrete Runtime/Provenance types; `src/domain` neither imports those layers nor substitutes unvalidated supplier data into a slot.

## 2. Core identifiers and stages

All persisted identifiers are non-empty opaque strings. Time values are ISO-8601 strings supplied by `Clock`; domain functions do not read the system clock. IDs are supplied by `IdGenerator`; domain functions do not create random IDs.

`CharlieStage` is `early | peak | futureFacing`. `futureFacing` is a frozen product literal and a documented exception to the general JSON-enum naming rule.

`InitialPortraitChoice` is limited to the three Charlie stages. `FinalPortraitChoice` adds `all_three | no_unique_answer`.

`PortraitShiftComparison` is a discriminated union:

- `comparisonKind=comparable` has concrete initial/final included-stage arrays;
- `comparisonKind=no_unique_answer` has `finalIncludedStages=null`, `newlyIncludedStages=[]`, and `excludedStages=[]`.

`no_unique_answer` must never be converted into a fabricated stage set.

## 3. Content provenance

`ContentItem` is discriminated by the frozen product-category literals:

- `VERIFIED_FACT`;
- `CURATORIAL_INTERPRETATION`;
- `ORIGINAL_INTERACTION`.

The three variants have different required fields and cannot be parsed as one another. Evidence cards reference verified identifiers; Domain does not invent source text.

## 4. Manuscript and revisions

`ManuscriptState` maintains `preciseText/preciseRevisionId` and `plainText/plainRevisionId` independently. A plain revision may be absent before `PLAIN_REWRITE`.

`DocumentTarget` is `precise_text | plain_text | margin_note`. `DocumentDiff` is discriminated by `operation`:

| Operation | Legal target | Required operation fields |
|---|---|---|
| `insert` | `precise_text`, `plain_text` | `newText` |
| `replace` | `precise_text`, `plain_text` | `oldText`, `oldTextHash`, `newText` |
| `delete` | `precise_text`, `plain_text` | `oldText`, `oldTextHash` |
| `annotate` | any `DocumentTarget` | `annotationText` |

Shared fields include `id`, `baseRevisionId`, `documentTarget`, `targetAnchor`, `reason`, `evidenceIds`, `principleIds`, `status`, `createdAt`, and `confirmedAt`.

Rules:

1. Diff status is `proposed | accepted | rejected`.
2. Only a `proposed` Diff bound to the current target revision and matching anchor/hash can be accepted or rejected.
3. An accepted or rejected Diff cannot be processed again.
4. A rejected proposal remains an audit record but never becomes a `RevisionEntry`.
5. `DiffProposalResult` is either `{ kind: "diff", diff }` or `{ kind: "no_change", reason }`; no-change is not an empty Diff.
6. Applying a text-changing Diff creates exactly one revision. Annotation does not silently rewrite正文。

Processed accepted/rejected proposals are retained in `ManuscriptState.diffAudit`; `pendingDiff` remains the single unresolved proposal slot.

## 5. StableTextAnchor

The canonical definition is in [`naming-contract.md`](./naming-contract.md#stabletextanchor). The persisted field is `stableTextAnchorSchemaVersion`; no second `anchorVersion` alias exists.

Anchors use NFC-normalized UTF-8 text, Unicode code-point indices, inclusive start and exclusive end. UTF-16 code-unit offsets are display-layer values only and cannot be persisted as formal anchors. A rebase succeeds only if the frozen text and contexts identify exactly one target; zero or multiple matches make the anchor stale.

## 6. Semantic review and placement

`SemanticDrift.status` is `current | stale | placement_in_progress`. Every drift preserves the revision pair it analyzed; only `current` must match the Session's current precise/plain revisions. A stale drift keeps its old binding for auditability.

`SemanticFragmentPlacement` is:

- `restored_to_plain_text`;
- `saved_as_margin_note`;
- `placed_in_bouquet`.

`SemanticPlacementBatch` freezes baseline precise/plain revisions, tracks `workingPlainRevisionId`, decisions, confirmed restoration proposal IDs, and status `in_progress | checking_consistency | completed | invalidated`.

`saved_as_margin_note` and `placed_in_bouquet` are confirmed by the placement choice itself. `restored_to_plain_text` is only a direction choice: it requires a frozen, displayed, explicitly confirmed `SemanticRestorationProposal`. The proposal contains restoration text, a `StableTextAnchor`, before/after preview, `proposalHash`, and `proposalVersion`. It may be applied only while its revision, anchor, text hashes, and proposal hash still match. Otherwise it becomes `stale`; guessing a replacement position is forbidden. This path never creates a second pending `DocumentDiff`.

The proposed `proposalHash` rule for this `0.1.0` draft is SHA-256 over RFC 8785 canonical JSON UTF-8 bytes. Its semantic payload is: proposal version, fragment ID, baseline precise/plain revision IDs, target plain revision ID, source plain-text hash, the complete StableTextAnchor, NFC replacement text, and NFC before/after previews. Transport metadata, timestamps, status, and confirmation metadata are excluded. Because the guide requires a hash but does not prescribe this canonical payload, final human approval of the draft also approves this specific rule.

For proposal version `0.1.0`, `beforePreview` and `afterPreview` are the complete NFC-normalized working plain text before and after the proposed replacement. The UI may display a focused diff or excerpt derived from them, but the persisted proposal cannot replace these frozen values with a display-only excerpt.

Within a placement batch, each valid restoration may create a new working plain revision without stopping the remaining decisions. After all decisions, one bounded consistency check creates a new `SemanticDrift=current` for the final revision pair and must not create new fragments.

## 7. Signature state

`CurrentCharlieSignatureStatus` is `hidden | pending | signed | declined | unavailable | not_requested`. These values are not interchangeable.

`FutureCharlieSignatureStatus` is the literal `blank`.

`SignatureReviewSnapshot` stores only an already validated signed/declined projection or a structured unavailable summary. Supplier raw responses, Candidates, and full service errors are forbidden in Domain.

`SignatureReviewAttemptState` persists `requestedMode`, `inputFingerprint`, `attemptCount`, `maxAttempts`, `lastRequestId`, and `lastFailureCode`. For live review, `maxAttempts` is exactly `2`: the initial business request plus one manual retry opened only by a technical failure that produced `unavailable`. It does not replace `ActiveOperation.attempt`. A bounded network retry or structured-output repair within one business request is Runtime operation recovery and does not increment this Domain counter.

The fingerprint includes requested mode, both revisions, content-bundle identity, and `finalReviewSchemaVersion`; mock and live therefore cannot share an attempt state. Attempt count survives refresh. `signed` and `declined` close the same-fingerprint request path. An exhausted fingerprint cannot request again; `unavailable` remains `unavailable` and may continue to disposition. `not_requested` is produced only by a user skip before any request. A legitimate change to either revision, the content binding, or `finalReviewSchemaVersion` creates a new fingerprint and attempt state after the new double-revision semantic path completes.

## 8. Manuscript revision return path

Accepting `RETURN_TO_MANUSCRIPT_REVIEW` and entering `MANUSCRIPT_REVISION` atomically changes the active signature status to `hidden` and removes `currentCharlieSignatureReview` from the active signature flow. It creates one typed checkpoint containing the prior active status/review binding, usable only by cancellation or a no-change submission; the original `SignatureReviewAttemptState` remains unchanged.

`MANUSCRIPT_REVISION` edits only `precise_text`.

- If the user cancels or submits text equal to the original NFC-normalized precise text: no revision ID or empty `RevisionEntry` is created; SemanticDrift and other revision-bound results remain current; restore the checkpointed signature status/review and preserve the exact attempt count and remaining budget, then clear the checkpoint.
- If precise text changes: create a new precise revision and `RevisionEntry`; permanently discard the checkpoint; invalidate or stale the prior plain revision, drift, placement batch, unfinished restoration proposals, signature review, and other revision-bound results; then follow `PLAIN_REWRITE → SEMANTIC_REVIEW → SEMANTIC_PLACEMENT` when fragments exist. Only after the new double revision is available may a new fingerprint and fresh attempt state be created before returning to `FINAL_SIGNATURE`.

`FINAL_SIGNATURE` itself is read-only.

## 9. Final disposition and envelope

`FinalDisposition` is `future_reference | present_record | unfinished`. `unfinished` still represents a completed experience snapshot.

`FinalEnvelope` is immutable after generation. It contains product-semantic data and generic slots for execution receipts and the contract version vector, allowing later layers to bind provenance without creating a Domain dependency on Runtime or Agent services. It must not include a fabricated Session-level resolved execution mode.

## 10. Session invariants

1. Initial portrait choice cannot be `all_three` or `no_unique_answer`.
2. Precise/plain revisions cannot be substituted for one another.
3. Revision-bound results must match the current revision pair.
4. A pending Diff blocks finalization.
5. All fragments must have valid placements before finalization.
6. Open dissents may remain.
7. COMPLETE snapshots are read-only.
8. `START_NEW_SESSION` is an application command that creates a new ID; it does not mutate the old COMPLETE Session.
9. Domain reducers accept only validated domain/application events, never supplier responses or unvalidated Candidates.

## 11. Open issues

- The `proposalHash` canonical payload above is proposed as part of this draft and awaits final human approval.
- Later Agent/Final Review service payloads remain intentionally unfrozen until stage 3.

## 12. Stage-4 entry compatibility

Domain Contract `0.2.0` is a breaking correction to the public Session-event
API: supplier retry, repair, fallback, timeout, rate-limit, invalid-output, and
raw content/network errors are no longer `ExperienceEvent` values. They have no
aliases or migration mapping. Application orchestration must emit the matching
operation-level resolved/failed event instead.

The persisted `SessionState` shape and `sessionSchemaVersion=0.1.0` are
unchanged because Session snapshots do not persist an event queue. A recovered
in-flight operation is invalidated under the Runtime Contract; a late event
using the pre-repair vocabulary or Application Orchestration Contract `0.1.0`
is rejected as stale/incompatible rather than migrated.
