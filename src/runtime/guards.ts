import type {
  ActiveOperation,
  OperationBindings,
  OperationResultGuardInput,
} from "./contracts";

export type OperationResultGuardRejectionReason =
  | "no_active_operation"
  | "active_operation_not_running"
  | "current_stage_mismatch"
  | "operation_id_mismatch"
  | "request_id_mismatch"
  | "capability_mismatch"
  | "stage_mismatch"
  | "stage_instance_mismatch"
  | "input_fingerprint_mismatch"
  | "revision_binding_mismatch"
  | "content_binding_mismatch";

export type OperationResultGuardDecision =
  | { accepted: true }
  | { accepted: false; reason: OperationResultGuardRejectionReason };

export function guardOperationResult(input: {
  activeOperation: ActiveOperation | null;
  currentStage: ActiveOperation["stage"];
  result: OperationResultGuardInput;
}): OperationResultGuardDecision {
  const active = input.activeOperation;
  if (active === null) {
    return reject("no_active_operation");
  }
  if (active.status !== "running") {
    return reject("active_operation_not_running");
  }
  if (input.currentStage !== active.stage) {
    return reject("current_stage_mismatch");
  }
  if (input.result.operationId !== active.operationId) {
    return reject("operation_id_mismatch");
  }
  if (input.result.requestId !== active.requestId) {
    return reject("request_id_mismatch");
  }
  if (input.result.capability !== active.capability) {
    return reject("capability_mismatch");
  }
  if (input.result.stage !== active.stage) {
    return reject("stage_mismatch");
  }
  if (input.result.stageInstanceId !== active.stageInstanceId) {
    return reject("stage_instance_mismatch");
  }
  if (input.result.inputFingerprint !== active.inputFingerprint) {
    return reject("input_fingerprint_mismatch");
  }
  if (!revisionBindingsEqual(input.result.bindings, active.bindings)) {
    return reject("revision_binding_mismatch");
  }
  if (!contentBindingsEqual(input.result.bindings, active.bindings)) {
    return reject("content_binding_mismatch");
  }
  return { accepted: true };
}

export function operationBindingsEqual(
  left: OperationBindings,
  right: OperationBindings,
): boolean {
  return revisionBindingsEqual(left, right) && contentBindingsEqual(left, right);
}

function revisionBindingsEqual(
  left: OperationBindings,
  right: OperationBindings,
): boolean {
  return (
    left.revisions.preciseRevisionId === right.revisions.preciseRevisionId &&
    left.revisions.plainRevisionId === right.revisions.plainRevisionId
  );
}

function contentBindingsEqual(
  left: OperationBindings,
  right: OperationBindings,
): boolean {
  return (
    left.content.contentBundleId === right.content.contentBundleId &&
    left.content.contentBundleVersion === right.content.contentBundleVersion &&
    left.content.contentBundleChecksum === right.content.contentBundleChecksum
  );
}

function reject(
  reason: OperationResultGuardRejectionReason,
): OperationResultGuardDecision {
  return { accepted: false, reason };
}
