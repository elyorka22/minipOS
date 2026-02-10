# Создание таблицы вручную в Railway

## Пошаговая инструкция

### Шаг 1: Откройте PostgreSQL в Railway

1. Зайдите на [Railway Dashboard](https://railway.app)
2. Откройте ваш проект
3. Найдите и откройте **PostgreSQL сервис** (иконка базы данных)

### Шаг 2: Откройте Query/Data

В PostgreSQL сервисе найдите вкладку:
- **"Query"** или
- **"Data"** или  
- **"SQL Editor"**

### Шаг 3: Скопируйте и выполните SQL

Скопируйте **весь** этот код и вставьте в Query:

```sql
SET search_path TO public;

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    barcode VARCHAR(255) UNIQUE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
```

### Шаг 4: Выполните запрос

1. Нажмите кнопку **"Run"** или **"Execute"** или **"▶"**
2. Должно появиться сообщение об успехе (например: "Success" или "Query executed successfully")

### Шаг 5: Проверьте создание

Выполните этот запрос для проверки:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'products';
```

**Должно вернуть:**
```
table_name
-----------
products
```

### Шаг 6: Проверьте структуру таблицы

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;
```

**Должно показать 6 колонок:**
- id
- name
- barcode
- quantity
- created_at
- updated_at

## Если нет кнопки Query/Data

Если в Railway нет интерфейса Query, используйте альтернативные способы:

### Вариант A: Через Railway CLI

1. Установите Railway CLI:
```bash
npm i -g @railway/cli
```

2. Войдите:
```bash
railway login
```

3. Подключитесь к проекту:
```bash
railway link
```

4. Получите DATABASE_URL:
```bash
railway variables
```

5. Подключитесь через psql:
```bash
psql $DATABASE_URL -f create-tables.sql
```

### Вариант B: Через внешний клиент

1. Получите `DATABASE_PUBLIC_URL` из Railway Variables
2. Используйте любой PostgreSQL клиент (pgAdmin, DBeaver, TablePlus)
3. Подключитесь используя `DATABASE_PUBLIC_URL`
4. Выполните SQL из `create-tables.sql`

## Проверка через приложение

После создания таблицы проверьте:

1. **Health endpoint:**
   ```
   https://your-app.railway.app/health
   ```
   Должно показать: `"database": { "status": "connected", "tableCount": 0 }`

2. **Диагностика:**
   ```
   https://your-app.railway.app/api/debug/db
   ```
   Должно показать: `"tables": ["products"]`

3. **Попробуйте добавить товар** через интерфейс приложения

## Если все еще не работает

### Проверьте права доступа

Выполните в Query:
```sql
-- Проверить текущего пользователя
SELECT current_user, current_database();

-- Проверить права на схему public
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public';
```

### Проверьте, в какой схеме создается таблица

```sql
-- Показать все таблицы во всех схемах
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_name = 'products';
```

Если таблица в другой схеме, используйте:
```sql
SET search_path TO 'название_схемы';
```

## Готово!

После создания таблицы:
- ✅ Таблица `products` будет готова к использованию
- ✅ Можно добавлять товары через интерфейс
- ✅ Данные будут сохраняться в PostgreSQL

