import { describe, expect, it } from "vitest";

import {
  isAllowedContentEnvironment,
  resolveContentEnvironment,
  type ContentEnvironment,
} from "../../src/content/environment";
import {
  evaluateContentGate,
  type ContentGateInput,
} from "../../src/content/evaluate-content-gate";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;

describe("content environment matrix", () => {
  const allowed = new Set([
    "development:placeholder:mock",
    "development:verified:mock",
    "development:verified:live",
    "test:placeholder:mock",
    "test:verified:mock",
    "production:verified:mock",
    "production:verified:live",
  ]);

  for (const appEnvironment of ["development", "test", "production"] as const) {
    for (const contentMode of ["placeholder", "verified"] as const) {
      for (const agentMode of ["mock", "live"] as const) {
        const environment: ContentEnvironment = {
          appEnvironment,
          contentMode,
          agentMode,
        };
        const key = `${appEnvironment}:${contentMode}:${agentMode}`;

        it(`${key} is ${allowed.has(key) ? "allowed" : "rejected"}`, () => {
          expect(isAllowedContentEnvironment(environment)).toBe(allowed.has(key));
        });
      }
    }
  }

  it("uses safe defaults without exposing environment data to the browser", () => {
    expect(resolveContentEnvironment({ NODE_ENV: "development" })).toEqual({
      appEnvironment: "development",
      contentMode: "placeholder",
      agentMode: "mock",
    });
    expect(resolveContentEnvironment({ NODE_ENV: "production" })).toEqual({
      appEnvironment: "production",
      contentMode: "verified",
      agentMode: "mock",
    });
  });

  it("rejects unknown explicit values", () => {
    expect(() =>
      resolveContentEnvironment({ APP_ENV: "preview", NODE_ENV: "production" }),
    ).toThrow(/APP_ENV|appEnvironment/);
  });
});

describe("evaluateContentGate", () => {
  it("returns the frozen ContentGateEvaluation shape", () => {
    expect(evaluateContentGate(makeInput())).toEqual({
      contentGateEvaluationSchemaVersion: "0.1.0",
      evaluationId: "gate-evaluation-1",
      contentBundleId: "content-bundle-1",
      contentBundleVersion: "0.1.0",
      checksum: SHA_A,
      contentSchemaVersion: "0.1.0",
      targetEnvironment: "production",
      status: "passed",
      failureCodes: [],
      evaluatedAt: "2026-08-06T20:00:00.000Z",
    });
  });

  it("is deterministic for identical complete inputs", () => {
    const input = makeInput();
    expect(evaluateContentGate(input)).toEqual(evaluateContentGate(input));
  });

  it("rejects placeholder content in production without silent fallback", () => {
    const evaluation = evaluateContentGate(
      makeInput({
        contentMode: "placeholder",
        agentMode: "mock",
        approvalStatus: "placeholder",
        containsPlaceholderContent: true,
      }),
    );

    expect(evaluation.status).toBe("failed");
    expect(evaluation.failureCodes).toEqual([
      "invalid_environment_combination",
      "placeholder_forbidden_in_production",
    ]);
  });

  it("rejects unapproved verified content and checksum mismatches", () => {
    const evaluation = evaluateContentGate(
      makeInput({
        approvalStatus: "unapproved",
        computedContentBundleChecksum: SHA_B,
      }),
    );

    expect(evaluation.status).toBe("failed");
    expect(evaluation.failureCodes).toEqual([
      "content_not_approved",
      "content_checksum_mismatch",
    ]);
  });
});

function makeInput(overrides: Partial<ContentGateInput> = {}): ContentGateInput {
  return {
    evaluationId: "gate-evaluation-1",
    evaluatedAt: "2026-08-06T20:00:00.000Z",
    targetEnvironment: "production",
    contentMode: "verified",
    agentMode: "mock",
    contentBundleId: "content-bundle-1",
    contentBundleVersion: "0.1.0",
    contentSchemaVersion: "0.1.0",
    contentBundleChecksum: SHA_A,
    computedContentBundleChecksum: SHA_A,
    approvalStatus: "approved",
    containsPlaceholderContent: false,
    ...overrides,
  };
}
