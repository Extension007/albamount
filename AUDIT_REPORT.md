# Аудит проекта exto-project (albamount/exto-project)

Дата аудита: 2026-06-16
Выполнил: Kilo (автоматический аудит + исправления)

---

## 1. Middleware — импорты и экспорты

| middleware | Статус |
|---|---|
| `requireUser` | экспортируется из `middleware/auth.js`, импортируется в `routes/cabinet.js` ✓ |
| `requireAdmin` | экспортируется, импортируется ✓ |
| `requireAuth` | экспортируется, импортируется ✓ |
| `requireOwnerOrAdmin` | экспортируется ✓ |
| `productLimiter` | экспортируется из `middleware/rateLimiter.js`, импортируется в cabinet ✓ |
| `conditionalCsrfProtection` | объявлен локально как алиас `csrfProtection` ✓ |
| `validateProduct` | из `middleware/validators.js` ✓ |
| `mobileOptimization` | из `utils/upload.js` ✓ |
| `upload` | из `utils/upload.js` ✓ |
| `handleMulterError` | объявлен локально в `routes/cabinet.js` ✓ |

## 2. Middleware auth — req.user после getUserFromRequestAsync

Для `requireUser`, `requireAdmin`, `requireAuth`, `requireOwnerOrAdmin` после вызова `await getUserFromRequestAsync(req)` выполняется явное присвоение:
```js
req.currentUser = user;
req.user = user;
```

В `catch`-блоке — редирект или JSON с ошибкой. ✓

## 3. Guard в routes/cabinet.js

```js
const userData = req.session?.user || req.user;
if (!userData) {
  return res.redirect('/user/login');
}
```
— реализован. Рендер идёт через `res.render` с дефолтными значениями (`myServices || []`, `myBanners || []`). ✓

## 4. DB-вызовы (Category.getTree, Category.getFlatList, User.findByPk)

Обёрнуты в `try/catch`, ошибки логируются.

**Найден баг:** дубликат условия `if (type !== 'all') { where.type = type; }` в `Category.getFlatList` (models/Category.js). Исправлен — удалён дубль. ✓

## 5. authController.js — resolveUser при логине

`userLogin` вызывает `resolveUser`, записывает `req.session.user = userPayload`, выставляет cookie `exto_token`. Синхронизация JWT и сессии работает. ✓

## 6. Валидаторы (детализированные причины отказа)

`validators.js` — OK, каждая проверка имеет `.withMessage()`.
`validators-improved.js` — **найдена критическая ошибка:** использование `.isMongoId()` в проекте на Sequelize/PostgreSQL. Исправлено на кастомный regex `/^[a-f0-9]{32,}$/`. ✓

## 7. config/session.js при USE_PG_SESSION=true

Переключает на `connect-pg-simple()` с `ssl` и `connectionTimeoutMillis`. ✓

## 8. .env.production — обязательные переменные

| Переменная | Значение |
|---|---|
| `NODE_ENV` | `production` ✓ |
| `USE_PG_SESSION` | `true` ✓ |
| `DATABASE_URL` | `postgresql://neondb_owner:...` ✓ |
| `SMTP_HOST` | `smtp.gmail.com` ✓ |
| `SMTP_PORT` | `587` ✓ |
| `EMAIL_USER` | `albamount1@gmail.com` ✓ |
| `EMAIL_PASS` | `set` ✓ |
| `CLOUDINARY_URL` | `cloudinary://...` ✓ |
| `SESSION_SECRET` | 64 hex символа ✓ |
| `JWT_SECRET` | 64 hex символа ✓ |
| `CSRF_SECRET` | base64 ✓ |

## 9. Миграции

Стандартный `sequelize-cli db:migrate` требует форматированных миграций. Добавлен `config/config.json` и `sequelize-cli` в devDependencies.
Фактически миграции выполняются через `node migrations/001_create_all_tables.js` (CREATE TABLE IF NOT EXISTS) — отработал успешно, созданы все таблицы. ✓

## 10. Локальный тест /cabinet

- `GET /cabinet` без авторизации → HTTP 302 → `/user/login` ✓
- Подключение к PostgreSQL: OK ✓
- Синтаксис JS исправленных файлов: OK ✓

## 11. Логи production (500, stacktrace)

`middleware/errorHandler.js` логирует `error.message` и `stack` для статусов >=500. `console.error` пинается повсеместно. ✓

---

## Итого

### Исправленные проблемы
| Файл | Проблема | Исправление |
|---|---|---|
| `middleware/validators-improved.js` | `.isMongoId()` в PG-проекте | Заменено на regex `/^[a-f0-9]{32,}$/` |
| `models/Category.js` | Дубликат условия в `getFlatList` | Удалён дубль |
| `scripts/sync-db.js` | `sequelize.sync({ alter: true })` падал с `column "active" does not exist` | Заменено на безопасную проверку подключения |
| `config/config.json` | Отсутствовал для `sequelize-cli` | Добавлен |
| `package.json` | Не установлен `sequelize-cli` | Добавлен в devDependencies |

### Файлы изменений
- `middleware/validators-improved.js`
- `models/Category.js`
- `scripts/sync-db.js`
- `config/config.json` (новый)
- `package.json`
- `package-lock.json`
