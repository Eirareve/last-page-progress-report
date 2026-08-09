import {
  acceptPendingDiff,
  applyConfirmedSemanticRestoration,
  applySignatureReviewSnapshot,
  attachSemanticRestorationProposal,
  beginPlacementConsistencyCheck,
  beginSignatureReview,
  cancelSignatureBoundManuscriptRevision,
  completePlacementConsistencyCheck,
  createSemanticPlacementBatch,
  enterManuscriptRevisionFromSignature,
  rejectPendingDiff,
  retryUnavailableSignatureReview,
  selectSemanticFragmentPlacement,
  semanticPlacementBatchSchema,
  signatureReviewSnapshotSchema,
  skipUnrequestedSignatureReview,
  submitSignatureBoundManuscriptRevision,
  type ExperienceStage,
  type RoundId,
} from "../domain";
import { evaluateFinalization } from "../finalization";
import { operationBindingsEqual, type Clock, type IdGenerator } from "../runtime";
import type {
  Stage4Event,
  Stage4PersistenceSidecars,
  Stage4Reduction,
  Stage4SessionState,
} from "./contracts";
import {
  operationResultAccepted,
  requireEventAllowed,
  rotateStage,
  Stage4TransitionError,
} from "./guards";
import {
  stage4EventSchema,
  stage4PersistenceSidecarsSchema,
  stage4SessionStateSchema,
} from "./schemas";
import { verifyStage4FinalEnvelopeIntegrity } from "./final-envelope";

export type Stage4ReducerPorts = Readonly<{
  clock: Clock;
  idGenerator: IdGenerator;
}>;

export async function reduceStage4Event(input: {
  state: Stage4SessionState;
  sidecars: Stage4PersistenceSidecars;
  event: Stage4Event;
  ports: Stage4ReducerPorts;
}): Promise<Stage4Reduction> {
  const state = stage4SessionStateSchema.parse(input.state);
  const sidecars = stage4PersistenceSidecarsSchema.parse(input.sidecars);
  const event = stage4EventSchema.parse(input.event);
  requireEventAllowed(state, event);
  const observedAt = input.ports.clock.now();

  if ("operationId" in event && !operationResultAccepted(state, event)) {
    return {
      state,
      sidecars,
      disposition: "ignored_stale_result",
      notice: "stale_or_mismatched_operation_result",
    };
  }

  let nextState = state;
  let nextSidecars = sidecars;
  let notice: string | null = null;

  switch (event.eventType) {
    case "START":
      nextState = move(state, "PORTRAIT_PRELUDE", input.ports);
      break;
    case "SET_PORTRAIT_DESCRIPTORS":
      nextState = move(
        { ...state, portraitDescriptors: event.descriptors },
        "PORTRAIT_CHOICE",
        input.ports,
      );
      break;
    case "CHOOSE_INITIAL_PORTRAIT":
      nextState = {
        ...state,
        portraits: { ...state.portraits, initialRecord: null },
      };
      nextSidecars = { ...nextSidecars, pendingInitialChoice: event.choice };
      break;
    case "SUBMIT_INITIAL_REASON": {
      const initialChoice = nextSidecars.pendingInitialChoice;
      if (initialChoice === null) {
        throw transition("initial_portrait_choice_missing");
      }
      const descriptors = {
        early: state.portraitDescriptors
          .filter(({ stage }) => stage === "early")
          .map(({ label }) => label),
        peak: state.portraitDescriptors
          .filter(({ stage }) => stage === "peak")
          .map(({ label }) => label),
        futureFacing: state.portraitDescriptors
          .filter(({ stage }) => stage === "futureFacing")
          .map(({ label }) => label),
      };
      nextState = move(
        {
          ...state,
          portraits: {
            ...state.portraits,
            initialRecord: { descriptors, initialChoice, initialReason: event.reason },
          },
        },
        "ROUND_1_PAST_SELF",
        input.ports,
      );
      nextSidecars = { ...nextSidecars, pendingInitialChoice: null };
      break;
    }
    case "SUBMIT_RESPONSE": {
      requireRoundEvent(state, event.roundId);
      const round = state.rounds[event.roundId];
      if (round.responseSubmitted) throw transition("round_response_already_submitted");
      nextState = {
        ...state,
        rounds: {
          ...state.rounds,
          [event.roundId]: { ...round, responseSubmitted: true },
        },
      };
      nextSidecars = upsertPrivateRound(nextSidecars, event.roundId, {
        response: event.response,
        clarification: null,
      });
      break;
    }
    case "SUBMIT_CLARIFICATION": {
      requireRoundEvent(state, event.roundId);
      const round = state.rounds[event.roundId];
      if (!round.responseSubmitted) throw transition("round_response_missing");
      if (round.clarificationCount >= 1) throw transition("clarification_limit_reached");
      requireOperationForCurrentState(state, event.operation, "executeRoundAnalysis");
      nextState = {
        ...state,
        rounds: {
          ...state.rounds,
          [event.roundId]: { ...round, clarificationCount: 1 },
        },
        runtime: { ...state.runtime, activeOperation: event.operation },
      };
      nextSidecars = upsertPrivateRound(nextSidecars, event.roundId, {
        clarification: event.clarification,
      });
      break;
    }
    case "CONTINUE_WITHOUT_CLARIFICATION": {
      requireRoundEvent(state, event.roundId);
      if (!state.rounds[event.roundId].responseSubmitted) {
        throw transition("round_response_missing");
      }
      requireOperationForCurrentState(state, event.operation, "executeRoundAnalysis");
      nextState = {
        ...state,
        runtime: { ...state.runtime, activeOperation: event.operation },
      };
      break;
    }
    case "ROUND_ANALYSIS_BUNDLE_RESOLVED": {
      const roundId = roundForStage(state.stage);
      if (roundId === null || event.bundle.roundId !== roundId) {
        throw transition("round_bundle_stage_mismatch");
      }
      const proposal = event.bundle.documentDiff.proposal;
      const roundState = state.rounds[roundId];
      const base = {
        ...state,
        runtime: { ...state.runtime, activeOperation: null },
        userPrinciples: [...state.userPrinciples, event.bundle.principle.principle],
        charliePositions: [
          ...state.charliePositions,
          event.bundle.charlieResponse.charliePosition,
        ],
        charlieResponses: [
          ...state.charlieResponses,
          event.bundle.charlieResponse.charlieResponse,
        ],
        provenance: appendReceipts(state, event.receipts),
        manuscript: {
          ...state.manuscript,
          pendingDiff: proposal.kind === "diff" ? proposal.diff : null,
        },
      };
      if (proposal.kind === "no_change") {
        nextState = move(
          {
            ...base,
            rounds: {
              ...base.rounds,
              [roundId]: { ...roundState, completed: true },
            },
          },
          nextRoundStage(roundId),
          input.ports,
        );
        notice = `no_change:${proposal.reason}`;
      } else {
        nextState = move(base, diffStage(roundId), input.ports);
      }
      break;
    }
    case "ROUND_ANALYSIS_BUNDLE_FAILED":
      nextState = { ...state, runtime: { ...state.runtime, activeOperation: null } };
      nextSidecars = withRuntimeFailure(nextSidecars, event.error);
      notice = event.error.code;
      break;
    case "ACCEPT_DIFF": {
      const roundId = roundForDiffStage(state.stage);
      if (roundId === null) throw transition("diff_stage_required");
      const processed = await acceptPendingDiff({
        manuscript: state.manuscript,
        diffId: event.diffId,
        confirmedAt: observedAt,
        nextRevisionId: event.nextRevisionId,
      });
      nextState = completeRoundAfterDiff(
        { ...state, manuscript: processed.manuscript },
        roundId,
        input.ports,
      );
      break;
    }
    case "REJECT_DIFF": {
      const roundId = roundForDiffStage(state.stage);
      if (roundId === null) throw transition("diff_stage_required");
      const pendingDiff = state.manuscript.pendingDiff;
      const principle = [...state.userPrinciples]
        .reverse()
        .find((candidate) => candidate.roundId === roundId);
      const charliePosition = [...state.charliePositions]
        .reverse()
        .find((candidate) => candidate.roundId === roundId);
      const processed = rejectPendingDiff({
        manuscript: state.manuscript,
        diffId: event.diffId,
        confirmedAt: observedAt,
      });
      nextState = completeRoundAfterDiff(
        {
          ...state,
          manuscript: processed.manuscript,
          openDissents:
            pendingDiff !== null && principle && charliePosition
              ? [
                  ...state.openDissents,
                  {
                    id: event.transitionId,
                    roundId,
                    charliePositionId: charliePosition.id,
                    userPrincipleId: principle.id,
                    focus: pendingDiff.reason,
                    status: "open" as const,
                  },
                ]
              : state.openDissents,
        },
        roundId,
        input.ports,
      );
      break;
    }
    case "PLAIN_SEMANTIC_BUNDLE_RESOLVED": {
      const bundle = event.bundle;
      const beforeHash = await import("../domain").then(({ sha256NfcUtf8 }) =>
        sha256NfcUtf8(state.manuscript.preciseText),
      );
      const afterHash = await import("../domain").then(({ sha256NfcUtf8 }) =>
        sha256NfcUtf8(bundle.plainRevision.plainText),
      );
      const manuscript = {
        ...state.manuscript,
        plainText: bundle.plainRevision.plainText,
        plainRevisionId: bundle.plainRevision.plainRevisionId,
        revisionHistory: [
          ...state.manuscript.revisionHistory,
          {
            revisionId: bundle.plainRevision.plainRevisionId,
            parentRevisionId: state.manuscript.preciseRevisionId,
            documentTarget: "plain_text" as const,
            beforeTextHash: beforeHash,
            afterTextHash: afterHash,
            changeKind: "plain_rewrite" as const,
            sourceDiffId: null,
            reason: "Validated atomic plain and semantic bundle",
            createdAt: observedAt,
          },
        ],
      };
      const proposals = bundle.restorationOutcomes.flatMap((outcome) =>
        outcome.kind === "proposal" ? [outcome.proposal] : [],
      );
      const committed = {
        ...state,
        manuscript,
        semanticDrift: bundle.semanticReview.drift,
        semanticFragments: bundle.semanticReview.semanticFragments,
        semanticRestorationProposals: proposals,
        semanticPlacementBatch: null,
        provenance: appendReceipts(state, event.receipts),
        runtime: { ...state.runtime, activeOperation: null },
      };
      nextSidecars = {
        ...sidecars,
        restorationOutcomes: bundle.restorationOutcomes,
      };
      if (committed.semanticFragments.length === 0) {
        nextState = move(committed, postSemanticTarget(state), input.ports);
      } else {
        const started = createSemanticPlacementBatch({
          batchId: input.ports.idGenerator.next("transition"),
          drift: committed.semanticDrift,
          fragments: committed.semanticFragments,
          createdAt: observedAt,
        });
        nextState = move(
          {
            ...committed,
            semanticDrift: started.drift,
            semanticPlacementBatch: started.batch,
          },
          "SEMANTIC_PLACEMENT",
          input.ports,
        );
      }
      break;
    }
    case "PLAIN_SEMANTIC_BUNDLE_FAILED":
      nextState = { ...state, runtime: { ...state.runtime, activeOperation: null } };
      nextSidecars = withRuntimeFailure(nextSidecars, event.error);
      notice = event.error.code;
      break;
    case "CHOOSE_FRAGMENT_PLACEMENT": {
      const batch = requireBatch(state);
      const fragmentIndex = state.semanticFragments.findIndex(
        ({ id }) => id === event.fragmentId,
      );
      if (fragmentIndex < 0) throw transition("semantic_fragment_missing");
      const selected = selectSemanticFragmentPlacement({
        batch,
        fragment: state.semanticFragments[fragmentIndex],
        placement: event.placement,
        selectedAt: observedAt,
        ...(event.bouquetEntryId === undefined
          ? {}
          : { bouquetEntryId: event.bouquetEntryId }),
      });
      const fragments = [...state.semanticFragments];
      fragments[fragmentIndex] = selected.fragment;
      nextState = {
        ...state,
        semanticPlacementBatch: selected.batch,
        semanticFragments: fragments,
        bouquet:
          selected.bouquetEntry === null
            ? state.bouquet
            : [...state.bouquet, selected.bouquetEntry],
      };
      if (event.placement === "restored_to_plain_text") {
        const outcome = sidecars.restorationOutcomes.find(
          (candidate) =>
            typeof candidate === "object" &&
            candidate !== null &&
            "fragmentId" in candidate &&
            candidate.fragmentId === event.fragmentId,
        ) as
          | { kind: "proposal"; proposal: Stage4SessionState["semanticRestorationProposals"][number] }
          | { kind: "unavailable"; reason: string }
          | undefined;
        if (outcome?.kind === "proposal") {
          const attached = await attachSemanticRestorationProposal({
            batch: selected.batch,
            fragment: selected.fragment,
            proposal: outcome.proposal,
          });
          nextState = {
            ...nextState,
            semanticPlacementBatch: attached.batch,
            semanticRestorationProposals: replaceProposal(
              state.semanticRestorationProposals,
              attached.proposal,
            ),
          };
          notice = attached.kind === "stale" ? attached.reason : null;
        } else {
          notice = `restoration_unavailable:${outcome?.reason ?? "not_produced"}`;
        }
      }
      break;
    }
    case "CONFIRM_SEMANTIC_RESTORATION_PROPOSAL": {
      const batch = requireBatch(state);
      const proposal = state.semanticRestorationProposals.find(
        ({ proposalId }) => proposalId === event.proposalId,
      );
      if (!proposal || state.manuscript.plainText === null || state.manuscript.plainRevisionId === null) {
        throw transition("restoration_proposal_missing");
      }
      const confirmed = await import("../domain").then(
        ({ confirmSemanticRestorationProposal }) =>
          confirmSemanticRestorationProposal({
            batch,
            proposal,
            currentPlainText: state.manuscript.plainText!,
            currentPlainRevisionId: state.manuscript.plainRevisionId!,
            confirmedAt: observedAt,
          }),
      );
      if (confirmed.kind === "stale") {
        nextState = {
          ...state,
          semanticPlacementBatch: confirmed.batch,
          semanticRestorationProposals: replaceProposal(
            state.semanticRestorationProposals,
            confirmed.proposal,
          ),
        };
        notice = confirmed.reason;
        break;
      }
      const fragmentIndex = state.semanticFragments.findIndex(
        ({ id }) => id === confirmed.proposal.fragmentId,
      );
      if (fragmentIndex < 0) throw transition("semantic_fragment_missing");
      const applied = await applyConfirmedSemanticRestoration({
        manuscript: state.manuscript,
        batch: confirmed.batch,
        fragment: state.semanticFragments[fragmentIndex],
        proposal: confirmed.proposal,
        nextPlainRevisionId: event.nextPlainRevisionId,
        appliedAt: observedAt,
      });
      const fragments = [...state.semanticFragments];
      fragments[fragmentIndex] = applied.fragment;
      nextState = {
        ...state,
        manuscript: applied.manuscript,
        semanticPlacementBatch: applied.batch,
        semanticFragments: fragments,
        semanticRestorationProposals: replaceProposal(
          state.semanticRestorationProposals,
          applied.proposal,
        ),
      };
      notice = applied.kind === "stale" ? applied.reason : null;
      break;
    }
    case "REJECT_SEMANTIC_RESTORATION_PROPOSAL": {
      const batch = requireBatch(state);
      const proposal = state.semanticRestorationProposals.find(
        ({ proposalId }) => proposalId === event.proposalId,
      );
      if (!proposal) throw transition("restoration_proposal_missing");
      nextState = {
        ...state,
        semanticPlacementBatch: semanticPlacementBatchSchema.parse({
          ...batch,
          decisions: batch.decisions.filter(
            ({ fragmentId }) => fragmentId !== proposal.fragmentId,
          ),
          confirmedRestorationProposalIds:
            batch.confirmedRestorationProposalIds.filter(
              (proposalId) => proposalId !== proposal.proposalId,
            ),
        }),
      };
      break;
    }
    case "POST_PLACEMENT_CHECK_SUCCEEDED": {
      const batch = requireBatch(state);
      const finished = completePlacementConsistencyCheck({
        batch,
        previousDrift: state.semanticDrift!,
        nextDrift: event.nextDrift,
        fragments: state.semanticFragments,
        currentPreciseRevisionId: state.manuscript.preciseRevisionId,
        currentPlainRevisionId: state.manuscript.plainRevisionId!,
        completedAt: observedAt,
      });
      nextState = move(
        {
          ...state,
          semanticPlacementBatch: finished.batch,
          semanticDrift: finished.drift,
          runtime: { ...state.runtime, activeOperation: null },
        },
        postSemanticTarget(state),
        input.ports,
      );
      break;
    }
    case "POST_PLACEMENT_CHECK_FAILED": {
      const batch = requireBatch(state);
      nextState = {
        ...state,
        semanticPlacementBatch: semanticPlacementBatchSchema.parse({
          ...batch,
          status: "in_progress",
        }),
        runtime: { ...state.runtime, activeOperation: null },
      };
      nextSidecars = withRuntimeFailure(nextSidecars, event.error);
      break;
    }
    case "CHOOSE_FINAL_PORTRAIT":
      nextState = {
        ...state,
        portraits: { ...state.portraits, finalChoice: event.choice },
      };
      break;
    case "SUBMIT_FINAL_REASON":
    case "CONTINUE_WITHOUT_FINAL_REASON": {
      if (state.portraits.finalChoice === null) throw transition("final_portrait_missing");
      requireOperationForCurrentState(state, event.operation, "computePortraitShift");
      nextState = {
        ...state,
        portraits: {
          ...state.portraits,
          finalReason:
            event.eventType === "SUBMIT_FINAL_REASON" ? event.reason : null,
        },
        runtime: { ...state.runtime, activeOperation: event.operation },
      };
      break;
    }
    case "PORTRAIT_SHIFT_COMPUTED":
      nextState = {
        ...state,
        portraits: { ...state.portraits, comparison: event.comparison },
        provenance: appendReceipts(state, [event.receipt]),
        runtime: { ...state.runtime, activeOperation: null },
      };
      break;
    case "PORTRAIT_SHIFT_SUMMARY_RESOLVED":
      nextState = move(
        {
          ...state,
          portraitShiftSummary: event.result.summary,
          provenance: appendReceipts(state, event.receipts),
          runtime: { ...state.runtime, activeOperation: null },
        },
        "FINAL_SIGNATURE",
        input.ports,
      );
      break;
    case "PORTRAIT_SHIFT_SUMMARY_FAILED":
      nextState = { ...state, runtime: { ...state.runtime, activeOperation: null } };
      nextSidecars = withRuntimeFailure(nextSidecars, event.error);
      break;
    case "REQUEST_CHARLIE_SIGNATURE_REVIEW": {
      requireOperationForCurrentState(
        state,
        event.operation,
        "executeCharlieSignatureReview",
      );
      const begun = await beginSignatureReview({
        state: signatureSlice(state),
        manuscript: state.manuscript,
        fingerprintMaterial: event.fingerprintMaterial,
        buildInputFingerprint: async () => event.operation.inputFingerprint,
        requestId: event.operation.requestId,
      });
      nextState = {
        ...state,
        ...begun.state,
        runtime: { ...state.runtime, activeOperation: event.operation },
      };
      break;
    }
    case "RETRY_CHARLIE_SIGNATURE_REVIEW": {
      requireOperationForCurrentState(
        state,
        event.operation,
        "executeCharlieSignatureReview",
      );
      const retried = await retryUnavailableSignatureReview({
        state: signatureSlice(state),
        fingerprintMaterial: event.fingerprintMaterial,
        buildInputFingerprint: async () => event.operation.inputFingerprint,
        requestId: event.operation.requestId,
      });
      nextState = {
        ...state,
        ...retried.state,
        runtime: { ...state.runtime, activeOperation: event.operation },
      };
      break;
    }
    case "CHARLIE_SIGNATURE_REVIEW_RESOLVED": {
      const snapshot = signatureReviewSnapshotSchema.parse({
        snapshotKind: "reviewed",
        status: event.result.status,
        preciseRevisionId: event.result.preciseRevisionId,
        plainRevisionId: event.result.plainRevisionId,
        contentBundleId: event.result.contentBundleId,
        contentBundleVersion: event.result.contentBundleVersion,
        contentBundleChecksum: event.result.contentBundleChecksum,
        finalReviewSchemaVersion: event.result.finalReviewSchemaVersion,
        evidenceIds: event.result.evidenceIds,
        inputFingerprint: event.inputFingerprint,
        requestId: event.requestId,
        reason: event.result.reason,
        reviewedAt: observedAt,
        resultDigest: event.receipts[0]?.resultDigest ?? null,
      });
      nextState = move(
        {
          ...state,
          ...applySignatureReviewSnapshot({ state: signatureSlice(state), snapshot }),
          provenance: appendReceipts(state, event.receipts),
          runtime: { ...state.runtime, activeOperation: null },
        },
        "FINAL_DISPOSITION",
        input.ports,
      );
      break;
    }
    case "CHARLIE_SIGNATURE_REVIEW_FAILED": {
      const attempt = state.signatureReviewAttemptState;
      if (!attempt || state.manuscript.plainRevisionId === null) {
        throw transition("signature_attempt_missing");
      }
      const snapshot = signatureReviewSnapshotSchema.parse({
        snapshotKind: "unavailable",
        status: "unavailable",
        preciseRevisionId: state.manuscript.preciseRevisionId,
        plainRevisionId: state.manuscript.plainRevisionId,
        contentBundleId: state.contentBinding.contentBundleId,
        contentBundleVersion: state.contentBinding.contentBundleVersion,
        contentBundleChecksum: state.contentBinding.contentBundleChecksum,
        finalReviewSchemaVersion:
          state.provenance.contractVersionVector.finalReviewSchemaVersion,
        evidenceIds: [],
        inputFingerprint: attempt.inputFingerprint,
        requestId: event.requestId,
        failureCode: event.error.code,
        summary: event.error.message,
        retryable: event.error.retryable,
        unavailableAt: observedAt,
      });
      nextState = {
        ...state,
        ...applySignatureReviewSnapshot({ state: signatureSlice(state), snapshot }),
        provenance: appendReceipts(state, event.receipts),
        runtime: { ...state.runtime, activeOperation: null },
      };
      break;
    }
    case "CONTINUE_WITHOUT_SIGNATURE_REVIEW":
      nextState =
        state.currentCharlieSignatureStatus === "unavailable"
          ? move(state, "FINAL_DISPOSITION", input.ports)
          : move(
              {
                ...state,
                ...skipUnrequestedSignatureReview(signatureSlice(state)),
              },
              "FINAL_DISPOSITION",
              input.ports,
            );
      break;
    case "RETURN_TO_MANUSCRIPT_REVIEW": {
      const entered = enterManuscriptRevisionFromSignature({ state });
      nextState = move({ ...state, ...entered.state }, entered.nextStage, input.ports);
      break;
    }
    case "CANCEL_MANUSCRIPT_REVISION": {
      const cancelled = cancelSignatureBoundManuscriptRevision({ state });
      nextState = move({ ...state, ...cancelled.state }, cancelled.nextStage, input.ports);
      break;
    }
    case "SUBMIT_MANUSCRIPT_REVISION": {
      const submitted = await submitSignatureBoundManuscriptRevision({
        state,
        draftPreciseText: event.draftPreciseText,
        nextRevisionId: event.nextRevisionId,
        submittedAt: observedAt,
        reason: event.reason,
      });
      nextState = move({ ...state, ...submitted.state }, submitted.nextStage, input.ports);
      break;
    }
    case "CHOOSE_DISPOSITION": {
      if (state.runtime.activeOperation !== null) {
        throw transition("active_operation_present");
      }
      const candidate = {
        ...state,
        finalDisposition: event.disposition,
      };
      const result = evaluateFinalization(candidate, event.finalizationContext);
      if (!result.eligible) {
        nextState = candidate;
        notice = result.blockers.map(({ code }) => code).join(",");
        break;
      }
      const staged = move(candidate, "FINALIZING", input.ports);
      requireOperationForCurrentState(staged, event.operation, "persistFinalEnvelope");
      nextState = {
        ...staged,
        lifecycleStatus: "finalizing",
        runtime: { ...staged.runtime, activeOperation: event.operation },
      };
      break;
    }
    case "FINAL_ENVELOPE_PERSISTED":
      await requireFinalEnvelopeMatchesState(state, event.envelope);
      nextState = (() => {
        const completed = move(state, "COMPLETE", input.ports);
        return {
        ...completed,
        lifecycleStatus: "complete",
        finalEnvelope: event.envelope,
        completedAt: observedAt,
        runtime: {
          stageInstanceId: completed.stageInstanceId,
          activeOperation: null,
        },
      };
      })();
      break;
    case "FINAL_ENVELOPE_PERSIST_FAILED":
      nextState = {
        ...move(state, "FINAL_DISPOSITION", input.ports),
        lifecycleStatus: "in_progress",
        finalEnvelope: null,
      };
      nextSidecars = withRuntimeFailure(nextSidecars, event.error);
      break;
    default:
      throw transition(`unhandled_event:${(event as { eventType: string }).eventType}`);
  }

  nextState = stage4SessionStateSchema.parse({
    ...nextState,
    stateRevision: state.stateRevision + 1,
    updatedAt: observedAt,
    expiresAt:
      nextState.lifecycleStatus === "complete"
        ? nextState.expiresAt
        : new Date(Date.parse(observedAt) + 24 * 60 * 60 * 1000).toISOString(),
  });
  return {
    state: nextState,
    sidecars: stage4PersistenceSidecarsSchema.parse(nextSidecars),
    disposition: "applied",
    notice,
  };
}

export function activateStage4Operation(input: {
  state: Stage4SessionState;
  operation: NonNullable<Stage4SessionState["runtime"]["activeOperation"]>;
  expectedCapability: string;
}): Stage4SessionState {
  const state = stage4SessionStateSchema.parse(input.state);
  requireOperationForCurrentState(state, input.operation, input.expectedCapability);
  if (state.runtime.activeOperation !== null) {
    throw transition("active_operation_present");
  }
  return stage4SessionStateSchema.parse({
    ...state,
    runtime: { ...state.runtime, activeOperation: input.operation },
  });
}

export function beginPostPlacementConsistencyOperation(input: {
  state: Stage4SessionState;
  operation: NonNullable<Stage4SessionState["runtime"]["activeOperation"]>;
}): Stage4SessionState {
  const state = activateStage4Operation({
    ...input,
    expectedCapability: "checkPostPlacementConsistency",
  });
  return stage4SessionStateSchema.parse({
    ...state,
    semanticPlacementBatch: beginPlacementConsistencyCheck(requireBatch(state)),
  });
}

function move(
  state: Stage4SessionState,
  nextStage: ExperienceStage,
  ports: Stage4ReducerPorts,
): Stage4SessionState {
  return rotateStage(state, nextStage, ports.idGenerator.next("stage_instance"));
}

function requireOperationForCurrentState(
  state: Stage4SessionState,
  operation: NonNullable<Stage4SessionState["runtime"]["activeOperation"]>,
  capability: string,
): void {
  if (state.runtime.activeOperation !== null) {
    throw transition("active_operation_present");
  }
  if (
    operation.status !== "running" ||
    operation.capability !== capability ||
    operation.stage !== state.stage ||
    operation.stageInstanceId !== state.stageInstanceId ||
    !operationBindingsMatchStage(operation, state)
  ) {
    throw transition("active_operation_binding_mismatch");
  }
}

function operationBindingsMatchStage(
  operation: NonNullable<Stage4SessionState["runtime"]["activeOperation"]>,
  state: Stage4SessionState,
): boolean {
  const expected = {
      revisions: {
        preciseRevisionId: state.manuscript.preciseRevisionId,
        plainRevisionId: state.manuscript.plainRevisionId,
      },
      content: {
        contentBundleId: state.contentBinding.contentBundleId,
        contentBundleVersion: state.contentBinding.contentBundleVersion,
        contentBundleChecksum: state.contentBinding.contentBundleChecksum,
      },
    };
  if (operation.capability !== "executePlainSemanticReview") {
    return operationBindingsEqual(operation.bindings, expected);
  }
  return (
    operation.bindings.revisions.preciseRevisionId ===
      expected.revisions.preciseRevisionId &&
    operation.bindings.revisions.plainRevisionId !== null &&
    operationBindingsEqual(
      { ...operation.bindings, revisions: expected.revisions },
      expected,
    )
  );
}

function completeRoundAfterDiff(
  state: Stage4SessionState,
  roundId: RoundId,
  ports: Stage4ReducerPorts,
): Stage4SessionState {
  return move(
    {
      ...state,
      rounds: {
        ...state.rounds,
        [roundId]: { ...state.rounds[roundId], completed: true },
      },
    },
    nextRoundStage(roundId),
    ports,
  );
}

function roundForStage(stage: ExperienceStage): RoundId | null {
  if (stage === "ROUND_1_PAST_SELF") return "round1";
  if (stage === "ROUND_2_FORECAST") return "round2";
  if (stage === "ROUND_3_RELATIONSHIP") return "round3";
  return null;
}

function roundForDiffStage(stage: ExperienceStage): RoundId | null {
  if (stage === "ROUND_1_DIFF") return "round1";
  if (stage === "ROUND_2_DIFF") return "round2";
  if (stage === "ROUND_3_DIFF") return "round3";
  return null;
}

function requireRoundEvent(state: Stage4SessionState, roundId: RoundId): void {
  if (roundForStage(state.stage) !== roundId) throw transition("round_order_mismatch");
}

function diffStage(roundId: RoundId): ExperienceStage {
  return roundId === "round1"
    ? "ROUND_1_DIFF"
    : roundId === "round2"
      ? "ROUND_2_DIFF"
      : "ROUND_3_DIFF";
}

function nextRoundStage(roundId: RoundId): ExperienceStage {
  return roundId === "round1"
    ? "ROUND_2_FORECAST"
    : roundId === "round2"
      ? "ROUND_3_RELATIONSHIP"
      : "PLAIN_REWRITE";
}

function postSemanticTarget(state: Stage4SessionState): ExperienceStage {
  return state.portraits.finalChoice === null
    ? "PORTRAIT_REASSEMBLY"
    : "FINAL_SIGNATURE";
}

function requireBatch(state: Stage4SessionState) {
  if (state.semanticPlacementBatch === null || state.semanticDrift === null) {
    throw transition("semantic_placement_batch_missing");
  }
  return state.semanticPlacementBatch;
}

function appendReceipts(
  state: Stage4SessionState,
  receipts: Stage4SessionState["provenance"]["capabilityExecutionReceipts"],
) {
  return {
    ...state.provenance,
    capabilityExecutionReceipts: [
      ...state.provenance.capabilityExecutionReceipts,
      ...receipts,
    ],
  };
}

function signatureSlice(state: Stage4SessionState) {
  return {
    currentCharlieSignatureStatus: state.currentCharlieSignatureStatus,
    currentCharlieSignatureReview: state.currentCharlieSignatureReview,
    signatureReviewAttemptState: state.signatureReviewAttemptState,
  };
}

function replaceProposal(
  proposals: Stage4SessionState["semanticRestorationProposals"],
  proposal: Stage4SessionState["semanticRestorationProposals"][number],
) {
  const existing = proposals.findIndex(
    ({ proposalId }) => proposalId === proposal.proposalId,
  );
  if (existing < 0) return [...proposals, proposal];
  const next = [...proposals];
  next[existing] = proposal;
  return next;
}

function upsertPrivateRound(
  sidecars: Stage4PersistenceSidecars,
  roundId: RoundId,
  patch: Partial<{ response: string; clarification: string | null }>,
): Stage4PersistenceSidecars {
  const existing = sidecars.privateInputs.rounds.find(
    (round) => round.roundId === roundId,
  );
  if (existing === undefined && patch.response === undefined) {
    throw transition("private_round_response_missing");
  }
  const next = {
    roundId,
    response: patch.response ?? existing!.response,
    clarification:
      patch.clarification === undefined
        ? (existing?.clarification ?? null)
        : patch.clarification,
  };
  return {
    ...sidecars,
    privateInputs: {
      ...sidecars.privateInputs,
      rounds: [
        ...sidecars.privateInputs.rounds.filter((round) => round.roundId !== roundId),
        next,
      ],
    },
  };
}

function withRuntimeFailure(
  sidecars: Stage4PersistenceSidecars,
  error: { code: string; summary: string; retryable: boolean },
): Stage4PersistenceSidecars {
  return {
    ...sidecars,
    runtimeFailures: [...sidecars.runtimeFailures, error],
  };
}

function transition(code: string): Stage4TransitionError {
  return new Stage4TransitionError(code, code.replaceAll("_", " "));
}

async function requireFinalEnvelopeMatchesState(
  state: Stage4SessionState,
  envelope: NonNullable<Stage4SessionState["finalEnvelope"]>,
): Promise<void> {
  if (!(await verifyStage4FinalEnvelopeIntegrity(envelope))) {
    throw transition("final_envelope_integrity_mismatch");
  }
  if (
    envelope.sessionId !== state.sessionId ||
    envelope.manuscript.preciseRevisionId !==
      state.manuscript.preciseRevisionId ||
    envelope.manuscript.plainRevisionId !== state.manuscript.plainRevisionId ||
    envelope.semantics.drift.preciseRevisionId !==
      state.manuscript.preciseRevisionId ||
    envelope.semantics.drift.plainRevisionId !==
      state.manuscript.plainRevisionId ||
    envelope.signature.currentStatus !== state.currentCharlieSignatureStatus ||
    envelope.finalDisposition !== state.finalDisposition
  ) {
    throw transition("final_envelope_binding_mismatch");
  }
}
