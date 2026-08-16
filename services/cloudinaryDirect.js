const cloudinary = require("cloudinary").v2;

function cloudName() {
  return String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
}

function hasCloudinaryConfig() {
  return Boolean(
    cloudName() &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function configureCloudinary() {
  if (!hasCloudinaryConfig()) return false;
  cloudinary.config({
    cloud_name: cloudName(),
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  return true;
}

function createUploadSignature() {
  if (!configureCloudinary()) {
    const err = new Error("Cloudinary is not configured");
    err.status = 503;
    throw err;
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "products";
  const paramsToSign = { timestamp, folder };
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );
  return {
    cloudName: cloudName(),
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature
  };
}

function sanitizeCloudinaryImageUrls(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch (e) {
      list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(list)) return [];

  const expected = cloudName();
  const out = [];
  for (const item of list.slice(0, 5)) {
    const value = String(item || "").trim();
    if (!value) continue;
    let parsed;
    try {
      parsed = new URL(value);
    } catch (e) {
      continue;
    }
    if (parsed.protocol !== "https:") continue;
    const host = parsed.hostname.toLowerCase();
    if (host !== "res.cloudinary.com" && !host.endsWith(".cloudinary.com")) continue;
    if (expected && !parsed.pathname.includes(`/${expected}/`)) continue;
    out.push(`${parsed.origin}${parsed.pathname}`);
  }
  return out;
}

module.exports = {
  hasCloudinaryConfig,
  createUploadSignature,
  sanitizeCloudinaryImageUrls
};
