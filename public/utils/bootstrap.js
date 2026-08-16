// Единый паттерн для безопасной передачи данных из EJS в JavaScript
// Решает проблемы с "Expression expected" и обеспечивает типобезопасность

window.AppBootstrap = {
  // Безопасная установка булевых значений
  setBoolean: function(key, value) {
    if (value === true || value === 1 || value === '1' || value === 'true') {
      window[key] = true;
    } else if (value === false || value === 0 || value === '0' || value === 'false' || value == null) {
      window[key] = false;
    } else {
      window[key] = Boolean(value);
    }
  },

  // Безопасная установка строковых значений
  setString: function(key, value) {
    window[key] = typeof value === 'string' ? value : String(value || '');
  },

  // Безопасная установка числовых значений
  setNumber: function(key, value) {
    window[key] = typeof value === 'number' && !isNaN(value) ? value : 0;
  },

  // Безопасная установка объектов (с JSON парсингом)
  setObject: function(key, value) {
    try {
      if (typeof value === 'string') {
        window[key] = JSON.parse(value);
      } else if (typeof value === 'object' && value !== null) {
        window[key] = value;
      } else {
        window[key] = {};
      }
    } catch (e) {
      console.warn(`Failed to parse ${key}:`, e);
      window[key] = {};
    }
  },

  // Инициализация всех глобальных переменных
  init: function(config) {
    // Типобезопасная установка переменных
    this.setBoolean('IS_AUTH', config.isAuth);
    try {
      if (document.body && document.body.getAttribute('data-logged-in') === '1') {
        window.IS_AUTH = true;
      }
    } catch (err) {}
    this.setBoolean('IS_ADMIN', config.isAdmin);
    this.setBoolean('IS_EMAIL_VERIFIED', config.isEmailVerified);
    this.setBoolean('SOCKET_IO_AVAILABLE', config.socketIoAvailable);

    const role = config.userRole || (config.isAuth ? (config.isAdmin ? 'admin' : 'user') : '');
    this.setString('USER_ROLE', role);
    this.setString('USER_EMAIL', config.userEmail || '');
    this.setString('USER_CREATED_AT', config.userCreatedAt || '');
    this.setString('USER_UPDATED_AT', config.userUpdatedAt || '');
    this.setNumber('USER_ALBA_BALANCE', config.userAlbaBalance || 0);
    this.setBoolean('USER_REF_BONUS_GRANTED', config.userRefBonusGranted || false);
    this.setString('USER_REF_CODE', config.userRefCode || '');
    this.setString('CSRF_TOKEN', config.csrfToken || '');
    this._config = config || {};

    // Специальные случаи
    if (config.currentImages) {
      this.setObject('CURRENT_IMAGES', config.currentImages);
    }

    console.log('AppBootstrap initialized:', {
      IS_AUTH: window.IS_AUTH,
      IS_ADMIN: window.IS_ADMIN,
      IS_EMAIL_VERIFIED: window.IS_EMAIL_VERIFIED,
      SOCKET_IO_AVAILABLE: window.SOCKET_IO_AVAILABLE,
      USER_ROLE: window.USER_ROLE,
      USER_EMAIL: window.USER_EMAIL,
      USER_ALBA_BALANCE: window.USER_ALBA_BALANCE,
      USER_REF_BONUS_GRANTED: window.USER_REF_BONUS_GRANTED
    });

    // Fetch fresh data from /api/me to ensure sync with DB/JWT/session
    if (window.IS_AUTH) {
      fetch('/api/me')
        .then(response => {
          if (!response.ok) {
            if (response.status === 401) {
              console.warn('Authentication expired, /api/me returned 401');
            }
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data.success && data.user) {
            this.setString('USER_ROLE', data.user.role || '');
            this.setBoolean('IS_EMAIL_VERIFIED', Boolean(data.user.emailVerified));
            this.setString('USER_EMAIL', data.user.email || '');
            this.setString('USER_CREATED_AT', data.user.createdAt || '');
            this.setString('USER_UPDATED_AT', data.user.updatedAt || '');
            this.setNumber('USER_ALBA_BALANCE', Number(data.user.albaBalance) || 0);
            this.setBoolean('USER_REF_BONUS_GRANTED', Boolean(data.user.refBonusGranted));

            console.log('AppBootstrap updated from /api/me:', {
              IS_AUTH: window.IS_AUTH,
              IS_ADMIN: window.IS_ADMIN,
              IS_EMAIL_VERIFIED: window.IS_EMAIL_VERIFIED,
              USER_ROLE: window.USER_ROLE,
              USER_EMAIL: window.USER_EMAIL,
              USER_CREATED_AT: window.USER_CREATED_AT,
              USER_UPDATED_AT: window.USER_UPDATED_AT,
              USER_ALBA_BALANCE: window.USER_ALBA_BALANCE,
              USER_REF_BONUS_GRANTED: window.USER_REF_BONUS_GRANTED
            });
          }
        })
        .catch(error => {
          console.warn('Could not fetch /api/me for state sync:', error);
        });
    }
  }
};
