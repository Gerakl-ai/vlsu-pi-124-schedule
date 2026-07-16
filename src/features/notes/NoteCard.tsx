import { BookCheck, CalendarClock, Check, ChevronRight, Circle, LoaderCircle, Pin, Trash2 } from "lucide-react";
import DOMPurify from "dompurify";
import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { noteKindLabel } from "./noteClassifier";
import type { SmartNote } from "./noteTypes";

interface NoteCardProps {
  note: SmartNote;
  onEdit: (note: SmartNote) => void;
  onDelete: (noteId: string) => Promise<void>;
  onToggle: (noteId: string) => void;
  onTogglePinned: (noteId: string) => void;
  onReveal: () => void;
  onCloseReveal: () => void;
  revealed: boolean;
}

const DELETE_REVEAL = 82;

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

function formatFullNoteDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function NoteCard({ note, onEdit, onDelete, onToggle, onTogglePinned, onReveal, onCloseReveal, revealed }: NoteCardProps) {
  const body = noteBody(note);
  const previewHtml = notePreviewHtml(note);
  const overdue = Boolean(note.dueAt && note.status === "open" && new Date(note.dueAt).getTime() < Date.now());
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const savedAt = note.contentUpdatedAt ?? note.createdAt ?? note.updatedAt;
  const suppressClick = useRef(false);
  const gesture = useRef({ active: false, horizontal: false, startX: 0, startY: 0, base: 0, offset: 0, deltaX: 0 });
  const offset = dragOffset ?? (revealed ? -DELETE_REVEAL : 0);

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (deleting || (event.pointerType === "mouse" && event.button !== 0)) return;
    const base = revealed ? -DELETE_REVEAL : 0;
    gesture.current = {
      active: true,
      horizontal: false,
      startX: event.clientX,
      startY: event.clientY,
      base,
      offset: base,
      deltaX: 0
    };
    setDragOffset(base);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const value = gesture.current;
    if (!value.active) return;
    const deltaX = event.clientX - value.startX;
    const deltaY = event.clientY - value.startY;
    if (!value.horizontal) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 7) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        value.active = false;
        setDragOffset(null);
        return;
      }
      value.horizontal = true;
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    value.deltaX = deltaX;
    value.offset = Math.max(-DELETE_REVEAL, Math.min(0, value.base + deltaX));
    setDragOffset(value.offset);
  }

  function finishGesture(event: ReactPointerEvent<HTMLElement>) {
    const value = gesture.current;
    if (!value.active) return;
    value.active = false;
    if (!value.horizontal) {
      setDragOffset(null);
      return;
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const shouldReveal = value.base < 0 ? value.deltaX < 34 : value.deltaX <= -46;
    setDragging(false);
    setDragOffset(null);
    if (shouldReveal) onReveal();
    else onCloseReveal();
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  }

  async function deleteNote() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(note.id);
    } catch {
      setDeleting(false);
      onCloseReveal();
    }
  }

  return (
    <div className={`note-swipe-shell ${revealed ? "revealed" : ""} ${deleting ? "deleting" : ""}`}>
      <button
        className="note-delete-action"
        type="button"
        onClick={() => void deleteNote()}
        tabIndex={revealed ? 0 : -1}
        aria-hidden={!revealed}
        aria-label={`Удалить запись «${note.title}»`}
        title="Удалить"
        disabled={deleting}
      >
        {deleting ? <LoaderCircle className="spin" size={22} /> : <Trash2 size={22} />}
        <span>Удалить</span>
      </button>
      <article
        className={`note-card ${note.status === "done" ? "completed" : ""} ${overdue ? "overdue" : ""} ${dragging ? "dragging" : ""}`}
        style={{ "--note-swipe-x": `${offset}px` } as CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onClickCapture={(event) => {
          if (!suppressClick.current && !revealed) return;
          event.preventDefault();
          event.stopPropagation();
          if (revealed) onCloseReveal();
        }}
      >
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
          <time dateTime={savedAt} title={`Сохранено ${formatFullNoteDate(savedAt)}`}>{formatNoteDate(savedAt)}</time>
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
    </div>
  );
}
