import { describe, expect, it } from "vitest";

import {
  deleteResearchData,
  exportResearchRecord,
  pruneExpiredResearchData,
  readResearchConsent,
  recordResearchEvent,
  setResearchConsent,
} from "../../src/stage9/research";

class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>();
  get length() { return this.#items.size; }
  clear() { this.#items.clear(); }
  getItem(key: string) { return this.#items.get(key) ?? null; }
  key(index: number) { return [...this.#items.keys()][index] ?? null; }
  removeItem(key: string) { this.#items.delete(key); }
  setItem(key: string, value: string) { this.#items.set(key, value); }
}

describe("Stage 9 local research data", () => {
  it("lets a participant decline without recording analytics", () => {
    const storage = new MemoryStorage();
    setResearchConsent(storage, "session-a", "declined", 1_000);
    expect(readResearchConsent(storage, "session-a", 1_001)).toBe("declined");
    expect(recordResearchEvent(storage, "session-a", {
      dedupeKey: "stage:welcome",
      eventType: "stage_entered",
      stage: "WELCOME",
    }, 1_002)).toBe(false);
    expect(exportResearchRecord(storage, "session-a")).toBeNull();
  });

  it("stores only allowlisted structured events after opt-in and deduplicates", () => {
    const storage = new MemoryStorage();
    setResearchConsent(storage, "session-b", "accepted", 2_000);
    const event = {
      dedupeKey: "choice:1",
      eventType: "initial_portrait_selected" as const,
      portraitChoice: "early" as const,
    };
    expect(recordResearchEvent(storage, "session-b", event, 2_001)).toBe(true);
    expect(recordResearchEvent(storage, "session-b", event, 2_002)).toBe(false);
    const exported = exportResearchRecord(storage, "session-b");
    expect(exported).toContain('"portraitChoice": "early"');
    expect(exported).not.toContain("response");
    expect(exported).not.toContain("promptText");
  });

  it("expires and deletes browser-local research data", () => {
    const storage = new MemoryStorage();
    setResearchConsent(storage, "session-c", "accepted", 0);
    const afterEightDays = 8 * 24 * 60 * 60 * 1_000;
    expect(pruneExpiredResearchData(storage, afterEightDays)).toBe(1);
    expect(readResearchConsent(storage, "session-c", afterEightDays)).toBe("pending");

    setResearchConsent(storage, "session-c", "accepted", afterEightDays);
    deleteResearchData(storage, "session-c");
    expect(readResearchConsent(storage, "session-c", afterEightDays)).toBe("pending");
  });
});
