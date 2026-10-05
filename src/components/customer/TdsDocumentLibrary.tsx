import React from 'react';
import { FileText, Download, ShieldCheck, Search } from 'lucide-react';
import { CUSTOMER_HOME_PATH } from '../../app/shellRoutes';
import { CustomerPageHero } from './CustomerPageHero';

export const TdsDocumentLibrary: React.FC = () => {
  const documents = [
    {
      id: 'tds-1',
      title: 'MV 33kV 3C 240mm² XLPE SWA PVC Technical Data Sheet',
      code: 'TDS-MV-33KV-240-01',
      type: 'TDS Sheet (PDF)',
      standard: 'IEC 60502-2',
      date: '2026-04-15',
    },
    {
      id: 'tds-2',
      title: 'LV 1kV 4C 185mm² XLPE STA PVC Technical Specification',
      code: 'TDS-LV-1KV-185-04',
      type: 'TDS Sheet (PDF)',
      standard: 'IEC 60502-1',
      date: '2026-03-20',
    },
    {
      id: 'tds-3',
      title: 'KEMA Type Test Certificate 33kV Cable Range',
      code: 'CERT-KEMA-33KV-2025',
      type: 'Type Test Certificate',
      standard: 'KEMA Certified',
      date: '2025-11-10',
    },
    {
      id: 'tds-4',
      title: 'ISO 9001:2015 & ISO 14001 Helal Factory Compliance',
      code: 'CERT-ISO-HELAL-9001',
      type: 'Quality Certificate',
      standard: 'ISO 9001',
      date: '2026-01-05',
    },
  ];

  return (
    <div className="space-y-6">
      <CustomerPageHero
        breadcrumbs={[{ label: 'Home', to: CUSTOMER_HOME_PATH }, { label: 'Documents' }]}
        title="Technical offer & Documents"
        subtitle="Download official TO specification sheets,"
      />

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search TDS by code, voltage, or standard..."
              className="w-full bg-slate-50 dark:bg-slate-800 pl-9 pr-4 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-700 outline-none text-slate-900 dark:text-white"
            />
          </div>
          <span className="text-xs text-slate-500 font-semibold">Showing 4 certified documents</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3 hover:shadow-md transition-shadow"
            >
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-100 dark:bg-blue-950 px-2 py-0.5 rounded">
                  {doc.type}
                </span>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                  {doc.title}
                </h4>
                <p className="text-[11px] text-slate-500 font-mono">Doc Code: {doc.code}</p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  Standard: {doc.standard}
                </p>
              </div>
              <button
                onClick={() => alert(`Downloading ${doc.code}...`)}
                className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition-all shrink-0"
                title="Download PDF"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
