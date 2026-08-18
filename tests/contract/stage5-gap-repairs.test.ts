import { describe, expect, it } from "vitest";

import { buildStage4ContractVersionVector } from "@/application";
import {
  createBundledContentLoader,
  projectFinalEnvelopeContentSnapshot,
} from "@/content";
import { portraitDescriptorCollectionSchema } from "@/domain";
import { recoverStage4Session } from "@/persistence";
import { makeNewStage4Session, makeStage4Ports, STAGE4_LATER } from "../fixtures/stage4";

describe("Stage 5 G1–G5 Contract repairs", () => {
  it("composes the current vector only from the approved owner versions", () => {
    expect(buildStage4ContractVersionVector()).toEqual({
      scopeContractVersion: "0.1.0",
      domainContractVersion: "0.3.0",
      runtimeContractVersion: "0.1.0",
      provenanceContractVersion: "0.1.0",
      namingContractVersion: "0.3.0",
      finalizationContractVersion: "0.2.0",
      stateMachineContractVersion: "0.3.0",
      sessionSchemaVersion: "0.1.0",
      stableTextAnchorSchemaVersion: "0.1.0",
      contentSchemaVersion: "0.2.0",
      agentContractVersion: "0.2.0",
      finalReviewSchemaVersion: "0.1.0",
      finalEnvelopeSchemaVersion: "0.3.0",
    });
  });

  it("stores more than one reviewed descriptor per portrait stage", () => {
    const descriptors = portraitDescriptorCollectionSchema.parse([
      { id: "early-warm", stage: "early", label: "温柔" },
      { id: "early-hopeful", stage: "early", label: "期待" },
      { id: "peak-precise", stage: "peak", label: "精确" },
      { id: "peak-isolated", stage: "peak", label: "孤独" },
      { id: "future-aware", stage: "futureFacing", label: "清醒" },
      { id: "future-restrained", stage: "futureFacing", label: "克制" },
    ]);
    expect(descriptors.filter(({ stage }) => stage === "early")).toHaveLength(2);
    expect(descriptors.filter(({ stage }) => stage === "peak")).toHaveLength(2);
    expect(descriptors.filter(({ stage }) => stage === "futureFacing")).toHaveLength(2);
  });

  it("projects the attributed original interaction and all portrait assets into the envelope snapshot", async () => {
    const { access } = await createBundledContentLoader().load("placeholder");
    const snapshot = projectFinalEnvelopeContentSnapshot({
      access,
      targetEnvironment: "development",
    });
    expect(snapshot.portraitAssets).toHaveLength(3);
    expect(snapshot.originalInteraction.item).toMatchObject({
      contentType: "ORIGINAL_INTERACTION",
      purpose: "manuscript",
    });
    expect(snapshot.originalInteraction.publicDeclaration).toContain("并非小说原文");
    expect(snapshot.binding.contentSchemaVersion).toBe("0.2.0");
  });

  it("rejects recovery when any executable Contract owner version differs", () => {
    const { state, sidecars } = makeNewStage4Session();
    const result = recoverStage4Session({
      persistedState: state,
      sidecars,
      integrityValid: true,
      expectedContentBinding: state.contentBinding,
      expectedContractVersionVector: {
        ...buildStage4ContractVersionVector(),
        domainContractVersion: "0.2.0",
      },
      now: STAGE4_LATER,
      idGenerator: makeStage4Ports().idGenerator,
    });
    expect(result).toMatchObject({
      kind: "rejected",
      code: "contract_mismatch",
      details: ["provenance.contractVersionVector.domainContractVersion"],
    });
  });
});
