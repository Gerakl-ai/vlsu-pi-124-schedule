import { useEffect, useMemo, useRef, useState } from "react";
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
import { activeWeekMode, GROUP_NAME, INSTITUTE_NAME, loadSchedule } from "./lib/scheduleApi";
import { readReminderSettings, readScheduleCache, writeReminderSettings } from "./lib/storage";
import { getNotificationCapability, requestNotificationPermission, scheduleNextReminder, sendTestNotification } from "./lib/reminders";
import {
  currentDayIndex,
  findCurrentAndNext,
  formatUpdatedAt,
  formatWeekMode,
  lessonProgress,
  lessonTimingState,
  minutesFromTime,
  minutesUntilEnd,
  minutesUntilStart,
  nowMinutes,
  selectDayLessons
} from "./lib/time";

const WEEK_DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const WEEK_DAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const REMINDER_OPTIONS = [5, 10, 15, 30];
const BRAND_MARK = "/images/brand-mark.png";
const HERO_VISUAL = "/images/hero-schedule.png";
const FRESH_CACHE_MS = 6 * 60 * 60 * 1000;
const MIN_STUDY_WINDOW = 20;

type HeroMode = "current" | "next" | "done" | "free" | "loading";

interface StudyWindow {
  after: string;
  before: string;
  minutes: number;
}

interface NextStudyDay {
  dayIndex: number;
  dayName: string;
  isToday: boolean;
  firstLesson: LessonSlot;
  lessons: LessonSlot[];
}

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

function formatDuration(minutes: number) {
  if (minutes <= 0) return "сейчас";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const leftMinutes = minutes % 60;
  return leftMinutes ? `${hours} ч ${leftMinutes} мин` : `${hours} ч`;
}

function buildStudyWindows(lessons: LessonSlot[]): StudyWindow[] {
  return lessons
    .slice(0, -1)
    .map((lesson, index) => {
      const nextLesson = lessons[index + 1];
      const minutes = minutesFromTime(nextLesson.start) - minutesFromTime(lesson.end);
      return minutes >= MIN_STUDY_WINDOW ? { after: lesson.end, before: nextLesson.start, minutes } : null;
    })
    .filter(Boolean) as StudyWindow[];
}

function findNextStudyDay(lessons: LessonSlot[], weekMode: WeekMode, date: Date): NextStudyDay | null {
  const today = currentDayIndex(date);
  const currentMinutes = nowMinutes(date);

  for (let offset = 0; offset < 6; offset += 1) {
    const dayIndex = ((today - 1 + offset) % 6) + 1;
    const dayLessons = selectDayLessons(lessons, dayIndex, weekMode);
    if (!dayLessons.length) continue;

    if (dayIndex === today) {
      const upcoming = dayLessons.find((lesson) => minutesFromTime(lesson.start) > currentMinutes);
      if (!upcoming) continue;
      return {
        dayIndex,
        dayName: WEEK_DAYS[dayIndex - 1],
        firstLesson: upcoming,
        isToday: true,
        lessons: dayLessons
      };
    }

    return {
      dayIndex,
      dayName: WEEK_DAYS[dayIndex - 1],
      firstLesson: dayLessons[0],
      isToday: false,
      lessons: dayLessons
    };
  }

  return null;
}

function isFreshScheduleCache(state: ScheduleState | null) {
  if (!state?.fetchedAt) return false;
  const fetchedAt = new Date(state.fetchedAt).getTime();
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < FRESH_CACHE_MS;
}

export function App() {
  const [schedule, setSchedule] = useState<ScheduleState | null>(() => readScheduleCache());
  const [status, setStatus] = useState<ApiStatus>(() => (readScheduleCache() ? "ready" : "loading"));
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [weekOverride, setWeekOverride] = useState<WeekMode | "current">("current");
  const [settings, setSettings] = useState<ReminderSettings>(() => readReminderSettings());
  const [notice, setNotice] = useState("");
  const noticeLockUntilRef = useRef(0);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const currentWeek = schedule ? activeWeekMode(schedule.currentInfo.currentWeekType) : "numerator";
  const weekMode = weekOverride === "current" ? currentWeek : weekOverride;
  const notificationCapability = useMemo(() => getNotificationCapability(settings), [settings]);
  const nowDate = useMemo(() => new Date(nowTick), [nowTick]);

  const { todayLessons, current, next } = useMemo(
    () => findCurrentAndNext(schedule?.allLessons ?? [], weekMode, nowDate),
    [schedule?.allLessons, weekMode, nowDate]
  );

  const heroFallback = schedule ? parseCurrentInfoLesson(schedule.currentInfo.currentLesson) : null;
  const heroLesson = current ?? next;
  const dayCompleted = !heroLesson && todayLessons.length > 0;
  const freeStudyDay = Boolean(schedule) && !heroLesson && !todayLessons.length;
  const heroMode: HeroMode = current ? "current" : next ? "next" : dayCompleted ? "done" : freeStudyDay ? "free" : "loading";
  const heroSubject = heroLesson?.subject ?? (dayCompleted ? "Все пары пройдены" : freeStudyDay ? "Сегодня без пар" : heroFallback?.subject ?? "Загрузка расписания");
  const heroRoom = heroLesson ? heroLesson.room ?? "Аудитория уточняется" : dayCompleted || freeStudyDay ? "ПИ-124" : heroFallback?.room ?? "ИИТЭ";
  const heroStart = heroLesson?.start ?? todayLessons[0]?.start ?? "08:30";
  const heroEnd = heroLesson?.end ?? todayLessons[todayLessons.length - 1]?.end ?? "10:00";
  const heroTime = freeStudyDay ? "без пар" : `${heroStart}-${heroEnd}`;
  const completedCount = todayLessons.filter((lesson) => lessonTimingState(lesson, nowDate) === "past").length;
  const dayProgress = todayLessons.length ? Math.round((completedCount / todayLessons.length) * 100) : 100;
  const progress = current ? lessonProgress(current, nowDate) : dayCompleted || freeStudyDay ? 100 : 0;
  const remaining = heroLesson && current ? minutesUntilEnd(heroLesson, nowDate) : 0;
  const nextStudyDay = schedule ? findNextStudyDay(schedule.allLessons, weekMode, nowDate) : null;
  const studyWindows = buildStudyWindows(todayLessons);

  async function refreshSchedule(silent = false) {
    if (!silent || !schedule) setStatus("loading");
    try {
      const loaded = await loadSchedule();
      setSchedule(loaded);
      setStatus("ready");
    } catch {
      setStatus(isFreshScheduleCache(schedule) ? "ready" : schedule ? "stale" : "error");
    }
  }

  function showNotice(message: string, lockMs = 0) {
    if (lockMs > 0) noticeLockUntilRef.current = Date.now() + lockMs;
    setNotice(message);
  }

  useEffect(() => {
    refreshSchedule(Boolean(schedule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!schedule) return;
    scheduleNextReminder(schedule.allLessons, weekMode, settings, (message) => {
      if (Date.now() < noticeLockUntilRef.current) return;
      setNotice(message);
    });
  }, [schedule, settings, weekMode]);

  async function enableReminders() {
    const capability = getNotificationCapability(settings);
    if (capability.status === "install-required" || capability.status === "unsupported" || capability.status === "denied") {
      showNotice(capability.detail, 3500);
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
    showNotice(permission === "granted" ? "Напоминания включены. Проверь тестовой кнопкой." : "Браузер не дал доступ к уведомлениям.", 3500);
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
        showNotice(capability.detail, 3500);
        return;
      }

      await sendTestNotification();
      showNotice("Тестовое уведомление отправлено.", 3500);
    } catch {
      showNotice("Не удалось отправить тест. Проверь разрешения и режим PWA.", 3500);
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
  const displayLessons = todayLessons;
  const isLoading = status === "loading" && !schedule;
  const hasLoadedLessons = Boolean(schedule?.allLessons.length);

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
              heroTime={heroTime}
              heroMode={heroMode}
              progress={progress}
              remaining={remaining}
              completedCount={completedCount}
              dayProgress={dayProgress}
              dayCompleted={dayCompleted}
              hasLoadedLessons={hasLoadedLessons}
              current={current}
              next={next}
              nextStudyDay={nextStudyDay}
              studyWindows={studyWindows}
              nextLabel={nextLabel}
              lessons={displayLessons}
              weekMode={weekMode}
              now={nowDate}
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
        <img className="brand-mark" src={BRAND_MARK} alt="" aria-hidden="true" />
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
  heroTime,
  heroMode,
  progress,
  remaining,
  completedCount,
  dayProgress,
  dayCompleted,
  hasLoadedLessons,
  current,
  next,
  nextStudyDay,
  studyWindows,
  nextLabel,
  lessons,
  weekMode,
  now,
  activeTab,
  setActiveTab
}: {
  heroSubject: string;
  heroRoom: string;
  heroTime: string;
  heroMode: HeroMode;
  progress: number;
  remaining: number;
  completedCount: number;
  dayProgress: number;
  dayCompleted: boolean;
  hasLoadedLessons: boolean;
  current?: LessonSlot;
  next?: LessonSlot;
  nextStudyDay: NextStudyDay | null;
  studyWindows: StudyWindow[];
  nextLabel: string;
  lessons: LessonSlot[];
  weekMode: WeekMode;
  now: Date;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
}) {
  const titleClass = heroSubject.length > 44 ? "dense-title" : heroSubject.length > 30 ? "compact-title" : "";
  const minutesToNext = next ? minutesUntilStart(next, now) : 0;
  const sigilLabel = heroMode === "current" ? "Пара" : heroMode === "next" ? "Старт" : heroMode === "done" ? "Готово" : heroMode === "free" ? "Свободно" : "ВлГУ";
  const sigilValue = heroMode === "current"
    ? `${progress}%`
    : heroMode === "next"
      ? formatDuration(minutesToNext)
      : heroMode === "done"
        ? `${completedCount}/${lessons.length}`
        : heroMode === "free"
          ? "0 пар"
          : "...";
  const statusCopy = heroMode === "current"
    ? "Пара идёт"
    : heroMode === "next"
      ? `До пары ${formatDuration(minutesToNext)}`
      : heroMode === "done"
        ? "День закрыт"
        : heroMode === "free"
          ? "Свободный день"
          : hasLoadedLessons ? "Данные готовы" : "Ждём ВлГУ";
  const progressTitle = heroMode === "current"
    ? `${remaining} мин осталось`
    : heroMode === "next"
      ? `Старт в ${next?.start}`
      : heroMode === "done"
        ? "День закрыт"
        : heroMode === "free"
          ? "День свободен"
          : formatWeekMode(weekMode);
  const progressCaption = heroMode === "free" && nextStudyDay
    ? `Дальше: ${nextStudyDay.dayName}, ${nextStudyDay.firstLesson.start}`
    : heroMode === "done"
      ? `${completedCount} из ${lessons.length} пройдено`
      : `${formatLessonCount(lessons.length)} сегодня`;

  return (
    <div className="view-stack today-view">
      <section className={`hero-card mode-${heroMode} ${titleClass} ${dayCompleted ? "completed-day" : ""}`}>
        <img className="hero-visual" src={HERO_VISUAL} alt="" aria-hidden="true" />
        <div className="hero-sigil" aria-hidden="true">
          <span>{sigilLabel}</span>
          <strong>{sigilValue}</strong>
        </div>
        <div className="status-pill">
          <span className={current ? "live-dot" : "idle-dot"} />
          {statusCopy}
        </div>
        <h2>{heroSubject}</h2>
        <div className="hero-meta">
          <span><MapPin size={21} /> {heroRoom}</span>
          <span><Clock3 size={21} /> {heroTime}</span>
        </div>

        <div className="progress-row" aria-label="Прогресс пары">
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-copy">
            <strong>{progressTitle}</strong>
            <span>{progressCaption}</span>
          </div>
        </div>
      </section>

      <DayCommandStrip
        completedCount={completedCount}
        dayProgress={dayProgress}
        lessons={lessons}
        nextStudyDay={nextStudyDay}
        studyWindows={studyWindows}
      />

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
      <Timeline lessons={lessons} current={current} next={next} now={now} />
    </div>
  );
}

function DayCommandStrip({
  completedCount,
  dayProgress,
  lessons,
  nextStudyDay,
  studyWindows
}: {
  completedCount: number;
  dayProgress: number;
  lessons: LessonSlot[];
  nextStudyDay: NextStudyDay | null;
  studyWindows: StudyWindow[];
}) {
  const nearestWindow = studyWindows[0];
  const nextShortDay = nextStudyDay ? WEEK_DAYS_SHORT[nextStudyDay.dayIndex - 1] : "";
  const nextStudyLabel = nextStudyDay
    ? `${nextStudyDay.isToday ? "Сегодня" : nextShortDay}, ${nextStudyDay.firstLesson.start}`
    : "Нет данных";
  const windowCopy = lessons.length ? "пары идут подряд" : "можно отдыхать";

  return (
    <section className="command-strip" aria-label="Быстрая сводка дня">
      <div className="command-item">
        <span><Waves size={16} /> Пульс</span>
        <strong>{lessons.length ? `${completedCount}/${lessons.length}` : "0 пар"}</strong>
        <small>{lessons.length ? `${dayProgress}% дня закрыто` : "учебный день свободен"}</small>
      </div>
      <div className="command-item accent">
        <span><Clock3 size={16} /> Окна</span>
        <strong>{nearestWindow ? formatDuration(nearestWindow.minutes) : "Без окон"}</strong>
        <small>{nearestWindow ? `${nearestWindow.after}-${nearestWindow.before}` : windowCopy}</small>
      </div>
      <div className="command-item">
        <span><CalendarDays size={16} /> Дальше</span>
        <strong>{nextStudyLabel}</strong>
        <small>{nextStudyDay ? lessonKeySubject(nextStudyDay.firstLesson) : "после обновления"}</small>
      </div>
    </section>
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

function Timeline({ lessons, current, next, now }: { lessons: LessonSlot[]; current?: LessonSlot; next?: LessonSlot; now: Date }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!lessons.length) {
    return (
      <section className="empty-state">
        <Sparkles size={28} />
        <h3>Сегодня пар нет</h3>
        <p>Можно спокойно свериться с неделей или включить напоминания на завтра.</p>
      </section>
    );
  }

  const completedCount = lessons.filter((lesson) => lessonTimingState(lesson, now) === "past").length;
  const focusLesson = current ?? next;
  const focusCopy = current
    ? `${minutesUntilEnd(current, now)} мин до конца`
    : next
      ? `${minutesUntilStart(next, now)} мин до начала`
      : "Все пары на сегодня пройдены";

  return (
    <section className="timeline-card">
      <div className="timeline-summary">
        <div>
          <span>Пульс дня</span>
          <strong>{completedCount}/{lessons.length} пройдено</strong>
        </div>
        <p>{focusLesson ? `${focusCopy}: ${lessonKeySubject(focusLesson)}` : focusCopy}</p>
      </div>
      {lessons.map((lesson, index) => (
        <LessonRow
          key={lesson.id}
          lesson={lesson}
          isCurrent={lesson.id === current?.id}
          isNext={lesson.id === next?.id}
          isPast={lessonTimingState(lesson, now) === "past"}
          isExpanded={expandedId === lesson.id}
          onToggle={() => setExpandedId((value) => (value === lesson.id ? null : lesson.id))}
          index={index}
        />
      ))}
    </section>
  );
}

function LessonRow({
  lesson,
  isCurrent,
  isNext,
  isPast,
  isExpanded,
  onToggle,
  index
}: {
  lesson: LessonSlot;
  isCurrent?: boolean;
  isNext?: boolean;
  isPast?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  index: number;
}) {
  const rowRef = useRef<HTMLElement>(null);

  function handleToggle() {
    const willExpand = !isExpanded;
    onToggle();
    if (!willExpand) return;

    window.setTimeout(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      rowRef.current?.scrollIntoView({ block: "center", behavior });
    }, 70);
  }

  return (
    <article
      ref={rowRef}
      className={`lesson-row ${isCurrent ? "current" : ""} ${isNext ? "next" : ""} ${isPast ? "past" : ""} ${isExpanded ? "expanded" : ""}`}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <button type="button" className="lesson-row-button" onClick={handleToggle} aria-expanded={isExpanded}>
        <span className="lesson-time">
          <strong>{lesson.start}</strong>
          <span>{lesson.end}</span>
        </span>
        <span className="route-dot" aria-hidden="true" />
        <span className="lesson-title">{lesson.subject}</span>
        <span className="lesson-place">
          <MapPin size={16} />
          {lesson.room || "Аудитория уточняется"}
          {lesson.kind ? <span>{lesson.kind}</span> : null}
        </span>
        {isCurrent ? <span className="row-chip">Сейчас</span> : <ChevronRight className="row-chevron" size={20} />}
      </button>
      {isExpanded && (
        <div className="lesson-detail">
          <span>{formatWeekMode(lesson.weekMode)}</span>
          {lesson.teacher && <span>{lesson.teacher}</span>}
          <span>{lesson.rawText}</span>
        </div>
      )}
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

      <WeekMap lessons={lessons} weekMode={weekMode} />

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

function WeekMap({ lessons, weekMode }: { lessons: LessonSlot[]; weekMode: WeekMode }) {
  const today = currentDayIndex();
  const dayLoads = WEEK_DAYS.map((dayName, index) => {
    const dayLessons = selectDayLessons(lessons, index + 1, weekMode);
    return {
      count: dayLessons.length,
      dayIndex: index + 1,
      dayName,
      firstLesson: dayLessons[0],
      short: WEEK_DAYS_SHORT[index]
    };
  });
  const maxCount = Math.max(1, ...dayLoads.map((day) => day.count));

  return (
    <section className="week-map" aria-label="Карта нагрузки недели">
      <div className="week-map-head">
        <span>Карта нагрузки</span>
        <strong>{formatLessonCount(dayLoads.reduce((sum, day) => sum + day.count, 0))}</strong>
      </div>
      <div className="week-map-grid">
        {dayLoads.map((day) => (
          <div
            className={`week-map-day ${day.dayIndex === today ? "active" : ""} ${day.count ? "" : "empty"}`}
            key={day.dayName}
            title={`${day.dayName}: ${day.count ? formatLessonCount(day.count) : "без пар"}`}
          >
            <div className="week-map-bar" aria-hidden="true">
              <span style={{ height: day.count ? `${Math.max(18, Math.round((day.count / maxCount) * 100))}%` : "8%" }} />
            </div>
            <strong>{day.short}</strong>
            <small>{day.count ? `${day.count} · ${day.firstLesson?.start}` : "0"}</small>
          </div>
        ))}
      </div>
    </section>
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
        <div>
          <BellRing size={34} />
          <h2>Напоминания перед парами</h2>
          <p>
            Локальные напоминания планируются в приложении. Для гарантированной фоновой доставки на iOS нужен установленный PWA и серверная Web Push-подписка.
          </p>
        </div>
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
      ВлГУ временно не ответил. Можно обновить ещё раз или открыть сохранённые данные.
    </div>
  );
}

function StaleBanner() {
  return (
    <div className="banner">
      <LocateFixed size={18} />
      Нет связи с ВлГУ. Показываю сохранённое расписание.
    </div>
  );
}
