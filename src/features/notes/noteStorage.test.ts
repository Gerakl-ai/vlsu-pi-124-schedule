import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_PI124_GROUP } from "../groups/groupTypes";
import { loadNotes, normalizeStoredNote } from "./noteStorage";
import type { SmartNote } from "./noteTypes";

const baseNote: SmartNote = {
  id: "legacy",
  text: "Лаба по БД",
  title: "Лаба по БД",
  kind: "homework",
  space: "Учёба",
  confidence: 1,
  status: "open",
  pinned: false,
  createdAt: "2026-07-17T10:00:00.000Z",
  updatedAt: "2026-07-17T10:00:00.000Z",
  classificationSource: "local"
};

describe("note group migration", () => {
  it("migrates only legacy study links to the original PI-124 scope", () => {
    const study = normalizeStoredNote({ ...baseNote, subjectKey: "database", subjectLabel: "Базы данных" });
    const personal = normalizeStoredNote({ ...baseNote, id: "personal", space: "Дела", kind: "task" });

    expect(study.groupNrec).toBe(LEGACY_PI124_GROUP.nrec);
    expect(study.groupName).toBe(LEGACY_PI124_GROUP.name);
    expect(personal.groupNrec).toBeUndefined();
  });
});

describe("note database recovery", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function setup(storedNote = baseNote) {
    vi.useFakeTimers();
    const request: Record<string, any> = {};
    const storage = new Map([["lad.notes.fallback", JSON.stringify([storedNote])]]);
    const databaseApi = { open: () => request };
    vi.stubGlobal("window", { indexedDB: databaseApi });
    vi.stubGlobal("indexedDB", databaseApi);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    });
    return request;
  }

  it("uses the mirror on a stalled open and closes a late connection", async () => {
    const request = setup();
    const pending = loadNotes();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toEqual([normalizeStoredNote(baseNote)]);
    const close = vi.fn();
    request.result = { close };
    request.onsuccess();
    expect(close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back immediately when another connection blocks an upgrade", async () => {
    const request = setup();
    const pending = loadNotes();
    request.onblocked();
    expect(await pending).toEqual([normalizeStoredNote(baseNote)]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the actually newer mirror across different UTC offsets", async () => {
    const newer = { ...baseNote, text: "Latest", updatedAt: "2026-07-17T10:30:00Z" };
    const request = setup(newer);
    const resultRequest: Record<string, any> = {};
    const close = vi.fn();
    request.result = {
      close,
      transaction: () => ({ objectStore: () => ({ getAll: () => resultRequest }) })
    };
    const pending = loadNotes();
    request.onsuccess();
    await Promise.resolve();
    resultRequest.result = [{ ...baseNote, updatedAt: "2026-07-17T12:00:00+03:00" }];
    resultRequest.onsuccess();
    expect((await pending)[0].text).toBe("Latest");
    expect(close).toHaveBeenCalledOnce();
    request.result.onversionchange();
    expect(close).toHaveBeenCalledTimes(2);
  });
});
