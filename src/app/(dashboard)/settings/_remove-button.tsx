'use client';

import { useTransition, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { removeMember } from './actions';

export function RemoveMemberButton({ userId, label }: { userId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!confirm(`Remove ${label} from the team? This cannot be undone.`)) return;
    setError(null);
    start(async () => {
      const res = await removeMember(userId);
      if (!res.ok) setError(res.error ?? 'Failed to remove.');
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center justify-center w-7 h-7 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
        aria-label="Remove member"
        title="Remove member"
      >
        <Trash2 size={14} />
      </button>
      {error && <span className="text-[10px] text-red-600 max-w-[180px]">{error}</span>}
    </div>
  );
}
