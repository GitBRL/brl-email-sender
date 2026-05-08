'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Trash2 } from 'lucide-react';
import { duplicateTemplate, deleteTemplate } from './actions';

export function TemplateRowActions({
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

  function dup() {
    start(async () => {
      const res = await duplicateTemplate(id);
      if (!res.ok || !res.id) alert(res.error ?? 'Failed to duplicate');
      else router.push(`/templates/${res.id}/edit`);
    });
  }

  function del() {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    start(async () => {
      const res = await deleteTemplate(id);
      if (!res.ok) alert(res.error ?? 'Failed to delete');
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={dup}
        disabled={pending}
        className="text-xs text-zinc-500 hover:text-brl-dark inline-flex items-center gap-1"
        aria-label="Duplicate"
      >
        <Copy size={12} />
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={del}
          disabled={pending}
          className="text-xs text-zinc-500 hover:text-red-600 inline-flex items-center gap-1"
          aria-label="Delete"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
