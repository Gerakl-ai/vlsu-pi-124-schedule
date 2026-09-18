/**
 * Формы обучения ВлГУ. Приложение долго запрашивало только очную (WFormed: 0),
 * поэтому заочники и очно-заочники не могли найти свою группу вообще.
 */
export const STUDY_FORM_KEYS = ["full-time", "extramural", "part-time"] as const;

export type StudyFormKey = (typeof STUDY_FORM_KEYS)[number];

export const STUDY_FORM_LABELS: Record<StudyFormKey, string> = {
  "full-time": "Очная",
  extramural: "Заочная",
  "part-time": "Очно-заочная"
};

/** Короткая подпись для списка групп: очную не подписываем, она подразумевается. */
export function studyFormLabel(forms: StudyFormKey[] | undefined) {
  if (!forms || !forms.length) return undefined;
  const meaningful = forms.filter((form) => form !== "full-time");
  if (!meaningful.length) return undefined;
  return meaningful.map((form) => STUDY_FORM_LABELS[form]).join(" · ");
}

export interface InstituteOption {
  id: string;
  name: string;
  shortName: string;
  visualKey: string;
}

export interface GroupOption {
  nrec: string;
  name: string;
  course?: string;
  forms?: StudyFormKey[];
}

export interface GroupProfile extends GroupOption {
  id: string;
  instituteId: string;
  instituteName: string;
  instituteShortName: string;
  visualKey: string;
}

export const LEGACY_PI124_GROUP: GroupProfile = {
  id: "7936a2a43b11b20b01d30f5b00c73166",
  nrec: "7936a2a43b11b20b01d30f5b00c73166",
  name: "ПИ-124",
  instituteId: "iite",
  instituteName: "Институт информационных технологий и электроники",
  instituteShortName: "ИИТЭ",
  visualKey: "iite"
};

const SHORT_NAME_OVERRIDES: Array<[RegExp, string]> = [
  [/информационн.*технолог.*электроник/i, "ИИТЭ"],
  [/архитектур.*строитель/i, "ИАС"],
  [/машиностроен.*автомобиль/i, "ИМиАТ"],
  [/экономик.*туризм/i, "ИЭиТ"],
  [/педагогическ/i, "ПИ"],
  [/гуманитарн/i, "ГИ"],
  [/юридическ/i, "ЮИ"],
  [/искусств/i, "ИскИ"],
  [/физическ.*математ/i, "ФМИ"],
  [/биолог.*эколог/i, "БЭИ"]
];

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function instituteShortName(name: string) {
  const override = SHORT_NAME_OVERRIDES.find(([pattern]) => pattern.test(name));
  if (override) return override[1];

  const words = name
    .replace(/[()«»"']/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !/^(институт|филиал|имени|университет)$/i.test(word));
  const acronym = words.map((word) => word[0]).join("").toLocaleUpperCase("ru-RU");
  return acronym.slice(0, 5) || "ВлГУ";
}

export function instituteVisualKey(id: string, name: string) {
  return `institute-${stableHash(`${id}:${name}`) % 8}`;
}

export function toGroupProfile(institute: InstituteOption, group: GroupOption): GroupProfile {
  return {
    ...group,
    id: group.nrec,
    instituteId: institute.id,
    instituteName: institute.name,
    instituteShortName: institute.shortName,
    visualKey: institute.visualKey
  };
}

export function groupBadgeParts(name: string) {
  const [prefix, ...rest] = name.trim().split(/[-–—]/);
  return {
    prefix: (prefix || name).slice(0, 4),
    suffix: rest.join("-").slice(0, 5)
  };
}

export function isGroupProfile(value: unknown): value is GroupProfile {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<GroupProfile>;
  return typeof group.nrec === "string"
    && group.nrec.length > 0
    && typeof group.name === "string"
    && group.name.length > 0
    && typeof group.instituteId === "string"
    && typeof group.instituteName === "string"
    && typeof group.instituteShortName === "string"
    && typeof group.visualKey === "string";
}
