import { describe, expect, it } from "vitest";
import { createNotesBackup, parseNotesBackup, parseNotesArchive } from "./noteBackup";
import type { SmartNote } from "./noteTypes";

const manualDeadlineNote: SmartNote = {
  id: "note-1",
  text: "Подготовить макет",
  title: "Подготовить макет",
  kind: "task",
  space: "Проект",
  confidence: 1,
  status: "open",
  pinned: false,
  dueAt: "2026-07-20T15:00:00.000Z",
  dueLabel: "До пн, 20.07, 18:00",
  dueManual: true,
  createdAt: "2026-07-17T10:00:00.000Z",
  updatedAt: "2026-07-17T10:00:00.000Z",
  manualOrder: 42,
  classificationSource: "local"
};

describe("notes backup", () => {
  it("round-trips calendar details independently of academic notes", () => {
    const event = { id: "event", title: "Баня", start: "2026-09-23T18:00:00+03:00", end: "2026-09-23T20:00:00+03:00", location: "Центр", description: "Встреча" };
    expect(parseNotesArchive(JSON.stringify(createNotesBackup([], [], [event]))).events).toEqual([event]);
  });
  it("accepts version 6 without calendar data", () => {
    expect(parseNotesArchive(JSON.stringify({ app: "lad", version: 6, notes: [], folders: [] })).events).toEqual([]);
  });
  it("rejects malformed calendar events before importing any notes", () => {
    expect(() => parseNotesArchive(JSON.stringify({ ...createNotesBackup([manualDeadlineNote]), events: [{ id: "bad" }] }))).toThrow("Invalid calendar backup");
  });
  it("preserves empty custom folders and their colors", () => {
    const folder = { id: "custom", name: "Монтаж", color: "#123456", system: false, createdAt: manualDeadlineNote.createdAt };
    expect(parseNotesArchive(JSON.stringify(createNotesBackup([], [folder])))).toEqual({ notes: [], folders: [folder], events: [] });
  });

  it("rejects invalid folders before importing", () => {
    expect(() => parseNotesArchive(JSON.stringify({ ...createNotesBackup([manualDeadlineNote]), folders: [{ id: "bad" }] }))).toThrow("Invalid folders backup");
  });
  it("preserves manual deadline metadata in the current version", () => {
    const backup = createNotesBackup([manualDeadlineNote]);
    expect(backup.version).toBe(7);
    expect(parseNotesBackup(JSON.stringify(backup))).toEqual([manualDeadlineNote]);
  });

  it("preserves the group scope of a study note", () => {
    const scoped = { ...manualDeadlineNote, subjectKey: "database", groupNrec: "group-a", groupName: "ПИ-124" };
    expect(parseNotesBackup(JSON.stringify(createNotesBackup([scoped])))).toEqual([scoped]);
  });

  it("still accepts a version 2 backup", () => {
    const legacy = { ...manualDeadlineNote };
    delete legacy.dueManual;
    expect(parseNotesBackup(JSON.stringify({ app: "lad", version: 2, exportedAt: new Date().toISOString(), notes: [legacy] }))).toEqual([legacy]);
  });
});
