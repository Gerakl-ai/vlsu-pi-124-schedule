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
  Mic,
  Music2,
  PanelsTopLeft,
  Radio,
  Search,
  Sparkles,
  SquarePen,
  X
} from "lucide-react";
import { useMemo, useState } from "react";
import type { LessonSlot, WeekMode } from "../../types";
import { FolderSheet } from "./FolderSheet";
import { NoteCard } from "./NoteCard";
import { NoteComposer } from "./NoteComposer";
import { SmartCalendarSheet } from "./SmartCalendarSheet";
import type { NoteClassification, NoteDocumentInput, NoteFolder, SmartNote } from "./noteTypes";

interface NotesViewProps {
  visualSrc: string;
  notes: SmartNote[];
  folders: NoteFolder[];
  lessons: LessonSlot[];
  ready: boolean;
  weekMode: WeekMode;
  classifyDraft: (text: string) => NoteClassification;
  onCreate: (input: NoteDocumentInput) => Promise<SmartNote>;
  onCreateFolder: (name: string) => Promise<NoteFolder | null>;
  onDelete: (noteId: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onToggle: (noteId: string) => void;
  onTogglePinned: (noteId: string) => void;
  onUpdate: (noteId: string, input: NoteDocumentInput) => Promise<SmartNote | undefined>;
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
  classifyDraft,
  onCreate,
  onCreateFolder,
  onDelete,
  onDeleteFolder,
  onToggle,
  onTogglePinned,
  onUpdate
}: NotesViewProps) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(() => new URLSearchParams(window.location.search).get("compose") === "1");
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<SmartNote | null>(null);
  const [voiceStartToken, setVoiceStartToken] = useState(0);
  const [composerSeed, setComposerSeed] = useState("");

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

  function closeComposer() {
    setComposerOpen(false);
    setEditingNote(null);
    setVoiceStartToken(0);
    setComposerSeed("");
  }

  function createBlankNote(seed = "") {
    setEditingNote(null);
    setComposerSeed(seed);
    setVoiceStartToken(0);
    setComposerOpen(true);
  }

  function startDictation() {
    setEditingNote(null);
    setComposerSeed("");
    setVoiceStartToken((value) => value + 1 || 1);
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
          <button type="button" onClick={startDictation} aria-label="Начать умную диктовку" title="Умная диктовка" data-testid="start-smart-dictation">
            <Mic size={20} />
          </button>
          <button type="button" onClick={() => setCalendarOpen(true)} aria-label="Открыть умный календарь" title="Календарь" data-testid="open-smart-calendar">
            <CalendarDays size={20} />
          </button>
        </div>
      </section>

      <section className="notes-pulse" aria-label="Сводка записей">
        <div><span>Открыто</span><strong>{openCount}</strong><ListTodo size={18} /></div>
        <div><span>Учёба</span><strong>{studyCount}</strong><BookOpenCheck size={18} /></div>
        <div><span>Сегодня</span><strong>{todayCount}</strong><CheckCircle2 size={18} /></div>
      </section>

      <button className="quick-capture create-entry" type="button" onClick={() => createBlankNote()} aria-label="Создать запись" data-testid="open-note-composer">
        <span className="quick-capture-icon"><SquarePen size={23} /></span>
        <span>
          <strong>Создать запись</strong>
          <small>Текст, чек-лист, фото или идея в свободной форме</small>
        </span>
        <span className="quick-capture-tail" aria-hidden="true"><Sparkles size={14} /><ChevronRight size={21} /></span>
      </button>

      <label className="notes-search">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по записям" aria-label="Поиск по записям" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск" title="Очистить"><X size={16} /></button>}
      </label>

      <div className="space-rail" aria-label="Папки записей">
        {filters.map(({ id, label, space, color, icon: Icon }) => {
          const count = notes.filter((note) => !space || note.space === space).length;
          return (
            <button key={id} className={selectedFilter.id === id ? "active" : ""} type="button" onClick={() => setActiveFilter(id)} aria-pressed={selectedFilter.id === id}>
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
              onEdit={(value) => {
                setEditingNote(value);
                setComposerSeed("");
                setVoiceStartToken(0);
                setComposerOpen(true);
              }}
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

      <NoteComposer
        note={editingNote}
        folders={folders}
        open={composerOpen}
        initialSeed={composerSeed}
        voiceStartToken={voiceStartToken}
        classifyDraft={classifyDraft}
        onClose={closeComposer}
        onDelete={onDelete}
        onSave={saveNote}
      />
      <FolderSheet folders={folders} open={folderSheetOpen} onClose={() => setFolderSheetOpen(false)} onCreate={onCreateFolder} onDelete={onDeleteFolder} />
      <SmartCalendarSheet
        lessons={lessons}
        notes={notes}
        open={calendarOpen}
        weekMode={weekMode}
        onClose={() => setCalendarOpen(false)}
        onCreateForDate={(date) => {
          const dateText = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
          createBlankNote(`Планы на ${dateText}\n`);
        }}
      />
    </div>
  );
}
