const multer = require("multer");
const path = require("path");
const fs = require("fs");

const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.NODE_ENV === "production" || isVercel;

let cloudinaryPingCache = { ok: false, checkedAt: 0 };
const CLOUDINARY_PING_TTL_MS = 5 * 60 * 1000;

function ensureUploadDir() {
  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (allowedTypes.includes(file.mimetype) && ALLOWED_EXT.has(ext || ".jpg")) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PNG, JPEG, JPG, WEBP allowed"), false);
  }
};

const mobileOptimization = (req, res, next) => {
  try {
    const userAgent = req.get("User-Agent") || "";
    req.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    next();
  } catch (err) {
    console.error("mobileOptimization error:", err);
    next();
  }
};

async function checkCloudinaryAvailable() {
  const hasCloudinaryConfig =
    (process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET) ||
    process.env.CLOUDINARY_URL;

  if (!hasCloudinaryConfig) return false;

  const now = Date.now();
  if (now - cloudinaryPingCache.checkedAt < CLOUDINARY_PING_TTL_MS) {
    return cloudinaryPingCache.ok;
  }

  try {
    const cloudinary = require("cloudinary").v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    await cloudinary.api.ping();
    cloudinaryPingCache = { ok: true, checkedAt: now };
    return true;
  } catch (pingErr) {
    console.warn("Cloudinary ping failed:", pingErr.message);
    cloudinaryPingCache = { ok: false, checkedAt: now };
    return false;
  }
}

function createDiskStorage() {
  const uploadDir = ensureUploadDir();
  return multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        cb(null, uploadDir);
      } catch (dirErr) {
        cb(dirErr);
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      let ext = path.extname(file.originalname || "").toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        ext = file.mimetype === "image/png" ? ".png" : file.mimetype === "image/webp" ? ".webp" : ".jpg";
      }
      cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
  });
}

function createImageUpload(options = {}) {
  const { maxFiles = 5, maxFileSize = 5 * 1024 * 1024 } = options;

  return async (req, res, next) => {
    try {
      let storage;
      let useCloudinary = false;
      const cloudinaryAvailable = await checkCloudinaryAvailable();

      if (isProduction && !cloudinaryAvailable) {
        return res.status(503).json({
          success: false,
          message: "Загрузка изображений временно недоступна (Cloudinary)"
        });
      }

      if (cloudinaryAvailable) {
        try {
          const { CloudinaryStorage } = require("multer-storage-cloudinary");
          const cloudinary = require("cloudinary").v2;
          cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
          });

          storage = new CloudinaryStorage({
            cloudinary,
            params: async (_req, file) => {
              const base = path
                .basename(file.originalname || "image", path.extname(file.originalname || ""))
                .replace(/[^a-zA-Z0-9_-]/g, "")
                .slice(0, 40) || "image";
              return {
                folder: "products",
                public_id: `${base}-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
                allowed_formats: ["jpg", "png", "jpeg", "webp"],
                transformation: [
                  { width: 1200, height: 1200, crop: "limit" },
                  { quality: "auto" },
                  { fetch_format: "auto" }
                ]
              };
            }
          });
          useCloudinary = true;
        } catch (cloudinaryErr) {
          if (isProduction) {
            return res.status(503).json({
              success: false,
              message: "Загрузка изображений временно недоступна"
            });
          }
          storage = createDiskStorage();
        }
      } else {
        storage = createDiskStorage();
      }

      const multerInstance = multer({
        storage,
        fileFilter,
        limits: {
          fileSize: maxFileSize,
          files: maxFiles,
        },
      });

      const uploadMiddleware = multerInstance.array("images", maxFiles);

      await new Promise((resolve, reject) => {
        uploadMiddleware(req, res, (err) => {
          if (err) {
            let errorMessage = "Ошибка загрузки файлов";
            if (err.code === "LIMIT_FILE_COUNT") {
              errorMessage = `Максимальное количество изображений: ${maxFiles}`;
            } else if (err.code === "LIMIT_FILE_SIZE") {
              errorMessage = "Размер файла превышает лимит";
            } else if (err.message) {
              errorMessage = err.message;
            }
            return reject(Object.assign(err, { clientMessage: errorMessage }));
          }
          resolve();
        });
      });

      // Magic-byte validation for disk uploads
      if (!useCloudinary && req.files && req.files.length) {
        const { validateImageType } = require("../services/imageService");
        for (const file of req.files) {
          if (file.path) {
            const buf = fs.readFileSync(file.path);
            const ok = await validateImageType(buf);
            if (!ok) {
              try { fs.unlinkSync(file.path); } catch (_) {}
              return res.status(400).json({ success: false, message: "Файл не является изображением" });
            }
          }
        }
      }

      req.uploadStorage = useCloudinary ? "cloudinary" : "local";
      next();
    } catch (err) {
      console.error("upload error:", err);
      return res.status(400).json({
        success: false,
        message: err.clientMessage || err.message || "Ошибка загрузки файлов"
      });
    }
  };
}

const upload = createImageUpload({ maxFiles: 5 });
const bannerUpload = createImageUpload({ maxFiles: 5 });

module.exports = {
  upload,
  bannerUpload,
  mobileOptimization,
  createImageUpload,
  fileFilter
};
