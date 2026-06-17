const { normalizeRenderLocals } = require('../utils/legacyId');

module.exports = function normalizeRenderMiddleware(req, res, next) {
  const originalRender = res.render.bind(res);
  res.render = function renderWithLegacyIds(view, locals, callback) {
    const normalized = locals ? normalizeRenderLocals(locals) : locals;
    return originalRender(view, normalized, callback);
  };
  next();
};
