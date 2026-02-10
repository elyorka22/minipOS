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

// Валидация штрих-кода (универсальная)
function validateBarcode(barcode) {
    const code = String(barcode).trim();
    
    // Проверка на пустоту
    if (!code) {
        return { valid: false, reason: 'Штрих-код пуст' };
    }
    
    // Расширенная проверка длины (разные форматы имеют разную длину)
    // EAN-8: 8 цифр
    // EAN-13: 13 цифр
    // UPC-A: 12 цифр
    // UPC-E: 8 цифр
    // CODE-128, CODE-39: переменная длина
    if (code.length < 4 || code.length > 20) {
        console.warn('Штрих-код необычной длины:', code.length, code);
        // Не отклоняем сразу - может быть валидный код нестандартного формата
    }
    
    // Проверка что все символы - цифры (для EAN/UPC)
    // Для CODE-128 и CODE-39 могут быть буквы, но html5-qrcode обычно возвращает только цифры
    if (!/^\d+$/.test(code)) {
        console.warn('Штрих-код содержит не только цифры:', code);
        // Для некоторых форматов это нормально, но для EAN/UPC - нет
        // Пока разрешаем, но логируем
    }
    
    // Для EAN-13 проверяем контрольную сумму (но не отклоняем, если не совпадает)
    // Многие реальные штрих-коды могут иметь неверную контрольную сумму
    if (code.length === 13 && /^\d{13}$/.test(code)) {
        const ean13Check = validateEAN13(code);
        if (!ean13Check.valid) {
            console.warn('EAN-13 с неверной контрольной суммой, но разрешаем:', code);
            // Не отклоняем - разрешаем код с неверной контрольной суммой
            // Многие реальные штрих-коды имеют неверную контрольную сумму
        }
    }
    
    // Минимальная валидация: код не пустой и содержит хотя бы цифры
    if (code.length < 4) {
        return { valid: false, reason: 'Штрих-код слишком короткий (минимум 4 символа)' };
    }
    
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
        return await apiRequest('/products');
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        showNotification('Ошибка загрузки товаров', 'error');
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
async function addProduct(name, barcode, quantity) {
    try {
        return await apiRequest('/products', {
            method: 'POST',
            body: JSON.stringify({
                name: name.trim(),
                barcode: barcode.trim(),
                quantity: parseInt(quantity) || 0
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
async function sellProduct(productId) {
    try {
        return await apiRequest(`/products/${productId}/sell`, {
            method: 'POST'
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
        
        // Защита от множественных срабатываний в обработчике сканера
        let isProcessing = false;
        let lastProcessedBarcode = null;
        let lastProcessedTime = 0;
        
        // Обработчик успешного распознавания
        const onScanSuccess = (decodedText, decodedResult) => {
            // Защита от множественных срабатываний
            const now = Date.now();
            const normalizedBarcode = String(decodedText).trim();
            
            // Если обрабатываем тот же код и прошло меньше 2 секунд - игнорируем
            if (isProcessing || 
                (lastProcessedBarcode === normalizedBarcode && (now - lastProcessedTime) < 2000)) {
                console.log('Пропущено повторное распознавание (debounce):', normalizedBarcode);
                return;
            }
            
            // Помечаем, что обрабатываем
            isProcessing = true;
            lastProcessedBarcode = normalizedBarcode;
            lastProcessedTime = now;
            
            console.log('=== Штрих-код распознан ===');
            console.log('Текст:', decodedText);
            console.log('Тип:', decodedResult?.result?.format);
            console.log('Длина:', decodedText?.length);
            
            console.log('Нормализованный:', normalizedBarcode);
            
            // Валидация штрих-кода перед обработкой
            const validation = validateBarcode(normalizedBarcode);
            console.log('Валидация:', validation);
            
            if (!validation.valid) {
                console.warn('Штрих-код не прошел валидацию:', validation.reason);
                // Показываем предупреждение, но не блокируем обработку для коротких кодов
                if (normalizedBarcode.length < 4) {
                    showNotification(`Неверный штрих-код: ${validation.reason}`, 'error');
                    isProcessing = false;
                    return;
                }
                // Для остальных случаев - предупреждение, но продолжаем
                console.warn('Продолжаем обработку несмотря на предупреждение валидации');
            }
            
            // Визуальная обратная связь при успешном сканировании
            playSuccessSound();
            vibrate([50, 30, 50]);
            
            console.log('Вызываем onSuccess с кодом:', normalizedBarcode);
            
            // Временно останавливаем сканер, чтобы избежать повторных срабатываний
            currentScanner.pause().then(() => {
                console.log('Сканер приостановлен для обработки');
            }).catch(err => {
                console.warn('Не удалось приостановить сканер:', err);
            });
            
            // Вызываем обработчик
            try {
                onSuccess(normalizedBarcode);
                console.log('✓ onSuccess вызван успешно');
            } catch (error) {
                console.error('Ошибка в onSuccess:', error);
            } finally {
                // Возобновляем сканер через 1 секунду
                setTimeout(() => {
                    isProcessing = false;
                    if (currentScanner) {
                        currentScanner.resume().then(() => {
                            console.log('Сканер возобновлен');
                        }).catch(err => {
                            console.warn('Не удалось возобновить сканер:', err);
                        });
                    }
                }, 1000);
            }
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
    
    if (saleCart.length === 0) {
        cartItems.classList.add('hidden');
        cartEmpty.classList.remove('hidden');
        cartFooter.classList.add('hidden');
        clearBtn.style.display = 'none';
        return;
    }
    
    cartItems.classList.remove('hidden');
    cartEmpty.classList.add('hidden');
    cartFooter.classList.remove('hidden');
    clearBtn.style.display = 'block';
    
    // Подсчитать общее количество
    const totalCount = saleCart.reduce((sum, item) => sum + item.quantityInCart, 0);
    document.getElementById('cart-total-count').textContent = totalCount;
    
    // Отобразить товары
    cartItems.innerHTML = saleCart.map((item, index) => `
        <div class="cart-item" data-item-id="${item.id}" data-item-index="${index}">
            <div class="cart-item-info">
                <div class="cart-item-name">${escapeHtml(item.name)}</div>
                <div class="cart-item-barcode">${escapeHtml(item.barcode)}</div>
                <div class="cart-item-stock">Остаток: ${item.quantity}</div>
            </div>
            <div class="cart-item-controls">
                <button class="btn-quantity" onclick="updateCartItemQuantity('${item.id}', -1)">−</button>
                <span class="cart-item-quantity">${item.quantityInCart}</span>
                <button class="btn-quantity" onclick="updateCartItemQuantity('${item.id}', 1)">+</button>
                <button class="btn-remove" onclick="removeFromSaleCart('${item.id}')" title="Удалить">×</button>
            </div>
        </div>
    `).join('');
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
    // Защита от повторных сканирований одного кода
    const now = Date.now();
    if (lastScannedBarcode === barcode && (now - lastScanTime) < SCAN_DEBOUNCE_TIME) {
        console.log('Пропущено повторное сканирование того же кода');
        return;
    }
    
    lastScannedBarcode = barcode;
    lastScanTime = now;
    
    // Показать индикатор загрузки
    showNotification('Поиск товара...', 'success');
    
    // Поиск товара с повторными попытками
    const product = await findProductByBarcode(barcode, 2);
    
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
        // Продать каждый товар нужное количество раз
        const soldItems = [];
        const errors = [];
        
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
            
            // Продать нужное количество
            for (let i = 0; i < item.quantityInCart; i++) {
                try {
                    const updatedProduct = await sellProduct(item.id);
                    soldItems.push(updatedProduct);
                } catch (error) {
                    errors.push(`Ошибка продажи "${item.name}"`);
                }
            }
        }
        
        // Показать результат
        const totalCount = soldItems.length;
        if (totalCount > 0) {
            showNotification(`Продано товаров: ${totalCount}`, 'success');
        }
        
        if (errors.length > 0) {
            console.error('Ошибки при продаже:', errors);
            showNotification(`Продано: ${totalCount}, ошибок: ${errors.length}`, 'error');
        }
        
        // Очистить корзину
        saleCart = [];
        renderSaleCart();
        
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
function clearSaleCart() {
    saleCart = [];
    renderSaleCart();
    showNotification('Корзина очищена', 'success');
}

// Сделать функции глобальными для onclick
window.updateCartItemQuantity = updateCartItemQuantity;
window.removeFromSaleCart = removeFromSaleCart;

// Прием товара
async function handleReceive(barcode) {
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
        return;
    }

    currentProduct = product;
    currentBarcode = barcode;

    // Показать форму
    document.getElementById('receive-product-name').textContent = product.name;
    document.getElementById('receive-quantity').value = 1;
    document.getElementById('receive-form').classList.remove('hidden');
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
async function renderWarehouse() {
    const list = document.getElementById('warehouse-list');
    
    try {
        const products = await loadProducts();
        
        if (products.length === 0) {
            list.innerHTML = '<div class="warehouse-empty">Склад пуст. Добавьте товары.</div>';
            return;
        }

        list.innerHTML = products.map(product => `
            <div class="warehouse-item">
                <div class="warehouse-item-header">
                    <div>
                        <div class="warehouse-item-name">${escapeHtml(product.name)}</div>
                        <div class="warehouse-item-barcode">Штрих-код: ${escapeHtml(product.barcode)}</div>
                    </div>
                    <div class="warehouse-item-stock">${product.quantity}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="warehouse-empty">Ошибка загрузки склада</div>';
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
            } else if (view === 'receive') {
                setTimeout(() => {
                    startScanner('reader-receive', handleReceive);
                }, 300);
            } else if (view === 'warehouse') {
                // Обновить склад при открытии
                renderWarehouse();
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

    // Прием
    document.getElementById('receive-confirm').addEventListener('click', async () => {
        await confirmReceive();
        // Перезапустить сканер
        setTimeout(() => {
            startScanner('reader-receive', handleReceive);
        }, 300);
    });

    document.getElementById('receive-cancel').addEventListener('click', () => {
        document.getElementById('receive-form').classList.add('hidden');
        currentProduct = null;
        currentBarcode = null;
        setTimeout(() => {
            startScanner('reader-receive', handleReceive);
        }, 300);
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

        if (!name || !barcode) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        try {
            await addProduct(name, barcode, quantity);
            document.getElementById('modal-add-product').classList.add('hidden');
            if (currentScanner) {
                stopScanner();
            }
            await renderWarehouse();
        } catch (error) {
            // Ошибка уже обработана в addProduct
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
            } else if (viewId === 'view-receive') {
                setTimeout(() => {
                    startScanner('reader-receive', handleReceive);
                }, 300);
            }
        }
    }
});
