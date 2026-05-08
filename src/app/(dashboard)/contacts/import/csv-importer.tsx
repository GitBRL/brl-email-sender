'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { bulkImportContacts } from '../actions';

const FIELDS = [
  { key: 'email', label: 'Email *', required: true },
  { key: 'name', label: 'Name', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'company', label: 'Company', required: false },
  { key: 'tag', label: 'Tag (hot/warm/cold)', required: false },
  { key: 'status', label: 'Status (subscribed/unsubscribed/bounced)', required: false },
] as const;

type Mapping = Partial<Record<(typeof FIELDS)[number]['key'], string>>;

export function CsvImporter() {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const fields = (res.meta.fields ?? []).filter(Boolean);
        setHeaders(fields);
        setRows(res.data);
        // Auto-map by exact name match
        const auto: Mapping = {};
        for (const f of FIELDS) {
          const found = fields.find((h) => h.toLowerCase().trim() === f.key.toLowerCase());
          if (found) auto[f.key] = found;
        }
        setMapping(auto);
      },
      error: (err) => setError(err.message),
    });
  }

  function onImport() {
    setError(null);
    if (!mapping.email) {
      setError('Please map the Email column.');
      return;
    }
    const mapped = rows.map((r) => {
      const out: Record<string, string> = {};
      for (const f of FIELDS) {
        const src = mapping[f.key];
        if (src) out[f.key] = r[src] ?? '';
      }
      return out;
    });
    start(async () => {
      const res = await bulkImportContacts(mapped);
      setResult({ imported: res.imported, skipped: res.skipped, errors: res.errors });
      if (res.ok && res.errors.length === 0) {
        setTimeout(() => {
          router.push('/contacts');
          router.refresh();
        }, 1500);
      }
    });
  }

  if (result) {
    return (
      <div className="bg-white rounded-lg border border-zinc-200 p-6 space-y-3">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 size={18} />
          <h2 className="font-semibold">
            Imported {result.imported} contact{result.imported === 1 ? '' : 's'}
          </h2>
        </div>
        {result.skipped > 0 && (
          <p className="text-sm text-zinc-600">
            Skipped {result.skipped} row{result.skipped === 1 ? '' : 's'}.
          </p>
        )}
        {result.errors.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-red-600">{result.errors.length} errors</summary>
            <ul className="mt-2 space-y-1 text-xs text-red-700 max-h-40 overflow-auto">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </details>
        )}
        <p className="text-xs text-zinc-500">Redirecting to contacts…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-zinc-200 p-6">
        <label className="cursor-pointer block">
          <div className="border-2 border-dashed border-zinc-300 rounded-lg p-8 text-center hover:border-brl-yellow transition">
            <Upload size={24} className="mx-auto text-zinc-400 mb-2" />
            <div className="text-sm font-medium">Choose CSV file</div>
            <div className="text-xs text-zinc-500 mt-1">First row should contain column headers</div>
          </div>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {headers.length > 0 && (
        <div className="bg-white rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold mb-1">Map columns</h2>
          <p className="text-xs text-zinc-500 mb-4">{rows.length} rows detected.</p>
          <div className="space-y-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="grid grid-cols-2 gap-3 items-center">
                <span className="text-sm">
                  {f.label}
                </span>
                <select
                  value={mapping[f.key] ?? ''}
                  onChange={(e) =>
                    setMapping({ ...mapping, [f.key]: e.target.value || undefined })
                  }
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">— ignore —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-6">
            <button
              type="button"
              disabled={pending || !mapping.email}
              onClick={onImport}
              className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
            >
              {pending ? 'Importing…' : `Import ${rows.length} rows`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
