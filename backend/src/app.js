import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import * as eventBus from './events/eventBus.js';
import * as notifyHandler from './events/handlers/notifyHandler.js';
import * as linkAuditHandler from './events/handlers/linkAuditHandler.js';
import * as linkResolver from './events/handlers/linkResolver.js';
import { initScheduler } from './modules/reports/scheduler.js';
import { ipAllowlistMiddleware, csrfDoubleSubmitMiddleware } from './middleware/security.middleware.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { getActsSectionsRegistry } from './modules/fields/fields.service.js';

// Import routers
import authRouter from './modules/auth/auth.router.js';
import fieldsRouter from './modules/fields/fields.router.js';
import recordsRouter from './modules/records/records.router.js';
import workflowRouter from './modules/workflow/workflow.router.js';
import analyticsRouter from './modules/analytics/analytics.router.js';
import reportsRouter from './modules/reports/reports.router.js';
import importRouter from './modules/import/import.router.js';
import usersRouter from './modules/users/users.router.js';
import hierarchyRouter from './modules/hierarchy/hierarchy.router.js';
import adminRouter from './modules/admin/admin.router.js';
import auditRouter from './modules/audit/audit.router.js';
import compilationRouter from './modules/compilation/compilation.routes.js';
import legacyRouter from './modules/legacy/legacy.router.js';
import levelContractsRouter from './modules/level-contracts/levelContracts.router.js';
import filtersRouter from './modules/filters/filters.router.js';
import notificationsRouter from './modules/notifications/notifications.routes.js';
import dailyDiaryRouter from './modules/daily-diary/daily-diary.router.js';
import warehouseRouter from './modules/warehouse/warehouse.router.js';
import recordLinksRouter from './modules/record-links/record-links.router.js';
import ioRouter from './modules/io/io.router.js';



const app = express();

// Base middleware
app.use(helmet());
const isDevMode = env.NODE_ENV === 'development';
app.use(cors({
  origin: (origin, callback) => {
    // In development allow any localhost/127.0.0.1 port; in prod use explicit allowlist
    if (!origin || isDevMode && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (origin === env.FRONTEND_URL) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(ipAllowlistMiddleware);
app.use(csrfDoubleSubmitMiddleware);
app.use(morgan('dev'));

// Rate limiting
const isDevOrTest = env.NODE_ENV === 'development' || env.NODE_ENV === 'test' || process.env.PHAROS_TEST === 'true';
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevOrTest ? 99999 : 100,
  message: { status: 'error', code: 'RATE_LIMITED', message: 'Too many requests' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevOrTest ? 99999 : 50,
  message: { status: 'error', code: 'RATE_LIMITED', message: 'Too many requests' }
});
app.use('/api/', apiLimiter);
app.use('/api/v1/auth', authLimiter);

// Bind API Routes (Dual Registration for compatibility)
app.use('/api/v1/auth', authRouter);
app.use('/api/auth', authRouter);

app.get('/api/acts-sections', authMiddleware, async (req, res) => {
  try {
    const data = await getActsSectionsRegistry();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to fetch acts-sections registry', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.use('/api/v1/fields', fieldsRouter);
app.use('/api/fields', fieldsRouter);

app.use('/api/v1/records', recordsRouter);
app.use('/api/records', recordsRouter);

app.use('/api/v1/workflow', workflowRouter);
app.use('/api/workflow', workflowRouter);

app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/analytics', analyticsRouter);

app.use('/api/v1/compilations', compilationRouter);
app.use('/api/compilations', compilationRouter);

app.use('/api/v1/reports', reportsRouter);
app.use('/api/reports', reportsRouter);

app.use('/api/v1/import', importRouter);
app.use('/api/import', importRouter);

app.use('/api/v1/admin/users', usersRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/users', usersRouter);

app.use('/api/v1/admin/hierarchy', hierarchyRouter);
app.use('/api/v1/hierarchy', hierarchyRouter);
app.use('/api/hierarchy', hierarchyRouter);

app.use('/api/v1/investigating-officers', ioRouter);
app.use('/api/investigating-officers', ioRouter);

app.use('/api/v1/admin', adminRouter);
app.use('/api/admin', adminRouter);

app.use('/api/v1/audit', auditRouter);
app.use('/api/audit', auditRouter);

app.use('/api/v1/legacy', legacyRouter);
app.use('/api/legacy', legacyRouter);

app.use('/api/v1/level-contracts', levelContractsRouter);
app.use('/api/level-contracts', levelContractsRouter);

app.use('/api/v1/filters', filtersRouter);
app.use('/api/filters', filtersRouter);

app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/notifications', notificationsRouter);

app.use('/api/v1/daily-diary', dailyDiaryRouter);
app.use('/api/daily-diary', dailyDiaryRouter);

app.use('/api/v1/warehouse', warehouseRouter);
app.use('/api/warehouse', warehouseRouter);

app.use('/api/v1/record-links', recordLinksRouter);
app.use('/api/record-links',    recordLinksRouter);



// Health check
app.get('/api/v1/health', (req, res) => {
  return res.status(200).json({ success: true, message: 'PHAROS Backend Operational API online' });
});
app.get('/api/health', (req, res) => {
  return res.status(200).json({ success: true, message: 'PHAROS Backend Operational API online' });
});

// 404 Route Not Found handler
app.use((req, res, next) => {
  return res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('[AppError] Caught global error:', err.stack || err.message);
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const startServer = async () => {
  // Connect Event Broker
  await eventBus.connect();

  // Start background handlers
  await notifyHandler.init();
  await linkAuditHandler.init();
  await linkResolver.init();
  await initScheduler();

  app.listen(env.PORT, () => {
    logger.info('===================================================');
    logger.info(`  PHAROS API Server listening on port ${env.PORT}`);
    logger.info(`  Mode: ${env.NODE_ENV}`);
    logger.info('===================================================');
  });
};

if (process.env.PHAROS_TEST !== 'true' && process.argv[1] && (process.argv[1].endsWith('app.js') || process.argv[1].endsWith('app'))) {
  startServer().catch(err => {
    logger.error('[App] Failed to start server:', err.message);
    process.exit(1);
  });
}
export default app;
