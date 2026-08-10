import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDissentRecord,
  buildInitialPortraitRecord,
  retrieveVerifiedEvidence,
} from "@/agent";
import { sealVerifiedContentBundle } from "../../src/content/bundle-projection";
import { createContentAccess } from "../../src/content/content-access";
import { evaluateContentGate } from "../../src/content/evaluate-content-gate";
import type { ContentAccess } from "../../src/content";
import type { GatedContentAccess } from "../../src/content/server";
import {
  AGENT_TEST_VALIDATION_CONTEXT,
  makeDissentInput,
  makeInitialPortraitInput,
} from "../fixtures/agent";
import { makeVerifiedContentBundleMaterial } from "../fixtures/content";

describe("deterministic Agent services", () => {
  it("retrieves only facts whitelisted by a verified EvidenceCard", async () => {
    const { publicBundle } = await sealVerifiedContentBundle(
      makeVerifiedContentBundleMaterial(),
    );
    const access = createContentAccess(publicBundle);
    expect(access.contentMode).toBe("verified");
    const contentBinding = {
      contentBundleId: access.binding.contentBundleId,
      contentBundleVersion: access.binding.contentBundleVersion,
      contentBundleChecksum: access.binding.contentBundleChecksum,
    };
    const result = retrieveVerifiedEvidence(
      {
        contentBinding,
        evidenceCardId: "test-card-1",
        evidenceIds: ["test-fact-1"],
      },
      gated(access),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evidenceCard.id).toBe("test-card-1");
      expect(result.value.facts).toHaveLength(1);
      expect(result.value.facts[0]).toMatchObject({
        id: "test-fact-1",
        verifiedByHuman: true,
      });
      expect(result.value.validationResult).toEqual({
        schemaValidated: true,
        bindingValidated: true,
        safetyValidated: true,
      });
    }
  });

  it("rejects placeholder mode instead of projecting a fake VerifiedFact", () => {
    const placeholderAccess: ContentAccess = {
      contentMode: "placeholder",
      binding: {
        contentBundleId: "placeholder-content",
        contentBundleVersion: "0.1.0",
        contentBundleChecksum: `sha256:${"c".repeat(64)}`,
        contentSchemaVersion: "0.1.0",
      },
      originalInteraction: {
        item: {
          id: "test-original-interaction",
          contentType: "ORIGINAL_INTERACTION",
          purpose: "manuscript",
          text: "Synthetic manuscript.",
        },
        publicDeclaration: "Synthetic declaration.",
        attribution: "Test fixture",
      },
      evidenceCards: [],
      portraits: [],
    };
    const result = retrieveVerifiedEvidence(
      {
        contentBinding: {
          contentBundleId: placeholderAccess.binding.contentBundleId,
          contentBundleVersion: placeholderAccess.binding.contentBundleVersion,
          contentBundleChecksum: placeholderAccess.binding.contentBundleChecksum,
        },
        evidenceCardId: "placeholder-card",
        evidenceIds: ["placeholder-fact"],
      },
      gated(placeholderAccess),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "content_mode_not_verified" },
    });
  });

  it("rejects a fact outside the selected EvidenceCard whitelist", async () => {
    const { publicBundle } = await sealVerifiedContentBundle(
      makeVerifiedContentBundleMaterial(),
    );
    const access = createContentAccess(publicBundle);
    const contentBinding = {
      contentBundleId: access.binding.contentBundleId,
      contentBundleVersion: access.binding.contentBundleVersion,
      contentBundleChecksum: access.binding.contentBundleChecksum,
    };
    const result = retrieveVerifiedEvidence(
      {
        contentBinding,
        evidenceCardId: "test-card-1",
        evidenceIds: ["test-fact-2"],
      },
      gated(access),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "evidence_not_allowed" },
    });
  });

  it("builds the approved InitialPortraitRecord without judging the choice", () => {
    const result = buildInitialPortraitRecord(makeInitialPortraitInput());
    expect(result).toMatchObject({
      ok: true,
      value: {
        initialRecord: {
          initialChoice: "early",
          initialReason: "This stage leaves the question open.",
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/correct|score|judg/i);
  });

  it("builds a DissentRecord from a trusted application-provided ID without scoring", () => {
    const input = makeDissentInput();
    const dissentRecordId = "stage3:v1:dissent_record:0:operation-1";
    const result = buildDissentRecord(input, {
      dissentRecordId,
      safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        dissentRecord: {
          id: dissentRecordId,
          charliePositionId: input.charliePosition.id,
          userPrincipleId: input.userPrinciple.id,
          status: "open",
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/score|index|rating/i);
  });

  it("rejects an untrusted or unsafe DissentRecord projection", () => {
    const input = makeDissentInput();
    expect(
      buildDissentRecord(input, {
        dissentRecordId: "",
        safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "schema_validation_failed" },
    });
    expect(
      buildDissentRecord(
        { ...input, focus: "forbidden inference" },
        {
          dissentRecordId: "stage3:v1:dissent_record:0:operation-1",
          safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
        },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "safety_validation_failed" },
    });
  });

  it("rejects evidence access when the Stage 2 gate did not pass", async () => {
    const { publicBundle } = await sealVerifiedContentBundle(
      makeVerifiedContentBundleMaterial(),
    );
    const access = createContentAccess(publicBundle);
    const rejected = gated(access, { computedChecksum: `sha256:${"0".repeat(64)}` });
    const result = retrieveVerifiedEvidence(
      {
        contentBinding: {
          contentBundleId: access.binding.contentBundleId,
          contentBundleVersion: access.binding.contentBundleVersion,
          contentBundleChecksum: access.binding.contentBundleChecksum,
        },
        evidenceCardId: "test-card-1",
        evidenceIds: ["test-fact-1"],
      },
      rejected,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "content_gate_not_passed" },
    });
  });

  it("keeps deterministic services free of runtime, provenance, clock, and randomness", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src", "agent", "deterministic-services.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/(?:runtime|provenance|RequestContext|ActiveOperation)/);
    expect(source).not.toMatch(/Date\.|new Date|Math\.random|randomUUID/);
  });
});

function gated(
  access: ContentAccess,
  options: { computedChecksum?: string } = {},
): GatedContentAccess {
  const isVerified = access.contentMode === "verified";
  return {
    access,
    evaluation: evaluateContentGate({
      evaluationId: "content-gate:test",
      evaluatedAt: "2026-08-06T12:00:00.000Z",
      targetEnvironment: "development",
      contentMode: access.contentMode,
      agentMode: "mock",
      contentBundleId: access.binding.contentBundleId,
      contentBundleVersion: access.binding.contentBundleVersion,
      contentSchemaVersion: access.binding.contentSchemaVersion,
      contentBundleChecksum: access.binding.contentBundleChecksum,
      computedContentBundleChecksum:
        options.computedChecksum ?? access.binding.contentBundleChecksum,
      approvalStatus: isVerified ? "approved" : "placeholder",
      containsPlaceholderContent: !isVerified,
    }),
  };
}
