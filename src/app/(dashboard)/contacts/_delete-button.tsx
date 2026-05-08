'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteContact } from './actions';

export function DeleteContactButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    if (!confirm(`Delete ${email}? This can't be undone.`)) return;
    start(async () => {
      const res = await deleteContact(id);
      if (!res.ok) alert(res.error ?? 'Failed to delete');
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 inline-flex items-center gap-1"
      aria-label={`Delete ${email}`}
    >
      <Trash2 size={12} /> Delete
    </button>
  );
}
