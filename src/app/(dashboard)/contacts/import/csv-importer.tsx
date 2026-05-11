'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { bulkImportContacts } from '../actions';

/** Standard fields. The Email field is required to import any row. */
const STANDARD_FIELDS = [
  { key: 'email', label: 'Email', required: true, hint: 'unique identifier' },
  { key: 'name', label: 'Name', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'company', label: 'Company', required: false },
  { key: 'tag', label: 'Tag', required: false, hint: 'hot / warm / cold' },
  { key: 'status', label: 'Status', required: false, hint: 'subscribed / unsubscribed / bounced' },
] as const;

type StandardKey = (typeof STANDARD_FIELDS)[number]['key'];

/**
 * Aliases for auto-detection. Matches lowercased + diacritic-stripped CSV
 * headers against this list to guess the right standard field. Helps Brazilian
 * spreadsheets ("Nome", "Telefone", "E-mail", "Empresa", etc.) "just work".
 */
const ALIASES: Record<StandardKey, string[]> = {
  email: ['email', 'e-mail', 'mail', 'correo', 'endereco_de_email'],
  name: ['name', 'nome', 'fullname', 'full_name', 'nome_completo', 'first_name', 'primeiro_nome'],
  phone: ['phone', 'telefone', 'celular', 'tel', 'mobile', 'whatsapp', 'fone', 'numero'],
  company: ['company', 'empresa', 'organization', 'organizacao', 'org', 'firma'],
  tag: ['tag', 'etiqueta', 'categoria', 'segmento', 'segment', 'classificacao'],
  status: ['status', 'situacao', 'inscricao', 'subscription'],
};

/** Per-CSV-column mapping decision. */
type ColumnMap = {
  /** Mode of mapping for this CSV column. */
  mode: 'standard' | 'custom' | 'ignore';
  /** When mode=standard, which standard field. */
  standardKey?: StandardKey;
  /** When mode=custom, what to call the field (becomes a {{merge_tag}}). */
  customName?: string;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function autoMap(headers: string[]): Record<string, ColumnMap> {
  const map: Record<string, ColumnMap> = {};
  const usedStandard = new Set<StandardKey>();
  for (const h of headers) {
    const norm = normalize(h);
    let matched: StandardKey | undefined;
    for (const f of STANDARD_FIELDS) {
      if (usedStandard.has(f.key)) continue;
      if (ALIASES[f.key].includes(norm)) {
        matched = f.key;
        break;
      }
    }
    if (matched) {
      usedStandard.add(matched);
      map[h] = { mode: 'standard', standardKey: matched };
    } else {
      // Default unmatched columns to "custom" using the normalized header as the field name.
      map[h] = { mode: 'custom', customName: norm || h };
    }
  }
  return map;
}

export function CsvImporter() {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [columnMap, setColumnMap] = useState<Record<string, ColumnMap>>({});
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
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
        setColumnMap(autoMap(fields));
      },
      error: (err) => setError(err.message),
    });
  }

  /** Standard fields that have already been claimed by a column (so dropdowns can grey them out). */
  const usedStandardKeys = useMemo(() => {
    const set = new Set<StandardKey>();
    for (const m of Object.values(columnMap)) {
      if (m.mode === 'standard' && m.standardKey) set.add(m.standardKey);
    }
    return set;
  }, [columnMap]);

  const hasEmail = usedStandardKeys.has('email');

  /** First 3 rows for preview, with mappings applied. */
  const previewRows = useMemo(() => {
    return rows.slice(0, 3).map((r) => {
      const standard: Partial<Record<StandardKey, string>> = {};
      const custom: Record<string, string> = {};
      for (const [csvCol, m] of Object.entries(columnMap)) {
        const val = r[csvCol] ?? '';
        if (!val) continue;
        if (m.mode === 'standard' && m.standardKey) standard[m.standardKey] = val;
        else if (m.mode === 'custom' && m.customName) custom[m.customName] = val;
      }
      return { standard, custom };
    });
  }, [rows, columnMap]);

  function setMode(csvCol: string, mode: ColumnMap['mode']) {
    setColumnMap((prev) => {
      const next = { ...prev, [csvCol]: { ...prev[csvCol], mode } };
      // When switching to standard, default to first available
      if (mode === 'standard' && !next[csvCol].standardKey) {
        const first = STANDARD_FIELDS.find((f) => !usedStandardKeys.has(f.key));
        if (first) next[csvCol].standardKey = first.key;
      }
      // When switching to custom, default name from the CSV column
      if (mode === 'custom' && !next[csvCol].customName) {
        next[csvCol].customName = normalize(csvCol);
      }
      return next;
    });
  }

  function setStandardKey(csvCol: string, key: StandardKey) {
    setColumnMap((prev) => ({ ...prev, [csvCol]: { mode: 'standard', standardKey: key } }));
  }
  function setCustomName(csvCol: string, name: string) {
    setColumnMap((prev) => ({
      ...prev,
      [csvCol]: { mode: 'custom', customName: name },
    }));
  }

  function onImport() {
    setError(null);
    if (!hasEmail) {
      setError('You must map one column to the standard "Email" field.');
      return;
    }

    // Build payload rows
    const payload = rows.map((r) => {
      const out: Record<string, string> & { custom_fields?: Record<string, string> } = {};
      const custom: Record<string, string> = {};
      for (const [csvCol, m] of Object.entries(columnMap)) {
        const val = r[csvCol] ?? '';
        if (!val) continue;
        if (m.mode === 'standard' && m.standardKey) out[m.standardKey] = val;
        else if (m.mode === 'custom' && m.customName) custom[m.customName] = val;
      }
      if (Object.keys(custom).length > 0) out.custom_fields = custom;
      return out;
    });

    start(async () => {
      const res = await bulkImportContacts(payload);
      setResult({ imported: res.imported, skipped: res.skipped, errors: res.errors });
      if (res.ok && res.errors.length === 0) {
        setTimeout(() => {
          router.push('/contacts');
          router.refresh();
        }, 1500);
      }
    });
  }

  // -------------- Result view --------------
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
            <summary className="cursor-pointer text-red-600">
              {result.errors.length} errors
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-red-700 max-h-40 overflow-auto">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-xs text-zinc-500">Redirecting to contacts…</p>
      </div>
    );
  }

  // -------------- Upload + mapping view --------------
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-zinc-200 p-6">
        <label className="cursor-pointer block">
          <div className="border-2 border-dashed border-zinc-300 rounded-lg p-8 text-center hover:border-brl-yellow transition">
            <Upload size={24} className="mx-auto text-zinc-400 mb-2" />
            <div className="text-sm font-medium">
              {headers.length > 0 ? 'Choose a different file' : 'Choose CSV file'}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              First row should contain column headers
            </div>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="hidden"
          />
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {headers.length > 0 && (
        <>
          <div className="bg-white rounded-lg border border-zinc-200 p-6">
            <header className="flex items-baseline justify-between mb-1">
              <h2 className="text-sm font-semibold">Map columns</h2>
              <span className="text-xs text-zinc-500">
                {rows.length.toLocaleString('pt-BR')} rows · {headers.length} columns
              </span>
            </header>
            <p className="text-xs text-zinc-500 mb-4">
              Each CSV column can be mapped to a standard field, saved as a{' '}
              <strong className="text-zinc-700">custom field</strong> (usable as a{' '}
              <code className="bg-zinc-100 px-1 rounded">{'{{merge_tag}}'}</code> in your
              campaigns), or ignored.
            </p>

            <ul className="divide-y divide-zinc-100">
              {headers.map((csvCol) => {
                const m = columnMap[csvCol] ?? { mode: 'ignore' as const };
                return (
                  <li key={csvCol} className="py-3 grid grid-cols-12 gap-3 items-center">
                    {/* CSV column name */}
                    <div className="col-span-3 min-w-0">
                      <div className="text-sm font-medium truncate">{csvCol}</div>
                      <div className="text-[10px] text-zinc-400 truncate font-mono">
                        e.g. &quot;{rows[0]?.[csvCol] ?? '—'}&quot;
                      </div>
                    </div>

                    {/* Mode tabs */}
                    <div className="col-span-4 flex gap-1">
                      <ModePill
                        active={m.mode === 'standard'}
                        onClick={() => setMode(csvCol, 'standard')}
                        label="Standard"
                      />
                      <ModePill
                        active={m.mode === 'custom'}
                        onClick={() => setMode(csvCol, 'custom')}
                        label="Custom field"
                      />
                      <ModePill
                        active={m.mode === 'ignore'}
                        onClick={() => setMode(csvCol, 'ignore')}
                        label="Ignore"
                      />
                    </div>

                    {/* Mode-specific input */}
                    <div className="col-span-5">
                      {m.mode === 'standard' && (
                        <select
                          value={m.standardKey ?? ''}
                          onChange={(e) => setStandardKey(csvCol, e.target.value as StandardKey)}
                          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                        >
                          {STANDARD_FIELDS.map((f) => {
                            const taken = usedStandardKeys.has(f.key) && m.standardKey !== f.key;
                            return (
                              <option key={f.key} value={f.key} disabled={taken}>
                                {f.label}
                                {f.required ? ' *' : ''}
                                {taken ? ' (already mapped)' : ''}
                                {f.hint ? ` — ${f.hint}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      )}
                      {m.mode === 'custom' && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-zinc-500">{'{{'}</span>
                          <input
                            value={m.customName ?? ''}
                            onChange={(e) => setCustomName(csvCol, e.target.value)}
                            placeholder="field_name"
                            className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm font-mono"
                          />
                          <span className="font-mono text-xs text-zinc-500">{'}}'}</span>
                        </div>
                      )}
                      {m.mode === 'ignore' && (
                        <div className="text-xs text-zinc-400 italic">
                          This column will not be saved.
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-lg border border-zinc-200 p-6">
            <h2 className="text-sm font-semibold mb-3">
              Preview <span className="text-zinc-400 font-normal">(first 3 rows)</span>
            </h2>
            {!hasEmail ? (
              <div className="bg-amber-50 border border-amber-100 rounded p-3 text-sm text-amber-800 flex items-center gap-2">
                <AlertCircle size={14} /> Map at least one column to the standard{' '}
                <strong>Email</strong> field before importing.
              </div>
            ) : (
              <div className="space-y-3">
                {previewRows.map((row, i) => (
                  <div
                    key={i}
                    className="border border-zinc-200 rounded p-3 text-xs space-y-1.5"
                  >
                    <div className="font-mono text-zinc-500">Row {i + 1}</div>
                    {Object.entries(row.standard).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="font-medium text-zinc-700 min-w-[80px]">{k}:</span>
                        <span className="font-mono">{v}</span>
                      </div>
                    ))}
                    {Object.keys(row.custom).length > 0 && (
                      <details className="ml-1 mt-1">
                        <summary className="text-zinc-500 cursor-pointer text-[11px]">
                          + {Object.keys(row.custom).length} custom field
                          {Object.keys(row.custom).length === 1 ? '' : 's'}
                        </summary>
                        <div className="mt-1 pl-3 space-y-0.5">
                          {Object.entries(row.custom).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="font-mono text-blue-700 min-w-[80px]">
                                {'{{'}{k}{'}}'}
                              </span>
                              <span className="font-mono">{v}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending || !hasEmail}
              onClick={onImport}
              className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? 'Importing…' : `Import ${rows.length.toLocaleString('pt-BR')} rows`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ModePill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
        active
          ? 'bg-brl-dark text-white'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
      }`}
    >
      {label}
    </button>
  );
}
