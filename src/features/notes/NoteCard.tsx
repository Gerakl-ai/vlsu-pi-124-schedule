import { BookCheck, CalendarClock, Check, ChevronRight, Circle, LoaderCircle, Pin } from "lucide-react";
import DOMPurify from "dompurify";
import { noteKindLabel } from "./noteClassifier";
import type { SmartNote } from "./noteTypes";

interface NoteCardProps {
  note: SmartNote;
  onEdit: (note: SmartNote) => void;
  onToggle: (noteId: string) => void;
  onTogglePinned: (noteId: string) => void;
}

function noteBody(note: SmartNote) {
  const lines = note.text.split(/\r?\n/);
  if (lines.length <= 1) return "";
  return lines.slice(1).join("\n").trim();
}

function notePreviewHtml(note: SmartNote) {
  if (!note.contentHtml) return "";
  const documentValue = new DOMParser().parseFromString(note.contentHtml, "text/html");
  const firstBlock = documentValue.body.querySelector("p, h1, h2, h3");
  if (firstBlock && !firstBlock.querySelector("img") && firstBlock.textContent?.trim() === note.title) firstBlock.remove();
  return DOMPurify.sanitize(documentValue.body.innerHTML, {
    ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "s", "mark", "span", "ul", "ol", "li", "blockquote", "h2", "h3", "img"],
    ALLOWED_ATTR: ["class", "style", "src", "alt", "title", "width", "height", "data-type", "data-checked"],
    ADD_DATA_URI_TAGS: ["img"]
  });
}

function formatNoteDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function NoteCard({ note, onEdit, onToggle, onTogglePinned }: NoteCardProps) {
  const body = noteBody(note);
  const previewHtml = notePreviewHtml(note);
  const overdue = Boolean(note.dueAt && note.status === "open" && new Date(note.dueAt).getTime() < Date.now());

  return (
    <article className={`note-card ${note.status === "done" ? "completed" : ""} ${overdue ? "overdue" : ""}`}>
      <button
        className="note-check"
        type="button"
        onClick={() => onToggle(note.id)}
        aria-label={note.status === "done" ? `Вернуть запись «${note.title}»` : `Завершить запись «${note.title}»`}
        title={note.status === "done" ? "Вернуть" : "Завершить"}
      >
        {note.status === "done" ? <Check size={16} /> : <Circle size={16} />}
      </button>

      <button className="note-card-main" type="button" onClick={() => onEdit(note)}>
        <span className="note-card-head">
          <span className="note-kind">{note.kind === "homework" && <BookCheck size={13} />}{noteKindLabel(note.kind)}</span>
          <time>{formatNoteDate(note.updatedAt)}</time>
        </span>
        <strong>{note.title}</strong>
        {previewHtml
          ? <span className="note-rich-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          : body && <span className="note-excerpt">{body}</span>}
        <span className="note-metadata">
          <span>{note.space}</span>
          {note.subjectLabel && <span>{note.subjectLabel}</span>}
          {note.dueLabel && <span className={overdue ? "is-overdue" : ""}><CalendarClock size={12} /> {note.dueLabel}</span>}
          {note.classificationPending && <span><LoaderCircle className="spin" size={12} /> Уточняем</span>}
        </span>
      </button>

      <div className="note-card-actions">
        <button
          className={note.pinned ? "active" : ""}
          type="button"
          onClick={() => onTogglePinned(note.id)}
          aria-label={note.pinned ? "Открепить запись" : "Закрепить запись"}
          title={note.pinned ? "Открепить" : "Закрепить"}
        >
          <Pin size={15} fill={note.pinned ? "currentColor" : "none"} />
        </button>
        <ChevronRight size={18} aria-hidden="true" />
      </div>
    </article>
  );
}
