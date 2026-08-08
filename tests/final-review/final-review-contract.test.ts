import { describe, expect, it } from "vitest";

import type { GatedContentAccess } from "@/content/server";
import type {
  CuratorialInterpretation,
  EvidenceCard,
  VerifiedFact,
} from "@/domain";
import { signatureReviewSnapshotSchema } from "@/domain";
import {
  charlieSignatureReviewCandidateSchema,
  charlieSignatureReviewErrorSchema,
  charlieSignatureReviewInputSchema,
  charlieSignatureReviewResultSchema,
  createCharlieSignatureReviewError,
  DeterministicMockFinalReviewService,
  FINAL_REVIEW_MAX_ARRAY_ITEMS,
  FINAL_REVIEW_MAX_INPUT_TEXT_CODE_UNITS,
  FINAL_REVIEW_MAX_REASON_CODE_UNITS,
  FINAL_REVIEW_SCHEMA_VERSION,
  MOCK_FINAL_REVIEW_ADAPTER_VERSION,
  ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
  createGatedFinalReviewEvidenceResolver,
  finalReviewExecutionObservationSchema,
  projectFinalReviewExecutionReceipt,
  projectReviewedSignatureSnapshot,
  projectUnavailableSignatureSnapshot,
  validateCharlieSignatureReviewCandidate,
  validateCharlieSignatureReviewResultBinding,
} from "@/final-review";
import {
  FINAL_REVIEW_COMPLETED_AT,
  FINAL_REVIEW_RESULT_DIGEST,
  FINAL_REVIEW_STARTED_AT,
  makeCharlieSignatureReviewCandidate,
  makeCharlieSignatureReviewContext,
  makeCharlieSignatureReviewInput,
  makeFinalReviewTrustedExecutionInput,
  makeMockFinalReviewFixture,
} from "../fixtures/final-review-stage3";

describe("Final Review 0.1.0 schemas", () => {
  it("keeps business input and RequestContext fields structurally separate", () => {
    const reviewInput = makeCharlieSignatureReviewInput();

    expect(reviewInput.finalReviewSchemaVersion).toBe(
      FINAL_REVIEW_SCHEMA_VERSION,
    );
    for (const forbidden of [
      "requestedMode",
      "requestId",
      "promptVersion",
      "adapterVersion",
      "stageInstanceId",
      "inputFingerprint",
      "evidenceText",
      "verifiedFacts",
      "internalExcerpt",
    ]) {
      expect(reviewInput).not.toHaveProperty(forbidden);
    }
    expect(
      charlieSignatureReviewInputSchema.safeParse({
        ...reviewInput,
        evidenceText: "Client-supplied evidence prose is forbidden",
      }).success,
    ).toBe(false);
  });

  it("does not allow a Candidate to self-certify validation or safety", () => {
    const candidate = makeCharlieSignatureReviewCandidate();
    expect(candidate.finalReviewSchemaVersion).toBe(
      FINAL_REVIEW_SCHEMA_VERSION,
    );
    expect(charlieSignatureReviewCandidateSchema.parse(candidate)).toEqual(
      candidate,
    );
    const versionlessCandidate: Record<string, unknown> = { ...candidate };
    Reflect.deleteProperty(versionlessCandidate, "finalReviewSchemaVersion");
    expect(
      charlieSignatureReviewCandidateSchema.safeParse(versionlessCandidate)
        .success,
    ).toBe(false);
    expect(
      charlieSignatureReviewCandidateSchema.safeParse({
        ...candidate,
        validationResult: { safetyValidation: "passed" },
      }).success,
    ).toBe(false);
    expect(
      charlieSignatureReviewCandidateSchema.safeParse({
        ...candidate,
        safetyPassed: true,
      }).success,
    ).toBe(false);
  });

  it("freezes the required error codes as a strict discriminated union", () => {
    const expected = [
      ["timeout", true],
      ["rate_limited", true],
      ["network_error", true],
      ["execution_unavailable", false],
      ["invalid_output", true],
      ["schema_validation_failed", true],
      ["safety_validation_failed", false],
      ["stale_revision", false],
      ["content_not_found", false],
      ["content_version_mismatch", false],
      ["idempotency_conflict", false],
      ["budget_exhausted", false],
    ] as const;

    for (const [code, retryable] of expected) {
      expect(createCharlieSignatureReviewError(code, "Bounded summary")).toEqual(
        { code, message: "Bounded summary", retryable },
      );
    }
    expect(
      charlieSignatureReviewErrorSchema.safeParse({
        code: "provider_magic",
        message: "Unknown provider error",
        retryable: true,
      }).success,
    ).toBe(false);
  });

  it("enforces frozen input, reason, evidence-ID, and dissent caps", () => {
    const reviewInput = makeCharlieSignatureReviewInput();
    const candidate = makeCharlieSignatureReviewCandidate();
    const tooManyEvidenceIds = Array.from(
      { length: FINAL_REVIEW_MAX_ARRAY_ITEMS + 1 },
      (_, index) => `evidence-${index}`,
    );
    const result = charlieSignatureReviewResultSchema.parse({
      status: "signed",
      reason: candidate.reason,
      preciseRevisionId: reviewInput.preciseRevisionId,
      plainRevisionId: reviewInput.plainRevisionId,
      contentBundleId: reviewInput.contentBundleId,
      contentBundleVersion: reviewInput.contentBundleVersion,
      contentBundleChecksum: reviewInput.contentBundleChecksum,
      evidenceIds: candidate.evidenceIds,
      finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
      validationResult: {
        validatorVersion: FINAL_REVIEW_SCHEMA_VERSION,
        bindingValidation: "passed",
        evidenceValidation: "passed",
        safetyValidation: "passed",
      },
    });
    const dissent = reviewInput.unresolvedDissents[0];
    if (dissent === undefined) {
      throw new Error("Expected a dissent fixture");
    }

    expect(
      charlieSignatureReviewCandidateSchema.safeParse({
        ...candidate,
        reason: "r".repeat(FINAL_REVIEW_MAX_REASON_CODE_UNITS + 1),
      }).success,
    ).toBe(false);
    expect(
      charlieSignatureReviewResultSchema.safeParse({
        ...result,
        reason: "r".repeat(FINAL_REVIEW_MAX_REASON_CODE_UNITS + 1),
      }).success,
    ).toBe(false);
    expect(
      charlieSignatureReviewResultSchema.safeParse({
        ...result,
        evidenceIds: tooManyEvidenceIds,
      }).success,
    ).toBe(false);
    expect(
      charlieSignatureReviewCandidateSchema.safeParse({
        ...candidate,
        evidenceIds: tooManyEvidenceIds,
      }).success,
    ).toBe(false);
    expect(
      charlieSignatureReviewInputSchema.safeParse({
        ...reviewInput,
        preciseText: "p".repeat(FINAL_REVIEW_MAX_INPUT_TEXT_CODE_UNITS + 1),
      }).success,
    ).toBe(false);
    expect(
      charlieSignatureReviewInputSchema.safeParse({
        ...reviewInput,
        allowedEvidenceIds: tooManyEvidenceIds,
      }).success,
    ).toBe(false);
    expect(
      charlieSignatureReviewInputSchema.safeParse({
        ...reviewInput,
        unresolvedDissents: Array.from(
          { length: FINAL_REVIEW_MAX_ARRAY_ITEMS + 1 },
          (_, index) => ({ ...dissent, id: `dissent-${index}` }),
        ),
      }).success,
    ).toBe(false);
  });

  it("requires complete nonnegative telemetry and leaves policy limits to application", () => {
    expect(
      finalReviewExecutionObservationSchema.parse(
        ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
      ),
    ).toEqual(ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION);
    expect(
      finalReviewExecutionObservationSchema.safeParse({
        ...ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
        networkRetries: 2,
      }).success,
    ).toBe(true);
    const missingLatency: Record<string, unknown> = {
      ...ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
    };
    Reflect.deleteProperty(missingLatency, "latencyMs");
    expect(
      finalReviewExecutionObservationSchema.safeParse(missingLatency).success,
    ).toBe(false);
  });
});

describe("trusted Final Review evidence resolution", () => {
  it("resolves verified facts by evidence-card IDs only through gated access", async () => {
    const reviewInput = makeCharlieSignatureReviewInput();
    const fixture = makeVerifiedGatedContentFixture(reviewInput);
    const resolver = createGatedFinalReviewEvidenceResolver(fixture.gatedContent);

    const resolution = await resolver.resolveEvidence(reviewInput);

    expect(resolution.resolutionKind).toBe("resolved");
    if (
      resolution.resolutionKind !== "resolved" ||
      resolution.evidenceContext.evidenceMode !== "verified"
    ) {
      throw new Error("Expected verified gated evidence");
    }
    expect(fixture.calls.cardIds).toEqual(reviewInput.allowedEvidenceIds);
    expect(fixture.calls.factIdBatches).toEqual([["fact-1"], ["fact-2"]]);
    expect(fixture.calls.interpretationIdBatches).toEqual([
      ["interpretation-1"],
      [],
    ]);
    expect(
      resolution.evidenceContext.evidenceItems.map((item) =>
        item.verifiedFacts.map((fact) => fact.text),
      ),
    ).toEqual([["Public verified fact 1"], ["Public verified fact 2"]]);
    expect(JSON.stringify(resolution)).not.toContain("internalExcerpt");
    expect(JSON.stringify(resolution)).not.toContain("Private source text");
  });

  it("keeps placeholder evidence explicit and structurally unable to carry VerifiedFact", async () => {
    const reviewInput = makeCharlieSignatureReviewInput({
      allowedEvidenceIds: ["past-self-placeholder"],
      contentBundleId: "placeholder-bundle-1",
    });
    const resolver = createGatedFinalReviewEvidenceResolver(
      makePlaceholderGatedContent(reviewInput),
    );

    const resolution = await resolver.resolveEvidence(reviewInput);

    expect(resolution).toMatchObject({
      resolutionKind: "resolved",
      evidenceContext: {
        evidenceMode: "placeholder",
        placeholderEvidenceIds: ["past-self-placeholder"],
        evidenceItems: [],
      },
    });
    expect(JSON.stringify(resolution)).not.toContain("VERIFIED_FACT");
    expect(JSON.stringify(resolution)).not.toContain("verifiedFacts");
  });
});

describe("Candidate binding and post-safety validation", () => {
  it("creates a trusted, fully bound result only after validation", () => {
    const reviewInput = makeCharlieSignatureReviewInput();
    const context = makeCharlieSignatureReviewContext();
    const candidate = makeCharlieSignatureReviewCandidate("signed");
    const before = structuredClone(candidate);
    const validation = validateCharlieSignatureReviewCandidate({
      reviewInput,
      context,
      candidate,
      trustedEvidenceIds: reviewInput.allowedEvidenceIds,
    });

    expect(validation.validationKind).toBe("validated");
    if (validation.validationKind !== "validated") {
      throw new Error("Expected a validated Candidate");
    }
    expect(validation.result).toMatchObject({
      status: "signed",
      preciseRevisionId: reviewInput.preciseRevisionId,
      plainRevisionId: reviewInput.plainRevisionId,
      contentBundleId: reviewInput.contentBundleId,
      contentBundleVersion: reviewInput.contentBundleVersion,
      contentBundleChecksum: reviewInput.contentBundleChecksum,
      evidenceIds: candidate.evidenceIds,
      finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
      validationResult: {
        validatorVersion: FINAL_REVIEW_SCHEMA_VERSION,
        bindingValidation: "passed",
        evidenceValidation: "passed",
        safetyValidation: "passed",
      },
    });
    expect(charlieSignatureReviewResultSchema.parse(validation.result)).toEqual(
      validation.result,
    );
    expect(candidate).toEqual(before);
  });

  it("rejects stale revisions and content identity mismatches", () => {
    const reviewInput = makeCharlieSignatureReviewInput();
    const candidate = makeCharlieSignatureReviewCandidate();
    const staleContext = makeCharlieSignatureReviewContext({
      bindings: {
        ...makeCharlieSignatureReviewContext().bindings,
        revisions: {
          preciseRevisionId: "precise-stale",
          plainRevisionId: reviewInput.plainRevisionId,
        },
      },
    });
    const mismatchedContentContext = makeCharlieSignatureReviewContext({
      bindings: {
        ...makeCharlieSignatureReviewContext().bindings,
        content: {
          contentBundleId: reviewInput.contentBundleId,
          contentBundleVersion: "0.2.0",
          contentBundleChecksum: reviewInput.contentBundleChecksum,
        },
      },
    });

    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context: staleContext,
        candidate,
        trustedEvidenceIds: reviewInput.allowedEvidenceIds,
      }),
    ).toMatchObject({
      validationKind: "rejected",
      error: { code: "stale_revision" },
    });
    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context: mismatchedContentContext,
        candidate,
        trustedEvidenceIds: reviewInput.allowedEvidenceIds,
      }),
    ).toMatchObject({
      validationKind: "rejected",
      error: { code: "content_version_mismatch" },
    });
  });

  it("rejects non-whitelisted evidence and prohibited or unauthorized text", () => {
    const reviewInput = makeCharlieSignatureReviewInput();
    const context = makeCharlieSignatureReviewContext();

    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context,
        trustedEvidenceIds: reviewInput.allowedEvidenceIds,
        candidate: makeCharlieSignatureReviewCandidate("signed", {
          evidenceIds: ["evidence-not-allowed"],
        }),
      }),
    ).toMatchObject({
      validationKind: "rejected",
      error: { code: "safety_validation_failed" },
    });
    for (const prohibitedScore of [
      "你得了8分",
      "我给你打分很低",
      "rating: low",
    ]) {
      expect(
        validateCharlieSignatureReviewCandidate({
          reviewInput,
          context,
          trustedEvidenceIds: reviewInput.allowedEvidenceIds,
          candidate: makeCharlieSignatureReviewCandidate("declined", {
            reason: prohibitedScore,
          }),
        }),
        prohibitedScore,
      ).toMatchObject({
        validationKind: "rejected",
        error: { code: "safety_validation_failed" },
      });
    }
    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context,
        trustedEvidenceIds: reviewInput.allowedEvidenceIds,
        candidate: makeCharlieSignatureReviewCandidate("signed", {
          reason: "Objectively correct. Score: 10.",
        }),
      }),
    ).toMatchObject({
      validationKind: "rejected",
      error: { code: "safety_validation_failed" },
    });
    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context,
        trustedEvidenceIds: reviewInput.allowedEvidenceIds,
        candidate: makeCharlieSignatureReviewCandidate("signed", {
          reason: 'Charlie relies on "a quotation absent from all allowed sources".',
        }),
      }),
    ).toMatchObject({
      validationKind: "rejected",
      error: { code: "safety_validation_failed" },
    });
    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context,
        trustedEvidenceIds: [reviewInput.allowedEvidenceIds[0] ?? ""],
        candidate: makeCharlieSignatureReviewCandidate(),
      }),
    ).toMatchObject({
      validationKind: "rejected",
      error: { code: "content_not_found" },
    });
  });

  it("rejects unquoted long source copying and permits only short explicit quotations", () => {
    const copiedSpan = Array.from(
      { length: 210 },
      (_, index) => String.fromCharCode(65 + (index % 26)),
    ).join("");
    const reviewInput = makeCharlieSignatureReviewInput({
      preciseText: `Precise prefix ${copiedSpan} precise suffix`,
    });
    const context = makeCharlieSignatureReviewContext();

    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context,
        trustedEvidenceIds: reviewInput.allowedEvidenceIds,
        candidate: makeCharlieSignatureReviewCandidate("signed", {
          reason: `Charlie copies this span without a quote: ${copiedSpan}`,
        }),
      }),
    ).toMatchObject({
      validationKind: "rejected",
      error: { code: "safety_validation_failed" },
    });
    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context,
        trustedEvidenceIds: reviewInput.allowedEvidenceIds,
        candidate: makeCharlieSignatureReviewCandidate("signed", {
          reason: `Charlie copies protected material: ${copiedSpan}`,
        }),
        safetyPolicy: {
          prohibitedClaims: [],
          prohibitedInferences: [],
          allowedQuotedText: [],
          protectedSourceText: [`Protected prefix ${copiedSpan}`],
        },
      }),
    ).toMatchObject({
      validationKind: "rejected",
      error: { code: "safety_validation_failed" },
    });

    const completeSource = "Complete manuscript source ".repeat(4);
    const completeSourceInput = makeCharlieSignatureReviewInput({
      plainText: completeSource,
    });
    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput: completeSourceInput,
        context,
        trustedEvidenceIds: completeSourceInput.allowedEvidenceIds,
        candidate: makeCharlieSignatureReviewCandidate("declined", {
          reason: `Charlie repeats the complete source without quotes: ${completeSource}`,
        }),
      }),
    ).toMatchObject({
      validationKind: "rejected",
      error: { code: "safety_validation_failed" },
    });

    const allowedQuote = "bounded approved phrase";
    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context,
        trustedEvidenceIds: reviewInput.allowedEvidenceIds,
        candidate: makeCharlieSignatureReviewCandidate("signed", {
          reason: `Charlie references "${allowedQuote}" without making a ruling.`,
        }),
        safetyPolicy: {
          prohibitedClaims: [],
          prohibitedInferences: [],
          allowedQuotedText: [allowedQuote],
          protectedSourceText: [],
        },
      }),
    ).toMatchObject({ validationKind: "validated" });

    for (const reason of [
      "Charlie cites `unapproved markdown quotation`.",
      "Charlie cites a block below:\n> unapproved markdown quotation",
    ]) {
      expect(
        validateCharlieSignatureReviewCandidate({
          reviewInput,
          context,
          trustedEvidenceIds: reviewInput.allowedEvidenceIds,
          candidate: makeCharlieSignatureReviewCandidate("signed", { reason }),
          safetyPolicy: {
            prohibitedClaims: [],
            prohibitedInferences: [],
            allowedQuotedText: [allowedQuote],
            protectedSourceText: [],
          },
        }),
      ).toMatchObject({
        validationKind: "rejected",
        error: { code: "safety_validation_failed" },
      });
    }
    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context,
        trustedEvidenceIds: reviewInput.allowedEvidenceIds,
        candidate: makeCharlieSignatureReviewCandidate("signed", {
          reason: `Charlie references \`${allowedQuote}\` without making a ruling.`,
        }),
        safetyPolicy: {
          prohibitedClaims: [],
          prohibitedInferences: [],
          allowedQuotedText: [allowedQuote],
          protectedSourceText: [],
        },
      }),
    ).toMatchObject({ validationKind: "validated" });

    expect(
      validateCharlieSignatureReviewCandidate({
        reviewInput,
        context,
        trustedEvidenceIds: reviewInput.allowedEvidenceIds,
        candidate: makeCharlieSignatureReviewCandidate(),
        safetyPolicy: {
          prohibitedClaims: Array.from(
            { length: FINAL_REVIEW_MAX_ARRAY_ITEMS + 1 },
            (_, index) => `prohibited-${index}`,
          ),
          prohibitedInferences: [],
          allowedQuotedText: [],
          protectedSourceText: [],
        },
      }),
    ).toMatchObject({
      validationKind: "rejected",
      error: { code: "schema_validation_failed" },
    });
  });

  it("revalidates service Result bindings without trusting its passed flags", () => {
    const reviewInput = makeCharlieSignatureReviewInput();
    const context = makeCharlieSignatureReviewContext();
    const candidateValidation = validateCharlieSignatureReviewCandidate({
      reviewInput,
      context,
      candidate: makeCharlieSignatureReviewCandidate(),
      trustedEvidenceIds: reviewInput.allowedEvidenceIds,
    });
    if (candidateValidation.validationKind !== "validated") {
      throw new Error("Expected a validated Candidate");
    }

    expect(
      validateCharlieSignatureReviewResultBinding({
        reviewInput,
        context,
        result: candidateValidation.result,
      }),
    ).toEqual({ bindingValidationKind: "valid" });
    expect(
      validateCharlieSignatureReviewResultBinding({
        reviewInput,
        context,
        result: {
          ...candidateValidation.result,
          preciseRevisionId: "precise-stale",
          evidenceIds: ["evidence-not-allowed"],
        },
      }),
    ).toMatchObject({
      bindingValidationKind: "invalid",
      error: { code: "stale_revision" },
    });
    expect(candidateValidation.result.validationResult).toEqual({
      validatorVersion: FINAL_REVIEW_SCHEMA_VERSION,
      bindingValidation: "passed",
      evidenceValidation: "passed",
      safetyValidation: "passed",
    });
  });
});

describe("deterministic Mock and live-unavailable separation", () => {
  it.each(["signed", "declined"] as const)(
    "deterministically returns a validated %s decision in mock mode",
    async (status) => {
      const service = new DeterministicMockFinalReviewService({
        fixture: makeMockFinalReviewFixture(status),
      });
      const reviewInput = makeCharlieSignatureReviewInput();
      const context = makeCharlieSignatureReviewContext();
      const trustedExecution = makeFinalReviewTrustedExecutionInput(reviewInput);

      expect(service.executionMode).toBe("mock");
      expect(service.adapterVersion).toBe(MOCK_FINAL_REVIEW_ADAPTER_VERSION);
      const first = await service.reviewCharlieSignature(
        reviewInput,
        context,
        trustedExecution,
      );
      const second = await service.reviewCharlieSignature(
        reviewInput,
        context,
        trustedExecution,
      );

      expect(first).toEqual(second);
      expect(first).toMatchObject({
        outcomeKind: "reviewed",
        result: { status },
        observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
      });
    },
  );

  it("turns a live call into unavailable and never borrows the Mock decision", async () => {
    const service = new DeterministicMockFinalReviewService({
      fixture: makeMockFinalReviewFixture("signed"),
    });
    const reviewInput = makeCharlieSignatureReviewInput();
    const liveContext = makeCharlieSignatureReviewContext({
      requestedMode: "live",
    });

    const outcome = await service.reviewCharlieSignature(
      reviewInput,
      liveContext,
      makeFinalReviewTrustedExecutionInput(reviewInput),
    );

    expect(outcome).toMatchObject({
      outcomeKind: "unavailable",
      error: { code: "execution_unavailable", retryable: false },
    });
    expect(outcome).not.toHaveProperty("result");
  });

  it("rejects a RequestContext bound to a different adapter version", async () => {
    const service = new DeterministicMockFinalReviewService({
      fixture: makeMockFinalReviewFixture("signed"),
    });
    const reviewInput = makeCharlieSignatureReviewInput();
    const outcome = await service.reviewCharlieSignature(
      reviewInput,
      makeCharlieSignatureReviewContext({ adapterVersion: "other-adapter-v1" }),
      makeFinalReviewTrustedExecutionInput(reviewInput),
    );

    expect(outcome).toMatchObject({
      outcomeKind: "unavailable",
      error: { code: "schema_validation_failed" },
      observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
    });
    expect(outcome).not.toHaveProperty("result");
  });
});

describe("Domain and provenance projections", () => {
  it("projects only a validated result into the frozen reviewed snapshot", () => {
    const reviewInput = makeCharlieSignatureReviewInput();
    const context = makeCharlieSignatureReviewContext();
    const validation = validateCharlieSignatureReviewCandidate({
      reviewInput,
      context,
      candidate: makeCharlieSignatureReviewCandidate(),
      trustedEvidenceIds: reviewInput.allowedEvidenceIds,
    });
    if (validation.validationKind !== "validated") {
      throw new Error("Expected a validated result");
    }

    const snapshot = projectReviewedSignatureSnapshot({
      reviewInput,
      context,
      result: validation.result,
      reviewedAt: FINAL_REVIEW_COMPLETED_AT,
      resultDigest: FINAL_REVIEW_RESULT_DIGEST,
    });

    expect(signatureReviewSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot).toMatchObject({
      snapshotKind: "reviewed",
      status: "signed",
      requestId: context.requestId,
      inputFingerprint: context.inputFingerprint,
      resultDigest: FINAL_REVIEW_RESULT_DIGEST,
    });
    expect(snapshot).not.toHaveProperty("validationResult");
  });

  it("projects a technical live failure as unavailable without a role decision", () => {
    const reviewInput = makeCharlieSignatureReviewInput();
    const context = makeCharlieSignatureReviewContext({ requestedMode: "live" });
    const error = createCharlieSignatureReviewError(
      "timeout",
      "Final Review timed out",
    );
    const snapshot = projectUnavailableSignatureSnapshot({
      reviewInput,
      context,
      error,
      unavailableAt: FINAL_REVIEW_COMPLETED_AT,
    });

    expect(snapshot).toMatchObject({
      snapshotKind: "unavailable",
      status: "unavailable",
      failureCode: "timeout",
      retryable: true,
      evidenceIds: [],
    });
    expect(snapshot).not.toHaveProperty("reason");
  });

  it("omits agentContractVersion and maps the Final Review version into receipts", () => {
    const context = makeCharlieSignatureReviewContext();
    const reviewInput = makeCharlieSignatureReviewInput();
    const validation = validateCharlieSignatureReviewCandidate({
      reviewInput,
      context,
      candidate: makeCharlieSignatureReviewCandidate(),
      trustedEvidenceIds: reviewInput.allowedEvidenceIds,
    });
    if (validation.validationKind !== "validated") {
      throw new Error("Expected a validated result");
    }
    const reviewedOutcome = {
      outcomeKind: "reviewed",
      result: validation.result,
      observation: {
        networkRetries: 1,
        structuredRepairs: 0,
        inputTokens: 12,
        outputTokens: 7,
        latencyMs: 45,
        estimatedCostUsdMicros: 23,
        provider: "provider-fixture",
        modelName: "model-fixture",
      },
    } as const;
    const receipt = projectFinalReviewExecutionReceipt({
      context,
      serviceOutcome: reviewedOutcome,
      resolvedMode: "mock",
      startedAt: FINAL_REVIEW_STARTED_AT,
      completedAt: FINAL_REVIEW_COMPLETED_AT,
      resultDigest: FINAL_REVIEW_RESULT_DIGEST,
    });
    const unavailableReceipt = projectFinalReviewExecutionReceipt({
      context: makeCharlieSignatureReviewContext({ requestedMode: "live" }),
      serviceOutcome: {
        outcomeKind: "unavailable",
        error: createCharlieSignatureReviewError(
          "network_error",
          "Live Final Review is unavailable",
        ),
        observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
      },
      resolvedMode: "unavailable",
      startedAt: FINAL_REVIEW_STARTED_AT,
      completedAt: FINAL_REVIEW_COMPLETED_AT,
    });

    expect(receipt).toMatchObject({
      capability: "reviewCharlieSignature",
      requestedMode: "mock",
      resolvedMode: "mock",
      outcome: "succeeded",
      resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
      tokenUsage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
      durationMs: 45,
      provider: "provider-fixture",
      modelName: "model-fixture",
    });
    expect(receipt).not.toHaveProperty("agentContractVersion");
    expect(unavailableReceipt).toMatchObject({
      requestedMode: "live",
      resolvedMode: "unavailable",
      outcome: "failed",
      fallbackReason: "network_error",
      resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      durationMs: 0,
    });
    expect(unavailableReceipt).not.toHaveProperty("provider");
    expect(unavailableReceipt).not.toHaveProperty("modelName");
    expect(unavailableReceipt).not.toHaveProperty("agentContractVersion");

    expect(() =>
      projectFinalReviewExecutionReceipt({
        context: makeCharlieSignatureReviewContext({ requestedMode: "live" }),
        serviceOutcome: reviewedOutcome,
        resolvedMode: "mock",
        startedAt: FINAL_REVIEW_STARTED_AT,
        completedAt: FINAL_REVIEW_COMPLETED_AT,
      }),
    ).toThrow(/mode/i);
  });
});

type VerifiedGatedAccess = Extract<
  GatedContentAccess["access"],
  { contentMode: "verified" }
>;

function makeVerifiedGatedContentFixture(
  reviewInput: ReturnType<typeof makeCharlieSignatureReviewInput>,
): {
  gatedContent: GatedContentAccess;
  calls: {
    cardIds: string[];
    factIdBatches: string[][];
    interpretationIdBatches: string[][];
  };
} {
  const calls = {
    cardIds: [] as string[],
    factIdBatches: [] as string[][],
    interpretationIdBatches: [] as string[][],
  };
  const cards: Record<string, EvidenceCard> = {
    "evidence-1": {
      id: "evidence-1",
      roundId: "round1",
      title: "Public evidence one",
      publicSummary: "Public card summary one",
      verifiedFactIds: ["fact-1"],
      interpretationIds: ["interpretation-1"],
    },
    "evidence-2": {
      id: "evidence-2",
      roundId: "round2",
      title: "Public evidence two",
      publicSummary: "Public card summary two",
      verifiedFactIds: ["fact-2"],
      interpretationIds: [],
    },
  };
  const facts: Record<string, VerifiedFact> = {
    "fact-1": {
      id: "fact-1",
      text: "Public verified fact 1",
      contentType: "VERIFIED_FACT",
      sourceReference: "source-location:v1:fact-1",
      verifiedByHuman: true,
    },
    "fact-2": {
      id: "fact-2",
      text: "Public verified fact 2",
      contentType: "VERIFIED_FACT",
      sourceReference: "source-location:v1:fact-2",
      verifiedByHuman: true,
    },
  };
  const interpretations: Record<string, CuratorialInterpretation> = {
    "interpretation-1": {
      id: "interpretation-1",
      text: "A bounded public interpretation",
      contentType: "CURATORIAL_INTERPRETATION",
      basedOnVerifiedFactIds: ["fact-1"],
    },
  };
  const access: VerifiedGatedAccess = {
    contentMode: "verified",
    binding: {
      contentBundleId: reviewInput.contentBundleId,
      contentBundleVersion: reviewInput.contentBundleVersion,
      contentBundleChecksum: reviewInput.contentBundleChecksum,
      contentSchemaVersion: "0.1.0",
    },
    evidenceCards: [],
    portraits: [],
    getDomainEvidenceCard(cardId) {
      calls.cardIds.push(cardId);
      const card = cards[cardId];
      if (card === undefined) {
        throw new Error("Missing synthetic card");
      }
      return card;
    },
    getVerifiedFactsByIds(factIds) {
      calls.factIdBatches.push([...factIds]);
      return factIds.map((factId) => {
        const fact = facts[factId];
        if (fact === undefined) {
          throw new Error("Missing synthetic fact");
        }
        return fact;
      });
    },
    getDomainInterpretationsByIds(interpretationIds) {
      calls.interpretationIdBatches.push([...interpretationIds]);
      return interpretationIds.map((interpretationId) => {
        const interpretation = interpretations[interpretationId];
        if (interpretation === undefined) {
          throw new Error("Missing synthetic interpretation");
        }
        return interpretation;
      });
    },
  };
  return {
    calls,
    gatedContent: {
      evaluation: makePassedContentGateEvaluation(reviewInput),
      access,
    },
  };
}

function makePlaceholderGatedContent(
  reviewInput: ReturnType<typeof makeCharlieSignatureReviewInput>,
): GatedContentAccess {
  return {
    evaluation: makePassedContentGateEvaluation(reviewInput),
    access: {
      contentMode: "placeholder",
      binding: {
        contentBundleId: reviewInput.contentBundleId,
        contentBundleVersion: reviewInput.contentBundleVersion,
        contentBundleChecksum: reviewInput.contentBundleChecksum,
        contentSchemaVersion: "0.1.0",
      },
      evidenceCards: [
        {
          recordKind: "placeholder_evidence_card",
          id: "past-self-placeholder",
          round: "round1",
          title: "[PLACEHOLDER_EVIDENCE_CARD]",
          publicText: "[PLACEHOLDER: HUMAN_VERIFIED_CONTENT_REQUIRED]",
          question: "[PLACEHOLDER: ORIGINAL_INTERACTION_NOT_AUTHORED]",
          allowedFollowUps: [],
          prohibitedClaims: ["novel_fact"],
          attribution: "placeholder",
          provenance: "placeholder",
        },
      ],
      portraits: [],
    },
  };
}

function makePassedContentGateEvaluation(
  reviewInput: ReturnType<typeof makeCharlieSignatureReviewInput>,
): GatedContentAccess["evaluation"] {
  return {
    contentGateEvaluationSchemaVersion: "0.1.0",
    evaluationId: "content-gate-final-review-test",
    contentBundleId: reviewInput.contentBundleId,
    contentBundleVersion: reviewInput.contentBundleVersion,
    checksum: reviewInput.contentBundleChecksum,
    contentSchemaVersion: "0.1.0",
    targetEnvironment: "test",
    status: "passed",
    failureCodes: [],
    evaluatedAt: "2026-08-07T11:59:00.000Z",
  };
}
