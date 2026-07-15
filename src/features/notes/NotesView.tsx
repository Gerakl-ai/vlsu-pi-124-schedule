import {
  BookOpenCheck,
  CheckCircle2,
  FolderHeart,
  FolderPlus,
  Inbox,
  Lightbulb,
  ListTodo,
  Music2,
  PanelsTopLeft,
  Radio,
  Search,
  Sparkles,
  SquarePen,
  X
} from "lucide-react";
import { useMemo, useState } from "react";
import { FolderSheet } from "./FolderSheet";
import { NoteCard } from "./NoteCard";
import { NoteComposer } from "./NoteComposer";
import type { NoteClassification, NoteDocumentInput, NoteFolder, SmartNote } from "./noteTypes";

interface NotesViewProps {
  notes: SmartNote[];
  folders: NoteFolder[];
  ready: boolean;
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
  notes,
  folders,
  ready,
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
  const [editingNote, setEditingNote] = useState<SmartNote | null>(null);

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
        <button
          className="notes-compose-button"
          type="button"
          onClick={() => { setEditingNote(null); setComposerOpen(true); }}
          aria-label="Создать запись"
          data-testid="open-note-composer"
        >
          <SquarePen size={21} />
          <span>Новая</span>
        </button>
      </section>

      <section className="notes-pulse" aria-label="Сводка записей">
        <div><span>Открыто</span><strong>{openCount}</strong><ListTodo size={18} /></div>
        <div><span>Учёба</span><strong>{studyCount}</strong><BookOpenCheck size={18} /></div>
        <div><span>Сегодня</span><strong>{todayCount}</strong><CheckCircle2 size={18} /></div>
      </section>

      <button className="quick-capture" type="button" onClick={() => { setEditingNote(null); setComposerOpen(true); }}>
        <span className="quick-capture-icon"><Sparkles size={21} /></span>
        <span>
          <strong>Записать как думаете</strong>
          <small>Мысль, дело, идея или план</small>
        </span>
        <SquarePen size={19} />
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
                setComposerOpen(true);
              }}
              onToggle={onToggle}
              onTogglePinned={onTogglePinned}
            />
          ))}
        </section>
      ) : (
        <section className="notes-empty">
          <img src="/images/hero-obsidian-campus.jpg" alt="Блокнот с расписанием и зарисовкой главного корпуса ВлГУ" />
          <div>
            <Sparkles size={23} />
            <h3>{query ? "Ничего не найдено" : "Здесь пока тихо"}</h3>
            <p>{query ? "Попробуйте другой запрос." : "Новая запись появится в этом пространстве."}</p>
          </div>
        </section>
      )}

      <NoteComposer
        note={editingNote}
        folders={folders}
        open={composerOpen}
        classifyDraft={classifyDraft}
        onClose={closeComposer}
        onDelete={onDelete}
        onSave={saveNote}
      />
      <FolderSheet folders={folders} open={folderSheetOpen} onClose={() => setFolderSheetOpen(false)} onCreate={onCreateFolder} onDelete={onDeleteFolder} />
    </div>
  );
}
