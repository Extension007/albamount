const REASON_LABELS = {
  referral_bonus: 'Реферальный бонус (за приглашение)',
  referred_user_bonus: 'Бонус за регистрацию по ссылке',
  admin_grant: 'Начисление администратором',
  manual_adjustment: 'Ручная корректировка',
  card_entitlement_purchase: 'Покупка права на карточку',
  upgrade_to_paid: 'Оплата платной карточки',
  moderation_refund: 'Возврат после отклонения модерацией',
  card_payment: 'Оплата карточки'
};

const TYPE_LABELS = {
  earn: 'Начисление',
  spend: 'Списание',
  grant: 'Начисление'
};

function formatAlbaTransaction(tx) {
  const plain = tx && typeof tx.toJSON === 'function' ? tx.toJSON() : (tx || {});
  const amount = parseFloat(plain.amount);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const meta = plain.meta && typeof plain.meta === 'object' ? plain.meta : {};
  const comment = meta.comment || plain.comment || '';

  return {
    id: plain.id,
    amount: safeAmount,
    type: plain.type || '',
    reason: plain.reason || '',
    reasonLabel: REASON_LABELS[plain.reason] || plain.reason || 'Операция ALBA',
    typeLabel: TYPE_LABELS[plain.type] || plain.type || '',
    comment: String(comment || ''),
    createdAt: plain.createdAt || null,
    relatedCardType: plain.relatedCardType || null,
    relatedCardId: plain.relatedCardId || null
  };
}

function formatAlbaTransactions(rows) {
  return (rows || []).map(formatAlbaTransaction);
}

module.exports = {
  REASON_LABELS,
  TYPE_LABELS,
  formatAlbaTransaction,
  formatAlbaTransactions
};
