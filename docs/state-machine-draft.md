# State Machine Draft

> `stateMachineContractVersion: 0.1.0`
> Status: canonical event inventory contracted; stage descriptors and critical paths proposed for final human approval; full FSM deferred to stage 4
> DRI: Codex（技术一致性）
> Final approver: 项目负责人

## 1. Canonical event catalogue

The stage-4 guide inventory is the only accepted runtime event vocabulary. There are no aliases or compatibility mappings.

User events:

- `START`
- `SET_PORTRAIT_DESCRIPTORS`
- `CHOOSE_INITIAL_PORTRAIT`
- `SUBMIT_INITIAL_REASON`
- `SUBMIT_RESPONSE`
- `SUBMIT_CLARIFICATION`
- `ACCEPT_DIFF`
- `REJECT_DIFF`
- `CHOOSE_FRAGMENT_PLACEMENT`
- `CHOOSE_FINAL_PORTRAIT`
- `SUBMIT_FINAL_REASON`
- `REQUEST_CHARLIE_SIGNATURE_REVIEW`
- `CONTINUE_WITHOUT_SIGNATURE_REVIEW`
- `RETRY_CHARLIE_SIGNATURE_REVIEW`
- `RETURN_TO_MANUSCRIPT_REVIEW`
- `SUBMIT_MANUSCRIPT_REVISION`
- `CANCEL_MANUSCRIPT_REVISION`
- `CHOOSE_DISPOSITION`

Agent or service result events:

- `ROUND_ANALYSIS_BUNDLE_RESOLVED`
- `ROUND_ANALYSIS_BUNDLE_FAILED`
- `PLAIN_SEMANTIC_BUNDLE_RESOLVED`
- `PLAIN_SEMANTIC_BUNDLE_FAILED`
- `POST_PLACEMENT_CHECK_SUCCEEDED`
- `PORTRAIT_SHIFT_COMPUTED`
- `PORTRAIT_SHIFT_SUMMARY_SUCCEEDED`
- `CHARLIE_SIGNATURE_REVIEW_RESOLVED`
- `CHARLIE_SIGNATURE_REVIEW_FAILED`

System events:

- `ADVANCE`
- `RETRY_NETWORK`
- `REPAIR_STRUCTURED_OUTPUT`
- `USE_MOCK_FALLBACK`
- `USE_STATIC_TEMPLATE`
- `BUILD_FINAL_ENVELOPE`
- `FINALIZE_SESSION`

Failure events:

- `AGENT_TIMEOUT`
- `AGENT_RATE_LIMITED`
- `AGENT_NETWORK_ERROR`
- `AGENT_INVALID_OUTPUT`
- `AGENT_PROHIBITED_CLAIM`
- `CONTENT_NOT_FOUND`
- `CONTENT_VERSION_MISMATCH`
- `IMAGE_LOAD_FAILED`
- `PERSISTENCE_FAILED`

`START_NEW_SESSION` is an application command, not an ExperienceEvent. The runtime Schema rejects it along with every legacy synonym.

## 2. Stage catalogue

The following descriptors propose stage metadata without implementing the stage-4 machine. Every `allowedEvents` entry is drawn from the canonical catalogue above.

| Stage | Kind | Entry action | Allowed events | Success target | Failure target | Timeout policy | Refresh policy |
|---|---|---|---|---|---|---|---|
| `WELCOME` | `user_interactive` | `showWelcome` | `START` | `PORTRAIT_PRELUDE` | `WELCOME` | `none` | `restore_interactive` |
| `PORTRAIT_PRELUDE` | `user_interactive` | `loadPortraitPrelude` | `SET_PORTRAIT_DESCRIPTORS`, `ADVANCE`, `IMAGE_LOAD_FAILED` | `PORTRAIT_CHOICE` | `PORTRAIT_PRELUDE` | `none` | `restore_interactive` |
| `PORTRAIT_CHOICE` | `user_interactive` | `prepareInitialPortraitChoice` | `CHOOSE_INITIAL_PORTRAIT`, `SUBMIT_INITIAL_REASON`, `ADVANCE` | `ROUND_1_PAST_SELF` | `PORTRAIT_CHOICE` | `none` | `restore_interactive` |
| `ROUND_1_PAST_SELF` | `user_interactive` | `prepareRound1` | `SUBMIT_RESPONSE`, `SUBMIT_CLARIFICATION`, `ROUND_ANALYSIS_BUNDLE_RESOLVED`, `ROUND_ANALYSIS_BUNDLE_FAILED`, `RETRY_NETWORK`, `REPAIR_STRUCTURED_OUTPUT`, `USE_MOCK_FALLBACK`, `USE_STATIC_TEMPLATE`, `AGENT_TIMEOUT`, `AGENT_RATE_LIMITED`, `AGENT_NETWORK_ERROR`, `AGENT_INVALID_OUTPUT`, `AGENT_PROHIBITED_CLAIM`, `CONTENT_NOT_FOUND`, `CONTENT_VERSION_MISMATCH` | `ROUND_1_DIFF` | `ROUND_1_PAST_SELF` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_restore` |
| `ROUND_1_DIFF` | `user_interactive` | `showRound1Diff` | `ACCEPT_DIFF`, `REJECT_DIFF` | `ROUND_2_FORECAST` | `ROUND_1_DIFF` | `none` | `restore_interactive` |
| `ROUND_2_FORECAST` | `user_interactive` | `prepareRound2` | `SUBMIT_RESPONSE`, `SUBMIT_CLARIFICATION`, `ROUND_ANALYSIS_BUNDLE_RESOLVED`, `ROUND_ANALYSIS_BUNDLE_FAILED`, `RETRY_NETWORK`, `REPAIR_STRUCTURED_OUTPUT`, `USE_MOCK_FALLBACK`, `USE_STATIC_TEMPLATE`, `AGENT_TIMEOUT`, `AGENT_RATE_LIMITED`, `AGENT_NETWORK_ERROR`, `AGENT_INVALID_OUTPUT`, `AGENT_PROHIBITED_CLAIM`, `CONTENT_NOT_FOUND`, `CONTENT_VERSION_MISMATCH` | `ROUND_2_DIFF` | `ROUND_2_FORECAST` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_restore` |
| `ROUND_2_DIFF` | `user_interactive` | `showRound2Diff` | `ACCEPT_DIFF`, `REJECT_DIFF` | `ROUND_3_RELATIONSHIP` | `ROUND_2_DIFF` | `none` | `restore_interactive` |
| `ROUND_3_RELATIONSHIP` | `user_interactive` | `prepareRound3` | `SUBMIT_RESPONSE`, `SUBMIT_CLARIFICATION`, `ROUND_ANALYSIS_BUNDLE_RESOLVED`, `ROUND_ANALYSIS_BUNDLE_FAILED`, `RETRY_NETWORK`, `REPAIR_STRUCTURED_OUTPUT`, `USE_MOCK_FALLBACK`, `USE_STATIC_TEMPLATE`, `AGENT_TIMEOUT`, `AGENT_RATE_LIMITED`, `AGENT_NETWORK_ERROR`, `AGENT_INVALID_OUTPUT`, `AGENT_PROHIBITED_CLAIM`, `CONTENT_NOT_FOUND`, `CONTENT_VERSION_MISMATCH` | `ROUND_3_DIFF` | `ROUND_3_RELATIONSHIP` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_restore` |
| `ROUND_3_DIFF` | `user_interactive` | `showRound3Diff` | `ACCEPT_DIFF`, `REJECT_DIFF` | `PLAIN_REWRITE` | `ROUND_3_DIFF` | `none` | `restore_interactive` |
| `MANUSCRIPT_REVISION` | `user_interactive` | `checkpointAndHideSignatureReview` | `SUBMIT_MANUSCRIPT_REVISION`, `CANCEL_MANUSCRIPT_REVISION` | `PLAIN_REWRITE` if changed; `FINAL_SIGNATURE` if cancelled or unchanged | `MANUSCRIPT_REVISION` | `none` | `restore_manuscript_revision_checkpoint` |
| `PLAIN_REWRITE` | `system_transient` | `startPlainSemanticOrchestration` | `PLAIN_SEMANTIC_BUNDLE_RESOLVED`, `PLAIN_SEMANTIC_BUNDLE_FAILED`, `RETRY_NETWORK`, `REPAIR_STRUCTURED_OUTPUT`, `USE_MOCK_FALLBACK`, `USE_STATIC_TEMPLATE`, `AGENT_TIMEOUT`, `AGENT_RATE_LIMITED`, `AGENT_NETWORK_ERROR`, `AGENT_INVALID_OUTPUT`, `AGENT_PROHIBITED_CLAIM`, `CONTENT_NOT_FOUND`, `CONTENT_VERSION_MISMATCH` | `SEMANTIC_REVIEW` | `PLAIN_REWRITE` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_retry` |
| `SEMANTIC_REVIEW` | `system_transient` | `commitValidatedPlainSemanticBundle` | `ADVANCE`, `PERSISTENCE_FAILED` | `SEMANTIC_PLACEMENT` when fragments exist; otherwise `PORTRAIT_REASSEMBLY` or typed return target | `PLAIN_REWRITE` | `transactional_no_partial_commit` | `invalidate_operation_then_retry` |
| `SEMANTIC_PLACEMENT` | `user_interactive` | `startOrResumePlacementBatch` | `CHOOSE_FRAGMENT_PLACEMENT`, `POST_PLACEMENT_CHECK_SUCCEEDED`, `ADVANCE`, `PERSISTENCE_FAILED` | `PORTRAIT_REASSEMBLY` or typed return target | `SEMANTIC_PLACEMENT` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_restore_batch` |
| `PORTRAIT_REASSEMBLY` | `user_interactive` | `preparePortraitComparison` | `CHOOSE_FINAL_PORTRAIT`, `SUBMIT_FINAL_REASON`, `PORTRAIT_SHIFT_COMPUTED`, `PORTRAIT_SHIFT_SUMMARY_SUCCEEDED`, `RETRY_NETWORK`, `REPAIR_STRUCTURED_OUTPUT`, `USE_MOCK_FALLBACK`, `USE_STATIC_TEMPLATE`, `AGENT_TIMEOUT`, `AGENT_RATE_LIMITED`, `AGENT_NETWORK_ERROR`, `AGENT_INVALID_OUTPUT`, `AGENT_PROHIBITED_CLAIM`, `IMAGE_LOAD_FAILED` | `FINAL_SIGNATURE` | `PORTRAIT_REASSEMBLY` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_restore` |
| `FINAL_SIGNATURE` | `user_interactive` | `showReadOnlySignatureReview` | `REQUEST_CHARLIE_SIGNATURE_REVIEW`, `CHARLIE_SIGNATURE_REVIEW_RESOLVED`, `CHARLIE_SIGNATURE_REVIEW_FAILED`, `RETRY_CHARLIE_SIGNATURE_REVIEW`, `CONTINUE_WITHOUT_SIGNATURE_REVIEW`, `RETURN_TO_MANUSCRIPT_REVIEW`, `RETRY_NETWORK`, `REPAIR_STRUCTURED_OUTPUT`, `AGENT_TIMEOUT`, `AGENT_RATE_LIMITED`, `AGENT_NETWORK_ERROR`, `AGENT_INVALID_OUTPUT`, `AGENT_PROHIBITED_CLAIM`, `CONTENT_NOT_FOUND`, `CONTENT_VERSION_MISMATCH` | `FINAL_DISPOSITION` or `MANUSCRIPT_REVISION` | remain in `FINAL_SIGNATURE` unless returning to manuscript review | `operation_timeout_to_unavailable` | `invalidate_operation_then_restore_attempts` |
| `FINAL_DISPOSITION` | `user_interactive` | `prepareDisposition` | `CHOOSE_DISPOSITION`, `BUILD_FINAL_ENVELOPE` | `FINALIZING` only when eligible | `FINAL_DISPOSITION` | `none` | `restore_interactive` |
| `FINALIZING` | `system_transient` | `startAtomicEnvelopePersistence` | `FINALIZE_SESSION`, `PERSISTENCE_FAILED` | `COMPLETE` | `FINAL_DISPOSITION` | `operation_timeout_with_rollback` | `invalidate_operation_and_report_incomplete` |
| `COMPLETE` | `terminal` | `showReadOnlyEnvelope` | none | none | none | `none` | `restore_read_only` |

## 3. Revision return path

```text
FINAL_SIGNATURE
→ RETURN_TO_MANUSCRIPT_REVIEW
→ MANUSCRIPT_REVISION
→ SUBMIT_MANUSCRIPT_REVISION
→ PLAIN_REWRITE
→ SEMANTIC_REVIEW
→ SEMANTIC_PLACEMENT (when fragments exist)
→ FINAL_SIGNATURE
```

Accepting the return event checkpoints the prior signature status/review, hides the active review, preserves its fingerprint attempt budget, and enters `MANUSCRIPT_REVISION`. Cancellation or NFC-normalized no-change submission creates no revision and restores that same-bound checkpoint without changing the budget. An actual precise-text change permanently discards the checkpoint and follows the invalidation rules in [`domain-contract.md`](./domain-contract.md#8-manuscript-revision-return-path).

A pending signature operation cannot be checkpointed: its active operation must first be cancelled/invalidated so any late result fails the operation guard. The future application reducer must commit the Domain slice, `stage`, a rotated `stageInstanceId`, cleared/invalidation metadata for `runtime.activeOperation`, `stateRevision`, and the transition idempotency record in one persistence transaction. The stage 1 pure functions return `nextStage` plus the Domain slice for that composition; they do not claim to implement this stage 4 transaction.

## 4. Atomic result boundaries reserved for stage 3/4

- Round Analysis exposes one `ROUND_ANALYSIS_BUNDLE_RESOLVED` event carrying the complete validated bundle.
- Plain Rewrite plus initial Semantic Review exposes one `PLAIN_SEMANTIC_BUNDLE_RESOLVED` event carrying the complete validated bundle.
- There is no event that commits only a new plain revision without its bound SemanticDrift.
- Supplier Candidates and raw responses are not FSM events.

For the Plain/Semantic path, receipt of the complete validated bundle may only stage that value in the application operation boundary and move into the transient commit step; it does not write any Domain manuscript or semantic field. The single persistence/reducer transaction then writes the plain revision, current drift, fragments, revision entry, and receipts together. A refresh or failure before that commit discards the staged value and retries; it cannot expose a Session containing only the plain revision.

## 5. Finalization and application commands

`FINAL_DISPOSITION` handles `BUILD_FINAL_ENVELOPE` by calling the single finalization evaluator before entering `FINALIZING`. `FINALIZING` owns the atomic envelope persistence operation and reaches `COMPLETE` only through `FINALIZE_SESSION`.

`START_NEW_SESSION` is an application command that creates a new Session ID. It is not an event that mutates `COMPLETE`.

## 6. Open issues

Event payloads, executable guards, and machine-library selection remain deferred to stage 4. Stage 3 must first freeze validated bundle payloads.
