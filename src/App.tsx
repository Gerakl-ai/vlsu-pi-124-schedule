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
  Info,
  LocateFixed,
  MapPin,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Waves
} from "lucide-react";
import type { AppTab, ApiStatus, LessonSlot, NotificationCapability, ReminderSettings, ScheduleState, WeekMode } from "./types";
import { activeWeekMode, GROUP_NAME, INSTITUTE_NAME, lessonAppliesToWeek, loadSchedule } from "./lib/scheduleApi";
import { readReminderSettings, readScheduleCache, writeReminderSettings } from "./lib/storage";
import { getNotificationCapability, requestNotificationPermission, scheduleNextReminder, sendTestNotification } from "./lib/reminders";
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

function formatLessonCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} пара`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} пары`;
  return `${count} пар`;
}

function formatWeekChip(mode: WeekMode) {
  if (mode === "denominator") return "Знамен.";
  if (mode === "numerator") return "Числитель";
  return "Все";
}

export function App() {
  const [schedule, setSchedule] = useState<ScheduleState | null>(() => readScheduleCache());
  const [status, setStatus] = useState<ApiStatus>(() => (readScheduleCache() ? "stale" : "loading"));
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [weekOverride, setWeekOverride] = useState<WeekMode | "current">("current");
  const [settings, setSettings] = useState<ReminderSettings>(() => readReminderSettings());
  const [notice, setNotice] = useState("");
  const [notificationBusy, setNotificationBusy] = useState(false);

  const currentWeek = schedule ? activeWeekMode(schedule.currentInfo.currentWeekType) : "numerator";
  const weekMode = weekOverride === "current" ? currentWeek : weekOverride;
  const notificationCapability = useMemo(() => getNotificationCapability(settings), [settings]);

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
  const progress = heroLesson && current ? lessonProgress(heroLesson) : 0;
  const remaining = heroLesson && current ? minutesUntilEnd(heroLesson) : 0;

  async function refreshSchedule(silent = false) {
    if (!silent || !schedule) setStatus("loading");
    try {
      const loaded = await loadSchedule();
      setSchedule(loaded);
      setStatus("ready");
    } catch {
      setStatus(schedule ? "stale" : "error");
    }
  }

  useEffect(() => {
    refreshSchedule(Boolean(schedule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!schedule) return;
    scheduleNextReminder(schedule.allLessons, weekMode, settings, setNotice);
  }, [schedule, settings, weekMode]);

  async function enableReminders() {
    const capability = getNotificationCapability(settings);
    if (capability.status === "install-required" || capability.status === "unsupported" || capability.status === "denied") {
      setNotice(capability.detail);
      return;
    }

    const permission = await requestNotificationPermission();
    const nextSettings = {
      ...settings,
      enabled: permission === "granted",
      permission
    };
    setSettings(nextSettings);
    writeReminderSettings(nextSettings);
    setNotice(permission === "granted" ? "Напоминания включены. Проверь тестовой кнопкой." : "Браузер не дал доступ к уведомлениям.");
  }

  async function testNotification() {
    setNotificationBusy(true);
    try {
      let permission: ReminderSettings["permission"] = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
      if (permission === "default") permission = await requestNotificationPermission();
      const nextSettings = { ...settings, enabled: permission === "granted", permission };
      setSettings(nextSettings);
      writeReminderSettings(nextSettings);

      const capability = getNotificationCapability(nextSettings);
      if (!capability.canSendNow) {
        setNotice(capability.detail);
        return;
      }

      await sendTestNotification();
      setNotice("Тестовое уведомление отправлено.");
    } catch {
      setNotice("Не удалось отправить тест. Проверь разрешения и режим PWA.");
    } finally {
      setNotificationBusy(false);
    }
  }

  function updateReminderMinutes(minutesBefore: number) {
    const nextSettings = { ...settings, minutesBefore };
    setSettings(nextSettings);
    writeReminderSettings(nextSettings);
  }

  const nextLabel = next ? `${next.start}, ${next.subject}` : "Сегодня новых пар нет";
  const displayLessons = todayLessons.length ? todayLessons : (schedule?.allLessons ?? []).filter((lesson) => lessonAppliesToWeek(lesson, weekMode)).slice(0, 5);
  const isLoading = status === "loading" && !schedule;

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="ПИ-124 расписание">
        <div className="ambient-grid" />
        <div className="light-sweep" />
        <Header
          currentWeek={currentWeek}
          status={status}
          refreshedAt={schedule?.fetchedAt}
          onRefresh={() => refreshSchedule()}
        />

        <div className="content-scroll">
          {status === "error" && <ErrorBanner />}
          {status === "stale" && <StaleBanner />}

          {isLoading && <SkeletonView />}

          {!isLoading && activeTab === "today" && (
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
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          )}

          {!isLoading && activeTab === "week" && (
            <WeekView
              lessons={schedule?.allLessons ?? []}
              weekMode={weekMode}
              weekOverride={weekOverride}
              setWeekOverride={setWeekOverride}
            />
          )}

          {!isLoading && activeTab === "settings" && (
            <SettingsView
              settings={settings}
              notice={notice}
              capability={notificationCapability}
              busy={notificationBusy}
              onEnable={enableReminders}
              onTest={testNotification}
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
        <span>{formatWeekChip(currentWeek)}</span>
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
  weekMode,
  activeTab,
  setActiveTab
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
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
}) {
  const titleClass = heroSubject.length > 44 ? "dense-title" : heroSubject.length > 30 ? "compact-title" : "";

  return (
    <div className="view-stack today-view">
      <section className={`hero-card ${titleClass}`}>
        <div className="hero-geometry" aria-hidden="true" />
        <div className="hero-route" aria-hidden="true" />
        <div className="status-pill">
          <span className={current ? "live-dot" : "idle-dot"} />
          {current ? "Сейчас" : next ? "Следующая пара" : "День завершён"}
        </div>
        <h2>{heroSubject}</h2>
        <div className="hero-meta">
          <span><MapPin size={21} /> {heroRoom}</span>
          <span><Clock3 size={21} /> {heroStart}-{heroEnd}</span>
        </div>

        <div className="progress-row" aria-label="Прогресс пары">
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-copy">
            <strong>{current ? `${remaining} мин осталось` : formatWeekMode(weekMode)}</strong>
            <span>{formatLessonCount(lessons.length)} сегодня</span>
          </div>
        </div>
      </section>

      {current && (
        <section className="next-card">
          <div className="next-icon"><Waves size={28} /></div>
          <div>
            <span>Следующая пара</span>
            <strong>{lessonKeySubject(next) || nextLabel}</strong>
            {next?.room && <small><MapPin size={14} /> {next.room}</small>}
          </div>
          <ChevronRight size={23} />
        </section>
      )}

      <SegmentControl activeTab={activeTab} setActiveTab={setActiveTab} />
      <Timeline lessons={lessons} current={current} next={next} />
    </div>
  );
}

function SegmentControl({ activeTab, setActiveTab }: { activeTab: AppTab; setActiveTab: (tab: AppTab) => void }) {
  return (
    <div className="segment-card" role="tablist" aria-label="Раздел">
      <button className={activeTab === "today" ? "active" : ""} type="button" onClick={() => setActiveTab("today")}>
        <CalendarDays size={18} />
        Сегодня
      </button>
      <button className={activeTab === "week" ? "active" : ""} type="button" onClick={() => setActiveTab("week")}>
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
      {lessons.map((lesson, index) => (
        <LessonRow
          key={lesson.id}
          lesson={lesson}
          isCurrent={lesson.id === current?.id}
          isNext={lesson.id === next?.id}
          index={index}
        />
      ))}
    </section>
  );
}

function LessonRow({ lesson, isCurrent, isNext, index }: { lesson: LessonSlot; isCurrent?: boolean; isNext?: boolean; index: number }) {
  return (
    <article className={`lesson-row ${isCurrent ? "current" : ""} ${isNext ? "next" : ""}`} style={{ animationDelay: `${index * 55}ms` }}>
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
                <span>{dayLessons.length ? formatLessonCount(dayLessons.length) : "без пар"}</span>
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
  capability,
  busy,
  onEnable,
  onTest,
  onMinutes,
  schedule
}: {
  settings: ReminderSettings;
  notice: string;
  capability: NotificationCapability;
  busy: boolean;
  onEnable: () => void;
  onTest: () => void;
  onMinutes: (minutes: number) => void;
  schedule: ScheduleState | null;
}) {
  return (
    <div className="view-stack settings-view">
      <section className="settings-hero">
        <BellRing size={34} />
        <h2>Напоминания перед парами</h2>
        <p>
          Локальные напоминания планируются в приложении. Для гарантированной фоновой доставки на iOS нужен установленный PWA и серверная Web Push-подписка.
        </p>
      </section>

      <section className="settings-panel">
        <div className={`capability-card ${capability.status}`}>
          <div>
            {capability.status === "available" ? <CheckCircle2 size={24} /> : capability.status === "denied" ? <ShieldAlert size={24} /> : <Info size={24} />}
          </div>
          <div>
            <span>Статус уведомлений</span>
            <strong>{capability.title}</strong>
            <p>{capability.detail}</p>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <span>Напоминать за</span>
            <strong>{settings.minutesBefore} минут</strong>
          </div>
          <button type="button" onClick={onEnable} disabled={!capability.canRequestPermission && capability.status !== "available"} className="primary-action">
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

        <button type="button" className="test-action" onClick={onTest} disabled={busy || capability.status === "install-required" || capability.status === "unsupported" || capability.status === "denied"}>
          <Send size={18} />
          {busy ? "Отправляем..." : "Проверить уведомление"}
        </button>

        <div className="setting-row subtle">
          <div>
            <span>Offline-кэш</span>
            <strong>{schedule ? `Есть данные от ${formatUpdatedAt(schedule.fetchedAt)}` : "Пока пусто"}</strong>
          </div>
          {schedule ? <CheckCircle2 size={24} /> : <CloudOff size={24} />}
        </div>

        <div className="tech-list" aria-label="Техническая готовность уведомлений">
          <span>{capability.isStandalone ? "PWA-режим" : "Обычный браузер"}</span>
          <span>{capability.hasServiceWorker ? "Service Worker" : "Без Service Worker"}</span>
          <span>{capability.hasPushManager ? "Push API есть" : "Push API нет"}</span>
        </div>

        {notice && <p className="notice">{notice}</p>}
      </section>
    </div>
  );
}

function SkeletonView() {
  return (
    <div className="view-stack" aria-label="Загрузка расписания">
      <section className="hero-card skeleton-hero">
        <div className="skeleton-line short" />
        <div className="skeleton-line title" />
        <div className="skeleton-line title second" />
        <div className="skeleton-line meta" />
        <div className="skeleton-line progress" />
      </section>
      <section className="timeline-card skeleton-list">
        <div className="skeleton-row" />
        <div className="skeleton-row" />
        <div className="skeleton-row" />
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
