'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { removeContactFromList } from '../actions';

export function RemoveFromList({
  listId,
  contactId,
  email,
}: {
  listId: string;
  contactId: string;
  email: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    if (!confirm(`Remove ${email} from this list?`)) return;
    start(async () => {
      const res = await removeContactFromList(listId, contactId);
      if (!res.ok) alert(res.error ?? 'Failed to remove');
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50 inline-flex items-center gap-1"
      aria-label={`Remove ${email}`}
    >
      <X size={12} /> Remove
    </button>
  );
}
