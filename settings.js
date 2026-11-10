'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');
const { Settings } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

const ok  = (res, data)       => res.json({ success: true, ...data });
const err = (res, msg, s=500) => res.status(s).json({ success: false, message: msg });

/* Ensure the singleton settings doc exists */
async function getSettings() {
  let s = await Settings.findById('global');
  if (!s) s = await Settings.create({ _id: 'global' });
  return s;
}

/* ── GET /api/settings  (public — storefront reads this) ─────────────────── */
router.get('/', async (_req, res) => {
  try {
    const s = await getSettings();
    // Never expose whatsappGroupLink to public — only the QR and join button
    const pub = s.toObject();
    delete pub.whatsappGroupLink;
    ok(res, { settings: pub });
  } catch (e) {
    logger.error('GET settings:', e);
    err(res, 'Could not load settings.');
  }
});

/* ── GET /api/settings/admin  (full settings including group link) ────────── */
router.get('/admin', requireAdmin, async (_req, res) => {
  try {
    const s = await getSettings();
    ok(res, { settings: s });
  } catch (e) {
    logger.error('GET admin settings:', e);
    err(res, 'Could not load settings.');
  }
});

/* ── PATCH /api/settings/drop-alert ─────────────────────────────────────── */
router.patch(
  '/drop-alert',
  requireAdmin,
  [
    body('active').isBoolean(),
    body('day').optional().trim().isLength({ max: 20 }),
    body('customText').optional().trim().isLength({ max: 200 }),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });
    try {
      const s = await getSettings();
      s.dropAlert = {
        active:     req.body.active,
        day:        req.body.day        || s.dropAlert.day,
        customText: req.body.customText ?? s.dropAlert.customText,
      };
      await s.save();
      logger.info(`Drop alert updated by ${req.admin.username}`);
      ok(res, { dropAlert: s.dropAlert });
    } catch (e) {
      logger.error('PATCH drop-alert:', e);
      err(res, 'Could not save drop alert.');
    }
  }
);

/* ── PATCH /api/settings/logo ────────────────────────────────────────────── */
router.patch(
  '/logo',
  requireAdmin,
  [body('logo').notEmpty().withMessage('Logo data required.')],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });
    try {
      const s = await getSettings();
      s.logo = req.body.logo; // base64 data URI sent from admin panel
      await s.save();
      logger.info(`Logo updated by ${req.admin.username}`);
      ok(res, { message: 'Logo saved.' });
    } catch (e) {
      logger.error('PATCH logo:', e);
      err(res, 'Could not save logo.');
    }
  }
);

/* ── PATCH /api/settings/about ───────────────────────────────────────────── */
router.patch(
  '/about',
  requireAdmin,
  [
    body('vision').optional().trim().isLength({ max: 500 }),
    body('mission').optional().trim().isLength({ max: 500 }),
    body('goal').optional().trim().isLength({ max: 500 }),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });
    try {
      const s = await getSettings();
      if (req.body.vision  !== undefined) s.vision  = req.body.vision;
      if (req.body.mission !== undefined) s.mission = req.body.mission;
      if (req.body.goal    !== undefined) s.goal    = req.body.goal;
      await s.save();
      logger.info(`About updated by ${req.admin.username}`);
      ok(res, { message: 'About saved.' });
    } catch (e) {
      logger.error('PATCH about:', e);
      err(res, 'Could not save about.');
    }
  }
);

/* ── PATCH /api/settings/social ──────────────────────────────────────────── */
router.patch(
  '/social',
  requireAdmin,
  [
    body('phone').optional().trim().isLength({ max: 20 }),
    body('facebook').optional().trim().isURL().withMessage('Invalid Facebook URL.'),
    body('instagram').optional().trim().isURL().withMessage('Invalid Instagram URL.'),
    body('tiktok').optional().trim().isURL().withMessage('Invalid TikTok URL.'),
    body('youtube').optional().trim().isURL().withMessage('Invalid YouTube URL.'),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });
    try {
      const s = await getSettings();
      ['phone','facebook','instagram','tiktok','youtube'].forEach(k => {
        if (req.body[k] !== undefined) s[k] = req.body[k];
      });
      await s.save();
      logger.info(`Social links updated by ${req.admin.username}`);
      ok(res, { message: 'Social links saved.' });
    } catch (e) {
      logger.error('PATCH social:', e);
      err(res, 'Could not save social links.');
    }
  }
);

/* ── PATCH /api/settings/whatsapp ────────────────────────────────────────── */
router.patch(
  '/whatsapp',
  requireAdmin,
  [
    body('whatsappNumber').optional().trim().isLength({ max: 20 }),
    body('whatsappGroupLink').optional().trim().isURL().withMessage('Invalid group link URL.'),
    body('whatsappQr').optional().trim(),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });
    try {
      const s = await getSettings();
      if (req.body.whatsappNumber    !== undefined) s.whatsappNumber    = req.body.whatsappNumber;
      if (req.body.whatsappGroupLink !== undefined) s.whatsappGroupLink = req.body.whatsappGroupLink;
      if (req.body.whatsappQr        !== undefined) s.whatsappQr        = req.body.whatsappQr;
      await s.save();
      logger.info(`WhatsApp settings updated by ${req.admin.username}`);
      ok(res, { message: 'WhatsApp settings saved.' });
    } catch (e) {
      logger.error('PATCH whatsapp:', e);
      err(res, 'Could not save WhatsApp settings.');
    }
  }
);

/* ── PATCH /api/settings/location ────────────────────────────────────────── */
router.patch(
  '/location',
  requireAdmin,
  [
    body('locAddress').optional().trim().isLength({ max: 200 }),
    body('locHours').optional().trim().isLength({ max: 100 }),
    body('locPhone').optional().trim().isLength({ max: 20 }),
    body('mapEmbed').optional().trim(),
    body('directionsLink').optional().trim(),
  ],
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, errors: errs.array() });
    try {
      const s = await getSettings();
      ['locAddress','locHours','locPhone','mapEmbed','directionsLink'].forEach(k => {
        if (req.body[k] !== undefined) s[k] = req.body[k];
      });
      await s.save();
      logger.info(`Location updated by ${req.admin.username}`);
      ok(res, { message: 'Location saved.' });
    } catch (e) {
      logger.error('PATCH location:', e);
      err(res, 'Could not save location.');
    }
  }
);

module.exports = router;
