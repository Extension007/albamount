// Унифицированный обработчик для каталогов (товары, услуги, баннеры)
(function() {
  'use strict';

  // Определяем тип каталога по URL (поддержка админки и кабинета пользователя)
  const pathname = window.location.pathname;
  const isAdminPage = pathname.includes('/admin/');
  const isCabinetPage = pathname.includes('/cabinet/');
  
  let catalogType = null;
  
  if (isAdminPage) {
    // Админ-панель
    if (pathname.includes('/admin/products')) {
      catalogType = 'product';
    } else if (pathname.includes('/admin/services')) {
      catalogType = 'service';
    } else if (pathname.includes('/admin/banners')) {
      catalogType = 'banner';
    }
  } else if (isCabinetPage) {
    // Кабинет пользователя - определяем по активной вкладке или контексту
    // Проверяем, есть ли элементы на странице
    const hasProducts = document.querySelectorAll('.product-card[data-product-id], .catalog-item[data-product-id]').length > 0;
    const hasServices = document.querySelectorAll('.product-card[data-service-id], .catalog-item[data-service-id]').length > 0;
    const hasBanners = document.querySelectorAll('.product-card[data-banner-id], .catalog-item[data-banner-id]').length > 0;
    
    // Определяем по активной вкладке
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
      const tabData = activeTab.dataset && activeTab.dataset.tab;
      if (tabData === 'products') catalogType = 'product';
      else if (tabData === 'services') catalogType = 'service';
      else if (tabData === 'banners') catalogType = 'banner';
    }
    
    // Если не определили по вкладке, определяем по наличию элементов
    if (!catalogType) {
      if (hasProducts && !hasServices && !hasBanners) catalogType = 'product';
      else if (hasServices && !hasProducts && !hasBanners) catalogType = 'service';
      else if (hasBanners && !hasProducts && !hasServices) catalogType = 'banner';
    }
  }

  // Если тип не определен, пробуем определить по элементам на странице
  if (!catalogType) {
    const productCards = document.querySelectorAll('.delete-product-btn, .edit-product-btn, .block-product-btn');
    const serviceCards = document.querySelectorAll('.delete-service-btn, .edit-service-btn, .block-service-btn');
    const bannerCards = document.querySelectorAll('.delete-banner-btn, .edit-banner-btn, .block-banner-btn');
    
    if (productCards.length > 0) catalogType = 'product';
    else if (serviceCards.length > 0) catalogType = 'service';
    else if (bannerCards.length > 0) catalogType = 'banner';
  }

  if (!catalogType) {
    console.warn('⚠️ Неизвестный тип каталога для:', pathname);
    // Не прерываем выполнение, просто логируем предупреждение
    // Функции будут работать с проверками на существование элементов
  }

  const API_BASE = catalogType === 'product' ? '/api/products' : (catalogType === 'service' ? '/api/services' : '/api/banners');
  const ADMIN_BASE = '/admin';
  const DELETE_BASE = '/admin';

  // =======================
  // Toast уведомления
  // =======================
  function showToast(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
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
    toast.textContent = message;

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
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 5000);
  }

  // =======================
  // Удаление
  // =======================
  function initDeleteHandlers() {
    // Если тип каталога не определен, пробуем найти кнопки всех типов
    const selectors = catalogType 
      ? [`.delete-${catalogType}-btn`]
      : ['.delete-product-btn', '.delete-service-btn', '.delete-banner-btn'];
    
    const deleteButtons = [];
    selectors.forEach(selector => {
      const buttons = document.querySelectorAll(selector);
      if (buttons && buttons.length > 0) {
        deleteButtons.push(...Array.from(buttons));
      }
    });
    
    if (!deleteButtons || deleteButtons.length === 0) {
      console.log(`⚠️ Кнопки удаления не найдены на странице: ${pathname}`);
      return;
    }
    
    console.log(`✅ Найдено ${deleteButtons.length} кнопок удаления`);
    
    deleteButtons.forEach(btn => {
      if (!btn || !btn.classList || !btn.cloneNode || !btn.parentNode) return;
      
      // Определяем тип по классу кнопки
      const btnType = btn.classList.contains('delete-product-btn') ? 'product' 
        : btn.classList.contains('delete-service-btn') ? 'service' 
        : 'banner';
      
      const newBtn = btn.cloneNode(true);
      if (btn.parentNode && btn.parentNode.replaceChild) {
        btn.parentNode.replaceChild(newBtn, btn);
      }
      
      if (newBtn && newBtn.addEventListener) {
        newBtn.addEventListener('click', async () => {
          const typeNames = { product: 'товар', service: 'услугу', banner: 'баннер' };
          // Используем toast вместо confirm для лучшего UX
          const confirmed = confirm(`Вы уверены, что хотите удалить этот ${typeNames[btnType]}? Это действие нельзя отменить.`);
          if (!confirmed) {
            return;
          }

          const id = newBtn.dataset && newBtn.dataset.id ? newBtn.dataset.id : null;
          const csrfMeta = document.querySelector('meta[name="csrf-token"]');
          const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : null;

          if (!id || !csrfToken) {
            console.error('❌ Нет ID или CSRF токена');
            if (typeof showToast === 'function') {
              showToast('Ошибка: отсутствуют необходимые данные', 'error');
            } else {
              alert('Ошибка: отсутствуют необходимые данные');
            }
            return;
          }

          console.log(`🗑️ Удаление ${btnType}`, { id });

          if (newBtn && newBtn.disabled !== undefined) {
            newBtn.disabled = true;
          }
          if (newBtn && newBtn.textContent !== undefined) {
            newBtn.textContent = 'Удаление...';
          }

          try {
            // Определяем эндпоинт в зависимости от контекста
            const isAdminPage = window.location.pathname.includes('/admin/');
            const isCabinetPage = window.location.pathname.includes('/cabinet/');
            let endpoint;
            
            if (isAdminPage) {
              const adminBase = btnType === 'product' ? '/admin/products' 
                : btnType === 'service' ? '/admin/services' 
                : '/admin/banners';
              endpoint = `${adminBase}/${id}`;
            } else if (isCabinetPage) {
              endpoint = `/cabinet/${btnType === 'product' || btnType === 'service' ? 'product' : 'banner'}/${id}`;
            } else {
              const apiBase = btnType === 'product' ? '/api/products' 
                : btnType === 'service' ? '/api/services' 
                : '/api/banners';
              endpoint = `${apiBase}/${id}`;
            }
            
            const res = await window.csrfFetch(endpoint, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json'
              }
            });

            const data = await res.json();

            if (data.success) {
              console.log(`✅ ${btnType === 'service' ? 'Услуга' : btnType === 'banner' ? 'Баннер' : 'Товар'} успешно удален`);
              
              const card = newBtn.closest && newBtn.closest('.catalog-item, .product-card');
              if (card && card.style) {
                card.style.opacity = '0.5';
                card.style.transition = 'opacity 0.3s';
                setTimeout(() => {
                  if (card && card.remove) {
                    card.remove();
                  }
                  
                  const remainingCards = document.querySelectorAll('.catalog-item, .product-card');
                  if (remainingCards && remainingCards.length === 0) {
                    location.reload();
                  }
                }, 300);
              }
              
              const typeNames = { product: 'Товар', service: 'Услуга', banner: 'Баннер' };
              if (typeof showToast === 'function') {
                showToast(`✅ ${typeNames[btnType]} удалён`, 'success');
              }
            } else {
              console.error(`❌ Ошибка удаления ${btnType}`, data.message);
              if (newBtn && newBtn.disabled !== undefined) {
                newBtn.disabled = false;
              }
              if (newBtn && newBtn.textContent !== undefined) {
                newBtn.textContent = '🗑️ Удалить';
              }
              if (typeof showToast === 'function') {
                showToast('❌ Ошибка удаления: ' + (data.message || 'Неизвестная ошибка'), 'error');
              }
            }
          } catch (err) {
            console.error(`❌ Ошибка сети при удалении ${btnType}`, err);
            if (newBtn && newBtn.disabled !== undefined) {
              newBtn.disabled = false;
            }
            if (newBtn && newBtn.textContent !== undefined) {
              newBtn.textContent = '🗑️ Удалить';
            }
            if (typeof showToast === 'function') {
              showToast('❌ Ошибка сети. Проверьте подключение к интернету', 'error');
            }
          }
        });
      }
    });

    console.log(`✅ Обработчики удаления привязаны к ${deleteButtons.length} кнопкам`);
  }

  // =======================
  // Голосование
  // =======================
  function initVoteHandlers() {
    // Проверяем наличие элементов для голосования на странице
    const voteButtons = document.querySelectorAll('.product-like-btn, .product-dislike-btn, .service-like-btn, .service-dislike-btn, .banner-like-btn, .banner-dislike-btn');
    if (!voteButtons || voteButtons.length === 0) {
      console.log(`⚠️ Кнопки голосования не найдены на странице: ${pathname}`);
      // Не возвращаемся, так как элементы могут появиться динамически
    } else {
      console.log(`✅ Найдено ${voteButtons.length} кнопок голосования`);
    }
    
    document.addEventListener('click', async (e) => {
      if (!e || !e.target) return;
      
      // Ищем кнопки всех типов
      const likeBtn = e.target.closest && (e.target.closest('.product-like-btn') || e.target.closest('.service-like-btn') || e.target.closest('.banner-like-btn'));
      const dislikeBtn = e.target.closest && (e.target.closest('.product-dislike-btn') || e.target.closest('.service-dislike-btn') || e.target.closest('.banner-dislike-btn'));
      
      if (likeBtn || dislikeBtn) {
        const ratingBlock = e.target.closest && (e.target.closest('.product-rating') || e.target.closest('.service-rating') || e.target.closest('.banner-rating') || e.target.closest('.item-rating'));
        if (!ratingBlock || !ratingBlock.dataset) return;
        
        // Определяем тип по классу rating блока
        const itemType = ratingBlock.classList && ratingBlock.classList.contains('product-rating') ? 'product'
          : ratingBlock.classList && ratingBlock.classList.contains('service-rating') ? 'service'
          : ratingBlock.classList && ratingBlock.classList.contains('banner-rating') ? 'banner'
          : (ratingBlock.dataset.type || catalogType || 'product');
        
        const itemId = ratingBlock.dataset.id;
        if (!itemId) {
          console.error('❌ Отсутствует ID для голосования');
          return;
        }
        
        const vote = likeBtn ? 'up' : 'down';
        
        // Проверяем, голосовал ли уже
        if (ratingBlock.dataset.voted === 'true') {
          return;
        }

        // Отключаем кнопки (с проверкой)
        const buttons = ratingBlock.querySelectorAll('button');
        if (buttons && buttons.length > 0) {
          buttons.forEach(btn => {
            if (btn && btn.disabled !== undefined) {
              btn.disabled = true;
            }
          });
        }
        
        try {
          // Унифицированный формат: используем vote: "up"/"down" для всех типов
          const voteEndpoint = itemType === 'product' 
            ? `/api/rating/${itemId}` 
            : `/api/${itemType === 'service' ? 'services' : 'banners'}/${itemId}/vote`;
          const voteBody = JSON.stringify({ vote }); // Единый формат для всех типов
          
          // Получаем CSRF токен для голосования
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
            if (typeof showToast === 'function') {
              showToast('Ошибка: отсутствует токен безопасности. Обновите страницу.', 'error');
            }
            
            // Включаем кнопки обратно
            const buttons = ratingBlock.querySelectorAll('button');
            if (buttons && buttons.length > 0) {
              buttons.forEach(btn => {
                if (btn && btn.disabled !== undefined) {
                  btn.disabled = false;
                }
              });
            }
            return;
          }
          
          const res = await window.csrfFetch(voteEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: voteBody
          });
          
          const data = await res.json();
          
          if (data.success) {
            // Обновляем отображение (с проверками)
            const resultEl = ratingBlock.querySelector(`.${itemType}-result`) || ratingBlock.querySelector('.product-result') || ratingBlock.querySelector('.service-result') || ratingBlock.querySelector('.banner-result') || ratingBlock.querySelector('.rating-result');
            const votesEl = ratingBlock.querySelector(`.${itemType}-votes`) || ratingBlock.querySelector('.product-votes') || ratingBlock.querySelector('.service-votes') || ratingBlock.querySelector('.banner-votes') || ratingBlock.querySelector('.rating-votes');
            
            // Для товаров используем data.result, для услуг/баннеров тоже data.result
            if (resultEl && resultEl.textContent !== undefined) {
              resultEl.textContent = data.result !== undefined ? data.result : ((data.likes || 0) - (data.dislikes || 0));
            }
            if (votesEl && votesEl.textContent !== undefined) {
              votesEl.textContent = `(${data.total !== undefined ? data.total : ((data.likes || 0) + (data.dislikes || 0))} голосов)`;
            }
            
            if (ratingBlock.dataset) {
              ratingBlock.dataset.voted = 'true';
            }
          } else {
            // Включаем кнопки обратно при ошибке (с проверкой)
            const buttons = ratingBlock.querySelectorAll('button');
            if (buttons && buttons.length > 0) {
              buttons.forEach(btn => {
                if (btn && btn.disabled !== undefined) {
                  btn.disabled = false;
                }
              });
            }
            if (typeof showToast === 'function') {
              showToast('Ошибка: ' + (data.message || 'Не удалось проголосовать'), 'error');
            }
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
          if (typeof showToast === 'function') {
            showToast('Ошибка сети при голосовании', 'error');
          }
        }
      }
    });
  }

  // =======================
  // Блокировка/Публикация
  // =======================
  function initStatusHandlers() {
    // Ищем кнопки всех типов
    const blockButtons = document.querySelectorAll('.block-product-btn, .block-service-btn, .block-banner-btn');
    const publishButtons = document.querySelectorAll('.publish-product-btn, .publish-service-btn, .publish-banner-btn');
    
    if ((!blockButtons || blockButtons.length === 0) && (!publishButtons || publishButtons.length === 0)) {
      console.log(`⚠️ Кнопки блокировки/публикации не найдены на странице: ${pathname}`);
      return;
    }
    
    console.log(`✅ Найдено ${(blockButtons?.length || 0) + (publishButtons?.length || 0)} кнопок блокировки/публикации`);
    
    [...blockButtons, ...publishButtons].forEach(btn => {
      if (!btn || !btn.addEventListener || !btn.classList || !btn.dataset) return;
      
      // Определяем тип по классу кнопки
      const btnType = btn.classList.contains('block-product-btn') || btn.classList.contains('publish-product-btn') ? 'product'
        : btn.classList.contains('block-service-btn') || btn.classList.contains('publish-service-btn') ? 'service'
        : 'banner';
      
      btn.addEventListener('click', async () => {
        const id = btn.dataset && btn.dataset.id ? btn.dataset.id : null;
        if (!id) {
          console.error('❌ Отсутствует ID для блокировки/публикации');
          return;
        }
        
        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : null;
        const action = btn.classList.contains(`block-${btnType}-btn`) ? 'block' : 'publish';
        
        if (!id || !csrfToken) {
          if (typeof showToast === 'function') {
            showToast('Ошибка: отсутствуют необходимые данные', 'error');
          }
          return;
        }
        
        if (btn.disabled !== undefined) {
          btn.disabled = true;
        }
        if (btn.textContent !== undefined) {
          btn.textContent = action === 'block' ? 'Блокировка...' : 'Публикация...';
        }
        
        try {
          // Используем правильные эндпоинты для блокировки
          let endpoint;
          if (btnType === 'product') {
            endpoint = `/admin/products/${id}/toggle-visibility`;
          } else if (btnType === 'service') {
            endpoint = `/admin/services/${id}/toggle-visibility`;
          } else {
            endpoint = `/admin/banners/${id}/toggle-visibility`;
          }
          
          const res = await window.csrfFetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          const data = await res.json();
          
          if (data.success) {
            if (typeof showToast === 'function') {
              showToast(data.message || 'Статус успешно изменен', 'success');
            }
            setTimeout(() => location.reload(), 1000); // Перезагружаем страницу через 1 секунду
          } else {
            if (typeof showToast === 'function') {
              showToast('Ошибка: ' + (data.message || 'Не удалось изменить статус'), 'error');
            }
            if (btn && btn.disabled !== undefined) {
              btn.disabled = false;
            }
            if (btn && btn.textContent !== undefined) {
              btn.textContent = action === 'block' ? '🚫 Заблокировать' : '✅ Опубликовать';
            }
          }
        } catch (err) {
          console.error('Ошибка изменения статуса:', err);
          if (typeof showToast === 'function') {
            showToast('Ошибка сети', 'error');
          }
          if (btn && btn.disabled !== undefined) {
            btn.disabled = false;
          }
          if (btn && btn.textContent !== undefined) {
            btn.textContent = action === 'block' ? '🚫 Заблокировать' : '✅ Опубликовать';
          }
        }
      });
    });
  }

  // =======================
  // Редактирование
  // =======================
  function initEditHandlers() {
    // Ищем кнопки всех типов
    const editButtons = document.querySelectorAll('.edit-product-btn, .edit-service-btn, .edit-banner-btn');
    
    if (!editButtons || editButtons.length === 0) {
      console.log(`⚠️ Кнопки редактирования не найдены на странице: ${pathname}`);
      return;
    }
    
    console.log(`✅ Найдено ${editButtons.length} кнопок редактирования`);
    
    editButtons.forEach(btn => {
      if (!btn || !btn.addEventListener || !btn.classList || !btn.dataset) return;
      
      // Определяем тип по классу кнопки
      const btnType = btn.classList.contains('edit-product-btn') ? 'product'
        : btn.classList.contains('edit-service-btn') ? 'service'
        : 'banner';
      
      btn.addEventListener('click', () => {
        const id = btn.dataset && btn.dataset.id ? btn.dataset.id : null;
        
        if (!id) {
          alert('Ошибка: отсутствует ID');
          return;
        }
        
        // Определяем URL для редактирования
        const isAdminPage = window.location.pathname.includes('/admin/');
        const isCabinetPage = window.location.pathname.includes('/cabinet/');
        let editUrl;
        
        if (isAdminPage) {
          if (btnType === 'product') {
            editUrl = `/admin/products/${id}/edit`;
          } else if (btnType === 'service') {
            editUrl = `/admin/services/${id}/edit`;
          } else {
            editUrl = `/admin/banners/${id}/edit`;
          }
        } else if (isCabinetPage) {
          if (btnType === 'product' || btnType === 'service') {
            editUrl = `/cabinet/product/${id}/edit`;
          } else {
            editUrl = `/cabinet/banner/${id}/edit`;
          }
        } else {
          // Публичная страница - редирект в кабинет
          if (btnType === 'product' || btnType === 'service') {
            editUrl = `/cabinet/product/${id}/edit`;
          } else {
            editUrl = `/cabinet/banner/${id}/edit`;
          }
        }
        
        window.location.href = editUrl;
      });
    });
    
    console.log(`✅ Обработчики редактирования привязаны к ${editButtons.length} кнопкам`);
  }

  // Инициализация при загрузке DOM (работает даже если тип каталога не определен)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initDeleteHandlers();
      initVoteHandlers();
      initStatusHandlers();
      initEditHandlers();
    });
  } else {
    initDeleteHandlers();
    initVoteHandlers();
    initStatusHandlers();
    initEditHandlers();
  }
})();

