// Скрипт для создания таблиц вручную
// Запуск: node create-tables.js

require('dotenv').config({ silent: true });
const db = require('./database');

async function createTables() {
    try {
        console.log('Подключение к базе данных...');
        
        // Проверка подключения
        const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
        if (!connectionString) {
            console.error('Ошибка: DATABASE_URL не установлен!');
            console.log('Установите переменную окружения:');
            console.log('export DATABASE_URL="postgresql://..."');
            process.exit(1);
        }
        
        console.log('Создание таблиц...');
        await db.initDatabase();
        
        console.log('✓ Таблицы созданы успешно!');
        
        // Проверить количество товаров
        const products = await db.getAllProducts();
        console.log(`Товаров в базе: ${products.length}`);
        
        process.exit(0);
    } catch (error) {
        console.error('Ошибка создания таблиц:', error);
        console.error('Детали:', {
            message: error.message,
            code: error.code,
            detail: error.detail
        });
        process.exit(1);
    }
}

createTables();

