'use strict';
/**
 * middleware/rawBodyCapture.js
 * Captures the raw request body as a Buffer BEFORE JSON parsing.
 * Required for Cashfree webhook signature verification.
 *
 * Mount this BEFORE express.json() on the webhook route only.
 */
function rawBodyCapture(req, res, next) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks).toString('utf8');
    // Parse JSON manually so downstream code still has req.body
    if (req.rawBody) {
      try {
        req.body = JSON.parse(req.rawBody);
      } catch (_) {
        req.body = {};
      }
    }
    next();
  });
  req.on('error', next);
}

module.exports = rawBodyCapture;
