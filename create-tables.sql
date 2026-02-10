-- SQL скрипт для создания таблицы products
-- Выполните этот скрипт в Railway PostgreSQL Query или через psql

-- Убедимся, что используем схему public
SET search_path TO public;

-- Создать таблицу products
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    barcode VARCHAR(255) UNIQUE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Добавить поле price если его нет (для существующих таблиц)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'products' 
        AND column_name = 'price'
    ) THEN
        ALTER TABLE products ADD COLUMN price DECIMAL(10, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Добавить поле purchase_price если его нет (для существующих таблиц)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'products' 
        AND column_name = 'purchase_price'
    ) THEN
        ALTER TABLE products ADD COLUMN purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Создать индекс для быстрого поиска по штрих-коду
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- Проверить, что таблица создана
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'products';

-- Показать структуру таблицы
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;

