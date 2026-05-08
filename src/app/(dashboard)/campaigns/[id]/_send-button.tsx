'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { sendCampaign } from '../actions';

export function SendNowButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    if (!confirm('Send this campaign now?')) return;
    setError(null);
    start(async () => {
      const res = await sendCampaign(id);
      if (!res.ok) setError(res.error ?? 'Failed to send');
      else router.refresh();
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow px-3 py-2 text-sm font-semibold text-brl-dark hover:bg-brl-yellow-hover disabled:opacity-50"
      >
        <Send size={14} /> {pending ? 'Sending…' : 'Send now'}
      </button>
      {error && <p className="text-xs text-brl-error mt-2">{error}</p>}
    </div>
  );
}
