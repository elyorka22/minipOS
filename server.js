const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Инициализация базы данных
const db = new sqlite3.Database('./products.db');

// Создание таблицы товаров
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    quantity INTEGER DEFAULT 0
  )`);
});

// API: Получить все товары
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY name', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// API: Получить товар по штрих-коду
app.get('/api/products/barcode/:barcode', (req, res) => {
  const barcode = req.params.barcode;
  db.get('SELECT * FROM products WHERE barcode = ?', [barcode], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Товар не найден' });
      return;
    }
    res.json(row);
  });
});

// API: Продажа товара (уменьшить количество на 1)
app.post('/api/products/sell/:barcode', (req, res) => {
  const barcode = req.params.barcode;
  db.get('SELECT * FROM products WHERE barcode = ?', [barcode], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    if (row.quantity <= 0) {
      return res.status(400).json({ error: 'Товар закончился на складе' });
    }
    
    db.run('UPDATE products SET quantity = quantity - 1 WHERE barcode = ?', [barcode], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT * FROM products WHERE barcode = ?', [barcode], (err, updatedRow) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(updatedRow);
      });
    });
  });
});

// API: Добавить товар
app.post('/api/products', (req, res) => {
  const { name, barcode, quantity } = req.body;
  
  if (!name || !barcode) {
    res.status(400).json({ error: 'Название и штрих-код обязательны' });
    return;
  }
  
  db.run(
    'INSERT INTO products (name, barcode, quantity) VALUES (?, ?, ?)',
    [name, barcode, quantity || 0],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          res.status(400).json({ error: 'Товар с таким штрих-кодом уже существует' });
          return;
        }
        res.status(500).json({ error: err.message });
        return;
      }
      db.get('SELECT * FROM products WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(row);
      });
    }
  );
});

// API: Принять товар (увеличить количество)
app.post('/api/products/receive/:barcode', (req, res) => {
  const { quantity } = req.body;
  const barcode = req.params.barcode;
  
  if (!quantity || quantity <= 0) {
    res.status(400).json({ error: 'Количество должно быть больше 0' });
    return;
  }
  
  db.get('SELECT * FROM products WHERE barcode = ?', [barcode], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Товар не найден. Сначала добавьте товар' });
      return;
    }
    
    db.run(
      'UPDATE products SET quantity = quantity + ? WHERE barcode = ?',
      [quantity, barcode],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        db.get('SELECT * FROM products WHERE barcode = ?', [barcode], (err, updatedRow) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          res.json(updatedRow);
        });
      }
    );
  });
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});

