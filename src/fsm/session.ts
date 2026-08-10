import { stage3BudgetUsageSchema } from "../application";
import {
  manuscriptStateSchema,
  originalInteractionSchema,
  portraitPreludeSchema,
  sessionStateSchema,
  type PortraitDescriptor,
} from "../domain";
import type { FinalizationProvenanceState } from "../finalization";
import {
  runtimeStateSchema,
  sessionConfigurationSchema,
  type Clock,
  type IdGenerator,
  type SessionConfiguration,
} from "../runtime";
import type {
  Stage4PersistenceSidecars,
  Stage4SessionState,
} from "./contracts";
import {
  stage4PersistenceSidecarsSchema,
  stage4SessionStateSchema,
} from "./schemas";

export function createStage4Session(input: {
  contentBinding: Stage4SessionState["contentBinding"];
  originalInteraction: Stage4SessionState["contentItemsUsed"][number];
  preciseRevisionId: string;
  portraitDescriptors: readonly PortraitDescriptor[];
  configuration: SessionConfiguration;
  provenance: FinalizationProvenanceState;
  clock: Clock;
  idGenerator: IdGenerator;
}): { state: Stage4SessionState; sidecars: Stage4PersistenceSidecars } {
  const now = input.clock.now();
  const sessionId = input.idGenerator.next("session");
  const stageInstanceId = input.idGenerator.next("stage_instance");
  const configuration = sessionConfigurationSchema.parse(input.configuration);
  const originalInteraction = originalInteractionSchema.parse(
    input.originalInteraction,
  );
  const runtime = runtimeStateSchema.parse({
    stageInstanceId,
    activeOperation: null,
  });
  const base = sessionStateSchema.parse({
    sessionSchemaVersion: "0.1.0",
    sessionId,
    stateRevision: 0,
    lifecycleStatus: "in_progress",
    stage: "WELCOME",
    stageInstanceId,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(),
    completedAt: null,
    contentBinding: input.contentBinding,
    configuration,
    runtime,
    provenance: input.provenance,
    portraitDescriptors: input.portraitDescriptors,
    portraits: portraitPreludeSchema.parse({
      initialRecord: null,
      finalChoice: null,
      finalReason: null,
      comparison: null,
    }),
    manuscript: manuscriptStateSchema.parse({
      preciseText: originalInteraction.text,
      preciseRevisionId: input.preciseRevisionId,
      plainText: null,
      plainRevisionId: null,
      revisionHistory: [],
      diffAudit: [],
      pendingDiff: null,
      revisionIntent: null,
    }),
    rounds: {
      round1: emptyRound(),
      round2: emptyRound(),
      round3: emptyRound(),
    },
    userPrinciples: [],
    charliePositions: [],
    charlieResponses: [],
    openDissents: [],
    evidenceUsed: [],
    contentItemsUsed: [originalInteraction],
    semanticDrift: null,
    semanticPlacementBatch: null,
    semanticFragments: [],
    semanticRestorationProposals: [],
    bouquet: [],
    currentCharlieSignatureStatus: "hidden",
    currentCharlieSignatureReview: null,
    signatureReviewAttemptState: null,
    signatureReviewCheckpoint: null,
    futureCharlieSignatureStatus: "blank",
    finalDisposition: null,
    portraitShiftSummary: null,
    finalEnvelope: null,
  });
  const state = stage4SessionStateSchema.parse({
    ...base,
    configuration,
    runtime,
    provenance: input.provenance,
    finalEnvelope: null,
  });
  const sidecars = stage4PersistenceSidecarsSchema.parse({
    budgetUsage: stage3BudgetUsageSchema.parse({
      budgetVersion: "0.1.0",
      logicalCalls: [],
    }),
    privateInputs: { sessionId, rounds: [] },
    pendingInitialChoice: null,
    restorationOutcomes: [],
    runtimeFailures: [],
  });
  return { state, sidecars };
}
function emptyRound() {
  return { responseSubmitted: false, clarificationCount: 0, completed: false };
}
