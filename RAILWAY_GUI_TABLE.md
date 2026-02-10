# Создание таблицы через GUI в Railway

## Пошаговая инструкция

### Шаг 1: Откройте PostgreSQL в Railway

1. Зайдите на [Railway Dashboard](https://railway.app)
2. Откройте ваш проект
3. Найдите и откройте **PostgreSQL сервис**

### Шаг 2: Найдите интерфейс создания таблиц

В PostgreSQL сервисе найдите:
- **"Tables"** или
- **"Create Table"** или
- **"Add Table"** или
- Кнопку **"+"** рядом с таблицами

### Шаг 3: Создайте таблицу `products`

Заполните форму создания таблицы:

#### Основная информация:
- **Table Name:** `products`
- **Schema:** `public` (или оставьте по умолчанию)

#### Колонки (Columns):

Добавьте следующие колонки по порядку:

**1. Колонка `id`:**
- **Name:** `id`
- **Type:** `VARCHAR` или `TEXT` или `CHARACTER VARYING`
- **Length:** `255` (если есть поле для длины)
- **Primary Key:** ✅ Отметьте галочкой
- **Not Null:** ✅ Отметьте галочкой
- **Unique:** ✅ Отметьте галочкой (опционально, так как это Primary Key)

**2. Колонка `name`:**
- **Name:** `name`
- **Type:** `VARCHAR` или `TEXT`
- **Length:** `255`
- **Not Null:** ✅ Отметьте галочкой

**3. Колонка `barcode`:**
- **Name:** `barcode`
- **Type:** `VARCHAR` или `TEXT`
- **Length:** `255`
- **Not Null:** ✅ Отметьте галочкой
- **Unique:** ✅ Отметьте галочкой (важно!)

**4. Колонка `quantity`:**
- **Name:** `quantity`
- **Type:** `INTEGER` или `INT`
- **Not Null:** ✅ Отметьте галочкой
- **Default Value:** `0`

**5. Колонка `created_at`:**
- **Name:** `created_at`
- **Type:** `TIMESTAMP` или `TIMESTAMP WITHOUT TIME ZONE`
- **Not Null:** ✅ Отметьте галочкой
- **Default Value:** `CURRENT_TIMESTAMP` или `now()`

**6. Колонка `updated_at`:**
- **Name:** `updated_at`
- **Type:** `TIMESTAMP` или `TIMESTAMP WITHOUT TIME ZONE`
- **Not Null:** ✅ Отметьте галочкой
- **Default Value:** `CURRENT_TIMESTAMP` или `now()`

### Шаг 4: Сохраните таблицу

Нажмите кнопку:
- **"Create"** или
- **"Save"** или
- **"Add Table"**

### Шаг 5: Создайте индекс (опционально, но рекомендуется)

После создания таблицы:

1. Найдите таблицу `products`
2. Откройте её
3. Найдите вкладку **"Indexes"** или **"Indices"**
4. Нажмите **"Add Index"** или **"Create Index"**
5. Заполните:
   - **Index Name:** `idx_products_barcode`
   - **Column:** `barcode`
   - **Type:** `B-tree` (обычно по умолчанию)
   - **Unique:** ✅ Отметьте (так как barcode уникальный)

## Альтернатива: Минимальная таблица

Если интерфейс сложный, создайте минимальную версию:

**Обязательные колонки:**
1. `id` - VARCHAR(255) - Primary Key, Not Null
2. `name` - VARCHAR(255) - Not Null
3. `barcode` - VARCHAR(255) - Not Null, Unique
4. `quantity` - INTEGER - Not Null, Default: 0

Остальные колонки (`created_at`, `updated_at`) можно добавить позже или пропустить.

## Проверка после создания

### Через GUI:
1. Откройте таблицу `products`
2. Должны быть видны все колонки
3. Попробуйте добавить тестовую строку через GUI

### Через приложение:
1. Откройте: `https://your-app.railway.app/api/debug/db`
2. Должно показать: `"tables": ["products"]`
3. Попробуйте добавить товар через интерфейс приложения

## Если что-то пошло не так

### Удалить и пересоздать:
1. Найдите таблицу `products` в списке
2. Нажмите на неё
3. Найдите кнопку **"Delete"** или **"Drop"**
4. Подтвердите удаление
5. Создайте заново по инструкции выше

### Проверить структуру:
1. Откройте таблицу `products`
2. Проверьте, что все колонки на месте
3. Проверьте, что `id` - Primary Key
4. Проверьте, что `barcode` - Unique

## Важные моменты

- ✅ `id` должен быть **Primary Key**
- ✅ `barcode` должен быть **Unique** (чтобы не было дубликатов)
- ✅ `quantity` должен иметь **Default: 0**
- ✅ Все поля кроме `quantity` должны быть **Not Null**

## Готово!

После создания таблицы:
- ✅ Можно добавлять товары через интерфейс приложения
- ✅ Данные будут сохраняться в PostgreSQL
- ✅ Приложение автоматически подключится к таблице

