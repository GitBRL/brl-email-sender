'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { bulkImportContacts } from '../actions';
import { cleanRows, splitFullName, type RawRow } from '@/lib/contact-cleaning';
import { cn } from '@/lib/utils';

type StandardKey = 'email' | 'name' | 'phone' | 'company' | 'tag' | 'status';
type StandardField = {
  key: StandardKey;
  label: string;
  required: boolean;
  hint?: string;
};

/** Standard fields. The Email field is required to import any row. */
const STANDARD_FIELDS: readonly StandardField[] = [
  { key: 'email', label: 'Email', required: true, hint: 'unique identifier' },
  { key: 'name', label: 'Name', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'company', label: 'Company', required: false },
  { key: 'tag', label: 'Tag', required: false, hint: 'hot / warm / cold' },
  { key: 'status', label: 'Status', required: false, hint: 'subscribed / unsubscribed / bounced' },
];

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
  /**
   * Only meaningful when standardKey='name'. When true, split the value at the
   * first whitespace; the first token goes into `name` (first name), the rest
   * goes into a new `last_name` field. Lets users import a single "Full Name"
   * CSV column and still personalize with `{{first_name}}` + `{{last_name}}`.
   */
  splitFullName?: boolean;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Header normalisations that imply "this is a full name, please split it". */
const FULL_NAME_HEADERS = new Set([
  'name', 'nome', 'fullname', 'full_name', 'nome_completo', 'complete_name',
]);

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
      // When the column maps to Name AND the header looks like a full-name
      // column (not "first_name" / "primeiro_nome"), pre-enable the split
      // toggle. Users were missing the manual toggle and importing full
      // names into the single `name` field by accident.
      const looksLikeFullName = matched === 'name' && FULL_NAME_HEADERS.has(norm);
      map[h] = { mode: 'standard', standardKey: matched, splitFullName: looksLikeFullName };
    } else {
      // Default unmatched columns to "custom" using the normalized header as the field name.
      map[h] = { mode: 'custom', customName: norm || h };
    }
  }
  return map;
}

type ListAssignment =
  | { kind: 'none' }
  | { kind: 'existing'; id: string }
  | { kind: 'new'; name: string };

/** Tag override applied uniformly to all imported rows. 'keep' means leave
 *  whatever the per-row tag mapping (or its absence) decided. */
type TagOverride = 'keep' | 'hot' | 'warm' | 'cold';

export function CsvImporter({
  existingLists = [],
}: {
  existingLists?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [columnMap, setColumnMap] = useState<Record<string, ColumnMap>>({});
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
    listId?: string;
    listName?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // List assignment — default to "create new" since that's the dominant case
  // when importing a fresh CSV. The new-list name is auto-suggested from the
  // file name on upload.
  const [listAssignment, setListAssignment] = useState<ListAssignment>({
    kind: 'new',
    name: '',
  });
  // Tag override — applied uniformly to all imported rows. 'keep' (default)
  // respects whatever the per-column tag mapping (or its absence) produced.
  const [tagOverride, setTagOverride] = useState<TagOverride>('keep');

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);

    // Suggest a list name from the filename (e.g. "alunos-2026.csv" → "alunos-2026")
    setListAssignment((prev) => {
      if (prev.kind === 'new' && !prev.name) {
        const stem = file.name.replace(/\.csv$/i, '').trim();
        if (stem) return { kind: 'new', name: stem };
      }
      return prev;
    });

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

  /**
   * Project the raw CSV rows through the column mapping into RawRow shape,
   * then run the cleaning pipeline. Memoised so it only re-runs when the user
   * actually changes the mapping (not on every keystroke elsewhere).
   */
  const { mapped, cleaned, report } = useMemo(() => {
    const mapped: RawRow[] = rows.map((r) => {
      const out: RawRow = {};
      const custom: Record<string, string> = {};
      for (const [csvCol, m] of Object.entries(columnMap)) {
        const val = r[csvCol] ?? '';
        if (!val) continue;
        if (m.mode === 'standard' && m.standardKey) {
          // Special case: split a single Name column into first/last when
          // the user toggled the option in the mapping UI.
          if (m.standardKey === 'name' && m.splitFullName) {
            const { first, last } = splitFullName(val);
            if (first) out.name = first;
            if (last) out.last_name = last;
          } else {
            out[m.standardKey] = val;
          }
        } else if (m.mode === 'custom' && m.customName) {
          custom[m.customName] = val;
        }
      }
      if (Object.keys(custom).length > 0) out.custom_fields = custom;
      // Force-tag every row when the operator picked a uniform tag in the
      // import settings panel. Overwrites any per-row tag from the CSV column.
      if (tagOverride !== 'keep') out.tag = tagOverride;
      return out;
    });
    const result = cleanRows(mapped);
    return { mapped, ...result };
  }, [rows, columnMap, tagOverride]);

  // Preview = first 3 cleaned rows for the user to eyeball
  const previewRows = cleaned.slice(0, 3);

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
    if (cleaned.length === 0) {
      setError('No valid rows after cleaning. Check the report below.');
      return;
    }
    if (listAssignment.kind === 'new' && !listAssignment.name.trim()) {
      setError('Digite um nome para a nova lista (ou escolha outra opção).');
      return;
    }
    if (listAssignment.kind === 'existing' && !listAssignment.id) {
      setError('Escolha uma lista existente (ou outra opção).');
      return;
    }

    start(async () => {
      const res = await bulkImportContacts(cleaned, listAssignment);
      setResult({
        imported: res.imported,
        skipped: res.skipped,
        errors: res.errors,
        listId: res.listId,
        listName: res.listName,
      });
      if (res.ok && res.errors.length === 0) {
        setTimeout(() => {
          router.push('/contacts');
          router.refresh();
        }, 1800);
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
        {result.listName && (
          <p className="text-sm text-zinc-700">
            Adicionados à lista <strong>{result.listName}</strong>.
          </p>
        )}
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
                        <div className="space-y-1.5">
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
                          {/* Split toggle — only appears when this column is mapped to Name.
                              On the user's request: turning this on means the first word of
                              each value lands in `name`, the rest in `last_name`. */}
                          {m.standardKey === 'name' && (
                            <label className="flex items-start gap-2 text-[11px] text-zinc-600 cursor-pointer pl-1">
                              <input
                                type="checkbox"
                                checked={!!m.splitFullName}
                                onChange={(e) =>
                                  setColumnMap((prev) => ({
                                    ...prev,
                                    [csvCol]: { ...prev[csvCol], splitFullName: e.target.checked },
                                  }))
                                }
                                className="mt-0.5 accent-brl-yellow"
                              />
                              <span>
                                <strong className="font-semibold text-zinc-800">Dividir em Nome + Sobrenome</strong>
                                <span className="block text-zinc-500">
                                  Tudo antes do primeiro espaço vira <code>{'{{name}}'}</code>; o resto vira <code>{'{{last_name}}'}</code>.
                                </span>
                              </span>
                            </label>
                          )}
                        </div>
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

          {/* Cleaning report */}
          {hasEmail && <CleaningReportPanel report={report} mappedSample={mapped} />}

          {/* Preview (post-clean) */}
          <div className="bg-white rounded-lg border border-zinc-200 p-6">
            <h2 className="text-sm font-semibold mb-3">
              Preview after cleaning{' '}
              <span className="text-zinc-400 font-normal">(first 3 of {cleaned.length})</span>
            </h2>
            {!hasEmail ? (
              <div className="bg-amber-50 border border-amber-100 rounded p-3 text-sm text-amber-800 flex items-center gap-2">
                <AlertCircle size={14} /> Map at least one column to the standard{' '}
                <strong>Email</strong> field before importing.
              </div>
            ) : previewRows.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">
                No valid rows after cleaning. Check the report above for dropped rows.
              </p>
            ) : (
              <div className="space-y-3">
                {previewRows.map((row, i) => (
                  <div
                    key={i}
                    className="border border-zinc-200 rounded p-3 text-xs space-y-1.5"
                  >
                    <div className="font-mono text-zinc-500">Row {i + 1}</div>
                    {(['email', 'name', 'last_name', 'phone', 'company', 'tag', 'status'] as const).map(
                      (k) =>
                        row[k] ? (
                          <div key={k} className="flex gap-2">
                            <span className="font-medium text-zinc-700 min-w-[80px]">{k}:</span>
                            <span className="font-mono">{row[k]}</span>
                          </div>
                        ) : null
                    )}
                    {row.custom_fields && Object.keys(row.custom_fields).length > 0 && (
                      <details className="ml-1 mt-1">
                        <summary className="text-zinc-500 cursor-pointer text-[11px]">
                          + {Object.keys(row.custom_fields).length} custom field
                          {Object.keys(row.custom_fields).length === 1 ? '' : 's'}
                        </summary>
                        <div className="mt-1 pl-3 space-y-0.5">
                          {Object.entries(row.custom_fields).map(([k, v]) => (
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

          {/* List assignment — decide where the imported contacts land.
              Default is "create a new list" with the file name as suggestion,
              because that's what most users expect when importing fresh data. */}
          <div className="bg-white rounded-lg border border-zinc-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold">Salvar em uma lista</h2>
            <p className="text-xs text-zinc-500 -mt-1">
              Os contatos importados vão para o pool geral. Opcionalmente, agrupe-os em uma lista para usar no público da campanha.
            </p>

            <div className="space-y-2">
              {/* New list option (default) */}
              <label className="flex items-start gap-2 p-2.5 rounded-md border-2 cursor-pointer transition"
                style={{
                  borderColor: listAssignment.kind === 'new' ? '#ffcd01' : '#e4e4e7',
                  background: listAssignment.kind === 'new' ? 'rgba(255,205,1,0.06)' : '#fff',
                }}
              >
                <input
                  type="radio"
                  name="list-assignment"
                  className="mt-1 accent-brl-yellow"
                  checked={listAssignment.kind === 'new'}
                  onChange={() =>
                    setListAssignment((prev) =>
                      prev.kind === 'new' ? prev : { kind: 'new', name: '' },
                    )
                  }
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Criar lista nova</div>
                  <div className="text-[11px] text-zinc-500 mb-1.5">
                    Cria uma lista com esse nome e adiciona todos os contatos importados.
                  </div>
                  <input
                    type="text"
                    value={listAssignment.kind === 'new' ? listAssignment.name : ''}
                    onChange={(e) =>
                      setListAssignment({ kind: 'new', name: e.target.value })
                    }
                    onFocus={() =>
                      setListAssignment((prev) =>
                        prev.kind === 'new' ? prev : { kind: 'new', name: '' },
                      )
                    }
                    placeholder="ex. Alunos Salus 2026"
                    className="w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-brl-dark"
                    disabled={listAssignment.kind !== 'new'}
                  />
                </div>
              </label>

              {/* Existing list option */}
              <label className="flex items-start gap-2 p-2.5 rounded-md border-2 cursor-pointer transition"
                style={{
                  borderColor: listAssignment.kind === 'existing' ? '#ffcd01' : '#e4e4e7',
                  background: listAssignment.kind === 'existing' ? 'rgba(255,205,1,0.06)' : '#fff',
                }}
              >
                <input
                  type="radio"
                  name="list-assignment"
                  className="mt-1 accent-brl-yellow"
                  checked={listAssignment.kind === 'existing'}
                  onChange={() => setListAssignment({ kind: 'existing', id: '' })}
                  disabled={existingLists.length === 0}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    Adicionar a uma lista existente
                    {existingLists.length === 0 && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-400">(nenhuma)</span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 mb-1.5">
                    Os contatos serão adicionados sem remover quem já está na lista.
                  </div>
                  <select
                    value={listAssignment.kind === 'existing' ? listAssignment.id : ''}
                    onChange={(e) =>
                      setListAssignment({ kind: 'existing', id: e.target.value })
                    }
                    disabled={listAssignment.kind !== 'existing' || existingLists.length === 0}
                    className="w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-brl-dark bg-white"
                  >
                    <option value="">— Escolha uma lista —</option>
                    {existingLists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              {/* None option */}
              <label className="flex items-start gap-2 p-2.5 rounded-md border-2 cursor-pointer transition"
                style={{
                  borderColor: listAssignment.kind === 'none' ? '#ffcd01' : '#e4e4e7',
                  background: listAssignment.kind === 'none' ? 'rgba(255,205,1,0.06)' : '#fff',
                }}
              >
                <input
                  type="radio"
                  name="list-assignment"
                  className="mt-1 accent-brl-yellow"
                  checked={listAssignment.kind === 'none'}
                  onChange={() => setListAssignment({ kind: 'none' })}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Não adicionar a uma lista</div>
                  <div className="text-[11px] text-zinc-500">
                    Os contatos ficam apenas no pool geral. Você poderá agrupá-los depois.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Tag override — applied uniformly to every imported row.
              Useful when a list represents 'all hot leads from the webinar'
              and you want all 31 contacts pre-tagged as hot, regardless of
              what the CSV column (if any) said. */}
          <div className="bg-white rounded-lg border border-zinc-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold">Tag dos contatos</h2>
            <p className="text-xs text-zinc-500 -mt-1">
              Define o &ldquo;temperatura&rdquo; dos contatos. Ao escolher um valor aqui, todos os contatos importados ficam com essa tag (sobrescreve a coluna CSV mapeada como Tag, se houver).
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { value: 'keep', label: 'Manter', hint: 'usa coluna CSV ou cold padrão', dot: '#a1a1aa' },
                  { value: 'hot',  label: 'Hot',    hint: 'leads quentes',                  dot: '#ef4444' },
                  { value: 'warm', label: 'Warm',   hint: 'engajados',                       dot: '#f59e0b' },
                  { value: 'cold', label: 'Cold',   hint: 'frios / opt-in genérico',         dot: '#3b82f6' },
                ] as const
              ).map((opt) => {
                const active = tagOverride === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      'cursor-pointer rounded-md border-2 p-2.5 text-left transition flex items-start gap-2',
                      active
                        ? 'border-brl-yellow bg-brl-yellow/10'
                        : 'border-zinc-200 bg-white hover:border-zinc-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="tag-override"
                      className="mt-0.5 accent-brl-yellow"
                      checked={active}
                      onChange={() => setTagOverride(opt.value)}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: opt.dot }} />
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-zinc-500 leading-snug">{opt.hint}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending || !hasEmail || cleaned.length === 0}
              onClick={onImport}
              className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending
                ? 'Importing…'
                : `Importar ${cleaned.length.toLocaleString('pt-BR')} contato${cleaned.length === 1 ? '' : 's'}`}
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

function CleaningReportPanel({
  report,
  mappedSample,
}: {
  report: import('@/lib/contact-cleaning').CleaningReport;
  mappedSample: import('@/lib/contact-cleaning').RawRow[];
}) {
  const [open, setOpen] = useState(true);
  const noOps =
    report.duplicatesMerged === 0 &&
    report.invalidEmails.length === 0 &&
    report.junkSkipped.length === 0 &&
    report.emailsFixed.length === 0 &&
    report.phonesNormalized === 0 &&
    report.phonesDropped.length === 0 &&
    report.namesNormalized === 0 &&
    report.tagsMapped.length === 0 &&
    report.statusesMapped.length === 0;

  return (
    <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-zinc-50"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brl-orange" />
          <h2 className="text-sm font-semibold">Cleaning report</h2>
          {noOps ? (
            <span className="text-xs text-zinc-500">— data was already clean</span>
          ) : (
            <span className="text-xs text-zinc-500">
              — {report.totalIn.toLocaleString('pt-BR')} in → {report.totalOut.toLocaleString('pt-BR')} ready to import
            </span>
          )}
        </div>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 pt-3">
          {/* Counts grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <ReportTile
              label="Duplicates merged"
              value={report.duplicatesMerged}
              tone={report.duplicatesMerged > 0 ? 'good' : 'neutral'}
            />
            <ReportTile
              label="Email typos fixed"
              value={report.emailsFixed.length}
              tone={report.emailsFixed.length > 0 ? 'good' : 'neutral'}
            />
            <ReportTile
              label="Phones normalized"
              value={report.phonesNormalized}
              tone={report.phonesNormalized > 0 ? 'good' : 'neutral'}
            />
            <ReportTile
              label="Names normalized"
              value={report.namesNormalized}
              tone={report.namesNormalized > 0 ? 'good' : 'neutral'}
            />
            <ReportTile
              label="Tags mapped"
              value={report.tagsMapped.length}
              tone={report.tagsMapped.length > 0 ? 'good' : 'neutral'}
            />
            <ReportTile
              label="Status mapped"
              value={report.statusesMapped.length}
              tone={report.statusesMapped.length > 0 ? 'good' : 'neutral'}
            />
            <ReportTile
              label="Invalid emails"
              value={report.invalidEmails.length}
              tone={report.invalidEmails.length > 0 ? 'warn' : 'neutral'}
            />
            <ReportTile
              label="Junk dropped"
              value={report.junkSkipped.length + report.phonesDropped.length}
              tone={
                report.junkSkipped.length + report.phonesDropped.length > 0 ? 'warn' : 'neutral'
              }
            />
          </div>

          {/* Detail accordions */}
          {report.emailsFixed.length > 0 && (
            <ReportDetail
              title={`${report.emailsFixed.length} email domain typo${report.emailsFixed.length === 1 ? '' : 's'} fixed`}
            >
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {report.emailsFixed.slice(0, 50).map((f, i) => (
                  <li key={i} className="font-mono text-[11px] text-zinc-700">
                    Row {f.rowIndex + 1}:{' '}
                    <span className="text-red-600 line-through">{f.from}</span>
                    {' → '}
                    <span className="text-emerald-700">{f.to}</span>
                  </li>
                ))}
                {report.emailsFixed.length > 50 && (
                  <li className="text-[10px] text-zinc-500 italic">
                    + {report.emailsFixed.length - 50} more
                  </li>
                )}
              </ul>
            </ReportDetail>
          )}

          {report.tagsMapped.length > 0 && (
            <ReportDetail title={`${report.tagsMapped.length} tag synonym${report.tagsMapped.length === 1 ? '' : 's'} mapped`}>
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {dedupeMappings(report.tagsMapped).map((f, i) => (
                  <li key={i} className="font-mono text-[11px] text-zinc-700">
                    <span className="text-zinc-500">{f.from}</span> → {f.to}{' '}
                    <span className="text-[10px] text-zinc-400">×{f.count}</span>
                  </li>
                ))}
              </ul>
            </ReportDetail>
          )}

          {report.statusesMapped.length > 0 && (
            <ReportDetail
              title={`${report.statusesMapped.length} status synonym${report.statusesMapped.length === 1 ? '' : 's'} mapped`}
            >
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {dedupeMappings(report.statusesMapped).map((f, i) => (
                  <li key={i} className="font-mono text-[11px] text-zinc-700">
                    <span className="text-zinc-500">{f.from}</span> → {f.to}{' '}
                    <span className="text-[10px] text-zinc-400">×{f.count}</span>
                  </li>
                ))}
              </ul>
            </ReportDetail>
          )}

          {report.invalidEmails.length > 0 && (
            <ReportDetail
              title={`${report.invalidEmails.length} row${report.invalidEmails.length === 1 ? '' : 's'} dropped (invalid email)`}
              tone="warn"
            >
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {report.invalidEmails.slice(0, 50).map((e, i) => (
                  <li key={i} className="font-mono text-[11px] text-zinc-700">
                    Row {e.rowIndex + 1}: &quot;{e.original}&quot;{' '}
                    <span className="text-zinc-400">({e.reason})</span>
                  </li>
                ))}
                {report.invalidEmails.length > 50 && (
                  <li className="text-[10px] text-zinc-500 italic">
                    + {report.invalidEmails.length - 50} more
                  </li>
                )}
              </ul>
            </ReportDetail>
          )}

          {report.junkSkipped.length > 0 && (
            <ReportDetail
              title={`${report.junkSkipped.length} row${report.junkSkipped.length === 1 ? '' : 's'} dropped (junk / test data)`}
              tone="warn"
            >
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {report.junkSkipped.slice(0, 50).map((j, i) => (
                  <li key={i} className="font-mono text-[11px] text-zinc-700">
                    Row {j.rowIndex + 1}: {j.original}
                  </li>
                ))}
              </ul>
            </ReportDetail>
          )}

          {report.phonesDropped.length > 0 && (
            <ReportDetail
              title={`${report.phonesDropped.length} phone${report.phonesDropped.length === 1 ? '' : 's'} dropped (unrecognised format)`}
              tone="warn"
            >
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {report.phonesDropped.slice(0, 50).map((p, i) => (
                  <li key={i} className="font-mono text-[11px] text-zinc-700">
                    Row {p.rowIndex + 1}: &quot;{p.original}&quot;
                  </li>
                ))}
              </ul>
            </ReportDetail>
          )}

          {mappedSample.length > 0 && noOps && (
            <p className="text-xs text-zinc-500 italic px-1">
              The mapped data looked good already — no transformations applied.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ReportTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'neutral';
}) {
  const cls =
    tone === 'good'
      ? 'border-emerald-100 bg-emerald-50/40'
      : tone === 'warn'
        ? 'border-amber-100 bg-amber-50/40'
        : 'border-zinc-100 bg-zinc-50/40';
  const valueCls =
    tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-zinc-700';
  return (
    <div className={`border rounded p-2 ${cls}`}>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${valueCls}`}>
        {value.toLocaleString('pt-BR')}
      </div>
    </div>
  );
}

function ReportDetail({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: 'warn';
  children: React.ReactNode;
}) {
  return (
    <details
      className={`rounded border ${tone === 'warn' ? 'border-amber-100 bg-amber-50/30' : 'border-zinc-100'}`}
    >
      <summary
        className={`cursor-pointer px-3 py-2 text-xs font-medium ${tone === 'warn' ? 'text-amber-800' : 'text-zinc-700'} select-none`}
      >
        {title}
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

function dedupeMappings(
  items: Array<{ rowIndex: number; from: string; to: string }>,
): Array<{ from: string; to: string; count: number }> {
  const counter = new Map<string, { from: string; to: string; count: number }>();
  for (const it of items) {
    const key = `${it.from}→${it.to}`;
    const existing = counter.get(key);
    if (existing) existing.count++;
    else counter.set(key, { from: it.from, to: it.to, count: 1 });
  }
  return Array.from(counter.values()).sort((a, b) => b.count - a.count);
}
