# Диагностика проблемы с PostgreSQL

## Проблема: товары добавляются, но таблицы не видны в Railway PostgreSQL

### Шаг 1: Проверьте логи приложения

В Railway Dashboard:
1. Откройте ваш сервис
2. Перейдите в "Deployments" → выберите последний деплой
3. Откройте "View Logs"

Ищите сообщения:
- `"Используется PostgreSQL"` - БД подключена
- `"База данных инициализирована успешно"` - таблицы созданы
- `"✓ Таблица products существует в схеме public"` - таблица найдена

### Шаг 2: Проверьте health endpoint

Откройте в браузере:
```
https://your-app.railway.app/health
```

Должно вернуть:
```json
{
  "status": "ok",
  "database": {
    "status": "connected",
    "tableCount": 1,
    "hasDatabaseUrl": true
  }
}
```

### Шаг 3: Проверьте диагностический endpoint

Откройте:
```
https://your-app.railway.app/api/debug/db
```

Это покажет:
- Все таблицы в схеме public
- Количество товаров
- Структуру таблицы products
- Статус DATABASE_URL

### Шаг 4: Проверьте DATABASE_URL

В Railway:
1. Откройте ваш сервис
2. Перейдите в "Variables"
3. Убедитесь, что `DATABASE_URL` установлен
4. Проверьте, что он ссылается на правильный PostgreSQL сервис

### Шаг 5: Проверьте PostgreSQL в Railway

1. Откройте PostgreSQL сервис в Railway
2. Перейдите в "Data" или "Query"
3. Выполните запрос:

```sql
-- Показать все таблицы
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Показать товары
SELECT * FROM products;

-- Показать количество товаров
SELECT COUNT(*) FROM products;
```

### Возможные проблемы:

#### 1. Таблицы в другой схеме
Если таблицы не видны, проверьте все схемы:
```sql
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_name = 'products';
```

#### 2. DATABASE_URL указывает на другую БД
Проверьте, что `DATABASE_URL` в приложении совпадает с URL PostgreSQL сервиса.

#### 3. Права доступа
Убедитесь, что пользователь БД имеет права на создание таблиц в схеме public.

#### 4. Таблицы создаются, но данные не сохраняются
Проверьте логи при создании товара - должны быть сообщения об успешном сохранении.

### Быстрое решение:

Если таблицы не создаются автоматически, создайте их вручную:

```sql
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

