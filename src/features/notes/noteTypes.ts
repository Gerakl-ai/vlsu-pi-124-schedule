export type NoteKind = "note" | "task" | "homework" | "wish" | "idea";
export type NoteStatus = "open" | "done";
export type ClassificationSource = "local" | "ai";

export interface NoteFolder {
  id: string;
  name: string;
  color: string;
  system: boolean;
  createdAt: string;
}

export interface NoteDocumentInput {
  text: string;
  contentHtml: string;
  pinned: boolean;
  spaceOverride?: string;
}

export interface NoteDraft extends NoteDocumentInput {
  id: string;
  updatedAt: string;
}

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
  contentHtml?: string;
  title: string;
  status: NoteStatus;
  pinned: boolean;
  spaceManual?: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  classificationSource: ClassificationSource;
  classificationPending?: boolean;
}
