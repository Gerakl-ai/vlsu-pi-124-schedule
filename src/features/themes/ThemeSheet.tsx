import { Check, Palette, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_CUSTOM_THEME, THEMES, type CustomTheme, type ThemeId } from "./theme";

interface ThemeSheetProps {
  currentTheme: ThemeId;
  customTheme: CustomTheme;
  open: boolean;
  onClose: () => void;
  onCustomChange: (theme: CustomTheme) => void;
  onSelect: (theme: ThemeId) => void;
}

const COLOR_CONTROLS: Array<{ key: keyof Pick<CustomTheme, "background" | "surface" | "text" | "muted" | "accent" | "signal" | "success">; label: string }> = [
  { key: "background", label: "Фон" },
  { key: "surface", label: "Панели" },
  { key: "text", label: "Текст" },
  { key: "muted", label: "Вторичный" },
  { key: "accent", label: "Акцент" },
  { key: "signal", label: "Сигнал" },
  { key: "success", label: "Готово" }
];

const LIGHT_CUSTOM_THEME: CustomTheme = {
  name: "Мой свет",
  mode: "light",
  background: "#edf2f7",
  surface: "#ffffff",
  text: "#131a26",
  muted: "#627084",
  accent: "#2864d7",
  signal: "#db4b50",
  success: "#16866d"
};

export function ThemeSheet({ currentTheme, customTheme, open, onClose, onCustomChange, onSelect }: ThemeSheetProps) {
  const [customOpen, setCustomOpen] = useState(currentTheme === "custom");

  useEffect(() => {
    if (!open) return;
    setCustomOpen(currentTheme === "custom");
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentTheme, onClose, open]);

  if (!open) return null;

  function updateCustom(patch: Partial<CustomTheme>) {
    onCustomChange({ ...customTheme, ...patch });
  }

  function setCustomMode(mode: CustomTheme["mode"]) {
    onCustomChange(mode === "light" ? LIGHT_CUSTOM_THEME : { ...DEFAULT_CUSTOM_THEME, name: customTheme.name || DEFAULT_CUSTOM_THEME.name });
  }

  return (
    <div className="sheet-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="theme-sheet" role="dialog" aria-modal="true" aria-labelledby="theme-sheet-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <div>
            <span className="sheet-kicker"><Palette size={14} /> Атмосфера</span>
            <h2 id="theme-sheet-title">Характер интерфейса</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть выбор темы" title="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="theme-grid">
          {THEMES.filter((theme) => !theme.isCustom).map((theme) => {
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

          <button
            className={`theme-option theme-option-custom ${currentTheme === "custom" ? "active" : ""}`}
            type="button"
            onClick={() => { setCustomOpen(true); onSelect("custom"); }}
            aria-pressed={currentTheme === "custom"}
          >
            <span className="theme-preview custom" style={{ background: customTheme.background }} aria-hidden="true">
              <span className="theme-preview-rail" style={{ background: customTheme.accent }} />
              <span className="theme-preview-card" style={{ background: customTheme.surface, borderColor: customTheme.muted }} />
              <span className="theme-preview-line" style={{ background: `linear-gradient(90deg, ${customTheme.signal}, ${customTheme.accent})` }} />
            </span>
            <span className="theme-option-copy">
              <strong>{customTheme.name || "Своя тема"}</strong>
              <small>Соберите палитру под себя</small>
              <span className="theme-swatches" aria-hidden="true">
                {[customTheme.background, customTheme.text, customTheme.accent, customTheme.signal].map((color, index) => <i key={`${color}-${index}`} style={{ background: color }} />)}
              </span>
            </span>
            <span className="theme-check" aria-hidden="true">{currentTheme === "custom" && <SlidersHorizontal size={16} />}</span>
          </button>
        </div>

        {customOpen && (
          <section className="custom-theme-editor" aria-label="Конструктор своей темы">
            <header>
              <label>
                <span>Название</span>
                <input value={customTheme.name} onChange={(event) => updateCustom({ name: event.target.value.slice(0, 22) })} aria-label="Название темы" />
              </label>
              <div className="custom-mode" role="group" aria-label="Светлая или тёмная тема">
                <button className={customTheme.mode === "dark" ? "active" : ""} type="button" onClick={() => setCustomMode("dark")}>Тёмная</button>
                <button className={customTheme.mode === "light" ? "active" : ""} type="button" onClick={() => setCustomMode("light")}>Светлая</button>
              </div>
            </header>
            <div className="custom-color-grid">
              {COLOR_CONTROLS.map(({ key, label }) => (
                <label key={key}>
                  <span>{label}</span>
                  <i style={{ background: customTheme[key] }} aria-hidden="true" />
                  <input type="color" value={customTheme[key]} onChange={(event) => updateCustom({ [key]: event.target.value })} aria-label={`${label}: ${customTheme[key]}`} />
                  <code>{customTheme[key]}</code>
                </label>
              ))}
            </div>
            <footer>
              <button type="button" onClick={() => onCustomChange(DEFAULT_CUSTOM_THEME)}><RotateCcw size={16} /> Сбросить</button>
              <button className="custom-theme-done" type="button" onClick={onClose}><Check size={17} /> Готово</button>
            </footer>
          </section>
        )}
      </section>
    </div>
  );
}
