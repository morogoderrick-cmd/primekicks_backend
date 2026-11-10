'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { authLimiter } = require('../middleware/security');
const { requireCustomer } = require('../middleware/auth');
const { User } = require('../models');
const logger  = require('../utils/logger');

const router = express.Router();

const signToken = id =>
  jwt.sign(
    { role: 'customer', id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

/* ── POST /api/auth/register ─────────────────────────────────────────────── */
router.post(
  '/register',
  authLimiter,
  [
    body('firstName').trim().notEmpty().isLength({ max: 50 }).withMessage('First name required.'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 characters.'),
    body('lastName').optional().trim().isLength({ max: 50 }),
    body('phone').optional().trim().isLength({ max: 20 }),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });

    const { firstName, lastName = '', email, password, phone = '' } = req.body;

    try {
      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
      }

      const hash = await bcrypt.hash(password, 12);
      const user = await User.create({ firstName, lastName, email, phone, password: hash });

      logger.info(`New customer: ${email}`);
      res.status(201).json({
        success: true,
        token: signToken(user._id),
        user: { id: user._id, firstName, lastName, email },
      });
    } catch (err) {
      logger.error('Register error:', err);
      res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
    }
  }
);

/* ── POST /api/auth/login ────────────────────────────────────────────────── */
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
    body('password').notEmpty().withMessage('Password required.'),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });

    const { email, password } = req.body;

    try {
      // .select('+password') — password field is excluded by default (select:false in schema)
      const user = await User.findOne({ email }).select('+password');

      const fakeHash = '$2b$12$abcdefghijklmnopqrstuvuXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const valid = await bcrypt.compare(password, user ? user.password : fakeHash);

      if (!user || !valid) {
        logger.warn(`Customer login failed: ${email} from ${req.ip}`);
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
      }

      user.lastLogin = new Date();
      await user.save();

      logger.info(`Customer login: ${email}`);
      res.json({
        success: true,
        token: signToken(user._id),
        user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email },
      });
    } catch (err) {
      logger.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
    }
  }
);

/* ── GET /api/auth/me ────────────────────────────────────────────────────── */
router.get('/me', requireCustomer, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) {
    logger.error('Get /me error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch profile.' });
  }
});

/* ── PATCH /api/auth/me ──────────────────────────────────────────────────── */
router.patch(
  '/me',
  requireCustomer,
  [
    body('firstName').optional().trim().isLength({ min: 1, max: 50 }),
    body('lastName').optional().trim().isLength({ max: 50 }),
    body('phone').optional().trim().isLength({ max: 20 }),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });

    const fields = ['firstName', 'lastName', 'phone'];
    const updates = {};
    fields.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    try {
      const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
      res.json({ success: true, user });
    } catch (err) {
      logger.error('PATCH /me error:', err);
      res.status(500).json({ success: false, message: 'Update failed.' });
    }
  }
);

/* ── POST /api/auth/change-password ─────────────────────────────────────── */
router.post(
  '/change-password',
  requireCustomer,
  [
    body('currentPassword').notEmpty().withMessage('Current password required.'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password min 6 characters.'),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });

    try {
      const user = await User.findById(req.user.id).select('+password');
      const valid = await bcrypt.compare(req.body.currentPassword, user.password);
      if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

      user.password = await bcrypt.hash(req.body.newPassword, 12);
      await user.save();
      res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
      logger.error('Change-password error:', err);
      res.status(500).json({ success: false, message: 'Password change failed.' });
    }
  }
);

/* ── POST /api/auth/order ────────────────────────────────────────────────── */
// Called after a customer sends a WhatsApp order, to track it on their profile
router.post(
  '/order',
  requireCustomer,
  [
    body('name').trim().notEmpty().withMessage('Product name required.'),
    body('price').isNumeric().withMessage('Price must be a number.'),
    body('size').optional().trim(),
    body('productId').optional().trim(),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });

    const { name, price, size = '', productId = null } = req.body;

    try {
      const user = await User.findById(req.user.id);
      user.orders.push({ productId, name, price, size, date: new Date() });
      await user.save();
      res.json({ success: true, message: 'Order recorded.', orderCount: user.orders.length });
    } catch (err) {
      logger.error('Record order error:', err);
      res.status(500).json({ success: false, message: 'Could not record order.' });
    }
  }
);

module.exports = router;
