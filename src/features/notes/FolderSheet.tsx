import { FolderPlus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NoteFolder } from "./noteTypes";

interface FolderSheetProps {
  folders: NoteFolder[];
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<NoteFolder | null>;
  onDelete: (folderId: string) => Promise<void>;
}

export function FolderSheet({ folders, open, onClose, onCreate, onDelete }: FolderSheetProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 180);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  async function createFolder() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate(name);
      setName("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const layer = (
    <div className="sheet-layer folder-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="folder-sheet" role="dialog" aria-modal="true" aria-labelledby="folder-sheet-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <div>
            <span className="sheet-kicker"><FolderPlus size={14} /> Пространства</span>
            <h2 id="folder-sheet-title">Папки записей</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть папки" title="Закрыть"><X size={20} /></button>
        </header>

        <form className="folder-create" onSubmit={(event) => { event.preventDefault(); void createFolder(); }}>
          <input ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} maxLength={28} placeholder="Название новой папки" aria-label="Название новой папки" />
          <button type="submit" disabled={!name.trim() || busy} aria-label="Создать папку" title="Создать папку"><FolderPlus size={19} /></button>
        </form>

        <div className="folder-list">
          {folders.map((folder) => (
            <div key={folder.id} className="folder-row">
              <i style={{ background: folder.color }} aria-hidden="true" />
              <span>{folder.name}</span>
              <small>{folder.system ? "умная" : "своя"}</small>
              {!folder.system && (
                <button type="button" onClick={() => void onDelete(folder.id)} aria-label={`Удалить папку ${folder.name}`} title="Удалить папку"><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
  const portalHost = document.querySelector(".phone-frame");
  return portalHost ? createPortal(layer, portalHost) : layer;
}
