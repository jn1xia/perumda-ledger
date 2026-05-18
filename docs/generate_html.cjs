const fs = require('fs');
const path = require('path');

const md = fs.readFileSync(path.join(__dirname, 'USER_MANUAL.md'), 'utf-8');

// Map module sections to screenshot files
const SCREENSHOTS = {
  'Modul 1-3: Buku Besar': ['05_buku_besar.png', '02_coa.png'],
  'Modul 4: Departemen': ['16_master_data.png'],
  'Modul 5-7: Voucher': ['04_voucher.png'],
  'Modul 8-10: Jurnal': ['03_jurnal.png'],
  'Modul 11-13: Kunci & Jenis Jurnal': ['21_pengaturan.png'],
  'Modul 14-19: Laporan Keuangan': ['13_laporan.png'],
  'Modul 20-22: Piutang': ['06_piutang.png', '18_penjualan.png'],
  'Modul 23-24: Hutang': ['07_hutang.png', '17_pembelian.png'],
  'Modul 25-28: Persediaan': ['09_persediaan.png'],
  'Modul 29: Giro': ['15_giro.png'],
  'Modul 30: Aktiva Tetap': ['08_aset_tetap.png'],
  'Modul 32: E-Faktur PPN': ['19_efaktur.png'],
  'Modul 33: Anggaran vs Realisasi': ['11_anggaran.png', '12_lra.png'],
  'Modul 34: Rekonsiliasi Bank': ['14_rekonsiliasi.png'],
  'Modul 35: Backup & Restore': ['21_pengaturan.png'],
  'Modul 36: Pengaturan & Keamanan': ['21_pengaturan.png'],
};

// Convert screenshots to base64 for self-contained HTML
function imgToBase64(filename) {
  const filepath = path.join(__dirname, 'screenshots', filename);
  if (!fs.existsSync(filepath)) return null;
  const data = fs.readFileSync(filepath);
  return 'data:image/png;base64,' + data.toString('base64');
}

function mdToHtml(md) {
  let html = md;

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return '<pre><code>' + code.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code></pre>';
  });

  // Headers + inject screenshots
  html = html.replace(/^## (.+)$/gm, (match, title) => {
    const cleanTitle = title.replace(/[#]/g, '').trim();
    let imgHtml = '';
    if (SCREENSHOTS[cleanTitle]) {
      const imgs = SCREENSHOTS[cleanTitle].map(f => {
        const b64 = imgToBase64(f);
        if (!b64) return '';
        const label = f.replace(/^\d+_/, '').replace(/\.png$/, '').replace(/_/g, ' ');
        return `<div class="screenshot"><img src="${b64}" alt="${label}" loading="lazy"><span class="screenshot-label">${label}</span></div>`;
      }).join('');
      if (imgs) imgHtml = '<div class="screenshot-row">' + imgs + '</div>';
    }
    return `<h2 id="${cleanTitle}">${cleanTitle}</h2>${imgHtml}`;
  });

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold & italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');

  // Tables
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (match, header, sep, body) => {
    const hCells = header.split('|').filter(c => c.trim()).map(c => '<th>' + c.trim() + '</th>').join('');
    const rows = body.trim().split('\n').map(r => {
      const cells = r.split('|').filter(c => c.trim()).map(c => '<td>' + c.trim() + '</td>').join('');
      return '<tr>' + cells + '</tr>';
    }).join('\n');
    return '<div class="table-wrap"><table><thead><tr>' + hCells + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  });

  html = html.replace(/^---$/gm, '<hr>');

  // Blockquotes (one or more consecutive "> " lines)
  html = html.replace(/(^> .+$\n?)+/gm, (block) => {
    const inner = block
      .trim()
      .split('\n')
      .map(line => line.replace(/^>\s?/, ''))
      .join(' ');
    return '<blockquote>' + inner + '</blockquote>';
  });

  // Ordered lists
  html = html.replace(/(^(\d+)\. .+$\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map(line => '<li>' + line.replace(/^\d+\.\s+/, '') + '</li>').join('\n');
    return '<ol>' + items + '</ol>';
  });

  // Unordered lists
  html = html.replace(/(^- .+$\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map(line => '<li>' + line.replace(/^- /, '') + '</li>').join('\n');
    return '<ul>' + items + '</ul>';
  });

  // Paragraphs
  html = html.replace(/^(?!<[a-z\/]|$|\s*$)(.+)$/gm, '<p>$1</p>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return html;
}

const body = mdToHtml(md);

const htmlPage = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Panduan Pengguna — Aplikasi Keuangan Perumda Pasar Banjarmasin</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0f172a; --surface: #1e293b; --surface2: #334155;
      --border: #475569; --text: #e2e8f0; --text-muted: #94a3b8;
      --accent: #38bdf8; --accent2: #818cf8; --green: #34d399;
      --orange: #fb923c; --red: #f87171; --radius: 12px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg); color: var(--text);
      line-height: 1.7; display: flex; min-height: 100vh;
    }
    .sidebar {
      width: 280px; background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 24px 0; position: fixed;
      top: 0; left: 0; bottom: 0; overflow-y: auto; z-index: 100;
      transition: transform 0.3s;
    }
    .sidebar-logo { padding: 0 20px 20px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
    .sidebar-logo h2 {
      font-size: 15px; font-weight: 700;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .sidebar-logo p { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
    .sidebar a {
      display: block; padding: 8px 20px; color: var(--text-muted);
      text-decoration: none; font-size: 13px; transition: all 0.2s;
      border-left: 3px solid transparent;
    }
    .sidebar a:hover { color: var(--accent); background: rgba(56,189,248,0.05); border-left-color: var(--accent); }
    .sidebar .section-title {
      padding: 16px 20px 6px; font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 1.2px; color: var(--accent);
    }
    .content { margin-left: 280px; flex: 1; max-width: 900px; padding: 48px 56px 100px; }
    h1 {
      font-size: 32px; font-weight: 800;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    h2 {
      font-size: 22px; font-weight: 700; color: var(--accent);
      margin: 48px 0 16px; padding-bottom: 8px;
      border-bottom: 1px solid var(--border); scroll-margin-top: 24px;
    }
    h3 { font-size: 17px; font-weight: 600; color: var(--text); margin: 32px 0 12px; scroll-margin-top: 24px; }
    p { margin: 8px 0; font-size: 14.5px; }
    strong { color: #f1f5f9; font-weight: 600; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    hr { border: none; border-top: 1px solid var(--border); margin: 40px 0; }
    ul, ol { margin: 10px 0; padding-left: 24px; }
    li { margin: 4px 0; font-size: 14.5px; }
    li::marker { color: var(--accent); }

    /* Screenshots */
    .screenshot-row { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0 24px; }
    .screenshot {
      flex: 1; min-width: 280px; max-width: 100%;
      border-radius: var(--radius); overflow: hidden;
      border: 1px solid var(--border); background: var(--surface);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .screenshot:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
    .screenshot img { width: 100%; height: auto; display: block; cursor: pointer; }
    .screenshot-label {
      display: block; padding: 8px 12px; font-size: 11px;
      color: var(--text-muted); text-transform: capitalize;
      font-weight: 500; text-align: center; background: var(--surface2);
    }

    /* Lightbox */
    .lightbox {
      display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.9); z-index: 9999;
      align-items: center; justify-content: center; cursor: pointer;
    }
    .lightbox.active { display: flex; }
    .lightbox img { max-width: 95vw; max-height: 95vh; border-radius: 8px; box-shadow: 0 0 60px rgba(56,189,248,0.2); }

    /* Tables */
    .table-wrap { overflow-x: auto; margin: 12px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--surface); border-radius: var(--radius); overflow: hidden; }
    th { background: var(--surface2); color: var(--accent); font-weight: 600; text-align: left; padding: 10px 14px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 8px 14px; border-top: 1px solid var(--border); }
    tr:hover td { background: rgba(56,189,248,0.04); }
    code.inline { background: var(--surface2); padding: 2px 7px; border-radius: 5px; font-size: 13px; color: var(--orange); font-family: 'SF Mono', monospace; }
    blockquote {
      margin: 16px 0; padding: 12px 16px;
      background: rgba(56,189,248,0.06); border-left: 3px solid var(--accent2);
      border-radius: 6px; font-size: 13.5px; color: var(--text-muted);
    }
    blockquote strong { color: var(--accent); }
    h3 + blockquote { margin-top: 12px; }
    pre { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; overflow-x: auto; margin: 16px 0; }
    pre code { font-family: 'SF Mono', monospace; font-size: 13px; color: var(--green); background: none; padding: 0; }

    @media print {
      .sidebar { display: none; }
      .content { margin-left: 0; max-width: 100%; padding: 20px; }
      body { background: #fff; color: #000; }
      h1, h2, h3 { color: #111; -webkit-text-fill-color: #111; }
      table { border: 1px solid #ccc; } th { background: #eee; color: #333; } td { border-color: #ddd; color: #333; }
      pre { background: #f5f5f5; } pre code { color: #333; } code.inline { background: #eee; color: #c24; }
      p, li { color: #333; }
      .screenshot { page-break-inside: avoid; }
      .screenshot img { max-height: 300px; object-fit: contain; }
    }
    .menu-toggle {
      display: none; position: fixed; top: 12px; left: 12px; z-index: 200;
      background: var(--accent); color: var(--bg); border: none; border-radius: 8px;
      width: 40px; height: 40px; font-size: 20px; cursor: pointer;
    }
    @media (max-width: 768px) {
      .menu-toggle { display: flex; align-items: center; justify-content: center; }
      .sidebar { transform: translateX(-100%); } .sidebar.open { transform: translateX(0); }
      .content { margin-left: 0; padding: 24px 20px 80px; }
    }
    .top-btn {
      position: fixed; bottom: 24px; right: 24px;
      background: var(--accent); color: var(--bg); border: none; border-radius: 50%;
      width: 44px; height: 44px; font-size: 20px; cursor: pointer;
      opacity: 0; transition: opacity 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .top-btn.visible { opacity: 1; }
  </style>
</head>
<body>
  <button class="menu-toggle" onclick="document.querySelector('.sidebar').classList.toggle('open')">☰</button>

  <nav class="sidebar">
    <div class="sidebar-logo">
      <h2>📘 Panduan Pengguna</h2>
      <p>Perumda Pasar Banjarmasin v2026</p>
    </div>
    <div class="section-title">Umum</div>
    <a href="#Pendahuluan">Pendahuluan</a>
    <a href="#Login & Navigasi">Login & Navigasi</a>
    <div class="section-title">Modul 1–13</div>
    <a href="#Modul 1-3: Buku Besar">📗 1–3 Buku Besar</a>
    <a href="#Modul 4: Departemen">📗 4 Departemen</a>
    <a href="#Modul 5-7: Voucher">📙 5–7 Voucher</a>
    <a href="#Modul 8-10: Jurnal">📙 8–10 Jurnal</a>
    <a href="#Modul 11-13: Kunci & Jenis Jurnal">🔒 11–13 Kunci & Jenis</a>
    <div class="section-title">Modul 14–19</div>
    <a href="#Modul 14-19: Laporan Keuangan">📊 14–19 Laporan</a>
    <div class="section-title">Modul 20–28</div>
    <a href="#Modul 20-22: Piutang">💰 20–22 Piutang</a>
    <a href="#Modul 23-24: Hutang">💳 23–24 Hutang</a>
    <a href="#Modul 25-28: Persediaan">📦 25–28 Persediaan</a>
    <div class="section-title">Modul 29–36</div>
    <a href="#Modul 29: Giro">🏦 29 Giro</a>
    <a href="#Modul 30: Aktiva Tetap">🏗️ 30 Aktiva Tetap</a>
    <a href="#Modul 31: Produksi">🏭 31 Produksi</a>
    <a href="#Modul 32: E-Faktur PPN">🧾 32 E-Faktur</a>
    <a href="#Modul 33: Anggaran vs Realisasi">📈 33 Anggaran</a>
    <a href="#Modul 34: Rekonsiliasi Bank">🏦 34 Rekonsiliasi</a>
    <a href="#Modul 35: Backup & Restore">💾 35 Backup</a>
    <a href="#Modul 36: Pengaturan & Keamanan">⚙️ 36 Pengaturan</a>
    <div class="section-title">Referensi</div>
    <a href="#Alur Persetujuan">🔄 Alur Approval</a>
    <a href="#FAQ">❓ FAQ</a>
    <div style="padding: 24px 20px">
      <button onclick="window.print()" style="width:100%;padding:10px;background:var(--accent2);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">🖨️ Cetak / Save PDF</button>
    </div>
  </nav>

  <main class="content">
    ${body}
  </main>

  <div class="lightbox" onclick="this.classList.remove('active')">
    <img src="" alt="Preview">
  </div>

  <button class="top-btn" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑</button>

  <script>
    window.addEventListener('scroll', () => {
      document.querySelector('.top-btn').classList.toggle('visible', window.scrollY > 300);
    });
    document.querySelectorAll('.sidebar a').forEach(a => {
      a.addEventListener('click', () => {
        if (window.innerWidth <= 768) document.querySelector('.sidebar').classList.remove('open');
      });
    });
    // Lightbox for screenshots
    document.querySelectorAll('.screenshot img').forEach(img => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        const lb = document.querySelector('.lightbox');
        lb.querySelector('img').src = img.src;
        lb.classList.add('active');
      });
    });
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'USER_MANUAL.html'), htmlPage);
console.log('Created USER_MANUAL.html (' + (htmlPage.length / 1024).toFixed(0) + ' KB) with embedded screenshots');
