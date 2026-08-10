import type {
  Stage3BudgetUsage,
  Stage3TerminalArtifact,
} from "../../application";
import { stage3BudgetUsageSchema } from "../../application";
import type { Stage6LiveRequest } from "../contracts";
import { STAGE6_SESSION_LEDGER_VERSION } from "../versions";
import { Stage6ServerExecutionError } from "./errors";

type CompletedOperation = Readonly<{
  operationId: string;
  inputFingerprint: string;
  artifact: Stage3TerminalArtifact;
}>;

type SessionEntry = {
  budgetUsage: Stage3BudgetUsage;
  completedByRequestId: Map<string, CompletedOperation>;
  requestIdByOperationId: Map<string, string>;
};

export type Stage6LedgerBeginResult =
  | Readonly<{
      kind: "cached";
      artifact: Stage3TerminalArtifact;
    }>
  | Readonly<{
      kind: "proceed";
      priorBudgetUsage: Stage3BudgetUsage;
    }>;

/**
 * A bounded single-instance ledger. It protects ordinary retries and budget
 * continuity inside one server process; it deliberately makes no cross-instance
 * persistence claim.
 */
export class Stage6SessionLedger {
  readonly version = STAGE6_SESSION_LEDGER_VERSION;
  readonly #sessions = new Map<string, SessionEntry>();

  constructor(readonly maximumSessions = 10_000) {
    if (!Number.isInteger(maximumSessions) || maximumSessions <= 0) {
      throw new TypeError("maximumSessions must be a positive integer");
    }
  }

  begin(request: Stage6LiveRequest): Stage6LedgerBeginResult {
    const requestId = request.operationContext.requestId;
    const operationId = request.operationContext.operationId;
    const fingerprint = request.operationContext.inputFingerprint;
    const existing = this.#sessions.get(request.sessionId);
    const cached = existing?.completedByRequestId.get(requestId);
    if (cached !== undefined) {
      if (
        cached.operationId !== operationId ||
        cached.inputFingerprint !== fingerprint
      ) {
        throw new Stage6ServerExecutionError(
          "idempotency_conflict",
          "A completed requestId was reused with different operation material",
        );
      }
      return { kind: "cached", artifact: cached.artifact };
    }

    const priorBudgetUsage = stage3BudgetUsageSchema.parse(
      request.priorBudgetUsage,
    );
    if (existing === undefined) {
      if (this.#sessions.size >= this.maximumSessions) {
        throw new Stage6ServerExecutionError(
          "budget_state_mismatch",
          "The bounded session ledger cannot accept another session",
        );
      }
      this.#sessions.set(request.sessionId, {
        budgetUsage: priorBudgetUsage,
        completedByRequestId: new Map(),
        requestIdByOperationId: new Map(),
      });
      return { kind: "proceed", priorBudgetUsage };
    }

    const priorRequestId = existing.requestIdByOperationId.get(operationId);
    if (priorRequestId !== undefined && priorRequestId !== requestId) {
      throw new Stage6ServerExecutionError(
        "idempotency_conflict",
        "An operationId was reused with a different requestId",
      );
    }
    const reconciledBudgetUsage = reconcileClientOnlyFallbackUsage(
      existing.budgetUsage,
      priorBudgetUsage,
    );
    if (reconciledBudgetUsage === null) {
      throw new Stage6ServerExecutionError(
        "budget_state_mismatch",
        "Client budget continuity does not match the live server ledger",
      );
    }
    existing.budgetUsage = reconciledBudgetUsage;
    return { kind: "proceed", priorBudgetUsage: reconciledBudgetUsage };
  }

  commit(request: Stage6LiveRequest, artifact: Stage3TerminalArtifact): void {
    const entry = this.#sessions.get(request.sessionId);
    if (entry === undefined) {
      throw new Stage6ServerExecutionError(
        "budget_state_mismatch",
        "Session ledger entry disappeared before commit",
      );
    }
    const completed: CompletedOperation = Object.freeze({
      operationId: request.operationContext.operationId,
      inputFingerprint: request.operationContext.inputFingerprint,
      artifact,
    });
    entry.budgetUsage = stage3BudgetUsageSchema.parse(artifact.budgetUsage);
    entry.completedByRequestId.set(
      request.operationContext.requestId,
      completed,
    );
    entry.requestIdByOperationId.set(
      request.operationContext.operationId,
      request.operationContext.requestId,
    );
  }

  /**
   * Release a newly bootstrapped session when execution fails before its first
   * terminal artifact. Existing session history is never removed.
   */
  abortUncommitted(request: Stage6LiveRequest): void {
    const entry = this.#sessions.get(request.sessionId);
    if (
      entry !== undefined &&
      entry.completedByRequestId.size === 0 &&
      entry.requestIdByOperationId.size === 0
    ) {
      this.#sessions.delete(request.sessionId);
    }
  }
}

/**
 * Browser-side Mock/static fallback may legitimately consume a new logical
 * slot without provider spend when the BFF was unavailable. Existing
 * server-known calls remain immutable; only additional all-zero calls can be
 * reconciled into the single-instance ledger.
 */
function reconcileClientOnlyFallbackUsage(
  serverUsage: Stage3BudgetUsage,
  clientUsage: Stage3BudgetUsage,
): Stage3BudgetUsage | null {
  if (serverUsage.budgetVersion !== clientUsage.budgetVersion) return null;
  const clientBySlot = new Map(
    clientUsage.logicalCalls.map((call) => [call.budgetSlot, call]),
  );
  for (const serverCall of serverUsage.logicalCalls) {
    const clientCall = clientBySlot.get(serverCall.budgetSlot);
    if (
      clientCall === undefined ||
      JSON.stringify(clientCall) !== JSON.stringify(serverCall)
    ) {
      return null;
    }
  }
  const serverSlots = new Set(
    serverUsage.logicalCalls.map(({ budgetSlot }) => budgetSlot),
  );
  const additions = clientUsage.logicalCalls.filter(
    ({ budgetSlot }) => !serverSlots.has(budgetSlot),
  );
  if (additions.some((call) => !hasZeroProviderUsage(call))) return null;
  return clientUsage;
}

function hasZeroProviderUsage(
  call: Stage3BudgetUsage["logicalCalls"][number],
): boolean {
  return (
    call.networkRetries === 0 &&
    call.structuredRepairs === 0 &&
    call.inputTokens === 0 &&
    call.outputTokens === 0 &&
    call.latencyMs === 0 &&
    call.estimatedCostUsdMicros === 0
  );
}
