import type { ScheduleState } from "../../types";
import {
  isGroupProfile,
  LEGACY_PI124_GROUP,
  type GroupOption,
  type GroupProfile,
  type InstituteOption
} from "./groupTypes";

const SELECTED_GROUP_KEY = "lad.selected-group.v2";
const SCHEDULE_CACHE_PREFIX = "lad.schedule.v2";
const INSTITUTE_CACHE_KEY = "lad.catalog.institutes.v1";
const GROUP_CACHE_PREFIX = "lad.catalog.groups.v1";
const LEGACY_SCHEDULE_CACHE_KEY = "pi124.schedule.cache";

interface CatalogCache<T> {
  fetchedAt: string;
  items: T[];
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private mode; the active session still works.
  }
}

function scheduleCacheKey(nrec: string) {
  return `${SCHEDULE_CACHE_PREFIX}:${nrec}`;
}

export function readSelectedGroup(): GroupProfile | null {
  const selected = readJson<unknown>(SELECTED_GROUP_KEY);
  if (isGroupProfile(selected)) return selected;

  const legacySchedule = readJson<ScheduleState>(LEGACY_SCHEDULE_CACHE_KEY);
  if (!legacySchedule) return null;
  writeSelectedGroup(LEGACY_PI124_GROUP);
  writeJson(scheduleCacheKey(LEGACY_PI124_GROUP.nrec), legacySchedule);
  return LEGACY_PI124_GROUP;
}

export function writeSelectedGroup(group: GroupProfile) {
  writeJson(SELECTED_GROUP_KEY, group);
}

export function readGroupScheduleCache(group: GroupProfile): ScheduleState | null {
  const current = readJson<ScheduleState>(scheduleCacheKey(group.nrec));
  if (current) return current;

  if (group.nrec !== LEGACY_PI124_GROUP.nrec) return null;
  const legacy = readJson<ScheduleState>(LEGACY_SCHEDULE_CACHE_KEY);
  if (legacy) writeJson(scheduleCacheKey(group.nrec), legacy);
  return legacy;
}

export function writeGroupScheduleCache(state: ScheduleState) {
  writeJson(scheduleCacheKey(state.groupNrec), state);
}

export function readInstituteCatalog(): CatalogCache<InstituteOption> | null {
  const cache = readJson<CatalogCache<InstituteOption>>(INSTITUTE_CACHE_KEY);
  return cache && Array.isArray(cache.items) ? cache : null;
}

export function writeInstituteCatalog(items: InstituteOption[]) {
  writeJson(INSTITUTE_CACHE_KEY, { fetchedAt: new Date().toISOString(), items });
}

export function readGroupCatalog(instituteId: string): CatalogCache<GroupOption> | null {
  const cache = readJson<CatalogCache<GroupOption>>(`${GROUP_CACHE_PREFIX}:${instituteId}`);
  return cache && Array.isArray(cache.items) ? cache : null;
}

export function writeGroupCatalog(instituteId: string, items: GroupOption[]) {
  writeJson(`${GROUP_CACHE_PREFIX}:${instituteId}`, { fetchedAt: new Date().toISOString(), items });
}
