import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudOff,
  Grid2X2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Waves
} from "lucide-react";
import type { AppTab, ApiStatus, LessonSlot, ReminderSettings, ScheduleState, WeekMode } from "./types";
import { activeWeekMode, GROUP_NAME, INSTITUTE_NAME, lessonAppliesToWeek, loadSchedule } from "./lib/scheduleApi";
import { readReminderSettings, readScheduleCache, writeReminderSettings } from "./lib/storage";
import { canUseNotifications, requestNotificationPermission, scheduleNextReminder } from "./lib/reminders";
import {
  findCurrentAndNext,
  formatUpdatedAt,
  formatWeekMode,
  lessonProgress,
  minutesUntilEnd,
  selectDayLessons
} from "./lib/time";

const WEEK_DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const REMINDER_OPTIONS = [5, 10, 15, 30];

function parseCurrentInfoLesson(text: string) {
  const match = text.match(/"(.+?)"\s*\((.+?)\)/);
  if (!match) return { subject: "Расписание загружено", room: "ПИ-124" };
  return { subject: match[1], room: match[2] };
}

function lessonKeySubject(lesson?: LessonSlot) {
  return lesson?.subject || "";
}

export function App() {
  const [schedule, setSchedule] = useState<ScheduleState | null>(() => readScheduleCache());
  const [status, setStatus] = useState<ApiStatus>(() => (readScheduleCache() ? "stale" : "idle"));
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [weekOverride, setWeekOverride] = useState<WeekMode | "current">("current");
  const [settings, setSettings] = useState<ReminderSettings>(() => readReminderSettings());
  const [notice, setNotice] = useState("");

  const currentWeek = schedule ? activeWeekMode(schedule.currentInfo.currentWeekType) : "numerator";
  const weekMode = weekOverride === "current" ? currentWeek : weekOverride;

  const { todayLessons, current, next } = useMemo(
    () => findCurrentAndNext(schedule?.allLessons ?? [], weekMode),
    [schedule?.allLessons, weekMode]
  );

  const heroFallback = schedule ? parseCurrentInfoLesson(schedule.currentInfo.currentLesson) : null;
  const heroLesson = current ?? next;
  const heroSubject = heroLesson?.subject ?? heroFallback?.subject ?? "Загрузка расписания";
  const heroRoom = heroLesson ? heroLesson.room ?? "Аудитория уточняется" : heroFallback?.room ?? "ИИТЭ";
  const heroStart = heroLesson?.start ?? "08:30";
  const heroEnd = heroLesson?.end ?? "10:00";
  const progress = heroLesson && current ? lessonProgress(heroLesson) : current ? 50 : 0;
  const remaining = heroLesson && current ? minutesUntilEnd(heroLesson) : 0;

  async function refreshSchedule(silent = false) {
    if (!silent) setStatus("loading");
    try {
      const loaded = await loadSchedule();
      setSchedule(loaded);
      setStatus("ready");
    } catch {
      setStatus(schedule ? "stale" : "error");
    }
  }

  useEffect(() => {
    refreshSchedule(true);
  }, []);

  useEffect(() => {
    if (!schedule) return;
    scheduleNextReminder(schedule.allLessons, weekMode, settings, setNotice);
  }, [schedule, settings, weekMode]);

  async function enableReminders() {
    const permission = await requestNotificationPermission();
    const nextSettings = {
      ...settings,
      enabled: permission === "granted",
      permission
    };
    setSettings(nextSettings);
    writeReminderSettings(nextSettings);
    setNotice(permission === "granted" ? "Напоминания включены" : "Браузер не дал доступ к уведомлениям");
  }

  function updateReminderMinutes(minutesBefore: number) {
    const nextSettings = { ...settings, minutesBefore };
    setSettings(nextSettings);
    writeReminderSettings(nextSettings);
  }

  const nextLabel = next ? `${next.start}, ${next.subject}` : "Сегодня новых пар нет";
  const displayLessons = todayLessons.length ? todayLessons : (schedule?.allLessons ?? []).filter((lesson) => lessonAppliesToWeek(lesson, weekMode)).slice(0, 5);

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="ПИ-124 расписание">
        <div className="ambient-grid" />
        <Header
          currentWeek={currentWeek}
          status={status}
          refreshedAt={schedule?.fetchedAt}
          onRefresh={() => refreshSchedule()}
        />

        <div className="content-scroll">
          {status === "error" && <ErrorBanner />}
          {status === "stale" && <StaleBanner />}

          {activeTab === "today" && (
            <TodayView
              heroSubject={heroSubject}
              heroRoom={heroRoom}
              heroStart={heroStart}
              heroEnd={heroEnd}
              progress={progress}
              remaining={remaining}
              current={current}
              next={next}
              nextLabel={nextLabel}
              lessons={displayLessons}
              weekMode={weekMode}
            />
          )}

          {activeTab === "week" && (
            <WeekView
              lessons={schedule?.allLessons ?? []}
              weekMode={weekMode}
              weekOverride={weekOverride}
              setWeekOverride={setWeekOverride}
            />
          )}

          {activeTab === "settings" && (
            <SettingsView
              settings={settings}
              notice={notice}
              onEnable={enableReminders}
              onMinutes={updateReminderMinutes}
              schedule={schedule}
            />
          )}
        </div>

        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      </section>
    </main>
  );
}

interface HeaderProps {
  currentWeek: WeekMode;
  status: ApiStatus;
  refreshedAt?: string;
  onRefresh: () => void;
}

function Header({ currentWeek, status, refreshedAt, onRefresh }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <span />
        </div>
        <div>
          <h1>{GROUP_NAME}</h1>
          <p>ИИТЭ</p>
        </div>
      </div>

      <button className="week-chip" type="button" onClick={onRefresh} aria-label="Обновить расписание">
        <CalendarDays size={18} />
        <span>{formatWeekMode(currentWeek)}</span>
        <RefreshCw className={status === "loading" ? "spin" : ""} size={16} />
      </button>

      <div className="sync-line">
        <span>{INSTITUTE_NAME}</span>
        <span>{refreshedAt ? `Обновлено ${formatUpdatedAt(refreshedAt)}` : "Подключение к ВлГУ"}</span>
      </div>
    </header>
  );
}

function TodayView({
  heroSubject,
  heroRoom,
  heroStart,
  heroEnd,
  progress,
  remaining,
  current,
  next,
  nextLabel,
  lessons,
  weekMode
}: {
  heroSubject: string;
  heroRoom: string;
  heroStart: string;
  heroEnd: string;
  progress: number;
  remaining: number;
  current?: LessonSlot;
  next?: LessonSlot;
  nextLabel: string;
  lessons: LessonSlot[];
  weekMode: WeekMode;
}) {
  return (
    <div className="view-stack">
      <section className={`hero-card ${heroSubject.length > 32 ? "compact-title" : ""}`}>
        <div className="hero-geometry" aria-hidden="true" />
        <div className="status-pill">
          <span className={current ? "live-dot" : "idle-dot"} />
          {current ? "Сейчас" : next ? "Следующая пара" : "День завершён"}
        </div>
        <h2>{heroSubject}</h2>
        <div className="hero-meta">
          <span><MapPin size={22} /> {heroRoom}</span>
          <span><Clock3 size={22} /> {heroStart}-{heroEnd}</span>
        </div>

        <div className="progress-row" aria-label="Прогресс пары">
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-copy">
            <strong>{current ? `${remaining} мин осталось` : formatWeekMode(weekMode)}</strong>
            <span>{lessons.length} пар сегодня</span>
          </div>
        </div>
      </section>

      {current && (
        <section className="next-card">
          <div className="next-icon"><Waves size={30} /></div>
          <div>
            <span>Следующая пара</span>
            <strong>{lessonKeySubject(next) || nextLabel}</strong>
            {next?.room && <small><MapPin size={14} /> {next.room}</small>}
          </div>
          <ChevronRight size={24} />
        </section>
      )}

      <SegmentLabel />
      <Timeline lessons={lessons} current={current} next={next} />
    </div>
  );
}

function SegmentLabel() {
  return (
    <div className="segment-card" role="tablist" aria-label="Раздел">
      <button className="active" type="button">
        <CalendarDays size={18} />
        Сегодня
      </button>
      <button type="button">
        <Grid2X2 size={18} />
        Неделя
      </button>
    </div>
  );
}

function Timeline({ lessons, current, next }: { lessons: LessonSlot[]; current?: LessonSlot; next?: LessonSlot }) {
  if (!lessons.length) {
    return (
      <section className="empty-state">
        <Sparkles size={28} />
        <h3>Сегодня пар нет</h3>
        <p>Можно спокойно свериться с неделей или включить напоминания на завтра.</p>
      </section>
    );
  }

  return (
    <section className="timeline-card">
      {lessons.map((lesson) => (
        <LessonRow key={lesson.id} lesson={lesson} isCurrent={lesson.id === current?.id} isNext={lesson.id === next?.id} />
      ))}
    </section>
  );
}

function LessonRow({ lesson, isCurrent, isNext }: { lesson: LessonSlot; isCurrent?: boolean; isNext?: boolean }) {
  return (
    <article className={`lesson-row ${isCurrent ? "current" : ""} ${isNext ? "next" : ""}`}>
      <div className="lesson-time">
        <strong>{lesson.start}</strong>
        <span>{lesson.end}</span>
      </div>
      <div className="route-dot" />
      <div className="lesson-main">
        <h3>{lesson.subject}</h3>
        <p>
          <MapPin size={16} />
          {lesson.room || "Аудитория уточняется"}
          {lesson.kind ? <span>{lesson.kind}</span> : null}
        </p>
      </div>
      {isCurrent ? <span className="row-chip">Сейчас</span> : <ChevronRight className="row-chevron" size={20} />}
    </article>
  );
}

function WeekView({
  lessons,
  weekMode,
  weekOverride,
  setWeekOverride
}: {
  lessons: LessonSlot[];
  weekMode: WeekMode;
  weekOverride: WeekMode | "current";
  setWeekOverride: (mode: WeekMode | "current") => void;
}) {
  return (
    <div className="view-stack">
      <section className="week-toolbar">
        <div>
          <span>Неделя</span>
          <h2>{formatWeekMode(weekMode)}</h2>
        </div>
        <ShieldCheck size={34} />
      </section>

      <div className="mode-switch" role="radiogroup" aria-label="Тип недели">
        {[
          ["current", "Текущая"],
          ["numerator", "Числитель"],
          ["denominator", "Знаменатель"]
        ].map(([mode, label]) => (
          <button
            key={mode}
            className={weekOverride === mode ? "active" : ""}
            type="button"
            onClick={() => setWeekOverride(mode as WeekMode | "current")}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="week-list">
        {WEEK_DAYS.map((dayName, index) => {
          const dayLessons = selectDayLessons(lessons, index + 1, weekMode);
          return (
            <article className="day-block" key={dayName}>
              <div className="day-title">
                <h3>{dayName}</h3>
                <span>{dayLessons.length ? `${dayLessons.length} пар` : "без пар"}</span>
              </div>
              {dayLessons.length ? (
                dayLessons.map((lesson) => (
                  <div className="mini-lesson" key={lesson.id}>
                    <span>{lesson.start}</span>
                    <strong>{lesson.subject}</strong>
                    <small>{lesson.room || lesson.kind || "ВлГУ"}</small>
                  </div>
                ))
              ) : (
                <p className="quiet-copy">В расписании на этот день занятий нет.</p>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function SettingsView({
  settings,
  notice,
  onEnable,
  onMinutes,
  schedule
}: {
  settings: ReminderSettings;
  notice: string;
  onEnable: () => void;
  onMinutes: (minutes: number) => void;
  schedule: ScheduleState | null;
}) {
  const available = settings.permission !== "unsupported";

  return (
    <div className="view-stack">
      <section className="settings-hero">
        <BellRing size={34} />
        <h2>Напоминания перед парами</h2>
        <p>
          Локальные уведомления работают, когда браузер разрешает Notifications API и service worker активен.
        </p>
      </section>

      <section className="settings-panel">
        <div className="setting-row">
          <div>
            <span>Статус</span>
            <strong>{settings.permission === "granted" ? "Включены" : available ? "Нужно разрешение" : "Не поддерживаются"}</strong>
          </div>
          <button type="button" onClick={onEnable} disabled={!available} className="primary-action">
            <Bell size={18} />
            Включить
          </button>
        </div>

        <div className="reminder-options" aria-label="За сколько минут напоминать">
          {REMINDER_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              className={settings.minutesBefore === minutes ? "active" : ""}
              type="button"
              onClick={() => onMinutes(minutes)}
            >
              {minutes} мин
            </button>
          ))}
        </div>

        <div className="setting-row subtle">
          <div>
            <span>Offline-кэш</span>
            <strong>{schedule ? `Есть данные от ${formatUpdatedAt(schedule.fetchedAt)}` : "Пока пусто"}</strong>
          </div>
          {schedule ? <CheckCircle2 size={24} /> : <CloudOff size={24} />}
        </div>

        {notice && <p className="notice">{notice}</p>}
      </section>
    </div>
  );
}

function BottomNav({ activeTab, setActiveTab }: { activeTab: AppTab; setActiveTab: (tab: AppTab) => void }) {
  const items = [
    { tab: "today" as const, label: "Сегодня", icon: CalendarDays },
    { tab: "week" as const, label: "Неделя", icon: Grid2X2 },
    { tab: "settings" as const, label: "Настройки", icon: Settings }
  ];

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {items.map(({ tab, label, icon: Icon }) => (
        <button key={tab} className={activeTab === tab ? "active" : ""} type="button" onClick={() => setActiveTab(tab)}>
          <Icon size={24} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function ErrorBanner() {
  return (
    <div className="banner error">
      <CloudOff size={18} />
      Не получилось загрузить расписание ВлГУ. Проверь сеть и попробуй обновить.
    </div>
  );
}

function StaleBanner() {
  return (
    <div className="banner">
      <LocateFixed size={18} />
      Показан сохранённый кэш, свежие данные подтянутся автоматически.
    </div>
  );
}
