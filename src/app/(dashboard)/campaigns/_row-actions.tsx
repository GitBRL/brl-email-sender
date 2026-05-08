'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteCampaign } from './actions';

export function CampaignRowActions({
  id,
  name,
  canDelete,
}: {
  id: string;
  name: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!canDelete) return null;

  function del(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete campaign "${name}"? This will remove all of its events and recipients. Cannot be undone.`)) return;
    start(async () => {
      const res = await deleteCampaign(id);
      if (!res.ok) alert(res.error ?? 'Failed to delete');
      else router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={del}
      disabled={pending}
      className="text-zinc-400 hover:text-red-600 disabled:opacity-50 inline-flex items-center"
      aria-label={`Delete ${name}`}
      title="Delete campaign"
    >
      <Trash2 size={14} />
    </button>
  );
}
