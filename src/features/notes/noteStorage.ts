import type { NoteDraft, NoteFolder, SmartNote } from "./noteTypes";

const DB_NAME = "lad-personal";
const DB_VERSION = 2;
const NOTES_STORE = "notes";
const FOLDERS_STORE = "folders";
const DRAFTS_STORE = "drafts";
const NOTES_FALLBACK_KEY = "lad.notes.fallback";
const FOLDERS_FALLBACK_KEY = "lad.note-folders.fallback";
const DRAFTS_FALLBACK_KEY = "lad.note-drafts.fallback";
const DEFAULT_DATE = "2026-01-01T00:00:00.000Z";

export const DEFAULT_NOTE_FOLDERS: NoteFolder[] = [
  { id: "inbox", name: "Входящие", color: "#9ca8ba", system: true, createdAt: DEFAULT_DATE },
  { id: "study", name: "Учёба", color: "#76a8ff", system: true, createdAt: DEFAULT_DATE },
  { id: "work", name: "Работа", color: "#eea56c", system: true, createdAt: DEFAULT_DATE },
  { id: "tasks", name: "Дела", color: "#59dfc1", system: true, createdAt: DEFAULT_DATE },
  { id: "wishes", name: "Хотелки", color: "#ff8a7f", system: true, createdAt: DEFAULT_DATE },
  { id: "dance", name: "Танцы", color: "#d89cff", system: true, createdAt: DEFAULT_DATE },
  { id: "radio", name: "Радио", color: "#ffc55f", system: true, createdAt: DEFAULT_DATE },
  { id: "project", name: "Проект", color: "#6bd6ff", system: true, createdAt: DEFAULT_DATE }
];

function readFallback<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeFallback<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current session still keeps the in-memory value when storage is blocked.
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(NOTES_STORE)) {
        const store = database.createObjectStore(NOTES_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("space", "space");
        store.createIndex("subjectKey", "subjectKey");
      }
      if (!database.objectStoreNames.contains(FOLDERS_STORE)) {
        database.createObjectStore(FOLDERS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(DRAFTS_STORE)) {
        database.createObjectStore(DRAFTS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB failed"));
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const database = await openDatabase();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function putValue<T>(storeName: string, value: T): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function deleteValue(storeName: string, id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function loadNotes(): Promise<SmartNote[]> {
  const fallbackNotes = readFallback<SmartNote[]>(NOTES_FALLBACK_KEY, []);
  let notes: SmartNote[];
  try {
    const storedNotes = await getAll<SmartNote>(NOTES_STORE);
    const merged = new Map(fallbackNotes.map((note) => [note.id, note]));
    storedNotes.forEach((note) => {
      const fallback = merged.get(note.id);
      if (!fallback || note.updatedAt >= fallback.updatedAt) merged.set(note.id, note);
    });
    notes = [...merged.values()];
  } catch {
    notes = fallbackNotes;
  }
  const normalized = notes.map((note) => ({
    ...note,
    contentUpdatedAt: note.contentUpdatedAt ?? note.createdAt ?? note.updatedAt
  }));
  writeFallback(NOTES_FALLBACK_KEY, normalized);
  return normalized;
}

export async function storeNote(note: SmartNote): Promise<void> {
  const notes = readFallback<SmartNote[]>(NOTES_FALLBACK_KEY, []).filter((item) => item.id !== note.id);
  writeFallback(NOTES_FALLBACK_KEY, [...notes, note]);
  try {
    await putValue(NOTES_STORE, note);
  } catch { /* The synchronous mirror is already up to date. */ }
}

export async function removeNote(noteId: string): Promise<void> {
  writeFallback(NOTES_FALLBACK_KEY, readFallback<SmartNote[]>(NOTES_FALLBACK_KEY, []).filter((note) => note.id !== noteId));
  try {
    await deleteValue(NOTES_STORE, noteId);
  } catch { /* The synchronous mirror is already up to date. */ }
}

function mergeDefaultFolders(stored: NoteFolder[]) {
  const custom = stored.filter((folder) => !folder.system && !DEFAULT_NOTE_FOLDERS.some((item) => item.id === folder.id));
  return [...DEFAULT_NOTE_FOLDERS, ...custom];
}

export async function loadFolders(): Promise<NoteFolder[]> {
  try {
    const stored = await getAll<NoteFolder>(FOLDERS_STORE);
    const folders = mergeDefaultFolders(stored);
    await Promise.all(DEFAULT_NOTE_FOLDERS.map((folder) => putValue(FOLDERS_STORE, folder)));
    return folders;
  } catch {
    return mergeDefaultFolders(readFallback<NoteFolder[]>(FOLDERS_FALLBACK_KEY, []));
  }
}

export async function storeFolder(folder: NoteFolder): Promise<void> {
  try {
    await putValue(FOLDERS_STORE, folder);
  } catch {
    const folders = readFallback<NoteFolder[]>(FOLDERS_FALLBACK_KEY, []).filter((item) => item.id !== folder.id);
    writeFallback(FOLDERS_FALLBACK_KEY, [...folders, folder]);
  }
}

export async function removeFolder(folderId: string): Promise<void> {
  try {
    await deleteValue(FOLDERS_STORE, folderId);
  } catch {
    writeFallback(FOLDERS_FALLBACK_KEY, readFallback<NoteFolder[]>(FOLDERS_FALLBACK_KEY, []).filter((folder) => folder.id !== folderId));
  }
}

export async function loadDraft(draftId: string): Promise<NoteDraft | null> {
  try {
    const database = await openDatabase();
    try {
      return await new Promise<NoteDraft | null>((resolve, reject) => {
        const request = database.transaction(DRAFTS_STORE, "readonly").objectStore(DRAFTS_STORE).get(draftId);
        request.onsuccess = () => resolve((request.result as NoteDraft | undefined) ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  } catch {
    const drafts = readFallback<Record<string, NoteDraft>>(DRAFTS_FALLBACK_KEY, {});
    return drafts[draftId] ?? null;
  }
}

export function readDraftSnapshot(draftId: string) {
  return readFallback<Record<string, NoteDraft>>(DRAFTS_FALLBACK_KEY, {})[draftId] ?? null;
}

export async function storeDraft(draft: NoteDraft): Promise<void> {
  const drafts = readFallback<Record<string, NoteDraft>>(DRAFTS_FALLBACK_KEY, {});
  writeFallback(DRAFTS_FALLBACK_KEY, { ...drafts, [draft.id]: draft });
  try {
    await putValue(DRAFTS_STORE, draft);
  } catch {
    // The synchronous mirror already protects the latest text.
  }
}

export async function removeDraft(draftId: string): Promise<void> {
  const drafts = readFallback<Record<string, NoteDraft>>(DRAFTS_FALLBACK_KEY, {});
  delete drafts[draftId];
  writeFallback(DRAFTS_FALLBACK_KEY, drafts);
  try {
    await deleteValue(DRAFTS_STORE, draftId);
  } catch {
    // The mirror is authoritative when IndexedDB is unavailable.
  }
}
