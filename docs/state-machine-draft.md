# State Machine Contract

> `stateMachineContractVersion: 0.3.0`
> Status: frozen for Stage 5 implementation
> DRI: Codex（技术一致性）
> Final approver: 项目负责人
> Stage 5 approval: project owner, 2026-08-09

Version `0.3.0` accepts the G2 multi-descriptor portrait collection and the G4
composed FinalEnvelope Schema. No public event or stage literal was added.

## 1. Canonical event catalogue

The stage-4 guide inventory is the only accepted runtime event vocabulary. There are no aliases or compatibility mappings.

User events:

- `START`
- `SET_PORTRAIT_DESCRIPTORS`
- `CHOOSE_INITIAL_PORTRAIT`
- `SUBMIT_INITIAL_REASON`
- `SUBMIT_RESPONSE`
- `SUBMIT_CLARIFICATION`
- `CONTINUE_WITHOUT_CLARIFICATION`
- `ACCEPT_DIFF`
- `REJECT_DIFF`
- `CHOOSE_FRAGMENT_PLACEMENT`
- `CONFIRM_SEMANTIC_RESTORATION_PROPOSAL`
- `REJECT_SEMANTIC_RESTORATION_PROPOSAL`
- `CHOOSE_FINAL_PORTRAIT`
- `SUBMIT_FINAL_REASON`
- `CONTINUE_WITHOUT_FINAL_REASON`
- `REQUEST_CHARLIE_SIGNATURE_REVIEW`
- `CONTINUE_WITHOUT_SIGNATURE_REVIEW`
- `RETRY_CHARLIE_SIGNATURE_REVIEW`
- `RETURN_TO_MANUSCRIPT_REVIEW`
- `SUBMIT_MANUSCRIPT_REVISION`
- `CANCEL_MANUSCRIPT_REVISION`
- `CHOOSE_DISPOSITION`

Application operation result events:

- `ROUND_ANALYSIS_BUNDLE_RESOLVED`
- `ROUND_ANALYSIS_BUNDLE_FAILED`
- `PLAIN_SEMANTIC_BUNDLE_RESOLVED`
- `PLAIN_SEMANTIC_BUNDLE_FAILED`
- `POST_PLACEMENT_CHECK_SUCCEEDED`
- `POST_PLACEMENT_CHECK_FAILED`
- `PORTRAIT_SHIFT_COMPUTED`
- `PORTRAIT_SHIFT_SUMMARY_RESOLVED`
- `PORTRAIT_SHIFT_SUMMARY_FAILED`
- `CHARLIE_SIGNATURE_REVIEW_RESOLVED`
- `CHARLIE_SIGNATURE_REVIEW_FAILED`
- `FINAL_ENVELOPE_PERSISTED`
- `FINAL_ENVELOPE_PERSIST_FAILED`

Supplier retry, repair, fallback, timeout, rate-limit, invalid-output, content
lookup, and raw network details are orchestration concerns. They are mapped to
the operation-level resolved/failed events above with a typed failure reason;
they are never Session events. `ADVANCE`, `BUILD_FINAL_ENVELOPE`, and
`FINALIZE_SESSION` are reducer/entry-action implementation details, not public
events. Image loading is a stage-5 UI fallback and does not enter the Session
FSM.

`START_NEW_SESSION` is an application command, not an ExperienceEvent. The runtime Schema rejects it along with every legacy synonym.

## 2. Stage catalogue

The following descriptors propose stage metadata without implementing the stage-4 machine. Every `allowedEvents` entry is drawn from the canonical catalogue above.

| Stage | Kind | Entry action | Allowed events | Success target | Failure target | Timeout policy | Refresh policy |
|---|---|---|---|---|---|---|---|
| `WELCOME` | `user_interactive` | `showWelcome` | `START` | `PORTRAIT_PRELUDE` | `WELCOME` | `none` | `restore_interactive` |
| `PORTRAIT_PRELUDE` | `user_interactive` | `loadPortraitPrelude` | `SET_PORTRAIT_DESCRIPTORS` | `PORTRAIT_CHOICE` | `PORTRAIT_PRELUDE` | `none` | `restore_interactive` |
| `PORTRAIT_CHOICE` | `user_interactive` | `prepareInitialPortraitChoice` | `CHOOSE_INITIAL_PORTRAIT`, `SUBMIT_INITIAL_REASON` | `ROUND_1_PAST_SELF` | `PORTRAIT_CHOICE` | `none` | `restore_interactive` |
| `ROUND_1_PAST_SELF` | `user_interactive` | `prepareRound1` | `SUBMIT_RESPONSE`, `SUBMIT_CLARIFICATION`, `CONTINUE_WITHOUT_CLARIFICATION`, `ROUND_ANALYSIS_BUNDLE_RESOLVED`, `ROUND_ANALYSIS_BUNDLE_FAILED` | `ROUND_1_DIFF` | `ROUND_1_PAST_SELF` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_restore` |
| `ROUND_1_DIFF` | `user_interactive` | `showRound1Diff` | `ACCEPT_DIFF`, `REJECT_DIFF` | `ROUND_2_FORECAST` | `ROUND_1_DIFF` | `none` | `restore_interactive` |
| `ROUND_2_FORECAST` | `user_interactive` | `prepareRound2` | `SUBMIT_RESPONSE`, `SUBMIT_CLARIFICATION`, `CONTINUE_WITHOUT_CLARIFICATION`, `ROUND_ANALYSIS_BUNDLE_RESOLVED`, `ROUND_ANALYSIS_BUNDLE_FAILED` | `ROUND_2_DIFF` | `ROUND_2_FORECAST` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_restore` |
| `ROUND_2_DIFF` | `user_interactive` | `showRound2Diff` | `ACCEPT_DIFF`, `REJECT_DIFF` | `ROUND_3_RELATIONSHIP` | `ROUND_2_DIFF` | `none` | `restore_interactive` |
| `ROUND_3_RELATIONSHIP` | `user_interactive` | `prepareRound3` | `SUBMIT_RESPONSE`, `SUBMIT_CLARIFICATION`, `CONTINUE_WITHOUT_CLARIFICATION`, `ROUND_ANALYSIS_BUNDLE_RESOLVED`, `ROUND_ANALYSIS_BUNDLE_FAILED` | `ROUND_3_DIFF` | `ROUND_3_RELATIONSHIP` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_restore` |
| `ROUND_3_DIFF` | `user_interactive` | `showRound3Diff` | `ACCEPT_DIFF`, `REJECT_DIFF` | `PLAIN_REWRITE` | `ROUND_3_DIFF` | `none` | `restore_interactive` |
| `MANUSCRIPT_REVISION` | `user_interactive` | `checkpointAndHideSignatureReview` | `SUBMIT_MANUSCRIPT_REVISION`, `CANCEL_MANUSCRIPT_REVISION` | `PLAIN_REWRITE` if changed; `FINAL_SIGNATURE` if cancelled or unchanged | `MANUSCRIPT_REVISION` | `none` | `restore_manuscript_revision_checkpoint` |
| `PLAIN_REWRITE` | `system_transient` | `startPlainSemanticOrchestration` | `PLAIN_SEMANTIC_BUNDLE_RESOLVED`, `PLAIN_SEMANTIC_BUNDLE_FAILED` | `SEMANTIC_REVIEW` | `PLAIN_REWRITE` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_retry` |
| `SEMANTIC_REVIEW` | `system_transient` | `verifyCommittedPlainSemanticBundle` | none | `SEMANTIC_PLACEMENT` when fragments exist; otherwise `PORTRAIT_REASSEMBLY` or typed return target | `PLAIN_REWRITE` | `transactional_no_partial_commit` | `invalidate_operation_then_retry` |
| `SEMANTIC_PLACEMENT` | `user_interactive` | `startOrResumePlacementBatch` | `CHOOSE_FRAGMENT_PLACEMENT`, `CONFIRM_SEMANTIC_RESTORATION_PROPOSAL`, `REJECT_SEMANTIC_RESTORATION_PROPOSAL`, `POST_PLACEMENT_CHECK_SUCCEEDED`, `POST_PLACEMENT_CHECK_FAILED` | `PORTRAIT_REASSEMBLY` or typed return target | `SEMANTIC_PLACEMENT` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_restore_batch` |
| `PORTRAIT_REASSEMBLY` | `user_interactive` | `preparePortraitComparison` | `CHOOSE_FINAL_PORTRAIT`, `SUBMIT_FINAL_REASON`, `CONTINUE_WITHOUT_FINAL_REASON`, `PORTRAIT_SHIFT_COMPUTED`, `PORTRAIT_SHIFT_SUMMARY_RESOLVED`, `PORTRAIT_SHIFT_SUMMARY_FAILED` | `FINAL_SIGNATURE` | `PORTRAIT_REASSEMBLY` | `operation_timeout_to_typed_failure` | `invalidate_operation_then_restore` |
| `FINAL_SIGNATURE` | `user_interactive` | `showReadOnlySignatureReview` | `REQUEST_CHARLIE_SIGNATURE_REVIEW`, `CHARLIE_SIGNATURE_REVIEW_RESOLVED`, `CHARLIE_SIGNATURE_REVIEW_FAILED`, `RETRY_CHARLIE_SIGNATURE_REVIEW`, `CONTINUE_WITHOUT_SIGNATURE_REVIEW`, `RETURN_TO_MANUSCRIPT_REVIEW` | `FINAL_DISPOSITION` or `MANUSCRIPT_REVISION` | remain in `FINAL_SIGNATURE` unless returning to manuscript review | `operation_timeout_to_unavailable` | `invalidate_operation_then_restore_attempts` |
| `FINAL_DISPOSITION` | `user_interactive` | `prepareDisposition` | `CHOOSE_DISPOSITION` | `FINALIZING` only when eligible | `FINAL_DISPOSITION` | `none` | `restore_interactive` |
| `FINALIZING` | `system_transient` | `startAtomicEnvelopePersistence` | `FINAL_ENVELOPE_PERSISTED`, `FINAL_ENVELOPE_PERSIST_FAILED` | `COMPLETE` | `FINAL_DISPOSITION` | `operation_timeout_with_rollback` | `invalidate_operation_and_report_incomplete` |
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

`FINAL_DISPOSITION` handles `CHOOSE_DISPOSITION` by calling the single finalization evaluator before entering `FINALIZING`. `FINALIZING` owns the atomic envelope persistence operation and reaches `COMPLETE` only through a bound `FINAL_ENVELOPE_PERSISTED` result. `FINAL_ENVELOPE_PERSIST_FAILED` rolls back to a non-COMPLETE state with no partial envelope.

`START_NEW_SESSION` is an application command that creates a new Session ID. It is not an event that mutates `COMPLETE`.

## 6. Open issues

None for the Stage 5 machine surface. Stage-4-owned payloads, executable
guards, persistence, and entry actions are implemented without adding a
machine-library dependency.

## 7. Compatibility and recovery

State Machine Contract `0.2.0` is breaking for removed event names. There are
no aliases and no attempt to translate supplier details into Session events.
The Stage catalogue and persisted stage literals are unchanged, so
`sessionSchemaVersion` remains `0.1.0`. Recovery invalidates any persisted
`ActiveOperation`, rotates `stageInstanceId`, and either deterministically
re-enters a safe transient state or restores the interactive state. A late,
duplicate, cancelled, pre-repair, or binding-mismatched result cannot reach the
reducer. COMPLETE snapshots remain read-only under the existing exact-version
compatibility rules.

State Machine Contract `0.3.0` adds only the approved G2/G4 composed data
shapes. It adds no event alias or stage literal; editable recovery requires the
exact current vector.
