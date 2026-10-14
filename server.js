require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { connectDatabase } = require('./src/config/database');
const { startSchedulers } = require('./src/services/scheduler.service');
const { ensureBootstrapAdmin } = require('./src/services/auth.service');
const { authenticate } = require('./src/middleware/auth');
const routes = require('./src/routes');
const { version } = require('./package.json');

const app = express();

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const isDevelopment =
  String(process.env.NODE_ENV || 'development').toLowerCase() !== 'production';

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME
);

app.locals.sseClients = new Set();
app.disable('x-powered-by');

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================

function validateEnvironment() {
  const mongoUri = String(process.env.MONGODB_URI || '').trim();

  if (!mongoUri) {
    throw new Error(
      'MONGODB_URI is not configured. Set it to a value beginning with mongodb:// or mongodb+srv://.'
    );
  }

  if (
    !mongoUri.startsWith('mongodb://') &&
    !mongoUri.startsWith('mongodb+srv://')
  ) {
    throw new Error(
      'Invalid MONGODB_URI. The environment variable VALUE must begin with mongodb:// or mongodb+srv://. ' +
      'In hosting dashboards, enter only the URI as the value; do not prefix it with "MONGODB_URI=".'
    );
  }

  process.env.MONGODB_URI = mongoUri;

  // Safe Mongo diagnostics: username/host/database only.
  // Never log the password or the full connection string.
  try {
    const parsed = new URL(mongoUri);

    console.log('[MONGO CONFIG]');
    console.log('User:', decodeURIComponent(parsed.username || ''));
    console.log('Host:', parsed.hostname);
    console.log(
      'Database:',
      parsed.pathname.replace(/^\/+/, '') || '(default)'
    );
  } catch (_) {
    console.warn('[MONGO CONFIG] Unable to parse URI for diagnostics');
  }
}

// ============================================================
// DATABASE / APPLICATION INITIALIZATION
// ============================================================

let initializationPromise = null;

async function initializeApplication() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      validateEnvironment();

      await connectDatabase();
      await ensureBootstrapAdmin();

      return true;
    })().catch((error) => {
      // Permit a later request/invocation to retry after transient failure.
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

// ============================================================
// CORS CONFIGURATION
// ============================================================

const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // curl/Postman/server-to-server requests normally do not send Origin.
      if (!origin) {
        return callback(null, true);
      }

      const isLocalhostDevelopmentOrigin =
        isDevelopment &&
        (
          /^http:\/\/localhost:\d+$/.test(origin) ||
          /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
        );

      const isLanDevelopmentOrigin =
        isDevelopment &&
        /^http:\/\/192\.168\.0\.\d+:\d+$/.test(origin);

      const isHostnameDevelopmentOrigin =
        isDevelopment &&
        /^http:\/\/ewre:\d+$/.test(origin);

      const isConfiguredOrigin = allowedOrigins.includes(origin);

      if (
        isLocalhostDevelopmentOrigin ||
        isLanDevelopmentOrigin ||
        isHostnameDevelopmentOrigin ||
        isConfiguredOrigin
      ) {
        return callback(null, true);
      }

      console.warn('[CORS] Blocked origin:', origin);
      console.warn('[CORS] Configured origins:', allowedOrigins);

      const error = new Error(`Origin not allowed by CORS: ${origin}`);
      error.status = 403;
      return callback(error);
    },

    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// ============================================================
// BODY PARSING
// ============================================================

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// INITIALIZE BEFORE API REQUESTS
// ============================================================

app.use(async (req, res, next) => {
  try {
    await initializeApplication();
    next();
  } catch (error) {
    console.error('[INITIALIZATION ERROR]', error);

    res.status(500).json({
      success: false,
      message: 'Backend initialization failed.',
      error:
        process.env.NODE_ENV === 'production'
          ? 'Database connection failed.'
          : (error.stack || error.message)
    });
  }
});

// ============================================================
// PUBLIC HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    name: 'ZKTeco F28 Attendance Backend',
    version,
    database: 'connected',
    runtime: isServerless ? 'serverless' : 'persistent',
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// ROOT
// ============================================================

app.get('/', authenticate, (req, res) => {
  res.json({
    success: true,
    name: 'ZKTeco F28 Attendance Backend',
    version,
    runtime: isServerless ? 'serverless' : 'persistent'
  });
});

// ============================================================
// API ROUTES
// ============================================================

app.use('/api', routes);

// ============================================================
// SSE / REAL-TIME BROADCASTER
// ============================================================

if (!isServerless && typeof routes.attachBroadcaster === 'function') {
  routes.attachBroadcaster(app);
} else if (isServerless) {
  console.log(
    '[SERVERLESS] Persistent SSE broadcaster is disabled. ' +
    'Run real-time ZKTeco listening on the office/persistent service.'
  );
}

// ============================================================
// 404 HANDLER
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    method: req.method,
    path: req.originalUrl
  });
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// ============================================================
// START PERSISTENT SERVER
// ============================================================

async function bootstrap() {
  try {
    await initializeApplication();

    app.listen(port, host, () => {
      console.log('');
      console.log('========================================');
      console.log('ZKTeco F28 Attendance Backend');
      console.log('========================================');
      console.log(`Local URL: http://localhost:${port}`);
      console.log(`Listening on: ${host}:${port}`);
      console.log(`Environment: ${isDevelopment ? 'development' : 'production'}`);

      if (isDevelopment) {
        console.log(
          'CORS: localhost, 127.0.0.1, 192.168.0.x LAN, and ewre development origins allowed'
        );
      }

      if (allowedOrigins.length > 0) {
        console.log('Configured CORS origins:', allowedOrigins);
      }

      console.log('========================================');
      console.log('');
    });

    startSchedulers();
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}

if (!isServerless) {
  bootstrap();
}

module.exports = app;
