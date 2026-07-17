import { useCallback, useEffect, useMemo, useState } from "react";
import type { LessonSlot, WeekMode } from "../../types";
import { buildSubjectOptions, classifyNote, explicitPersonalSpace, noteTitle } from "./noteClassifier";
import { requestSmartClassification } from "./noteApi";
import { formatDueLabel, resolveNoteDeadline } from "./noteDeadline";
import {
  DEFAULT_NOTE_FOLDERS,
  loadFolders,
  loadNotes,
  removeFolder,
  removeNote,
  storeFolder,
  storeNote
} from "./noteStorage";
import type { NoteDocumentInput, NoteFolder, SmartNote } from "./noteTypes";

const FOLDER_COLORS = ["#6bd6ff", "#59dfc1", "#ffc55f", "#ff8a7f", "#d89cff", "#76a8ff"];

function createId(prefix: string) {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortNotes(notes: SmartNote[]) {
  return [...notes].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aSavedAt = a.contentUpdatedAt ?? a.createdAt ?? a.updatedAt;
    const bSavedAt = b.contentUpdatedAt ?? b.createdAt ?? b.updatedAt;
    return bSavedAt.localeCompare(aSavedAt);
  });
}

function normalizedFolderName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function useSmartNotes(lessons: LessonSlot[], weekMode: WeekMode, aiEnabled: boolean) {
  const [notes, setNotes] = useState<SmartNote[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>(DEFAULT_NOTE_FOLDERS);
  const [ready, setReady] = useState(false);
  const subjects = useMemo(() => buildSubjectOptions(lessons, weekMode), [lessons, weekMode]);
  const spaces = useMemo(
    () => [...new Set([...folders.map((folder) => folder.name), ...notes.map((note) => note.space)])],
    [folders, notes]
  );

  useEffect(() => {
    let active = true;
    Promise.all([loadNotes(), loadFolders()]).then(([storedNotes, storedFolders]) => {
      if (!active) return;
      setNotes(sortNotes(storedNotes));
      setFolders(storedFolders);
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
        const protectedSpace = explicitPersonalSpace(note.text);
        const next = current.map((item) => {
          if (item.id !== note.id || item.text !== note.text) return item;
          const enrichedSpace = item.spaceManual ? item.space : protectedSpace ?? remote.space ?? item.space;
          const remoteDueAt = item.dueManual ? item.dueAt : remote.dueAt ?? item.dueAt;
          const nextNote: SmartNote = {
            ...item,
            ...remote,
            space: enrichedSpace,
            spaceManual: item.spaceManual,
            subjectKey: protectedSpace ? undefined : remote.subjectKey ?? item.subjectKey,
            subjectLabel: protectedSpace ? undefined : remote.subjectLabel ?? item.subjectLabel,
            dueAt: remoteDueAt,
            dueLabel: remoteDueAt ? formatDueLabel(remoteDueAt) : undefined,
            dueManual: item.dueManual,
            classificationSource: "ai",
            classificationPending: false,
            updatedAt: new Date().toISOString()
          };
          enriched = nextNote;
          return nextNote;
        });
        if (enriched) void storeNote(enriched);
        return sortNotes(next);
      });
    });
  }, [aiEnabled, spaces, subjects]);

  const createNote = useCallback(async (input: NoteDocumentInput) => {
    const timestamp = new Date().toISOString();
    const classification = classifyNote(input.text, subjects, spaces);
    if (input.spaceOverride) classification.space = input.spaceOverride;
    const deadline = resolveNoteDeadline(classification, input.dueAtOverride);
    const note: SmartNote = {
      id: createId("note"),
      text: input.text.trim(),
      contentHtml: input.contentHtml,
      title: noteTitle(input.text),
      status: "open",
      pinned: input.pinned,
      spaceManual: Boolean(input.spaceOverride),
      createdAt: timestamp,
      updatedAt: timestamp,
      contentUpdatedAt: timestamp,
      classificationSource: "local",
      classificationPending: aiEnabled && import.meta.env.PROD && navigator.onLine,
      ...classification,
      ...deadline
    };
    setNotes((current) => sortNotes([note, ...current]));
    await storeNote(note);
    enrichNote(note);
    return note;
  }, [aiEnabled, enrichNote, spaces, subjects]);

  const updateNote = useCallback(async (noteId: string, input: NoteDocumentInput) => {
    const existing = notes.find((note) => note.id === noteId);
    if (!existing) return;
    const classification = classifyNote(input.text, subjects, spaces);
    if (input.spaceOverride) classification.space = input.spaceOverride;
    const deadline = resolveNoteDeadline(classification, input.dueAtOverride);
    const timestamp = new Date().toISOString();
    const note: SmartNote = {
      ...existing,
      ...classification,
      text: input.text.trim(),
      contentHtml: input.contentHtml,
      title: noteTitle(input.text),
      pinned: input.pinned,
      spaceManual: Boolean(input.spaceOverride),
      updatedAt: timestamp,
      contentUpdatedAt: timestamp,
      classificationSource: "local",
      classificationPending: aiEnabled && import.meta.env.PROD && navigator.onLine,
      ...deadline
    };
    setNotes((current) => sortNotes(current.map((item) => item.id === noteId ? note : item)));
    await storeNote(note);
    enrichNote(note);
    return note;
  }, [aiEnabled, enrichNote, notes, spaces, subjects]);

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

  const createFolder = useCallback(async (name: string) => {
    const normalized = normalizedFolderName(name);
    if (!normalized) return null;
    const existing = folders.find((folder) => folder.name.localeCompare(normalized, "ru", { sensitivity: "accent" }) === 0);
    if (existing) return existing;
    const folder: NoteFolder = {
      id: createId("folder"),
      name: normalized.slice(0, 28),
      color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length],
      system: false,
      createdAt: new Date().toISOString()
    };
    setFolders((current) => [...current, folder]);
    await storeFolder(folder);
    return folder;
  }, [folders]);

  const deleteFolder = useCallback(async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder || folder.system) return;
    setFolders((current) => current.filter((item) => item.id !== folderId));
    setNotes((current) => {
      const next = current.map((note) => note.space === folder.name
        ? { ...note, space: "Входящие", spaceManual: false, updatedAt: new Date().toISOString() }
        : note);
      next.filter((note, index) => note !== current[index]).forEach((note) => void storeNote(note));
      return sortNotes(next);
    });
    await removeFolder(folderId);
  }, [folders]);

  const importNotes = useCallback(async (incoming: SmartNote[]) => {
    let importedCount = 0;
    const merged = new Map(notes.map((note) => [note.id, note]));
    incoming.forEach((note) => {
      const existing = merged.get(note.id);
      if (!existing || note.updatedAt > existing.updatedAt) {
        merged.set(note.id, {
          ...note,
          contentUpdatedAt: note.contentUpdatedAt ?? note.createdAt ?? note.updatedAt,
          classificationPending: false
        });
        importedCount += 1;
      }
    });
    const mergedNotes = sortNotes([...merged.values()]);
    setNotes(mergedNotes);
    for (const note of mergedNotes) await storeNote(note);
    return importedCount;
  }, [notes]);

  const classifyDraft = useCallback((text: string) => classifyNote(text, subjects, spaces), [spaces, subjects]);

  return {
    notes,
    folders,
    ready,
    subjects,
    spaces,
    createNote,
    updateNote,
    toggleNote,
    togglePinned,
    deleteNote,
    createFolder,
    deleteFolder,
    importNotes,
    classifyDraft
  };
}
