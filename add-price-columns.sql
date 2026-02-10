-- SQL скрипт для добавления полей цен в существующую таблицу products
-- Выполните этот скрипт в Railway PostgreSQL Query если поля price и purchase_price отсутствуют

-- Убедимся, что используем схему public
SET search_path TO public;

-- Добавить поле price если его нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'products' 
        AND column_name = 'price'
    ) THEN
        ALTER TABLE products ADD COLUMN price DECIMAL(10, 2) NOT NULL DEFAULT 0;
        RAISE NOTICE 'Поле price добавлено';
    ELSE
        RAISE NOTICE 'Поле price уже существует';
    END IF;
END $$;

-- Добавить поле purchase_price если его нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'products' 
        AND column_name = 'purchase_price'
    ) THEN
        ALTER TABLE products ADD COLUMN purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0;
        RAISE NOTICE 'Поле purchase_price добавлено';
    ELSE
        RAISE NOTICE 'Поле purchase_price уже существует';
    END IF;
END $$;

-- Проверить структуру таблицы
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;

