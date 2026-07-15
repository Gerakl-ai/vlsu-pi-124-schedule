import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  BrainCircuit,
  BookCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudOff,
  Download,
  Grid2X2,
  HardDrive,
  Info,
  MapPin,
  NotebookPen,
  Palette,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  Waves
} from "lucide-react";
import type { AppTab, ApiStatus, LessonSlot, NotificationCapability, ReminderSettings, ScheduleState, WeekMode } from "./types";
import { downloadNotesBackup, parseNotesBackup } from "./features/notes/noteBackup";
import { normalizeSubjectKey } from "./features/notes/noteClassifier";
import { readAiEnabled, writeAiEnabled } from "./features/notes/notePreferences";
import type { SmartNote } from "./features/notes/noteTypes";
import { useSmartNotes } from "./features/notes/useSmartNotes";
import { ThemeSheet } from "./features/themes/ThemeSheet";
import {
  applyTheme,
  readCustomTheme,
  readTheme,
  saveCustomTheme,
  THEMES,
  type CustomTheme,
  type ThemeId
} from "./features/themes/theme";
import { activeWeekMode, GROUP_NAME, INSTITUTE_NAME, loadSchedule } from "./lib/scheduleApi";
import { readReminderSettings, readScheduleCache, writeReminderSettings } from "./lib/storage";
import { getNotificationCapability, requestNotificationPermission, scheduleNextReminder, sendTestNotification } from "./lib/reminders";
import {
  currentDayIndex,
  addDays,
  dateForWeekDay,
  dateKeyFromDate,
  findCurrentAndNext,
  formatUpdatedAt,
  formatWeekMode,
  hasDatedLessons,
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
const BRAND_MARK = "/icons/icon-192.png";
const HERO_VISUAL_DARK = "/images/hero-obsidian-campus.jpg";
const HERO_VISUAL_LIGHT = "/images/hero-porcelain-campus.jpg";
const MIN_STUDY_WINDOW = 20;
const INITIAL_SCHEDULE = readScheduleCache();
type NotesViewComponent = typeof import("./features/notes/NotesView")["NotesView"];

let notesViewPromise: Promise<NotesViewComponent> | null = null;
const loadNotesView = () => {
  notesViewPromise ??= import("./features/notes/NotesView").then((module) => module.NotesView);
  return notesViewPromise;
};

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

function notesForLesson(lesson: LessonSlot | undefined, notes: SmartNote[]) {
  if (!lesson) return [];
  const subjectKey = lesson.subjectKey ?? normalizeSubjectKey(lesson.subject);
  return notes.filter((note) => note.status === "open" && note.subjectKey === subjectKey);
}

function formatLessonCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} пара`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} пары`;
  return `${count} пар`;
}

function formatNoteCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} запись`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} записи`;
  return `${count} записей`;
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
  const isDated = hasDatedLessons(lessons);
  const today = currentDayIndex(date);
  const currentMinutes = nowMinutes(date);
  const maxOffset = isDated ? 90 : 6;

  for (let offset = 0; offset < maxOffset; offset += 1) {
    const targetDate = addDays(date, offset);
    const dayIndex = isDated ? currentDayIndex(targetDate) : ((today - 1 + offset) % 6) + 1;
    const dayLessons = selectDayLessons(lessons, dayIndex, weekMode, targetDate);
    if (!dayLessons.length) continue;

    if (offset === 0) {
      const upcoming = dayLessons.find((lesson) => minutesFromTime(lesson.start) > currentMinutes);
      if (!upcoming) continue;
      return {
        dayIndex,
        dayName: upcoming.dateLabel ?? WEEK_DAYS[dayIndex - 1],
        firstLesson: upcoming,
        isToday: true,
        lessons: dayLessons
      };
    }

    return {
      dayIndex,
      dayName: dayLessons[0].dateLabel ?? WEEK_DAYS[dayIndex - 1],
      firstLesson: dayLessons[0],
      isToday: false,
      lessons: dayLessons
    };
  }

  return null;
}

function syncStatusText(status: ApiStatus, refreshedAt?: string) {
  const updatedText = refreshedAt ? `Обновлено ${formatUpdatedAt(refreshedAt)}` : "Кэш пуст";

  if (status === "loading") return "Подключение к ВлГУ";
  if (status === "refreshing") return refreshedAt ? `${updatedText} · синхронизация` : "Синхронизация";
  if (status === "updated") return "Расписание обновлено";
  if (status === "stale") return refreshedAt ? `Нет связи · ${updatedText}` : "Нет связи с ВлГУ";
  if (status === "error-without-cache") return "Не удалось загрузить данные";

  return updatedText;
}

function scheduleContentSignature(state: ScheduleState | null) {
  if (!state) return "";
  return JSON.stringify({
    groupNrec: state.groupNrec,
    currentInfo: state.currentInfo,
    allLessons: state.allLessons
  });
}

function initialAppTab(): AppTab {
  const requested = new URLSearchParams(window.location.search).get("tab");
  return requested === "week" || requested === "notes" || requested === "settings" ? requested : "today";
}

function isIosStandaloneWebApp() {
  const nav = navigator as Navigator & { standalone?: boolean };
  const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isiOS && (Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches);
}

let iosThemeReloadScheduled = false;

function refreshIosThemeChrome(activeTab: AppTab) {
  if (!isIosStandaloneWebApp() || iosThemeReloadScheduled) return;
  iosThemeReloadScheduled = true;
  const url = new URL(window.location.href);
  if (activeTab === "today") url.searchParams.delete("tab");
  else url.searchParams.set("tab", activeTab);
  window.history.replaceState(null, "", url);
  window.setTimeout(() => window.location.reload(), 220);
}

export function App() {
  const [schedule, setSchedule] = useState<ScheduleState | null>(INITIAL_SCHEDULE);
  const [status, setStatus] = useState<ApiStatus>(() => (INITIAL_SCHEDULE ? "hydrating-from-cache" : "loading"));
  const [activeTab, setActiveTab] = useState<AppTab>(initialAppTab);
  const [weekOverride, setWeekOverride] = useState<WeekMode | "current">("current");
  const [settings, setSettings] = useState<ReminderSettings>(() => readReminderSettings());
  const [notice, setNotice] = useState("");
  const noticeLockUntilRef = useRef(0);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [themeId, setThemeId] = useState<ThemeId>(() => readTheme());
  const [customTheme, setCustomTheme] = useState<CustomTheme>(() => readCustomTheme());
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(() => readAiEnabled());
  const [NotesView, setNotesView] = useState<NotesViewComponent | null>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const pendingTabRef = useRef<AppTab>(activeTab);
  const tabScrollPositionsRef = useRef<Record<AppTab, number>>({ today: 0, week: 0, notes: 0, settings: 0 });

  const currentWeek = schedule ? activeWeekMode(schedule.currentInfo.currentWeekType) : "numerator";
  const weekMode = weekOverride === "current" ? currentWeek : weekOverride;
  const notificationCapability = useMemo(() => getNotificationCapability(settings), [settings]);
  const nowDate = useMemo(() => new Date(nowTick), [nowTick]);
  const smartNotes = useSmartNotes(schedule?.allLessons ?? [], weekMode, aiEnabled);
  const openNotes = useMemo(() => smartNotes.notes.filter((note) => note.status === "open"), [smartNotes.notes]);
  const focusNote = useMemo(() => {
    return [...openNotes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    })[0];
  }, [openNotes]);

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
  const isSessionSchedule = Boolean(schedule?.allLessons.length && hasDatedLessons(schedule.allLessons));

  async function refreshSchedule() {
    const currentSchedule = schedule;
    const hasCache = Boolean(currentSchedule);
    setStatus(hasCache ? "refreshing" : "loading");

    try {
      const loaded = await loadSchedule();
      const changed = scheduleContentSignature(currentSchedule) !== scheduleContentSignature(loaded);
      setSchedule(loaded);
      setStatus(changed && hasCache ? "updated" : "ready");
    } catch {
      if (!currentSchedule) {
        setStatus("error-without-cache");
        return;
      }

      setStatus("stale");
    }
  }

  function showNotice(message: string, lockMs = 0) {
    if (lockMs > 0) noticeLockUntilRef.current = Date.now() + lockMs;
    setNotice(message);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => refreshSchedule(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const preload = () => {
      void loadNotesView().then((Component) => {
        if (!cancelled) setNotesView(() => Component);
      });
    };
    if (activeTab === "notes") {
      preload();
      return () => {
        cancelled = true;
      };
    }
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(preload, { timeout: 1400 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(handle);
      };
    }
    const timer = window.setTimeout(preload, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // The initial tab is intentional; later navigation loads on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "updated") return;
    const timer = window.setTimeout(() => setStatus("ready"), 2400);
    return () => window.clearTimeout(timer);
  }, [status]);

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

  function selectTheme(nextTheme: ThemeId) {
    const previousMode = document.documentElement.dataset.themeMode;
    const definition = THEMES.find((theme) => theme.id === nextTheme);
    const nextMode = nextTheme === "custom" ? customTheme.mode : definition?.isLight ? "light" : "dark";
    setThemeId(nextTheme);
    applyTheme(nextTheme, customTheme);
    if (previousMode && previousMode !== nextMode) refreshIosThemeChrome(activeTab);
    if (nextTheme !== "custom") window.setTimeout(() => setThemeSheetOpen(false), 180);
  }

  function updateCustomTheme(nextTheme: CustomTheme) {
    const previousMode = document.documentElement.dataset.themeMode;
    saveCustomTheme(nextTheme);
    setCustomTheme(nextTheme);
    setThemeId("custom");
    applyTheme("custom", nextTheme);
    if (previousMode && previousMode !== nextTheme.mode) refreshIosThemeChrome(activeTab);
  }

  const navigateToTab = useCallback((nextTab: AppTab) => {
    pendingTabRef.current = nextTab;
    const container = contentScrollRef.current;
    if (nextTab === activeTab) {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      container?.scrollTo({ top: 0, behavior });
      tabScrollPositionsRef.current[nextTab] = 0;
      return;
    }
    if (container) tabScrollPositionsRef.current[activeTab] = container.scrollTop;
    if (nextTab === "notes" && !NotesView) {
      void loadNotesView().then((Component) => {
        setNotesView(() => Component);
        if (pendingTabRef.current === "notes") startTransition(() => setActiveTab("notes"));
      });
      return;
    }
    setActiveTab(nextTab);
  }, [NotesView, activeTab]);

  useLayoutEffect(() => {
    const container = contentScrollRef.current;
    if (container) container.scrollTop = tabScrollPositionsRef.current[activeTab];
  }, [activeTab]);

  const nextLabel = next ? `${next.start}, ${next.subject}` : "Сегодня новых пар нет";
  const displayLessons = todayLessons;
  const isLoading = status === "loading" && !schedule;
  const hasLoadedLessons = Boolean(schedule?.allLessons.length);
  const lightHero = themeId === "porcelain" || (themeId === "custom" && customTheme.mode === "light");

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="ПИ-124 расписание">
        <div className="ambient-grid" />
        <div className="light-sweep" />
        <Header
          currentWeek={currentWeek}
          isSessionSchedule={isSessionSchedule}
          status={status}
          refreshedAt={schedule?.fetchedAt}
          onRefresh={() => refreshSchedule()}
          onThemeOpen={() => setThemeSheetOpen(true)}
        />

        <div className="content-scroll" ref={contentScrollRef} data-active-tab={activeTab}>
          {status === "error-without-cache" && activeTab !== "notes" && <ErrorBanner />}

          {isLoading && (activeTab === "today" || activeTab === "week") && <SkeletonView />}

          {!isLoading && activeTab === "today" && (
            <TodayView
              heroSubject={heroSubject}
              heroVisual={lightHero ? HERO_VISUAL_LIGHT : HERO_VISUAL_DARK}
              lightHero={lightHero}
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
              notes={openNotes}
              focusNote={focusNote}
              onToggleNote={smartNotes.toggleNote}
              onOpenNotes={() => navigateToTab("notes")}
            />
          )}

          {!isLoading && activeTab === "week" && (
            <WeekView
              lessons={schedule?.allLessons ?? []}
              weekMode={weekMode}
              weekOverride={weekOverride}
              setWeekOverride={setWeekOverride}
              notes={openNotes}
            />
          )}

          {activeTab === "notes" && (
            NotesView ? (
              <NotesView
                visualSrc={lightHero ? HERO_VISUAL_LIGHT : HERO_VISUAL_DARK}
                notes={smartNotes.notes}
                folders={smartNotes.folders}
                ready={smartNotes.ready}
                classifyDraft={smartNotes.classifyDraft}
                onCreate={smartNotes.createNote}
                onCreateFolder={smartNotes.createFolder}
                onDelete={smartNotes.deleteNote}
                onDeleteFolder={smartNotes.deleteFolder}
                onToggle={smartNotes.toggleNote}
                onTogglePinned={smartNotes.togglePinned}
                onUpdate={smartNotes.updateNote}
              />
            ) : <section className="notes-loading" aria-label="Открываем записи"><span /><span /><span /></section>
          )}

          {activeTab === "settings" && (
            <SettingsView
              settings={settings}
              notice={notice}
              capability={notificationCapability}
              busy={notificationBusy}
              onEnable={enableReminders}
              onTest={testNotification}
              onMinutes={updateReminderMinutes}
              schedule={schedule}
              themeId={themeId}
              customThemeName={customTheme.name}
              onThemeOpen={() => setThemeSheetOpen(true)}
              notes={smartNotes.notes}
              onImportNotes={smartNotes.importNotes}
              aiEnabled={aiEnabled}
              onAiEnabled={(enabled) => {
                setAiEnabled(enabled);
                writeAiEnabled(enabled);
              }}
            />
          )}
        </div>

        <BottomNav activeTab={activeTab} onTabChange={navigateToTab} />
        <ThemeSheet
          currentTheme={themeId}
          customTheme={customTheme}
          open={themeSheetOpen}
          onClose={() => setThemeSheetOpen(false)}
          onCustomChange={updateCustomTheme}
          onSelect={selectTheme}
        />
      </section>
    </main>
  );
}

interface HeaderProps {
  currentWeek: WeekMode;
  isSessionSchedule: boolean;
  status: ApiStatus;
  refreshedAt?: string;
  onRefresh: () => void;
  onThemeOpen: () => void;
}

function Header({ currentWeek, isSessionSchedule, status, refreshedAt, onRefresh, onThemeOpen }: HeaderProps) {
  const isBusy = status === "loading" || status === "refreshing";

  return (
    <header className="topbar" data-sync-status={status}>
      <div className="brand">
        <img className="brand-mark" src={BRAND_MARK} alt="" aria-hidden="true" />
        <div>
          <h1>{GROUP_NAME}</h1>
          <p>ИИТЭ</p>
        </div>
      </div>

      <div className="header-actions">
        <button className="week-chip" type="button" onClick={onRefresh} aria-label="Обновить расписание">
          <CalendarDays size={18} />
          <span>{isSessionSchedule ? "Сессия" : formatWeekChip(currentWeek)}</span>
          <RefreshCw className={isBusy ? "spin" : ""} size={16} />
        </button>
        <button className="header-icon-button" type="button" onClick={onThemeOpen} aria-label="Сменить тему" title="Сменить тему" data-testid="open-theme-picker">
          <Palette size={20} />
        </button>
      </div>

      <div className="sync-line">
        <span>{INSTITUTE_NAME}</span>
        <span className={`sync-status sync-status-${status}`} aria-live="polite">
          {syncStatusText(status, refreshedAt)}
        </span>
      </div>
    </header>
  );
}

function TodayView({
  heroSubject,
  heroVisual,
  lightHero,
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
  notes,
  focusNote,
  onToggleNote,
  onOpenNotes
}: {
  heroSubject: string;
  heroVisual: string;
  lightHero: boolean;
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
  notes: SmartNote[];
  focusNote?: SmartNote;
  onToggleNote: (noteId: string) => void;
  onOpenNotes: () => void;
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
      <section className={`hero-card mode-${heroMode} ${titleClass} ${dayCompleted ? "completed-day" : ""} ${lightHero ? "light-hero" : ""}`}>
        <img className="hero-visual" src={heroVisual} alt="" aria-hidden="true" />
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

      {focusNote && (
        <button className="focus-note-card" type="button" onClick={onOpenNotes}>
          <span className="focus-note-icon"><BookCheck size={22} /></span>
          <span>
            <small>{focusNote.subjectLabel ? "К ближайшей паре" : focusNote.space}</small>
            <strong>{focusNote.title}</strong>
            <i>{[focusNote.subjectLabel, focusNote.dueLabel].filter(Boolean).join(" · ") || "Открыть запись"}</i>
          </span>
          <ChevronRight size={20} />
        </button>
      )}

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

      <Timeline lessons={lessons} current={current} next={next} now={now} notes={notes} onToggleNote={onToggleNote} />
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
  const nextShortDay = nextStudyDay ? nextStudyDay.firstLesson.dateLabel ?? WEEK_DAYS_SHORT[nextStudyDay.dayIndex - 1] : "";
  const nextStudyLabel = nextStudyDay
    ? `${nextStudyDay.isToday ? "Сегодня" : nextShortDay}, ${nextStudyDay.firstLesson.start}`
    : "Нет данных";
  const windowCopy = lessons.length ? "пары идут подряд" : "можно отдыхать";

  return (
    <section className="command-strip" aria-label="Быстрая сводка дня">
      <div className="command-item">
        <span><Waves size={16} /> Прогресс</span>
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

function Timeline({
  lessons,
  current,
  next,
  now,
  notes,
  onToggleNote
}: {
  lessons: LessonSlot[];
  current?: LessonSlot;
  next?: LessonSlot;
  now: Date;
  notes: SmartNote[];
  onToggleNote: (noteId: string) => void;
}) {
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
          <span>Сегодня</span>
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
          linkedNotes={notesForLesson(lesson, notes)}
          onToggleNote={onToggleNote}
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
  linkedNotes,
  onToggleNote,
  index
}: {
  lesson: LessonSlot;
  isCurrent?: boolean;
  isNext?: boolean;
  isPast?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  linkedNotes: SmartNote[];
  onToggleNote: (noteId: string) => void;
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
        <span className="row-end" aria-hidden="true">
          {isCurrent && <span className="row-chip">Сейчас</span>}
          {linkedNotes.length > 0 && <span className="lesson-note-count"><BookCheck size={14} /> {linkedNotes.length}</span>}
          {!isCurrent && linkedNotes.length === 0 && <ChevronRight className="row-chevron" size={20} />}
        </span>
      </button>
      {isExpanded && (
        <div className="lesson-detail">
          <span>{formatWeekMode(lesson.weekMode)}</span>
          {lesson.teacher && <span>{lesson.teacher}</span>}
          <span>{lesson.rawText}</span>
          {linkedNotes.length > 0 && (
            <div className="lesson-linked-notes">
              <strong><BookCheck size={15} /> Связано с предметом</strong>
              {linkedNotes.map((note) => (
                <button key={note.id} type="button" onClick={() => onToggleNote(note.id)}>
                  <span className="linked-note-check"><CheckCircle2 size={15} /></span>
                  <span>{note.title}</span>
                  {note.dueLabel && <small>{note.dueLabel}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function WeekView({
  lessons,
  weekMode,
  weekOverride,
  setWeekOverride,
  notes
}: {
  lessons: LessonSlot[];
  weekMode: WeekMode;
  weekOverride: WeekMode | "current";
  setWeekOverride: (mode: WeekMode | "current") => void;
  notes: SmartNote[];
}) {
  if (hasDatedLessons(lessons)) {
    return <SessionScheduleView lessons={lessons} notes={notes} />;
  }

  return (
    <div className="view-stack week-view">
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
          const dayDate = dateForWeekDay(index + 1);
          const dayLessons = selectDayLessons(lessons, index + 1, weekMode, dayDate);
          return (
            <article className="day-block" key={dayName}>
              <div className="day-title">
                <h3>{dayName}</h3>
                <span>{dayLessons.length ? formatLessonCount(dayLessons.length) : "без пар"}</span>
              </div>
              {dayLessons.length ? (
                dayLessons.map((lesson) => {
                  const linkedCount = notesForLesson(lesson, notes).length;
                  return (
                    <div className="mini-lesson" key={lesson.id}>
                      <span>{lesson.start}</span>
                      <strong>{lesson.subject}</strong>
                      <small>{lesson.room || lesson.kind || "ВлГУ"}</small>
                      {linkedCount > 0 && <span className="mini-note-badge"><BookCheck size={13} /> {linkedCount}</span>}
                    </div>
                  );
                })
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

function SessionScheduleView({ lessons, notes }: { lessons: LessonSlot[]; notes: SmartNote[] }) {
  const todayKey = dateKeyFromDate();
  const upcoming = lessons.filter((lesson) => !lesson.date || lesson.date >= todayKey);
  const visibleLessons = (upcoming.length ? upcoming : lessons).sort((a, b) => `${a.date ?? ""} ${a.start}`.localeCompare(`${b.date ?? ""} ${b.start}`, "ru"));
  const groups = visibleLessons.reduce<Array<{ key: string; title: string; lessons: LessonSlot[] }>>((items, lesson) => {
    const key = lesson.date ?? lesson.dayName;
    const existing = items.find((item) => item.key === key);
    const title = lesson.dateLabel ? `${lesson.dateLabel}` : lesson.dayName;
    if (existing) {
      existing.lessons.push(lesson);
      return items;
    }
    return [...items, { key, title, lessons: [lesson] }];
  }, []);

  return (
    <div className="view-stack week-view session-view">
      <section className="week-toolbar">
        <div>
          <span>Расписание</span>
          <h2>Сессия</h2>
        </div>
        <ShieldCheck size={34} />
      </section>

      <section className="week-map session-map" aria-label="Карта сессии">
        <div className="week-map-head">
          <span>Ближайшие даты</span>
          <strong>{formatLessonCount(visibleLessons.length)}</strong>
        </div>
        <div className="session-map-grid">
          {groups.slice(0, 6).map((group) => (
            <div className="session-date-card" key={group.key}>
              <strong>{group.title}</strong>
              <span>{formatLessonCount(group.lessons.length)}</span>
              <small>{group.lessons[0]?.start}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="week-list">
        {groups.map((group) => (
          <article className="day-block" key={group.key}>
            <div className="day-title">
              <h3>{group.title}</h3>
              <span>{formatLessonCount(group.lessons.length)}</span>
            </div>
            {group.lessons.map((lesson) => {
              const linkedCount = notesForLesson(lesson, notes).length;
              return (
                <div className="mini-lesson" key={lesson.id}>
                  <span>{lesson.start}</span>
                  <strong>{lesson.subject}</strong>
                  <small>{[lesson.room, lesson.kind, lesson.teacher].filter(Boolean).join(" · ") || "ВлГУ"}</small>
                  {linkedCount > 0 && <span className="mini-note-badge"><BookCheck size={13} /> {linkedCount}</span>}
                </div>
              );
            })}
          </article>
        ))}
      </section>
    </div>
  );
}

function WeekMap({ lessons, weekMode }: { lessons: LessonSlot[]; weekMode: WeekMode }) {
  const today = currentDayIndex();
  const dayLoads = WEEK_DAYS.map((dayName, index) => {
    const dayDate = dateForWeekDay(index + 1);
    const dayLessons = selectDayLessons(lessons, index + 1, weekMode, dayDate);
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
  schedule,
  themeId,
  customThemeName,
  onThemeOpen,
  notes,
  onImportNotes,
  aiEnabled,
  onAiEnabled
}: {
  settings: ReminderSettings;
  notice: string;
  capability: NotificationCapability;
  busy: boolean;
  onEnable: () => void;
  onTest: () => void;
  onMinutes: (minutes: number) => void;
  schedule: ScheduleState | null;
  themeId: ThemeId;
  customThemeName: string;
  onThemeOpen: () => void;
  notes: SmartNote[];
  onImportNotes: (notes: SmartNote[]) => Promise<number>;
  aiEnabled: boolean;
  onAiEnabled: (enabled: boolean) => void;
}) {
  const activeTheme = THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
  const activeThemeName = themeId === "custom" ? customThemeName || "Своя тема" : activeTheme.name;
  const importInputRef = useRef<HTMLInputElement>(null);
  const [backupNotice, setBackupNotice] = useState("");

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const imported = await onImportNotes(parseNotesBackup(await file.text()));
      setBackupNotice(imported ? `Добавлено или обновлено записей: ${imported}` : "Все записи уже актуальны.");
    } catch {
      setBackupNotice("Не удалось прочитать копию. Выберите JSON-файл, созданный в «Лад».");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

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
        <div className="setting-row appearance-row">
          <div>
            <span>Оформление</span>
            <strong>{activeThemeName}</strong>
          </div>
          <button type="button" className="theme-settings-button" onClick={onThemeOpen}>
            <Palette size={18} />
            Сменить
          </button>
        </div>

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

      <section className="settings-panel personal-data-panel">
        <header className="personal-data-head">
          <span className="personal-data-icon"><HardDrive size={21} /></span>
          <div>
            <span>Личное пространство</span>
            <strong>{formatNoteCount(notes.length)}</strong>
          </div>
        </header>
        <p>Записи хранятся на устройстве. Резервная копия переносит их без аккаунта и облачной синхронизации.</p>
        <div className="ai-setting">
          <span className="ai-setting-icon"><BrainCircuit size={19} /></span>
          <div>
            <strong>Облачное уточнение</strong>
            <small>Новые сложные записи уточняет Cloudflare AI. Локальная сортировка работает всегда.</small>
          </div>
          <button
            className={`setting-switch ${aiEnabled ? "active" : ""}`}
            type="button"
            role="switch"
            aria-checked={aiEnabled}
            aria-label="Облачное уточнение записей"
            onClick={() => onAiEnabled(!aiEnabled)}
          >
            <span />
          </button>
        </div>
        <div className="backup-actions">
          <button type="button" onClick={() => downloadNotesBackup(notes)} disabled={!notes.length}>
            <Download size={17} /> Экспорт
          </button>
          <button type="button" onClick={() => importInputRef.current?.click()}>
            <Upload size={17} /> Импорт
          </button>
        </div>
        <input
          ref={importInputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importBackup(event.target.files?.[0])}
          aria-label="Импортировать резервную копию записей"
        />
        {backupNotice && <p className="backup-notice" role="status">{backupNotice}</p>}
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

function BottomNav({ activeTab, onTabChange }: { activeTab: AppTab; onTabChange: (tab: AppTab) => void }) {
  const items = [
    { tab: "today" as const, label: "Сегодня", icon: CalendarDays },
    { tab: "week" as const, label: "Неделя", icon: Grid2X2 },
    { tab: "notes" as const, label: "Записи", icon: NotebookPen },
    { tab: "settings" as const, label: "Настройки", icon: Settings }
  ];

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {items.map(({ tab, label, icon: Icon }) => (
        <button
          key={tab}
          className={activeTab === tab ? "active" : ""}
          type="button"
          onClick={(event) => {
            event.currentTarget.blur();
            onTabChange(tab);
          }}
          aria-current={activeTab === tab ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true"><Icon size={23} /></span>
          <span className="nav-label">{label}</span>
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
