import { Check, Folder, LoaderCircle, Pin, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { noteKindLabel } from "./noteClassifier";
import { loadDraft, removeDraft, storeDraft } from "./noteStorage";
import type { NoteClassification, NoteDocumentInput, NoteFolder, SmartNote } from "./noteTypes";
import { plainTextToHtml, RichNoteEditor } from "./RichNoteEditor";

interface NoteComposerProps {
  note: SmartNote | null;
  folders: NoteFolder[];
  open: boolean;
  classifyDraft: (text: string) => NoteClassification;
  onClose: () => void;
  onDelete: (noteId: string) => Promise<void>;
  onSave: (input: NoteDocumentInput, noteId?: string) => Promise<void>;
}

type DraftState = "idle" | "saving" | "saved";

export function NoteComposer({ note, folders, open, classifyDraft, onClose, onDelete, onSave }: NoteComposerProps) {
  const [contentHtml, setContentHtml] = useState("<p></p>");
  const [text, setText] = useState("");
  const [pinned, setPinned] = useState(false);
  const [spaceOverride, setSpaceOverride] = useState("");
  const [hydrating, setHydrating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftState, setDraftState] = useState<DraftState>("idle");
  const [editorKey, setEditorKey] = useState(0);
  const draftRevisionRef = useRef(0);
  const hydratedDraftRef = useRef<string | null>(null);
  const draftWriteRef = useRef<Promise<void>>(Promise.resolve());
  const draftId = note?.id ?? "new";
  const hasContent = Boolean(text.trim() || /<img\b/i.test(contentHtml));
  const preview = useMemo(() => {
    if (!hasContent) return null;
    const classification = classifyDraft(text);
    return spaceOverride ? { ...classification, space: spaceOverride } : classification;
  }, [classifyDraft, hasContent, spaceOverride, text]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    draftRevisionRef.current += 1;
    hydratedDraftRef.current = null;
    setHydrating(true);
    setSaving(false);
    setDraftState("idle");
    void loadDraft(draftId).then((draft) => {
      if (!active) return;
      const canRestore = Boolean(draft && (!note || draft.updatedAt > note.updatedAt));
      const nextHtml = canRestore
        ? draft!.contentHtml
        : note?.contentHtml ?? plainTextToHtml(note?.text ?? "");
      setContentHtml(nextHtml || "<p></p>");
      setText(canRestore ? draft!.text : note?.text ?? "");
      setPinned(canRestore ? draft!.pinned : note?.pinned ?? false);
      setSpaceOverride(canRestore ? draft!.spaceOverride ?? "" : note?.spaceManual ? note.space : "");
      setEditorKey((value) => value + 1);
      hydratedDraftRef.current = draftId;
      setHydrating(false);
      setDraftState(canRestore ? "saved" : "idle");
    });
    return () => {
      active = false;
    };
  }, [draftId, note, open]);

  const persistDraft = useCallback(async () => {
    if (!open || hydrating || hydratedDraftRef.current !== draftId) return;
    const revision = draftRevisionRef.current;
    setDraftState("saving");
    const snapshot = {
      id: draftId,
      text,
      contentHtml,
      pinned,
      spaceOverride: spaceOverride || undefined,
      updatedAt: new Date().toISOString()
    };
    const write = draftWriteRef.current
      .catch(() => undefined)
      .then(() => storeDraft(snapshot));
    draftWriteRef.current = write;
    await write;
    if (revision === draftRevisionRef.current) setDraftState("saved");
  }, [contentHtml, draftId, hydrating, open, pinned, spaceOverride, text]);

  useEffect(() => {
    if (!open || hydrating) return;
    const timer = window.setTimeout(() => void persistDraft(), 480);
    return () => window.clearTimeout(timer);
  }, [contentHtml, hydrating, open, persistDraft, pinned, spaceOverride, text]);

  const markDraftDirty = useCallback(() => {
    draftRevisionRef.current += 1;
    setDraftState("saving");
  }, []);

  const closeComposer = useCallback(() => {
    void persistDraft().finally(onClose);
  }, [onClose, persistDraft]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeComposer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeComposer, open]);

  const handleEditorChange = useCallback((html: string, plainText: string) => {
    setContentHtml(html);
    setText(plainText);
    markDraftDirty();
  }, [markDraftDirty]);

  async function submit() {
    if (!hasContent || saving) return;
    setSaving(true);
    try {
      await onSave({
        text: text.trim(),
        contentHtml,
        pinned,
        spaceOverride: spaceOverride || undefined
      }, note?.id);
      await draftWriteRef.current.catch(() => undefined);
      await removeDraft(draftId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrent() {
    if (!note || saving) return;
    setSaving(true);
    try {
      await draftWriteRef.current.catch(() => undefined);
      await Promise.all([onDelete(note.id), removeDraft(draftId)]);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const layer = (
    <div className="sheet-layer composer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeComposer()}>
      <section className="note-composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="composer-header">
          <button className="icon-button" type="button" onClick={closeComposer} aria-label="Закрыть запись" title="Закрыть">
            <X size={20} />
          </button>
          <div>
            <span>{note ? "Редактирование" : "Новая запись"}</span>
            <h2 id="composer-title">{note ? note.title : "Чистый лист"}</h2>
            <small className={`draft-status ${draftState}`}>
              {draftState === "saving" ? <><LoaderCircle className="spin" size={11} /> Сохраняем</> : draftState === "saved" ? <><Save size={11} /> Черновик сохранён</> : "Локально на устройстве"}
            </small>
          </div>
          <button className="composer-done" type="button" onClick={() => void submit()} disabled={!hasContent || saving} aria-label="Сохранить запись">
            {saving ? <LoaderCircle className="spin" size={19} /> : <Check size={19} />}
            <span>Готово</span>
          </button>
        </header>

        <div className="composer-paper">
          {hydrating ? (
            <div className="rich-editor-loading" aria-label="Восстановление черновика"><span /><span /><span /></div>
          ) : (
            <RichNoteEditor key={`${draftId}-${editorKey}`} initialContent={contentHtml} onChange={handleEditorChange} />
          )}
        </div>

        <div className="composer-context">
          <label className="folder-select">
            <Folder size={15} />
            <select value={spaceOverride} onChange={(event) => { setSpaceOverride(event.target.value); markDraftDirty(); }} aria-label="Папка записи">
              <option value="">Папка: автоматически</option>
              {folders.map((folder) => <option key={folder.id} value={folder.name}>{folder.name}</option>)}
            </select>
          </label>
          <button className={pinned ? "active" : ""} type="button" onClick={() => { setPinned((value) => !value); markDraftDirty(); }} aria-label={pinned ? "Открепить" : "Закрепить"} title={pinned ? "Открепить" : "Закрепить"}>
            <Pin size={17} fill={pinned ? "currentColor" : "none"} />
          </button>
        </div>

        <div className={`classification-preview ${preview ? "ready" : "empty"}`} aria-live="polite">
          {preview ? (
            <>
              <span>Лад</span>
              <strong>{preview.space}</strong>
              <i>{noteKindLabel(preview.kind)}</i>
              {preview.subjectLabel && <i>{preview.subjectLabel}</i>}
              {preview.dueLabel && <i>{preview.dueLabel}</i>}
            </>
          ) : (
            <small>Папка и тип определятся по смыслу записи</small>
          )}
        </div>

        <footer className="composer-toolbar">
          <span className="composer-storage-note">{draftState === "saved" ? "Изменения не потеряются" : "Автосохранение включено"}</span>
          {note && (
            <button className="composer-delete" type="button" onClick={() => void deleteCurrent()} disabled={saving} aria-label="Удалить запись" title="Удалить">
              <Trash2 size={19} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
  const portalHost = document.querySelector(".phone-frame");
  return portalHost ? createPortal(layer, portalHost) : layer;
}
