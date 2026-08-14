const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initDatabase, seedDatabase, fixAnggaranTable, seedReportData, migrateJournalLines } = require('./db/seed.cjs');
const { seedUsers }   = require('./db/seedUsers.cjs');
const { startAutoBackup } = require('./db/autoBackup.cjs');
const apiRoutes       = require('./routes/api.cjs');
const authRoutes      = require('./routes/auth.cjs');
const usersRoutes     = require('./routes/users.cjs');
const aiContextRoutes = require('./routes/aiContext.cjs');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// Fail-safe: the RBAC-bypass and trusted-header escape hatches are dev/test only.
// Never let a production deploy run with them enabled (a stray env var would
// otherwise disable all authorization).
if (IS_PROD) {
  if (process.env.DISABLE_RBAC === '1') {
    console.warn('[security] DISABLE_RBAC ignored in production.');
    delete process.env.DISABLE_RBAC;
  }
  if (process.env.ALLOW_HEADER_ROLE === '1') {
    console.warn('[security] ALLOW_HEADER_ROLE ignored in production (cookie auth only).');
    delete process.env.ALLOW_HEADER_ROLE;
  }
}

// Behind Fly's TLS proxy — trust it so Secure cookies and req.secure work.
if (IS_PROD) app.set('trust proxy', 1);

// Security headers. CSP is left off here because the SPA relies on inline
// styles and same-origin assets; the other helmet protections still apply.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// CORS. In production the server serves the SPA and API from the same origin,
// so cross-origin requests are only allowed from an explicitly configured list
// (CORS_ORIGINS, comma-separated). In dev, reflect the origin so the Vite proxy
// / localhost work. Credentials are always allowed (session cookie).
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: IS_PROD ? (corsOrigins.length ? corsOrigins : false) : true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes); // must precede the generic /api router
app.use('/api', apiRoutes);
app.use('/api/ai-context', aiContextRoutes);

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
  app.get('*splat', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    await seedDatabase();
    await seedUsers();
    await fixAnggaranTable();
    await seedReportData();
    await migrateJournalLines();

    // Nothing scheduled a backup before this — the only copies that existed were
    // the ones somebody remembered to take by hand. See db/autoBackup.cjs for why
    // the trigger is boot-based rather than a nightly timer.
    startAutoBackup();

    app.listen(PORT, () => {
      console.log(`\n🚀 Perumda Ledger API Server running on http://localhost:${PORT}`);
      console.log(`📊 API endpoints:`);
      console.log(`   GET    /api/journals`);
      console.log(`   POST   /api/journals`);
      console.log(`   PUT    /api/journals/:id`);
      console.log(`   DELETE /api/journals/:id`);
      console.log(`   POST   /api/journals/approve/:id`);
      console.log(`   POST   /api/journals/unapprove/:id`);
      console.log(`   DELETE /api/journals?month=YYYY-MM`);
      console.log(`\n   GET    /api/coa`);
      console.log(`   GET    /api/assets`);
      console.log(`   POST   /api/assets`);
      console.log(`   DELETE /api/assets/:kode`);
      console.log(`\n   GET    /api/bbm`);
      console.log(`   POST   /api/bbm`);
      console.log(`\n   GET    /api/piutang`);
      console.log(`   POST   /api/piutang`);
      console.log(`   PUT    /api/piutang/:id`);
      console.log(`\n   GET    /api/hutang`);
      console.log(`   POST   /api/hutang`);
      console.log(`   PUT    /api/hutang/:id`);
      console.log(`\n   GET    /api/pengaturan`);
      console.log(`   PUT    /api/pengaturan`);
      console.log(`\n   POST   /api/reset`);
      console.log(`   GET    /api/export`);
      console.log(`\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});

start();

module.exports = app;
