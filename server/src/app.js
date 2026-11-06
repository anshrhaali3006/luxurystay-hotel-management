import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import cookieParser from 'cookie-parser';

import api from './routes/api.js';
import { connectDB } from './config/db.js';
import {
  notFound,
  errorHandler,
} from './middleware/errorHandler.js';

const app = express();

const here = path.dirname(fileURLToPath(import.meta.url));

// Important for Vercel proxy.
app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use(helmet());

app.use(
  cors({
    origin: (process.env.CLIENT_URL || 'http://localhost:5173')
      .split(',')
      .map((x) => x.trim()),
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize());

// Keep this only if you still serve uploaded files from this directory.
// Persistent uploads should eventually use Cloudinary or another storage service.
app.use(
  '/uploads',
  express.static(path.resolve(here, '../uploads'), {
    fallthrough: false,
    maxAge: '1d',
  })
);

// Rate limits
app.use(
  '/api/auth/forgot-password',
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        message: 'Too many reset requests. Please try again in an hour.',
      },
    },
  })
);

app.use(
  '/api/auth/reset-password',
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        message: 'Too many attempts. Please try again later.',
      },
    },
  })
);

app.use(
  '/api/chat',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        message: 'You are sending messages too quickly. Please wait a moment.',
      },
    },
  })
);

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Health check does not require MongoDB.
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    time: new Date().toISOString(),
  });
});

// IMPORTANT: Connect to MongoDB before database-dependent API routes.
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database unavailable:', error.message);

    res.status(503).json({
      success: false,
      error: {
        message: 'Database connection failed. Please try again later.',
      },
    });
  }
});

// API routes
app.use('/api', api);

app.use(notFound);
app.use(errorHandler);

export default app;