'use strict';
const multer = require('multer');
const sharp  = require('sharp');
const logger = require('../utils/logger');

const MAX_MB     = parseInt(process.env.MAX_FILE_SIZE_MB)       || 5;
const MAX_IMAGES = parseInt(process.env.MAX_IMAGES_PER_PRODUCT) || 6;

/* Store in memory so sharp can process before saving */
const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  const allowed = /^image\/(jpeg|jpg|png|webp|gif)$/;
  if (allowed.test(file.mimetype)) return cb(null, true);
  cb(new Error(`Unsupported file type: ${file.mimetype}. Only JPEG, PNG, WebP and GIF allowed.`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_MB * 1024 * 1024,
    files: MAX_IMAGES,
  },
});

/**
 * Process uploaded product images through sharp:
 * - Resize to max 800x800 (preserves aspect ratio)
 * - Convert to WebP (smaller file size, good quality)
 * - Strip EXIF metadata (privacy)
 * - Return as base64 data URIs
 */
async function processImages(files = []) {
  const results = [];
  for (const file of files) {
    try {
      const buf = await sharp(file.buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      results.push(`data:image/webp;base64,${buf.toString('base64')}`);
    } catch (e) {
      logger.error(`Image processing failed for "${file.originalname}": ${e.message}`);
      // Skip corrupt files rather than crashing
    }
  }
  return results;
}

/**
 * Process a single small image (logo, QR code):
 */
async function processSingleImage(file, maxW = 400, maxH = 400) {
  const buf = await sharp(file.buffer)
    .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

module.exports = { upload, processImages, processSingleImage, MAX_IMAGES };
