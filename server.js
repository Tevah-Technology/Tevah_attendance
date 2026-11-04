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
  const mongoUri = String(
    process.env.MONGODB_URI || ''
  ).trim();

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

  // Safe diagnostics only.
  // Never log password/full MongoDB URI.
  try {
    const parsed = new URL(mongoUri);

    console.log('[MONGO CONFIG]');
    console.log(
      'User:',
      decodeURIComponent(
        parsed.username || ''
      )
    );
    console.log(
      'Host:',
      parsed.hostname
    );
    console.log(
      'Database:',
      parsed.pathname.replace(
        /^\/+/,
        ''
      ) || '(default)'
    );
  } catch (_) {
    console.warn(
      '[MONGO CONFIG] Unable to parse URI for diagnostics'
    );
  }
}

// ============================================================
// DATABASE / APPLICATION INITIALIZATION
// ============================================================

let initializationPromise = null;

async function initializeApplication() {
  if (!initializationPromise) {
    initializationPromise =
      (async () => {
        validateEnvironment();

        await connectDatabase();

        await ensureBootstrapAdmin();

        return true;
      })()
        .catch((error) => {
          // Allow retry after transient DB/startup issue.
          initializationPromise = null;

          throw error;
        });
  }

  return initializationPromise;
}

// ============================================================
// CORS CONFIGURATION
// ============================================================

// Supports either:
//
// CORS_ORIGIN=origin1,origin2
//
// or
//
// CORS_ORIGINS=origin1,origin2
//
const configuredCorsOrigins = String(
  process.env.CORS_ORIGIN ||
  process.env.CORS_ORIGINS ||
  ''
)
  .split(',')
  .map(
    (origin) =>
      origin.trim()
  )
  .filter(Boolean);

// Remove trailing slash so:
//
// https://example.com
//
// and:
//
// https://example.com/
//
// don't cause accidental mismatch.
const allowedOrigins = [
  ...new Set(
    configuredCorsOrigins.map(
      (origin) =>
        origin.replace(
          /\/+$/,
          ''
        )
    )
  ),
];

function normalizeOrigin(origin) {
  return String(
    origin || ''
  )
    .trim()
    .replace(
      /\/+$/,
      ''
    );
}

function isAllowedOrigin(origin) {
  // curl/Postman/server-to-server requests often send no Origin.
  if (!origin) {
    return true;
  }

  const normalized =
    normalizeOrigin(origin);

  // Explicit configured frontend origins.
  if (
    allowedOrigins.includes(
      normalized
    )
  ) {
    return true;
  }

  // Development-only localhost.
  if (
    isDevelopment &&
    /^http:\/\/localhost:\d+$/.test(
      normalized
    )
  ) {
    return true;
  }

  // Development-only loopback.
  if (
    isDevelopment &&
    /^http:\/\/127\.0\.0\.1:\d+$/.test(
      normalized
    )
  ) {
    return true;
  }

  // Office LAN development.
  if (
    isDevelopment &&
    /^http:\/\/192\.168\.0\.\d+:\d+$/.test(
      normalized
    )
  ) {
    return true;
  }

  // Existing development hostname.
  if (
    isDevelopment &&
    /^http:\/\/ewre:\d+$/.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (
      isAllowedOrigin(origin)
    ) {
      return callback(
        null,
        true
      );
    }

    console.warn(
      '[CORS] Blocked origin:',
      origin
    );

    console.warn(
      '[CORS] Configured origins:',
      allowedOrigins
    );

    const error =
      new Error(
        `Origin not allowed by CORS: ${origin}`
      );

    error.status = 403;

    return callback(
      error
    );
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'ngrok-skip-browser-warning',
  ],

  exposedHeaders: [
    'Content-Type',
  ],

  optionsSuccessStatus: 204,
};

app.use(
  cors(
    corsOptions
  )
);

// Explicitly handle browser preflight.
app.options(
  '*',
  cors(
    corsOptions
  )
);

// ============================================================
// BODY PARSING
// ============================================================

app.use(
  express.json({
    limit: '5mb',
  })
);

app.use(
  express.urlencoded({
    extended: true,
  })
);

// ============================================================
// REQUEST LOGGING
// ============================================================

app.use(
  (req, res, next) => {
    const start =
      Date.now();

    res.on(
      'finish',
      () => {
        const duration =
          Date.now() -
          start;

        console.log(
          `[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`
        );
      }
    );

    next();
  }
);

// ============================================================
// INITIALIZE BEFORE API REQUESTS
// ============================================================

app.use(
  async (
    req,
    res,
    next
  ) => {
    try {
      await initializeApplication();

      next();
    } catch (error) {
      console.error(
        '[INITIALIZATION ERROR]',
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            'Backend initialization failed.',

          error:
            process.env.NODE_ENV ===
              'production'
              ? 'Database connection failed.'
              : (
                error.stack ||
                error.message
              ),
        });
    }
  }
);

// ============================================================
// PUBLIC HEALTH CHECK
// ============================================================

app.get(
  '/api/health',
  (req, res) => {
    res.json({
      success: true,

      name:
        'ZKTeco F28 Attendance Backend',

      version,

      database:
        'connected',

      runtime:
        isServerless
          ? 'serverless'
          : 'persistent',

      timestamp:
        new Date().toISOString(),
    });
  }
);

// ============================================================
// ROOT
// ============================================================

app.get(
  '/',
  authenticate,
  (req, res) => {
    res.json({
      success: true,

      name:
        'ZKTeco F28 Attendance Backend',

      version,

      runtime:
        isServerless
          ? 'serverless'
          : 'persistent',
    });
  }
);

// ============================================================
// API ROUTES
// ============================================================

app.use(
  '/api',
  routes
);

// ============================================================
// SSE / REAL-TIME BROADCASTER
// ============================================================

if (
  !isServerless &&
  typeof routes.attachBroadcaster ===
  'function'
) {
  routes.attachBroadcaster(
    app
  );
} else if (
  isServerless
) {
  console.log(
    '[SERVERLESS] Persistent SSE broadcaster is disabled. ' +
    'Run real-time ZKTeco listening on the office/persistent service.'
  );
}

// ============================================================
// 404 HANDLER
// ============================================================

app.use(
  (req, res) => {
    res
      .status(404)
      .json({
        success: false,

        message:
          'Route not found',

        method:
          req.method,

        path:
          req.originalUrl,
      });
  }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      '[SERVER ERROR]',
      err
    );

    if (
      res.headersSent
    ) {
      return next(
        err
      );
    }

    res
      .status(
        err.status ||
        500
      )
      .json({
        success: false,

        message:
          err.message ||
          'Internal server error',
      });
  }
);

// ============================================================
// START PERSISTENT SERVER
// ============================================================

async function bootstrap() {
  try {
    await initializeApplication();

    app.listen(
      port,
      host,
      () => {
        console.log('');
        console.log(
          '========================================'
        );
        console.log(
          'ZKTeco F28 Attendance Backend'
        );
        console.log(
          '========================================'
        );

        console.log(
          `Local URL: http://localhost:${port}`
        );

        console.log(
          `Listening on: ${host}:${port}`
        );

        console.log(
          `Environment: ${isDevelopment
            ? 'development'
            : 'production'
          }`
        );

        console.log(
          `Runtime: ${isServerless
            ? 'serverless'
            : 'persistent'
          }`
        );

        if (
          isDevelopment
        ) {
          console.log(
            'Development CORS: localhost, 127.0.0.1, 192.168.0.x, and ewre allowed'
          );
        }

        if (
          allowedOrigins.length >
          0
        ) {
          console.log(
            'Configured CORS origins:',
            allowedOrigins
          );
        } else {
          console.warn(
            'WARNING: No configured CORS origins found.'
          );
        }

        console.log(
          '========================================'
        );
        console.log('');
      }
    );

    startSchedulers();

  } catch (err) {
    console.error(
      'Startup failed:',
      err
    );

    process.exit(1);
  }
}

// ============================================================
// LOCAL/PERSISTENT RUNTIME
// ============================================================

if (
  !isServerless
) {
  bootstrap();
}

// ============================================================
// SERVERLESS EXPORT
// ============================================================

module.exports = app;