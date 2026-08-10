import { z } from "zod";

import {
  AGENT_ARRAY_MAX_ITEMS,
  AGENT_CANDIDATE_SCHEMA_VERSIONS,
  AGENT_CONTRACT_VERSION,
  AGENT_DIFF_NEW_TEXT_MAX_LENGTH,
  AGENT_OUTPUT_TEXT_MAX_LENGTH,
  AGENT_PLAIN_TEXT_CANDIDATE_MAX_LENGTH,
  AGENT_QUESTION_MAX_LENGTH,
  PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  PLAIN_TEXT_CANDIDATE_SCHEMA_VERSION,
  ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  SEMANTIC_RESTORATION_PROPOSAL_CANDIDATE_SCHEMA_VERSION,
  plainSemanticReviewCandidateBundleSchema,
  roundAnalysisCandidateBundleSchema,
  semanticRestorationUnavailableReasonSchema,
  tensionKindSchema,
  type PlainSemanticReviewCandidateBundle,
  type PlainSemanticReviewPortInput,
  type RoundAnalysisCandidateBundle,
  type RoundAnalysisPortInput,
} from "../../agent";
import { deriveStage3EntityId } from "../../application/entity-id";
import {
  SEMANTIC_RESTORATION_PROPOSAL_VERSION,
  computeSemanticRestorationProposalHash,
  createStableTextPointAnchor,
  createStableTextRangeAnchor,
  normalizeTextNfc,
  sha256NfcUtf8,
} from "../../domain";

const nonEmptyText = z.string().trim().min(1).max(AGENT_OUTPUT_TEXT_MAX_LENGTH);
const textList = z.array(nonEmptyText).max(AGENT_ARRAY_MAX_ITEMS);
const evidenceIds = z.array(z.string().trim().min(1)).max(AGENT_ARRAY_MAX_ITEMS);

const providerPrincipleSchema = z.strictObject({
  claim: nonEmptyText,
  reasons: textList,
  qualifiers: textList,
  exceptions: textList,
  supportingExcerptStartCodePoint: z.number().int().nonnegative(),
  supportingExcerptEndCodePoint: z.number().int().positive(),
  evidenceIds,
});

const providerTensionSchema = z.strictObject({
  kind: tensionKindSchema,
  assessment: z.enum(["development", "tension"]),
  summary: nonEmptyText,
  evidenceIds,
});

const providerCharlieResponseSchema = z.strictObject({
  position: nonEmptyText,
  acknowledgesUserPoint: nonEmptyText,
  reservation: nonEmptyText,
  question: z.string().trim().min(1).max(AGENT_QUESTION_MAX_LENGTH),
  evidenceIds,
});

const providerDiffBase = {
  reason: nonEmptyText,
  evidenceIds,
} as const;

const providerDocumentDiffSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("no_change"), reason: nonEmptyText }),
  z.strictObject({
    kind: z.literal("diff"),
    diff: z.discriminatedUnion("operation", [
      z.strictObject({
        ...providerDiffBase,
        operation: z.literal("insert"),
        offsetCodePoint: z.number().int().nonnegative(),
        newText: z.string().trim().min(1).max(AGENT_DIFF_NEW_TEXT_MAX_LENGTH),
      }),
      z.strictObject({
        ...providerDiffBase,
        operation: z.literal("replace"),
        startCodePoint: z.number().int().nonnegative(),
        endCodePoint: z.number().int().positive(),
        newText: z.string().trim().min(1).max(AGENT_DIFF_NEW_TEXT_MAX_LENGTH),
      }),
      z.strictObject({
        ...providerDiffBase,
        operation: z.literal("delete"),
        startCodePoint: z.number().int().nonnegative(),
        endCodePoint: z.number().int().positive(),
      }),
      z.strictObject({
        ...providerDiffBase,
        operation: z.literal("annotate"),
        offsetCodePoint: z.number().int().nonnegative(),
        annotationText: nonEmptyText,
      }),
    ]),
  }),
]);

export const deepSeekRoundSemanticCandidateSchema = z.strictObject({
  principle: providerPrincipleSchema,
  tensions: z.array(providerTensionSchema).max(AGENT_ARRAY_MAX_ITEMS),
  charlieResponse: providerCharlieResponseSchema,
  documentDiff: providerDocumentDiffSchema,
});

const providerRestorationTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("point"),
    offsetCodePoint: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal("range"),
    startCodePoint: z.number().int().nonnegative(),
    endCodePoint: z.number().int().positive(),
  }),
]);

const providerRestorationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("unavailable"),
    reason: semanticRestorationUnavailableReasonSchema,
  }),
  z.strictObject({
    kind: z.literal("proposal"),
    target: providerRestorationTargetSchema,
    replacementText: nonEmptyText,
  }),
]);

const providerSemanticFragmentSchema = z.strictObject({
  phrase: nonEmptyText,
  reason: nonEmptyText,
  consequence: nonEmptyText,
  restoration: providerRestorationSchema,
});

export const deepSeekPlainSemanticCandidateSchema = z.strictObject({
  plainText: z
    .string()
    .refine((value) => value.trim().length > 0, "Plain text cannot be blank")
    .max(AGENT_PLAIN_TEXT_CANDIDATE_MAX_LENGTH),
  preserved: textList,
  lost: textList,
  ambiguities: textList,
  consequences: textList,
  semanticFragments: z
    .array(providerSemanticFragmentSchema)
    .max(AGENT_ARRAY_MAX_ITEMS),
});

export async function projectRoundSemanticCandidate(input: {
  providerCandidate: unknown;
  portInput: RoundAnalysisPortInput;
  operationId: string;
}): Promise<RoundAnalysisCandidateBundle> {
  const provider = deepSeekRoundSemanticCandidateSchema.parse(
    input.providerCandidate,
  );
  const principleId = deriveStage3EntityId({
    operationId: input.operationId,
    entityKind: "user_principle",
    ordinal: 0,
  });
  const roundId = input.portInput.extractUserPrinciple.roundId;
  const {
    supportingExcerptStartCodePoint,
    supportingExcerptEndCodePoint,
    ...principleSemantics
  } = provider.principle;
  const userSubmission = normalizeTextNfc(
    input.portInput.extractUserPrinciple.untrustedUserText,
  );
  const userSubmissionPoints = Array.from(userSubmission);
  if (
    supportingExcerptStartCodePoint >= supportingExcerptEndCodePoint ||
    supportingExcerptEndCodePoint > userSubmissionPoints.length
  ) {
    throw new RangeError(
      "Supporting excerpt positions are outside the current user submission",
    );
  }
  const supportingExcerpt = userSubmissionPoints
    .slice(supportingExcerptStartCodePoint, supportingExcerptEndCodePoint)
    .join("");
  const documentDiff = await projectDocumentDiff({
    provider: provider.documentDiff,
    portInput: input.portInput,
    principleId,
  });

  return roundAnalysisCandidateBundleSchema.parse({
    agentContractVersion: AGENT_CONTRACT_VERSION,
    roundAnalysisCandidateBundleSchemaVersion:
      ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
    roundId,
    contentBinding: input.portInput.contentBinding,
    revisions: input.portInput.revisions,
    principle: {
      ...candidateHeader("extractUserPrinciple"),
      ...principleSemantics,
      supportingExcerpt,
    },
    tension: {
      ...candidateHeader("detectTension"),
      roundId,
      tensions: provider.tensions.map((tension) => ({
        ...tension,
        relatedPrincipleIds: [principleId],
      })),
    },
    charlieResponse: {
      ...candidateHeader("generateCharlieResponse"),
      roundId,
      ...provider.charlieResponse,
    },
    documentDiff,
  });
}

export async function projectPlainSemanticCandidate(input: {
  providerCandidate: unknown;
  portInput: PlainSemanticReviewPortInput;
  operationId: string;
}): Promise<PlainSemanticReviewCandidateBundle> {
  const provider = deepSeekPlainSemanticCandidateSchema.parse(
    input.providerCandidate,
  );
  const plainText = normalizeTextNfc(provider.plainText);
  const fragments = provider.semanticFragments.map((fragment, ordinal) => ({
    fragment,
    fragmentId: deriveStage3EntityId({
      operationId: input.operationId,
      entityKind: "semantic_fragment",
      ordinal,
    }),
  }));
  const restorationOutcomes = await Promise.all(
    fragments.map(({ fragment, fragmentId }) =>
      projectRestorationOutcome({
        restoration: fragment.restoration,
        fragmentId,
        plainText,
        portInput: input.portInput,
      }),
    ),
  );

  return plainSemanticReviewCandidateBundleSchema.parse({
    agentContractVersion: AGENT_CONTRACT_VERSION,
    plainSemanticCandidateBundleSchemaVersion:
      PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
    contentBinding: input.portInput.contentBinding,
    plainTextCandidate: {
      agentContractVersion: AGENT_CONTRACT_VERSION,
      plainTextCandidateSchemaVersion: PLAIN_TEXT_CANDIDATE_SCHEMA_VERSION,
      sourcePreciseRevisionId: input.portInput.sourcePreciseRevisionId,
      targetPlainRevisionId: input.portInput.targetPlainRevisionId,
      plainText,
    },
    semanticReview: {
      ...candidateHeader("compareSemanticDrift"),
      preciseRevisionId: input.portInput.sourcePreciseRevisionId,
      plainRevisionId: input.portInput.targetPlainRevisionId,
      preserved: provider.preserved,
      lost: provider.lost,
      ambiguities: provider.ambiguities,
      consequences: provider.consequences,
      semanticFragments: fragments.map(({ fragment, fragmentId }) => ({
        ...candidateHeader("compareSemanticDrift"),
        fragmentId,
        phrase: fragment.phrase,
        reason: fragment.reason,
        consequence: fragment.consequence,
      })),
    },
    restorationOutcomes,
  });
}

async function projectDocumentDiff(input: {
  provider: z.infer<typeof providerDocumentDiffSchema>;
  portInput: RoundAnalysisPortInput;
  principleId: string;
}) {
  if (input.provider.kind === "no_change") {
    return {
      ...candidateHeader("proposeDocumentDiff"),
      kind: "no_change" as const,
      reason: input.provider.reason,
    };
  }
  const source = input.portInput.proposeDocumentDiff;
  if (source.documentTarget === "margin_note") {
    throw new RangeError("A margin-note proposal has no trusted manuscript anchor");
  }
  const semanticDiff = input.provider.diff;
  const common = {
    ...candidateHeader("proposeDocumentDiff"),
    baseRevisionId: source.baseRevisionId,
    documentTarget: source.documentTarget,
    reason: semanticDiff.reason,
    evidenceIds: semanticDiff.evidenceIds,
    principleIds: [input.principleId],
  };
  if (semanticDiff.operation === "insert") {
    return {
      ...candidateHeader("proposeDocumentDiff"),
      kind: "diff" as const,
      diff: {
        ...common,
        operation: semanticDiff.operation,
        targetAnchor: await createStableTextPointAnchor({
          textDocument: source.documentTarget,
          baseRevisionId: source.baseRevisionId,
          baselineText: source.currentText,
          offsetCodePoint: semanticDiff.offsetCodePoint,
        }),
        newText: normalizeTextNfc(semanticDiff.newText),
      },
    };
  }
  if (semanticDiff.operation === "annotate") {
    return {
      ...candidateHeader("proposeDocumentDiff"),
      kind: "diff" as const,
      diff: {
        ...common,
        operation: semanticDiff.operation,
        targetAnchor: await createStableTextPointAnchor({
          textDocument: source.documentTarget,
          baseRevisionId: source.baseRevisionId,
          baselineText: source.currentText,
          offsetCodePoint: semanticDiff.offsetCodePoint,
        }),
        annotationText: normalizeTextNfc(semanticDiff.annotationText),
      },
    };
  }
  const targetAnchor = await createStableTextRangeAnchor({
    textDocument: source.documentTarget,
    baseRevisionId: source.baseRevisionId,
    baselineText: source.currentText,
    startCodePoint: semanticDiff.startCodePoint,
    endCodePoint: semanticDiff.endCodePoint,
  });
  const oldText = targetAnchor.expectedText;
  const oldTextHash = await sha256NfcUtf8(oldText);
  const diff = semanticDiff.operation === "replace"
    ? {
        ...common,
        operation: semanticDiff.operation,
        targetAnchor,
        oldText,
        oldTextHash,
        newText: normalizeTextNfc(semanticDiff.newText),
      }
    : {
        ...common,
        operation: semanticDiff.operation,
        targetAnchor,
        oldText,
        oldTextHash,
      };
  return {
    ...candidateHeader("proposeDocumentDiff"),
    kind: "diff" as const,
    diff,
  };
}

async function projectRestorationOutcome(input: {
  restoration: z.infer<typeof providerRestorationSchema>;
  fragmentId: string;
  plainText: string;
  portInput: PlainSemanticReviewPortInput;
}) {
  if (input.restoration.kind === "unavailable") {
    return {
      kind: "unavailable" as const,
      fragmentId: input.fragmentId,
      reason: input.restoration.reason,
    };
  }
  try {
    const target = input.restoration.target;
    const targetAnchor = target.kind === "point"
      ? await createStableTextPointAnchor({
          textDocument: "plain_text",
          baseRevisionId: input.portInput.targetPlainRevisionId,
          baselineText: input.plainText,
          offsetCodePoint: target.offsetCodePoint,
        })
      : await createStableTextRangeAnchor({
          textDocument: "plain_text",
          baseRevisionId: input.portInput.targetPlainRevisionId,
          baselineText: input.plainText,
          startCodePoint: target.startCodePoint,
          endCodePoint: target.endCodePoint,
        });
    const replacementText = normalizeTextNfc(input.restoration.replacementText);
    const points = Array.from(input.plainText);
    const start = target.kind === "point"
      ? target.offsetCodePoint
      : target.startCodePoint;
    const end = target.kind === "point" ? target.offsetCodePoint : target.endCodePoint;
    const afterPreview = [
      ...points.slice(0, start),
      ...Array.from(replacementText),
      ...points.slice(end),
    ].join("");
    const sourcePlainTextHash = await sha256NfcUtf8(input.plainText);
    const proposalMaterial = {
      proposalVersion: SEMANTIC_RESTORATION_PROPOSAL_VERSION,
      fragmentId: input.fragmentId,
      baselinePreciseRevisionId: input.portInput.sourcePreciseRevisionId,
      baselinePlainRevisionId: input.portInput.targetPlainRevisionId,
      targetPlainRevisionId: input.portInput.targetPlainRevisionId,
      sourcePlainTextHash,
      targetAnchor,
      replacementText,
      beforePreview: input.plainText,
      afterPreview,
    } as const;
    return {
      kind: "proposal" as const,
      fragmentId: input.fragmentId,
      proposal: {
        agentContractVersion: AGENT_CONTRACT_VERSION,
        semanticRestorationProposalCandidateSchemaVersion:
          SEMANTIC_RESTORATION_PROPOSAL_CANDIDATE_SCHEMA_VERSION,
        proposalVersion: proposalMaterial.proposalVersion,
        fragmentId: input.fragmentId,
        baselinePreciseRevisionId: proposalMaterial.baselinePreciseRevisionId,
        baselinePlainRevisionId: proposalMaterial.baselinePlainRevisionId,
        targetPlainRevisionId: proposalMaterial.targetPlainRevisionId,
        sourcePlainTextHash,
        targetAnchor,
        replacementText,
        previewText: {
          before: input.plainText,
          after: afterPreview,
        },
        proposalHash: await computeSemanticRestorationProposalHash(
          proposalMaterial,
        ),
      },
    };
  } catch (caught) {
    if (!(caught instanceof RangeError)) throw caught;
    return {
      kind: "unavailable" as const,
      fragmentId: input.fragmentId,
      reason: "anchor_not_unique" as const,
    };
  }
}

function candidateHeader(
  capability: keyof typeof AGENT_CANDIDATE_SCHEMA_VERSIONS,
) {
  return {
    agentContractVersion: AGENT_CONTRACT_VERSION,
    candidateSchemaVersion: AGENT_CANDIDATE_SCHEMA_VERSIONS[capability],
  } as const;
}
