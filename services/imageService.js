// Сервис для работы с изображениями
const { deleteImages } = require("../utils/imageUtils");
const cloudinary = require("cloudinary").v2;
// file-type v19+ требует ESM, используем альтернативу или проверку через multer
// const fileType = require("file-type");
const fs = require("fs");
const path = require("path");

const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET
);

/**
 * Проверка типа файла по magic bytes
 * @param {Buffer} buffer - Буфер файла
 * @returns {Promise<boolean>} - true если это изображение
 * 
 * Примечание: Проверка типа файла выполняется на уровне multer (fileFilter)
 * Эта функция может быть использована для дополнительной проверки при необходимости
 */
async function validateImageType(buffer) {
  if (!buffer || buffer.length < 12) return false;
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return true;
  // WEBP (RIFF....WEBP)
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return true;
  // GIF
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
    buffer[3] === 0x38 && (buffer[4] === 0x37 || buffer[4] === 0x39)
  ) return true;
  return false;
}

/**
 * Оптимизация изображения через Cloudinary
 * @param {string} imageUrl - URL изображения
 * @param {Object} options - Опции трансформации
 * @returns {string} - URL оптимизированного изображения
 */
function optimizeImageUrl(imageUrl, options = {}) {
  if (!hasCloudinary || !imageUrl || !imageUrl.includes('cloudinary.com')) {
    return imageUrl; // Возвращаем оригинал, если не Cloudinary
  }

  const {
    width = 800,
    height = 600,
    quality = 'auto',
    format = 'auto' // auto = WebP для современных браузеров
  } = options;

  // Извлекаем public_id из URL
  const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
  if (!match) return imageUrl;

  const publicId = match[1];
  
  // Генерируем URL с трансформациями
  // f_auto = автоматический формат (WebP для поддерживающих браузеров)
  // q_auto = автоматическое качество
  // c_limit = ограничение размеров без обрезки
  // fl_no_overflow = предотвращает увеличение изображения сверх исходных размеров
  return cloudinary.url(publicId, {
    transformation: [
      { width, height, crop: 'limit', flags: 'no_overflow' },
      { quality: quality },
      { fetch_format: format === 'auto' ? 'auto' : format }
    ]
  });
}

/**
 * Генерация thumbnail URL
 * @param {string} imageUrl - URL изображения
 * @param {Object} options - Дополнительные опции
 * @returns {string} - URL thumbnail
 */
function getThumbnailUrl(imageUrl, options = {}) {
  const {
    width = 300,
    height = 300,
    crop = 'fill' // fill для квадратных thumbnails
  } = options;

  if (!hasCloudinary || !imageUrl || !imageUrl.includes('cloudinary.com')) {
    return imageUrl; // Возвращаем оригинал, если не Cloudinary
  }

  const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
  if (!match) return imageUrl;

  const publicId = match[1];
  
  // Генерируем thumbnail с оптимизацией
  return cloudinary.url(publicId, {
    transformation: [
      { width, height, crop, gravity: 'auto', flags: 'no_overflow' },
      { quality: 'auto' },
      { fetch_format: 'auto' } // WebP для современных браузеров
    ]
  });
}

/**
 * Удаление изображений при удалении карточки
 * @param {Array<string>} imageUrls - Массив URL изображений
 * @returns {Promise<number>} - Количество удаленных изображений
 */
async function deleteProductImages(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    return 0;
  }

  try {
    const deletedCount = await deleteImages(imageUrls);
    console.log(`✅ Удалено ${deletedCount} из ${imageUrls.length} изображений карточки`);
    return deletedCount;
  } catch (err) {
    console.error("❌ Ошибка удаления изображений карточки:", err);
    return 0;
  }
}

/**
 * Обработка загруженных файлов с оптимизацией
 * @param {Array} files - Массив файлов от multer
 * @param {Object} options - Опции обработки
 * @returns {Array<string>} - Массив URL изображений
 */
function processUploadedFiles(files, options = {}) {
  if (!files || files.length === 0) {
    return [];
  }

  const { optimize = true } = options;
  const images = [];
  const filesToProcess = files.slice(0, 5); // Ограничиваем до 5

  filesToProcess.forEach(file => {
    let imagePath = null;
    // Cloudinary (multer-storage-cloudinary) sets path/secure_url/url
    const cloudUrl = file.path || file.secure_url || file.url;
    if (cloudUrl && String(cloudUrl).startsWith('http')) {
      imagePath = cloudUrl;
      if (optimize && hasCloudinary && imagePath.includes('cloudinary.com')) {
        imagePath = optimizeImageUrl(imagePath, {
          width: 800,
          height: 600,
          quality: 'auto',
          format: 'auto'
        });
      }
    } else if (file.filename) {
      imagePath = '/uploads/' + file.filename;
    }
    if (imagePath) {
      images.push(imagePath);
    }
  });

  return images;
}

module.exports = {
  validateImageType,
  optimizeImageUrl,
  getThumbnailUrl,
  deleteProductImages,
  processUploadedFiles
};
