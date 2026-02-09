// Определение URL API
// Для продакшена замените на URL вашего Railway backend
// Например: 'https://your-app-name.up.railway.app'
const getApiUrl = () => {
  // Проверяем window.API_URL (устанавливается в index.html)
  if (typeof window !== 'undefined' && window.API_URL && window.API_URL !== '%VITE_API_URL%') {
    return window.API_URL;
  }
  // Проверяем meta tag
  const metaApiUrl = document.querySelector('meta[name="api-url"]');
  if (metaApiUrl && metaApiUrl.getAttribute('content') !== '%VITE_API_URL%') {
    return metaApiUrl.getAttribute('content');
  }
  // Fallback на localhost для разработки
  return 'http://localhost:3000';
};

const API_URL = getApiUrl() + '/api';

let currentScanner = null;
let currentStream = null;
let scannedBarcode = null;

// Продажа товара
function openSellModal() {
  document.getElementById('sellModal').classList.add('active');
  document.getElementById('sellMessage').innerHTML = '';
  document.getElementById('sellProductInfo').innerHTML = '';
  
  // Небольшая задержка для отображения модального окна перед запуском камеры
  setTimeout(() => {
    startScanner('scanner', handleSellScan);
  }, 100);
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
  
  // Небольшая задержка для отображения модального окна перед запуском камеры
  setTimeout(() => {
    startScanner('receiveScanner', handleReceiveScan);
  }, 100);
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
  
  // Небольшая задержка для отображения модального окна перед запуском камеры
  setTimeout(() => {
    startScanner('barcodeScanner', handleBarcodeScanForAdd);
  }, 100);
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
  if (!video) {
    console.error('Video element not found:', videoId);
    return;
  }
  
  // Определяем, какое сообщение показывать в зависимости от модального окна
  let messageId = 'sellMessage';
  if (videoId === 'receiveScanner') {
    messageId = 'receiveMessage';
  } else if (videoId === 'barcodeScanner') {
    messageId = 'addProductMessage';
  }
  
  // Проверяем поддержку getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showMessage(messageId, 'Камера не поддерживается в этом браузере', 'error');
    return;
  }
  
  // Показываем индикатор загрузки
  const loadingId = videoId + 'Loading';
  const loadingEl = document.getElementById(loadingId);
  if (loadingEl) {
    loadingEl.classList.add('show');
  }
  
  // Определяем, мобильное ли устройство
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Упрощенные constraints для мобильных устройств
  const videoConstraints = isMobile ? {
    facingMode: "environment"
  } : {
    facingMode: "environment",
    width: { ideal: 1280 },
    height: { ideal: 720 }
  };
  
  // Функция для обработки ошибок
  const handleError = (err, source) => {
    if (loadingEl) {
      loadingEl.classList.remove('show');
    }
    
    console.error(`Ошибка ${source}:`, err);
    let errorMessage = 'Не удалось запустить камеру. ';
    
    if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || 
        (err.message && err.message.includes('NotAllowedError')))) {
      errorMessage += 'Разрешите доступ к камере в настройках браузера.';
    } else if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' ||
        (err.message && err.message.includes('NotFoundError')))) {
      errorMessage += 'Камера не найдена.';
    } else if (err && (err.name === 'NotReadableError' || err.name === 'TrackStartError' ||
        (err.message && err.message.includes('NotReadableError')))) {
      errorMessage += 'Камера уже используется другим приложением.';
    } else {
      errorMessage += 'Проверьте настройки браузера и попробуйте еще раз.';
    }
    
    showMessage(messageId, errorMessage, 'error');
  };
  
  // НОВЫЙ ПОДХОД: Показываем видео БЕЗ Quagga сначала, используем нативный BarcodeDetector если доступен
  navigator.mediaDevices.getUserMedia({
    video: videoConstraints
  }).then(async (stream) => {
    currentStream = stream;
    
    // ПРИОРИТЕТ #1: Показываем видео пользователю СРАЗУ
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.setAttribute('muted', 'true');
    
    // Явно устанавливаем стили для видимости
    video.style.cssText = 'display: block !important; visibility: visible !important; width: 100% !important; height: auto !important; object-fit: cover !important; background: #000 !important; z-index: 1 !important;';
    
    // Запускаем видео
    try {
      await video.play();
      console.log('✅ Видео запущено и должно быть видно');
      
      // Скрываем индикатор загрузки
      if (loadingEl) {
        loadingEl.classList.remove('show');
      }
      
      // Пробуем использовать нативный BarcodeDetector API (если доступен)
      if ('BarcodeDetector' in window) {
        console.log('✅ Используем нативный BarcodeDetector API');
        startNativeBarcodeDetection(video, videoId, onDetected, messageId);
      } else {
        // Fallback: используем Quagga через canvas (video остается видимым)
        console.log('⚠️ BarcodeDetector не доступен, используем Quagga через canvas');
        setTimeout(() => {
          const canvas = document.getElementById(videoId + 'Canvas');
          if (canvas) {
            startCanvasScanning(video, canvas, videoId, onDetected, messageId, videoConstraints, isMobile);
          } else {
            // Если canvas нет, используем скрытый video для Quagga
            startQuaggaWithHiddenVideo(stream, videoId, onDetected, messageId, videoConstraints, isMobile);
          }
        }, 1000); // Даем время видео отобразиться
      }
      
    } catch (err) {
      console.error('❌ Ошибка воспроизведения видео:', err);
      handleError(err, 'воспроизведения видео');
    }
    
    // Обработчики событий видео
    video.onloadedmetadata = () => {
      console.log('✅ Метаданные видео загружены');
      if (loadingEl) {
        loadingEl.classList.remove('show');
      }
      // Убеждаемся, что видео видно
      video.style.cssText = 'display: block !important; visibility: visible !important; width: 100% !important; height: auto !important; object-fit: cover !important; background: #000 !important; z-index: 1 !important;';
    };
    
    video.onplaying = () => {
      console.log('✅ Видео воспроизводится');
      if (loadingEl) {
        loadingEl.classList.remove('show');
      }
      // Еще раз убеждаемся что видео видно
      video.style.cssText = 'display: block !important; visibility: visible !important; width: 100% !important; height: auto !important; object-fit: cover !important; background: #000 !important; z-index: 1 !important;';
    };
    
    video.onerror = (err) => {
      console.error('❌ Ошибка видео:', err);
      handleError(err, 'видео');
    };
    
  }).catch((err) => {
    handleError(err, 'доступа к камере');
  });
}

// Нативный BarcodeDetector API (работает на многих мобильных браузерах)
function startNativeBarcodeDetection(video, videoId, onDetected, messageId) {
  const barcodeDetector = new BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'code_128']
  });
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const detectBarcode = async () => {
    if (currentScanner !== videoId || !video.videoWidth) return;
    
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      
      const barcodes = await barcodeDetector.detect(canvas);
      
      if (barcodes.length > 0) {
        const barcode = barcodes[0].rawValue;
        console.log('✅ Штрих-код найден:', barcode);
        stopScanner();
        onDetected({ codeResult: { code: barcode } });
        return;
      }
    } catch (err) {
      console.error('Ошибка сканирования:', err);
    }
    
    // Продолжаем сканирование
    if (currentScanner === videoId) {
      requestAnimationFrame(detectBarcode);
    }
  };
  
  currentScanner = videoId;
  video.onloadedmetadata = () => {
    detectBarcode();
  };
  
  if (video.readyState >= 2) {
    detectBarcode();
  }
}

// Сканирование через canvas (video остается видимым)
function startCanvasScanning(video, canvas, videoId, onDetected, messageId, videoConstraints, isMobile) {
  const ctx = canvas.getContext('2d');
  
  // Настраиваем canvas
  const updateCanvasSize = () => {
    if (video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
  };
  
  // Функция захвата кадра и сканирования
  const scanFrame = () => {
    if (currentScanner !== videoId || !video.videoWidth) return;
    
    try {
      updateCanvasSize();
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Используем Quagga для сканирования canvas
      Quagga.decodeSingle({
        decoder: {
          readers: ["ean_reader", "ean_8_reader", "code_128_reader"]
        },
        locate: true,
        src: canvas.toDataURL('image/png')
      }, (result) => {
        if (result && result.codeResult) {
          console.log('✅ Штрих-код найден через canvas:', result.codeResult.code);
          stopScanner();
          onDetected(result);
          return;
        }
        
        // Продолжаем сканирование
        if (currentScanner === videoId) {
          setTimeout(scanFrame, isMobile ? 500 : 200);
        }
      });
    } catch (err) {
      console.error('Ошибка сканирования:', err);
      if (currentScanner === videoId) {
        setTimeout(scanFrame, 1000);
      }
    }
  };
  
  currentScanner = videoId;
  
  // Запускаем сканирование когда видео готово
  const startScan = () => {
    if (video.videoWidth && video.videoHeight) {
      scanFrame();
    } else {
      setTimeout(startScan, 100);
    }
  };
  
  if (video.readyState >= 2) {
    startScan();
  } else {
    video.addEventListener('loadedmetadata', startScan, { once: true });
  }
}

// Quagga с отдельным скрытым video элементом (если canvas не работает)
function startQuaggaWithHiddenVideo(stream, videoId, onDetected, messageId, videoConstraints, isMobile) {
  // Создаем скрытый video для Quagga
  const hiddenVideo = document.createElement('video');
  hiddenVideo.srcObject = stream.clone(); // Клонируем stream
  hiddenVideo.setAttribute('playsinline', 'true');
  hiddenVideo.setAttribute('autoplay', 'true');
  hiddenVideo.setAttribute('muted', 'true');
  hiddenVideo.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; z-index: -1;';
  document.body.appendChild(hiddenVideo);
  
  hiddenVideo.play().then(() => {
    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: hiddenVideo,
        constraints: videoConstraints
      },
      decoder: {
        readers: ["ean_reader", "ean_8_reader", "code_128_reader"]
      },
      locate: true,
      numOfWorkers: isMobile ? 1 : 2,
      frequency: isMobile ? 3 : 10
    }, (err) => {
      if (err) {
        console.warn('⚠️ Quagga не запустился:', err);
        document.body.removeChild(hiddenVideo);
        // Пробуем нативный API как последний вариант
        const video = document.getElementById(videoId);
        if (video && 'BarcodeDetector' in window) {
          startNativeBarcodeDetection(video, videoId, onDetected, messageId);
        }
        return;
      }
      
      Quagga.start();
      currentScanner = videoId;
      console.log('✅ Quagga запущен на скрытом video');
      
      // Сохраняем ссылку для очистки
      window.hiddenVideos = window.hiddenVideos || {};
      window.hiddenVideos[videoId] = hiddenVideo;
    });
    
    Quagga.onDetected((result) => {
      if (currentScanner === videoId && result && result.codeResult) {
        stopScanner();
        onDetected(result);
      }
    });
  }).catch(err => {
    console.error('Ошибка скрытого video:', err);
    document.body.removeChild(hiddenVideo);
  });
}


function stopScanner() {
  try {
    if (typeof Quagga !== 'undefined' && Quagga) {
      Quagga.stop();
      Quagga.offDetected();
    }
  } catch (e) {
    console.error('Ошибка при остановке Quagga:', e);
  }
  
  // Очищаем скрытые video элементы
  if (window.hiddenVideos) {
    Object.values(window.hiddenVideos).forEach(video => {
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    });
    window.hiddenVideos = {};
  }
  
  if (currentStream) {
    currentStream.getTracks().forEach(track => {
      track.stop();
    });
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

