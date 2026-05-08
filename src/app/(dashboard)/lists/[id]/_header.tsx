'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X, Trash2 } from 'lucide-react';
import { updateList, deleteList } from '../actions';
import type { ContactList } from '@/types';

export function ListHeader({
  list,
  canEdit,
  canDelete,
}: {
  list: ContactList;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    start(async () => {
      const res = await updateList(list.id, { name, description: description || null });
      if (!res.ok) setError(res.error ?? 'Failed to save');
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${list.name}"? Contacts will be removed from this list (but not deleted).`)) return;
    start(async () => {
      const res = await deleteList(list.id);
      if (!res.ok) alert(res.error ?? 'Failed to delete');
      else router.push('/lists');
    });
  }

  if (editing) {
    return (
      <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-2xl font-bold rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-brl-dark"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full text-sm rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-brl-dark resize-none"
          placeholder="Description"
        />
        {error && <p className="text-sm text-brl-error">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark px-3 py-1.5"
          >
            <X size={14} /> Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || !name.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-brl-yellow text-brl-dark font-semibold px-3 py-1.5 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
          >
            <Check size={14} /> {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{list.name}</h1>
        {list.description && <p className="text-sm text-zinc-500 mt-1">{list.description}</p>}
      </div>
      {(canEdit || canDelete) && (
        <div className="flex gap-2 shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              <Pencil size={14} /> Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm font-medium hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
