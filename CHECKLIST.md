# Чеклист перед деплоем

## ✅ Проверка файлов

- [ ] `package.json` - есть все зависимости (express, cors)
- [ ] `server.js` - backend сервер настроен
- [ ] `public/index.html` - frontend разметка
- [ ] `public/app.js` - frontend логика с API
- [ ] `public/style.css` - стили
- [ ] `public/manifest.json` - PWA манифест
- [ ] `.gitignore` - настроен правильно
- [ ] `railway.json` - конфигурация Railway (опционально)

## ✅ Локальная проверка

1. Установить зависимости:
```bash
npm install
```

2. Запустить сервер:
```bash
npm start
```

3. Проверить в браузере:
- Открыть `http://localhost:3000`
- Проверить работу интерфейса
- Проверить API: `http://localhost:3000/api/products`

4. Проверить API через curl:
```bash
# Получить товары
curl http://localhost:3000/api/products

# Создать товар
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Тест","barcode":"1234567890123","quantity":10}'
```

## ✅ Подготовка к деплою

1. Создать репозиторий на GitHub
2. Закоммитить все файлы:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <ваш-репозиторий>
git push -u origin main
```

3. Проверить, что в репозитории есть:
   - `package.json`
   - `server.js`
   - `public/` папка со всеми файлами
   - `.gitignore`

## ✅ Деплой на Railway

1. Зайти на [Railway](https://railway.app)
2. Создать новый проект
3. Выбрать "Deploy from GitHub repo"
4. Выбрать ваш репозиторий
5. Дождаться деплоя
6. Проверить работу на предоставленном URL

## ✅ После деплоя

1. Проверить работу приложения на Railway URL
2. Проверить API: `https://your-project.railway.app/api/products`
3. Проверить работу камеры на мобильном устройстве (через HTTPS)
4. Убедиться, что данные сохраняются

## ⚠️ Важные моменты

- Railway автоматически предоставляет HTTPS (нужно для камеры)
- Данные хранятся в `data/products.json` на сервере
- При перезапуске сервера данные сохраняются (файл не удаляется)
- Для продакшена рекомендуется использовать базу данных вместо JSON файла

