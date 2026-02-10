-- SQL скрипт для создания таблицы session_items
-- Выполните этот скрипт в Railway PostgreSQL Query если таблица не создалась автоматически

-- Убедимся, что используем схему public
SET search_path TO public;

-- Создать таблицу товаров в корзине сессии
CREATE TABLE IF NOT EXISTS session_items (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    product_id VARCHAR(255) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_barcode VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price DECIMAL(10, 2) DEFAULT 0,
    purchase_price DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(session_id, product_id)
);

-- Создать индекс для быстрого поиска по сессии
CREATE INDEX IF NOT EXISTS idx_session_items_session_id ON session_items(session_id);

-- Проверить структуру таблицы
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'session_items'
ORDER BY ordinal_position;

