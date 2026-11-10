'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

/* ─────────────────────────────────────────────────────────────
   REVIEW  (embedded in Product)
───────────────────────────────────────────────────────────── */
const ReviewSchema = new Schema({
  userId:    { type: String, default: null },        // customer _id or null
  name:      { type: String, required: true, trim: true, maxlength: 60 },
  rating:    { type: Number, required: true, min: 1, max: 5 },
  text:      { type: String, required: true, trim: true, maxlength: 800 },
  createdAt: { type: Date, default: Date.now },
});

/* ─────────────────────────────────────────────────────────────
   PRODUCT
───────────────────────────────────────────────────────────── */
const ProductSchema = new Schema(
  {
    name:     { type: String, required: true, trim: true, maxlength: 120 },
    brand:    { type: String, default: 'Prime Kicks', trim: true, maxlength: 80 },
    category: {
      type: String,
      required: true,
      enum: ['running', 'lifestyle', 'basketball', 'training', 'casual', 'trending', 'restocked'],
    },
    badge:  { type: String, enum: ['none', 'new', 'hot', 'sale', 'limited', 'bestseller'], default: 'none' },
    price:  { type: Number, required: true, min: 0 },
    orig:   { type: Number, default: null },          // crossed-out original price
    sizes:  [{ type: String, trim: true }],
    images: [{ type: String }],                       // base64 data URIs or URLs
    emoji:  { type: String, default: '👟', maxlength: 8 },
    desc:   { type: String, default: '', trim: true, maxlength: 300 },
    hidden: { type: Boolean, default: false },
    reviews: [ReviewSchema],
  },
  { timestamps: true }
);

ProductSchema.index({ category: 1, hidden: 1 });
ProductSchema.index({ name: 'text', brand: 'text', desc: 'text' });

/* ─────────────────────────────────────────────────────────────
   SETTINGS  (single document, _id = 'global')
───────────────────────────────────────────────────────────── */
const SettingsSchema = new Schema(
  {
    _id: { type: String, default: 'global' },

    // Branding
    logo: { type: String, default: '' },

    // Drop alert banner
    dropAlert: {
      active:     { type: Boolean, default: false },
      day:        { type: String,  default: 'Monday' },
      customText: { type: String,  default: '' },
    },

    // Vision / Mission
    vision:  { type: String, default: '' },
    mission: { type: String, default: '' },
    goal:    { type: String, default: '' },

    // Social links
    phone:     { type: String, default: '' },
    facebook:  { type: String, default: '' },
    instagram: { type: String, default: '' },
    tiktok:    { type: String, default: '' },
    youtube:   { type: String, default: '' },

    // WhatsApp
    whatsappNumber:    { type: String, default: '' },
    whatsappGroupLink: { type: String, default: '' },
    whatsappQr:        { type: String, default: '' }, // base64

    // Location
    locAddress:     { type: String, default: 'Ziwa, Eldoret, Kenya' },
    locHours:       { type: String, default: 'Mon – Sat: 9:00 AM – 7:00 PM' },
    locPhone:       { type: String, default: '' },
    mapEmbed:       { type: String, default: '' },
    directionsLink: { type: String, default: '' },

    // Theme preference
    theme: { type: String, default: 'dark', enum: ['dark', 'light'] },
  },
  { _id: false, timestamps: true }
);

/* ─────────────────────────────────────────────────────────────
   CUSTOMER USER
───────────────────────────────────────────────────────────── */
const OrderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
  name:      { type: String },
  size:      { type: String },
  price:     { type: Number },
  date:      { type: Date, default: Date.now },
});

const UserSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName:  { type: String, default: '', trim: true, maxlength: 50 },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true }, // unique:true creates the index
    phone:     { type: String, default: '', trim: true, maxlength: 20 },
    password:  { type: String, required: true, select: false }, // bcrypt hash, never returned by default
    orders:    [OrderItemSchema],
    isActive:  { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true }
);

/* ─────────────────────────────────────────────────────────────
   EXPORTS
───────────────────────────────────────────────────────────── */
module.exports = {
  Product:  mongoose.model('Product',  ProductSchema),
  Settings: mongoose.model('Settings', SettingsSchema),
  User:     mongoose.model('User',     UserSchema),
};
