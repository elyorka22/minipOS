const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Статические файлы из public/
app.use(express.static(path.join(__dirname, 'public')));

// Инициализация БД при запуске
let dbInitialized = false;

async function initializeApp() {
    // Проверяем наличие DATABASE_URL или DATABASE_PUBLIC_URL
    const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
    
    // Диагностика: проверим, что видит приложение
    console.log('=== Диагностика подключения к БД ===');
    console.log('DATABASE_URL установлен:', !!process.env.DATABASE_URL);
    console.log('DATABASE_PUBLIC_URL установлен:', !!process.env.DATABASE_PUBLIC_URL);
    console.log('Используется URL:', databaseUrl ? 'да' : 'нет');
    if (databaseUrl) {
        // Показываем только начало URL для безопасности (без пароля)
        const urlPreview = databaseUrl.substring(0, 20) + '...';
        console.log('URL (превью):', urlPreview);
    }
    
    if (databaseUrl) {
        try {
            const urlType = process.env.DATABASE_URL ? 'DATABASE_URL (внутренний)' : 'DATABASE_PUBLIC_URL (публичный)';
            console.log(`Используется PostgreSQL через ${urlType}`);
            await db.initDatabase();
            dbInitialized = true;
            console.log('✓ PostgreSQL успешно подключен и инициализирован');
        } catch (error) {
            console.error('✗ Ошибка инициализации БД:', error);
            console.error('Детали ошибки:', {
                message: error.message,
                code: error.code,
                detail: error.detail
            });
            console.log('Приложение продолжит работу, но БД недоступна');
        }
    } else {
        console.log('⚠ DATABASE_URL не установлен, используется файловое хранилище');
        console.log('Для использования PostgreSQL установите переменную DATABASE_URL в Railway');
    }
    console.log('=====================================');
}

// API Routes

// Получить все товары
app.get('/api/products', async (req, res) => {
    try {
        if (dbInitialized) {
            const products = await db.getAllProducts();
            res.json(products);
        } else {
            res.status(503).json({ error: 'База данных не инициализирована' });
        }
    } catch (error) {
        console.error('Ошибка получения товаров:', error);
        res.status(500).json({ error: 'Ошибка получения товаров' });
    }
});

// Получить товар по ID
app.get('/api/products/:id', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'База данных не инициализирована' });
        }

        const product = await db.getProductById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        res.json(product);
    } catch (error) {
        console.error('Ошибка получения товара:', error);
        res.status(500).json({ error: 'Ошибка получения товара' });
    }
});

// Найти товар по штрих-коду
app.get('/api/products/barcode/:barcode', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'База данных не инициализирована' });
        }

        const product = await db.getProductByBarcode(req.params.barcode);
        
        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        res.json(product);
    } catch (error) {
        console.error('Ошибка поиска товара:', error);
        res.status(500).json({ error: 'Ошибка поиска товара' });
    }
});

// Создать товар
app.post('/api/products', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'База данных не инициализирована' });
        }

        const { name, barcode, quantity, price } = req.body;
        
        if (!name || !barcode) {
            return res.status(400).json({ error: 'Название и штрих-код обязательны' });
        }
        
        const newProduct = {
            id: Date.now().toString(),
            name: name.trim(),
            barcode: barcode.trim(),
            quantity: parseInt(quantity) || 0,
            price: parseFloat(price) || 0
        };
        
        const product = await db.createProduct(newProduct);
        res.status(201).json(product);
    } catch (error) {
        console.error('Ошибка создания товара:', error);
        if (error.message.includes('уже существует')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Ошибка создания товара' });
    }
});

// Обновить товар
app.put('/api/products/:id', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'База данных не инициализирована' });
        }

        const { name, barcode, quantity, price } = req.body;
        const updates = {};
        
        if (name !== undefined) updates.name = name.trim();
        if (barcode !== undefined) updates.barcode = barcode.trim();
        if (quantity !== undefined) updates.quantity = parseInt(quantity) || 0;
        if (price !== undefined) updates.price = parseFloat(price) || 0;
        
        const product = await db.updateProduct(req.params.id, updates);
        
        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        res.json(product);
    } catch (error) {
        console.error('Ошибка обновления товара:', error);
        if (error.message.includes('уже существует')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Ошибка обновления товара' });
    }
});

// Удалить товар
app.delete('/api/products/:id', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'База данных не инициализирована' });
        }

        const product = await db.deleteProduct(req.params.id);
        
        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        res.json({ message: 'Товар удален' });
    } catch (error) {
        console.error('Ошибка удаления товара:', error);
        res.status(500).json({ error: 'Ошибка удаления товара' });
    }
});

// Продажа товара (уменьшить количество на 1)
app.post('/api/products/:id/sell', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'База данных не инициализирована' });
        }

        const { price } = req.body;
        const product = await db.decreaseQuantity(req.params.id, 1, price || null);
        
        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        if (product.quantity < 0) {
            return res.status(400).json({ error: 'Товар закончился на складе' });
        }
        
        res.json(product);
    } catch (error) {
        console.error('Ошибка продажи товара:', error);
        res.status(500).json({ error: 'Ошибка продажи товара' });
    }
});

// Прием товара (увеличить количество)
app.post('/api/products/:id/receive', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'База данных не инициализирована' });
        }

        const { quantity } = req.body;
        const addQuantity = parseInt(quantity) || 1;
        
        if (addQuantity <= 0) {
            return res.status(400).json({ error: 'Количество должно быть больше 0' });
        }
        
        const product = await db.increaseQuantity(req.params.id, addQuantity);
        
        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        res.json(product);
    } catch (error) {
        console.error('Ошибка приема товара:', error);
        res.status(500).json({ error: 'Ошибка приема товара' });
    }
});

// Получить историю операций
app.get('/api/history', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'База данных не инициализирована' });
        }

        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const productId = req.query.productId || null;

        const history = await db.getHistory(limit, offset, productId);
        res.json(history);
    } catch (error) {
        console.error('Ошибка получения истории:', error);
        res.status(500).json({ error: 'Ошибка получения истории' });
    }
});

// Получить статистику продаж
app.get('/api/stats', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'База данных не инициализирована' });
        }

        const startDate = req.query.startDate || null;
        const endDate = req.query.endDate || null;

        const stats = await db.getSalesStats(startDate, endDate);
        res.json(stats);
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// Health check
app.get('/health', async (req, res) => {
    let dbStatus = 'not_configured';
    let tableCount = null;
    let error = null;
    
    if (dbInitialized) {
        try {
            const result = await db.pool.query('SELECT COUNT(*) FROM products');
            tableCount = parseInt(result.rows[0].count);
            dbStatus = 'connected';
        } catch (err) {
            dbStatus = 'error';
            error = err.message;
        }
    }
    
    res.json({ 
        status: 'ok',
        database: {
            status: dbStatus,
            tableCount: tableCount,
            error: error,
            hasDatabaseUrl: !!process.env.DATABASE_URL
        }
    });
});

// Endpoint для диагностики БД
app.get('/api/debug/db', async (req, res) => {
    if (!dbInitialized) {
        return res.json({
            initialized: false,
            hasDatabaseUrl: !!process.env.DATABASE_URL,
            message: 'База данных не инициализирована'
        });
    }
    
    try {
        // Проверить таблицы
        const tables = await db.pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        // Проверить количество товаров
        const count = await db.pool.query('SELECT COUNT(*) FROM products');
        
        // Проверить схему таблицы products
        const columns = await db.pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'products'
            ORDER BY ordinal_position
        `);
        
        res.json({
            initialized: true,
            tables: tables.rows.map(r => r.table_name),
            productsCount: parseInt(count.rows[0].count),
            productsColumns: columns.rows,
            databaseUrl: process.env.DATABASE_URL ? 'установлен' : 'не установлен'
        });
    } catch (error) {
        res.status(500).json({
            initialized: true,
            error: error.message,
            code: error.code
        });
    }
});

// SPA fallback - все остальные запросы на index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
async function startServer() {
    await initializeApp();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Сервер запущен на порту ${PORT}`);
        console.log(`Доступен по адресу: http://0.0.0.0:${PORT}`);
        if (dbInitialized) {
            console.log('База данных: PostgreSQL');
        } else {
            console.log('База данных: не настроена (установите DATABASE_URL)');
        }
    });
}

startServer().catch(error => {
    console.error('Ошибка запуска сервера:', error);
    process.exit(1);
});
