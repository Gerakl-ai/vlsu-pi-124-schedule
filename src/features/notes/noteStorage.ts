import type { SmartNote } from "./noteTypes";

const DB_NAME = "lad-personal";
const DB_VERSION = 1;
const STORE_NAME = "notes";
const FALLBACK_KEY = "lad.notes.fallback";

function readFallback(): SmartNote[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return raw ? JSON.parse(raw) as SmartNote[] : [];
  } catch {
    return [];
  }
}

function writeFallback(notes: SmartNote[]) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(notes));
  } catch {
    // The in-memory state remains available when storage is blocked.
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
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("space", "space");
        store.createIndex("subjectKey", "subjectKey");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB failed"));
  });
}

export async function loadNotes(): Promise<SmartNote[]> {
  try {
    const database = await openDatabase();
    const notes = await new Promise<SmartNote[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as SmartNote[]);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return notes;
  } catch {
    return readFallback();
  }
}

export async function storeNote(note: SmartNote): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(note);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    const notes = readFallback().filter((item) => item.id !== note.id);
    writeFallback([...notes, note]);
  }
}

export async function removeNote(noteId: string): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(noteId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    writeFallback(readFallback().filter((note) => note.id !== noteId));
  }
}
