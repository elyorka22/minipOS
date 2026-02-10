# Создание таблиц в PostgreSQL

## Способ 1: Через Railway Query (Самый простой) ⭐

1. В Railway Dashboard откройте ваш **PostgreSQL сервис**
2. Перейдите в **"Data"** или **"Query"**
3. Скопируйте и выполните этот SQL:

```sql
-- Убедимся, что используем схему public
SET search_path TO public;

-- Создать таблицу products
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    barcode VARCHAR(255) UNIQUE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создать индекс для быстрого поиска по штрих-коду
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
```

4. Нажмите **"Run"** или **"Execute"**
5. Проверьте, что таблица создана:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'products';
```

Должно вернуть строку с `products`.

## Способ 2: Перезапустить приложение

Если таблицы должны создаваться автоматически, но не создались:

1. В Railway Dashboard откройте ваше **приложение**
2. Перейдите в **"Settings"**
3. Нажмите **"Redeploy"** или **"Restart"**
4. Проверьте логи - должно быть:
   - `"Таблица products создана/проверена"`
   - `"✓ Таблица products существует в схеме public"`

## Способ 3: Через psql (локально)

Если у вас есть доступ к DATABASE_URL:

```bash
# Установите DATABASE_URL
export DATABASE_URL="postgresql://user:password@host:port/database"

# Подключитесь к БД
psql $DATABASE_URL

# Выполните SQL
\i create-tables.sql

# Или скопируйте SQL из create-tables.sql и выполните вручную
```

## Способ 4: Через Node.js скрипт

1. Установите переменную окружения:
```bash
export DATABASE_URL="your-database-url"
```

2. Запустите скрипт:
```bash
node create-tables.js
```

## Проверка после создания

### 1. Через Railway Query

```sql
-- Показать все таблицы
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Показать структуру таблицы products
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;

-- Показать количество товаров (должно быть 0)
SELECT COUNT(*) FROM products;
```

### 2. Через приложение

Откройте в браузере:
```
https://your-app.railway.app/api/debug/db
```

Должно показать:
```json
{
  "initialized": true,
  "tables": ["products"],
  "productsCount": 0,
  "productsColumns": [...]
}
```

### 3. Через health endpoint

```
https://your-app.railway.app/health
```

Должно показать:
```json
{
  "status": "ok",
  "database": {
    "status": "connected",
    "tableCount": 0
  }
}
```

## Если таблицы все еще не создаются

### Проверьте права доступа

Убедитесь, что пользователь БД имеет права на создание таблиц:

```sql
-- Проверить текущего пользователя
SELECT current_user;

-- Проверить права
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public';
```

### Проверьте схему

Возможно, таблицы создаются в другой схеме:

```sql
-- Показать все схемы
SELECT schema_name FROM information_schema.schemata;

-- Показать таблицы во всех схемах
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_name = 'products';
```

### Проверьте логи приложения

В Railway Dashboard → ваше приложение → Deployments → View Logs

Ищите ошибки:
- `"Ошибка инициализации БД"`
- `"permission denied"`
- `"relation already exists"`

## Быстрое решение

**Самый простой способ:** Используйте Способ 1 (Railway Query) - это займет 30 секунд!

