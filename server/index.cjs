const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initDatabase, seedDatabase, fixAnggaranTable, seedReportData, migrateJournalLines } = require('./db/seed.cjs');
const { seedUsers }   = require('./db/seedUsers.cjs');
const apiRoutes       = require('./routes/api.cjs');
const authRoutes      = require('./routes/auth.cjs');
const aiContextRoutes = require('./routes/aiContext.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Same-origin in production (server serves the SPA + API). In dev, Vite proxies
// /api to this server so cookies stay same-origin too — credentials must be
// allowed for the (rare) cross-origin case.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
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
