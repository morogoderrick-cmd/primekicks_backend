'use strict';
const jwt    = require('jsonwebtoken');
const logger = require('../utils/logger');

/* ── Verify admin JWT ────────────────────────────────────────────────────── */
function requireAdmin(req, res, next) {
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Admin token required.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access only.' });
    }
    req.admin = decoded; // { role, username, iat, exp }
    next();
  } catch (err) {
    logger.warn(`Invalid admin token from ${req.ip}: ${err.message}`);
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

/* ── Verify customer JWT ─────────────────────────────────────────────────── */
function requireCustomer(req, res, next) {
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Login required.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    req.user = decoded; // { role, id, iat, exp }
    next();
  } catch (err) {
    logger.warn(`Invalid customer token from ${req.ip}: ${err.message}`);
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

/* ── Optional customer auth — attaches user if token valid ──────────────── */
function optionalCustomer(req, _res, next) {
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role === 'customer') req.user = decoded;
    } catch (_) { /* ignore bad token — request continues unauthenticated */ }
  }
  next();
}

module.exports = { requireAdmin, requireCustomer, optionalCustomer };
