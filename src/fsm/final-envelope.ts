import type { z } from "zod";

import { canonicalizeJson } from "../content/canonical-json";
import {
  FINAL_ENVELOPE_SCHEMA_VERSION,
  finalEnvelopeSchema,
  sha256NfcUtf8,
} from "../domain";
import type { Clock, IdGenerator } from "../runtime";
import type { Stage4SessionState } from "./contracts";

export async function buildStage4FinalEnvelope(input: {
  state: Stage4SessionState;
  clock: Clock;
  idGenerator: IdGenerator;
}): Promise<z.infer<typeof finalEnvelopeSchema>> {
  const state = input.state;
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
  const payload = {
    finalEnvelopeId: input.idGenerator.next("final_envelope"),
    finalEnvelopeSchemaVersion: FINAL_ENVELOPE_SCHEMA_VERSION,
    sessionId: state.sessionId,
    generatedAt: input.clock.now(),
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
  return finalEnvelopeSchema.parse({ ...payload, integrityChecksum });
}

export async function verifyStage4FinalEnvelopeIntegrity(
  envelope: z.infer<typeof finalEnvelopeSchema>,
): Promise<boolean> {
  const parsed = finalEnvelopeSchema.parse(envelope);
  const { integrityChecksum, ...payload } = parsed;
  return (await sha256NfcUtf8(canonicalizeJson(payload))) === integrityChecksum;
}
