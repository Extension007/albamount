// Сервис для работы с товарами
const { Op } = require("sequelize");
const Product = require("../models/Product");
const Category = require("../models/Category");
const User = require("../models/User");
const Entitlement = require("../models/Entitlement");
const { CATEGORY_KEYS } = require("../config/constants");
const { processUploadedFiles, deleteProductImages } = require("./imageService");
const { getAvailableEntitlementsCount, consumeEntitlement } = require("./albaService");
const { normalizePrice } = require("../utils/price");
const { sequelize } = require("../config/database");

async function resolveCategoryData(category) {
  if (!category) return { categoryId: null, categoryValue: "" };
  if (CATEGORY_KEYS.includes(category)) {
    return { categoryId: null, categoryValue: category };
  }

  const asString = String(category);
  if (/^\d+$/.test(asString)) {
    const categoryDoc = await Category.findByPk(parseInt(asString, 10), {
      attributes: ['id', 'name']
    });
    if (categoryDoc) {
      return { categoryId: categoryDoc.id, categoryValue: categoryDoc.name };
    }
  }

  // Legacy Mongo-style hex id
  if (/^[a-f0-9]{24,}$/i.test(asString)) {
    const categoryDoc = await Category.findByPk(asString, {
      attributes: ['id', 'name']
    });
    if (categoryDoc) {
      return { categoryId: categoryDoc.id, categoryValue: categoryDoc.name };
    }
  }

  return { categoryId: null, categoryValue: asString || "" };
}

/**
 * Создание товара
 * @param {Object} data - Данные товара
 * @param {Array} files - Загруженные файлы
 * @param {Object} [options]
 * @param {import('sequelize').Transaction} [options.transaction]
 * @returns {Promise<Object>} - Созданный товар
 */
async function createProduct(data, files = [], options = {}) {
  const {
    name,
    description,
    price,
    link,
    video_url,
    category,
    type,
    phone,
    email,
    telegram,
    whatsapp,
    contact_method,
    ownerId,
    status = "pending",
    tier = "free",
    tierRequested
  } = data;

  // Валидация категории
  const { categoryId, categoryValue: resolvedCategoryValue } = await resolveCategoryData(category);
  let categoryValue = resolvedCategoryValue;
  if (!categoryValue) {
    categoryValue = categoryId ? "Категория" : "home";
  }
  const typeValue = (type === "service" || type === "product") ? type : "product";

  const fromFiles = processUploadedFiles(files);
  const { sanitizeCloudinaryImageUrls } = require("./cloudinaryDirect");
  const fromUrls = sanitizeCloudinaryImageUrls(data.image_urls);
  const images = [...fromUrls, ...fromFiles].slice(0, 5);
  const image_url = images.length > 0 ? images[0] : null;

  // Формируем объект контактов
  const contacts = {
    phone: phone ? phone.trim() : "",
    email: email ? email.trim() : "",
    telegram: telegram ? telegram.trim() : "",
    whatsapp: whatsapp ? whatsapp.trim() : "",
    contact_method: contact_method ? contact_method.trim() : ""
  };

  let normalizedPrice;
  try {
    normalizedPrice = normalizePrice(price);
  } catch (err) {
    const e = new Error(err.message || 'Некорректная цена');
    e.status = 400;
    throw e;
  }

  const productData = {
    name: name.trim(),
    description: description ? description.trim() : "",
    price: normalizedPrice,
    link: link ? link.trim() : "",
    video_url: video_url ? video_url.trim() : "",
    images,
    image_url,
    contacts,
    category: categoryValue,
    categoryId,
    type: typeValue,
    ownerId: ownerId || null,
    status,
    tier: tier === 'paid' ? 'paid' : 'free',
    tierRequested: tierRequested || (tier === 'paid' ? 'paid' : 'free'),
    likes: 0,
    dislikes: 0
  };

  return await Product.create(productData, { transaction: options.transaction });
}

/**
 * Обновление товара
 * @param {string} productId - ID товара
 * @param {Object} data - Новые данные
 * @param {Array} files - Новые загруженные файлы
 * @param {Object} options - Опции (ownerId для проверки прав)
 * @returns {Promise<Object>} - Обновленный товар
 */
async function updateProduct(productId, data, files = [], options = {}) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw new Error("Товар не найден");
  }

  // Проверка прав (если указан ownerId)
  if (options.ownerId && product.ownerId && product.ownerId.toString() !== options.ownerId.toString()) {
    throw new Error("Нет прав для редактирования этого товара");
  }

  const {
    name,
    description,
    price,
    link,
    video_url,
    category,
    type,
    phone,
    email,
    telegram,
    whatsapp,
    contact_method,
    current_images
  } = data;

  // Обработка изображений
  const oldImages = product.images || [];
  let newImages = [];

  // Получаем текущие изображения (оставшиеся после удаления на фронтенде)
  if (current_images) {
    try {
      const currentImagesArray = typeof current_images === 'string' 
        ? JSON.parse(current_images) 
        : Array.isArray(current_images) 
          ? current_images 
          : [];
      newImages = currentImagesArray.filter(img => img && typeof img === 'string');
    } catch (e) {
      console.warn("⚠️ Ошибка парсинга current_images:", e.message);
      newImages = oldImages;
    }
  } else {
    newImages = oldImages;
  }

  // Добавляем новые загруженные изображения
  if (files && files.length > 0) {
    const uploadedImages = processUploadedFiles(files);
    newImages = [...newImages, ...uploadedImages].slice(0, 5);
  }
  if (data.image_urls) {
    const { sanitizeCloudinaryImageUrls } = require("./cloudinaryDirect");
    newImages = [...newImages, ...sanitizeCloudinaryImageUrls(data.image_urls)].slice(0, 5);
  }

  // Нормализуем URL для корректного сравнения (убираем параметры Cloudinary)
  const { normalizeImageUrl } = require("../utils/imageUtils");
  const normalizedOldImages = oldImages.map(url => normalizeImageUrl(url));
  const normalizedNewImages = newImages.map(url => normalizeImageUrl(url));

  // Находим изображения для удаления (сравниваем нормализованные URL)
  // Используем оригинальные URL из oldImages для удаления (чтобы сохранить правильный public_id)
  const imagesToDelete = oldImages.filter((oldImg, index) => {
    const normalizedOld = normalizedOldImages[index];
    // Проверяем, есть ли нормализованный старый URL в новых нормализованных URL
    const existsInNew = normalizedNewImages.some(normalizedNew => {
      // Сравниваем нормализованные URL (учитываем возможные различия в параметрах)
      return normalizedOld === normalizedNew;
    });
    
    // Также проверяем точное совпадение оригинальных URL
    if (!existsInNew) {
      const exactMatch = newImages.some(newImg => {
        return oldImg === newImg || normalizeImageUrl(newImg) === normalizedOld;
      });
      return !exactMatch;
    }
    
    return false;
  });
  
  console.log(`📊 Сравнение изображений:`);
  console.log(`  Старые (${oldImages.length}):`, oldImages);
  console.log(`  Новые (${newImages.length}):`, newImages);
  console.log(`  Нормализованные старые:`, normalizedOldImages);
  console.log(`  Нормализованные новые:`, normalizedNewImages);
  console.log(`  Для удаления (${imagesToDelete.length}):`, imagesToDelete);

  // Удаляем изображения из хранилища
  if (imagesToDelete.length > 0) {
    try {
      const deletedCount = await deleteProductImages(imagesToDelete);
      console.log(`✅ Удалено ${deletedCount} из ${imagesToDelete.length} изображений при редактировании карточки ${productId}`);
      if (deletedCount < imagesToDelete.length) {
        console.warn(`⚠️  Не все изображения удалены (${deletedCount}/${imagesToDelete.length})`);
      }
    } catch (err) {
      console.error("❌ Ошибка удаления изображений при редактировании:", err);
      // Не прерываем выполнение, продолжаем обновление карточки
    }
  }

  // Для обратной совместимости
  const image_url = newImages.length > 0 ? newImages[0] : null;

  // Формируем объект контактов
  const contacts = {
    phone: phone ? phone.trim() : "",
    email: email ? email.trim() : "",
    telegram: telegram ? telegram.trim() : "",
    whatsapp: whatsapp ? whatsapp.trim() : "",
    contact_method: contact_method ? contact_method.trim() : ""
  };

  // Валидация категории
  const hasCategory = typeof category !== "undefined" && category !== "";
  let categoryId = product.categoryId || null;
  let categoryValue = product.category || "home";
  if (hasCategory) {
    const { categoryId: resolvedCategoryId, categoryValue: resolvedCategoryValue } = await resolveCategoryData(category);
    if (resolvedCategoryId) {
      categoryId = resolvedCategoryId;
    } else if (CATEGORY_KEYS.includes(category)) {
      categoryId = null;
    }
    if (resolvedCategoryValue) {
      categoryValue = resolvedCategoryValue;
    } else if (resolvedCategoryId) {
      categoryValue = "Категория";
    } else if (CATEGORY_KEYS.includes(category)) {
      categoryValue = category;
    }
  }
  const typeValue = (type === "service" || type === "product") ? type : (product.type || "product");

  let normalizedPrice;
  try {
    normalizedPrice = normalizePrice(price);
  } catch (err) {
    const e = new Error(err.message || 'Некорректная цена');
    e.status = 400;
    throw e;
  }

  // Обновляем товар
  const updateData = {
    name: name.trim(),
    description: description ? description.trim() : "",
    price: normalizedPrice,
    link: link ? link.trim() : "",
    video_url: video_url ? video_url.trim() : "",
    images: newImages,
    image_url,
    contacts,
    category: categoryValue,
    type: typeValue,
    status: "pending" // Всегда сбрасываем на модерацию при редактировании
  };

   await Product.update(
     updateData,
     { where: { id: productId } }
   );
   return await Product.findByPk(productId);
}

/**
 * Удаление товара (soft delete)
 * @param {string} productId - ID товара
 * @param {Object} options - Опции (ownerId для проверки прав)
 * @returns {Promise<Object>} - Удаленный товар
 */
async function deleteProduct(productId, options = {}) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw new Error("Товар не найден");
  }

  // Проверка прав (если указан ownerId)
  if (options.ownerId && product.ownerId && product.ownerId.toString() !== options.ownerId.toString()) {
    throw new Error("Нет прав для удаления этого товара");
  }

  // Удаляем изображения
  if (product.images && product.images.length > 0) {
    await deleteProductImages(product.images);
  }

   // Soft delete
   await Product.update(
     { deleted: true, status: "rejected" },
     { where: { id: productId } }
   );
   return await Product.findByPk(productId);
}

/**
 * Получение товаров с фильтрацией и пагинацией
 * @param {Object} filters - Фильтры
 * @param {Object} options - Опции (page, limit, sort)
 * @returns {Promise<Object>} - { products, total, page, totalPages }
 */
async function getProducts(filters = {}, options = {}) {
  const {
    page = 1,
    limit = 20,
    sort = { _id: -1 }
  } = options;

  // Добавляем фильтр для soft delete
  filters.deleted = false;

  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    Product.findAll({
      where: filters,
      order: [['id', 'DESC']],
      offset: skip,
      limit: limit,
      include: [{ model: User, as: 'owner', attributes: ['id', 'username', 'email'] }],
      raw: true,
      nest: true
    }),
    Product.count({ where: filters })
  ]);

  return {
    products,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Create product with entitlement validation and consumption
 * @param {Object} data - Product data
 * @param {Array} files - Uploaded files
 * @param {Object} user - User object
 * @returns {Promise<Object>} - Created product or error
 */
async function createProductWithEntitlementCheck(data, files = [], user) {
  const { allowedCardType } = require("../utils/accountType");

  if (!user || !user.emailVerified) {
    throw new Error('User must be verified to create products');
  }

  const userId = user._id || user.id;
  let accountType = user.accountType;
  if (!accountType) {
    const dbUser = await User.findByPk(userId, { attributes: ['accountType'] });
    accountType = dbUser?.accountType || 'showcase';
  }
  const type = allowedCardType(accountType);
  data.type = type;

  // One free card per type (product / service). Any existing non-deleted card
  // of that type means further creates require a purchased entitlement.
  const existingCardsOfType = await Product.count({
    where: {
      ownerId: userId,
      type,
      deleted: false
    }
  });

  if (existingCardsOfType >= 1) {
    const availableEntitlements = await getAvailableEntitlementsCount(userId, type);
    if (availableEntitlements <= 0) {
      throw new Error(`No available entitlements for ${type} creation. Purchase more entitlements.`);
    }

    return sequelize.transaction(async (t) => {
      const entitlementToConsume = await Entitlement.findOne({
        where: {
          ownerId: userId,
          type,
          status: 'available'
        },
        order: [['createdAt', 'ASC']],
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!entitlementToConsume) {
        throw new Error(`No available entitlements found for ${type} creation`);
      }

      const consumeResult = await consumeEntitlement(entitlementToConsume.id, { transaction: t });
      if (!consumeResult.ok) {
        throw new Error(`Failed to consume entitlement: ${consumeResult.message}`);
      }

      data.tier = 'paid';
      data.status = 'pending';
      const product = await createProduct(data, files, { transaction: t });
      return { product, entitlementConsumed: true, entitlementId: entitlementToConsume.id };
    });
  }

  data.tier = 'free';
  data.status = 'pending';
  const product = await createProduct(data, files);
  return { product, entitlementConsumed: false };
}

/**
 * Update product with edit limits
 * @param {string} productId - Product ID
 * @param {Object} data - New data
 * @param {Array} files - New uploaded files
 * @param {Object} options - Options (ownerId for rights check)
 * @returns {Promise<Object>} - Updated product or error
 */
async function updateProductWithEditLimits(productId, data, files = [], options = {}) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw new Error("Product not found");
  }

  // Check ownership
  if (options.ownerId && product.ownerId && product.ownerId.toString() !== options.ownerId.toString()) {
    throw new Error("No rights to edit this product");
  }

  // Check edit limits
  const isBaseCard = !product.tier || product.tier === 'free';
  const isPurchasedCard = product.tier === 'paid';

  const maxEdits = isBaseCard ? 3 : 5;
  const currentEditCount = product.editCount || 0;

  if (currentEditCount >= maxEdits) {
    throw new Error(`Edit limit reached for this ${isBaseCard ? 'base' : 'purchased'} card (max ${maxEdits} edits)`);
  }

  // Increment edit count
  product.editCount = currentEditCount + 1;

  // Update product (will set status to pending)
  const updatedProduct = await updateProduct(productId, data, files, options);

  return updatedProduct;
}

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  getProducts,
  createProductWithEntitlementCheck,
  updateProductWithEditLimits
};
