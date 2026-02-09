// Определение URL API (используем тот же origin, так как сервер отдает и статику, и API)
const API_URL = window.location.origin + '/api';

let currentScanner = null;
let currentStream = null;
let scannedBarcode = null;

// Продажа товара
function openSellModal() {
  document.getElementById('sellModal').classList.add('active');
  document.getElementById('sellMessage').innerHTML = '';
  document.getElementById('sellProductInfo').innerHTML = '';
  startScanner('scanner', handleSellScan);
}

function closeSellModal() {
  document.getElementById('sellModal').classList.remove('active');
  stopScanner();
}

function handleSellScan(result) {
  const barcode = result.codeResult.code;
  scannedBarcode = barcode;
  
  // Найти товар
  fetch(`${API_URL}/products/barcode/${barcode}`)
    .then(res => {
      if (!res.ok) {
        return res.json().then(err => Promise.reject(new Error(err.error || 'Товар не найден')));
      }
      return res.json();
    })
    .then(product => {
      // Автоматически продать (уменьшить количество)
      return fetch(`${API_URL}/products/sell/${barcode}`, { method: 'POST' });
    })
    .then(res => {
      if (!res.ok) {
        return res.json().then(err => Promise.reject(new Error(err.error || 'Ошибка продажи')));
      }
      return res.json();
    })
    .then(product => {
      showMessage('sellMessage', `Товар "${product.name}" продан! Остаток: ${product.quantity}`, 'success');
      document.getElementById('sellProductInfo').innerHTML = `
        <div class="product-item">
          <div class="product-name">${product.name}</div>
          <div class="product-info">Штрих-код: ${product.barcode}</div>
          <div class="quantity-badge ${product.quantity === 0 ? 'low' : ''}">Остаток: ${product.quantity}</div>
        </div>
      `;
      stopScanner();
      setTimeout(() => {
        startScanner('scanner', handleSellScan);
      }, 2000);
    })
    .catch(async err => {
      const errorText = err.message || (await err.json?.().catch(() => ({}))).error || 'Товар не найден';
      showMessage('sellMessage', errorText, 'error');
      stopScanner();
      setTimeout(() => {
        startScanner('scanner', handleSellScan);
      }, 2000);
    });
}

// Прием товара
function openReceiveModal() {
  document.getElementById('receiveModal').classList.add('active');
  document.getElementById('receiveMessage').innerHTML = '';
  document.getElementById('receiveProductInfo').innerHTML = '';
  document.getElementById('quantityInputGroup').style.display = 'none';
  startScanner('receiveScanner', handleReceiveScan);
}

function closeReceiveModal() {
  document.getElementById('receiveModal').classList.remove('active');
  stopScanner();
}

function handleReceiveScan(result) {
  const barcode = result.codeResult.code;
  scannedBarcode = barcode;
  
  fetch(`${API_URL}/products/barcode/${barcode}`)
    .then(res => {
      if (!res.ok) {
        return res.json().then(err => Promise.reject(new Error(err.error || 'Товар не найден')));
      }
      return res.json();
    })
    .then(product => {
      showMessage('receiveMessage', `Товар найден: ${product.name}`, 'success');
      document.getElementById('receiveProductInfo').innerHTML = `
        <div class="product-item">
          <div class="product-name">${product.name}</div>
          <div class="product-info">Штрих-код: ${product.barcode}</div>
          <div class="quantity-badge">Текущий остаток: ${product.quantity}</div>
        </div>
      `;
      document.getElementById('quantityInputGroup').style.display = 'block';
      stopScanner();
    })
    .catch(err => {
      showMessage('receiveMessage', err.message || 'Товар не найден. Сначала добавьте товар', 'error');
      stopScanner();
    });
}

function confirmReceive() {
  const quantity = parseInt(document.getElementById('receiveQuantity').value);
  if (!quantity || quantity <= 0) {
    showMessage('receiveMessage', 'Введите корректное количество', 'error');
    return;
  }
  
  fetch(`${API_URL}/products/receive/${scannedBarcode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity })
  })
    .then(res => {
      if (!res.ok) {
        return res.json().then(err => Promise.reject(new Error(err.error || 'Ошибка при приеме товара')));
      }
      return res.json();
    })
    .then(product => {
      showMessage('receiveMessage', `Товар принят! Новый остаток: ${product.quantity}`, 'success');
      document.getElementById('receiveProductInfo').innerHTML = `
        <div class="product-item">
          <div class="product-name">${product.name}</div>
          <div class="product-info">Штрих-код: ${product.barcode}</div>
          <div class="quantity-badge">Остаток: ${product.quantity}</div>
        </div>
      `;
      document.getElementById('quantityInputGroup').style.display = 'none';
      document.getElementById('receiveQuantity').value = 1;
    })
    .catch(err => {
      showMessage('receiveMessage', err.message || 'Ошибка при приеме товара', 'error');
    });
}

// Добавление товара
function openAddProductModal() {
  document.getElementById('addProductModal').classList.add('active');
  document.getElementById('addProductMessage').innerHTML = '';
  document.getElementById('productName').value = '';
  document.getElementById('productBarcode').value = '';
  document.getElementById('productQuantity').value = 0;
}

function closeAddProductModal() {
  document.getElementById('addProductModal').classList.remove('active');
}

function scanBarcodeForAdd() {
  document.getElementById('scanBarcodeModal').classList.add('active');
  startScanner('barcodeScanner', handleBarcodeScanForAdd);
}

function closeScanBarcodeModal() {
  document.getElementById('scanBarcodeModal').classList.remove('active');
  stopScanner();
}

function handleBarcodeScanForAdd(result) {
  const barcode = result.codeResult.code;
  document.getElementById('productBarcode').value = barcode;
  closeScanBarcodeModal();
}

function addProduct() {
  const name = document.getElementById('productName').value.trim();
  const barcode = document.getElementById('productBarcode').value.trim();
  const quantity = parseInt(document.getElementById('productQuantity').value) || 0;
  
  if (!name || !barcode) {
    showMessage('addProductMessage', 'Заполните название и штрих-код', 'error');
    return;
  }
  
  fetch(`${API_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, barcode, quantity })
  })
    .then(res => {
      if (!res.ok) {
        return res.json().then(err => Promise.reject(new Error(err.error || 'Ошибка при добавлении товара')));
      }
      return res.json();
    })
    .then(product => {
      showMessage('addProductMessage', `Товар "${product.name}" добавлен!`, 'success');
      document.getElementById('productName').value = '';
      document.getElementById('productBarcode').value = '';
      document.getElementById('productQuantity').value = 0;
    })
    .catch(err => {
      showMessage('addProductMessage', err.message || 'Ошибка при добавлении товара', 'error');
    });
}

// Список товаров
function openProductsList() {
  document.getElementById('productsListModal').classList.add('active');
  loadProductsList();
}

function closeProductsList() {
  document.getElementById('productsListModal').classList.remove('active');
}

function loadProductsList() {
  fetch(`${API_URL}/products`)
    .then(res => res.json())
    .then(products => {
      const list = document.getElementById('productsList');
      if (products.length === 0) {
        list.innerHTML = '<div class="message info">Товаров пока нет</div>';
        return;
      }
      list.innerHTML = products.map(product => `
        <div class="product-item">
          <div class="product-name">${product.name}</div>
          <div class="product-info">Штрих-код: ${product.barcode}</div>
          <div class="quantity-badge ${product.quantity === 0 ? 'low' : ''}">Остаток: ${product.quantity}</div>
        </div>
      `).join('');
    })
    .catch(err => {
      document.getElementById('productsList').innerHTML = 
        '<div class="message error">Ошибка загрузки товаров</div>';
    });
}

// Сканер
function startScanner(videoId, onDetected) {
  stopScanner();
  
  const video = document.getElementById(videoId);
  
  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: video,
      constraints: {
        width: 640,
        height: 480,
        facingMode: "environment"
      }
    },
    decoder: {
      readers: ["ean_reader", "ean_8_reader", "code_128_reader"]
    },
    locate: true
  }, (err) => {
    if (err) {
      console.error('Ошибка инициализации сканера:', err);
      showMessage('sellMessage', 'Не удалось запустить камеру. Проверьте разрешения.', 'error');
      return;
    }
    Quagga.start();
    currentScanner = videoId;
  });
  
  Quagga.onDetected((result) => {
    if (currentScanner === videoId) {
      stopScanner();
      onDetected(result);
    }
  });
}

function stopScanner() {
  if (Quagga) {
    Quagga.stop();
  }
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  currentScanner = null;
}

// Утилиты
function showMessage(elementId, message, type) {
  const element = document.getElementById(elementId);
  element.innerHTML = `<div class="message ${type}">${message}</div>`;
  setTimeout(() => {
    element.innerHTML = '';
  }, 5000);
}

// Закрытие модальных окон по клику вне области
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('active');
    stopScanner();
  }
});

