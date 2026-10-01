/**
 * Путь к файлу из папки public.
 *
 * Vite переписывает пути только в index.html и в CSS. Строки в TypeScript он не
 * трогает, поэтому «/images/hero.jpg» на GitHub Pages уходил в корень домена и
 * возвращал 404: приложение живёт в подкаталоге /<repo>/.
 *
 * Именно так пропали фоновые картинки карточки дня и иконки уведомлений после
 * переезда на Pages. Все обращения к файлам должны идти через эту функцию.
 */
export function assetUrl(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
