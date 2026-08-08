import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DeterministicMockAgentAdapter,
  MOCK_AGENT_ADAPTER_VERSION,
  roundAnalysisCandidateBundleSchema,
  validateRoundAnalysisCandidateBundle,
} from "@/agent";
import type { AgentExecutionEnvelope } from "@/agent";
import {
  AGENT_TEST_VALIDATION_CONTEXT,
  makePlainSemanticPortInput,
  makePortraitSummaryInput,
  makeRequestContext,
  makeRoundAnalysisPortInput,
} from "../fixtures/agent";

describe("deterministic Mock Agent adapter", () => {
  it("returns the same business Candidates for the same fixture and input", async () => {
    const adapter = new DeterministicMockAgentAdapter();
    expect(adapter.executionMode).toBe("mock");
    const roundInput = makeRoundAnalysisPortInput();
    const first = await adapter.executeRoundAnalysis(
      roundInput,
      makeRequestContext(),
    );
    const second = await adapter.executeRoundAnalysis(
      roundInput,
      makeRequestContext(),
    );
    expect(first).toEqual(second);

    const plainInput = makePlainSemanticPortInput();
    expect(
      await adapter.executePlainSemanticReview(plainInput, makeRequestContext()),
    ).toEqual(
      await adapter.executePlainSemanticReview(plainInput, makeRequestContext()),
    );

    const portraitInput = makePortraitSummaryInput();
    expect(
      await adapter.summarizePortraitShift(portraitInput, makeRequestContext()),
    ).toEqual(
      await adapter.summarizePortraitShift(portraitInput, makeRequestContext()),
    );
    expect(MOCK_AGENT_ADAPTER_VERSION).toBe("0.1.0");
  });

  it("does not let request and operation metadata change semantic output", async () => {
    const adapter = new DeterministicMockAgentAdapter();
    const input = makeRoundAnalysisPortInput();
    const first = await adapter.executeRoundAnalysis(input, makeRequestContext());
    const second = await adapter.executeRoundAnalysis(
      input,
      makeRequestContext({
        operationId: "different-operation",
        requestId: "different-request",
        stageInstanceId: "different-stage-instance",
        attempt: 2,
      }),
    );
    expect(second).toEqual(first);
  });

  it("rejects a RequestContext that misstates the Mock adapter version", async () => {
    const adapter = new DeterministicMockAgentAdapter();
    const outcome = await adapter.executeRoundAnalysis(
      makeRoundAnalysisPortInput(),
      makeRequestContext({ adapterVersion: "other-adapter" }),
    );
    expect(outcome).toMatchObject({
      outcomeKind: "error",
      error: { code: "schema_validation_failed" },
    });
  });

  it("drives placeholder context without producing a fake verified evidence reference", async () => {
    const adapter = new DeterministicMockAgentAdapter();
    const input = makeRoundAnalysisPortInput();
    const placeholderInput = {
      ...input,
      extractUserPrinciple: {
        ...input.extractUserPrinciple,
        allowedEvidenceIds: [],
      },
      detectTension: {
        ...input.detectTension,
        allowedEvidenceIds: [],
      },
      generateCharlieResponse: {
        ...input.generateCharlieResponse,
        evidenceContext: {
          contentMode: "placeholder" as const,
          evidenceCards: [
            { id: "placeholder-card", publicSummary: "Placeholder summary." },
          ],
          allowedEvidenceIds: ["placeholder-card"],
        },
      },
      proposeDocumentDiff: {
        ...input.proposeDocumentDiff,
        allowedEvidenceIds: [],
      },
    };
    const envelope = await adapter.executeRoundAnalysis(
      placeholderInput,
      makeRequestContext(),
    );
    const raw = roundAnalysisCandidateBundleSchema.parse(candidateFrom(envelope));
    expect(raw.principle.evidenceIds).toEqual([]);
    expect(raw.tension.tensions[0]?.evidenceIds).toEqual([]);
    expect(raw.charlieResponse.evidenceIds).toEqual([]);
    const validated = await validateRoundAnalysisCandidateBundle(
      raw,
      placeholderInput,
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(validated.ok).toBe(true);
    expect(JSON.stringify(validated)).not.toContain("VERIFIED_FACT");

    const spoofed = await validateRoundAnalysisCandidateBundle(
      raw,
      {
        ...placeholderInput,
        extractUserPrinciple: {
          ...placeholderInput.extractUserPrinciple,
          allowedEvidenceIds: ["placeholder-card"],
        },
      },
      AGENT_TEST_VALIDATION_CONTEXT,
    );
    expect(spoofed).toMatchObject({
      ok: false,
      error: { code: "evidence_not_allowed" },
    });
  });

  it("contains no provider SDK, network call, or production Prompt implementation", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src",
        "agent",
        "mock",
        "mock-agent-adapter.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/fetch\s*\(|axios|openai|anthropic|googleapis/i);
    expect(source).not.toMatch(/productionPrompt|systemPrompt|developerPrompt/i);
  });
});

function candidateFrom(envelope: AgentExecutionEnvelope): unknown {
  if (envelope.outcomeKind !== "candidate") {
    throw new Error(`Expected Candidate, received ${envelope.error.code}`);
  }
  return envelope.candidate;
}
