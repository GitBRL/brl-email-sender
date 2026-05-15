'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createList, type ActionState } from './actions';
import { TagsInput } from './_tags-input';

const initial: ActionState = { ok: false };

export function ListForm({
  defaultName = '',
  defaultDescription = '',
  defaultTags = [],
  tagSuggestions = [],
}: {
  defaultName?: string;
  defaultDescription?: string;
  defaultTags?: string[];
  /** Existing tags across all lists — passed in from the server so the
   *  TagsInput can suggest reusable tags inline. */
  tagSuggestions?: string[];
}) {
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
          Nome <span className="text-red-500">*</span>
        </span>
        <input
          name="name"
          required
          defaultValue={defaultName}
          placeholder="ex. Salus Online — Outubro 2026"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-zinc-600 mb-1 block">Descrição</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultDescription}
          placeholder="Para que serve esta lista? De onde vieram os contatos?"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark resize-none"
        />
      </label>

      <div>
        <span className="text-xs font-medium text-zinc-600 mb-1 block">
          Tags
        </span>
        <TagsInput name="tags" defaultValue={defaultTags} suggestions={tagSuggestions} />
      </div>

      {state.error && (
        <p className="text-sm text-brl-error bg-red-50 border border-red-100 rounded px-3 py-2">{state.error}</p>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
        >
          {pending ? 'Criando…' : 'Criar lista'}
        </button>
      </div>
    </form>
  );
}
