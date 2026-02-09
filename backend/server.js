const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS настройка - разрешаем запросы с фронтенда
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));

app.use(express.json());

// Путь к файлу данных
const DATA_FILE = path.join(__dirname, 'data', 'products.json');

// Создать директорию data если её нет
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Инициализация файла данных если его нет
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// Чтение данных
function readProducts() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Ошибка чтения данных:', error);
        return [];
    }
}

// Запись данных
function writeProducts(products) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
        return true;
    } catch (error) {
        console.error('Ошибка записи данных:', error);
        return false;
    }
}

// API Routes

// Получить все товары
app.get('/api/products', (req, res) => {
    const products = readProducts();
    res.json(products);
});

// Получить товар по ID
app.get('/api/products/:id', (req, res) => {
    const products = readProducts();
    const product = products.find(p => p.id === req.params.id);
    
    if (!product) {
        return res.status(404).json({ error: 'Товар не найден' });
    }
    
    res.json(product);
});

// Найти товар по штрих-коду
app.get('/api/products/barcode/:barcode', (req, res) => {
    const products = readProducts();
    const product = products.find(p => p.barcode === req.params.barcode);
    
    if (!product) {
        return res.status(404).json({ error: 'Товар не найден' });
    }
    
    res.json(product);
});

// Создать товар
app.post('/api/products', (req, res) => {
    const { name, barcode, quantity } = req.body;
    
    if (!name || !barcode) {
        return res.status(400).json({ error: 'Название и штрих-код обязательны' });
    }
    
    const products = readProducts();
    
    // Проверка на дубликат
    if (products.find(p => p.barcode === barcode)) {
        return res.status(400).json({ error: 'Товар с таким штрих-кодом уже существует' });
    }
    
    const newProduct = {
        id: Date.now().toString(),
        name: name.trim(),
        barcode: barcode.trim(),
        quantity: parseInt(quantity) || 0
    };
    
    products.push(newProduct);
    
    if (writeProducts(products)) {
        res.status(201).json(newProduct);
    } else {
        res.status(500).json({ error: 'Ошибка сохранения товара' });
    }
});

// Обновить товар
app.put('/api/products/:id', (req, res) => {
    const { name, barcode, quantity } = req.body;
    const products = readProducts();
    const productIndex = products.findIndex(p => p.id === req.params.id);
    
    if (productIndex === -1) {
        return res.status(404).json({ error: 'Товар не найден' });
    }
    
    // Проверка на дубликат штрих-кода (если изменился)
    if (barcode && barcode !== products[productIndex].barcode) {
        if (products.find(p => p.barcode === barcode && p.id !== req.params.id)) {
            return res.status(400).json({ error: 'Товар с таким штрих-кодом уже существует' });
        }
    }
    
    if (name) products[productIndex].name = name.trim();
    if (barcode) products[productIndex].barcode = barcode.trim();
    if (quantity !== undefined) products[productIndex].quantity = parseInt(quantity) || 0;
    
    if (writeProducts(products)) {
        res.json(products[productIndex]);
    } else {
        res.status(500).json({ error: 'Ошибка сохранения товара' });
    }
});

// Удалить товар
app.delete('/api/products/:id', (req, res) => {
    const products = readProducts();
    const filteredProducts = products.filter(p => p.id !== req.params.id);
    
    if (products.length === filteredProducts.length) {
        return res.status(404).json({ error: 'Товар не найден' });
    }
    
    if (writeProducts(filteredProducts)) {
        res.json({ message: 'Товар удален' });
    } else {
        res.status(500).json({ error: 'Ошибка удаления товара' });
    }
});

// Продажа товара (уменьшить количество на 1)
app.post('/api/products/:id/sell', (req, res) => {
    const products = readProducts();
    const productIndex = products.findIndex(p => p.id === req.params.id);
    
    if (productIndex === -1) {
        return res.status(404).json({ error: 'Товар не найден' });
    }
    
    if (products[productIndex].quantity <= 0) {
        return res.status(400).json({ error: 'Товар закончился на складе' });
    }
    
    products[productIndex].quantity -= 1;
    
    if (writeProducts(products)) {
        res.json(products[productIndex]);
    } else {
        res.status(500).json({ error: 'Ошибка сохранения товара' });
    }
});

// Прием товара (увеличить количество)
app.post('/api/products/:id/receive', (req, res) => {
    const { quantity } = req.body;
    const products = readProducts();
    const productIndex = products.findIndex(p => p.id === req.params.id);
    
    if (productIndex === -1) {
        return res.status(404).json({ error: 'Товар не найден' });
    }
    
    const addQuantity = parseInt(quantity) || 1;
    if (addQuantity <= 0) {
        return res.status(400).json({ error: 'Количество должно быть больше 0' });
    }
    
    products[productIndex].quantity += addQuantity;
    
    if (writeProducts(products)) {
        res.json(products[productIndex]);
    } else {
        res.status(500).json({ error: 'Ошибка сохранения товара' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'backend' });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Backend сервер запущен на порту ${PORT}`);
    console.log(`Данные хранятся в: ${DATA_FILE}`);
    console.log(`CORS разрешен для: ${FRONTEND_URL}`);
});
