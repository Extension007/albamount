const csrf = require('csurf');
const { csrfCookieOptions } = require('./csrf');
const { httpError } = require('../utils/httpError');

// Custom CSRF middleware for API endpoints
// This middleware accepts CSRF token from either:
// 1. X-CSRF-Token header (for API requests)
// 2. csrf-token header (alternative)
// 3. Cookie (standard csurf behavior)

function apiCsrfProtection() {
  // Create standard CSRF protection
  const csrfProtection = csrf({ cookie: csrfCookieOptions() });

  return function(req, res, next) {
    // For API requests, allow token from X-CSRF-Token header
    if (req.headers['x-csrf-token']) {
      req.headers['csrf-token'] = req.headers['x-csrf-token'];
    } else if (req.headers['csrf-token']) {
      // Already set, no change needed
    }
    // If neither header is present, csurf will use cookie token

    // Apply standard CSRF protection
    csrfProtection(req, res, (err) => {
      if (err) {
        if (err.code === 'EBADCSRFTOKEN') {
          // Custom error handling for API
          return res.status(403).json({
            success: false,
            error: 'InvalidCSRF',
            message: 'CSRF token invalid or missing'
          });
        }
        return next(err);
      }
      next();
    });
  };
}

module.exports = { apiCsrfProtection };
