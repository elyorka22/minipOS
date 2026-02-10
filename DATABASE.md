# Настройка PostgreSQL

## Локальная разработка

### 1. Установка PostgreSQL

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Linux:**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Скачайте и установите с [официального сайта](https://www.postgresql.org/download/windows/)

### 2. Создание базы данных

```bash
# Войти в PostgreSQL
psql postgres

# Создать базу данных
CREATE DATABASE elpos;

# Создать пользователя (опционально)
CREATE USER elpos_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE elpos TO elpos_user;

# Выйти
\q
```

### 3. Установка переменной окружения

```bash
# macOS/Linux
export DATABASE_URL="postgresql://elpos_user:your_password@localhost:5432/elpos"

# Windows (PowerShell)
$env:DATABASE_URL="postgresql://elpos_user:your_password@localhost:5432/elpos"
```

Или создайте файл `.env`:
```
DATABASE_URL=postgresql://elpos_user:your_password@localhost:5432/elpos
```

### 4. Запуск приложения

```bash
npm install
npm start
```

Приложение автоматически создаст таблицу `products` при первом запуске.

## Деплой на Railway

### Шаг 1: Добавить PostgreSQL сервис

1. В Railway Dashboard нажмите "+ New" → "Database" → "Add PostgreSQL"
2. Railway автоматически создаст PostgreSQL сервис

### Шаг 2: Подключить к приложению

**Важно:** Railway может автоматически добавить `DATABASE_URL`, но это не всегда происходит!

1. В настройках вашего **приложения** (не PostgreSQL) нажмите "Variables"
2. Проверьте, есть ли переменная `DATABASE_URL`
3. **Если НЕТ** - добавьте вручную:
   - Нажмите "+ New Variable"
   - В поле "Name" введите: `DATABASE_URL`
   - В поле "Value" нажмите иконку "Reference" (или выберите из списка)
   - Выберите ваш PostgreSQL сервис
   - Выберите `DATABASE_URL` из списка переменных PostgreSQL
   - Нажмите "Add"

**Подробная инструкция в [RAILWAY_POSTGRES_SETUP.md](./RAILWAY_POSTGRES_SETUP.md)**

### Шаг 3: Деплой

После добавления `DATABASE_URL` Railway автоматически перезапустит приложение. Таблица создастся автоматически при первом запуске.

## Структура таблицы

```sql
CREATE TABLE products (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    barcode VARCHAR(255) UNIQUE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_barcode ON products(barcode);
```

## Проверка работы

### Локально:

```bash
# Проверить подключение
psql $DATABASE_URL -c "SELECT COUNT(*) FROM products;"
```

### В Railway:

1. Откройте логи приложения
2. Должно быть сообщение: "База данных инициализирована"
3. Проверьте health endpoint: `https://your-app.railway.app/health`
   - Должно вернуть: `{"status":"ok","database":"connected"}`

## Миграция данных из JSON

Если у вас уже есть данные в `data/products.json`, можно импортировать их:

```javascript
// migrate.js
const fs = require('fs');
const db = require('./database');

async function migrate() {
    await db.initDatabase();
    
    const data = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
    
    for (const product of data) {
        try {
            await db.createProduct(product);
            console.log(`Импортирован: ${product.name}`);
        } catch (error) {
            console.error(`Ошибка импорта ${product.name}:`, error.message);
        }
    }
    
    console.log('Миграция завершена');
    process.exit(0);
}

migrate();
```

Запуск:
```bash
node migrate.js
```

## Troubleshooting

### Ошибка подключения

- Проверьте, что PostgreSQL запущен: `pg_isready`
- Проверьте правильность `DATABASE_URL`
- Убедитесь, что база данных существует

### Ошибка SSL

Railway требует SSL подключение. Код уже настроен на это:
```javascript
ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
```

### Таблица не создается

- Проверьте права пользователя БД
- Проверьте логи приложения на ошибки
- Убедитесь, что `DATABASE_URL` установлен

