# Настройка Vercel для деплоя Frontend

## Важно: Настройка Root Directory

Vercel по умолчанию собирает из корня репозитория, но наш frontend находится в папке `frontend/`.

### Решение: Указать Root Directory в настройках проекта

1. Зайдите в ваш проект на Vercel: https://vercel.com/dashboard
2. Откройте **Settings** → **General**
3. Найдите раздел **Root Directory**
4. Укажите: `frontend`
5. Сохраните изменения
6. Передеплойте проект (Settings → Deployments → Redeploy)

### Альтернатива: Использовать vercel.json в корне

Если вы хотите деплоить из корня, можно использовать `vercel.json` в корне проекта (уже создан), но **рекомендуется использовать Root Directory = `frontend`** для более чистой конфигурации.

## Настройка переменных окружения

1. В Vercel Dashboard → **Settings** → **Environment Variables**
2. Добавьте переменную:
   - **Key**: `VITE_API_URL`
   - **Value**: URL вашего Railway backend (например: `https://your-app.up.railway.app`)
   - **Environment**: Production, Preview, Development (выберите все)

## Обновление app.js с реальным API URL

После получения URL Railway backend, обновите `frontend/app.js`:

```javascript
// В функции getApiUrl() замените fallback на ваш Railway URL
return 'https://your-app.up.railway.app';
```

Или используйте скрипт:
```bash
cd frontend
node replace-env.js https://your-app.up.railway.app
```

## Проверка деплоя

После настройки:
1. Проверьте, что сайт открывается
2. Откройте DevTools → Network
3. Попробуйте добавить товар
4. Убедитесь, что запросы идут на правильный Railway URL

## Если деплой не работает

1. Проверьте, что Root Directory установлен на `frontend`
2. Проверьте логи деплоя в Vercel Dashboard
3. Убедитесь, что все файлы в папке `frontend/` присутствуют
4. Проверьте, что `vercel.json` в папке `frontend/` настроен правильно

