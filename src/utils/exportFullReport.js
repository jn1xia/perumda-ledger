import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

/**
 * Export all financial data for a selected month in the same layout as the audit Excel files.
 * Generates a multi-sheet workbook: Rekap Akun & Saldo, Laba Rugi, Neraca, Arus Kas, COA
 */

const MONTH_NAMES = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

// Helper: format number for display
const fmt = v => typeof v === 'number' ? v : ''

// Helper: flatten COA tree
function flattenCOA(nodes, result = []) {
  if (!nodes) return result
  nodes.forEach(n => {
    result.push({ code: n.code, name: n.name, type: n.type, category: n.category, saldoAwal: n.saldoAwal || 0, defaultSide: n.defaultSide || 'D', children: n.children })
    if (n.children) flattenCOA(n.children, result)
  })
  return result
}

// Helper: compute account balances from journals
function computeBalances(coaFlat, journals) {
  const balances = {}
  coaFlat.forEach(a => {
    if (a.type !== 'posting') return
    let d = 0, k = 0
    journals.forEach(j => {
      if (j.akun_debit && j.akun_debit.startsWith(a.code)) d += (j.debit || 0)
      if (j.akun_kredit && j.akun_kredit.startsWith(a.code)) k += (j.kredit || 0)
    })
    balances[a.code] = { code: a.code, name: a.name, defaultSide: a.defaultSide, debit: d, kredit: k, saldo: d - k, saldoAwal: a.saldoAwal || 0 }
  })
  return balances
}

// ==========================================
// SHEET 1: Rekap Akun & Saldo (Trial Balance)
// ==========================================
function buildRekapSheet(coaFlat, balances, monthName) {
  const rows = []
  rows.push(['', 'PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)'])
  rows.push(['', 'REKAP AKUN & SALDO'])
  rows.push(['', `Untuk Periode yang Berakhir pada Bulan ${monthName} 2026`])
  rows.push([])
  rows.push(['Kode', 'Akun', 'Default', 'D', 'K', 'Saldo'])

  coaFlat.forEach(a => {
    if (a.type === 'posting') {
      const b = balances[a.code] || { debit: 0, kredit: 0, saldo: 0 }
      rows.push([a.code, a.name, a.defaultSide || 'D', fmt(b.debit), fmt(b.kredit), fmt(b.saldo)])
    } else {
      rows.push([a.code || '', a.name, '', '', '', ''])
    }
  })

  // Totals
  let totalD = 0, totalK = 0
  Object.values(balances).forEach(b => { totalD += b.debit; totalK += b.kredit })
  rows.push([])
  rows.push(['', 'TOTAL', '', fmt(totalD), fmt(totalK), fmt(totalD - totalK)])

  return rows
}

// ==========================================
// SHEET 2: Laba Rugi (Income Statement)
// ==========================================
function buildLabaRugiSheet(coaFlat, balances, monthName) {
  const rows = []
  rows.push([])
  rows.push(['2.3', 'LAPORAN LABA (RUGI)'])
  rows.push([])
  rows.push([])
  rows.push(['', 'PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)'])
  rows.push(['', 'LAPORAN LABA (RUGI)'])
  rows.push(['', `Untuk Periode yang Berakhir pada Bulan ${monthName} 2026`])
  rows.push(['', '(Dinyatakan dalam Rupiah)'])
  rows.push([])
  rows.push(['', '', '', '', '', '', '', '', '', monthName])
  
  // PENDAPATAN
  rows.push(['', 'PENDAPATAN'])
  rows.push(['', '', 'PENDAPATAN USAHA'])

  const pendapatanAccts = coaFlat.filter(a => a.type === 'posting' && a.code.startsWith('4'))
  let totalPendapatan = 0
  
  // Group by sub-category
  const pendBisnis = pendapatanAccts.filter(a => a.code.startsWith('41'))
  const pendLainnya = pendapatanAccts.filter(a => a.code.startsWith('42') || a.code.startsWith('43') || a.code.startsWith('44') || a.code.startsWith('45'))

  // Pendapatan Bisnis Utama
  let subTotal1 = 0
  rows.push(['', '', '', 'Pendapatan Bisnis Utama'])
  pendBisnis.forEach(a => {
    const b = balances[a.code]
    const v = b ? b.kredit - b.debit : 0
    if (v !== 0) {
      rows.push(['', '', '', '', a.name, '', '', '', '', fmt(v)])
      subTotal1 += v
    }
  })
  if (pendBisnis.length === 0 || subTotal1 === 0) {
    rows.push(['', '', '', '', '(tidak ada transaksi)', '', '', '', '', 0])
  }
  rows.push(['', '', '', '', '', 'Jumlah Pendapatan Bisnis Utama', '', '', '', fmt(subTotal1)])
  totalPendapatan += subTotal1

  // Pendapatan Lainnya
  let subTotal2 = 0
  rows.push(['', '', '', 'Pendapatan Pengembangan Bisnis Lainnya'])
  pendLainnya.forEach(a => {
    const b = balances[a.code]
    const v = b ? b.kredit - b.debit : 0
    if (v !== 0) {
      rows.push(['', '', '', '', a.name, '', '', '', '', fmt(v)])
      subTotal2 += v
    }
  })
  if (subTotal2 === 0) {
    rows.push(['', '', '', '', '(tidak ada transaksi)', '', '', '', '', 0])
  }
  rows.push(['', '', '', '', '', 'Jumlah Pendapatan Lainnya', '', '', '', fmt(subTotal2)])
  totalPendapatan += subTotal2

  // Pendapatan non-usaha (7xxx)
  const pendNonUsaha = coaFlat.filter(a => a.type === 'posting' && a.code.startsWith('7'))
  let subTotal7 = 0
  if (pendNonUsaha.length > 0) {
    rows.push(['', '', 'PENDAPATAN LAIN-LAIN'])
    pendNonUsaha.forEach(a => {
      const b = balances[a.code]
      const v = b ? b.kredit - b.debit : 0
      if (v !== 0) {
        rows.push(['', '', '', a.name, '', '', '', '', '', fmt(v)])
        subTotal7 += v
      }
    })
    rows.push(['', '', '', '', 'Jumlah Pendapatan Lain-lain', '', '', '', '', fmt(subTotal7)])
    totalPendapatan += subTotal7
  }

  rows.push(['', '', '', '', 'JUMLAH PENDAPATAN USAHA', '', '', '', '', fmt(totalPendapatan)])
  rows.push([])

  // BEBAN
  rows.push(['', 'BEBAN USAHA'])

  // Beban Umum & Administrasi (6xxx)
  rows.push(['', '', 'BEBAN UMUM DAN ADMINISTRASI'])
  const bebanUmum = coaFlat.filter(a => a.type === 'posting' && a.code.startsWith('6'))
  let totalBebanUmum = 0
  bebanUmum.forEach(a => {
    const b = balances[a.code]
    const v = b ? b.debit - b.kredit : 0
    if (v !== 0) {
      rows.push(['', '', '', a.name, '', '', '', '', '', fmt(v)])
      totalBebanUmum += v
    }
  })
  rows.push(['', '', '', '', 'Jumlah Beban Umum dan Administrasi', '', '', '', '', fmt(totalBebanUmum)])
  rows.push([])

  // Beban Operasional (5xxx)
  rows.push(['', '', 'BEBAN OPERASIONAL'])
  const bebanOps = coaFlat.filter(a => a.type === 'posting' && a.code.startsWith('5'))
  let totalBebanOps = 0
  bebanOps.forEach(a => {
    const b = balances[a.code]
    const v = b ? b.debit - b.kredit : 0
    if (v !== 0) {
      rows.push(['', '', '', a.name, '', '', '', '', '', fmt(v)])
      totalBebanOps += v
    }
  })
  rows.push(['', '', '', '', 'Jumlah Beban Operasional', '', '', '', '', fmt(totalBebanOps)])
  rows.push([])

  // Beban Lain-lain (8xxx)
  const bebanLain = coaFlat.filter(a => a.type === 'posting' && a.code.startsWith('8'))
  let totalBebanLain = 0
  if (bebanLain.length > 0) {
    rows.push(['', '', 'BEBAN LAIN-LAIN'])
    bebanLain.forEach(a => {
      const b = balances[a.code]
      const v = b ? b.debit - b.kredit : 0
      if (v !== 0) {
        rows.push(['', '', '', a.name, '', '', '', '', '', fmt(v)])
        totalBebanLain += v
      }
    })
    rows.push(['', '', '', '', 'Jumlah Beban Lain-lain', '', '', '', '', fmt(totalBebanLain)])
    rows.push([])
  }

  const totalBeban = totalBebanUmum + totalBebanOps + totalBebanLain
  rows.push(['', '', '', '', '', 'JUMLAH BEBAN USAHA', '', '', '', fmt(totalBeban)])
  rows.push([])

  const labaBersih = totalPendapatan - totalBeban
  rows.push(['', '', '', '', '', 'LABA (RUGI) BERSIH', '', '', '', fmt(labaBersih)])

  return rows
}

// ==========================================
// SHEET 3: Neraca (Balance Sheet)
// ==========================================
function buildNeracaSheet(coaFlat, journalsYTD, monthName) {
  const rows = []
  rows.push([])
  rows.push(['2.2', 'LAPORAN NERACA'])
  rows.push([])
  rows.push([])
  rows.push(['', 'PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)'])
  rows.push(['', 'LAPORAN POSISI KEUANGAN'])
  rows.push(['', `Untuk Periode yang Berakhir pada Bulan ${monthName} 2026`])
  rows.push(['', '(Dinyatakan dalam Rupiah)'])
  rows.push([])

  // Compute YTD balances with saldo awal
  const calcBalance = (acct, isCredit) => {
    let d = 0, k = 0
    journalsYTD.forEach(j => {
      if (j.akun_debit && j.akun_debit.startsWith(acct.code)) d += (j.debit || 0)
      if (j.akun_kredit && j.akun_kredit.startsWith(acct.code)) k += (j.kredit || 0)
    })
    return isCredit ? (acct.saldoAwal || 0) + k - d : (acct.saldoAwal || 0) + d - k
  }

  // Compute Laba Bersih YTD for Ekuitas
  const pendapatanYTD = coaFlat.filter(c => (c.code.startsWith('4') || c.code.startsWith('7')) && c.type === 'posting')
    .reduce((sum, a) => sum + calcBalance(a, true), 0)
  const bebanYTD = coaFlat.filter(c => (c.code.startsWith('5') || c.code.startsWith('6') || c.code.startsWith('8')) && c.type === 'posting')
    .reduce((sum, a) => { let d=0,k=0; journalsYTD.forEach(j=>{if(j.akun_debit&&j.akun_debit.startsWith(a.code))d+=j.debit||0;if(j.akun_kredit&&j.akun_kredit.startsWith(a.code))k+=j.kredit||0}); return sum+d-k }, 0)
  const labaBersihYTD = pendapatanYTD - bebanYTD

  // ASET
  rows.push(['', 'ASET', '', '', monthName])
  rows.push(['', '', 'Aset Lancar'])
  const asetLancar = coaFlat.filter(a => a.type === 'posting' && a.code.startsWith('11'))
  let totalAsetLancar = 0
  asetLancar.forEach(a => {
    const v = calcBalance(a, false)
    if (v !== 0) {
      rows.push(['', '', '', a.name, fmt(v)])
      totalAsetLancar += v
    }
  })
  rows.push(['', '', '', '', '', 'Jumlah Aset Lancar', fmt(totalAsetLancar)])
  rows.push([])

  rows.push(['', '', 'Aset Tetap'])
  const asetTetap = coaFlat.filter(a => a.type === 'posting' && a.code.startsWith('12'))
  let totalAsetTetap = 0
  asetTetap.forEach(a => {
    const v = calcBalance(a, false)
    if (v !== 0) {
      rows.push(['', '', '', a.name, fmt(v)])
      totalAsetTetap += v
    }
  })
  rows.push(['', '', '', '', '', 'Jumlah Aset Tetap', fmt(totalAsetTetap)])
  rows.push([])

  // Aset Lainnya (13xxx, 14xxx, 15xxx, 19xxx)
  const asetLain = coaFlat.filter(a => a.type === 'posting' && a.code.startsWith('1') && !a.code.startsWith('11') && !a.code.startsWith('12'))
  let totalAsetLain = 0
  if (asetLain.length > 0) {
    rows.push(['', '', 'Aset Lainnya'])
    asetLain.forEach(a => {
      const v = calcBalance(a, false)
      if (v !== 0) {
        rows.push(['', '', '', a.name, fmt(v)])
        totalAsetLain += v
      }
    })
    rows.push(['', '', '', '', '', 'Jumlah Aset Lainnya', fmt(totalAsetLain)])
    rows.push([])
  }

  const totalAset = totalAsetLancar + totalAsetTetap + totalAsetLain
  rows.push(['', '', '', '', '', '', 'TOTAL ASET', fmt(totalAset)])
  rows.push([])
  rows.push([])

  // KEWAJIBAN
  rows.push(['', 'KEWAJIBAN'])
  const kewajiban = coaFlat.filter(a => a.type === 'posting' && a.code.startsWith('2'))
  let totalKewajiban = 0
  kewajiban.forEach(a => {
    const v = calcBalance(a, true)
    if (v !== 0) {
      rows.push(['', '', '', a.name, fmt(v)])
      totalKewajiban += v
    }
  })
  rows.push(['', '', '', '', '', 'Jumlah Kewajiban', fmt(totalKewajiban)])
  rows.push([])

  // EKUITAS
  rows.push(['', 'EKUITAS'])
  const ekuitas = coaFlat.filter(a => a.type === 'posting' && a.code.startsWith('3'))
  let totalEkuitas = 0
  ekuitas.forEach(a => {
    const v = calcBalance(a, true)
    if (v !== 0) {
      rows.push(['', '', '', a.name, fmt(v)])
      totalEkuitas += v
    }
  })
  rows.push(['', '', '', 'Laba/Rugi Berjalan (YTD)', fmt(labaBersihYTD)])
  totalEkuitas += labaBersihYTD
  rows.push(['', '', '', '', '', 'Jumlah Ekuitas', fmt(totalEkuitas)])
  rows.push([])

  rows.push(['', '', '', '', '', '', 'TOTAL KEWAJIBAN + EKUITAS', fmt(totalKewajiban + totalEkuitas)])

  return rows
}

// ==========================================
// SHEET 4: Arus Kas (Cash Flow)
// ==========================================
function buildArusKasSheet(cashFlow, monthName) {
  const rows = []
  rows.push([])
  rows.push(['PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)'])
  rows.push(['LAPORAN ARUS KAS'])
  rows.push([`Untuk Periode yang Berakhir pada Bulan ${monthName} 2026`])
  rows.push([])
  rows.push([])
  rows.push(['', '', monthName])

  // Operasional
  rows.push(['Arus Kas dari Aktivitas Operasi'])
  if (cashFlow && cashFlow.operasional) {
    cashFlow.operasional.items.forEach(item => {
      rows.push(['', item.keterangan, fmt(item.jumlah)])
    })
    rows.push(['', 'Arus Kas Bersih dari Aktivitas Operasi', fmt(cashFlow.operasional.netto)])
  }
  rows.push([])

  // Investasi
  rows.push(['Arus Kas dari Aktivitas Investasi'])
  if (cashFlow && cashFlow.investasi) {
    cashFlow.investasi.items.forEach(item => {
      rows.push(['', item.keterangan, fmt(item.jumlah)])
    })
    rows.push(['', 'Arus Kas Bersih dari Aktivitas Investasi', fmt(cashFlow.investasi.netto)])
  }
  rows.push([])

  // Pendanaan
  rows.push(['Arus Kas dari Aktivitas Pendanaan'])
  if (cashFlow && cashFlow.pendanaan) {
    cashFlow.pendanaan.items.forEach(item => {
      rows.push(['', item.keterangan, fmt(item.jumlah)])
    })
    rows.push(['', 'Arus Kas Bersih dari Aktivitas Pendanaan', fmt(cashFlow.pendanaan.netto)])
  }
  rows.push([])

  const totalNetto = cashFlow ? (cashFlow.totalNetto || 0) : 0
  rows.push(['KENAIKAN/(PENURUNAN) KAS BERSIH', '', fmt(totalNetto)])

  return rows
}

// ==========================================
// SHEET 5: COA (Chart of Accounts)
// ==========================================
function buildCOASheet(coaFlat) {
  const rows = []
  rows.push(['Kode', 'Nama Akun', 'Tipe'])
  coaFlat.forEach(a => {
    rows.push([a.code || '', a.name, a.type === 'posting' ? 'Posting' : 'Header'])
  })
  return rows
}

// ==========================================
// SHEET 6: Jurnal Detail
// ==========================================
function buildJurnalSheet(journals, monthName) {
  const rows = []
  rows.push(['PERUSAHAAN UMUM DAERAH PASAR BAIMAN (PERUMDA)'])
  rows.push([`JURNAL UMUM — ${monthName} 2026`])
  rows.push([])
  rows.push(['No', 'Tanggal', 'Bukti', 'Keterangan', 'Akun Debit', 'Akun Kredit', 'Debit', 'Kredit'])

  let totalD = 0, totalK = 0
  journals.forEach((j, i) => {
    rows.push([i + 1, j.tanggal, j.ref || j.bukti || '', j.keterangan || '', j.akun_debit || '', j.akun_kredit || '', fmt(j.debit || 0), fmt(j.kredit || 0)])
    totalD += j.debit || 0
    totalK += j.kredit || 0
  })
  rows.push([])
  rows.push(['', '', '', '', '', 'TOTAL', fmt(totalD), fmt(totalK)])

  return rows
}

// ==========================================
// MAIN EXPORT FUNCTION
// ==========================================
export function exportFullReport(state, allJournals, selectedPeriod, cashFlow) {
  try {
    const PERIOD_OPTIONS = [
      { value: 'januari', label: 'Januari', months: [1] },
      { value: 'februari', label: 'Februari', months: [1, 2] },
      { value: 'maret', label: 'Maret', months: [1, 2, 3] },
      { value: 'april', label: 'April', months: [1, 2, 3, 4] },
      { value: 'mei', label: 'Mei', months: [1, 2, 3, 4, 5] },
      { value: 'juni', label: 'Juni', months: [1, 2, 3, 4, 5, 6] },
      { value: 'juli', label: 'Juli', months: [1, 2, 3, 4, 5, 6, 7] },
      { value: 'agustus', label: 'Agustus', months: [1, 2, 3, 4, 5, 6, 7, 8] },
      { value: 'september', label: 'September', months: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
      { value: 'oktober', label: 'Oktober', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      { value: 'november', label: 'November', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
      { value: 'desember', label: 'Desember', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    ]

    const periodOpt = PERIOD_OPTIONS.find(p => p.value === selectedPeriod) || PERIOD_OPTIONS[0]
    const targetMonth = Math.max(...periodOpt.months)
    const monthName = MONTH_NAMES[targetMonth]

    // Filter journals
    const posted = allJournals.filter(j => j.status === 'posted' || j.status === 'approved')
    const monthJournals = posted.filter(j => {
      const m = new Date(j.tanggal).getMonth() + 1
      return m === targetMonth
    })
    const ytdJournals = posted.filter(j => {
      const m = new Date(j.tanggal).getMonth() + 1
      return m <= targetMonth
    })

    // Flatten COA
    const coaFlat = flattenCOA(state.coaTree || [])
    const balances = computeBalances(coaFlat, monthJournals)

    // Build all sheets
    const wb = XLSX.utils.book_new()

    // Helper to create sheet with column widths
    const addSheet = (name, data, colWidths) => {
      const ws = XLSX.utils.aoa_to_sheet(data)
      if (colWidths) ws['!cols'] = colWidths
      XLSX.utils.book_append_sheet(wb, ws, name)
    }

    // 1. Rekap Akun & Saldo
    addSheet('Rekap Akun & Saldo',
      buildRekapSheet(coaFlat, balances, monthName),
      [{ wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]
    )

    // 2. Laba Rugi
    addSheet('Laba Rugi',
      buildLabaRugiSheet(coaFlat, balances, monthName),
      [{ wch: 5 }, { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 18 }]
    )

    // 3. Neraca
    addSheet('Neraca',
      buildNeracaSheet(coaFlat, ytdJournals, monthName),
      [{ wch: 5 }, { wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 18 }]
    )

    // 4. Arus Kas
    addSheet('Arus Kas',
      buildArusKasSheet(cashFlow, monthName),
      [{ wch: 40 }, { wch: 40 }, { wch: 18 }]
    )

    // 5. Jurnal Detail
    addSheet('Jurnal',
      buildJurnalSheet(monthJournals, monthName),
      [{ wch: 5 }, { wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 25 }, { wch: 25 }, { wch: 16 }, { wch: 16 }]
    )

    // 6. COA
    addSheet('COA',
      buildCOASheet(coaFlat),
      [{ wch: 10 }, { wch: 40 }, { wch: 10 }]
    )

    // Write and download
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' })
    saveAs(blob, `LAMPIRAN_LAPORAN_KEUANGAN_${monthName.toUpperCase()}_2026.xlsx`)

    return true
  } catch (err) {
    console.error('Export full report error:', err)
    alert('Gagal mengekspor laporan lengkap. Error: ' + err.message)
    return false
  }
}
