'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createTemplate } from './actions';

export function NewTemplateButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('name', name);
    start(async () => {
      const res = await createTemplate({ ok: false }, fd);
      if (!res.ok || !res.id) setError(res.error ?? 'Failed to create');
      else router.push(`/templates/${res.id}/edit`);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow px-3 py-2 text-sm font-semibold text-brl-dark hover:bg-brl-yellow-hover"
      >
        <Plus size={14} /> New template
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-md border border-zinc-300 p-2 flex items-center gap-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name…"
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brl-dark w-64"
      />
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-3 py-1.5 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-sm text-zinc-500 px-2"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-brl-error ml-2">{error}</span>}
    </form>
  );
}
