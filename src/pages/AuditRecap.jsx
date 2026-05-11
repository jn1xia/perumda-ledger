import React from 'react';
import { CheckCircle2, Info, BookOpen, BarChart3, FileText, Settings, ShieldCheck, Zap } from 'lucide-react';

const AuditRecap = () => {
  const points = [
    {
      id: 1,
      title: "Integrasi COA Perumda",
      desc: "Sinkronisasi penuh Chart of Accounts (COA) dari sheet Excel 'COA'.",
      status: "Implemented",
      useCase: "Memastikan setiap transaksi jurnal menggunakan kode akun resmi yang diakui oleh divisi keuangan untuk mempermudah konsolidasi laporan tahunan.",
      icon: <BookOpen className="text-blue-500" />
    },
    {
      id: 2,
      title: "Anggaran & Realisasi (LRA)",
      desc: "Penyajian 3 kolom realisasi: Bulan Lalu, Bulan Ini, dan YTD (Year-to-Date).",
      status: "Implemented",
      useCase: "Manajer keuangan dapat memantau penyerapan anggaran secara real-time dan mendeteksi deviasi anggaran sebelum melampaui batas plafon tahunan.",
      icon: <BarChart3 className="text-green-500" />
    },
    {
      id: 3,
      title: "Data Transaksi Audit",
      desc: "Import otomatis data jurnal audit Januari dan April 2026.",
      status: "Implemented",
      useCase: "Tim audit dapat melakukan trial error data secara realtime untuk mencari selisih angka antara sistem digital dengan catatan manual/Excel.",
      icon: <FileText className="text-purple-500" />
    },
    {
      id: 4,
      title: "Saldo Awal Audited 2025",
      desc: "Penetapan Saldo Awal 2026 berdasarkan Laporan Audited 2025 (PDF LAI).",
      status: "Implemented",
      useCase: "Menjamin kontinuitas data keuangan dari tahun sebelumnya sehingga neraca awal 2026 memiliki dasar hukum yang kuat (Audited).",
      icon: <ShieldCheck className="text-amber-500" />
    },
    {
      id: 5,
      title: "Manajemen Aset & Penyusutan",
      desc: "Modul Aktiva Tetap dengan perhitungan penyusutan bulanan otomatis.",
      status: "Implemented",
      useCase: "Menghitung beban penyusutan setiap bulan secara otomatis tanpa perlu entri manual, memastikan nilai buku aset selalu akurat di neraca.",
      icon: <Settings className="text-slate-500" />
    },
    {
      id: 6,
      title: "Pelaporan Periodik (TW & Semester)",
      desc: "Support laporan per Triwulan (I, II, III, IV), Semester, dan Tahunan.",
      status: "Implemented",
      useCase: "Memudahkan penyusunan laporan rutin untuk rapat dewan pengawas atau stakeholder luar tanpa perlu mengolah data secara manual di Excel.",
      icon: <Zap className="text-yellow-500" />
    }
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Compliance & Audit Recap</h1>
          <p className="text-slate-500">Kesesuaian Sistem dengan Request Divisi Keuangan</p>
        </div>
        <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg flex items-center gap-2 border border-blue-100">
          <ShieldCheck size={20} />
          <span className="font-semibold">Audit Ready</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {points.map((p) => (
          <div key={p.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex gap-4 mb-4">
              <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center shrink-0">
                {p.icon}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">{p.id}. {p.title}</h3>
                <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full w-fit mt-1">
                  <CheckCircle2 size={12} /> {p.status}
                </div>
              </div>
            </div>
            
            <p className="text-slate-600 text-sm mb-4 leading-relaxed">
              {p.desc}
            </p>

            <div className="bg-slate-50 p-3 rounded-lg border-l-4 border-blue-400">
              <div className="text-xs font-bold text-blue-600 uppercase mb-1 flex items-center gap-1">
                <Info size={12} /> Use Case / Contoh Penggunaan
              </div>
              <p className="text-slate-700 text-sm italic">
                "{p.useCase}"
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 bg-slate-800 text-white p-8 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-xl font-bold mb-2">Status Deployment</h2>
          <p className="text-slate-300 text-sm mb-6 max-w-2xl">
            Sistem saat ini sudah menggunakan database server-side yang persisten. Semua data COA, Jurnal, dan Aset yang diimport telah disinkronkan untuk menghasilkan laporan keuangan yang dinamis.
          </p>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 bg-slate-700 px-3 py-1.5 rounded-md text-xs">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              Database Online (Railway)
            </div>
            <div className="flex items-center gap-2 bg-slate-700 px-3 py-1.5 rounded-md text-xs">
              <CheckCircle2 size={14} className="text-blue-400" />
              COA Hierarchy Healed
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
      </div>
    </div>
  );
};

export default AuditRecap;
