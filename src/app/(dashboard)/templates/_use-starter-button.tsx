'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { cloneStarter } from './actions';

export function UseStarterButton({ starterId, label = 'Use this template' }: { starterId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    start(async () => {
      const res = await cloneStarter(starterId);
      if (!res.ok || !res.id) {
        setError(res.error ?? 'Could not clone starter');
        return;
      }
      router.push(`/templates/${res.id}/edit`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow text-brl-dark font-semibold px-3 py-1.5 text-xs hover:bg-brl-yellow-hover disabled:opacity-50"
      >
        <Sparkles size={12} />
        {pending ? 'Cloning…' : label}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
