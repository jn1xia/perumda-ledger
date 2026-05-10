const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to import-data...');
    await page.goto('http://localhost:5173/import-data', { waitUntil: 'networkidle' });
    
    console.log('Uploading Excel file...');
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.resolve(__dirname, 'test_import_data.xlsx'));
    
    // Wait for the preview table to render
    console.log('Waiting for preview table...');
    await page.waitForSelector('table.data-table');
    
    const rows = await page.locator('table.data-table tbody tr').count();
    console.log(`Preview table rendered with ${rows} rows.`);
    
    if (rows === 2) {
      console.log('Row count matches!');
    } else {
      throw new Error(`Expected 2 rows, found ${rows}`);
    }
    
    console.log('Clicking "Simpan ke Jurnal"...');
    await page.click('button:has-text("Simpan ke Jurnal")');
    
    // Wait for success message
    await page.waitForSelector('text=Import Berhasil!');
    console.log('Success message appeared!');
    
    console.log('Navigating to Jurnal page...');
    await page.goto('http://localhost:5173/jurnal', { waitUntil: 'networkidle' });
    
    // Check if the imported data is there
    const bodyText = await page.innerText('body');
    if (bodyText.includes('Test Import Row 1') && bodyText.includes('Test Import Row 2')) {
      console.log('SUCCESS: Imported journals found on the Jurnal page!');
    } else {
      throw new Error('Imported journals NOT found on the Jurnal page!');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
