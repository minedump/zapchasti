# Запчасти — Система управления заявками

Telegram-бот для агрегации заявок на автозапчасти с интеграцией WeChat.

## Стек

- **Next.js 14+** (App Router) — фронтенд + бэкенд
- **Supabase (Self-Hosted)** — PostgreSQL + Realtime + Auth + Storage
- **grammY** — Telegram Bot
- **DeepSeek API** — ИИ-опросник и переводы
- **iLink Bot API** — интеграция с WeChat
- **Tailwind CSS** — стили

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

```bash
cp .env.local.example .env.local
# Заполните все переменные
```

### 3. Настройка Supabase

Применить миграции:
```bash
# Через Supabase CLI:
supabase db push

# Или вручную через Supabase Studio:
# Скопируйте содержимое supabase/migrations/*.sql
```

### 4. Настройка Telegram Webhook

```bash
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://your-app.timeweb.app/api/telegram/webhook", "secret_token": "your-secret"}'
```

### 5. Запуск

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000)

## Структура проекта

```
zapchasti-app/
├── app/
│   ├── (dashboard)/
│   │   ├── chats/          # Единое окно чатов
│   │   ├── deals/          # Управление сделками
│   │   └── admin/          # Администрирование
│   ├── api/
│   │   ├── telegram/       # Telegram webhook + отправка
│   │   ├── wechat/         # WeChat webhook + отправка + QR
│   │   ├── deals/          # CRUD сделок
│   │   ├── chats/          # Чаты и сообщения
│   │   └── admin/          # Шаблоны, ключи, поставщики
│   └── login/              # Страница входа
├── components/
│   ├── chats/              # Компоненты чатов
│   ├── deals/              # Компоненты сделок
│   └── layout/             # Сайдбар и layout
├── lib/
│   ├── supabase/           # Клиенты Supabase
│   ├── deepseek/           # DeepSeek API клиент
│   ├── ilink/              # iLink Bot API клиент
│   ├── telegram/           # Telegram Bot
│   ├── types/              # TypeScript типы
│   └── utils/              # Вспомогательные функции
└── supabase/
    └── migrations/         # SQL миграции
```

## Деплой на Timeweb App Platform

1. Подключите Git-репозиторий
2. Установите переменные окружения
3. Команда сборки: `npm run build`
4. Команда старта: `npm start`
5. Node.js версия: 18+

## Сценарии работы

### Клиент создаёт заявку
1. Пишет в Telegram-бота
2. ИИ (DeepSeek) проводит опросник
3. Заявка сохраняется в Supabase
4. Автоматически отправляется профильному поставщику в WeChat

### Поставщик отвечает
1. Отвечает в WeChat
2. Ответ перехватывается через iLink webhook
3. DeepSeek переводит на русский
4. Оператор видит ответ в реальном времени (Supabase Realtime)

### Оператор работает
1. Единое окно чатов (клиенты + поставщики)
2. Карточка сделки с историей переписки
3. Быстрые переходы между чатами и сделками
