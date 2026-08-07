import type { ContentGateEvaluation } from "../content/contracts";
import type {
  CurrentCharlieSignatureStatus,
  SignatureReviewSnapshot,
} from "../domain/contracts/signature";
import {
  getMissingContractVersionFields,
  type ContractVersionField,
} from "../provenance/contract-version-vector";
import type {
  FinalizationBlocker,
  FinalizationBlockerCode,
  FinalizationContext,
  FinalizationResult,
  FinalizationSessionState,
} from "./contracts";
import { finalizationResultSchema } from "./schemas";

const FINAL_SIGNATURE_STATUSES: ReadonlySet<CurrentCharlieSignatureStatus> =
  new Set<CurrentCharlieSignatureStatus>([
    "signed",
    "declined",
    "unavailable",
    "not_requested",
  ]);

export function evaluateFinalization(
  state: FinalizationSessionState,
  context: FinalizationContext,
): FinalizationResult {
  const blockers: FinalizationBlocker[] = [];
  const blockerKeys = new Set<string>();
  const block = (
    code: FinalizationBlockerCode,
    path: string,
    subject: string | null = null,
  ): void => {
    const key = `${code}\u0000${path}\u0000${subject ?? ""}`;
    if (blockerKeys.has(key)) {
      return;
    }
    blockerKeys.add(key);
    blockers.push({ code, path, subject });
  };

  if (
    state.stage !== "FINAL_DISPOSITION" ||
    state.lifecycleStatus !== "in_progress"
  ) {
    block(
      "invalid_finalization_stage",
      "stage",
      `${state.lifecycleStatus}:${state.stage}`,
    );
  }

  for (const [roundId, round] of Object.entries(state.rounds)) {
    if (!round.completed || !round.responseSubmitted) {
      block("round_incomplete", `rounds.${roundId}.completed`, roundId);
    }
  }

  if (state.manuscript.preciseText.trim().length === 0) {
    block("precise_text_missing", "manuscript.preciseText");
  }
  if (state.manuscript.preciseRevisionId.trim().length === 0) {
    block("precise_revision_missing", "manuscript.preciseRevisionId");
  }
  if (
    state.manuscript.plainText === null ||
    state.manuscript.plainText.trim().length === 0
  ) {
    block("plain_text_missing", "manuscript.plainText");
  }
  if (
    state.manuscript.plainRevisionId === null ||
    state.manuscript.plainRevisionId.trim().length === 0
  ) {
    block("plain_revision_missing", "manuscript.plainRevisionId");
  }
  if (
    state.manuscript.plainRevisionId !== null &&
    state.manuscript.preciseRevisionId === state.manuscript.plainRevisionId
  ) {
    block(
      "manuscript_revision_ids_not_distinct",
      "manuscript.plainRevisionId",
      state.manuscript.plainRevisionId,
    );
  }
  if (state.manuscript.pendingDiff !== null) {
    block(
      "pending_diff_present",
      "manuscript.pendingDiff",
      state.manuscript.pendingDiff.id,
    );
  }
  if (state.manuscript.revisionIntent !== null) {
    block(
      "manuscript_revision_intent_present",
      "manuscript.revisionIntent",
      state.manuscript.revisionIntent.sourcePreciseRevisionId,
    );
  }

  const drift = state.semanticDrift;
  if (drift === null) {
    block("semantic_drift_missing", "semanticDrift");
  } else {
    if (drift.status !== "current") {
      block("semantic_drift_not_current", "semanticDrift.status", drift.status);
    }
    if (
      drift.preciseRevisionId !== state.manuscript.preciseRevisionId ||
      drift.plainRevisionId !== state.manuscript.plainRevisionId
    ) {
      block("semantic_drift_revision_mismatch", "semanticDrift");
    }
    if (
      !sameIdentifierSet(
        drift.fragmentIds,
        state.semanticFragments.map(({ id }) => id),
      )
    ) {
      block("semantic_fragment_set_mismatch", "semanticDrift.fragmentIds");
    }
  }

  const currentProposalReferences = new Map<string, Set<string>>();
  for (const fragment of state.semanticFragments) {
    if (fragment.placement === null) {
      block("semantic_fragment_unresolved", "semanticFragments", fragment.id);
      continue;
    }
    if (fragment.placement === "restored_to_plain_text") {
      if (fragment.restorationProposalId === null) {
        block(
          "semantic_restoration_unresolved",
          "semanticRestorationProposals",
          fragment.id,
        );
      } else {
        addProposalReference(
          currentProposalReferences,
          fragment.restorationProposalId,
          fragment.id,
        );
      }
    }
  }

  const batch = state.semanticPlacementBatch;
  if (batch !== null) {
    const decisionProposalIds = new Set<string>();
    for (const decision of batch.decisions) {
      if (decision.restorationProposalId !== null) {
        decisionProposalIds.add(decision.restorationProposalId);
        addProposalReference(
          currentProposalReferences,
          decision.restorationProposalId,
          decision.fragmentId,
        );
      }
    }
    for (const proposalId of batch.confirmedRestorationProposalIds) {
      if (!decisionProposalIds.has(proposalId)) {
        block(
          "semantic_restoration_binding_mismatch",
          "semanticPlacementBatch.confirmedRestorationProposalIds",
          proposalId,
        );
      }
    }
  }

  for (const [proposalId, referencedFragmentIds] of currentProposalReferences) {
    const proposals = state.semanticRestorationProposals.filter(
      (proposal) => proposal.proposalId === proposalId,
    );
    if (proposals.length === 0) {
      block(
        "semantic_restoration_unresolved",
        "semanticRestorationProposals",
        proposalId,
      );
      continue;
    }
    if (proposals.length > 1) {
      block(
        "semantic_restoration_binding_mismatch",
        "semanticRestorationProposals",
        proposalId,
      );
    }
    const proposal = proposals[0];
    if (
      [...referencedFragmentIds].some(
        (fragmentId) => fragmentId !== proposal.fragmentId,
      )
    ) {
      block(
        "semantic_restoration_binding_mismatch",
        "semanticRestorationProposals",
        proposalId,
      );
    }
    if (
      batch !== null &&
      (proposal.baselinePreciseRevisionId !== batch.baselinePreciseRevisionId ||
        proposal.baselinePlainRevisionId !== batch.baselinePlainRevisionId)
    ) {
      block(
        "semantic_restoration_binding_mismatch",
        "semanticRestorationProposals",
        proposalId,
      );
    }
    if (proposal.status === "stale") {
      block(
        "semantic_restoration_stale",
        "semanticRestorationProposals",
        proposalId,
      );
    } else if (proposal.status !== "applied") {
      block(
        "semantic_restoration_unresolved",
        "semanticRestorationProposals",
        proposalId,
      );
    } else if (
      batch?.status === "completed" &&
      !state.semanticFragments.some(
        (fragment) =>
          fragment.id === proposal.fragmentId &&
          fragment.placement === "restored_to_plain_text" &&
          fragment.restorationProposalId === proposalId,
      )
    ) {
      block(
        "semantic_restoration_binding_mismatch",
        "semanticRestorationProposals",
        proposalId,
      );
    }
  }

  if (
    batch?.status === "in_progress" ||
    batch?.status === "checking_consistency"
  ) {
    block(
      "semantic_placement_batch_in_progress",
      "semanticPlacementBatch.status",
      batch.batchId,
    );
  } else if (batch?.status === "invalidated") {
    block(
      "semantic_placement_batch_invalidated",
      "semanticPlacementBatch.status",
      batch.batchId,
    );
  }
  if (
    batch !== null &&
    (!sameIdentifierSet(
      batch.fragmentIds,
      state.semanticFragments.map(({ id }) => id),
    ) ||
      batch.baselinePreciseRevisionId !== state.manuscript.preciseRevisionId ||
      batch.workingPlainRevisionId !== state.manuscript.plainRevisionId)
  ) {
    block(
      "semantic_placement_batch_mismatch",
      "semanticPlacementBatch",
      batch.batchId,
    );
  }

  if (state.runtime.activeOperation !== null) {
    block(
      "active_operation_present",
      "runtime.activeOperation",
      state.runtime.activeOperation.operationId,
    );
  }
  if (state.portraits.initialRecord === null) {
    block("initial_portrait_record_missing", "portraits.initialRecord");
  }
  if (state.portraits.finalChoice === null) {
    block("final_portrait_choice_missing", "portraits.finalChoice");
  }
  if (state.portraits.comparison === null) {
    block("portrait_shift_comparison_missing", "portraits.comparison");
  } else if (
    state.portraits.finalChoice !== null &&
    state.portraits.comparison.finalChoice !== state.portraits.finalChoice
  ) {
    block(
      "portrait_shift_comparison_mismatch",
      "portraits.comparison.finalChoice",
    );
  }
  if (
    state.portraitShiftSummary === null ||
    state.portraitShiftSummary.trim().length === 0
  ) {
    block("portrait_shift_summary_missing", "portraitShiftSummary");
  }

  if (state.signatureReviewCheckpoint !== null) {
    block(
      "signature_review_checkpoint_present",
      "signatureReviewCheckpoint",
      state.signatureReviewCheckpoint.status,
    );
  }

  if (!FINAL_SIGNATURE_STATUSES.has(state.currentCharlieSignatureStatus)) {
    block(
      "current_signature_status_unresolved",
      "currentCharlieSignatureStatus",
      state.currentCharlieSignatureStatus,
    );
  }
  checkSignatureReview(state, block);

  if (state.futureCharlieSignatureStatus !== "blank") {
    block(
      "future_signature_not_blank",
      "futureCharlieSignatureStatus",
      state.futureCharlieSignatureStatus,
    );
  }
  if (state.finalDisposition === null) {
    block("final_disposition_missing", "finalDisposition");
  }
  if (state.finalEnvelope !== null) {
    block("final_envelope_already_present", "finalEnvelope");
  }

  checkContentGate(state, context, block);
  checkProvenance(state, context, block);

  return blockers.length === 0
    ? finalizationResultSchema.parse({ eligible: true, blockers: [] })
    : finalizationResultSchema.parse({ eligible: false, blockers });
}

function addProposalReference(
  references: Map<string, Set<string>>,
  proposalId: string,
  fragmentId: string,
): void {
  const fragmentIds = references.get(proposalId) ?? new Set<string>();
  fragmentIds.add(fragmentId);
  references.set(proposalId, fragmentIds);
}

function sameIdentifierSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === left.length &&
    rightSet.size === right.length &&
    left.every((identifier) => rightSet.has(identifier))
  );
}

function checkSignatureReview(
  state: FinalizationSessionState,
  block: (
    code: FinalizationBlockerCode,
    path: string,
    subject?: string | null,
  ) => void,
): void {
  const status = state.currentCharlieSignatureStatus;
  const review = state.currentCharlieSignatureReview;
  if (status === "not_requested") {
    if (review !== null) {
      block("signature_review_binding_mismatch", "currentCharlieSignatureReview");
    }
    return;
  }
  if (status !== "signed" && status !== "declined" && status !== "unavailable") {
    return;
  }
  if (review === null) {
    block("signature_review_missing", "currentCharlieSignatureReview", status);
    return;
  }
  if (!signatureReviewMatchesState(review, state)) {
    block(
      "signature_review_binding_mismatch",
      "currentCharlieSignatureReview",
      review.requestId,
    );
  }
}

function signatureReviewMatchesState(
  review: SignatureReviewSnapshot,
  state: FinalizationSessionState,
): boolean {
  return (
    review.status === state.currentCharlieSignatureStatus &&
    review.preciseRevisionId === state.manuscript.preciseRevisionId &&
    review.plainRevisionId === state.manuscript.plainRevisionId &&
    review.contentBundleId === state.contentBinding.contentBundleId &&
    review.contentBundleVersion === state.contentBinding.contentBundleVersion &&
    review.contentBundleChecksum === state.contentBinding.contentBundleChecksum &&
    review.finalReviewSchemaVersion ===
      state.provenance.contractVersionVector.finalReviewSchemaVersion
  );
}

function checkContentGate(
  state: FinalizationSessionState,
  context: FinalizationContext,
  block: (
    code: FinalizationBlockerCode,
    path: string,
    subject?: string | null,
  ) => void,
): void {
  const evaluation = context.contentGateEvaluation;
  if (evaluation === null) {
    block("content_gate_missing", "context.contentGateEvaluation");
    if (context.requiresContentGateAttestation) {
      block("content_gate_attestation_missing", "context.contentGateAttestation");
    }
    return;
  }
  if (evaluation.status !== "passed") {
    block("content_gate_failed", "context.contentGateEvaluation.status");
  }
  if (
    evaluation.contentBundleId !== state.contentBinding.contentBundleId ||
    evaluation.contentBundleVersion !== state.contentBinding.contentBundleVersion
  ) {
    block("content_gate_bundle_mismatch", "context.contentGateEvaluation");
  }
  if (
    evaluation.contentSchemaVersion !== state.contentBinding.contentSchemaVersion
  ) {
    block(
      "content_gate_schema_mismatch",
      "context.contentGateEvaluation.contentSchemaVersion",
    );
  }
  if (evaluation.checksum !== state.contentBinding.contentBundleChecksum) {
    block(
      "content_gate_checksum_mismatch",
      "context.contentGateEvaluation.checksum",
    );
  }
  if (
    evaluation.targetEnvironment !== context.targetEnvironment ||
    state.contentBinding.targetEnvironment !== context.targetEnvironment
  ) {
    block(
      "content_gate_environment_mismatch",
      "context.contentGateEvaluation.targetEnvironment",
      context.targetEnvironment,
    );
  }

  if (!context.requiresContentGateAttestation) {
    return;
  }
  const attestation = context.contentGateAttestation;
  if (attestation === null) {
    block("content_gate_attestation_missing", "context.contentGateAttestation");
    return;
  }
  if (!attestationMatchesEvaluation(attestation.evaluationBinding, evaluation)) {
    block("content_gate_attestation_invalid", "context.contentGateAttestation");
  }
}

function attestationMatchesEvaluation(
  binding: NonNullable<
    FinalizationContext["contentGateAttestation"]
  >["evaluationBinding"],
  evaluation: ContentGateEvaluation,
): boolean {
  return (
    evaluation.status === "passed" &&
    binding.contentGateEvaluationSchemaVersion ===
      evaluation.contentGateEvaluationSchemaVersion &&
    binding.evaluationId === evaluation.evaluationId &&
    binding.contentBundleId === evaluation.contentBundleId &&
    binding.contentBundleVersion === evaluation.contentBundleVersion &&
    binding.checksum === evaluation.checksum &&
    binding.contentSchemaVersion === evaluation.contentSchemaVersion &&
    binding.targetEnvironment === evaluation.targetEnvironment &&
    binding.status === evaluation.status &&
    binding.failureCodes.length === evaluation.failureCodes.length &&
    binding.evaluatedAt === evaluation.evaluatedAt
  );
}

function checkProvenance(
  state: FinalizationSessionState,
  context: FinalizationContext,
  block: (
    code: FinalizationBlockerCode,
    path: string,
    subject?: string | null,
  ) => void,
): void {
  const vector = state.provenance.contractVersionVector;
  for (const field of getMissingContractVersionFields(vector)) {
    block(
      "contract_version_missing",
      `provenance.contractVersionVector.${field}`,
      field,
    );
  }

  checkVersionBinding(
    vector.sessionSchemaVersion,
    state.sessionSchemaVersion,
    "sessionSchemaVersion",
    block,
  );
  checkVersionBinding(
    vector.contentSchemaVersion,
    state.contentBinding.contentSchemaVersion,
    "contentSchemaVersion",
    block,
  );

  const receivedCapabilities = new Set(
    state.provenance.capabilityExecutionReceipts.map((receipt) => receipt.capability),
  );
  for (const capability of context.requiredCapabilityReceipts) {
    if (!receivedCapabilities.has(capability)) {
      block(
        "capability_receipt_missing",
        "provenance.capabilityExecutionReceipts",
        capability,
      );
    }
  }
}

function checkVersionBinding(
  version: string | null,
  expected: string,
  field: ContractVersionField,
  block: (
    code: FinalizationBlockerCode,
    path: string,
    subject?: string | null,
  ) => void,
): void {
  if (version !== null && version !== expected) {
    block(
      "contract_version_binding_mismatch",
      `provenance.contractVersionVector.${field}`,
      field,
    );
  }
}
