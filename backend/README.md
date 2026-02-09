# Backend - Учет товаров

Backend API для приложения учета товаров.

## Технологии

- Node.js + Express
- PostgreSQL (через pg)
- Railway для деплоя

## Локальная разработка

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка базы данных

Создайте файл `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/elpos
PORT=3000
NODE_ENV=development
```

### 3. Создание базы данных PostgreSQL

```bash
# Установите PostgreSQL локально или используйте Docker
docker run --name elpos-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=elpos -p 5432:5432 -d postgres
```

### 4. Запуск

```bash
npm start
# или для разработки с автоперезагрузкой
npm run dev
```

Сервер запустится на `http://localhost:3000`

## API Endpoints

- `GET /api/products` - Получить все товары
- `GET /api/products/barcode/:barcode` - Получить товар по штрих-коду
- `POST /api/products/sell/:barcode` - Продать товар (уменьшить на 1)
- `POST /api/products` - Добавить новый товар
- `POST /api/products/receive/:barcode` - Принять товар (увеличить количество)
- `GET /health` - Health check

## Деплой на Railway

См. [DEPLOY.md](../DEPLOY.md) для подробных инструкций.

