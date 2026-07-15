import { Check, Palette, X } from "lucide-react";
import { useEffect } from "react";
import { THEMES, type ThemeId } from "./theme";

interface ThemeSheetProps {
  currentTheme: ThemeId;
  open: boolean;
  onClose: () => void;
  onSelect: (theme: ThemeId) => void;
}

export function ThemeSheet({ currentTheme, open, onClose, onSelect }: ThemeSheetProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="sheet-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="theme-sheet" role="dialog" aria-modal="true" aria-labelledby="theme-sheet-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <div>
            <span className="sheet-kicker"><Palette size={14} /> Атмосфера</span>
            <h2 id="theme-sheet-title">Выберите характер</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть выбор темы" title="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="theme-grid">
          {THEMES.map((theme) => {
            const active = currentTheme === theme.id;
            return (
              <button
                key={theme.id}
                className={`theme-option theme-option-${theme.id} ${active ? "active" : ""}`}
                type="button"
                onClick={() => onSelect(theme.id)}
                aria-pressed={active}
              >
                <span className="theme-preview" aria-hidden="true">
                  <span className="theme-preview-rail" />
                  <span className="theme-preview-card" />
                  <span className="theme-preview-line" />
                </span>
                <span className="theme-option-copy">
                  <strong>{theme.name}</strong>
                  <small>{theme.caption}</small>
                  <span className="theme-swatches" aria-hidden="true">
                    {theme.colors.map((color) => <i key={color} style={{ background: color }} />)}
                  </span>
                </span>
                <span className="theme-check" aria-hidden="true">{active && <Check size={16} />}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
