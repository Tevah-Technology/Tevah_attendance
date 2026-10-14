// require('dotenv').config();

// const express = require('express');
// const cors = require('cors');

// const { connectDatabase } = require('./src/config/database');
// const { startSchedulers } = require('./src/services/scheduler.service');
// const { ensureBootstrapAdmin } = require('./src/services/auth.service');
// const { authenticate } = require('./src/middleware/auth');
// const routes = require('./src/routes');
// const { version } = require('./package.json');

// const app = express();

// const port = Number(process.env.PORT || 3000);
// const host = process.env.HOST || '0.0.0.0';

// const isDevelopment =
//   String(process.env.NODE_ENV || 'development').toLowerCase() !== 'production';

// app.locals.sseClients = new Set();

// app.disable('x-powered-by');

// // ============================================================
// // CORS
// // ============================================================

// const allowedOrigins = String(process.env.CORS_ORIGIN || '')
//   .split(',')
//   .map((origin) => origin.trim())
//   .filter(Boolean);

// app.use(
//   cors({
//     origin(origin, callback) {
//       /*
//        * Requests from:
//        * - Postman
//        * - curl
//        * - server-to-server clients
//        *
//        * usually don't send an Origin header.
//        */
//       if (!origin) {
//         return callback(null, true);
//       }

//       /*
//        * Flutter Web running through Chrome usually starts
//        * using a random localhost port, for example:
//        *
//        * http://localhost:59213
//        * http://localhost:63142
//        *
//        * Allow those automatically only in development.
//        */
//       const isLocalhostDevelopmentOrigin =
//         isDevelopment &&
//         (
//           /^http:\/\/localhost:\d+$/.test(origin) ||
//           /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
//         );

//       /*
//        * Allow explicitly configured origins from .env
//        */
//       const isConfiguredOrigin =
//         allowedOrigins.includes(origin);

//       if (
//         isLocalhostDevelopmentOrigin ||
//         isConfiguredOrigin
//       ) {
//         return callback(null, true);
//       }

//       console.warn(
//         `[CORS] Blocked origin: ${origin}`
//       );

//       console.warn(
//         '[CORS] Allowed origins:',
//         allowedOrigins
//       );

//       const error = new Error(
//         `Origin not allowed by CORS: ${origin}`
//       );

//       error.status = 403;

//       return callback(error);
//     },

//     credentials: true,

//     methods: [
//       'GET',
//       'POST',
//       'PUT',
//       'PATCH',
//       'DELETE',
//       'OPTIONS'
//     ],

//     allowedHeaders: [
//       'Content-Type',
//       'Authorization'
//     ]
//   })
// );

// // Explicitly support preflight requests
// app.options('*', cors());

// // ============================================================
// // BODY PARSING
// // ============================================================

// app.use(
//   express.json({
//     limit: '5mb'
//   })
// );

// app.use(
//   express.urlencoded({
//     extended: true
//   })
// );

// // ============================================================
// // PUBLIC HEALTH CHECK
// // ============================================================

// app.get('/api/health', (req, res) => {
//   res.json({
//     success: true,
//     name: 'ZKTeco F28 Attendance Backend',
//     version,
//     database: 'connected',
//     timestamp: new Date().toISOString()
//   });
// });

// // ============================================================
// // ROOT
// // ============================================================

// app.get('/', authenticate, (req, res) => {
//   res.json({
//     success: true,
//     name: 'ZKTeco F28 Attendance Backend',
//     version
//   });
// });

// // ============================================================
// // API ROUTES
// // ============================================================

// app.use('/api', routes);

// // ============================================================
// // SSE / REAL-TIME BROADCASTER
// // ============================================================

// if (typeof routes.attachBroadcaster === 'function') {
//   routes.attachBroadcaster(app);
// }

// // ============================================================
// // 404 HANDLER
// // ============================================================

// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     message: 'Route not found',
//     method: req.method,
//     path: req.originalUrl
//   });
// });

// // ============================================================
// // ERROR HANDLER
// // ============================================================

// app.use((err, req, res, next) => {
//   console.error('[SERVER ERROR]', err);

//   res.status(err.status || 500).json({
//     success: false,
//     message:
//       err.message ||
//       'Internal server error'
//   });
// });

// // ============================================================
// // START SERVER
// // ============================================================

// async function bootstrap() {
//   try {
//     await connectDatabase();

//     await ensureBootstrapAdmin();

//     app.listen(port, host, () => {
//       console.log('');
//       console.log(
//         `ZKTeco backend running on port ${port}`
//       );

//       console.log(
//         `Local URL: http://localhost:${port}`
//       );

//       console.log(
//         `Listening on: ${host}:${port}`
//       );

//       console.log(
//         `Environment: ${
//           isDevelopment
//             ? 'development'
//             : 'production'
//         }`
//       );

//       if (isDevelopment) {
//         console.log(
//           'Flutter Web localhost ports are allowed automatically'
//         );
//       }

//       if (allowedOrigins.length > 0) {
//         console.log(
//           'Configured CORS origins:',
//           allowedOrigins
//         );
//       }

//       console.log('');
//     });

//     startSchedulers();
//   } catch (err) {
//     console.error(
//       'Startup failed:',
//       err
//     );

//     process.exit(1);
//   }
// }

// bootstrap();

// module.exports = app;




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
  String(process.env.NODE_ENV || 'development').toLowerCase() !==
  'production';

app.locals.sseClients = new Set();

app.disable('x-powered-by');

// ============================================================
// CORS CONFIGURATION
// ============================================================

// Additional origins can be configured in .env:
// CORS_ORIGIN=http://localhost:3000,http://192.168.0.13:4000

const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header, such as curl
      // and server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      // Allow localhost development ports.
      const isLocalhostDevelopmentOrigin =
        isDevelopment &&
        (
          /^http:\/\/localhost:\d+$/.test(origin) ||
          /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
        );

      // Allow private LAN IPv4 addresses during development.
      // Example: http://192.168.0.13:4000
      const isLanDevelopmentOrigin =
        isDevelopment &&
        /^http:\/\/192\.168\.0\.\d+:\d+$/.test(origin);

      // Allow the local hostname used to access Flutter Web.
      // Example: http://ewre:4000
      const isHostnameDevelopmentOrigin =
        isDevelopment &&
        /^http:\/\/ewre:\d+$/.test(origin);

      // Allow explicitly configured origins from .env.
      const isConfiguredOrigin =
        allowedOrigins.includes(origin);

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

      const error = new Error(
        `Origin not allowed by CORS: ${origin}`
      );

      error.status = 403;

      return callback(error);
    },

    credentials: true,

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ]
  })
);

// The cors middleware above handles preflight OPTIONS requests.
// No separate app.options('*', cors()) is needed.

// ============================================================
// BODY PARSING
// ============================================================

app.use(
  express.json({
    limit: '5mb'
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

// ============================================================
// PUBLIC HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    name: 'ZKTeco F28 Attendance Backend',
    version,
    database: 'connected',
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
    version
  });
});

// ============================================================
// API ROUTES
// ============================================================

app.use('/api', routes);

// ============================================================
// SSE / REAL-TIME BROADCASTER
// ============================================================

if (typeof routes.attachBroadcaster === 'function') {
  routes.attachBroadcaster(app);
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
// START SERVER
// ============================================================

async function bootstrap() {
  try {
    await connectDatabase();

    await ensureBootstrapAdmin();

    app.listen(port, host, () => {
      console.log('');
      console.log('========================================');
      console.log('ZKTeco F28 Attendance Backend');
      console.log('========================================');

      console.log(`Local URL: http://localhost:${port}`);
      console.log(`Listening on: ${host}:${port}`);

      console.log(
        `Environment: ${
          isDevelopment ? 'development' : 'production'
        }`
      );

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

bootstrap();

module.exports = app;
