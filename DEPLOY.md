# Деплой на Railway

## Подготовка проекта

1. Убедитесь, что все файлы на месте:
   - `package.json` - зависимости и скрипты
   - `server.js` - backend сервер
   - `public/` - frontend файлы (index.html, app.js, style.css, manifest.json)
   - `.gitignore` - игнорируемые файлы

2. Проверьте, что проект работает локально:
```bash
npm install
npm start
```

## Деплой на Railway

### Способ 1: Через GitHub (рекомендуется)

1. Создайте репозиторий на GitHub
2. Закоммитьте и запушьте код:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <ваш-репозиторий>
git push -u origin main
```

3. Зайдите на [Railway](https://railway.app)
4. Нажмите "New Project"
5. Выберите "Deploy from GitHub repo"
6. Выберите ваш репозиторий
7. Railway автоматически определит Node.js проект и запустит деплой

### Способ 2: Через Railway CLI

1. Установите Railway CLI:
```bash
npm i -g @railway/cli
```

2. Войдите в Railway:
```bash
railway login
```

3. Создайте проект:
```bash
railway init
```

4. Деплой:
```bash
railway up
```

## Настройка переменных окружения

### Обязательные переменные

Railway автоматически установит переменную `PORT`. 

### PostgreSQL (рекомендуется)

1. В Railway Dashboard нажмите "+ New" → "Database" → "Add PostgreSQL"
2. Railway автоматически создаст PostgreSQL сервис
3. В настройках вашего приложения:
   - Нажмите "Variables"
   - Railway автоматически добавит `DATABASE_URL` из PostgreSQL сервиса
   - Если нет, добавьте вручную через "Reference"

**Подробные инструкции в [DATABASE.md](./DATABASE.md)**

## Проверка деплоя

1. После деплоя Railway предоставит URL вида: `https://your-project.railway.app`
2. Откройте URL в браузере
3. Проверьте работу API: `https://your-project.railway.app/api/products`

## Хранение данных

### С PostgreSQL (рекомендуется)
- Данные хранятся в PostgreSQL базе данных
- Таблица создается автоматически при первом запуске
- Надежное хранение, поддержка транзакций

### Без PostgreSQL (fallback)
- Данные хранятся в файле `data/products.json`
- Файл создается автоматически при первом запуске
- **Внимание**: данные могут быть потеряны при перезапуске сервиса

## Обновление приложения

При каждом push в GitHub, Railway автоматически пересоберет и задеплоит новую версию.

## Проблемы и решения

### Ошибка при деплое

- Проверьте, что `package.json` содержит правильные зависимости
- Убедитесь, что `server.js` существует и корректен
- Проверьте логи в Railway Dashboard

### API не работает

- Проверьте, что сервер запущен (логи в Railway)
- Убедитесь, что используется правильный URL (HTTPS)
- Проверьте CORS настройки (уже настроены в server.js)

### Камера не работает

- Камера работает только через HTTPS (Railway предоставляет HTTPS автоматически)
- Убедитесь, что разрешены права доступа к камере в браузере
- Проверьте, что сайт открыт не в Telegram WebView

