// FIX: Модуль санитизации HTML
// Удаляет потенциально опасный HTML и JavaScript код

/**
 * Санитизирует HTML строку, удаляя опасные теги и атрибуты
 * @param {string} html - Исходная HTML строка
 * @param {Object} options - Опции санитизации
 * @returns {string} Санитизированная строка
 */
function sanitizeHtml(html, options = {}) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Настройки по умолчанию
  const defaultOptions = {
    allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'u'],
    allowedAttributes: {},
    stripScripts: true,
    stripStyles: true,
    maxLength: 5000
  };

  const config = { ...defaultOptions, ...options };

  // Ограничиваем длину
  if (html.length > config.maxLength) {
    html = html.substring(0, config.maxLength);
  }

  // Удаляем JavaScript
  if (config.stripScripts) {
    html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<script[\s\S]*?\/>/gi, '');
    html = html.replace(/javascript:/gi, '');
    html = html.replace(/\son[a-z]+\s*=/gi, ' ');
    html = html.replace(/data:/gi, '');
  }

  // Удаляем inline стили
  if (config.stripStyles) {
    html = html.replace(/style=["'][^"']*["']/gi, '');
    html = html.replace(/style="[^"]*"/gi, '');
  }

  // Удаляем опасные теги
  const dangerousTags = [
    'script', 'object', 'embed', 'link', 'style', 'iframe', 'frame', 
    'frameset', 'meta', 'base', 'form', 'input', 'button', 'select',
    'textarea', 'applet', 'canvas', 'svg', 'math', 'video', 'audio',
    'source', 'track', 'picture', 'template', 'noscript'
  ];

  dangerousTags.forEach(tag => {
    const regex = new RegExp(`<\\/?${tag}[\\s\\S]*?>`, 'gi');
    html = html.replace(regex, '');
  });

  // Разрешаем только безопасные теги
  const allowedRegex = new RegExp(`<(${config.allowedTags.join('|')})\\b[^>]*>`, 'gi');
  const allowedTags = html.match(allowedRegex) || [];
  
  // Удаляем все теги, которые не в разрешенном списке
  const allTags = html.match(/<\/?[^>]+>/gi) || [];
  let sanitized = html;
  
  allTags.forEach(tag => {
    const tagName = tag.replace(/[<\/>]/g, '').split(/\s/)[0].toLowerCase();
    if (!config.allowedTags.includes(tagName)) {
      sanitized = sanitized.replace(tag, '');
    }
  });

  // Удаляем небезопасные атрибуты из разрешенных тегов
  config.allowedTags.forEach(tag => {
    const regex = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
    sanitized = sanitized.replace(regex, (match) => {
      // Оставляем только базовые атрибуты
      return match.replace(/\s+[a-zA-Z-]+=["'][^"']*["']/g, '');
    });
  });

  return sanitized;
}

/**
 * Санитизирует описание товара
 * @param {string} description - Описание товара
 * @returns {string} Санитизированное описание
 */
function sanitizeProductDescription(description) {
  if (!description || typeof description !== 'string') {
    return '';
  }

  return sanitizeHtml(description, {
    allowedTags: ['b', 'i', 'em', 'strong', 'u', 'p', 'br'],
    stripScripts: true,
    stripStyles: true,
    maxLength: 5000
  });
}

/**
 * Санитизирует способ связи
 * @param {string} contactMethod - Способ связи
 * @returns {string} Санитизированный способ связи
 */
function sanitizeContactMethod(contactMethod) {
  if (!contactMethod || typeof contactMethod !== 'string') {
    return '';
  }

  return sanitizeHtml(contactMethod, {
    allowedTags: ['b', 'i', 'em', 'strong', 'u', 'br'],
    stripScripts: true,
    stripStyles: true,
    maxLength: 200
  });
}

/**
 * Базовая санитизация текста (удаляет все HTML теги)
 * @param {string} text - Исходный текст
 * @param {number} maxLength - Максимальная длина
 * @returns {string} Санитизированный текст
 */
function sanitizeText(text, maxLength = null) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Удаляем все HTML теги
  let sanitized = text.replace(/<[^>]*>/g, '');
  
  // Ограничиваем длину
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized.trim();
}

/**
 * Санитизирует контактные данные
 * @param {Object} contacts - Объект с контактами
 * @returns {Object} Санитизированные контакты
 */
function sanitizeContacts(contacts) {
  if (!contacts || typeof contacts !== 'object') {
    return {};
  }

  const sanitized = {};
  
  if (contacts.phone) {
    sanitized.phone = sanitizeText(contacts.phone, 50);
  }
  
  if (contacts.email) {
    sanitized.email = sanitizeText(contacts.email, 100).toLowerCase();
  }
  
  if (contacts.telegram) {
    sanitized.telegram = sanitizeText(contacts.telegram, 100);
  }
  
  if (contacts.whatsapp) {
    sanitized.whatsapp = sanitizeText(contacts.whatsapp, 50);
  }
  
  if (contacts.contact_method) {
    sanitized.contact_method = sanitizeContactMethod(contacts.contact_method);
  }

  return sanitized;
}

module.exports = {
  sanitizeHtml,
  sanitizeProductDescription,
  sanitizeContactMethod,
  sanitizeText,
  sanitizeContacts
};
