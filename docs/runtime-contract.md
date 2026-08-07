# Runtime Contract

> `runtimeContractVersion: 0.1.0`
> Status: draft for final human approval
> DRI: Codex（技术一致性）
> Final approver: 项目负责人

## 1. Scope

Runtime owns operation identity, request metadata, input fingerprints, attempts, cancellation/result guards, idempotency records, injected time/ID ports, and recoverability metadata. It contains no Charlie role semantics and no supplier payload types.

## 2. Execution modes

```text
AgentMode = mock | live

ResolvedExecutionMode =
  deterministic | live | mock | static_template | unavailable

ExecutionOutcome =
  succeeded | failed | skipped
```

Requested mode is Session intent. Resolved mode and outcome are per capability and separate. `unavailable` is a technical absence of a usable result, never a role refusal.

## 3. ActiveOperation

An active operation records at least:

- `operationId`, `requestId`, `capability`;
- `stage`, `stageInstanceId`;
- `inputFingerprint`;
- bound precise/plain revision IDs and content bundle identity;
- `attempt`, `status`, and `startedAt`.

An asynchronous result is accepted only if its operation ID, request ID, capability, stage instance, input fingerprint, and all bound revisions/content identifiers match the active operation. Duplicate, stale, cancelled, or mismatched results are rejected before they reach Domain.

After refresh, an old active operation becomes invalidated and must never be restored as running.

Refresh does not reset Domain signature retry state or a valid `MANUSCRIPT_REVISION` checkpoint. `signatureReviewAttemptState` and `signatureReviewCheckpoint` are restored from the validated Session record; only the Runtime operation is invalidated. A checkpoint may be consumed solely by the Domain cancel/no-change transition and must still pass its revision/content/request/fingerprint bindings.

`OperationResultGuardInput` is the sanitized result-binding record checked against `ActiveOperation`. It contains operation/request/capability/stage-instance/fingerprint bindings, relevant revisions/content identity, and result status; it contains neither a supplier raw response nor a Candidate payload.

## 4. RequestContext

`RequestContext` carries request/operation IDs, requested mode, capability, attempt, input fingerprint, prompt/adapter versions, stage binding, revision binding, and an optional abort signal at the in-memory boundary. It is execution metadata and must not alter the semantic result of identical validated business input.

`computeInputFingerprint` hashes a strict material record containing capability, requested mode, double-revision/content bindings, `agentContractVersion` when applicable, the capability's `resultSchemaVersion`, and a digest of the validated semantic input. It uses recursively key-sorted canonical JSON with NFC strings, UTF-8, and SHA-256. Request ID, operation ID, stage-instance ID, and attempt number are excluded so refresh and a legitimate retry preserve the fingerprint; changing either revision or another bound semantic input changes it. The independent signature-review adapter leaves `agentContractVersion=null` and maps its approved `finalReviewSchemaVersion` into the generic result-Schema slot; it does not invent a second Final Review version axis.

`SessionConfiguration.requestedAgentMode` is the sole Session-level mode field. It is `mock | live` and never records a resolved result source.

`RetryPolicy` freezes maximum attempts and the manual/automatic retry boundary. Signature-review business attempt counts remain in Domain `SignatureReviewAttemptState`; `ActiveOperation.attempt` describes only the current operation. Refresh invalidates the active operation but preserves the Domain attempt count. The finalized live signature rule is one initial business request plus one manual retry after technical failure only; its state transitions are owned by the Domain Contract. The guide's bounded `RETRY_NETWORK` or `REPAIR_STRUCTURED_OUTPUT` recovery happens inside the current business request and does not create another Domain signature attempt. Mock/static fallback remains forbidden for live signature review.

## 5. Idempotency

`StateTransitionIdempotencyRecord` records a transition/event key, its input fingerprint, applied revision, status, and expiry/cleanup metadata.

Guarantees:

1. The same completed Diff, placement, signature continuation, or finalization event cannot change the Session twice.
2. Repeating the same verified event produces a stable reducer result.
3. The same request ID with a different fingerprint is `idempotency_conflict` only when a verifiable record exists in the current persistence scope.
4. Client/FSM idempotency and result-commit idempotency are required.
5. Without persistent server storage or provider-native idempotency, supplier invocation exactly-once is not guaranteed.
6. A retry may repeat a supplier call but must not repeat the business commit.

Records are scoped to a Session. Pending/current records remain while the Session is recoverable; completed records may be compacted only after the corresponding immutable revision or COMPLETE snapshot makes replay impossible. Expired unfinished Sessions are cleaned with their records. COMPLETE records are retained with the bounded snapshot or represented by a stable digest.

## 6. Ports

`Clock.now()` supplies ISO timestamps. `IdGenerator.next(kind)` supplies persistent IDs. Tests inject fixed implementations. Domain code must not call `Date.now`, `new Date`, `Math.random`, or UUID generation directly for semantic output.

## 7. Persistence boundary reserved for stage 4

Stage 1 defines transaction and recovery semantics but not IndexedDB code:

- state and idempotency records commit atomically;
- transaction abort preserves the prior in-memory and persisted revision;
- browser quota failure is explicit;
- Web Locks is preferred, with `ownerToken + expectedRevision` fallback;
- silent cross-tab overwrite is forbidden.

### 7.1 Recovery decision boundary

Stage 1 freezes a pure recovery decision and migration interface; it does not
implement IndexedDB, transactions, cleanup scheduling, or UI rendering.

Every persisted record is processed in this order:

1. validate the minimal recovery header and its numeric
   `sessionSchemaVersion`;
2. reject an unknown future version;
3. for the current version, validate the complete current Session Schema and
   then its Contract version compatibility;
4. for an older editable Session in the same major version, follow only a
   continuous, explicitly registered, forward-only migration chain;
5. validate each migration output header and finally validate the complete
   current Schema and Contract compatibility;
6. never migrate a COMPLETE snapshot in place.

The current version restores as editable unless it is COMPLETE. A current
COMPLETE snapshot restores read-only. An older COMPLETE snapshot may restore
read-only only through an exact-version compatibility entry and its registered
Schema; the original snapshot is returned without mutation or migration.

Editable recovery never crosses a major Session Schema version. Missing steps,
cycles, backward/overshooting targets, exceptions, an invalid migrated header,
or a migration that turns an unfinished Session into COMPLETE are rejected.
Migration functions receive and return plain data, must be deterministic, and
must not mutate their input.

### 7.2 Structured recovery outcomes

Successful outcomes state `editable | read_only`, identify their source as
`current | migrated | legacy_complete`, and include every applied version step.
Rejections expose a stable category (`corrupt_state`, `contract_mismatch`,
`unsupported_version`, or `migration_failed`) plus one of these more precise
reason codes:

- `corrupt_state`: invalid header, invalid current state, or invalid registered
  legacy COMPLETE snapshot;
- `contract_mismatch`: the shape is valid but its explicit Contract versions
  are not compatible;
- `unknown_future_version`: the record declares a newer Session Schema;
- `breaking_version`: an editable record has a different major version;
- `migration_unavailable`: no explicit next step exists;
- `migration_failed`: a registered chain or its output violates the migration
  contract;
- `read_only_compatibility_unavailable`: an old COMPLETE snapshot lacks an
  exact-version read-only decoder.

Recovery must not silently fill missing core fields, guess a migration, parse a
partial Session as editable, or rewrite a COMPLETE snapshot. The application
may offer raw export or deletion after rejection, but those actions are outside
this Runtime Contract.

For Session Schema `0.1.0`, `signatureReviewCheckpoint` is a required nullable field and `SignatureReviewAttemptState.requestedMode` is a required discriminant. Missing either field is corrupt current-version state; no default is supplied. Because no earlier Session Schema has been released or committed, stage 1 registers no migration that guesses these values. Any future older-version migration must be explicit; an old `MANUSCRIPT_REVISION` record without a checkpoint cannot be reconstructed safely and must be rejected. Legacy COMPLETE records remain eligible only for an exact registered read-only decoder.

## 8. Deployment capability baseline

```text
serverStart=false
serverSecrets=true
persistentIdempotency=false
requiresContentGateAttestation=false
```

Production content validation uses CI/build-time validation plus server first-request validation. KV, cross-process idempotency, and attestation are optional enhancements. This Contract does not claim supplier exactly-once.

## 9. Open issues

- IndexedDB record layout, browser-lock implementation, and provider-specific retry values are deferred to their approved stages.
