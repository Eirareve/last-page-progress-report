import type { z } from "zod";

import { canonicalizeJson } from "../content/canonical-json";
import {
  FINAL_ENVELOPE_SCHEMA_VERSION,
  finalEnvelopeContentSnapshotSchema,
  sha256NfcUtf8,
} from "../domain";
import type { Clock, IdGenerator } from "../runtime";
import type { Stage4FinalEnvelope, Stage4SessionState } from "./contracts";
import { stage4FinalEnvelopeSchema } from "./schemas";

export async function buildStage4FinalEnvelope(input: {
  state: Stage4SessionState;
  contentSnapshot: z.infer<typeof finalEnvelopeContentSnapshotSchema>;
  clock: Clock;
  idGenerator: IdGenerator;
}): Promise<Stage4FinalEnvelope> {
  const state = input.state;
  const contentSnapshot = finalEnvelopeContentSnapshotSchema.parse(
    input.contentSnapshot,
  );
  if (
    state.stage !== "FINALIZING" ||
    state.lifecycleStatus !== "finalizing" ||
    state.manuscript.plainText === null ||
    state.manuscript.plainRevisionId === null ||
    state.semanticDrift === null ||
    state.portraits.initialRecord === null ||
    state.portraits.finalChoice === null ||
    state.portraits.comparison === null ||
    state.portraitShiftSummary === null ||
    state.finalDisposition === null
  ) {
    throw new TypeError("A complete FINALIZING aggregate is required");
  }
  if (
    Object.entries(state.contentBinding).some(
      ([field, value]) =>
        contentSnapshot.binding[
          field as keyof typeof contentSnapshot.binding
        ] !== value,
    )
  ) {
    throw new TypeError("FinalEnvelope content snapshot must match Session binding");
  }
  if (
    !state.contentItemsUsed.some(
      ({ id, contentType }) =>
        id === contentSnapshot.originalInteraction.item.id &&
        contentType === "ORIGINAL_INTERACTION",
    )
  ) {
    throw new TypeError(
      "FinalEnvelope original interaction must be attributed by the Session",
    );
  }
  const payload = {
    finalEnvelopeId: input.idGenerator.next("final_envelope"),
    finalEnvelopeSchemaVersion: FINAL_ENVELOPE_SCHEMA_VERSION,
    sessionId: state.sessionId,
    generatedAt: input.clock.now(),
    contentSnapshot,
    sessionConfiguration: state.configuration,
    manuscript: {
      preciseText: state.manuscript.preciseText,
      preciseRevisionId: state.manuscript.preciseRevisionId,
      plainText: state.manuscript.plainText,
      plainRevisionId: state.manuscript.plainRevisionId,
      revisionHistory: state.manuscript.revisionHistory,
    },
    semantics: {
      drift: state.semanticDrift,
      fragments: state.semanticFragments,
      bouquet: state.bouquet,
    },
    portraits: {
      descriptors: state.portraitDescriptors,
      initialRecord: state.portraits.initialRecord,
      finalChoice: state.portraits.finalChoice,
      finalReason: state.portraits.finalReason,
      comparison: state.portraits.comparison,
      shiftSummary: state.portraitShiftSummary,
    },
    openDissents: state.openDissents,
    signature: {
      currentStatus: state.currentCharlieSignatureStatus,
      currentReview: state.currentCharlieSignatureReview,
      futureStatus: state.futureCharlieSignatureStatus,
    },
    finalDisposition: state.finalDisposition,
    contentAttribution: {
      evidenceCards: state.evidenceUsed,
      contentItems: state.contentItemsUsed,
    },
    executionProvenance: state.provenance,
  };
  const integrityChecksum = await sha256NfcUtf8(canonicalizeJson(payload));
  return stage4FinalEnvelopeSchema.parse({ ...payload, integrityChecksum });
}

export async function verifyStage4FinalEnvelopeIntegrity(
  envelope: Stage4FinalEnvelope,
): Promise<boolean> {
  const parsed = stage4FinalEnvelopeSchema.parse(envelope);
  const { integrityChecksum, ...payload } = parsed;
  return (await sha256NfcUtf8(canonicalizeJson(payload))) === integrityChecksum;
}
