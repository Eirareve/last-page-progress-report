import { describe, expect, it } from "vitest";

import {
  contentGateAttestationSchema,
  contentGateEvaluationSchema,
} from "@/content";
import {
  dissentRecordSchema,
  semanticFragmentSchema,
  semanticPlacementBatchSchema,
  semanticRestorationProposalSchema,
} from "@/domain";
import {
  FINAL_ENVELOPE_ATTESTATION_SCHEMA_VERSION,
  evaluateFinalization,
  finalEnvelopeAttestationSchema,
  finalizationSessionStateSchema,
  isFinalizable,
  type FinalizationBlockerCode,
  type FinalizationResult,
  type FinalizationSessionState,
} from "@/finalization";
import {
  makeProposedInsertDiff,
  makeRestorationProposal,
  makeSemanticFragment,
} from "../fixtures/domain";
import {
  FINALIZATION_NOW,
  REQUIRED_CAPABILITY,
  SHA256_A,
  SHA256_B,
  makeActiveOperation,
  makeContentGateAttestation,
  makeContentGateEvaluation,
  makeContractVersionVector,
  makeFinalizableState,
  makeFinalizationContext,
} from "../fixtures/finalization";

describe("finalization eligibility contract", () => {
  it("accepts the complete baseline and exposes isFinalizable as the same decision", () => {
    const state = makeFinalizableState();
    const context = makeFinalizationContext();

    expect(finalizationSessionStateSchema.safeParse(state).success).toBe(true);
    expect(evaluateFinalization(state, context)).toEqual({
      eligible: true,
      blockers: [],
    });
    expect(isFinalizable(state, context)).toBe(true);
  });

  it.each<{
    name: string;
    blocker: FinalizationBlockerCode;
    mutate: (state: FinalizationSessionState) => void;
  }>([
    {
      name: "wrong stage",
      blocker: "invalid_finalization_stage",
      mutate: (state) => {
        state.stage = "FINAL_SIGNATURE";
      },
    },
    {
      name: "incomplete round",
      blocker: "round_incomplete",
      mutate: (state) => {
        state.rounds.round2.completed = false;
      },
    },
    {
      name: "missing precise manuscript",
      blocker: "precise_text_missing",
      mutate: (state) => {
        state.manuscript.preciseText = "";
      },
    },
    {
      name: "missing plain manuscript",
      blocker: "plain_text_missing",
      mutate: (state) => {
        state.manuscript.plainText = null;
        state.manuscript.plainRevisionId = null;
      },
    },
    {
      name: "stale semantic drift",
      blocker: "semantic_drift_not_current",
      mutate: (state) => {
        state.semanticDrift = { ...state.semanticDrift!, status: "stale" };
      },
    },
    {
      name: "missing final portrait choice",
      blocker: "final_portrait_choice_missing",
      mutate: (state) => {
        state.portraits.finalChoice = null;
      },
    },
    {
      name: "unresolved signature status",
      blocker: "current_signature_status_unresolved",
      mutate: (state) => {
        state.currentCharlieSignatureStatus = "pending";
      },
    },
    {
      name: "missing disposition",
      blocker: "final_disposition_missing",
      mutate: (state) => {
        state.finalDisposition = null;
      },
    },
  ])("returns a structured blocker for $name", ({ blocker, mutate }) => {
    const state = makeFinalizableState();
    mutate(state);

    const result = evaluateFinalization(state, makeFinalizationContext());

    expect(blockerCodes(result)).toContain(blocker);
    expect(isFinalizable(state, makeFinalizationContext())).toBe(false);
  });

  it("blocks finalization while a manuscript-revision signature checkpoint remains", () => {
    const state = makeFinalizableState();
    state.signatureReviewCheckpoint = {
      status: "not_requested",
      review: null,
    };

    expect(
      evaluateFinalization(state, makeFinalizationContext()).blockers,
    ).toContainEqual({
      code: "signature_review_checkpoint_present",
      path: "signatureReviewCheckpoint",
      subject: "not_requested",
    });
  });

  it("blocks finalization while a manuscript revision intent remains", () => {
    const state = makeFinalizableState();
    state.manuscript.revisionIntent = {
      sourcePreciseRevisionId: state.manuscript.preciseRevisionId,
      sourcePreciseText: state.manuscript.preciseText,
      draftPreciseText: state.manuscript.preciseText,
      returnTarget: "FINAL_SIGNATURE",
    };

    expect(
      evaluateFinalization(state, makeFinalizationContext()).blockers,
    ).toContainEqual({
      code: "manuscript_revision_intent_present",
      path: "manuscript.revisionIntent",
      subject: state.manuscript.preciseRevisionId,
    });
  });

  it("blocks an unresolved semantic fragment", () => {
    const state = makeFinalizableState();
    const fragment = makeSemanticFragment();
    state.semanticFragments = [fragment];
    state.semanticDrift = {
      ...state.semanticDrift!,
      fragmentIds: [fragment.id],
    };

    expect(
      blockerCodes(evaluateFinalization(state, makeFinalizationContext())),
    ).toContain("semantic_fragment_unresolved");
  });

  it.each([
    ["in_progress", "semantic_placement_batch_in_progress"],
    ["checking_consistency", "semantic_placement_batch_in_progress"],
    ["invalidated", "semantic_placement_batch_invalidated"],
  ] as const)("blocks a %s placement batch", (status, blocker) => {
    const state = makeFinalizableState();
    state.semanticPlacementBatch = semanticPlacementBatchSchema.parse({
      batchId: `batch-${status}`,
      baselinePreciseRevisionId: "precise-r1",
      baselinePlainRevisionId: "plain-r1",
      workingPlainRevisionId: "plain-r1",
      fragmentIds: [],
      decisions: [],
      confirmedRestorationProposalIds: [],
      status,
      createdAt: FINALIZATION_NOW,
      completedAt: null,
      invalidatedReason:
        status === "invalidated" ? "revision_binding_changed" : null,
    });

    expect(
      blockerCodes(evaluateFinalization(state, makeFinalizationContext())),
    ).toContain(blocker);
  });

  it("blocks a pending Diff", async () => {
    const state = makeFinalizableState();
    state.manuscript.pendingDiff = await makeProposedInsertDiff({
      text: state.manuscript.preciseText,
      revisionId: state.manuscript.preciseRevisionId,
      offsetCodePoint: 0,
    });

    expect(
      blockerCodes(evaluateFinalization(state, makeFinalizationContext())),
    ).toContain("pending_diff_present");
  });

  it("blocks an active operation before FINALIZING", () => {
    const state = makeFinalizableState();
    state.runtime.activeOperation = makeActiveOperation();

    expect(
      blockerCodes(evaluateFinalization(state, makeFinalizationContext())),
    ).toContain("active_operation_present");
  });

  it("allows open dissent, an empty final reason, and unfinished disposition", () => {
    const state = makeFinalizableState();
    state.portraits.finalReason = null;
    state.finalDisposition = "unfinished";
    state.openDissents = [
      dissentRecordSchema.parse({
        id: "dissent-open-1",
        roundId: "round3",
        charliePositionId: "charlie-position-1",
        userPrincipleId: "user-principle-1",
        focus: "Who can decide for a future self?",
        status: "open",
      }),
    ];

    expect(evaluateFinalization(state, makeFinalizationContext())).toEqual({
      eligible: true,
      blockers: [],
    });
  });
});

describe("semantic restoration finalization boundary", () => {
  it("ignores an unreferenced historical stale proposal", async () => {
    const state = makeFinalizableState();
    const fragment = makeSemanticFragment({ id: "historical-fragment" });
    const proposal = await makeRestorationProposal({
      proposalId: "historical-stale-proposal",
      fragment,
      targetPlainRevisionId: "plain-r1",
      currentPlainText: state.manuscript.plainText!,
      offsetCodePoint: 0,
      replacementText: "Historically proposed: ",
    });
    state.semanticRestorationProposals = [
      semanticRestorationProposalSchema.parse({
        ...proposal,
        status: "stale",
        staleReason: "superseded_by_regeneration",
      }),
    ];

    expect(evaluateFinalization(state, makeFinalizationContext())).toEqual({
      eligible: true,
      blockers: [],
    });
  });

  it("blocks a stale proposal still referenced by the current fragment", async () => {
    const state = makeFinalizableState();
    const unresolved = makeSemanticFragment({ id: "fragment-current-stale" });
    const proposal = await makeRestorationProposal({
      proposalId: "proposal-current-stale",
      fragment: unresolved,
      targetPlainRevisionId: "plain-r1",
      currentPlainText: state.manuscript.plainText!,
      offsetCodePoint: 0,
      replacementText: "Still current: ",
    });
    const staleProposal = semanticRestorationProposalSchema.parse({
      ...proposal,
      status: "stale",
      staleReason: "anchor_no_unique_match",
    });
    const fragment = semanticFragmentSchema.parse({
      ...unresolved,
      placement: "restored_to_plain_text",
      resolvedAt: FINALIZATION_NOW,
      restorationProposalId: staleProposal.proposalId,
    });
    state.semanticFragments = [fragment];
    state.semanticRestorationProposals = [staleProposal];
    state.semanticDrift = {
      ...state.semanticDrift!,
      fragmentIds: [fragment.id],
    };

    expect(
      blockerCodes(evaluateFinalization(state, makeFinalizationContext())),
    ).toContain("semantic_restoration_stale");
  });
});

describe("content gate and provenance finalization boundary", () => {
  it.each([
    [
      "bundle",
      { contentBundleId: "another-bundle" },
      "content_gate_bundle_mismatch",
    ],
    [
      "schema",
      { contentSchemaVersion: "9.9.9" },
      "content_gate_schema_mismatch",
    ],
    ["checksum", { checksum: SHA256_B }, "content_gate_checksum_mismatch"],
    [
      "environment",
      { targetEnvironment: "test" as const },
      "content_gate_environment_mismatch",
    ],
  ] as const)("blocks a content gate %s mismatch", (_name, override, blocker) => {
    const evaluation = makeContentGateEvaluation(override);
    const context = makeFinalizationContext({
      contentGateEvaluation: evaluation,
    });

    expect(
      blockerCodes(evaluateFinalization(makeFinalizableState(), context)),
    ).toContain(blocker);
  });

  it("blocks a failed content gate", () => {
    const context = makeFinalizationContext({
      contentGateEvaluation: makeContentGateEvaluation({
        status: "failed",
        failureCodes: ["placeholder_in_production"],
      }),
    });

    expect(
      blockerCodes(evaluateFinalization(makeFinalizableState(), context)),
    ).toContain("content_gate_failed");
  });

  it("does not require attestation under the approved false baseline", () => {
    const context = makeFinalizationContext({
      requiresContentGateAttestation: false,
      contentGateAttestation: null,
    });

    expect(evaluateFinalization(makeFinalizableState(), context).eligible).toBe(
      true,
    );
  });

  it("requires and validates attestation only when the context enables it", () => {
    const evaluation = makeContentGateEvaluation();
    const missing = makeFinalizationContext({
      contentGateEvaluation: evaluation,
      requiresContentGateAttestation: true,
      contentGateAttestation: null,
    });
    const valid = makeFinalizationContext({
      contentGateEvaluation: evaluation,
      requiresContentGateAttestation: true,
      contentGateAttestation: makeContentGateAttestation(evaluation),
    });
    const mismatched = makeFinalizationContext({
      contentGateEvaluation: evaluation,
      requiresContentGateAttestation: true,
      contentGateAttestation: makeContentGateAttestation(evaluation, {
        checksum: SHA256_B,
      }),
    });

    expect(
      blockerCodes(evaluateFinalization(makeFinalizableState(), missing)),
    ).toContain("content_gate_attestation_missing");
    expect(evaluateFinalization(makeFinalizableState(), valid).eligible).toBe(
      true,
    );
    expect(
      blockerCodes(evaluateFinalization(makeFinalizableState(), mismatched)),
    ).toContain("content_gate_attestation_invalid");
  });

  it("blocks the explicitly deferred agentContractVersion", () => {
    const state = makeFinalizableState();
    state.provenance.contractVersionVector = makeContractVersionVector({
      agentContractVersion: null,
    });

    const result = evaluateFinalization(state, makeFinalizationContext());

    expect(result.blockers).toContainEqual({
      code: "contract_version_missing",
      path: "provenance.contractVersionVector.agentContractVersion",
      subject: "agentContractVersion",
    });
  });

  it("blocks a missing trusted required capability receipt", () => {
    const state = makeFinalizableState();
    state.provenance.capabilityExecutionReceipts = [];

    const result = evaluateFinalization(state, makeFinalizationContext());

    expect(result.blockers).toContainEqual({
      code: "capability_receipt_missing",
      path: "provenance.capabilityExecutionReceipts",
      subject: REQUIRED_CAPABILITY,
    });
  });
});

describe("attestation schemas", () => {
  it("accepts only a verified ContentGateAttestation projection", () => {
    const verified = makeContentGateAttestation();

    expect(contentGateAttestationSchema.safeParse(verified).success).toBe(true);
    expect(
      contentGateAttestationSchema.safeParse({
        ...verified,
        verificationStatus: "unverified",
      }).success,
    ).toBe(false);
    expect(
      contentGateEvaluationSchema.safeParse({
        ...makeContentGateEvaluation(),
        failureCodes: ["unexpected_failure"],
      }).success,
    ).toBe(false);
  });

  it("binds a verified FinalEnvelopeAttestation to envelope and receipt digests", () => {
    const attestation = {
      finalEnvelopeAttestationSchemaVersion:
        FINAL_ENVELOPE_ATTESTATION_SCHEMA_VERSION,
      attestationId: "envelope-attestation-1",
      finalEnvelopeId: "envelope-1",
      integrityChecksum: SHA256_A,
      contentBundleChecksum: SHA256_B,
      finalEnvelopeSchemaVersion: "0.1.0",
      executionReceiptsDigest: SHA256_A,
      attestationMethod: "shared_key_mac",
      algorithm: "HMAC-SHA-256",
      keyId: "envelope-key-1",
      proof: "verified-envelope-proof",
      issuedAt: "2026-08-06T13:01:00.000Z",
      verifiedAt: "2026-08-06T13:01:01.000Z",
      verificationStatus: "verified",
    };

    expect(finalEnvelopeAttestationSchema.safeParse(attestation).success).toBe(
      true,
    );
    expect(
      finalEnvelopeAttestationSchema.safeParse({
        ...attestation,
        executionReceiptsDigest: "not-a-digest",
      }).success,
    ).toBe(false);
    expect(
      finalEnvelopeAttestationSchema.safeParse({
        ...attestation,
        verificationStatus: "unverified",
      }).success,
    ).toBe(false);
  });
});

function blockerCodes(result: FinalizationResult): FinalizationBlockerCode[] {
  return result.blockers.map(({ code }) => code);
}
