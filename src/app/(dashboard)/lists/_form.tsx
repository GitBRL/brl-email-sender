'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createList, type ActionState } from './actions';

const initial: ActionState = { ok: false };

export function ListForm({ defaultName = '', defaultDescription = '' }: { defaultName?: string; defaultDescription?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createList, initial);

  useEffect(() => {
    if (state.ok && state.id) {
      router.push(`/lists/${state.id}`);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} className="bg-white rounded-lg border border-zinc-200 p-6 space-y-4">
      <label className="block">
        <span className="text-xs font-medium text-zinc-600 mb-1 block">
          Name <span className="text-red-500">*</span>
        </span>
        <input
          name="name"
          required
          defaultValue={defaultName}
          placeholder="e.g. Salus Online — Outubro 2026"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-zinc-600 mb-1 block">Description</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultDescription}
          placeholder="What is this list for?"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark resize-none"
        />
      </label>

      {state.error && (
        <p className="text-sm text-brl-error bg-red-50 border border-red-100 rounded px-3 py-2">{state.error}</p>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create list'}
        </button>
      </div>
    </form>
  );
}
