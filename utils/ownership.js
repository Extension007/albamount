/**
 * Compare record ownership using ownerId (preferred) or loaded owner association.
 */
function getRecordOwnerId(record) {
  if (!record) return null;
  if (record.ownerId != null) return String(record.ownerId);
  if (record.owner != null) {
    if (typeof record.owner === 'object') {
      const nested = record.owner.id ?? record.owner._id;
      return nested != null ? String(nested) : null;
    }
    return String(record.owner);
  }
  return null;
}

function isRecordOwner(record, user) {
  if (!record || !user) return false;
  const ownerId = getRecordOwnerId(record);
  const userId = user._id ?? user.id;
  if (ownerId == null || userId == null) return false;
  return String(ownerId) === String(userId);
}

module.exports = { getRecordOwnerId, isRecordOwner };
