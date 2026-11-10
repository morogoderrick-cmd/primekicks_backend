'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { authLimiter } = require('../middleware/security');
const { requireAdmin } = require('../middleware/auth');
const logger   = require('../utils/logger');

const router = express.Router();

/* ─────────────────────────────────────────────────────────────
   Build the 4-admin list from .env at startup.
   Passwords are bcrypt-hashed once so they never sit in memory
   as plaintext after boot.
───────────────────────────────────────────────────────────── */
let ADMINS = []; // [{ username, hash }]

async function initAdmins() {
  const raw = [
    { u: process.env.ADMIN_1_USER, p: process.env.ADMIN_1_PASS },
    { u: process.env.ADMIN_2_USER, p: process.env.ADMIN_2_PASS },
    { u: process.env.ADMIN_3_USER, p: process.env.ADMIN_3_PASS },
    { u: process.env.ADMIN_4_USER, p: process.env.ADMIN_4_PASS },
  ].filter(a => a.u && a.p); // skip any empty slots

  if (!raw.length) {
    logger.error('No admin accounts found in .env! Set ADMIN_1_USER / ADMIN_1_PASS etc.');
    process.exit(1);
  }

  ADMINS = await Promise.all(
    raw.map(async a => ({
      username: a.u.trim(),
      hash: await bcrypt.hash(a.p.trim(), 12),
    }))
  );

  logger.info(`Admin accounts ready: ${ADMINS.map(a => a.username).join(', ')}`);
}

/* ── POST /api/admin/login ───────────────────────────────────────────────── */
router.post(
  '/login',
  authLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username required.'),
    body('password').notEmpty().withMessage('Password required.'),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });

    const { username, password } = req.body;
    const admin = ADMINS.find(a => a.username === username.trim());

    /* Always run bcrypt to prevent timing-based username enumeration */
    const fakeHash = '$2b$12$abcdefghijklmnopqrstuvuXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const valid = await bcrypt.compare(password, admin ? admin.hash : fakeHash);

    if (!admin || !valid) {
      logger.warn(`Admin login failed: "${username}" from ${req.ip}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { role: 'admin', username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    logger.info(`Admin login OK: ${admin.username} from ${req.ip}`);
    res.json({
      success: true,
      token,
      admin: { username: admin.username },
      expiresIn: '8h',
    });
  }
);

/* ── GET /api/admin/me ───────────────────────────────────────────────────── */
router.get('/me', requireAdmin, (req, res) => {
  res.json({ success: true, admin: { username: req.admin.username } });
});

/* ── POST /api/admin/logout ──────────────────────────────────────────────── */
// JWT is stateless — client discards token. Endpoint is UX-only.
router.post('/logout', requireAdmin, (req, res) => {
  logger.info(`Admin logout: ${req.admin.username}`);
  res.json({ success: true, message: 'Logged out.' });
});

module.exports = { router, initAdmins };
