const { Pool } = require('pg');

// Подключение к PostgreSQL
// Railway предоставляет два URL:
// - DATABASE_URL - внутренний (рекомендуется, быстрее и безопаснее)
// - DATABASE_PUBLIC_URL - публичный (для внешнего доступа)
// Используем DATABASE_URL с fallback на DATABASE_PUBLIC_URL
const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString ? { rejectUnauthorized: false } : false
});

// Инициализация БД - создание таблицы если её нет
async function initDatabase() {
    try {
        // Проверка подключения
        await pool.query('SELECT 1');
        console.log('Подключение к PostgreSQL установлено');
        
        // Убедимся, что используем правильную схему (public по умолчанию)
        await pool.query('SET search_path TO public');
        
        // Создать таблицу товаров
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                barcode VARCHAR(255) UNIQUE NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                price DECIMAL(10, 2) NOT NULL DEFAULT 0,
                purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Таблица products создана/проверена');

        // Добавить поле price если его нет (для существующих БД)
        try {
            await pool.query(`
                ALTER TABLE products 
                ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) NOT NULL DEFAULT 0
            `);
            console.log('Поле price добавлено/проверено');
        } catch (error) {
            // Игнорируем ошибку если колонка уже существует
            if (!error.message.includes('already exists') && !error.message.includes('duplicate column')) {
                console.warn('Предупреждение при добавлении поля price:', error.message);
            }
        }

        // Добавить поле purchase_price если его нет (для существующих БД)
        try {
            await pool.query(`
                ALTER TABLE products 
                ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0
            `);
            console.log('Поле purchase_price добавлено/проверено');
        } catch (error) {
            // Игнорируем ошибку если колонка уже существует
            if (!error.message.includes('already exists') && !error.message.includes('duplicate column')) {
                console.warn('Предупреждение при добавлении поля purchase_price:', error.message);
            }
        }

        // Создать таблицу истории операций
        await pool.query(`
            CREATE TABLE IF NOT EXISTS history (
                id SERIAL PRIMARY KEY,
                product_id VARCHAR(255) NOT NULL,
                product_name VARCHAR(255) NOT NULL,
                product_barcode VARCHAR(255) NOT NULL,
                operation_type VARCHAR(20) NOT NULL,
                quantity INTEGER NOT NULL,
                quantity_before INTEGER NOT NULL,
                quantity_after INTEGER NOT NULL,
                price DECIMAL(10, 2) DEFAULT 0,
                total_amount DECIMAL(10, 2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);
        console.log('Таблица history создана/проверена');

        // Добавить поля price и total_amount если их нет
        try {
            await pool.query(`
                ALTER TABLE history 
                ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) DEFAULT 0
            `);
            await pool.query(`
                ALTER TABLE history 
                ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) DEFAULT 0
            `);
            console.log('Поля price и total_amount добавлены/проверены в history');
        } catch (error) {
            if (!error.message.includes('already exists') && !error.message.includes('duplicate column')) {
                console.warn('Предупреждение при добавлении полей в history:', error.message);
            }
        }

        // Создать индекс для быстрого поиска по дате
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC)
        `);
        console.log('Индекс idx_history_created_at создан/проверен');

        // Создать индекс для поиска по товару
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_history_product_id ON history(product_id)
        `);
        console.log('Индекс idx_history_product_id создан/проверен');
        
        // Создать индекс для быстрого поиска по штрих-коду
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)
        `);
        console.log('Индекс idx_products_barcode создан/проверен');
        
        // Проверить, что таблица существует
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'products'
        `);
        
        if (result.rows.length > 0) {
            console.log('✓ Таблица products существует в схеме public');
        } else {
            console.warn('⚠ Таблица products не найдена в схеме public');
        }
        
        console.log('База данных инициализирована успешно');
    } catch (error) {
        console.error('Ошибка инициализации БД:', error);
        console.error('Детали ошибки:', {
            message: error.message,
            code: error.code,
            detail: error.detail
        });
        throw error;
    }
}

// Получить все товары
async function getAllProducts() {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY name');
        return result.rows;
    } catch (error) {
        console.error('Ошибка получения товаров:', error);
        throw error;
    }
}

// Получить товар по ID
async function getProductById(id) {
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Ошибка получения товара:', error);
        throw error;
    }
}

// Найти товар по штрих-коду
async function getProductByBarcode(barcode) {
    try {
        const result = await pool.query('SELECT * FROM products WHERE barcode = $1', [barcode]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Ошибка поиска товара:', error);
        throw error;
    }
}

// Создать товар
async function createProduct(product) {
    try {
        const { id, name, barcode, quantity, price = 0, purchase_price = 0 } = product;
        const result = await pool.query(
            'INSERT INTO products (id, name, barcode, quantity, price, purchase_price) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [id, name, barcode, quantity || 0, price || 0, purchase_price || 0]
        );
        return result.rows[0];
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            throw new Error('Товар с таким штрих-кодом уже существует');
        }
        console.error('Ошибка создания товара:', error);
        throw error;
    }
}

// Обновить товар
async function updateProduct(id, updates) {
    try {
        const { name, barcode, quantity } = updates;
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (name !== undefined) {
            fields.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (barcode !== undefined) {
            fields.push(`barcode = $${paramCount++}`);
            values.push(barcode);
        }
        if (quantity !== undefined) {
            fields.push(`quantity = $${paramCount++}`);
            values.push(quantity);
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const query = `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            throw new Error('Товар с таким штрих-кодом уже существует');
        }
        console.error('Ошибка обновления товара:', error);
        throw error;
    }
}

// Удалить товар
async function deleteProduct(id) {
    try {
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Ошибка удаления товара:', error);
        throw error;
    }
}

// Сохранить операцию в историю
async function saveHistory(product, operationType, quantity, quantityBefore, quantityAfter, price = null, totalAmount = null) {
    try {
        // Если цена не передана, берем из товара
        const productPrice = price !== null ? price : (product.price || 0);
        // Если общая сумма не передана, вычисляем
        const amount = totalAmount !== null ? totalAmount : (productPrice * quantity);
        
        await pool.query(
            `INSERT INTO history (product_id, product_name, product_barcode, operation_type, quantity, quantity_before, quantity_after, price, total_amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [product.id, product.name, product.barcode, operationType, quantity, quantityBefore, quantityAfter, productPrice, amount]
        );
    } catch (error) {
        console.error('Ошибка сохранения истории:', error);
        // Не прерываем выполнение, если не удалось сохранить историю
    }
}

// Увеличить количество товара
async function increaseQuantity(id, amount) {
    try {
        // Получить текущее состояние товара
        const productBefore = await getProductById(id);
        if (!productBefore) {
            return null;
        }
        
        const quantityBefore = productBefore.quantity;
        
        const result = await pool.query(
            'UPDATE products SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [amount, id]
        );
        
        const productAfter = result.rows[0];
        if (productAfter) {
            // Сохранить в историю
            await saveHistory(productAfter, 'receive', amount, quantityBefore, productAfter.quantity);
        }
        
        return productAfter || null;
    } catch (error) {
        console.error('Ошибка увеличения количества:', error);
        throw error;
    }
}

// Уменьшить количество товара
async function decreaseQuantity(id, amount = 1, price = null, purchasePrice = null) {
    try {
        // Получить текущее состояние товара
        const productBefore = await getProductById(id);
        if (!productBefore) {
            return null;
        }
        
        const quantityBefore = productBefore.quantity;
        // Используем переданную цену или цену из товара
        const productPrice = price !== null ? price : (productBefore.price || 0);
        const productPurchasePrice = purchasePrice !== null ? purchasePrice : (productBefore.purchase_price || 0);
        const totalAmount = productPrice * amount;
        
        const result = await pool.query(
            'UPDATE products SET quantity = GREATEST(0, quantity - $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [amount, id]
        );
        
        const productAfter = result.rows[0];
        if (productAfter) {
            // Сохранить в историю с ценами
            await saveHistory(productAfter, 'sale', amount, quantityBefore, productAfter.quantity, productPrice, totalAmount, productPurchasePrice);
        }
        
        return productAfter || null;
    } catch (error) {
        console.error('Ошибка уменьшения количества:', error);
        throw error;
    }
}

// Получить историю операций
async function getHistory(limit = 100, offset = 0, productId = null) {
    try {
        let query = 'SELECT * FROM history';
        const params = [];
        let paramCount = 1;
        
        if (productId) {
            query += ` WHERE product_id = $${paramCount++}`;
            params.push(productId);
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('Ошибка получения истории:', error);
        throw error;
    }
}

// Получить статистику продаж
async function getSalesStats(startDate = null, endDate = null) {
    try {
        let query = `
            SELECT 
                operation_type,
                COUNT(*) as count,
                SUM(quantity) as total_quantity,
                DATE(created_at) as date
            FROM history
            WHERE operation_type = 'sale'
        `;
        const params = [];
        let paramCount = 1;
        
        if (startDate) {
            query += ` AND created_at >= $${paramCount++}`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND created_at <= $${paramCount++}`;
            params.push(endDate);
        }
        
        query += ` GROUP BY operation_type, DATE(created_at) ORDER BY date DESC`;
        
        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        throw error;
    }
}

// Проверка подключения к БД
async function testConnection() {
    try {
        await pool.query('SELECT 1');
        return true;
    } catch (error) {
        console.error('Ошибка подключения к БД:', error);
        return false;
    }
}

module.exports = {
    pool,
    initDatabase,
    getAllProducts,
    getProductById,
    getProductByBarcode,
    createProduct,
    updateProduct,
    deleteProduct,
    increaseQuantity,
    decreaseQuantity,
    getHistory,
    getSalesStats,
    testConnection
};

