import {
  BookCheck,
  CheckCircle2,
  FolderHeart,
  Inbox,
  Lightbulb,
  ListTodo,
  Mic2,
  Music2,
  Search,
  Sparkles,
  SquarePen,
  X
} from "lucide-react";
import { useMemo, useState } from "react";
import { NoteCard } from "./NoteCard";
import { NoteComposer } from "./NoteComposer";
import type { NoteClassification, NoteKind, SmartNote } from "./noteTypes";

interface NotesViewProps {
  notes: SmartNote[];
  ready: boolean;
  classifyDraft: (text: string) => NoteClassification;
  onCreate: (text: string, pinned: boolean) => void;
  onDelete: (noteId: string) => void;
  onToggle: (noteId: string) => void;
  onTogglePinned: (noteId: string) => void;
  onUpdate: (noteId: string, text: string, pinned: boolean) => void;
}

interface SmartFilter {
  id: string;
  label: string;
  kind?: NoteKind;
  space?: string;
  icon: typeof Inbox;
}

function iconForSpace(space: string) {
  const value = space.toLocaleLowerCase("ru-RU");
  if (value.includes("учёб") || value.includes("учеб")) return BookCheck;
  if (value.includes("танц")) return Music2;
  if (value.includes("радио")) return Mic2;
  if (value.includes("иде")) return Lightbulb;
  if (value.includes("хот")) return FolderHeart;
  return Sparkles;
}

export function NotesView({
  notes,
  ready,
  classifyDraft,
  onCreate,
  onDelete,
  onToggle,
  onTogglePinned,
  onUpdate
}: NotesViewProps) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<SmartNote | null>(null);

  const filters = useMemo<SmartFilter[]>(() => {
    const core: SmartFilter[] = [
      { id: "all", label: "Все", icon: Inbox },
      { id: "homework", label: "ДЗ", kind: "homework", icon: BookCheck },
      { id: "task", label: "Дела", kind: "task", icon: ListTodo },
      { id: "wish", label: "Хотелки", kind: "wish", icon: FolderHeart }
    ];
    const reserved = new Set(core.map((item) => item.label.toLocaleLowerCase("ru-RU")));
    const spaces = [...new Set(notes.map((note) => note.space))]
      .filter((space) => !reserved.has(space.toLocaleLowerCase("ru-RU")))
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map((space) => ({ id: `space:${space}`, label: space, space, icon: iconForSpace(space) }));
    return [...core, ...spaces];
  }, [notes]);

  const selectedFilter = filters.find((filter) => filter.id === activeFilter) ?? filters[0];
  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
    return notes.filter((note) => {
      if (selectedFilter.kind && note.kind !== selectedFilter.kind) return false;
      if (selectedFilter.space && note.space !== selectedFilter.space) return false;
      if (!normalizedQuery) return true;
      return `${note.title} ${note.text} ${note.space} ${note.subjectLabel ?? ""}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery);
    });
  }, [notes, query, selectedFilter]);

  const openCount = notes.filter((note) => note.status === "open").length;
  const homeworkCount = notes.filter((note) => note.status === "open" && note.kind === "homework").length;
  const todayCount = notes.filter((note) => note.status === "open" && note.dueAt && new Date(note.dueAt).toDateString() === new Date().toDateString()).length;

  function closeComposer() {
    setComposerOpen(false);
    setEditingNote(null);
  }

  function saveNote(text: string, pinned: boolean, noteId?: string) {
    if (noteId) onUpdate(noteId, text, pinned);
    else onCreate(text, pinned);
    closeComposer();
  }

  function deleteCurrent(noteId: string) {
    onDelete(noteId);
    closeComposer();
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
          onClick={() => setComposerOpen(true)}
          aria-label="Создать запись"
          data-testid="open-note-composer"
        >
          <SquarePen size={21} />
          <span>Новая</span>
        </button>
      </section>

      <section className="notes-pulse" aria-label="Сводка записей">
        <div><span>Открыто</span><strong>{openCount}</strong><ListTodo size={18} /></div>
        <div><span>ДЗ</span><strong>{homeworkCount}</strong><BookCheck size={18} /></div>
        <div><span>Сегодня</span><strong>{todayCount}</strong><CheckCircle2 size={18} /></div>
      </section>

      <button className="quick-capture" type="button" onClick={() => setComposerOpen(true)}>
        <span className="quick-capture-icon"><Sparkles size={21} /></span>
        <span>
          <strong>Написать как думаете</strong>
          <small>Мысль, дело, ДЗ или идея</small>
        </span>
        <SquarePen size={19} />
      </button>

      <label className="notes-search">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по записям" aria-label="Поиск по записям" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск" title="Очистить"><X size={16} /></button>}
      </label>

      <div className="space-rail" aria-label="Умные разделы">
        {filters.map(({ id, label, kind, space, icon: Icon }) => {
          const count = notes.filter((note) => (!kind || note.kind === kind) && (!space || note.space === space)).length;
          return (
            <button key={id} className={selectedFilter.id === id ? "active" : ""} type="button" onClick={() => setActiveFilter(id)} aria-pressed={selectedFilter.id === id}>
              <Icon size={16} />
              <span>{label}</span>
              <small>{count}</small>
            </button>
          );
        })}
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
        open={composerOpen}
        classifyDraft={classifyDraft}
        onClose={closeComposer}
        onDelete={deleteCurrent}
        onSave={saveNote}
      />
    </div>
  );
}
