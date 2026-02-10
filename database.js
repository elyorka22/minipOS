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
            const priceCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'products' 
                AND column_name = 'price'
            `);
            
            if (priceCheck.rows.length === 0) {
                await pool.query(`
                    ALTER TABLE products 
                    ADD COLUMN price DECIMAL(10, 2) NOT NULL DEFAULT 0
                `);
                console.log('✓ Поле price добавлено');
            } else {
                console.log('✓ Поле price уже существует');
            }
        } catch (error) {
            console.error('Ошибка при проверке/добавлении поля price:', error.message);
            // Продолжаем работу, даже если не удалось добавить поле
        }

        // Добавить поле purchase_price если его нет (для существующих БД)
        try {
            const purchasePriceCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'products' 
                AND column_name = 'purchase_price'
            `);
            
            if (purchasePriceCheck.rows.length === 0) {
                await pool.query(`
                    ALTER TABLE products 
                    ADD COLUMN purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0
                `);
                console.log('✓ Поле purchase_price добавлено');
            } else {
                console.log('✓ Поле purchase_price уже существует');
            }
        } catch (error) {
            console.error('Ошибка при проверке/добавлении поля purchase_price:', error.message);
            // Продолжаем работу, даже если не удалось добавить поле
        }

        // Создать таблицу сессий продаж
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                session_number INTEGER NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'open',
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMP,
                total_sales DECIMAL(10, 2) DEFAULT 0,
                total_profit DECIMAL(10, 2) DEFAULT 0,
                sales_count INTEGER DEFAULT 0
            )
        `);
        console.log('Таблица sessions создана/проверена');

        // Создать таблицу истории операций
        await pool.query(`
            CREATE TABLE IF NOT EXISTS history (
                id SERIAL PRIMARY KEY,
                session_id INTEGER,
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
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
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
            
            // Добавить поле purchase_price если его нет
            const purchasePriceCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'history' 
                AND column_name = 'purchase_price'
            `);
            
            if (purchasePriceCheck.rows.length === 0) {
                await pool.query(`
                    ALTER TABLE history 
                    ADD COLUMN purchase_price DECIMAL(10, 2) DEFAULT 0
                `);
                console.log('✓ Поле purchase_price добавлено в history');
            }
            
            // Добавить поле profit если его нет
            const profitCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'history' 
                AND column_name = 'profit'
            `);
            
            if (profitCheck.rows.length === 0) {
                await pool.query(`
                    ALTER TABLE history 
                    ADD COLUMN profit DECIMAL(10, 2) DEFAULT 0
                `);
                console.log('✓ Поле profit добавлено в history');
            }
            
            // Добавить поле session_id если его нет
            const sessionIdCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'history' 
                AND column_name = 'session_id'
            `);
            
            if (sessionIdCheck.rows.length === 0) {
                await pool.query(`
                    ALTER TABLE history 
                    ADD COLUMN session_id INTEGER
                `);
                // Добавить внешний ключ отдельно, если таблица sessions уже существует
                try {
                    await pool.query(`
                        ALTER TABLE history 
                        ADD CONSTRAINT fk_history_session 
                        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
                    `);
                } catch (fkError) {
                    // Игнорируем ошибку если внешний ключ уже существует
                    if (!fkError.message.includes('already exists')) {
                        console.warn('Предупреждение при добавлении внешнего ключа session_id:', fkError.message);
                    }
                }
                console.log('✓ Поле session_id добавлено в history');
            }
            console.log('Поля price, total_amount, purchase_price, profit добавлены/проверены в history');
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
        const { name, barcode, quantity, price, purchase_price } = updates;
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
        if (price !== undefined) {
            fields.push(`price = $${paramCount++}`);
            values.push(parseFloat(price) || 0);
        }
        if (purchase_price !== undefined) {
            fields.push(`purchase_price = $${paramCount++}`);
            values.push(parseFloat(purchase_price) || 0);
        }

        if (fields.length === 0) {
            // Если нет полей для обновления, просто обновим updated_at
            fields.push(`updated_at = CURRENT_TIMESTAMP`);
        } else {
            fields.push(`updated_at = CURRENT_TIMESTAMP`);
        }
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
            // Сохранить в историю (приемка не привязана к сессии)
            await saveHistory(productAfter, 'receive', amount, quantityBefore, productAfter.quantity, null, null, null, null);
        }
        
        return productAfter || null;
    } catch (error) {
        console.error('Ошибка увеличения количества:', error);
        throw error;
    }
}

// Уменьшить количество товара (для продажи, может принимать session_id)
async function decreaseQuantity(id, amount = 1, price = null, purchasePrice = null, sessionId = null) {
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
            // Сохранить в историю с ценами и session_id
            await saveHistory(productAfter, 'sale', amount, quantityBefore, productAfter.quantity, productPrice, totalAmount, productPurchasePrice, sessionId);
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

// Получить статистику продаж за период
async function getStats(period = 'day') {
    try {
        let dateFilter = '';
        const now = new Date();
        
        switch (period) {
            case 'day':
                dateFilter = `created_at >= CURRENT_DATE`;
                break;
            case 'week':
                dateFilter = `created_at >= CURRENT_DATE - INTERVAL '7 days'`;
                break;
            case 'month':
                dateFilter = `created_at >= CURRENT_DATE - INTERVAL '30 days'`;
                break;
            default:
                dateFilter = `created_at >= CURRENT_DATE`;
        }
        
        // Общая статистика продаж
        const salesStats = await pool.query(`
            SELECT 
                COUNT(*) as sales_count,
                COALESCE(SUM(total_amount), 0) as total_sales,
                COALESCE(SUM(profit), 0) as total_profit
            FROM history
            WHERE operation_type = 'sale' AND ${dateFilter}
        `);
        
        // Топ товаров по продажам (по количеству проданных единиц)
        const topSales = await pool.query(`
            SELECT 
                product_id,
                product_name,
                product_barcode,
                SUM(quantity) as total_quantity,
                SUM(total_amount) as total_amount
            FROM history
            WHERE operation_type = 'sale' AND ${dateFilter}
            GROUP BY product_id, product_name, product_barcode
            ORDER BY total_quantity DESC
            LIMIT 10
        `);
        
        // Топ товаров по прибыльности
        const topProfit = await pool.query(`
            SELECT 
                product_id,
                product_name,
                product_barcode,
                SUM(quantity) as total_quantity,
                SUM(profit) as total_profit,
                SUM(total_amount) as total_amount
            FROM history
            WHERE operation_type = 'sale' AND ${dateFilter}
            GROUP BY product_id, product_name, product_barcode
            ORDER BY total_profit DESC
            LIMIT 10
        `);
        
        return {
            period,
            totalSales: parseFloat(salesStats.rows[0]?.total_sales || 0),
            totalProfit: parseFloat(salesStats.rows[0]?.total_profit || 0),
            salesCount: parseInt(salesStats.rows[0]?.sales_count || 0),
            topSales: topSales.rows.map(row => ({
                productId: row.product_id,
                productName: row.product_name,
                productBarcode: row.product_barcode,
                totalQuantity: parseInt(row.total_quantity || 0),
                totalAmount: parseFloat(row.total_amount || 0)
            })),
            topProfit: topProfit.rows.map(row => ({
                productId: row.product_id,
                productName: row.product_name,
                productBarcode: row.product_barcode,
                totalQuantity: parseInt(row.total_quantity || 0),
                totalProfit: parseFloat(row.total_profit || 0),
                totalAmount: parseFloat(row.total_amount || 0)
            }))
        };
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        throw error;
    }
}

// Создать новую сессию
async function createSession() {
    try {
        // Получить следующий номер сессии
        const maxSession = await pool.query(`
            SELECT MAX(session_number) as max_num FROM sessions
        `);
        const nextSessionNumber = (maxSession.rows[0]?.max_num || 0) + 1;
        
        const result = await pool.query(`
            INSERT INTO sessions (session_number, status) 
            VALUES ($1, 'open') 
            RETURNING *
        `, [nextSessionNumber]);
        
        return result.rows[0];
    } catch (error) {
        console.error('Ошибка создания сессии:', error);
        throw error;
    }
}

// Получить все открытые сессии
async function getOpenSessions() {
    try {
        const result = await pool.query(`
            SELECT * FROM sessions 
            WHERE status = 'open' 
            ORDER BY session_number DESC
        `);
        return result.rows;
    } catch (error) {
        console.error('Ошибка получения открытых сессий:', error);
        throw error;
    }
}

// Получить сессию по ID
async function getSessionById(id) {
    try {
        const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Ошибка получения сессии:', error);
        throw error;
    }
}

// Получить все продажи сессии (для восстановления корзины)
async function getSessionSales(sessionId) {
    try {
        const result = await pool.query(`
            SELECT 
                h.*,
                p.name as product_name,
                p.barcode as product_barcode,
                p.price,
                p.purchase_price
            FROM history h
            LEFT JOIN products p ON h.product_id = p.id
            WHERE h.session_id = $1 AND h.operation_type = 'sale'
            ORDER BY h.created_at ASC
        `, [sessionId]);
        return result.rows;
    } catch (error) {
        console.error('Ошибка получения продаж сессии:', error);
        throw error;
    }
}

// Закрыть сессию
async function closeSession(id) {
    try {
        // Подсчитать итоги сессии
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as sales_count,
                COALESCE(SUM(total_amount), 0) as total_sales,
                COALESCE(SUM(profit), 0) as total_profit
            FROM history
            WHERE session_id = $1 AND operation_type = 'sale'
        `, [id]);
        
        const salesCount = parseInt(stats.rows[0]?.sales_count || 0);
        const totalSales = parseFloat(stats.rows[0]?.total_sales || 0);
        const totalProfit = parseFloat(stats.rows[0]?.total_profit || 0);
        
        // Обновить сессию
        const result = await pool.query(`
            UPDATE sessions 
            SET status = 'closed', 
                closed_at = CURRENT_TIMESTAMP,
                sales_count = $1,
                total_sales = $2,
                total_profit = $3
            WHERE id = $4 
            RETURNING *
        `, [salesCount, totalSales, totalProfit, id]);
        
        return result.rows[0] || null;
    } catch (error) {
        console.error('Ошибка закрытия сессии:', error);
        throw error;
    }
}

// Сохранить операцию в историю (с поддержкой session_id)
async function saveHistory(product, operationType, quantity, quantityBefore, quantityAfter, price = null, totalAmount = null, purchasePrice = null, sessionId = null) {
    try {
        // Если цена не передана, берем из товара
        const productPrice = price !== null ? price : (product.price || 0);
        const productPurchasePrice = purchasePrice !== null ? purchasePrice : (product.purchase_price || 0);
        // Если общая сумма не передана, вычисляем
        const amount = totalAmount !== null ? totalAmount : (productPrice * quantity);
        // Рассчитываем прибыль только для продаж
        const profit = operationType === 'sale' ? (productPrice - productPurchasePrice) * quantity : 0;
        
        await pool.query(
            `INSERT INTO history (session_id, product_id, product_name, product_barcode, operation_type, quantity, quantity_before, quantity_after, price, purchase_price, total_amount, profit)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [sessionId, product.id, product.name, product.barcode, operationType, quantity, quantityBefore, quantityAfter, productPrice, productPurchasePrice, amount, profit]
        );
    } catch (error) {
        console.error('Ошибка сохранения истории:', error);
        // Не прерываем выполнение, если не удалось сохранить историю
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
    getStats,
    createSession,
    getOpenSessions,
    getSessionById,
    getSessionSales,
    closeSession,
    saveHistory,
    testConnection
};

