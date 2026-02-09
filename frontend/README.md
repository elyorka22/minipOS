# Frontend - Учет товаров

Frontend PWA приложение для учета товаров.

## Технологии

- HTML + CSS + JavaScript (Vanilla JS)
- QuaggaJS для сканирования штрих-кодов
- PWA (Service Worker + Manifest)
- Vercel для деплоя

## Локальная разработка

### 1. Запуск локального сервера

Можно использовать любой статический сервер:

```bash
# Python
python -m http.server 8080

# Node.js (http-server)
npx http-server -p 8080

# PHP
php -S localhost:8080
```

Откройте `http://localhost:8080`

### 2. Настройка API URL

По умолчанию используется `http://localhost:3000` (локальный backend).

Для изменения URL отредактируйте `app.js`:

```javascript
const API_URL = 'http://your-backend-url:3000' + '/api';
```

## Деплой на Vercel

См. [DEPLOY.md](../DEPLOY.md) для подробных инструкций.

### Быстрый деплой через CLI

```bash
npm i -g vercel
cd frontend
vercel
```

## Структура

- `index.html` - Главная страница
- `app.js` - Логика приложения
- `manifest.json` - PWA манифест
- `sw.js` - Service Worker
- `vercel.json` - Конфигурация Vercel

