# Лад · ПИ-124

Mobile-first PWA для расписания ПИ-124, ИИТЭ, ВлГУ и личных умных записей.

## Возможности

- живое расписание ВлГУ с cache-first запуском и offline reload;
- экраны «Сегодня», «Неделя», «Записи» и «Настройки»;
- четыре оформления: Signal Room, Obsidian, Porcelain и Field Notes;
- локальная классификация записей по контексту, автоматические разделы и привязка ДЗ к предметам;
- опциональное уточнение классификации через Cloudflare Workers AI;
- локальные напоминания, PWA manifest и service worker;
- экспорт и импорт резервной копии записей.

## Локальный запуск

```bash
npm install
npm run dev
```

Приложение откроется на `http://127.0.0.1:5173/`.

## Cloudflare Workers

Рекомендуемый вариант деплоя, потому что он поддерживает и прокси ВлГУ, и Workers AI:

```bash
npm run build
npx wrangler deploy
```

`wrangler.jsonc` публикует `dist`, направляет `/vlsu-api/*` и `/app-api/*` через `src/worker.ts`, а также подключает binding `AI`.

## Cloudflare Pages

Pages остаётся совместимым вариантом для расписания:

```text
Build command: npm run build
Build output directory: dist
```

`functions/vlsu-api/[[path]].ts` проксирует API ВлГУ. Локальная сортировка записей продолжит работать, но облачное AI-уточнение требует Worker route `/app-api/classify`.

## Данные и приватность

Записи хранятся в IndexedDB текущего устройства. Cloudflare AI выключен по умолчанию и включается отдельно в настройках; локальная классификация доступна всегда. Для переноса между устройствами используйте экспорт и импорт JSON-копии.
