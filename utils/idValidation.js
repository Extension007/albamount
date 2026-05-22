function isValidCardId(id) {
  return typeof id === "string" && /^[a-f0-9]{32,}$/i.test(id);
}

module.exports = { isValidCardId };
