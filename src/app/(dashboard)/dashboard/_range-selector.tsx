'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

export type RangePreset = '30d' | '60d' | '90d' | 'custom';

/**
 * Time-range selector for the dashboard. Writes ?range= (and optional
 * ?from / ?to for 'custom') to the URL so the server-rendered page can
 * pick them up on the next request. Live in the URL means the range
 * survives reloads + can be shared/bookmarked.
 *
 * 'custom' reveals two date inputs and a tiny Apply button. Apply is
 * only enabled when both dates are set + valid.
 */
export function RangeSelector() {
  const router = useRouter();
  const sp = useSearchParams();

  const range = ((sp.get('range') as RangePreset) ?? '30d') as RangePreset;
  const fromParam = sp.get('from') ?? '';
  const toParam = sp.get('to') ?? '';

  const [from, setFrom] = useState(fromParam);
  const [to, setTo] = useState(toParam);
  // Sync local input state if URL changes externally
  useEffect(() => { setFrom(fromParam); setTo(toParam); }, [fromParam, toParam]);

  function navigate(next: { range?: RangePreset; from?: string; to?: string }) {
    const params = new URLSearchParams(sp.toString());
    if (next.range !== undefined) params.set('range', next.range);
    if (next.range && next.range !== 'custom') {
      params.delete('from');
      params.delete('to');
    }
    if (next.from !== undefined) {
      if (next.from) params.set('from', next.from);
      else params.delete('from');
    }
    if (next.to !== undefined) {
      if (next.to) params.set('to', next.to);
      else params.delete('to');
    }
    router.push(`?${params.toString()}`);
  }

  const presets: Array<{ value: RangePreset; label: string }> = [
    { value: '30d', label: '30 dias' },
    { value: '60d', label: '60 dias' },
    { value: '90d', label: '90 dias' },
    { value: 'custom', label: 'Personalizado' },
  ];

  const customValid =
    from && to && new Date(from) <= new Date(to) && (from !== fromParam || to !== toParam);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => navigate({ range: p.value })}
            className={`px-3 py-1 text-xs font-medium rounded ${
              range === p.value
                ? 'bg-brl-dark text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {range === 'custom' && (
        <div className="inline-flex items-center gap-1 text-xs">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
          />
          <span className="text-zinc-400">→</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={!customValid}
            onClick={() => navigate({ range: 'custom', from, to })}
            className="px-3 py-1 text-xs font-medium rounded bg-brl-yellow text-brl-dark hover:bg-brl-yellow-hover disabled:opacity-40"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
