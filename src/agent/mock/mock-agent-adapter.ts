import type { RequestContext } from "../../runtime";
import {
  SEMANTIC_RESTORATION_PROPOSAL_VERSION,
  computeSemanticRestorationProposalHash,
  createStableTextPointAnchor,
  normalizeTextNfc,
  sha256NfcUtf8,
} from "../../domain";
import type {
  AgentExecutionEnvelope,
  PlainSemanticReviewPortInput,
  ProviderNeutralAgentPort,
  RoundAnalysisPortInput,
} from "../ports";
import {
  plainSemanticReviewCandidateBundleSchema,
  roundAnalysisCandidateBundleSchema,
  summarizePortraitShiftCandidateSchema,
} from "../schemas";
import type { SummarizePortraitShiftInput } from "../contracts";
import { agentCapabilityError } from "../errors";
import { ZERO_AGENT_EXECUTION_OBSERVATION } from "../observation";
import {
  AGENT_CANDIDATE_SCHEMA_VERSIONS,
  AGENT_CONTRACT_VERSION,
  MOCK_AGENT_ADAPTER_VERSION,
  PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  PLAIN_TEXT_CANDIDATE_SCHEMA_VERSION,
  ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  SEMANTIC_RESTORATION_PROPOSAL_CANDIDATE_SCHEMA_VERSION,
} from "../versions";
import {
  DEFAULT_MOCK_AGENT_FIXTURE,
  mockAgentFixtureSchema,
  type MockAgentFixture,
} from "./fixtures";

export class DeterministicMockAgentAdapter implements ProviderNeutralAgentPort {
  readonly executionMode = "mock" as const;
  readonly adapterVersion = MOCK_AGENT_ADAPTER_VERSION;
  readonly #fixture: MockAgentFixture;

  constructor(fixture: MockAgentFixture = DEFAULT_MOCK_AGENT_FIXTURE) {
    this.#fixture = Object.freeze(mockAgentFixtureSchema.parse(fixture));
  }

  async executeRoundAnalysis(
    input: RoundAnalysisPortInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope> {
    const identityError = this.#identityError(context, "extractUserPrinciple");
    if (identityError !== null) return identityError;
    const excerpt = Array.from(
      input.extractUserPrinciple.untrustedUserText.normalize("NFC"),
    )
      .slice(0, 80)
      .join("");
    const evidenceContext = input.generateCharlieResponse.evidenceContext;
    const evidenceIds =
      evidenceContext.contentMode === "verified"
        ? evidenceContext.allowedEvidenceIds.filter((identifier) =>
            evidenceContext.verifiedFacts.some((fact) => fact.id === identifier),
          )
        : [];
    return mockExecutionEnvelope(roundAnalysisCandidateBundleSchema.parse({
      agentContractVersion: AGENT_CONTRACT_VERSION,
      roundAnalysisCandidateBundleSchemaVersion:
        ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
      roundId: input.extractUserPrinciple.roundId,
      contentBinding: input.contentBinding,
      revisions: input.revisions,
      principle: {
        ...candidateHeader("extractUserPrinciple"),
        claim: this.#fixture.principleClaim,
        reasons: [this.#fixture.principleReason],
        qualifiers: [],
        exceptions: [],
        supportingExcerpt: excerpt,
        evidenceIds,
      },
      tension: {
        ...candidateHeader("detectTension"),
        roundId: input.extractUserPrinciple.roundId,
        tensions: [
          {
            kind: "user_prior_view",
            assessment: "development",
            summary: this.#fixture.tensionSummary,
            relatedPrincipleIds: [],
            evidenceIds,
          },
        ],
      },
      charlieResponse: {
        ...candidateHeader("generateCharlieResponse"),
        roundId: input.extractUserPrinciple.roundId,
        position: this.#fixture.charliePosition,
        acknowledgesUserPoint: this.#fixture.acknowledgement,
        reservation: this.#fixture.reservation,
        question: this.#fixture.question,
        evidenceIds,
      },
      documentDiff: {
        ...candidateHeader("proposeDocumentDiff"),
        kind: "no_change",
        reason: this.#fixture.noChangeReason,
      },
    }));
  }

  async executePlainSemanticReview(
    input: PlainSemanticReviewPortInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope> {
    const identityError = this.#identityError(context, "compareSemanticDrift");
    if (identityError !== null) return identityError;
    const plainText = normalizeTextNfc(input.preciseText);
    const fragmentId = deriveMockSemanticEntityId(
      context.operationId,
      "semantic_fragment",
      0,
    );
    const semanticFragments =
      this.#fixture.semanticRestorationMode === "none"
        ? []
        : [
            {
              ...candidateHeader("compareSemanticDrift"),
              fragmentId,
              phrase: this.#fixture.semanticFragmentPhrase,
              reason: this.#fixture.semanticFragmentReason,
              consequence: this.#fixture.semanticFragmentConsequence,
            },
          ];
    const restorationOutcomes = [];
    if (this.#fixture.semanticRestorationMode === "unavailable") {
      restorationOutcomes.push({
        kind: "unavailable" as const,
        fragmentId,
        reason: this.#fixture.semanticRestorationUnavailableReason,
      });
    }
    if (this.#fixture.semanticRestorationMode === "proposal") {
      const targetAnchor = await createStableTextPointAnchor({
        textDocument: "plain_text",
        baseRevisionId: input.targetPlainRevisionId,
        baselineText: plainText,
        offsetCodePoint: Array.from(plainText).length,
      });
      const replacementText = normalizeTextNfc(
        this.#fixture.semanticRestorationReplacementText,
      );
      const afterPreview = `${plainText}${replacementText}`;
      const proposalMaterial = {
        proposalVersion: SEMANTIC_RESTORATION_PROPOSAL_VERSION,
        fragmentId,
        baselinePreciseRevisionId: input.sourcePreciseRevisionId,
        baselinePlainRevisionId: input.targetPlainRevisionId,
        targetPlainRevisionId: input.targetPlainRevisionId,
        sourcePlainTextHash: await sha256NfcUtf8(plainText),
        targetAnchor,
        replacementText,
        beforePreview: plainText,
        afterPreview,
      } as const;
      restorationOutcomes.push({
        kind: "proposal" as const,
        fragmentId,
        proposal: {
          agentContractVersion: AGENT_CONTRACT_VERSION,
          semanticRestorationProposalCandidateSchemaVersion:
            SEMANTIC_RESTORATION_PROPOSAL_CANDIDATE_SCHEMA_VERSION,
          proposalVersion: proposalMaterial.proposalVersion,
          fragmentId,
          baselinePreciseRevisionId:
            proposalMaterial.baselinePreciseRevisionId,
          baselinePlainRevisionId: proposalMaterial.baselinePlainRevisionId,
          targetPlainRevisionId: proposalMaterial.targetPlainRevisionId,
          sourcePlainTextHash: proposalMaterial.sourcePlainTextHash,
          targetAnchor,
          replacementText,
          previewText: {
            before: plainText,
            after: afterPreview,
          },
          proposalHash:
            await computeSemanticRestorationProposalHash(proposalMaterial),
        },
      });
    }
    return mockExecutionEnvelope(plainSemanticReviewCandidateBundleSchema.parse({
      agentContractVersion: AGENT_CONTRACT_VERSION,
      plainSemanticCandidateBundleSchemaVersion:
        PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
      contentBinding: input.contentBinding,
      plainTextCandidate: {
        agentContractVersion: AGENT_CONTRACT_VERSION,
        plainTextCandidateSchemaVersion: PLAIN_TEXT_CANDIDATE_SCHEMA_VERSION,
        sourcePreciseRevisionId: input.sourcePreciseRevisionId,
        targetPlainRevisionId: input.targetPlainRevisionId,
        plainText,
      },
      semanticReview: {
        ...candidateHeader("compareSemanticDrift"),
        preciseRevisionId: input.sourcePreciseRevisionId,
        plainRevisionId: input.targetPlainRevisionId,
        preserved: [this.#fixture.preservedSummary],
        lost: [],
        ambiguities: [],
        consequences: [],
        semanticFragments,
      },
      restorationOutcomes,
    }));
  }

  async summarizePortraitShift(
    input: SummarizePortraitShiftInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope> {
    const identityError = this.#identityError(context, "summarizePortraitShift");
    if (identityError !== null) return identityError;
    const comparison = input.comparison;
    const summary = comparison.changed
      ? this.#fixture.portraitChangedSummary
      : this.#fixture.portraitUnchangedSummary;
    return mockExecutionEnvelope(summarizePortraitShiftCandidateSchema.parse({
      ...candidateHeader("summarizePortraitShift"),
      summary,
      evidenceIds: comparison.relatedEvidenceIds.filter((identifier) =>
        input.allowedEvidenceIds.includes(identifier),
      ),
      revisionIds: comparison.relatedRevisionIds.filter((identifier) =>
        input.allowedRevisionIds.includes(identifier),
      ),
    }));
  }

  #identityError(
    context: RequestContext,
    capability:
      | "extractUserPrinciple"
      | "compareSemanticDrift"
      | "summarizePortraitShift",
  ): AgentExecutionEnvelope | null {
    if (context.adapterVersion === this.adapterVersion) return null;
    return Object.freeze({
      outcomeKind: "error" as const,
      error: agentCapabilityError(
        capability,
        "schema_validation_failed",
        "Mock Agent RequestContext adapterVersion is unsupported",
      ),
      observation: ZERO_AGENT_EXECUTION_OBSERVATION,
    });
  }
}

function deriveMockSemanticEntityId(
  operationId: string,
  entityKind: "semantic_fragment" | "semantic_restoration_proposal",
  ordinal: number,
): string {
  return ["stage3", "v1", entityKind, ordinal, encodeURIComponent(operationId)].join(
    ":",
  );
}

function mockExecutionEnvelope(candidate: unknown): AgentExecutionEnvelope {
  return Object.freeze({
    outcomeKind: "candidate",
    candidate,
    observation: ZERO_AGENT_EXECUTION_OBSERVATION,
  });
}

function candidateHeader(
  capability: keyof typeof AGENT_CANDIDATE_SCHEMA_VERSIONS,
) {
  return {
    agentContractVersion: AGENT_CONTRACT_VERSION,
    candidateSchemaVersion: AGENT_CANDIDATE_SCHEMA_VERSIONS[capability],
  } as const;
}
