# Получение API-ключей — пошаговая инструкция

В этом файле описано, как получить каждый ключ из `.env.local`.

---

## Содержание

1. [Supabase (Self-Hosted)](#1-supabase-self-hosted)
2. [Telegram Bot Token](#2-telegram-bot-token)
3. [Telegram Webhook Secret](#3-telegram-webhook-secret)
4. [DeepSeek API Key](#4-deepseek-api-key)
5. [iLink Bot API (WeChat)](#5-ilink-bot-api-wechat)
6. [App URL](#6-app-url)
7. [Итоговый .env.local](#7-итоговый-envlocal)

---

## 1. Supabase (Self-Hosted)

Нужны три переменные:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Вариант A — Self-Hosted (рекомендуется по ТЗ)

**Шаг 1.** Установите Docker и Docker Compose на сервер.

**Шаг 2.** Клонируйте официальный репозиторий Supabase:
```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
```

**Шаг 3.** Скопируйте и заполните конфиг:
```bash
cp .env.example .env
nano .env
```
Обязательно задайте:
- `POSTGRES_PASSWORD` — пароль для PostgreSQL (придумайте сами)
- `JWT_SECRET` — случайная строка 32+ символа (можно сгенерировать: `openssl rand -base64 32`)
- `ANON_KEY` и `SERVICE_ROLE_KEY` — генерируются автоматически из JWT_SECRET

**Шаг 4.** Запустите:
```bash
docker compose up -d
```

**Шаг 5.** Откройте Supabase Studio: `http://ВАШ_СЕРВЕР:3000`

**Шаг 6.** Перейдите в **Settings → API**. Там будут:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ `SERVICE_ROLE_KEY` даёт полный доступ к БД в обход RLS. Никогда не публикуйте его и не используйте на фронтенде.

### Вариант B — Supabase Cloud (для быстрого старта)

**Шаг 1.** Зайдите на https://supabase.com и создайте аккаунт.

**Шаг 2.** Нажмите **New Project**, выберите регион, придумайте пароль БД.

**Шаг 3.** После создания проекта перейдите в **Settings → API**:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY`

### Применение миграций

После получения ключей примените схему БД. Откройте **Supabase Studio → SQL Editor** и выполните содержимое файлов по порядку:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_seed_data.sql`

---

## 2. Telegram Bot Token

```
TELEGRAM_BOT_TOKEN=
```

**Шаг 1.** Откройте Telegram и найдите бота **@BotFather**.

**Шаг 2.** Отправьте команду:
```
/newbot
```

**Шаг 3.** BotFather спросит:
- **Имя бота** (отображаемое) — например: `Запчасти Авто`
- **Username бота** (уникальный, заканчивается на `bot`) — например: `zapchasti_parts_bot`

**Шаг 4.** BotFather выдаст токен вида:
```
7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
```
Это и есть `TELEGRAM_BOT_TOKEN`.

**Шаг 5.** После деплоя зарегистрируйте Webhook:
```bash
curl -X POST https://api.telegram.org/bot<ВАШ_ТОКЕН>/setWebhook \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://ВАШ_ДОМЕН/api/telegram/webhook", "secret_token": "ВАШ_WEBHOOK_SECRET"}'
```

---

## 3. Telegram Webhook Secret

```
TELEGRAM_WEBHOOK_SECRET=
```

Это произвольная строка, которую вы придумываете сами. Она защищает webhook от поддельных запросов.

**Сгенерируйте случайную строку:**
```bash
# В терминале (Linux/Mac):
openssl rand -hex 32

# Или в PowerShell:
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Пример результата: `a3f8c2d1e4b5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1`

Эту же строку укажите в команде `setWebhook` выше (параметр `secret_token`).

---

## 4. DeepSeek API Key

```
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

**Шаг 1.** Зайдите на https://platform.deepseek.com

**Шаг 2.** Зарегистрируйтесь или войдите в аккаунт.

**Шаг 3.** Перейдите в раздел **API Keys** (левое меню).

**Шаг 4.** Нажмите **Create new API key**, дайте название (например, `zapchasti-prod`).

**Шаг 5.** Скопируйте ключ вида:
```
sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
Это `DEEPSEEK_API_KEY`.

> `DEEPSEEK_BASE_URL` оставьте как есть: `https://api.deepseek.com`

**Пополнение баланса:** раздел **Billing** на том же сайте. Для старта достаточно $5–10.

---

## 5. iLink Bot API (WeChat)

```
ILINK_API_KEY=
ILINK_API_URL=https://api.ilink.dev
ILINK_WEBHOOK_SECRET=
```

**Шаг 1.** Зайдите на https://wechatbot.dev (официальный сайт iLink Bot API).

**Шаг 2.** Нажмите **Get Started** / **Sign Up**, создайте аккаунт.

**Шаг 3.** После входа перейдите в **Dashboard → API Keys**.

**Шаг 4.** Нажмите **Generate API Key**. Скопируйте ключ — это `ILINK_API_KEY`.

**Шаг 5.** Перейдите в **Dashboard → Webhooks**:
- Укажите URL: `https://ВАШ_ДОМЕН/api/wechat/webhook`
- Система выдаст **Webhook Secret** — это `ILINK_WEBHOOK_SECRET`

**Шаг 6.** `ILINK_API_URL` оставьте как есть: `https://api.ilink.dev`

**Подключение поставщика WeChat:**
После настройки ключей зайдите в веб-админку → **Администрирование → Поставщики → Добавить поставщика**. Система сгенерирует QR-код, который поставщик сканирует в WeChat.

---

## 6. App URL

```
NEXT_PUBLIC_APP_URL=
```

Это публичный URL вашего задеплоенного приложения.

- **Локально:** `http://localhost:3000`
- **Timeweb App Platform:** `https://ваш-проект.timeweb.app` (выдаётся автоматически после деплоя)
- **Свой домен:** `https://zapchasti.yourdomain.com`

---

## 7. Итоговый .env.local

После получения всех ключей ваш `.env.local` должен выглядеть так:

```env
# Supabase (Self-Hosted)
NEXT_PUBLIC_SUPABASE_URL=https://supabase.ваш-сервер.ru
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Telegram
TELEGRAM_BOT_TOKEN=7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
TELEGRAM_WEBHOOK_SECRET=a3f8c2d1e4b5f6a7b8c9d0e1f2a3b4c5

# DeepSeek
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com

# iLink Bot API (WeChat)
ILINK_API_KEY=ilink_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ILINK_API_URL=https://api.ilink.dev
ILINK_WEBHOOK_SECRET=b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9

# App
NEXT_PUBLIC_APP_URL=https://zapchasti.timeweb.app
```

---

## Чеклист перед запуском

- [ ] Supabase запущен и доступен по URL
- [ ] Миграции применены (`001_initial_schema.sql`, `002_seed_data.sql`)
- [ ] Telegram бот создан через @BotFather
- [ ] Webhook зарегистрирован через `setWebhook`
- [ ] DeepSeek аккаунт пополнен
- [ ] iLink аккаунт создан, webhook настроен
- [ ] `.env.local` заполнен реальными значениями
- [ ] Приложение задеплоено на Timeweb
- [ ] Первый поставщик подключён через QR в админке
- [ ] Первый оператор создан через Supabase Studio → Authentication → Users

---

## Создание первого оператора

После деплоя создайте аккаунт оператора/администратора:

**Шаг 1.** Откройте Supabase Studio → **Authentication → Users → Invite user**.

**Шаг 2.** Введите email оператора, нажмите **Send invitation**.

**Шаг 3.** Оператор получит письмо со ссылкой для установки пароля.

**Шаг 4.** После входа в систему вручную обновите роль в таблице `users`:
```sql
UPDATE public.users
SET role = 'admin'
WHERE id = 'UUID_ПОЛЬЗОВАТЕЛЯ';
```
(UUID можно найти в Supabase Studio → Authentication → Users)
