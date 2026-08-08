import type {
  AgentContentBinding,
  AgentCandidateValidationContext,
  AgentProjectionContext,
  BuildDissentRecordInput,
  BuildInitialPortraitRecordInput,
  PlainSemanticReviewPortInput,
  RoundAnalysisPortInput,
  SummarizePortraitShiftInput,
} from "@/agent";
import { MOCK_AGENT_ADAPTER_VERSION } from "@/agent";
import {
  charliePositionSchema,
  charlieResponseSchema,
  computePortraitShift,
  userPrincipleSchema,
  verifiedFactSchema,
} from "@/domain";
import {
  serializableRequestContextSchema,
  type RequestContext,
} from "@/runtime";

export const AGENT_TEST_DIGEST = `sha256:${"a".repeat(64)}` as const;
export const AGENT_TEST_CONTENT_DIGEST = `sha256:${"b".repeat(64)}` as const;
export const AGENT_TEST_CREATED_AT = "2026-08-07T12:00:00.000Z";

export const AGENT_TEST_CONTENT_BINDING: AgentContentBinding = Object.freeze({
  contentBundleId: "agent-test-content",
  contentBundleVersion: "0.1.0",
  contentBundleChecksum: AGENT_TEST_CONTENT_DIGEST,
});

export const AGENT_TEST_FACT = verifiedFactSchema.parse({
  id: "fact-1",
  contentType: "VERIFIED_FACT",
  text: "Synthetic public test fact.",
  sourceReference: "source-location:v1:test",
  verifiedByHuman: true,
});

export const AGENT_TEST_PRINCIPLE = userPrincipleSchema.parse({
  id: "operation-1:principle",
  roundId: "round1",
  claim: "Context matters.",
  qualifiers: [],
  exceptions: [],
  evidenceIds: [AGENT_TEST_FACT.id],
});

export const AGENT_TEST_CHARLIE_POSITION = charliePositionSchema.parse({
  id: "operation-1:charlie-position",
  roundId: "round1",
  claim: "Uncertainty remains.",
  evidenceIds: [AGENT_TEST_FACT.id],
});

export const AGENT_TEST_CHARLIE_RESPONSE = charlieResponseSchema.parse({
  id: "operation-1:charlie-response",
  roundId: "round1",
  responseText: "I understand. What exception would change this?",
  evidenceIds: [AGENT_TEST_FACT.id],
});

export const AGENT_TEST_PROJECTION: AgentProjectionContext = Object.freeze({
  principleId: "stage3:v1:user_principle:0:operation-1",
  charliePositionId: "stage3:v1:charlie_position:0:operation-1",
  charlieResponseId: "stage3:v1:charlie_response:0:operation-1",
  documentDiffId: "stage3:v1:document_diff:0:operation-1",
  documentDiffCreatedAt: AGENT_TEST_CREATED_AT,
  plainRevisionId: "stage3:v1:plain_revision:0:operation-1",
  semanticFragmentIds: [],
});

export const AGENT_TEST_VALIDATION_CONTEXT: AgentCandidateValidationContext =
  Object.freeze({
    ...AGENT_TEST_PROJECTION,
    safetyPolicy: {
      prohibitedClaims: ["forbidden source claim"],
      prohibitedInferences: ["forbidden inference"],
      allowedQuotedText: [],
    },
  });

export function makeRoundAnalysisPortInput(): RoundAnalysisPortInput {
  return {
    contentBinding: AGENT_TEST_CONTENT_BINDING,
    revisions: {
      preciseRevisionId: "precise-r1",
      plainRevisionId: null,
    },
    extractUserPrinciple: {
      roundId: "round1",
      untrustedUserText: "I think context matters in this decision.",
      allowedEvidenceIds: [AGENT_TEST_FACT.id],
    },
    detectTension: {
      roundId: "round1",
      priorPrinciples: [],
      initialPortraitChoice: "early",
      charliePositions: [],
      preciseRevisionId: "precise-r1",
      preciseText: "Precise test text.",
      plainRevisionId: null,
      plainText: null,
      allowedEvidenceIds: [AGENT_TEST_FACT.id],
    },
    generateCharlieResponse: {
      roundId: "round1",
      preciseRevisionId: "precise-r1",
      preciseText: "Precise test text.",
      evidenceContext: {
        contentMode: "verified",
        verifiedFacts: [AGENT_TEST_FACT],
        allowedEvidenceIds: [AGENT_TEST_FACT.id],
      },
    },
    proposeDocumentDiff: {
      documentTarget: "precise_text",
      baseRevisionId: "precise-r1",
      currentText: "Precise test text.",
      allowedEvidenceIds: [AGENT_TEST_FACT.id],
    },
  };
}

export function makePlainSemanticPortInput(): PlainSemanticReviewPortInput {
  return {
    contentBinding: AGENT_TEST_CONTENT_BINDING,
    sourcePreciseRevisionId: "precise-r1",
    targetPlainRevisionId: AGENT_TEST_PROJECTION.plainRevisionId!,
    preciseText: "Precise test text.",
  };
}

export function makePortraitSummaryInput(): SummarizePortraitShiftInput {
  return {
    comparison: computePortraitShift({
      initialChoice: "early",
      finalChoice: "all_three",
      relatedEvidenceIds: [AGENT_TEST_FACT.id],
      relatedRevisionIds: ["precise-r1"],
    }),
    allowedEvidenceIds: [AGENT_TEST_FACT.id],
    allowedRevisionIds: ["precise-r1"],
  };
}

export function makeRequestContext(
  overrides: Partial<RequestContext> = {},
): RequestContext {
  return {
    ...serializableRequestContextSchema.parse({
      operationId: "operation-1",
      requestId: "request-1",
      requestedMode: "mock",
      capability: "extractUserPrinciple",
      attempt: 1,
      inputFingerprint: AGENT_TEST_DIGEST,
      promptVersion: null,
      adapterVersion: MOCK_AGENT_ADAPTER_VERSION,
      stage: "ROUND_1_PAST_SELF",
      stageInstanceId: "stage-instance-1",
      bindings: {
        revisions: {
          preciseRevisionId: "precise-r1",
          plainRevisionId: null,
        },
        content: AGENT_TEST_CONTENT_BINDING,
      },
    }),
    ...overrides,
  };
}

export function makeInitialPortraitInput(): BuildInitialPortraitRecordInput {
  return {
    descriptors: {
      early: ["uncertain"],
      peak: ["focused"],
      futureFacing: ["reflective"],
    },
    initialChoice: "early",
    initialReason: "This stage leaves the question open.",
  };
}

export function makeDissentInput(): BuildDissentRecordInput {
  return {
    roundId: "round1",
    charliePosition: AGENT_TEST_CHARLIE_POSITION,
    userPrinciple: AGENT_TEST_PRINCIPLE,
    focus: "Whether context changes the rule.",
    status: "open",
  };
}
