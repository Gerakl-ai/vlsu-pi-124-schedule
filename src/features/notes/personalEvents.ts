import { useSyncExternalStore } from "react";

export interface PersonalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string;
  description: string;
}

const KEY = "lad.personal-events.v1";
const CHANGED = "lad-personal-events-changed";
let rawSnapshot: string | null | undefined;
let snapshot: PersonalEvent[] = [];

export function validPersonalEvent(value: unknown): value is PersonalEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as PersonalEvent;
  return typeof event.id === "string" && typeof event.title === "string" && Boolean(event.title.trim())
    && typeof event.location === "string" && typeof event.description === "string"
    && typeof event.start === "string" && typeof event.end === "string"
    && Number.isFinite(Date.parse(event.start)) && Date.parse(event.end) > Date.parse(event.start);
}

export function readPersonalEvents(): PersonalEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== rawSnapshot) {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      snapshot = Array.isArray(parsed) ? parsed.filter(validPersonalEvent) : [];
      rawSnapshot = raw;
    }
  } catch { /* Keep the last readable in-memory snapshot. */ }
  return snapshot;
}

function write(events: PersonalEvent[]) {
  // Do not report success or replace the UI snapshot when persistence fails.
  localStorage.setItem(KEY, JSON.stringify(events));
  window.dispatchEvent(new Event(CHANGED));
}

export function savePersonalEvent(event: PersonalEvent) {
  if (!validPersonalEvent(event)) throw new Error("Проверьте название и время события");
  write([...readPersonalEvents().filter((item) => item.id !== event.id), event]);
}

export function deletePersonalEvent(id: string) {
  write(readPersonalEvents().filter((item) => item.id !== id));
}

export function mergePersonalEvents(current: PersonalEvent[], incoming: PersonalEvent[]) {
  if (!incoming.every(validPersonalEvent)) throw new Error("Invalid calendar backup");
  const events = [...current];
  let conflicts = 0;
  const signature = (event: PersonalEvent) => JSON.stringify([event.title, Date.parse(event.start), Date.parse(event.end), event.location, event.description]);
  for (const event of incoming) {
    // Re-importing an archive must not duplicate previously recovered conflicts.
    if (events.some((item) => signature(item) === signature(event))) continue;
    const collision = events.some((item) => item.id === event.id);
    events.push(collision ? { ...event, id: crypto.randomUUID() } : event);
    if (collision) conflicts += 1;
  }
  return { events, added: events.length - current.length, conflicts };
}

export function importPersonalEvents(incoming: PersonalEvent[]) {
  const result = mergePersonalEvents(readPersonalEvents(), incoming);
  if (result.added) write(result.events);
  return result;
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) notify(); };
  window.addEventListener(CHANGED, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED, notify);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePersonalEvents() {
  return useSyncExternalStore(subscribe, readPersonalEvents, readPersonalEvents);
}

export function personalEventsOnDate(events: PersonalEvent[], date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  return events.filter((event) => Date.parse(event.start) < end && Date.parse(event.end) > start)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
