// Конфигурация безопасности (Helmet, CSP)
const crypto = require("crypto");
const helmet = require("helmet");

const YT_SCRIPT = [
  "https://www.youtube.com",
  "https://youtube.com",
  "https://*.youtube.com",
  "https://cdnjs.cloudflare.com",
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com"
];

/**
 * Создает и возвращает middleware для безопасности.
 * Nonce всегда в res.locals.cspNonce — подключайте к <script nonce="..."> постепенно.
 * CSP_STRICT=true убирает 'unsafe-inline' у scriptSrc (ломает inline EJS, пока не мигрированы).
 */
function createSecurityMiddleware() {
  const strict = process.env.CSP_STRICT === "true";
  const isProd = process.env.NODE_ENV === "production";

  const helmetMw = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          ...(strict ? [] : ["'unsafe-inline'"]),
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          ...YT_SCRIPT
        ],
        // onclick handlers still used in a few admin/catalog partials
        scriptSrcAttr: strict ? ["'none'"] : ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:", "https://res.cloudinary.com", "https://*.cloudinary.com", "https://*.googleapis.com", "https://*.gstatic.com"],
        connectSrc: ["'self'", "https:", "wss:", "ws:", "https://api.instagram.com", "https://*.cloudinary.com", "https://*.googleapis.com"],
        frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com", "https://youtu.be", "https://*.youtube.com", "https://www.youtube-nocookie.com", "https://m.youtube.com", "https://vk.com", "https://*.vk.com", "https://www.instagram.com", "https://*.instagram.com"],
        mediaSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        ...(isProd ? { upgradeInsecureRequests: [] } : {})
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  });

  return function securityMiddleware(req, res, next) {
    res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
    return helmetMw(req, res, next);
  };
}

module.exports = {
  createSecurityMiddleware
};
