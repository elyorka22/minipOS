# Быстрый запуск

## Локальная разработка

### 1. Установка зависимостей

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Запуск Backend

```bash
cd backend
npm start
# Backend запустится на http://localhost:3001
```

### 3. Запуск Frontend

В новом терминале:
```bash
cd frontend
API_URL=http://localhost:3001 npm start
# Frontend запустится на http://localhost:3000
```

Или установите переменную окружения:
```bash
export API_URL=http://localhost:3001
cd frontend
npm start
```

### 4. Открыть в браузере

```
http://localhost:3000
```

## Тестирование на Android

1. Убедитесь, что компьютер и телефон в одной Wi-Fi сети
2. Найдите IP компьютера: `ifconfig | grep "inet "` (macOS/Linux)
3. Сервер уже слушает на всех интерфейсах (0.0.0.0)
4. Откройте на телефоне: `http://ВАШ_IP:3000`

**ВАЖНО**: Для работы камеры на реальном устройстве нужен HTTPS. Используйте:
- ngrok: `ngrok http 3000`
- Или разверните на Railway (автоматический HTTPS) - см. [DEPLOY.md](./DEPLOY.md)

## Деплой на Railway

См. подробные инструкции в [DEPLOY.md](./DEPLOY.md)

Кратко:
1. Создайте репозиторий на GitHub
2. Запушьте код
3. В Railway выберите "Deploy from GitHub repo"
4. Готово! Railway предоставит HTTPS URL

## Генерация иконок PWA

1. Откройте `generate-icons.html` в браузере
2. Нажмите "Скачать" для каждой иконки
3. Сохраните файлы как `icon-192.png` и `icon-512.png` в папку `public/`
4. Обновите `public/manifest.json` (добавьте секцию icons)

## Проверка работы

1. ✅ Откройте в Chrome на Android (через HTTPS)
2. ✅ Разрешите доступ к камере
3. ✅ Наведите на штрих-код EAN-13
4. ✅ Товар должен распознаться автоматически

## Структура данных

Данные хранятся в файле `data/products.json` на сервере в формате:
```json
[
  {
    "id": "1234567890",
    "name": "Товар",
    "barcode": "1234567890123",
    "quantity": 10
  }
]
```

Файл создается автоматически при первом запуске сервера.

## API Endpoints

- `GET /api/products` - Получить все товары
- `GET /api/products/barcode/:barcode` - Найти товар по штрих-коду
- `POST /api/products` - Создать товар
- `POST /api/products/:id/sell` - Продать товар
- `POST /api/products/:id/receive` - Принять товар

## Проверка API

```bash
# Получить все товары
curl http://localhost:3000/api/products

# Создать товар
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Тест","barcode":"1234567890123","quantity":10}'
```
