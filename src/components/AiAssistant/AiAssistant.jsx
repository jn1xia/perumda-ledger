import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, X, Send, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Bot, User, Loader2, Sparkles, ChevronDown, Trash2, Cpu, Wifi, WifiOff } from 'lucide-react'
import { useApp } from '../../context/AppContext.jsx'
import * as XLSX from 'xlsx'
import * as api from '../../services/api.js'
import { formatRupiah } from '../../data/sampleData.js'
import './AiAssistant.css'

// ─── Provider Registry ────────────────────────────────────────────────────────
const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    icon: '✨',
    keyLink: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIzaSy...',
    defaultModel: 'gemini-1.5-flash',
    models: [
      { value: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash',      free: true  },
      { value: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash',      free: true  },
      { value: 'gemini-1.5-flash-8b',   label: 'Gemini 1.5 Flash-8B',   free: true  },
      { value: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro',        free: false },
    ]
  },
  groq: {
    label: 'Groq (Llama / Mixtral)',
    icon: '⚡',
    keyLink: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      { value: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 70B Versatile', free: true },
      { value: 'llama-3.1-8b-instant',     label: 'Llama 3.1 8B Instant',    free: true },
      { value: 'mixtral-8x7b-32768',       label: 'Mixtral 8x7B',            free: true },
      { value: 'gemma2-9b-it',             label: 'Gemma 2 9B',              free: true },
      { value: 'llama3-70b-8192',          label: 'Llama 3 70B',             free: true },
    ]
  },
  openrouter: {
    label: 'OpenRouter (Free Models)',
    icon: '🔀',
    keyLink: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-v1-...',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
    models: [
      { value: 'meta-llama/llama-3.1-8b-instruct:free',     label: 'Llama 3.1 8B (Free)',      free: true },
      { value: 'meta-llama/llama-3.3-70b-instruct:free',    label: 'Llama 3.3 70B (Free)',     free: true },
      { value: 'google/gemma-2-9b-it:free',                 label: 'Gemma 2 9B (Free)',        free: true },
      { value: 'mistralai/mistral-7b-instruct:free',        label: 'Mistral 7B (Free)',        free: true },
      { value: 'microsoft/phi-3-mini-128k-instruct:free',   label: 'Phi-3 Mini 128K (Free)',   free: true },
      { value: 'qwen/qwen-2-7b-instruct:free',              label: 'Qwen 2 7B (Free)',         free: true },
    ]
  }
}

// Default embedded Gemini key
const DEFAULT_GEMINI_KEY = 'AIzaSyDdt8Cjf1zOThYhGxU-5cM7tSHLBGO2rIE'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function excelDate(sn, fallback = '2026-01-01') {
  if (typeof sn === 'number' && sn > 40000) return new Date((sn - 25569) * 86400 * 1000).toISOString().split('T')[0]
  if (typeof sn === 'string' && sn.match(/^\d{4}-\d{2}-\d{2}/)) return sn.split('T')[0]
  return fallback
}

function getCategory(code) {
  const c = String(code)
  if (c.startsWith('1')) return 'Aset'
  if (c.startsWith('2')) return 'Kewajiban'
  if (c.startsWith('3')) return 'Ekuitas'
  if (c.startsWith('4')) return 'Pendapatan'
  if (c.startsWith('5')) return 'HPP'
  if (c.startsWith('6') || c.startsWith('8') || c === '99999') return 'Beban'
  if (c.startsWith('7')) return 'Pendapatan'
  return 'Lainnya'
}

// ─── Build full data context for Gemini ───────────────────────────────────────
function buildDataContext(state) {
  const posted = (state.journals || []).filter(j => j.status === 'posted')
  const sumJ = (prefix, isDebit) => posted.reduce((s, j) => {
    const code = isDebit ? j.akun_debit?.split(' ')[0] : j.akun_kredit?.split(' ')[0]
    return s + (code?.startsWith(prefix) ? (isDebit ? j.debit : j.kredit) || 0 : 0)
  }, 0)

  const pendapatanUsaha = sumJ('41', false) + sumJ('42', false)
  const pendapatanNonOps = sumJ('7', false)
  const bpp = sumJ('51', true)
  const bebanAdmin = sumJ('61', true)
  const bebanOps = sumJ('62', true)
  const bebanNonOps = sumJ('8', true)
  const penyusutan = sumJ('6113', true)
  const jumlahBebanUsaha = bpp + bebanAdmin + bebanOps
  const labaUsaha = pendapatanUsaha - jumlahBebanUsaha
  const labaBersih = labaUsaha + (pendapatanNonOps - bebanNonOps)
  const ebitda = labaUsaha + penyusutan

  const piutang = state.piutang || []
  const hutang = state.hutang || []
  const assets = state.assets || []
  const inventory = state.inventory || []
  const anggaran = state.anggaran || []
  const journals = state.journals || []
  const coaFlat = state.coaFlat || []

  // Per-month journal breakdown
  const perBulan = {}
  journals.forEach(j => {
    const m = j.tanggal?.slice(0, 7)
    if (!m) return
    if (!perBulan[m]) perBulan[m] = { posted: 0, pending: 0, debit: 0, kredit: 0 }
    if (j.status === 'posted') { perBulan[m].posted++; perBulan[m].debit += j.debit || 0; perBulan[m].kredit += j.kredit || 0 }
    else perBulan[m].pending++
  })

  // Asset categories
  const asetByKat = {}
  assets.forEach(a => {
    const k = a.kategori || 'Lainnya'
    if (!asetByKat[k]) asetByKat[k] = { count: 0, perolehan: 0, penyusutan: 0, buku: 0 }
    asetByKat[k].count++
    asetByKat[k].perolehan += a.nilai_perolehan || 0
    asetByKat[k].penyusutan += a.nilai_penyusutan || 0
    asetByKat[k].buku += a.nilai_buku || 0
  })

  const pengaturan = state.pengaturan || {}

  return {
    perusahaan: {
      nama: pengaturan.namaPerusahaan || 'Perumda Pasar Baiman Banjarmasin',
      tahunFiskal: pengaturan.tahunFiskal || 'Januari',
      npwp: pengaturan.npwp || '-',
    },
    jurnal: {
      total: journals.length,
      posted: journals.filter(j => j.status === 'posted').length,
      pending: journals.filter(j => j.status === 'pending').length,
      totalDebitPosted: posted.reduce((s, j) => s + (j.debit || 0), 0),
      totalKreditPosted: posted.reduce((s, j) => s + (j.kredit || 0), 0),
      perBulan,
      sampel5Terakhir: journals.slice(-5).map(j => ({
        tanggal: j.tanggal, keterangan: j.keterangan,
        debit: j.debit, kredit: j.kredit, status: j.status,
        akunDebit: j.akun_debit, akunKredit: j.akun_kredit
      }))
    },
    labaRugi: {
      pendapatanUtama: sumJ('41', false),
      pendapatanLainnya: sumJ('42', false),
      pendapatanNonOps,
      pendapatanUsaha,
      bpp, bebanAdmin, bebanOps, bebanNonOps,
      jumlahBebanUsaha,
      labaUsaha, labaBersih, ebitda,
      penyusutan
    },
    coa: {
      total: coaFlat.length,
      byCategory: coaFlat.reduce((acc, a) => {
        acc[a.category] = (acc[a.category] || 0) + 1
        return acc
      }, {})
    },
    piutang: {
      total: piutang.length,
      jumlahTotal: piutang.reduce((s, p) => s + (p.jumlah || 0), 0),
      terbayarTotal: piutang.reduce((s, p) => s + (p.terbayar || 0), 0),
      sisaTotal: piutang.reduce((s, p) => s + (p.sisa || 0), 0),
      belumBayar: piutang.filter(p => p.status === 'belum').length,
      lunas: piutang.filter(p => p.status === 'lunas').length,
      jatuhTempoLewat: piutang.filter(p => {
        const now = new Date().toISOString().split('T')[0]
        return p.jatuhTempo && p.jatuhTempo < now && (p.sisa || 0) > 0
      }).length,
      daftarSingkat: piutang.slice(0, 10).map(p => ({
        pelanggan: p.pelanggan, jumlah: p.jumlah, sisa: p.sisa,
        status: p.status, jatuhTempo: p.jatuhTempo
      }))
    },
    hutang: {
      total: hutang.length,
      jumlahTotal: hutang.reduce((s, h) => s + (h.jumlah || 0), 0),
      terbayarTotal: hutang.reduce((s, h) => s + (h.terbayar || 0), 0),
      sisaTotal: hutang.reduce((s, h) => s + (h.sisa || 0), 0),
      belumBayar: hutang.filter(h => h.status === 'belum').length,
      lunas: hutang.filter(h => h.status === 'lunas').length,
      daftarSingkat: hutang.slice(0, 10).map(h => ({
        supplier: h.supplier, jumlah: h.jumlah, sisa: h.sisa,
        status: h.status, jatuhTempo: h.jatuhTempo
      }))
    },
    aset: {
      total: assets.length,
      nilaiPerolehanTotal: assets.reduce((s, a) => s + (a.nilai_perolehan || 0), 0),
      nilaiPenyusutanTotal: assets.reduce((s, a) => s + (a.nilai_penyusutan || 0), 0),
      nilaiBukuTotal: assets.reduce((s, a) => s + (a.nilai_buku || 0), 0),
      perKategori: asetByKat,
      daftarSingkat: assets.slice(0, 10).map(a => ({
        nama: a.nama, kategori: a.kategori, nilaiPerolehan: a.nilai_perolehan,
        nilaiBuku: a.nilai_buku, tglPerolehan: a.tgl_perolehan
      }))
    },
    persediaan: {
      total: inventory.length,
      nilaiTotal: inventory.reduce((s, i) => s + ((i.stok || 0) * (i.harga_satuan || 0)), 0),
      daftarSingkat: inventory.slice(0, 10).map(i => ({
        nama: i.nama, kategori: i.kategori, stok: i.stok,
        hargaSatuan: i.harga_satuan, satuan: i.satuan
      }))
    },
    anggaran: {
      total: anggaran.length,
      totalAnggaran: anggaran.reduce((s, a) => s + (a.anggaran_awal || 0), 0),
      totalRealisasi: anggaran.reduce((s, a) => s + (a.realisasi || 0), 0),
      perKategori: anggaran.reduce((acc, a) => {
        const k = a.kategori || 'Lainnya'
        if (!acc[k]) acc[k] = { anggaran: 0, realisasi: 0 }
        acc[k].anggaran += a.anggaran_awal || 0
        acc[k].realisasi += a.realisasi || 0
        return acc
      }, {})
    }
  }
}

// ─── Unified AI call — handles Gemini, Groq, OpenRouter ─────────────────────
async function callAI(provider, apiKey, model, systemPrompt, chatHistory, userMessage) {
  const prov = provider || 'gemini'
  const key  = apiKey || (prov === 'gemini' ? DEFAULT_GEMINI_KEY : '')
  if (!key) throw new Error(`API Key untuk ${prov} belum diisi di Pengaturan → AI & Integrasi`)

  // ── Gemini ──────────────────────────────────────────────────────────────────
  if (prov === 'gemini') {
    const provModels = PROVIDERS.gemini.models.map(m => m.value)
    const tryModels  = [model, ...provModels.filter(m => m !== model)]
    let lastErr = null
    for (const m of tryModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`
        const contents = [
          { role: 'user',  parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Siap! Data keuangan sudah saya baca.' }] },
          ...chatHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
          { role: 'user',  parts: [{ text: userMessage }] }
        ]
        const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } }) })
        const data = await res.json()
        if (data.error) {
          const msg = data.error.message || ''
          if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || res.status === 429) { lastErr = new Error(msg); continue }
          throw new Error(msg)
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) { lastErr = new Error('Respons kosong'); continue }
        return m !== model ? `_(via ${m})_\n\n${text}` : text
      } catch (e) {
        if (e.message.includes('quota') || e.message.includes('RESOURCE_EXHAUSTED')) { lastErr = e; continue }
        throw e
      }
    }
    throw lastErr || new Error('Semua model Gemini quota habis. Coba provider lain di Pengaturan.')
  }

  // ── Groq & OpenRouter — both OpenAI-compatible ────────────────────────────
  const isGroq       = prov === 'groq'
  const isOpenRouter = prov === 'openrouter'
  if (isGroq || isOpenRouter) {
    const url = isGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions'
    const messages = [
      { role: 'system',    content: systemPrompt },
      ...chatHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text })),
      { role: 'user',      content: userMessage }
    ]
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      ...(isOpenRouter ? { 'HTTP-Referer': 'https://perumda-ledger-scs9va.fly.dev', 'X-Title': 'Perumda Ledger' } : {})
    }
    const res  = await fetch(url, { method: 'POST', headers,
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1024 }) })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('Respons kosong dari provider')
    return text
  }

  throw new Error(`Provider tidak dikenal: ${prov}`)
}

// ─── Fetch rich context from backend (/api/ai-context) ──────────────────────
const AI_BASE = import.meta.env.PROD ? '/api/ai-context' : 'http://localhost:3001/api/ai-context'
let _ctxCache = null, _ctxCacheTs = 0
async function fetchAiContext() {
  // Cache for 60s to avoid repeated calls in same session
  if (_ctxCache && Date.now() - _ctxCacheTs < 60_000) return _ctxCache
  try {
    const res  = await fetch(AI_BASE, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    _ctxCache  = data
    _ctxCacheTs = Date.now()
    return data
  } catch { return null }
}

// ─── Full Report Engine for AI System Prompt ─────────────────────────────────
function buildSystemPrompt(state, richCtx = null) {
  const journals   = state.journals   || []
  const piutang    = state.piutang    || []
  const hutang     = state.hutang     || []
  const assets     = state.assets     || []
  const inventory  = state.inventory  || []
  const anggaran   = state.anggaran   || []
  const coaFlat    = state.coaFlat    || []
  const pengaturan = state.pengaturan || {}
  const namaPerusahaan = pengaturan.namaPerusahaan || 'Perumda Pasar Baiman Banjarmasin'

  const posted = journals.filter(j => j.status === 'posted')
  const rp = v => v < 0 ? `(${Math.abs(v).toLocaleString('id-ID')})` : v.toLocaleString('id-ID')

  const MONTH_NAMES = {'01':'Januari','02':'Februari','03':'Maret','04':'April','05':'Mei',
    '06':'Juni','07':'Juli','08':'Agustus','09':'September','10':'Oktober','11':'November','12':'Desember'}
  const mLabel = ym => { const [yr,mo]=ym.split('-'); return `${MONTH_NAMES[mo]||mo} ${yr}` }

  const allMonths = [...new Set(posted.map(j => j.tanggal?.slice(0,7)).filter(Boolean))].sort()

  // Sum journals by account prefix, optionally filtered to a list
  const sumBy = (jlist, prefix, isDebit) => jlist.reduce((s, j) => {
    const code = isDebit ? j.akun_debit?.split(' ')[0] : j.akun_kredit?.split(' ')[0]
    return s + ((code?.startsWith(prefix) ? (isDebit ? j.debit : j.kredit) || 0 : 0))
  }, 0)
  // Smart matcher for Pendapatan Bunga Bank (handles both 70001 and 70000+Bunga)
  const sumBungaBank = (jlist) => jlist.reduce((s, j) => {
    const code = j.akun_kredit?.split(' ')[0] || ''
    const name = j.akun_kredit || ''
    if (code === '70001' || (code === '70000' && /bunga/i.test(name))) s += j.kredit || 0
    return s
  }, 0)
  // Smart matcher for Beban Pajak Bank (handles both 80001 and 80000+Pajak)
  const sumPajakBank = (jlist) => jlist.reduce((s, j) => {
    const code = j.akun_debit?.split(' ')[0] || ''
    const name = j.akun_debit || ''
    if (code === '80001' || (code === '80000' && /pajak/i.test(name))) s += j.debit || 0
    return s
  }, 0)

  // ── Neraca Saldo (Trial Balance) cumulative per month ────────────────────────
  const cumulativeD = {}, cumulativeK = {}
  const neracaLines = []
  const PREFIX_LABEL = {'1':'Aset','2':'Kewajiban','3':'Ekuitas','4':'Pendapatan',
    '5':'HPP','6':'Beban Usaha','7':'Pend.Non-Ops','8':'Beban Non-Ops'}
  for (const ym of allMonths) {
    const monthJ = posted.filter(j => j.tanggal?.startsWith(ym))
    monthJ.forEach(j => {
      const dc = j.akun_debit?.split(' ')[0]  || ''
      const kc = j.akun_kredit?.split(' ')[0] || ''
      cumulativeD[dc] = (cumulativeD[dc] || 0) + (j.debit  || 0)
      cumulativeK[kc] = (cumulativeK[kc] || 0) + (j.kredit || 0)
    })
    const snap = {}
    const allCodes = new Set([...Object.keys(cumulativeD), ...Object.keys(cumulativeK)])
    allCodes.forEach(code => {
      if (!code || code.length < 2) return
      const p = code.slice(0,1)
      if (!snap[p]) snap[p] = { D: 0, K: 0 }
      snap[p].D += cumulativeD[code] || 0
      snap[p].K += cumulativeK[code] || 0
    })
    const rows = Object.entries(snap).sort().map(([p,v]) =>
      `    ${PREFIX_LABEL[p]||p}: D=Rp${rp(v.D)} K=Rp${rp(v.K)}`).join('\n')
    const totD = Object.values(snap).reduce((s,v)=>s+v.D,0)
    const totK = Object.values(snap).reduce((s,v)=>s+v.K,0)
    neracaLines.push(`  [${mLabel(ym)}]\n${rows}\n    TOTAL: D=Rp${rp(totD)} K=Rp${rp(totK)} ${totD===totK?'BALANCE':'SELISIH Rp'+rp(Math.abs(totD-totK))}`)
  }

  // ── Laba Rugi per month ──────────────────────────────────────────────────────
  const plLines = allMonths.map(ym => {
    const mj  = posted.filter(j => j.tanggal?.startsWith(ym))
    const pu  = sumBy(mj,'41',false) + sumBy(mj,'42',false)
    const bpp = sumBy(mj,'51',true)
    const ba  = sumBy(mj,'61',true)
    const bo  = sumBy(mj,'62',true)
    const pn  = sumBy(mj,'7', false)
    const bn  = sumBy(mj,'8', true)
    const ps  = sumBy(mj,'6113',true)
    const pb  = sumBungaBank(mj)
    const pjk = sumPajakBank(mj)
    const lu  = pu - bpp - ba - bo
    const lb  = lu + pn - bn
    const ebitda = lb - pb + pjk + ps
    return `  [${mLabel(ym)}]\n` +
      `    Pendapatan Usaha   : Rp${rp(pu)}\n` +
      `    HPP/BPP            : Rp${rp(bpp)}\n` +
      `    Beban Admin (61xx) : Rp${rp(ba)}\n` +
      `    Beban Ops   (62xx) : Rp${rp(bo)}\n` +
      `    Laba Usaha         : Rp${rp(lu)}\n` +
      `    Pend. Non-Ops      : Rp${rp(pn)}\n` +
      `    Beban Non-Ops      : Rp${rp(bn)}\n` +
      `    LABA BERSIH        : Rp${rp(lb)}\n` +
      `    EBITDA             : Rp${rp(ebitda)}`
  })

  // ── Neraca (Balance Sheet) per month cumulative ──────────────────────────────
  const neracaNeraca = allMonths.map(ym => {
    const mj = posted.filter(j => j.tanggal?.slice(0,7) <= ym)
    const aset      = sumBy(mj,'1',true)  - sumBy(mj,'1',false)
    const kewajiban = sumBy(mj,'2',false) - sumBy(mj,'2',true)
    const ekuitas   = sumBy(mj,'3',false) - sumBy(mj,'3',true)
    const labaBersih = (sumBy(mj,'41',false)+sumBy(mj,'42',false))
      - sumBy(mj,'51',true) - sumBy(mj,'61',true) - sumBy(mj,'62',true)
      + sumBy(mj,'7',false) - sumBy(mj,'8',true)
    return `  [${mLabel(ym)}] Aset=Rp${rp(aset)} | Kewajiban=Rp${rp(kewajiban)} | Ekuitas=Rp${rp(ekuitas)} | Laba=Rp${rp(labaBersih)}`
  })

  // ── YTD P&L ─────────────────────────────────────────────────────────────────
  const pu  = sumBy(posted,'41',false) + sumBy(posted,'42',false)
  const bpp = sumBy(posted,'51',true)
  const ba  = sumBy(posted,'61',true)
  const bo  = sumBy(posted,'62',true)
  const pn  = sumBy(posted,'7', false)
  const bn  = sumBy(posted,'8', true)
  const ps  = sumBy(posted,'6113',true)
  const pb  = sumBungaBank(posted)
  const pjk = sumPajakBank(posted)
  const lu  = pu - bpp - ba - bo
  const lb  = lu + pn - bn
  const ebitda = lb - pb + pjk + ps

  // ── Anggaran vs Realisasi ────────────────────────────────────────────────────
  const angKat = {}
  anggaran.forEach(a => {
    const k = a.kategori || 'Lainnya'
    if (!angKat[k]) angKat[k] = { ang: 0, real: 0 }
    angKat[k].ang  += a.anggaran_awal || 0
    angKat[k].real += a.realisasi     || 0
  })
  const angLines = Object.entries(angKat).map(([k,v]) =>
    `  ${k}: Anggaran=Rp${rp(v.ang)} Realisasi=Rp${rp(v.real)} Penyerapan=${v.ang>0?((v.real/v.ang)*100).toFixed(1):0}%`
  )

  // ── Aset Tetap breakdown ─────────────────────────────────────────────────────
  const asetKat = {}
  assets.forEach(a => {
    const k = a.kategori || 'Lainnya'
    if (!asetKat[k]) asetKat[k] = { count:0, perolehan:0, penyusutan:0, buku:0 }
    asetKat[k].count++
    asetKat[k].perolehan  += a.nilai_perolehan  || 0
    asetKat[k].penyusutan += a.nilai_penyusutan || 0
    asetKat[k].buku       += a.nilai_buku       || 0
  })
  const asetLines = Object.entries(asetKat).map(([k,v]) =>
    `  ${k}(${v.count}): Perolehan=Rp${rp(v.perolehan)} Penyusutan=Rp${rp(v.penyusutan)} NilaiBuku=Rp${rp(v.buku)}`
  )

  const totalD_all = posted.reduce((s,j)=>s+(j.debit||0),0)
  const totalK_all = posted.reduce((s,j)=>s+(j.kredit||0),0)
  const totalPiutangSisa  = piutang.reduce((s,p)=>s+(p.sisa||0),0)
  const totalHutangSisa   = hutang.reduce((s,h)=>s+(h.sisa||0),0)
  const totalAsetTetap    = assets.reduce((s,a)=>s+(a.nilai_buku||0),0)
  const totalPersediaan   = inventory.reduce((s,i)=>s+(i.stok||0)*(i.harga_satuan||0),0)

  return [
    `Kamu adalah AI Asisten Akuntansi untuk ${namaPerusahaan}.`,
    `Jawab dalam Bahasa Indonesia. Format angka: Rp xxx.xxx. Nilai negatif: (Rp xxx.xxx).`,
    `PENTING: Kamu MEMILIKI semua data laporan keuangan lengkap di bawah. GUNAKAN data ini secara LANGSUNG. JANGAN bilang tidak punya data karena datanya ada di sini.`,
    ``,
    `=== DATABASE ===`,
    `Jurnal: ${journals.length} total | Posted: ${posted.length} | Pending: ${journals.length-posted.length}`,
    `Debit Total=Rp${rp(totalD_all)} | Kredit Total=Rp${rp(totalK_all)} | ${totalD_all===totalK_all?'BALANCE':'TIDAK BALANCE'}`,
    `COA: ${coaFlat.length} akun | Bulan data: ${allMonths.map(mLabel).join(', ')||'(kosong)'}`,
    ``,
    `=== NERACA SALDO PER BULAN (kumulatif, per kategori akun) ===`,
    neracaLines.join('\n') || '  (kosong)',
    ``,
    `=== LAPORAN LABA RUGI PER BULAN (dari jurnal aktual) ===`,
    plLines.join('\n') || '  (kosong)',
    ``,
    `=== LABA RUGI YTD ===`,
    `Pendapatan Usaha: Rp${rp(pu)} | HPP/BPP: Rp${rp(bpp)} | B.Admin: Rp${rp(ba)} | B.Ops: Rp${rp(bo)}`,
    `Laba Usaha: Rp${rp(lu)} | Pend.NonOps: Rp${rp(pn)} | B.NonOps: Rp${rp(bn)}`,
    `LABA BERSIH YTD: Rp${rp(lb)} | EBITDA: Rp${rp(ebitda)}`,
    ``,
    `=== NERACA (BALANCE SHEET) PER BULAN — KUMULATIF ===`,
    neracaNeraca.join('\n') || '  (kosong)',
    ``,
    `=== ASET TETAP ===`,
    asetLines.join('\n') || '  (kosong)',
    `Total Nilai Buku Aset Tetap: Rp${rp(totalAsetTetap)}`,
    ``,
    `=== PERSEDIAAN ===`,
    `Total Nilai: Rp${rp(totalPersediaan)} | Jumlah item: ${inventory.length}`,
    inventory.slice(0,10).map(i=>`  ${i.nama||i.kode}: stok=${i.stok} x Rp${rp(i.harga_satuan||0)} = Rp${rp((i.stok||0)*(i.harga_satuan||0))}`).join('\n'),
    ``,
    `=== PIUTANG (${piutang.length} tagihan, sisa=Rp${rp(totalPiutangSisa)}) ===`,
    piutang.slice(0,20).map(p=>`  ${p.pelanggan||p.nama||'-'}: Rp${rp(p.sisa||0)} | JT:${p.jatuh_tempo||p.jatuhTempo||'-'} | ${p.status}`).join('\n') || '  (kosong)',
    ``,
    `=== HUTANG (${hutang.length} tagihan, sisa=Rp${rp(totalHutangSisa)}) ===`,
    hutang.slice(0,20).map(h=>`  ${h.supplier||h.nama||'-'}: Rp${rp(h.sisa||0)} | JT:${h.jatuh_tempo||h.jatuhTempo||'-'} | ${h.status}`).join('\n') || '  (kosong)',
    ``,
    `=== ANGGARAN vs REALISASI ===`,
    angLines.join('\n') || '  (kosong)',
    '=== ARUS KAS PER BULAN (Cash Flow) ===',
    ...allMonths.map(ym => {
      const mj = posted.filter(j => j.tanggal?.startsWith(ym))
      const cashAccounts = ['11101','11103','11104','11106','11107']
      let opIn=0,opOut=0,invIn=0,invOut=0,finIn=0,finOut=0
      mj.forEach(j => {
        const dc = j.akun_debit?.split(' ')[0]||'', kc = j.akun_kredit?.split(' ')[0]||''
        const isCashD = cashAccounts.some(c=>dc.startsWith(c)), isCashK = cashAccounts.some(c=>kc.startsWith(c))
        if (!isCashD && !isCashK) return
        const amt = j.debit||0, isCashIn = isCashD, other = isCashIn ? kc : dc
        let cat
        if (other.startsWith('4')||other.startsWith('6')||other.startsWith('21')||other.startsWith('112')) cat='op'
        else if (other.startsWith('12')||other.startsWith('114')) cat='inv'
        else if (other.startsWith('3')||other.startsWith('22')) cat='fin'
        else cat='op'
        if (cat==='op')  { isCashIn ? (opIn+=amt)  : (opOut+=amt)  }
        if (cat==='inv') { isCashIn ? (invIn+=amt)  : (invOut+=amt) }
        if (cat==='fin') { isCashIn ? (finIn+=amt)  : (finOut+=amt) }
      })
      const netOp=opIn-opOut, netInv=invIn-invOut, netFin=finIn-finOut
      return `  [${mLabel(ym)}] Operasional=${rp(netOp)} | Investasi=${rp(netInv)} | Pendanaan=${rp(netFin)} | Net=${rp(netOp+netInv+netFin)}`
    }),
    '',
    '=== ANALISIS RASIO KEUANGAN (YTD) ===',
    (() => {
      const calcBal = (prefix, isDebit) => posted.reduce((s,j)=>{
        const c=isDebit?j.akun_debit?.split(' ')[0]:j.akun_kredit?.split(' ')[0]
        return s+(c?.startsWith(prefix)?(isDebit?j.debit:j.kredit)||0:0)},0)
      const totalAset      = calcBal('1',true)  - calcBal('1',false)
      const totalKewajiban = calcBal('2',false) - calcBal('2',true)
      const totalEkuitas   = (calcBal('3',false) - calcBal('3',true)) + lb
      const kasBank        = calcBal('111',true) - calcBal('111',false) + calcBal('112',true) - calcBal('112',false)
      const piutangBal     = calcBal('113',true) - calcBal('113',false) + calcBal('114',true) - calcBal('114',false)
      const persediaanBal  = calcBal('115',true) - calcBal('115',false)
      const asetLancar     = kasBank + piutangBal + persediaanBal
      const currentRatio   = totalKewajiban > 0 ? (asetLancar/totalKewajiban).toFixed(2) : 'N/A'
      const dte            = totalEkuitas > 0 ? ((totalKewajiban/totalEkuitas)*100).toFixed(1) : 'N/A'
      const npm            = pu > 0 ? ((lb/pu)*100).toFixed(1) : 'N/A'
      const roa            = totalAset > 0 ? ((lb/totalAset)*100).toFixed(2) : 'N/A'
      const roe            = totalEkuitas > 0 ? ((lb/totalEkuitas)*100).toFixed(2) : 'N/A'
      const cashRatio      = totalKewajiban > 0 ? (kasBank/totalKewajiban).toFixed(2) : 'N/A'
      return [
        `  Current Ratio      : ${currentRatio}x (Aset Lancar Rp${rp(asetLancar)} / Kewajiban Rp${rp(totalKewajiban)})`,
        `  Debt to Equity     : ${dte}% (Kewajiban Rp${rp(totalKewajiban)} / Ekuitas Rp${rp(totalEkuitas)})`,
        `  Net Profit Margin  : ${npm}% (Laba Bersih Rp${rp(lb)} / Pendapatan Rp${rp(pu)})`,
        `  ROA                : ${roa}% (Laba Bersih / Total Aset Rp${rp(totalAset)})`,
        `  ROE                : ${roe}% (Laba Bersih / Total Ekuitas Rp${rp(totalEkuitas)})`,
        `  Cash Ratio         : ${cashRatio}x (Kas+Bank Rp${rp(kasBank)} / Kewajiban)`,
      ].join('\n')
    })(),
    '',
    '=== PERUBAHAN EKUITAS ===',
    (() => {
      const ekuitasAwal = posted.reduce((s,j)=>{
        const c=j.akun_kredit?.split(' ')[0]||''; return s+(c.startsWith('3')?(j.kredit||0):0)},0)
        - posted.reduce((s,j)=>{const c=j.akun_debit?.split(' ')[0]||''; return s+(c.startsWith('3')?(j.debit||0):0)},0)
      return [
        `  Ekuitas Dasar (akun 3xxx): Rp${rp(ekuitasAwal)}`,
        `  Laba Bersih Periode YTD : Rp${rp(lb)}`,
        `  Total Ekuitas           : Rp${rp(ekuitasAwal + lb)}`,
      ].join('\n')
    })(),
    richCtx ? buildRichSection(richCtx) : ''
  ].join('\n')
}


// ─── Append server-side rich context (DB detail + Excel summaries) ───────────
function buildRichSection(ctx) {
  if (!ctx?.ok) return ''
  const parts = []

  // Excel files available
  if (ctx.excelFiles?.length) {
    const fileList = ctx.excelFiles.map(f => {
      if (f.skipped) return `  - ${f.name} (${(f.sizeBytes/1024/1024).toFixed(1)}MB, terlalu besar untuk dibaca)`
      const sheets = f.sheetNames?.join(', ') || '-'
      return `  - ${f.name} | Sheets: ${sheets}`
    }).join('\n')
    parts.push(`\n\nFILE EXCEL TERSEDIA DI SERVER (src/FILES/):\n${fileList}`)
  }

  // Sample journal entries from DB
  if (ctx.db?.journals?.data?.length) {
    const samples = ctx.db.journals.data.slice(0, 10).map(j =>
      `  ${j.tanggal} | ${j.keterangan?.slice(0,40)} | D:${j.debit?.toLocaleString('id-ID')} K:${j.kredit?.toLocaleString('id-ID')} | ${j.status}`
    ).join('\n')
    parts.push(`\n\n10 JURNAL TERBARU (dari DB):\n${samples}`)
  }

  // Piutang detail
  if (ctx.db?.piutang?.data?.length) {
    const items = ctx.db.piutang.data.slice(0, 8).map(p =>
      `  ${p.pelanggan} | Rp${(p.sisa||0).toLocaleString('id-ID')} sisa | JT:${p.jatuh_tempo||'-'} | ${p.status}`
    ).join('\n')
    parts.push(`\n\nDETAIL PIUTANG:\n${items}`)
  }

  // Hutang detail
  if (ctx.db?.hutang?.data?.length) {
    const items = ctx.db.hutang.data.slice(0, 8).map(h =>
      `  ${h.supplier} | Rp${(h.sisa||0).toLocaleString('id-ID')} sisa | JT:${h.jatuh_tempo||'-'} | ${h.status}`
    ).join('\n')
    parts.push(`\n\nDETAIL HUTANG:\n${items}`)
  }

  // Excel sheet content samples
  if (ctx.excelFiles?.length) {
    for (const f of ctx.excelFiles.slice(0, 2)) {
      if (f.skipped || !f.sheets) continue
      const sheetSamples = Object.entries(f.sheets).slice(0, 3).map(([name, s]) => {
        if (!s.sample?.length) return ''
        const rows = s.sample.slice(0, 3).map(r => r.slice(0, 6).join(' | ')).join('\n    ')
        return `  Sheet "${name}" (${s.totalRows} baris):\n    ${rows}`
      }).filter(Boolean).join('\n')
      if (sheetSamples) parts.push(`\n\nSAMPLE DATA — ${f.name}:\n${sheetSamples}`)
    }
  }

  return parts.join('')
}




// ─── Offline pattern matching fallback ───────────────────────────────────────
function offlineResponse(input, state) {
  const text = input.toLowerCase().trim()
  const posted = (state.journals || []).filter(j => j.status === 'posted')
  const sumJ = (prefix, isDebit) => posted.reduce((s, j) => {
    const code = isDebit ? j.akun_debit?.split(' ')[0] : j.akun_kredit?.split(' ')[0]
    return s + (code?.startsWith(prefix) ? (isDebit ? j.debit : j.kredit) || 0 : 0)
  }, 0)
  const fmt = (v) => v < 0 ? `(${formatRupiah(Math.abs(v))})` : formatRupiah(v)

  if (text.match(/^(hi|hello|halo|hey|hai)/))
    return 'Halo! 👋 Saya dalam **mode offline** (tanpa API Key Gemini).\n\nUntuk mengaktifkan AI penuh, buka **Pengaturan → AI & Integrasi** dan masukkan Gemini API Key.\n\nSementara itu, coba: `ringkasan`, `laba rugi`, `piutang`, `hutang`, `aset`, atau `help`'

  if (text.match(/(help|bantuan|perintah)/))
    return '📋 **Mode Offline — Perintah tersedia:**\n\n• `ringkasan` — KPI semua modul\n• `jurnal` — Info per bulan\n• `laba rugi` — P&L YTD\n• `neraca saldo` — Trial balance\n• `piutang` — AR summary\n• `hutang` — AP summary\n• `aset` — Aset tetap\n• `persediaan` — Stok\n• `anggaran` — RKA vs realisasi\n\n💡 Aktifkan Gemini di **Pengaturan → AI & Integrasi** untuk pertanyaan bebas!'

  if (text.match(/(ringkasan|summary|overview)/)) {
    const j = state.journals || []
    const assets = state.assets || []; const inventory = state.inventory || []
    const piutang = state.piutang || []; const hutang = state.hutang || []
    const totalD = posted.reduce((s, x) => s + (x.debit || 0), 0)
    const totalK = posted.reduce((s, x) => s + (x.kredit || 0), 0)
    return `📊 **Ringkasan Sistem**\n\n| Modul | Jumlah | Nilai |\n|-------|--------|-------|\n| Jurnal | ${j.length} (${posted.length}P) | ${totalD === totalK ? '✅ Balance' : '⚠️ Tidak Balance'} |\n| COA | ${(state.coaFlat || []).length} akun | — |\n| Aset | ${assets.length} item | ${formatRupiah(assets.reduce((s, a) => s + (a.nilai_buku || 0), 0))} |\n| Persediaan | ${inventory.length} item | ${formatRupiah(inventory.reduce((s, i) => s + (i.stok || 0) * (i.harga_satuan || 0), 0))} |\n| Piutang | ${piutang.length} | sisa ${formatRupiah(piutang.reduce((s, p) => s + (p.sisa || 0), 0))} |\n| Hutang | ${hutang.length} | sisa ${formatRupiah(hutang.reduce((s, h) => s + (h.sisa || 0), 0))} |`
  }

  if (text.match(/laba|rugi|profit|ebitda/)) {
    const pu = sumJ('41', false) + sumJ('42', false), bpp = sumJ('51', true)
    const ba = sumJ('61', true), bo = sumJ('62', true), bn = sumJ('8', true)
    const pn = sumJ('7', false), ps = sumJ('6113', true)
    const lu = pu - bpp - ba - bo
    const lb = lu + pn - bn
    // Smart EBITDA: match both 70000+Bunga and 70001, and 80000+Pajak and 80001
    const pb = posted.reduce((s,j) => { const c=j.akun_kredit?.split(' ')[0]||''; const n=j.akun_kredit||''; return s+((c==='70001'||(c==='70000'&&/bunga/i.test(n)))?(j.kredit||0):0) }, 0)
    const pjk = posted.reduce((s,j) => { const c=j.akun_debit?.split(' ')[0]||''; const n=j.akun_debit||''; return s+((c==='80001'||(c==='80000'&&/pajak/i.test(n)))?(j.debit||0):0) }, 0)
    const ebitda = lb - pb + pjk + ps
    return `📈 **Laba Rugi YTD**\n\n| | |\n|---|---|\n| Pendapatan Usaha | ${fmt(pu)} |\n| Beban Usaha | (${formatRupiah(bpp + ba + bo)}) |\n| **Laba Usaha** | **${fmt(lu)}** |\n| Net Non-Ops | ${fmt(pn - bn)} |\n| **Laba Bersih** | **${fmt(lb)}** |\n| EBITDA | ${fmt(ebitda)} |`
  }

  if (text.match(/piutang/)) {
    const p = state.piutang || []
    return `💳 **Piutang** — ${p.length} tagihan\nSisa: **${formatRupiah(p.reduce((s, x) => s + (x.sisa || 0), 0))}**`
  }

  if (text.match(/hutang/)) {
    const h = state.hutang || []
    return `💸 **Hutang** — ${h.length} tagihan\nSisa: **${formatRupiah(h.reduce((s, x) => s + (x.sisa || 0), 0))}**`
  }

  if (text.match(/aset/)) {
    const a = state.assets || []
    return `🏗️ **Aset** — ${a.length} item\nNilai Buku: **${formatRupiah(a.reduce((s, x) => s + (x.nilai_buku || 0), 0))}**`
  }

  if (text.match(/persediaan|stok/)) {
    const inv = state.inventory || []
    return `📦 **Persediaan** — ${inv.length} item\nNilai: **${formatRupiah(inv.reduce((s, i) => s + (i.stok || 0) * (i.harga_satuan || 0), 0))}**`
  }

  if (text.match(/anggaran|rka/)) {
    const ang = state.anggaran || []
    const ta = ang.reduce((s, a) => s + (a.anggaran_awal || 0), 0)
    const tr = ang.reduce((s, a) => s + (a.realisasi || 0), 0)
    return `📋 **Anggaran** — Realisasi ${ta > 0 ? ((tr / ta) * 100).toFixed(1) : 0}%\nAnggaran: ${formatRupiah(ta)} | Realisasi: ${formatRupiah(tr)}`
  }

  if (text.match(/jurnal/)) {
    const j = state.journals || []
    const months = {}
    j.forEach(x => {
      const m = x.tanggal?.slice(0, 7); if (!m) return
      if (!months[m]) months[m] = { posted: 0, pending: 0 }
      x.status === 'posted' ? months[m].posted++ : months[m].pending++
    })
    return `📝 **Jurnal** — ${j.length} total\n\n${Object.entries(months).sort().map(([k, v]) => `• **${k}**: ${v.posted}P / ${v.pending}W`).join('\n')}`
  }

  if (text.match(/neraca saldo/)) {
    const totalD = posted.reduce((s, j) => s + (j.debit || 0), 0)
    const totalK = posted.reduce((s, j) => s + (j.kredit || 0), 0)
    return `📊 **Neraca Saldo**\n\nTotal Debit: ${formatRupiah(totalD)}\nTotal Kredit: ${formatRupiah(totalK)}\n${totalD === totalK ? '✅ Balance' : `⚠️ Selisih: ${formatRupiah(Math.abs(totalD - totalK))}`}`
  }

  return '❓ Maaf, saya tidak mengerti.\n\nKetik **"help"** atau aktifkan Gemini di **Pengaturan → AI & Integrasi** untuk pertanyaan bebas. 🤖'
}

// ─── Smart Parsers ────────────────────────────────────────────────────────────
function detectAndParse(wb, coaFlat) {
  const results = {}
  const sheets = wb.SheetNames.map(s => s.toUpperCase())

  if (sheets.includes('COA')) {
    const ws = wb.Sheets[wb.SheetNames[sheets.indexOf('COA')]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const accounts = []
    for (const row of raw) {
      const [code, name] = row
      if (!code || typeof name !== 'string' || !name) continue
      const cs = String(code)
      if (!cs.match(/^\d{4,5}(\.?\d)?$/)) continue
      accounts.push({ code: cs, name: name.trim(), type: 'posting', category: getCategory(cs), saldo_awal: 0 })
    }
    if (accounts.length > 0) results.coa = accounts
  }

  const saldoSheet = wb.SheetNames.find(s => s.toLowerCase().includes('saldo') || s.toLowerCase().includes('rekap akun'))
  if (saldoSheet) {
    const ws = wb.Sheets[saldoSheet]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const saldos = {}
    for (let i = 1; i < raw.length; i++) {
      const [code, name, , saldoAwal] = raw[i]
      if (!code || !name) continue
      const cs = String(code)
      if (!cs.match(/^\d/)) continue
      saldos[cs] = { code: cs, name: String(name).trim(), saldo_awal: typeof saldoAwal === 'number' ? saldoAwal : 0 }
    }
    if (Object.keys(saldos).length > 0) results.saldoAwal = saldos
  }

  const anggaranSheets = ['Penerimaan', 'Investasi', 'Beban Umum', 'Beban Operasional']
  const catMap = { 'Penerimaan': 'Penerimaan', 'Investasi': 'Investasi', 'Beban Umum': 'Beban Umum & Administrasi', 'Beban Operasional': 'Beban Operasional' }
  const anggaranItems = []
  for (const sn of anggaranSheets) {
    const ws = wb.Sheets[sn]; if (!ws) continue
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    for (let i = 2; i < raw.length; i++) {
      const row = raw[i]; const kode = row[0], nama = row[1], anggaran = row[2]
      if (!kode || !nama || typeof anggaran !== 'number') continue
      anggaranItems.push({ kode: String(kode).trim(), nama: String(nama).trim(), kategori: catMap[sn] || sn, anggaran_awal: anggaran, target_bulan: Math.round(anggaran / 12), realisasi: 0, bulan: 0 })
    }
  }
  if (anggaranItems.length > 0) results.anggaran = anggaranItems

  const asetSheet = wb.SheetNames.find(s => s.toUpperCase().includes('AKTIVA') || s.toUpperCase().includes('ASET'))
  if (asetSheet) {
    const ws = wb.Sheets[asetSheet]; const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const assets = []; let kat = 'Peralatan'
    for (let i = 5; i < raw.length; i++) {
      const row = raw[i], no = row[0], nama = row[1] || ''
      if (typeof no === 'string' && no.match(/^[IV]+\./)) {
        if (nama.includes('TANAH')) kat = 'Tanah'
        else if (nama.includes('BANGUNAN')) kat = 'Bangunan'
        else if (nama.includes('KENDARAAN')) kat = 'Kendaraan'
        else if (nama.includes('MESIN')) kat = 'Mesin'
        else if (nama.includes('PERALATAN')) kat = 'Peralatan'
        continue
      }
      if (typeof no !== 'number' || !nama) continue
      assets.push({
        kode: `AT-${String(assets.length + 1).padStart(3, '0')}`,
        nama: nama.trim(), detail: String(row[2] || '').trim(), kategori: kat,
        tgl_perolehan: excelDate(row[3], '2025-01-01'),
        nilai_perolehan: Number(row[4]) || 0, penyusutan_per_tahun: Number(row[6]) || 0,
        penyusutan_per_bulan: Number(row[7]) || 0, beban_penyusutan_2025: Number(row[8]) || 0,
        nilai_penyusutan: Number(row[9]) || 0, nilai_buku: Number(row[10]) || 0,
        umur_manfaat: kat === 'Tanah' ? '-' : (kat === 'Bangunan' ? '20 tahun' : '8 tahun'),
        keterangan: String(row[20] || '').trim()
      })
    }
    if (assets.length > 0) results.aset = assets
  }

  const nameToCode = {}
  ;(coaFlat || []).forEach(a => { nameToCode[a.name.toLowerCase()] = a.code })
  const entries = []
  for (const sn of wb.SheetNames) {
    if (!sn.toUpperCase().startsWith('JURNAL') && !sn.toUpperCase().includes('JOURNAL')) continue
    const ws = wb.Sheets[sn]; const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    let headerIdx = -1
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      const rowStr = raw[i].map(c => String(c).toLowerCase()).join(' ')
      if (rowStr.includes('debit') || rowStr.includes('kredit') || rowStr.includes('tanggal')) { headerIdx = i; break }
    }
    const startRow = headerIdx >= 0 ? headerIdx + 1 : 3
    const isAprilFormat = raw[startRow] && typeof raw[startRow][5] === 'number'
    if (isAprilFormat) {
      for (let i = startRow; i < Math.min(raw.length, 500); i += 2) {
        const dr = raw[i], cr = raw[i + 1]; if (!dr || !cr) continue
        const adc = dr[0], adn = dr[3] || '', da = dr[5] || 0, ket = dr[7] || ''
        const akc = cr[0], akn = cr[3] || '', ka = cr[6] || 0
        if (!adc || !akc || (!da && !ka)) continue
        entries.push({ tanggal: excelDate(dr[2], '2026-04-01'), keterangan: String(ket).trim(), debit: Number(da) || Number(ka) || 0, kredit: Number(ka) || Number(da) || 0, status: 'posted', akun_debit: `${adc} - ${adn}`, akun_kredit: `${akc} - ${akn}`, bukti: String(dr[2] || '') })
      }
    } else {
      const groups = []; let curDate = null, curRows = []
      for (let i = startRow; i < raw.length; i++) {
        const d = raw[i][0]; if (!d || typeof d !== 'number') continue
        if (curDate !== null && d !== curDate) { groups.push({ dateSN: curDate, rows: curRows }); curRows = [] }
        curDate = d; curRows.push(raw[i])
      }
      if (curRows.length > 0) groups.push({ dateSN: curDate, rows: curRows })
      groups.forEach(g => {
        const tanggal = excelDate(g.dateSN, '2026-01-01'); const debits = [], credits = []
        g.rows.forEach(r => {
          const name = r[2] || '', code = nameToCode[name.toLowerCase()], da = r[4] || 0, ka = r[5] || 0
          if (da > 0) debits.push({ name, code, amount: Number(da), ket: r[6] || '' })
          if (ka > 0) credits.push({ name, code, amount: Number(ka), ket: r[6] || '' })
        })
        if (debits.length === 1 && credits.length === 1) {
          const d = debits[0], c = credits[0]
          entries.push({ tanggal, keterangan: d.ket || c.ket || d.name, debit: d.amount, kredit: c.amount, status: 'posted', akun_debit: d.code ? `${d.code} - ${d.name}` : d.name, akun_kredit: c.code ? `${c.code} - ${c.name}` : c.name })
        } else {
          debits.forEach(d => {
            const c = credits[0] || { name: 'Unknown', code: '' }
            entries.push({ tanggal, keterangan: d.ket || d.name, debit: d.amount, kredit: d.amount, status: 'posted', akun_debit: d.code ? `${d.code} - ${d.name}` : d.name, akun_kredit: c.code ? `${c.code} - ${c.name}` : c.name })
          })
        }
      })
    }
  }
  if (entries.length > 0) results.jurnal = entries

  const piutangSheet = wb.SheetNames.find(s => s.toUpperCase().includes('PIUTANG'))
  if (piutangSheet) {
    const ws = wb.Sheets[piutangSheet]; const raw = XLSX.utils.sheet_to_json(ws)
    const items = raw.filter(r => r['Pelanggan'] || r['Nama'] || r['Customer']).map((r, i) => ({
      id: `AR-AI-${i + 1}`, pelanggan: r['Pelanggan'] || r['Nama'] || r['Customer'] || '',
      nominal: Number(r['Nominal'] || r['Jumlah'] || r['Amount'] || 0),
      sisa: Number(r['Sisa'] || r['Outstanding'] || r['Nominal'] || r['Jumlah'] || 0),
      jatuh_tempo: r['Jatuh Tempo'] || r['Due Date'] || '', keterangan: r['Keterangan'] || r['Ket'] || ''
    }))
    if (items.length > 0) results.piutang = items
  }

  const hutangSheet = wb.SheetNames.find(s => s.toUpperCase().includes('HUTANG') || s.toUpperCase().includes('PAYABLE'))
  if (hutangSheet) {
    const ws = wb.Sheets[hutangSheet]; const raw = XLSX.utils.sheet_to_json(ws)
    const items = raw.filter(r => r['Supplier'] || r['Nama'] || r['Vendor']).map((r, i) => ({
      id: `AP-AI-${i + 1}`, supplier: r['Supplier'] || r['Nama'] || r['Vendor'] || '',
      nominal: Number(r['Nominal'] || r['Jumlah'] || r['Amount'] || 0),
      sisa: Number(r['Sisa'] || r['Outstanding'] || r['Nominal'] || r['Jumlah'] || 0),
      jatuh_tempo: r['Jatuh Tempo'] || r['Due Date'] || '', keterangan: r['Keterangan'] || r['Ket'] || ''
    }))
    if (items.length > 0) results.hutang = items
  }

  const invSheet = wb.SheetNames.find(s => s.toUpperCase().includes('PERSEDIAAN') || s.toUpperCase().includes('INVENTORY') || s.toUpperCase().includes('STOK'))
  if (invSheet) {
    const ws = wb.Sheets[invSheet]; const raw = XLSX.utils.sheet_to_json(ws)
    const items = raw.filter(r => r['Kode'] || r['Nama']).map(r => ({
      kode: String(r['Kode'] || '').trim(), nama: String(r['Nama'] || r['Nama Barang'] || '').trim(),
      kategori: r['Kategori'] || 'Umum', satuan: r['Satuan'] || r['Unit'] || 'pcs',
      stok: Number(r['Stok'] || r['Qty'] || r['Jumlah'] || 0),
      harga_satuan: Number(r['Harga'] || r['Harga Satuan'] || r['Price'] || 0)
    })).filter(i => i.nama)
    if (items.length > 0) results.persediaan = items
  }

  return results
}

// ─── Module labels ─────────────────────────────────────────────────────────────
const MODULE_LABELS = {
  coa: { icon: '📊', label: 'Chart of Accounts', color: '#6366f1' },
  saldoAwal: { icon: '💰', label: 'Saldo Awal', color: '#f59e0b' },
  anggaran: { icon: '📋', label: 'Anggaran (RKA)', color: '#8b5cf6' },
  aset: { icon: '🏗️', label: 'Aset Tetap', color: '#10b981' },
  jurnal: { icon: '📝', label: 'Jurnal Transaksi', color: '#3b82f6' },
  piutang: { icon: '💳', label: 'Piutang (AR)', color: '#ec4899' },
  hutang: { icon: '💸', label: 'Hutang (AP)', color: '#ef4444' },
  persediaan: { icon: '📦', label: 'Persediaan', color: '#14b8a6' },
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AiAssistant() {
  const { state, refreshData } = useApp()
  const provider  = state.pengaturan?.aiProvider || 'gemini'
  const pInfo     = PROVIDERS[provider] || PROVIDERS.gemini
  const apiKey    = (provider === 'gemini'
    ? (state.pengaturan?.geminiApiKey?.trim() || DEFAULT_GEMINI_KEY)
    : state.pengaturan?.[`${provider}ApiKey`]?.trim()) || ''
  const model     = state.pengaturan?.[`${provider}Model`] || pInfo.defaultModel
  const isOnline  = Boolean(apiKey)

  const welcomeText = isOnline
    ? `🤖 **${pInfo.label} aktif!** (${model})\n\nSaya sudah membaca semua data keuangan Anda. Tanya apa saja dalam Bahasa Indonesia!\n\nContoh: _"Jelaskan kondisi keuangan perusahaan saat ini"_, _"Ada transaksi anomali?"_, _"Berapa sisa piutang?"_`
    : `👋 **AI Assistant** (Mode Offline)\n\nBuka **Pengaturan → AI & Integrasi** untuk aktifkan AI.\n\nSementara itu ketik: \`ringkasan\`, \`laba rugi\`, \`piutang\`, \`aset\`, atau \`help\``

  const [open, setOpen]             = useState(false)
  const [messages, setMessages]     = useState([{ id: 0, role: 'ai', time: new Date(), text: welcomeText }])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [importing, setImporting]   = useState(false)
  const [dragOver, setDragOver]     = useState(false)
  // Chat history for Gemini (role: user/model, text only)
  const [chatHistory, setChatHistory] = useState([])

  const chatRef  = useRef(null)
  const fileRef  = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages])
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])

  const addMsg = useCallback((role, text, extra = {}) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), role, text, time: new Date(), ...extra }])
  }, [])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userText = input.trim()
    setInput('')
    addMsg('user', userText)
    setLoading(true)

    if (isOnline) {
      // ── AI mode (multi-provider) ─────────────────────────────────────────
      try {
        const richCtx      = await fetchAiContext()
        const systemPrompt = buildSystemPrompt(state, richCtx)
        const responseText = await callAI(provider, apiKey, model, systemPrompt, chatHistory, userText)
        addMsg('ai', responseText)
        setChatHistory(prev => [...prev,
          { role: 'user', text: userText },
          { role: 'model', text: responseText }
        ].slice(-20))
      } catch (err) {
        addMsg('ai', `❌ **${pInfo.label} Error:** ${err.message}\n\nCek API Key & model di **Pengaturan → AI & Integrasi**.`)
      }
    } else {
      // ── Offline mode ─────────────────────────────────────────────────────
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400))
      addMsg('ai', offlineResponse(userText, state))
    }
    setLoading(false)
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  const handleFileUpload = (file) => {
    if (!file) return
    addMsg('user', `📎 Uploaded: **${file.name}**`, { isFile: true })
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const sheetNames = wb.SheetNames.join(', ')
        addMsg('ai', `📂 File dibaca!\n\n**Sheets:** ${sheetNames}\n\nMenganalisis...`)
        await new Promise(r => setTimeout(r, 600))
        const parsed = detectAndParse(wb, state.coaFlat)
        const modules = Object.keys(parsed).filter(k => k !== '_raw')
        if (modules.length === 0) {
          addMsg('ai', '❌ Tidak ada data yang dikenali.\n\nPastikan sheet bernama: **COA, Jurnal, Piutang, Hutang, Aset, Persediaan, Anggaran**')
          setLoading(false); return
        }
        const summary = modules.map(m => {
          const info = MODULE_LABELS[m] || { icon: '📄', label: m }
          const count = Array.isArray(parsed[m]) ? parsed[m].length : Object.keys(parsed[m]).length
          return `${info.icon} **${info.label}**: ${count} item`
        }).join('\n')

        // If Gemini active, ask Gemini to describe the data
        let geminiInsight = ''
        if (isOnline) {
          try {
            const richCtx = await fetchAiContext()
            const sp = buildSystemPrompt(state, richCtx)
            geminiInsight = '\n\n' + await callAI(provider, apiKey, model, sp, [],
              `File Excel baru diupload dengan data berikut:\n${summary}\n\nBerikan analisis singkat tentang data yang diupload ini dalam 2-3 kalimat.`)
          } catch { /* ignore */ }
        }

        addMsg('ai', `✅ **Analisis selesai!**\n\n${summary}${geminiInsight}\n\nKlik **"Import Semua"** atau pilih modul tertentu.`, { importData: parsed, modules })
        setPendingImport(parsed)
      } catch (err) {
        addMsg('ai', `❌ Gagal membaca: ${err.message}`)
      } finally { setLoading(false) }
    }
    reader.readAsBinaryString(file)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) handleFileUpload(file)
    else addMsg('ai', '⚠️ Upload file Excel (.xlsx atau .xls)')
  }

  const handleImport = async (modules = null) => {
    if (!pendingImport) return
    setImporting(true)
    const toImport = modules || Object.keys(pendingImport).filter(k => k !== '_raw')
    addMsg('ai', `⏳ Mengimport ${toImport.length} modul...`)
    const results = []
    try {
      for (const mod of toImport) {
        const data = pendingImport[mod]; if (!data) continue
        const info = MODULE_LABELS[mod] || { icon: '📄', label: mod }
        try {
          switch (mod) {
            case 'coa':
              for (const acc of data) { try { await api.apiCreateCOA(acc) } catch (e) { if (!e.message.includes('sudah')) throw e } }
              results.push(`${info.icon} ${info.label}: ${data.length} akun ✅`); break
            case 'saldoAwal':
              for (const [code, sa] of Object.entries(data)) { try { await api.apiUpdateCOA(code, { saldo_awal: sa.saldo_awal }) } catch {} }
              results.push(`${info.icon} ${info.label}: ${Object.keys(data).length} akun ✅`); break
            case 'anggaran':
              for (const a of data) { try { await api.apiUpsertAnggaran(a) } catch {} }
              results.push(`${info.icon} ${info.label}: ${data.length} item ✅`); break
            case 'aset':
              for (const a of data) { try { await api.apiCreateAsset(a) } catch {} }
              results.push(`${info.icon} ${info.label}: ${data.length} aset ✅`); break
            case 'jurnal':
              const chunks = []; const chunkSize = 50
              for (let i = 0; i < data.length; i += chunkSize) chunks.push(data.slice(i, i + chunkSize))
              for (const ch of chunks) { try { await api.apiCreateJournalsBulk(ch) } catch {} }
              results.push(`${info.icon} ${info.label}: ${data.length} entri ✅`); break
            case 'piutang':
              for (const p of data) { try { await api.apiCreatePiutang(p) } catch {} }
              results.push(`${info.icon} ${info.label}: ${data.length} entri ✅`); break
            case 'hutang':
              for (const h of data) { try { await api.apiCreateHutang(h) } catch {} }
              results.push(`${info.icon} ${info.label}: ${data.length} entri ✅`); break
            case 'persediaan':
              for (const item of data) { try { await api.apiUpsertInventory(item) } catch {} }
              results.push(`${info.icon} ${info.label}: ${data.length} item ✅`); break
          }
        } catch (err) { results.push(`${info.icon} ${info.label}: ❌ ${err.message}`) }
      }
      await refreshData('all')
      addMsg('ai', `🎉 **Import selesai!**\n\n${results.join('\n')}\n\nData tersinkron ke semua modul.`)
      setPendingImport(null)
    } catch (err) {
      addMsg('ai', `❌ Import gagal: ${err.message}\n\n${results.join('\n')}`)
    } finally { setImporting(false) }
  }

  const renderMarkdown = (text) => {
    return text.split('\n').map((line, i) => {
      line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      line = line.replace(/_(.+?)_/g, '<em>$1</em>')
      line = line.replace(/`(.+?)`/g, '<code>$1</code>')
      if (line.match(/^[•\-]\s/)) line = `<span style="padding-left:8px">${line}</span>`
      if (line.includes('|')) {
        const cells = line.split('|').filter(c => c.trim())
        if (cells.every(c => c.trim().match(/^-+$/))) return null
        return <div key={i} style={{ display: 'flex', gap: 4, fontSize: 12, padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {cells.map((c, ci) => <span key={ci} style={{ flex: ci === 0 ? 2 : 1, fontWeight: ci === 0 ? 500 : 400 }}>{c.trim()}</span>)}
        </div>
      }
      return <div key={i} dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} style={{ lineHeight: 1.6 }} />
    }).filter(Boolean)
  }

  return (
    <>
      {/* FAB */}
      <button className={`ai-fab ${open ? 'ai-fab--open' : ''}`} onClick={() => setOpen(!open)} title="AI Assistant">
        {open ? <X size={22} /> : <><Sparkles size={20} className="ai-fab-sparkle" /><MessageCircle size={22} /></>}
      </button>

      {open && (
        <div className={`ai-panel ${dragOver ? 'ai-panel--dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}>

          {/* Header */}
          <div className="ai-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="ai-avatar-header"><Bot size={18} /></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  AI Assistant
                   {isOnline
                    ? <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(16,185,129,0.3)' }}>● {pInfo.label}</span>
                    : <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.2)', color: '#f59e0b', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(245,158,11,0.3)' }}>○ Offline</span>
                  }
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{isOnline ? model : 'Pengaturan → AI & Integrasi'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="ai-header-btn" onClick={() => { setMessages([messages[0]]); setPendingImport(null); setChatHistory([]) }} title="Bersihkan chat">
                <Trash2 size={14} />
              </button>
              <button className="ai-header-btn" onClick={() => setOpen(false)}><ChevronDown size={16} /></button>
            </div>
          </div>

          {/* Drag overlay */}
          {dragOver && (
            <div className="ai-drag-overlay">
              <FileSpreadsheet size={48} />
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 8 }}>Drop file Excel di sini</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>.xlsx atau .xls</div>
            </div>
          )}

          {/* Messages */}
          <div className="ai-messages" ref={chatRef}>
            {messages.map(msg => (
              <div key={msg.id} className={`ai-msg ai-msg--${msg.role}`}>
                <div className={`ai-msg-avatar ai-msg-avatar--${msg.role}`}>
                  {msg.role === 'ai' ? <Bot size={14} /> : <User size={14} />}
                </div>
                <div className={`ai-msg-bubble ai-msg-bubble--${msg.role}`}>
                  <div className="ai-msg-content">{renderMarkdown(msg.text)}</div>
                  {msg.importData && (
                    <div className="ai-import-actions">
                      <div className="ai-import-modules">
                        {msg.modules?.filter(m => m !== '_raw').map(m => {
                          const info = MODULE_LABELS[m] || { icon: '📄', label: m, color: '#888' }
                          const count = Array.isArray(msg.importData[m]) ? msg.importData[m].length : Object.keys(msg.importData[m]).length
                          return (
                            <button key={m} className="ai-module-chip" style={{ '--chip-color': info.color }}
                              onClick={() => handleImport([m])} disabled={importing}>
                              <span>{info.icon}</span><span>{info.label} ({count})</span>
                            </button>
                          )
                        })}
                      </div>
                      <button className="ai-import-all-btn" onClick={() => handleImport()} disabled={importing}>
                        {importing ? <><Loader2 size={14} className="spin" /> Importing...</> : <><CheckCircle2 size={14} /> Import Semua</>}
                      </button>
                    </div>
                  )}
                  <div className="ai-msg-time">{msg.time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-msg ai-msg--ai">
                <div className="ai-msg-avatar ai-msg-avatar--ai"><Bot size={14} /></div>
                <div className="ai-msg-bubble ai-msg-bubble--ai">
                  <div className="ai-typing"><span /><span /><span /></div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="ai-input-area">
            <button className="ai-upload-btn" onClick={() => fileRef.current?.click()} title="Upload Excel">
              <Upload size={16} />
            </button>
            <input ref={inputRef} type="text" className="ai-input"
              placeholder={isOnline ? 'Tanya apa saja tentang keuangan...' : 'Ketik perintah atau upload Excel...'}
              value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} />
            <button className="ai-send-btn" onClick={handleSend} disabled={!input.trim() || loading}>
              <Send size={16} />
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); e.target.value = '' }} />
          </div>
        </div>
      )}
    </>
  )
}
