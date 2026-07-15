import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  MapPin,
  NotebookPen,
  Share2,
  Sparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { currentDayIndex, dateKeyFromDate, selectDayLessons } from "../../lib/time";
import type { LessonSlot, WeekMode } from "../../types";
import type { SmartNote } from "./noteTypes";

interface SmartCalendarSheetProps {
  lessons: LessonSlot[];
  notes: SmartNote[];
  open: boolean;
  weekMode: WeekMode;
  onClose: () => void;
  onCreateForDate: (date: Date) => void;
}

interface CalendarEvent {
  id: string;
  title: string;
  detail: string;
  start: Date;
  end: Date;
  location?: string;
  type: "lesson" | "note";
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, amount: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

function modeForDate(date: Date, currentMode: WeekMode, now = new Date()): WeekMode {
  if (currentMode === "all") return "all";
  const monday = (value: Date) => addDays(startOfDay(value), 1 - currentDayIndex(value));
  const weekDelta = Math.round((monday(date).getTime() - monday(now).getTime()) / 604_800_000);
  if (Math.abs(weekDelta) % 2 === 0) return currentMode;
  return currentMode === "numerator" ? "denominator" : "numerator";
}

function timeOnDate(date: Date, value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function lessonsForDate(lessons: LessonSlot[], date: Date, currentMode: WeekMode) {
  return selectDayLessons(lessons, currentDayIndex(date), modeForDate(date, currentMode), date);
}

function notesForDate(notes: SmartNote[], date: Date) {
  const key = dateKeyFromDate(date);
  return notes.filter((note) => note.dueAt && dateKeyFromDate(new Date(note.dueAt)) === key);
}

function eventsForDate(lessons: LessonSlot[], notes: SmartNote[], date: Date, weekMode: WeekMode): CalendarEvent[] {
  const classEvents = lessonsForDate(lessons, date, weekMode).map((lesson) => ({
    id: `lesson-${lesson.id}-${dateKeyFromDate(date)}`,
    title: lesson.subject,
    detail: [lesson.kind, lesson.teacher].filter(Boolean).join(" · ") || "Пара ПИ-124",
    start: timeOnDate(date, lesson.start),
    end: timeOnDate(date, lesson.end),
    location: lesson.room,
    type: "lesson" as const
  }));
  const noteEvents = notesForDate(notes, date).map((note) => {
    const start = new Date(note.dueAt!);
    const end = new Date(start.getTime() + 30 * 60_000);
    return {
      id: `note-${note.id}`,
      title: note.title,
      detail: note.space,
      start,
      end,
      type: "note" as const
    };
  });
  return [...classEvents, ...noteEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
}

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (first.getDay() || 7) - 1;
  const start = addDays(first, -startOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function formatUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function formatEventCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} событие`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} события`;
  return `${count} событий`;
}

function formatCount(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} ${few}`;
  return `${count} ${many}`;
}

function dayDistance(date: Date, origin: Date) {
  const stamp = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.round((stamp(date) - stamp(origin)) / 86_400_000);
}

function relativeDayLabel(date: Date, today: Date) {
  const distance = dayDistance(date, today);
  if (distance === 0) return "Сегодня";
  if (distance === 1) return "Завтра";
  if (distance === -1) return "Вчера";
  if (distance > 1) return `Через ${formatCount(distance, "день", "дня", "дней")}`;
  return `${formatCount(Math.abs(distance), "день", "дня", "дней")} назад`;
}

function relativeMonthLabel(month: Date, today: Date) {
  const distance = (month.getFullYear() - today.getFullYear()) * 12 + month.getMonth() - today.getMonth();
  if (distance === 0) return "Текущий месяц";
  if (distance === 1) return "Следующий месяц";
  if (distance === -1) return "Прошлый месяц";
  if (distance > 1) return `Через ${formatCount(distance, "месяц", "месяца", "месяцев")}`;
  return `${formatCount(Math.abs(distance), "месяц", "месяца", "месяцев")} назад`;
}

function buildIcs(events: CalendarEvent[], name: string) {
  const stamp = formatUtc(new Date());
  const rows = events.flatMap((event) => [
    "BEGIN:VEVENT",
    `UID:${escapeIcs(event.id)}@lad-pi124`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatUtc(event.start)}`,
    `DTEND:${formatUtc(event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.detail)}`,
    ...(event.location ? [`LOCATION:${escapeIcs(event.location)}`] : []),
    "END:VEVENT"
  ]);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lad PI-124//Calendar//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(name)}`,
    ...rows,
    "END:VCALENDAR"
  ].join("\r\n");
}

async function shareCalendar(events: CalendarEvent[], fileName: string, title: string) {
  if (!events.length) return false;
  const file = new File([buildIcs(events, title)], fileName, { type: "text/calendar;charset=utf-8" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return true;
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  return true;
}

export function SmartCalendarSheet({ lessons, notes, open, weekMode, onClose, onCreateForDate }: SmartCalendarSheetProps) {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [monthMotion, setMonthMotion] = useState<"next" | "previous" | "today">("today");
  const [exportState, setExportState] = useState<"idle" | "working" | "done">("idle");
  const exportResetTimer = useRef<number | undefined>(undefined);
  const cells = useMemo(() => monthCells(month), [month]);
  const selectedEvents = useMemo(
    () => eventsForDate(lessons, notes, selectedDate, weekMode),
    [lessons, notes, selectedDate, weekMode]
  );
  const monthEvents = useMemo(
    () => cells
      .filter((date) => date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear())
      .flatMap((date) => eventsForDate(lessons, notes, date, weekMode)),
    [cells, lessons, month, notes, weekMode]
  );

  useEffect(() => {
    if (!open) return;
    setToday(startOfDay(new Date()));
    setExportState("idle");
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    let midnightTimer: number | undefined;
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnightTimer = window.setTimeout(() => {
        setToday(startOfDay(new Date()));
        scheduleMidnightRefresh();
      }, Math.max(1_000, tomorrow.getTime() - now.getTime() + 750));
    };
    scheduleMidnightRefresh();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (midnightTimer !== undefined) window.clearTimeout(midnightTimer);
      if (exportResetTimer.current !== undefined) window.clearTimeout(exportResetTimer.current);
    };
  }, [onClose, open]);

  if (!open) return null;

  async function exportEvents(events: CalendarEvent[], fileName: string, title: string) {
    if (!events.length || exportState === "working") return;
    setExportState("working");
    try {
      await shareCalendar(events, fileName, title);
      setExportState("done");
      if (exportResetTimer.current !== undefined) window.clearTimeout(exportResetTimer.current);
      exportResetTimer.current = window.setTimeout(() => setExportState("idle"), 1800);
    } catch {
      setExportState("idle");
    }
  }

  function moveMonth(offset: number) {
    const target = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonthMotion(offset > 0 ? "next" : "previous");
    setMonth(target);
    setSelectedDate(target);
  }

  function selectCalendarDate(date: Date) {
    const target = startOfDay(date);
    const distance = (target.getFullYear() - month.getFullYear()) * 12 + target.getMonth() - month.getMonth();
    if (distance !== 0) {
      setMonthMotion(distance > 0 ? "next" : "previous");
      setMonth(new Date(target.getFullYear(), target.getMonth(), 1));
    }
    setSelectedDate(target);
  }

  function goToToday() {
    const current = startOfDay(new Date());
    setToday(current);
    setMonthMotion("today");
    setMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setSelectedDate(current);
  }

  const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(month);
  const selectedLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(selectedDate);
  const selectedRelation = relativeDayLabel(selectedDate, today);
  const monthRelation = relativeMonthLabel(month, today);
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`;

  const layer = (
    <div className="sheet-layer calendar-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="smart-calendar" role="dialog" aria-modal="true" aria-labelledby="smart-calendar-title" data-lesson-count={lessons.length} data-week-mode={weekMode}>
        <div className="sheet-handle" aria-hidden="true" />
        <header className="calendar-header">
          <div>
            <span><Sparkles size={13} /> Личный ритм</span>
            <h2 id="smart-calendar-title">Календарь</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть календарь" title="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="calendar-month-nav">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц">
            <ChevronLeft size={19} />
          </button>
          <button className="calendar-month-label" type="button" onClick={goToToday} title="Вернуться к сегодняшней дате">
            <strong>{monthLabel}</strong>
            <small>{monthRelation}</small>
          </button>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Следующий месяц">
            <ChevronRight size={19} />
          </button>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div key={monthKey} className={`calendar-grid motion-${monthMotion}`} aria-label={monthLabel}>
          {cells.map((date) => {
            const key = dateKeyFromDate(date);
            const dayLessons = lessonsForDate(lessons, date, weekMode);
            const dayNotes = notesForDate(notes, date);
            const selected = key === dateKeyFromDate(selectedDate);
            const isToday = key === dateKeyFromDate(today);
            return (
              <button
                key={key}
                className={`${date.getMonth() !== month.getMonth() ? "outside" : ""} ${selected ? "selected" : ""} ${isToday ? "today" : ""}`}
                type="button"
                onClick={() => selectCalendarDate(date)}
                aria-pressed={selected}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${date.toLocaleDateString("ru-RU")}: ${formatCount(dayLessons.length, "пара", "пары", "пар")}, ${formatCount(dayNotes.length, "запись", "записи", "записей")}`}
              >
                <span>{date.getDate()}</span>
                <i className="calendar-dots" aria-hidden="true">
                  {dayLessons.length > 0 && <b className="lesson-dot" />}
                  {dayNotes.length > 0 && <b className="note-dot" />}
                </i>
              </button>
            );
          })}
        </div>

        <section className="calendar-agenda" aria-label={`События: ${selectedLabel}`}>
          <header>
            <div>
              <span>{selectedLabel}</span>
              <strong>{selectedRelation}</strong>
              <small>{selectedEvents.length ? formatEventCount(selectedEvents.length) : "Свободный день"}</small>
            </div>
            <button type="button" onClick={() => { onClose(); onCreateForDate(selectedDate); }} aria-label="Создать запись на выбранную дату" title="Новая запись">
              <NotebookPen size={18} />
            </button>
          </header>
          <div key={dateKeyFromDate(selectedDate)} className="calendar-event-list calendar-event-list-enter">
            {selectedEvents.length ? selectedEvents.map((event) => (
              <article className={`calendar-event ${event.type}`} key={event.id}>
                <span className="calendar-event-time"><Clock3 size={14} /> {event.start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                <strong>{event.title}</strong>
                <small>{event.location ? <><MapPin size={13} /> {event.location}</> : event.detail}</small>
              </article>
            )) : (
              <div className="calendar-empty-day"><CalendarDays size={22} /><span>Можно оставить день свободным или добавить запись.</span></div>
            )}
          </div>
        </section>

        <footer className="calendar-actions">
          <button type="button" disabled={!selectedEvents.length || exportState === "working"} onClick={() => void exportEvents(selectedEvents, `lad-${dateKeyFromDate(selectedDate)}.ics`, `Лад · ${selectedLabel}`)}>
            <Share2 size={17} /> День
          </button>
          <button className="calendar-export-primary" type="button" disabled={!monthEvents.length || exportState === "working"} onClick={() => void exportEvents(monthEvents, `lad-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}.ics`, `Лад · ${monthLabel}`)}>
            <Download size={17} /> {exportState === "done" ? "Готово" : "В календарь"}
          </button>
        </footer>
      </section>
    </div>
  );
  const portalHost = document.querySelector(".phone-frame");
  return portalHost ? createPortal(layer, portalHost) : layer;
}
