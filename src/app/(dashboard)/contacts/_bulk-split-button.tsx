'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors } from 'lucide-react';
import { bulkSplitExistingNames } from './actions';

/**
 * One-click backfill: walks contacts whose `name` still has the full name
 * (with a space) and `last_name` is null, splits them at the first whitespace
 * into name (first) + last_name (rest). Idempotent.
 *
 * Useful for contacts imported before the "Split full name" import toggle
 * existed. Once everything is split, the button silently no-ops.
 */
export function BulkSplitButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function run() {
    if (!confirm('Vai dividir o "Nome" de todos os contatos que ainda têm o nome completo em um único campo. Continuar?')) return;
    setMessage(null);
    start(async () => {
      const res = await bulkSplitExistingNames();
      if (!res.ok) {
        setMessage({ kind: 'err', text: res.error ?? 'Falha desconhecida' });
        return;
      }
      setMessage({
        kind: 'ok',
        text: `${res.processed} contato(s) divididos${res.skipped > 0 ? ` · ${res.skipped} pulados` : ''}.`,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
        title="Divide o campo 'Nome' em Nome + Sobrenome para contatos que ainda não foram divididos"
      >
        <Scissors size={14} /> {pending ? 'Dividindo…' : 'Dividir nomes'}
      </button>
      {message && (
        <span className={`text-[11px] ${message.kind === 'ok' ? 'text-emerald-700' : 'text-brl-error'}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
