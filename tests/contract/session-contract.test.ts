import { describe, expect, it } from "vitest";

import {
  contentItemSchema,
  finalEnvelopeSchema,
  futureCharlieSignatureStatusSchema,
  sessionStateSchema,
} from "@/domain/schemas";
import { STAGE_DESCRIPTORS } from "@/domain/contracts/experience";
import { startNewSession } from "@/runtime/session-lifecycle";
import { makeFinalizableState } from "../fixtures/finalization";

describe("session and boundary contracts", () => {
  it("keeps the future signature permanently blank", () => {
    expect(futureCharlieSignatureStatusSchema.parse("blank")).toBe("blank");
    expect(futureCharlieSignatureStatusSchema.safeParse("signed").success).toBe(false);
  });

  it("keeps the three content categories structurally distinct", () => {
    const verified = {
      id: "fact-1",
      text: "verified",
      contentType: "VERIFIED_FACT",
      sourceReference: "edition:page",
      verifiedByHuman: true,
    } as const;
    expect(contentItemSchema.parse(verified).contentType).toBe("VERIFIED_FACT");
    expect(
      contentItemSchema.safeParse({
        ...verified,
        contentType: "CURATORIAL_INTERPRETATION",
      }).success,
    ).toBe(false);
    expect(
      contentItemSchema.safeParse({
        id: "original-1",
        text: "original",
        contentType: "ORIGINAL_INTERACTION",
        purpose: "manuscript",
        sourceReference: "fabricated",
      }).success,
    ).toBe(false);
  });

  it("requires a current drift to bind the current revision pair but preserves stale audit bindings", () => {
    const state = makeFinalizableState();
    expect(sessionStateSchema.safeParse(state).success).toBe(true);

    const mismatchedCurrent = {
      ...state,
      semanticDrift: { ...state.semanticDrift!, plainRevisionId: "plain-old" },
    };
    expect(sessionStateSchema.safeParse(mismatchedCurrent).success).toBe(false);

    const staleAudit = {
      ...mismatchedCurrent,
      semanticDrift: { ...mismatchedCurrent.semanticDrift!, status: "stale" },
    };
    expect(sessionStateSchema.safeParse(staleAudit).success).toBe(true);
  });

  it("defines every required stage descriptor without implementing the full FSM", () => {
    expect(Object.keys(STAGE_DESCRIPTORS)).toHaveLength(18);
    for (const descriptor of Object.values(STAGE_DESCRIPTORS)) {
      expect(descriptor.entryAction).toBeTruthy();
      expect(descriptor.allowedEvents).toBeInstanceOf(Array);
      expect(descriptor.timeoutPolicy).toBeTruthy();
      expect(descriptor.refreshPolicy).toBeTruthy();
    }
    expect(STAGE_DESCRIPTORS.MANUSCRIPT_REVISION.kind).toBe("user_interactive");
    expect(STAGE_DESCRIPTORS.PLAIN_REWRITE.kind).toBe("system_transient");
    expect(STAGE_DESCRIPTORS.SEMANTIC_REVIEW.kind).toBe("system_transient");
    expect(STAGE_DESCRIPTORS.FINALIZING.kind).toBe("system_transient");
    expect(STAGE_DESCRIPTORS.COMPLETE.kind).toBe("terminal");
  });

  it("does not permit a fabricated Session-level resolved execution mode in FinalEnvelope", () => {
    const candidate = {
      finalEnvelopeId: "envelope-1",
      finalEnvelopeSchemaVersion: "0.2.0",
      sessionId: "session-1",
      generatedAt: "2026-08-06T00:00:00.000Z",
      contentSnapshot: {
        binding: {
          contentBundleId: "content-1",
          contentBundleVersion: "0.2.0",
          contentBundleChecksum: `sha256:${"a".repeat(64)}`,
          contentSchemaVersion: "0.2.0",
          targetEnvironment: "test",
        },
        portraitAssets: [
          {
            assetId: "asset-early",
            stage: "early",
            assetPath: "/portraits/early.svg",
            altText: "Early portrait",
            provenance: "placeholder",
          },
          {
            assetId: "asset-peak",
            stage: "peak",
            assetPath: "/portraits/peak.svg",
            altText: "Peak portrait",
            provenance: "placeholder",
          },
          {
            assetId: "asset-future",
            stage: "futureFacing",
            assetPath: "/portraits/future.svg",
            altText: "Future portrait",
            provenance: "placeholder",
          },
        ],
        originalInteraction: {
          item: {
            id: "original-1",
            text: "Original manuscript.",
            contentType: "ORIGINAL_INTERACTION",
            purpose: "manuscript",
          },
          publicDeclaration: "Original interaction declaration.",
          attribution: "Test fixture",
        },
      },
      sessionConfiguration: { requestedAgentMode: "mock" },
      manuscript: {
        preciseText: "precise",
        preciseRevisionId: "precise-1",
        plainText: "plain",
        plainRevisionId: "plain-1",
        revisionHistory: [],
      },
      semantics: {
        drift: {
          preciseRevisionId: "precise-1",
          plainRevisionId: "plain-1",
          analysisVersion: "analysis-1",
          status: "current",
          preserved: [],
          lost: [],
          ambiguities: [],
          consequences: [],
          fragmentIds: [],
        },
        fragments: [],
        bouquet: [],
      },
      portraits: {
        descriptors: [
          { id: "portrait-early", stage: "early", label: "early" },
          { id: "portrait-peak", stage: "peak", label: "peak" },
          { id: "portrait-future", stage: "futureFacing", label: "future" },
        ],
        initialRecord: {
          descriptors: { early: ["a"], peak: ["b"], futureFacing: ["c"] },
          initialChoice: "early",
          initialReason: "reason",
        },
        finalChoice: "early",
        finalReason: null,
        comparison: {
          comparisonKind: "comparable",
          initialChoice: "early",
          finalChoice: "early",
          initialIncludedStages: ["early"],
          finalIncludedStages: ["early"],
          changed: false,
          newlyIncludedStages: [],
          excludedStages: [],
          relatedEvidenceIds: [],
          relatedRevisionIds: [],
        },
        shiftSummary: "unchanged",
      },
      openDissents: [],
      signature: {
        currentStatus: "not_requested",
        currentReview: null,
        futureStatus: "blank",
      },
      finalDisposition: "unfinished",
      contentAttribution: { evidenceCards: [], contentItems: [] },
      executionProvenance: { requestedAgentMode: "mock", receipts: [] },
      integrityChecksum: `sha256:${"0".repeat(64)}`,
    } as const;
    expect(finalEnvelopeSchema.safeParse(candidate).success).toBe(true);
    expect(
      finalEnvelopeSchema.safeParse({ ...candidate, resolvedMode: "mock" }).success,
    ).toBe(false);
  });

  it("START_NEW_SESSION returns a fresh ID without mutating the COMPLETE snapshot", () => {
    const completed = {
      ...makeFinalizableState(),
      lifecycleStatus: "complete",
      stage: "COMPLETE",
      completedAt: "2026-08-06T00:10:00.000Z",
      finalEnvelope: { finalEnvelopeId: "envelope-old" },
    } as const;
    const before = structuredClone(completed);
    const fresh = {
      ...makeFinalizableState(),
      sessionId: "session-new",
      stage: "WELCOME",
      stateRevision: 0,
      completedAt: null,
      finalEnvelope: null,
    } as const;

    expect(
      startNewSession({ completedSession: completed, createFreshSession: () => fresh })
        .sessionId,
    ).toBe("session-new");
    expect(completed).toEqual(before);
    expect(() =>
      startNewSession({
        completedSession: completed,
        createFreshSession: () => ({ ...fresh, sessionId: completed.sessionId }),
      }),
    ).toThrowError(/different persistent identifier/);
  });
});
