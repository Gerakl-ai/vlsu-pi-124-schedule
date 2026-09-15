import { describe, expect, it } from "vitest";
import { createNotesBackup, parseNotesBackup } from "./noteBackup";
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
  it("preserves manual deadline metadata in the current version", () => {
    const backup = createNotesBackup([manualDeadlineNote]);
    expect(backup.version).toBe(5);
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
