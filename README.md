# ПИ-124 Schedule PWA

Мобильная PWA для личного расписания группы ПИ-124, ИИТЭ, ВлГУ.

## Local

```bash
npm install
npm run dev
```

## Cloudflare Pages

Build command:

```bash
npm run build
```

Build output directory:

```text
dist
```

Проект использует Pages Function `functions/vlsu-api/[[path]].ts` как прокси к API ВлГУ.

Для Cloudflare Pages через GitHub не нужен `wrangler.jsonc`.
