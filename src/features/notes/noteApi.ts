import type { NoteClassification, NoteKind, SubjectOption } from "./noteTypes";
import { hasExplicitStudyContext, hasExplicitSubjectReference } from "./noteClassifier";

interface RemoteClassification {
  kind?: NoteKind;
  space?: string;
  topic?: string;
  confidence?: number;
  subjectKey?: string;
  dueAt?: string;
}

const NOTE_KINDS = new Set<NoteKind>(["note", "task", "homework", "wish", "idea"]);

export async function requestSmartClassification(
  text: string,
  subjects: SubjectOption[],
  spaces: string[]
): Promise<Partial<NoteClassification> | null> {
  if (!import.meta.env.PROD || !navigator.onLine) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("/app-api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        text: text.slice(0, 4000),
        subjects: subjects.slice(0, 40).map(({ key, label, aliases }) => ({ key, label, aliases: aliases.slice(0, 8) })),
        spaces: spaces.slice(0, 30)
      })
    });
    if (!response.ok) return null;

    const value = await response.json() as RemoteClassification;
    const result: Partial<NoteClassification> = {};
    const explicitStudyContext = hasExplicitStudyContext(text, subjects);
    if (value.kind && NOTE_KINDS.has(value.kind)) result.kind = value.kind;
    if (typeof value.space === "string" && value.space.trim()) {
      const space = value.space.trim().slice(0, 32);
      if (explicitStudyContext) result.space = "Учёба";
      else if (space !== "Учёба") result.space = space;
    }
    if (typeof value.topic === "string" && value.topic.trim()) {
      result.topic = value.topic.trim().replace(/\s+/g, " ").slice(0, 48);
    }
    if (typeof value.confidence === "number") result.confidence = Math.max(0, Math.min(1, value.confidence));
    if (value.subjectKey && subjects.some((subject) => subject.key === value.subjectKey)) {
      const subject = subjects.find((item) => item.key === value.subjectKey);
      if (subject && hasExplicitSubjectReference(text, subject)) {
        result.subjectKey = value.subjectKey;
        result.subjectLabel = subject.label;
      }
    }
    if (value.dueAt && !Number.isNaN(new Date(value.dueAt).getTime())) result.dueAt = new Date(value.dueAt).toISOString();
    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}
