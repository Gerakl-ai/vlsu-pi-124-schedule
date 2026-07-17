import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FolderHeart,
  FolderPlus,
  Inbox,
  Lightbulb,
  ListTodo,
  LoaderCircle,
  Mic,
  Music2,
  PanelsTopLeft,
  Radio,
  Search,
  Sparkles,
  SquarePen,
  X
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { LessonSlot, WeekMode } from "../../types";
import { FolderSheet } from "./FolderSheet";
import { deadlineForCalendarDate } from "./noteDeadline";
import { NoteCard } from "./NoteCard";
import type { NoteClassification, NoteDocumentInput, NoteFolder, SmartNote } from "./noteTypes";

let noteComposerModule: Promise<typeof import("./NoteComposer")> | undefined;
let calendarModule: Promise<typeof import("./SmartCalendarSheet")> | undefined;

function loadNoteComposer() {
  noteComposerModule ??= import("./NoteComposer");
  return noteComposerModule;
}

function loadSmartCalendar() {
  calendarModule ??= import("./SmartCalendarSheet");
  return calendarModule;
}

function preloadNoteComposer() {
  void loadNoteComposer().catch(() => undefined);
}

function preloadSmartCalendar() {
  void loadSmartCalendar().catch(() => undefined);
}

const LazyNoteComposer = lazy(async () => ({ default: (await loadNoteComposer()).NoteComposer }));
const LazySmartCalendarSheet = lazy(async () => ({ default: (await loadSmartCalendar()).SmartCalendarSheet }));

function SheetModuleFallback({ label }: { label: string }) {
  const layer = (
    <div className="sheet-layer sheet-module-layer" aria-live="polite">
      <div className="sheet-module-loading"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>
    </div>
  );
  const portalHost = document.querySelector(".phone-frame");
  return portalHost ? createPortal(layer, portalHost) : layer;
}

interface NotesViewProps {
  visualSrc: string;
  notes: SmartNote[];
  folders: NoteFolder[];
  lessons: LessonSlot[];
  ready: boolean;
  weekMode: WeekMode;
  calendarRequestToken: number;
  classifyDraft: (text: string) => NoteClassification;
  onCreate: (input: NoteDocumentInput) => Promise<SmartNote>;
  onCreateFolder: (name: string) => Promise<NoteFolder | null>;
  onDelete: (noteId: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onToggle: (noteId: string) => void;
  onTogglePinned: (noteId: string) => void;
  onUpdate: (noteId: string, input: NoteDocumentInput) => Promise<SmartNote | undefined>;
  onCalendarRequestHandled: () => void;
}

interface SmartFilter {
  id: string;
  label: string;
  space?: string;
  color?: string;
  icon: typeof Inbox;
}

function iconForSpace(space: string) {
  const value = space.toLocaleLowerCase("ru-RU");
  if (value.includes("учёб") || value.includes("учеб")) return BookOpenCheck;
  if (value.includes("танц")) return Music2;
  if (value.includes("радио")) return Radio;
  if (value.includes("проект")) return PanelsTopLeft;
  if (value.includes("дел")) return ListTodo;
  if (value.includes("хот")) return FolderHeart;
  if (value.includes("иде")) return Lightbulb;
  return Sparkles;
}

export function NotesView({
  visualSrc,
  notes,
  folders,
  lessons = [],
  ready,
  weekMode = "all",
  calendarRequestToken,
  classifyDraft,
  onCreate,
  onCreateFolder,
  onDelete,
  onDeleteFolder,
  onToggle,
  onTogglePinned,
  onUpdate,
  onCalendarRequestHandled
}: NotesViewProps) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(() => new URLSearchParams(window.location.search).get("compose") === "1");
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<SmartNote | null>(null);
  const [voiceStartToken, setVoiceStartToken] = useState(0);
  const [composerSeed, setComposerSeed] = useState("");
  const [composerDueAt, setComposerDueAt] = useState<string | undefined>(undefined);
  const [revealedNoteId, setRevealedNoteId] = useState<string | null>(null);

  const filters = useMemo<SmartFilter[]>(() => {
    const folderFilters = folders.map((folder) => ({
      id: `folder:${folder.id}`,
      label: folder.name,
      space: folder.name,
      color: folder.color,
      icon: iconForSpace(folder.name)
    }));
    const reserved = new Set(folders.map((folder) => folder.name.toLocaleLowerCase("ru-RU")));
    const dynamic = [...new Set(notes.map((note) => note.space))]
      .filter((space) => !reserved.has(space.toLocaleLowerCase("ru-RU")))
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map((space) => ({ id: `space:${space}`, label: space, space, icon: iconForSpace(space) }));
    return [{ id: "all", label: "Все", icon: Inbox }, ...folderFilters, ...dynamic];
  }, [folders, notes]);

  const selectedFilter = filters.find((filter) => filter.id === activeFilter) ?? filters[0];
  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
    return notes.filter((note) => {
      if (selectedFilter.space && note.space !== selectedFilter.space) return false;
      if (!normalizedQuery) return true;
      return `${note.title} ${note.text} ${note.space} ${note.subjectLabel ?? ""}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery);
    });
  }, [notes, query, selectedFilter]);

  const openCount = notes.filter((note) => note.status === "open").length;
  const studyCount = notes.filter((note) => note.status === "open" && (note.space === "Учёба" || note.kind === "homework")).length;
  const todayCount = notes.filter((note) => note.status === "open" && note.dueAt && new Date(note.dueAt).toDateString() === new Date().toDateString()).length;
  const calendarDate = new Date();
  const calendarDay = calendarDate.getDate();
  const calendarMonth = new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(calendarDate).replace(".", "");
  const deadlineCount = notes.filter((note) => note.status === "open" && note.dueAt).length;

  useEffect(() => {
    if (revealedNoteId && !notes.some((note) => note.id === revealedNoteId)) setRevealedNoteId(null);
  }, [notes, revealedNoteId]);

  useEffect(() => {
    if (!calendarRequestToken) return;
    preloadSmartCalendar();
    setCalendarOpen(true);
    onCalendarRequestHandled();
  }, [calendarRequestToken, onCalendarRequestHandled]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.allSettled([loadNoteComposer(), loadSmartCalendar()]);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  function closeComposer() {
    setComposerOpen(false);
    setEditingNote(null);
    setVoiceStartToken(0);
    setComposerSeed("");
    setComposerDueAt(undefined);
  }

  function createBlankNote(seed = "", dueAt?: string) {
    preloadNoteComposer();
    setEditingNote(null);
    setComposerSeed(seed);
    setComposerDueAt(dueAt);
    setVoiceStartToken(0);
    setComposerOpen(true);
  }

  function startDictation() {
    preloadNoteComposer();
    setEditingNote(null);
    setComposerSeed("");
    setComposerDueAt(undefined);
    setVoiceStartToken((value) => value + 1 || 1);
    setComposerOpen(true);
  }

  function openNote(note: SmartNote) {
    preloadNoteComposer();
    setCalendarOpen(false);
    setEditingNote(note);
    setComposerSeed("");
    setComposerDueAt(undefined);
    setVoiceStartToken(0);
    setComposerOpen(true);
  }

  async function saveNote(input: NoteDocumentInput, noteId?: string) {
    if (noteId) await onUpdate(noteId, input);
    else await onCreate(input);
  }

  return (
    <div className="view-stack notes-view">
      <section className="notes-heading">
        <div>
          <span>Личное пространство</span>
          <h2>Записи</h2>
        </div>
        <div className="notes-heading-actions">
          <button type="button" onPointerDown={preloadNoteComposer} onClick={startDictation} aria-label="Начать умную диктовку" title="Умная диктовка" data-testid="start-smart-dictation">
            <Mic size={20} />
          </button>
          <button type="button" onPointerDown={preloadSmartCalendar} onClick={() => setCalendarOpen(true)} aria-label="Открыть умный календарь" title="Календарь" data-testid="open-smart-calendar">
            <CalendarDays size={20} />
          </button>
        </div>
      </section>

      <section className="notes-pulse" aria-label="Сводка записей">
        <div><span>Открыто</span><strong>{openCount}</strong><ListTodo size={18} /></div>
        <div><span>Учёба</span><strong>{studyCount}</strong><BookOpenCheck size={18} /></div>
        <div><span>Сегодня</span><strong>{todayCount}</strong><CheckCircle2 size={18} /></div>
      </section>

      <button className="quick-capture create-entry" type="button" onPointerDown={preloadNoteComposer} onClick={() => createBlankNote()} aria-label="Создать запись" data-testid="open-note-composer">
        <span className="quick-capture-icon"><SquarePen size={23} /></span>
        <span>
          <strong>Создать запись</strong>
          <small>Текст, чек-лист, фото или идея в свободной форме</small>
        </span>
        <span className="quick-capture-tail" aria-hidden="true"><Sparkles size={14} /><ChevronRight size={21} /></span>
      </button>

      <button className="calendar-launch-card" type="button" onPointerDown={preloadSmartCalendar} onClick={() => setCalendarOpen(true)} aria-label="Открыть календарь пар и записей" data-testid="calendar-launch-card">
        <span className="calendar-launch-date" aria-hidden="true">
          <small>{calendarMonth}</small>
          <strong>{calendarDay}</strong>
        </span>
        <span className="calendar-launch-copy">
          <small>Пары + личные планы</small>
          <strong>Календарь</strong>
          <em>{deadlineCount ? `Сроков в записях: ${deadlineCount}` : "Все даты в одном ритме"}</em>
        </span>
        <span className="calendar-launch-tail" aria-hidden="true"><CalendarDays size={18} /><ChevronRight size={21} /></span>
      </button>

      <label className="notes-search">
        <Search size={18} />
        <input value={query} onChange={(event) => { setQuery(event.target.value); setRevealedNoteId(null); }} placeholder="Поиск по записям" aria-label="Поиск по записям" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск" title="Очистить"><X size={16} /></button>}
      </label>

      <div className="space-rail" aria-label="Папки записей">
        {filters.map(({ id, label, space, color, icon: Icon }) => {
          const count = notes.filter((note) => !space || note.space === space).length;
          return (
            <button key={id} className={selectedFilter.id === id ? "active" : ""} type="button" onClick={() => { setActiveFilter(id); setRevealedNoteId(null); }} aria-pressed={selectedFilter.id === id}>
              {color ? <i className="folder-color" style={{ background: color }} aria-hidden="true" /> : <Icon size={16} />}
              <span>{label}</span>
              <small>{count}</small>
            </button>
          );
        })}
        <button className="folder-manage-button" type="button" onClick={() => setFolderSheetOpen(true)} aria-label="Добавить или изменить папки" title="Папки">
          <FolderPlus size={16} />
          <span>Папки</span>
        </button>
      </div>

      {!ready ? (
        <section className="notes-loading" aria-label="Загрузка записей"><span /><span /><span /></section>
      ) : visibleNotes.length ? (
        <section className="notes-list" aria-label={`Записи: ${selectedFilter.label}`}>
          <header><span>{selectedFilter.label}</span><strong>{visibleNotes.length}</strong></header>
          {visibleNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              revealed={revealedNoteId === note.id}
              onEdit={(value) => {
                openNote(value);
              }}
              onDelete={async (noteId) => {
                await onDelete(noteId);
                setRevealedNoteId(null);
              }}
              onReveal={() => setRevealedNoteId(note.id)}
              onCloseReveal={() => setRevealedNoteId(null)}
              onToggle={onToggle}
              onTogglePinned={onTogglePinned}
            />
          ))}
        </section>
      ) : (
        <section className="notes-empty">
          <img src={visualSrc} alt="Блокнот с расписанием и зарисовкой главного корпуса ВлГУ" />
          <div>
            <Sparkles size={23} />
            <h3>{query ? "Ничего не найдено" : "Здесь пока тихо"}</h3>
            <p>{query ? "Попробуйте другой запрос." : "Новая запись появится в этом пространстве."}</p>
            {!query && (
              <button
                className="notes-empty-create"
                type="button"
                onClick={() => createBlankNote()}
              >
                <SquarePen size={17} />
                Создать запись
              </button>
            )}
          </div>
        </section>
      )}

      {composerOpen && (
        <Suspense fallback={<SheetModuleFallback label="Открываем запись" />}>
          <LazyNoteComposer
            note={editingNote}
            folders={folders}
            open={composerOpen}
            initialSeed={composerSeed}
            initialDueAt={composerDueAt}
            voiceStartToken={voiceStartToken}
            classifyDraft={classifyDraft}
            onClose={closeComposer}
            onDelete={onDelete}
            onSave={saveNote}
          />
        </Suspense>
      )}
      <FolderSheet folders={folders} open={folderSheetOpen} onClose={() => setFolderSheetOpen(false)} onCreate={onCreateFolder} onDelete={onDeleteFolder} />
      {calendarOpen && (
        <Suspense fallback={<SheetModuleFallback label="Открываем календарь" />}>
          <LazySmartCalendarSheet
            lessons={lessons}
            notes={notes}
            open={calendarOpen}
            weekMode={weekMode}
            onClose={() => setCalendarOpen(false)}
            onCreateForDate={(date) => createBlankNote("", deadlineForCalendarDate(date))}
            onOpenNote={(noteId) => {
              const note = notes.find((item) => item.id === noteId);
              if (note) openNote(note);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
