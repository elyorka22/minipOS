#!/usr/bin/env node

/**
 * Скрипт для замены переменных окружения в статических файлах
 * Использование: node replace-env.js <API_URL>
 */

const fs = require('fs');
const path = require('path');

const apiUrl = process.argv[2] || process.env.VITE_API_URL || 'http://localhost:3000';

console.log(`Замена переменных окружения на: ${apiUrl}`);

// Файлы для обработки
const files = ['index.html', 'app.js'];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  if (!fs.existsSync(filePath)) {
    console.warn(`Файл ${file} не найден, пропускаем`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Заменяем плейсхолдеры
  content = content.replace(/%VITE_API_URL%/g, apiUrl);
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ Обработан ${file}`);
});

console.log('Готово!');

