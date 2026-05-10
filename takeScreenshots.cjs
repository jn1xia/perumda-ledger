const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const routes = [
  { path: '/home', name: 'dashboard' },
  { path: '/jurnal', name: 'jurnal' },
  { path: '/coa', name: 'coa' },
  { path: '/buku-besar', name: 'buku-besar' },
  { path: '/piutang', name: 'piutang' },
  { path: '/hutang', name: 'hutang' },
  { path: '/aset-tetap', name: 'aset-tetap' },
  { path: '/persediaan', name: 'persediaan' },
  { path: '/bbm-prabayar', name: 'bbm-prabayar' },
  { path: '/anggaran-realisasi', name: 'anggaran-realisasi' },
  { path: '/laporan', name: 'laporan' },
  { path: '/lra', name: 'lra' },
  { path: '/rekonsiliasi-bank', name: 'rekonsiliasi-bank' },
  { path: '/pengaturan', name: 'pengaturan' }
];

async function run() {
  // Ensure the public directory exists for screenshots
  const dir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  for (const route of routes) {
    console.log(`Navigating to http://localhost:5174${route.path}`);
    await page.goto(`http://localhost:5174${route.path}`, { waitUntil: 'networkidle0' });
    
    // Some pages might have animations or need a brief moment
    await new Promise(r => setTimeout(r, 1000));
    
    const filePath = path.join(dir, `${route.name}.png`);
    await page.screenshot({ path: filePath });
    console.log(`Saved ${route.name}.png`);
  }

  await browser.close();
  console.log('All screenshots captured!');
}

run().catch(console.error);
