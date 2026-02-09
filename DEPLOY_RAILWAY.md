# Деплой на Railway - Два сервиса (Frontend + Backend)

## Структура проекта

```
elpos/
├── backend/          # Backend сервис
│   ├── server.js
│   ├── package.json
│   └── data/         # Данные (создается автоматически)
├── frontend/         # Frontend сервис
│   ├── server.js
│   ├── package.json
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── manifest.json
└── railway.toml      # Конфигурация Railway
```

## Шаг 1: Создание двух сервисов в Railway

1. Зайдите на [Railway](https://railway.app)
2. Создайте новый проект
3. Выберите "Deploy from GitHub repo"
4. Выберите репозиторий `elyorka22/minipOS`

## Шаг 2: Настройка Backend сервиса

1. В Railway Dashboard нажмите "+ New" → "Service"
2. Выберите "GitHub Repo" → ваш репозиторий
3. В настройках сервиса:
   - **Root Directory**: `backend`
   - **Start Command**: `npm start`
   - **Port**: Railway автоматически установит переменную `PORT`

4. Добавьте переменную окружения:
   - `FRONTEND_URL` = URL вашего frontend сервиса (будет доступен после деплоя)

## Шаг 3: Настройка Frontend сервиса

1. В Railway Dashboard нажмите "+ New" → "Service"
2. Выберите "GitHub Repo" → ваш репозиторий
3. В настройках сервиса:
   - **Root Directory**: `frontend`
   - **Start Command**: `npm start`
   - **Port**: Railway автоматически установит переменную `PORT`

4. Добавьте переменную окружения:
   - `API_URL` = URL вашего backend сервиса (например: `https://your-backend.railway.app`)
   - Или `BACKEND_URL` = URL вашего backend сервиса

## Шаг 4: Получение URL сервисов

После деплоя каждого сервиса Railway предоставит URL:
- Backend: `https://your-backend.railway.app`
- Frontend: `https://your-frontend.railway.app`

## Шаг 5: Настройка переменных окружения

### Backend сервис:
```
FRONTEND_URL=https://your-frontend.railway.app
```

### Frontend сервис:
```
API_URL=https://your-backend.railway.app
# или
BACKEND_URL=https://your-backend.railway.app
```

## Шаг 6: Проверка работы

1. Откройте frontend URL в браузере
2. Проверьте консоль браузера - должно быть: `API Base URL: https://your-backend.railway.app/api`
3. Проверьте работу API через frontend

## Альтернативный способ: Использование Railway Service Discovery

Railway автоматически предоставляет переменные окружения для связи между сервисами:

- `RAILWAY_SERVICE_URL` - URL текущего сервиса
- Для связи между сервисами используйте внутренние переменные Railway

## Troubleshooting

### Frontend не может подключиться к Backend

1. Проверьте переменную `API_URL` в frontend сервисе
2. Убедитесь, что backend сервис запущен и доступен
3. Проверьте CORS настройки в backend (должен разрешать запросы с frontend URL)

### CORS ошибки

В `backend/server.js` проверьте:
```javascript
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));
```

Убедитесь, что `FRONTEND_URL` указывает на правильный frontend URL.

### Данные не сохраняются

Данные хранятся в `backend/data/products.json`. Убедитесь, что:
- Backend сервис имеет права на запись
- Файл создается автоматически при первом запуске

## Локальная разработка

### Запуск Backend:
```bash
cd backend
npm install
npm start
# Backend на http://localhost:3001
```

### Запуск Frontend:
```bash
cd frontend
npm install
API_URL=http://localhost:3001 npm start
# Frontend на http://localhost:3000
```

Или установите переменную окружения:
```bash
export API_URL=http://localhost:3001
cd frontend
npm start
```

