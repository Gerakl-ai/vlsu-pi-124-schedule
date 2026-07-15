export type NoteKind = "note" | "task" | "homework" | "wish" | "idea";
export type NoteStatus = "open" | "done";
export type ClassificationSource = "local" | "ai";

export interface SubjectOption {
  key: string;
  label: string;
  aliases: string[];
  nextAt?: string;
}

export interface NoteClassification {
  kind: NoteKind;
  space: string;
  confidence: number;
  subjectKey?: string;
  subjectLabel?: string;
  dueAt?: string;
  dueLabel?: string;
}

export interface SmartNote extends NoteClassification {
  id: string;
  text: string;
  title: string;
  status: NoteStatus;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  classificationSource: ClassificationSource;
  classificationPending?: boolean;
}
