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

// API базовый URL - для монолита всегда /api
const API_BASE = '/api';

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

// Поиск товара по штрих-коду
async function findProductByBarcode(barcode) {
    try {
        return await apiRequest(`/products/barcode/${encodeURIComponent(barcode)}`);
    } catch (error) {
        if (error.message.includes('404')) {
            return null;
        }
        console.error('Ошибка поиска товара:', error);
        return null;
    }
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

// Запуск сканера
async function startScanner(readerId, onSuccess) {
    try {
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

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13]
        };

        await currentScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText, decodedResult) => {
                console.log('Штрих-код отсканирован:', decodedText);
                onSuccess(decodedText);
            },
            (errorMessage) => {
                // Игнорируем ошибки сканирования (они нормальны)
            }
        );
    } catch (err) {
        console.error('Ошибка запуска камеры:', err);
        showNotification('Не удалось запустить камеру. Проверьте разрешения.', 'error');
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
    const product = await findProductByBarcode(barcode);
    
    if (!product) {
        showNotification('Товар не найден. Добавьте его в склад.', 'error');
        setTimeout(() => {
            switchView('warehouse');
            document.getElementById('btn-add-product').click();
            document.getElementById('input-product-barcode').value = barcode;
        }, 1500);
        return;
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
    const product = await findProductByBarcode(barcode);
    
    if (!product) {
        showNotification('Товар не найден. Добавьте его в склад.', 'error');
        setTimeout(() => {
            switchView('warehouse');
            document.getElementById('btn-add-product').click();
            document.getElementById('input-product-barcode').value = barcode;
        }, 1500);
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
