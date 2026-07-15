import type { NoteKind, NoteStatus, SmartNote } from "./noteTypes";

const BACKUP_VERSION = 1;
const NOTE_KINDS = new Set<NoteKind>(["note", "task", "homework", "wish", "idea"]);
const NOTE_STATUSES = new Set<NoteStatus>(["open", "done"]);

interface NotesBackup {
  app: "lad";
  version: number;
  exportedAt: string;
  notes: SmartNote[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isDateString(value: unknown) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isOptionalDateString(value: unknown) {
  return value === undefined || isDateString(value);
}

function isSmartNote(value: unknown): value is SmartNote {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    typeof value.title === "string" &&
    typeof value.space === "string" &&
    typeof value.confidence === "number" && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 &&
    NOTE_KINDS.has(value.kind as NoteKind) &&
    NOTE_STATUSES.has(value.status as NoteStatus) &&
    typeof value.pinned === "boolean" &&
    isDateString(value.createdAt) &&
    isDateString(value.updatedAt) &&
    (value.classificationSource === "local" || value.classificationSource === "ai") &&
    isOptionalDateString(value.completedAt) &&
    isOptionalString(value.subjectKey) &&
    isOptionalString(value.subjectLabel) &&
    isOptionalDateString(value.dueAt) &&
    isOptionalString(value.dueLabel)
  );
}

export function createNotesBackup(notes: SmartNote[]): NotesBackup {
  return {
    app: "lad",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    notes
  };
}

export function downloadNotesBackup(notes: SmartNote[]) {
  const payload = JSON.stringify(createNotesBackup(notes), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `lad-notes-${date}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseNotesBackup(raw: string): SmartNote[] {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.app !== "lad" || parsed.version !== BACKUP_VERSION || !Array.isArray(parsed.notes)) {
    throw new Error("Unsupported notes backup");
  }
  if (!parsed.notes.every(isSmartNote)) throw new Error("Invalid notes backup");
  return parsed.notes;
}
