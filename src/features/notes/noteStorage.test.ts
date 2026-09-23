import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_PI124_GROUP } from "../groups/groupTypes";
import { loadFolders, loadNotes, normalizeStoredNote, storeDraft, storeFolder, storeNote } from "./noteStorage";
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

  it.each([true, false])("reports draft durability when the mirror works=%s", async (mirrorWorks) => {
    const request = setup();
    if (!mirrorWorks) vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => { throw new DOMException("Full", "QuotaExceededError"); }
    });
    const pending = storeDraft({ id: "new", text: "Keep me", contentHtml: "<p>Keep me</p>", pinned: false, updatedAt: baseNote.updatedAt });
    request.onerror();
    expect(await pending).toBe(mirrorWorks);
  });

  it("does not confirm a note when both stores reject it", async () => {
    const request = setup();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("quota"); } });
    const pending = storeNote(baseNote);
    request.onerror();
    expect(await pending).toBe(false);
  });

  it("does not confirm a folder when both stores reject it", async () => {
    const request = setup();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("quota"); } });
    const pending = storeFolder({ id: "folder", name: "Проект", color: "#123456", system: false, createdAt: baseNote.createdAt });
    request.onerror();
    expect(await pending).toBe(false);
  });

  it("retains fallback-only folders when IndexedDB becomes readable again", async () => {
    const request = setup();
    const folder = { id: "custom", name: "Монтаж", color: "#123456", system: false, createdAt: baseNote.createdAt };
    localStorage.setItem("lad.note-folders.fallback", JSON.stringify([folder]));
    const resultRequest: Record<string, any> = {};
    request.result = { close: vi.fn(), transaction: () => ({ objectStore: () => ({ getAll: () => resultRequest }) }) };
    const pending = loadFolders();
    request.onsuccess();
    await Promise.resolve();
    resultRequest.result = [];
    resultRequest.onsuccess();
    expect(await pending).toContainEqual(folder);
    expect(JSON.parse(localStorage.getItem("lad.note-folders.fallback")!)).toContainEqual(folder);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("mirrors a new folder before waiting for a stalled database", async () => {
    setup();
    const folder = { id: "new", name: "Репетиция", color: "#123456", system: false, createdAt: baseNote.createdAt };
    const pending = storeFolder(folder);
    expect(JSON.parse(localStorage.getItem("lad.note-folders.fallback")!)).toContainEqual(folder);
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
  });

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
