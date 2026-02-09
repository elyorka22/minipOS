const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Инициализация базы данных PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Создание таблицы товаров
pool.query(`
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    quantity INTEGER DEFAULT 0
  )
`).catch(err => console.error('Ошибка создания таблицы:', err));

// API: Получить все товары
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Получить товар по штрих-коду
app.get('/api/products/barcode/:barcode', async (req, res) => {
  try {
    const barcode = req.params.barcode;
    const result = await pool.query('SELECT * FROM products WHERE barcode = $1', [barcode]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Продажа товара (уменьшить количество на 1)
app.post('/api/products/sell/:barcode', async (req, res) => {
  try {
    const barcode = req.params.barcode;
    
    // Проверяем товар
    const checkResult = await pool.query('SELECT * FROM products WHERE barcode = $1', [barcode]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    
    const product = checkResult.rows[0];
    
    if (product.quantity <= 0) {
      return res.status(400).json({ error: 'Товар закончился на складе' });
    }
    
    // Уменьшаем количество
    const updateResult = await pool.query(
      'UPDATE products SET quantity = quantity - 1 WHERE barcode = $1 RETURNING *',
      [barcode]
    );
    
    res.json(updateResult.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Добавить товар
app.post('/api/products', async (req, res) => {
  try {
    const { name, barcode, quantity } = req.body;
    
    if (!name || !barcode) {
      return res.status(400).json({ error: 'Название и штрих-код обязательны' });
    }
    
    const result = await pool.query(
      'INSERT INTO products (name, barcode, quantity) VALUES ($1, $2, $3) RETURNING *',
      [name, barcode, quantity || 0]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Товар с таким штрих-кодом уже существует' });
    }
    res.status(500).json({ error: err.message });
  }
});

// API: Принять товар (увеличить количество)
app.post('/api/products/receive/:barcode', async (req, res) => {
  try {
    const { quantity } = req.body;
    const barcode = req.params.barcode;
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Количество должно быть больше 0' });
    }
    
    // Проверяем товар
    const checkResult = await pool.query('SELECT * FROM products WHERE barcode = $1', [barcode]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден. Сначала добавьте товар' });
    }
    
    // Увеличиваем количество
    const result = await pool.query(
      'UPDATE products SET quantity = quantity + $1 WHERE barcode = $2 RETURNING *',
      [quantity, barcode]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check для Railway
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

