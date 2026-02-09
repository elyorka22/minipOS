const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// API URL из переменной окружения (Railway предоставляет через переменные окружения)
const API_URL = process.env.API_URL || process.env.BACKEND_URL || 'http://localhost:3001';
const API_BASE = `${API_URL}/api`.replace(/\/\/api$/, '/api');

console.log(`Frontend сервер запущен на порту ${PORT}`);
console.log(`API URL: ${API_BASE}`);

// Функция для инжекции API URL в HTML
function injectApiUrl(html) {
    // Ищем место перед закрывающим тегом </head> или перед <script src="app.js">
    const scriptTag = '<script src="app.js"></script>';
    const injectionScript = `<script>window.API_URL = '${API_BASE}';</script>`;
    
    if (html.includes(scriptTag)) {
        return html.replace(scriptTag, `${injectionScript}\n    ${scriptTag}`);
    } else {
        // Если не нашли, добавляем перед закрывающим </body>
        return html.replace('</body>', `    ${injectionScript}\n</body>`);
    }
}

// Статические файлы (кроме index.html)
app.use(express.static(path.join(__dirname), {
    index: false // Не отдавать index.html автоматически
}));

// Обработка index.html с инжекцией API URL
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = injectApiUrl(html);
    res.send(html);
});

// SPA fallback - все остальные запросы на index.html
app.get('*', (req, res) => {
    const htmlPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = injectApiUrl(html);
    res.send(html);
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'frontend',
        apiUrl: API_BASE
    });
});

app.listen(PORT, () => {
    console.log(`Frontend сервер запущен на порту ${PORT}`);
    console.log(`API Base URL: ${API_BASE}`);
});
