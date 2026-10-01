/**
 * Опознавательные знаки институтов ВлГУ.
 *
 * Институтов четырнадцать, они меняются раз в несколько лет — это тот случай,
 * когда таблица лучше алгоритма. Раньше сокращение выводилось из названия
 * регулярками, а цвет брался как хэш от «id + название» по модулю восьми. Отсюда
 * две беды:
 *
 *  - «Юридический институт» и «Отделение среднего профессионального
 *    юридического образования» получали одинаковое сокращение ЮИ;
 *  - восемь палитр на четырнадцать институтов означали неизбежные совпадения
 *    цветов, а переименование института в ВлГУ меняло ему цвет.
 *
 * Ключ таблицы — идентификатор института в API ВлГУ. Он не зависит ни от
 * названия, ни от порядка ответа, поэтому знак у института один и тот же на
 * любом устройстве и после любого переименования.
 */

export interface InstituteVisual {
  shortName: string;
  /** Номер палитры; соответствует правилам .institute-badge[data-visual$="-N"]. */
  palette: number;
}

/** Сколько палитр описано в styles.css. */
export const INSTITUTE_PALETTE_COUNT = 14;

export const INSTITUTE_VISUALS: Record<string, InstituteVisual> = {
  "5b42fa53ec1dd1892e5ec44a3a60a896": { shortName: "ИИТЭ", palette: 1 },
  "b175b4e482d0e83192900749ffba202c": { shortName: "ИАС", palette: 2 },
  "e455d212af0d8b23a5f59d8503a25cea": { shortName: "ПИ", palette: 3 },
  "609e94758b29a9afb7601e705cea3ef2": { shortName: "ИЭиТ", palette: 4 },
  "e2a90a589caddac150dc4132c2ba9de1": { shortName: "КИТП", palette: 5 },
  "c392dfd5d828f01180bc2799fda3d96b": { shortName: "ИМиАТ", palette: 6 },
  "c22ac11fe7a7799355b1b90ba6957321": { shortName: "ГИ", palette: 7 },
  "928b59357e2f04b381282fe605b710da": { shortName: "ЮИ", palette: 8 },
  "3aa45892eed92ef3363e57ef2f246bb0": { shortName: "ЕН", palette: 9 },
  "7e8eafead3a2aa6b73597950f8205ce0": { shortName: "ФКСХ", palette: 10 },
  "e2c34e62a71e71365623ce63a95ff8a0": { shortName: "ЦМО", palette: 11 },
  "1d64876a8b7fee4092550670efa5932d": { shortName: "ВШМТ", palette: 12 },
  // Юридическое отделение СПО — отдельное подразделение, и сокращение у него
  // обязано отличаться от «ЮИ», иначе в списке два одинаковых значка.
  "609b83fedc195773ca9be66470184b98": { shortName: "СПО-Ю", palette: 13 },
  "48e5e47d2b643981c3dd502af02d8cfc": { shortName: "ОМС", palette: 14 }
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

/** Сокращение из названия — запасной путь для подразделения, которого нет в таблице. */
export function derivedShortName(name: string) {
  const words = name
    .replace(/[()«»"']/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !/^(институт|филиал|имени|университет|отдел|отделение)$/i.test(word));
  return words.map((word) => word[0]).join("").toLocaleUpperCase("ru-RU").slice(0, 5) || "ВлГУ";
}

export function instituteVisual(id: string, name: string): InstituteVisual {
  const known = INSTITUTE_VISUALS[id];
  if (known) return known;
  // ВлГУ может завести новое подразделение; оно получит устойчивый цвет от id,
  // а не от порядка в ответе, и попадёт в таблицу при следующей правке.
  return {
    shortName: derivedShortName(name),
    palette: (stableHash(id) % INSTITUTE_PALETTE_COUNT) + 1
  };
}

export function instituteVisualKey(id: string, name: string) {
  return `institute-${instituteVisual(id, name).palette}`;
}

export function instituteShortName(id: string, name: string) {
  return instituteVisual(id, name).shortName;
}
