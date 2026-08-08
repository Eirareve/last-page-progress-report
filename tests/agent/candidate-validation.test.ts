import { describe, expect, it } from "vitest";

import {
  AGENT_CANDIDATE_SCHEMA_VERSIONS,
  AGENT_CONTRACT_VERSION,
  DeterministicMockAgentAdapter,
  compareSemanticDriftCandidateSchema,
  extractUserPrincipleCandidateSchema,
  generateCharlieResponseCandidateSchema,
  roundAnalysisCandidateBundleSchema,
  summarizePortraitShiftCandidateSchema,
  validateCompareSemanticDriftCandidate,
  validateExtractUserPrincipleCandidate,
  validateGenerateCharlieResponseCandidate,
  validatePlainSemanticReviewCandidateBundle,
  validateProposeDocumentDiffCandidate,
  validateRoundAnalysisCandidateBundle,
  validateSummarizePortraitShiftCandidate,
} from "@/agent";
import type { AgentExecutionEnvelope } from "@/agent";
import {
  makeProposedInsertDiff,
  makeProposedReplaceDiff,
} from "../fixtures/domain";
import {
  AGENT_TEST_CHARLIE_RESPONSE,
  AGENT_TEST_FACT,
  AGENT_TEST_PRINCIPLE,
  AGENT_TEST_PROJECTION,
  AGENT_TEST_VALIDATION_CONTEXT,
  makePlainSemanticPortInput,
  makePortraitSummaryInput,
  makeRequestContext,
  makeRoundAnalysisPortInput,
} from "../fixtures/agent";

describe("Agent Candidate to Validated Result pipeline", () => {
  it("rejects model self-certification and internalExcerpt fields", () => {
    const candidate = {
      ...header("extractUserPrinciple"),
      claim: "Context matters.",
      reasons: [],
      qualifiers: [],
      exceptions: [],
      supportingExcerpt: "Context matters",
      evidenceIds: [],
    };
    expect(extractUserPrincipleCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(
      extractUserPrincipleCandidateSchema.safeParse({
        ...candidate,
        validationResult: true,
      }).success,
    ).toBe(false);
    expect(
      extractUserPrincipleCandidateSchema.safeParse({
        ...candidate,
        internalExcerpt: "private text",
      }).success,
    ).toBe(false);
  });

  it("uses transient user-text basis for validation but projects only existing Domain fields", () => {
    const input = makeRoundAnalysisPortInput().extractUserPrinciple;
    const candidate = {
      ...header("extractUserPrinciple"),
      claim: "Context matters.",
      reasons: ["A transient reason."],
      qualifiers: ["When facts differ."],
      exceptions: [],
      supportingExcerpt: "context matters",
      evidenceIds: [AGENT_TEST_FACT.id],
    };
    const result = validateExtractUserPrincipleCandidate(
      candidate,
      input,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        principle: {
          id: AGENT_TEST_PROJECTION.principleId,
          claim: "Context matters.",
        },
      },
    });
    if (result.ok) {
      expect(result.value.principle).not.toHaveProperty("reasons");
      expect(result.value.principle).not.toHaveProperty("supportingExcerpt");
    }
  });

  it("applies explicit prohibited-claim and unauthorized-quote policy", () => {
    const input = makeRoundAnalysisPortInput();
    const candidate = {
      ...header("generateCharlieResponse"),
      roundId: "round1",
      position: "This repeats forbidden source claim.",
      acknowledgesUserPoint: "I understand.",
      reservation: "A reservation remains.",
      question: "What changes this?",
      evidenceIds: [AGENT_TEST_FACT.id],
    };
    const prohibited = validateGenerateCharlieResponseCandidate(
      candidate,
      {
        ...input.generateCharlieResponse,
        principle: AGENT_TEST_PRINCIPLE,
        tensions: [],
      },
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(prohibited).toMatchObject({
      ok: false,
      error: { code: "safety_validation_failed" },
    });

    const unauthorizedQuote = validateGenerateCharlieResponseCandidate(
      { ...candidate, position: "Charlie says “unapproved quote”." },
      {
        ...input.generateCharlieResponse,
        principle: AGENT_TEST_PRINCIPLE,
        tensions: [],
      },
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(unauthorizedQuote).toMatchObject({
      ok: false,
      error: { code: "safety_validation_failed" },
    });
  });

  it("requires one answerable Charlie question and verified evidence in verified mode", () => {
    const base = makeRoundAnalysisPortInput().generateCharlieResponse;
    const candidate = generateCharlieResponseCandidateSchema.parse({
      ...header("generateCharlieResponse"),
      roundId: "round1",
      position: "Uncertainty remains.",
      acknowledgesUserPoint: "I understand.",
      reservation: "A reservation remains.",
      question: "What changes this? And what does not?",
      evidenceIds: [AGENT_TEST_FACT.id],
    });
    const result = validateGenerateCharlieResponseCandidate(
      candidate,
      { ...base, principle: AGENT_TEST_PRINCIPLE, tensions: [] },
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "safety_validation_failed" },
    });

    const hiddenSecondQuestion = validateGenerateCharlieResponseCandidate(
      {
        ...candidate,
        question: "What changes this?",
        reservation: "Does this always hold? A reservation remains.",
      },
      { ...base, principle: AGENT_TEST_PRINCIPLE, tensions: [] },
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(hiddenSecondQuestion).toMatchObject({
      ok: false,
      error: { code: "safety_validation_failed" },
    });
  });

  it("allows placeholder Mock context only with an empty evidenceIds result", () => {
    const base = makeRoundAnalysisPortInput().generateCharlieResponse;
    const placeholderInput = {
      ...base,
      principle: AGENT_TEST_PRINCIPLE,
      tensions: [],
      evidenceContext: {
        contentMode: "placeholder" as const,
        evidenceCards: [
          { id: "placeholder-card", publicSummary: "Placeholder summary." },
        ],
        allowedEvidenceIds: ["placeholder-card"],
      },
    };
    const safeCandidate = {
      ...header("generateCharlieResponse"),
      roundId: "round1" as const,
      position: "Uncertainty remains.",
      acknowledgesUserPoint: "I understand.",
      reservation: "A reservation remains.",
      question: "What changes this?",
      evidenceIds: [],
    };
    expect(
      validateGenerateCharlieResponseCandidate(
        safeCandidate,
        placeholderInput,
        AGENT_TEST_VALIDATION_CONTEXT,
      ).ok,
    ).toBe(true);
    expect(
      validateGenerateCharlieResponseCandidate(
        { ...safeCandidate, evidenceIds: ["placeholder-card"] },
        placeholderInput,
        AGENT_TEST_VALIDATION_CONTEXT,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "evidence_not_allowed" },
    });
  });

  it("projects a bound single-operation Diff and rejects mismatched oldText", async () => {
    const input = {
      documentTarget: "precise_text" as const,
      baseRevisionId: "precise-r1",
      currentText: "Past and future both matter.",
      principle: AGENT_TEST_PRINCIPLE,
      charlieResponse: AGENT_TEST_CHARLIE_RESPONSE,
      allowedEvidenceIds: [AGENT_TEST_FACT.id],
    };
    const domainDiff = await makeProposedReplaceDiff({
      text: input.currentText,
      revisionId: input.baseRevisionId,
      startCodePoint: 0,
      endCodePoint: 4,
      newText: "Present",
    });
    const candidateDiff: Record<string, unknown> = { ...domainDiff };
    delete candidateDiff.id;
    delete candidateDiff.status;
    delete candidateDiff.createdAt;
    delete candidateDiff.confirmedAt;
    Object.assign(candidateDiff, header("proposeDocumentDiff"));
    const candidate = {
      ...header("proposeDocumentDiff"),
      kind: "diff" as const,
      diff: candidateDiff,
    };
    const result = await validateProposeDocumentDiffCandidate(
      candidate,
      input,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        proposal: {
          kind: "diff",
          diff: { id: AGENT_TEST_PROJECTION.documentDiffId },
        },
      },
    });
    const stale = await validateProposeDocumentDiffCandidate(
      {
        ...candidate,
        diff: { ...candidate.diff, oldText: "Not the bound text" },
      },
      input,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "stale_revision" },
    });
  });

  it("rejects insert anchors with tampered baseline or context integrity", async () => {
    const input = {
      documentTarget: "precise_text" as const,
      baseRevisionId: "precise-r1",
      currentText: "Past and future both matter.",
      principle: AGENT_TEST_PRINCIPLE,
      charlieResponse: AGENT_TEST_CHARLIE_RESPONSE,
      allowedEvidenceIds: [AGENT_TEST_FACT.id],
    };
    const domainDiff = await makeProposedInsertDiff({
      text: input.currentText,
      revisionId: input.baseRevisionId,
      offsetCodePoint: 4,
      newText: " carefully",
    });
    const candidateDiff: Record<string, unknown> = { ...domainDiff };
    delete candidateDiff.id;
    delete candidateDiff.status;
    delete candidateDiff.createdAt;
    delete candidateDiff.confirmedAt;
    Object.assign(candidateDiff, header("proposeDocumentDiff"));
    const targetAnchor = domainDiff.targetAnchor;

    const badBaseline = await validateProposeDocumentDiffCandidate(
      {
        ...header("proposeDocumentDiff"),
        kind: "diff",
        diff: {
          ...candidateDiff,
          targetAnchor: {
            ...targetAnchor,
            baselineTextSha256: `sha256:${"d".repeat(64)}`,
          },
        },
      },
      input,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(badBaseline).toMatchObject({
      ok: false,
      error: { code: "stale_revision" },
    });

    const badPrefixIntegrity = await validateProposeDocumentDiffCandidate(
      {
        ...header("proposeDocumentDiff"),
        kind: "diff",
        diff: {
          ...candidateDiff,
          targetAnchor: {
            ...targetAnchor,
            prefixTextSha256: `sha256:${"e".repeat(64)}`,
          },
        },
      },
      input,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(badPrefixIntegrity).toMatchObject({
      ok: false,
      error: { code: "stale_revision" },
    });
  });

  it("binds semantic drift and fragments to both revisions and trusted IDs", () => {
    const candidate = compareSemanticDriftCandidateSchema.parse({
      ...header("compareSemanticDrift"),
      preciseRevisionId: "precise-r1",
      plainRevisionId: "plain-r1",
      preserved: ["Main point"],
      lost: ["Qualification"],
      ambiguities: [],
      consequences: ["The scope is broader"],
      semanticFragments: [
        {
          ...header("compareSemanticDrift"),
          phrase: "Precise",
          reason: "The plain text omitted the qualifier",
          consequence: "The claim appears broader",
        },
      ],
    });
    const result = validateCompareSemanticDriftCandidate(
      candidate,
      {
        preciseRevisionId: "precise-r1",
        preciseText: "Precise text",
        plainRevisionId: "plain-r1",
        plainText: "Plain text",
      },
      {
        ...AGENT_TEST_VALIDATION_CONTEXT,
        semanticFragmentIds: ["stage3:v1:semantic_fragment:0:operation-1"],
      },
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        drift: {
          preciseRevisionId: "precise-r1",
          plainRevisionId: "plain-r1",
          fragmentIds: ["stage3:v1:semantic_fragment:0:operation-1"],
        },
        semanticFragments: [
          {
            sourcePreciseRevisionId: "precise-r1",
            sourcePlainRevisionId: "plain-r1",
            placement: null,
          },
        ],
      },
    });
  });

  it("validates complete Round and PlainSemantic bundles atomically", async () => {
    const adapter = new DeterministicMockAgentAdapter();
    const roundInput = makeRoundAnalysisPortInput();
    const context = makeRequestContext();
    const roundEnvelope = await adapter.executeRoundAnalysis(roundInput, context);
    const round = await validateRoundAnalysisCandidateBundle(
      candidateFrom(roundEnvelope),
      roundInput,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(round.ok).toBe(true);
    if (round.ok) {
      expect(round.value).toHaveProperty("principle");
      expect(round.value).toHaveProperty("tension");
      expect(round.value).toHaveProperty("charlieResponse");
      expect(round.value).toHaveProperty("documentDiff");
    }

    const plainInput = makePlainSemanticPortInput();
    const plainEnvelope = await adapter.executePlainSemanticReview(
      plainInput,
      context,
    );
    const plain = validatePlainSemanticReviewCandidateBundle(
      candidateFrom(plainEnvelope),
      plainInput,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(plain).toMatchObject({
      ok: true,
      value: {
        plainRevision: {
          plainRevisionId: AGENT_TEST_PROJECTION.plainRevisionId,
        },
        semanticReview: {
          drift: { plainRevisionId: AGENT_TEST_PROJECTION.plainRevisionId },
        },
      },
    });
  });

  it("fails the whole Round bundle when one child fails safety validation", async () => {
    const adapter = new DeterministicMockAgentAdapter();
    const input = makeRoundAnalysisPortInput();
    const envelope = await adapter.executeRoundAnalysis(
      input,
      makeRequestContext(),
    );
    const raw = roundAnalysisCandidateBundleSchema.parse(candidateFrom(envelope));
    const tampered = {
      ...raw,
      charlieResponse: {
        ...raw.charlieResponse,
        position: "forbidden source claim",
      },
    };
    const result = await validateRoundAnalysisCandidateBundle(
      tampered,
      input,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        capability: "generateCharlieResponse",
        code: "safety_validation_failed",
      },
    });
    expect(result).not.toHaveProperty("value.principle");
  });

  it("summarizes only the supplied PortraitShiftComparison and allowed bindings", async () => {
    const adapter = new DeterministicMockAgentAdapter();
    const input = makePortraitSummaryInput();
    const envelope = await adapter.summarizePortraitShift(
      input,
      makeRequestContext(),
    );
    const candidate = summarizePortraitShiftCandidateSchema.parse(
      candidateFrom(envelope),
    );
    const result = validateSummarizePortraitShiftCandidate(
      candidate,
      input,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        evidenceIds: [AGENT_TEST_FACT.id],
        revisionIds: ["precise-r1"],
      },
    });
  });

  it("applies safety policy to no-change reasons and bundle-owned plain text", async () => {
    const roundInput = makeRoundAnalysisPortInput();
    const noChange = await validateProposeDocumentDiffCandidate(
      {
        ...header("proposeDocumentDiff"),
        kind: "no_change",
        reason: "forbidden inference",
      },
      {
        ...roundInput.proposeDocumentDiff,
        principle: AGENT_TEST_PRINCIPLE,
        charlieResponse: AGENT_TEST_CHARLIE_RESPONSE,
      },
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(noChange).toMatchObject({
      ok: false,
      error: { code: "safety_validation_failed" },
    });
    const scored = await validateProposeDocumentDiffCandidate(
      {
        ...header("proposeDocumentDiff"),
        kind: "no_change",
        reason: "你得了8分",
      },
      {
        ...roundInput.proposeDocumentDiff,
        principle: AGENT_TEST_PRINCIPLE,
        charlieResponse: AGENT_TEST_CHARLIE_RESPONSE,
      },
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(scored).toMatchObject({
      ok: false,
      error: { code: "safety_validation_failed" },
    });

    const adapter = new DeterministicMockAgentAdapter();
    const input = makePlainSemanticPortInput();
    const envelope = await adapter.executePlainSemanticReview(
      input,
      makeRequestContext(),
    );
    const raw = candidateFrom(envelope) as Record<string, unknown> & {
      plainTextCandidate: Record<string, unknown>;
    };
    const unsafe = validatePlainSemanticReviewCandidateBundle(
      {
        ...raw,
        plainTextCandidate: {
          ...raw.plainTextCandidate,
          plainText: "forbidden source claim",
        },
      },
      input,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(unsafe).toMatchObject({
      ok: false,
      error: { code: "safety_validation_failed" },
    });
  });

  it("rejects invented semantic fragments and portrait references outside the comparison", () => {
    const invented = validateCompareSemanticDriftCandidate(
      {
        ...header("compareSemanticDrift"),
        preciseRevisionId: "precise-r1",
        plainRevisionId: "plain-r1",
        preserved: [],
        lost: [],
        ambiguities: [],
        consequences: [],
        semanticFragments: [
          {
            ...header("compareSemanticDrift"),
            phrase: "invented phrase",
            reason: "It was allegedly omitted.",
            consequence: "The meaning would change.",
          },
        ],
      },
      {
        preciseRevisionId: "precise-r1",
        preciseText: "Bound precise text.",
        plainRevisionId: "plain-r1",
        plainText: "Bound plain text.",
      },
      {
        ...AGENT_TEST_VALIDATION_CONTEXT,
        semanticFragmentIds: ["fragment-1"],
      },
    );
    expect(invented).toMatchObject({
      ok: false,
      error: { code: "invalid_output" },
    });

    const portraitInput = makePortraitSummaryInput();
    const unrelated = validateSummarizePortraitShiftCandidate(
      {
        ...header("summarizePortraitShift"),
        summary: "The deterministic comparison is unchanged.",
        evidenceIds: ["unrelated-fact"],
        revisionIds: [],
      },
      {
        ...portraitInput,
        allowedEvidenceIds: [
          ...portraitInput.allowedEvidenceIds,
          "unrelated-fact",
        ],
      },
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(unrelated).toMatchObject({
      ok: false,
      error: { code: "evidence_not_allowed" },
    });
  });
});

function header(capability: keyof typeof AGENT_CANDIDATE_SCHEMA_VERSIONS) {
  return {
    agentContractVersion: AGENT_CONTRACT_VERSION,
    candidateSchemaVersion: AGENT_CANDIDATE_SCHEMA_VERSIONS[capability],
  } as const;
}

function candidateFrom(envelope: AgentExecutionEnvelope): unknown {
  if (envelope.outcomeKind !== "candidate") {
    throw new Error(`Expected Candidate, received ${envelope.error.code}`);
  }
  return envelope.candidate;
}
