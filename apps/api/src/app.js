import 'dotenv/config';
import { env } from './config/env.js';
import express from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import { globalLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { prisma } from './config/db.js';
import { redis } from './config/redis.js';
import { createSocketServer } from './socket/socket.server.js';

// ─── ROUTERS ─────────────────────────────────────────────────────────────────
import authRouter from './modules/auth/auth.router.js';
import departmentRouter from './modules/department/department.router.js';
import queueRouter from './modules/queue/queue.router.js';
import predictionRouter from './modules/prediction/prediction.router.js';
import adminRouter from './modules/admin/admin.router.js';

// ─── JOBS ─────────────────────────────────────────────────────────────────────
import { scheduleNightlyRetrain } from './jobs/model-retrain.job.js';

// ─── EXPRESS APP ─────────────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);

// ─── SOCKET.IO ───────────────────────────────────────────────────────────────
const io = createSocketServer(httpServer);

// ─── SECURITY MIDDLEWARE ─────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", env.WEB_URL],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }),
);

app.use(
  cors({
    origin: env.ALLOWED_ORIGINS.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.disable('x-powered-by');
app.set('trust proxy', 1); // Trust first proxy for rate limiting by IP

// ─── BODY PARSING ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' })); // Prevent large payload attacks
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── GLOBAL RATE LIMITING ────────────────────────────────────────────────────
app.use(globalLimiter);

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/api/v1/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();

    res.json({
      status: 'ok',
      db: 'connected',
      redis: 'connected',
      ml: env.ML_SERVICE_URL,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: String(err) });
  }
});

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/departments', departmentRouter);
app.use('/api/v1/queue', queueRouter);
app.use('/api/v1/predictions', predictionRouter);
app.use('/api/v1/admin', adminRouter);

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'The requested endpoint does not exist',
  });
});

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
app.use(errorHandler);

// ─── START SERVER ─────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await redis.connect();
    logger.info('Connected to Redis');

    // Schedule nightly ML model retraining
    await scheduleNightlyRetrain().catch((err) =>
      logger.warn({ err: err.message }, 'Could not schedule nightly retrain (Redis may not be ready)'),
    );

    httpServer.listen(env.API_PORT, () => {
      logger.info(`🏥 Hospital Queue API running on port ${env.API_PORT}`);
      logger.info(`   Environment: ${env.NODE_ENV}`);
      logger.info(`   Health: http://localhost:${env.API_PORT}/api/v1/health`);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
const signals = ['SIGTERM', 'SIGINT'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`${signal} received, shutting down gracefully...`);
    await prisma.$disconnect();
    redis.quit();
    httpServer.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
});

bootstrap();

export { app, io };
