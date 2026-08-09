// JS for cabinet page: tabs, forms, previews, categories, and card actions.
(function() {
  'use strict';

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  const csrfFetch = window.csrfFetch || function(url, options = {}) {
    const token = getCsrfToken();
    const headers = options.headers || {};
    if (options.method && options.method.toUpperCase() !== 'GET') {
      headers['X-CSRF-Token'] = token;
    }
    return fetch(url, {
      ...options,
      headers,
      credentials: options.credentials || 'same-origin'
    });
  };

  document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initLogout();
    initProductForm();
    initImagePreview();
    initBannerForm();
    initCategorySelector();
    initAlbaModal();
    initReferralModal();
  });

  function initReferralModal() {
    const referralBtn = document.getElementById('referralBtn');
    const referralModal = document.getElementById('referralModal');
    const closeReferralModal = document.getElementById('closeReferralModal');
    const closeReferralModalBtn = document.getElementById('closeReferralModalBtn');
    const referralLinkInput = document.getElementById('referralLink');
    const referralCodeInput = document.getElementById('referralCode');
    const copyReferralLink = document.getElementById('copyReferralLink');
    const copyReferralCode = document.getElementById('copyReferralCode');

    if (!referralBtn || !referralModal) return;

    const bootstrap = window.AppBootstrap && window.AppBootstrap._config
      ? window.AppBootstrap._config
      : {};
    const refCode = (referralCodeInput && referralCodeInput.value.trim())
      || window.USER_REF_CODE
      || bootstrap.userRefCode
      || '';

    if (referralCodeInput && refCode && !referralCodeInput.value) {
      referralCodeInput.value = refCode;
    }

    if (referralLinkInput) {
      const code = (referralCodeInput && referralCodeInput.value.trim()) || refCode;
      referralLinkInput.value = code
        ? `${window.location.origin}/register?ref=${encodeURIComponent(code)}`
        : '';
    }

    function openModal() {
      if (referralLinkInput && referralCodeInput && referralCodeInput.value && !referralLinkInput.value) {
        referralLinkInput.value = `${window.location.origin}/register?ref=${encodeURIComponent(referralCodeInput.value.trim())}`;
      }
      referralModal.style.display = 'block';
    }

    function closeModal() {
      referralModal.style.display = 'none';
    }

    async function copyText(value, button) {
      if (!value) {
        alert('Реферальный код ещё не готов. Обновите страницу.');
        return;
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const temp = document.createElement('textarea');
          temp.value = value;
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          document.body.removeChild(temp);
        }
        if (button) {
          const original = button.textContent;
          button.textContent = 'Скопировано';
          setTimeout(function() { button.textContent = original; }, 1500);
        }
      } catch (err) {
        console.error('Copy failed:', err);
        alert('Не удалось скопировать. Скопируйте вручную.');
      }
    }

    referralBtn.addEventListener('click', openModal);
    if (closeReferralModal) closeReferralModal.addEventListener('click', closeModal);
    if (closeReferralModalBtn) closeReferralModalBtn.addEventListener('click', closeModal);

    window.addEventListener('click', function(event) {
      if (event.target === referralModal) closeModal();
    });

    if (copyReferralLink) {
      copyReferralLink.addEventListener('click', function() {
        copyText(referralLinkInput ? referralLinkInput.value : '', copyReferralLink);
      });
    }
    if (copyReferralCode) {
      copyReferralCode.addEventListener('click', function() {
        copyText(referralCodeInput ? referralCodeInput.value : '', copyReferralCode);
      });
    }
  }

  document.addEventListener('click', function(e) {
    handleCardActions(e);
  });

  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    if (!tabs.length || !tabContents.length) return;

    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        const targetTab = tab.dataset.tab;
        if (!targetTab) return;

        tabs.forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');

        tabContents.forEach(function(content) {
          content.classList.remove('active');
          if (content.id === `tab-${targetTab}`) {
            content.classList.add('active');
          }
        });
      });
    });
  }

  function initLogout() {
    const logoutForm = document.getElementById('logoutForm');
    if (!logoutForm) return;

    logoutForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!confirm('Вы уверены, что хотите выйти?')) return;

      try {
        const res = await csrfFetch('/logout', { method: 'POST' });
        if (res.ok) {
          window.location.href = '/';
        }
      } catch (err) {
        console.error('Ошибка выхода:', err);
        window.location.href = '/';
      }
    });
  }

  function initProductForm() {
    const form = document.getElementById('createProductForm');
    const msg = document.getElementById('createProductMsg');
    if (!form || !msg) return;

    const priceInput = form.querySelector('#price, input[name="price"]');
    const priceOnRequestBtn = document.getElementById('priceOnRequestBtn');
    if (priceOnRequestBtn && priceInput) {
      priceOnRequestBtn.addEventListener('click', function() {
        priceInput.value = 'Уточняйте';
        priceInput.focus();
      });
    }

    form.addEventListener('submit', async function(e) {
      e.preventDefault();

      const imagesInput = form.querySelector('input[name="images"]');
      if (!imagesInput || imagesInput.files.length === 0) {
        msg.textContent = 'Необходимо загрузить хотя бы одно изображение';
        msg.style.color = '#b00020';
        return;
      }

      if (imagesInput.files.length > 5) {
        msg.textContent = 'Максимальное количество изображений: 5';
        msg.style.color = '#b00020';
        return;
      }

      if (imagesInput && imagesInput.files.length > 0) {
        for (let i = 0; i < imagesInput.files.length; i++) {
          const file = imagesInput.files[i];
          if (file.size > 5 * 1024 * 1024) {
            msg.textContent = `Файл "${file.name}" превышает 5MB`;
            msg.style.color = '#b00020';
            return;
          }
        }
      }

      msg.textContent = 'Отправка...';
      msg.style.color = '#666';

      const formData = new FormData(form);

      try {
        const res = await csrfFetch('/cabinet/product', {
          method: 'POST',
          body: formData
        });

        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          msg.textContent = 'Ошибка: ' + (text || 'Неверный формат ответа');
          msg.style.color = '#b00020';
          return;
        }

        const json = await res.json();
        if (json.success) {
          msg.textContent = 'Карточка отправлена на модерацию.';
          msg.style.color = 'green';
          form.reset();
          const preview = document.getElementById('imagePreview');
          const imagesInput = document.getElementById('images');
          if (imagesInput && typeof imagesInput._clearSelectedImages === 'function') {
            imagesInput._clearSelectedImages();
          } else if (preview) {
            preview.style.display = 'none';
            preview.innerHTML = '';
          }
          setTimeout(() => location.reload(), 800);
        } else {
          msg.textContent = json.message || 'Ошибка при создании карточки';
          msg.style.color = '#b00020';
        }
      } catch (err) {
        console.error('Ошибка при отправке:', err);
        msg.textContent = 'Ошибка сети: ' + err.message;
        msg.style.color = '#b00020';
      }
    });
  }

  function initImagePreview() {
    const imagesInput = document.getElementById('images');
    const imagePreview = document.getElementById('imagePreview');
    if (!imagesInput || !imagePreview) return;

    const maxFiles = parseInt(imagesInput.getAttribute('data-max-files'), 10) || 5;
    /** @type {File[]} */
    let selectedFiles = [];

    function syncInputFiles() {
      const dt = new DataTransfer();
      selectedFiles.forEach(function(file) { dt.items.add(file); });
      imagesInput.files = dt.files;
    }

    function renderPreview() {
      imagePreview.innerHTML = '';
      if (selectedFiles.length === 0) {
        imagePreview.style.display = 'none';
        return;
      }

      imagePreview.style.display = 'grid';
      imagePreview.style.gridTemplateColumns = 'repeat(auto-fill, minmax(100px, 1fr))';
      imagePreview.style.gap = '10px';

      selectedFiles.forEach(function(file) {
        const reader = new FileReader();
        reader.onload = function(loadEvent) {
          const div = document.createElement('div');
          div.className = 'preview-item';
          div.style.position = 'relative';
          div.style.width = '100%';
          div.style.aspectRatio = '1';
          div.style.overflow = 'hidden';
          div.style.borderRadius = '8px';
          div.style.border = '2px solid #ddd';
          div.style.background = '#f5f5f5';

          const img = document.createElement('img');
          img.src = loadEvent.target.result;
          img.alt = file.name;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          img.style.display = 'block';

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.textContent = '×';
          removeBtn.setAttribute('aria-label', 'Удалить фото');
          removeBtn.style.position = 'absolute';
          removeBtn.style.top = '4px';
          removeBtn.style.right = '4px';
          removeBtn.style.width = '24px';
          removeBtn.style.height = '24px';
          removeBtn.style.border = 'none';
          removeBtn.style.borderRadius = '50%';
          removeBtn.style.background = 'rgba(0,0,0,0.65)';
          removeBtn.style.color = '#fff';
          removeBtn.style.cursor = 'pointer';
          removeBtn.style.lineHeight = '1';
          removeBtn.addEventListener('click', function() {
            selectedFiles = selectedFiles.filter(function(f) { return f !== file; });
            syncInputFiles();
            renderPreview();
          });

          div.appendChild(img);
          div.appendChild(removeBtn);
          imagePreview.appendChild(div);
        };
        reader.readAsDataURL(file);
      });
    }

    imagesInput.addEventListener('change', function(e) {
      const incoming = Array.from(e.target.files || []);
      if (!incoming.length) return;

      const next = selectedFiles.slice();
      for (let i = 0; i < incoming.length; i++) {
        const file = incoming[i];
        if (file.size > 5 * 1024 * 1024) {
          alert(`Файл "${file.name}" слишком большой (максимум 5MB)`);
          continue;
        }
        const duplicate = next.some(function(f) {
          return f.name === file.name && f.size === file.size && f.lastModified === file.lastModified;
        });
        if (!duplicate) next.push(file);
      }

      if (next.length > maxFiles) {
        alert(`Можно выбрать не более ${maxFiles} изображений`);
        selectedFiles = next.slice(0, maxFiles);
      } else {
        selectedFiles = next;
      }

      syncInputFiles();
      renderPreview();
    });

    // Expose clear for successful submit reset
    imagesInput._clearSelectedImages = function() {
      selectedFiles = [];
      syncInputFiles();
      renderPreview();
    };
  }

  function initBannerForm() {
    const bannerForm = document.getElementById('createBannerForm');
    const bannerMsg = document.getElementById('createBannerMsg');
    const bannerPreview = document.getElementById('bannerPreview');
    const bannerPreviewImg = document.getElementById('bannerPreviewImg');
    const bannerImageInput = document.getElementById('bannerImage');

    if (!bannerForm) return;

    if (bannerImageInput && bannerPreviewImg && bannerPreview) {
      bannerImageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
          if (file.size > 5 * 1024 * 1024) {
            alert(`Файл "${file.name}" слишком большой (максимум 5MB)`);
            e.target.value = '';
            bannerPreview.style.display = 'none';
            return;
          }

          const reader = new FileReader();
          reader.onload = function(loadEvent) {
            bannerPreviewImg.src = loadEvent.target.result;
            bannerPreview.style.display = 'block';
          };
          reader.readAsDataURL(file);
        } else if (bannerPreview) {
          bannerPreview.style.display = 'none';
        }
      });
    }

    bannerForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      if (bannerImageInput && bannerImageInput.files.length > 0) {
        const file = bannerImageInput.files[0];
        if (file.size > 5 * 1024 * 1024) {
          bannerMsg.textContent = `Файл "${file.name}" превышает 5MB`;
          bannerMsg.style.color = '#b00020';
          return;
        }
      }

      bannerMsg.textContent = 'Отправка...';
      bannerMsg.style.color = '#666';

      const formData = new FormData(bannerForm);

      try {
        const res = await csrfFetch('/cabinet/banner', {
          method: 'POST',
          body: formData
        });

        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          bannerMsg.textContent = 'Ошибка: ' + (text || 'Неверный формат ответа');
          bannerMsg.style.color = '#b00020';
          return;
        }

        const json = await res.json();
        if (json.success) {
          bannerMsg.textContent = 'Баннер отправлен на модерацию.';
          bannerMsg.style.color = 'green';
          bannerForm.reset();
          if (bannerPreview) bannerPreview.style.display = 'none';
          setTimeout(() => location.reload(), 800);
        } else {
          bannerMsg.textContent = json.message || 'Ошибка при загрузке баннера';
          bannerMsg.style.color = '#b00020';
        }
      } catch (err) {
        console.error('Ошибка при отправке:', err);
        bannerMsg.textContent = 'Ошибка сети: ' + err.message;
        bannerMsg.style.color = '#b00020';
      }
    });
  }

  function initCategorySelector() {
    const categorySelect = document.getElementById('categorySelect');
    const subcategorySelector = document.getElementById('subcategorySelector');
    const subcategorySelect = document.getElementById('subcategorySelect');
    const backToBlocksBtn = document.getElementById('backToBlocks');
    const typeSelect = document.getElementById('type');

    if (!categorySelect) return;

    let currentCategories = [];
    let currentType = typeSelect ? typeSelect.value : 'product';

    loadCategoryBlocks();

    if (typeSelect) {
      typeSelect.addEventListener('change', function() {
        currentType = this.value;
        loadCategoryBlocks();
      });
    }

    async function loadCategoryBlocks() {
      try {
        const response = await fetch(`/api/categories/tree/${currentType}`);
        const data = await response.json();

        if (data.success && data.categories) {
          currentCategories = data.categories;
          renderCategoryBlocks(data.categories);
        } else {
          console.error('Ошибка загрузки блоков категорий:', data.message);
        }
      } catch (error) {
        console.error('Ошибка сети при загрузке блоков:', error);
      }
    }

    function renderCategoryBlocks(blocks) {
      if (!categorySelect) return;

      categorySelect.innerHTML = '<option value="">Выберите категорию</option>';

      blocks.forEach(function(block) {
        const option = document.createElement('option');
        option.value = String(block._id || block.id);
        option.textContent = `${block.icon || ''} ${block.name}`.trim();
        categorySelect.appendChild(option);
      });
    }

    async function loadSubcategories(blockId) {
      try {
        const response = await fetch(`/api/categories/children/${blockId}`);
        const data = await response.json();

        if (data.success && data.categories) {
          renderSubcategories(data.categories);
        } else {
          console.error('Ошибка загрузки подкатегорий:', data.message);
        }
      } catch (error) {
        console.error('Ошибка сети при загрузке подкатегорий:', error);
      }
    }

    function renderSubcategories(subcategories) {
      if (!subcategorySelector || !subcategorySelect) return;

      subcategorySelect.innerHTML = '<option value="">Выберите подкатегорию</option>';

      subcategories.forEach(function(sub) {
        const option = document.createElement('option');
        option.value = String(sub._id || sub.id);
        option.textContent = `${sub.icon || ''} ${sub.name}`.trim();
        subcategorySelect.appendChild(option);
      });

      subcategorySelector.style.display = 'block';
    }

    function hideSubcategories() {
      if (subcategorySelector) {
        subcategorySelector.style.display = 'none';
      }
    }

    categorySelect.addEventListener('change', function() {
      const selectedBlockId = this.value;
      if (selectedBlockId) {
        const selectedBlock = currentCategories.find(function(block) {
          return String(block._id || block.id) === String(selectedBlockId);
        });
        if (selectedBlock) {
          loadSubcategories(selectedBlockId);
        } else {
          // Leaf or unknown — still try children endpoint
          loadSubcategories(selectedBlockId);
        }
      } else {
        hideSubcategories();
      }
    });

    if (subcategorySelect) {
      subcategorySelect.addEventListener('change', function() {
        const selectedCategoryId = this.value;
        const selectedCategoryName = this.options[this.selectedIndex].text;

        if (selectedCategoryId) {
          let optionExists = false;
          for (let i = 0; i < categorySelect.options.length; i++) {
            if (categorySelect.options[i].value === selectedCategoryId) {
              optionExists = true;
              break;
            }
          }

          if (!optionExists) {
            const newOption = document.createElement('option');
            newOption.value = selectedCategoryId;
            newOption.textContent = selectedCategoryName;
            categorySelect.appendChild(newOption);
          }

          categorySelect.value = selectedCategoryId;
        }
      });
    }

    if (backToBlocksBtn) {
      backToBlocksBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        hideSubcategories();
        categorySelect.value = '';
      });
    }
  }

  function handleCardActions(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;

    if (
      target.classList.contains('edit-product-btn') ||
      target.classList.contains('edit-service-btn') ||
      target.classList.contains('edit-banner-btn')
    ) {
      const id = target.getAttribute('data-id');
      const isBanner = target.classList.contains('edit-banner-btn');
      const url = isBanner ? `/cabinet/banner/${id}/edit` : `/cabinet/product/${id}/edit`;
      window.location.href = url;
      return;
    }

    if (
      target.classList.contains('delete-product-btn') ||
      target.classList.contains('delete-service-btn') ||
      target.classList.contains('delete-banner-btn')
    ) {
      const id = target.getAttribute('data-id');
      const isBanner = target.classList.contains('delete-banner-btn');
      const type = isBanner ? 'баннер' : 'карточку';

      if (!confirm(`Вы уверены, что хотите удалить эту ${type}?`)) return;

      const url = isBanner ? `/cabinet/banner/${id}` : `/cabinet/product/${id}`;
      csrfFetch(url, { method: 'DELETE' })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.success) {
            location.reload();
          } else {
            alert('Ошибка удаления: ' + (data.message || 'Неизвестная ошибка'));
          }
        })
        .catch(function(err) {
          console.error('Ошибка:', err);
          alert('Ошибка сети');
        });
    }
  }

  function initAlbaModal() {
    const albaBalanceBtn = document.getElementById('albaBalanceBtn');
    const albaBalanceModal = document.getElementById('albaBalanceModal');
    const closeAlbaModal = document.getElementById('closeAlbaModal');
    const closeAlbaModalBtn = document.getElementById('closeAlbaModalBtn');
    const refreshAlbaModalBtn = document.getElementById('refreshAlbaModalBtn');
    const buyEntitlementBtn = document.getElementById('buyEntitlementBtn');
    const cardTypeSelect = document.getElementById('cardType');
    const cardsToBuyInput = document.getElementById('cardsToBuy');
    const purchaseStatus = document.getElementById('purchaseStatus');
    const totalCostDisplay = document.getElementById('totalCostDisplay');

    if (!albaBalanceBtn || !albaBalanceModal) return;

    // Open modal
    albaBalanceBtn.addEventListener('click', () => {
      albaBalanceModal.style.display = 'block';
      loadAvailableEntitlements();
    });

    // Close modal
    if (closeAlbaModal) {
      closeAlbaModal.addEventListener('click', () => {
        albaBalanceModal.style.display = 'none';
      });
    }

    if (closeAlbaModalBtn) {
      closeAlbaModalBtn.addEventListener('click', () => {
        albaBalanceModal.style.display = 'none';
      });
    }

    // Refresh balance
    if (refreshAlbaModalBtn) {
      refreshAlbaModalBtn.addEventListener('click', async () => {
        try {
          const response = await fetch('/api/p1/alba/transactions');
          const data = await response.json();

          if (data.success) {
            const currentBalance = data.balance || 0;
            updateBalanceDisplays(currentBalance);
          }
        } catch (error) {
          console.error('Error refreshing balance:', error);
        }
      });
    }

    // Update total cost when selection changes
    function updateTotalCost() {
      if (cardTypeSelect && cardsToBuyInput && totalCostDisplay) {
        const cardType = cardTypeSelect.value;
        const cardsToBuy = parseInt(cardsToBuyInput.value) || 1;
        const costPerCard = parseInt(cardTypeSelect.selectedOptions[0]?.dataset?.cost) || 30;
        const totalCost = cardsToBuy * costPerCard;
        totalCostDisplay.textContent = `${totalCost} ALBA`;
      }
    }

    if (cardTypeSelect && cardsToBuyInput) {
      cardTypeSelect.addEventListener('change', updateTotalCost);
      cardsToBuyInput.addEventListener('input', updateTotalCost);
      updateTotalCost();
    }

    // Handle entitlement purchase
    if (buyEntitlementBtn && cardTypeSelect && cardsToBuyInput && purchaseStatus) {
      buyEntitlementBtn.addEventListener('click', async () => {
        // Disable the button to prevent double click
        buyEntitlementBtn.disabled = true;
        buyEntitlementBtn.textContent = 'Обработка...';
        buyEntitlementBtn.style.opacity = '0.6';

        const cardType = cardTypeSelect.value;
        const cardsToBuy = parseInt(cardsToBuyInput.value) || 1;
        const costPerCard = parseInt(cardTypeSelect.selectedOptions[0]?.dataset?.cost) || 30;
        const totalCost = cardsToBuy * costPerCard;

        // Generate unique idempotency key
        const idempotencyKey = 'ent_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        try {
          // Check current balance
          const balanceResponse = await fetch('/api/p1/alba/transactions');
          const balanceData = await balanceResponse.json();

          let currentBalance = 0;
          if (balanceData.success) {
            currentBalance = balanceData.balance || 0;
          }

          if (currentBalance < totalCost) {
            purchaseStatus.textContent = `Недостаточно ALBA. Требуется ${totalCost}, у вас ${currentBalance}`;
            purchaseStatus.style.color = '#ff6666';
            return;
          }

          let purchased = 0;
          let newBalance = currentBalance;
          let lastError = '';

          for (let i = 0; i < cardsToBuy; i++) {
            const key = i === 0 ? idempotencyKey : `${idempotencyKey}_${i}`;
            const response = await csrfFetch('/api/p1/entitlements/purchase', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                type: cardType,
                idempotencyKey: key
              })
            });

            const result = await response.json();
            if (!result.success) {
              lastError = result.message || 'Ошибка покупки права';
              break;
            }
            purchased += 1;
            if (typeof result.balance === 'number') {
              newBalance = result.balance;
            } else {
              newBalance = Math.max(0, newBalance - costPerCard);
            }
          }

          const typeLabel = cardType === 'product' ? 'товар' : (cardType === 'service' ? 'услугу' : 'баннер');
          if (purchased > 0) {
            purchaseStatus.textContent = `Успешно! Куплено прав: ${purchased} (${typeLabel}) за ${purchased * costPerCard} ALBA`;
            purchaseStatus.style.color = '#66ff66';
            updateBalanceDisplays(newBalance);
            loadAvailableEntitlements();
            setTimeout(() => { purchaseStatus.textContent = ''; }, 5000);
          } else {
            purchaseStatus.textContent = lastError || 'Ошибка покупки права';
            purchaseStatus.style.color = '#ff6666';
          }
        } catch (error) {
          console.error('Error purchasing entitlement:', error);
          purchaseStatus.textContent = 'Ошибка сети: ' + error.message;
          purchaseStatus.style.color = '#ff6666';
        } finally {
          // Re-enable the button after operation completes
          buyEntitlementBtn.disabled = false;
          buyEntitlementBtn.textContent = 'Купить право на карточку';
          buyEntitlementBtn.style.opacity = '1';
        }
      });
    }

    // Load and display available entitlements
    async function loadAvailableEntitlements() {
      try {
        const response = await fetch('/api/p1/entitlements/available');
        const data = await response.json();

        if (data.success) {
          const entitlements = data.entitlements;
          const entitlementsInfo = document.getElementById('entitlementsInfo');

          if (entitlementsInfo) {
            let html = '<div style="margin-top: 20px; padding: 15px; background: rgba(255, 51, 51, 0.05); border-radius: 8px;">';
            html += '<h4 style="color: #ff9999; margin-bottom: 10px;">Доступные права</h4>';

            if (entitlements.total > 0) {
              html += `<p style="color: #ccc; margin-bottom: 10px;">У вас есть ${entitlements.total} доступных прав:</p>`;
              html += '<ul style="color: #ccc; margin-left: 20px;">';

              if (entitlements.product.length > 0) {
                html += `<li>📦 Товары: ${entitlements.product.length} шт.</li>`;
              }
              if (entitlements.service.length > 0) {
                html += `<li>🔧 Услуги: ${entitlements.service.length} шт.</li>`;
              }
              if (entitlements.banner && entitlements.banner.length > 0) {
                html += `<li>🖼️ Баннеры: ${entitlements.banner.length} шт.</li>`;
              }

              html += '</ul>';
            } else {
              html += '<p style="color: #ccc;">У вас нет доступных прав. Купите права, чтобы создать дополнительные карточки.</p>';
            }

            html += '</div>';
            entitlementsInfo.innerHTML = html;
          }
        }
      } catch (error) {
        console.error('Error loading entitlements:', error);
      }
    }

    // Update balance displays
    function updateBalanceDisplays(balance) {
      const modalBalanceElement = document.getElementById('modalAlbaBalance');
      const footerBalanceElement = document.getElementById('footerAlbaBalance');
      const albaBalanceDisplay = document.getElementById('albaBalanceDisplay');

      if (modalBalanceElement) {
        modalBalanceElement.textContent = `${balance} ALBA`;
      }

      if (footerBalanceElement) {
        footerBalanceElement.textContent = balance.toString();
      }

      if (albaBalanceDisplay) {
        albaBalanceDisplay.textContent = `${balance} ALBA`;
      }
    }

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
      if (event.target === albaBalanceModal) {
        albaBalanceModal.style.display = 'none';
      }
    });
  }
})();
