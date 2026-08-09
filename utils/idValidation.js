/**
 * Accept both Postgres integer IDs and legacy Mongo-style hex IDs.
 */
function isValidEntityId(id) {
  if (id == null) return false;
  const value = String(id).trim();
  if (!value) return false;
  if (/^\d+$/.test(value)) return Number(value) > 0;
  if (/^[a-f0-9]{24}$/i.test(value)) return true;
  if (/^[a-f0-9]{32,}$/i.test(value)) return true;
  return false;
}

/** @deprecated Use isValidEntityId */
function isValidCardId(id) {
  return isValidEntityId(id);
}

module.exports = { isValidEntityId, isValidCardId };
