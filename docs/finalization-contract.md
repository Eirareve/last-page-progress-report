# Finalization Contract

> `finalizationContractVersion: 0.2.0`
> Status: frozen for Stage 5 implementation
> DRI: Codex（技术一致性）
> Final approver: 项目负责人
> Stage 5 approval: project owner, 2026-08-09

Version `0.2.0` freezes the G4 envelope projection: successful finalization
must persist `contentSnapshot` and the concrete Session configuration in the
checksummed envelope. COMPLETE must not supplement that envelope from live
Session or ContentAccess state.

## 1. Single decision function

`evaluateFinalization(state, context): FinalizationResult` is the sole finalization decision. `isFinalizable` may only return `evaluateFinalization(...).eligible`.

FSM, UI, tests, and the future Envelope Builder consume the same result and blocker codes.

The executable discriminated union, context, blocker-code enum, and optional attestation Schema are defined in [`schemas.ts`](../src/finalization/schemas.ts); the sole evaluator is [`evaluate-finalization.ts`](../src/finalization/evaluate-finalization.ts).

## 2. Required order

```text
CHOOSE_DISPOSITION completed
→ verify runtime.activeOperation=null
→ evaluateFinalization
→ blocked: remain and display structured blockers
→ eligible: enter FINALIZING
→ create finalization ActiveOperation
→ build and persist FinalEnvelope atomically
→ clear ActiveOperation
→ COMPLETE
```

Creating the finalization operation before evaluation is forbidden. A failed build or persistence transaction cannot create a partial envelope or COMPLETE state.

## 3. Eligibility conditions

At minimum:

1. all three rounds are complete;
2. precise/plain text and distinct bound revision IDs are present;
3. SemanticDrift is current and matches both revisions;
4. every fragment has a valid placement and no batch is in progress or invalidated;
5. `pendingDiff=null` and no manuscript revision intent remains;
6. `runtime.activeOperation=null`;
7. final portrait choice exists;
8. no manuscript-revision signature checkpoint remains;
9. current signature status is `signed`, `declined`, `unavailable`, or `not_requested`;
10. future signature is blank;
11. final disposition exists, including `unfinished`;
12. ContentGateEvaluation passed and matches bundle, schema, checksum, and target environment;
13. attestation is present and verified only when `requiresContentGateAttestation=true`;
14. every field in `ContractVersionVector` required for complete provenance is present, including a non-null `agentContractVersion`;
15. every capability identifier supplied by trusted `requiredCapabilityReceipts` has a receipt; stage 1 does not invent the stage 3 capability list.

Open dissents and an empty final reason do not block finalization.

## 4. Content gate and attestations

`ContentGateEvaluation` is deterministic local/server validation metadata, not a signature. `integrityChecksum` is damage detection, not proof of authorship.

The baseline is `requiresContentGateAttestation=false`. If a later deployment enables it, only a cryptographically verified `ContentGateAttestation` bound to the same evaluation is accepted.

`FinalEnvelopeAttestation` is a verified sidecar bound to the already-built envelope ID, integrity checksum, content checksum, envelope Schema version, and execution-receipts digest. It is created after the deterministic payload/checksum and is not included in its own checksum; this avoids a circular self-signature. It remains optional in the approved baseline.

## 5. Structured blockers

`FinalizationResult` is exactly `{ eligible: true, blockers: [] }` or `{ eligible: false, blockers: FinalizationBlocker[] }`. Blockers identify at least: invalid stage, incomplete rounds, missing manuscript text/revisions, stale or mismatched drift, unfinished fragments or active restoration proposals, invalid placement batch, pending Diff or manuscript revision intent, active operation, missing portrait choice, a remaining manuscript-revision checkpoint, invalid signature states, missing disposition, failed/mismatched content gate, missing/invalid required attestation, missing owned versions, mismatched directly bindable versions, and missing required receipts.

No blocker is inferred from open disagreement or `finalDisposition=unfinished`.

## 6. Open issues

The exact stage 3 required capability inventory is deferred. Its injection point and missing-receipt blocker are frozen here.

Stage 1 checks vector completeness plus the concrete bindings it can prove locally: Session Schema, content Schema, and a present signature snapshot's `finalReviewSchemaVersion`. Production integration must additionally compare the remaining Contract fields with a trusted current-version registry before accepting recovery/finalization. Until the full Agent Contract is frozen, real development state keeps `agentContractVersion=null` and is therefore structurally blocked; the complete vector in positive evaluator tests is synthetic test data only.
