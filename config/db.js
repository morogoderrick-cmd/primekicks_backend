'use strict';
const mongoose = require('mongoose');
const logger   = require('../utils/logger');

async function connectDB() {
  const opts = {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 10,
    minPoolSize: 2,
  };

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, opts);
    logger.info(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`❌ MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected — retrying in 5s...');
    setTimeout(connectDB, 5_000);
  });

  mongoose.connection.on('error', err => {
    logger.error(`MongoDB runtime error: ${err.message}`);
  });
}

module.exports = connectDB;
