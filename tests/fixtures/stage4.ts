import {
  createStage4Session,
  stage4SessionStateSchema,
  type Stage4PersistenceSidecars,
  type Stage4SessionState,
} from "@/fsm";
import type { Clock, IdGenerator, PersistentIdKind } from "@/runtime";
import { makeContractVersionVector } from "./finalization";

export const STAGE4_NOW = "2026-08-08T12:00:00.000Z";
export const STAGE4_LATER = "2026-08-08T12:01:00.000Z";
export const STAGE4_DIGEST_A = `sha256:${"a".repeat(64)}` as const;
export const STAGE4_DIGEST_B = `sha256:${"b".repeat(64)}` as const;

export function makeStage4Ports(...times: string[]): {
  clock: Clock;
  idGenerator: IdGenerator;
} {
  let timeIndex = 0;
  const counters = new Map<PersistentIdKind, number>();
  return {
    clock: {
      now: () => times[timeIndex++] ?? times.at(-1) ?? STAGE4_NOW,
    },
    idGenerator: {
      next(kind) {
        const next = (counters.get(kind) ?? 0) + 1;
        counters.set(kind, next);
        return `${kind}-${next}`;
      },
    },
  };
}
export function makeNewStage4Session(): {
  state: Stage4SessionState;
  sidecars: Stage4PersistenceSidecars;
} {
  return createStage4Session({
    contentBinding: {
      contentBundleId: "content-bundle-1",
      contentBundleVersion: "content-bundle-0.1.0",
      contentBundleChecksum: STAGE4_DIGEST_A,
      contentSchemaVersion: "0.1.0",
      targetEnvironment: "development",
    },
    preciseText: "Past and future both matter.",
    preciseRevisionId: "precise-r1",
    portraitDescriptors: [
      { id: "portrait-early", stage: "early", label: "trusting" },
      { id: "portrait-peak", stage: "peak", label: "isolated" },
      {
        id: "portrait-future-facing",
        stage: "futureFacing",
        label: "reflective",
      },
    ],
    configuration: { requestedAgentMode: "mock" },
    provenance: {
      contractVersionVector: makeContractVersionVector({
        domainContractVersion: "0.2.0",
        namingContractVersion: "0.2.0",
        stateMachineContractVersion: "0.2.0",
      }),
      capabilityExecutionReceipts: [],
    },
    ...makeStage4Ports(STAGE4_NOW),
  });
}

export function withStage4State(
  state: Stage4SessionState,
  patch: Partial<Stage4SessionState>,
): Stage4SessionState {
  return stage4SessionStateSchema.parse({ ...state, ...patch });
}
