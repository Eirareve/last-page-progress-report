import type { SessionState } from "../domain/contracts/session";

export class SessionLifecycleBoundaryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SessionLifecycleBoundaryError";
  }
}

/**
 * Application-command boundary for START_NEW_SESSION. It deliberately does
 * not mutate or pass the completed snapshot to the fresh-session factory.
 */
export function startNewSession<
  TCompleted extends SessionState,
  TFresh extends SessionState,
>(input: {
  completedSession: Readonly<TCompleted>;
  createFreshSession: () => TFresh;
}): TFresh {
  if (
    input.completedSession.lifecycleStatus !== "complete" ||
    input.completedSession.stage !== "COMPLETE" ||
    input.completedSession.completedAt === null ||
    input.completedSession.finalEnvelope === null
  ) {
    throw new SessionLifecycleBoundaryError(
      "source_session_not_complete",
      "START_NEW_SESSION requires an immutable COMPLETE snapshot",
    );
  }

  const freshSession = input.createFreshSession();
  if (freshSession.sessionId === input.completedSession.sessionId) {
    throw new SessionLifecycleBoundaryError(
      "session_id_reused",
      "A new Session must have a different persistent identifier",
    );
  }
  if (
    freshSession.lifecycleStatus !== "in_progress" ||
    freshSession.stage !== "WELCOME" ||
    freshSession.stateRevision !== 0 ||
    freshSession.completedAt !== null ||
    freshSession.finalEnvelope !== null
  ) {
    throw new SessionLifecycleBoundaryError(
      "fresh_session_not_initial",
      "The application factory must return a fresh WELCOME Session",
    );
  }
  return freshSession;
}
