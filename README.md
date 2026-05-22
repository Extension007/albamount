# exto-project

E-commerce каталог на Express, EJS и PostgreSQL (Sequelize).

## Требования

- Node.js 22+
- PostgreSQL (например [Neon](https://neon.tech))

## Быстрый старт

```bash
cp .env.example .env
# Заполните DATABASE_URL, SESSION_SECRET, JWT_SECRET (≥32 символов для production)

npm install
npm run dev
```

Приложение: http://localhost:3000

## Переменные окружения

См. [.env.example](.env.example).

| Переменная | Описание |
|------------|----------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Секрет сессий (≥32 в production) |
| `JWT_SECRET` | Секрет JWT (≥32 в production) |
| `CLOUDINARY_*` | Опционально — загрузка изображений |
| `EMAIL_VERIFICATION_ENABLED` | `true` для подтверждения email |

## Скрипты

| Команда | Действие |
|---------|----------|
| `npm start` | Запуск сервера |
| `npm run dev` | Nodemon |
| `npm run db:sync` | Синхронизация схемы Sequelize |
| `npm run admin:create` | Создание admin-пользователя |

## Деплой на Vercel

- Установите `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET`
- Socket.IO недоступен (serverless); авторизация через cookie `exto_token`
- `VERCEL=1` выставляется автоматически

## Структура

- `config/` — приложение, БД, безопасность
- `routes/` — HTTP-маршруты
- `controllers/` — обработчики
- `services/` — бизнес-логика
- `models/` — Sequelize-модели
- `views/` — EJS-шаблоны
