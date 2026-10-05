import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

type ImportRow = {
  id: string;
  cashAsk: string | number | null;
  threeMonthAsk: string | number | null;
  suspended: boolean;
  blankCash: boolean;
  quoteDate: string;
  instrument: { code: string; name: string; costingUsage: string };
};

type ImportBatch = {
  id: string;
  status: string;
  confidence: string;
  hasImage?: boolean;
  rows: ImportRow[];
};

export function MarketMetalImportPanel() {
  const { jwtToken } = useAuth();
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tableText, setTableText] = useState('');

  const headers = { Authorization: `Bearer ${jwtToken}`, 'Content-Type': 'application/json' };

  const loadLatest = async () => {
    const res = await fetch('/api/master/market-metals/imports', { headers });
    if (!res.ok) return;
    const data = await res.json();
    const latest = (data.imports || [])[0];
    if (latest) setBatch(latest);
  };

  useEffect(() => {
    if (jwtToken) void loadLatest();
  }, [jwtToken]);

  useEffect(() => {
    if (!jwtToken || !batch?.hasImage) {
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl = '';
    void fetch(`/api/master/market-metals/imports/${batch.id}/image`, { headers: { Authorization: `Bearer ${jwtToken}` } })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [jwtToken, batch?.id, batch?.hasImage]);

  const createImport = async (file?: File) => {
    let imageBase64: string | undefined;
    let mimeType: string | undefined;
    let sourceFileName: string | undefined;
    if (file) {
      imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const raw = String(reader.result || '');
          resolve(raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw);
        };
        reader.onerror = () => reject(new Error('Could not read the image.'));
        reader.readAsDataURL(file);
      });
      mimeType = file.type;
      sourceFileName = file.name;
    }
    const res = await fetch('/api/master/market-metals/imports', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceFileName,
        mimeType,
        imageBase64,
        tableText: tableText.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Import failed.');
      return;
    }
    setBatch(data.import);
    setMessage('Import is in review. It is not published.');
  };

  const saveRow = async (row: ImportRow, cashAsk: string, threeMonthAsk: string) => {
    if (!batch) return;
    const res = await fetch(`/api/master/market-metals/imports/${batch.id}/rows/${row.instrument.code}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        cashAsk: cashAsk.trim() === '' ? null : Number(cashAsk),
        threeMonthAsk: threeMonthAsk.trim() === '' ? null : Number(threeMonthAsk),
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setMessage(data.error || 'Could not save the row.');
      return;
    }
    await refresh(batch.id);
  };

  const refresh = async (id: string) => {
    const res = await fetch(`/api/master/market-metals/imports/${id}`, { headers });
    if (res.ok) setBatch((await res.json()).import);
  };

  const act = async (action: 'approve' | 'publish') => {
    if (!batch) return;
    const res = await fetch(`/api/master/market-metals/imports/${batch.id}/${action}`, { method: 'POST', headers });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Action failed.');
      return;
    }
    setBatch(data.import);
    setMessage(action === 'approve' ? 'Approved. Publish is still a separate step.' : 'Published copper and aluminium for new inquiries.');
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <h2 className="text-sm font-bold text-slate-800">LME official prices</h2>
        <p className="text-slate-500 mt-1">
          Store the sheet, confirm the extracted cash ask and 3-month ask, then approve and publish. Nothing publishes automatically.
        </p>
      </div>
      {message ? <p className="text-amber-800 font-semibold">{message}</p> : null}
      <textarea
        value={tableText}
        onChange={(e) => setTableText(e.target.value)}
        placeholder="Optional extracted table text. Leave blank to review an empty grid."
        className="w-full h-24 rounded-xl border border-slate-200 p-2"
      />
      <div className="flex gap-2">
        <label className="px-3 py-2 rounded-lg border border-slate-200 cursor-pointer">
          Choose image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void createImport(file);
            }}
          />
        </label>
        <button type="button" className="px-3 py-2 rounded-lg bg-brand-600 text-white font-semibold" onClick={() => void createImport()}>
          Start review
        </button>
      </div>
      {batch ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 min-h-[240px]">
            <p className="font-semibold text-slate-600 mb-2">Source image</p>
            {imageUrl ? (
              <img alt="LME source" className="max-w-full" src={imageUrl} />
            ) : (
              <p className="text-slate-400">No image stored for this import.</p>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
              <span className="font-semibold">Extracted rows · {batch.status} · {batch.confidence}</span>
              <span className="flex gap-2">
                <button type="button" className="font-semibold text-brand-700" onClick={() => void act('approve')}>Approve</button>
                <button type="button" className="font-semibold text-brand-700" onClick={() => void act('publish')}>Publish</button>
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="p-2">Metal</th>
                  <th className="p-2">Cash ask</th>
                  <th className="p-2">3M ask</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((row) => (
                  <ReviewRow key={row.id} row={row} onSave={(current, cash, three) => { void saveRow(current, cash, three); }} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const ReviewRow: React.FC<{
  row: ImportRow;
  onSave: (row: ImportRow, cash: string, three: string) => void;
}> = ({ row, onSave }) => {
  const [cash, setCash] = useState(row.cashAsk == null ? '' : String(row.cashAsk));
  const [three, setThree] = useState(row.threeMonthAsk == null ? '' : String(row.threeMonthAsk));
  return (
    <tr className="border-t border-slate-100">
      <td className="p-2">
        {row.instrument.name}
        {row.suspended ? ' (Suspended)' : ''}
        {row.instrument.costingUsage === 'NONE' ? ' · not used in cable cost' : ''}
      </td>
      <td className="p-2">
        <input className="w-24 border border-slate-200 rounded px-1 py-0.5" value={cash} onChange={(e) => setCash(e.target.value)} onBlur={() => onSave(row, cash, three)} />
      </td>
      <td className="p-2">
        <input className="w-24 border border-slate-200 rounded px-1 py-0.5" value={three} onChange={(e) => setThree(e.target.value)} onBlur={() => onSave(row, cash, three)} />
      </td>
    </tr>
  );
};
