'use strict';
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp           = require('hpp');
const compression   = require('compression');
const logger        = require('../utils/logger');

/* ── Helmet — security HTTP headers ─────────────────────────────────────── */
const helmetMW = helmet({
  contentSecurityPolicy: false,       // disabled — HTML files use inline scripts
  crossOriginEmbedderPolicy: false,   // allow Google Maps embeds
});

/* ── General API rate limiter ────────────────────────────────────────────── */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  handler(req, res, _next, options) {
    logger.warn(`Rate limit: ${req.ip} → ${req.path}`);
    res.status(429).json(options.message);
  },
});

/* ── Strict limiter for login/register ──────────────────────────────────── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  handler(req, res, _next, options) {
    logger.warn(`Auth brute-force attempt: ${req.ip} → ${req.path}`);
    res.status(429).json(options.message);
  },
});

/* ── Upload limiter ──────────────────────────────────────────────────────── */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Upload rate limit exceeded.' },
});

/* ── MongoDB injection sanitiser ─────────────────────────────────────────── */
const sanitizeMW = mongoSanitize({ replaceWith: '_' });

/* ── HTTP Parameter Pollution guard ──────────────────────────────────────── */
const hppMW = hpp();

/* ── Gzip compression ────────────────────────────────────────────────────── */
const compressMW = compression({ threshold: 1024 });

module.exports = {
  helmetMW,
  apiLimiter,
  authLimiter,
  uploadLimiter,
  sanitizeMW,
  hppMW,
  compressMW,
};
