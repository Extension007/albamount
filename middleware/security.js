const { sanitizeText } = require('../utils/sanitize');

function sanitizeHtmlInput(req, res, next) {
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeText(req.body[key], 10000);
      }
    });
  }

  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeText(req.query[key], 2000);
      }
    });
  }

  next();
}

module.exports = {
  sanitizeHtmlInput
};
