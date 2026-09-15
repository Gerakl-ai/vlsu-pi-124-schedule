import { describe, expect, it } from "vitest";
import { LEGACY_PI124_GROUP } from "../groups/groupTypes";
import { normalizeStoredNote } from "./noteStorage";
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
