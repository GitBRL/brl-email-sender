'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Search, X } from 'lucide-react';
import type { ContactStatus, ContactTag } from '@/types';

export function ContactsFilters({
  tag,
  status,
  q,
}: {
  tag: ContactTag | null;
  status: ContactStatus | null;
  q: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, start] = useTransition();

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    start(() => router.push(`?${next.toString()}`));
  }

  function reset() {
    start(() => router.push('/contacts'));
  }

  const hasFilters = !!(tag || status || q);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
        <input
          type="search"
          defaultValue={q}
          placeholder="Search email, name, company…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value || null);
          }}
          className="w-72 rounded-md border border-zinc-300 bg-white pl-8 pr-3 py-1.5 text-sm outline-none focus:border-brl-dark"
        />
      </div>

      <Pill label="Tag" value={tag} options={['hot', 'warm', 'cold']} onChange={(v) => set('tag', v)} />
      <Pill
        label="Status"
        value={status}
        options={['subscribed', 'unsubscribed', 'bounced']}
        onChange={(v) => set('status', v)}
      />

      {hasFilters && (
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-brl-dark"
        >
          <X size={12} /> Clear filters
        </button>
      )}
    </div>
  );
}

function Pill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm capitalize"
    >
      <option value="">All {label.toLowerCase()}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
