// Единый паттерн для безопасной передачи данных из EJS в JavaScript
// Решает проблемы с "Expression expected" и обеспечивает типобезопасность

window.AppBootstrap = {
  // Безопасная установка булевых значений
  setBoolean: function(key, value) {
    window[key] = Boolean(value);
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
    this.setBoolean('IS_ADMIN', config.isAdmin);
    this.setBoolean('SOCKET_IO_AVAILABLE', config.socketIoAvailable);
    this.setBoolean('IS_EMAIL_VERIFIED', config.isEmailVerified);

    this.setString('USER_ROLE', config.userRole || '');
    this.setString('USER_EMAIL', config.userEmail || '');
    this.setString('USER_CREATED_AT', config.userCreatedAt || '');
    this.setString('USER_UPDATED_AT', config.userUpdatedAt || '');
    this.setNumber('USER_ALBA_BALANCE', config.userAlbaBalance || 0);
    this.setBoolean('IS_CABINET_PAGE', config.isCabinetPage || false);
    this.setString('CSRF_TOKEN', config.csrfToken || '');

    console.log('AppBootstrap initialized:', {
      IS_AUTH: window.IS_AUTH,
      IS_ADMIN: window.IS_ADMIN,
      SOCKET_IO_AVAILABLE: window.SOCKET_IO_AVAILABLE,
      USER_ROLE: window.USER_ROLE,
      USER_EMAIL: window.USER_EMAIL,
      USER_ALBA_BALANCE: window.USER_ALBA_BALANCE,
      USER_REF_BONUS_GRANTED: window.USER_REF_BONUS_GRANTED,
      IS_EMAIL_VERIFIED: window.IS_EMAIL_VERIFIED
    });
    
    // Immediately fetch fresh user data from the database after initialization
    // This ensures that USER_ROLE and IS_EMAIL_VERIFIED are updated with current database values
    // regardless of JWT or template defaults
    if (window.IS_AUTH) {
       fetch('/api/me', { credentials: 'include' })
        .then(response => {
          if (!response.ok) {
            // Handle 401 Unauthorized responses when token is expired or invalid
            if (response.status === 401) {
              console.warn('Authentication expired, redirecting to login');
              // Optionally redirect to login page if token is invalid
              // window.location.href = '/user/login';
            }
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data.success && data.user) {
            // Update frontend variables with fresh data from database
            this.setString('USER_ROLE', data.user.role || '');
            this.setBoolean('IS_EMAIL_VERIFIED', Boolean(data.user.emailVerified));
            this.setString('USER_EMAIL', data.user.email || '');
            this.setString('USER_CREATED_AT', data.user.createdAt || '');
            this.setString('USER_UPDATED_AT', data.user.updatedAt || '');
            this.setNumber('USER_ALBA_BALANCE', Number(data.user.albaBalance) || 0);
            this.setBoolean('USER_REF_BONUS_GRANTED', Boolean(data.user.refBonusGranted));
            
            // Log the updated state to show when IS_EMAIL_VERIFIED changes
            console.log('AppBootstrap updated from API:', {
              IS_AUTH: window.IS_AUTH,
              IS_ADMIN: window.IS_ADMIN,
              SOCKET_IO_AVAILABLE: window.SOCKET_IO_AVAILABLE,
              USER_ROLE: window.USER_ROLE,
              USER_EMAIL: window.USER_EMAIL,
              USER_ALBA_BALANCE: window.USER_ALBA_BALANCE,
              USER_REF_BONUS_GRANTED: window.USER_REF_BONUS_GRANTED,
              IS_EMAIL_VERIFIED: window.IS_EMAIL_VERIFIED
            });
          }
        })
        .catch(error => {
          console.warn('Could not fetch fresh user data from /api/me:', error);
          // Continue with initial values if API call fails
        });
    } else {
      // Even if not authenticated, log the initial state for debugging
      console.log('AppBootstrap initialized (not authenticated):', {
        IS_AUTH: window.IS_AUTH,
        IS_ADMIN: window.IS_ADMIN,
        SOCKET_IO_AVAILABLE: window.SOCKET_IO_AVAILABLE,
        USER_ROLE: window.USER_ROLE,
        IS_EMAIL_VERIFIED: window.IS_EMAIL_VERIFIED
      });
    }
  }
};
