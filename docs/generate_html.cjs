const fs = require('fs');
const path = require('path');

const md = fs.readFileSync(path.join(__dirname, 'USER_MANUAL.md'), 'utf-8');

function mdToHtml(md) {
  let html = md;

  // Code blocks (fenced)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return '<pre><code>' + code.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code></pre>';
  });

  // Headers (must be before bold processing)
  html = html.replace(/^#### (.+)$/gm, '<h4 id="$1">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 id="$1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 id="$1">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 id="$1">$1</h1>');

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

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Ordered lists
  html = html.replace(/(^(\d+)\. .+$\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map(line => {
      return '<li>' + line.replace(/^\d+\.\s+/, '') + '</li>';
    }).join('\n');
    return '<ol>' + items + '</ol>';
  });

  // Unordered lists
  html = html.replace(/(^- .+$\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map(line => {
      return '<li>' + line.replace(/^- /, '') + '</li>';
    }).join('\n');
    return '<ul>' + items + '</ul>';
  });

  // Paragraphs (non-empty lines not starting with HTML tag)
  html = html.replace(/^(?!<[a-z\/]|$|\s*$)(.+)$/gm, '<p>$1</p>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Emoji-like symbols for visual flair
  html = html.replace(/⚠️/g, '<span class="emoji warn">⚠️</span>');
  html = html.replace(/✅/g, '<span class="emoji ok">✅</span>');
  html = html.replace(/❌/g, '<span class="emoji no">❌</span>');

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
      --bg: #0f172a;
      --surface: #1e293b;
      --surface2: #334155;
      --border: #475569;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent2: #818cf8;
      --green: #34d399;
      --orange: #fb923c;
      --red: #f87171;
      --radius: 12px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      display: flex;
      min-height: 100vh;
    }

    /* === SIDEBAR NAV === */
    .sidebar {
      width: 280px;
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 24px 0;
      position: fixed;
      top: 0; left: 0; bottom: 0;
      overflow-y: auto;
      z-index: 100;
      transition: transform 0.3s;
    }
    .sidebar-logo {
      padding: 0 20px 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .sidebar-logo h2 {
      font-size: 15px;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.3px;
    }
    .sidebar-logo p { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
    .sidebar a {
      display: block;
      padding: 8px 20px;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 13px;
      transition: all 0.2s;
      border-left: 3px solid transparent;
    }
    .sidebar a:hover {
      color: var(--accent);
      background: rgba(56,189,248,0.05);
      border-left-color: var(--accent);
    }
    .sidebar .section-title {
      padding: 16px 20px 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: var(--accent);
    }

    /* === MAIN CONTENT === */
    .content {
      margin-left: 280px;
      flex: 1;
      max-width: 860px;
      padding: 48px 56px 100px;
    }

    h1 {
      font-size: 32px;
      font-weight: 800;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    h2 {
      font-size: 22px;
      font-weight: 700;
      color: var(--accent);
      margin: 48px 0 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
      scroll-margin-top: 24px;
    }
    h3 {
      font-size: 17px;
      font-weight: 600;
      color: var(--text);
      margin: 32px 0 12px;
      scroll-margin-top: 24px;
    }
    h4 { font-size: 15px; font-weight: 600; margin: 20px 0 8px; color: var(--green); }

    p { margin: 8px 0; color: var(--text); font-size: 14.5px; }

    strong { color: #f1f5f9; font-weight: 600; }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 40px 0;
    }

    /* Lists */
    ul, ol {
      margin: 10px 0;
      padding-left: 24px;
    }
    li {
      margin: 4px 0;
      font-size: 14.5px;
      color: var(--text);
    }
    li::marker { color: var(--accent); }

    /* Tables */
    .table-wrap { overflow-x: auto; margin: 12px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      background: var(--surface);
      border-radius: var(--radius);
      overflow: hidden;
    }
    th {
      background: var(--surface2);
      color: var(--accent);
      font-weight: 600;
      text-align: left;
      padding: 10px 14px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    td {
      padding: 8px 14px;
      border-top: 1px solid var(--border);
      color: var(--text);
    }
    tr:hover td { background: rgba(56,189,248,0.04); }

    /* Code */
    code.inline {
      background: var(--surface2);
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 13px;
      color: var(--orange);
      font-family: 'SF Mono', 'Fira Code', monospace;
    }
    pre {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      overflow-x: auto;
      margin: 16px 0;
    }
    pre code {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
      color: var(--green);
      background: none;
      padding: 0;
    }

    /* Print */
    @media print {
      .sidebar { display: none; }
      .content { margin-left: 0; max-width: 100%; padding: 20px; }
      body { background: #fff; color: #000; }
      h1, h2, h3, h4 { color: #111; -webkit-text-fill-color: #111; }
      table { border: 1px solid #ccc; }
      th { background: #eee; color: #333; }
      td { border-color: #ddd; color: #333; }
      pre { background: #f5f5f5; border-color: #ddd; }
      pre code { color: #333; }
      code.inline { background: #eee; color: #c24; }
      p, li { color: #333; }
    }

    /* Mobile */
    .menu-toggle {
      display: none;
      position: fixed;
      top: 12px; left: 12px;
      z-index: 200;
      background: var(--accent);
      color: var(--bg);
      border: none;
      border-radius: 8px;
      width: 40px; height: 40px;
      font-size: 20px;
      cursor: pointer;
    }
    @media (max-width: 768px) {
      .menu-toggle { display: flex; align-items: center; justify-content: center; }
      .sidebar { transform: translateX(-100%); }
      .sidebar.open { transform: translateX(0); }
      .content { margin-left: 0; padding: 24px 20px 80px; }
      h1 { font-size: 24px; }
      h2 { font-size: 18px; }
    }

    /* Back to top */
    .top-btn {
      position: fixed;
      bottom: 24px; right: 24px;
      background: var(--accent);
      color: var(--bg);
      border: none;
      border-radius: 50%;
      width: 44px; height: 44px;
      font-size: 20px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.3s;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
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

  <button class="top-btn" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑</button>

  <script>
    // Back to top visibility
    window.addEventListener('scroll', () => {
      document.querySelector('.top-btn').classList.toggle('visible', window.scrollY > 300);
    });
    // Close sidebar on mobile when clicking a link
    document.querySelectorAll('.sidebar a').forEach(a => {
      a.addEventListener('click', () => {
        if (window.innerWidth <= 768) document.querySelector('.sidebar').classList.remove('open');
      });
    });
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'USER_MANUAL.html'), htmlPage);
console.log('Created USER_MANUAL.html (' + htmlPage.length + ' bytes)');
