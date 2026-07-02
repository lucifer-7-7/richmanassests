'use strict';
/**
 * middleware/rateLimiter.js
 * Rate limiting presets for different route categories.
 */
const rateLimit = require('express-rate-limit');

const handler = (req, res) => {
  if (req.accepts('json')) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please slow down.' });
  }
  res.status(429).send('Too many requests. Please try again later.');
};

/** Strict limiter for auth endpoints (login, register) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip: () => process.env.NODE_ENV !== 'production',
});

/** Moderate limiter for payment creation */
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip: () => process.env.NODE_ENV !== 'production',
});

/** General API limiter */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

module.exports = { authLimiter, paymentLimiter, apiLimiter };
