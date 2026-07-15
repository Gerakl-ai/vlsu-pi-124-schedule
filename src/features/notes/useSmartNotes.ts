import { useCallback, useEffect, useMemo, useState } from "react";
import type { LessonSlot, WeekMode } from "../../types";
import { buildSubjectOptions, classifyNote, noteTitle } from "./noteClassifier";
import { requestSmartClassification } from "./noteApi";
import { loadNotes, removeNote, storeNote } from "./noteStorage";
import type { SmartNote } from "./noteTypes";

function createId() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortNotes(notes: SmartNote[]) {
  return [...notes].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function useSmartNotes(lessons: LessonSlot[], weekMode: WeekMode, aiEnabled: boolean) {
  const [notes, setNotes] = useState<SmartNote[]>([]);
  const [ready, setReady] = useState(false);
  const subjects = useMemo(() => buildSubjectOptions(lessons, weekMode), [lessons, weekMode]);
  const spaces = useMemo(() => [...new Set(notes.map((note) => note.space))], [notes]);

  useEffect(() => {
    let active = true;
    loadNotes().then((stored) => {
      if (!active) return;
      setNotes(sortNotes(stored));
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const enrichNote = useCallback((note: SmartNote) => {
    if (!aiEnabled) return;
    void requestSmartClassification(note.text, subjects, spaces).then((remote) => {
      if (!remote || (remote.confidence ?? 0) < note.confidence) {
        if (note.classificationPending) {
          setNotes((current) => {
            let settled: SmartNote | undefined;
            const next = current.map((item) => {
              if (item.id !== note.id || item.text !== note.text) return item;
              settled = { ...item, classificationPending: false };
              return settled;
            });
            if (settled) void storeNote(settled);
            return sortNotes(next);
          });
        }
        return;
      }

      setNotes((current) => {
        let enriched: SmartNote | undefined;
        const next = current.map((item) => {
          if (item.id !== note.id || item.text !== note.text) return item;
          enriched = {
            ...item,
            ...remote,
            dueLabel: remote.dueAt
              ? `До ${new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(remote.dueAt))}`
              : item.dueLabel,
            classificationSource: "ai",
            classificationPending: false,
            updatedAt: new Date().toISOString()
          };
          return enriched;
        });
        if (enriched) void storeNote(enriched);
        return sortNotes(next);
      });
    });
  }, [aiEnabled, spaces, subjects]);

  const createNote = useCallback(async (text: string, pinned = false) => {
    const timestamp = new Date().toISOString();
    const classification = classifyNote(text, subjects);
    const note: SmartNote = {
      id: createId(),
      text: text.trim(),
      title: noteTitle(text),
      status: "open",
      pinned,
      createdAt: timestamp,
      updatedAt: timestamp,
      classificationSource: "local",
      classificationPending: aiEnabled && import.meta.env.PROD && navigator.onLine,
      ...classification
    };
    setNotes((current) => sortNotes([note, ...current]));
    await storeNote(note);
    enrichNote(note);
    return note;
  }, [aiEnabled, enrichNote, subjects]);

  const updateNote = useCallback(async (noteId: string, text: string, pinned: boolean) => {
    const existing = notes.find((note) => note.id === noteId);
    if (!existing) return;
    const classification = classifyNote(text, subjects);
    const note: SmartNote = {
      ...existing,
      ...classification,
      text: text.trim(),
      title: noteTitle(text),
      pinned,
      updatedAt: new Date().toISOString(),
      classificationSource: "local",
      classificationPending: aiEnabled && import.meta.env.PROD && navigator.onLine
    };
    setNotes((current) => sortNotes(current.map((item) => item.id === noteId ? note : item)));
    await storeNote(note);
    enrichNote(note);
  }, [aiEnabled, enrichNote, notes, subjects]);

  const toggleNote = useCallback((noteId: string) => {
    setNotes((current) => {
      const next = current.map((note) => note.id === noteId ? {
        ...note,
        status: note.status === "open" ? "done" as const : "open" as const,
        completedAt: note.status === "open" ? new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString()
      } : note);
      const changed = next.find((note) => note.id === noteId);
      if (changed) void storeNote(changed);
      return sortNotes(next);
    });
  }, []);

  const togglePinned = useCallback((noteId: string) => {
    setNotes((current) => {
      const next = current.map((note) => note.id === noteId ? { ...note, pinned: !note.pinned, updatedAt: new Date().toISOString() } : note);
      const changed = next.find((note) => note.id === noteId);
      if (changed) void storeNote(changed);
      return sortNotes(next);
    });
  }, []);

  const deleteNote = useCallback(async (noteId: string) => {
    setNotes((current) => current.filter((note) => note.id !== noteId));
    await removeNote(noteId);
  }, []);

  const importNotes = useCallback(async (incoming: SmartNote[]) => {
    let importedCount = 0;
    const merged = new Map(notes.map((note) => [note.id, note]));
    incoming.forEach((note) => {
      const existing = merged.get(note.id);
      if (!existing || note.updatedAt > existing.updatedAt) {
        merged.set(note.id, { ...note, classificationPending: false });
        importedCount += 1;
      }
    });
    const mergedNotes = sortNotes([...merged.values()]);
    setNotes(mergedNotes);
    for (const note of mergedNotes) await storeNote(note);
    return importedCount;
  }, [notes]);

  const classifyDraft = useCallback((text: string) => classifyNote(text, subjects), [subjects]);

  return {
    notes,
    ready,
    subjects,
    spaces,
    createNote,
    updateNote,
    toggleNote,
    togglePinned,
    deleteNote,
    importNotes,
    classifyDraft
  };
}
