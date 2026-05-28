# Герыч Alter

Telegram-бот с характером: дружелюбный, дерзковатый AI-ассистент для кода, идей, объяснений и личной помощи.

Бот написан на чистом Node.js без npm-зависимостей: достаточно Node 18+.

## Быстрый запуск

1. Создай бота в Telegram через [@BotFather](https://t.me/BotFather) и получи token.
2. Создай `gerych-alter-bot/.env.local`:

```env
TELEGRAM_BOT_TOKEN=твой_telegram_token
OPENAI_API_KEY=уже_есть_в_корневом_.env.local_или_вставь_сюда
OPENAI_MODEL=gpt-4.1-mini
BOT_ALLOWED_USER_IDS=
BOT_MEMORY_LIMIT=18
```

Если `OPENAI_API_KEY` лежит в родительском `.env.local`, бот подхватит его автоматически.

3. Запусти:

```bash
npm start
```

Если `npm` недоступен, можно напрямую:

```bash
node src/index.js
```

## Команды

- `/start` — знакомство и краткая инструкция.
- `/help` — что умеет бот.
- `/reset` — очистить память текущего чата.
- `/mode` — показать текущий стиль.
- `/ping` — проверить, жив ли бот.

## Доступ

Если `BOT_ALLOWED_USER_IDS` пустой, бот отвечает всем. Для приватного режима укажи Telegram user id через запятую:

```env
BOT_ALLOWED_USER_IDS=123456789,987654321
```
