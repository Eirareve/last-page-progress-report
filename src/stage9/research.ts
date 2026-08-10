import {
  PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
} from "../agent/versions";
import { FINAL_REVIEW_SCHEMA_VERSION } from "../final-review/versions";
import {
  DEEPSEEK_OPENAI_ADAPTER_VERSION,
  STAGE6_PROMPT_VERSION,
} from "../stage6/versions";

export const STAGE9_RESEARCH_SCHEMA_VERSION = "0.1.0" as const;
export const STAGE9_RESEARCH_RETENTION_DAYS = 7 as const;
export const STAGE9_AGENT_VERSION_VECTOR = Object.freeze({
  promptVersion: STAGE6_PROMPT_VERSION,
  adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
  resultSchemaVersion: `round:${ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION};plain:${PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION};final:${FINAL_REVIEW_SCHEMA_VERSION}`,
});

const STORAGE_PREFIX = "last-page-progress-report:stage9:research";
const RETENTION_MS = STAGE9_RESEARCH_RETENTION_DAYS * 24 * 60 * 60 * 1_000;

export type ResearchConsent = "pending" | "accepted" | "declined";

export type ResearchEventInput = Readonly<{
  dedupeKey: string;
  eventType:
    | "stage_entered"
    | "stage_duration"
    | "initial_portrait_selected"
    | "diff_decision"
    | "semantic_fragment_placed"
    | "dissent_retained"
    | "final_portrait_selected"
    | "manuscript_disposition_selected"
    | "experience_completed"
    | "fallback_triggered"
    | "version_snapshot";
  stage?: string;
  durationMs?: number;
  round?: "round1" | "round2" | "round3";
  decision?: "accept" | "reject";
  portraitChoice?: "early" | "peak" | "futureFacing" | "mixed";
  placement?: "restored_to_plain_text" | "margin_note" | "bouquet";
  retained?: boolean;
  disposition?: "future_reference" | "present_record" | "unfinished";
  completed?: boolean;
  capability?: string;
  resolvedMode?: "mock" | "live" | "deterministic" | "static_template" | "unavailable";
  promptVersion?: string;
  adapterVersion?: string;
  resultSchemaVersion?: string;
  contentBundleVersion?: string;
}>;

export type StoredResearchEvent = ResearchEventInput &
  Readonly<{
    eventId: string;
    occurredAt: string;
  }>;

export type ResearchRecord = Readonly<{
  researchSchemaVersion: typeof STAGE9_RESEARCH_SCHEMA_VERSION;
  sessionId: string;
  consent: Exclude<ResearchConsent, "pending">;
  purpose: "stage9_usability_research";
  storageScope: "browser_local_only";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  events: readonly StoredResearchEvent[];
}>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function readResearchConsent(
  storage: StorageLike,
  sessionId: string,
  now = Date.now(),
): ResearchConsent {
  const record = readRecord(storage, sessionId);
  if (record === null) return "pending";
  if (Date.parse(record.expiresAt) <= now) {
    storage.removeItem(storageKey(sessionId));
    return "pending";
  }
  return record.consent;
}

export function setResearchConsent(
  storage: StorageLike,
  sessionId: string,
  consent: Exclude<ResearchConsent, "pending">,
  now = Date.now(),
): ResearchRecord {
  const existing = readRecord(storage, sessionId);
  const timestamp = new Date(now).toISOString();
  const record: ResearchRecord = Object.freeze({
    researchSchemaVersion: STAGE9_RESEARCH_SCHEMA_VERSION,
    sessionId,
    consent,
    purpose: "stage9_usability_research",
    storageScope: "browser_local_only",
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    expiresAt: new Date(now + RETENTION_MS).toISOString(),
    events: consent === "accepted" ? (existing?.events ?? []) : [],
  });
  storage.setItem(storageKey(sessionId), JSON.stringify(record));
  return record;
}

export function recordResearchEvent(
  storage: StorageLike,
  sessionId: string,
  event: ResearchEventInput,
  now = Date.now(),
): boolean {
  const record = readRecord(storage, sessionId);
  if (
    record === null ||
    record.consent !== "accepted" ||
    Date.parse(record.expiresAt) <= now ||
    record.events.some((candidate) => candidate.dedupeKey === event.dedupeKey)
  ) {
    return false;
  }
  const timestamp = new Date(now).toISOString();
  const storedEvent: StoredResearchEvent = Object.freeze({
    ...sanitizeEvent(event),
    eventId: createRandomId(),
    occurredAt: timestamp,
  });
  const updated: ResearchRecord = Object.freeze({
    ...record,
    updatedAt: timestamp,
    expiresAt: new Date(now + RETENTION_MS).toISOString(),
    events: Object.freeze([...record.events, storedEvent]),
  });
  storage.setItem(storageKey(sessionId), JSON.stringify(updated));
  return true;
}

export function exportResearchRecord(
  storage: StorageLike,
  sessionId: string,
): string | null {
  const record = readRecord(storage, sessionId);
  if (record?.consent !== "accepted") return null;
  return JSON.stringify(record, null, 2);
}

export function deleteResearchData(storage: StorageLike, sessionId: string): void {
  storage.removeItem(storageKey(sessionId));
}

export function pruneExpiredResearchData(
  storage: StorageLike,
  now = Date.now(),
): number {
  const expired: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null || !key.startsWith(`${STORAGE_PREFIX}:`)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      const candidate = JSON.parse(raw) as { expiresAt?: unknown };
      if (
        typeof candidate.expiresAt !== "string" ||
        Date.parse(candidate.expiresAt) <= now
      ) {
        expired.push(key);
      }
    } catch {
      expired.push(key);
    }
  }
  for (const key of expired) storage.removeItem(key);
  return expired.length;
}

function readRecord(storage: StorageLike, sessionId: string): ResearchRecord | null {
  const raw = storage.getItem(storageKey(sessionId));
  if (raw === null) return null;
  try {
    const candidate = JSON.parse(raw) as Partial<ResearchRecord>;
    if (
      candidate.researchSchemaVersion !== STAGE9_RESEARCH_SCHEMA_VERSION ||
      candidate.sessionId !== sessionId ||
      (candidate.consent !== "accepted" && candidate.consent !== "declined") ||
      candidate.storageScope !== "browser_local_only" ||
      typeof candidate.expiresAt !== "string" ||
      !Array.isArray(candidate.events)
    ) {
      return null;
    }
    return candidate as ResearchRecord;
  } catch {
    return null;
  }
}

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId}`;
}

function sanitizeEvent(event: ResearchEventInput): ResearchEventInput {
  const cleanEntries = Object.entries(event).filter(([, value]) => {
    if (value === undefined) return false;
    if (typeof value === "string") return value.length <= 120;
    if (typeof value === "number") return Number.isFinite(value) && value >= 0;
    return typeof value === "boolean";
  });
  return Object.freeze(Object.fromEntries(cleanEntries) as ResearchEventInput);
}

function createRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
