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

    // Скрыть результаты
    document.getElementById('sale-result')?.classList.add('hidden');
    document.getElementById('receive-form')?.classList.add('hidden');
}

// Продажа товара
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

    if (product.quantity <= 0) {
        showNotification('Товар закончился на складе', 'error');
        return;
    }

    currentProduct = product;
    currentBarcode = barcode;

    // Показать результат
    document.getElementById('sale-product-name').textContent = product.name;
    document.getElementById('sale-stock').textContent = product.quantity;
    document.getElementById('sale-result').classList.remove('hidden');
}

// Подтверждение продажи
async function confirmSale() {
    if (!currentProduct) return;

    try {
        const updatedProduct = await sellProduct(currentProduct.id);
        showNotification(`Продано: ${updatedProduct.name}. Остаток: ${updatedProduct.quantity}`, 'success');

        // Сброс
        document.getElementById('sale-result').classList.add('hidden');
        currentProduct = null;
        currentBarcode = null;
        
        // Обновить склад если открыт
        const activeView = document.querySelector('.view.active');
        if (activeView && activeView.id === 'view-warehouse') {
            await renderWarehouse();
        }
    } catch (error) {
        // Ошибка уже обработана в sellProduct
    }
}

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

    // Продажа
    document.getElementById('sale-confirm').addEventListener('click', async () => {
        await confirmSale();
        // Перезапустить сканер
        setTimeout(() => {
            startScanner('reader-sale', handleSale);
        }, 300);
    });

    document.getElementById('sale-cancel').addEventListener('click', () => {
        document.getElementById('sale-result').classList.add('hidden');
        currentProduct = null;
        currentBarcode = null;
        setTimeout(() => {
            startScanner('reader-sale', handleSale);
        }, 300);
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
