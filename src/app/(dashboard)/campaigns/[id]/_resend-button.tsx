'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Send, X } from 'lucide-react';
import { resendCampaign, type ResendAudience } from '../actions';
import type { RecipientGroup } from '../actions';

type ListLite = { id: string; name: string; contact_count?: number };

/**
 * 'Reenviar' button on the sent-campaign detail page. Opens a modal with two
 * tabs:
 *   1. Cohort — pick a funnel cohort from THIS campaign (opened, not_opened,
 *      clicked, etc.) → spins up a new auto-tagged list with those contacts
 *      and clones the campaign as a draft pointing at it
 *   2. Lista — pick any existing list → clones the campaign with that list
 *
 * After the action returns the new campaign id, redirect straight into the
 * wizard (/campaigns/new?id=...) so the operator can verify settings,
 * tweak the template, and send.
 */
export function ResendButton({
  campaignId,
  campaignName,
  existingLists,
  cohortAvailability,
}: {
  campaignId: string;
  campaignName: string;
  existingLists: ListLite[];
  /** Counts per cohort so the modal shows live numbers + disables empty buckets. */
  cohortAvailability: Partial<Record<RecipientGroup, number>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'cohort' | 'list'>('cohort');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleResend(audience: ResendAudience) {
    setError(null);
    start(async () => {
      const res = await resendCampaign(campaignId, audience);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Drop into the wizard so the operator sees the cloned draft + can
      // edit the template before pulling the trigger.
      router.push(`/campaigns/new?id=${res.newCampaignId}`);
      router.refresh();
    });
  }

  const cohortOptions: Array<{ group: RecipientGroup; label: string; hint: string }> = [
    { group: 'opened',          label: 'Quem abriu',           hint: 'Aqueceu — mande novidade' },
    { group: 'not_opened',      label: 'Quem NÃO abriu',       hint: 'Re-engajamento — assunto novo' },
    { group: 'clicked',         label: 'Quem clicou',          hint: 'Quente — converte agora' },
    { group: 'opened_no_click', label: 'Abriu sem clicar',     hint: 'Soft engagement — CTA mais forte' },
    { group: 'recipients',      label: 'Todos os destinatários', hint: 'Mesmo público da original' },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
        title="Clonar esta campanha com um novo público"
      >
        <RefreshCw size={14} /> Reenviar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col overflow-hidden">
            <header className="px-5 py-4 border-b border-zinc-100 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold inline-flex items-center gap-1.5">
                  <RefreshCw size={16} /> Reenviar campanha
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Clona <strong>{campaignName}</strong> como rascunho e abre o wizard. Você pode editar antes de disparar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-900 w-8 h-8 grid place-items-center rounded"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </header>

            {/* Tabs */}
            <div className="px-5 pt-3 flex gap-1">
              {([
                { key: 'cohort', label: 'Por engajamento (cohort)' },
                { key: 'list',   label: 'Lista existente' },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`text-xs px-3 py-1.5 rounded-md border ${
                    tab === t.key
                      ? 'bg-brl-dark text-white border-brl-dark'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5 overflow-y-auto max-h-[60vh]">
              {tab === 'cohort' && (
                <ul className="space-y-2">
                  {cohortOptions.map((opt) => {
                    const count = cohortAvailability[opt.group] ?? 0;
                    const disabled = count === 0;
                    return (
                      <li key={opt.group}>
                        <button
                          type="button"
                          disabled={disabled || pending}
                          onClick={() => handleResend({ kind: 'cohort', group: opt.group })}
                          className={`w-full text-left rounded-md border p-3 transition flex items-center gap-3 ${
                            disabled
                              ? 'border-zinc-100 bg-zinc-50 cursor-not-allowed opacity-60'
                              : 'border-zinc-200 bg-white hover:border-brl-yellow hover:bg-brl-yellow/5'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{opt.label}</div>
                            <div className="text-[11px] text-zinc-500">{opt.hint}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-lg font-bold tabular-nums">
                              {count.toLocaleString('pt-BR')}
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                              contato{count === 1 ? '' : 's'}
                            </div>
                          </div>
                          <Send size={14} className={disabled ? 'text-zinc-300' : 'text-brl-dark'} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {tab === 'list' && (
                <>
                  {existingLists.length === 0 ? (
                    <p className="text-sm text-zinc-500 italic">
                      Nenhuma lista cadastrada. Crie uma em <a href="/lists" className="underline">/lists</a> primeiro.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                      {existingLists.map((l) => (
                        <li key={l.id}>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleResend({ kind: 'list', listId: l.id })}
                            className="w-full text-left rounded-md border border-zinc-200 bg-white hover:border-brl-yellow hover:bg-brl-yellow/5 transition p-3 flex items-center gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{l.name}</div>
                            </div>
                            {typeof l.contact_count === 'number' && (
                              <div className="text-right shrink-0">
                                <div className="text-lg font-bold tabular-nums">
                                  {l.contact_count.toLocaleString('pt-BR')}
                                </div>
                                <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                                  contato{l.contact_count === 1 ? '' : 's'}
                                </div>
                              </div>
                            )}
                            <Send size={14} className="text-brl-dark" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {error && (
              <div className="px-5 pb-3 text-xs text-brl-error">{error}</div>
            )}
            <footer className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/60 text-[11px] text-zinc-500 flex items-center justify-between">
              <span>{pending ? 'Clonando…' : 'Você poderá editar tudo no wizard antes de enviar.'}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-600 hover:text-zinc-900"
              >
                Cancelar
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
