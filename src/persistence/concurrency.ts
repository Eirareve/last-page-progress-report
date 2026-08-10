export type SessionLockManager = Pick<LockManager, "request">;

export async function withStage4SessionLock<T>(input: {
  sessionId: string;
  locks?: SessionLockManager;
  run: () => Promise<T>;
}): Promise<T> {
  if (input.locks === undefined) return input.run();
  return input.locks.request(`stage4-session:${input.sessionId}`, input.run);
}
export function notifyStage4SessionChanged(input: {
  channel?: Pick<BroadcastChannel, "postMessage">;
  sessionId: string;
  stateRevision: number;
}): void {
  input.channel?.postMessage({
    type: "stage4_session_changed",
    sessionId: input.sessionId,
    stateRevision: input.stateRevision,
  });
}
