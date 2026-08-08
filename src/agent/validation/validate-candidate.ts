import {
  diffProposalResultSchema,
  resolveStableTextAnchor,
  sha256NfcUtf8,
  userPrincipleSchema,
} from "../../domain";
import type {
  AgentOperationResult,
  AgentCandidateValidationContext,
  CompareSemanticDriftInput,
  CompareSemanticDriftValidatedResult,
  DetectTensionInput,
  DetectTensionValidatedResult,
  ExtractUserPrincipleInput,
  ExtractUserPrincipleValidatedResult,
  GenerateCharlieResponseInput,
  GenerateCharlieResponseValidatedResult,
  ProposeDocumentDiffInput,
  ProposeDocumentDiffValidatedResult,
  SummarizePortraitShiftInput,
  SummarizePortraitShiftValidatedResult,
  ValidatedPlainSemanticBundle,
  ValidatedRoundAnalysisBundle,
} from "../contracts";
import { agentCapabilityError, agentFailure, agentSuccess } from "../errors";
import type {
  PlainSemanticReviewPortInput,
  RoundAnalysisPortInput,
} from "../ports";
import {
  compareSemanticDriftCandidateSchema,
  compareSemanticDriftInputSchema,
  compareSemanticDriftValidatedResultSchema,
  detectTensionCandidateSchema,
  detectTensionInputSchema,
  detectTensionValidatedResultSchema,
  extractUserPrincipleCandidateSchema,
  extractUserPrincipleInputSchema,
  extractUserPrincipleValidatedResultSchema,
  generateCharlieResponseCandidateSchema,
  generateCharlieResponseInputSchema,
  generateCharlieResponseValidatedResultSchema,
  plainSemanticReviewCandidateBundleSchema,
  proposeDocumentDiffCandidateSchema,
  proposeDocumentDiffInputSchema,
  proposeDocumentDiffValidatedResultSchema,
  roundAnalysisCandidateBundleSchema,
  summarizePortraitShiftCandidateSchema,
  summarizePortraitShiftInputSchema,
  summarizePortraitShiftValidatedResultSchema,
  validatedPlainSemanticBundleSchema,
  validatedRoundAnalysisBundleSchema,
} from "../schemas";
import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
} from "../versions";
import {
  contentBindingsEqual,
  revisionBindingsEqual,
  unexpectedIdentifiers,
} from "./bindings";
import {
  validateAgentTextSafety,
  validateExactlyOneAnswerableQuestion,
  validateSupportingExcerpt,
} from "./safety";

const VALIDATED = Object.freeze({
  schemaValidated: true,
  bindingValidated: true,
  safetyValidated: true,
} as const);

export function validateExtractUserPrincipleCandidate(
  rawCandidate: unknown,
  rawInput: ExtractUserPrincipleInput,
  projection: Pick<
    AgentCandidateValidationContext,
    "principleId" | "safetyPolicy"
  >,
): AgentOperationResult<ExtractUserPrincipleValidatedResult> {
  const inputResult = extractUserPrincipleInputSchema.safeParse(rawInput);
  const candidateResult = extractUserPrincipleCandidateSchema.safeParse(rawCandidate);
  if (!inputResult.success || !candidateResult.success) {
    return invalidSchema("extractUserPrinciple");
  }
  if (!projection.principleId?.trim()) {
    return invalidTrustedProjection("extractUserPrinciple", "principleId");
  }
  const input = inputResult.data;
  const candidate = candidateResult.data;
  const excerpt = validateSupportingExcerpt(
    input.untrustedUserText,
    candidate.supportingExcerpt,
  );
  if (!excerpt.safe) {
    return safetyFailure("extractUserPrinciple", excerpt.reason);
  }
  if (
    unexpectedIdentifiers(candidate.evidenceIds, input.allowedEvidenceIds).length >
    0
  ) {
    return evidenceFailure("extractUserPrinciple");
  }
  const safety = validateAgentTextSafety([
    candidate.claim,
    ...candidate.reasons,
    ...candidate.qualifiers,
    ...candidate.exceptions,
  ], projection.safetyPolicy);
  if (!safety.safe) {
    return safetyFailure("extractUserPrinciple", safety.reason);
  }

  // reasons and supportingExcerpt are validation-only transient fields.
  const principle = userPrincipleSchema.parse({
    id: projection.principleId,
    roundId: input.roundId,
    claim: candidate.claim,
    qualifiers: candidate.qualifiers,
    exceptions: candidate.exceptions,
    evidenceIds: candidate.evidenceIds,
  });
  return agentSuccess(
    extractUserPrincipleValidatedResultSchema.parse({
      ...validatedHeader("extractUserPrinciple"),
      principle,
    }),
  );
}

export function validateDetectTensionCandidate(
  rawCandidate: unknown,
  rawInput: DetectTensionInput,
  validation: Pick<AgentCandidateValidationContext, "safetyPolicy">,
): AgentOperationResult<DetectTensionValidatedResult> {
  const inputResult = detectTensionInputSchema.safeParse(rawInput);
  const candidateResult = detectTensionCandidateSchema.safeParse(rawCandidate);
  if (!inputResult.success || !candidateResult.success) {
    return invalidSchema("detectTension");
  }
  const input = inputResult.data;
  const candidate = candidateResult.data;
  if (candidate.roundId !== input.roundId) {
    return staleBinding("detectTension", "Candidate round binding is stale");
  }
  const permittedPrinciples = [
    input.currentPrinciple.id,
    ...input.priorPrinciples.map((principle) => principle.id),
  ];
  if (
    candidate.tensions.some(
      (tension) =>
        unexpectedIdentifiers(tension.evidenceIds, input.allowedEvidenceIds)
          .length > 0 ||
        unexpectedIdentifiers(tension.relatedPrincipleIds, permittedPrinciples)
          .length > 0,
    )
  ) {
    return evidenceFailure("detectTension");
  }
  const safety = validateAgentTextSafety(
    candidate.tensions.map((tension) => tension.summary),
    validation.safetyPolicy,
  );
  if (!safety.safe) {
    return safetyFailure("detectTension", safety.reason);
  }
  return agentSuccess(
    detectTensionValidatedResultSchema.parse({
      ...validatedHeader("detectTension"),
      roundId: input.roundId,
      tensions: candidate.tensions,
    }),
  );
}

export function validateGenerateCharlieResponseCandidate(
  rawCandidate: unknown,
  rawInput: GenerateCharlieResponseInput,
  projection: Pick<
    AgentCandidateValidationContext,
    "charliePositionId" | "charlieResponseId" | "safetyPolicy"
  >,
): AgentOperationResult<GenerateCharlieResponseValidatedResult> {
  const inputResult = generateCharlieResponseInputSchema.safeParse(rawInput);
  const candidateResult = generateCharlieResponseCandidateSchema.safeParse(
    rawCandidate,
  );
  if (!inputResult.success || !candidateResult.success) {
    return invalidSchema("generateCharlieResponse");
  }
  if (!projection.charliePositionId?.trim()) {
    return invalidTrustedProjection(
      "generateCharlieResponse",
      "charliePositionId",
    );
  }
  if (!projection.charlieResponseId?.trim()) {
    return invalidTrustedProjection(
      "generateCharlieResponse",
      "charlieResponseId",
    );
  }
  const input = inputResult.data;
  const candidate = candidateResult.data;
  if (candidate.roundId !== input.roundId) {
    return staleBinding(
      "generateCharlieResponse",
      "Candidate round binding is stale",
    );
  }
  const evidenceContext = input.evidenceContext;
  if (evidenceContext.contentMode === "placeholder") {
    if (candidate.evidenceIds.length > 0) {
      return evidenceFailure("generateCharlieResponse");
    }
  } else {
    const verifiedFactIds = evidenceContext.verifiedFacts.map((fact) => fact.id);
    if (
      unexpectedIdentifiers(
        candidate.evidenceIds,
        evidenceContext.allowedEvidenceIds,
      ).length > 0 ||
      unexpectedIdentifiers(candidate.evidenceIds, verifiedFactIds).length > 0
    ) {
      return evidenceFailure("generateCharlieResponse");
    }
  }
  const questionSafety = validateExactlyOneAnswerableQuestion(
    [
      candidate.position,
      candidate.acknowledgesUserPoint,
      candidate.reservation,
      candidate.question,
    ].join(" "),
  );
  if (!questionSafety.safe) {
    return safetyFailure("generateCharlieResponse", questionSafety.reason);
  }
  const safety = validateAgentTextSafety([
    candidate.position,
    candidate.acknowledgesUserPoint,
    candidate.reservation,
    candidate.question,
  ], projection.safetyPolicy);
  if (!safety.safe) {
    return safetyFailure("generateCharlieResponse", safety.reason);
  }
  const responseText = [
    candidate.acknowledgesUserPoint,
    candidate.reservation,
    candidate.question,
  ].join(" ");
  return agentSuccess(
    generateCharlieResponseValidatedResultSchema.parse({
      ...validatedHeader("generateCharlieResponse"),
      charliePosition: {
        id: projection.charliePositionId,
        roundId: input.roundId,
        claim: candidate.position,
        evidenceIds: candidate.evidenceIds,
      },
      charlieResponse: {
        id: projection.charlieResponseId,
        roundId: input.roundId,
        responseText,
        evidenceIds: candidate.evidenceIds,
      },
    }),
  );
}

export async function validateProposeDocumentDiffCandidate(
  rawCandidate: unknown,
  rawInput: ProposeDocumentDiffInput,
  projection: Pick<
    AgentCandidateValidationContext,
    "documentDiffId" | "documentDiffCreatedAt" | "safetyPolicy"
  >,
): Promise<AgentOperationResult<ProposeDocumentDiffValidatedResult>> {
  const inputResult = proposeDocumentDiffInputSchema.safeParse(rawInput);
  const candidateResult = proposeDocumentDiffCandidateSchema.safeParse(rawCandidate);
  if (!inputResult.success || !candidateResult.success) {
    return invalidSchema("proposeDocumentDiff");
  }
  const input = inputResult.data;
  const candidate = candidateResult.data;
  if (candidate.kind === "no_change") {
    const safety = validateAgentTextSafety(
      [candidate.reason],
      projection.safetyPolicy,
    );
    if (!safety.safe) {
      return safetyFailure("proposeDocumentDiff", safety.reason);
    }
    return agentSuccess(
      proposeDocumentDiffValidatedResultSchema.parse({
        ...validatedHeader("proposeDocumentDiff"),
        proposal: diffProposalResultSchema.parse({
          kind: "no_change",
          reason: candidate.reason,
        }),
      }),
    );
  }
  if (!projection.documentDiffId?.trim()) {
    return invalidTrustedProjection("proposeDocumentDiff", "documentDiffId");
  }
  if (!projection.documentDiffCreatedAt?.trim()) {
    return invalidTrustedProjection(
      "proposeDocumentDiff",
      "documentDiffCreatedAt",
    );
  }
  const diff = candidate.diff;
  if (
    diff.baseRevisionId !== input.baseRevisionId ||
    diff.targetAnchor.baseRevisionId !== input.baseRevisionId ||
    diff.documentTarget !== input.documentTarget ||
    (diff.documentTarget !== "margin_note" &&
      diff.targetAnchor.textDocument !== diff.documentTarget)
  ) {
    return staleBinding(
      "proposeDocumentDiff",
      "Diff target or revision binding is stale",
    );
  }
  if (
    unexpectedIdentifiers(diff.evidenceIds, input.allowedEvidenceIds).length > 0
  ) {
    return evidenceFailure("proposeDocumentDiff");
  }
  if (
    unexpectedIdentifiers(diff.principleIds, [input.principle.id]).length > 0
  ) {
    return evidenceFailure("proposeDocumentDiff");
  }
  const safety = validateAgentTextSafety(
    diffTextFields(diff),
    projection.safetyPolicy,
  );
  if (!safety.safe) {
    return safetyFailure("proposeDocumentDiff", safety.reason);
  }
  const resolvedAnchor = await resolveStableTextAnchor({
    anchor: diff.targetAnchor,
    currentText: input.currentText,
    currentRevisionId: input.baseRevisionId,
    allowDeterministicRebase: false,
  });
  if (resolvedAnchor.kind === "stale") {
    return staleBinding(
      "proposeDocumentDiff",
      `Diff anchor is stale: ${resolvedAnchor.reason}`,
    );
  }
  if (diff.operation === "replace" || diff.operation === "delete") {
    if (diff.targetAnchor.kind !== "range") {
      return invalidOutput(
        "proposeDocumentDiff",
        "replace/delete requires a range anchor",
      );
    }
    const textPoints = Array.from(input.currentText.normalize("NFC"));
    const anchoredText = textPoints
      .slice(resolvedAnchor.startCodePoint, resolvedAnchor.endCodePoint)
      .join("");
    if (
      anchoredText !== diff.oldText.normalize("NFC") ||
      (await sha256NfcUtf8(diff.oldText)) !== diff.oldTextHash
    ) {
      return staleBinding(
        "proposeDocumentDiff",
        "replace/delete oldText does not match the bound revision",
      );
    }
  }

  return agentSuccess(
    proposeDocumentDiffValidatedResultSchema.parse({
      ...validatedHeader("proposeDocumentDiff"),
      proposal: {
        kind: "diff",
        diff: {
          ...projectDocumentDiffFields(diff),
          id: projection.documentDiffId,
          status: "proposed",
          createdAt: projection.documentDiffCreatedAt,
          confirmedAt: null,
        },
      },
    }),
  );
}

export function validateCompareSemanticDriftCandidate(
  rawCandidate: unknown,
  rawInput: CompareSemanticDriftInput,
  projection: Pick<
    AgentCandidateValidationContext,
    "semanticFragmentIds" | "safetyPolicy"
  >,
): AgentOperationResult<CompareSemanticDriftValidatedResult> {
  const inputResult = compareSemanticDriftInputSchema.safeParse(rawInput);
  const candidateResult = compareSemanticDriftCandidateSchema.safeParse(
    rawCandidate,
  );
  if (!inputResult.success || !candidateResult.success) {
    return invalidSchema("compareSemanticDrift");
  }
  const input = inputResult.data;
  const candidate = candidateResult.data;
  if (
    candidate.preciseRevisionId !== input.preciseRevisionId ||
    candidate.plainRevisionId !== input.plainRevisionId
  ) {
    return staleBinding(
      "compareSemanticDrift",
      "Semantic comparison revision binding is stale",
    );
  }
  const fragmentIds = projection.semanticFragmentIds ?? [];
  if (
    fragmentIds.length !== candidate.semanticFragments.length ||
    new Set(fragmentIds).size !== fragmentIds.length ||
    fragmentIds.some((identifier) => identifier.trim().length === 0)
  ) {
    return invalidTrustedProjection(
      "compareSemanticDrift",
      "semanticFragmentIds",
    );
  }
  const safety = validateAgentTextSafety([
    ...candidate.preserved,
    ...candidate.lost,
    ...candidate.ambiguities,
    ...candidate.consequences,
    ...candidate.semanticFragments.flatMap((fragment) => [
      fragment.phrase,
      fragment.reason,
      fragment.consequence,
    ]),
  ], projection.safetyPolicy);
  if (!safety.safe) {
    return safetyFailure("compareSemanticDrift", safety.reason);
  }
  const normalizedPreciseText = input.preciseText.normalize("NFC");
  if (
    candidate.semanticFragments.some(
      (fragment) =>
        !normalizedPreciseText.includes(fragment.phrase.normalize("NFC")),
    )
  ) {
    return invalidOutput(
      "compareSemanticDrift",
      "Every semantic fragment must be grounded in the bound precise revision",
    );
  }
  const semanticFragments = candidate.semanticFragments.map((fragment, index) => ({
    id: fragmentIds[index],
    phrase: fragment.phrase,
    reason: fragment.reason,
    consequence: fragment.consequence,
    sourcePreciseRevisionId: input.preciseRevisionId,
    sourcePlainRevisionId: input.plainRevisionId,
    placement: null,
    resolvedAt: null,
    restorationProposalId: null,
  }));
  return agentSuccess(
    compareSemanticDriftValidatedResultSchema.parse({
      ...validatedHeader("compareSemanticDrift"),
      drift: {
        preciseRevisionId: input.preciseRevisionId,
        plainRevisionId: input.plainRevisionId,
        analysisVersion: AGENT_RESULT_SCHEMA_VERSIONS.compareSemanticDrift,
        status: "current",
        preserved: candidate.preserved,
        lost: candidate.lost,
        ambiguities: candidate.ambiguities,
        consequences: candidate.consequences,
        fragmentIds,
      },
      semanticFragments,
    }),
  );
}

export function validateSummarizePortraitShiftCandidate(
  rawCandidate: unknown,
  rawInput: SummarizePortraitShiftInput,
  validation: Pick<AgentCandidateValidationContext, "safetyPolicy">,
): AgentOperationResult<SummarizePortraitShiftValidatedResult> {
  const inputResult = summarizePortraitShiftInputSchema.safeParse(rawInput);
  const candidateResult = summarizePortraitShiftCandidateSchema.safeParse(
    rawCandidate,
  );
  if (!inputResult.success || !candidateResult.success) {
    return invalidSchema("summarizePortraitShift");
  }
  const input = inputResult.data;
  const candidate = candidateResult.data;
  if (
    unexpectedIdentifiers(candidate.evidenceIds, input.allowedEvidenceIds).length >
      0 ||
    unexpectedIdentifiers(
      candidate.evidenceIds,
      input.comparison.relatedEvidenceIds,
    ).length > 0 ||
    unexpectedIdentifiers(candidate.revisionIds, input.allowedRevisionIds).length >
      0 ||
    unexpectedIdentifiers(
      candidate.revisionIds,
      input.comparison.relatedRevisionIds,
    ).length > 0
  ) {
    return evidenceFailure("summarizePortraitShift");
  }
  const safety = validateAgentTextSafety(
    [candidate.summary],
    validation.safetyPolicy,
  );
  if (!safety.safe) {
    return safetyFailure("summarizePortraitShift", safety.reason);
  }
  return agentSuccess(
    summarizePortraitShiftValidatedResultSchema.parse({
      ...validatedHeader("summarizePortraitShift"),
      summary: candidate.summary,
      evidenceIds: candidate.evidenceIds,
      revisionIds: candidate.revisionIds,
    }),
  );
}

export async function validateRoundAnalysisCandidateBundle(
  rawCandidate: unknown,
  input: RoundAnalysisPortInput,
  projection: AgentCandidateValidationContext,
): Promise<AgentOperationResult<ValidatedRoundAnalysisBundle>> {
  const evidenceBoundary = validateRoundEvidenceBoundary(input);
  if (!evidenceBoundary.safe) {
    return evidenceFailure("extractUserPrinciple");
  }
  const parsed = roundAnalysisCandidateBundleSchema.safeParse(rawCandidate);
  if (!parsed.success) {
    return invalidSchema("extractUserPrinciple");
  }
  const candidate = parsed.data;
  if (
    candidate.roundId !== input.extractUserPrinciple.roundId ||
    !contentBindingsEqual(candidate.contentBinding, input.contentBinding) ||
    !revisionBindingsEqual(candidate.revisions, input.revisions)
  ) {
    return staleBinding(
      "extractUserPrinciple",
      "RoundAnalysis bundle binding is stale",
    );
  }
  const principle = validateExtractUserPrincipleCandidate(
    candidate.principle,
    input.extractUserPrinciple,
    projection,
  );
  if (!principle.ok) return principle;

  const tensionInput = detectTensionInputSchema.parse({
    ...input.detectTension,
    currentPrinciple: principle.value.principle,
  });
  const tension = validateDetectTensionCandidate(
    candidate.tension,
    tensionInput,
    projection,
  );
  if (!tension.ok) return tension;

  const responseInput = generateCharlieResponseInputSchema.parse({
    ...input.generateCharlieResponse,
    principle: principle.value.principle,
    tensions: tension.value.tensions,
  });
  const charlieResponse = validateGenerateCharlieResponseCandidate(
    candidate.charlieResponse,
    responseInput,
    projection,
  );
  if (!charlieResponse.ok) return charlieResponse;

  const diffInput = proposeDocumentDiffInputSchema.parse({
    ...input.proposeDocumentDiff,
    principle: principle.value.principle,
    charlieResponse: charlieResponse.value.charlieResponse,
  });
  const documentDiff = await validateProposeDocumentDiffCandidate(
    candidate.documentDiff,
    diffInput,
    projection,
  );
  if (!documentDiff.ok) return documentDiff;

  return agentSuccess(
    validatedRoundAnalysisBundleSchema.parse({
      agentContractVersion: AGENT_CONTRACT_VERSION,
      roundAnalysisBundleSchemaVersion: ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
      roundId: candidate.roundId,
      contentBinding: candidate.contentBinding,
      revisions: candidate.revisions,
      principle: principle.value,
      tension: tension.value,
      charlieResponse: charlieResponse.value,
      documentDiff: documentDiff.value,
    }),
  );
}

function validateRoundEvidenceBoundary(
  input: RoundAnalysisPortInput,
): Readonly<{ safe: boolean }> {
  const context = input.generateCharlieResponse.evidenceContext;
  const childAllowlists = [
    input.extractUserPrinciple.allowedEvidenceIds,
    input.detectTension.allowedEvidenceIds,
    input.proposeDocumentDiff.allowedEvidenceIds,
  ];
  if (context.contentMode === "placeholder") {
    return {
      safe: childAllowlists.every((identifiers) => identifiers.length === 0),
    };
  }
  const verifiedFactIds = context.verifiedFacts.map((fact) => fact.id);
  const trustedIds = context.allowedEvidenceIds.filter((identifier) =>
    verifiedFactIds.includes(identifier),
  );
  return {
    safe: childAllowlists.every(
      (identifiers) =>
        unexpectedIdentifiers(identifiers, trustedIds).length === 0,
    ),
  };
}

export function validatePlainSemanticReviewCandidateBundle(
  rawCandidate: unknown,
  input: PlainSemanticReviewPortInput,
  projection: Pick<
    AgentCandidateValidationContext,
    "plainRevisionId" | "semanticFragmentIds" | "safetyPolicy"
  >,
): AgentOperationResult<ValidatedPlainSemanticBundle> {
  const parsed = plainSemanticReviewCandidateBundleSchema.safeParse(rawCandidate);
  if (!parsed.success) {
    return invalidSchema("compareSemanticDrift");
  }
  const candidate = parsed.data;
  if (
    !contentBindingsEqual(candidate.contentBinding, input.contentBinding) ||
    candidate.plainTextCandidate.sourcePreciseRevisionId !==
      input.sourcePreciseRevisionId ||
    candidate.plainTextCandidate.targetPlainRevisionId !==
      input.targetPlainRevisionId ||
    projection.plainRevisionId !== input.targetPlainRevisionId
  ) {
    return staleBinding(
      "compareSemanticDrift",
      "PlainSemantic bundle binding is stale",
    );
  }
  const compareInput: CompareSemanticDriftInput = {
    preciseRevisionId: input.sourcePreciseRevisionId,
    preciseText: input.preciseText,
    plainRevisionId: input.targetPlainRevisionId,
    plainText: candidate.plainTextCandidate.plainText,
  };
  const plainTextSafety = validateAgentTextSafety(
    [candidate.plainTextCandidate.plainText],
    projection.safetyPolicy,
  );
  if (!plainTextSafety.safe) {
    return safetyFailure("compareSemanticDrift", plainTextSafety.reason);
  }
  const semantic = validateCompareSemanticDriftCandidate(
    candidate.semanticReview,
    compareInput,
    projection,
  );
  if (!semantic.ok) return semantic;

  return agentSuccess(
    validatedPlainSemanticBundleSchema.parse({
      agentContractVersion: AGENT_CONTRACT_VERSION,
      plainSemanticBundleSchemaVersion: PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
      contentBinding: candidate.contentBinding,
      plainRevision: {
        sourcePreciseRevisionId: input.sourcePreciseRevisionId,
        plainRevisionId: input.targetPlainRevisionId,
        plainText: candidate.plainTextCandidate.plainText,
      },
      semanticReview: semantic.value,
    }),
  );
}

function validatedHeader(
  capability: keyof typeof AGENT_RESULT_SCHEMA_VERSIONS,
) {
  return {
    capability,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS[capability],
    validationResult: VALIDATED,
  } as const;
}

function invalidSchema<T>(
  capability: keyof typeof AGENT_RESULT_SCHEMA_VERSIONS,
): AgentOperationResult<T> {
  return agentFailure(
    agentCapabilityError(
      capability,
      "schema_validation_failed",
      `${capability} Candidate failed strict Schema validation`,
    ),
  );
}

function invalidTrustedProjection<T>(
  capability: keyof typeof AGENT_RESULT_SCHEMA_VERSIONS,
  field: string,
): AgentOperationResult<T> {
  return agentFailure(
    agentCapabilityError(
      capability,
      "invalid_output",
      `Trusted application projection is missing ${field}`,
    ),
  );
}

function invalidOutput<T>(
  capability: keyof typeof AGENT_RESULT_SCHEMA_VERSIONS,
  summary: string,
): AgentOperationResult<T> {
  return agentFailure(
    agentCapabilityError(capability, "invalid_output", summary),
  );
}

function safetyFailure<T>(
  capability: keyof typeof AGENT_RESULT_SCHEMA_VERSIONS,
  summary: string,
): AgentOperationResult<T> {
  return agentFailure(
    agentCapabilityError(capability, "safety_validation_failed", summary),
  );
}

function evidenceFailure<T>(
  capability: keyof typeof AGENT_RESULT_SCHEMA_VERSIONS,
): AgentOperationResult<T> {
  return agentFailure(
    agentCapabilityError(
      capability,
      "evidence_not_allowed",
      "Candidate referenced an identifier outside the allowed evidence set",
    ),
  );
}

function staleBinding<T>(
  capability: keyof typeof AGENT_RESULT_SCHEMA_VERSIONS,
  summary: string,
): AgentOperationResult<T> {
  return agentFailure(
    agentCapabilityError(capability, "stale_revision", summary),
  );
}

function diffTextFields(
  diff: Extract<
    ReturnType<typeof proposeDocumentDiffCandidateSchema.parse>,
    { kind: "diff" }
  >["diff"],
): string[] {
  const shared = [diff.reason];
  switch (diff.operation) {
    case "insert":
      return [...shared, diff.newText];
    case "replace":
      return [...shared, diff.oldText, diff.newText];
    case "delete":
      return [...shared, diff.oldText];
    case "annotate":
      return [...shared, diff.annotationText];
  }
}

function projectDocumentDiffFields(
  diff: Extract<
    ReturnType<typeof proposeDocumentDiffCandidateSchema.parse>,
    { kind: "diff" }
  >["diff"],
) {
  const {
    agentContractVersion: _agentContractVersion,
    candidateSchemaVersion: _candidateSchemaVersion,
    ...domainFields
  } = diff;
  void _agentContractVersion;
  void _candidateSchemaVersion;
  return domainFields;
}
