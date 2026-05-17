const { chromium } = require('playwright');
const path = require('path');

const PAGES = [
  { name: '01_dashboard', url: '/home', wait: 3000 },
  { name: '02_coa', url: '/coa', wait: 2000 },
  { name: '03_jurnal', url: '/jurnal', wait: 2000 },
  { name: '04_voucher', url: '/voucher', wait: 2000 },
  { name: '05_buku_besar', url: '/buku-besar', wait: 2000 },
  { name: '06_piutang', url: '/piutang', wait: 2000 },
  { name: '07_hutang', url: '/hutang', wait: 2000 },
  { name: '08_aset_tetap', url: '/aset-tetap', wait: 2000 },
  { name: '09_persediaan', url: '/persediaan', wait: 2000 },
  { name: '10_bbm', url: '/bbm-prabayar', wait: 2000 },
  { name: '11_anggaran', url: '/anggaran-realisasi', wait: 2000 },
  { name: '12_lra', url: '/lra', wait: 2000 },
  { name: '13_laporan', url: '/laporan', wait: 3000 },
  { name: '14_rekonsiliasi', url: '/rekonsiliasi-bank', wait: 2000 },
  { name: '15_giro', url: '/giro', wait: 2000 },
  { name: '16_master_data', url: '/master-data', wait: 2000 },
  { name: '17_pembelian', url: '/pembelian', wait: 2000 },
  { name: '18_penjualan', url: '/penjualan', wait: 2000 },
  { name: '19_efaktur', url: '/efaktur', wait: 2000 },
  { name: '20_import_data', url: '/import-data', wait: 2000 },
  { name: '21_pengaturan', url: '/pengaturan', wait: 2000 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const outDir = path.join(__dirname, 'screenshots');

  for (const p of PAGES) {
    try {
      await page.goto('http://localhost:5173' + p.url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(p.wait);
      const file = path.join(outDir, p.name + '.png');
      await page.screenshot({ path: file, fullPage: false });
      console.log('✅', p.name);
    } catch (e) {
      console.log('❌', p.name, e.message.substring(0, 80));
    }
  }

  await browser.close();
  console.log('\nDone! Screenshots saved to docs/screenshots/');
})();
