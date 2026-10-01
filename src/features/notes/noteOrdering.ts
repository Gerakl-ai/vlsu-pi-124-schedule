import type { SmartNote } from "./noteTypes";

export type NoteDropPlacement = "before" | "after";

function savedAt(note: SmartNote) {
  return note.contentUpdatedAt ?? note.createdAt ?? note.updatedAt;
}

export function noteOrderRank(note: SmartNote) {
  if (typeof note.manualOrder === "number" && Number.isFinite(note.manualOrder)) return note.manualOrder;
  const timestamp = Date.parse(savedAt(note));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortNotes(notes: SmartNote[]) {
  return [...notes].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const rankDifference = noteOrderRank(b) - noteOrderRank(a);
    if (rankDifference) return rankDifference;
    const savedDifference = savedAt(b).localeCompare(savedAt(a));
    if (savedDifference) return savedDifference;
    return a.id.localeCompare(b.id);
  });
}

export interface NoteReorderResult {
  notes: SmartNote[];
  changed: SmartNote[];
}

export function reorderNoteCollection(
  notes: SmartNote[],
  sourceId: string,
  targetId: string,
  placement: NoteDropPlacement,
  now = Date.now()
): NoteReorderResult {
  const sorted = sortNotes(notes);
  const source = sorted.find((note) => note.id === sourceId);
  const target = sorted.find((note) => note.id === targetId);

  if (
    !source ||
    !target ||
    source.id === target.id ||
    source.status !== "open" ||
    target.status !== "open" ||
    source.pinned !== target.pinned
  ) {
    return { notes: sorted, changed: [] };
  }

  const group = sorted.filter((note) => note.status === source.status && note.pinned === source.pinned);
  const previousIds = group.map((note) => note.id);
  const reordered = group.filter((note) => note.id !== source.id);
  const targetIndex = reordered.findIndex((note) => note.id === target.id);
  if (targetIndex < 0) return { notes: sorted, changed: [] };
  reordered.splice(targetIndex + (placement === "after" ? 1 : 0), 0, source);

  if (reordered.every((note, index) => note.id === previousIds[index])) {
    return { notes: sorted, changed: [] };
  }

  const highestRank = Math.max(now, ...sorted.map(noteOrderRank)) + reordered.length;
  const reorderedById = new Map(reordered.map((note, index) => [
    note.id,
    { ...note, manualOrder: highestRank - index }
  ]));
  const next = sorted.map((note) => reorderedById.get(note.id) ?? note);
  const changed = reordered.map((note) => reorderedById.get(note.id)!);

  return { notes: sortNotes(next), changed };
}
