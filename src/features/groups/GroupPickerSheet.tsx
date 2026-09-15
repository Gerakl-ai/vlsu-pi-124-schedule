import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  RefreshCw,
  Search,
  UsersRound,
  WifiOff,
  X
} from "lucide-react";
import { loadGroups, loadInstitutes } from "../../lib/scheduleApi";
import {
  readGroupCatalog,
  readInstituteCatalog,
  writeGroupCatalog,
  writeInstituteCatalog
} from "./groupStorage";
import {
  LEGACY_PI124_GROUP,
  toGroupProfile,
  type GroupOption,
  type GroupProfile,
  type InstituteOption
} from "./groupTypes";

interface GroupPickerSheetProps {
  open: boolean;
  selectedGroup: GroupProfile | null;
  onClose: () => void;
  onSelect: (group: GroupProfile) => void;
}

type CatalogStatus = "idle" | "loading" | "ready" | "stale";

function normalizedSearch(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function matchesSearch(values: Array<string | undefined>, query: string) {
  const normalized = normalizedSearch(query);
  if (!normalized) return true;
  return values.some((value) => normalizedSearch(value ?? "").includes(normalized));
}

export function GroupPickerSheet({ open, selectedGroup, onClose, onSelect }: GroupPickerSheetProps) {
  const [institutes, setInstitutes] = useState<InstituteOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [activeInstitute, setActiveInstitute] = useState<InstituteOption | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CatalogStatus>("idle");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQuery("");
    setActiveInstitute(null);
    setGroups([]);

    const cached = readInstituteCatalog();
    if (cached?.items.length) {
      setInstitutes(cached.items);
      setStatus("ready");
    } else {
      setStatus("loading");
    }

    void loadInstitutes()
      .then((items) => {
        if (cancelled || !items.length) return;
        setInstitutes(items);
        writeInstituteCatalog(items);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("stale");
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !activeInstitute) return;
    let cancelled = false;
    const cached = readGroupCatalog(activeInstitute.id);
    setGroups(cached?.items ?? []);
    setStatus(cached?.items.length ? "ready" : "loading");

    void loadGroups(activeInstitute.id)
      .then((items) => {
        if (cancelled || !items.length) return;
        setGroups(items);
        writeGroupCatalog(activeInstitute.id, items);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("stale");
      });

    return () => {
      cancelled = true;
    };
  }, [activeInstitute, open]);

  const filteredInstitutes = useMemo(
    () => institutes.filter((institute) => matchesSearch([institute.name, institute.shortName], query)),
    [institutes, query]
  );
  const filteredGroups = useMemo(
    () => groups.filter((group) => matchesSearch([group.name, group.course], query)),
    [groups, query]
  );

  if (!open) return null;

  const chooseInstitute = (institute: InstituteOption) => {
    setQuery("");
    setActiveInstitute(institute);
  };

  const chooseGroup = (group: GroupOption) => {
    if (!activeInstitute) return;
    onSelect(toGroupProfile(activeInstitute, group));
  };

  const canClose = Boolean(selectedGroup);
  const rows = activeInstitute ? filteredGroups : filteredInstitutes;

  return (
    <div className="group-picker-backdrop" role="presentation" data-first-run={!selectedGroup}>
      <section className="group-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="group-picker-title">
        <header className="group-picker-header">
          {activeInstitute ? (
            <button type="button" className="group-picker-icon" onClick={() => { setActiveInstitute(null); setQuery(""); }} aria-label="Назад к институтам">
              <ArrowLeft size={20} />
            </button>
          ) : <span className="group-picker-logo"><Building2 size={20} /></span>}
          <div>
            <small>{activeInstitute ? activeInstitute.shortName : "Лад ВлГУ"}</small>
            <h2 id="group-picker-title">{activeInstitute ? "Выберите группу" : selectedGroup ? "Сменить институт" : "Найдите свою группу"}</h2>
          </div>
          {canClose ? (
            <button type="button" className="group-picker-icon" onClick={onClose} aria-label="Закрыть выбор группы">
              <X size={20} />
            </button>
          ) : <span className="group-picker-icon-placeholder" />}
        </header>

        <label className="group-picker-search">
          <Search size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={activeInstitute ? "Название группы или курс" : "Название или сокращение института"}
            autoComplete="off"
            autoCapitalize="characters"
          />
          {status === "loading" && <RefreshCw className="spin" size={17} aria-label="Загрузка каталога" />}
        </label>

        <div className="group-picker-context">
          <span>{activeInstitute ? activeInstitute.name : "Институты ВлГУ"}</span>
          <strong>{rows.length}</strong>
        </div>

        <div className="group-picker-list" data-screen-swipe="ignore">
          {!activeInstitute && filteredInstitutes.map((institute) => (
            <button key={institute.id} type="button" className="group-picker-row" onClick={() => chooseInstitute(institute)}>
              <span className="institute-badge" data-visual={institute.visualKey}>{institute.shortName}</span>
              <span className="group-picker-copy"><strong>{institute.shortName}</strong><small>{institute.name}</small></span>
              <ChevronRight size={20} />
            </button>
          ))}

          {activeInstitute && filteredGroups.map((group) => {
            const isCurrent = selectedGroup?.nrec === group.nrec;
            return (
              <button key={group.nrec} type="button" className="group-picker-row group-row" onClick={() => chooseGroup(group)}>
                <span className="group-badge"><UsersRound size={19} /></span>
                <span className="group-picker-copy"><strong>{group.name}</strong><small>{group.course ?? activeInstitute.shortName}</small></span>
                {isCurrent ? <Check size={20} className="group-picker-check" /> : <ChevronRight size={20} />}
              </button>
            );
          })}

          {!rows.length && status !== "loading" && (
            <div className="group-picker-empty">
              <WifiOff size={24} />
              <strong>{query ? "Ничего не найдено" : "Каталог пока недоступен"}</strong>
              <p>{query ? "Проверьте название или вернитесь к выбору института." : "ВлГУ не ответил. Сохранённые варианты останутся доступны офлайн."}</p>
              {!selectedGroup && !activeInstitute && (
                <button type="button" onClick={() => onSelect(LEGACY_PI124_GROUP)}>Открыть ПИ-124</button>
              )}
            </div>
          )}
        </div>

        <footer className="group-picker-footer">
          <span className={`catalog-dot catalog-${status}`} />
          {status === "stale" ? "Показан сохранённый каталог" : status === "loading" ? "Загружаем каталог" : "Выбор сохранится на устройстве"}
        </footer>
      </section>
    </div>
  );
}
