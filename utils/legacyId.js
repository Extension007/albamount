/**
 * Совместимость MongoDB _id → PostgreSQL id после миграции.
 */

function toPlainWithLegacyId(record) {
  if (!record) return record;
  const plain = record.get ? record.get({ plain: true }) : { ...record };
  if (plain.id != null && plain._id == null) {
    plain._id = plain.id;
  }
  return plain;
}

function mapPlainWithLegacyId(records) {
  if (!Array.isArray(records)) return records;
  return records.map(toPlainWithLegacyId);
}

function normalizeUser(user) {
  if (!user) return user;
  const out = { ...user };
  if (out.id != null && out._id == null) {
    out._id = out.id.toString();
  }
  return out;
}

const RENDER_LIST_KEYS = [
  'products', 'services', 'banners',
  'pendingProducts', 'pendingServices', 'pendingBanners',
  'videos', 'pendingVideos', 'myProducts', 'myServices', 'myBanners',
  'contacts', 'albaTransactions'
];

const RENDER_OBJECT_KEYS = ['product', 'service', 'banner', 'video', 'item'];

function normalizeRenderLocals(locals) {
  if (!locals || typeof locals !== 'object') return locals;
  const out = { ...locals };

  if (out.user) {
    out.user = normalizeUser(out.user);
  }

  for (const key of RENDER_LIST_KEYS) {
    if (Array.isArray(out[key])) {
      out[key] = mapPlainWithLegacyId(
        out[key].map((item) => (item?.get ? item.get({ plain: true }) : item))
      );
    }
  }

  for (const key of RENDER_OBJECT_KEYS) {
    if (out[key]) {
      out[key] = toPlainWithLegacyId(out[key]?.get ? out[key].get({ plain: true }) : out[key]);
    }
  }

  return out;
}

module.exports = {
  toPlainWithLegacyId,
  mapPlainWithLegacyId,
  normalizeUser,
  normalizeRenderLocals
};
