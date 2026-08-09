# Provenance Contract

> `provenanceContractVersion: 0.1.0`
> Status: frozen for Stage 5 implementation
> DRI: Codex（技术一致性）
> Final approver: 项目负责人
> Stage 5 approval: project owner, 2026-08-09

The G5 executable vector builder composes every field from its owning exported
constant. Bootstrap and recovery must use that builder; copied version strings
are not an accepted production source.

## 1. CapabilityExecutionReceipt

Every logical capability produces its own receipt even when several capabilities share one supplier request.

Required fields:

- `capability`, `operationId`, `requestId`;
- `requestedMode`, `resolvedMode`, `outcome`;
- `fallbackReason`;
- `promptVersion`, `adapterVersion`, `resultSchemaVersion`;
- optional `agentContractVersion` for an Agent-derived result (omitted for a non-Agent receipt; when present it is a non-empty owned version);
- `inputFingerprintDigest`;
- `startedAt`, `completedAt`.

Optional runtime-observed fields are `tokenUsage`, `modelName`, `provider`, `durationMs`, and `resultDigest`. They must be recorded by trusted runtime code, never copied from a model's self-report.

`fallbackReason`, `promptVersion`, and `adapterVersion` are required keys whose value may be `null`; `resultSchemaVersion` is always a non-empty owned version. A fallback or unavailable result requires a non-null reason. A successful receipt cannot resolve as `unavailable`; a failed or skipped receipt resolves as `unavailable`. A `mock` request cannot resolve through `live` execution.

The same Session may contain `deterministic`, `live`, `mock`, `static_template`, and `unavailable` receipts. FinalEnvelope must preserve these receipts and must not summarize them into a single Session-level resolved mode. The executable source is [`schemas.ts`](../src/provenance/schemas.ts).

The generic receipt Schema permits `live → mock/static_template` fallback for ordinary capabilities. It must not be read as permission for Final Review: the stage 3 Final Review Contract must reject those resolved modes for a live signature request and bind its receipt to the accepted snapshot's request ID, fingerprint, requested mode, outcome, and `finalReviewSchemaVersion`. Stage 1 intentionally defines neither that service payload nor its receipt-to-result validator.

## 2. ContractVersionVector

The canonical Agent field is `agentContractVersion`. `agentToolContractVersion` does not exist as an alias.

The vector contains explicitly owned fields:

- `scopeContractVersion`;
- `domainContractVersion`;
- `runtimeContractVersion`;
- `provenanceContractVersion`;
- `namingContractVersion`;
- `finalizationContractVersion`;
- `stateMachineContractVersion`;
- `sessionSchemaVersion`;
- `stableTextAnchorSchemaVersion`;
- `contentSchemaVersion`;
- `agentContractVersion`;
- `finalReviewSchemaVersion`;
- `finalEnvelopeSchemaVersion`.

Contracts not yet frozen may be `null` only in non-finalizable development state. A finalization requiring complete provenance returns a structured blocker for every missing version. Empty strings, `unknown`, package versions, and a generic `schemaVersion` are forbidden substitutes.

## 3. Integrity versus attestation

`inputFingerprintDigest`, content checksums, result digests, and `integrityChecksum` detect mismatch or damage. They are not proof against a malicious client.

Only an attestation verified with the configured server trust material may be described as attested. The approved deployment baseline does not require attestation.

## 4. Open issues

The stage 3 capability inventory is intentionally not frozen. Finalization receives an explicit required-receipt inventory from trusted application context rather than fabricating completeness in stage 1.
