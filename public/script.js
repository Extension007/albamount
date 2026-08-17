// =======================
// Вспомогательные функции
// =======================

// Функция для получения пути к элементу (для отладки)
function getElementPath(element) {
  if (!element) return '';
  const path = [];
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let selector = element.nodeName.toLowerCase();
    if (element.id) {
      selector += '#' + element.id;
      path.unshift(selector);
      break;
    } else {
      let sibling = element;
      let nth = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.nodeName.toLowerCase() === selector) nth++;
      }
      if (nth !== 1) selector += `:nth-of-type(${nth})`;
    }
    path.unshift(selector);
    element = element.parentElement;
  }
  return path.join(' > ');
}


// =======================
// Универсальный видеоплеер
// =======================

// Определение iOS устройства
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Определение типа видео по URL
function getVideoType(url) {
  if (!url) return null;
  const urlLower = String(url).toLowerCase();
  if (
    urlLower.includes('youtube.com') ||
    urlLower.includes('youtu.be') ||
    urlLower.includes('youtube-nocookie.com')
  ) {
    return 'youtube';
  }
  if (
    urlLower.includes('vk.com') ||
    urlLower.includes('vk.ru') ||
    urlLower.includes('vkontakte.ru') ||
    urlLower.includes('vkvideo.ru')
  ) {
    return 'vk';
  }
  if (urlLower.includes('instagram.com') || urlLower.includes('instagr.am')) {
    return 'instagram';
  }
  return null;
}

function extractVideoId(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url, 'https://youtube.com');
    const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }
    if (host.includes('youtube')) {
      const fromQuery = parsed.searchParams.get('v');
      if (fromQuery) return fromQuery;
      const parts = parsed.pathname.split('/').filter(Boolean);
      const markers = ['embed', 'shorts', 'live', 'v', 'e'];
      for (let i = 0; i < parts.length; i++) {
        if (markers.includes(parts[i]) && parts[i + 1]) {
          return parts[i + 1];
        }
      }
    }
  } catch (err) {}

  if (url.includes('/embed/')) {
    return url.split('/embed/')[1].split(/[?#]/)[0];
  }
  if (url.includes('/shorts/')) {
    return url.split('/shorts/')[1].split(/[?#]/)[0];
  }
  if (url.includes('/live/')) {
    return url.split('/live/')[1].split(/[?#]/)[0];
  }
  if (url.includes('youtu.be/')) {
    return url.split('youtu.be/')[1].split(/[?#]/)[0];
  }
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

function youtubeEmbedSrc(videoId) {
  const origin = encodeURIComponent(window.location.origin);
  return 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) +
    '?rel=0&modestbranding=1&playsinline=1&origin=' + origin;
}

function fillYoutubeIframe(iframe, videoId) {
  iframe.src = youtubeEmbedSrc(videoId);
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('allow', 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('title', 'Видеообзор');
  iframe.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;border:0;';
}

// Функция для получения URL постера YouTube
function getYoutubePosterUrl(url) {
  if (!url) return null;
  
  const videoId = extractVideoId(url);
  if (!videoId) return null;
  
  // Пытаемся получить максимальное качество постера
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// Извлечение параметров из URL ВКонтакте (поддержка video и clip)
function extractVKVideoParams(url) {
  if (!url) return null;

  let match = String(url).match(/video(-?\d+)_(\d+)/);
  if (match) {
    return { ownerId: match[1], videoId: match[2], hash: vkHashFromUrl(url) };
  }

  match = String(url).match(/clip(-?\d+)_(\d+)/);
  if (match) {
    return { ownerId: match[1], videoId: match[2], hash: vkHashFromUrl(url) };
  }

  match = String(url).match(/[?&]oid=(-?\d+).*[?&]id=(\d+)/);
  if (match) {
    return { ownerId: match[1], videoId: match[2], hash: vkHashFromUrl(url) };
  }

  match = String(url).match(/[?&]id=(\d+).*[?&]oid=(-?\d+)/);
  if (match) {
    return { ownerId: match[2], videoId: match[1], hash: vkHashFromUrl(url) };
  }

  return null;
}

function vkHashFromUrl(url) {
  const match = String(url).match(/[?&]hash=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function extractInstagramPostId(url) {
  if (!url) return null;
  const match = String(url).match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (match) {
    const type = match[1] === 'reels' ? 'reel' : match[1];
    return { postId: match[2], type };
  }
  return null;
}

function buildVKEmbedUrl(params) {
  if (!params || !params.ownerId || !params.videoId) return '';
  let src = 'https://vk.com/video_ext.php?oid=' + encodeURIComponent(params.ownerId) +
    '&id=' + encodeURIComponent(params.videoId) + '&hd=2';
  if (params.hash) {
    src += '&hash=' + encodeURIComponent(params.hash);
  }
  return src;
}

function instagramEmbedSrc(url) {
  const postData = extractInstagramPostId(url);
  if (postData) {
    return 'https://www.instagram.com/' + postData.type + '/' + postData.postId + '/embed/';
  }
  const cleanUrl = String(url).split('?')[0].replace(/\/$/, '');
  return cleanUrl + '/embed/';
}

// Получение Instagram embed через oEmbed API
async function getInstagramEmbed(url) {
  try {
    const response = await fetch(`/api/instagram/oembed?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (data.success && data.html) {
      return data.html;
    }
    // Fallback на прямой embed
    const postData = extractInstagramPostId(url);
    if (postData) {
      const embedUrl = `https://www.instagram.com/p/${postData.postId}/embed/`;
      return `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" scrolling="no" allowtransparency="true" allow="encrypted-media"></iframe>`;
    }
    return null;
  } catch (err) {
    console.error('Ошибка получения Instagram embed:', err);
    // Fallback на прямой embed
    const postData = extractInstagramPostId(url);
    if (postData) {
      const embedUrl = `https://www.instagram.com/p/${postData.postId}/embed/`;
      return `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" scrolling="no" allowtransparency="true" allow="encrypted-media"></iframe>`;
    }
    return null;
  }
}

// =======================
// Обработчики видео overlay, регистрация, категории, рейтинг
// =======================

// Инициализация DOM элементов (сразу при загрузке скрипта)
let videoOverlay = document.getElementById('videoOverlay');
let videoIframeContainer = document.getElementById('videoIframeContainer');
let imageOverlay = document.getElementById('imageOverlay');
let imageModal = document.getElementById('imageModal');
let imageModalImage = document.getElementById('imageModalImage');
let imageModalCurrent = document.getElementById('imageModalCurrent');
let imageModalTotal = document.getElementById('imageModalTotal');
let imageModalTitle = document.getElementById('imageModalTitle');

document.addEventListener("DOMContentLoaded", () => {
  videoOverlay = document.getElementById('videoOverlay');
  videoIframeContainer = document.getElementById('videoIframeContainer');
  imageOverlay = document.getElementById('imageOverlay');
  imageModal = document.getElementById('imageModal');
  imageModalImage = document.getElementById('imageModalImage');
  imageModalCurrent = document.getElementById('imageModalCurrent');
  imageModalTotal = document.getElementById('imageModalTotal');
  imageModalTitle = document.getElementById('imageModalTitle');
  console.log('🔄 DOM загружен, инициализация скрипта...');
  console.log('🌐 Текущий URL:', window.location.href);
  console.log('📊 User Agent:', navigator.userAgent);
  console.log('📱 Viewport:', `${window.innerWidth}x${window.innerHeight}`);

  // Проверяем, находимся ли мы на странице кабинета пользователя
  const isCabinetPage = window.IS_CABINET_PAGE === true;
  console.log('📍 isCabinetPage:', isCabinetPage);

  // Если это страница кабинета, пропускаем инициализацию публичных функций
  if (isCabinetPage) {
    console.log('ℹ️ Инициализация кабинета пользователя - пропускаем публичные функции');
    return;
  }

  console.log('✅ Инициализация публичных функций...');

  // Глобальные переменные
  let productId;
  let currentVideoIframe = null;
  let currentVideoUrl = null;
  let isVideoOpening = false;
  let youtubePlayer = null;
  let isPlaying = false;
  let isPaused = false;
  let currentImageIndex = 0;
  let currentImages = [];
  let currentProductName = '';
  let socket = null;
  let currentChatCardId = null;
  let socketInitialized = false;

  // Подсчитываем карточки товаров и услуг отдельно
  const productCards = document.querySelectorAll('#catalog .product-card');
  const serviceCards = document.querySelectorAll('#services .product-card');
  const allCards = document.querySelectorAll('.product-card');

  console.log('📊 Количество карточек товаров:', productCards.length);
  console.log('📊 Количество карточек услуг:', serviceCards.length);
  console.log('📊 Всего карточек (.product-card):', allCards.length);

  // Инициализация состояния голосования для гостей (проверка cookie)
  if (!isLoggedInClient()) {
    document.querySelectorAll(".product-rating").forEach(ratingBlock => {
      productId = ratingBlock.dataset.id;
      if (productId) {
        const voteCookie = document.cookie.split(';').some(cookie => cookie.trim().startsWith(`exto_vote_${productId}=`));
        if (voteCookie) {
          ratingBlock.dataset.voted = "true";
          ratingBlock.querySelectorAll("button").forEach((b) => {
            b.disabled = true;
          });
        }
      }
    });
  }

  // Создание YouTube iframe с использованием YouTube IFrame API
  function createYouTubeIframe(videoId) {
    videoOverlay = document.getElementById('videoOverlay');
    videoIframeContainer = document.getElementById('videoIframeContainer');
    if (!videoId || !videoIframeContainer) return;

    videoIframeContainer.innerHTML = '';
    const iframe = document.createElement('iframe');
    fillYoutubeIframe(iframe, videoId);
    videoIframeContainer.appendChild(iframe);
    currentVideoIframe = iframe;
  }

  window.onYouTubeIframeAPIReady = function() {};

  // Создание VK iframe
  function createVkIframe(url) {
    if (!url || !videoIframeContainer) {
      console.error('❌ createVkIframe: отсутствует url или videoIframeContainer');
      if (currentVideoUrl) {
        window.open(currentVideoUrl, '_blank');
      }
      closeVideoOverlay();
      return;
    }

    try {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('scrolling', 'no');
      iframe.setAttribute('allow', 'fullscreen');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.display = 'block';
      iframe.src = url;

      iframe.onerror = function() {
        console.error('❌ Ошибка загрузки VK iframe');
        if (currentVideoUrl) {
          window.open(currentVideoUrl, '_blank');
        }
        closeVideoOverlay();
      };

      iframe.onload = function() {
        console.log('✅ VK iframe загружен');
      };

      videoIframeContainer.appendChild(iframe);
      currentVideoIframe = iframe;
      console.log('✅ VK iframe создан');

    } catch (error) {
      console.error('❌ Ошибка создания VK iframe:', error);
      if (currentVideoUrl) {
        window.open(currentVideoUrl, '_blank');
      }
      closeVideoOverlay();
    }
  }

  // Создание Instagram iframe
  async function createInstagramIframe(url) {
    if (!url || !videoIframeContainer) {
      console.error('❌ createInstagramIframe: отсутствует url или videoIframeContainer');
      if (currentVideoUrl) {
        window.open(currentVideoUrl, '_blank');
      }
      closeVideoOverlay();
      return;
    }

    // Добавляем класс для Instagram контейнера
    const container = videoOverlay.querySelector('.video-overlay-container');
    if (container) {
      container.classList.add('instagram-container');
    }

    // Показываем индикатор загрузки
    videoIframeContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;">Загрузка...</div>';

    try {
      videoIframeContainer.textContent = '';
      const iframe = document.createElement('iframe');
      iframe.src = instagramEmbedSrc(url);
      iframe.setAttribute('allow', 'encrypted-media; fullscreen; picture-in-picture');
      iframe.setAttribute('scrolling', 'no');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.display = 'block';
      iframe.style.minHeight = '600px';
      videoIframeContainer.appendChild(iframe);
      currentVideoIframe = iframe;
      console.log('✅ Instagram iframe создан');
    } catch (err) {
      console.error('❌ Ошибка загрузки Instagram:', err);
      window.open(url, '_blank');
      closeVideoOverlay();
    }
  }

  // Универсальная функция открытия видео overlay
  async function openVideoOverlay(videoUrl) {
    if (!videoUrl) {
      console.warn('⚠️ openVideoOverlay: videoUrl не указан');
      return;
    }

    // Защита от повторных вызовов
    if (isVideoOpening) {
      console.log('ℹ️ Видео уже открывается, пропускаем повторный вызов');
      return;
    }

    // Проверяем наличие элементов
    if (!videoOverlay || !videoIframeContainer) {
      console.error('❌ Video overlay elements not found, opening in new tab');
      window.open(videoUrl, '_blank');
      return;
    }

    try {
      isVideoOpening = true;
      currentVideoUrl = videoUrl;

      // Определяем тип видео
      const videoType = getVideoType(videoUrl);

      if (!videoType) {
        console.warn('⚠️ Неизвестный тип видео:', videoUrl);
        window.open(videoUrl, '_blank');
        return;
      }

      // Очищаем предыдущий контент
      if (currentVideoIframe) {
        try {
          currentVideoIframe.src = '';
        } catch (e) {
          // Игнорируем ошибки при очистке
        }
        currentVideoIframe = null;
      }
      videoIframeContainer.innerHTML = '';

      // Показываем overlay
      videoOverlay.classList.add('show');
      videoOverlay.setAttribute('aria-hidden', 'false');
      videoOverlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';

      console.log('✅ Overlay показан, класс show добавлен');

      // Обработка разных типов видео
      if (videoType === 'youtube') {
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
          window.open(videoUrl, '_blank');
          closeVideoOverlay();
          return;
        }
        createYouTubeIframe(videoId);

      } else if (videoType === 'vk') {
        const vkParams = extractVKVideoParams(videoUrl);
        if (!vkParams) {
          console.warn('⚠️ Не удалось извлечь параметры VK из URL:', videoUrl);
          window.open(videoUrl, '_blank');
          closeVideoOverlay();
          return;
        }
        const embedUrl = buildVKEmbedUrl(vkParams);
        console.log('▶️ Открытие VK видео:', embedUrl);
        createVkIframe(embedUrl);

      } else if (videoType === 'instagram') {
        console.log('▶️ Открытие Instagram видео:', videoUrl);
        await createInstagramIframe(videoUrl);

      } else {
        console.warn('⚠️ Неизвестный тип видео:', videoType);
        window.open(videoUrl, '_blank');
        closeVideoOverlay();
      }
    } catch (error) {
      console.error('❌ Критическая ошибка в openVideoOverlay:', error);
      window.open(videoUrl, '_blank');
      closeVideoOverlay();
    } finally {
      // Сбрасываем флаг после небольшой задержки
      setTimeout(() => {
        isVideoOpening = false;
      }, 500);
    }
  }
  window.openVideoOverlay = openVideoOverlay;

  // Функция закрытия видео overlay
  function closeVideoOverlay() {
    // Сбрасываем флаг открытия
    isVideoOpening = false;

    // Сбрасываем флаги воспроизведения
    isPlaying = false;
    isPaused = false;

    // Останавливаем и уничтожаем YouTube плеер
    if (youtubePlayer) {
      try {
        if (youtubePlayer.stopVideo) {
          youtubePlayer.stopVideo();
        }
        if (youtubePlayer.destroy) {
          youtubePlayer.destroy();
        }
        console.log('🛑 YouTube плеер остановлен и уничтожен');
      } catch (e) {
        console.warn('⚠️ Ошибка при остановке YouTube плеера:', e);
      }
      youtubePlayer = null;
    }

    // Очищаем src у iframe для остановки воспроизведения
    if (currentVideoIframe) {
      try {
        currentVideoIframe.src = '';
      } catch (e) {
        // Игнорируем ошибки при очистке
      }
      currentVideoIframe = null;
    }

    // Очищаем контейнер
    if (videoIframeContainer) {
      videoIframeContainer.innerHTML = '';
    }

    // Убираем класс instagram-container если был добавлен
    const container = videoOverlay ? videoOverlay.querySelector('.video-overlay-container') : null;
    if (container) {
      container.classList.remove('instagram-container');
    }

    currentVideoUrl = null;

    // Скрываем overlay
    if (videoOverlay) {
      videoOverlay.classList.remove('show');
      videoOverlay.setAttribute('aria-hidden', 'true');
      videoOverlay.style.display = 'none';
    }
    document.body.style.overflow = '';
    console.log('✅ Video overlay закрыт');
  }

  // Функция открытия модального окна с изображением
  function openImageModal(imageSrc, imageIndex, images, productName) {
    currentImages = images || [imageSrc];
    currentImageIndex = imageIndex || 0;
    currentProductName = productName || '';

    if (imageModal && imageModalImage) {
      imageModalImage.src = currentImages[currentImageIndex];
      imageModalImage.alt = `${productName} - изображение ${currentImageIndex + 1}`;

      if (imageModalCurrent) {
        imageModalCurrent.textContent = currentImageIndex + 1;
      }
      if (imageModalTotal) {
        imageModalTotal.textContent = currentImages.length;
      }
      if (imageModalTitle) {
        imageModalTitle.textContent = productName;
      }

      imageModal.style.display = 'flex';
      imageModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }

  // Функция закрытия модального окна с изображением
  function closeImageModal() {
    if (imageModal) {
      imageModal.style.display = 'none';
      imageModal.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    currentImages = [];
    currentImageIndex = 0;
    currentProductName = '';
  }

  // Функция переключения изображения
  function navigateImage(direction) {
    if (currentImages.length === 0) return;
    if (direction === 'next') {
      currentImageIndex = (currentImageIndex + 1) % currentImages.length;
    } else if (direction === 'prev') {
      currentImageIndex = (currentImageIndex - 1 + currentImages.length) % currentImages.length;
    }

    if (imageModal && imageModalImage) {
      imageModalImage.src = currentImages[currentImageIndex];
      imageModalImage.alt = `${currentProductName} - изображение ${currentImageIndex + 1}`;
      if (imageModalCurrent) {
        imageModalCurrent.textContent = currentImageIndex + 1;
      }
    }
  }

  // Инициализация слайдера изображений
  function initImageSliders() {
    const sliders = document.querySelectorAll('.product-images-slider');
    sliders.forEach(slider => {
      const images = slider.querySelectorAll('.product-image-slide');
      if (images.length <= 1) return;

      const prevBtn = slider.querySelector('.slider-arrow-prev');
      const nextBtn = slider.querySelector('.slider-arrow-next');
      const indicators = slider.querySelectorAll('.slider-indicator');
      let currentIndex = 0;

      function goToSlide(index) {
        images.forEach((img, idx) => {
          img.classList.toggle('active', idx === index);
        });
        indicators.forEach((ind, idx) => {
          ind.classList.toggle('active', idx === index);
        });
        currentIndex = index;
      }

      if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          goToSlide((currentIndex - 1 + images.length) % images.length);
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          goToSlide((currentIndex + 1) % images.length);
        });
      }

      indicators.forEach((ind, idx) => {
        ind.addEventListener('click', (e) => {
          e.stopPropagation();
          goToSlide(idx);
        });
      });

      images.forEach((img, idx) => {
        img.addEventListener('click', () => {
          let allImages = [];
          try {
            const imagesData = img.getAttribute('data-product-images');
            if (imagesData) {
              allImages = JSON.parse(imagesData);
            } else {
              allImages = Array.from(images).map(i => i.getAttribute('data-image-src') || i.src);
            }
          } catch (e) {
            allImages = Array.from(images).map(i => i.getAttribute('data-image-src') || i.src);
          }

          const productName = img.getAttribute('data-product-name') || '';
          const imageSrc = img.getAttribute('data-image-src') || img.src;

          if (imageModal) {
            openImageModal(imageSrc, idx, allImages, productName);
          }
        });
      });

      // Поддержка свайпа
      let touchStartX = 0;
      let touchEndX = 0;

      slider.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      slider.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      }, { passive: true });

      function handleSwipe() {
        const swipeThreshold = 50;
        const diffX = touchStartX - touchEndX;

        if (Math.abs(diffX) > swipeThreshold) {
          if (diffX > 0) {
            goToSlide((currentIndex + 1) % images.length);
          } else {
            goToSlide((currentIndex - 1 + images.length) % images.length);
          }
        }
      }
    });
  }

  // Клавиатурная навигация для модального окна изображений
  document.addEventListener('keydown', (e) => {
    if (!imageModal || imageModal.style.display === 'none') return;

    if (e.key === 'Escape') {
      closeImageModal();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateImage('prev');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateImage('next');
    }
  });

  // Инициализация компонентов
  initImageSliders();

  // Обработчик клика на кнопку "Обзор" и закрытия overlay
  document.addEventListener('click', (e) => {
    // Клик на кнопку видео
    const videoBtn = e.target.closest('button[data-video], .btn[data-video], .btn-video-link[data-video]');
    if (videoBtn) {
      e.preventDefault();
      e.stopPropagation();

      const videoUrl = videoBtn.getAttribute('data-video');
      if (videoUrl) {
        openVideoOverlay(videoUrl).catch(function (err) {
          console.error('Ошибка при открытии видео:', err);
          window.open(videoUrl, '_blank');
        });
      }
      return false;
    }

    // Закрытие видео overlay
    if (videoOverlay && (e.target === videoOverlay || e.target.closest('[data-close-video]'))) {
      e.preventDefault();
      e.stopPropagation();
      closeVideoOverlay();
      return;
    }

    // Клик на изображения
    if (e.target.classList.contains('image-clickable')) {
      e.preventDefault();
      e.stopPropagation();
      const img = e.target;
      let allImages = [];
      try {
        const imagesData = img.getAttribute('data-product-images');
        if (imagesData) {
          allImages = JSON.parse(imagesData);
        } else {
          allImages = [img.getAttribute('data-image-src') || img.src];
        }
      } catch (e) {
        allImages = [img.getAttribute('data-image-src') || img.src];
      }

      const imageIndex = parseInt(img.getAttribute('data-image-index')) || 0;
      const productName = img.getAttribute('data-product-name') || '';
      const imageSrc = img.getAttribute('data-image-src') || img.src;

      if (imageModal) {
        openImageModal(imageSrc, imageIndex, allImages, productName);
      }
      return;
    }

    // Закрытие модального окна изображений
    if (e.target.closest('[data-close-image]')) {
      e.preventDefault();
      e.stopPropagation();
      closeImageModal();
      return;
    }

    // Навигация по изображениям
    if (e.target.closest('.image-nav-prev')) {
      e.preventDefault();
      e.stopPropagation();
      navigateImage('prev');
      return;
    }

    if (e.target.closest('.image-nav-next')) {
      e.preventDefault();
      e.stopPropagation();
      navigateImage('next');
      return;
    }

    // Закрытие по клику на фон
    if (e.target === imageModal) {
      closeImageModal();
      return;
    }

    // Клик на кнопку чата
    const chatBtn = e.target.closest('.chat-btn');
    if (chatBtn) {
      console.log('💬 Найдена кнопка чата:', chatBtn);
      e.preventDefault();
      const cardId = chatBtn.dataset.cardId;
      if (cardId) {
        console.log('💬 Открываем чат для карточки:', cardId);
        openChatModal(cardId);
      }
      return;
    }

    // Клик на кнопку закрытия чата
    const closeChatBtn = e.target.closest('[data-close-chat-modal]');
    if (closeChatBtn) {
      e.preventDefault();
      e.stopPropagation();
      const cardId = closeChatBtn.getAttribute('data-close-chat-modal');
      if (cardId) {
        console.log('💬 Закрываем чат для карточки:', cardId);
        window.closeChatModal(cardId);
      }
      return;
    }

    // Клик на overlay чата (закрытие по клику на фон)
    const chatModalOverlay = e.target.closest('.chat-modal-overlay');
    if (chatModalOverlay) {
      e.preventDefault();
      e.stopPropagation();
      const modal = chatModalOverlay.closest('.chat-modal');
      if (modal && modal.id) {
        const cardId = modal.id.replace('chat-modal-', '');
        if (cardId) {
          console.log('💬 Закрываем чат по клику на overlay:', cardId);
          window.closeChatModal(cardId);
        }
      }
      return;
    }
  });

  // Регистрация
  const registerModal = document.getElementById("registerModal");
  const openRegisterBtn = document.getElementById("openRegister");
  const closeRegisterBtn = document.querySelector("[data-close-register]");
  const registerForm = document.getElementById("registerForm");
  const registerError = document.getElementById("registerError");
  const registerSuccess = document.getElementById("registerSuccess");

  // Глобальная функция для открытия модального окна регистрации
  window.openRegister = function() {
    if (registerModal) {
      registerModal.style.display = "block";
      registerModal.setAttribute("aria-hidden", "false");
    }
  };

  if (openRegisterBtn && registerModal) {
    openRegisterBtn.addEventListener("click", () => {
      registerModal.style.display = "block";
      registerModal.setAttribute("aria-hidden", "false");
    });

    if (closeRegisterBtn) {
      closeRegisterBtn.addEventListener("click", () => {
        registerModal.style.display = "none";
        registerModal.setAttribute("aria-hidden", "true");
        if (registerError) registerError.style.display = "none";
      });
    }

    window.addEventListener("click", (e) => {
      if (e.target === registerModal) {
        registerModal.style.display = "none";
        registerModal.setAttribute("aria-hidden", "true");
      }
    });
  }

  if (registerForm) {
    const isVercel = window.location.hostname.includes('vercel.app') ||
                     window.location.hostname.includes('extension-investment');

    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      let formData = Object.fromEntries(new FormData(registerForm).entries());

      if (isVercel && formData._csrf) {
        delete formData._csrf;
      }

      if (registerError) registerError.style.display = "none";
      if (registerSuccess) registerSuccess.style.display = "none";

      try {
        const headers = {
          "Content-Type": "application/json"
        };

        if (!isVercel) {
          const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
          if (csrfToken) {
            headers["X-CSRF-Token"] = csrfToken;
          }
        }

        const res = await fetch(window.location.origin + "/register", {
          method: "POST",
          headers: headers,
          body: JSON.stringify(formData),
          credentials: 'same-origin'
        });

        const contentType = res.headers.get("content-type");
        let data;

        if (contentType && contentType.includes("application/json")) {
          data = await res.json();
        } else {
          const text = await res.text();
          data = { success: false, message: text || "Ошибка сервера" };
        }

        if (data.success) {
          if (registerError) registerError.style.display = "none";
          if (registerSuccess) {
            registerSuccess.textContent = "Регистрация завершена. Теперь вы можете открыть личный кабинет.";
            registerSuccess.style.display = "block";
          }
          registerForm.reset();
          setTimeout(() => {
            if (registerModal) {
              registerModal.style.display = "none";
              registerModal.setAttribute("aria-hidden", "true");
            }
          }, 2000);
        } else {
          if (registerError) {
            registerError.textContent = data.message || "Ошибка регистрации";
            registerError.style.display = "block";
          }
        }
      } catch (err) {
        console.error("Registration error:", err);
        if (registerError) {
          registerError.textContent = "Сеть недоступна или сервер не отвечает";
          registerError.style.display = "block";
        }
      }
    });
  }

  // Модальное окно описания товара
  const descriptionModal = document.getElementById('descriptionModal');
  const descriptionModalTitle = document.getElementById('descriptionModalTitle');
  const descriptionModalContent = document.getElementById('descriptionModalContent');
  const closeDescriptionBtn = document.querySelector('[data-close-description]');

  function openDescriptionModal(productName, description) {
    if (!descriptionModal || !description) return;

    if (descriptionModalTitle) {
      descriptionModalTitle.textContent = productName || 'Описание товара';
    }

    if (descriptionModalContent) {
      const p = document.createElement('p');
      p.style.whiteSpace = 'pre-wrap';
      p.style.wordWrap = 'break-word';
      p.textContent = description;
      descriptionModalContent.innerHTML = '';
      descriptionModalContent.appendChild(p);
    }

    descriptionModal.style.display = 'block';
    descriptionModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDescriptionModal() {
    if (!descriptionModal) return;
    descriptionModal.style.display = 'none';
    descriptionModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  document.addEventListener('click', (e) => {
    const infoIcon = e.target.closest('.product-info-icon');
    if (infoIcon) {
      e.preventDefault();
      e.stopPropagation();
      const productName = infoIcon.getAttribute('data-product-name') || 'Товар';
      const description = infoIcon.getAttribute('data-description') || '';
      openDescriptionModal(productName, description);
      return;
    }

    const descBtn = e.target.closest('[data-description-modal]');
    if (descBtn) {
      e.preventDefault();
      e.stopPropagation();
      const productName = descBtn.getAttribute('data-product-name') || 'Товар';
      const description = descBtn.getAttribute('data-description') || '';
      openDescriptionModal(productName, description);
      return;
    }

    if (e.target.closest('[data-close-description]')) {
      e.preventDefault();
      e.stopPropagation();
      closeDescriptionModal();
      return;
    }

    if (e.target === descriptionModal) {
      closeDescriptionModal();
      return;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (descriptionModal && descriptionModal.style.display === 'block') {
        closeDescriptionModal();
      }
      if (videoOverlay && videoOverlay.classList.contains('show')) {
        closeVideoOverlay();
      }
    }
  });

  // Категории и рейтинг
  document.addEventListener("click", async (e) => {
    if (e.target.closest('.btn[data-video]') ||
        e.target.closest('[data-close-video]') ||
        e.target === videoOverlay ||
        e.target.closest('.product-image-slide') ||
        e.target.closest('.slider-arrow') ||
        e.target.closest('.slider-indicator') ||
        e.target.closest('[data-close-image]') ||
        e.target.closest('[data-image-nav]') ||
        e.target === imageOverlay ||
        e.target.closest('.product-info-icon') ||
        e.target.closest('[data-description-modal]') ||
        e.target.closest('[data-close-description]') ||
        e.target === descriptionModal) {
      return;
    }

    // Категории
    const openCat = e.target.closest("#openCategories");
    const dropdown = document.getElementById("categoriesMenu");

    if (openCat && dropdown) {
      const opened = dropdown.classList.toggle("open");
      dropdown.setAttribute("aria-hidden", opened ? "false" : "true");

      // Загружаем категории при первом открытии
      if (opened && !dropdown.hasAttribute('data-loaded')) {
        await loadCategoriesForCurrentPage();
        dropdown.setAttribute('data-loaded', 'true');
      }

      e.stopPropagation();
      return;
    }

    // Клик по категории
    const catItem = e.target.closest(".dropdown-item");
    if (catItem && dropdown) {
      const cat = catItem.getAttribute("data-category");
      const blockId = catItem.getAttribute("data-block-id");
      const categoryId = catItem.getAttribute("data-category-id");

      if (blockId) {
        // Это блок - загружаем подкатегории
        e.stopPropagation();
        await loadSubcategories(blockId, catItem.textContent.trim());
        return;
      } else if (categoryId) {
        // Это подкатегория - обновляем текст кнопки и переходим
        e.stopPropagation();
        console.log('🖱️ Клик по подкатегории в меню:', { categoryId, text: catItem.textContent.trim() });

        // Извлекаем название категории из текста кнопки (убираем иконку)
        const categoryText = catItem.textContent.trim();
        const categoryName = categoryText.replace(/^[^a-zA-Zа-яА-Я]*/, '').trim(); // Убираем иконку в начале

        console.log('📝 Извлеченное название категории:', categoryName);
        selectCategory(categoryId, categoryName);
        return;
      } else if (cat) {
        // Обычная категория
        const url = new URL(window.location.href);
        if (cat === "all") url.searchParams.delete("category");
        else url.searchParams.set("category", cat);
        window.location.href = url.toString();
        return;
      }
    }

    // Клик по кнопке "Назад к блокам"
    const backBtn = e.target.closest("#backToBlocks");
    if (backBtn && dropdown) {
      showCategoryBlocks();
      e.stopPropagation();
      return;
    }

    // Закрытие меню при клике вне
    if (dropdown && !e.target.closest(".category-selector-container")) {
      dropdown.classList.remove("open");
      dropdown.setAttribute("aria-hidden", "true");
      showCategoryBlocks();
    }

    // Рейтинг
    const likeBtn = e.target.closest(".like-btn, .product-like-btn, .service-like-btn, .banner-like-btn");
    const dislikeBtn = e.target.closest(".dislike-btn, .product-dislike-btn, .service-dislike-btn, .banner-dislike-btn");

    if (likeBtn || dislikeBtn) {
      const ratingBlock = e.target.closest(".product-rating, .service-rating, .banner-rating, .item-rating");
      if (!ratingBlock) return;

      productId = ratingBlock.dataset.id;

      let itemType = 'product';
      if (ratingBlock.classList.contains('service-rating')) {
        itemType = 'service';
      } else if (ratingBlock.classList.contains('banner-rating')) {
        itemType = 'banner';
      }

      if (ratingBlock.dataset.voted === "true") {
        return;
      }

      if (!isLoggedInClient()) {
        const voteCookie = document.cookie.split(';').some(cookie => cookie.trim().startsWith(`exto_${itemType}_vote_${productId}=`));
        if (voteCookie) {
          ratingBlock.dataset.voted = "true";
          ratingBlock.querySelectorAll("button").forEach((b) => {
            b.disabled = true;
          });
          return;
        }
      }

      const resultEl = ratingBlock.querySelector(".result");
      const votesEl = ratingBlock.querySelector(".votes");
      const value = likeBtn ? "like" : "dislike";

      ratingBlock.querySelectorAll("button").forEach((b) => {
        b.disabled = true;
      });

      try {
        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const csrfInput = document.querySelector('input[name="_csrf"]');
        let csrfToken = '';
        
        if (csrfMeta) {
          csrfToken = csrfMeta.getAttribute('content');
        } else if (csrfInput) {
          csrfToken = csrfInput.value;
        }
        
        // Проверяем, что токен не пустой
        if (!csrfToken) {
          console.error('❌ CSRF токен не найден');
          showToast('Ошибка: отсутствует токен безопасности. Обновите страницу.', 'error');
          ratingBlock.querySelectorAll("button").forEach((b) => {
            b.disabled = false;
          });
          return;
        }

        const vote = value === 'like' ? 'up' : 'down';

        let endpoint;
        if (itemType === 'service') {
          endpoint = `/api/services/${productId}/vote`;
        } else {
          endpoint = `/api/rating/${productId}`;
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
          },
          body: JSON.stringify({ vote, type: itemType }),
          credentials: 'include'
        });
        const data = await res.json();

        if (data.success) {
          if (resultEl) resultEl.textContent = String(data.result);
          if (votesEl) votesEl.textContent = `(${data.total} голосов)`;
          ratingBlock.dataset.voted = "true";
        } else {
          console.warn("⚠️ Сервер вернул ошибку:", data.message || data.error);
          ratingBlock.querySelectorAll("button").forEach((b) => {
            b.disabled = false;
          });

          if (res.status === 409) {
            ratingBlock.dataset.voted = "true";
            ratingBlock.querySelectorAll("button").forEach((b) => {
              b.disabled = true;
            });
          }
        }
      } catch (err) {
        console.error("❌ Ошибка сохранения рейтинга:", err);
        ratingBlock.querySelectorAll("button").forEach((b) => {
          b.disabled = false;
        });
      }
    }
  });
});

// =======================
// Функции для работы с категориями
// =======================

async function loadCategoriesForCurrentPage() {
  try {
    // Определяем тип страницы по URL или по наличию элементов
    let endpoint = '/api/categories/tree/product'; // по умолчанию для товаров

    if (window.location.pathname.includes('/services')) {
      endpoint = '/api/categories/tree/service';
    } else if (window.location.pathname.includes('/products')) {
      endpoint = '/api/categories/tree/product';
    }

    console.log('📂 Загружаем категории для:', endpoint);

    const response = await fetch(endpoint);
    const data = await response.json();

    if (data.success && data.categories) {
      renderCategoryBlocks(data.categories);
    } else {
      console.error('Ошибка загрузки блоков категорий:', data.message);
    }
  } catch (error) {
    console.error('Ошибка сети при загрузке блоков:', error);
  }
}

function renderCategoryBlocks(blocks) {
  const categoriesBlocks = document.getElementById('categoriesBlocks');
  if (!categoriesBlocks) return;

  categoriesBlocks.innerHTML = '';

  blocks.forEach(block => {
    const blockBtn = document.createElement('button');
    blockBtn.className = 'dropdown-item category-block';
    blockBtn.setAttribute('data-block-id', block._id);
    blockBtn.innerHTML = `${block.icon || ''} ${block.name}`;
    blockBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      loadSubcategories(block._id, block.name);
    });
    categoriesBlocks.appendChild(blockBtn);
  });
}

async function loadSubcategories(blockId, blockName) {
  try {
    const response = await fetch(`/api/categories/children/${blockId}`);
    const data = await response.json();

    if (data.success && data.categories) {
      renderSubcategories(data.categories, blockName);
    } else {
      console.error('Ошибка загрузки подкатегорий:', data.message);
    }
  } catch (error) {
    console.error('Ошибка сети при загрузке подкатегорий:', error);
  }
}

function renderSubcategories(subcategories, blockName) {
  const subcategoriesContainer = document.getElementById('subcategoriesContainer');
  const subcategoriesList = document.getElementById('subcategoriesList');

  if (!subcategoriesContainer || !subcategoriesList) return;

  console.log('🔄 renderSubcategories:', { subcategories, blockName });

  subcategoriesList.innerHTML = `<h4>${blockName}</h4>`;

  subcategories.forEach(sub => {
    console.log('📂 Обрабатываем подкатегорию:', sub);

    const subBtn = document.createElement('button');
    subBtn.className = 'dropdown-item subcategory-item';
    subBtn.setAttribute('data-category-id', sub._id);
    subBtn.setAttribute('data-category-name', sub.name || 'Категория'); // Сохраняем название в data-атрибуте
    subBtn.innerHTML = `${sub.icon || ''} ${sub.name || 'Без названия'}`;
    subBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const categoryName = this.getAttribute('data-category-name') || 'Категория';
      console.log('🖱️ Клик по подкатегории:', { id: sub._id, name: categoryName });
      selectCategory(sub._id, categoryName);
    });
    subcategoriesList.appendChild(subBtn);
  });

  // Показываем контейнер подкатегорий
  showSubcategories();
}

function showCategoryBlocks() {
  const categoriesBlocks = document.getElementById('categoriesBlocks');
  const subcategoriesContainer = document.getElementById('subcategoriesContainer');
  const subcategoriesList = document.getElementById('subcategoriesList');

  if (categoriesBlocks) categoriesBlocks.style.display = 'block';
  if (subcategoriesContainer) subcategoriesContainer.style.display = 'none';

  // Очищаем список подкатегорий при возврате к блокам
  if (subcategoriesList) {
    subcategoriesList.innerHTML = '';
  }
}

function showSubcategories() {
  const categoriesBlocks = document.getElementById('categoriesBlocks');
  const subcategoriesContainer = document.getElementById('subcategoriesContainer');

  if (categoriesBlocks) categoriesBlocks.style.display = 'none';
  if (subcategoriesContainer) subcategoriesContainer.style.display = 'block';
}

function selectCategory(categoryId, categoryName) {
  // Обновляем текст кнопки селектора категорий
  updateCategorySelectorText(categoryId, categoryName);

  // Небольшая задержка, чтобы пользователь увидел обновление текста
  setTimeout(() => {
    // Обновляем URL с ID категории вместо имени
    const url = new URL(window.location.href);
    url.searchParams.set('category', categoryId);
    window.location.href = url.toString();
  }, 150);
}

function updateCategorySelectorText(categoryId, categoryName) {
  const categoryButton = document.getElementById('openCategories');
  if (!categoryButton) {
    console.error('❌ Кнопка openCategories не найдена');
    return;
  }

  const span = categoryButton.querySelector('span');
  if (!span) {
    console.error('❌ Span элемент внутри кнопки openCategories не найден');
    console.log('HTML кнопки:', categoryButton.innerHTML);
    return;
  }

  // Отладка
  console.log('🔄 updateCategorySelectorText:', { categoryId, categoryName, spanExists: !!span });

  // Обновляем текст в span элементе
  if (categoryId === 'all') {
    span.textContent = '(все)';
    console.log('✅ Установлен текст "(все)"');
  } else {
    // Используем название категории, если оно есть и не пустое
    let displayName = 'Категория'; // fallback по умолчанию

    if (categoryName && typeof categoryName === 'string' && categoryName.trim()) {
      displayName = categoryName.trim();
    } else if (categoryName && typeof categoryName === 'object' && categoryName.name) {
      // На случай если передается объект с полем name
      displayName = categoryName.name;
    } else {
      // Если название не найдено, используем "Категория" вместо ID
      console.warn('⚠️ Название категории не найдено для ID:', categoryId, 'используем fallback:', displayName);
    }

    span.textContent = `(${displayName})`;
    console.log('✅ Установлен текст:', span.textContent);
  }

  // Проверяем результат
  console.log('📝 Финальный HTML кнопки:', categoryButton.innerHTML);
}

// =======================
// Универсальные функции для работы с карточками
// =======================

async function deleteItem(itemType, itemId, cardElement) {
  const typeNames = { product: 'товар', service: 'услугу', banner: 'баннер' };
  const confirmed = confirm(`Вы уверены, что хотите удалить этот ${typeNames[itemType]}? Это действие нельзя отменить.`);
  if (!confirmed) {
    return false;
  }

  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (!csrfToken) {
    alert('Ошибка: отсутствует CSRF токен. Обновите страницу.');
    return false;
  }

  const isAdminPage = window.location.pathname.includes('/admin/');
  const endpoint = isAdminPage
    ? `/admin/${itemType === 'product' ? 'products' : itemType === 'service' ? 'services' : 'banners'}/${itemId}`
    : `/api/${itemType === 'product' ? 'products' : itemType === 'service' ? 'services' : 'banners'}/${itemId}`;

  const deleteBtn = cardElement?.querySelector(`.delete-${itemType}-btn`);
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Удаление...';
  }

  try {
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    });

    const data = await res.json();

    if (data.success) {
      if (cardElement && cardElement.style) {
        cardElement.style.opacity = '0.5';
        cardElement.style.transition = 'opacity 0.3s';
        setTimeout(() => {
          if (cardElement && cardElement.remove) {
            cardElement.remove();
          }

          const remainingCards = document.querySelectorAll('.catalog-item, .product-card, .service-card');
          if (remainingCards && remainingCards.length === 0) {
            location.reload();
          }
        }, 300);
      }

      showToast(`✅ ${typeNames[itemType].charAt(0).toUpperCase() + typeNames[itemType].slice(1)} удалён`, 'success');
      return true;
    } else {
      if (deleteBtn && deleteBtn.disabled !== undefined) {
        deleteBtn.disabled = false;
      }
      if (deleteBtn && deleteBtn.textContent !== undefined) {
        deleteBtn.textContent = '🗑️ Удалить';
      }
      showToast('❌ Ошибка удаления: ' + (data.message || 'Неизвестная ошибка'), 'error');
      return false;
    }
  } catch (err) {
    console.error(`❌ Ошибка сети при удалении ${itemType}:`, err);
    if (deleteBtn && deleteBtn.disabled !== undefined) {
      deleteBtn.disabled = false;
    }
    if (deleteBtn && deleteBtn.textContent !== undefined) {
      deleteBtn.textContent = '🗑️ Удалить';
    }
    showToast('❌ Ошибка сети. Проверьте подключение к интернету', 'error');
    return false;
  }
}

async function voteItem(itemType, itemId, vote, ratingBlock) {
  if (!ratingBlock) return false;

  if (ratingBlock.dataset.voted === 'true') {
    return false;
  }

  const buttons = ratingBlock.querySelectorAll('button');
  if (buttons && buttons.length > 0) {
    buttons.forEach(btn => {
      if (btn && btn.disabled !== undefined) {
        btn.disabled = true;
      }
    });
  }

  let csrfToken = '';
  const csrfMeta = document.querySelector('meta[name="csrf-token"]');
  const csrfInput = document.querySelector('input[name="_csrf"]');
  
  if (csrfMeta) {
    csrfToken = csrfMeta.getAttribute('content');
  } else if (csrfInput) {
    csrfToken = csrfInput.value;
  }
  
  // Проверяем, что токен не пустой
  if (!csrfToken) {
    console.error('❌ CSRF токен не найден');
    showToast('Ошибка: отсутствует токен безопасности. Обновите страницу.', 'error');
    const buttons = ratingBlock.querySelectorAll('button');
    if (buttons && buttons.length > 0) {
      buttons.forEach(btn => {
        if (btn && btn.disabled !== undefined) {
          btn.disabled = false;
        }
      });
    }
    return false;
  }

  try {
    let endpoint;
    let body;

    if (itemType === 'product') {
      endpoint = `/api/rating/${itemId}`;
    } else if (itemType === 'service') {
      endpoint = `/api/services/${itemId}/vote`;
    } else {
      endpoint = `/api/rating/${itemId}`;
    }
    body = JSON.stringify({ vote, type: itemType });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: body,
      credentials: 'same-origin'
    });

    const data = await res.json();

    if (data.success) {
      const resultEl = ratingBlock.querySelector(`.${itemType}-result`) || ratingBlock.querySelector('.rating-result') || ratingBlock.querySelector('.result');
      const votesEl = ratingBlock.querySelector(`.${itemType}-votes`) || ratingBlock.querySelector('.rating-votes') || ratingBlock.querySelector('.votes');

      if (resultEl && resultEl.textContent !== undefined) {
        resultEl.textContent = data.result !== undefined ? data.result : ((data.rating_up || data.likes || 0) - (data.rating_down || data.dislikes || 0));
      }
      if (votesEl && votesEl.textContent !== undefined) {
        votesEl.textContent = `(${data.total !== undefined ? data.total : ((data.rating_up || data.likes || 0) + (data.rating_down || data.dislikes || 0))} голосов)`;
      }

      if (ratingBlock && ratingBlock.dataset) {
        ratingBlock.dataset.voted = 'true';
      }
      return true;
    } else {
      const buttons = ratingBlock.querySelectorAll('button');
      if (buttons && buttons.length > 0) {
        buttons.forEach(btn => {
          if (btn && btn.disabled !== undefined) {
            btn.disabled = false;
          }
        });
      }

      if (res.status === 409) {
        if (ratingBlock && ratingBlock.dataset) {
          ratingBlock.dataset.voted = 'true';
        }
        const buttons = ratingBlock.querySelectorAll('button');
        if (buttons && buttons.length > 0) {
          buttons.forEach(btn => {
            if (btn && btn.disabled !== undefined) {
              btn.disabled = true;
            }
          });
        }
      }
      return false;
    }
  } catch (err) {
    console.error('Ошибка голосования:', err);
    const buttons = ratingBlock.querySelectorAll('button');
    if (buttons && buttons.length > 0) {
      buttons.forEach(btn => {
        if (btn && btn.disabled !== undefined) {
          btn.disabled = false;
        }
      });
    }
    return false;
  }
}

function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  if (toast.className !== undefined) {
    toast.className = 'toast toast-' + type;
  }
  if (toast.setAttribute) {
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
  }
  if (toast.style && toast.style.cssText !== undefined) {
    toast.style.cssText = `
      padding: 12px 20px;
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      min-width: 250px;
      max-width: 400px;
      animation: slideIn 0.3s ease-out;
    `;
  }
  if (toast.textContent !== undefined) {
    toast.textContent = message;
  }

  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast && toast.style && toast.style.animation !== undefined) {
      toast.style.animation = 'slideOut 0.3s ease-out';
    }
    setTimeout(() => {
      if (toast && toast.parentNode && toast.parentNode.removeChild) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 5000);
}

// ======= Чат комментариев =======

let socket = null;
let currentChatCardId = null;
let socketInitialized = false;

function initializeSocket() {
  if (socketInitialized && socket) return socket;

  if (typeof io === 'undefined') {
    console.warn('⚠️ Socket.IO библиотека не загружена');
    return null;
  }

  if (typeof window.SOCKET_IO_AVAILABLE === 'undefined' || !window.SOCKET_IO_AVAILABLE) {
    console.warn('⚠️ Socket.IO недоступен на этом сервере');
    return null;
  }

  try {
    socket = io({
      transports: ['websocket', 'polling'],
      timeout: 20000,
      autoConnect: true
    });

    socket.on('connect', () => {
      console.log('💬 Подключен к чату');
      socketInitialized = true;
    });

    socket.on('disconnect', () => {
      console.log('💬 Отключен от чата');
      socketInitialized = false;
    });

    socket.on('comment:new', (data) => {
      try {
        if (data && data.cardId === currentChatCardId) {
          addCommentToChat(data);
        }
      } catch (error) {
        console.error('❌ Ошибка при добавлении нового комментария:', error);
      }
    });

    socket.on('error', (error) => {
      console.error('❌ Ошибка чата:', typeof error === 'object' && error ? JSON.stringify(error) : error);
      if (typeof showToast === 'function') {
        showToast('Ошибка подключения к чату', 'error');
      }
    });

    socket.on('joined-comment-chat', (data) => {
      try {
        if (data && data.success) {
          console.log('✅ Успешно присоединился к чату карточки:', data.cardId);
        }
      } catch (error) {
        console.error('❌ Ошибка при обработке присоединения к чату:', error);
      }
    });

    socket.on('user-joined-chat', (data) => {
      try {
        console.log('👤 Новый пользователь в чате:', data.username);
      } catch (error) {
        console.error('❌ Ошибка при обработке уведомления о новом пользователе:', error);
      }
    });

    socket.on('user-left-chat', (data) => {
      try {
        console.log('👤 Пользователь покинул чат:', data.socketId);
      } catch (error) {
        console.error('❌ Ошибка при обработке уведомления о выходе пользователя:', error);
      }
    });

    socket.on('comment:updated', (data) => {
      try {
        if (data && data._id) {
          const commentElement = document.querySelector(`[data-comment-id="${data._id}"]`);
          if (commentElement) {
            const textElement = commentElement.querySelector('.chat-message-text');
            if (textElement && data.text) {
              textElement.textContent = data.text;
              commentElement.style.backgroundColor = '#e8f5e8';
              setTimeout(() => {
                commentElement.style.backgroundColor = '';
              }, 500);
            }
          }
        }
      } catch (error) {
        console.error('❌ Ошибка при обработке обновления комментария:', error);
      }
    });

    socket.on('comment:deleted', (data) => {
      try {
        if (data && data._id) {
          const commentElement = document.querySelector(`[data-comment-id="${data._id}"]`);
          if (commentElement) {
            commentElement.style.opacity = '0';
            commentElement.style.transform = 'translateX(-100%)';
            commentElement.style.transition = 'opacity 0.3s, transform 0.3s';

            setTimeout(() => {
              if (commentElement && commentElement.parentNode) {
                commentElement.parentNode.removeChild(commentElement);
              }
            }, 300);
          }
        }
      } catch (error) {
        console.error('❌ Ошибка при обработке удаления комментария:', error);
      }
    });
  } catch (error) {
    console.error('❌ Ошибка инициализации Socket.IO:', error);
    return null;
  }

  return socket;
}

async function openChatModal(cardId) {
  try {
    const isGuest = !isLoggedInClient();

    currentChatCardId = cardId;
    const modal = document.getElementById(`chat-modal-${cardId}`);
    if (!modal) {
      console.error('❌ Модальное окно чата не найдено');
      return;
    }

    socket = initializeSocket();

    if (!socket) {
      console.warn('⚠️ Socket.IO недоступен, показываем чат только для чтения');
      showToast('Чат доступен только для чтения на этом сервере', 'info');
    }

    try {
      socket.emit('join-comment-chat', { cardId });
    } catch (error) {
      console.warn('⚠️ Ошибка при присоединении к комнате чата:', error);
    }

    await loadChatMessages(cardId);

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const inputContainer = modal.querySelector('.chat-input-container');
    const sendBtn = modal.querySelector('.chat-send-btn');

    if (isGuest) {
      if (inputContainer) inputContainer.style.display = 'none';

      const messagesContainer = document.getElementById(`chat-messages-${cardId}`);
      if (messagesContainer && !messagesContainer.querySelector('.guest-info')) {
        const guestInfo = document.createElement('div');
        guestInfo.className = 'guest-info';
        guestInfo.style.cssText = `
          text-align: center;
          color: #888;
          font-style: italic;
          padding: 15px;
          border-bottom: 1px solid rgba(31, 138, 90, 0.2);
          background: rgba(31, 138, 90, 0.05);
          margin-bottom: 10px;
        `;
        guestInfo.textContent = 'Вы можете читать комментарии. Для отправки сообщений необходимо войти в систему.';
        messagesContainer.insertBefore(guestInfo, messagesContainer.firstChild);
      }
    } else {
      if (inputContainer) inputContainer.style.display = 'flex';
      if (sendBtn) sendBtn.disabled = false;
      const leftoverGuest = document.getElementById(`chat-messages-${cardId}`)?.querySelector('.guest-info');
      if (leftoverGuest) leftoverGuest.remove();

      const input = document.getElementById(`chat-input-${cardId}`);
      if (input) {
        setTimeout(() => {
          if (input && input.focus) {
            input.focus();
          }
        }, 100);
      }
    }
  } catch (error) {
    console.error('❌ Ошибка при открытии модального окна чата:', error);
    showToast('Ошибка открытия чата', 'error');
  }
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

window.closeChatModal = function(cardId) {
  try {
    console.log('💬 Закрытие чата с ID:', cardId);
    const modal = document.getElementById(`chat-modal-${cardId}`);
    if (!modal) {
      console.error('❌ Модальное окно не найдено для ID:', cardId);
      return;
    }

    if (typeof window.socket !== 'undefined' && window.socket && typeof window.currentChatCardId !== 'undefined' && window.currentChatCardId) {
      try {
        window.socket.emit('leave-comment-chat', { cardId: window.currentChatCardId });
      } catch (error) {
        console.warn('⚠️ Ошибка при отсоединении от комнаты чата:', error);
      }
    }
    if (typeof window.currentChatCardId !== 'undefined') {
      window.currentChatCardId = null;
    }

    modal.style.display = 'none';
    document.body.style.overflow = '';

    const messagesContainer = document.getElementById(`chat-messages-${cardId}`);
    if (messagesContainer) {
      messagesContainer.innerHTML = '';
    }

    console.log('✅ Чат успешно закрыт');
  } catch (error) {
    console.error('❌ Ошибка при закрытии модального окна чата:', error);
    document.body.style.overflow = '';
  }
}

async function loadChatMessages(cardId) {
  try {
    const messagesContainer = document.getElementById(`chat-messages-${cardId}`);
    if (!messagesContainer) return;

    const response = await fetch(`/api/comments/${cardId}`);

    if (!response.ok) {
      throw new Error(`HTTP ошибка! Статус: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      messagesContainer.innerHTML = '';

      if (data.comments && data.comments.length === 0) {
        messagesContainer.innerHTML = '<div class="no-comments">Комментариев пока нет. Будьте первым!</div>';
        return;
      }

      if (data.comments && Array.isArray(data.comments)) {
        data.comments.forEach(comment => {
          addCommentToChat(comment, false);
        });
      }

      setTimeout(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 100);
    } else {
      messagesContainer.innerHTML = '<div class="error">Ошибка загрузки комментариев</div>';
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки комментариев:', error);
    const messagesContainer = document.getElementById(`chat-messages-${cardId}`);
    if (messagesContainer) {
      messagesContainer.innerHTML = '<div class="error">Ошибка сети</div>';
    }
  }
}

function addCommentToChat(comment, autoScroll = true) {
  try {
    if (!currentChatCardId) return;

    const messagesContainer = document.getElementById(`chat-messages-${currentChatCardId}`);
    if (!messagesContainer) return;

    if (!comment || !comment._id || !comment.text) {
      console.warn('⚠️ Некорректный комментарий:', comment);
      return;
    }

    const commentElement = document.createElement('div');
    commentElement.className = 'chat-message';
    commentElement.setAttribute('data-comment-id', comment._id);

    let adminButtons = '';
    if (window.IS_ADMIN && comment._id) {
      adminButtons = `
        <button class="chat-edit-btn" data-edit-comment="${comment._id}" data-comment-text="${escapeHtml(comment.text || '')}">✏️</button>
        <button class="chat-delete-btn" data-delete-comment="${comment._id}">🗑️</button>
      `;
    }

    commentElement.innerHTML = `
      <div class="chat-message-header">
        <strong>${escapeHtml(comment.username || 'Пользователь')}</strong>
        <span class="chat-message-time">${new Date(comment.createdAt || Date.now()).toLocaleString()}</span>
        <div class="chat-admin-actions">${adminButtons}</div>
      </div>
      <div class="chat-message-text">${escapeHtml(comment.text || '')}</div>
    `;

    messagesContainer.appendChild(commentElement);

    if (autoScroll) {
      setTimeout(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 100);
    }
  } catch (error) {
    console.error('❌ Ошибка при добавлении комментария в чат:', error);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function isLoggedInClient() {
  if (window.IS_AUTH === true || window.IS_AUTH === 1 || window.IS_AUTH === 'true') {
    return true;
  }
  try {
    const flag = document.body && document.body.getAttribute('data-logged-in');
    if (flag === '1' || flag === 'true') {
      window.IS_AUTH = true;
      return true;
    }
    if (document.querySelector('.header-actions a[href="/cabinet"], .header-actions a[href="/admin"]')) {
      window.IS_AUTH = true;
      return true;
    }
  } catch (err) {}
  return false;
}

window.sendChatMessage = async function(cardId) {
  try {
    console.log('💬 Попытка отправки сообщения в чат карточки:', cardId);
    console.log('🔍 USER_ROLE:', window.USER_ROLE);
    console.log('🔍 IS_AUTH:', window.IS_AUTH);
    console.log('🔍 IS_ADMIN:', window.IS_ADMIN);

    if (!isLoggedInClient()) {
      console.log('❌ Пользователь не авторизован');
      showToast('Для отправки сообщений необходимо войти в систему', 'error');
      return;
    }

    console.log('✅ Пользователь авторизован');

    const input = document.getElementById(`chat-input-${cardId}`);
    if (!input) {
      console.error('❌ Поле ввода не найдено для ID:', cardId);
      return;
    }

    const text = input.value.trim();
    console.log('📝 Текст сообщения:', text);

    if (!text) {
      console.log('⚠️ Текст сообщения пустой');
      return;
    }

    if (text.length > 1000) {
      console.log('⚠️ Сообщение слишком длинное:', text.length);
      showToast('Сообщение слишком длинное (максимум 1000 символов)', 'error');
      return;
    }

    const sendBtn = document.querySelector(`#chat-modal-${cardId} .chat-send-btn`);
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Отправка...';
    }

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    console.log('🔑 CSRF токен найден:', !!csrfToken);

    if (!csrfToken) {
      console.warn('⚠️ CSRF токен не найден');
    }

    if (!socket) {
      console.warn('⚠️ Socket.IO недоступен, сообщение будет отправлено без сокета');
    }

    console.log('🚀 Отправка POST запроса на /api/comments/' + cardId);
    const commentEndpoint = `/api/comments/${cardId}`;
    const response = await fetch(commentEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken || ''
      },
      body: JSON.stringify({ text }),
      credentials: 'same-origin'
    });

    console.log('📡 Ответ сервера:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HTTP ошибка:', response.status, errorText);
      throw new Error(`HTTP ошибка! Статус: ${response.status}`);
    }

    const data = await response.json();
    console.log('📋 Данные ответа:', data);

    if (data.success) {
      console.log('✅ Комментарий успешно отправлен');
      input.value = '';
    } else {
      console.error('❌ Сервер вернул ошибку:', data.message);
      showToast('Ошибка: ' + (data.message || 'Не удалось отправить сообщение'), 'error');
    }
  } catch (error) {
    console.error('❌ Ошибка отправки сообщения:', error);
    showToast('Ошибка сети при отправке сообщения', 'error');
  } finally {
    const sendBtn = document.querySelector(`#chat-modal-${cardId} .chat-send-btn`);
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Отправить';
    }
  }
}

document.addEventListener('keydown', (e) => {
  if (e.target.classList.contains('chat-input')) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const cardId = e.target.id.replace('chat-input-', '');
      sendChatMessage(cardId);
    }
  }
});

async function editComment(commentId, currentText) {
  const newText = prompt('Редактировать комментарий:', currentText);
  if (newText === null || newText.trim() === currentText) return;

  const trimmedText = newText.trim();
  if (!trimmedText) {
    showToast('Текст комментария не может быть пустым', 'error');
    return;
  }

  try {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    const response = await fetch(`/api/comments/${commentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken || ''
      },
      body: JSON.stringify({ text: trimmedText }),
      credentials: 'same-origin'
    });

    const data = await response.json();

    if (data.success) {
      showToast('Комментарий обновлен', 'success');
    } else {
      showToast('Ошибка: ' + (data.message || 'Не удалось обновить комментарий'), 'error');
    }
  } catch (error) {
    console.error('❌ Ошибка редактирования комментария:', error);
    showToast('Ошибка сети при редактировании комментария', 'error');
  }
}

async function deleteComment(commentId) {
  if (!confirm('Вы уверены, что хотите удалить этот комментарий?')) return;

  try {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    const response = await fetch(`/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': csrfToken || ''
      },
      credentials: 'same-origin'
    });

    const data = await response.json();

    if (data.success) {
      showToast('Комментарий удален', 'success');
    } else {
      showToast('Ошибка: ' + (data.message || 'Не удалось удалить комментарий'), 'error');
    }
  } catch (error) {
    console.error('❌ Ошибка удаления комментария:', error);
    showToast('Ошибка сети при удалении комментария', 'error');
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close-auth]')) {
    e.preventDefault();
    e.stopPropagation();
    closeAuthModal();
    return;
  }

  if (e.target === document.getElementById('authModal')) {
    closeAuthModal();
    return;
  }
  
  // Обработчик клика по кнопке отправки сообщения в чат
  const sendBtn = e.target.closest('.chat-send-btn');
  if (sendBtn) {
    e.preventDefault();
    e.stopPropagation();
    
    // Находим соответствующий чат по data атрибуту или через ближайший модал
    const modal = sendBtn.closest('.chat-modal');
    if (modal && modal.id) {
      const cardId = modal.id.replace('chat-modal-', '');
      if (cardId) {
        sendChatMessage(cardId);
      }
    }
    return;
 }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const authModal = document.getElementById('authModal');
    if (authModal && authModal.style.display === 'block') {
      closeAuthModal();
    }
  }
});

// Обработчики вкладок для навигации по разделам
document.addEventListener('DOMContentLoaded', () => {
  const desktopTabButtons = document.querySelectorAll('.header-tabs .tab-button');

  if (desktopTabButtons.length > 0) {
    desktopTabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();

        desktopTabButtons.forEach(btn => btn.classList.remove('active'));

        button.classList.add('active');

        const href = button.getAttribute('href');
        if (href) {
          window.location.href = href;
        }
      });
    });
  }

  const mobileTabButtons = document.querySelectorAll('.mobile-tab-button');

  if (mobileTabButtons.length > 0) {
    mobileTabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();

        mobileTabButtons.forEach(btn => btn.classList.remove('active'));

        button.classList.add('active');

        const href = button.getAttribute('href');
        if (href) {
          window.location.href = href;
        }
      });
    });
  }

  const contentTabButtons = document.querySelectorAll('.js-tab-switcher');

  if (contentTabButtons.length > 0) {
    contentTabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();

        contentTabButtons.forEach(btn => btn.classList.remove('active'));

        button.classList.add('active');

        const tabId = button.getAttribute('data-tab');

        switch(tabId) {
          case 'overview':
            showOverviewTab();
            break;
          case 'settings':
            showSettingsTab();
            break;
          case 'comments':
            showCommentsTab();
            break;
        }
      });
    });
  }

  function initializeTabContent() {
    showOverviewTab();
  }

  function showOverviewTab() {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/admin')) return;

    document.querySelectorAll('.section').forEach(section => {
      if (section.id === 'catalog' || section.id === 'services') {
        section.style.display = 'block';
      } else if (section.id === 'ad' || section.id === 'about' || section.id === 'contacts' || section.id === 'videos') {
        section.style.display = 'block';
      } else {
        section.style.display = 'none';
      }
    });

    const settingsSection = document.getElementById('settings-content');
    const commentsSection = document.getElementById('comments-content');
    if (settingsSection) settingsSection.style.display = 'none';
    if (commentsSection) commentsSection.style.display = 'none';
  }

  function showSettingsTab() {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/admin')) return;

    document.querySelectorAll('.section').forEach(section => {
      if (section.id !== 'settings-content') {
        section.style.display = 'none';
      }
    });

    createSettingsContent();
  }

  function showCommentsTab() {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/admin')) return;

    document.querySelectorAll('.section').forEach(section => {
      if (section.id !== 'comments-content') {
        section.style.display = 'none';
      }
    });

    createCommentsContent();
  }

  function createSettingsContent() {
    let settingsSection = document.getElementById('settings-content');
    if (!settingsSection) {
      settingsSection = document.createElement('section');
      settingsSection.id = 'settings-content';
      settingsSection.className = 'section';
      settingsSection.innerHTML = `
        <h2>Настройки</h2>
        <div class="settings-container">
          <div class="form-section">
            <h3>Персональные настройки</h3>
            <div class="form-grid">
              <div>
                <label for="theme-select">Тема оформления</label>
                <select id="theme-select" class="theme-select">
                  <option value="dark">Темная (по умолчанию)</option>
                  <option value="light">Светлая</option>
                  <option value="auto">Автоматическая</option>
                </select>
              </div>
              <div>
                <label for="lang-select">Язык интерфейса</label>
                <select id="lang-select" class="lang-select">
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                  <option value="kz">Қазақша</option>
                </select>
              </div>
            </div>
          <div class="form-section">
            <h3>Уведомления</h3>
            <div class="form-grid">
              <div class="checkbox-group">
                <input type="checkbox" id="email-notifications" checked>
                <label for="email-notifications">Email-уведомления</label>
              </div>
              <div class="checkbox-group">
                <input type="checkbox" id="push-notifications">
                <label for="push-notifications">Push-уведомления</label>
              </div>
            </div>
          </div>
        </div>
      `;
      document.querySelector('main').appendChild(settingsSection);
    }

    settingsSection.style.display = 'block';
  }

  function createCommentsContent() {
    let commentsSection = document.getElementById('comments-content');
    if (!commentsSection) {
      commentsSection = document.createElement('section');
      commentsSection.id = 'comments-content';
      commentsSection.className = 'section';
      commentsSection.innerHTML = `
        <h2>Комментарии</h2>
        <div class="comments-container">
          <div class="comments-filter">
            <div class="form-grid" style="display: flex; gap: 10px; align-items: center;">
              <div style="flex: 1;">
                <select id="comments-filter-type" class="comments-filter-select">
                  <option value="all">Все комментарии</option>
                  <option value="mine">Мои комментарии</option>
                  <option value="recent">Недавние</option>
                </select>
              </div>
              <div>
                <input type="text" id="comments-search" placeholder="Поиск комментариев..." class="comments-search-input">
              </div>
            </div>
          <div class="comments-list">
            <div class="comment-item">
              <div class="comment-header">
                <strong>Пользователь123</strong>
                <span class="comment-date">2023-12-01</span>
              </div>
              <div class="comment-content">
                <p>Отличный товар! Рекомендую к покупке.</p>
                <div class="comment-actions">
                  <button class="btn small outline">Ответить</button>
                  <button class="btn small">Пожаловаться</button>
                </div>
              </div>
            <div class="comment-item">
              <div class="comment-header">
                <strong>Аноним</strong>
                <span class="comment-date">2023-11-28</span>
              </div>
              <div class="comment-content">
                <p>Цена завышена, аналогичный товар дешевле в другом месте.</p>
                <div class="comment-actions">
                  <button class="btn small outline">Ответить</button>
                  <button class="btn small">Пожаловаться</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.querySelector('main').appendChild(commentsSection);
    }

    commentsSection.style.display = 'block';
  }

  initializeTabContent();
});

// Функции создания контента для вкладок (дублирование для совместимости)
function createSettingsContent() {
  let settingsSection = document.getElementById('settings-content');
  if (!settingsSection) {
    settingsSection = document.createElement('section');
    settingsSection.id = 'settings-content';
    settingsSection.className = 'section';
    settingsSection.innerHTML = `
      <h2>Настройки</h2>
      <div class="settings-container">
        <div class="form-section">
          <h3>Персональные настройки</h3>
          <div class="form-grid">
            <div>
              <label for="theme-select">Тема оформления</label>
              <select id="theme-select" class="theme-select">
                <option value="dark">Темная (по умолчанию)</option>
                <option value="light">Светлая</option>
                <option value="auto">Автоматическая</option>
              </select>
            </div>
            <div>
              <label for="lang-select">Язык интерфейса</label>
              <select id="lang-select" class="lang-select">
                <option value="ru">Русский</option>
                <option value="en">English</option>
                <option value="kz">Қазақша</option>
              </select>
            </div>
          </div>
        </div>
        <div class="form-section">
          <h3>Уведомления</h3>
          <div class="form-grid">
            <div class="checkbox-group">
              <input type="checkbox" id="email-notifications" checked>
              <label for="email-notifications">Email-уведомления</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="push-notifications">
                <label for="push-notifications">Push-уведомления</label>
              </div>
            </div>
          </div>
        </div>
      `;
      document.querySelector('main').appendChild(settingsSection);
    }

    settingsSection.style.display = 'block';
  }

function createCommentsContent() {
  let commentsSection = document.getElementById('comments-content');
  if (!commentsSection) {
    commentsSection = document.createElement('section');
    commentsSection.id = 'comments-content';
    commentsSection.className = 'section';
    commentsSection.innerHTML = `
      <h2>Комментарии</h2>
      <div class="comments-container">
        <div class="comments-filter">
          <div class="form-grid" style="display: flex; gap: 10px; align-items: center;">
            <div style="flex: 1;">
              <select id="comments-filter-type" class="comments-filter-select">
                <option value="all">Все комментарии</option>
                <option value="mine">Мои комментарии</option>
                <option value="recent">Недавние</option>
              </select>
            </div>
            <div>
              <input type="text" id="comments-search" placeholder="Поиск комментариев..." class="comments-search-input">
            </div>
          </div>
        </div>
        <div class="comments-list">
          <div class="comment-item">
            <div class="comment-header">
              <strong>Пользователь123</strong>
              <span class="comment-date">2023-12-01</span>
            </div>
            <div class="comment-content">
              <p>Отличный товар! Рекомендую к покупке.</p>
              <div class="comment-actions">
                <button class="btn small outline">Ответить</button>
                <button class="btn small">Пожаловаться</button>
              </div>
            </div>
          </div>
          <div class="comment-item">
            <div class="comment-header">
              <strong>Аноним</strong>
              <span class="comment-date">2023-11-28</span>
            </div>
            <div class="comment-content">
              <p>Цена завышена, аналогичный товар дешевле в другом месте.</p>
              <div class="comment-actions">
                <button class="btn small outline">Ответить</button>
                <button class="btn small">Пожаловаться</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.querySelector('main').appendChild(commentsSection);
  }

  commentsSection.style.display = 'block';
}
