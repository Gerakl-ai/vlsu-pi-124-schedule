import { CalendarClock, Check, Hash, ListChecks, Pin, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { noteKindLabel } from "./noteClassifier";
import type { NoteClassification, SmartNote } from "./noteTypes";

interface NoteComposerProps {
  note: SmartNote | null;
  open: boolean;
  classifyDraft: (text: string) => NoteClassification;
  onClose: () => void;
  onDelete: (noteId: string) => void;
  onSave: (text: string, pinned: boolean, noteId?: string) => void;
}

export function NoteComposer({ note, open, classifyDraft, onClose, onDelete, onSave }: NoteComposerProps) {
  const [text, setText] = useState("");
  const [pinned, setPinned] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preview = useMemo(() => text.trim() ? classifyDraft(text) : null, [classifyDraft, text]);

  useEffect(() => {
    if (!open) return;
    setText(note?.text ?? "");
    setPinned(note?.pinned ?? false);
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 120);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [note, onClose, open]);

  if (!open) return null;

  function insertText(value: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setText((current) => `${current}${value}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${text.slice(0, start)}${value}${text.slice(end)}`;
    setText(next);
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + value.length, start + value.length);
    }, 0);
  }

  function submit() {
    if (!text.trim()) return;
    onSave(text.trim(), pinned, note?.id);
  }

  return (
    <div className="sheet-layer composer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="note-composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="composer-header">
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть запись" title="Закрыть">
            <X size={20} />
          </button>
          <div>
            <span>{note ? "Редактирование" : "Быстрая запись"}</span>
            <h2 id="composer-title">{note ? note.title : "Новая мысль"}</h2>
          </div>
          <button className="composer-done" type="button" onClick={submit} disabled={!text.trim()} aria-label="Сохранить запись">
            <Check size={19} />
            <span>Готово</span>
          </button>
        </header>

        <div className="composer-paper">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Напишите как думаете..."
            aria-label="Текст записи"
            data-testid="note-composer-input"
          />
        </div>

        {preview && (
          <div className="classification-preview" aria-live="polite">
            <span>Лад</span>
            <strong>{preview.space}</strong>
            <i>{noteKindLabel(preview.kind)}</i>
            {preview.subjectLabel && <i>{preview.subjectLabel}</i>}
            {preview.dueLabel && <i>{preview.dueLabel}</i>}
          </div>
        )}

        <footer className="composer-toolbar">
          <div className="composer-tools" aria-label="Инструменты записи">
            <button type="button" onClick={() => insertText(text && !text.endsWith("\n") ? "\n- [ ] " : "- [ ] ")} aria-label="Добавить пункт списка" title="Чек-лист">
              <ListChecks size={19} />
            </button>
            <button type="button" onClick={() => insertText(" #")} aria-label="Добавить тег" title="Тег">
              <Hash size={19} />
            </button>
            <button type="button" onClick={() => insertText(" к следующей паре")} aria-label="Привязать к следующей паре" title="К следующей паре">
              <CalendarClock size={19} />
            </button>
            <button className={pinned ? "active" : ""} type="button" onClick={() => setPinned((value) => !value)} aria-label={pinned ? "Открепить" : "Закрепить"} title={pinned ? "Открепить" : "Закрепить"}>
              <Pin size={19} fill={pinned ? "currentColor" : "none"} />
            </button>
          </div>
          {note && (
            <button className="composer-delete" type="button" onClick={() => onDelete(note.id)} aria-label="Удалить запись" title="Удалить">
              <Trash2 size={19} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
