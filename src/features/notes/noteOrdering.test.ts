import { describe, expect, it } from "vitest";
import { reorderNoteCollection, sortNotes } from "./noteOrdering";
import type { SmartNote } from "./noteTypes";

function note(id: string, order: number, overrides: Partial<SmartNote> = {}): SmartNote {
  const timestamp = `2026-07-${String(order).padStart(2, "0")}T10:00:00.000Z`;
  return {
    id,
    text: id,
    title: id,
    kind: "note",
    space: "Входящие",
    confidence: 1,
    status: "open",
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    contentUpdatedAt: timestamp,
    classificationSource: "local",
    ...overrides
  };
}

describe("note ordering", () => {
  it("uses a persisted manual order ahead of save time", () => {
    const notes = [
      note("newer", 20, { manualOrder: 10 }),
      note("older", 10, { manualOrder: 20 })
    ];
    expect(sortNotes(notes).map((item) => item.id)).toEqual(["older", "newer"]);
  });

  it("moves an open note and returns every rewritten note for persistence", () => {
    const result = reorderNoteCollection(
      [note("a", 3), note("b", 2), note("c", 1)],
      "c",
      "a",
      "before",
      1_000
    );
    expect(result.notes.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(result.changed.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(result.changed.every((item) => typeof item.manualOrder === "number")).toBe(true);
  });

  it("keeps pinned and completed groups isolated", () => {
    const pinned = note("pinned", 4, { pinned: true });
    const open = note("open", 3);
    const done = note("done", 2, { status: "done" });
    expect(reorderNoteCollection([pinned, open, done], "open", "pinned", "before").changed).toEqual([]);
    expect(reorderNoteCollection([pinned, open, done], "done", "open", "before").changed).toEqual([]);
  });

  it("does not rewrite notes when the requested position is unchanged", () => {
    const result = reorderNoteCollection([note("a", 2), note("b", 1)], "a", "b", "before");
    expect(result.changed).toEqual([]);
    expect(result.notes.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
