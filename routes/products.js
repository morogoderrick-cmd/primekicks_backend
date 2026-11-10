'use strict';
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { requireAdmin, optionalCustomer } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/security');
const { Product } = require('../models');
const logger  = require('../utils/logger');

const router = express.Router();

/* helpers */
const ok  = (res, data, status = 200) => res.status(status).json({ success: true, ...data });
const err = (res, msg, status = 500) => res.status(status).json({ success: false, message: msg });

const validate = req => {
  const e = validationResult(req);
  return e.isEmpty() ? null : e.array();
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLIC ROUTES  (no auth required)
═══════════════════════════════════════════════════════════════════════════ */

/* GET /api/products — list all visible products */
router.get('/', async (req, res) => {
  try {
    const { category, search, sort = 'createdAt', order = 'desc' } = req.query;
    const filter = { hidden: false };

    if (category && category !== 'all') filter.category = category;
    if (search) filter.$text = { $search: search };

    const sortDir = order === 'asc' ? 1 : -1;
    const products = await Product.find(filter)
      .sort({ [sort]: sortDir })
      .lean();

    ok(res, { count: products.length, products });
  } catch (e) {
    logger.error('GET /products:', e);
    err(res, 'Could not fetch products.');
  }
});

/* GET /api/products/:id — single product */
router.get(
  '/:id',
  param('id').isMongoId().withMessage('Invalid product ID.'),
  async (req, res) => {
    const v = validate(req);
    if (v) return res.status(400).json({ success: false, errors: v });

    try {
      const product = await Product.findOne({ _id: req.params.id, hidden: false }).lean();
      if (!product) return err(res, 'Product not found.', 404);
      ok(res, { product });
    } catch (e) {
      logger.error('GET /products/:id:', e);
      err(res, 'Could not fetch product.');
    }
  }
);

/* ═══════════════════════════════════════════════════════════════════════════
   REVIEW ROUTE  (optional customer auth — saves userId if logged in)
═══════════════════════════════════════════════════════════════════════════ */

/* POST /api/products/:id/reviews */
router.post(
  '/:id/reviews',
  optionalCustomer,
  param('id').isMongoId(),
  [
    body('name').trim().notEmpty().isLength({ max: 60 }).withMessage('Name required (max 60).'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5.'),
    body('text').trim().notEmpty().isLength({ max: 800 }).withMessage('Review text required (max 800).'),
  ],
  async (req, res) => {
    const v = validate(req);
    if (v) return res.status(400).json({ success: false, errors: v });

    try {
      const product = await Product.findOne({ _id: req.params.id, hidden: false });
      if (!product) return err(res, 'Product not found.', 404);

      const review = {
        userId: req.user ? req.user.id : null,
        name:   req.body.name,
        rating: Number(req.body.rating),
        text:   req.body.text,
      };
      product.reviews.push(review);
      await product.save();
      ok(res, { review: product.reviews[product.reviews.length - 1] }, 201);
    } catch (e) {
      logger.error('POST review:', e);
      err(res, 'Could not save review.');
    }
  }
);

/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN ROUTES  (requireAdmin on all)
═══════════════════════════════════════════════════════════════════════════ */

/* GET /api/products/admin/all — includes hidden */
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    ok(res, { count: products.length, products });
  } catch (e) {
    logger.error('Admin GET all:', e);
    err(res, 'Could not fetch products.');
  }
});

/* POST /api/products — create product */
router.post(
  '/',
  requireAdmin,
  uploadLimiter,
  [
    body('name').trim().notEmpty().isLength({ max: 120 }).withMessage('Name required.'),
    body('category').isIn(['running','lifestyle','basketball','training','casual','trending','restocked'])
      .withMessage('Invalid category.'),
    body('price').isNumeric({ min: 0 }).withMessage('Valid price required.'),
    body('brand').optional().trim().isLength({ max: 80 }),
    body('badge').optional().isIn(['none','new','hot','sale','limited','bestseller']),
    body('sizes').optional().isArray(),
    body('desc').optional().trim().isLength({ max: 300 }),
    body('emoji').optional().trim().isLength({ max: 8 }),
    body('orig').optional().isNumeric(),
    body('images').optional().isArray(),
    body('hidden').optional().isBoolean(),
  ],
  async (req, res) => {
    const v = validate(req);
    if (v) return res.status(400).json({ success: false, errors: v });

    try {
      const product = await Product.create({
        name:     req.body.name,
        brand:    req.body.brand || 'Prime Kicks',
        category: req.body.category,
        badge:    req.body.badge || 'none',
        price:    Number(req.body.price),
        orig:     req.body.orig ? Number(req.body.orig) : null,
        sizes:    req.body.sizes || [],
        images:   req.body.images || [],
        emoji:    req.body.emoji || '👟',
        desc:     req.body.desc || '',
        hidden:   req.body.hidden === true || req.body.hidden === 'true',
      });

      logger.info(`Product created: "${product.name}" by ${req.admin.username}`);
      ok(res, { product }, 201);
    } catch (e) {
      logger.error('POST product:', e);
      err(res, 'Could not create product.');
    }
  }
);

/* PUT /api/products/:id — update product */
router.put(
  '/:id',
  requireAdmin,
  uploadLimiter,
  param('id').isMongoId(),
  [
    body('name').optional().trim().notEmpty().isLength({ max: 120 }),
    body('category').optional().isIn(['running','lifestyle','basketball','training','casual','trending','restocked']),
    body('price').optional().isNumeric({ min: 0 }),
    body('badge').optional().isIn(['none','new','hot','sale','limited','bestseller']),
    body('hidden').optional().isBoolean(),
  ],
  async (req, res) => {
    const v = validate(req);
    if (v) return res.status(400).json({ success: false, errors: v });

    const allowed = ['name','brand','category','badge','price','orig','sizes','images','emoji','desc','hidden'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    try {
      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { ...updates, updatedAt: new Date() },
        { new: true, runValidators: true }
      );
      if (!product) return err(res, 'Product not found.', 404);
      logger.info(`Product updated: "${product.name}" by ${req.admin.username}`);
      ok(res, { product });
    } catch (e) {
      logger.error('PUT product:', e);
      err(res, 'Could not update product.');
    }
  }
);

/* PATCH /api/products/:id/visibility — toggle hidden */
router.patch(
  '/:id/visibility',
  requireAdmin,
  param('id').isMongoId(),
  async (req, res) => {
    const v = validate(req);
    if (v) return res.status(400).json({ success: false, errors: v });

    try {
      const product = await Product.findById(req.params.id);
      if (!product) return err(res, 'Product not found.', 404);
      product.hidden = !product.hidden;
      await product.save();
      logger.info(`Product "${product.name}" → ${product.hidden ? 'hidden' : 'visible'} by ${req.admin.username}`);
      ok(res, { hidden: product.hidden, product });
    } catch (e) {
      logger.error('PATCH visibility:', e);
      err(res, 'Could not toggle visibility.');
    }
  }
);

/* DELETE /api/products/:id */
router.delete(
  '/:id',
  requireAdmin,
  param('id').isMongoId(),
  async (req, res) => {
    const v = validate(req);
    if (v) return res.status(400).json({ success: false, errors: v });

    try {
      const product = await Product.findByIdAndDelete(req.params.id);
      if (!product) return err(res, 'Product not found.', 404);
      logger.info(`Product deleted: "${product.name}" by ${req.admin.username}`);
      ok(res, { message: `"${product.name}" deleted.` });
    } catch (e) {
      logger.error('DELETE product:', e);
      err(res, 'Could not delete product.');
    }
  }
);

/* DELETE /api/products/:id/reviews/:rid — admin can remove a review */
router.delete(
  '/:id/reviews/:rid',
  requireAdmin,
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return err(res, 'Product not found.', 404);
      const before = product.reviews.length;
      product.reviews = product.reviews.filter(r => r._id.toString() !== req.params.rid);
      if (product.reviews.length === before) return err(res, 'Review not found.', 404);
      await product.save();
      ok(res, { message: 'Review deleted.' });
    } catch (e) {
      logger.error('DELETE review:', e);
      err(res, 'Could not delete review.');
    }
  }
);

module.exports = router;
