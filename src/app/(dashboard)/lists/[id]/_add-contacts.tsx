'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, X } from 'lucide-react';
import { addContactsToList } from '../actions';
import type { ContactStatus, ContactTag } from '@/types';

type Eligible = {
  id: string;
  email: string;
  name: string | null;
  tag: ContactTag;
  status: ContactStatus;
};

export function AddContactsToList({ listId, eligible }: { listId: string; eligible: Eligible[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return eligible.filter((c) =>
      !ql ||
      c.email.toLowerCase().includes(ql) ||
      (c.name ?? '').toLowerCase().includes(ql),
    );
  }, [eligible, q]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function add() {
    setError(null);
    if (selected.size === 0) return;
    start(async () => {
      const res = await addContactsToList(listId, Array.from(selected));
      if (!res.ok) setError(res.error ?? 'Failed to add');
      else {
        setSelected(new Set());
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
      >
        <Plus size={14} /> Add contacts to this list
      </button>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Add contacts</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-zinc-400 hover:text-brl-dark"
        >
          <X size={16} />
        </button>
      </div>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email or name…"
          className="w-full rounded-md border border-zinc-300 bg-white pl-8 pr-3 py-1.5 text-sm outline-none focus:border-brl-dark"
        />
      </div>
      <div className="max-h-72 overflow-y-auto border border-zinc-200 rounded-md divide-y divide-zinc-100">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500 text-center">No contacts found.</p>
        ) : (
          filtered.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="accent-brl-yellow"
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{c.email}</div>
                {c.name && <div className="text-xs text-zinc-500 truncate">{c.name}</div>}
              </div>
              <span className="text-[10px] uppercase text-zinc-400 capitalize">{c.tag}</span>
            </label>
          ))
        )}
      </div>
      {error && <p className="text-sm text-brl-error mt-3">{error}</p>}
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-zinc-500">{selected.size} selected</span>
        <button
          type="button"
          onClick={add}
          disabled={pending || selected.size === 0}
          className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
        >
          {pending ? 'Adding…' : `Add ${selected.size} contact${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
