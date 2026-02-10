# Исправление подключения к PostgreSQL

## Проблема

В логах видно:
```
Данные хранятся в: /app/data/products.json
```

Это означает, что **PostgreSQL НЕ подключен** и используется файловое хранилище.

## Решение

### Шаг 1: Проверьте переменные окружения в Railway

1. В Railway Dashboard откройте ваше **приложение** (не PostgreSQL)
2. Перейдите в **"Variables"**
3. Проверьте, есть ли переменная `DATABASE_URL`

### Шаг 2: Если DATABASE_URL НЕТ - добавьте его

1. В Variables нажмите **"+ New Variable"**
2. **Name:** `DATABASE_URL`
3. **Value:** Нажмите иконку **"Reference"** (или выберите из списка)
4. Выберите ваш **PostgreSQL сервис**
5. Выберите **`DATABASE_URL`** (НЕ `DATABASE_PUBLIC_URL`)
6. Нажмите **"Add"**

### Шаг 3: Перезапустите приложение

После добавления `DATABASE_URL`:
1. Railway автоматически перезапустит приложение
2. Или вручную: Settings → Redeploy

### Шаг 4: Проверьте логи

После перезапуска в логах должно быть:

**✅ Правильные логи (PostgreSQL подключен):**
```
Используется PostgreSQL через DATABASE_URL (внутренний)
Подключение к PostgreSQL установлено
Таблица products создана/проверена
✓ Таблица products существует в схеме public
База данных инициализирована успешно
Используется PostgreSQL
Сервер запущен на порту 8080
База данных: PostgreSQL
```

**❌ Неправильные логи (PostgreSQL НЕ подключен):**
```
DATABASE_URL не установлен, используется файловое хранилище
Сервер запущен на порту 8080
Данные хранятся в: /app/data/products.json
База данных: не настроена (установите DATABASE_URL)
```

### Шаг 5: Проверьте через health endpoint

Откройте: `https://your-app.railway.app/health`

**Должно показать:**
```json
{
  "status": "ok",
  "database": {
    "status": "connected",
    "tableCount": 0,
    "hasDatabaseUrl": true
  }
}
```

**Если показывает:**
```json
{
  "status": "ok",
  "database": {
    "status": "not_configured",
    "hasDatabaseUrl": false
  }
}
```

Значит `DATABASE_URL` все еще не установлен.

## Если DATABASE_URL установлен, но не работает

### Проверьте формат URL

`DATABASE_URL` должен выглядеть так:
```
postgresql://user:password@host:port/database
```

### Проверьте подключение к PostgreSQL

1. Откройте PostgreSQL сервис в Railway
2. Проверьте, что он запущен
3. Проверьте Variables PostgreSQL сервиса - должен быть `DATABASE_URL`

### Проверьте логи на ошибки

Ищите в логах:
- `"Ошибка инициализации БД"`
- `"connection refused"`
- `"authentication failed"`
- `"database does not exist"`

## После исправления

Когда PostgreSQL подключится:
1. ✅ Таблица `products` создастся автоматически
2. ✅ Данные будут храниться в PostgreSQL
3. ✅ Можно добавлять товары через интерфейс

## Важно

- `DATABASE_URL` должен быть в **вашем приложении**, а не только в PostgreSQL сервисе
- Используйте `DATABASE_URL` (внутренний), а не `DATABASE_PUBLIC_URL`
- После добавления переменной Railway автоматически перезапустит приложение

