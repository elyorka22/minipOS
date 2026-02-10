// Проверка на Telegram WebView
function isTelegramWebView() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /Telegram/i.test(userAgent) || 
           /WebView/i.test(userAgent) && /Telegram/i.test(userAgent);
}

// Инициализация приложения
let currentScanner = null;
let currentBarcode = null;
let currentProduct = null;

// Корзина для продажи
let saleCart = [];
// Текущая активная сессия
let currentSessionId = null;
let currentSessionNumber = null;

// Защита от повторных сканирований одного штрих-кода
let lastScannedBarcode = null;
let lastScanTime = 0;
const SCAN_DEBOUNCE_TIME = 1000; // 1 секунда между сканированиями одного кода

// Кэш результатов поиска товаров
const productCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// API базовый URL - для монолита всегда /api
const API_BASE = '/api';

// Валидация штрих-кода EAN-13
function validateEAN13(barcode) {
    const code = String(barcode).trim();
    
    // EAN-13 должен быть 13 цифр
    if (!/^\d{13}$/.test(code)) {
        return { valid: false, reason: 'EAN-13 должен содержать 13 цифр' };
    }
    
    // Проверка контрольной суммы
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(code[i]);
        sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    
    if (parseInt(code[12]) !== checkDigit) {
        return { valid: false, reason: 'Неверная контрольная сумма' };
    }
    
    return { valid: true };
}

// Валидация штрих-кода (упрощенная - только базовая проверка)
function validateBarcode(barcode) {
    const code = String(barcode).trim();
    
    // Проверка на пустоту
    if (!code) {
        return { valid: false, reason: 'Штрих-код пуст' };
    }
    
    // Минимальная валидация: код не пустой и имеет разумную длину
    if (code.length < 3) {
        return { valid: false, reason: 'Штрих-код слишком короткий' };
    }
    
    // Все остальное разрешаем - библиотека уже проверила формат
    // Не проверяем контрольную сумму - многие реальные коды имеют неверную
    return { valid: true };
}

// Очистка устаревших записей из кэша
function cleanCache() {
    const now = Date.now();
    for (const [key, value] of productCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            productCache.delete(key);
        }
    }
}

// API функции
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Ошибка сервера' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API ошибка:', error);
        throw error;
    }
}

// Загрузка всех товаров
async function loadProducts() {
    try {
        const products = await apiRequest('/products');
        console.log('Загружено товаров:', products?.length || 0);
        if (products && products.length > 0) {
            console.log('Пример товара:', products[0]);
        }
        return products || [];
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        console.error('Детали ошибки:', {
            message: error.message,
            stack: error.stack
        });
        showNotification('Ошибка загрузки товаров: ' + (error.message || 'Неизвестная ошибка'), 'error');
        return [];
    }
}

// Поиск товара по штрих-коду с повторными попытками и кэшированием
async function findProductByBarcode(barcode, retries = 2) {
    // Нормализация штрих-кода (убрать пробелы, привести к строке)
    const normalizedBarcode = String(barcode).trim();
    
    // Очистка устаревших записей
    cleanCache();
    
    // Проверка кэша
    const cached = productCache.get(normalizedBarcode);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log('Товар найден в кэше:', normalizedBarcode);
        return cached.product;
    }
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const product = await apiRequest(`/products/barcode/${encodeURIComponent(normalizedBarcode)}`);
            if (product) {
                // Сохранить в кэш
                productCache.set(normalizedBarcode, {
                    product: product,
                    timestamp: Date.now()
                });
                return product;
            }
        } catch (error) {
            if (error.message.includes('404')) {
                // Товар не найден - это нормально, не нужно повторять
                // Кэшируем null результат на короткое время (30 секунд)
                productCache.set(normalizedBarcode, {
                    product: null,
                    timestamp: Date.now()
                });
                return null;
            }
            
            // Ошибка сети или сервера - повторить попытку
            if (attempt < retries) {
                console.log(`Попытка ${attempt + 1} не удалась, повторяю...`);
                await new Promise(resolve => setTimeout(resolve, 300)); // Задержка 300мс
                continue;
            }
            
            console.error('Ошибка поиска товара после всех попыток:', error);
            return null;
        }
    }
    
    return null;
}

// Добавление товара
async function addProduct(name, barcode, quantity, price, purchase_price) {
    try {
        return await apiRequest('/products', {
            method: 'POST',
            body: JSON.stringify({
                name: name.trim(),
                barcode: barcode.trim(),
                quantity: parseInt(quantity) || 0,
                price: parseFloat(price) || 0,
                purchase_price: parseFloat(purchase_price) || 0
            })
        });
    } catch (error) {
        if (error.message.includes('уже существует')) {
            showNotification('Товар с таким штрих-кодом уже существует', 'error');
        } else {
            showNotification('Ошибка добавления товара', 'error');
        }
        throw error;
    }
}

// Продажа товара (уменьшить на 1)
async function sellProduct(productId, price = null, purchasePrice = null) {
    try {
        const body = {};
        if (price !== null) body.price = price;
        if (purchasePrice !== null) body.purchase_price = purchasePrice;
        return await apiRequest(`/products/${productId}/sell`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    } catch (error) {
        if (error.message.includes('закончился')) {
            showNotification('Товар закончился на складе', 'error');
        } else {
            showNotification('Ошибка продажи товара', 'error');
        }
        throw error;
    }
}

// Прием товара (увеличить количество)
async function receiveProduct(productId, quantity) {
    try {
        return await apiRequest(`/products/${productId}/receive`, {
            method: 'POST',
            body: JSON.stringify({ quantity: parseInt(quantity) })
        });
    } catch (error) {
        showNotification('Ошибка приема товара', 'error');
        throw error;
    }
}

// Воспроизвести звук успеха
function playBeepSound() {
    try {
        // Создаем простой звуковой сигнал через Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800; // Частота звука (Гц) - высокий тон для успеха
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
    } catch (error) {
        console.log('Не удалось воспроизвести звук:', error);
    }
}

// Воспроизвести звук ошибки
function playErrorSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 400; // Низкий тон для ошибки
        oscillator.type = 'sawtooth';
        
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.log('Не удалось воспроизвести звук ошибки:', error);
    }
}

// Вибрация (для мобильных устройств)
function vibrate(pattern = [50]) {
    if ('vibrate' in navigator) {
        try {
            navigator.vibrate(pattern);
        } catch (error) {
            console.log('Вибрация не поддерживается:', error);
        }
    }
}

// Показать уведомление
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');
    
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}

// Остановка сканера
function stopScanner(scannerId) {
    if (currentScanner) {
        currentScanner.stop().then(() => {
            currentScanner.clear();
            currentScanner = null;
        }).catch(err => {
            console.error('Ошибка остановки сканера:', err);
        });
    }
}

// Проверка доступности камеры
async function checkCameraAvailability() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('Доступные камеры:', videoDevices.length);
        return videoDevices.length > 0;
    } catch (error) {
        console.error('Ошибка проверки камеры:', error);
        return false;
    }
}

// Запуск сканера
async function startScanner(readerId, onSuccess) {
    try {
        // Проверка доступности камеры
        const hasCamera = await checkCameraAvailability();
        if (!hasCamera) {
            throw new Error('Камера не найдена на устройстве');
        }
        
        // Остановить предыдущий сканер
        if (currentScanner) {
            await stopScanner();
        }

        const readerElement = document.getElementById(readerId);
        if (!readerElement) {
            console.error('Элемент сканера не найден:', readerId);
            return;
        }

        // Очистить предыдущий контент
        readerElement.innerHTML = '';

        currentScanner = new Html5Qrcode(readerId);

        // Адаптивная область сканирования на основе размера экрана
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const minSize = Math.min(screenWidth, screenHeight);
        // Используем 70% от минимального размера, но не меньше 250 и не больше 400
        const qrboxSize = Math.max(250, Math.min(400, Math.floor(minSize * 0.7)));
        
        // Проверка доступности библиотеки
        if (typeof Html5Qrcode === 'undefined') {
            throw new Error('Библиотека html5-qrcode не загружена. Проверьте подключение скрипта.');
        }
        
        if (typeof Html5QrcodeSupportedFormats === 'undefined') {
            throw new Error('Html5QrcodeSupportedFormats не определен. Проверьте версию библиотеки.');
        }
        
        console.log('Библиотека html5-qrcode загружена, версия:', Html5Qrcode?.version || 'неизвестна');

        const config = {
            fps: 30, // Увеличена частота кадров для лучшего распознавания
            qrbox: { width: qrboxSize, height: qrboxSize }, // Адаптивный размер области сканирования
            aspectRatio: 1.0,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ],
            // Дополнительные настройки для лучшего распознавания
            disableFlip: false, // Разрешить переворот изображения
            rememberLastUsedCameraId: true // Запоминать последнюю использованную камеру
        };
        
        console.log('Конфигурация сканера:', {
            fps: config.fps,
            qrbox: config.qrbox,
            formats: config.formatsToSupport.map(f => f?.name || f)
        });
        
        // Включить экспериментальные функции для лучшего распознавания (если доступны)
        if (typeof Html5Qrcode !== 'undefined' && Html5Qrcode.getCameras) {
            console.log('Используются улучшенные настройки распознавания');
        }
        
        console.log('Запуск сканера с настройками:', {
            readerId,
            facingMode: 'environment',
            fps: config.fps,
            qrbox: config.qrbox
        });

        // Настройки камеры
        // html5-qrcode сам управляет потоком камеры
        // Автофокус будет работать автоматически, если устройство его поддерживает
        const cameraConfig = {
            facingMode: "environment"
        };
        
        // Обработчик успешного распознавания - максимально простой
        const onScanSuccess = (decodedText, decodedResult) => {
            const barcode = String(decodedText).trim();
            console.log('Штрих-код отсканирован:', barcode);
            
            // Просто вызываем обработчик - все проверки в handleSale/handleReceive
            onSuccess(barcode);
        };
        
        // Обработчик ошибок сканирования
        const onScanError = (errorMessage) => {
            // Логируем все ошибки для диагностики
            if (errorMessage.includes('NotFoundException') || 
                errorMessage.includes('No QR code') ||
                errorMessage.includes('QR code parse error') ||
                errorMessage.includes('No MultiFormat Readers')) {
                // Это нормально - просто не нашли код в кадре, не логируем каждый раз
                return;
            }
            
            // Другие ошибки логируем для диагностики
            console.warn('Ошибка сканирования:', errorMessage);
            
            // Если ошибка повторяется часто, показываем пользователю
            if (errorMessage.includes('Permission denied') || 
                errorMessage.includes('NotAllowedError')) {
                showNotification('Нет доступа к камере. Проверьте разрешения.', 'error');
            }
        };
        
        console.log('Запуск сканера...');
        await currentScanner.start(
            cameraConfig,
            config,
            onScanSuccess,
            onScanError
        );
        
        console.log('✓ Сканер успешно запущен');
    } catch (err) {
        console.error('Ошибка запуска камеры:', err);
        console.error('Детали ошибки:', {
            name: err.name,
            message: err.message,
            stack: err.stack
        });
        
        let errorMessage = 'Не удалось запустить камеру. ';
        if (err.message) {
            if (err.message.includes('Permission denied') || err.message.includes('NotAllowedError')) {
                errorMessage += 'Разрешите доступ к камере в настройках браузера.';
            } else if (err.message.includes('NotFoundError') || err.message.includes('No camera')) {
                errorMessage += 'Камера не найдена. Проверьте подключение.';
            } else if (err.message.includes('NotReadableError') || err.message.includes('TrackStartError')) {
                errorMessage += 'Камера занята другим приложением. Закройте другие приложения.';
            } else {
                errorMessage += err.message;
            }
        } else {
            errorMessage += 'Проверьте разрешения и настройки браузера.';
        }
        
        showNotification(errorMessage, 'error');
    }
}

// Переключение вида
function switchView(viewName) {
    // Скрыть все виды
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    // Показать выбранный вид
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.classList.add('active');
    }

    // Обновить активную кнопку навигации
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // Остановить сканер при переключении
    if (currentScanner) {
        stopScanner();
    }

    // Очистить корзину при переключении с продажи
    if (viewName !== 'sale') {
        saleCart = [];
        renderSaleCart();
    }
    document.getElementById('receive-form')?.classList.add('hidden');
}

// Добавить товар в корзину продажи
function addToSaleCart(product) {
    // Проверить, есть ли товар уже в корзине
    const existingItem = saleCart.find(item => item.id === product.id);
    
    if (existingItem) {
        // Товар уже в корзине - обновить информацию об остатке и показать сообщение
        existingItem.quantity = product.quantity; // Обновить остаток
        existingItem.name = product.name;
        renderSaleCart();
        
        // Звук ошибки (более низкий тон)
        playErrorSound();
        vibrate([100, 50, 100]); // Двойная вибрация для ошибки
        
        showNotification(`Товар "${product.name}" уже есть в корзине. Используйте кнопки +/- для изменения количества.`, 'error');
        return;
    }

    // Добавить новый товар
    if (product.quantity <= 0) {
        showNotification('Товар закончился на складе', 'error');
        return;
    }

    saleCart.push({
        ...product,
        quantityInCart: 1
    });
    
    renderSaleCart();
    
    // Звук и вибрация при добавлении товара
    playBeepSound();
    vibrate([50]); // Короткая вибрация 50мс
    
    showNotification(`${product.name} добавлен в корзину`, 'success');
    
    // Визуальная подсветка последнего добавленного товара
    highlightLastCartItem();
}

// Удалить товар из корзины
function removeFromSaleCart(productId) {
    saleCart = saleCart.filter(item => item.id !== productId);
    renderSaleCart();
}

// Изменить количество товара в корзине
async function updateCartItemQuantity(productId, change) {
    const item = saleCart.find(item => item.id === productId);
    if (!item) return;
    
    // Обновить информацию о товаре перед изменением количества
    try {
        const currentProduct = await findProductByBarcode(item.barcode);
        if (currentProduct) {
            item.quantity = currentProduct.quantity;
        }
    } catch (error) {
        console.error('Ошибка обновления информации о товаре:', error);
    }
    
    const newQuantity = item.quantityInCart + change;
    
    if (newQuantity <= 0) {
        removeFromSaleCart(productId);
        return;
    }
    
    if (newQuantity > item.quantity) {
        showNotification('Недостаточно товара на складе', 'error');
        return;
    }
    
    item.quantityInCart = newQuantity;
    renderSaleCart();
}

// Отобразить корзину продажи
function renderSaleCart() {
    const cartItems = document.getElementById('sale-cart-items');
    const cartEmpty = document.getElementById('sale-cart-empty');
    const cartFooter = document.getElementById('sale-cart-footer');
    const clearBtn = document.getElementById('btn-clear-cart');
    
    // Проверка существования элементов
    if (!cartItems || !cartEmpty || !cartFooter) {
        console.error('Элементы корзины не найдены в DOM:', {
            cartItems: !!cartItems,
            cartEmpty: !!cartEmpty,
            cartFooter: !!cartFooter
        });
        return;
    }
    
    console.log('renderSaleCart вызван, товаров в корзине:', saleCart.length);
    
    if (saleCart.length === 0) {
        cartItems.classList.add('hidden');
        cartEmpty.classList.remove('hidden');
        cartFooter.classList.add('hidden');
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }
    
    cartItems.classList.remove('hidden');
    cartEmpty.classList.add('hidden');
    cartFooter.classList.remove('hidden');
    if (clearBtn) clearBtn.style.display = 'block';
    
    // Подсчитать общее количество
    const totalCount = saleCart.reduce((sum, item) => sum + (parseInt(item.quantityInCart) || 0), 0);
    const totalCountEl = document.getElementById('cart-total-count');
    if (totalCountEl) {
        totalCountEl.textContent = totalCount;
    }
    
    // Подсчитать общую сумму
    const totalAmount = saleCart.reduce((sum, item) => {
        const price = parseFloat(item.price) || 0;
        const quantityInCart = parseInt(item.quantityInCart) || 1;
        return sum + (price * quantityInCart);
    }, 0);
    
    // Отобразить товары
    try {
        cartItems.innerHTML = saleCart.map((item, index) => {
            // Безопасная обработка данных товара
            const price = parseFloat(item.price) || 0;
            const quantityInCart = parseInt(item.quantityInCart) || 1;
            const itemTotal = price * quantityInCart;
            
            return `
            <div class="cart-item" data-item-id="${item.id}" data-item-index="${index}">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.name || 'Без названия')}</div>
                    <div class="cart-item-details">
                        ${price > 0 ? `<span class="cart-item-price">${price.toFixed(2)} сум × ${quantityInCart} = <strong>${itemTotal.toFixed(2)} сум</strong></span>` : '<span class="cart-item-price">Цена не указана</span>'}
                    </div>
                </div>
                <div class="cart-item-controls">
                    <button class="btn-quantity" onclick="updateCartItemQuantity('${item.id}', -1)">−</button>
                    <span class="cart-item-quantity">${quantityInCart}</span>
                    <button class="btn-quantity" onclick="updateCartItemQuantity('${item.id}', 1)">+</button>
                    <button class="btn-remove" onclick="removeFromSaleCart('${item.id}')" title="Удалить">×</button>
                </div>
            </div>
            `;
        }).join('');
        console.log('Товары отображены в корзине:', saleCart.length);
    } catch (error) {
        console.error('Ошибка при отображении товаров в корзине:', error);
        cartItems.innerHTML = '<div class="warehouse-empty">Ошибка отображения товаров</div>';
    }
    
    // Обновить итоговую сумму в футере
    const cartTotalCount = saleCart.reduce((sum, item) => sum + (parseInt(item.quantityInCart) || 0), 0);
    if (totalCountEl) {
        if (totalAmount > 0) {
            totalCountEl.innerHTML = `${cartTotalCount} товаров на сумму <strong>${totalAmount.toFixed(2)} сум</strong>`;
        } else {
            totalCountEl.textContent = cartTotalCount;
        }
    }
}

// Подсветить последний добавленный товар
function highlightLastCartItem() {
    if (saleCart.length === 0) return;
    
    // Найти последний товар в DOM (он всегда последний в списке)
    const cartItems = document.querySelectorAll('.cart-item');
    if (cartItems.length > 0) {
        const lastItem = cartItems[cartItems.length - 1];
        lastItem.classList.add('cart-item-highlight');
        
        // Прокрутить к последнему товару
        lastItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Убрать подсветку через 2 секунды
        setTimeout(() => {
            lastItem.classList.remove('cart-item-highlight');
        }, 2000);
    }
}

// Продажа товара (обработка сканирования)
async function handleSale(barcode) {
    console.log('=== handleSale вызван ===');
    console.log('Штрих-код:', barcode);
    
    // Защита от повторных сканирований одного кода
    const now = Date.now();
    if (lastScannedBarcode === barcode && (now - lastScanTime) < SCAN_DEBOUNCE_TIME) {
        console.log('Пропущено повторное сканирование того же кода (debounce)');
        return;
    }
    
    lastScannedBarcode = barcode;
    lastScanTime = now;
    
    console.log('Начинаем обработку штрих-кода:', barcode);
    
    // Показать индикатор загрузки
    showNotification('Поиск товара...', 'success');
    
    // Поиск товара с повторными попытками
    console.log('Ищем товар в базе...');
    const product = await findProductByBarcode(barcode, 2);
    console.log('Результат поиска:', product ? `найден: ${product.name}` : 'не найден');
    
    if (!product) {
        // Показать уведомление
        showNotification('Товар не найден. Попробуйте отсканировать еще раз.', 'error');
        
        // Показать подсказку с кнопкой добавления (не открывать автоматически)
        const prompt = document.getElementById('sale-add-product-prompt');
        const addBtn = document.getElementById('btn-add-missing-product');
        
        // Сохранить штрих-код для кнопки
        if (addBtn) {
            addBtn.dataset.barcode = barcode;
        }
        
        if (prompt) {
            prompt.classList.remove('hidden');
            
            // Скрыть подсказку через 5 секунд или при следующем сканировании
        setTimeout(() => {
                prompt.classList.add('hidden');
            }, 5000);
        }
        
        return;
    }

    // Скрыть подсказку если товар найден
    const prompt = document.getElementById('sale-add-product-prompt');
    if (prompt) {
        prompt.classList.add('hidden');
    }

    // Добавить в корзину
    addToSaleCart(product);
}

// Продать все товары из корзины
async function sellAllFromCart() {
    if (saleCart.length === 0) {
        showNotification('Корзина пуста', 'error');
        return;
    }
    
    try {
        // Продать каждый товар нужное количество
        const soldItems = [];
        const errors = [];
        let totalAmount = 0;
        
        for (const item of saleCart) {
            // Проверить остаток перед продажей
            const currentProduct = await findProductByBarcode(item.barcode);
            if (!currentProduct) {
                errors.push(`Товар "${item.name}" больше не существует`);
                continue;
            }
            
            if (currentProduct.quantity < item.quantityInCart) {
                errors.push(`Недостаточно "${item.name}" на складе (остаток: ${currentProduct.quantity})`);
                continue;
            }
            
            // Продать нужное количество за один раз
            try {
                const price = currentProduct.price || 0;
                const purchasePrice = currentProduct.purchase_price || 0;
                const itemTotal = price * item.quantityInCart;
                totalAmount += itemTotal;
                
                // Продать товар нужное количество раз
                for (let i = 0; i < item.quantityInCart; i++) {
                    const updatedProduct = await sellProduct(item.id, price, purchasePrice, currentSessionId);
                    soldItems.push(updatedProduct);
                }
            } catch (error) {
                errors.push(`Ошибка продажи "${item.name}"`);
            }
        }
        
        // Показать результат
        const totalCount = soldItems.length;
        if (totalCount > 0) {
            const message = totalAmount > 0 
                ? `Продано товаров: ${totalCount} на сумму ${totalAmount.toFixed(2)} сум`
                : `Продано товаров: ${totalCount}`;
            showNotification(message, 'success');
        }
        
        if (errors.length > 0) {
            console.error('Ошибки при продаже:', errors);
            showNotification(`Продано: ${totalCount}, ошибок: ${errors.length}`, 'error');
        }
        
        // Очистить корзину
        saleCart = [];
        renderSaleCart();
        
        // Закрыть сессию и вернуться к выбору сессий
        await closeSessionAndReturn();
        
        // Обновить склад если открыт
        const activeView = document.querySelector('.view.active');
        if (activeView && activeView.id === 'view-warehouse') {
            await renderWarehouse();
        }
    } catch (error) {
        console.error('Ошибка при продаже товаров:', error);
        showNotification('Ошибка при продаже товаров', 'error');
    }
}

// Очистить корзину
async function clearSaleCart() {
    saleCart = [];
    renderSaleCart();
    showNotification('Корзина очищена', 'success');
    
    // Закрыть сессию и вернуться к выбору сессий
    await closeSessionAndReturn();
}

// Сделать функции глобальными для onclick
window.updateCartItemQuantity = updateCartItemQuantity;
window.removeFromSaleCart = removeFromSaleCart;

// Информация о товаре (новая функция для вкладки "О товаре")
async function handleProductInfo(barcode) {
    // Валидация штрих-кода перед обработкой
    const validation = validateBarcode(barcode);
    if (!validation.valid) {
        showNotification(`Неверный штрих-код: ${validation.reason}`, 'error');
        playErrorSound();
        return;
    }
    
    // Защита от повторных сканирований
    const now = Date.now();
    if (lastScannedBarcode === barcode && (now - lastScanTime) < SCAN_DEBOUNCE_TIME) {
        console.log('Пропущено повторное сканирование того же кода');
        return;
    }
    
    lastScannedBarcode = barcode;
    lastScanTime = now;
    
    const product = await findProductByBarcode(barcode, 2);
    
    if (!product) {
        showNotification('Товар не найден. Попробуйте отсканировать еще раз или добавьте в склад.', 'error');
        document.getElementById('product-info-panel').classList.add('hidden');
        return;
    }

    // Показать информацию о товаре
    document.getElementById('product-info-name').textContent = product.name;
    document.getElementById('product-info-barcode').textContent = product.barcode;
    document.getElementById('product-info-quantity').textContent = product.quantity;
    const price = product.price || 0;
    const purchasePrice = product.purchase_price || 0;
    const profit = price - purchasePrice;
    const priceEl = document.getElementById('product-info-price');
    if (priceEl) {
        let priceText = '';
        if (price > 0) {
            priceText = `Продажа: ${price.toFixed(2)} сум`;
        if (purchasePrice > 0) {
                priceText += ` | Закупка: ${purchasePrice.toFixed(2)} сум`;
            if (profit > 0) {
                    priceText += ` | Прибыль: <strong style="color: var(--success);">${profit.toFixed(2)} сум</strong>`;
                }
            }
        } else {
            priceText = 'Не указана';
        }
        priceEl.innerHTML = priceText;
    }
    
    // Форматирование дат
    if (product.created_at) {
        const createdDate = new Date(product.created_at);
        document.getElementById('product-info-created').textContent = createdDate.toLocaleString('ru-RU');
    } else {
        document.getElementById('product-info-created').textContent = 'Не указана';
    }
    
    if (product.updated_at) {
        const updatedDate = new Date(product.updated_at);
        document.getElementById('product-info-updated').textContent = updatedDate.toLocaleString('ru-RU');
    } else {
        document.getElementById('product-info-updated').textContent = 'Не указана';
    }
    
    // Сохранить ID товара для кнопок действий
    document.getElementById('product-info-panel').dataset.productId = product.id;
    document.getElementById('product-info-panel').dataset.product = JSON.stringify(product);
    
    // Показать панель информации
    document.getElementById('product-info-panel').classList.remove('hidden');
    
    // Звук и вибрация
    playSuccessSound();
    vibrate([50]);
}

// Открыть модальное окно приема товара
function openReceiveModal(product = null) {
    const modal = document.getElementById('modal-receive-product');
    const scannerContainer = document.getElementById('receive-scanner-container');
    const productInfo = document.getElementById('receive-product-info');
    const submitBtn = document.getElementById('btn-submit-receive');
    
    if (product) {
        // Если товар передан, заполнить форму
        document.getElementById('receive-product-id').value = product.id;
    document.getElementById('receive-product-name').textContent = product.name;
        document.getElementById('receive-product-barcode').textContent = product.barcode;
        document.getElementById('receive-product-stock').textContent = product.quantity;
        scannerContainer.classList.add('hidden');
        productInfo.classList.remove('hidden');
        submitBtn.disabled = false;
    } else {
        // Если товар не передан, нужно будет сканировать
        document.getElementById('receive-product-id').value = '';
        document.getElementById('receive-product-name').textContent = 'Отсканируйте штрих-код товара';
        document.getElementById('receive-product-barcode').textContent = '-';
        document.getElementById('receive-product-stock').textContent = '-';
        scannerContainer.classList.add('hidden');
        productInfo.classList.remove('hidden');
        submitBtn.disabled = true;
    }
    
    document.getElementById('receive-product-quantity').value = 1;
    modal.classList.remove('hidden');
}

// Обработка сканирования в модальном окне приема
async function handleReceiveModalScan(barcode) {
    const product = await findProductByBarcode(barcode, 2);
    
    if (!product) {
        showNotification('Товар не найден. Попробуйте отсканировать еще раз или добавьте в склад.', 'error');
        return;
    }
    
    // Заполнить форму данными товара
    document.getElementById('receive-product-id').value = product.id;
    document.getElementById('receive-product-name').textContent = product.name;
    document.getElementById('receive-product-barcode').textContent = product.barcode;
    document.getElementById('receive-product-stock').textContent = product.quantity;
    
    // Скрыть сканер и показать информацию
    document.getElementById('receive-scanner-container').classList.add('hidden');
    document.getElementById('receive-product-info').classList.remove('hidden');
    document.getElementById('btn-submit-receive').disabled = false;
    
    // Остановить сканер
    await stopScanner();
    
    playSuccessSound();
    vibrate([50]);
}

// Подтверждение приема
async function confirmReceive() {
    if (!currentProduct) return;

    const quantity = parseInt(document.getElementById('receive-quantity').value);
    if (isNaN(quantity) || quantity <= 0) {
        showNotification('Введите корректное количество', 'error');
        return;
    }

    try {
        const updatedProduct = await receiveProduct(currentProduct.id, quantity);
        showNotification(`Принято: ${updatedProduct.name}. Остаток: ${updatedProduct.quantity}`, 'success');

    // Сброс
    document.getElementById('receive-form').classList.add('hidden');
    currentProduct = null;
    currentBarcode = null;
        
        // Обновить склад если открыт
        const activeView = document.querySelector('.view.active');
        if (activeView && activeView.id === 'view-warehouse') {
            await renderWarehouse();
        }
    } catch (error) {
        // Ошибка уже обработана в receiveProduct
    }
}

// Отображение склада
let allProducts = []; // Храним все товары для поиска

async function renderWarehouse(filteredProducts = null) {
    const list = document.getElementById('warehouse-list');
    
    if (!list) {
        console.error('Элемент warehouse-list не найден в DOM');
        return;
    }
    
    try {
        const products = filteredProducts || await loadProducts();
        allProducts = products; // Сохраняем для поиска
        
        if (!Array.isArray(products)) {
            console.error('loadProducts вернул не массив:', products);
            list.innerHTML = '<div class="warehouse-empty">Ошибка: неверный формат данных</div>';
            return;
        }
    
    if (products.length === 0) {
        list.innerHTML = '<div class="warehouse-empty">Склад пуст. Добавьте товары.</div>';
        return;
    }

        list.innerHTML = products.map(product => {
            // Безопасная обработка цен (может быть null, undefined, или строка)
            const price = parseFloat(product.price) || 0;
            const purchasePrice = parseFloat(product.purchase_price) || 0;
            const profit = price > 0 && purchasePrice > 0 ? price - purchasePrice : 0;
            
            return `
            <div class="warehouse-item" data-product-id="${product.id}">
            <div class="warehouse-item-header">
                    <div class="warehouse-item-info">
                        <div class="warehouse-item-name">${escapeHtml(product.name || 'Без названия')}</div>
                        <div class="warehouse-item-barcode">Штрих-код: ${escapeHtml(product.barcode || 'Не указан')}</div>
                        ${price > 0 ? `<div class="warehouse-item-price">Продажа: ${price.toFixed(2)} сум</div>` : ''}
                        ${purchasePrice > 0 ? `<div class="warehouse-item-purchase-price">Закупка: ${purchasePrice.toFixed(2)} сум</div>` : ''}
                        ${profit > 0 ? `<div class="warehouse-item-profit">Прибыль: ${profit.toFixed(2)} сум</div>` : ''}
                </div>
                    <div class="warehouse-item-stock">${product.quantity || 0}</div>
            </div>
                <div class="warehouse-item-actions">
                    <button class="btn-edit" data-product-id="${product.id}" data-action="edit" title="Редактировать">✏️</button>
                    <button class="btn-delete" data-product-id="${product.id}" data-action="delete" title="Удалить">🗑️</button>
        </div>
            </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Ошибка при отображении склада:', error);
        console.error('Детали ошибки:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        list.innerHTML = `<div class="warehouse-empty">Ошибка загрузки склада: ${error.message || 'Неизвестная ошибка'}</div>`;
    }
}

// Обновление товара
async function updateProduct(id, name, barcode, quantity, price, purchase_price) {
    try {
        return await apiRequest(`/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, barcode, quantity, price, purchase_price })
        });
    } catch (error) {
        if (error.message.includes('уже существует')) {
            showNotification('Товар с таким штрих-кодом уже существует', 'error');
        } else {
            showNotification('Ошибка обновления товара', 'error');
        }
        throw error;
    }
}

// Удаление товара
async function deleteProduct(id) {
    try {
        await apiRequest(`/products/${id}`, {
            method: 'DELETE'
        });
        showNotification('Товар удален', 'success');
        await renderWarehouse();
    } catch (error) {
        showNotification('Ошибка удаления товара', 'error');
        throw error;
    }
}

// Редактирование товара
async function editProduct(id) {
    // Если товар не найден в allProducts, загружаем его из API
    let product = allProducts.find(p => p.id === id);
    
    if (!product) {
        try {
            product = await apiRequest(`/products/${id}`);
        } catch (error) {
            showNotification('Товар не найден', 'error');
            return;
        }
    }
    
    // Заполнить форму редактирования
    const editIdEl = document.getElementById('edit-product-id');
    const editNameEl = document.getElementById('edit-product-name');
    const editBarcodeEl = document.getElementById('edit-product-barcode');
    const editQuantityEl = document.getElementById('edit-product-quantity');
    const editPriceEl = document.getElementById('edit-product-price');
    const editPurchasePriceEl = document.getElementById('edit-product-purchase-price');
    
    if (!editIdEl || !editNameEl || !editBarcodeEl || !editQuantityEl || !editPriceEl || !editPurchasePriceEl) {
        console.error('Не найдены элементы формы редактирования:', {
            editIdEl: !!editIdEl,
            editNameEl: !!editNameEl,
            editBarcodeEl: !!editBarcodeEl,
            editQuantityEl: !!editQuantityEl,
            editPriceEl: !!editPriceEl,
            editPurchasePriceEl: !!editPurchasePriceEl
        });
        showNotification('Ошибка: форма редактирования не найдена', 'error');
        return;
    }
    
    editIdEl.value = product.id;
    editNameEl.value = product.name;
    editBarcodeEl.value = product.barcode;
    editQuantityEl.value = product.quantity;
    editPriceEl.value = product.price || 0;
    editPurchasePriceEl.value = product.purchase_price || 0;
    
    // Показать модальное окно
    document.getElementById('modal-edit-product').classList.remove('hidden');
}

// Подтверждение удаления товара
async function deleteProductConfirm(id) {
    // Если товар не найден в allProducts, загружаем его из API
    let product = allProducts.find(p => p.id === id);
    
    if (!product) {
        try {
            product = await apiRequest(`/products/${id}`);
        } catch (error) {
            showNotification('Товар не найден', 'error');
            return;
        }
    }
    
    if (confirm(`Удалить товар "${product.name}"?`)) {
        await deleteProduct(id);
    }
}

// Поиск товаров
function searchProducts(query) {
    if (!query || query.trim() === '') {
        renderWarehouse();
        return;
    }
    
    const searchTerm = query.toLowerCase().trim();
    const filtered = allProducts.filter(product => 
        product.name.toLowerCase().includes(searchTerm) ||
        product.barcode.includes(searchTerm)
    );
    
    renderWarehouse(filtered);
}

// Загрузка истории операций
async function loadHistory() {
    try {
        return await apiRequest('/history?limit=200');
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        showNotification('Ошибка загрузки истории', 'error');
        return [];
    }
}

// Отображение истории операций
let allHistory = [];

async function renderHistory(filteredHistory = null) {
    const list = document.getElementById('history-list');
    
    try {
        const history = filteredHistory || await loadHistory();
        allHistory = history;
        
        if (history.length === 0) {
            list.innerHTML = '<div class="warehouse-empty">История операций пуста</div>';
            return;
        }

        list.innerHTML = history.map(item => {
            const date = new Date(item.created_at);
            const dateStr = date.toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const operationIcon = item.operation_type === 'sale' ? '💰' : '📦';
            const operationText = item.operation_type === 'sale' ? 'Продажа' : 'Приемка';
            const operationColor = item.operation_type === 'sale' ? 'var(--error)' : 'var(--success)';
            
            return `
                <div class="history-item">
                    <div class="history-item-header">
                        <div class="history-item-icon" style="color: ${operationColor}">${operationIcon}</div>
                        <div class="history-item-info">
                            <div class="history-item-name">${escapeHtml(item.product_name)}</div>
                            <div class="history-item-barcode">${escapeHtml(item.product_barcode)}</div>
                            <div class="history-item-date">${dateStr}</div>
                        </div>
                        <div class="history-item-details">
                            <div class="history-item-type">${operationText}</div>
                            <div class="history-item-quantity">${item.quantity > 0 ? '+' : ''}${item.quantity}</div>
                            <div class="history-item-stock">${item.quantity_before} → ${item.quantity_after}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        list.innerHTML = '<div class="warehouse-empty">Ошибка загрузки истории</div>';
    }
}

// Поиск в истории
function searchHistory(query) {
    if (!query || query.trim() === '') {
        renderHistory();
        return;
    }
    
    const searchTerm = query.toLowerCase().trim();
    const filtered = allHistory.filter(item => 
        item.product_name.toLowerCase().includes(searchTerm) ||
        item.product_barcode.includes(searchTerm)
    );
    
    renderHistory(filtered);
}

// Работа с сессиями
async function createNewSession() {
    try {
        const session = await apiRequest('/sessions', {
            method: 'POST'
        });
        currentSessionId = session.id;
        currentSessionNumber = session.session_number;
        await loadOpenSessions();
        showSaleInterface();
        showNotification(`Сессия ${currentSessionNumber} начата`, 'success');
    } catch (error) {
        console.error('Ошибка создания сессии:', error);
        showNotification('Ошибка создания сессии', 'error');
    }
}

async function loadOpenSessions() {
    try {
        const sessions = await apiRequest('/sessions/open');
        renderSessionsList(sessions);
        return sessions;
    } catch (error) {
        console.error('Ошибка загрузки сессий:', error);
        return [];
    }
}

function renderSessionsList(sessions) {
    const listEl = document.getElementById('open-sessions-list');
    if (!listEl) return;
    
    if (sessions.length === 0) {
        listEl.innerHTML = '';
        return;
    }
    
    listEl.innerHTML = sessions.map(session => `
        <button class="btn-session" data-session-id="${session.id}" data-session-number="${session.session_number}">
            Сессия ${session.session_number}
        </button>
    `).join('');
}

async function selectSession(sessionId) {
    try {
        const session = await apiRequest(`/sessions/${sessionId}`);
        currentSessionId = session.id;
        currentSessionNumber = session.session_number;
        
        // Загрузить продажи этой сессии для восстановления корзины
        await loadSessionCart(sessionId);
        
        showSaleInterface();
        showNotification(`Сессия ${currentSessionNumber} активирована`, 'success');
    } catch (error) {
        console.error('Ошибка выбора сессии:', error);
        showNotification('Ошибка выбора сессии', 'error');
    }
}

// Загрузить корзину из продаж сессии
async function loadSessionCart(sessionId) {
    try {
        const sales = await apiRequest(`/sessions/${sessionId}/sales`);
        
        // Группируем продажи по товарам и суммируем количество
        const cartMap = new Map();
        
        for (const sale of sales) {
            const productId = sale.product_id;
            
            if (cartMap.has(productId)) {
                const item = cartMap.get(productId);
                item.quantityInCart += sale.quantity;
            } else {
                // Получаем актуальную информацию о товаре
                const product = await findProductByBarcode(sale.product_barcode);
                if (product) {
                    cartMap.set(productId, {
                        ...product,
                        quantityInCart: sale.quantity
                    });
                }
            }
        }
        
        // Преобразуем Map в массив
        saleCart = Array.from(cartMap.values());
        renderSaleCart();
        
        console.log(`Загружено ${saleCart.length} товаров из сессии ${currentSessionNumber}`);
    } catch (error) {
        console.error('Ошибка загрузки корзины сессии:', error);
        // Если не удалось загрузить, просто очищаем корзину
        saleCart = [];
        renderSaleCart();
    }
}


function showSessionsSelector() {
    document.getElementById('sessions-selector').classList.remove('hidden');
    document.getElementById('sale-scanner-section').classList.add('hidden');
    document.getElementById('sale-cart').classList.add('hidden');
    document.getElementById('btn-clear-cart').style.display = 'none';
    document.getElementById('btn-back-to-sessions').style.display = 'none';
    if (currentScanner) {
        stopScanner();
    }
}

function showSaleInterface() {
    document.getElementById('sessions-selector').classList.add('hidden');
    const scannerSection = document.getElementById('sale-scanner-section');
    if (scannerSection) {
        scannerSection.classList.remove('hidden');
    }
    document.getElementById('sale-cart').classList.remove('hidden');
    document.getElementById('btn-back-to-sessions').style.display = 'block';
    document.getElementById('btn-clear-cart').style.display = saleCart.length > 0 ? 'block' : 'none';
    
    // Запустить сканер после небольшой задержки, чтобы DOM обновился
    setTimeout(() => {
        const readerElement = document.getElementById('reader-sale');
        if (readerElement) {
            startScanner('reader-sale', handleSale).catch(error => {
                console.error('Ошибка запуска сканера:', error);
                showNotification('Не удалось запустить камеру. Проверьте разрешения.', 'error');
            });
        } else {
            console.error('Элемент reader-sale не найден в DOM');
            showNotification('Ошибка: элемент сканера не найден', 'error');
        }
    }, 500);
}

async function closeSessionAndReturn() {
    if (!currentSessionId) {
        showSessionsSelector();
        return;
    }
    
    try {
        await apiRequest(`/sessions/${currentSessionId}/close`, {
            method: 'POST'
        });
        showNotification(`Сессия ${currentSessionNumber} закрыта`, 'success');
        currentSessionId = null;
        currentSessionNumber = null;
        saleCart = [];
        renderSaleCart();
        await loadOpenSessions();
        showSessionsSelector();
    } catch (error) {
        console.error('Ошибка закрытия сессии:', error);
        showNotification('Ошибка закрытия сессии', 'error');
    }
}

async function returnToSessionsSelector() {
    // Просто вернуться к выбору сессий, НЕ закрывая сессию
    saleCart = [];
    renderSaleCart();
    currentSessionId = null;
    currentSessionNumber = null;
    await loadOpenSessions();
    showSessionsSelector();
}

// Загрузка статистики
async function loadStats(period = 'day') {
    try {
        return await apiRequest(`/stats?period=${period}`);
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
        showNotification('Ошибка загрузки статистики', 'error');
        return null;
    }
}

// Отображение статистики
let currentStatsPeriod = 'day';

async function renderStats(period = 'day') {
    currentStatsPeriod = period;
    
    // Обновить активную кнопку периода
    document.querySelectorAll('.btn-period').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.period === period) {
            btn.classList.add('active');
        }
    });
    
    const stats = await loadStats(period);
    
    if (!stats) {
        document.getElementById('stats-content').innerHTML = '<div class="warehouse-empty">Ошибка загрузки статистики</div>';
        return;
    }
    
    // Обновить общую статистику
    document.getElementById('stat-total-sales').textContent = `${stats.totalSales.toFixed(2)} сум`;
    document.getElementById('stat-total-profit').textContent = `${stats.totalProfit.toFixed(2)} сум`;
    document.getElementById('stat-sales-count').textContent = stats.salesCount;
    
    // Топ товаров по продажам
    const topSalesEl = document.getElementById('stats-top-sales');
    if (stats.topSales.length === 0) {
        topSalesEl.innerHTML = '<div class="warehouse-empty">Нет данных о продажах</div>';
    } else {
        topSalesEl.innerHTML = stats.topSales.map((item, index) => `
            <div class="top-product-item">
                <div class="top-product-rank">${index + 1}</div>
                <div class="top-product-info">
                    <div class="top-product-name">${escapeHtml(item.productName)}</div>
                    <div class="top-product-barcode">${escapeHtml(item.productBarcode)}</div>
                </div>
                <div class="top-product-stats">
                    <div class="top-product-quantity">${item.totalQuantity} шт.</div>
                    <div class="top-product-amount">${item.totalAmount.toFixed(2)} сум</div>
                </div>
            </div>
        `).join('');
    }
    
    // Топ товаров по прибыльности
    const topProfitEl = document.getElementById('stats-top-profit');
    if (stats.topProfit.length === 0) {
        topProfitEl.innerHTML = '<div class="warehouse-empty">Нет данных о прибыли</div>';
    } else {
        topProfitEl.innerHTML = stats.topProfit.map((item, index) => `
            <div class="top-product-item">
                <div class="top-product-rank">${index + 1}</div>
                <div class="top-product-info">
                    <div class="top-product-name">${escapeHtml(item.productName)}</div>
                    <div class="top-product-barcode">${escapeHtml(item.productBarcode)}</div>
                </div>
                <div class="top-product-stats">
                    <div class="top-product-quantity">${item.totalQuantity} шт.</div>
                    <div class="top-product-profit">${item.totalProfit.toFixed(2)} сум</div>
                    <div class="top-product-amount">${item.totalAmount.toFixed(2)} сум</div>
                </div>
            </div>
        `).join('');
    }
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    // Проверка на Telegram
    if (isTelegramWebView()) {
        document.getElementById('telegram-warning').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
        
        document.getElementById('open-browser-btn').addEventListener('click', () => {
            const url = window.location.href;
            window.open(url, '_blank');
        });
        return;
    }

    // Показать основное приложение
    document.getElementById('telegram-warning').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    // Загрузить данные склада
    await renderWarehouse();
    
    // Инициализировать корзину продажи
    renderSaleCart();

    // Навигация
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            switchView(view);
            
            // Запустить сканер для продажи и приема
            if (view === 'sale') {
                setTimeout(() => {
                    startScanner('reader-sale', handleSale);
                }, 300);
            } else if (view === 'product-info') {
                setTimeout(() => {
                    startScanner('reader-product-info', handleProductInfo);
                }, 300);
            } else if (view === 'warehouse') {
                // Обновить склад при открытии
                renderWarehouse();
            } else if (view === 'history') {
                // Загрузить историю при открытии
                renderHistory();
            }
        });
    });

    // Продажа - кнопка "Продать все"
    document.getElementById('btn-sell-all').addEventListener('click', async () => {
        await sellAllFromCart();
    });

    // Очистить корзину
    document.getElementById('btn-clear-cart').addEventListener('click', () => {
        clearSaleCart();
    });

    // Кнопка добавления товара из подсказки
    document.getElementById('btn-add-missing-product').addEventListener('click', () => {
        const barcode = document.getElementById('btn-add-missing-product').dataset.barcode;
        if (barcode) {
            document.getElementById('sale-add-product-prompt').classList.add('hidden');
            switchView('warehouse');
            document.getElementById('btn-add-product').click();
            document.getElementById('input-product-barcode').value = barcode;
        }
    });

    // Кнопка "Принять" на экране склада
    document.getElementById('btn-receive-product').addEventListener('click', () => {
        openReceiveModal();
    });

    // Кнопка сканирования в модальном окне приема
    document.getElementById('btn-scan-receive').addEventListener('click', () => {
        const scannerContainer = document.getElementById('receive-scanner-container');
        const productInfo = document.getElementById('receive-product-info');
        scannerContainer.classList.remove('hidden');
        productInfo.classList.add('hidden');
        startScanner('reader-receive-modal', handleReceiveModalScan);
    });

    // Закрыть сканер в модальном окне приема
    document.getElementById('scanner-receive-close').addEventListener('click', async () => {
        await stopScanner();
        document.getElementById('receive-scanner-container').classList.add('hidden');
        document.getElementById('receive-product-info').classList.remove('hidden');
    });

    // Модальное окно приема товара
    document.getElementById('modal-receive-close').addEventListener('click', async () => {
        await stopScanner();
        document.getElementById('modal-receive-product').classList.add('hidden');
    });

    document.getElementById('form-receive-cancel').addEventListener('click', async () => {
        await stopScanner();
        document.getElementById('modal-receive-product').classList.add('hidden');
    });

    // Форма приема товара
    document.getElementById('form-receive-product').addEventListener('submit', async (e) => {
        e.preventDefault();
        await confirmReceiveFromModal();
    });

    // Кнопки на экране информации о товаре
    document.getElementById('btn-edit-from-info').addEventListener('click', () => {
        const productId = document.getElementById('product-info-panel').dataset.productId;
        if (productId) {
            editProduct(productId);
        }
    });

    document.getElementById('btn-receive-from-info').addEventListener('click', () => {
        const productJson = document.getElementById('product-info-panel').dataset.product;
        if (productJson) {
            const product = JSON.parse(productJson);
            openReceiveModal(product);
        }
    });

    // Добавление товара
    document.getElementById('btn-add-product').addEventListener('click', () => {
        document.getElementById('modal-add-product').classList.remove('hidden');
        document.getElementById('form-add-product').reset();
    });

    document.getElementById('modal-close').addEventListener('click', () => {
        document.getElementById('modal-add-product').classList.add('hidden');
        if (currentScanner) {
            stopScanner();
        }
    });

    document.getElementById('form-cancel').addEventListener('click', () => {
        document.getElementById('modal-add-product').classList.add('hidden');
        if (currentScanner) {
            stopScanner();
        }
    });

    // Сканирование штрих-кода при добавлении
    document.getElementById('btn-scan-barcode').addEventListener('click', () => {
        const scannerContainer = document.getElementById('scanner-container-add');
        scannerContainer.classList.remove('hidden');
        startScanner('reader-add', (barcode) => {
            document.getElementById('input-product-barcode').value = barcode;
            scannerContainer.classList.add('hidden');
            stopScanner();
        });
    });

    document.getElementById('scanner-close').addEventListener('click', () => {
        document.getElementById('scanner-container-add').classList.add('hidden');
        stopScanner();
    });

    // Форма добавления товара
    document.getElementById('form-add-product').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('input-product-name').value;
        const barcode = document.getElementById('input-product-barcode').value;
        const quantity = document.getElementById('input-product-quantity').value;
        const price = document.getElementById('input-product-price').value;
        const purchase_price = document.getElementById('input-product-purchase-price').value;

        if (!name || !barcode) {
            showNotification('Заполните все обязательные поля', 'error');
            return;
        }

        try {
            await addProduct(name, barcode, quantity, price, purchase_price);
            document.getElementById('modal-add-product').classList.add('hidden');
            if (currentScanner) {
                stopScanner();
            }
            await renderWarehouse();
        } catch (error) {
            // Ошибка уже обработана в addProduct
        }
    });

    // Поиск товаров
    document.getElementById('warehouse-search').addEventListener('input', (e) => {
        searchProducts(e.target.value);
    });

    // Делегирование событий для кнопок редактирования и удаления на складе
    const warehouseList = document.getElementById('warehouse-list');
    if (warehouseList) {
        warehouseList.addEventListener('click', async (e) => {
            console.log('Клик в warehouse-list:', e.target);
            
            // Проверяем клик на кнопке или внутри кнопки (иконка)
            let button = e.target;
            
            // Если клик не на кнопке, ищем ближайшую кнопку
            if (!button.classList.contains('btn-edit') && !button.classList.contains('btn-delete')) {
                button = button.closest('.btn-edit') || button.closest('.btn-delete');
            }
            
            if (!button) {
                console.log('Клик не на кнопке редактирования/удаления');
                return;
            }
            
            console.log('Найдена кнопка:', button);
            
            // Получаем product-id из data-атрибута
            let productId = button.getAttribute('data-product-id');
            
            // Если не нашли, ищем в родительском элементе warehouse-item
            if (!productId) {
                const warehouseItem = button.closest('.warehouse-item');
                if (warehouseItem) {
                    productId = warehouseItem.getAttribute('data-product-id');
                }
            }
            
            if (!productId) {
                console.error('Не найден product-id для кнопки:', button);
                return;
            }
            
            console.log('Product ID:', productId);
            
            // Определяем действие по классу
            let action = null;
            if (button.classList.contains('btn-edit')) {
                action = 'edit';
            } else if (button.classList.contains('btn-delete')) {
                action = 'delete';
            }
            
            if (!action) {
                console.error('Не определено действие для кнопки:', button);
                return;
            }
            
            console.log('Действие:', action);
            
            e.preventDefault();
            e.stopPropagation();
            
            try {
                if (action === 'edit') {
                    await editProduct(productId);
                } else if (action === 'delete') {
                    await deleteProductConfirm(productId);
                }
            } catch (error) {
                console.error('Ошибка при выполнении действия:', error);
                showNotification('Ошибка: ' + error.message, 'error');
            }
        });
    }

    // Поиск в истории
    const historySearchInput = document.getElementById('history-search');
    if (historySearchInput) {
        historySearchInput.addEventListener('input', (e) => {
            searchHistory(e.target.value);
        });
    }

    // Кнопки периода статистики
    document.querySelectorAll('.btn-period').forEach(btn => {
        btn.addEventListener('click', () => {
            const period = btn.dataset.period;
            renderStats(period);
        });
    });

    // Кнопка создания новой сессии
    const btnNewSession = document.getElementById('btn-new-session');
    if (btnNewSession) {
        btnNewSession.addEventListener('click', createNewSession);
    }

    // Кнопки выбора сессии (делегирование событий)
    const openSessionsList = document.getElementById('open-sessions-list');
    if (openSessionsList) {
        openSessionsList.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-session');
            if (btn) {
                const sessionId = btn.dataset.sessionId;
                selectSession(sessionId);
            }
        });
    }

    // Кнопка "Назад" к выбору сессий (не закрывает сессию)
    const btnBackToSessions = document.getElementById('btn-back-to-sessions');
    if (btnBackToSessions) {
        btnBackToSessions.addEventListener('click', async () => {
            await returnToSessionsSelector();
        });
    }

    // Модальное окно редактирования
    document.getElementById('modal-edit-close').addEventListener('click', () => {
        document.getElementById('modal-edit-product').classList.add('hidden');
    });

    document.getElementById('form-edit-cancel').addEventListener('click', () => {
        document.getElementById('modal-edit-product').classList.add('hidden');
    });

    // Форма редактирования товара
    document.getElementById('form-edit-product').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('edit-product-id').value;
        const name = document.getElementById('edit-product-name').value;
        const barcode = document.getElementById('edit-product-barcode').value;
        const quantity = parseInt(document.getElementById('edit-product-quantity').value) || 0;
        const price = parseFloat(document.getElementById('edit-product-price').value) || 0;
        const purchase_price = parseFloat(document.getElementById('edit-product-purchase-price').value) || 0;

        if (!name || !barcode) {
            showNotification('Заполните все обязательные поля', 'error');
            return;
        }

        try {
            await updateProduct(id, name, barcode, quantity, price, purchase_price);
            document.getElementById('modal-edit-product').classList.add('hidden');
            await renderWarehouse();
            showNotification('Товар обновлен', 'success');
        } catch (error) {
            // Ошибка уже обработана в updateProduct
        }
    });

    // Запустить сканер для продажи по умолчанию
    setTimeout(() => {
        startScanner('reader-sale', handleSale);
    }, 500);
});

// Обработка видимости страницы (пауза/возобновление сканера)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (currentScanner) {
            stopScanner();
        }
    } else {
        const activeView = document.querySelector('.view.active');
        if (activeView) {
            const viewId = activeView.id;
            if (viewId === 'view-sale') {
                setTimeout(() => {
                    startScanner('reader-sale', handleSale);
                }, 300);
            } else if (viewId === 'view-product-info') {
                setTimeout(() => {
                    startScanner('reader-product-info', handleProductInfo);
                }, 300);
            }
        }
    }
});
